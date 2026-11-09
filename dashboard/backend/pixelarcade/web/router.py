"""Tabella delle rotte dell'API e traduzione degli errori in JSON."""
import logging

from ..errors import PixelArcadeError

log = logging.getLogger(__name__)


class ApiError(Exception):
    """Errore HTTP con status e messaggio in italiano."""

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


class RawResponse:
    """Risposta non JSON per le estensioni: corpo in byte, tipo e politica di cache.

    Una rotta la restituisce al posto dei dati JSON; il server invia il corpo
    così com'è, con le stesse intestazioni di sicurezza delle altre risposte.
    """

    def __init__(self, body, content_type, cache='no-store'):
        self.body = body
        self.content_type = content_type
        self.cache = cache


class Request:
    """Richiesta già analizzata: metodo, percorso, query e corpo JSON."""

    def __init__(self, method, path, query=None, body=None, headers=None):
        self.method = method
        self.path = path
        self.query = query or {}
        self.body = body
        self.headers = headers or {}


class Router:
    """Associa ``(metodo, percorso)`` a una funzione ``(ctx, request) -> dati``."""

    def __init__(self):
        self.routes = {}

    def add(self, method, path, handler):
        """Registra una rotta."""
        self.routes[(method, path)] = handler

    def has_path(self, path):
        """Indica se esiste una rotta con questo percorso, per qualsiasi metodo."""
        return any(route_path == path for _, route_path in self.routes)

    def dispatch(self, ctx, request):
        """Esegue la rotta e restituisce ``(status, dati JSON)``.

        Se la rotta restituisce un ``RawResponse``, la coppia è ``(200, risposta)``.
        """
        handler = self.routes.get((request.method, request.path))
        if handler is None:
            if self.has_path(request.path):
                return 405, {'error': 'Metodo non consentito.'}
            return 404, {'error': 'Pagina non trovata.'}
        try:
            return 200, handler(ctx, request)
        except ApiError as error:
            return error.status, {'error': error.message}
        except PixelArcadeError as error:
            return error.status, dict(error.data or {}, error=str(error))
        except Exception:
            log.exception('Errore inatteso su %s %s', request.method, request.path)
            return 500, {'error': 'Errore interno del servizio.'}
