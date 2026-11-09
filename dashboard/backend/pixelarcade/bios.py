"""BIOS e altri file di sistema dei core: elenco, controllo, scelta di un file qualsiasi e copia.

I file vanno nella cartella di sistema di RetroArch (``system_directory`` del
``retroarch.cfg``). Con ``systemfiles_in_content_dir`` acceso RetroArch dà ai
core la cartella del gioco (log della console, 17 ottobre 2026): per questo a
ogni avvio la dashboard impone la cartella di sistema (``retroarch_options``).

Tre fonti dicono quali file servono a un core:

- il suo ``.info`` (``core_info.firmware``): nome, se è obbligatorio e, a
  volte, il checksum MD5; ``pcsx2/bios`` è una cartella con un file di nome
  qualsiasi;
- le sue opzioni, quando un'opzione che parla di BIOS ha per valori dei nomi
  di file (senza checksum);
- i file aggiunti a mano, per qualunque core: la dashboard non sa se servono.

``EXTRA_FIRMWARE`` aggiunge i file che un core usa ma che il suo ``.info`` non
nomina; si mostrano come quelli del ``.info``.

Il file scelto si copia (mai spostato) con il nome atteso; se il checksum non
è quello dichiarato si copia lo stesso, con un avviso. Si possono togliere
solo i file copiati dalla dashboard (``BiosRepository``).
"""
import hashlib
import logging
import os
import re
import time

from .errors import ConfigError, ConflictError
from .fsutil import atomic_copy

log = logging.getLogger(__name__)

INFO = 'info'
OPTION = 'option'
MANUAL = 'manual'
# File in una cartella dichiarata (``pcsx2/bios/ps2.bin``).
FOLDER_FILE = 'folderFile'

OK = 'ok'
PRESENT = 'present'
DIFFERENT = 'different'
MISSING = 'missing'

# Un BIOS è piccolo: oltre questa misura il file non si copia.
MAX_FILE_BYTES = 512 * 1024 * 1024
MAX_ENTRIES = 3000
MAX_NAME = 128
MAX_FOLDERS = 200
# Per quanti secondi vale la cartella di sistema letta dal ``retroarch.cfg`` (una pagina la usa per ogni riga).
SYSTEM_DIR_SECONDS = 2
# Opzioni del core che parlano di BIOS, e loro valori che sono nomi di file.
OPTION_WORDS = re.compile(r'bios|firmware|boot ?rom|startup rom|rom di avvio', re.IGNORECASE)
FILE_VALUE = re.compile(r'^[\w\-. ()\[\]]+(/[\w\-. ()\[\]]+)*\.[A-Za-z0-9]{2,4}$')
# File che servono a un core ma che il suo ``.info`` non nomina, nel formato di
# ``core_info.firmware``. ``with`` è il file con cui va in coppia: i due vengono
# dalla stessa versione del core, quindi scelto uno si copia anche l'altro se
# è nella stessa cartella. PPSSPP legge da ``ppge_atlas.meta`` dove sono i
# caratteri di ``ppge_atlas.zim``: senza, le finestre di sistema della PSP
# restano senza testo (log della console, 19 ottobre 2026).
EXTRA_FIRMWARE = {
    'ppsspp': [
        {'path': 'PPSSPP/ppge_atlas.meta', 'desc': 'ppge_atlas.meta (Caratteri di ppge_atlas.zim, stessa versione)',
         'optional': False, 'md5': None, 'folder': False, 'with': 'PPSSPP/ppge_atlas.zim'},
    ],
}


def md5_file(path):
    digest = hashlib.md5()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def safe_part(name):
    """Vero per un nome di file o di cartella senza separatori, non vuoto e non ``.``/``..``."""
    return (isinstance(name, str) and 0 < len(name) <= MAX_NAME and name not in ('.', '..')
            and '/' not in name and '\\' not in name and '\0' not in name and name.strip() == name)


def relative_path(folder, name):
    """``cartella/nome`` relativo alla cartella di sistema; ``ConfigError`` se un pezzo non è valido."""
    parts = [part for part in (folder or '').split('/') if part] + [name]
    if not all(safe_part(part) for part in parts):
        raise ConfigError('Nome o cartella non validi.')
    return '/'.join(parts)


def describe(desc, path):
    """Nota di un file del ``.info``: la descrizione senza il nome del file («PS1 US BIOS»)."""
    match = re.match(r'^\s*%s\s*\((.*)\)\s*$' % re.escape(path.rsplit('/', 1)[-1]), desc or '')
    if match:
        return match.group(1)
    return '' if desc == path else desc


def roots(roms_dir, home=None, user=None):
    """Punti di partenza del selettore dei file: ``[{id, label, path}]``, solo quelli che esistono."""
    home = home or os.path.expanduser('~')
    user = user or os.path.basename(home)
    candidates = [
        ('home', 'Cartella personale', home),
        ('media', 'Dischi esterni', os.path.join('/media', user)),
        ('runmedia', 'Dischi esterni', os.path.join('/run/media', user)),
        ('games', 'Giochi', roms_dir),
        ('root', 'Tutto il disco', '/'),
    ]
    result = []
    for root_id, label, path in candidates:
        if path and os.path.isdir(path) and path not in [entry['path'] for entry in result]:
            result.append({'id': root_id, 'label': label, 'path': path})
    return result


def browse(path, hidden=False):
    """Contenuto di una cartella per il selettore: ``{path, parent, entries, hidden, truncated}``.

    ``entries`` = ``[{name, path, dir, size}]``, prima le cartelle, poi i file,
    in ordine alfabetico. Senza ``hidden`` i nomi che iniziano con il punto si
    contano soltanto. Solo lettura; ``ConfigError`` se la cartella non si apre.
    """
    if not isinstance(path, str) or not os.path.isabs(path):
        raise ConfigError('Cartella non valida.')
    path = os.path.normpath(path)
    try:
        items = list(os.scandir(path))
    except OSError:
        raise ConfigError('Cartella non leggibile: %s.' % path)
    entries = []
    skipped = 0
    for item in items:
        if item.name.startswith('.') and not hidden:
            skipped += 1
            continue
        try:
            is_dir = item.is_dir()
            size = None if is_dir else item.stat().st_size
            if not is_dir and not item.is_file():
                continue
        except OSError:
            continue
        entries.append({'name': item.name, 'path': os.path.join(path, item.name), 'dir': is_dir, 'size': size})
    entries.sort(key=lambda entry: (not entry['dir'], entry['name'].casefold(), entry['name']))
    parent = os.path.dirname(path)
    return {
        'path': path,
        'parent': parent if parent != path else None,
        'entries': entries[:MAX_ENTRIES],
        'hidden': skipped,
        'truncated': len(entries) > MAX_ENTRIES,
    }


class BiosService:
    """BIOS dei core delle console (vedi il modulo).

    ``repo`` è il ``BiosRepository``; ``config`` il ``ConfigService`` (core
    delle console, catalogo dei ``.info``, cartelle); ``known_keys()`` le
    chiavi del ``retroarch.cfg``; ``core_options(system_id, core)`` le opzioni
    del core (``[]`` se non si leggono); ``forget(core)`` dimentica le opzioni
    lette del core, che con un BIOS nuovo possono cambiare; ``busy()`` è vero
    durante una partita; ``now()`` la data ISO.
    """

    def __init__(self, repo, config, known_keys, core_options, forget, busy, now):
        self.repo = repo
        self.config = config
        self.known_keys = known_keys
        self.core_options = core_options
        self.forget = forget
        self.busy = busy
        self.now = now
        self.sums = {}
        self.read_at = None
        self.read_dir = None

    # --- Cartella di sistema ---------------------------------------------------

    def retroarch_dir(self):
        return os.path.dirname(os.path.normpath(self.config.resolve_path('paths.cores')))

    def system_dir(self):
        """Cartella di sistema di RetroArch, assoluta.

        ``~`` è la cartella personale di RetroArch: per la snap quella che
        contiene ``.config/retroarch`` (``~/snap/retroarch/common``).
        """
        now = time.monotonic()
        if self.read_at is None or now - self.read_at > SYSTEM_DIR_SECONDS:
            self.read_dir = self.read_system_dir()
            self.read_at = now
        return self.read_dir

    def read_system_dir(self):
        retroarch_dir = self.retroarch_dir()
        value = (self.known_keys().get('system_directory') or '').strip()
        if not value or value == 'default':
            return os.path.join(retroarch_dir, 'system')
        if value.startswith('~'):
            tail = os.sep + os.path.join('.config', 'retroarch')
            home = retroarch_dir[:-len(tail)] if retroarch_dir.endswith(tail) else os.path.expanduser('~')
            return os.path.normpath(home + value[1:])
        if not os.path.isabs(value):
            return os.path.normpath(os.path.join(retroarch_dir, value.lstrip(':/')))
        return os.path.normpath(value)

    def retroarch_options(self):
        """Chiavi del file ``--appendconfig``: i core cercano i BIOS nella cartella di sistema, non in quella del gioco."""
        return [('system_directory', self.system_dir()), ('systemfiles_in_content_dir', 'false')]

    def full_path(self, relative):
        base = self.system_dir()
        path = os.path.normpath(os.path.join(base, relative))
        if os.path.commonpath([base, path]) != base or path == base:
            raise ConfigError('Percorso fuori dalla cartella dei BIOS.')
        return path

    def folders(self):
        """Sottocartelle della cartella di sistema (due livelli), per scegliere dove mettere un BIOS aggiunto a mano."""
        base = self.system_dir()
        result = []
        for directory, names, _ in os.walk(base):
            names[:] = sorted((name for name in names if not name.startswith('.')), key=str.casefold)
            relative = os.path.relpath(directory, base)
            if relative != '.':
                result.append(relative.replace(os.sep, '/'))
            if relative.count(os.sep) >= 1 and relative != '.':
                names[:] = []
            if len(result) >= MAX_FOLDERS:
                break
        return result

    # --- Stato dei file -----------------------------------------------------------

    def checksum(self, path):
        """MD5 di ``path``, ricordato finché il file non cambia; ``None`` se non si legge."""
        try:
            stat = os.stat(path)
            mark = (stat.st_mtime_ns, stat.st_size)
            cached = self.sums.get(path)
            if cached and cached[0] == mark:
                return cached[1]
            value = md5_file(path)
        except OSError:
            return None
        self.sums[path] = (mark, value)
        return value

    def file_status(self, relative, md5=None):
        path = self.full_path(relative)
        if not os.path.isfile(path):
            return MISSING
        if not md5:
            return PRESENT
        return OK if self.checksum(path) == md5 else DIFFERENT

    def folder_files(self, relative):
        """File (non nascosti) della cartella dichiarata ``relative``."""
        try:
            items = sorted(os.scandir(self.full_path(relative)), key=lambda item: item.name.casefold())
        except OSError:
            return []
        return [item.name for item in items if not item.name.startswith('.') and item.is_file()]

    def core_info(self, core):
        return self.config.catalog().cores().get(core)

    def firmware(self, core):
        """File del ``.info`` di ``core`` più quelli di ``EXTRA_FIRMWARE`` che il ``.info`` non nomina."""
        declared = list((self.core_info(core) or {}).get('firmware') or [])
        paths = {entry['path'] for entry in declared}
        return declared + [entry for entry in EXTRA_FIRMWARE.get(core, []) if entry['path'] not in paths]

    def partners(self, core, relative):
        """File che vanno in coppia con ``relative`` (``with`` di ``EXTRA_FIRMWARE``), nei due versi."""
        result = []
        for entry in EXTRA_FIRMWARE.get(core, []):
            if entry.get('with') == relative:
                result.append(entry['path'])
            elif entry['path'] == relative and entry.get('with'):
                result.append(entry['with'])
        return result

    def option_files(self, system_id, core, declared, folder=None):
        """File indicati dalle opzioni del core che parlano di BIOS: ``[(percorso, nome dell'opzione)]``.

        Con ``folder`` (la cartella dichiarata dal ``.info``) un valore senza
        ``/`` è un file di quella cartella: per esempio ``pcsx2_bios`` dà i nomi
        dei file in ``pcsx2/bios``.
        """
        try:
            options = self.core_options(system_id, core) or []
        except Exception:
            log.exception('Opzioni di %s non lette per i BIOS.', core)
            return []
        result = []
        for option in options:
            if not OPTION_WORDS.search('%s %s' % (option.get('key', ''), option.get('label') or '')):
                continue
            for item in option.get('values') or []:
                value = (item.get('value') or '').strip('/')
                if folder and FILE_VALUE.match(value) and '/' not in value:
                    value = '%s/%s' % (folder, value)
                if (FILE_VALUE.match(value) and '..' not in value.split('/') and value not in declared
                        and value not in [path for path, _ in result]):
                    result.append((value, option.get('label') or option.get('key')))
        return result

    def core_files(self, system_id, core, tracked=None, installed=None):
        """File di sistema di ``core``: ``[{id, source, path, name, note, required, status, folder, removable}]``."""
        tracked = self.repo.all() if tracked is None else tracked
        installed = set(self.config.installed_cores()) if installed is None else installed
        rows = []
        declared = set()
        folders = []

        def row(source, path, note, required=False, status=None, folder=False, md5=None):
            rows.append({
                'id': '%s:%s' % (source, path),
                'source': source,
                'path': path,
                'name': path.rsplit('/', 1)[-1],
                'note': note,
                'required': required,
                'status': status or self.file_status(path, md5),
                'folder': folder,
                'removable': path in tracked and os.path.isfile(self.full_path(path)),
            })

        for entry in self.firmware(core):
            path = entry['path']
            declared.add(path)
            note = describe(entry['desc'], path)
            if entry['folder']:
                folders.append(path)
                files = self.folder_files(path)
                row(INFO, path, note or 'Cartella: il file può avere qualsiasi nome', not entry['optional'],
                    PRESENT if files else MISSING, True)
                for name in files:
                    inner = '%s/%s' % (path, name)
                    declared.add(inner)
                    row(FOLDER_FILE, inner, 'Nella cartella %s' % path)
            else:
                row(INFO, path, note, not entry['optional'], md5=entry['md5'])
        if core in installed:
            for path, label in self.option_files(system_id, core, declared,
                                                 folders[0] if len(folders) == 1 else None):
                declared.add(path)
                row(OPTION, path, 'Indicato dall\'opzione «%s»' % label)
        for path, entry in tracked.items():
            if entry['core'] == core and entry['kind'] == MANUAL and path not in declared:
                row(MANUAL, path, 'Aggiunto a mano: la dashboard non sa se serve')
        return rows

    def system_cores(self, system_id):
        """Core della console con un ``.info`` (gli altri non dicono nulla dei loro file)."""
        cores = self.config.catalog().cores()
        return [core for core in self.config.system_cores(system_id) if core in cores]

    def page(self, system_id):
        """Pagina «BIOS» della console: ``{system, systemDir, folders, cores: [{core, label, installed, files}]}``."""
        tracked = self.repo.all()
        installed = set(self.config.installed_cores())
        cores = []
        for core in self.system_cores(system_id):
            info = self.core_info(core) or {}
            cores.append({'core': core, 'label': info.get('label') or core, 'installed': core in installed,
                          'files': self.core_files(system_id, core, tracked, installed)})
        return {'system': system_id, 'systemDir': self.system_dir(), 'folders': self.folders(), 'cores': cores}

    def missing_required(self, core):
        """File obbligatori del ``.info`` di ``core`` che mancano (solo esistenza, senza checksum)."""
        result = []
        for entry in self.firmware(core):
            if entry['optional']:
                continue
            if entry['folder']:
                present = bool(self.folder_files(entry['path']))
            else:
                present = os.path.isfile(self.full_path(entry['path']))
            if not present:
                result.append(entry['path'])
        return result

    def different_files(self, core):
        """File del ``.info`` di ``core`` presenti ma con un checksum diverso da quello dichiarato."""
        result = []
        for entry in self.firmware(core):
            if not entry['folder'] and entry['md5'] and self.file_status(entry['path'], entry['md5']) == DIFFERENT:
                result.append(entry['path'])
        return result

    def summary(self, system_id, core):
        """Riga «BIOS» della pagina «Configurazione»: ``{status, label}``."""
        if not core:
            return {'status': 'none', 'label': 'Nessun core'}
        files = [row for row in self.core_files(system_id, core) if row['source'] != FOLDER_FILE]
        if not files:
            return {'status': 'none', 'label': 'Non richiesto'}
        if any(row['required'] and row['status'] == MISSING for row in files):
            return {'status': MISSING, 'label': 'Manca un file obbligatorio'}
        present = sum(1 for row in files if row['status'] != MISSING)
        if present == len(files):
            return {'status': OK, 'label': 'Tutti presenti'}
        return {'status': PRESENT, 'label': '%d di %d presenti' % (present, len(files))}

    # --- Copia e rimozione --------------------------------------------------------

    def check_core(self, system_id, core):
        if not isinstance(core, str) or core not in self.system_cores(system_id):
            raise ConfigError('Core non trovato in questa console.')

    def target(self, system_id, core, target, source, folder, name):
        """``(percorso relativo, tipo, md5 atteso)`` di destinazione per il file ``source``."""
        if target == MANUAL:
            return relative_path(folder, name or os.path.basename(source)), MANUAL, None
        rows = {row['id']: row for row in self.core_files(system_id, core)}
        row = rows.get(target)
        if row is None or row['source'] not in (INFO, OPTION):
            raise ConfigError('File di sistema non trovato per questo core.')
        if row['folder']:
            return relative_path(row['path'], name or os.path.basename(source)), INFO, None
        md5 = None
        if row['source'] == INFO:
            entry = next(item for item in self.firmware(core) if item['path'] == row['path'])
            md5 = entry['md5']
        return row['path'], row['source'], md5

    def import_file(self, system_id, core, target, source, folder=None, name=None, confirm=False):
        """Copia ``source`` nella cartella di sistema come file ``target`` (``info:…``, ``option:…`` o ``manual``).

        Restituisce ``{confirm: testo}`` senza copiare se il file c'è già e
        ``confirm`` è falso, altrimenti ``{saved, path, warning}``: ``warning``
        se il checksum non è quello dichiarato (il file si copia comunque) o se
        manca accanto a ``source`` il file che va in coppia (``copy_partner``).
        """
        if self.busy():
            raise ConflictError('Non si possono cambiare i BIOS durante una partita.')
        self.check_core(system_id, core)
        if not isinstance(source, str) or not os.path.isabs(source) or not os.path.isfile(source):
            raise ConfigError('File da copiare non trovato.')
        size = os.path.getsize(source)
        if size > MAX_FILE_BYTES:
            raise ConfigError('File troppo grande per essere un BIOS.')
        relative, kind, expected = self.target(system_id, core, target, source, folder, name)
        path = self.full_path(relative)
        if os.path.exists(path):
            if os.path.isdir(path):
                raise ConfigError('Nella cartella dei BIOS c\'è già una cartella con questo nome.')
            if os.path.samefile(source, path):
                return {'saved': True, 'path': relative, 'warning': None}
            if not confirm:
                return {'confirm': 'C\'è già %s nella cartella dei BIOS. Sostituirlo?' % relative}
        try:
            md5 = md5_file(source)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            atomic_copy(source, path, mode=0o644)
        except OSError as error:
            raise ConfigError('Copia non riuscita: %s.' % (error.strerror or error))
        self.repo.add(relative, core, kind, os.path.basename(source), md5, size, self.now())
        self.forget(core)
        log.info('BIOS %s copiato per %s da %s.', relative, core, source)
        warnings = []
        if expected and md5 != expected:
            warnings.append('%s copiato, ma non è la versione attesa dal core: i giochi possono non partire o '
                            'bloccarsi a metà, con lo schermo nero. Se succede, prova senza questo file.' % relative)
        for partner in self.partners(core, relative):
            warning = self.copy_partner(core, source, partner)
            if warning:
                warnings.append(warning)
        return {'saved': True, 'path': relative, 'warning': ' '.join(warnings) or None}

    def copy_partner(self, core, source, partner):
        """Copia ``partner`` dalla cartella di ``source``; restituisce l'avviso se non c'è o non si copia.

        Sostituisce senza chiedere quello già presente: i due file devono venire
        dalla stessa versione, e la sostituzione del primo è già stata confermata.
        """
        name = partner.rsplit('/', 1)[-1]
        found = os.path.join(os.path.dirname(source), name)
        if not os.path.isfile(found):
            return ('Accanto a %s non c\'è %s, che serve insieme e deve venire dalla stessa versione: '
                    'sceglilo dalla sua riga, anche da un\'altra cartella.' % (os.path.basename(source), name))
        path = self.full_path(partner)
        if os.path.isdir(path):
            return '%s non copiato: nella cartella dei BIOS c\'è una cartella con questo nome.' % partner
        if os.path.exists(path) and os.path.samefile(found, path):
            return None
        size = os.path.getsize(found)
        if size > MAX_FILE_BYTES:
            return '%s non copiato: file troppo grande per essere un BIOS.' % partner
        try:
            md5 = md5_file(found)
            atomic_copy(found, path, mode=0o644)
        except OSError as error:
            return '%s non copiato: %s.' % (partner, error.strerror or error)
        self.repo.add(partner, core, INFO, name, md5, size, self.now())
        log.info('BIOS %s copiato per %s da %s, insieme al suo file in coppia.', partner, core, found)
        return None

    def remove(self, system_id, core, relative):
        """Toglie dalla cartella di sistema un file copiato dalla dashboard."""
        if self.busy():
            raise ConflictError('Non si possono cambiare i BIOS durante una partita.')
        self.check_core(system_id, core)
        if not isinstance(relative, str) or relative not in self.repo.all():
            raise ConfigError('Si possono togliere solo i file aggiunti dalla dashboard.')
        try:
            os.unlink(self.full_path(relative))
        except FileNotFoundError:
            pass
        except OSError as error:
            raise ConfigError('File non tolto: %s.' % (error.strerror or error))
        self.repo.delete(relative)
        self.forget(core)
        log.info('BIOS %s tolto (%s).', relative, core)
