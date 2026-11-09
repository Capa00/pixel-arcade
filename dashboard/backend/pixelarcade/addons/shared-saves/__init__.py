"""Estensione «Salvataggi condivisi»: salvataggi interni di partenza, uguali per tutti i profili.

Un salvataggio condiviso è una cartella con i file del salvataggio interno di
un gioco (``store.py``). All'avvio di un gioco che ne ha, la modale dei
salvataggi li mostra sotto gli slot: la partita parte dall'inizio con una
copia del salvataggio condiviso al posto di quello del P1, e a fine partita
la copia si butta (``PlayService.start`` con ``shared``). Questa estensione
dà a ``SaveStore.shared`` il fornitore dei salvataggi e le rotte delle
Impostazioni. La cartella predefinita è ``<data_dir>/shared-saves``.

Rotte sotto ``/api/addons/shared-saves/``:

- ``GET settings``: ``{root, value, default, mymcplus, saves}``. ``root`` è la
  cartella in uso (assoluta), ``value`` il valore impostato (vuoto =
  predefinita), ``mymcplus`` è vero se i salvataggi PS2 esportati si possono
  importare; ``saves`` = ``[{system, systemName, game, gameTitle, id, title,
  description, files}]`` di tutti i giochi della libreria;
- ``POST settings`` ``{root}``: cambia la cartella (vuoto = predefinita) e
  risponde come ``GET settings``. I salvataggi della cartella di prima restano dove sono;
- ``POST create`` ``{path, system, game, title, description}``: crea il
  salvataggio dal file ``path`` del disco, scelto col selettore dei file
  (``GET /api/files``) e convertito con ``convert.py``; ``{id, note}`` più
  ``GET settings``;
- ``POST update`` ``{system, game, id, title, description}`` e ``POST delete``
  ``{system, game, id}``: rispondono come ``GET settings``.
"""
import logging
import os
import shutil
import tempfile

from pixelarcade.repositories.settings import SettingsRepository
from pixelarcade.web.router import ApiError

from . import convert
from .store import DESCRIPTION_MAX, TITLE_MAX, SharedStore, StoreError

ID = 'shared-saves'
PREFIX = '/api/addons/%s/' % ID
SETTING = 'addons.shared-saves.root'
DEFAULT_DIR = 'shared-saves'
# Dimensione massima del file di un salvataggio (una memory card PS2 è di 8,25 MB).
MAX_FILE = 16 * 1024 * 1024

log = logging.getLogger(__name__)


def text(body, key, label):
    value = body.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ApiError(400, 'Indica %s.' % label)
    return value


def register(router, services):
    data_dir = services.get('data_dir') or tempfile.gettempdir()
    settings = SettingsRepository(services['db'])
    config = services['config']
    library = services['library']
    default_root = os.path.join(data_dir, DEFAULT_DIR)

    def value():
        current = settings.get_all().get(SETTING)
        return current if isinstance(current, str) else ''

    def root():
        current = value().strip()
        return config.resolve_value(current) if current else default_root

    store = SharedStore(root)
    work_root = os.path.join(data_dir, 'addons', ID)
    services['saves'].shared = store

    def game_or_error(body):
        system = text(body, 'system', 'la console')
        game_id = text(body, 'game', 'il gioco')
        game = library.find(system, game_id)
        if game is None:
            raise ApiError(404, 'Gioco non trovato.')
        return system, game_id, game

    def all_saves():
        result = []
        for system in library.systems():
            base = os.path.join(root(), system['id'])
            if not os.path.isdir(base):
                continue
            for game in library.games(system['id']):
                for item in store.list(system['id'], game['id']):
                    result.append(dict(item, system=system['id'], systemName=system['name'], game=game['id'],
                                       gameTitle=game['title']))
        return result

    def current(ctx=None, request=None):
        return {'root': root(), 'value': value(), 'default': default_root,
                'mymcplus': convert.find_mymcplus(data_dir) is not None, 'saves': all_saves(),
                'titleMax': TITLE_MAX, 'descriptionMax': DESCRIPTION_MAX}

    def run(action):
        try:
            return action()
        except StoreError as error:
            raise ApiError(400, str(error)) from error
        except OSError as error:
            log.warning('Salvataggi condivisi: %s', error)
            raise ApiError(500, 'Operazione non riuscita: %s' % (error.strerror or error)) from error

    def set_settings(ctx, request):
        new = request.body.get('root')
        if not isinstance(new, str) or len(new) > 500 or '\0' in new:
            raise ApiError(400, 'Cartella non valida.')
        new = new.strip()
        path = config.resolve_value(new) if new else default_root
        if os.path.exists(path) and not os.path.isdir(path):
            raise ApiError(400, 'Il percorso indicato non è una cartella.')
        settings.set_many({SETTING: new})
        log.info('Cartella dei salvataggi condivisi: %s', path)
        return current()

    def create(ctx, request):
        body = request.body
        system, game_id, _ = game_or_error(body)
        source = text(body, 'path', 'il file')
        title = text(body, 'title', 'il titolo')
        description = body.get('description') if isinstance(body.get('description'), str) else ''
        if not os.path.isabs(source) or os.path.islink(source) or not os.path.isfile(source):
            raise ApiError(400, 'File non trovato.')
        if os.path.getsize(source) == 0:
            raise ApiError(400, 'Il file è vuoto.')
        if os.path.getsize(source) > MAX_FILE:
            raise ApiError(400, 'File troppo grande (al massimo 16 MB).')

        def action():
            os.makedirs(work_root, mode=0o700, exist_ok=True)
            work = tempfile.mkdtemp(prefix='convert-', dir=work_root)
            try:
                files, note = convert.prepare(system, source, os.path.basename(source), work,
                                              convert.find_mymcplus(data_dir))
                name = store.create(system, game_id, title, description, files)
            finally:
                shutil.rmtree(work, ignore_errors=True)
            return dict(current(), id=name, note=note)

        return run(action)

    def update(ctx, request):
        body = request.body
        system, game_id, _ = game_or_error(body)
        name = text(body, 'id', 'il salvataggio')
        description = body.get('description') if isinstance(body.get('description'), str) else ''
        run(lambda: store.update(system, game_id, name, body.get('title'), description))
        return current()

    def delete(ctx, request):
        body = request.body
        system = text(body, 'system', 'la console')
        game_id = text(body, 'game', 'il gioco')
        name = text(body, 'id', 'il salvataggio')
        run(lambda: store.delete(system, game_id, name))
        return current()

    router.add('GET', PREFIX + 'settings', current)
    router.add('POST', PREFIX + 'settings', set_settings)
    router.add('POST', PREFIX + 'create', create)
    router.add('POST', PREFIX + 'update', update)
    router.add('POST', PREFIX + 'delete', delete)
