"""Scansione delle cartelle ROM, titoli dei giochi e cache in memoria."""
import logging
import os
import re
import threading

from .config import parse_extensions
from .errors import LibraryError
from .systems import describe

log = logging.getLogger(__name__)

# File di servizio mai mostrati come giochi nei sistemi senza estensioni predefinite.
IGNORED_EXTENSIONS = frozenset((
    'txt', 'nfo', 'diz', 'md', 'pdf', 'htm', 'html', 'xml', 'dat', 'ini', 'cfg', 'json',
    'png', 'jpg', 'jpeg', 'gif', 'bmp', 'srm', 'sav', 'state', 'rtc', 'bak', 'log', 'db',
))


def extension(name):
    """Estensione del file in minuscolo, senza il punto."""
    return os.path.splitext(name)[1][1:].lower()


def clean_title(file_name, arcade):
    """Titolo ricavato dal nome del file.

    Arcade: il nome senza estensione (nome breve MAME). Altri sistemi: senza
    estensione, senza gruppi ``(...)`` e ``[...]``, con ``_`` al posto degli
    spazi e spazi compressi.
    """
    stem = os.path.splitext(file_name)[0]
    if arcade:
        return stem
    title = re.sub(r'\([^)]*\)|\[[^\]]*\]', ' ', stem)
    title = re.sub(r'\s+', ' ', title.replace('_', ' ')).strip()
    return title or stem


def check_system_id(system_id):
    """Solleva ``LibraryError`` se ``system_id`` non è un nome di cartella accettabile."""
    if (not isinstance(system_id, str) or not system_id or system_id.startswith('.')
            or '/' in system_id or '\\' in system_id or '\0' in system_id):
        raise LibraryError('Console non valida.')


class Library:
    """Libreria dei giochi letta dalla cartella ROM (``paths.roms``).

    ``config`` fornisce ``resolve_path('paths.roms')``, ``systems_settings()``
    (estensioni e core salvati), ``available_cores()``, ``candidate_cores()``
    e ``default_extensions()``. I giochi di ogni sistema restano in cache
    finché non si chiama ``invalidate()``. ``cores_repo`` (facoltativo) dà il
    core associato a ogni gioco, letto sempre dal database. ``info``
    (``gameinfo.GameInfo``, facoltativo) aggiunge i metadati dei giochi.
    """

    def __init__(self, config, cores_repo=None, info=None):
        self.config = config
        self.cores = cores_repo
        self.info = info
        self.lock = threading.Lock()
        self.cache = {}
        # File dei giochi di ogni sistema: ``{id: (percorso, dimensione, data di modifica)}``.
        self.files = {}

    def roms_dir(self):
        """Percorso assoluto della cartella ROM."""
        return self.config.resolve_path('paths.roms')

    def warnings(self):
        """Avvisi da mostrare all'avvio, per esempio la cartella ROM mancante."""
        roms = self.roms_dir()
        if not roms or not os.path.isdir(roms):
            return ['Cartella dei giochi non trovata: %s' % (roms or '(non impostata)')]
        return []

    def folders(self):
        """Sottocartelle della cartella ROM, senza nascoste né link simbolici, ordinate."""
        roms = self.roms_dir()
        if not roms or not os.path.isdir(roms):
            return []
        try:
            entries = list(os.scandir(roms))
        except OSError as error:
            log.warning('Cartella ROM non leggibile (%s): %s', roms, error)
            return []
        names = [entry.name for entry in entries
                 if not entry.name.startswith('.') and not entry.is_symlink() and entry.is_dir()]
        return sorted(names, key=lambda name: (name.casefold(), name))

    def systems(self):
        """Sistemi presenti come nell'API: preset per l'interfaccia, numero di giochi e core.

        ``preset`` è il sistema riconosciuto (per esempio ``nes``), oppure ``None``;
        ``cores`` è la lista ``[{name, installed, downloadable}]`` nell'ordine
        automatico; ``ready`` è vero se almeno un core della lista è
        installato o scaricabile.
        """
        settings = self.config.systems_settings()
        available = self.config.available_cores()
        result = []
        for folder in self.folders():
            system = describe(folder)
            cores = [{'name': core['name'], 'installed': core['installed'], 'downloadable': core['downloadable']}
                     for core in self.config.candidate_cores(folder, settings.get(folder, {}), available)]
            result.append({
                'id': system['id'],
                'preset': system['preset'],
                'name': system['name'],
                'accent': system['accent'],
                'covers': system['covers'],
                'quote': system['quote'],
                'source': system['source'],
                'arcade': system['arcade'],
                'count': len(self.games(folder)),
                'cores': cores,
                'ready': any(core['installed'] or core['downloadable'] for core in cores),
            })
        return result

    def games(self, system_id):
        """Giochi del sistema ``system_id`` ordinati per titolo, con ``core`` e ``coreStatus``.

        L'elenco dei file viene dalla cache se possibile; l'associazione
        gioco-core (sprint 05) si legge ogni volta dal database.
        """
        return self.games_status(system_id)[0]

    def games_status(self, system_id, first=False):
        """``(giochi, checksum mancanti)``: i giochi come ``games`` e quanti file aspettano ancora
        il checksum per i metadati (``first``: calcolati prima degli altri sistemi)."""
        check_system_id(system_id)
        with self.lock:
            games = self.cache.get(system_id)
            if games is None:
                games = self.cache[system_id] = self.scan(system_id)
            files = self.files.get(system_id, {})
        pending = 0
        if self.info is not None:
            games, pending = self.info.annotate(system_id, describe(system_id)['preset'], games, files, first)
            games = sorted(games, key=lambda game: (game['title'].casefold(), game['id']))
        associations = self.cores.game_cores_for(system_id) if self.cores is not None else {}
        result = []
        for game in games:
            core, status = associations.get(game['id'], (None, None))
            result.append(dict(game, core=core, coreStatus=status))
        return result, pending

    def scan(self, system_id):
        """Legge dal disco i giochi del sistema, senza usare la cache."""
        roms = self.roms_dir()
        folder = os.path.join(roms, system_id) if roms else ''
        if not folder or os.path.islink(folder) or not os.path.isdir(folder):
            raise LibraryError('Console non trovata: %s.' % system_id)
        system = describe(system_id)
        # Estensioni salvate nelle Impostazioni, altrimenti quelle predefinite: del
        # preset, o per le cartelle non riconosciute quelle dei core della lista.
        stored = self.config.systems_settings().get(system_id, {})
        custom = parse_extensions(stored.get('extensions', ''))
        allowed = set(custom or self.config.default_extensions(system_id, stored))
        # BIOS del preset (per esempio ``neogeo.zip`` nell'arcade): servono ai core, non sono giochi.
        bios = set(system['bios'])
        games = []
        stats = {}
        for directory, dirs, files in os.walk(folder):
            dirs[:] = sorted(name for name in dirs
                             if not name.startswith('.') and not os.path.islink(os.path.join(directory, name)))
            for name in files:
                if name.startswith('.') or os.path.islink(os.path.join(directory, name)):
                    continue
                ext = extension(name)
                if os.path.splitext(name)[0].lower() in bios:
                    continue
                if allowed and ext not in allowed:
                    continue
                if not allowed and (not ext or ext in IGNORED_EXTENSIONS):
                    continue
                path = os.path.join(directory, name)
                game_id = os.path.relpath(path, folder).replace(os.sep, '/')
                games.append({
                    'id': game_id,
                    'file': name,
                    'title': clean_title(name, system['arcade']),
                    'year': None,
                    'genre': None,
                    'players': None,
                    'cover': False,
                })
                try:
                    stat = os.stat(path)
                except OSError:
                    continue
                stats[game_id] = (path, stat.st_size, stat.st_mtime_ns)
        games.sort(key=lambda game: (game['title'].casefold(), game['id']))
        self.files[system_id] = stats
        log.info('Libreria %s: %d giochi', system_id, len(games))
        return games

    def find(self, system_id, game_id):
        """Restituisce il gioco con id ``game_id``, oppure ``None``."""
        for game in self.games(system_id):
            if game['id'] == game_id:
                return game
        return None

    def invalidate(self):
        """Svuota la cache: la prossima lettura riesamina il disco."""
        with self.lock:
            self.cache.clear()
            self.files.clear()
