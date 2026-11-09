"""Joypad di RetroArch: elenco, apprendimento dei tasti e autoconfig.

RetroArch (driver ``sdl2``) legge i joypad con la libreria SDL2: se SDL
riconosce un joypad come *game controller* ne rinumera i tasti con una
mappatura sua, che può essere sbagliata (spalle e grilletti scambiati, croce
assente). Per questo i tasti si leggono con la stessa libreria SDL2 di
RetroArch e nello stesso modo: i valori imparati sono quelli che RetroArch
vedrà, senza conversioni.

Un tasto imparato è un *token*:

- ``b<N>``: pulsante ``N`` (in un autoconfig ``input_<tasto>_btn = "N"``);
- ``+<N>`` / ``-<N>``: asse ``N`` in quella direzione (``input_<tasto>_axis``);
- ``h<N><dir>``: direzione del cappello ``N`` (``input_<tasto>_btn = "h0up"``).
"""
import ctypes
import ctypes.util
import glob
import logging
import os
import re
import shutil
import threading
import time

from . import retroarch_cfg
from .errors import ConflictError, PixelArcadeError
from .fsutil import atomic_write_text

log = logging.getLogger(__name__)

# Tasti del RetroPad, poi le direzioni delle levette analogiche (``input_l_x_plus_axis`` e simili:
# ``x`` destra/sinistra, ``y`` giù/su), facoltative perché non tutti i joypad le hanno.
RETROPAD = ('b', 'a', 'y', 'x', 'l', 'r', 'l2', 'r2', 'l3', 'r3', 'select', 'start', 'up', 'down', 'left', 'right',
            'l_x_plus', 'l_x_minus', 'l_y_plus', 'l_y_minus', 'r_x_plus', 'r_x_minus', 'r_y_plus', 'r_y_minus')
# Tasti senza i quali un joypad non è utilizzabile nei giochi.
REQUIRED = ('b', 'a', 'select', 'start', 'up', 'down', 'left', 'right')

TOKEN = re.compile(r'^(b\d{1,2}|[+-]\d{1,2}|h\d(up|down|left|right))$')
HAT_BITS = (('up', 1), ('right', 2), ('down', 4), ('left', 8))

# Soglie degli assi (valori SDL da -32768 a 32767), misurate dalla posizione di riposo.
AXIS_PRESS = 16000
AXIS_RELEASE = 8000

# Pulsanti e assi di un game controller SDL (SDL_CONTROLLER_BUTTON_MAX, SDL_CONTROLLER_AXIS_MAX).
CONTROLLER_BUTTONS = 21
CONTROLLER_AXES = 6

# L'apprendimento si ferma se nessuno lo interroga per questo tempo (secondi).
LEARN_IDLE = 30
POLL_INTERVAL = 0.01
MAX_PRESSES = 32

SDL_INIT = 0x200 | 0x2000  # SDL_INIT_JOYSTICK | SDL_INIT_GAMECONTROLLER

# Dove cercare la libreria SDL2 di RetroArch: prima quella della snap, poi quella di sistema.
SDL_CANDIDATES = ('/snap/retroarch/current/usr/lib/*/libSDL2-2.0.so.0',)


class JoypadError(PixelArcadeError):
    """Operazione sui joypad non possibile (joypad assente, tasti non validi…)."""


def find_sdl_library():
    """Percorso della libreria SDL2 usata da RetroArch, oppure ``None``."""
    for pattern in SDL_CANDIDATES:
        found = sorted(glob.glob(pattern))
        if found:
            return found[0]
    return ctypes.util.find_library('SDL2')


class Sdl:
    """Accesso minimo a SDL2 con ``ctypes``: solo joystick e game controller.

    Le chiamate vanno fatte con ``lock`` acquisito: la libreria si inizializza
    e si chiude a ogni uso (``open``/``close``, con conteggio dei riferimenti).
    """

    def __init__(self, path):
        lib = ctypes.CDLL(path)
        void = ctypes.c_void_p
        lib.SDL_SetHint.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
        lib.SDL_InitSubSystem.argtypes = [ctypes.c_uint32]
        lib.SDL_QuitSubSystem.argtypes = [ctypes.c_uint32]
        lib.SDL_JoystickNameForIndex.restype = ctypes.c_char_p
        lib.SDL_GameControllerNameForIndex.restype = ctypes.c_char_p
        lib.SDL_JoystickGetDeviceVendor.restype = ctypes.c_uint16
        lib.SDL_JoystickGetDeviceProduct.restype = ctypes.c_uint16
        lib.SDL_JoystickOpen.restype = void
        lib.SDL_GameControllerOpen.restype = void
        for name in ('SDL_JoystickClose', 'SDL_JoystickNumButtons', 'SDL_JoystickNumAxes', 'SDL_JoystickNumHats'):
            getattr(lib, name).argtypes = [void]
        lib.SDL_GameControllerClose.argtypes = [void]
        lib.SDL_JoystickGetButton.argtypes = [void, ctypes.c_int]
        lib.SDL_JoystickGetButton.restype = ctypes.c_uint8
        lib.SDL_JoystickGetHat.argtypes = [void, ctypes.c_int]
        lib.SDL_JoystickGetHat.restype = ctypes.c_uint8
        lib.SDL_JoystickGetAxis.argtypes = [void, ctypes.c_int]
        lib.SDL_JoystickGetAxis.restype = ctypes.c_int16
        lib.SDL_GameControllerGetButton.argtypes = [void, ctypes.c_int]
        lib.SDL_GameControllerGetButton.restype = ctypes.c_uint8
        lib.SDL_GameControllerGetAxis.argtypes = [void, ctypes.c_int]
        lib.SDL_GameControllerGetAxis.restype = ctypes.c_int16
        self.lib = lib
        self.lock = threading.Lock()

    def open(self):
        self.lib.SDL_SetHint(b'SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS', b'1')
        if self.lib.SDL_InitSubSystem(SDL_INIT) != 0:
            raise JoypadError('La libreria SDL2 non riesce a leggere i joypad.')

    def close(self):
        self.lib.SDL_QuitSubSystem(SDL_INIT)

    def devices(self):
        """Joypad collegati: ``[{index, name, vendor, product, controller}]``.

        Il nome è quello che RetroArch confronta con gli autoconfig: quello
        del game controller se SDL lo riconosce come tale, altrimenti quello
        del joystick.
        """
        lib = self.lib
        result = []
        for index in range(max(0, lib.SDL_NumJoysticks())):
            controller = bool(lib.SDL_IsGameController(index))
            raw = lib.SDL_GameControllerNameForIndex(index) if controller else None
            raw = raw or lib.SDL_JoystickNameForIndex(index) or b''
            result.append({'index': index, 'name': raw.decode('utf-8', 'replace').strip(),
                           'vendor': int(lib.SDL_JoystickGetDeviceVendor(index)),
                           'product': int(lib.SDL_JoystickGetDeviceProduct(index)),
                           'controller': controller})
        return result

    def open_pad(self, device):
        """Apre il joypad come lo apre RetroArch; restituisce un ``SdlPad``."""
        lib = self.lib
        if device['controller']:
            handle = lib.SDL_GameControllerOpen(device['index'])
            if not handle:
                raise JoypadError('Joypad non apribile.')
            return SdlPad(lib, handle, True, CONTROLLER_BUTTONS, CONTROLLER_AXES, 0)
        handle = lib.SDL_JoystickOpen(device['index'])
        if not handle:
            raise JoypadError('Joypad non apribile.')
        return SdlPad(lib, handle, False, lib.SDL_JoystickNumButtons(handle), lib.SDL_JoystickNumAxes(handle),
                      lib.SDL_JoystickNumHats(handle))

    def update(self):
        self.lib.SDL_JoystickUpdate()
        self.lib.SDL_GameControllerUpdate()


class SdlPad:
    """Joypad aperto: legge lo stato di pulsanti, assi e cappelli."""

    def __init__(self, lib, handle, controller, buttons, axes, hats):
        self.lib = lib
        self.handle = handle
        self.controller = controller
        self.buttons = max(0, buttons)
        self.axes = max(0, axes)
        self.hats = max(0, hats)

    def button(self, index):
        if self.controller:
            return bool(self.lib.SDL_GameControllerGetButton(self.handle, index))
        return bool(self.lib.SDL_JoystickGetButton(self.handle, index))

    def axis(self, index):
        if self.controller:
            return int(self.lib.SDL_GameControllerGetAxis(self.handle, index))
        return int(self.lib.SDL_JoystickGetAxis(self.handle, index))

    def hat(self, index):
        return int(self.lib.SDL_JoystickGetHat(self.handle, index))

    def close(self):
        if self.controller:
            self.lib.SDL_GameControllerClose(self.handle)
        else:
            self.lib.SDL_JoystickClose(self.handle)


class PressDetector:
    """Trasforma gli stati letti in pressioni (token), una per ogni nuovo tasto premuto.

    La prima lettura registra solo lo stato iniziale: un tasto già premuto
    (per esempio lo START con cui il giocatore è entrato) non conta finché non
    viene rilasciato e ripremuto. La posizione di riposo degli assi è quella
    della prima lettura: così un grilletto analogico che a riposo vale -32768
    non risulta premuto.
    """

    def __init__(self):
        self.buttons = set()
        self.rest = {}
        self.axes = set()
        self.hats = {}
        self.primed = False

    def feed(self, pad):
        if not self.primed:
            self.primed = True
            self.feed_state(pad)
            return []
        return self.feed_state(pad)

    def feed_state(self, pad):
        presses = []
        for index in range(pad.buttons):
            down = pad.button(index)
            if down and index not in self.buttons:
                self.buttons.add(index)
                presses.append('b%d' % index)
            elif not down:
                self.buttons.discard(index)
        for index in range(pad.axes):
            value = pad.axis(index)
            rest = self.rest.setdefault(index, value)
            moved = value - rest
            if abs(moved) >= AXIS_PRESS and index not in self.axes:
                self.axes.add(index)
                presses.append('%s%d' % ('+' if moved > 0 else '-', index))
            elif abs(moved) < AXIS_RELEASE:
                self.axes.discard(index)
        for index in range(pad.hats):
            bits = pad.hat(index)
            before = self.hats.get(index, 0)
            for direction, bit in HAT_BITS:
                if bits & bit and not before & bit:
                    presses.append('h%d%s' % (index, direction))
            self.hats[index] = bits
        return presses


def same_device(device, vendor, product):
    return device['vendor'] == vendor and device['product'] == product


# --- Autoconfig -------------------------------------------------------------

def bind_lines(binds):
    """Righe ``input_<tasto>_btn/_axis`` per i token ``binds`` (``{tasto: token}``)."""
    lines = []
    for key in RETROPAD:
        token = binds.get(key)
        if not token:
            continue
        if token.startswith('b'):
            lines.append('input_%s_btn = "%s"' % (key, token[1:]))
        elif token.startswith('h'):
            lines.append('input_%s_btn = "%s"' % (key, token))
        else:
            lines.append('input_%s_axis = "%s"' % (key, token))
    return lines


def autoconfig_text(device, binds):
    """Testo di un autoconfig ``sdl2`` per ``device`` con i tasti ``binds``."""
    kind = 'game controller' if device['controller'] else 'joystick'
    lines = [
        '# Scritto da Pixel Arcade: tasti imparati premendoli, come li legge SDL2 (%s).' % kind,
        'input_driver = "sdl2"',
        'input_device = "%s"' % device['name'].replace('"', ''),
        'input_vendor_id = "%d"' % device['vendor'],
        'input_product_id = "%d"' % device['product'],
    ]
    return '\n'.join(lines + bind_lines(binds)) + '\n'


def parse_profile(path):
    """Chiavi di un autoconfig, oppure ``{}`` se non è leggibile."""
    return retroarch_cfg.read_known_keys(path) if os.path.isfile(path) else {}


def profile_binds(keys):
    """Token di ogni tasto del RetroPad in un autoconfig: ``{tasto: [token]}``."""
    result = {}
    for key in RETROPAD:
        tokens = []
        button = keys.get('input_%s_btn' % key, '')
        if re.fullmatch(r'\d{1,2}', button):
            tokens.append('b' + button)
        elif re.fullmatch(r'h\d(up|down|left|right)', button):
            tokens.append(button)
        axis = keys.get('input_%s_axis' % key, '')
        if re.fullmatch(r'[+-]\d{1,2}', axis):
            tokens.append(axis)
        if tokens:
            result[key] = tokens
    return result


def profile_matches(keys, device):
    """Vero se l'autoconfig ``sdl2`` vale per ``device`` (stessi id USB oppure stesso nome)."""
    if keys.get('input_driver') != 'sdl2':
        return False
    try:
        ids = int(keys.get('input_vendor_id', '')) == device['vendor'] and \
            int(keys.get('input_product_id', '')) == device['product']
    except ValueError:
        ids = False
    return ids or keys.get('input_device', '').strip() == device['name']


def find_profile(directory, device):
    """Percorso dell'autoconfig ``sdl2`` di ``device`` sotto ``directory``, oppure ``None``."""
    if not directory or not os.path.isdir(directory):
        return None
    for root, dirs, files in os.walk(directory):
        dirs.sort()
        for name in sorted(files):
            if name.endswith('.cfg'):
                path = os.path.join(root, name)
                if profile_matches(parse_profile(path), device):
                    return path
    return None


def profile_filename(name):
    """Nome del file di un nuovo autoconfig, senza caratteri problematici."""
    clean = re.sub(r'[^A-Za-z0-9 ._()-]', '_', name).strip(' .') or 'Joypad'
    return clean[:80] + '.cfg'


def check_binds(binds):
    """Tasti validi per un autoconfig: ``{tasto: token}`` senza doppioni e con i tasti obbligatori."""
    if not isinstance(binds, dict):
        raise JoypadError('Tasti non validi.')
    clean = {}
    for key, token in binds.items():
        if key not in RETROPAD:
            raise JoypadError('Tasto sconosciuto: %s.' % key)
        if token is None or token == '':
            continue
        if not isinstance(token, str) or not TOKEN.match(token):
            raise JoypadError('Valore non valido per %s.' % key)
        clean[key] = token
    missing = [key for key in REQUIRED if key not in clean]
    if missing:
        raise JoypadError('Mancano dei tasti obbligatori: %s.' % ', '.join(missing))
    if len(set(clean.values())) != len(clean):
        raise JoypadError('Lo stesso tasto è assegnato a due funzioni.')
    return clean


def expand_home(value, cfg_path):
    """Percorso del ``retroarch.cfg`` con ``~`` risolto come lo risolve RetroArch.

    RetroArch in snap ha come home ``~/snap/retroarch/common``: se il
    ``retroarch.cfg`` sta in ``<home>/.config/retroarch/``, ``~`` è quella home.
    """
    if not value.startswith('~'):
        return value
    config_dir = os.path.dirname(os.path.abspath(cfg_path))
    parent = os.path.dirname(config_dir)
    if os.path.basename(config_dir) == 'retroarch' and os.path.basename(parent) == '.config':
        return os.path.dirname(parent) + value[1:]
    return os.path.expanduser(value)


def retroarch_running():
    """Vero se un processo ``retroarch`` è attivo (anche se non avviato dalla dashboard)."""
    for path in glob.glob('/proc/[0-9]*/comm'):
        try:
            with open(path) as stream:
                if stream.read().strip() == 'retroarch':
                    return True
        except OSError:
            continue
    return False


def repair_text(text, players=(1, 2)):
    """``retroarch.cfg`` con i tasti joypad dei giocatori a ``"nul"`` e ``config_save_on_exit`` spento.

    Si cambiano solo le righe esistenti. Restituisce ``(testo, righe cambiate)``.
    """
    targets = {'config_save_on_exit': 'false'}
    for player in players:
        for key in RETROPAD:
            for kind in ('btn', 'axis'):
                targets['input_player%d_%s_%s' % (player, key, kind)] = 'nul'
    changed = 0
    lines = []
    for line in text.splitlines(True):
        match = retroarch_cfg.LINE.match(line)
        if match and not line.lstrip().startswith('#') and match.group(1) in targets:
            key = match.group(1)
            if match.group(2) != targets[key]:
                ending = '\n' if line.endswith('\n') else ''
                line = '%s = "%s"%s' % (key, targets[key], ending)
                changed += 1
        lines.append(line)
    return ''.join(lines), changed


def backup(path, clock=time.time):
    """Copia di riserva ``<file>.bak-<data>`` accanto a ``path``; restituisce il percorso."""
    target = '%s.bak-%s' % (path, time.strftime('%Y%m%d-%H%M%S', time.localtime(clock())))
    shutil.copy2(path, target)
    return target


# --- Servizio ----------------------------------------------------------------

class LearnSession:
    """Lettura dei tasti dei joypad con gli stessi id USB, in un thread."""

    def __init__(self, sdl, devices, clock):
        self.sdl = sdl
        self.devices = devices
        self.clock = clock
        self.presses = []
        self.seq = 0
        self.seen = clock()
        self.stopping = threading.Event()
        self.lock = threading.Lock()
        self.error = None
        self.thread = threading.Thread(target=self.run, name='joypad-learn', daemon=True)

    def run(self):
        pads = []
        opened = False
        try:
            with self.sdl.lock:
                self.sdl.open()
                opened = True
                current = [dev for dev in self.sdl.devices()
                           if any(same_device(dev, d['vendor'], d['product']) for d in self.devices)]
                pads = [(self.sdl.open_pad(dev), PressDetector()) for dev in current]
            while not self.stopping.is_set():
                if self.clock() - self.seen > LEARN_IDLE:
                    log.info('Apprendimento dei tasti fermato: nessuna richiesta da %d s.', LEARN_IDLE)
                    break
                with self.sdl.lock:
                    self.sdl.update()
                    found = [press for pad, detector in pads for press in detector.feed(pad)]
                if found:
                    with self.lock:
                        for press in found:
                            self.seq += 1
                            self.presses.append({'seq': self.seq, 'input': press})
                        del self.presses[:-MAX_PRESSES]
                self.stopping.wait(POLL_INTERVAL)
        except Exception as error:
            log.exception('Lettura dei tasti del joypad non riuscita')
            self.error = str(error) or 'Lettura dei tasti non riuscita.'
        finally:
            with self.sdl.lock:
                for pad, _ in pads:
                    pad.close()
                if opened:
                    self.sdl.close()
            self.stopping.set()

    def state(self, after):
        with self.lock:
            self.seen = self.clock()
            presses = [press for press in self.presses if press['seq'] > after]
            return {'active': not self.stopping.is_set(), 'seq': self.seq, 'presses': presses, 'error': self.error}


class JoypadService:
    """Joypad visti da RetroArch e loro autoconfig (Impostazioni → Joypad, ingresso dei giocatori)."""

    def __init__(self, play, sdl_factory=None, clock=time.monotonic, wall=time.time, running=retroarch_running):
        self.play = play
        self.sdl_factory = sdl_factory or self.load_sdl
        self.clock = clock
        self.wall = wall
        self.running = running
        self.sdl = None
        self.session = None
        self.lock = threading.Lock()

    @staticmethod
    def load_sdl():
        path = find_sdl_library()
        if not path:
            raise JoypadError('Libreria SDL2 di RetroArch non trovata.')
        return Sdl(path)

    def get_sdl(self):
        if self.sdl is None:
            self.sdl = self.sdl_factory()
        return self.sdl

    def cfg_path(self):
        return retroarch_cfg.retroarch_cfg_path(self.play.config.resolve_path('paths.cores'))

    def autoconfig_dir(self, keys=None):
        """Cartella degli autoconfig: ``joypad_autoconfig_dir`` oppure ``autoconfig`` accanto al ``retroarch.cfg``."""
        keys = self.play.known_keys() if keys is None else keys
        value = keys.get('joypad_autoconfig_dir', '')
        if value and value != 'default':
            return expand_home(value, self.cfg_path())
        return os.path.join(os.path.dirname(self.cfg_path()), 'autoconfig')

    def raw_devices(self):
        sdl = self.get_sdl()
        with sdl.lock:
            sdl.open()
            try:
                return sdl.devices()
            finally:
                sdl.close()

    def overview(self):
        """``GET /api/joypads``: driver, cartella degli autoconfig e joypad con il loro stato."""
        keys = self.play.known_keys()
        driver = keys.get('input_joypad_driver', '')
        directory = self.autoconfig_dir(keys)
        result = {'driver': driver, 'supported': driver == 'sdl2', 'devices': [], 'error': None}
        if not result['supported']:
            result['error'] = 'RetroArch usa il driver «%s»: la configurazione dei joypad funziona solo con sdl2.' % (
                driver or 'sconosciuto')
            return result
        try:
            devices = self.raw_devices()
        except (OSError, JoypadError) as error:
            result['error'] = str(error) or 'Joypad non leggibili.'
            return result
        for device in devices:
            path = find_profile(directory, device)
            keys_of = parse_profile(path) if path else {}
            result['devices'].append(dict(device, configured=path is not None,
                                          profile=os.path.basename(path) if path else None,
                                          binds=profile_binds(keys_of)))
        return result

    def retroarch_pads(self, pads, models):
        """Joypad dei giocatori per RetroArch, scelti per modello invece che per numero.

        ``pads`` sono gli indici di Chrome di P1 e P2; ``models`` i loro modelli
        ``{vendor, product, rank}`` (``rank``: posizione tra i joypad dello stesso
        modello, in ordine di Chrome) o ``None``. Chrome e SDL numerano i joypad
        in modo indipendente (per esempio dopo che uno è stato staccato e
        ricollegato): l'indice per RetroArch è quello SDL del joypad dello
        stesso modello e posizione. Se un joypad non si trova, o SDL non si
        legge, quel giocatore tiene l'indice di Chrome; se due giocatori
        finissero sullo stesso joypad restano tutti gli indici di Chrome.
        """
        if pads is None or not models:
            return pads
        try:
            devices = self.raw_devices()
        except (OSError, JoypadError) as error:
            log.warning('Joypad non leggibili, uso gli indici di Chrome: %s', error)
            return pads
        result = []
        for position, pad in enumerate(pads):
            model = models[position] if position < len(models) else None
            index = pad
            if pad is not None and model is not None:
                same = [device['index'] for device in devices if same_device(device, model['vendor'], model['product'])]
                if model['rank'] < len(same):
                    index = same[model['rank']]
            result.append(index)
        present = [index for index in result if index is not None]
        if len(set(present)) != len(present):
            log.warning('Joypad dei giocatori %s non distinguibili per modello: uso gli indici di Chrome %s', result, pads)
            return pads
        if result != list(pads):
            log.info('Joypad dei giocatori: indici di Chrome %s, per RetroArch %s', pads, result)
        return result

    def find_device(self, vendor, product):
        for device in self.raw_devices():
            if same_device(device, vendor, product):
                return device
        raise JoypadError('Joypad non trovato: è ancora collegato?')

    def start_learn(self, vendor, product):
        """Avvia la lettura dei tasti dei joypad ``vendor``/``product``; 409 durante una partita."""
        if self.play.playing():
            raise ConflictError('Chiudi prima il gioco in corso.')
        device = self.find_device(vendor, product)
        with self.lock:
            self.stop_session()
            self.session = LearnSession(self.get_sdl(), [device], self.clock)
            self.session.thread.start()
        return {'device': device}

    def learn_state(self, after=0):
        with self.lock:
            session = self.session
        if session is None:
            return {'active': False, 'seq': 0, 'presses': [], 'error': None}
        return session.state(after)

    def stop_session(self):
        session = self.session
        self.session = None
        if session is not None:
            session.stopping.set()
            session.thread.join(timeout=2)

    def stop_learn(self):
        with self.lock:
            self.stop_session()
        return {'active': False}

    def save(self, vendor, product, binds):
        """Scrive l'autoconfig del joypad (con copia di riserva se esiste già)."""
        clean = check_binds(binds)
        device = self.find_device(vendor, product)
        directory = self.autoconfig_dir()
        path = find_profile(directory, device) or os.path.join(directory, profile_filename(device['name']))
        saved = None
        if os.path.isfile(path):
            saved = backup(path, self.wall)
        os.makedirs(directory, exist_ok=True)
        atomic_write_text(path, autoconfig_text(device, clean), mode=0o644)
        log.info('Autoconfig del joypad %s scritto in %s', device['name'], path)
        return {'device': device, 'profile': os.path.basename(path), 'backup': saved and os.path.basename(saved)}

    def repair(self):
        """Riporta all'autoconfig i tasti joypad del ``retroarch.cfg`` (copia di riserva prima)."""
        if self.play.playing() or self.running():
            raise ConflictError('Chiudi prima RetroArch.')
        path = self.cfg_path()
        try:
            with open(path, encoding='utf-8', errors='replace') as stream:
                text = stream.read()
        except OSError:
            raise JoypadError('retroarch.cfg non leggibile.')
        fixed, changed = repair_text(text)
        saved = None
        if changed:
            saved = backup(path, self.wall)
            atomic_write_text(path, fixed, mode=os.stat(path).st_mode & 0o777)
            log.info('retroarch.cfg: %d tasti joypad riportati all\'autoconfig', changed)
        return {'changed': changed, 'backup': saved and os.path.basename(saved)}

    def stop(self):
        with self.lock:
            self.stop_session()
