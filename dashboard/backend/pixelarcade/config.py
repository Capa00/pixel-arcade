"""Servizio impostazioni: valori predefiniti e validazione."""
import copy
import datetime
import logging
import os
import re
import shlex
import threading

from . import buildbot
from .core_info import CoreCatalog
from .errors import ConfigError
from .systems import describe

log = logging.getLogger(__name__)

BUTTON_NAMES = ('a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'select', 'start')

DEFAULTS = {
    'paths.roms': 'games',
    'paths.cores': '~/snap/retroarch/common/.config/retroarch/cores',
    'paths.thumbnails': 'thumbnails',
    'paths.metadata': 'metadata',
    'paths.appendconfig': '~/snap/retroarch/common/pixel-arcade.cfg',
    'paths.crt_shader': '',
    'retroarch.command': 'snap run retroarch',
    'probe.window_seconds': 10,
    'probe.auto_confirm_seconds': 120,
    'probe.black_seconds': 20,
    'retroarch.network_port': 55355,
    'buttons': {'a': 0, 'b': 1, 'x': 2, 'y': 3, 'lb': 4, 'rb': 5, 'lt': 6, 'rt': 7, 'select': 8, 'start': 9},
    'input.save_combo': ['select', 'lt'],
    # Combinazione di emergenza: tenuta ``RESCUE_HOLD`` secondi chiude il gioco senza salvare il «Riprendi».
    'input.rescue_combo': ['select', 'rt'],
    # Uscita dal gioco col joypad (``QUIT_COMBOS``), scritta nel ``--appendconfig`` di RetroArch.
    'input.quit_combo': 'hold_start',
    # Apertura del menu rapido di RetroArch col joypad (``MENU_COMBOS``), scritta nel ``--appendconfig``.
    'input.menu_combo': 'l1_r1_start_select',
    'cores.buildbot_url': 'https://buildbot.libretro.com/nightly/linux/x86_64/latest/',
    'ui.theme': 'random',
    'ui.mode': 'system',
    # Minuti senza comandi prima del salvaschermo (``SCREENSAVER_MINUTES``; 0 = mai, 10 / 60 = 10 secondi, 0.25 = 15 secondi).
    'ui.screensaver_minutes': 2,
    # Contenuto del salvaschermo (``SCREENSAVER_CONTENT``): copertine e spezzoni delle partite, solo uno dei due.
    'ui.screensaver_content': 'mixed',
    # Con un torneo di oggi il salvaschermo diventa il suo manifesto.
    'ui.tournament_ads': True,
    # Minuti senza comandi prima che escano i profili e torni «PRESS START» (``LOGOUT_MINUTES``; 0 = mai).
    'ui.logout_minutes': 1,
    # Suoni della dashboard: interruttore generale e volumi (``VOLUMES``) di effetti e musica.
    'ui.sound': True,
    'ui.sound_effects': 75,
    'ui.sound_music': 50,
    # Processore al massimo durante le partite (``cpu.CpuBoost``).
    'play.cpu_boost': True,
}

# Temi grafici dello sfondo (frontend/src/lib/themes.js); ``random`` ne sceglie uno a ogni avvio.
THEMES = ('random', 'nes', 'gameboy', '16bit', 'psx', 'n64', 'computer', 'arcade', 'y2k')

# Attese del salvaschermo in minuti (frontend/src/lib/screensaver.js); 0 lo disattiva, 10 / 60, 0.25 e 0.5 sono 10, 15 e 30 secondi.
SCREENSAVER_MINUTES = (0, 10 / 60, 0.25, 0.5, 1, 2, 5, 10)

# Contenuto del salvaschermo: ``mixed`` alterna copertine e spezzoni delle partite (``replays``).
SCREENSAVER_CONTENT = ('mixed', 'covers', 'games')

# Attese prima dell'uscita dei profili in minuti (frontend/src/lib/splash.js); 0 la disattiva, 0.5 sono 30 secondi.
LOGOUT_MINUTES = (0, 0.5, 1, 2, 5, 10)

# Volumi di effetti e musica della dashboard (frontend/src/lib/sound.js), in percentuale; 0 li spegne.
VOLUMES = (0, 25, 50, 75, 100)

# Modalità dei colori (frontend/src/lib/modes.js): ``system`` segue la preferenza chiaro/scuro del sistema.
MODES = ('system', 'day', 'night')

# Tasti della dashboard di ogni joypad: ``{id del joypad nella Gamepad API: {tasto: indice}}``.
PAD_BUTTONS_KEY = 'input.pad_buttons'

# Righe di ``settings`` scritte dal servizio e non modificabili dall'interfaccia.
INTERNAL_KEYS = frozenset(('cores.index_fetched_at', 'retroachievements.api_key', PAD_BUTTONS_KEY))

PATH_KEYS = ('paths.roms', 'paths.cores', 'paths.thumbnails', 'paths.metadata', 'paths.appendconfig',
             'paths.crt_shader')

CORE_SUFFIX = '_libretro.so'
CORE_NAME = re.compile(r'^[A-Za-z0-9_+-][A-Za-z0-9_+.-]{0,63}$')
MAX_EXTENSIONS_TEXT = 200
MAX_URL = 300
EXTENSION = re.compile(r'^[a-z0-9]{1,10}$')

# Chiave intera → (minimo, massimo, nome mostrato nei messaggi).
INT_KEYS = {
    'probe.window_seconds': (3, 60, 'La finestra di verifica del core'),
    'probe.auto_confirm_seconds': (10, 3600, 'Il tempo di conferma automatica'),
    'probe.black_seconds': (5, 300, 'Il tempo di schermo nero'),
    'retroarch.network_port': (1024, 65535, 'La porta di rete di RetroArch'),
}


def is_int(value):
    """Vero per gli interi veri e propri (``bool`` escluso)."""
    return isinstance(value, int) and not isinstance(value, bool)


def validate_buttons(buttons):
    """Controlla la mappatura dei tasti e ne restituisce una copia."""
    if not isinstance(buttons, dict) or set(buttons) != set(BUTTON_NAMES):
        raise ConfigError('La mappatura dei tasti deve indicare A, B, X, Y, LB, RB, LT, RT, SELECT e START.')
    for name in BUTTON_NAMES:
        value = buttons[name]
        if not is_int(value) or not 0 <= value <= 31:
            raise ConfigError('Il tasto %s deve essere un numero da 0 a 31.' % name.upper())
    if len(set(buttons.values())) != len(BUTTON_NAMES):
        raise ConfigError('Ogni tasto del joypad può avere una sola funzione.')
    return {name: buttons[name] for name in BUTTON_NAMES}


# Tasti della dashboard di un joypad: i tasti logici, la croce e la levetta sinistra (``ls_*``).
PAD_DIRECTIONS = ('up', 'down', 'left', 'right', 'ls_up', 'ls_down', 'ls_left', 'ls_right')
PAD_NAMES = BUTTON_NAMES + PAD_DIRECTIONS
# Tasti senza i quali un joypad non comanda la dashboard (come ``joypads.REQUIRED``).
PAD_REQUIRED = ('a', 'b', 'select', 'start')
MAX_PAD_ID = 200
# Asse della Gamepad API in una direzione: ``+1``, ``-0``.
PAD_AXIS = re.compile(r'^[+-]\d{1,2}$')


def validate_pad_buttons(pad_id, buttons):
    """Controlla i tasti di un joypad (``pad_id`` = id della Gamepad API) e ne restituisce una copia.

    Ogni valore è un pulsante (intero da 0 a 31) o un asse in una direzione
    (``+1``, ``-0``). A differenza di ``buttons`` i tasti facoltativi possono
    mancare: il joypad potrebbe non averli.
    """
    if not isinstance(pad_id, str) or not pad_id.strip() or len(pad_id) > MAX_PAD_ID or '\0' in pad_id:
        raise ConfigError('Joypad non valido.')
    if not isinstance(buttons, dict) or not set(buttons) <= set(PAD_NAMES):
        raise ConfigError('Tasti del joypad non validi.')
    for name in PAD_REQUIRED:
        if name not in buttons:
            raise ConfigError('Manca il tasto %s del joypad.' % name.upper())
    for name, value in buttons.items():
        button = is_int(value) and 0 <= value <= 31
        if not button and not (isinstance(value, str) and PAD_AXIS.match(value)):
            raise ConfigError('Il tasto %s deve essere un pulsante da 0 a 31 o un asse.' % name.upper())
    if len(set(buttons.values())) != len(buttons):
        raise ConfigError('Ogni tasto del joypad può avere una sola funzione.')
    return {name: buttons[name] for name in PAD_NAMES if name in buttons}


# START+SELECT arriva anche al gioco ed è il reset di molti giochi (Tekken 3): non può aprire i salvataggi.
RESET_COMBO = frozenset(('start', 'select'))

# Uscite dal gioco (valori in ``retroarch_cfg.QUIT_COMBO_VALUES``): START o SELECT tenuto 2 secondi, oppure START+SELECT.
QUIT_COMBOS = ('hold_start', 'hold_select', 'start_select')

# Menu rapido di RetroArch (valori in ``retroarch_cfg.MENU_COMBO_VALUES``) → tasti logici premuti insieme
# (``down`` è la croce in basso). ``none`` = solo F1 da tastiera.
MENU_COMBOS = {
    'l1_r1_start_select': frozenset(('lb', 'rb', 'start', 'select')),
    'l2_r2': frozenset(('lt', 'rt')),
    'l1_r1': frozenset(('lb', 'rb')),
    'down_select': frozenset(('down', 'select')),
    'none': frozenset(),
}


def menu_conflict(menu, quit_combo=None, save=None, rescue=None):
    """Messaggio se la combinazione del menu ``menu`` si scontra con le altre, altrimenti ``None``.

    Premere il menu non deve far scattare un'altra combinazione (che vi è contenuta), né il contrario.
    L'uscita START+SELECT scatta subito; quelle con un tasto tenuto 2 secondi no.
    """
    buttons = MENU_COMBOS.get(menu, frozenset())
    if not buttons:
        return None
    if quit_combo == 'start_select' and RESET_COMBO <= buttons:
        return 'Il menu rapido contiene START+SELECT, che è l\'uscita dal gioco: cambia una delle due.'
    for combo, name in ((save, 'dei salvataggi'), (rescue, 'di emergenza')):
        if combo and (set(combo) <= buttons or buttons <= set(combo)):
            return 'Il menu rapido si scontra con la combinazione %s: cambia una delle due.' % name
    return None


def validate_save_combo(combo, name='dei salvataggi'):
    """Controlla una combinazione in partita (due tasti logici diversi) e ne restituisce una copia."""
    if (not isinstance(combo, list) or len(combo) != 2
            or not all(isinstance(button, str) and button in BUTTON_NAMES for button in combo)):
        raise ConfigError('La combinazione %s deve indicare due tasti del joypad.' % name)
    if combo[0] == combo[1]:
        raise ConfigError('La combinazione %s deve usare due tasti diversi.' % name)
    if set(combo) == RESET_COMBO:
        raise ConfigError('START+SELECT è il reset di molti giochi: scegli un\'altra combinazione.')
    return list(combo)


def check_combos(values):
    """``ConfigError`` se le combinazioni non vanno d'accordo tra loro (impostazioni complete).

    La combinazione di emergenza è diversa da quella dei salvataggi. Può usare il tasto che, tenuto,
    esce dal gioco: allora la dashboard la fa scattare dopo 1 secondo, prima che RetroArch esca da
    solo dopo 2 salvando il «Riprendi» (``frontend/src/input/rescueCombo.js``).
    """
    if set(values['input.save_combo']) == set(values['input.rescue_combo']):
        raise ConfigError('La combinazione di emergenza deve essere diversa da quella dei salvataggi.')
    message = menu_conflict(values.get('input.menu_combo'), values.get('input.quit_combo'),
                            values.get('input.save_combo'), values.get('input.rescue_combo'))
    if message:
        raise ConfigError(message)


def validate(values):
    """Valida le impostazioni e ne restituisce una copia normalizzata.

    Solleva ``ConfigError`` con un messaggio in italiano al primo valore non
    valido. Le chiavi assenti non vengono controllate.
    """
    if not isinstance(values, dict):
        raise ConfigError('Impostazioni non valide.')
    result = {}
    for key, value in values.items():
        if key not in DEFAULTS:
            raise ConfigError('Impostazione sconosciuta: %s.' % key)
        if key in PATH_KEYS:
            if not isinstance(value, str) or '\0' in value:
                raise ConfigError('Il percorso %s deve essere un testo.' % key)
            result[key] = value.strip()
        elif key == 'retroarch.command':
            if not isinstance(value, str):
                raise ConfigError('Il comando di RetroArch deve essere un testo.')
            try:
                parts = shlex.split(value)
            except ValueError:
                raise ConfigError('Il comando di RetroArch contiene virgolette non chiuse.')
            if not parts:
                raise ConfigError('Il comando di RetroArch non può essere vuoto.')
            result[key] = value.strip()
        elif key in INT_KEYS:
            low, high, label = INT_KEYS[key]
            if not is_int(value) or not low <= value <= high:
                raise ConfigError('%s deve essere un numero intero da %d a %d.' % (label, low, high))
            result[key] = value
        elif key == 'buttons':
            result[key] = validate_buttons(value)
        elif key == 'input.save_combo':
            result[key] = validate_save_combo(value)
        elif key == 'input.rescue_combo':
            result[key] = validate_save_combo(value, 'di emergenza')
        elif key == 'input.quit_combo':
            if value not in QUIT_COMBOS:
                raise ConfigError('Uscita dal gioco sconosciuta.')
            result[key] = value
        elif key == 'input.menu_combo':
            if value not in MENU_COMBOS:
                raise ConfigError('Combinazione del menu rapido sconosciuta.')
            result[key] = value
        elif key == 'cores.buildbot_url':
            if (not isinstance(value, str) or len(value) > MAX_URL or not value.startswith('https://')
                    or not value.endswith('/') or re.search(r'\s', value)):
                raise ConfigError('L\'indirizzo del buildbot deve iniziare con https:// e finire con /.')
            result[key] = value
        elif key == 'ui.theme':
            if value not in THEMES:
                raise ConfigError('Tema grafico sconosciuto.')
            result[key] = value
        elif key == 'ui.screensaver_minutes':
            if not (is_int(value) or isinstance(value, float)) or value not in SCREENSAVER_MINUTES:
                raise ConfigError('Attesa del salvaschermo non valida.')
            result[key] = value
        elif key == 'ui.screensaver_content':
            if value not in SCREENSAVER_CONTENT:
                raise ConfigError('Contenuto del salvaschermo non valido.')
            result[key] = value
        elif key == 'ui.logout_minutes':
            if not (is_int(value) or isinstance(value, float)) or value not in LOGOUT_MINUTES:
                raise ConfigError('Attesa prima dell\'uscita dei profili non valida.')
            result[key] = value
        elif key == 'ui.mode':
            if value not in MODES:
                raise ConfigError('Modalità sconosciuta.')
            result[key] = value
        elif key == 'ui.tournament_ads':
            if not isinstance(value, bool):
                raise ConfigError('«Pubblicità dei tornei» deve essere sì o no.')
            result[key] = value
        elif key == 'ui.sound':
            if not isinstance(value, bool):
                raise ConfigError('«Suoni» deve essere sì o no.')
            result[key] = value
        elif key in ('ui.sound_effects', 'ui.sound_music'):
            if not is_int(value) or value not in VOLUMES:
                raise ConfigError('Volume non valido.')
            result[key] = value
        elif key == 'play.cpu_boost':
            if not isinstance(value, bool):
                raise ConfigError('«Processore al massimo» deve essere sì o no.')
            result[key] = value
    return result


def parse_extensions(text):
    """Estensioni da un testo libero (``".ZIP, 7z"``) come lista in minuscolo, senza punti né doppioni."""
    result = []
    for part in re.split(r'[\s,;]+', text or ''):
        part = part.lstrip('.').lower()
        if part and part not in result:
            result.append(part)
    return result


def normalize_extensions(text):
    """Testo delle estensioni normalizzato (``"zip 7z"``); vuoto = predefinite del sistema.

    Solleva ``ConfigError`` se un'estensione non è fatta di sole lettere e cifre.
    """
    if not isinstance(text, str) or len(text) > MAX_EXTENSIONS_TEXT:
        raise ConfigError('Le estensioni devono essere un testo breve, per esempio «zip 7z».')
    extensions = parse_extensions(text)
    for ext in extensions:
        if not EXTENSION.match(ext):
            raise ConfigError('Estensione non valida: %s. Usa solo lettere e cifre, per esempio «zip 7z».' % ext)
    return ' '.join(extensions)


def is_core_name(name):
    """Vero se ``name`` è il nome breve di un core (``fbneo``, ``mesen-s``), senza cartelle né suffisso."""
    return isinstance(name, str) and bool(CORE_NAME.match(name)) and not name.endswith(CORE_SUFFIX)


def core_name_from_file(file_name):
    """Nome breve dal nome del file (``fbneo_libretro.so`` → ``fbneo``), oppure ``None``."""
    if not isinstance(file_name, str) or not file_name.endswith(CORE_SUFFIX):
        return None
    name = file_name[:-len(CORE_SUFFIX)]
    return name if is_core_name(name) else None


def core_order(name, available, compatible=()):
    """Chiave dell'ordine automatico (README §I).

    Prima i core ``compatible`` (compatibili con RetroAchievements, vedi
    ``ra_cores.py``) disponibili, nell'ordine dato, installati o solo
    scaricabili; poi gli altri installati, gli altri scaricabili e infine i non
    disponibili, ciascun gruppo in ordine alfabetico.
    """
    core = available.get(name)
    if core is not None and name in compatible:
        return (0, compatible.index(name), '', name)
    rank = 3 if core is None else 1 if core['installed'] else 2
    return (rank, 0, name.casefold(), name)


def is_folder_name(name):
    """Vero se ``name`` può essere il nome di una cartella di console."""
    return (isinstance(name, str) and bool(name) and not name.startswith('.')
            and '/' not in name and '\\' not in name and '\0' not in name)


def list_folders(path):
    """Sottocartelle di ``path`` senza nascoste né link simbolici (vuoto se non leggibile)."""
    try:
        entries = list(os.scandir(path))
    except OSError:
        return []
    return [entry.name for entry in entries
            if not entry.name.startswith('.') and not entry.is_symlink() and entry.is_dir()]


def validate_system(item, folders):
    """Controlla le impostazioni di una console (``{id, extensions, cores}``) e ne restituisce una copia.

    ``folders`` sono le cartelle presenti nella cartella ROM: la console deve
    essere una di queste. ``cores`` è una lista di nomi brevi, senza limite
    di numero e con i doppioni tolti, oppure ``None`` per la lista predefinita.
    """
    if not isinstance(item, dict):
        raise ConfigError('Impostazioni della console non valide.')
    system_id = item.get('id')
    if not is_folder_name(system_id) or system_id not in folders:
        raise ConfigError('Console non trovata nella cartella dei giochi: %s.' % system_id)
    cores = item.get('cores')
    if cores is not None:
        if not isinstance(cores, list):
            raise ConfigError('Lista dei core di %s non valida.' % system_id)
        for core in cores:
            if not is_core_name(core):
                raise ConfigError('Nome del core non valido in %s: usa il nome breve, per esempio «fbneo».'
                                  % system_id)
        cores = list(dict.fromkeys(cores))
    return {'id': system_id, 'extensions': normalize_extensions(item.get('extensions', '')), 'cores': cores}


class ConfigService:
    """Impostazioni salvate nel database, unite ai valori predefiniti.

    ``cores_repo`` (facoltativo) dà estensioni e core di ogni console e
    l'elenco dei core scaricabili; ``opener`` sostituisce
    ``urllib.request.urlopen`` nei test.
    """

    def __init__(self, settings_repo, base_dir, cores_repo=None, opener=None):
        self.repo = settings_repo
        self.cores = cores_repo
        self.base_dir = os.path.abspath(os.path.expanduser(base_dir))
        self.opener = opener
        self.lock = threading.Lock()
        self.pad_lock = threading.Lock()
        self.catalogs = {}
        self.index_error = None

    def get(self):
        """Restituisce tutte le impostazioni: quelle salvate più i predefiniti."""
        result = copy.deepcopy(DEFAULTS)
        for key, value in self.repo.get_all().items():
            if key in DEFAULTS:
                result[key] = value
            elif key not in INTERNAL_KEYS:
                log.warning('Impostazione sconosciuta nel database ignorata: %s', key)
        return result

    def pad_buttons(self):
        """Tasti della dashboard dei joypad configurati: ``{id: {tasto: indice}}``."""
        stored = self.repo.get_all().get(PAD_BUTTONS_KEY)
        return stored if isinstance(stored, dict) else {}

    def set_pad_buttons(self, pad_id, buttons):
        """Salva i tasti del joypad ``pad_id`` e restituisce quelli di tutti i joypad."""
        clean = validate_pad_buttons(pad_id, buttons)
        with self.pad_lock:
            result = dict(self.pad_buttons(), **{pad_id: clean})
            self.repo.set_many({PAD_BUTTONS_KEY: result})
        return result

    def merge_buttons(self, values):
        """Completa un ``buttons`` parziale con i tasti attuali."""
        if isinstance(values, dict) and isinstance(values.get('buttons'), dict):
            buttons = dict(self.get()['buttons'])
            buttons.update(values['buttons'])
            values = dict(values, buttons=buttons)
        return values

    def update(self, values):
        """Valida e salva ``values`` in una transazione. Restituisce le impostazioni aggiornate.

        ``buttons`` può essere parziale: i tasti non indicati restano invariati.
        """
        values = validate(self.merge_buttons(values))
        check_combos(dict(self.get(), **values))
        self.repo.set_many(values)
        return self.get()

    def update_all(self, payload):
        """Valida e salva insieme impostazioni generali e console, in una sola transazione.

        ``payload`` = ``{settings: {...}, systems: [{id, extensions, cores}]}``
        (``cores`` = nomi brevi, oppure ``None`` per la lista predefinita);
        le console non indicate restano invariate, gli altri campi vengono
        ignorati. La cartella ROM (nuova o attuale) deve esistere e ogni
        console deve esserne una sottocartella. Al primo errore solleva
        ``ConfigError`` e non salva nulla. Restituisce le impostazioni aggiornate.
        """
        if not isinstance(payload, dict):
            raise ConfigError('Impostazioni non valide.')
        settings = payload.get('settings', {})
        systems = payload.get('systems', [])
        if not isinstance(settings, dict) or not isinstance(systems, list):
            raise ConfigError('Impostazioni non valide.')
        values = validate(self.merge_buttons(settings))
        check_combos(dict(self.get(), **values))
        roms = self.resolve_value(values.get('paths.roms', self.get()['paths.roms']))
        if not roms or not os.path.isdir(roms):
            raise ConfigError('La cartella dei giochi non esiste: %s.' % (roms or '(vuota)'))
        folders = set(list_folders(roms))
        rows = [validate_system(item, folders) for item in systems]
        ids = [row['id'] for row in rows]
        if len(set(ids)) != len(ids):
            raise ConfigError('Una console compare due volte.')
        if rows and self.cores is None:
            raise ConfigError('Impostazioni delle console non disponibili.')
        with self.repo.db.transaction():
            self.repo.set_many(values)
            for row in rows:
                self.cores.replace_system(row['id'], row['extensions'], row['cores'])
        return self.get()

    def systems_settings(self):
        """Impostazioni salvate delle console: ``{id: {'extensions': testo, 'cores': [...] | None}}``."""
        return self.cores.system_settings() if self.cores is not None else {}

    def installed_cores(self):
        """Nomi brevi dei core installati (file ``*_libretro.so`` nella cartella dei core), ordinati."""
        folder = self.resolve_path('paths.cores')
        if not folder:
            return []
        try:
            entries = list(os.scandir(folder))
        except OSError:
            return []
        names = []
        for entry in entries:
            name = core_name_from_file(entry.name)
            if name and not entry.name.startswith('.') and entry.is_file():
                names.append(name)
        return sorted(names, key=lambda name: (name.casefold(), name))

    def catalog(self):
        """Catalogo dei ``.info`` della cartella dei core attuale (``core_info.CoreCatalog``)."""
        folder = self.resolve_path('paths.cores')
        with self.lock:
            catalog = self.catalogs.get(folder)
            if catalog is None:
                catalog = self.catalogs[folder] = CoreCatalog(folder)
            return catalog

    def buildbot_index(self):
        """Core scaricabili dal buildbot, come salvati nel database."""
        return self.cores.buildbot_index() if self.cores is not None else {}

    def available_cores(self):
        """Core disponibili: ``{nome: {name, label, types, extensions, installed, downloadable}}``.

        Sono disponibili i core installati e quelli scaricabili dal buildbot
        che hanno un ``.info``; i core esclusi dalla classificazione (test,
        lettori, utilità) solo se installati.
        """
        installed = set(self.installed_cores())
        index = self.buildbot_index()
        catalog = self.catalog().cores()
        result = {}
        for name in installed | (set(index) & set(catalog)):
            info = catalog.get(name)
            if name not in installed and info['kind'] is None:
                continue
            result[name] = {
                'name': name,
                'label': info['label'] if info else name,
                'types': list(info['types']) if info else [],
                'extensions': list(info['extensions']) if info else [],
                'installed': name in installed,
                'downloadable': name in index and info is not None,
            }
        return result

    def core_types(self, available=None):
        """Tipologie ``[{name, group, cores}]`` con i soli core disponibili."""
        available = self.available_cores() if available is None else available
        return self.catalog().types(set(available))

    def default_cores(self, system_id, available=None):
        """Lista predefinita di una console: i core disponibili delle tipologie del preset.

        Comprende anche i core disponibili compatibili con RetroAchievements
        del preset (``describe()['cores']``) di tipologia diversa, e li mette in testa.
        """
        available = self.available_cores() if available is None else available
        system = describe(system_id)
        types = set(system['types'])
        compatible = system['cores']
        names = [name for name, core in available.items()
                 if types & set(core['types']) or name in compatible]
        return sorted(names, key=lambda name: core_order(name, available, compatible))

    def system_cores(self, system_id, stored=None, available=None):
        """Core della console nell'ordine automatico: la lista salvata, oppure quella predefinita.

        ``stored`` sono le impostazioni della console come in
        ``systems_settings()``; se manca si leggono dal database.
        """
        available = self.available_cores() if available is None else available
        if stored is None:
            stored = self.systems_settings().get(system_id, {})
        names = stored.get('cores')
        if names is None:
            return self.default_cores(system_id, available)
        compatible = describe(system_id)['cores']
        return sorted(names, key=lambda name: core_order(name, available, compatible))

    def candidate_cores(self, system_id, stored=None, available=None):
        """Core della console con il loro stato: ``[{name, label, installed, downloadable, extensions}]``.

        L'ordine è quello automatico (README §I). I core non disponibili
        restano in fondo con ``installed`` e ``downloadable`` falsi.
        """
        available = self.available_cores() if available is None else available
        result = []
        for name in self.system_cores(system_id, stored, available):
            core = available.get(name)
            result.append({
                'name': name,
                'label': core['label'] if core else name,
                'installed': bool(core and core['installed']),
                'downloadable': bool(core and core['downloadable']),
                'extensions': list(core['extensions']) if core else [],
            })
        return result

    def default_extensions(self, system_id, stored=None, available=None):
        """Estensioni predefinite: quelle del preset, altrimenti l'unione di quelle dei core della lista."""
        preset = describe(system_id)['extensions']
        if preset:
            return list(preset)
        result = []
        for core in self.candidate_cores(system_id, stored, available):
            for ext in core['extensions']:
                if ext not in result:
                    result.append(ext)
        return result

    def core_index(self):
        """Stato dell'elenco del buildbot: ``{count, fetchedAt, error}``."""
        fetched_at = self.cores.index_fetched_at() if self.cores is not None else None
        return {'count': len(self.buildbot_index()), 'fetchedAt': fetched_at, 'error': self.index_error}

    def refresh_core_index(self):
        """Scarica l'elenco dei core dal buildbot e lo salva; se fallisce resta quello precedente.

        Solleva ``ConfigError`` con un messaggio leggibile, che resta anche
        in ``core_index()['error']`` fino al prossimo tentativo riuscito.
        """
        if self.cores is None:
            raise ConfigError('Elenco dei core non disponibile.')
        url = self.get()['cores.buildbot_url']
        try:
            if self.opener is None:
                entries = buildbot.fetch_index(url)
            else:
                entries = buildbot.fetch_index(url, self.opener)
        except ConfigError as error:
            self.index_error = str(error)
            log.warning('%s', error)
            raise
        fetched_at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
        self.cores.replace_buildbot_index(entries, fetched_at)
        self.index_error = None
        log.info('Elenco dei core del buildbot: %d core', len(entries))
        return self.core_index()

    def resolve_path(self, key):
        """Percorso assoluto di un'impostazione ``paths.*``.

        ``~`` viene espanso; i percorsi relativi partono da ``base_dir``.
        Un valore vuoto restituisce ``''``.
        """
        if key not in PATH_KEYS:
            raise ConfigError('Impostazione di percorso sconosciuta: %s.' % key)
        return self.resolve_value(self.get()[key])

    def resolve_value(self, value):
        """Percorso assoluto per il valore ``value`` di un'impostazione ``paths.*``."""
        if not value:
            return ''
        path = os.path.expanduser(value)
        if not os.path.isabs(path):
            path = os.path.join(self.base_dir, path)
        return os.path.normpath(path)
