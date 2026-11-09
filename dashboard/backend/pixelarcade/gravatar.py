"""Avatar dei profili da Gravatar, con cache su disco.

Il profilo conserva solo l'hash SHA-256 dell'email normalizzata (minuscolo,
senza spazi ai lati), non l'email. L'immagine si scarica da Gravatar con
``d=404``: un'email senza Gravatar risponde 404 e il profilo resta con
l'iniziale. Le immagini restano in ``<cache_dir>/<hash>.img`` per
``TTL`` secondi; un 404 si ricorda con ``<hash>.missing`` per lo stesso tempo.
Senza rete si usa l'immagine in cache anche se è scaduta.
"""
import hashlib
import logging
import os
import re
import threading
import time
import urllib.error
import urllib.request

from . import __version__
from .errors import ProfileError

log = logging.getLogger(__name__)

URL = 'https://gravatar.com/avatar/%s?s=%d&d=404'
SIZE = 160
TTL = 24 * 3600
TIMEOUT = 10
MAX_SIZE = 1024 * 1024
USER_AGENT = 'PixelArcade/%s' % __version__
CACHE_DIR = 'avatars'

EMAIL_MAX = 254
EMAIL = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
HASH = re.compile(r'^[0-9a-f]{64}$')
# Firme dei formati accettati → tipo dell'immagine.
SIGNATURES = ((b'\x89PNG\r\n\x1a\n', 'image/png'), (b'\xff\xd8\xff', 'image/jpeg'))


def email_hash(email):
    """Hash SHA-256 dell'email normalizzata, come lo vuole Gravatar. ``ProfileError`` se non è un'email."""
    value = email.strip().lower() if isinstance(email, str) else ''
    if len(value) > EMAIL_MAX or not EMAIL.match(value):
        raise ProfileError('Email non valida.')
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def image_type(data):
    """Tipo dell'immagine (``image/png`` o ``image/jpeg``) dalla firma, oppure ``None``."""
    for signature, kind in SIGNATURES:
        if data[:len(signature)] == signature:
            return kind
    return None


def cache_dir(data_dir):
    """Cartella della cache degli avatar in ``data_dir`` (``None`` senza ``data_dir``: niente cache su disco)."""
    return os.path.join(data_dir, CACHE_DIR) if data_dir else None


class GravatarCache:
    """Scarica gli avatar da Gravatar e li tiene in ``cache_dir``; ``now`` è sostituibile nei test."""

    def __init__(self, cache_dir=None, opener=urllib.request.urlopen, now=time.time):
        self.cache_dir = cache_dir
        self.opener = opener
        self.now = now
        self._locks = {}
        self._locks_lock = threading.Lock()

    def _lock(self, digest):
        with self._locks_lock:
            return self._locks.setdefault(digest, threading.Lock())

    def path(self, digest, suffix):
        return os.path.join(self.cache_dir, digest + suffix) if self.cache_dir else None

    def _fresh(self, path):
        try:
            return bool(path) and self.now() - os.path.getmtime(path) < TTL
        except OSError:
            return False

    def get(self, digest):
        """``(byte, tipo)`` dell'avatar con hash ``digest``, oppure ``None`` se non c'è o non si può scaricare."""
        if not isinstance(digest, str) or not HASH.match(digest):
            return None
        image = self.path(digest, '.img')
        missing = self.path(digest, '.missing')
        with self._lock(digest):
            cached = self._read(image)
            if cached is not None and self._fresh(image):
                return cached, image_type(cached)
            if cached is None and self._fresh(missing):
                return None
            data, absent = self._download(digest)
            if data is not None:
                if image:
                    self._write(image, data)
                    self._remove(missing)
                return data, image_type(data)
            if absent:
                if image:
                    self._write(missing, b'')
                    self._remove(image)
                return None
            # Gravatar non raggiungibile: va bene anche l'immagine scaduta.
            return (cached, image_type(cached)) if cached is not None else None

    def _download(self, digest):
        """``(byte, assente)``: l'immagine, oppure ``None`` e vero se Gravatar risponde 404."""
        request = urllib.request.Request(URL % (digest, SIZE), headers={'User-Agent': USER_AGENT})
        try:
            with self.opener(request, timeout=TIMEOUT) as response:
                status = getattr(response, 'status', 200)
                data = response.read(MAX_SIZE + 1)
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None, True
            log.info('Avatar Gravatar non disponibile: risposta HTTP %s', error.code)
            return None, False
        except Exception as error:
            log.info('Avatar Gravatar non disponibile: %s', error)
            return None, False
        if status == 404:
            return None, True
        if status != 200 or len(data) > MAX_SIZE or image_type(data) is None:
            log.info('Avatar Gravatar non valido (HTTP %s, %d byte)', status, len(data))
            return None, False
        return data, False

    @staticmethod
    def _read(path):
        if not path:
            return None
        try:
            with open(path, 'rb') as stream:
                data = stream.read()
        except OSError:
            return None
        return data if image_type(data) else None

    @staticmethod
    def _write(path, data):
        """Scrittura atomica: prima ``.tmp``, poi ``os.replace``. Un errore lascia solo l'avviso nel log."""
        tmp = path + '.tmp'
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(tmp, 'wb') as stream:
                stream.write(data)
            os.replace(tmp, path)
        except OSError as error:
            log.warning('Avatar non salvato in cache (%s): %s', path, error)
            GravatarCache._remove(tmp)

    @staticmethod
    def _remove(path):
        try:
            os.remove(path)
        except OSError:
            pass
