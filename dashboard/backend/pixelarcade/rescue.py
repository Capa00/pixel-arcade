"""Salvataggi di soccorso: stati periodici in partita e scelta del «Riprendi» dopo un blocco.

Un gioco bloccato non manda segnali: RetroArch continua a girare e il log è
normale. All'uscita lo stato automatico diventerebbe il «Riprendi»
(``PlayService.keep_saves``) e coprirebbe quello buono. Per questo:

- **Stati periodici.** Durante la partita, con almeno un profilo in gioco,
  ``PeriodicSaver`` salva lo stato ogni ``interval`` secondi di gioco (le
  pause del menu in partita non contano), con lo stesso metodo del menu dei
  salvataggi: ``SAVE_STATE`` nello slot di lavoro, poi il file si sposta in
  ``<saves>/rescue/_run/``. Restano gli ultimi ``KEEP``. Se RetroArch non
  salva (hardcore di RetroAchievements, core senza stati) si smette fino
  alla fine della partita.
- **Soccorso.** La combinazione di emergenza chiude il gioco chiedendo il
  soccorso; all'uscita normale lo chiedono gli indizi di blocco (miniatura
  finale quasi nera, oppure le ultime ``SAME_NEEDED`` miniature periodiche
  identiche alla finale). Allora lo stato finale non diventa il «Riprendi»
  finché il giocatore non sceglie da dove riprendere: uno stato periodico
  di questa partita, uno conservato dalle partite prima, quello finale o il
  «Riprendi» di prima.
- **Conservazione.** Gli stati periodici di una partita finita bene restano
  in ``<saves>/rescue/<chiave del gioco>/`` al posto di quelli della partita
  prima: se il «Riprendi» successivo parte già bloccato si può ancora
  tornare indietro. Dopo una scelta restano gli stati fino a quello scelto
  (quelli dopo erano già bloccati), al massimo ``STORE_MAX``.
"""
import hashlib
import json
import logging
import os
import shutil
import struct
import threading
import time
import zlib

from .errors import ConfigError, ConflictError, RetroArchError
from .fsutil import atomic_copy, atomic_write_text, png_complete
from .repositories.cores import now_iso
from .saves import game_key

log = logging.getLogger(__name__)

RUN_DIR = '_run'
META = 'meta.json'
# Stati periodici della partita in corso e stati conservati per gioco.
KEEP = 5
STORE_MAX = 10
# Giro del thread dei salvataggi periodici, in secondi.
TICK = 1.0
# Miniatura «quasi nera»: almeno ``DARK_SHARE`` dei pixel con luminosità sotto ``DARK_LEVEL`` (0–255).
DARK_LEVEL = 24
DARK_SHARE = 0.98
# Miniature periodiche identiche alla finale perché l'immagine si consideri ferma.
SAME_NEEDED = 2

COMBO = 'combo'
SUSPECT = 'suspect'
FINAL = 'final'
PREVIOUS = 'previous'

PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'
PNG_CHANNELS = {0: 1, 2: 3, 4: 2, 6: 4}


# --- Miniature ---------------------------------------------------------------------

def png_chunks(path):
    """``(IHDR, IDAT uniti)`` di un PNG; ``None`` se il file non si legge o non è un PNG."""
    try:
        with open(path, 'rb') as stream:
            data = stream.read()
    except OSError:
        return None
    if not data.startswith(PNG_SIGNATURE):
        return None
    header = None
    image = []
    at = len(PNG_SIGNATURE)
    while at + 8 <= len(data):
        length, kind = struct.unpack('>I4s', data[at:at + 8])
        body = data[at + 8:at + 8 + length]
        if kind == b'IHDR':
            header = body
        elif kind == b'IDAT':
            image.append(body)
        elif kind == b'IEND':
            break
        at += 12 + length
    if header is None or len(header) < 13 or not image:
        return None
    return header, b''.join(image)


def png_digest(path):
    """Impronta dell'immagine (dati compressi): due miniature scritte da RetroArch uguali hanno la stessa."""
    chunks = png_chunks(path)
    return hashlib.sha1(chunks[1]).hexdigest() if chunks else None


def paeth(left, up, corner):
    estimate = left + up - corner
    to_left, to_up, to_corner = abs(estimate - left), abs(estimate - up), abs(estimate - corner)
    if to_left <= to_up and to_left <= to_corner:
        return left
    return up if to_up <= to_corner else corner


def png_rows(path):
    """Righe di pixel di un PNG a 8 bit non interlacciato: ``(canali, [bytes])``; ``None`` per gli altri."""
    chunks = png_chunks(path)
    if chunks is None:
        return None
    header, compressed = chunks
    width, height, depth, color, _, _, interlace = struct.unpack('>IIBBBBB', header[:13])
    channels = PNG_CHANNELS.get(color)
    if depth != 8 or channels is None or interlace or not width or not height:
        return None
    try:
        raw = zlib.decompress(compressed)
    except zlib.error:
        return None
    stride = width * channels
    if len(raw) < (stride + 1) * height:
        return None
    rows = []
    previous = bytearray(stride)
    for index in range(height):
        start = index * (stride + 1)
        kind = raw[start]
        row = bytearray(raw[start + 1:start + 1 + stride])
        if kind == 1:
            for at in range(channels, stride):
                row[at] = (row[at] + row[at - channels]) & 0xff
        elif kind == 2:
            row = bytearray((a + b) & 0xff for a, b in zip(row, previous))
        elif kind == 3:
            for at in range(stride):
                left = row[at - channels] if at >= channels else 0
                row[at] = (row[at] + ((left + previous[at]) >> 1)) & 0xff
        elif kind == 4:
            for at in range(stride):
                left = row[at - channels] if at >= channels else 0
                corner = previous[at - channels] if at >= channels else 0
                row[at] = (row[at] + paeth(left, previous[at], corner)) & 0xff
        elif kind != 0:
            return None
        rows.append(bytes(row))
        previous = row
    return channels, rows


def is_dark(path):
    """Vero se la miniatura è quasi nera (vedi ``DARK_SHARE``); falso se non si legge."""
    decoded = png_rows(path)
    if decoded is None:
        return False
    channels, rows = decoded
    colors = min(channels, 3) if channels != 2 else 1
    total = dark = 0
    for row in rows:
        for at in range(0, len(row), channels):
            total += 1
            if max(row[at:at + colors]) < DARK_LEVEL:
                dark += 1
    return total > 0 and dark / total >= DARK_SHARE


# --- Archivio ----------------------------------------------------------------------

class RescueStore:
    """File degli stati di soccorso sotto ``<data_dir>/saves/rescue/``.

    ``_run/`` ha gli stati periodici della partita in corso (``<n>.state``,
    ``<n>.png``); ogni gioco ha la sua cartella (``game_key``) con gli
    stati conservati e ``meta.json`` = ``[{id, at, core, thumb, tried}]``,
    dal più recente (``tried``: già scelto in un soccorso).
    """

    def __init__(self, data_dir):
        self.root = os.path.join(data_dir, 'saves', 'rescue')

    def run_dir(self):
        return os.path.join(self.root, RUN_DIR)

    def clear_run(self):
        shutil.rmtree(self.run_dir(), ignore_errors=True)
        os.makedirs(self.run_dir(), mode=0o700, exist_ok=True)

    def game_dir(self, system_id, game_id):
        return os.path.join(self.root, game_key(system_id, game_id))

    def items(self, system_id, game_id):
        """Stati conservati del gioco, dal più recente, con i percorsi: ``[{id, at, core, thumb, tried, state, png}]``."""
        folder = self.game_dir(system_id, game_id)
        try:
            with open(os.path.join(folder, META), encoding='utf-8') as stream:
                entries = json.load(stream)
        except (OSError, ValueError):
            return []
        result = []
        for entry in entries if isinstance(entries, list) else []:
            if not isinstance(entry, dict) or not isinstance(entry.get('id'), str):
                continue
            state = os.path.join(folder, entry['id'] + '.state')
            if os.path.isfile(state):
                png = os.path.join(folder, entry['id'] + '.png')
                result.append(dict(entry, state=state, png=png if png_complete(png) else None))
        return result

    def replace(self, system_id, game_id, entries):
        """Gli stati conservati del gioco diventano ``entries`` (``[{at, core, tried, state, png}]``, dal più recente).

        Restituisce i percorsi dei nuovi ``.state``, nell'ordine di ``entries``.
        """
        folder = self.game_dir(system_id, game_id)
        draft = folder + '.new'
        shutil.rmtree(draft, ignore_errors=True)
        if not entries:
            shutil.rmtree(folder, ignore_errors=True)
            return []
        os.makedirs(draft, mode=0o700)
        meta = []
        paths = []
        for index, entry in enumerate(entries[:STORE_MAX]):
            name = 's%d' % index
            atomic_copy(entry['state'], os.path.join(draft, name + '.state'))
            thumb = bool(entry.get('png')) and png_complete(entry['png'])
            if thumb:
                atomic_copy(entry['png'], os.path.join(draft, name + '.png'))
            meta.append({'id': name, 'at': entry['at'], 'core': entry.get('core'), 'thumb': thumb,
                         'tried': bool(entry.get('tried'))})
            paths.append(os.path.join(folder, name + '.state'))
        atomic_write_text(os.path.join(draft, META), json.dumps(meta, ensure_ascii=False))
        shutil.rmtree(folder, ignore_errors=True)
        os.replace(draft, folder)
        return paths


# --- Salvataggi periodici --------------------------------------------------------------

class PeriodicSaver:
    """Thread degli stati periodici di una partita (vedi il modulo).

    ``ingame`` è l'``IngameService`` (blocco delle operazioni, menu aperto,
    client dei comandi di rete); ``info`` i dati della partita
    (``PlayService.ingame_info``); ``pending()`` è vero finché lo stato del
    «Riprendi» non è caricato (``LATE_STATE_CORES``): lo slot di lavoro
    allora non si tocca.
    """

    def __init__(self, store, ingame, info, core, interval, pending, clock=time.monotonic, now=now_iso):
        self.store = store
        self.ingame = ingame
        self.info = info
        self.core = core
        self.interval = interval
        self.pending = pending
        self.clock = clock
        self.now = now
        self.stop_event = threading.Event()
        self.lock = threading.Lock()
        self.saved = []
        self.count = 0
        self.thread = None
        # Secondi di gioco dall'inizio della partita, senza pause del menu e attesa dello stato (Sfida trofeo).
        self.total = 0.0

    def start(self):
        self.thread = threading.Thread(target=self.run, name='periodic-save', daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread is not None and self.thread is not threading.current_thread():
            self.thread.join(10)

    def items(self):
        """Stati di questa partita, dal più vecchio: ``[{at, core, state, png, played}]``.

        ``played`` sono i secondi di gioco della partita al momento dello stato (vedi ``played``).
        """
        with self.lock:
            return list(self.saved)

    def played(self):
        """Secondi di gioco dall'inizio della partita, contati come l'intervallo (al secondo)."""
        with self.lock:
            return self.total

    def run(self):
        played = 0.0
        last = self.clock()
        saving = True
        while not self.stop_event.wait(TICK):
            now = self.clock()
            step, last = now - last, now
            if self.ingame.menu_open() or self.pending():
                continue
            played += step
            with self.lock:
                self.total += step
            if not saving or played < self.interval:
                continue
            outcome = self.save_once()
            if outcome is None:
                # Niente più stati, ma il tempo di gioco si conta ancora (Sfida trofeo).
                saving = False
            elif outcome:
                played = 0.0

    def save_once(self):
        """Un salvataggio: vero se riuscito, falso se rimandato (un'altra operazione in corso), ``None`` per smettere."""
        try:
            self.ingame.begin()
        except ConflictError:
            return False
        try:
            path = os.path.join(self.info['session'], self.info['content'] + '.state')
            thumb = self.ingame.net_factory().save_state(path)
            self.count += 1
            target = os.path.join(self.store.run_dir(), '%d.state' % self.count)
            os.replace(path, target)
            png = None
            if thumb:
                png = target[:-len('.state')] + '.png'
                os.replace(path + '.png', png)
        except (RetroArchError, OSError) as error:
            log.warning('Salvataggio periodico non riuscito, niente più stati periodici in questa partita: %s',
                        error)
            return None
        finally:
            self.ingame.end()
        with self.lock:
            self.saved.append({'at': self.now(), 'core': self.core, 'state': target, 'png': png,
                               'played': self.total})
            dropped = self.saved[:-KEEP]
            self.saved = self.saved[-KEEP:]
        for entry in dropped:
            for name in (entry['state'], entry['png']):
                if name:
                    try:
                        os.unlink(name)
                    except OSError:
                        pass
        return True


# --- Soccorso ------------------------------------------------------------------------

def suspicious(final_png, run_items):
    """Vero se lo stato finale sembra di un gioco bloccato (vedi il modulo)."""
    if not final_png or not png_complete(final_png):
        return False
    if len(run_items) >= SAME_NEEDED:
        final = png_digest(final_png)
        recent = [png_digest(entry['png']) if entry['png'] else None for entry in run_items[-SAME_NEEDED:]]
        if final is not None and all(digest == final for digest in recent):
            return True
    return is_dark(final_png)


class RescueService:
    """Stati periodici e soccorso dopo un blocco (vedi il modulo).

    ``ingame`` è l'``IngameService``; ``interval(system_id, game_id)`` i
    secondi tra due stati periodici (0 = disattivati, dalla pagina
    «Configurazione»).
    """

    def __init__(self, store, ingame, interval, clock=time.monotonic, now=now_iso, saver_factory=None):
        self.store = store
        self.ingame = ingame
        self.interval = interval
        self.clock = clock
        self.now = now
        self.saver_factory = saver_factory or PeriodicSaver
        self.lock = threading.Lock()
        self.saver = None
        self.game = None
        self.pending = None

    # --- Partita ---------------------------------------------------------------

    def started(self, info, core, pending):
        """Inizio della partita (``info`` = ``PlayService.ingame_info``): avvia gli stati periodici se servono."""
        self.finished()
        game = info['game']
        with self.lock:
            self.game = game
            self.pending = None
        self.store.clear_run()
        try:
            seconds = int(self.interval(game['system'], game['id']) or 0)
        except Exception:
            log.exception('Intervallo degli stati periodici non letto: niente stati periodici.')
            seconds = 0
        if seconds <= 0:
            return
        saver = self.saver_factory(self.store, self.ingame, info, core, seconds, pending, clock=self.clock,
                                   now=self.now)
        with self.lock:
            self.saver = saver
        saver.start()
        log.info('Stati periodici ogni %d s per %s/%s.', seconds, game['system'], game['id'])

    def finished(self):
        """Fine di RetroArch: il thread degli stati periodici si ferma (gli stati restano)."""
        with self.lock:
            saver = self.saver
        if saver is not None:
            saver.stop()

    def run_items(self):
        with self.lock:
            saver = self.saver
        return saver.items() if saver is not None else []

    def played(self):
        """Secondi di gioco della partita in corso (``PeriodicSaver.played``); ``None`` senza stati periodici."""
        with self.lock:
            saver = self.saver
        return saver.played() if saver is not None else None

    # --- Fine partita ----------------------------------------------------------------

    def check(self, final_png, requested):
        """Motivo del soccorso (``combo`` o ``suspect``), oppure ``None`` se la partita è finita bene."""
        if requested:
            return COMBO
        return SUSPECT if suspicious(final_png, self.run_items()) else None

    def clean_end(self):
        """Partita finita bene: i suoi stati periodici prendono il posto di quelli conservati."""
        game = self.take_game()
        items = list(reversed(self.run_items()))
        self.drop_saver()
        if game is None or not items:
            return
        try:
            self.store.replace(game['system'], game['id'], items)
        except OSError:
            log.exception('Stati di soccorso di %s/%s non conservati', game['system'], game['id'])

    def take_game(self):
        with self.lock:
            return self.game

    def drop_saver(self):
        with self.lock:
            self.saver = None

    def choices(self):
        """Voci della scelta: stati di questa partita, poi quelli conservati, dal più recente.

        ``[{id, at, core, thumb, run, tried, state, png}]``; gli id sono
        ``r<n>`` (questa partita) e ``s<n>`` (conservati).
        """
        game = self.take_game()
        result = []
        for index, entry in enumerate(reversed(self.run_items())):
            result.append({'id': 'r%d' % index, 'at': entry['at'], 'core': entry['core'],
                           'thumb': bool(entry['png']), 'run': True, 'tried': False, 'state': entry['state'],
                           'png': entry['png']})
        if game is not None:
            for entry in self.store.items(game['system'], game['id']):
                result.append({'id': entry['id'], 'at': entry['at'], 'core': entry.get('core'),
                               'thumb': entry['png'] is not None, 'run': False,
                               'tried': bool(entry.get('tried')), 'state': entry['state'], 'png': entry['png']})
        return result

    def open(self, reason, final):
        """Apre il soccorso e restituisce la domanda per ``GET /api/run`` (``{reason, final, items}``).

        ``final`` è ``(stato, miniatura)`` dello stato finale, oppure ``None``.
        """
        items = self.choices()
        with self.lock:
            self.pending = {'reason': reason, 'final': final, 'items': items}
        return {'reason': reason, 'final': bool(final),
                'items': [{key: entry[key] for key in ('id', 'at', 'thumb', 'run', 'tried')} for entry in items]}

    def thumb(self, item_id):
        """Miniatura di una voce del soccorso aperto, oppure ``None``."""
        with self.lock:
            pending = self.pending
        if pending is None:
            return None
        for entry in pending['items']:
            if entry['id'] == item_id and entry['png'] and png_complete(entry['png']):
                return entry['png']
        if item_id == FINAL and pending['final'] and png_complete(pending['final'][1] or ''):
            return pending['final'][1]
        return None

    def chosen(self, choice):
        """Stato scelto: ``(stato, miniatura, core)``, oppure ``None`` per «Riprendi precedente».

        ``final`` è lo stato finale (se c'è). ``ConfigError`` se la voce non esiste.
        """
        with self.lock:
            pending = self.pending
        if pending is None:
            raise ConflictError('Nessun soccorso aperto.')
        if choice == PREVIOUS:
            return None
        if choice == FINAL:
            if not pending['final']:
                raise ConfigError('Stato finale non disponibile.')
            return pending['final'][0], pending['final'][1], None
        for entry in pending['items']:
            if entry['id'] == choice:
                return entry['state'], entry['png'], entry['core']
        raise ConfigError('Stato non trovato.')

    def close(self, choice):
        """Dopo la scelta: aggiorna gli stati conservati e chiude il soccorso.

        Con uno stato periodico o conservato la partita riparte da lì: tutte
        le voci restano conservate (al massimo ``STORE_MAX``, sempre con la
        scelta), la scelta segnata come già provata, così se anche lei è
        bloccata se ne sceglie un'altra. Restituisce il percorso della sua
        copia conservata, oppure ``None`` se non si è potuta conservare.
        Con ``final`` la partita conta come finita bene; con ``previous``
        restano quelli conservati di prima; entrambi restituiscono ``None``.
        """
        with self.lock:
            pending, self.pending = self.pending, None
        if pending is None:
            return None
        if choice == FINAL:
            self.clean_end()
            return None
        game = self.take_game()
        items = pending['items']
        position = next((index for index, entry in enumerate(items) if entry['id'] == choice), None)
        path = None
        if choice != PREVIOUS and game is not None and position is not None:
            picked = dict(items[position], tried=True)
            kept = [picked if index == position else entry for index, entry in enumerate(items)]
            if position >= STORE_MAX:
                kept = kept[:STORE_MAX - 1] + [picked]
            try:
                path = self.store.replace(game['system'], game['id'], kept)[min(position, STORE_MAX - 1)]
            except (OSError, IndexError):
                log.exception('Stati di soccorso di %s/%s non aggiornati', game['system'], game['id'])
        self.drop_saver()
        return path
