"""Metadati dei giochi (``metadata/<preset>.json``) e abbinamento ai file della libreria.

Ogni file ``metadata/<preset>.json`` è ``{"games": [...]}``. Ogni gioco ha
``id`` (unico tra tutte le console) e ``title``; se noti, ``region``,
``languages``, ``developer``, ``publisher``, ``year``, ``genre`` (lista),
``players`` (testo, per esempio «1–2»), ``description``, ``plot``,
``serial``, ``kind`` (tipo: ``original``, ``hack``, ``translation``…),
``controller`` (PS1: ``dualshock`` o ``digital``, ``retroarch_cfg.SYSTEM_DEVICES``),
``thumbnail`` e ``thumbnailSystem`` (nome e cartella su libretro-thumbnails),
``hashes`` (``{crc32, md5}`` del file che la libreria mostra come gioco) e
``keys`` (nomi normalizzati, vedi ``normalize``).

Un file della libreria si abbina a un gioco:

1. per checksum: CRC32 o MD5 del file (di una playlist ``.m3u``, quello del
   primo file che elenca);
2. se il checksum non trova nulla, per nome normalizzato, solo se un solo
   gioco ha quella chiave.

I checksum si calcolano in un thread, una volta sola per file, e restano
nella cache ``<data_dir>/hashes.json`` con chiave percorso, dimensione e data
di modifica: la libreria compare subito e i metadati arrivano quando i
checksum sono pronti (``GameInfo.annotate`` dice quanti ne mancano).
"""
import hashlib
import json
import logging
import os
import re
import threading
import time
import unicodedata
import zlib

log = logging.getLogger(__name__)

METADATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'metadata')

# Campi dei metadati copiati nei giochi della libreria.
FIELDS = ('title', 'region', 'languages', 'developer', 'publisher', 'year', 'genre', 'players',
          'description', 'plot', 'serial', 'kind', 'controller')
ALGORITHMS = ('crc32', 'md5')

# File più grandi di così si abbinano solo per nome: nessun gioco dei metadati li supera.
MAX_HASH_SIZE = 128 * 1024 * 1024
CHUNK = 1024 * 1024
# Intervallo minimo tra due salvataggi della cache dei checksum mentre il thread lavora.
SAVE_INTERVAL = 5.0
CACHE_FILE = 'hashes.json'
CACHE_VERSION = 1


def normalize(text):
    """Chiave di confronto dei nomi: ASCII minuscolo, ``&`` → ``and``, senza ``(...)``, ``[...]``
    e senza tutto ciò che non è lettera o cifra (``Tom & Jerry (Europe)`` → ``tomandjerry``)."""
    text = unicodedata.normalize('NFKD', text or '').encode('ascii', 'ignore').decode('ascii').casefold()
    text = re.sub(r'\([^)]*\)|\[[^\]]*\]', ' ', text).replace('&', ' and ')
    return re.sub(r'[^a-z0-9]', '', text)


def file_key(name):
    """Chiave del nome del file ``name``, senza estensione."""
    return normalize(os.path.splitext(name)[0])


def entry_error(entry):
    """Motivo per cui ``entry`` non è un gioco valido dei metadati, o ``None``."""
    if not isinstance(entry, dict):
        return 'non è un oggetto'
    if not isinstance(entry.get('id'), str) or not entry['id']:
        return 'id mancante'
    if not isinstance(entry.get('title'), str) or not entry['title']:
        return 'titolo mancante'
    if not isinstance(entry.get('hashes', {}), dict) or not isinstance(entry.get('keys', []), list):
        return 'hashes o keys non validi'
    return None


def read_metadata(path):
    """Giochi validi del file ``path``, nell'ordine del file. Un file che manca dà un elenco
    vuoto; uno illeggibile o una voce non valida lasciano un avviso nel log."""
    try:
        with open(path, encoding='utf-8') as stream:
            data = json.load(stream)
    except FileNotFoundError:
        return []
    except (OSError, ValueError) as error:
        log.warning('Metadati %s illeggibili: %s', path, error)
        return []
    entries = data.get('games') if isinstance(data, dict) else None
    if not isinstance(entries, list):
        log.warning('Metadati %s senza l\'elenco "games".', path)
        return []
    result = []
    seen = set()
    for index, entry in enumerate(entries):
        reason = entry_error(entry)
        if not reason and entry['id'] in seen:
            reason = 'id %r ripetuto' % entry['id']
        if reason:
            log.warning('Gioco n. %d dei metadati %s saltato: %s', index + 1, os.path.basename(path), reason)
            continue
        seen.add(entry['id'])
        result.append(entry)
    return result


class Index:
    """Giochi dei metadati di una console, cercabili per id, checksum e chiave del nome."""

    def __init__(self, entries):
        self.entries = list(entries)
        self.by_id = {}
        self.by_hash = {}
        self.by_key = {}
        for entry in self.entries:
            self.by_id[entry['id']] = entry
            for algorithm in ALGORITHMS:
                value = entry.get('hashes', {}).get(algorithm)
                if isinstance(value, str) and value:
                    self.by_hash.setdefault((algorithm, value.lower()), entry)
            for key in entry.get('keys', []):
                if isinstance(key, str) and key:
                    self.by_key.setdefault(key, []).append(entry)

    def __len__(self):
        return len(self.entries)

    def match(self, hashes, key):
        """``(gioco, 'hash' | 'name')`` per un file con checksum ``hashes`` e chiave ``key``, o ``(None, None)``.

        Il nome vale solo se il checksum non trova nulla e un solo gioco ha quella chiave.
        """
        for algorithm in ALGORITHMS:
            value = (hashes or {}).get(algorithm)
            if value and (algorithm, value.lower()) in self.by_hash:
                return self.by_hash[(algorithm, value.lower())], 'hash'
        candidates = self.by_key.get(key, [])
        if len(candidates) == 1:
            return candidates[0], 'name'
        return None, None


def playlist_target(path):
    """Primo file elencato dalla playlist ``.m3u`` ``path`` (percorso assoluto), o ``None``."""
    try:
        with open(path, encoding='utf-8', errors='replace') as stream:
            lines = [line.strip() for line in stream.read(64 * 1024).splitlines()]
    except OSError:
        return None
    for line in lines:
        if line and not line.startswith('#'):
            return os.path.normpath(os.path.join(os.path.dirname(path), line))
    return None


def file_hashes(path):
    """``{crc32, md5}`` del file ``path`` (di una playlist, del primo file che elenca).

    Un file oltre ``MAX_HASH_SIZE`` dà ``{}``. Un file illeggibile solleva ``OSError``.
    """
    if path.lower().endswith('.m3u'):
        target = playlist_target(path)
        if target is None:
            return {}
        path = target
    if os.path.getsize(path) > MAX_HASH_SIZE:
        return {}
    crc = 0
    md5 = hashlib.md5()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(CHUNK), b''):
            crc = zlib.crc32(block, crc)
            md5.update(block)
    return {'crc32': '%08x' % crc, 'md5': md5.hexdigest()}


class HashCache:
    """Checksum dei file per ``(percorso, dimensione, data di modifica)``, calcolati in un thread.

    ``path`` è il file della cache (``None``: solo in memoria). ``request``
    mette in coda i file che mancano; il thread li calcola a gruppi, prima il
    gruppo chiesto per ultimo con ``first``, e salva la cache al massimo ogni
    ``SAVE_INTERVAL`` secondi e alla fine della coda.
    """

    def __init__(self, path=None, hasher=file_hashes):
        self.path = path
        self.hasher = hasher
        self._files = self._load()
        self._queue = {}
        self._order = []
        self._lock = threading.Lock()
        self._thread = None
        self._dirty = False
        self._saved_at = 0.0
        self._stopped = False

    def _load(self):
        if not self.path:
            return {}
        try:
            with open(self.path, encoding='utf-8') as stream:
                data = json.load(stream)
        except FileNotFoundError:
            return {}
        except (OSError, ValueError) as error:
            log.warning('Cache dei checksum illeggibile (%s): riparto da zero.', error)
            return {}
        files = data.get('files') if isinstance(data, dict) and data.get('version') == CACHE_VERSION else None
        return files if isinstance(files, dict) else {}

    def get(self, path, size, mtime):
        """Checksum del file (``{}`` se non si calcolano), o ``None`` se non sono ancora noti."""
        with self._lock:
            item = self._files.get(path)
        if isinstance(item, list) and len(item) == 3 and item[0] == size and item[1] == mtime:
            return item[2]
        return None

    def put(self, path, size, mtime, hashes):
        with self._lock:
            self._files[path] = [size, mtime, dict(hashes)]
            self._dirty = True

    def remember(self, path, hashes):
        """Registra i checksum già noti del file ``path`` (per esempio appena verificati), così non si rilegge."""
        try:
            stat = os.stat(path)
        except OSError:
            return
        self.put(path, stat.st_size, stat.st_mtime_ns, {key: value.lower() for key, value in hashes.items()
                                                         if key in ALGORITHMS and value})
        self.save()

    def request(self, group, files, first=False):
        """Mette in coda i file ``[(percorso, dimensione, data)]`` di ``group`` che non hanno checksum.

        Restituisce quanti file di ``group`` sono ancora da calcolare.
        """
        missing = [item for item in files if self.get(*item) is None]
        with self._lock:
            if self._stopped:
                return 0
            if missing:
                self._queue[group] = missing
                if group in self._order:
                    self._order.remove(group)
                self._order.insert(0 if first else len(self._order), group)
            else:
                self._queue.pop(group, None)
                if group in self._order:
                    self._order.remove(group)
            if missing and (self._thread is None or not self._thread.is_alive()):
                self._thread = threading.Thread(target=self._run, name='game-hashes', daemon=True)
                self._thread.start()
        return len(missing)

    def _next(self):
        with self._lock:
            while self._order and not self._stopped:
                group = self._order[0]
                items = self._queue.get(group)
                if items:
                    return items.pop(0)
                self._queue.pop(group, None)
                self._order.pop(0)
            return None

    def _run(self):
        while True:
            item = self._next()
            if item is None:
                break
            path, size, mtime = item
            if self.get(path, size, mtime) is not None:
                continue
            try:
                hashes = self.hasher(path)
            except OSError as error:
                log.warning('Checksum di %s non calcolato: %s', path, error)
                hashes = {}
            self.put(path, size, mtime, hashes)
            if time.monotonic() - self._saved_at >= SAVE_INTERVAL:
                self.save()
        self.save()

    def save(self):
        """Scrive la cache se è cambiata (prima ``.tmp``, poi ``os.replace``); un errore lascia l'avviso nel log."""
        with self._lock:
            if not self.path or not self._dirty:
                return
            data = json.dumps({'version': CACHE_VERSION, 'files': self._files}, ensure_ascii=False)
            self._dirty = False
            self._saved_at = time.monotonic()
        tmp = self.path + '.tmp'
        try:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            with open(tmp, 'w', encoding='utf-8') as stream:
                stream.write(data)
            os.replace(tmp, self.path)
        except OSError as error:
            log.warning('Cache dei checksum non salvata (%s): %s', self.path, error)

    def join(self, timeout=None):
        """Aspetta la fine della coda (per i test)."""
        thread = self._thread
        if thread is not None:
            thread.join(timeout)

    def stop(self, timeout=2):
        """Ferma il thread dopo il file in corso e salva la cache."""
        with self._lock:
            self._stopped = True
            self._queue.clear()
            self._order.clear()
        self.join(timeout)
        self.save()


class GameInfo:
    """Metadati di ogni console, letti una volta sola, e checksum dei file della libreria.

    ``data_dir`` ospita la cache dei checksum (``None``: solo in memoria);
    ``metadata_dir`` e ``hasher`` servono ai test.
    """

    def __init__(self, data_dir=None, metadata_dir=None, hasher=file_hashes):
        self.metadata_dir = metadata_dir or METADATA_DIR
        self.hashes = HashCache(os.path.join(data_dir, CACHE_FILE) if data_dir else None, hasher)
        self._indexes = {}
        self._lock = threading.Lock()

    def index(self, preset):
        """``Index`` dei metadati della console ``preset`` (vuoto se non ci sono)."""
        with self._lock:
            if preset not in self._indexes:
                entries = read_metadata(os.path.join(self.metadata_dir, '%s.json' % preset)) if preset else []
                self._indexes[preset] = Index(entries)
            return self._indexes[preset]

    def entry(self, preset, entry_id):
        """Gioco dei metadati di ``preset`` con id ``entry_id``, o ``None``."""
        return self.index(preset).by_id.get(entry_id)

    def remember(self, path, hashes):
        """Checksum già noti del file ``path`` della libreria (vedi ``HashCache.remember``)."""
        self.hashes.remember(path, hashes)

    def annotate(self, group, preset, games, files, first=False):
        """Giochi ``games`` della console ``preset`` con i metadati, e quanti checksum mancano.

        ``files`` è ``{id: (percorso, dimensione, data di modifica)}``. Un gioco
        abbinato prende i campi ``FIELDS`` (il titolo dei metadati sostituisce
        quello del file), ``metaId``, ``match`` (``'hash'`` o ``'name'``),
        ``cover`` (vero se ha immagini) e ``achievements`` (compatibile con
        RetroAchievements: vero, falso o ``None`` se non si sa); gli altri hanno
        ``match`` e ``achievements`` ``None``. ``achievements`` vale solo per
        l'abbinamento per checksum o per un file senza checksum (troppo grande):
        se il checksum c'è ma non coincide, il file è un'altra versione.
        Senza metadati per ``preset`` i giochi restano come sono.
        """
        index = self.index(preset)
        if not len(index):
            return games, 0
        pending = self.hashes.request(group, [files[game['id']] for game in games if game['id'] in files], first)
        result = []
        for game in games:
            stat = files.get(game['id'])
            hashes = self.hashes.get(*stat) if stat else {}
            data = dict(game, match=None, achievements=None)
            if hashes is not None:
                entry, match = index.match(hashes, file_key(game['file']))
                if entry is not None:
                    data.update((field, entry.get(field)) for field in FIELDS)
                    data.update(metaId=entry['id'], match=match, cover=bool(entry.get('thumbnail')))
                    if match == 'hash' or not hashes:
                        data['achievements'] = entry.get('achievements')
            result.append(data)
        return result, pending

    def stop(self):
        """Ferma il calcolo dei checksum e salva la cache."""
        self.hashes.stop()
