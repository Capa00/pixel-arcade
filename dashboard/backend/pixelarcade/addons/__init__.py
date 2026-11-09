"""Estensioni facoltative della dashboard.

Ogni sottocartella di questa cartella con un ``__init__.py`` è un'estensione.
Le cartelle che iniziano con ``.`` o ``_`` vengono ignorate. Il modulo
dell'estensione definisce:

- ``register(router, services)`` (obbligatoria): registra le rotte. Per
  convenzione usano il prefisso ``/api/addons/<id>/``, dove ``id`` è il nome
  della cartella;
- ``bootstrap(services)`` (facoltativa): dati aggiunti a ``GET /api/bootstrap``
  nel campo ``addons.<id>``;
- ``busy(services)`` (facoltativa): frase breve sull'attività in corso (per
  esempio «2 operazioni in corso»), oppure ``None``. Alla chiusura della
  dashboard le frasi si mostrano nella conferma, e se l'utente sceglie di
  continuare il servizio resta acceso in background finché non sono finite;
- ``stop()`` (facoltativa): chiamata alla chiusura del servizio.

Il nome della cartella può contenere trattini: il pacchetto viene importato con
il nome sicuro ``pixelarcade_addon_<id>`` (``-`` → ``_``), così gli import
relativi (``from . import modulo``) funzionano. Un'estensione che non si carica
viene segnalata nel log e saltata: la dashboard parte comunque.
"""
import importlib.util
import logging
import os
import sys
from collections import namedtuple

log = logging.getLogger(__name__)

ROOT = os.path.dirname(os.path.abspath(__file__))

Addon = namedtuple('Addon', 'id module')


def module_name(addon_id):
    """Nome sicuro del pacchetto dell'estensione ``addon_id``."""
    return 'pixelarcade_addon_' + addon_id.replace('-', '_')


def load_package(path):
    """Importa la cartella ``path`` come pacchetto e restituisce il modulo."""
    path = os.path.abspath(path)
    name = module_name(os.path.basename(path))
    spec = importlib.util.spec_from_file_location(name, os.path.join(path, '__init__.py'),
                                                  submodule_search_locations=[path])
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        sys.modules.pop(name, None)
        raise
    return module


def load(services, root=None):
    """Carica le estensioni presenti in ``root`` (predefinita: questa cartella).

    Restituisce la lista degli ``Addon(id, module)`` caricati, in ordine di nome.
    """
    root = root or ROOT
    try:
        names = sorted(os.listdir(root))
    except OSError as error:
        log.warning('Cartella delle estensioni non leggibile (%s): %s', root, error)
        return []
    addons = []
    for name in names:
        path = os.path.join(root, name)
        if name.startswith(('.', '_')) or not os.path.isfile(os.path.join(path, '__init__.py')):
            continue
        try:
            module = load_package(path)
            if not callable(getattr(module, 'register', None)):
                raise TypeError('manca la funzione register')
        except Exception as error:
            log.warning('Estensione %s non caricata: %s', name, error)
            log.debug('Dettagli dell\'errore di %s', name, exc_info=True)
            continue
        addons.append(Addon(name, module))
        log.info('Estensione caricata: %s', name)
    return addons


def register_routes(addons, router, services):
    """Chiama ``register(router, services)`` di ogni estensione."""
    for addon in addons:
        try:
            addon.module.register(router, services)
        except Exception as error:
            log.warning('Rotte dell\'estensione %s non registrate: %s', addon.id, error)
            log.debug('Dettagli dell\'errore di %s', addon.id, exc_info=True)


def bootstrap_data(addons, services):
    """Dati delle estensioni per ``GET /api/bootstrap``: ``{id: dati}``."""
    data = {}
    for addon in addons:
        function = getattr(addon.module, 'bootstrap', None)
        if not callable(function):
            continue
        try:
            data[addon.id] = function(services)
        except Exception as error:
            log.warning('Dati iniziali dell\'estensione %s non disponibili: %s', addon.id, error)
            log.debug('Dettagli dell\'errore di %s', addon.id, exc_info=True)
    return data


def busy_all(addons, services):
    """Frasi delle estensioni con un'attività in corso (hook ``busy``), in ordine di nome.

    Un hook che solleva un'eccezione viene segnalato nel log e ignorato.
    """
    phrases = []
    for addon in addons:
        function = getattr(addon.module, 'busy', None)
        if not callable(function):
            continue
        try:
            phrase = function(services)
        except Exception as error:
            log.warning('Attività dell\'estensione %s non verificabile: %s', addon.id, error)
            log.debug('Dettagli dell\'errore di %s', addon.id, exc_info=True)
            continue
        if phrase:
            phrases.append(str(phrase))
    return phrases


def stop_all(addons):
    """Chiama ``stop()`` di ogni estensione che la definisce, ignorando gli errori."""
    for addon in addons:
        function = getattr(addon.module, 'stop', None)
        if not callable(function):
            continue
        try:
            function()
        except Exception as error:
            log.warning('Chiusura dell\'estensione %s non riuscita: %s', addon.id, error)
