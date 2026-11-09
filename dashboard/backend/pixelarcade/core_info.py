"""Lettura e classificazione dei file ``.info`` dei core di RetroArch.

La regola di classificazione è quella di ``tipologie_core.md`` (sprint 04b):
ogni core diventa un emulatore di una o più console, un motore di gioco, un
gioco senza contenuto oppure viene escluso (test, lettori, utilità).
"""
import logging
import os
import re
import threading

log = logging.getLogger(__name__)

INFO_SUFFIX = '_libretro.info'
MAX_INFO_BYTES = 64 * 1024

GROUP_ARCADE = 'Arcade'
GROUP_ENGINES = 'Motori di gioco'
GROUP_OTHERS = 'Altri'

ARCADE = 'Arcade'
ARCADE_SYSTEMS = frozenset(('mame', 'fb_alpha', 'hbmame'))
# Tipologie dedicate per sistemi senza «Produttore - Console» utilizzabile.
SPECIAL_TYPES = {
    'daphne': 'Daphne - Laserdisc',
    'dice': 'DICE - Circuiti discreti',
}
EMULATOR_CATEGORIES = frozenset(('emulator', 'computer', 'launcher'))
ENGINE_CATEGORIES = frozenset(('game', 'game engine'))
# Dichiarano ``supports_no_game`` ma servono a eseguire contenuti.
FORCED_ENGINES = frozenset(('scummvm', 'vircon32'))

# Valore tra virgolette, oppure senza (``firmware_count = 5``).
LINE = re.compile(r'^\s*([A-Za-z0-9_]+)\s*=\s*(?:"(.*)"|([^"\s][^"]*?))\s*$')


def parse_info(text):
    """Coppie ``chiave = "valore"`` di un ``.info``; righe vuote, commenti ``#`` e righe diverse ignorate."""
    result = {}
    for line in text.splitlines():
        if line.lstrip().startswith('#'):
            continue
        match = LINE.match(line)
        if match:
            value = match.group(2) if match.group(2) is not None else match.group(3)
            result[match.group(1)] = value.strip()
    return result


def split_list(value, separator='|'):
    """Voci non vuote di un valore separato da ``separator``."""
    return [part.strip() for part in (value or '').split(separator) if part.strip()]


def is_true(value):
    return (value or '').strip().lower() == 'true'


# Nota con il checksum di un firmware: «(!) scph5501.bin (md5): 490f…».
FIRMWARE_MD5 = re.compile(r'^\(!\)\s*(.+?)\s*\(md5\)\s*:\s*([0-9A-Fa-f]{32})\s*$')
MAX_FIRMWARE = 64


def firmware(info):
    """File di sistema dichiarati: ``[{path, desc, optional, md5, folder}]``.

    ``path`` è relativo alla cartella di sistema di RetroArch; ``folder`` è
    vero per una cartella in cui va un file di nome qualsiasi (``pcsx2/bios``:
    la descrizione parla di «folder», oppure il percorso non ha estensione).
    ``md5`` viene dalle note, se c'è.
    """
    sums = {}
    for note in split_list(info.get('notes')):
        match = FIRMWARE_MD5.match(note)
        if match:
            sums[match.group(1).replace('\\', '/')] = match.group(2).lower()
    try:
        count = min(int(info.get('firmware_count') or 0), MAX_FIRMWARE)
    except ValueError:
        count = 0
    result = []
    for index in range(count):
        path = (info.get('firmware%d_path' % index) or '').replace('\\', '/').strip('/')
        if not path or '..' in path.split('/'):
            continue
        desc = info.get('firmware%d_desc' % index) or path
        result.append({
            'path': path,
            'desc': desc,
            'optional': is_true(info.get('firmware%d_opt' % index)),
            'md5': sums.get(path) or sums.get(path.rsplit('/', 1)[-1]),
            'folder': 'folder' in desc.lower() or '.' not in path.rsplit('/', 1)[-1],
        })
    return result


def console_types(info):
    """Tipologie di un emulatore secondo la regola di tipologie_core.md."""
    system_id = info.get('systemid', '').lower()
    if system_id in ARCADE_SYSTEMS and info.get('systemname') != 'Multi (various)':
        return [ARCADE]
    if system_id in SPECIAL_TYPES:
        return [SPECIAL_TYPES[system_id]]
    types = []
    for entry in split_list(info.get('database')):
        if ' - ' in entry and entry not in types:
            types.append(entry)
    if types:
        return types
    system_name = info.get('systemname', '')
    manufacturers = split_list(info.get('manufacturer'), '|')
    manufacturer = manufacturers[0].split('/')[0].strip() if manufacturers else ''
    if not system_name:
        return []
    if not manufacturer or manufacturer.lower() in ('various', 'n/a'):
        return [system_name]
    return ['%s - %s' % (manufacturer, system_name)]


def classify(info, name=''):
    """Classifica un core: ``{'kind': 'console'|'engine'|'nogame'|None, 'types': [...]}``.

    ``name`` è il nome breve del core (``fbneo``), usato per i motori
    aggiunti a mano (``scummvm``, ``vircon32``).
    """
    categories = {part.lower() for part in split_list(info.get('categories'), ',')}
    if categories & EMULATOR_CATEGORIES:
        types = console_types(info)
        return {'kind': 'console' if types else None, 'types': types}
    if categories & ENGINE_CATEGORIES:
        if is_true(info.get('supports_no_game')) and name not in FORCED_ENGINES:
            return {'kind': 'nogame', 'types': []}
        databases = split_list(info.get('database'))
        label = databases[0] if databases else info.get('display_name', '')
        return {'kind': 'engine', 'types': [label]} if label else {'kind': None, 'types': []}
    return {'kind': None, 'types': []}


def group_of(type_name, kind):
    """Gruppo del menu per una tipologia: Arcade, produttore, Altri o Motori di gioco."""
    if kind == 'engine':
        return GROUP_ENGINES
    if type_name == ARCADE:
        return GROUP_ARCADE
    if ' - ' in type_name:
        return type_name.split(' - ', 1)[0]
    return GROUP_OTHERS


def read_info(path):
    """Contenuto di un ``.info``, oppure ``None`` (con avviso) se troppo grande o non leggibile."""
    try:
        if os.path.getsize(path) > MAX_INFO_BYTES:
            log.warning('File .info troppo grande ignorato: %s', path)
            return None
        with open(path, encoding='utf-8', errors='replace') as stream:
            return stream.read(MAX_INFO_BYTES + 1)
    except OSError as error:
        log.warning('File .info non leggibile (%s): %s', path, error)
        return None


def load_catalog(cores_dir):
    """Core descritti dai ``.info`` di ``cores_dir``: ``{nome: {name, label, extensions, types, kind, firmware}}``."""
    result = {}
    try:
        entries = list(os.scandir(cores_dir))
    except OSError:
        return result
    for entry in entries:
        if (not entry.name.endswith(INFO_SUFFIX) or entry.name.startswith('.')
                or entry.is_symlink() or not entry.is_file()):
            continue
        name = entry.name[:-len(INFO_SUFFIX)]
        text = read_info(entry.path)
        if text is None:
            continue
        info = parse_info(text)
        if not info:
            log.warning('File .info senza voci valide ignorato: %s', entry.path)
            continue
        kind = classify(info, name)
        result[name] = {
            'name': name,
            'label': info.get('display_name') or name,
            'extensions': list(dict.fromkeys(ext.lower() for ext in split_list(info.get('supported_extensions'))
                                             if re.match(r'^[A-Za-z0-9]{1,10}$', ext))),
            'types': kind['types'],
            'kind': kind['kind'],
            'firmware': firmware(info),
        }
    return result


class CoreCatalog:
    """Catalogo dei core di una cartella, riletto solo quando cambia il ``mtime`` della cartella."""

    def __init__(self, cores_dir):
        self.cores_dir = cores_dir
        self.lock = threading.Lock()
        self.stamp = None
        self.data = {}

    def cores(self):
        """``{nome: {name, label, extensions, types, kind, firmware}}`` per ogni ``.info`` valido."""
        try:
            stamp = os.stat(self.cores_dir).st_mtime_ns
        except OSError:
            stamp = None
        with self.lock:
            if stamp is None:
                self.stamp, self.data = None, {}
            elif stamp != self.stamp:
                self.data = load_catalog(self.cores_dir)
                self.stamp = stamp
                log.info('Catalogo dei core: %d file .info in %s', len(self.data), self.cores_dir)
            return self.data

    def types(self, allowed=None):
        """Tipologie ``[{name, group, cores}]`` ordinate per gruppo e nome.

        Con ``allowed`` (insieme di nomi) restano solo quei core e si
        tolgono le tipologie rimaste senza core.
        """
        found = {}
        for core in self.cores().values():
            if core['kind'] not in ('console', 'engine'):
                continue
            if allowed is not None and core['name'] not in allowed:
                continue
            for type_name in core['types']:
                entry = found.setdefault(type_name, {
                    'name': type_name,
                    'group': group_of(type_name, core['kind']),
                    'cores': [],
                })
                entry['cores'].append(core['name'])
        order = {GROUP_ARCADE: 0, GROUP_OTHERS: 2, GROUP_ENGINES: 3}
        result = sorted(found.values(), key=lambda entry: (
            order.get(entry['group'], 1), entry['group'].casefold(), entry['name'].casefold()))
        for entry in result:
            entry['cores'].sort(key=str.casefold)
        return result
