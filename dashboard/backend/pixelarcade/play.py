"""Avvio dei giochi: scelta del core, ricerca, partita, domanda all'uscita e sessioni (README §I).

Una sola partita per volta. Ricerca e partita girano in un thread dedicato;
l'interfaccia legge lo stato con ``state()`` (``GET /api/run``).

Fasi (``run.phase``): ``idle``, ``probing`` (avvio o prova di un core),
``downloading``, ``download_confirm``, ``running``, ``verdict``.
"""
import logging
import os
import shlex
import threading
import time

from . import progression, retroarch_cfg, retroarch_net
from .config import CORE_SUFFIX, menu_conflict
from .core_download import CONFIRM_BYTES, DownloadCancelled
from .core_probe import LogVerifier, SearchStopped, find_core, probe_one
from .errors import ConflictError, IncompatibleError, LaunchError, RetroArchError
from .launcher import MENU_TERMINATE_GRACE, RetroArchProcess
from .library import extension
from .profiles import DEFAULT_OPTS, valid_id
from .rescue import FINAL, PREVIOUS, SUSPECT
from .repositories.cores import now_iso
from .fsutil import atomic_copy
from .saves import (AUTO_SUFFIX, SESSION_MODE, auto_state, clear_dir, content_basename, loadable, place_system_saves,
                    restore_shared_files, restore_sram_files, system_save_names)
from .systems import describe

log = logging.getLogger(__name__)

QUIT_UNSUPPORTED = 'La tua versione di RetroArch non supporta la combinazione d\'uscita.'
NO_CORES = 'Aggiungi dei core a questa console nelle Impostazioni (SELECT).'
ARCHIVES = frozenset(('zip', '7z'))
POLL_SECONDS = 0.25
MAX_STATE_LOG = 2000
# Attesa della chiusura di RetroArch dopo ``QUIT`` per un riavvio (misurati 2 s), poi si termina.
RESTART_GRACE = 8.0
# Core che si chiudono se RetroArch carica lo stato all'avvio (``savestate_auto_load``): il
# «Riprendi» si carica con ``LOAD_STATE`` a gioco partito. pcsx2 (LRPS2), 17 ottobre 2026: tre
# «Riprendi» di fila chiusi dopo 4–5 s con il segnale 11, mentre le partite dall'inizio vanno.
LATE_STATE_CORES = frozenset(('pcsx2',))
# Attesa dopo che RetroArch risponde ``PLAYING``, perché il core abbia davvero avviato il gioco.
LATE_STATE_DELAY = 5.0
# Attesa massima della risposta ``PLAYING``.
LATE_STATE_TIMEOUT = 90.0
LATE_STATE_POLL = 0.5
STATE_SUFFIX = '.state'
# File di un salvataggio condiviso che non vanno nella cartella di sessione.
SHARED_INFO = 'info.json'
SHARED_MISSING = 'Salvataggio condiviso non trovato.'
# Trofei RetroAchievements negli incontri di torneo: spenti.
MATCH_CHEEVOS = [('cheevos_enable', 'false')]


def compatible(core, ext, arcade):
    """Vero se il core accetta file con estensione ``ext``.

    Senza estensioni note il core si prova comunque. Fuori dall'arcade
    RetroArch estrae da sé zip e 7z, quindi gli archivi valgono per tutti i
    core; nell'arcade lo zip è il gioco e il core deve dichiararlo.
    """
    extensions = core['extensions']
    if not extensions or ext in extensions:
        return True
    return not arcade and ext in ARCHIVES


class PlayService:
    """Avvio dei giochi con ricerca del core e registrazione delle partite.

    Dipendenze sostituibili nei test: ``process_factory(core, rom_path)``
    (processo non avviato), ``clock`` (secondi monotoni), ``now`` (data ISO),
    ``wait(secondi)`` (pausa tra i controlli) e ``spawn(funzione)`` (avvio
    del thread di lavoro). ``profiles`` (``ProfileService``, sprint 08)
    registra tempo e XP dei giocatori e dà le preferenze di P1 per RetroArch.
    ``saves`` (``SaveStore``) conserva il «Riprendi» dei profili e il
    salvataggio interno del P1. ``ra`` (``RAService``) passa a RetroArch
    l'account RetroAchievements del P1 e legge dal log gioco e trofei. ``controls``
    (``ControlsService``) legge dal log i nomi dei tasti e al primo avvio
    chiede la configurazione dei comandi. ``gameconfig`` (``GameConfigService``)
    dà le chiavi di RetroArch e lo shader del gioco e scrive il ``.opt`` del
    core prima di ogni avvio di RetroArch. ``bios`` (``BiosService``) dà la
    cartella in cui i core cercano i BIOS. Le funzioni aggiunte con
    ``add_end_listener`` vengono chiamate quando RetroArch si chiude (menu
    dei salvataggi in partita). ``net_factory()`` dà il client dei comandi di
    rete (``RetroArchNet``) e ``later(funzione)`` la esegue in un altro
    thread: servono a caricare lo stato a gioco partito (``LATE_STATE_CORES``).
    """

    def __init__(self, config, library, cores_repo, sessions_repo, downloader, process_factory=None,
                 clock=time.monotonic, now=now_iso, wait=None, spawn=None, profiles=None, saves=None, ra=None,
                 controls=None, gameconfig=None, bios=None, net_factory=None, later=None, boost=None):
        self.config = config
        self.library = library
        self.cores = cores_repo
        self.sessions = sessions_repo
        self.downloader = downloader
        self.profiles = profiles
        self.saves = saves
        self.ra = ra
        self.controls = controls
        self.gameconfig = gameconfig
        self.bios = bios
        self.process_factory = process_factory or self.default_process
        self.clock = clock
        self.now = now
        self.stop_event = threading.Event()
        self.wait = wait or self.stop_event.wait
        self.spawn = spawn or self.spawn_thread
        self.net_factory = net_factory or self.default_net
        self.boost = boost
        self.later = later or self.spawn_thread
        self.lock = threading.RLock()
        self.cond = threading.Condition(self.lock)
        self.seq = 0
        self.last_result = None
        self.end_listeners = []
        self.pause_sources = []
        # ``rescue.RescueService`` (stati periodici e soccorso dopo un blocco); si assegna dopo la creazione.
        self.rescue = None
        # ``trophy_challenges.TrophyChallengeService`` (Sfida trofeo); si assegna dopo la creazione.
        self.challenges = None
        # ``replays.ReplayService`` (spezzoni del salvaschermo); si assegna dopo la creazione.
        self.replays = None
        # ``tournaments.TournamentService`` (stato di partenza dei tornei); si assegna dopo la creazione.
        self.tournaments = None
        # ``tournament_run.TournamentRunService`` (fine delle partite degli incontri); si assegna dopo la creazione.
        self.tournament_run = None
        self.reset_state()

    def reset_state(self):
        """Torna alla fase ``idle`` (da chiamare con il lock)."""
        self.phase = 'idle'
        self.game = None
        # Uscita dal gioco della partita (``config.QUIT_COMBOS``), mostrata dalla schermata di gioco.
        self.quit = None
        self.core = None
        self.attempt = None
        self.download = None
        self.question = None
        self.answer = None
        self.process = None
        self.started_at = None
        self.message = ''
        self.players = None
        self.pads = None
        self.content = None
        # Incontro di torneo della partita aperta, ``{tournament, match, gameNo, savesLocked}`` (``start`` con ``match``).
        self.match = None
        self.restart_at = None
        self.shader = None
        # Uscita con la combinazione di emergenza: momento della richiesta, oppure ``None``.
        self.rescue_at = None
        self.rescue_result = None
        # Salvataggio condiviso della partita aperta (nome della sua cartella), oppure ``None``.
        self.shared = None

    # --- Stato ---------------------------------------------------------------

    def state(self):
        """Stato per ``GET /api/run``."""
        with self.lock:
            process = self.process
            return {
                'running': self.phase != 'idle',
                'phase': self.phase,
                'game': dict(self.game) if self.game else None,
                'core': self.core,
                'attempt': dict(self.attempt) if self.attempt else None,
                'download': dict(self.download) if self.download else None,
                'question': dict(self.question) if self.question else None,
                'startedAt': self.started_at,
                'quitCombo': self.quit,
                'message': self.message,
                'log': process.log[-MAX_STATE_LOG:] if process is not None else '',
                'lastResult': dict(self.last_result) if self.last_result else None,
            }

    def busy(self):
        """Vero durante la ricerca, il download, la partita o la domanda all'uscita."""
        with self.lock:
            return self.phase != 'idle'

    def playing(self):
        """Vero se RetroArch o la ricerca sono in corso (le domande all'uscita non contano)."""
        with self.lock:
            return self.phase not in ('idle', 'verdict', 'rescue')

    def playing_match(self):
        """``{tournament, match}`` dell'incontro di torneo con una partita aperta, altrimenti ``None``."""
        with self.lock:
            if self.match is None or not self.playing():
                return None
            return dict(self.match)

    def ingame_info(self):
        """Dati della partita per il menu dei salvataggi: fase, gioco, core, giocatori e file di sessione.

        ``content`` è il nome dei file di RetroArch (``<nome>.state``),
        ``session`` la cartella di sessione.
        """
        with self.lock:
            return {
                'phase': self.phase,
                'game': dict(self.game) if self.game else None,
                'core': self.core,
                'players': list(self.players) if self.players else None,
                'pads': list(self.pads) if self.pads else None,
                'content': self.content,
                'session': self.session_dir(),
                'match': dict(self.match) if self.match else None,
                'shared': self.shared,
            }

    def add_end_listener(self, listener):
        """Aggiunge ``listener()``, chiamata quando RetroArch si chiude a fine partita."""
        self.end_listeners.append(listener)

    def add_pause_source(self, source):
        """Aggiunge ``source()``: a fine partita restituisce i secondi in cui il gioco è stato in pausa."""
        self.pause_sources.append(source)

    def paused_seconds(self):
        """Secondi di pausa della partita appena finita (menu dei salvataggi), da togliere alla durata."""
        total = 0.0
        for source in list(self.pause_sources):
            try:
                total += source()
            except Exception:
                log.exception('Durata della pausa non letta')
        return total

    def notify_end(self):
        for listener in list(self.end_listeners):
            try:
                listener()
            except Exception:
                log.exception('Errore alla fine della partita')

    def set_phase(self, phase, **fields):
        with self.lock:
            self.phase = phase
            for name, value in fields.items():
                setattr(self, name, value)

    def finish(self, message='', result=None):
        """Chiude il lavoro in corso e pubblica l'esito in ``lastResult``."""
        with self.lock:
            game = self.game
            self.seq += 1
            self.last_result = dict(result or {}, seq=self.seq, game=game, message=message)
            self.reset_state()
            self.message = message
            self.cond.notify_all()

    # --- Candidati e processo ------------------------------------------------

    def candidates(self, system_id, game):
        """Core della console disponibili e compatibili con il file del gioco, nell'ordine automatico."""
        ext = extension(game['file'])
        arcade = describe(system_id)['arcade']
        return [core for core in self.config.candidate_cores(system_id)
                if (core['installed'] or core['downloadable']) and compatible(core, ext, arcade)]

    def rom_path(self, system_id, game):
        return os.path.join(self.config.resolve_path('paths.roms'), system_id, *game['id'].split('/'))

    def default_process(self, core, rom_path):
        """``RetroArchProcess`` con il comando e i percorsi delle impostazioni."""
        settings = self.config.get()
        core_path = os.path.join(self.config.resolve_path('paths.cores'), core + CORE_SUFFIX)
        return RetroArchProcess(shlex.split(settings['retroarch.command']), core_path, rom_path,
                                self.config.resolve_path('paths.appendconfig'), self.clock, shader=self.shader)

    def default_net(self):
        port = self.config.get().get('retroarch.network_port', retroarch_cfg.NETWORK_CMD_PORT)
        return retroarch_net.RetroArchNet(port)

    def installed(self, core):
        return core in self.config.installed_cores()

    def known_keys(self):
        path = retroarch_cfg.retroarch_cfg_path(self.config.resolve_path('paths.cores'))
        return retroarch_cfg.read_known_keys(path)

    def quit_combo_supported(self):
        """Vero se il ``retroarch.cfg`` della console ha la combinazione d'uscita col joypad."""
        return retroarch_cfg.quit_combo_supported(self.known_keys())

    @staticmethod
    def spawn_thread(target):
        thread = threading.Thread(target=target, name='play', daemon=True)
        thread.start()
        return thread

    # --- Avvio ---------------------------------------------------------------

    def start(self, system_id, game_id, players=None, pads=None, resume=None, state_file=None, challenge=None,
              tournament=None, match=None, shared=None):
        """Avvia il gioco secondo README §I e restituisce lo stato.

        ``players`` = ``[id P1 | None, id P2 | None]``; ``pads`` = joypad dei
        due giocatori (indici di Chrome), che diventano i giocatori 1 e 2 di
        RetroArch. ``resume`` = ``{account, slot}``: il gioco parte dallo
        stato di quello slot del profilo, che deve essere tra i ``players``.
        ``state_file`` (solo dal soccorso, ``answer_rescue``) è uno stato su
        disco da cui far partire il gioco al posto di ``resume``.
        ``challenge`` (Sfida trofeo, ``{id, core, state}``) fa partire il gioco
        dallo stato della sfida, sempre con il suo core e con l'Encore dei trofei.
        ``tournament`` (``{id, sram}``) è la registrazione dello stato di
        partenza di un torneo: il gioco parte dall'inizio (o da ``resume``)
        con il salvataggio interno del P1 (``sram`` ``profile``) o senza
        (``none``) e, a fine partita, stato e salvataggio interno vanno al
        torneo (``TournamentService.recorded``) invece che al profilo.
        ``match`` (``TournamentRunService.play_match``) è una partita di un
        incontro di torneo: parte dallo stato del torneo con il suo core (o
        dall'inizio, se il torneo non ha uno stato) e con una copia del suo
        salvataggio interno, mai con quello del P1; trofei spenti, sessione
        col torneo e 0 XP; a fine partita non si conserva niente.
        ``shared`` (nome di un salvataggio condiviso del gioco, README
        «Salvataggi condivisi») fa partire il gioco dall'inizio con una copia
        di quel salvataggio interno al posto di quello del P1. Anche uno slot
        di ``resume`` nato da un salvataggio condiviso riparte con la sua
        copia. In queste partite «Riprendi» e slot si conservano come sempre
        (con il nome del salvataggio condiviso), mentre il salvataggio interno
        della sessione si butta.

        Solleva ``ConflictError`` se c'è già una partita, ``LaunchError`` se
        il gioco non esiste, la combinazione d'uscita non è supportata o la
        console non ha core o il salvataggio non si può caricare,
        ``IncompatibleError`` se tutti i candidati sono già stati provati.
        """
        if self.replays is not None:
            # Uno spezzone del salvaschermo in corso si chiude prima della partita.
            self.replays.stop()
        with self.lock:
            if self.phase != 'idle':
                raise ConflictError('Una partita è già in corso.')
            self.phase = 'probing'
            self.stop_event.clear()
        try:
            job = self.prepare_start(system_id, game_id, pads, players, resume, state_file, challenge, tournament,
                                     match, shared)
        except BaseException:
            with self.lock:
                self.reset_state()
            raise
        with self.lock:
            self.game = {'system': system_id, 'id': game_id, 'title': job['game']['title']}
            self.content = content_basename(job['game']['file'])
            self.players = players
            self.pads = pads
            self.shader = job['shader']
            self.quit = job['quit']
            self.match = {key: match[key] for key in ('tournament', 'match', 'gameNo', 'savesLocked')} \
                if match is not None else None
            self.shared = job.get('shared')
            self.message = 'Avvio in corso'
        self.spawn(lambda: self.work(job))
        return self.state()

    def player_opts(self, players):
        """Preferenze per RetroArch di P1 (per un ospite o senza P1, quelle predefinite)."""
        first = players[0] if players else None
        return self.profiles.retroarch_opts(first) if self.profiles is not None else DEFAULT_OPTS

    def crt_shader(self, opts):
        """Shader CRT del P1 (percorso assoluto), oppure ``None`` se spento o non impostato."""
        path = self.config.get().get('paths.crt_shader') or ''
        return retroarch_cfg.crt_shader(opts, self.config.resolve_path('paths.crt_shader') if path else '')

    def quit_combo(self, system_id, game_id):
        """Uscita dal gioco (``config.QUIT_COMBOS``): quella del gioco o della console, altrimenti le Impostazioni."""
        default = self.config.get().get('input.quit_combo', retroarch_cfg.QUIT_COMBO_DEFAULT)
        if self.gameconfig is None:
            return default
        try:
            return self.gameconfig.quit_combo(system_id, game_id)
        except Exception:
            log.exception('Uscita di %s/%s non letta: quella delle Impostazioni.', system_id, game_id)
            return default

    def menu_combo(self, quit_combo):
        """Menu rapido delle Impostazioni (``config.MENU_COMBOS``); nessuno se si scontra con l'uscita del gioco."""
        settings = self.config.get()
        menu = settings.get('input.menu_combo', retroarch_cfg.MENU_COMBO_DEFAULT)
        if menu_conflict(menu, quit_combo):
            log.warning('Menu rapido %s spento: si scontra con l\'uscita %s del gioco.', menu, quit_combo)
            return retroarch_cfg.MENU_COMBO_DEFAULT
        return menu

    def launch_options(self, system_id, game_id):
        """Chiavi di RetroArch e shader del gioco (``GameConfigService``); senza il servizio nessuna chiave."""
        if self.gameconfig is None:
            return [], None
        try:
            return self.gameconfig.launch_options(system_id, game_id)
        except Exception:
            log.exception('Configurazione di %s/%s non letta: valori di RetroArch.', system_id, game_id)
            return [], None

    def apply_config(self, job, core):
        """Scrive nel ``.opt`` di ``core`` le opzioni del gioco; un errore non ferma l'avvio."""
        if self.gameconfig is None:
            return
        try:
            self.gameconfig.apply_core(job['system'], job['game']['id'], core, job['rom'])
        except Exception:
            log.exception('Opzioni di %s/%s non scritte per %s.', job['system'], job['game']['id'], core)

    def apply_device(self, job, core):
        """Controller emulato del gioco (metadati o scelta a mano) nei remap di ``core``; un errore non ferma l'avvio."""
        if self.controls is None:
            return
        try:
            info = self.gameconfig.controller(job['system'], job['game']) if self.gameconfig is not None else None
            self.controls.ensure_device(job['system'], job['game'], core, job['rom'], info and info['value'])
        except Exception:
            log.exception('Controller di %s/%s non scritto per %s.', job['system'], job['game']['id'], core)

    def bios_options(self):
        """Cartella dei BIOS per RetroArch (``BiosService``); senza il servizio nessuna chiave."""
        if self.bios is None:
            return []
        try:
            return self.bios.retroarch_options()
        except Exception:
            log.exception('Cartella dei BIOS non letta: resta quella di RetroArch.')
            return []

    def cheevos_options(self, players, encore=False):
        """Chiavi RetroAchievements per l'account del P1 (nessuna senza il servizio); ``encore`` per le sfide."""
        if self.ra is None:
            return []
        try:
            return self.ra.retroarch_options(players, encore)
        except Exception:
            log.exception('Account RetroAchievements del P1 non letto: trofei spenti.')
            return [('cheevos_enable', 'false')]

    def prepare_start(self, system_id, game_id, pads=None, players=None, resume=None, state_file=None,
                      challenge=None, tournament=None, match=None, shared=None):
        """Controlli, file ``--appendconfig`` e scelta del core: restituisce il lavoro da eseguire."""
        game = self.library.find(system_id, game_id)
        if game is None:
            raise LaunchError('Gioco non trovato.')
        known = self.known_keys()
        if not retroarch_cfg.quit_combo_supported(known):
            raise LaunchError(QUIT_UNSUPPORTED)
        candidates = self.candidates(system_id, game)
        association = self.cores.game_core(system_id, game_id)
        job = {'system': system_id, 'game': game, 'rom': self.rom_path(system_id, game),
               'names': [core['name'] for core in candidates], 'mode': 'search', 'core': None, 'resume': None}
        if association and association['status'] in ('ok', 'trial'):
            core = association['core']
            if self.installed(core):
                if association['status'] == 'ok':
                    job.update(mode='direct', core=core)
                elif core in job['names']:
                    job.update(mode='trial', core=core)
                else:
                    self.cores.reset_game_core(system_id, game_id)
            elif (association['confirmedBy'] == 'manual'
                  and any(item['name'] == core and item['downloadable'] for item in candidates)):
                job.update(mode='direct', core=core)
            else:
                log.info('Core associato a %s/%s non più installato: nuova ricerca.', system_id, game_id)
                self.cores.reset_game_core(system_id, game_id)
        if challenge is not None:
            # Lo stato si carica solo col core con cui è stato fatto.
            if not self.installed(challenge['core']):
                raise LaunchError('Il core della sfida (%s) non è installato.' % challenge['core'])
            job.update(mode='direct', core=challenge['core'], challenge=challenge['id'])
            state_file = challenge['state']
            resume = None
        if tournament is not None:
            # Registrazione dello stato di partenza di un torneo: dall'inizio o da uno slot del creatore.
            job['tournament'] = tournament['id']
            job['tournament_sram'] = tournament.get('sram')
            state_file = None
        if match is not None:
            # Partita di un incontro: dallo stato del torneo, che si carica solo col core con cui è stato fatto.
            job['match'] = match
            state_file = None
            resume = None
            if match.get('state') and match.get('core'):
                if not self.installed(match['core']):
                    raise LaunchError('Il core del torneo (%s) non è installato.' % match['core'])
                job.update(mode='direct', core=match['core'])
                state_file = match['state']
        if job['mode'] == 'search':
            if not job['names']:
                raise LaunchError(NO_CORES)
            tried = self.cores.tried_cores(system_id, game_id)
            if not [name for name in job['names'] if name not in tried]:
                self.cores.set_game_core(system_id, game_id, None, 'incompatible')
                names = [name for name in job['names'] if name in tried]
                raise IncompatibleError('Nessun core compatibile: provati %s.' % ', '.join(names),
                                        {'incompatible': True, 'tried': names})
        if challenge is not None or tournament is not None or match is not None:
            shared = None
        if resume is not None:
            job['resume'] = self.check_resume(job, players, resume)
            # Uno slot nato da un salvataggio condiviso riparte con la sua copia.
            shared = job['resume'].pop('shared', None)
        if shared is not None:
            if not isinstance(shared, str) or self.saves is None:
                raise LaunchError(SHARED_MISSING)
            # Dal soccorso (``state_file``) si riparte anche se nel frattempo il salvataggio non c'è più.
            if resume is None and state_file is None and self.saves.shared_folder(system_id, game_id, shared) is None:
                raise LaunchError(SHARED_MISSING)
            job['shared'] = shared
        if state_file is not None:
            job['resume'] = {'file': state_file}
        port = self.config.get().get('retroarch.network_port', retroarch_cfg.NETWORK_CMD_PORT)
        opts = self.player_opts(players)
        image, shader = self.launch_options(system_id, game_id)
        # Lo shader CRT del profilo vince su quello della configurazione: è un gusto personale.
        job['shader'] = self.crt_shader(opts) or shader
        job['quit'] = self.quit_combo(system_id, game_id)
        job['menu'] = self.menu_combo(job['quit'])
        options = (retroarch_cfg.append_options(job['quit'], job['menu'])
                   + retroarch_cfg.joypad_options(pads)
                   + retroarch_cfg.autoconfig_button_options()
                   + retroarch_cfg.player_options(opts) + image + self.bios_options()
                   + retroarch_cfg.session_options(self.session_dir(), port)
                   + (MATCH_CHEEVOS if match is not None else self.cheevos_options(players, challenge is not None)))
        retroarch_cfg.write_append(self.config.resolve_path('paths.appendconfig'), known, options)
        return job

    # --- Salvataggi ----------------------------------------------------------

    def session_dir(self):
        """Cartella di sessione di RetroArch per stati e salvataggi interni."""
        return retroarch_cfg.session_dir(self.config.resolve_path('paths.appendconfig'))

    def profile_ids(self, players):
        """Id dei profili esistenti tra ``players``, nell'ordine e senza doppioni (ospiti esclusi)."""
        result = []
        for account_id in list(players or [])[:2]:
            if (valid_id(account_id) and account_id not in result and self.profiles is not None
                    and self.profiles.repo.get(account_id) is not None):
                result.append(account_id)
        return result

    def sram_owner(self):
        """Proprietario del salvataggio interno: il profilo del P1, oppure ``None`` (ospiti)."""
        with self.lock:
            players = self.players
        first = list(players or [None])[0]
        return first if first is not None and first in self.profile_ids([first]) else None

    def check_resume(self, job, players, resume):
        """Valida ``resume`` = ``{account, slot}`` per l'avvio da uno stato; ``LaunchError`` se non va.

        Il profilo deve essere tra i giocatori della partita, lo slot deve
        esistere e lo stato deve essere stato creato con il core del gioco
        (senza core associato il caricamento si tenta).
        """
        account_id = resume.get('account') if isinstance(resume, dict) else None
        slot = resume.get('slot') if isinstance(resume, dict) else None
        if account_id not in self.profile_ids(players):
            raise LaunchError('Il salvataggio non è di un giocatore della partita.')
        if isinstance(slot, bool) or not isinstance(slot, int) or not 0 <= slot <= 9 or self.saves is None:
            raise LaunchError('Salvataggio non trovato.')
        system_id, game_id = job['system'], job['game']['id']
        save = self.saves.repo.get(account_id, system_id, game_id, slot)
        if save is None or self.saves.state_file(account_id, system_id, game_id, slot) is None:
            raise LaunchError('Salvataggio non trovato.')
        if not loadable(save['core'], job['core']):
            raise LaunchError('Salvataggio creato con %s: non si può caricare con %s.' % (save['core'], job['core']))
        if job['core'] is None:
            log.info('Gioco %s/%s senza core associato: provo a caricare lo stato creato con %s; '
                     'se il core non lo accetta la partita parte dall\'inizio.', system_id, game_id, save['core'])
        return {'account': account_id, 'slot': slot, 'shared': save.get('shared')}

    def system_dir(self):
        """Cartella di sistema di RetroArch (``BiosService``), oppure ``None`` se non si conosce."""
        if self.bios is None:
            return None
        try:
            return self.bios.system_dir()
        except Exception:
            log.exception('Cartella di sistema di RetroArch non letta')
            return None

    def restore_internal(self, job, core, session):
        """Salvataggio interno e salvataggi della cartella di sistema (``saves.SYSTEM_SAVES``) per la partita.

        Incontro di torneo: una copia di quello del torneo e memory card nuove.
        Salvataggio condiviso: una copia dei suoi file. Registrazione di un
        torneo «da zero»: niente. Altrimenti quelli del P1 (o degli ospiti).
        """
        system_id, game_id = job['system'], job['game']['id']
        basename = content_basename(job['game']['file'])
        system_dir = self.system_dir()
        if job.get('match') is not None:
            restore_sram_files(job['match']['sram'], session, basename)
            place_system_saves(None, core, system_dir)
        elif job.get('shared') is not None:
            folder = self.saves.shared_folder(system_id, game_id, job['shared'])
            if folder is None:
                log.warning('Salvataggio condiviso %s di %s/%s non più presente: la partita parte senza.',
                            job['shared'], system_id, game_id)
            else:
                restore_shared_files(folder, session, basename, (SHARED_INFO,) + system_save_names(core))
                log.info('Avvio con il salvataggio condiviso %s.', job['shared'])
            place_system_saves(folder, core, system_dir)
        elif job.get('tournament') is not None and job.get('tournament_sram') != 'profile':
            place_system_saves(None, core, system_dir)
        else:
            owner = self.sram_owner()
            self.saves.restore_sram(owner, system_id, game_id, session, basename)
            self.saves.restore_system(owner, core, system_dir)

    def prepare_session(self, job, core=None):
        """Svuota la cartella di sessione e ci copia il salvataggio interno del P1.

        Si fa prima di ogni avvio di RetroArch, anche tra un core e l'altro
        della ricerca: un core non deve mai trovare lo stato lasciato da un
        altro. Se la cartella non si può svuotare il gioco non parte.

        Con ``job['resume']`` copia anche lo stato scelto come stato
        automatico, che RetroArch carica all'avvio; per i core di
        ``LATE_STATE_CORES`` lo copia nello slot di lavoro e segna
        ``job['late_state']``, così si carica a gioco partito. Vale solo per il
        primo avvio: durante la ricerca gli altri core partono dall'inizio.
        """
        session = self.session_dir()
        try:
            clear_dir(session)
        except OSError as error:
            log.error('Cartella di sessione %s non utilizzabile: %s', session, error)
            raise LaunchError('Cartella dei salvataggi non utilizzabile.')
        if self.saves is None:
            return
        try:
            self.restore_internal(job, core, session)
        except Exception:
            log.exception('Salvataggio interno di %s/%s non ripristinato', job['system'], job['game']['id'])
        resume, job['resume'] = job.get('resume'), None
        if resume is None:
            return
        late = core in LATE_STATE_CORES
        if 'file' in resume:
            self.copy_rescue_state(job, session, resume['file'], late)
            return
        try:
            copied = self.saves.copy_to_session(resume['account'], job['system'], job['game']['id'], resume['slot'],
                                                session, content_basename(job['game']['file']),
                                                STATE_SUFFIX if late else AUTO_SUFFIX)
        except Exception:
            copied = None
            log.exception('Stato dello slot %d di %s/%s non copiato', resume['slot'], job['system'],
                          job['game']['id'])
        if copied is None:
            log.warning('Stato dello slot %d non disponibile: la partita parte dall\'inizio.', resume['slot'])
        else:
            log.info('Avvio dallo slot %d del profilo %s%s.', resume['slot'], resume['account'],
                     ', caricato a gioco partito' if late else '')
            job['late_state'] = late

    def copy_rescue_state(self, job, session, source, late):
        """Copia nella sessione lo stato scelto nel soccorso, come ``prepare_session`` fa con uno slot."""
        target = os.path.join(session, content_basename(job['game']['file']) + (STATE_SUFFIX if late else AUTO_SUFFIX))
        try:
            atomic_copy(source, target, SESSION_MODE)
        except OSError:
            log.exception('Stato di soccorso %s non copiato: la partita parte dall\'inizio.', source)
            return
        log.info('Avvio dallo stato di soccorso %s%s.', source, ', caricato a gioco partito' if late else '')
        job['late_state'] = late

    def new_process(self, job, core):
        """Processo di RetroArch non avviato, con la cartella di sessione pronta.

        Con il servizio RetroAchievements il log del processo va anche a un
        ``SessionTracker`` nuovo, in ``job['ra_tracker']``: quello dell'ultimo
        processo è quello della partita. Negli incontri di torneo i trofei
        sono spenti e il log non si segue.
        """
        self.prepare_session(job, core)
        self.apply_config(job, core)
        self.apply_device(job, core)
        process = self.process_factory(core, job['rom'])
        if job.pop('late_state', False):
            self.load_later(job, core, process)
        if self.ra is not None and job.get('match') is None:
            tracker = self.ra.tracker()
            process.add_listener(tracker.feed)
            if self.challenges is not None:
                tracker.add_award_listener(self.challenges.awarded)
            if self.replays is not None:
                tracker.add_award_listener(self.replays.awarded)
            job['ra_tracker'] = tracker
        self.attach_controls(job, process)
        return process

    def late_slot(self, job):
        """Riavvio di un core di ``LATE_STATE_CORES``: vero se c'è uno stato da caricare a gioco partito.

        Lo stato automatico appena scritto passa nello slot di lavoro. Se lo
        stato del «Riprendi» non era ancora caricato, quello automatico è
        della partita appena avviata: si scarta e resta lo slot di lavoro.
        """
        session = self.session_dir()
        found = auto_state(session, content_basename(job['game']['file']))
        if job.get('state_pending'):
            if found is not None:
                os.remove(found[0])
            return os.path.isfile(os.path.join(session, content_basename(job['game']['file']) + STATE_SUFFIX))
        if found is None:
            return False
        try:
            os.replace(found[0], os.path.join(session, found[1] + STATE_SUFFIX))
        except OSError:
            log.exception('Stato automatico non spostato nello slot di lavoro: il gioco riparte dall\'inizio.')
            return False
        return True

    def load_later(self, job, core, process):
        """Carica lo stato dello slot di lavoro quando il gioco è partito (``LATE_STATE_CORES``).

        Finché non è caricato, ``job['state_pending']`` è vero: se la partita
        finisce prima, lo stato automatico non sostituisce il «Riprendi».
        """
        job['state_pending'] = True

        def run():
            try:
                if self.late_load(process):
                    log.info('Stato di %s/%s caricato a gioco partito con %s.', job['system'], job['game']['id'], core)
                    job['state_pending'] = False
            except Exception:
                log.exception('Stato di %s/%s non caricato a gioco partito.', job['system'], job['game']['id'])

        self.later(run)

    def late_load(self, process):
        """Aspetta ``PLAYING`` e poi ``LATE_STATE_DELAY``, quindi manda ``LOAD_STATE``; vero se l'ha mandato."""
        net = self.net_factory()
        deadline = self.clock() + LATE_STATE_TIMEOUT
        while net.status() != retroarch_net.PLAYING:
            if process.returncode is not None or self.stop_event.is_set() or self.clock() >= deadline:
                log.warning('RetroArch non è partito: lo stato non si carica.')
                return False
            self.wait(LATE_STATE_POLL)
        self.wait(LATE_STATE_DELAY)
        if process.returncode is not None or self.stop_event.is_set():
            return False
        try:
            net.load_state()
        except RetroArchError as error:
            log.warning('Stato non caricato: %s', error)
            return False
        return True

    def attach_controls(self, job, process):
        """Nomi dei tasti dal log del processo, in ``job['controls_reader']`` (quello dell'ultimo processo)."""
        if self.controls is None:
            return
        reader = self.controls.reader()
        process.add_listener(reader.feed)
        job['controls_reader'] = reader

    def relaunch(self, job, core):
        """Nuovo RetroArch dopo un riavvio chiesto in partita (comandi cambiati).

        La cartella di sessione non si svuota: RetroArch riparte dallo stato
        automatico appena scritto, con lo stesso salvataggio interno. Il log
        va allo stesso ``SessionTracker`` dei trofei, che ignora i doppioni.
        """
        self.apply_config(job, core)
        self.apply_device(job, core)
        process = self.process_factory(core, job['rom'])
        if core in LATE_STATE_CORES and self.late_slot(job):
            self.load_later(job, core, process)
        tracker = job.get('ra_tracker')
        if tracker is not None:
            process.add_listener(tracker.feed)
        self.attach_controls(job, process)
        return process

    def keep_saves(self, job, core, seconds, trial=False):
        """A fine partita: «Riprendi» (slot 0) a ogni profilo e salvataggio interno al P1.

        Il «Riprendi» si conserva solo se RetroArch ha lasciato lo stato
        automatico e la partita è durata almeno ``progression.MIN_SECONDS``.
        Nelle partite della Sfida trofeo non si conserva niente.
        Restituisce ``{saved, noState, rescue}``: gli id dei profili che
        l'hanno ricevuto; vero, se c'erano profili e una partita abbastanza
        lunga ma nessuno stato (per esempio un core che non salva gli stati,
        come MAME 2000); la domanda del soccorso (``rescue.RescueService``),
        oppure ``None``. Con il soccorso il «Riprendi» resta quello di prima
        finché il giocatore non sceglie (``answer_rescue``). Un errore non
        interrompe la partita: resta solo nel log.
        """
        if self.saves is None:
            return {'saved': [], 'noState': False, 'rescue': None}
        if job.get('challenge') is not None:
            # Sfida trofeo: la partita parte dallo stato di un altro, quindi non tocca «Riprendi», salvataggio
            # interno e stati di soccorso del gioco.
            if self.rescue is not None:
                self.rescue.drop_saver()
            return {'saved': [], 'noState': False, 'rescue': None}
        if job.get('match') is not None:
            # Incontro di torneo: «Riprendi», salvataggio interno e stati di soccorso dei profili non cambiano e la
            # copia del salvataggio interno del torneo si butta (la cartella di sessione si svuota al prossimo avvio).
            if self.rescue is not None:
                self.rescue.drop_saver()
            return {'saved': [], 'noState': False, 'rescue': None}
        system_id, game_id = job['system'], job['game']['id']
        session = self.session_dir()
        basename = content_basename(job['game']['file'])
        if job.get('tournament') is not None:
            return self.keep_tournament(job, core, session, basename)
        with self.lock:
            players = self.players
        stored = []
        missing = False
        question = None
        try:
            found = auto_state(session, basename)
            if found is None and seconds >= progression.MIN_SECONDS and self.profile_ids(players):
                missing = True
                log.warning('Nessuno stato automatico dopo %d s con %s: il core non salva gli stati?', seconds, core)
            if found is not None:
                basename = found[1]
            question = self.rescue_question(job, found, seconds, trial)
            if question is not None:
                log.info('Soccorso di %s/%s (%s): il «Riprendi» aspetta la scelta.', system_id, game_id,
                         question['reason'])
            elif found is not None and job.get('state_pending'):
                log.warning('Partita finita prima di caricare lo stato: il «Riprendi» resta quello di prima.')
            elif found is not None and seconds >= progression.MIN_SECONDS:
                for account_id in self.profile_ids(players):
                    if self.saves.store_state(account_id, system_id, game_id, 0, core, found[0],
                                              found[0] + '.png', job.get('shared')):
                        stored.append(account_id)
            if question is None and self.rescue is not None and not trial:
                self.rescue.clean_end()
        except Exception:
            log.exception('«Riprendi» di %s/%s non conservato', system_id, game_id)
        if job.get('shared') is not None:
            # Salvataggio condiviso: la copia della sessione si butta, quello del P1 resta com'era.
            return {'saved': stored, 'noState': missing, 'rescue': question}
        try:
            owner = self.sram_owner()
            self.saves.keep_sram(owner, system_id, game_id, session, basename)
            self.saves.keep_system(owner, core, self.system_dir())
        except Exception:
            log.exception('Salvataggio interno di %s/%s non conservato', system_id, game_id)
        return {'saved': stored, 'noState': missing, 'rescue': question}

    def keep_tournament(self, job, core, session, basename):
        """Fine della registrazione dello stato di un torneo: niente al profilo, tutto al torneo.

        ``tournament`` del risultato è ``{recorded}`` (vedi ``TournamentService.recorded``).
        """
        if self.rescue is not None:
            self.rescue.drop_saver()
        found = auto_state(session, basename)
        recorded = {'recorded': False}
        if self.tournaments is not None:
            try:
                recorded = self.tournaments.recorded(job['tournament'], job['system'], job['game']['id'], core,
                                                     found[0] if found else None, session,
                                                     found[1] if found else basename)
            except Exception:
                log.exception('Stato di partenza del torneo %s non registrato', job['tournament'])
        if found is None:
            log.warning('Nessuno stato automatico con %s: il torneo partirà dall\'inizio.', core)
        return {'saved': [], 'noState': found is None, 'rescue': None, 'tournament': recorded}

    def rescue_question(self, job, found, seconds, trial):
        """Domanda del soccorso a fine partita, oppure ``None`` (vedi ``rescue.RescueService.check``).

        Non c'è durante la ricerca del core, senza profili in partita e
        prima che lo stato del «Riprendi» sia caricato. Lo stato finale si
        offre solo se la partita è durata abbastanza da diventare un «Riprendi».
        """
        with self.lock:
            players = self.players
            requested = self.rescue_at is not None
        if self.rescue is None or trial or not self.profile_ids(players) or job.get('state_pending'):
            return None
        reason = self.rescue.check(found[0] + '.png' if found is not None else None, requested)
        if reason is None:
            return None
        final = (found[0], found[0] + '.png') if found is not None and seconds >= progression.MIN_SECONDS else None
        return self.rescue.open(reason, final)

    def work(self, job):
        """Thread di lavoro: esegue il lavoro e, se qualcosa va storto, torna a ``idle`` con un messaggio.

        Con ``boost`` (``cpu.CpuBoost``) il processore resta al massimo per tutto il lavoro.
        """
        self.boost_call('on')
        try:
            if job['mode'] == 'direct':
                self.run_direct(job)
            elif job['mode'] == 'trial':
                self.run_trial(job)
            else:
                self.search(job)
        except Exception as error:
            log.exception('Errore durante l\'avvio di %s/%s', job['system'], job['game']['id'])
            message = str(error) if isinstance(error, LaunchError) else 'Errore durante l\'avvio del gioco.'
            self.finish(message, {'error': True})
        finally:
            self.boost_call('off')

    def boost_call(self, name):
        """``boost.on()`` o ``boost.off()``: un errore resta nel log e non ferma la partita."""
        if self.boost is None:
            return
        try:
            getattr(self.boost, name)()
        except Exception:
            log.exception('Processore al massimo: %s non riuscito.', name)

    # --- Download ------------------------------------------------------------

    def prepare_core(self, job, core):
        """Rende disponibile il core, scaricandolo se manca; ``False`` se va saltato.

        Sopra i 50 MB chiede conferma (fase ``download_confirm``). Solleva
        ``SearchStopped`` se l'utente interrompe.
        """
        if self.installed(core):
            return True
        system_id, game_id = job['system'], job['game']['id']
        size = self.downloader.size(core)
        if size is not None and size > CONFIRM_BYTES:
            with self.lock:
                self.set_phase('download_confirm', question={'core': core, 'size': size}, answer=None)
                while self.answer is None and not self.stop_event.is_set():
                    self.cond.wait(0.5)
                accepted = self.answer
                self.question = None
                self.answer = None
            if self.stop_event.is_set():
                raise SearchStopped()
            if not accepted:
                self.cores.add_attempt(system_id, game_id, core, 'failed', 'download_declined')
                return False
        self.set_phase('downloading', download={'core': core, 'bytes': 0, 'total': size})

        def progress(done, total):
            with self.lock:
                self.download = {'core': core, 'bytes': done, 'total': total if total is not None else size}

        try:
            self.downloader.download(core, progress, self.stop_event.is_set)
        except DownloadCancelled:
            raise SearchStopped()
        except LaunchError as error:
            log.warning('%s', error)
            self.cores.add_attempt(system_id, game_id, core, 'failed', 'download_failed', str(error))
            return False
        finally:
            with self.lock:
                self.download = None
                if self.phase == 'downloading':
                    self.phase = 'probing'
        self.library.invalidate()
        return True

    def answer_download(self, core, accept):
        """Risposta alla domanda sul download oltre i 50 MB. ``ConflictError`` se non c'è la domanda."""
        with self.lock:
            if self.phase != 'download_confirm' or not self.question or self.question['core'] != core:
                raise ConflictError('Nessuna domanda aperta su questo core.')
            self.answer = bool(accept)
            self.cond.notify_all()
        return self.state()

    # --- Ricerca e partita ---------------------------------------------------

    def probe(self, job, core):
        window = self.config.get()['probe.window_seconds']
        return probe_one(lambda name: self.new_process(job, name), core, window,
                         self.stop_event, self.clock, self.wait)

    def record_failure(self, job, core, result):
        detail = '' if result.detail is None else str(result.detail)
        self.cores.add_attempt(job['system'], job['game']['id'], core, 'failed', result.reason,
                               (detail + '\n' + result.log_tail).strip())

    def search(self, job):
        """Prova i candidati non ancora provati; il primo che supera i controlli diventa ``trial``."""
        system_id, game_id = job['system'], job['game']['id']
        tried = self.cores.tried_cores(system_id, game_id)

        def on_attempt(index, total, core):
            self.set_phase('probing', core=core, attempt={'index': index, 'total': total, 'core': core},
                           message='Provo il core %d di %d' % (index, total))

        found = find_core(job['names'], tried, lambda core: self.prepare_core(job, core),
                          lambda core: self.probe(job, core), on_attempt,
                          lambda core, result: self.record_failure(job, core, result), self.stop_event.is_set)
        if found['status'] == 'found':
            self.cores.set_game_core(system_id, game_id, found['core'], 'trial')
            self.play(job, found['core'], found['result'].process, found['result'].verifier, True,
                      found['index'], found['total'])
        elif found['status'] == 'none':
            tried = self.cores.tried_cores(system_id, game_id)
            names = [name for name in job['names'] if name in tried]
            self.cores.set_game_core(system_id, game_id, None, 'incompatible')
            self.finish('Nessun core compatibile: provati %s' % ', '.join(names),
                        {'incompatible': True, 'tried': names, 'probed': True})
        else:
            self.finish('Ricerca interrotta', {'stopped': True, 'probed': True})

    def run_trial(self, job):
        """Core in prova: stessa verifica della ricerca; se fallisce, la ricerca continua con gli altri."""
        system_id, game_id = job['system'], job['game']['id']
        core = job['core']
        tried = self.cores.tried_cores(system_id, game_id) & set(job['names'])
        index, total = len(tried) + 1, len(job['names'])
        self.set_phase('probing', core=core, attempt={'index': index, 'total': total, 'core': core},
                       message='Provo il core %d di %d' % (index, total))
        result = self.probe(job, core)
        if result.result == 'trial':
            self.play(job, core, result.process, result.verifier, True, index, total)
            return
        self.record_failure(job, core, result)
        if result.reason == 'stopped':
            self.finish('Ricerca interrotta', {'stopped': True, 'probed': True})
            return
        self.cores.reset_game_core(system_id, game_id)
        self.search(job)

    def run_direct(self, job):
        """Core confermato: avvio senza verifica (scaricandolo prima se è una scelta manuale che manca)."""
        core = job['core']
        self.set_phase('probing', core=core, attempt=None, message='Avvio in corso')
        try:
            if not self.prepare_core(job, core):
                self.finish('Core %s non disponibile' % core, {'error': True})
                return
        except SearchStopped:
            self.finish('Avvio interrotto', {'stopped': True})
            return
        process = self.new_process(job, core)
        verifier = LogVerifier()
        process.add_listener(verifier.feed)
        process.start()
        self.play(job, core, process, verifier, False, None, None)

    def play(self, job, core, process, verifier, trial, index, total):
        """Partita in corso: aspetta la fine di RetroArch, registra la sessione e decide sul core in prova."""
        system_id, game_id = job['system'], job['game']['id']
        self.set_phase('running', core=core, process=process, attempt=None, started_at=self.now(),
                       message='In gioco', rescue_at=None)
        match = job.get('match')
        # Negli incontri niente stati periodici (scatti in partita) né punti della Sfida trofeo.
        if self.rescue is not None and not trial and match is None:
            self.rescue.started(self.ingame_info(), core, lambda: bool(job.get('state_pending')))
        if self.challenges is not None and not trial and match is None:
            with self.lock:
                players = self.players
            self.challenges.started(dict(self.game), core, players, job.get('challenge'), self.paused_seconds,
                                    lambda: bool(job.get('state_pending')))
        if self.replays is not None and not trial:
            with self.lock:
                players = self.players
            try:
                self.replays.game_started(dict(self.game), core, players, self.session_dir(),
                                          eligible=job.get('challenge') is None and job.get('tournament') is None
                                          and match is None)
            except Exception:
                log.exception('Registrazione dello spezzone non avviata')
        session_id = self.sessions.start(system_id, game_id, core, self.started_at,
                                         match['tournament'] if match is not None else None)
        if match is not None and self.tournament_run is not None:
            try:
                self.tournament_run.game_started(match, core)
            except Exception:
                log.exception('Osservatori della partita dell\'incontro %s non avvisati', match['match'])
        # Secondi di gioco dei processi chiusi per un riavvio.
        before = 0.0
        while True:
            self.controls_started(job, core, process)
            closed = False
            while process.returncode is None:
                with self.lock:
                    restart_at = self.restart_at
                    rescue_at = self.rescue_at
                if verifier.close_line() and not closed:
                    log.info('Il core ha chiuso il gioco e RetroArch è tornato al menu: lo chiudo.')
                    closed = True
                    process.terminate(MENU_TERMINATE_GRACE)
                elif self.stop_event.is_set():
                    process.terminate()
                elif restart_at is not None and self.clock() - restart_at > RESTART_GRACE:
                    log.warning('RetroArch non si è chiuso per il riavvio: lo termino.')
                    process.terminate()
                elif rescue_at is not None and self.clock() - rescue_at > RESTART_GRACE:
                    log.warning('RetroArch non si è chiuso con la combinazione di emergenza: lo termino.')
                    process.terminate()
                else:
                    self.wait(POLL_SECONDS)
            code = process.wait(2)
            self.controls_ended(job, core)
            with self.lock:
                restart, self.restart_at = self.restart_at is not None, None
            if not restart or closed or self.stop_event.is_set():
                break
            next_process = self.restart_process(job, core)
            if next_process is None:
                break
            before += process.seconds()
            process = next_process
            verifier = LogVerifier()
            process.add_listener(verifier.feed)
            self.set_phase('running', process=process, message='In gioco')
        self.notify_end()
        # Le pause (menu dei salvataggi) non contano come tempo di gioco né per gli XP.
        elapsed = before + process.seconds()
        paused = self.paused_seconds()
        seconds = max(0, int(round(elapsed - paused)))
        self.sessions.finish(session_id, self.now(), seconds, code)
        log.info('Partita terminata: %s/%s con %s, %d s di gioco (%d s di pausa), codice %s', system_id, game_id,
                 core, seconds, int(round(paused)), code)
        result = dict({'seconds': seconds, 'core': core, 'probed': trial,
                       'players': self.record_players(session_id, seconds),
                       'achievements': self.record_achievements(job, session_id) if match is None
                       else {'unlocks': [], 'earner': None}},
                      **self.keep_saves(job, core, seconds, trial))
        if match is None:
            result.update(self.challenge_result(job, result['achievements'], trial))
        else:
            result.update(self.match_result(match, session_id, core))
        if self.replays is not None and not trial:
            try:
                self.replays.game_finished()
            except Exception:
                log.exception('Spezzone di %s/%s non conservato', system_id, game_id)
        question = result.pop('rescue', None)
        if question is not None:
            with self.lock:
                self.phase = 'rescue'
                self.process = None
                self.question = dict(question, system=system_id, id=game_id, core=core)
                self.message = 'Il gioco era bloccato?' if question['reason'] == SUSPECT else 'Da dove vuoi riprendere?'
                self.rescue_result = result
                self.seq += 1
                self.last_result = dict(result, seq=self.seq, game=dict(self.game), message='Partita terminata')
            return
        if not trial:
            self.finish('Partita terminata', result)
            return
        auto_seconds = self.config.get()['probe.auto_confirm_seconds']
        if elapsed >= auto_seconds and not closed and verifier.observe(process) != 'failed':
            self.confirm(job, core, 'auto')
            self.finish('Core memorizzato: %s' % core, dict(result, confirmed=True))
            return
        with self.lock:
            self.phase = 'verdict'
            self.process = None
            self.question = {'system': system_id, 'id': game_id, 'core': core, 'index': index, 'total': total}
            self.message = 'Il gioco ha funzionato con %s?' % core
            self.seq += 1
            self.last_result = dict(result, seq=self.seq, game=dict(self.game), message='Partita terminata')

    def restart_process(self, job, core):
        """Avvia di nuovo RetroArch per un riavvio; ``None`` se non parte (la partita finisce)."""
        log.info('Riavvio di %s/%s con %s: comandi cambiati.', job['system'], job['game']['id'], core)
        try:
            process = self.relaunch(job, core)
            process.start()
        except Exception:
            log.exception('Riavvio di RetroArch non riuscito: la partita finisce.')
            return None
        return process

    def controls_started(self, job, core, process):
        """Avvisa ``controls`` dell'inizio di un processo della partita (nomi dei tasti e prima configurazione)."""
        reader = job.get('controls_reader')
        if self.controls is None or reader is None:
            return
        try:
            self.controls.game_started(job, core, reader, lambda: self.is_current(process))
        except Exception:
            log.exception('Comandi di %s/%s non controllati', job['system'], job['game']['id'])

    def controls_ended(self, job, core):
        reader = job.get('controls_reader')
        if self.controls is not None and reader is not None:
            self.controls.game_ended(job, core, reader)

    def is_current(self, process):
        """Vero se ``process`` è il RetroArch della partita in corso e non sta per riavviarsi."""
        with self.lock:
            return (self.phase == 'running' and self.process is process and self.restart_at is None
                    and process.returncode is None)

    def match_result(self, match, session_id, core=None):
        """Fine della partita di un incontro: ``{kind: 'match', match: {tournament, match, gameNo, declared}}``.

        Avvisa ``tournament_run`` della sessione; un errore resta nel log.
        ``declared`` è il risultato della dichiarazione automatica di
        un'estensione (``TournamentRunService.auto_declare``), oppure ``None``:
        la partita si dichiara a mano.
        """
        declared = None
        if self.tournament_run is not None:
            try:
                self.tournament_run.match_ended(match['match'], session_id)
            except Exception:
                log.exception('Fine della partita dell\'incontro %s non registrata', match['match'])
            try:
                declared = self.tournament_run.auto_declare(match, core)
            except Exception:
                log.exception('Dichiarazione automatica della partita dell\'incontro %s non riuscita',
                              match['match'])
        result = {key: match[key] for key in ('tournament', 'match', 'gameNo')}
        result['declared'] = declared
        return {'kind': 'match', 'match': result}

    def record_players(self, session_id, seconds):
        """Tempo e XP ai profili della partita: ``{id: {xpGained, levelBefore, levelAfter, title, ...}}``.

        I campi sono quelli di ``ProfileService.record_session``, anche per le partite dei tornei.

        Le chiavi sono stringhe (come nel JSON). Un errore non interrompe la
        partita: resta solo nel log.
        """
        if self.profiles is None:
            return {}
        with self.lock:
            players = self.players
        try:
            gained = self.profiles.record_session(session_id, players, seconds)
        except Exception:
            log.exception('Registrazione dei giocatori non riuscita per la partita %s', session_id)
            return {}
        return {str(account_id): value for account_id, value in gained.items()}

    def record_achievements(self, job, session_id):
        """Trofei della partita per i profili presenti: ``{unlocks: [{id, title, at}], earner}``.

        Un errore non interrompe la partita: resta solo nel log.
        """
        tracker = job.get('ra_tracker')
        if self.ra is None or tracker is None:
            return {'unlocks': [], 'earner': None}
        with self.lock:
            players = self.players
        try:
            return self.ra.finish_session(session_id, job['system'], job['game']['id'], players, tracker)
        except Exception:
            log.exception('Trofei della partita %s non registrati', session_id)
            return {'unlocks': [], 'earner': None}

    def challenge_result(self, job, achievements, trial):
        """Esito della Sfida trofeo e punti di sfida della partita (``TrophyChallengeService.finished``).

        Un errore non interrompe la partita: resta solo nel log.
        """
        if self.challenges is None or trial:
            return {}
        with self.lock:
            players = self.players
        tracker = job.get('ra_tracker')
        ra_game_id = tracker.snapshot()['gameId'] if tracker is not None else None
        try:
            return self.challenges.finished(players, achievements, ra_game_id)
        except Exception:
            log.exception('Sfida trofeo di %s/%s non registrata', job['system'], job['game']['id'])
            return {}

    def confirm(self, job, core, confirmed_by):
        self.cores.set_game_core(job['system'], job['game']['id'], core, 'ok', confirmed_by)
        self.cores.add_attempt(job['system'], job['game']['id'], core, 'ok', confirmed_by)

    def verdict(self, system_id, game_id, worked):
        """Risposta a «Il gioco ha funzionato?».

        Sì → core confermato. No → tentativo ``user_rejected`` e subito il
        prossimo candidato non ancora provato; finiti i core, ``incompatible``.
        ``ConflictError`` se non c'è una domanda aperta per quel gioco.
        """
        with self.lock:
            question = self.question
            if (self.phase != 'verdict' or not question or question['system'] != system_id
                    or question['id'] != game_id):
                raise ConflictError('Nessuna domanda aperta per questo gioco.')
            previous = dict(self.last_result or {})
        game = self.library.find(system_id, game_id)
        if game is None:
            with self.lock:
                self.reset_state()
            raise LaunchError('Gioco non trovato.')
        core = question['core']
        job = {'system': system_id, 'game': game, 'rom': self.rom_path(system_id, game),
               'names': [item['name'] for item in self.candidates(system_id, game)], 'mode': 'search', 'core': None}
        if worked:
            self.confirm(job, core, 'user')
            self.finish('Core memorizzato: %s' % core,
                        {'seconds': previous.get('seconds'), 'core': core, 'probed': True, 'confirmed': True,
                         'players': previous.get('players') or {}, 'noState': bool(previous.get('noState')),
                         'achievements': previous.get('achievements') or {'unlocks': [], 'earner': None}})
            return self.state()
        self.cores.add_attempt(system_id, game_id, core, 'failed', 'user_rejected')
        self.cores.reset_game_core(system_id, game_id)
        with self.lock:
            self.stop_event.clear()
            self.phase = 'probing'
            self.question = None
            self.message = 'Provo il core successivo'
        self.spawn(lambda: self.work(job))
        return self.state()

    def request_restart(self):
        """Il prossimo arresto di RetroArch è un riavvio (comandi del gioco cambiati), non la fine della partita.

        Chi lo chiede poi chiude RetroArch (comando di rete ``QUIT``); se non
        si chiude entro ``RESTART_GRACE`` secondi si termina. ``ConflictError``
        se non c'è una partita in corso.
        """
        with self.lock:
            if self.phase != 'running' or self.process is None:
                raise ConflictError('Nessuna partita in corso.')
            self.restart_at = self.clock()
            self.message = 'Riavvio del gioco'

    def cancel_restart(self):
        """Annulla il riavvio chiesto (il comando di chiusura non è partito)."""
        with self.lock:
            self.restart_at = None
            if self.phase == 'running':
                self.message = 'In gioco'

    def request_rescue(self):
        """Combinazione di emergenza: chiude RetroArch e, a fine partita, apre il soccorso.

        Il «Riprendi» resta quello di prima finché il giocatore non sceglie
        da dove riprendere. Se RetroArch non si chiude entro
        ``RESTART_GRACE`` secondi si termina. ``ConflictError`` se non c'è
        una partita in corso; una seconda richiesta non fa nulla.
        """
        with self.lock:
            if self.phase != 'running' or self.process is None:
                raise ConflictError('Nessuna partita in corso.')
            if self.rescue_at is not None:
                return self.state()
            self.rescue_at = self.clock()
            self.message = 'Uscita senza salvare'
        log.info('Combinazione di emergenza: chiudo RetroArch senza salvare il «Riprendi».')
        try:
            self.net_factory().send('QUIT')
        except RetroArchError as error:
            log.warning('Comando di chiusura non inviato, RetroArch si terminerà: %s', error)
        return self.state()

    def answer_rescue(self, choice):
        """Risposta al soccorso.

        ``choice`` è l'id di uno stato periodico o conservato (la partita
        riparte da lì con gli stessi giocatori; il «Riprendi» cambia solo
        alla sua uscita, come sempre), ``final`` (lo stato finale diventa il
        «Riprendi», come dopo una partita finita bene) o ``previous`` (il
        «Riprendi» resta quello di prima). ``ConflictError`` senza soccorso
        aperto, ``ConfigError`` se la voce non esiste, gli errori di
        ``start`` se la partita non riparte.
        """
        with self.lock:
            if self.phase != 'rescue' or self.rescue is None:
                raise ConflictError('Nessun soccorso aperto.')
            question = dict(self.question)
            result = dict(self.rescue_result or {})
            players = self.players
            pads = self.pads
            shared = self.shared
        picked = self.rescue.chosen(choice)
        if picked is not None and choice != FINAL:
            path = self.rescue.close(choice) or picked[0]
            log.info('Soccorso di %s/%s: riparto da %s.', question['system'], question['id'], choice)
            self.finish('Riparto dallo stato scelto', dict(result, saved=[], rescued=choice))
            return self.start(question['system'], question['id'], players, pads, state_file=path, shared=shared)
        stored = []
        if picked is not None:
            state, png, made_with = picked
            for account_id in self.profile_ids(players):
                try:
                    if self.saves.store_state(account_id, question['system'], question['id'], 0,
                                              made_with or question['core'], state, png, shared):
                        stored.append(account_id)
                except Exception:
                    log.exception('«Riprendi» di %s/%s non conservato', question['system'], question['id'])
        self.rescue.close(choice)
        log.info('Soccorso di %s/%s: scelto %s.', question['system'], question['id'], choice)
        self.finish('Partita terminata', dict(result, saved=stored, rescued=choice))
        return self.state()

    def stop(self):
        """Interrompe la ricerca o la partita (B due volte).

        Durante la domanda sul core lascia il core in prova; durante il
        soccorso il «Riprendi» resta quello di prima.
        """
        with self.lock:
            phase = self.phase
        if phase == 'rescue':
            try:
                return self.answer_rescue(PREVIOUS)
            except ConflictError:
                pass
        with self.lock:
            if self.phase == 'idle':
                return self.state()
            if self.phase == 'verdict':
                self.finish('Core ancora in prova', {'probed': True})
                return self.state()
            self.stop_event.set()
            self.cond.notify_all()
        return self.state()

    # --- Correzione manuale --------------------------------------------------

    def check_game(self, system_id, game_id):
        game = self.library.find(system_id, game_id)
        if game is None:
            raise LaunchError('Gioco non trovato.')
        return game

    def reset_core(self, system_id, game_id):
        """«Ricerca automatica al prossimo avvio» / «Riprova la ricerca»: associazione e tentativi azzerati."""
        self.check_game(system_id, game_id)
        with self.lock:
            if self.game and self.game['system'] == system_id and self.game['id'] == game_id and self.busy():
                raise ConflictError('Il gioco è in corso.')
        self.cores.reset_game_core(system_id, game_id)
        self.cores.clear_attempts(system_id, game_id)
        return self.library.find(system_id, game_id)

    def set_core(self, system_id, game_id, core):
        """Scelta manuale di un core tra i candidati compatibili: salvato come ``ok``, ``manual``."""
        game = self.check_game(system_id, game_id)
        if core not in [item['name'] for item in self.candidates(system_id, game)]:
            raise LaunchError('Il core %s non è tra quelli compatibili con questo gioco.' % core)
        with self.lock:
            if self.game and self.game['system'] == system_id and self.game['id'] == game_id and self.busy():
                raise ConflictError('Il gioco è in corso.')
        self.cores.set_game_core(system_id, game_id, core, 'ok', 'manual')
        return self.library.find(system_id, game_id)

    def game_cores(self, system_id, game_id):
        """Core compatibili per il menu «Core ▸»: ``[{name, installed, downloadable}]``."""
        game = self.check_game(system_id, game_id)
        return [{'name': core['name'], 'installed': core['installed'], 'downloadable': core['downloadable']}
                for core in self.candidates(system_id, game)]
