"""Configurazione dei giochi per console e per gioco: opzioni di RetroArch e del core, in quattro sezioni.

Sezioni: Grafica, Latenza, Audio, Emulazione (``core_options.SECTIONS``). Le
opzioni del core sono quelle che il core dichiara (``core_options``); quelle di
RetroArch sono in ``RETROARCH_OPTIONS`` e si mostrano solo se la chiave è nel
``retroarch.cfg`` della console (verificato il 17 ottobre 2026: tutte presenti;
``gl``, ``glcore`` e ``vulkan`` funzionano sulla Radeon R7 della console).

**Grafica.** Ha i livelli già pronti (``LEVELS``): per le console con un core
che ridisegna i poligoni (``CORE_DETAIL``) *Originale*, *Migliorata* e
*Massima*, per le altre *Originale*, *Morbida* e *Smooth*. Un livello dà il
valore di ogni opzione grafica: quelle che non tocca hanno il valore
predefinito (del core, oppure quello del ``retroarch.cfg``). Cambiare
un'opzione grafica crea la **Personalizzata** dell'ambito (console o gioco),
che parte dai valori in uso; ce n'è una per ambito, e crearne una nuova
quando c'è già chiede conferma. Se la Personalizzata torna uguale a un
livello, sparisce e resta quel livello. Una Personalizzata è
``{base, retroarch: {chiave: valore}, cores: {core: {chiave: valore}}}``:
il livello di partenza più le differenze, per core.

**Latenza, Audio, Emulazione.** Opzioni singole senza livelli: un valore
scelto oppure quello ereditato (dalla console per un gioco, altrimenti il
predefinito).

**Avvio.** Le chiavi di RetroArch vanno nel file ``--appendconfig`` e lo
shader con ``--set-shader``; le opzioni del core nel suo ``.opt``
(``config/<library_name>/<library_name>.opt``, più quello del gioco se esiste).
Con l'elenco delle opzioni del core si scrivono tutte, così il file è uguale
a quello che mostra la pagina; senza, solo quelle dei livelli e quelle scelte.

**Margine per la TV.** Opzione della dashboard nella Grafica, solo per gioco
(``GAME_ONLY``): per le TV che tagliano i bordi dell'immagine. All'avvio
l'area dell'immagine si riduce della percentuale scelta su ogni lato, resta
nel formato del gioco e RetroArch la mette al centro dello schermo (``margin_viewport``): si
scrive come area personalizzata di RetroArch (``aspect_ratio_index = 23`` e
``custom_viewport_*``), con la scala intera spenta. La risoluzione dello
schermo viene da ``screen.screen_size``; se non si legge, il margine non si
applica. Non è una scelta della Personalizzata: cambiarlo non tocca il livello.
"""
import copy
import logging
import os

from .config import QUIT_COMBOS
from .core_options import AUDIO, EMULATION, GRAPHICS, LATENCY, SECTIONS
from .errors import ConfigError
from .fsutil import atomic_write_text
from .retroarch_cfg import DEFAULT_CONTROLLER, SYSTEM_DEVICES
from .screen import screen_size as read_screen_size

log = logging.getLogger(__name__)

RETROARCH = 'retroarch'
CORE = 'core'
# Opzioni della dashboard (non passano a RetroArch né al core).
DASHBOARD = 'dashboard'
SHADER = 'shader'

SECTION_LABELS = {GRAPHICS: 'Grafica', LATENCY: 'Latenza', AUDIO: 'Audio', EMULATION: 'Emulazione'}


def yes_no():
    return [('true', 'Sì'), ('false', 'No')]


def numbers(values, suffix=''):
    return [(str(value), '%s%s' % (value, suffix)) for value in values]


def ratios(values):
    return [('%.6f' % value, 'Senza limite' if value == 0 else '%gx' % value) for value in values]


# Opzioni di RetroArch per sezione: (chiave, nome, nota, valori). I valori sono quelli del ``retroarch.cfg``.
RETROARCH_OPTIONS = [
    (GRAPHICS, 'video_driver', 'Driver video', 'Gli shader cambiano formato con il driver',
     [('gl', 'OpenGL'), ('glcore', 'OpenGL Core'), ('vulkan', 'Vulkan')]),
    (GRAPHICS, SHADER, 'Shader', 'Effetto sull\'immagine finale', []),
    (GRAPHICS, 'video_smooth', 'Filtro bilineare', 'Ammorbidisce i pixel', yes_no()),
    (GRAPHICS, 'video_scale_integer', 'Scala intera', 'Pixel tutti uguali, con bordi neri', yes_no()),
    (GRAPHICS, 'aspect_ratio_index', 'Formato', None,
     [('22', 'Dal core'), ('0', '4:3'), ('1', '16:9'), ('11', '5:4'), ('21', 'Pixel quadrati'), ('24', 'Schermo intero')]),
    (GRAPHICS, 'video_crop_overscan', 'Taglia i bordi (overscan)', None, yes_no()),
    (GRAPHICS, 'video_rotation', 'Rotazione', None, [('0', '0°'), ('1', '90°'), ('2', '180°'), ('3', '270°')]),
    (GRAPHICS, 'video_allow_rotate', 'Rotazione chiesta dal core', 'Giochi arcade verticali', yes_no()),
    (GRAPHICS, 'video_vsync', 'Sincronia verticale (vsync)', 'Niente strappi nell\'immagine', yes_no()),
    (GRAPHICS, 'video_swap_interval', 'Intervallo del vsync', None, numbers(range(1, 5))),
    (LATENCY, 'run_ahead_enabled', 'Run-ahead', 'Riduce il ritardo dei comandi: pesa sulla CPU', yes_no()),
    (LATENCY, 'run_ahead_frames', 'Fotogrammi di run-ahead', None, numbers(range(1, 7))),
    (LATENCY, 'run_ahead_secondary_instance', 'Seconda istanza per il run-ahead', 'Evita difetti audio', yes_no()),
    (LATENCY, 'preemptive_frames_enable', 'Fotogrammi preventivi', 'Alternativa più leggera al run-ahead', yes_no()),
    (LATENCY, 'video_frame_delay', 'Ritardo dei fotogrammi', 'Millisecondi di attesa prima di disegnare',
     numbers(range(0, 16), ' ms')),
    (LATENCY, 'video_frame_delay_auto', 'Ritardo automatico', None, yes_no()),
    (LATENCY, 'video_hard_sync', 'Sincronia GPU forzata', None, yes_no()),
    (LATENCY, 'video_hard_sync_frames', 'Fotogrammi di sincronia GPU', None, numbers(range(0, 4))),
    (LATENCY, 'video_threaded', 'Video in un thread separato', 'Più fluido, ma più ritardo', yes_no()),
    (LATENCY, 'input_poll_type_behavior', 'Lettura dei comandi', None,
     [('0', 'Presto'), ('1', 'Normale'), ('2', 'Tardi')]),
    (AUDIO, 'audio_enable', 'Audio', None, yes_no()),
    (AUDIO, 'audio_mute_enable', 'Muto', None, yes_no()),
    (AUDIO, 'audio_volume', 'Volume', 'Rispetto al volume normale',
     [('%.6f' % value, '%+g dB' % value if value else '0 dB') for value in (-20, -12, -6, -3, 0, 3, 6)]),
    (AUDIO, 'audio_latency', 'Latenza audio', 'Più bassa = meno ritardo, ma rischio di scatti',
     numbers((32, 48, 64, 96, 128, 160), ' ms')),
    (AUDIO, 'audio_sync', 'Sincronia audio', None, yes_no()),
    (AUDIO, 'audio_resampler_quality', 'Qualità del ricampionamento', None,
     [('1', 'Minima'), ('2', 'Bassa'), ('3', 'Normale'), ('4', 'Alta'), ('5', 'Massima')]),
    (AUDIO, 'audio_fastforward_mute', 'Muto in avanti veloce', None, yes_no()),
    (EMULATION, 'rewind_enable', 'Riavvolgimento', 'Pesa su CPU e memoria', yes_no()),
    (EMULATION, 'rewind_granularity', 'Passo del riavvolgimento', 'Fotogrammi', numbers((1, 2, 4, 8, 16))),
    (EMULATION, 'fastforward_ratio', 'Avanti veloce', None, ratios((0, 2, 3, 4))),
    (EMULATION, 'slowmotion_ratio', 'Rallentatore', None, ratios((2, 3, 4))),
]

RETROARCH_BY_KEY = {key: (section, label, note, values) for section, key, label, note, values in RETROARCH_OPTIONS}

# Secondi tra due stati periodici (``rescue.PeriodicSaver``); «0» li disattiva.
PERIODIC_SAVE = 'periodic_save'
# Console con stati grandi (10–17 MB): il salvataggio fa uno scatto visibile, meglio più di rado.
SLOW_SAVE_SYSTEMS = frozenset(('ps2', 'n64'))

# Uscita dal gioco col joypad (``config.QUIT_COMBOS``); senza scelta vale l'impostazione ``input.quit_combo``.
QUIT_COMBO = 'quit_combo'
QUIT_COMBO_LABELS = {'hold_start': 'START tenuto 2 s', 'hold_select': 'SELECT tenuto 2 s', 'start_select': 'START+SELECT'}

# Margine per la TV (percentuale su ogni lato), solo per gioco: vedi il modulo.
TV_MARGIN = 'tv_margin'
TV_MARGIN_MAX = 10

# Opzioni della dashboard per sezione: (chiave, nome, nota, valori).
DASHBOARD_OPTIONS = [
    (GRAPHICS, TV_MARGIN, 'Margine per la TV',
     'Rimpicciolisce l\'immagine al centro dello schermo, per le TV che ne tagliano i bordi',
     [('0', 'Nessuno')] + [(str(value), '%d%% per lato' % value) for value in range(1, TV_MARGIN_MAX + 1)]),
    (EMULATION, PERIODIC_SAVE, 'Salvataggio periodico', 'Stati di soccorso se il gioco si blocca',
     [('0', 'Disattivato'), ('60', 'Ogni minuto'), ('120', 'Ogni 2 minuti'), ('180', 'Ogni 3 minuti'),
      ('300', 'Ogni 5 minuti'), ('600', 'Ogni 10 minuti')]),
    (EMULATION, QUIT_COMBO, 'Uscita dal gioco',
     'Come si chiude RetroArch per tornare alla libreria. START+SELECT in molti giochi PS1 è anche il reset',
     [(value, QUIT_COMBO_LABELS[value]) for value in QUIT_COMBOS]),
]
DASHBOARD_BY_KEY = {key: (section, label, note, values) for section, key, label, note, values in DASHBOARD_OPTIONS}
# Opzioni della dashboard che si scelgono solo per gioco: la pagina della console non le mostra.
GAME_ONLY = frozenset((TV_MARGIN,))

# Controller emulato scelto a mano dal menu «Altro» del gioco (``retroarch_cfg.SYSTEM_DEVICES``): sta
# tra le opzioni della dashboard del gioco ma non nella pagina «Configurazione».
CONTROLLER = 'controller'


def dashboard_default(system_id, key):
    """Valore predefinito di un'opzione della dashboard per la console."""
    if key == PERIODIC_SAVE:
        return '300' if system_id in SLOW_SAVE_SYSTEMS else '60'
    if key == TV_MARGIN:
        return '0'
    return None


# Rapporto larghezza/altezza dei valori di ``aspect_ratio_index`` offerti nella Grafica.
# «Dal core» e «Pixel quadrati» dipendono dal gioco, che all'avvio non si conosce: valgono 4:3,
# il formato di quasi tutte le console. «Schermo intero» usa tutta l'area rimasta.
ASPECT_RATIOS = {'0': 4 / 3, '1': 16 / 9, '11': 5 / 4}
FULL_ASPECT = '24'
CUSTOM_ASPECT = '23'


def margin_viewport(width, height, aspect_index, margin):
    """Chiavi di RetroArch dell'area ridotta di ``margin`` % per lato, nel formato del gioco e centrata.

    Il centro lo mette RetroArch: dalla 1.22 (``video_viewport_get_scaled_aspect``) l'area
    personalizzata si sposta di ``spazio libero × video_viewport_bias`` (0,5 = al centro) e
    ``custom_viewport_x``/``_y`` sono uno spostamento in più, quindi restano a 0.
    """
    area_width = width * (100 - 2 * margin) / 100
    area_height = height * (100 - 2 * margin) / 100
    ratio = area_width / area_height if aspect_index == FULL_ASPECT else ASPECT_RATIOS.get(aspect_index, 4 / 3)
    if area_width / area_height > ratio:
        view_height = round(area_height)
        view_width = round(area_height * ratio)
    else:
        view_width = round(area_width)
        view_height = round(area_width / ratio)
    return {
        'aspect_ratio_index': CUSTOM_ASPECT,
        'video_scale_integer': 'false',
        'custom_viewport_width': str(view_width),
        'custom_viewport_height': str(view_height),
        'custom_viewport_x': '0',
        'custom_viewport_y': '0',
    }
GRAPHICS_RETROARCH = [key for section, key, *_ in RETROARCH_OPTIONS if section == GRAPHICS]

# Shader del livello «Smooth», per famiglia di driver: cartella e preset.
SHADER_DIRS = {'gl': ('shaders_glsl', '.glslp'), 'glcore': ('shaders_slang', '.slangp'),
               'vulkan': ('shaders_slang', '.slangp')}
SMOOTH_SHADER = 'xbr/xbr-lv2'

# Predefiniti della dashboard diversi da quelli del core (nessuno per ora). Beetle col DualShock
# (``retroarch_cfg.SYSTEM_DEVICES``): il passaggio digitale/analogico resta spento, così il
# controller è sempre in analogico. Acceso, parte in digitale e Ape Escape (29 ottobre 2026)
# resta fermo finché non si preme L1+R1+SELECT. I giochi solo digitali hanno il pad digitale.
CORE_DEFAULTS = {}

# Dettaglio 3D dei core che ridisegnano i poligoni: livello → chiavi del ``.opt``.
# Valori letti dai core installati (17 ottobre 2026); ``mupen64plus-EnableNativeResFactor = 0``
# usa ``43screensize`` (640×480 sulla console).
CORE_DETAIL = {
    'mednafen_psx_hw': {
        'original': {
            'beetle_psx_hw_internal_resolution': '1x(native)',
            'beetle_psx_hw_pgxp_mode': 'disabled',
            'beetle_psx_hw_pgxp_texture': 'disabled',
            'beetle_psx_hw_filter': 'nearest',
            'beetle_psx_hw_depth': '16bpp(native)',
            'beetle_psx_hw_dither_mode': '1x(native)',
        },
        'enhanced': {
            'beetle_psx_hw_internal_resolution': '2x',
            'beetle_psx_hw_pgxp_mode': 'memory only',
            'beetle_psx_hw_pgxp_texture': 'enabled',
            'beetle_psx_hw_filter': 'bilinear',
            'beetle_psx_hw_depth': '32bpp',
            'beetle_psx_hw_dither_mode': 'disabled',
        },
        'max': {
            'beetle_psx_hw_internal_resolution': '4x',
            'beetle_psx_hw_pgxp_mode': 'memory only',
            'beetle_psx_hw_pgxp_texture': 'enabled',
            'beetle_psx_hw_filter': 'bilinear',
            'beetle_psx_hw_depth': '32bpp',
            'beetle_psx_hw_dither_mode': 'disabled',
        },
    },
    # Rendering software: lo calcola la CPU, quindi «Massima» resta a 2x.
    'mednafen_psx': {
        'original': {
            'beetle_psx_internal_resolution': '1x(native)',
            'beetle_psx_pgxp_mode': 'disabled',
            'beetle_psx_pgxp_texture': 'disabled',
            'beetle_psx_dither_mode': '1x(native)',
        },
        'enhanced': {
            'beetle_psx_internal_resolution': '2x',
            'beetle_psx_pgxp_mode': 'memory only',
            'beetle_psx_pgxp_texture': 'enabled',
            'beetle_psx_dither_mode': 'disabled',
        },
        'max': {
            'beetle_psx_internal_resolution': '2x',
            'beetle_psx_pgxp_mode': 'memory only',
            'beetle_psx_pgxp_texture': 'enabled',
            'beetle_psx_dither_mode': 'disabled',
        },
    },
    'pcsx_rearmed': {
        'original': {'pcsx_rearmed_dithering': 'enabled'},
        'enhanced': {'pcsx_rearmed_dithering': 'disabled'},
        'max': {'pcsx_rearmed_dithering': 'disabled'},
    },
    # Renderer ParaLLEl-RDP in tutti i livelli (con Vulkan, ``LEVEL_RETROARCH``): GLideN64 non disegna
    # il riquadro dell'oggetto di Mario Kart 64 in due giocatori, ParaLLEl-RDP sì (6 novembre 2026).
    'mupen64plus_next': {
        'original': {'mupen64plus-rdp-plugin': 'parallel', 'mupen64plus-EnableNativeResFactor': '0',
                     'mupen64plus-parallel-rdp-upscaling': '1x'},
        'enhanced': {'mupen64plus-rdp-plugin': 'parallel', 'mupen64plus-EnableNativeResFactor': '3',
                     'mupen64plus-parallel-rdp-upscaling': '2x'},
        'max': {'mupen64plus-rdp-plugin': 'parallel', 'mupen64plus-EnableNativeResFactor': '4',
                'mupen64plus-parallel-rdp-upscaling': '4x'},
    },
    # PS2: con la GPU integrata della console anche «Massima» resta a 2x.
    'play': {
        'original': {'play_res_multi': '1x'},
        'enhanced': {'play_res_multi': '2x'},
        'max': {'play_res_multi': '2x'},
    },
}
DETAIL_KEYS = {key for levels in CORE_DETAIL.values() for values in levels.values() for key in values}

# Chiavi di RetroArch di tutti i livelli di una console: ParaLLEl-RDP (``CORE_DETAIL``) va solo con Vulkan.
LEVEL_RETROARCH = {'n64': {'video_driver': 'vulkan'}}

# Livelli della Grafica: chiavi di RetroArch e dettaglio 3D. ``shader = smooth`` = ``SMOOTH_SHADER`` del driver.
LEVELS = {
    'original': {'label': 'Originale', 'note': 'Come la console originale', 'smooth': 'false', 'shader': False,
                 'detail': 'original'},
    'soft': {'label': 'Morbida', 'note': 'Filtro bilineare: pixel ammorbiditi', 'smooth': 'true', 'shader': False,
             'detail': 'original'},
    'smooth': {'label': 'Smooth', 'note': 'Shader xBR: bordi dei pixel arrotondati', 'smooth': 'true',
               'shader': True, 'detail': 'original'},
    'enhanced': {'label': 'Migliorata', 'note': 'Risoluzione 2x, poligoni stabili, filtro bilineare',
                 'smooth': 'true', 'shader': False, 'detail': 'enhanced'},
    'max': {'label': 'Massima', 'note': 'Come Migliorata, a risoluzione più alta: pesa di più', 'smooth': 'true',
            'shader': False, 'detail': 'max'},
}
LEVELS_2D = ('original', 'soft', 'smooth')
LEVELS_3D = ('original', 'enhanced', 'max')
CUSTOM = 'custom'
DEFAULT_LEVEL = 'original'

VALUE_LABELS = {'enabled': 'Attivo', 'disabled': 'Disattivo', 'true': 'Sì', 'false': 'No'}


def shader_family(driver):
    return SHADER_DIRS.get(driver, SHADER_DIRS['gl'])


def smooth_shader(driver):
    folder, ext = shader_family(driver)
    return '%s/%s%s' % (folder, SMOOTH_SHADER, ext)


def empty_options():
    return {RETROARCH: {}, 'cores': {}}


def custom_copy(custom):
    return {'base': custom['base'], RETROARCH: dict(custom.get(RETROARCH) or {}),
            'cores': {core: dict(values) for core, values in (custom.get('cores') or {}).items()}}


def opt_text(text, values):
    """Testo del ``.opt`` con ``values`` al posto delle righe esistenti; le chiavi mancanti vanno in fondo."""
    lines = text.splitlines()
    pending = dict(values)
    for index, line in enumerate(lines):
        key = line.split('=', 1)[0].strip()
        if '=' in line and key in pending:
            lines[index] = '%s = "%s"' % (key, pending.pop(key))
    lines += ['%s = "%s"' % (key, value) for key, value in pending.items()]
    return '\n'.join(lines) + '\n'


def write_opt(path, values):
    """Aggiorna ``values`` nel file ``path`` (creandolo se manca); falso se il file era già così.

    La prima volta lascia accanto una copia del file originale (``.bak-pixel-arcade``).
    """
    try:
        with open(path, encoding='utf-8', errors='replace') as stream:
            text = stream.read()
    except FileNotFoundError:
        text = None
    updated = opt_text(text or '', values)
    if text == updated:
        return False
    if text is not None:
        backup = path + '.bak-pixel-arcade'
        if not os.path.exists(backup):
            atomic_write_text(backup, text, mode=0o644)
    else:
        os.makedirs(os.path.dirname(path), exist_ok=True)
    atomic_write_text(path, updated, mode=0o644)
    return True


class Context:
    """Valori di partenza di una console con un core: predefiniti di RetroArch e del core, e opzioni del core."""

    def __init__(self, known, catalog, core, system_id=None):
        self.known = known
        self.core = core
        self.system_id = system_id
        self.catalog = catalog
        self.options = catalog['options'] if catalog else []
        self.by_key = {option['key']: option for option in self.options}

    def retroarch_default(self, key):
        return '' if key == SHADER else self.known.get(key, '')

    def core_default(self, key):
        option = self.by_key.get(key)
        if option is not None:
            return CORE_DEFAULTS.get(self.core, {}).get(key, option['default'])
        original = CORE_DETAIL.get(self.core, {}).get('original', {})
        return original.get(key)

    def section(self, key):
        """Sezione di un'opzione del core; le chiavi del dettaglio 3D sono sempre grafiche."""
        if key in DETAIL_KEYS:
            return GRAPHICS
        option = self.by_key.get(key)
        return option['section'] if option else GRAPHICS

    def graphics_core_keys(self):
        keys = [option['key'] for option in self.options if self.section(option['key']) == GRAPHICS]
        for key in CORE_DETAIL.get(self.core, {}).get('original', {}):
            if key not in keys:
                keys.append(key)
        return keys

    def level(self, level_id):
        """Valori grafici del livello: ``(retroarch, core)``."""
        level = LEVELS.get(level_id, LEVELS[DEFAULT_LEVEL])
        retroarch = {key: self.retroarch_default(key) for key in GRAPHICS_RETROARCH}
        retroarch['video_smooth'] = level['smooth']
        retroarch.update((key, value) for key, value in LEVEL_RETROARCH.get(self.system_id, {}).items()
                         if key in retroarch)
        if level['shader']:
            retroarch[SHADER] = smooth_shader(retroarch.get('video_driver') or 'gl')
        core = {key: self.core_default(key) for key in self.graphics_core_keys()}
        core.update(CORE_DETAIL.get(self.core, {}).get(level['detail'], {}))
        return retroarch, {key: value for key, value in core.items() if value is not None}

    def custom(self, custom):
        """Valori grafici della Personalizzata: il suo livello più le differenze per questo core."""
        retroarch, core = self.level(custom['base'])
        changes = custom.get(RETROARCH) or {}
        retroarch.update(changes)
        # Lo shader del livello segue il driver scelto, se la Personalizzata non ne indica un altro.
        if LEVELS.get(custom['base'], {}).get('shader') and SHADER not in changes:
            retroarch[SHADER] = smooth_shader(retroarch.get('video_driver') or 'gl')
        core.update((custom.get('cores') or {}).get(self.core, {}))
        return retroarch, core


class GameConfigService:
    """Configurazione per console e per gioco (vedi il modulo).

    ``repo`` è il ``GameConfigRepository``; ``config`` il ``ConfigService``;
    ``catalog`` il ``CoreOptionsCatalog``; ``library`` dà i giochi delle
    console (per leggere i core che dichiarano le opzioni solo con un gioco);
    ``library_name(core)`` il nome della cartella del core
    (``ControlsService.core_library``); ``known_keys()`` le chiavi del
    ``retroarch.cfg``; ``cores_repo`` il core associato ai giochi;
    ``now()`` la data ISO; ``screen_size()`` la risoluzione dello schermo
    (``screen.screen_size``) per il margine per la TV.
    """

    def __init__(self, repo, config, catalog, library, library_name, known_keys, cores_repo, now,
                 screen_size=read_screen_size):
        self.repo = repo
        self.config = config
        self.catalog = catalog
        self.library = library
        self.library_name = library_name
        self.known_keys = known_keys
        self.cores = cores_repo
        self.now = now
        self.screen_size = screen_size

    # --- Dati di base ----------------------------------------------------------

    def retroarch_dir(self):
        return os.path.dirname(os.path.normpath(self.config.resolve_path('paths.cores')))

    def rom_path(self, system_id, game):
        return os.path.join(self.config.resolve_path('paths.roms'), system_id, *game['id'].split('/'))

    def system_cores(self, system_id):
        return self.config.system_cores(system_id)

    def installed_cores(self, system_id):
        installed = set(self.config.installed_cores())
        return [core for core in self.system_cores(system_id) if core in installed]

    def family(self, system_id):
        """``3d`` se un core della console ha il dettaglio 3D, altrimenti ``2d``."""
        return '3d' if any(core in CORE_DETAIL for core in self.system_cores(system_id)) else '2d'

    def level_ids(self, system_id):
        return LEVELS_3D if self.family(system_id) == '3d' else LEVELS_2D

    def game_core(self, system_id, game_id):
        """Core del gioco: quello associato, altrimenti il primo installato della console."""
        association = self.cores.game_core(system_id, game_id) if game_id else None
        if association and association['status'] in ('ok', 'trial') and association['core']:
            return association['core']
        installed = self.installed_cores(system_id)
        return installed[0] if installed else None

    def sample_game(self, system_id, game_id):
        """Percorso del gioco con cui leggere le opzioni: quello indicato, altrimenti il primo della console."""
        games = self.library.games(system_id) or []
        game = next((entry for entry in games if entry['id'] == game_id), None) if game_id else None
        if game is None and games:
            game = games[0]
        return self.rom_path(system_id, game) if game else None

    def context(self, system_id, game_id, core, game_path=None):
        catalog = None
        if core:
            try:
                catalog = self.catalog.read(core, game_path or self.sample_game(system_id, game_id))
            except Exception:
                log.exception('Opzioni del core %s non lette.', core)
        return Context(self.known_keys(), catalog, core, system_id)

    def dashboard_default(self, system_id, key):
        """Valore predefinito di un'opzione della dashboard: per l'uscita quella delle Impostazioni."""
        if key == QUIT_COMBO:
            value = self.config.get().get('input.quit_combo')
            return value if value in QUIT_COMBOS else QUIT_COMBOS[0]
        return dashboard_default(system_id, key)

    def row(self, system_id, game_id):
        return self.repo.get(system_id, game_id or '') or {'mode': None, 'custom': None, 'options': empty_options()}

    # --- Grafica in uso ------------------------------------------------------------

    def known_level(self, system_id, mode):
        """``mode`` se è un livello della console, altrimenti ``original`` (livelli di un'altra famiglia)."""
        return mode if mode in self.level_ids(system_id) else DEFAULT_LEVEL

    def console_graphics(self, system_id):
        """``(modo, personalizzata)`` della console: un livello oppure ``custom`` con la sua Personalizzata."""
        row = self.row(system_id, None)
        if row['mode'] == CUSTOM:
            return (CUSTOM, row['custom']) if row['custom'] else (DEFAULT_LEVEL, None)
        return self.known_level(system_id, row['mode']), None

    def graphics_in_use(self, system_id, game_id):
        """``(modo, personalizzata, origine)``: quella del gioco se ne ha una, altrimenti quella della console."""
        if game_id:
            row = self.row(system_id, game_id)
            if row['mode'] == CUSTOM and row['custom']:
                return CUSTOM, row['custom'], 'game'
            if row['mode'] and row['mode'] != CUSTOM:
                return self.known_level(system_id, row['mode']), None, 'game'
        mode, custom = self.console_graphics(system_id)
        return mode, custom, 'console'

    @staticmethod
    def graphics_values(context, mode, custom):
        return context.custom(custom) if mode == CUSTOM else context.level(mode)

    def other_value(self, system_id, game_id, source, core, key, default):
        """Valore di un'opzione non grafica e origine: ``game``, ``console`` o ``default``."""
        scopes = ([('game', self.row(system_id, game_id))] if game_id else []) + [
            ('console', self.row(system_id, None))]
        for origin, row in scopes:
            options = row['options']
            if source == RETROARCH:
                values = options.get(RETROARCH, {})
            elif source == DASHBOARD:
                values = options.get(DASHBOARD, {})
            else:
                values = options.get('cores', {}).get(core, {})
            if key in values:
                return values[key], origin
        return default, 'default'

    # --- Pagina ----------------------------------------------------------------------

    def shader_values(self, driver):
        """Preset degli shader per il driver: ``[(percorso relativo, nome)]``, con «Nessuno» in testa."""
        folder, ext = shader_family(driver)
        root = os.path.join(self.retroarch_dir(), 'shaders')
        result = []
        for directory, _, files in os.walk(os.path.join(root, folder)):
            for name in files:
                if name.endswith(ext):
                    relative = os.path.relpath(os.path.join(directory, name), root).replace(os.sep, '/')
                    result.append((relative, relative[len(folder) + 1:-len(ext)]))
        result.sort(key=lambda item: item[1].casefold())
        return [('', 'Nessuno')] + result

    @staticmethod
    def value_list(values, current):
        items = [{'value': value, 'label': label or VALUE_LABELS.get(value, value)} for value, label in values]
        if current is not None and current not in [item['value'] for item in items]:
            items.insert(0, {'value': current, 'label': VALUE_LABELS.get(current, current)})
        return items

    def page(self, system_id, game_id=None, core=None):
        """Pagina «Configurazione» della console (``game_id = None``) o del gioco, per ``core``.

        ``{system, id, core, cores, family, levels, mode, custom, consoleMode,
        coreOptions, sections: [{id, label, options: [{source, key, label,
        info, group, values, value, origin}]}]}``. ``mode`` è il livello,
        ``custom`` o (per il gioco) ``None`` = come la console; ``custom`` è
        vero se l'ambito ha una Personalizzata salvata; ``origin`` di
        un'opzione è ``level``, ``custom`` (cambiata dalla Personalizzata),
        ``game``, ``console`` o ``default``.
        """
        if game_id:
            core = self.game_core(system_id, game_id)
        elif core not in self.installed_cores(system_id):
            core = self.game_core(system_id, None)
        context = self.context(system_id, game_id, core)
        mode, custom, origin = self.graphics_in_use(system_id, game_id)
        graphics_retroarch, graphics_core = self.graphics_values(context, mode, custom)
        base_retroarch, base_core = context.level(custom['base']) if mode == CUSTOM else ({}, {})
        own = self.row(system_id, game_id)
        console_mode, _ = self.console_graphics(system_id)

        def graphics_origin(value, base):
            """Origine di un valore grafico: la console (gioco che la segue), la Personalizzata se lo cambia, il livello."""
            if game_id and origin == 'console':
                return 'console'
            return CUSTOM if mode == CUSTOM and value != base else 'level'

        known = context.known
        sections = {section: [] for section in SECTIONS}
        for section, key, label, note, values in RETROARCH_OPTIONS:
            if key != SHADER and key not in known:
                continue
            if section == GRAPHICS:
                value = graphics_retroarch.get(key, context.retroarch_default(key))
                value_origin = graphics_origin(value, base_retroarch.get(key, value))
            else:
                value, value_origin = self.other_value(system_id, game_id, RETROARCH, None, key,
                                                       context.retroarch_default(key))
            if key == SHADER:
                values = self.shader_values(graphics_retroarch.get('video_driver') or 'gl')
            sections[section].append({'source': RETROARCH, 'key': key, 'label': label, 'info': note,
                                      'group': 'RetroArch', 'values': self.value_list(values, value),
                                      'value': value, 'origin': value_origin})
        for section, key, label, note, values in DASHBOARD_OPTIONS:
            if key in GAME_ONLY and not game_id:
                continue
            value, value_origin = self.other_value(system_id, game_id, DASHBOARD, None, key,
                                                   self.dashboard_default(system_id, key))
            sections[section].append({'source': DASHBOARD, 'key': key, 'label': label, 'info': note,
                                      'group': 'Pixel Arcade', 'values': self.value_list(values, value),
                                      'value': value, 'origin': value_origin})
        for option in context.options:
            key = option['key']
            section = context.section(key)
            if section == GRAPHICS:
                value = graphics_core.get(key, option['default'])
                value_origin = graphics_origin(value, base_core.get(key, value))
            else:
                value, value_origin = self.other_value(system_id, game_id, CORE, core, key, option['default'])
            values = [(item['value'], item['label']) for item in option['values']]
            sections[section].append({'source': CORE, 'key': key, 'label': option['label'], 'info': option['info'],
                                      'group': option['group'] or 'Core', 'values': self.value_list(values, value),
                                      'value': value, 'origin': value_origin})
        return {
            'system': system_id,
            'id': game_id,
            'core': core,
            'cores': self.installed_cores(system_id) if not game_id else [core] if core else [],
            'family': self.family(system_id),
            'levels': [{'id': level_id, 'label': LEVELS[level_id]['label'], 'note': LEVELS[level_id]['note']}
                       for level_id in self.level_ids(system_id)],
            'mode': (own['mode'] if own['mode'] in (None, CUSTOM) else self.known_level(system_id, own['mode']))
                    if game_id else mode,
            'custom': bool(own['custom']),
            'consoleMode': console_mode,
            'coreOptions': context.catalog is not None,
            'sections': [{'id': section, 'label': SECTION_LABELS[section], 'options': sections[section]}
                         for section in SECTIONS],
        }

    # --- Modifiche --------------------------------------------------------------------

    def check_value(self, context, source, key, value):
        """Sezione dell'opzione; ``ConfigError`` se l'opzione non c'è o il valore non è ammesso."""
        if source == RETROARCH:
            entry = RETROARCH_BY_KEY.get(key)
            if entry is None or (key != SHADER and key not in context.known):
                raise ConfigError('Opzione di RetroArch sconosciuta: %s.' % key)
            section, _, _, values = entry
            if value is None:
                return section
            if key == SHADER:
                # Un preset di una delle due famiglie: quella giusta per il driver si sceglie all'avvio.
                allowed = [item for item, _ in self.shader_values('vulkan' if value.endswith('.slangp') else 'gl')]
            else:
                allowed = [item for item, _ in values] + [context.retroarch_default(key)]
        elif source == DASHBOARD:
            entry = DASHBOARD_BY_KEY.get(key)
            if entry is None:
                raise ConfigError('Opzione sconosciuta: %s.' % key)
            section, _, _, values = entry
            if value is None:
                return section
            allowed = [item for item, _ in values]
        elif source == CORE:
            option = context.by_key.get(key)
            if option is None:
                raise ConfigError('Opzione del core sconosciuta: %s.' % key)
            section = context.section(key)
            if value is None:
                return section
            allowed = [item['value'] for item in option['values']]
        else:
            raise ConfigError('Opzione sconosciuta.')
        if not isinstance(value, str) or value not in allowed:
            raise ConfigError('Valore non ammesso per %s.' % key)
        return section

    def related_cores(self, system_id, core):
        cores = list(self.installed_cores(system_id))
        if core and core not in cores:
            cores.append(core)
        return cores

    def matching_level(self, system_id, game_id, custom, contexts):
        """Livello uguale alla Personalizzata (prima il suo livello di partenza), oppure ``None``."""
        candidates = [custom['base']] + [level for level in self.level_ids(system_id) if level != custom['base']]
        for level in candidates:
            if all(context.custom(custom) == context.level(level) for context in contexts):
                return level
        return None

    def normalize(self, custom, contexts):
        """Toglie le differenze uguali al livello di partenza."""
        result = custom_copy(custom)
        base_retroarch = contexts[0].level(custom['base'])[0] if contexts else {}
        for key in list(result[RETROARCH]):
            if result[RETROARCH][key] == base_retroarch.get(key):
                del result[RETROARCH][key]
        for context in contexts:
            values = result['cores'].get(context.core)
            if values is None:
                continue
            base_core = context.level(custom['base'])[1]
            for key in list(values):
                if values[key] == base_core.get(key):
                    del values[key]
            if not values:
                del result['cores'][context.core]
        return result

    def contexts(self, system_id, game_id, core):
        """Un contesto per ogni core installato della console (e per ``core``), per confrontare i livelli."""
        return [self.context(system_id, game_id, name) for name in self.related_cores(system_id, core)]

    def set_option(self, system_id, game_id, core, source, key, value, confirm=False):
        """Cambia (o con ``value = None`` riporta all'origine) un'opzione dell'ambito.

        Un valore uguale a quello ereditato (dalla console per un gioco,
        altrimenti il predefinito) non resta come scelta dell'ambito: l'opzione
        torna a seguire l'origine. Restituisce ``{confirm: testo}`` senza
        salvare se la modifica creerebbe una Personalizzata al posto di quella
        che c'è già e ``confirm`` è falso; altrimenti ``{saved: True}``.
        """
        scope = game_id or ''
        if source == DASHBOARD and key in GAME_ONLY and not game_id:
            raise ConfigError('Questa opzione si sceglie per gioco.')
        context = self.context(system_id, game_id, core)
        section = self.check_value(context, source, key, value)
        row = self.row(system_id, game_id)
        # Le opzioni della dashboard non fanno parte dei livelli, anche quelle della Grafica.
        if section != GRAPHICS or source == DASHBOARD:
            options = copy.deepcopy(row['options'])
            if source == RETROARCH:
                values = options[RETROARCH]
            elif source == DASHBOARD:
                values = options.setdefault(DASHBOARD, {})
            else:
                values = options['cores'].setdefault(core, {})
            if value is not None and value == self.inherited(system_id, game_id, context, source, core, key):
                value = None
            if value is None:
                values.pop(key, None)
            else:
                values[key] = value
            if source == CORE and not values:
                options['cores'].pop(core, None)
            if source == DASHBOARD and not values:
                options.pop(DASHBOARD, None)
            self.repo.set_options(system_id, scope, options, self.now())
            return {'saved': True}
        mode, custom, origin = self.graphics_in_use(system_id, game_id)
        own = origin == ('game' if game_id else 'console')
        if mode == CUSTOM and own:
            draft = custom_copy(custom)
        else:
            if row['custom'] and not confirm:
                return {'confirm': 'Sostituisce la configurazione personalizzata %s.'
                                   % ('di questo gioco' if game_id else 'della console')}
            draft = custom_copy(custom) if mode == CUSTOM else {'base': mode, RETROARCH: {}, 'cores': {}}
        if source == RETROARCH:
            if value is None:
                draft[RETROARCH].pop(key, None)
            else:
                draft[RETROARCH][key] = value
        else:
            values = draft['cores'].setdefault(core, {})
            if value is None:
                values.pop(key, None)
            else:
                values[key] = value
        contexts = self.contexts(system_id, game_id, core)
        draft = self.normalize(draft, contexts)
        level = self.matching_level(system_id, game_id, draft, contexts)
        console_mode, console_custom = self.console_graphics(system_id)
        if level is None:
            # Uguale alla Personalizzata della console: il gioco torna a seguire la console.
            follow = bool(game_id) and console_mode == CUSTOM and all(
                context.custom(draft) == context.custom(console_custom) for context in contexts)
            if follow:
                self.repo.set_graphics(system_id, scope, None, None, self.now())
            else:
                self.repo.set_graphics(system_id, scope, CUSTOM, draft, self.now())
        else:
            follow = game_id and console_mode == level
            self.repo.set_graphics(system_id, scope, None if follow else level, None, self.now())
        return {'saved': True}

    def inherited(self, system_id, game_id, context, source, core, key):
        """Valore che un'opzione non grafica avrebbe senza la scelta dell'ambito."""
        if source == DASHBOARD:
            default = self.dashboard_default(system_id, key)
        else:
            default = context.retroarch_default(key) if source == RETROARCH else context.core_default(key)
        if not game_id:
            return default
        return self.other_value(system_id, None, source, core, key, default)[0]

    def set_level(self, system_id, game_id, level):
        """Sceglie il livello dell'ambito (``custom`` se c'è la Personalizzata; per un gioco ``None`` = la console)."""
        row = self.row(system_id, game_id)
        if level == CUSTOM:
            if not row['custom']:
                raise ConfigError('Non c\'è una configurazione personalizzata.')
        elif level is None:
            if not game_id:
                raise ConfigError('La console deve avere un livello.')
        elif level not in self.level_ids(system_id):
            raise ConfigError('Livello grafico sconosciuto.')
        self.repo.set_graphics(system_id, game_id or '', level, row['custom'], self.now())

    def promote(self, system_id, game_id, confirm=False):
        """«Usa per tutta la console»: la Personalizzata del gioco diventa quella della console."""
        row = self.row(system_id, game_id)
        if not game_id or not row['custom']:
            raise ConfigError('Il gioco non ha una configurazione personalizzata.')
        console = self.row(system_id, None)
        if console['custom'] and console['custom'] != row['custom'] and not confirm:
            return {'confirm': 'Sostituisce la configurazione personalizzata della console.'}
        self.repo.set_graphics(system_id, '', CUSTOM, row['custom'], self.now())
        self.repo.set_graphics(system_id, game_id, None, None, self.now())
        return {'saved': True}

    # --- Avvio ------------------------------------------------------------------------

    def periodic_seconds(self, system_id, game_id):
        """Secondi tra due stati periodici del gioco (0 = disattivati): gioco, poi console, poi predefinito."""
        value, _ = self.other_value(system_id, game_id, DASHBOARD, None, PERIODIC_SAVE,
                                    dashboard_default(system_id, PERIODIC_SAVE))
        try:
            return max(0, int(value))
        except (TypeError, ValueError):
            return int(dashboard_default(system_id, PERIODIC_SAVE))

    def quit_combo(self, system_id, game_id):
        """Uscita dal gioco (``config.QUIT_COMBOS``): gioco, poi console, poi le Impostazioni."""
        value, _ = self.other_value(system_id, game_id, DASHBOARD, None, QUIT_COMBO,
                                    self.dashboard_default(system_id, QUIT_COMBO))
        return value if value in QUIT_COMBOS else self.dashboard_default(system_id, QUIT_COMBO)

    def tv_margin(self, system_id, game_id):
        """Margine per la TV del gioco, in percentuale per lato (0 = nessuno)."""
        if not game_id:
            return 0
        value = self.row(system_id, game_id)['options'].get(DASHBOARD, {}).get(TV_MARGIN)
        try:
            margin = int(value)
        except (TypeError, ValueError):
            return 0
        return margin if 0 < margin <= TV_MARGIN_MAX else 0

    def controller(self, system_id, game):
        """Controller emulato del gioco: ``{auto, choice, value, choices}``, ``None`` se la console non lo sceglie.

        ``auto`` è il campo ``controller`` dei metadati (``DEFAULT_CONTROLLER``
        se manca), ``choice`` la scelta a mano (``None`` = automatico),
        ``value`` quello che parte.
        """
        devices = SYSTEM_DEVICES.get(system_id)
        if not devices:
            return None
        auto = game.get('controller') if game.get('controller') in devices else DEFAULT_CONTROLLER
        choice = self.row(system_id, game['id'])['options'].get(DASHBOARD, {}).get(CONTROLLER)
        if choice not in devices:
            choice = None
        return {'auto': auto, 'choice': choice, 'value': choice or auto, 'choices': sorted(devices)}

    def set_controller(self, system_id, game, choice):
        """Sceglie a mano il controller del gioco; ``None`` o uguale ai metadati = automatico."""
        info = self.controller(system_id, game)
        if info is None:
            raise ConfigError('Questa console non ha la scelta del controller.')
        if choice is not None and choice not in info['choices']:
            raise ConfigError('Controller sconosciuto.')
        options = copy.deepcopy(self.row(system_id, game['id'])['options'])
        values = options.setdefault(DASHBOARD, {})
        if choice is None or choice == info['auto']:
            values.pop(CONTROLLER, None)
        else:
            values[CONTROLLER] = choice
        if not values:
            options.pop(DASHBOARD, None)
        self.repo.set_options(system_id, game['id'], options, self.now())
        return self.controller(system_id, game)

    def launch_options(self, system_id, game_id):
        """Chiavi di RetroArch del file ``--appendconfig`` e shader (percorso assoluto o ``None``)."""
        context = Context(self.known_keys(), None, None, system_id)
        mode, custom, _ = self.graphics_in_use(system_id, game_id)
        retroarch = dict(self.graphics_values(context, mode, custom)[0])
        for section, key, *_ in RETROARCH_OPTIONS:
            if section != GRAPHICS:
                value, origin = self.other_value(system_id, game_id, RETROARCH, None, key, None)
                if origin != 'default':
                    retroarch[key] = value
        margin = self.tv_margin(system_id, game_id)
        if margin:
            size = self.screen_size()
            if size:
                retroarch.update(margin_viewport(size[0], size[1], retroarch.get('aspect_ratio_index'), margin))
            else:
                log.warning('Margine per la TV di %s/%s non applicato: risoluzione sconosciuta.', system_id, game_id)
        shader = retroarch.pop(SHADER, '')
        path = None
        if shader:
            folder, ext = shader_family(retroarch.get('video_driver') or 'gl')
            candidate = os.path.join(self.retroarch_dir(), 'shaders', shader)
            if shader.startswith(folder + '/') and shader.endswith(ext) and os.path.isfile(candidate):
                path = candidate
            else:
                log.warning('Shader %s non adatto al driver o mancante: nessuno shader.', shader)
        return [(key, value) for key, value in retroarch.items() if value is not None and value != ''], path

    def core_launch_values(self, system_id, game_id, core, rom_path):
        """Chiavi del ``.opt`` per l'avvio: tutte quelle note del core, con i valori della pagina."""
        context = self.context(system_id, game_id, core, rom_path)
        mode, custom, _ = self.graphics_in_use(system_id, game_id)
        values = dict(self.graphics_values(context, mode, custom)[1])
        keys = [option['key'] for option in context.options]
        for scope in ([self.row(system_id, game_id)] if game_id else []) + [self.row(system_id, None)]:
            keys += [key for key in scope['options'].get('cores', {}).get(core, {}) if key not in keys]
        for key in keys:
            if context.section(key) == GRAPHICS and key in context.by_key:
                continue
            if key in values and key not in context.by_key:
                continue
            value, _ = self.other_value(system_id, game_id, CORE, core, key, context.core_default(key))
            if value is not None:
                values[key] = value
        return values

    def opt_paths(self, core, rom_path):
        """``.opt`` da aggiornare: quello del core e, se esiste già, quello del gioco.

        Con ``global_core_options`` acceso le opzioni stanno in un solo file
        (``core_options_path`` oppure ``retroarch-core-options.cfg``).
        """
        keys = self.known_keys()
        retroarch_dir = self.retroarch_dir()
        if keys.get('global_core_options') == 'true':
            return [keys.get('core_options_path') or os.path.join(retroarch_dir, 'retroarch-core-options.cfg')]
        name = self.library_name(core)
        folder = os.path.join(retroarch_dir, 'config', name)
        paths = [os.path.join(folder, name + '.opt')]
        if rom_path:
            game_opt = os.path.join(folder, os.path.splitext(os.path.basename(rom_path))[0] + '.opt')
            if os.path.isfile(game_opt):
                paths.append(game_opt)
        return paths

    def apply_core(self, system_id, game_id, core, rom_path):
        """Scrive nel ``.opt`` di ``core`` le opzioni del gioco; nulla se non ce ne sono."""
        values = self.core_launch_values(system_id, game_id, core, rom_path)
        if not values:
            return
        for path in self.opt_paths(core, rom_path):
            if write_opt(path, values):
                log.info('Opzioni di %s/%s con %s scritte in %s.', system_id, game_id, core, path)
