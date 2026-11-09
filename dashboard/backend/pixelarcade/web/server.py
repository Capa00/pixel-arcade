"""Server HTTP locale: ``ThreadingHTTPServer`` su ``127.0.0.1``."""
import json
import logging
import secrets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from .. import addons
from . import api, security, static
from .router import RawResponse, Request, Router

log = logging.getLogger(__name__)

MAX_BODY = 256 * 1024
# Rotte POST chiamate da un processo locale (un nuovo avvio), senza token.
LOCAL_ROUTES = ('/api/show',)


class Handler(BaseHTTPRequestHandler):
    """Gestisce API, file statici e controlli di sicurezza."""

    server_version = 'PixelArcade'
    sys_version = ''

    def log_message(self, fmt, *args):
        log.debug('%s - %s', self.address_string(), fmt % args)

    def send_body(self, status, body, content_type, cache='no-store'):
        self.send_response(status)
        for name, value in security.headers(content_type, cache):
            self.send_header(name, value)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_body(status, body, 'application/json; charset=utf-8')

    def trusted(self, is_post):
        error = security.check_request(self.headers, self.server.server_port, is_post, self.server.token)
        if error:
            self.send_json(403, {'error': error})
            return False
        return True

    def read_json(self):
        if not (self.headers.get('Content-Type') or '').startswith('application/json'):
            return None, 'Richiesta non valida: serve un corpo JSON.'
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            return None, 'Richiesta non valida.'
        if not 0 < length <= MAX_BODY:
            return None, 'Richiesta non valida o troppo grande.'
        try:
            data = json.loads(self.rfile.read(length).decode('utf-8'))
        except (UnicodeDecodeError, ValueError):
            return None, 'JSON non valido.'
        if not isinstance(data, dict):
            return None, 'Richiesta non valida.'
        return data, None

    def dispatch_api(self, route, body=None):
        query = {key: values[0] for key, values in parse_qs(route.query).items()}
        request = Request(self.command, route.path, query, body, self.headers)
        status, data = self.server.router.dispatch(self.server.services, request)
        if isinstance(data, RawResponse):
            self.send_body(status, data.body, data.content_type, data.cache)
        else:
            self.send_json(status, data)

    def do_GET(self):
        if not self.trusted(False):
            return
        route = urlsplit(self.path)
        if route.path.startswith('/api/'):
            self.dispatch_api(route)
            return
        found = static.resolve(self.server.dist_dir, route.path)
        if found is None:
            self.send_json(404, {'error': 'Pagina non trovata.'})
            return
        path, content_type, cache = found
        try:
            with open(path, 'rb') as stream:
                body = stream.read()
        except OSError:
            self.send_json(404, {'error': 'Pagina non trovata.'})
            return
        self.send_body(200, body, content_type, cache)

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        route = urlsplit(self.path)
        if route.path in LOCAL_ROUTES:
            error = security.check_local(self.headers, self.server.server_port, self.client_address[0])
            if error:
                self.send_json(403, {'error': error})
                return
        elif not self.trusted(True):
            return
        if not route.path.startswith('/api/'):
            self.send_json(405, {'error': 'Metodo non consentito.'})
            return
        body, error = self.read_json()
        if error:
            self.send_json(400, {'error': error})
            return
        self.dispatch_api(route, body)


def create_server(port, services, dist_dir):
    """Crea il server su ``127.0.0.1:port`` con un token di sessione nuovo.

    ``services`` è il dizionario dei servizi (``db``, ``config``, ``library``);
    le rotte lo ricevono come contesto insieme a ``token``. Con ``port=0`` il
    sistema sceglie una porta libera.
    """
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.daemon_threads = True
    server.dist_dir = dist_dir
    server.token = secrets.token_urlsafe(32)
    server.services = dict(services, token=server.token)
    server.router = Router()
    api.register(server.router)
    addons.register_routes(services.get('addons', []), server.router, server.services)
    return server
