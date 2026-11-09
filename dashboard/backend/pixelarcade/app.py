"""Riga di comando, composizione dei servizi e avvio di Chrome."""
import argparse
import json
import logging
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

from . import __version__, addons
from .bios import BiosService
from .config import ConfigService
from .controls import ControlsService
from .core_download import CoreDownloader
from .core_options import CoreOptionsCatalog
from .cpu import CpuBoost
from .db import Database
from .errors import ConfigError, ConflictError, PixelArcadeError, RetroArchError
from .gameconfig import GameConfigService
from .gameinfo import GameInfo
from .ingame import IngameService
from .notifications import Notifications
from .rescue import RescueService, RescueStore
from .joypads import JoypadService
from .leaderboard import LeaderboardService
from .library import Library
from .play import PlayService
from .gravatar import GravatarCache, cache_dir as avatars_dir
from .consoles import ConsoleRowService
from .playlists import PlaylistService
from .profiles import ProfileService
from .ra_client import RAClient
from .repositories.controls import ControlsRepository
from .repositories.bios import BiosRepository
from .repositories.challenges import ChallengesRepository
from .repositories.cores import CoresRepository, now_iso
from .repositories.gameconfig import GameConfigRepository
from .repositories.consoles import ConsolesRepository
from .repositories.playlists import PlaylistsRepository
from .repositories.profiles import ProfilesRepository
from .repositories.retroachievements import RARepository
from .repositories.saves import SavesRepository
from .repositories.sessions import SessionsRepository
from .repositories.settings import SettingsRepository
from .repositories.replays import ReplaysRepository
from .repositories.tournament_matches import TournamentMatchesRepository
from .repositories.tournament_rewards import TournamentRewardsRepository
from .repositories.tournaments import TournamentsRepository
from .repositories.trophy_challenges import TrophyChallengesRepository
from .repositories.wrapped import WrappedRepository
from .retroachievements import RAService
from .retroarch_cfg import read_known_keys, retroarch_cfg_path
from .saves import SaveStore
from .thumbnails import ImageCache, cache_dir
from .web.server import create_server
from .replays import ReplayService
from .tournament_run import TournamentRunService
from .tournaments import TournamentService
from .trophy_challenges import TrophyChallengeService
from .wrapped import WrappedService

log = logging.getLogger('pixelarcade')

# Cartella che contiene dashboard/ (workspace/): base dei percorsi relativi.
DEFAULT_BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

BROWSERS = ('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser')
# Finestra app a schermo intero invece di --kiosk: la modalità kiosk disattiva
# il menu contestuale di Chrome, che invece deve restare disponibile.
# I tasti del joypad non sbloccano l'audio di Chrome: suoni e musica della dashboard partono senza un clic.
# Chrome della dashboard senza portachiavi di GNOME: con il login automatico chiederebbe la password.
BROWSER_FLAGS = (
    '--start-fullscreen',
    '--password-store=basic',
    '--autoplay-policy=no-user-gesture-required',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-search-engine-choice-screen',
    '--disable-session-crashed-bubble',
    '--noerrdialogs',
)


def parse_args(argv):
    """Analizza le opzioni della riga di comando."""
    parser = argparse.ArgumentParser(prog='pixelarcade', description='Pixel Arcade: dashboard di retrogaming.')
    parser.add_argument('--port', type=int, default=8765, help='porta HTTP locale (predefinita 8765)')
    parser.add_argument('--no-browser', action='store_true', help='avvia solo il servizio, senza Chrome')
    parser.add_argument('--data-dir', default='~/.config/pixel-arcade', help='cartella del database e del profilo Chrome')
    parser.add_argument('--dist', required=True, help='cartella della build del frontend')
    parser.add_argument('--base', default=DEFAULT_BASE,
                        help='cartella di riferimento dei percorsi relativi (predefinita: quella che contiene dashboard/)')
    return parser.parse_args(argv)


# Attesa tra la risposta a POST /api/exit e la chiusura, così la risposta arriva a Chrome.
EXIT_DELAY = 0.3
# Attesa massima per la chiusura di un Chrome rimasto aperto con il profilo della dashboard.
STALE_BROWSER_WAIT = 5
# Intervallo di controllo delle attività in corso quando il servizio è in background.
BUSY_INTERVAL = 5
# Attesa massima delle risposte di un Pixel Arcade già acceso, a un nuovo avvio.
PROBE_TIMEOUT = 2
# Attesa massima perché un Pixel Arcade che si sta fermando liberi la porta.
STOPPING_WAIT = 15


def create_services(db, base_dir, opener=None, data_dir=None, process_factory=None):
    """Compone i servizi condivisi dalle rotte dell'API.

    ``opener`` (download e richieste a RetroAchievements finti) e
    ``process_factory`` (RetroArch finto) servono ai test; ``data_dir`` ospita i download temporanei dei core, le
    opzioni lette dai core, la cache dei checksum dei giochi, quella delle immagini e degli avatar e i salvataggi dei profili.
    """
    cores = CoresRepository(db)
    config = ConfigService(SettingsRepository(db), base_dir, cores, opener)
    gameinfo = GameInfo(data_dir)
    library = Library(config, cores, gameinfo)
    temp_dir = data_dir or tempfile.gettempdir()
    downloader = CoreDownloader(config, cores, temp_dir) if opener is None else \
        CoreDownloader(config, cores, temp_dir, opener)
    sessions = SessionsRepository(db)
    ra_repo = RARepository(db)
    profiles_repo = ProfilesRepository(db)
    profiles = ProfileService(profiles_repo, sessions, library, ra=ra_repo)
    leaderboard = LeaderboardService(ChallengesRepository(db), sessions, profiles)
    profiles.challenge = leaderboard.is_challenge
    wrapped = WrappedService(WrappedRepository(db), profiles)
    playlists = PlaylistService(PlaylistsRepository(db), profiles)
    consoles = ConsoleRowService(ConsolesRepository(db), profiles_repo)
    ra_client = RAClient() if opener is None else RAClient(opener)
    ra = RAService(ra_repo, SettingsRepository(db), ra_client, profiles_repo, library, data_dir)
    saves = SaveStore(temp_dir, SavesRepository(db))
    controls = ControlsService(ControlsRepository(db), config, cores)
    catalog = CoreOptionsCatalog(os.path.join(temp_dir, 'core-options'), lambda: config.resolve_path('paths.cores'))

    def known_keys():
        return read_known_keys(retroarch_cfg_path(config.resolve_path('paths.cores')))

    gameconfig = GameConfigService(GameConfigRepository(db), config, catalog, library, controls.core_library,
                                   known_keys, cores, now_iso)
    # ``play`` si crea subito dopo: ``busy`` lo legge solo quando serve.
    bios = BiosService(BiosRepository(db), config, known_keys,
                       lambda system_id, core: gameconfig.context(system_id, None, core).options,
                       catalog.forget, lambda: play.busy(), now_iso)
    # Senza ``data_dir`` (test) il processore non si tocca.
    boost = CpuBoost(config, os.path.join(data_dir, 'cpu-governor')) if data_dir else None
    play = PlayService(config, library, cores, sessions, downloader, process_factory, profiles=profiles, saves=saves,
                       ra=ra, controls=controls, gameconfig=gameconfig, bios=bios, boost=boost)
    # La finestra della modale in partita si assegna in ``main``, quando l'indirizzo del server è noto.
    # Gli slot temporanei degli incontri stanno in ``data_dir`` (senza, nei test, non ci sono).
    ingame = IngameService(play, saves, controls=controls, match_root=data_dir)
    controls.ingame = ingame
    rescue = RescueService(RescueStore(temp_dir), ingame, gameconfig.periodic_seconds)
    play.rescue = rescue
    play.add_end_listener(rescue.finished)
    challenges = TrophyChallengeService(TrophyChallengesRepository(db), rescue, ra_repo, profiles_repo, library,
                                        temp_dir, play.net_factory)
    play.challenges = challenges
    replays = ReplayService(ReplaysRepository(db), profiles_repo, library, play, temp_dir, play.net_factory)
    replays.menu_open = ingame.menu_open
    play.replays = replays
    joypads = JoypadService(play)
    tournaments = TournamentService(TournamentsRepository(db), profiles, saves, library, temp_dir)
    play.tournaments = tournaments
    tournaments.play = play
    tournaments.matches_repo = TournamentMatchesRepository(db)
    tournaments.rewards_repo = TournamentRewardsRepository(db)
    profiles.rewards = tournaments.rewards_repo
    tournament_run = TournamentRunService(tournaments, tournaments.matches_repo, sessions)
    play.tournament_run = tournament_run
    tournament_run.ingame = ingame
    return {'db': db, 'config': config, 'cores': cores, 'library': library, 'downloader': downloader,
            'play': play, 'ingame': ingame, 'rescue': rescue, 'controls': controls, 'gameconfig': gameconfig, 'bios': bios, 'boost': boost, 'joypads': joypads, 'profiles': profiles, 'leaderboard': leaderboard, 'wrapped': wrapped, 'challenges': challenges, 'tournaments': tournaments, 'tournamentRun': tournament_run, 'replays': replays, 'playlists': playlists, 'consoles': consoles, 'saves': saves, 'gameinfo': gameinfo, 'ra': ra,
            'thumbnails': ImageCache(cache_dir(data_dir)),
            'avatars': GravatarCache(avatars_dir(data_dir)) if opener is None else
            GravatarCache(avatars_dir(data_dir), opener),
            'addons': []}


def refresh_core_index(services):
    """Scarica l'elenco dei core del buildbot; se non riesce resta solo l'avviso (nel log e nelle Impostazioni)."""
    try:
        services['config'].refresh_core_index()
    except ConfigError:
        return
    services['library'].invalidate()


def start_core_index_refresh(services):
    """Primo scaricamento dell'elenco dei core, in un thread separato per non ritardare l'avvio.

    Non fa nulla se l'elenco è già stato scaricato almeno una volta.
    """
    if services['config'].core_index()['fetchedAt'] is not None:
        return None
    thread = threading.Thread(target=refresh_core_index, args=(services,), name='core-index', daemon=True)
    thread.start()
    return thread


def find_browser():
    """Restituisce il percorso del primo Chrome/Chromium trovato, o ``None``."""
    for name in BROWSERS:
        path = shutil.which(name)
        if path:
            return path
    return None


def browser_args(browser, url, profile):
    """Riga di comando di Chrome: finestra app a schermo intero, senza barre né schede."""
    return [browser] + list(BROWSER_FLAGS) + ['--user-data-dir=' + profile, '--app=' + url]


def read_cmdline(pid):
    """Argomenti del processo ``pid`` (da ``/proc``), oppure ``None`` se non esiste."""
    try:
        with open('/proc/%d/cmdline' % pid, 'rb') as stream:
            data = stream.read()
    except OSError:
        return None
    return [part.decode('utf-8', 'replace') for part in data.split(b'\0') if part]


def stale_browser_pid(profile, hostname=None, cmdline=read_cmdline):
    """PID di un Chrome ancora aperto con il profilo ``profile``, oppure ``None``.

    Chrome tiene nel profilo il collegamento ``SingletonLock`` → ``<host>-<pid>``.
    Il PID vale solo se è di questo computer e se il processo usa proprio quel profilo.
    """
    try:
        target = os.readlink(os.path.join(profile, 'SingletonLock'))
    except OSError:
        return None
    host, _, pid = target.rpartition('-')
    if host != (hostname or socket.gethostname()) or not pid.isdigit():
        return None
    pid = int(pid)
    args = cmdline(pid)
    if not args or '--user-data-dir=' + profile not in args:
        return None
    return pid


def close_stale_browser(profile, wait=STALE_BROWSER_WAIT):
    """Chiude un Chrome rimasto aperto con il profilo della dashboard.

    Altrimenti il Chrome nuovo passerebbe la finestra a quello vecchio e
    terminerebbe subito, e il servizio non saprebbe quando si chiude la dashboard.
    """
    pid = stale_browser_pid(profile)
    if pid is None:
        return False
    log.warning('Chrome della dashboard già aperto (PID %d): lo chiudo prima di riaprirlo.', pid)
    try:
        os.kill(pid, signal.SIGTERM)
        deadline = time.monotonic() + wait
        while read_cmdline(pid) is not None:
            if time.monotonic() >= deadline:
                os.kill(pid, signal.SIGKILL)
                break
            time.sleep(0.1)
    except OSError:
        pass
    return True


def start_browser(url, data_dir):
    """Avvia Chrome a schermo intero con un profilo dedicato."""
    browser = find_browser()
    if browser is None:
        print('Chrome non trovato. Apri manualmente questo indirizzo: ' + url, flush=True)
        return None
    profile = os.path.join(data_dir, 'chrome-profile')
    os.makedirs(profile, mode=0o700, exist_ok=True)
    close_stale_browser(profile)
    return subprocess.Popen(browser_args(browser, url, profile), stdin=subprocess.DEVNULL,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def stop_browser(browser):
    """Chiude Chrome, aspettando al massimo 5 secondi."""
    if browser is None or browser.poll() is not None:
        return
    browser.terminate()
    try:
        browser.wait(timeout=5)
    except subprocess.TimeoutExpired:
        log.warning('Chrome non si è chiuso entro 5 secondi: lo termino forzatamente.')
        browser.kill()


def watch_browser(browser, server, keep=None):
    """Ferma il servizio quando si chiude la finestra di Chrome della dashboard.

    Un thread separato resta in attesa della fine del processo ``browser``
    (senza controlli periodici), poi chiama ``server.shutdown()``, a meno che
    ``keep(browser)`` sia vero (servizio in background, o Chrome già
    sostituito da uno nuovo). Restituisce il thread, oppure ``None`` senza Chrome.
    """
    if browser is None:
        return None

    def wait():
        browser.wait()
        if keep is not None and keep(browser):
            return
        log.info('Finestra della dashboard chiusa: fermo il servizio.')
        server.shutdown()

    thread = threading.Thread(target=wait, name='browser-watch', daemon=True)
    thread.start()
    return thread


class Window:
    """Finestra di Chrome della dashboard e modalità background del servizio.

    ``exit`` è la funzione di ``POST /api/exit`` e ``show`` quella di
    ``POST /api/show``. Anche Chrome chiuso da fuori (Alt+F4, ✕ della
    finestra) con attività in corso porta il servizio in background. In
    background Chrome è chiuso e il server resta acceso finché le
    estensioni hanno attività in corso
    (``addons.busy_all``), controllate ogni ``interval`` secondi; poi si
    ferma con la chiusura ordinata di sempre. ``launch`` (Chrome finto) e
    ``interval`` servono ai test.
    """

    def __init__(self, server, url, data_dir, launch=start_browser, interval=BUSY_INTERVAL):
        self.server = server
        self.url = url
        self.data_dir = data_dir
        self.launch = launch
        self.interval = interval
        self.browser = None
        self.background = False
        self.stopping = False
        self._round = 0
        self._lock = threading.Lock()

    def busy(self):
        """Frasi delle attività in corso nelle estensioni."""
        services = self.server.services
        return addons.busy_all(services.get('addons', []), services)

    def open(self):
        """Avvia Chrome e ne segue la chiusura. Restituisce il processo, oppure ``None`` senza Chrome."""
        browser = self.launch(self.url, self.data_dir)
        with self._lock:
            self.browser = browser
        watch_browser(browser, self.server, self._keep)
        return browser

    def _keep(self, browser):
        """Vero se il servizio resta acceso alla chiusura di ``browser`` (vedi ``watch_browser``).

        Chrome chiuso da fuori, non da ``close``: con attività in corso il
        servizio passa in background invece di fermarsi.
        """
        with self._lock:
            if self.background or browser is not self.browser:
                return True
            if self.stopping:
                return False
        busy = self.busy()
        if not busy:
            return False
        with self._lock:
            if self.stopping or browser is not self.browser:
                return not self.stopping
            self.background = True
            self._round += 1
            current = self._round
        log.info('Finestra della dashboard chiusa, il servizio resta acceso in background: %s.', ' · '.join(busy))
        self._start_wait(current)
        return True

    def _start_wait(self, current):
        thread = threading.Thread(target=self._wait_idle, args=(current,), name='background', daemon=True)
        thread.start()

    def exit(self, keep_running=False):
        """Dopo ``EXIT_DELAY`` (il tempo di rispondere a Chrome) chiude la dashboard con ``close``."""
        log.info('Chiusura richiesta dalla dashboard (START+SELECT).')
        timer = threading.Timer(EXIT_DELAY, self.close, args=(keep_running,))
        timer.daemon = True
        timer.start()

    def close(self, keep_running=False):
        """Chiude Chrome. Con ``keep_running`` e attività in corso il server passa in background, altrimenti si ferma."""
        busy = self.busy() if keep_running else []
        with self._lock:
            browser = self.browser
            self.background = bool(busy)
            self.stopping = not busy
            self._round += 1
            current = self._round
        stop_browser(browser)
        if not busy:
            self.server.shutdown()
            return
        log.info('Dashboard chiusa, il servizio resta acceso in background: %s.', ' · '.join(busy))
        self._start_wait(current)

    def _wait_idle(self, current):
        """In background: ferma il server quando le estensioni non hanno più attività in corso."""
        pause = threading.Event()
        while True:
            pause.wait(self.interval)
            busy = self.busy()
            with self._lock:
                if not self.background or self._round != current:
                    return
                if busy:
                    continue
                self.background = False
                self.stopping = True
            log.info('Attività finite: fermo il servizio.')
            self.server.shutdown()
            return

    def show(self):
        """Riapre Chrome se il servizio è in background. Restituisce ``True`` se l'ha riaperto.

        Solleva ``ConflictError`` se il servizio si sta fermando.
        """
        with self._lock:
            if self.stopping:
                raise ConflictError('Pixel Arcade si sta chiudendo.')
            if not self.background:
                return False
            self.background = False
            self._round += 1
        log.info('Nuovo avvio: riapro la dashboard.')
        self.open()
        return True


# Finestra della modale dei salvataggi in partita (Sprint 04 dei salvataggi, variante A):
# un Chrome con un profilo suo, che il servizio chiude terminandone il processo.
OVERLAY_FLAGS = (
    '--password-store=basic',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-search-engine-choice-screen',
    '--disable-session-crashed-bubble',
    '--noerrdialogs',
)
# Sulla console (1024×768) una finestra oltre circa l'80% dello spazio libero viene
# massimizzata da GNOME («auto-maximize») e copre il gioco: 900×600 è la misura provata.
OVERLAY_SIZE = (900, 600)


def overlay_args(browser, url, profile):
    """Riga di comando della finestra della modale: finestra app senza barre, della misura ``OVERLAY_SIZE``."""
    return ([browser] + list(OVERLAY_FLAGS)
            + ['--window-size=%d,%d' % OVERLAY_SIZE, '--user-data-dir=' + profile, '--app=' + url])


class OverlayWindow:
    """Finestra di Chrome della modale dei salvataggi, sopra il gioco in pausa.

    ``open()`` la avvia (se non è già aperta), ``close()`` termina il
    processo: ``window.close()`` della pagina non chiude una finestra
    ``--app`` aperta da riga di comando (Sprint 01 dei salvataggi).
    ``on_closed()`` viene chiamata se la finestra si chiude da sola (per
    esempio col mouse). ``browser`` (ricerca di Chrome) e ``popen`` servono ai test.
    """

    def __init__(self, url, profile, on_closed=None, browser=find_browser, popen=subprocess.Popen):
        self.url = url
        self.profile = profile
        self.on_closed = on_closed
        self.browser = browser
        self.popen = popen
        self.process = None
        self._lock = threading.Lock()

    def open(self):
        with self._lock:
            if self.process is not None and self.process.poll() is None:
                return self.process
            browser = self.browser()
            if browser is None:
                raise RetroArchError('Chrome non trovato: la modale dei salvataggi non si può aprire.')
            os.makedirs(self.profile, mode=0o700, exist_ok=True)
            close_stale_browser(self.profile)
            process = self.popen(overlay_args(browser, self.url, self.profile), stdin=subprocess.DEVNULL,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.process = process
        thread = threading.Thread(target=self._watch, args=(process,), name='overlay-watch', daemon=True)
        thread.start()
        return process

    def _watch(self, process):
        process.wait()
        with self._lock:
            if self.process is not process:
                return
            self.process = None
        if self.on_closed is not None:
            self.on_closed()

    def close(self):
        with self._lock:
            process, self.process = self.process, None
        stop_browser(process)


def reopen_running(port, opener=urllib.request.urlopen):
    """Chiede a un Pixel Arcade già acceso su ``127.0.0.1:port`` di riaprire la dashboard.

    Restituisce ``'shown'`` (dashboard riaperta), ``'open'`` (era già
    aperta), ``'stopping'`` (il servizio si sta fermando) oppure ``None`` se
    sulla porta non risponde Pixel Arcade.
    """
    base = 'http://127.0.0.1:%d' % port
    try:
        with opener(base + '/api/health', timeout=PROBE_TIMEOUT) as response:
            server = response.headers.get('Server') or ''
            data = json.loads(response.read().decode('utf-8'))
    except (OSError, ValueError):
        return None
    if not server.startswith('PixelArcade') or not isinstance(data, dict) or data.get('ok') is not True:
        return None
    request = urllib.request.Request(base + '/api/show', data=b'{}', method='POST',
                                     headers={'Content-Type': 'application/json'})
    try:
        with opener(request, timeout=PROBE_TIMEOUT) as response:
            data = json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as error:
        return 'stopping' if error.code == 409 else None
    except (OSError, ValueError):
        return None
    return 'shown' if isinstance(data, dict) and data.get('shown') else 'open'


def reuse_running(port, wait=STOPPING_WAIT):
    """Nuovo avvio con Pixel Arcade già acceso: riapre la sua dashboard.

    Restituisce ``True`` se il nuovo processo può uscire. Se il servizio
    acceso si sta fermando aspetta al massimo ``wait`` secondi che liberi la
    porta, poi restituisce ``False`` (avvio normale).
    """
    state = reopen_running(port)
    deadline = time.monotonic() + wait
    while state == 'stopping' and time.monotonic() < deadline:
        time.sleep(0.5)
        state = reopen_running(port)
    if state == 'shown':
        print('Pixel Arcade è già in esecuzione: riapro la dashboard.', flush=True)
    elif state == 'open':
        print('Pixel Arcade è già in esecuzione e la dashboard è aperta.', flush=True)
    return state in ('shown', 'open')


def interrupt(signum, frame):
    """Trasforma SIGTERM e SIGHUP in ``KeyboardInterrupt`` per una chiusura ordinata."""
    raise KeyboardInterrupt


def main(argv=None):
    """Avvia il servizio. Restituisce il codice di uscita."""
    args = parse_args(sys.argv[1:] if argv is None else argv)
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
    dist = os.path.abspath(os.path.expanduser(args.dist))
    if not os.path.isfile(os.path.join(dist, 'index.html')):
        print('Build del frontend non trovata in %s.\nEsegui prima la build del frontend: '
              'cd dashboard/frontend && npm ci && npm run build' % dist, file=sys.stderr)
        return 1
    data_dir = os.path.abspath(os.path.expanduser(args.data_dir))
    if not args.no_browser and reuse_running(args.port):
        return 0
    try:
        os.makedirs(data_dir, mode=0o700, exist_ok=True)
        db = Database(os.path.join(data_dir, 'pixel-arcade.db'))
    except (OSError, PixelArcadeError) as error:
        print('Avvio non riuscito: %s' % error, file=sys.stderr)
        return 1
    window = None
    server = None
    notifications = None
    try:
        version = db.migrate()
        if not db.integrity_ok():
            log.error('Controllo di integrità del database non superato: %s', db.path)
        services = create_services(db, args.base, data_dir=data_dir)
        services['data_dir'] = data_dir
        # Governor lasciato a ``performance`` da una dashboard chiusa a metà partita.
        services['play'].boost_call('off')
        services['addons'] = addons.load(services)
        start_core_index_refresh(services)
        # Una cartella per ogni console riconosciuta, così si sa dove mettere i giochi.
        services['library'].ensure_folders()
        for warning in services['library'].warnings():
            log.warning('%s', warning)
        server = create_server(args.port, services, dist)
        signal.signal(signal.SIGTERM, interrupt)
        # Chiusura del terminale: come Ctrl+C, così si chiude anche Chrome (non con nohup).
        if signal.getsignal(signal.SIGHUP) != signal.SIG_IGN:
            signal.signal(signal.SIGHUP, interrupt)
        url = 'http://127.0.0.1:%d' % server.server_port
        print('Pixel Arcade %s (database v%d): %s\nLascia aperto questo terminale. '
              'Ctrl+C per fermare il servizio.' % (__version__, version, url), flush=True)
        window = Window(server, url, data_dir)
        ingame = server.services['ingame']
        ingame.window = OverlayWindow(url + '/?overlay=1', os.path.join(data_dir, 'chrome-overlay'),
                                      ingame.window_closed)
        if not args.no_browser:
            # Niente riquadri del desktop (aggiornamenti disponibili…) sopra la dashboard.
            notifications = Notifications(os.path.join(data_dir, 'notifications-banners'))
            notifications.mute()
        browser = window.open() if not args.no_browser else None
        # Senza Chrome avviato da Pixel Arcade la dashboard non si chiude da sé (409).
        server.services['exit'] = window.exit if browser is not None else None
        server.services['show'] = window.show
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    except OSError as error:
        print('Avvio non riuscito: %s\nSe la porta è occupata, usa --port 8766.' % error, file=sys.stderr)
        return 1
    except PixelArcadeError as error:
        print('Avvio non riuscito: %s' % error, file=sys.stderr)
        return 1
    finally:
        if server is not None:
            addons.stop_all(server.services.get('addons', []))
            server.services['play'].stop()
            server.services['replays'].stop()
            server.services['joypads'].stop()
            if server.services['ingame'].window is not None:
                server.services['ingame'].window.close()
            server.services['gameinfo'].stop()
            server.server_close()
        stop_browser(window.browser if window is not None else None)
        if notifications is not None:
            notifications.restore()
        db.close()
    try:
        print('Pixel Arcade fermato.', flush=True)
    except OSError:
        # Terminale già chiuso.
        pass
    return 0
