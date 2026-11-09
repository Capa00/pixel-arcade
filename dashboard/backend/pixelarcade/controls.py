"""Comandi dei giochi: nomi dei tasti letti dal core e riassegnazione con i remap di RetroArch.

Misure del 7 ottobre 2026 (RetroArch 1.22.2):

- con ``frontend_log_level = 0`` RetroArch scrive nel log i nomi che il core dà
  ai tasti del RetroPad, dopo la riga ``[Environ] SET_INPUT_DESCRIPTORS.``::

      [DEBUG]    Porta 1:
      [DEBUG]       "Pulsante B (giù)" => "Cross"

  L'etichetta a sinistra è nella lingua di RetroArch; i nomi vengono dal core
  (``Button 1`` con MAME 2000, ``B`` con Snes9x, ``Cross`` con PCSX ReARMed);
- il remap di un gioco è ``<input_remapping_directory>/<library_name>/<nome>.rmp``,
  dove ``<nome>`` è il file del gioco senza estensione (come gli stati) e
  ``library_name`` il nome che il core dichiara (``MAME 2000``, mentre il suo
  ``.info`` dice ``MAME 2000 (0.37b5)``): si legge dal core in un processo a parte;
- nel file ``input_player<N>_btn_<tasto fisico> = "<id>"`` fa arrivare al core
  il tasto ``id`` del RetroPad quando si preme il tasto fisico; i tasti non
  scritti restano uguali. RetroArch lo legge solo all'avvio del gioco.

Si riassegnano solo i tasti frontali, le spalle e i grilletti di P1 e P2:
START e SELECT servono alle combinazioni della dashboard, L3 e R3 non si
leggono dai joypad della dashboard, la croce e le levette restano.
"""
import logging
import os
import re
import subprocess
import sys
import threading
import time

from .config import CORE_SUFFIX
from .errors import LaunchError
from .fsutil import atomic_write_text
from .repositories.cores import now_iso
from .retroarch_cfg import DEFAULT_CONTROLLER, SYSTEM_DEVICES, read_known_keys, retroarch_cfg_path

log = logging.getLogger(__name__)

# Tasti del RetroPad nell'ordine degli id di libretro (``RETRO_DEVICE_ID_JOYPAD_*``).
RETROPAD = ('b', 'y', 'select', 'start', 'up', 'down', 'left', 'right', 'a', 'x', 'l', 'r', 'l2', 'r2', 'l3', 'r3')
# Tasti che si possono riassegnare e tasti che si mostrano soltanto.
EDITABLE = ('b', 'a', 'y', 'x', 'l', 'r', 'l2', 'r2')
FIXED = ('select', 'start', 'l3', 'r3')
PLAYERS = ('p1', 'p2')
LABEL_MAX = 24

START = '[Environ] SET_INPUT_DESCRIPTORS.'
PORT_LINE = re.compile(r'^\[DEBUG\]\s+\S+ (\d+):\s*$')
DESCRIPTOR_LINE = re.compile(r'^\[DEBUG\]\s+"(.*)" => "(.*)"\s*$')
# Etichette di RetroArch: «Pulsante B (giù)», «B Button (Down)», «Pulsante R2 (grilletto)», «Pulsante Select».
BUTTON_TOKEN = re.compile(r'(?<![\w-])(L3|R3|L2|R2|L|R|A|B|X|Y)(?![\w+-])')
NAMED_TOKEN = re.compile(r'\b(select|start)\b', re.IGNORECASE)
# Direzioni delle levette («Analogico sinistro Y- (su)»): non sono tasti.
AXIS_TOKEN = re.compile(r'[XY][+-]')

REMAP_LINE = re.compile(r'^\s*input_player([12])_btn_([a-z0-9]+)\s*=\s*"?(-?\d+)"?\s*$')
DEVICE_LINE = re.compile(r'^\s*input_libretro_device_p[12]\s*=')
REMAP_SUFFIX = '.rmp'
DEFAULT_REMAP_DIR = os.path.join('config', 'remaps')
RETROARCH_HOME = os.path.join('.config', 'retroarch')

# Attesa dei nomi dei tasti dopo l'inizio della partita e pausa prima di aprire la finestra.
DESCRIPTOR_WAIT = 30.0
OPEN_DELAY = 2.0
LIBRARY_TIMEOUT = 10

LIBRARY_SCRIPT = '''import ctypes, sys
class Info(ctypes.Structure):
    _fields_ = [("library_name", ctypes.c_char_p), ("library_version", ctypes.c_char_p),
                ("valid_extensions", ctypes.c_char_p), ("need_fullpath", ctypes.c_bool),
                ("block_extract", ctypes.c_bool)]
info = Info()
ctypes.CDLL(sys.argv[1]).retro_get_system_info(ctypes.byref(info))
sys.stdout.write((info.library_name or b"").decode("utf-8", "replace"))
'''


def button_of(label):
    """Tasto del RetroPad di un'etichetta del log (``'b'``, ``'l2'``, ``'start'``…), oppure ``None``."""
    if 'D-Pad' in label or AXIS_TOKEN.search(label):
        return None
    match = BUTTON_TOKEN.search(label)
    if match:
        return match.group(1).lower()
    match = NAMED_TOKEN.search(label)
    return match.group(1).lower() if match else None


class DescriptorReader:
    """Legge dal log di RetroArch i nomi dei tasti di P1 e P2 (``feed`` per ogni riga).

    Vale l'ultimo blocco ``SET_INPUT_DESCRIPTORS`` con dei nomi (un core può
    mandarlo più volte). ``ready`` si imposta alla fine del primo.
    """

    def __init__(self):
        self.lock = threading.Lock()
        self.ready = threading.Event()
        self.ports = None
        self.current = None
        self.port = None

    def feed(self, line):
        with self.lock:
            if START in line:
                self.current = {}
                self.port = None
                return
            if self.current is None:
                return
            match = PORT_LINE.match(line)
            if match:
                number = int(match.group(1))
                self.port = 'p%d' % number if 1 <= number <= len(PLAYERS) else None
                return
            match = DESCRIPTOR_LINE.match(line)
            if match:
                button = button_of(match.group(1))
                if self.port is not None and button is not None:
                    self.current.setdefault(self.port, {}).setdefault(button, match.group(2))
                return
            # Fine del blocco. Un blocco senza nomi (Beetle PSX ne manda uno prima di quello vero) non conta.
            block, self.current = self.current, None
            if not block:
                return
            self.ports = block
        self.ready.set()

    def result(self):
        """``{p1: {tasto: nome}, p2: {…}}`` (solo i giocatori con dei nomi), oppure ``None`` se il blocco non c'è."""
        with self.lock:
            ports = self.current if self.current else self.ports
            return None if ports is None else {player: dict(names) for player, names in ports.items()}


def read_library_name(core_path, run=subprocess.run):
    """``library_name`` dichiarato dal core, letto in un processo a parte; ``None`` se non riesce."""
    try:
        result = run([sys.executable, '-I', '-c', LIBRARY_SCRIPT, core_path], stdout=subprocess.PIPE,
                     stderr=subprocess.PIPE, timeout=LIBRARY_TIMEOUT)
    except (OSError, subprocess.SubprocessError) as error:
        log.warning('Nome del core %s non letto: %s', core_path, error)
        return None
    name = result.stdout.decode('utf-8', 'replace').strip()
    if result.returncode != 0 or not name:
        log.warning('Nome del core %s non letto (codice %s): %s', core_path, result.returncode,
                    result.stderr.decode('utf-8', 'replace').strip()[-300:])
        return None
    return name


def remap_dir(retroarch_dir, setting):
    """Cartella dei remap da ``input_remapping_directory`` del ``retroarch.cfg``.

    ``~`` è la cartella home vista da RetroArch: quella che contiene
    ``.config/retroarch`` (nella snap non è la home dell'utente). Senza
    impostazione si usa ``<retroarch>/config/remaps``.
    """
    retroarch_dir = os.path.normpath(retroarch_dir)
    value = (setting or '').strip()
    if value.startswith('~/') and retroarch_dir.endswith(os.sep + RETROARCH_HOME):
        home = retroarch_dir[:-len(RETROARCH_HOME) - 1]
        return os.path.normpath(os.path.join(home, value[2:]))
    if os.path.isabs(value):
        return os.path.normpath(value)
    return os.path.join(retroarch_dir, DEFAULT_REMAP_DIR)


def identity():
    return {button: button for button in EDITABLE}


def read_remap(path):
    """Assegnazioni di un file di remap: ``({p1: {azione: tasto fisico}, p2: …}, altre righe)``.

    Le righe che non riguardano i tasti riassegnabili di P1 e P2 si
    conservano così come sono. Un'assegnazione che non è uno scambio tra
    tasti riassegnabili (per esempio un tasto tolto con ``-1``) vale come
    nessuna riassegnazione per quel giocatore.
    """
    mapping = {player: identity() for player in PLAYERS}
    others = []
    try:
        with open(path, encoding='utf-8', errors='replace') as stream:
            lines = stream.read().splitlines()
    except FileNotFoundError:
        return mapping, others
    except OSError as error:
        log.warning('Remap %s non leggibile: %s', path, error)
        return mapping, others
    physical = {player: {} for player in PLAYERS}
    for line in lines:
        match = REMAP_LINE.match(line)
        if not match or match.group(2) not in EDITABLE:
            if line.strip():
                others.append(line)
            continue
        physical[PLAYERS[int(match.group(1)) - 1]][match.group(2)] = int(match.group(3))
    for player in PLAYERS:
        actions = {}
        for button in EDITABLE:
            target = physical[player].get(button, RETROPAD.index(button))
            action = RETROPAD[target] if 0 <= target < len(RETROPAD) else None
            if action not in EDITABLE or action in actions:
                log.warning('Remap %s: assegnazioni di %s non riconosciute, uso quelle predefinite.', path, player)
                actions = None
                break
            actions[action] = button
        if actions is not None:
            mapping[player] = actions
    return mapping, others


def remap_text(mapping, others=()):
    """Testo del file di remap; vuoto se non c'è nessuna riassegnazione né altre righe."""
    lines = list(others)
    for number, player in enumerate(PLAYERS, 1):
        actions = mapping.get(player) or identity()
        for action in EDITABLE:
            button = actions[action]
            if button != action:
                lines.append('input_player%d_btn_%s = "%d"' % (number, button, RETROPAD.index(action)))
    return '\n'.join(lines) + '\n' if lines else ''


def check_mapping(value):
    """``{p1, p2}`` di ``{azione: tasto fisico}`` validi (mancanti = predefiniti); ``LaunchError`` se no.

    Ogni tasto riassegnabile deve avere una sola azione: le modifiche sono scambi.
    """
    if value is None:
        value = {}
    if not isinstance(value, dict) or not set(value) <= set(PLAYERS):
        raise LaunchError('Comandi non validi.')
    result = {}
    for player in PLAYERS:
        actions = value.get(player) or {}
        if not isinstance(actions, dict) or not set(actions) <= set(EDITABLE):
            raise LaunchError('Comandi non validi.')
        merged = dict(identity(), **actions)
        if sorted(merged.values()) != sorted(EDITABLE):
            raise LaunchError('Ogni tasto può avere una sola azione.')
        result[player] = merged
    return result


def check_labels(value):
    """Nomi delle azioni scritti a mano: ``{p1: {tasto: testo}}`` puliti (vuoti tolti); ``LaunchError`` se no."""
    if value is None:
        value = {}
    if not isinstance(value, dict) or not set(value) <= set(PLAYERS):
        raise LaunchError('Nomi dei comandi non validi.')
    result = {}
    for player, labels in value.items():
        if not isinstance(labels, dict) or not set(labels) <= set(EDITABLE + FIXED):
            raise LaunchError('Nomi dei comandi non validi.')
        clean = {}
        for button, text in labels.items():
            if not isinstance(text, str):
                raise LaunchError('Nomi dei comandi non validi.')
            text = ' '.join(text.split())[:LABEL_MAX]
            if text:
                clean[button] = text
        if clean:
            result[player] = clean
    return result


class ControlsService:
    """Comandi di un gioco: nomi dal core, nomi scritti a mano, file di remap e richiesta al primo avvio.

    ``ingame`` (``IngameService``) si assegna dopo la creazione: apre la
    finestra «Comandi» sopra il gioco. ``library_name(percorso)``,
    ``spawn(funzione)``, ``sleep`` e ``now`` sono sostituibili nei test.
    """

    def __init__(self, repo, config, cores_repo, library_name=read_library_name, spawn=None, sleep=time.sleep,
                 now=now_iso, descriptor_wait=DESCRIPTOR_WAIT, open_delay=OPEN_DELAY):
        self.repo = repo
        self.config = config
        self.cores = cores_repo
        self.library_name = library_name
        self.spawn = spawn or self.spawn_thread
        self.sleep = sleep
        self.now = now
        self.descriptor_wait = descriptor_wait
        self.open_delay = open_delay
        self.ingame = None
        self.lock = threading.Lock()
        self.names = {}

    @staticmethod
    def spawn_thread(target):
        thread = threading.Thread(target=target, name='controls', daemon=True)
        thread.start()
        return thread

    # --- File di remap -------------------------------------------------------

    def core_library(self, core):
        """``library_name`` del core installato (in cache finché il file non cambia); ``LaunchError`` se non si legge."""
        path = os.path.join(self.config.resolve_path('paths.cores'), core + CORE_SUFFIX)
        try:
            mark = os.stat(path).st_mtime_ns
        except OSError:
            raise LaunchError('Il core %s non è installato.' % core)
        with self.lock:
            cached = self.names.get(path)
        if cached is not None and cached[0] == mark:
            return cached[1]
        name = self.library_name(path)
        if not name or name in ('.', '..') or os.sep in name:
            raise LaunchError('Nome del core %s non letto.' % core)
        with self.lock:
            self.names[path] = (mark, name)
        return name

    def library_dir(self, core):
        """``<cartella dei remap>/<library_name>``."""
        cores_dir = self.config.resolve_path('paths.cores')
        retroarch_dir = os.path.dirname(os.path.normpath(cores_dir))
        setting = read_known_keys(retroarch_cfg_path(cores_dir)).get('input_remapping_directory')
        return os.path.join(remap_dir(retroarch_dir, setting), self.core_library(core))

    def remap_path(self, core, game):
        """``<cartella dei remap>/<library_name>/<nome del gioco>.rmp``."""
        base = os.path.splitext(os.path.basename(game['file']))[0]
        return os.path.join(self.library_dir(core), base + REMAP_SUFFIX)

    def ensure_device(self, system_id, game, core, rom_path, controller=None):
        """Controller emulato ``controller`` del gioco (``SYSTEM_DEVICES``) nei remap che RetroArch può caricare.

        RetroArch 1.22.2 legge ``input_libretro_device_pN`` solo dai remap e ne
        carica uno: quello del gioco, se c'è, altrimenti quello della cartella
        del gioco (``<library_name>/ps1.rmp``). Le righe vanno in entrambi, a
        ogni avvio, con il controller del gioco che parte; le altre righe
        restano. Prova del 29 ottobre 2026: con ``ps1.rmp`` Beetle riceve il
        DualShock e Ape Escape risponde. Un ``controller`` sconosciuto o assente
        vale ``DEFAULT_CONTROLLER``.
        """
        devices = SYSTEM_DEVICES.get(system_id)
        if not devices:
            return
        device = devices.get(controller) or devices[DEFAULT_CONTROLLER]
        content_dir = os.path.basename(os.path.dirname(os.path.normpath(rom_path)))
        paths = [os.path.join(self.library_dir(core), content_dir + REMAP_SUFFIX)]
        game_path = self.remap_path(core, game)
        if os.path.exists(game_path):
            paths.append(game_path)
        for path in paths:
            self.write_device(path, device)

    @staticmethod
    def write_device(path, device):
        """Scrive nel remap ``input_libretro_device_p1/p2 = device`` (solo se cambia)."""
        try:
            with open(path, encoding='utf-8', errors='replace') as stream:
                before = stream.read()
        except FileNotFoundError:
            before = ''
        lines = [line for line in before.splitlines() if line.strip() and not DEVICE_LINE.match(line)]
        lines += ['input_libretro_device_p%d = "%s"' % (number, device) for number in range(1, len(PLAYERS) + 1)]
        text = '\n'.join(lines) + '\n'
        if text == before:
            return
        os.makedirs(os.path.dirname(path), exist_ok=True)
        atomic_write_text(path, text, mode=0o644)
        log.info('Controller %s scritto in %s.', device, path)

    def write_remap(self, path, mapping):
        """Scrive le riassegnazioni (conservando le altre righe); senza nulla da scrivere toglie il file."""
        _, others = read_remap(path)
        text = remap_text(mapping, others)
        if not text:
            try:
                os.unlink(path)
            except FileNotFoundError:
                pass
            return
        os.makedirs(os.path.dirname(path), exist_ok=True)
        atomic_write_text(path, text, mode=0o644)

    # --- Dati per l'interfaccia ----------------------------------------------

    def game_core(self, system_id, game_id):
        """Core del gioco: quello associato (confermato o in prova), altrimenti l'ultimo che ha dato i nomi."""
        association = self.cores.game_core(system_id, game_id)
        if association and association['status'] in ('ok', 'trial') and association['core']:
            return association['core']
        latest = self.repo.latest(system_id, game_id)
        return latest['core'] if latest else None

    def describe(self, system_id, game, core=None):
        """Comandi del gioco per l'interfaccia.

        ``{core, descriptors, labels, map, confirmed, editable, fixed}``:
        ``descriptors`` e ``labels`` sono ``{p1: {tasto: testo}}``, ``map``
        ``{p1: {azione: tasto fisico}}`` dal file di remap. Senza nomi letti
        (gioco mai avviato con questo core) ``descriptors`` è vuoto.
        """
        core = core or self.game_core(system_id, game['id'])
        row = self.repo.get(system_id, game['id'], core) if core else None
        mapping = {player: identity() for player in PLAYERS}
        if core and row and row['descriptors']:
            try:
                mapping, _ = read_remap(self.remap_path(core, game))
            except LaunchError as error:
                log.warning('Remap di %s/%s non letto: %s', system_id, game['id'], error)
        return {'core': core, 'descriptors': row['descriptors'] if row else {},
                'labels': row['labels'] if row else {}, 'map': mapping,
                'confirmed': bool(row and row['confirmedAt']), 'editable': list(EDITABLE), 'fixed': list(FIXED)}

    def save(self, system_id, game, mapping, labels, core=None):
        """Salva assegnazioni e nomi scritti a mano e conferma la configurazione.

        Restituisce vero se le assegnazioni sono cambiate (in partita il
        gioco va riavviato). ``LaunchError`` se il gioco non ha ancora i nomi
        dei tasti o il core non si può leggere.
        """
        mapping = check_mapping(mapping)
        labels = check_labels(labels)
        core = core or self.game_core(system_id, game['id'])
        row = self.repo.get(system_id, game['id'], core) if core else None
        if not row or not row['descriptors']:
            raise LaunchError('Avvia il gioco una volta per leggere i comandi.')
        path = self.remap_path(core, game)
        before, _ = read_remap(path)
        changed = before != mapping
        if changed:
            try:
                self.write_remap(path, mapping)
            except OSError as error:
                log.error('Remap %s non scritto: %s', path, error)
                raise LaunchError('Comandi non salvati: file di RetroArch non scrivibile.')
            log.info('Comandi di %s/%s con %s salvati in %s.', system_id, game['id'], core, path)
        at = self.now()
        self.repo.set_labels(system_id, game['id'], core, labels, at)
        self.repo.confirm(system_id, game['id'], core, at)
        return changed

    # --- Partita -------------------------------------------------------------

    @staticmethod
    def reader():
        """Lettore dei nomi dei tasti per il log di un processo di RetroArch."""
        return DescriptorReader()

    def store(self, system_id, game_id, core, reader):
        """Salva i nomi dei tasti letti dal log; vero se ce n'erano."""
        descriptors = reader.result()
        if not descriptors:
            return False
        self.repo.set_descriptors(system_id, game_id, core, descriptors, self.now())
        return True

    def game_started(self, job, core, reader, running):
        """Inizio della partita: in un thread a parte aspetta i nomi dei tasti, li salva e,
        se il gioco non è mai stato configurato con questo core, apre la finestra «Comandi».

        ``running()`` è vero finché la partita è ancora la stessa.
        """
        self.spawn(lambda: self.watch(job['system'], job['game']['id'], core, reader, running))

    def watch(self, system_id, game_id, core, reader, running):
        try:
            if not reader.ready.wait(self.descriptor_wait) or not self.store(system_id, game_id, core, reader):
                return
            row = self.repo.get(system_id, game_id, core)
            if row and row['confirmedAt']:
                return
            self.sleep(self.open_delay)
            if not running() or self.ingame is None:
                return
            log.info('Comandi di %s/%s con %s mai configurati: apro la finestra.', system_id, game_id, core)
            self.ingame.open_controls()
        except Exception:
            log.exception('Comandi di %s/%s non letti', system_id, game_id)

    def game_ended(self, job, core, reader):
        """Fine di RetroArch: salva i nomi dei tasti se il blocco è arrivato tardi."""
        try:
            self.store(job['system'], job['game']['id'], core, reader)
        except Exception:
            log.exception('Comandi di %s/%s non salvati', job['system'], job['game']['id'])
