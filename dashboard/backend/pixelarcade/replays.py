"""Partite rigiocate nel salvaschermo (README «Salvaschermo»): spezzoni registrati da RetroArch.

Prove sulla console (RetroArch 1.22.2, 19 ottobre 2026):

- ``-R`` registra solo dall'accensione; per partire da metà partita si manda
  ``RECORD_REPLAY`` (file ``<contenuto>.replayN`` nella cartella degli stati,
  con lo stato di partenza dentro). ``RECORD_REPLAY`` non fa da interruttore:
  si ferma con ``HALT_REPLAY``. Mentre registra RetroArch rifiuta gli stati
  esterni: ``RetroArchNet.load_state`` manda prima ``HALT_REPLAY``.
- ``-P <file>`` rigioca in modo fedele e ripristina da solo lo stato di
  partenza; i trofei scattano davvero, quindi nella riproduzione sono spenti.
  ``--eof-exit`` non chiude RetroArch: alla riga ``EOF after`` del log la
  dashboard manda ``QUIT``.
- ``SHOW_MSG`` mostra una scritta per qualche secondo: si ripete.

**Registrazione.** Nelle partite normali col P1 registrato (niente prove dei
core, sfide trofeo, console di ``EXCLUDED``) si registra un solo pezzo di
``SEGMENT`` secondi, dopo ``START_AT`` secondi di gioco: ogni
``RECORD_REPLAY`` salva uno stato e rallenta il gioco per un attimo, quindi
uno per partita. Non si registra se il gioco ha già uno spezzone, né se il
salvaschermo non li rigioca (contenuto «Copertine» o attesa «Mai»). A fine
partita (almeno ``MIN_GAME`` secondi) il pezzo diventa lo spezzone del P1 e
va in fondo alla coda di tutta la casa: oltre ``KEEP`` spezzoni si cancella
il più vecchio.

**Riproduzione.** ``start(replay_id)`` copia lo spezzone nella cartella
accanto al file ``--appendconfig`` (la snap di RetroArch non vede le
cartelle nascoste della home) e avvia RetroArch con una configurazione sua:
audio e trofei spenti, nessuno stato automatico, nessun salvataggio interno
nella cartella delle partite.
"""

import logging
import os
import shlex
import shutil
import threading
import time
import uuid

from . import retroarch_cfg, retroarch_net
from .config import CORE_SUFFIX
from .errors import ConflictError, LaunchError
from .fsutil import atomic_copy
from .launcher import RetroArchProcess
from .repositories.cores import now_iso

log = logging.getLogger(__name__)

# Secondi di gioco del pezzo e prima del pezzo, partita minima per tenere uno spezzone, pezzo minimo da mostrare.
SEGMENT = 45
START_AT = 90
MIN_GAME = 180
MIN_CLIP = 20
# Spezzoni tenuti in tutta la casa.
KEEP = 5
# Console (id o preset) senza spezzoni.
EXCLUDED = frozenset({'ps2', 'psp', 'arcade'})
RUN_DIR = '_run'
PLAY_DIR = 'pixel-arcade-replay'
PLAY_CONFIG = 'pixel-arcade-replay.cfg'
# Attese: comparsa del file dopo ``RECORD_REPLAY``, chiusura dopo ``HALT_REPLAY``, ``PLAYING`` all'avvio.
FILE_WAIT = 2.0
HALT_WAIT = 0.4
READY_TIMEOUT = 60
TICK = 1.0
# Ogni quanto si ripete la scritta durante la riproduzione, e attesa di ``QUIT`` prima di terminare.
MESSAGE_EVERY = 4.0
QUIT_GRACE = 3.0
END_MARKERS = ('EOF after', 'riproduzione del film è terminata')
MONTHS = ('gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre',
          'ottobre', 'novembre', 'dicembre')


def allowed(system):
    """Vero se la console (``{id, preset}`` di ``Library.systems``) può avere spezzoni."""
    return bool(system) and system['id'] not in EXCLUDED and system.get('preset') not in EXCLUDED


def day_label(iso):
    """«12 ottobre» da una data ISO."""
    return '%d %s' % (int(iso[8:10]), MONTHS[int(iso[5:7]) - 1])


def choose(segments):
    """Pezzo dello spezzone: quello registrato, se ha il file ed è lungo almeno ``MIN_CLIP`` secondi
    (o ha un trofeo); altrimenti ``None``."""
    for item in segments:
        if item.get('file') and (item.get('trophy') or item['end'] - item['start'] >= MIN_CLIP):
            return item
    return None


class Recorder:
    """Registrazione del pezzo di una partita (vedi il modulo).

    ``net`` è il client dei comandi di rete, ``session`` la cartella degli
    stati di RetroArch, ``run_dir`` dove vanno i pezzi chiusi, ``menu_open()``
    vero col menu della dashboard aperto (il tempo non conta).
    """

    def __init__(self, net, session, run_dir, menu_open, clock=time.monotonic, sleep=time.sleep, segment=SEGMENT,
                 start_at=START_AT):
        self.net = net
        self.session = session
        self.run_dir = run_dir
        self.menu_open = menu_open
        self.clock = clock
        self.sleep = sleep
        self.segment = segment
        self.start_at = start_at
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.segments = []
        self.current = None
        self.played = 0.0
        # Vero quando il pezzo è stato aperto: non se ne apre un altro.
        self.started = False
        self.thread = None

    # --- Thread --------------------------------------------------------------------

    def start(self):
        self.thread = threading.Thread(target=self.run, name='replay-record', daemon=True)
        self.thread.start()

    def run(self):
        deadline = self.clock() + READY_TIMEOUT
        while not self.stop_event.is_set() and self.clock() < deadline:
            try:
                if self.net.status() == retroarch_net.PLAYING:
                    break
            except Exception:
                pass
            self.stop_event.wait(TICK)
        last = self.clock()
        while not self.stop_event.wait(TICK):
            now = self.clock()
            step, last = now - last, now
            if self.menu_open():
                continue
            self.tick(step)

    def stop(self):
        """Fine di RetroArch: il thread si ferma (il pezzo in corso si chiude con ``finish``)."""
        self.stop_event.set()
        if self.thread is not None and self.thread is not threading.current_thread():
            self.thread.join(10)

    # --- Pezzi ---------------------------------------------------------------------

    def replay_files(self):
        try:
            names = os.listdir(self.session)
        except OSError:
            return set()
        return {os.path.join(self.session, name) for name in names if '.replay' in name}

    def begin(self):
        """Apre il pezzo: ``RECORD_REPLAY`` e il file che RetroArch crea."""
        self.started = True
        before = self.replay_files()
        try:
            self.net.send('RECORD_REPLAY')
        except Exception:
            log.warning('Registrazione dello spezzone non avviata.')
            return
        found = None
        waited = 0.0
        while found is None and waited < FILE_WAIT:
            fresh = self.replay_files() - before
            if fresh:
                found = sorted(fresh)[-1]
                break
            self.sleep(0.1)
            waited += 0.1
        with self.lock:
            self.current = {'index': 1, 'source': found, 'start': self.played, 'trophy': None}

    def tick(self, step):
        """Secondi di gioco in più: apre il pezzo dopo ``start_at`` e lo chiude dopo ``segment``.

        Il tempo si conta fino alla fine della partita (``MIN_GAME``).
        """
        with self.lock:
            self.played += step
            due = not self.started and self.played >= self.start_at
            done = self.current is not None and self.played - self.current['start'] >= self.segment
        if due:
            self.begin()
        elif done:
            self.halt()

    def halt(self):
        """Chiude il pezzo (``HALT_REPLAY``)."""
        try:
            self.net.send('HALT_REPLAY')
        except Exception:
            pass
        self.sleep(HALT_WAIT)
        self.close_current()

    def close_current(self):
        with self.lock:
            current, self.current = self.current, None
            played = self.played
        if current is None:
            return
        item = {'index': current['index'], 'start': current['start'], 'end': played, 'trophy': current['trophy'],
                'file': None}
        source = current['source']
        if source and os.path.exists(source) and os.path.getsize(source) > 0:
            os.makedirs(self.run_dir, mode=0o700, exist_ok=True)
            target = os.path.join(self.run_dir, '%d.replay' % current['index'])
            try:
                shutil.move(source, target)
                item['file'] = target
            except OSError:
                log.exception('Pezzo %s dello spezzone non spostato', source)
        with self.lock:
            self.segments.append(item)

    def awarded(self, title):
        """Trofeo sbloccato durante il pezzo: lo spezzone lo ricorda."""
        with self.lock:
            if self.current is not None:
                self.current['trophy'] = title

    def finish(self):
        """Dopo l'uscita di RetroArch (che chiude il file): pezzi completi e secondi di gioco."""
        self.stop()
        self.close_current()
        with self.lock:
            return list(self.segments), self.played


class ReplayService:
    """Spezzoni delle partite: registrazione (``game_started`` … ``game_finished``) e riproduzione.

    ``play`` è il ``PlayService`` (configurazione, percorsi dei giochi, core
    installati, partita in corso); ``library`` dà le console e i giochi;
    ``profiles_repo`` i nomi. ``net_factory()`` dà il client dei comandi di rete.
    """

    def __init__(self, repo, profiles_repo, library, play, data_dir, net_factory, process_factory=None,
                 spawn=None, clock=time.monotonic, now=now_iso, sleep=time.sleep):
        self.repo = repo
        self.profiles = profiles_repo
        self.library = library
        self.play = play
        self.root = os.path.join(data_dir, 'saves', 'replays')
        self.net_factory = net_factory
        self.process_factory = process_factory or self.default_process
        self.spawn = spawn or self.spawn_thread
        self.clock = clock
        self.now = now
        self.sleep = sleep
        self.lock = threading.Lock()
        self.recorder = None
        self.recording = None
        # Riproduzione: processo, profilo, motivo della fine (``ended``, ``stopped``, ``closed``), ultime mostre.
        self.process = None
        self.showing = None
        self.reason = None
        self.stop_requested = False
        self.ended = False
        self.shown = {}
        # Vero col menu della dashboard aperto in partita (``IngameService.menu_open``); si assegna dopo.
        self.menu_open = lambda: False

    @staticmethod
    def spawn_thread(target):
        thread = threading.Thread(target=target, name='replay-play', daemon=True)
        thread.start()

    def run_dir(self):
        return os.path.join(self.root, RUN_DIR)

    def system(self, system_id):
        return next((item for item in self.library.systems() if item['id'] == system_id), None)

    # --- Registrazione ----------------------------------------------------------------

    def wanted(self, game):
        """Vero se il salvaschermo rigioca gli spezzoni e il gioco non ne ha già uno."""
        settings = self.play.config.get()
        if settings.get('ui.screensaver_content') == 'covers' or settings.get('ui.screensaver_minutes') == 0:
            return False
        return not any(item['system'] == game['system'] and item['game'] == game['id'] for item in self.repo.all())

    def game_started(self, game, core, players, session, eligible=True):
        """Inizio di una partita: registra se il P1 è un profilo, la console lo permette e serve (``wanted``)."""
        self.game_finished_quietly()
        shutil.rmtree(self.run_dir(), ignore_errors=True)
        first = list(players or [None])[0]
        if not eligible or not isinstance(first, int) or isinstance(first, bool) or self.profiles.get(first) is None:
            return
        if not allowed(self.system(game['system'])) or not self.wanted(game):
            return
        recorder = Recorder(self.net_factory(), session, self.run_dir(), self.menu_open, self.clock, self.sleep)
        with self.lock:
            self.recorder = recorder
            self.recording = {'account': first, 'system': game['system'], 'game': game['id'], 'core': core}
        recorder.start()

    def awarded(self, item):
        with self.lock:
            recorder = self.recorder
        if recorder is not None:
            recorder.awarded(item['title'])

    def game_finished_quietly(self):
        with self.lock:
            recorder, self.recorder = self.recorder, None
            self.recording = None
        if recorder is not None:
            recorder.stop()

    def game_finished(self):
        """Fine partita (RetroArch chiuso): lo spezzone scelto va in fondo alla coda."""
        with self.lock:
            recorder, self.recorder = self.recorder, None
            recording, self.recording = self.recording, None
        if recorder is None:
            return None
        segments, total = recorder.finish()
        try:
            if total < MIN_GAME:
                return None
            chosen = choose(segments)
            if chosen is None:
                return None
            return self.keep(recording, chosen)
        finally:
            shutil.rmtree(self.run_dir(), ignore_errors=True)

    def keep(self, recording, segment):
        name = uuid.uuid4().hex + '.replay'
        os.makedirs(self.root, mode=0o700, exist_ok=True)
        target = os.path.join(self.root, name)
        shutil.move(segment['file'], target)
        replay = {'account': recording['account'], 'system': recording['system'], 'game': recording['game'],
                  'core': recording['core'], 'file': name, 'size': os.path.getsize(target),
                  'seconds': int(round(segment['end'] - segment['start'])), 'trophy': segment.get('trophy'),
                  'recordedAt': self.now()}
        replay['id'] = self.repo.add(replay)
        self.prune()
        log.info('Spezzone del profilo %s: %s/%s, %d s%s.', recording['account'], recording['system'],
                 recording['game'], replay['seconds'], ' (trofeo)' if replay['trophy'] else '')
        return replay

    def remove_file(self, name):
        try:
            os.unlink(os.path.join(self.root, name))
        except OSError:
            pass

    def prune(self):
        """Oltre ``KEEP`` spezzoni si cancellano i più vecchi."""
        replays = self.repo.all()
        for item in replays[:max(0, len(replays) - KEEP)]:
            self.repo.delete(item['id'])
            self.remove_file(item['file'])
            self.shown.pop(item['id'], None)

    # --- Riproduzione -----------------------------------------------------------------

    def playable(self, item):
        return (os.path.exists(os.path.join(self.root, item['file']))
                and self.library.find(item['system'], item['game']) is not None
                and self.play.installed(item['core']))

    def next(self):
        """Spezzone da mostrare (quello mostrato meno di recente), oppure ``None``.

        ``{id, account, name, color, system, game, title, date, seconds, trophy}``.
        """
        names = {row['id']: row for row in self.profiles.list()}
        candidates = [item for item in self.repo.all() if item['account'] in names and self.playable(item)]
        if not candidates:
            return None
        item = min(candidates, key=lambda entry: (self.shown.get(entry['id'], 0.0), entry['id']))
        return self.describe(item, names[item['account']])

    def describe(self, item, profile):
        game = self.library.find(item['system'], item['game']) or {}
        return {'id': item['id'], 'account': item['account'], 'name': profile['name'], 'color': profile.get('color'),
                'system': item['system'], 'game': item['game'], 'title': game.get('title') or item['game'],
                'date': day_label(item['recordedAt']), 'seconds': item['seconds'], 'trophy': item['trophy']}

    def caption(self, info):
        return '%s · %s · %s' % (info['name'], info['title'], info['date'])

    def start(self, replay_id):
        """Rigioca lo spezzone ``replay_id``. 409 con una partita o uno spezzone in corso."""
        if self.play.busy():
            raise ConflictError('C\'è una partita in corso.')
        with self.lock:
            if self.process is not None:
                raise ConflictError('Uno spezzone è già in corso.')
        item = self.repo.get(replay_id) if isinstance(replay_id, int) else None
        profile = self.profiles.get(item['account']) if item is not None else None
        if item is None or profile is None or not self.playable(item):
            raise LaunchError('Spezzone non disponibile.')
        info = self.describe(item, profile)
        appendconfig = self.play.config.resolve_path('paths.appendconfig')
        folder = os.path.join(os.path.dirname(os.path.abspath(appendconfig)), PLAY_DIR)
        shutil.rmtree(folder, ignore_errors=True)
        os.makedirs(folder, mode=0o700)
        replay = os.path.join(folder, 'clip.replay')
        atomic_copy(os.path.join(self.root, item['file']), replay)
        config = os.path.join(os.path.dirname(os.path.abspath(appendconfig)), PLAY_CONFIG)
        retroarch_cfg.write_append(config, self.play.known_keys(), self.options(folder))
        game = self.library.find(item['system'], item['game'])
        process = self.process_factory(item['core'], self.play.rom_path(item['system'], game), config, replay)
        process.add_listener(self.log_line)
        with self.lock:
            self.process = process
            self.showing = info
            self.reason = None
            self.stop_requested = False
            self.ended = False
            self.shown[replay_id] = self.clock()
        process.start()
        self.spawn(lambda: self.watch(process, info))
        return self.status()

    def options(self, folder):
        """Configurazione della riproduzione: come le partite, ma muta, senza trofei, stati né salvataggi."""
        port = self.play.config.get().get('retroarch.network_port', retroarch_cfg.NETWORK_CMD_PORT)
        values = {}
        for key, value in (retroarch_cfg.append_options() + retroarch_cfg.session_options(folder, port)
                           + [('savestate_auto_save', 'false'), ('savestate_auto_load', 'false'),
                              ('savestate_thumbnail_enable', 'false'), ('audio_enable', 'false'),
                              ('cheevos_enable', 'false'), ('pause_nonactive', 'false')]):
            values[key] = value
        return list(values.items())

    def default_process(self, core, rom_path, config, replay):
        settings = self.play.config.get()
        core_path = os.path.join(self.play.config.resolve_path('paths.cores'), core + CORE_SUFFIX)
        return RetroArchProcess(shlex.split(settings['retroarch.command']), core_path, rom_path, config,
                                self.clock, extra=['-P', replay])

    def log_line(self, line):
        """Fine del filmato nel log: RetroArch non si chiude da solo, si manda ``QUIT``."""
        if '[Replay]' in line and any(marker in line for marker in END_MARKERS):
            with self.lock:
                if self.ended:
                    return
                self.ended = True
            try:
                self.net_factory().send('QUIT')
            except Exception:
                pass

    def watch(self, process, info):
        """Scritta ripetuta finché RetroArch è aperto; poi la riproduzione risulta finita."""
        net = self.net_factory()
        caption = self.caption(info)
        while process.returncode is None:
            try:
                net.show_message(caption)
            except Exception:
                pass
            process.wait(MESSAGE_EVERY)
        with self.lock:
            if self.process is process:
                self.process = None
                if self.stop_requested:
                    self.reason = 'stopped'
                elif self.ended:
                    self.reason = 'ended'
                else:
                    self.reason = 'closed'

    def status(self):
        """``{playing, reason, showing}``: ``reason`` dice come è finito l'ultimo spezzone."""
        with self.lock:
            return {'playing': self.process is not None, 'reason': self.reason, 'showing': self.showing}

    def stop(self):
        """Chiude lo spezzone in corso (``QUIT``, poi terminazione); non fa nulla se non ce n'è."""
        with self.lock:
            process = self.process
            self.stop_requested = True
        if process is None:
            return self.status()
        try:
            self.net_factory().send('QUIT')
        except Exception:
            pass
        if process.wait(QUIT_GRACE) is None:
            process.terminate()
        with self.lock:
            if self.process is process:
                self.process = None
                self.reason = 'stopped'
        return self.status()
