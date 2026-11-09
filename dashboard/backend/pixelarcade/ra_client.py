"""Client HTTP di RetroAchievements (solo libreria standard).

- ``login``: ``dorequest.php?r=login2``, lo stesso accesso di RetroArch, che
  restituisce il token da passare a RetroArch al posto della password;
- Web API (``/API/API_*.php``) con la chiave unica della dashboard (``y``):
  profilo e progressi degli utenti, trofei dei giochi, elenco dei giochi con
  gli hash.

Nessun valore segreto (password, token, chiave) finisce nei messaggi di
errore o nel log.
"""
import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from . import __version__
from .errors import PixelArcadeError

log = logging.getLogger(__name__)

HOST = 'https://retroachievements.org'
CONNECT_URL = HOST + '/dorequest.php'
API_URL = HOST + '/API/'
MEDIA_URL = 'https://media.retroachievements.org'
USER_AGENT = 'PixelArcade/%s' % __version__
TIMEOUT = 15
MAX_RESPONSE = 32 * 1024 * 1024

OFFLINE = 'RetroAchievements non raggiungibile: controlla la connessione.'


class RAError(PixelArcadeError):
    """Errore di RetroAchievements con un messaggio da mostrare all'utente."""

    status = 502


class RAAuthError(RAError):
    """Credenziali o chiave rifiutate."""

    status = 400


class RAClient:
    """Richieste a RetroAchievements. ``opener`` è ``urllib.request.urlopen`` (sostituibile nei test)."""

    def __init__(self, opener=urllib.request.urlopen, timeout=TIMEOUT):
        self.opener = opener
        self.timeout = timeout

    def request(self, url, data=None):
        """Risposta JSON decodificata; ``RAError`` senza rete, ``RAAuthError`` per 401/403."""
        body = urllib.parse.urlencode(data).encode('ascii') if data is not None else None
        request = urllib.request.Request(url, data=body, headers={'User-Agent': USER_AGENT})
        try:
            with self.opener(request, timeout=self.timeout) as response:
                raw = response.read(MAX_RESPONSE + 1)
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                raise RAAuthError('Chiave Web API non valida.')
            if error.code == 404:
                raise RAError('Dato non trovato su RetroAchievements.')
            raise RAError('RetroAchievements ha risposto con l\'errore %d.' % error.code)
        except (urllib.error.URLError, OSError, ValueError) as error:
            log.info('RetroAchievements non raggiungibile: %s', getattr(error, 'reason', error))
            raise RAError(OFFLINE)
        if len(raw) > MAX_RESPONSE:
            raise RAError('Risposta di RetroAchievements troppo grande.')
        try:
            return json.loads(raw.decode('utf-8'))
        except (UnicodeDecodeError, ValueError):
            raise RAError('Risposta di RetroAchievements non valida.')

    # --- Accesso -------------------------------------------------------------

    def login(self, username, password):
        """Accesso con nome utente e password: ``{user, token, score, softcoreScore}``.

        ``RAAuthError`` se le credenziali sono sbagliate.
        """
        try:
            reply = self.request(CONNECT_URL, {'r': 'login2', 'u': username, 'p': password})
        except RAAuthError:
            # Con credenziali sbagliate il server risponde 401.
            reply = None
        if not isinstance(reply, dict) or not reply.get('Success') or not reply.get('Token'):
            raise RAAuthError('Nome utente o password non validi.')
        return {
            'user': str(reply.get('User') or username),
            'token': str(reply['Token']),
            'score': int(reply.get('Score') or 0),
            'softcoreScore': int(reply.get('SoftcoreScore') or 0),
        }

    # --- Web API -------------------------------------------------------------

    def api(self, endpoint, key, **params):
        """Chiamata a ``/API/<endpoint>.php`` con la chiave ``key``."""
        query = dict(params, y=key)
        return self.request(API_URL + endpoint + '.php?' + urllib.parse.urlencode(query))

    def check_key(self, key):
        """Vero se la chiave è accettata; ``RAAuthError`` se no, ``RAError`` senza rete."""
        reply = self.api('API_GetConsoleIDs', key)
        if not isinstance(reply, list):
            raise RAAuthError('Chiave Web API non valida.')
        return True

    def user_summary(self, key, username, games=5, achievements=10):
        """Riepilogo dell'utente (``API_GetUserSummary``): punti, rank, giochi e trofei recenti."""
        return self.api('API_GetUserSummary', key, u=username, g=games, a=achievements)

    def game_progress(self, key, game_id, username):
        """Trofei del gioco con quelli sbloccati dall'utente (``API_GetGameInfoAndUserProgress``)."""
        return self.api('API_GetGameInfoAndUserProgress', key, g=game_id, u=username)

    def game_extended(self, key, game_id):
        """Trofei del gioco senza un utente (``API_GetGameExtended``)."""
        return self.api('API_GetGameExtended', key, i=game_id)

    def game_list(self, key, console_id):
        """Giochi con trofei della console, con gli hash (``API_GetGameList``)."""
        reply = self.api('API_GetGameList', key, i=console_id, h=1, f=1)
        if not isinstance(reply, list):
            raise RAError('Elenco dei giochi di RetroAchievements non valido.')
        return reply

    def completion_progress(self, key, username, count, offset):
        """Giochi con trofei dell'utente e quanti ne ha presi (``API_GetUserCompletionProgress``)."""
        reply = self.api('API_GetUserCompletionProgress', key, u=username, c=count, o=offset)
        if not isinstance(reply, dict):
            raise RAError('Elenco dei giochi dell\'utente non valido.')
        return reply

    def badge(self, name, locked=False):
        """PNG del badge ``name`` (``_lock`` per quello bloccato), oppure ``RAError``."""
        url = '%s/Badge/%s%s.png' % (MEDIA_URL, urllib.parse.quote(name), '_lock' if locked else '')
        return self.png(url, 'Badge non valido.')

    def game_icon(self, name):
        """PNG dell'icona del gioco ``name`` (numero dell'immagine), oppure ``RAError``."""
        return self.png('%s/Images/%s.png' % (MEDIA_URL, urllib.parse.quote(name)), 'Icona non valida.')

    def png(self, url, invalid):
        """Immagine PNG da ``url`` (al massimo 1 MB), oppure ``RAError`` con ``invalid`` se non lo è."""
        request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        try:
            with self.opener(request, timeout=self.timeout) as response:
                data = response.read(1024 * 1024 + 1)
        except (urllib.error.URLError, OSError, ValueError):
            raise RAError(OFFLINE)
        if len(data) > 1024 * 1024 or data[:8] != b'\x89PNG\r\n\x1a\n':
            raise RAError(invalid)
        return data
