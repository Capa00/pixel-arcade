"""Opzioni dichiarate dai core: elenco completo, letto dal core in un processo a parte.

Misure del 17 ottobre 2026 sui 18 core della console (RetroArch 1.22.2):

- quasi tutti i core dichiarano le opzioni durante ``retro_set_environment``
  (``SET_CORE_OPTIONS_V2_INTL``, ``SET_CORE_OPTIONS_V2`` o ``SET_VARIABLES``);
- FCEUmm, FBNeo, MAME 2003, MAME 2003-Plus e Play! le dichiarano solo in
  ``retro_load_game``: serve un gioco, e le opzioni possono dipendere dal
  gioco (DIP switch di FBNeo);
- MAME 2003 e 2003-Plus vanno in crash caricando un gioco se il frontend non
  dà l'interfaccia di log; con ``GET_SYSTEM_DIRECTORY`` e
  ``GET_SAVE_DIRECTORY`` puntati a una cartella temporanea caricano;
- con ``GET_LANGUAGE`` = italiano i core tradotti danno nomi e valori in
  italiano (Beetle PSX HW: «Risoluzione GPU Interna», «1x (Nativo)»).

Il processo a parte protegge la dashboard da crash e blocchi del core: oltre
``PROBE_TIMEOUT`` secondi le opzioni risultano non disponibili. Il risultato
si conserva su file per core (più uno letto con un gioco, se il core ne ha bisogno) finché il
file del core non cambia. Le opzioni che cambiano da gioco a gioco (DIP switch)
non fanno parte dell'elenco.
"""
import json
import logging
import os
import re
import subprocess
import sys
import tempfile
import threading

from .fsutil import atomic_write_text

log = logging.getLogger(__name__)

PROBE_TIMEOUT = 30
CACHE_VERSION = 1

# Sezioni della pagina «Configurazione».
GRAPHICS = 'graphics'
LATENCY = 'latency'
AUDIO = 'audio'
EMULATION = 'emulation'
SECTIONS = (GRAPHICS, LATENCY, AUDIO, EMULATION)

PROBE_SCRIPT = r'''import ctypes, json, os, sys

NUM_VALUES = 128
ITALIAN = 5
CB = ctypes.CFUNCTYPE(ctypes.c_bool, ctypes.c_uint, ctypes.c_void_p)


class Value(ctypes.Structure):
    _fields_ = [('value', ctypes.c_char_p), ('label', ctypes.c_char_p)]


class DefV1(ctypes.Structure):
    _fields_ = [('key', ctypes.c_char_p), ('desc', ctypes.c_char_p), ('info', ctypes.c_char_p),
                ('values', Value * NUM_VALUES), ('default_value', ctypes.c_char_p)]


class IntlV1(ctypes.Structure):
    _fields_ = [('us', ctypes.POINTER(DefV1)), ('local', ctypes.POINTER(DefV1))]


class CatV2(ctypes.Structure):
    _fields_ = [('key', ctypes.c_char_p), ('desc', ctypes.c_char_p), ('info', ctypes.c_char_p)]


class DefV2(ctypes.Structure):
    _fields_ = [('key', ctypes.c_char_p), ('desc', ctypes.c_char_p), ('desc_categorized', ctypes.c_char_p),
                ('info', ctypes.c_char_p), ('info_categorized', ctypes.c_char_p), ('category_key', ctypes.c_char_p),
                ('values', Value * NUM_VALUES), ('default_value', ctypes.c_char_p)]


class OptsV2(ctypes.Structure):
    _fields_ = [('categories', ctypes.POINTER(CatV2)), ('definitions', ctypes.POINTER(DefV2))]


class IntlV2(ctypes.Structure):
    _fields_ = [('us', ctypes.POINTER(OptsV2)), ('local', ctypes.POINTER(OptsV2))]


class Var(ctypes.Structure):
    _fields_ = [('key', ctypes.c_char_p), ('value', ctypes.c_char_p)]


class GameInfo(ctypes.Structure):
    _fields_ = [('path', ctypes.c_char_p), ('data', ctypes.c_void_p), ('size', ctypes.c_size_t),
                ('meta', ctypes.c_char_p)]


class SystemInfo(ctypes.Structure):
    _fields_ = [('library_name', ctypes.c_char_p), ('library_version', ctypes.c_char_p),
                ('valid_extensions', ctypes.c_char_p), ('need_fullpath', ctypes.c_bool),
                ('block_extract', ctypes.c_bool)]


def text(raw):
    return raw.decode('utf-8', 'replace') if raw else None


def values_of(values):
    out = []
    for item in values:
        if not item.value:
            break
        out.append({'value': text(item.value), 'label': text(item.label)})
    return out


def read_v1(pointer):
    out = []
    index = 0
    while pointer and pointer[index].key:
        item = pointer[index]
        out.append({'key': text(item.key), 'label': text(item.desc), 'info': text(item.info), 'category': None,
                    'values': values_of(item.values), 'default': text(item.default_value)})
        index += 1
    return out


def read_v2(pointer):
    if not pointer:
        return [], []
    opts = pointer.contents
    cats = []
    index = 0
    while opts.categories and opts.categories[index].key:
        item = opts.categories[index]
        cats.append({'key': text(item.key), 'label': text(item.desc)})
        index += 1
    defs = []
    index = 0
    while opts.definitions and opts.definitions[index].key:
        item = opts.definitions[index]
        defs.append({'key': text(item.key), 'label': text(item.desc_categorized) or text(item.desc),
                     'info': text(item.info), 'category': text(item.category_key),
                     'values': values_of(item.values), 'default': text(item.default_value)})
        index += 1
    return cats, defs


def merge(us, local):
    by_key = {item['key']: item for item in local}
    for item in us:
        other = by_key.get(item['key'])
        if not other:
            continue
        for name in ('label', 'info'):
            if other.get(name):
                item[name] = other[name]
        labels = {value['value']: value['label'] for value in other['values'] if value['label']}
        for value in item['values']:
            if value['value'] in labels:
                value['label'] = labels[value['value']]
    return us


result = {'version': None, 'categories': [], 'options': [], 'needsGame': False}
DIRECTORY = ctypes.c_char_p(os.getcwd().encode())
LOG = ctypes.CFUNCTYPE(None, ctypes.c_int, ctypes.c_char_p)(lambda level, fmt: None)


@CB
def environment(cmd, data):
    cmd &= 0xFFFF
    if cmd == 52:  # GET_CORE_OPTIONS_VERSION
        ctypes.cast(data, ctypes.POINTER(ctypes.c_uint))[0] = 2
        return True
    if cmd == 39:  # GET_LANGUAGE
        ctypes.cast(data, ctypes.POINTER(ctypes.c_uint))[0] = ITALIAN
        return True
    if cmd in (9, 31):  # GET_SYSTEM_DIRECTORY, GET_SAVE_DIRECTORY
        ctypes.cast(data, ctypes.POINTER(ctypes.c_char_p))[0] = DIRECTORY
        return True
    if cmd == 27:  # GET_LOG_INTERFACE
        ctypes.cast(data, ctypes.POINTER(ctypes.c_void_p))[0] = ctypes.cast(LOG, ctypes.c_void_p).value
        return True
    if cmd == 10:  # SET_PIXEL_FORMAT
        return True
    if cmd == 67:  # SET_CORE_OPTIONS_V2
        cats, defs = read_v2(ctypes.cast(data, ctypes.POINTER(OptsV2)))
        result.update(version=2, categories=cats, options=defs)
        return True
    if cmd == 68:  # SET_CORE_OPTIONS_V2_INTL
        intl = ctypes.cast(data, ctypes.POINTER(IntlV2)).contents
        cats, defs = read_v2(intl.us)
        local_cats, local_defs = read_v2(intl.local)
        labels = {cat['key']: cat['label'] for cat in local_cats if cat['label']}
        for cat in cats:
            cat['label'] = labels.get(cat['key'], cat['label'])
        result.update(version=2, categories=cats, options=merge(defs, local_defs))
        return True
    if cmd == 53:  # SET_CORE_OPTIONS
        result.update(version=1, options=read_v1(ctypes.cast(data, ctypes.POINTER(DefV1))))
        return True
    if cmd == 54:  # SET_CORE_OPTIONS_INTL
        intl = ctypes.cast(data, ctypes.POINTER(IntlV1)).contents
        result.update(version=1, options=merge(read_v1(intl.us), read_v1(intl.local)))
        return True
    if cmd == 16:  # SET_VARIABLES
        pointer = ctypes.cast(data, ctypes.POINTER(Var))
        options = []
        index = 0
        while pointer[index].key:
            desc, _, rest = (text(pointer[index].value) or '').partition('; ')
            values = [{'value': value, 'label': None} for value in rest.split('|') if value]
            options.append({'key': text(pointer[index].key), 'label': desc, 'info': None, 'category': None,
                            'values': values, 'default': values[0]['value'] if values else None})
            index += 1
        result.update(version=0, options=options)
        return True
    return False


VIDEO = ctypes.CFUNCTYPE(None, ctypes.c_void_p, ctypes.c_uint, ctypes.c_uint, ctypes.c_size_t)(lambda *a: None)
SAMPLE = ctypes.CFUNCTYPE(None, ctypes.c_int16, ctypes.c_int16)(lambda *a: None)
BATCH = ctypes.CFUNCTYPE(ctypes.c_size_t, ctypes.c_void_p, ctypes.c_size_t)(lambda data, frames: frames)
POLL = ctypes.CFUNCTYPE(None)(lambda: None)
STATE = ctypes.CFUNCTYPE(ctypes.c_int16, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint)(lambda *a: 0)

core = ctypes.CDLL(sys.argv[1])
core.retro_set_environment(environment)
if not result['options']:
    core.retro_set_video_refresh(VIDEO)
    core.retro_set_audio_sample(SAMPLE)
    core.retro_set_audio_sample_batch(BATCH)
    core.retro_set_input_poll(POLL)
    core.retro_set_input_state(STATE)
    core.retro_init()
if not result['options']:
    result['needsGame'] = True
    if len(sys.argv) > 2:
        info = SystemInfo()
        core.retro_get_system_info(ctypes.byref(info))
        game = GameInfo(sys.argv[2].encode(), None, 0, None)
        keep = None
        if not info.need_fullpath:
            with open(sys.argv[2], 'rb') as stream:
                keep = stream.read()
            game.data = ctypes.cast(ctypes.c_char_p(keep), ctypes.c_void_p)
            game.size = len(keep)
        core.retro_load_game.restype = ctypes.c_bool
        core.retro_load_game(ctypes.byref(game))
sys.stdout.write(json.dumps(result))
sys.stdout.flush()
os._exit(0)
'''


def probe(core_path, game_path=None, run=subprocess.run):
    """Opzioni del core ``core_path`` (con ``game_path`` se le dichiara solo con un gioco), oppure ``None``.

    Il risultato è ``{version, categories: [{key, label}], options: [{key,
    label, info, category, values: [{value, label}], default}], needsGame}``.
    Il processo gira in una cartella temporanea, che fa da cartella di
    sistema e dei salvataggi del core.
    """
    args = [sys.executable, '-I', '-c', PROBE_SCRIPT, core_path] + ([game_path] if game_path else [])
    try:
        with tempfile.TemporaryDirectory(prefix='pixel-arcade-core-') as directory:
            result = run(args, cwd=directory, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=PROBE_TIMEOUT)
    except (OSError, subprocess.SubprocessError) as error:
        log.warning('Opzioni del core %s non lette: %s', core_path, error)
        return None
    if result.returncode != 0:
        log.warning('Opzioni del core %s non lette (codice %s): %s', core_path, result.returncode,
                    result.stderr.decode('utf-8', 'replace').strip()[-300:])
        return None
    try:
        data = json.loads(result.stdout.decode('utf-8', 'replace'))
    except ValueError:
        log.warning('Opzioni del core %s non lette: risposta non valida.', core_path)
        return None
    return clean(data) if isinstance(data, dict) else None


def clean(data):
    """Risultato del processo con i soli campi attesi, senza opzioni senza chiave né valori."""
    categories = [{'key': item.get('key'), 'label': item.get('label') or item.get('key')}
                  for item in data.get('categories') or [] if isinstance(item, dict) and item.get('key')]
    options = []
    seen = set()
    for item in data.get('options') or []:
        if not isinstance(item, dict) or not item.get('key') or item['key'] in seen:
            continue
        values = [{'value': value['value'], 'label': value.get('label')}
                  for value in item.get('values') or [] if isinstance(value, dict) and value.get('value')]
        if not values:
            continue
        seen.add(item['key'])
        default = item.get('default')
        if default not in [value['value'] for value in values]:
            default = values[0]['value']
        options.append({'key': item['key'], 'label': item.get('label') or item['key'], 'info': item.get('info'),
                        'category': item.get('category'), 'values': values, 'default': default})
    return {'version': data.get('version'), 'categories': categories, 'options': options,
            'needsGame': bool(data.get('needsGame'))}


# --- Sezioni ----------------------------------------------------------------

# Parole delle categorie e delle opzioni: la categoria del core conta per prima.
GRAPHICS_WORDS = ('video', 'gfx', 'graphic', 'gpu', 'render', 'pgxp', 'gliden64', 'parallel_rdp', 'angrylion',
                  'osd', 'display', 'screen', 'shader', 'texture', 'artwork', 'vector')
AUDIO_WORDS = ('audio', 'sound', 'channel_volume')
OPTION_GRAPHICS = re.compile(
    r'video|aspect|overscan|crop|palette|colou?r|resolution|render|filter|blend|ntsc|mode7|hires|hi_res|dither|'
    r'lcd|ghost|mix_frames|scale_|texture|pgxp|widescreen|gamma|brightness|contrast|border|scanline|interlac|msaa|'
    r'fxaa|anisotrop|shader|sprite|(?<!p)layer|transparen|gfx|gpu|upscal|frame_?dup|deflicker|blur|sharp|bilinear|'
    r'native_?res|rdp|vi_', re.IGNORECASE)
OPTION_AUDIO = re.compile(
    r'audio|sound|volume|sample|reverb|echo|spu|cdda|music|channel|apu|psg|fm_|ym2|sn76|dac|resampl|stereo|mono|'
    r'surround|sfx|mixer|snd|suono|sonor', re.IGNORECASE)
# Opzioni che somigliano a quelle grafiche o audio ma riguardano l'emulazione (overclock, pistole ottiche).
OPTION_EMULATION = re.compile(r'overclock|dynarec|cpu|cycles|crosshair|gun|cursor|superscope|justifier|rifle|'
                              r'bios|region|memcard', re.IGNORECASE)
# Opzioni diverse per ogni gioco (DIP switch di FBNeo): non si mostrano, restano quelle del menu di RetroArch.
GAME_OPTION = re.compile(r'dipswitch|debug-dip', re.IGNORECASE)


def category_section(category):
    """Sezione di una categoria del core (``{key, label}``), oppure ``None`` se non si capisce."""
    text = ('%s %s' % (category.get('key') or '', category.get('label') or '')).lower()
    audio = any(word in text for word in AUDIO_WORDS)
    graphics = any(word in text for word in GRAPHICS_WORDS)
    if audio != graphics:
        return AUDIO if audio else GRAPHICS
    return None


def option_section(option, categories):
    """Sezione di un'opzione: quella della sua categoria, altrimenti da chiave e nome; il resto è Emulazione.

    Una categoria con parole sia audio sia video (snes9x: «Advanced
    Audio/Video Settings») non decide: conta l'opzione.
    """
    category = categories.get(option.get('category'))
    if category is not None:
        section = category_section(category)
        if section is not None:
            return section
    text = '%s %s' % (option['key'], option.get('label') or '')
    if OPTION_EMULATION.search(text):
        return EMULATION
    if OPTION_AUDIO.search(text):
        return AUDIO
    if OPTION_GRAPHICS.search(text):
        return GRAPHICS
    return EMULATION


def sectioned(data):
    """Opzioni con ``section`` e ``group`` (nome della categoria, oppure ``None``), senza quelle dei singoli giochi."""
    categories = {item['key']: item for item in data['categories']}
    result = []
    for option in data['options']:
        if GAME_OPTION.search(option['key']):
            continue
        category = categories.get(option.get('category'))
        result.append(dict(option, section=option_section(option, categories),
                           group=category['label'] if category else None))
    return result


# --- Cache --------------------------------------------------------------------

def file_mark(path):
    """``[mtime_ns, size]`` del file, oppure ``None`` se non esiste."""
    try:
        stat = os.stat(path)
    except OSError:
        return None
    return [stat.st_mtime_ns, stat.st_size]


class CoreOptionsCatalog:
    """Opzioni dei core, lette con ``probe`` e conservate in ``cache_dir`` finché il core non cambia.

    ``cores_dir()`` dà la cartella dei core; ``probe`` è sostituibile nei test.
    Le letture fallite si ricordano per il file del core attuale, così un core
    che va in crash non si riprova a ogni apertura della pagina.
    """

    def __init__(self, cache_dir, cores_dir, probe=probe):
        self.cache_dir = cache_dir
        self.cores_dir = cores_dir
        self.probe = probe
        self.lock = threading.Lock()
        self.memory = {}

    def core_path(self, core):
        return os.path.join(self.cores_dir(), core + '_libretro.so')

    def cache_path(self, core, game_path):
        """File della cache: uno per core, più uno letto con un gioco (vale per tutti i giochi del core)."""
        return os.path.join(self.cache_dir, core + ('@game' if game_path else '') + '.json')

    def load(self, path, mark):
        cached = self.memory.get(path)
        if cached is None:
            try:
                with open(path, encoding='utf-8') as stream:
                    cached = json.load(stream)
            except (OSError, ValueError):
                return None
        if not isinstance(cached, dict) or cached.get('version') != CACHE_VERSION or cached.get('mark') != mark:
            return None
        self.memory[path] = cached
        return cached

    def store(self, path, mark, data):
        entry = {'version': CACHE_VERSION, 'mark': mark, 'data': data}
        self.memory[path] = entry
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            atomic_write_text(path, json.dumps(entry, ensure_ascii=False), mode=0o644)
        except OSError as error:
            log.warning('Cache delle opzioni non scritta (%s): %s', path, error)
        return entry

    def read(self, core, game_path=None):
        """Opzioni del core (``probe`` + ``sections``), oppure ``None`` se non si leggono.

        Se il core dichiara le opzioni solo con un gioco, si rilegge con
        ``game_path`` (senza gioco il risultato è ``None``).
        """
        path = self.core_path(core)
        mark = file_mark(path)
        if mark is None:
            return None
        with self.lock:
            base = self.cached(core, None, mark)
            if base is not None and base['data'] and base['data']['needsGame']:
                if not game_path:
                    return None
                base = self.cached(core, game_path, mark)
            data = base['data'] if base else None
        options = sectioned(data) if data else []
        return dict(data, options=options) if options else None

    def cached(self, core, game_path, mark):
        cache = self.cache_path(core, game_path)
        entry = self.load(cache, mark)
        if entry is None:
            data = self.probe(self.core_path(core), game_path)
            entry = self.store(cache, mark, data)
        return entry

    def forget(self, core):
        """Dimentica le opzioni lette di ``core``: si rileggono alla prossima richiesta (per esempio dopo un BIOS nuovo)."""
        with self.lock:
            for game_path in (None, True):
                cache = self.cache_path(core, game_path)
                self.memory.pop(cache, None)
                try:
                    os.unlink(cache)
                except FileNotFoundError:
                    pass
                except OSError as error:
                    log.warning('Cache delle opzioni non cancellata (%s): %s', cache, error)
