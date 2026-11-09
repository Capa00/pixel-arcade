"""Immagini dei giochi (copertina, titolo, schermata) da libretro-thumbnails, con cache su disco.

Un gioco è una voce dei metadati (``gameinfo``) con ``id`` e ``thumbnail``,
il nome del file su libretro-thumbnails. Le immagini si scaricano la prima
volta che servono e restano in ``<data_dir>/thumbnails/<id>/<kind>.png``.
Un'immagine che libretro-thumbnails non ha (404) si ricorda con il file
``<kind>.missing`` e non si richiede per ``MISSING_TTL`` secondi.
"""
import logging
import os
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import quote

log = logging.getLogger(__name__)

# Tipo di immagine → cartella di libretro-thumbnails.
KINDS = {'cover': 'Named_Boxarts', 'title': 'Named_Titles', 'snap': 'Named_Snaps'}
# Immagini da provare in ordine quando si chiede la copertina con il ripiego: poi il titolo, poi la schermata.
FALLBACK = ('cover', 'title', 'snap')
# Un'immagine mancante si richiede di nuovo dopo una settimana.
MISSING_TTL = 7 * 24 * 3600
BASE = 'https://thumbnails.libretro.com/'
CACHE_DIR = 'thumbnails'

TIMEOUT = 15
MAX_SIZE = 5 * 1024 * 1024
PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'

# Caratteri che libretro-thumbnails sostituisce con «_» nei nomi dei file.
UNSAFE = '&*/:`<>?\\|"'


def libretro_name(name):
    """Nome del file su libretro-thumbnails: ``&*/:`<>?\\|"`` diventano ``_``."""
    return ''.join('_' if char in UNSAFE else char for char in name)


def image_url(thumbnail, kind, system):
    """URL dell'immagine ``kind`` per il nome libretro ``thumbnail`` nella cartella ``system`` di libretro-thumbnails."""
    return BASE + quote(system) + '/' + KINDS[kind] + '/' + quote(libretro_name(thumbnail)) + '.png'


def is_png(content_type, data):
    """Vero se il tipo dichiarato è ``image/png`` o se i dati iniziano con la firma PNG."""
    kind = (content_type or '').split(';')[0].strip().lower()
    return kind == 'image/png' or data[:8] == PNG_SIGNATURE


def cache_dir(data_dir):
    """Cartella della cache delle immagini in ``data_dir`` (``None`` senza ``data_dir``: niente cache su disco)."""
    return os.path.join(data_dir, CACHE_DIR) if data_dir else None


class ImageCache:
    """Scarica le immagini la prima volta che servono e le tiene in ``<cache_dir>/<id>/<kind>.png``.

    Senza ``cache_dir`` le immagini si scaricano ogni volta.
    """

    def __init__(self, cache_dir=None, opener=urllib.request.urlopen):
        self.cache_dir = cache_dir
        self.opener = opener
        self._locks = {}
        self._locks_lock = threading.Lock()
        self._warned = set()

    def path(self, game, kind, suffix='.png'):
        """Percorso del file in cache per il gioco ``game``, o ``None`` senza cache su disco."""
        return os.path.join(self.cache_dir, game['id'], kind + suffix) if self.cache_dir else None

    def _missing(self, game, kind):
        """Vero se l'immagine è risultata mancante da meno di ``MISSING_TTL`` secondi."""
        path = self.path(game, kind, '.missing')
        try:
            return bool(path) and time.time() - os.path.getmtime(path) < MISSING_TTL
        except OSError:
            return False

    def first(self, game, kinds, system):
        """``(kind, byte PNG)`` della prima immagine disponibile tra ``kinds``, o ``(None, None)``."""
        for kind in kinds:
            data = self.get(game, kind, system)
            if data is not None:
                return kind, data
        return None, None

    def _lock(self, key):
        with self._locks_lock:
            return self._locks.setdefault(key, threading.Lock())

    def get(self, game, kind, system):
        """Byte PNG dell'immagine ``kind`` del gioco, o ``None`` se non è disponibile.

        ``system`` è la cartella di libretro-thumbnails della console del gioco.
        """
        if not game.get('thumbnail') or not system or kind not in KINDS:
            return None
        path = self.path(game, kind)
        with self._lock((game['id'], kind)):
            data = self._read(path) if path else None
            if data is not None:
                return data
            if self._missing(game, kind):
                return None
            data, missing = self._download(game, kind, system)
            if data is not None and path:
                self._write(path, data)
            elif missing and path:
                self._write(self.path(game, kind, '.missing'), b'')
            return data

    @staticmethod
    def _read(path):
        try:
            with open(path, 'rb') as stream:
                return stream.read()
        except OSError:
            return None

    def _download(self, game, kind, system):
        """``(byte PNG, mancante)``: i dati, oppure ``None`` e vero se il server risponde 404."""
        url = image_url(game['thumbnail'], kind, system)
        try:
            with self.opener(url, timeout=TIMEOUT) as response:
                status = getattr(response, 'status', 200)
                content_type = response.headers.get('Content-Type') if response.headers else None
                data = response.read(MAX_SIZE + 1)
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None, True
            return self._fail(game, kind, 'risposta HTTP %s' % error.code), False
        except Exception as error:
            return self._fail(game, kind, 'download non riuscito (%s)' % error), False
        if status == 404:
            return None, True
        if status != 200:
            return self._fail(game, kind, 'risposta HTTP %s' % status), False
        if len(data) > MAX_SIZE:
            return self._fail(game, kind, 'immagine oltre %d MB' % (MAX_SIZE // (1024 * 1024))), False
        if not is_png(content_type, data):
            return self._fail(game, kind, 'non è un PNG'), False
        return data, False

    def _fail(self, game, kind, reason):
        """Registra un avviso al massimo una volta per immagine in questa sessione e restituisce ``None``."""
        key = (game['id'], kind)
        if key not in self._warned:
            self._warned.add(key)
            log.warning('Immagine %s di %s non disponibile: %s', kind, game['id'], reason)
        return None

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
            log.warning('Immagine non salvata in cache (%s): %s', path, error)
            try:
                os.remove(tmp)
            except OSError:
                pass
