"""Comandi di rete di RetroArch: UDP su ``127.0.0.1:<network_cmd_port>``.

Misure dello Sprint 01 dei salvataggi (RetroArch 1.22.2):

- rispondono ``GET_STATUS`` (``GET_STATUS PLAYING|PAUSED <sistema>,<nome>,crc32=<crc>``)
  e ``VERSION``; ``PAUSE_TOGGLE``, ``SAVE_STATE`` e ``LOAD_STATE`` non rispondono;
- ``SAVE_STATE_SLOT`` non esiste e ``LOAD_STATE_SLOT`` blocca RetroArch con
  bsnes: qui non si usano. Si salva e si carica lo slot attivo, che con
  ``content_runtime_log = false`` è sempre lo 0 (``<nome>.state``);
- ``SAVE_STATE`` funziona anche in pausa; il file compare in 16–45 ms (NES,
  SNES) o in circa 0,2 s (PS1), la miniatura ``<file>.png`` subito dopo;
- ``LOAD_STATE`` mandato meno di 0,2 s dopo che il file di un ``SAVE_STATE``
  è completo viene scartato senza avvisi (Beetle PSX, 7 novembre 2026: 0 su 6
  entro 0,1 s, 1 su 3 a 0,15 s, sempre a 0,2 s e oltre): ``load_state`` aspetta
  ``LOAD_AFTER_SAVE`` dall'ultimo salvataggio;
- ``SCREENSHOT`` (anche in pausa) scrive ``<nome>-AAMMGG-HHMMSS.png`` in
  ``screenshot_directory`` in circa 0,2 s.
"""
import logging
import os
import socket
import time

from .errors import RetroArchError
from .fsutil import png_complete

log = logging.getLogger(__name__)

HOST = '127.0.0.1'
# Attesa di una risposta a ``GET_STATUS``.
TIMEOUT = 1.0
# Attesa del file dello stato dopo ``SAVE_STATE``: misurati al massimo 0,2 s, margine ampio.
SAVE_TIMEOUT = 5.0
# Attesa della miniatura dopo lo stato (misurati 66–80 ms dal comando, ma senza
# finestre sopra RetroArch: in partita con la modale aperta può tardare).
THUMB_TIMEOUT = 3.0
# Attesa della cattura dopo ``SCREENSHOT`` (misurati circa 0,2 s).
SHOT_TIMEOUT = 3.0
# Attesa del cambio di stato dopo ``PAUSE_TOGGLE``.
TOGGLE_TIMEOUT = 1.0
POLL = 0.02
# Attesa minima tra la fine di un ``SAVE_STATE`` e un ``LOAD_STATE`` (misurato 0,2 s, margine ampio).
LOAD_AFTER_SAVE = 1.0
# Giri di attesa senza cambi perché un file di stato si consideri scritto per intero.
STABLE_POLLS = 5
BUFFER = 4096

PLAYING = 'PLAYING'
PAUSED = 'PAUSED'

NO_ANSWER = 'RetroArch non risponde.'


def parse_status(reply):
    """Stato da una risposta a ``GET_STATUS`` (``PLAYING``, ``PAUSED``, ``CONTENTLESS``…), oppure ``None``."""
    parts = (reply or '').split()
    if len(parts) < 2 or parts[0] != 'GET_STATUS':
        return None
    return parts[1]


def file_mark(path):
    """``(mtime_ns, dimensione)`` del file, oppure ``None`` se non esiste."""
    try:
        info = os.stat(path)
    except OSError:
        return None
    return info.st_mtime_ns, info.st_size


def shot_names(directory):
    """Nomi dei PNG della cartella che non sono miniature di stati (``….state*.png``)."""
    try:
        names = os.listdir(directory)
    except OSError:
        return []
    return [name for name in names if name.endswith('.png') and '.state' not in name]


class RetroArchNet:
    """Client dei comandi di rete di RetroArch.

    ``socket_factory()`` (socket UDP), ``clock`` e ``sleep`` sono
    sostituibili nei test. Gli errori diventano ``RetroArchError`` con un
    messaggio leggibile.
    """

    def __init__(self, port, host=HOST, timeout=TIMEOUT, socket_factory=None, clock=time.monotonic,
                 sleep=time.sleep):
        self.address = (host, int(port))
        self.timeout = timeout
        self.socket_factory = socket_factory or (lambda: socket.socket(socket.AF_INET, socket.SOCK_DGRAM))
        self.clock = clock
        self.sleep = sleep
        # Fine dell'ultimo ``save_state`` riuscito, per ``load_state``.
        self.saved_at = None

    def send(self, command):
        """Invia ``command`` senza aspettare risposta."""
        sock = self.socket_factory()
        try:
            sock.sendto(command.encode('ascii'), self.address)
        except OSError as error:
            log.warning('Comando %s non inviato a RetroArch: %s', command, error)
            raise RetroArchError(NO_ANSWER)
        finally:
            sock.close()

    def ask(self, command):
        """Invia ``command`` e restituisce la risposta come testo, oppure ``None`` se non arriva."""
        sock = self.socket_factory()
        try:
            sock.settimeout(self.timeout)
            sock.sendto(command.encode('ascii'), self.address)
            data, _ = sock.recvfrom(BUFFER)
        except OSError:
            return None
        finally:
            sock.close()
        return data.decode('utf-8', 'replace').strip()

    def status(self):
        """``PLAYING``, ``PAUSED`` o un altro stato di RetroArch; ``None`` se non risponde."""
        return parse_status(self.ask('GET_STATUS'))

    def wait_status(self, wanted, timeout=TOGGLE_TIMEOUT):
        """Aspetta che lo stato diventi ``wanted``; restituisce l'ultimo stato letto."""
        deadline = self.clock() + timeout
        current = self.status()
        while current != wanted and self.clock() < deadline:
            self.sleep(POLL)
            current = self.status()
        return current

    def pause(self):
        """Mette in pausa il gioco; non fa nulla se è già in pausa.

        Con ``GET_STATUS`` prima e dopo ``PAUSE_TOGGLE``, per non invertire
        una pausa già presente. ``RetroArchError`` se RetroArch non risponde
        o non va in pausa.
        """
        current = self.status()
        if current == PAUSED:
            return
        if current != PLAYING:
            raise RetroArchError(NO_ANSWER if current is None else 'Nessun gioco in corso in RetroArch.')
        self.send('PAUSE_TOGGLE')
        if self.wait_status(PAUSED) != PAUSED:
            raise RetroArchError('RetroArch non si è messo in pausa.')

    def resume(self):
        """Toglie la pausa se il gioco è ancora in pausa. Restituisce vero se ha mandato ``PAUSE_TOGGLE``."""
        if self.status() != PAUSED:
            return False
        self.send('PAUSE_TOGGLE')
        return True

    def save_state(self, path, timeout=SAVE_TIMEOUT, thumb_timeout=THUMB_TIMEOUT):
        """Salva lo stato nello slot attivo e aspetta il file ``path`` (``<nome>.state``).

        Il file dello slot di lavoro e la sua miniatura ``<path>.png`` si
        cancellano prima del comando, così quelli che compaiono sono
        sicuramente nuovi (la data di modifica non basta: due salvataggi
        ravvicinati possono averla uguale). Si aspetta anche la miniatura per
        al massimo ``thumb_timeout`` secondi: se non arriva lo stato resta
        valido. Restituisce vero se c'è la miniatura. ``RetroArchError`` se
        lo stato non compare entro ``timeout``.
        """
        thumb = path + '.png'
        for name in (path, thumb):
            try:
                os.unlink(name)
            except FileNotFoundError:
                pass
            except OSError as error:
                log.warning('Slot di lavoro %s non cancellato: %s', name, error)
                raise RetroArchError('Cartella dei salvataggi non utilizzabile.')
        self.send('SAVE_STATE')
        deadline = self.clock() + timeout
        current = file_mark(path)
        while current is None:
            if self.clock() >= deadline:
                raise RetroArchError('RetroArch non ha salvato lo stato.')
            self.sleep(POLL)
            current = file_mark(path)
        # Il file si scrive per intero: si aspetta che resti uguale per ``STABLE_POLLS`` giri.
        stable = 0
        while stable < STABLE_POLLS and self.clock() < deadline:
            self.sleep(POLL)
            latest = file_mark(path)
            stable = stable + 1 if latest == current else 0
            current = latest
        self.saved_at = self.clock()
        return self.wait_png(thumb, thumb_timeout)

    def wait_png(self, path, timeout):
        """Aspetta che ``path`` sia un PNG completo (``fsutil.png_complete``); falso allo scadere del tempo."""
        deadline = self.clock() + timeout
        while not png_complete(path):
            if self.clock() >= deadline:
                return False
            self.sleep(POLL)
        return True

    def screenshot(self, directory, timeout=SHOT_TIMEOUT):
        """Cattura lo schermo del gioco con ``SCREENSHOT`` e restituisce il percorso del PNG nuovo.

        Il file è il primo ``.png`` comparso in ``directory`` dopo il comando
        che non sia la miniatura di uno stato. ``None`` se non compare entro
        ``timeout`` secondi.
        """
        before = set(shot_names(directory))
        self.send('SCREENSHOT')
        deadline = self.clock() + timeout
        while True:
            fresh = sorted(set(shot_names(directory)) - before)
            if fresh:
                path = os.path.join(directory, fresh[-1])
                return path if self.wait_png(path, max(0, deadline - self.clock())) else None
            if self.clock() >= deadline:
                return None
            self.sleep(POLL)

    def load_state(self):
        """Carica lo stato dello slot attivo (``<nome>.state``). ``RetroArchError`` se RetroArch non risponde.

        Prima ferma la registrazione dello spezzone del salvaschermo (``replays``), se c'è: mentre registra
        RetroArch rifiuta gli stati che non vengono dalla registrazione («Non dalla registrazione corrente»).
        """
        if self.status() is None:
            raise RetroArchError(NO_ANSWER)
        if self.saved_at is not None:
            # Appena dopo un salvataggio RetroArch scarterebbe il caricamento (vedi in cima).
            left = self.saved_at + LOAD_AFTER_SAVE - self.clock()
            if left > 0:
                self.sleep(left)
        self.send('HALT_REPLAY')
        self.send('LOAD_STATE')

    def show_message(self, text):
        """Scritta di RetroArch in basso a sinistra per qualche secondo (``SHOW_MSG``, testo UTF-8)."""
        sock = self.socket_factory()
        try:
            sock.sendto(('SHOW_MSG ' + text).encode('utf-8'), self.address)
        except OSError as error:
            log.warning('Scritta non inviata a RetroArch: %s', error)
        finally:
            sock.close()
