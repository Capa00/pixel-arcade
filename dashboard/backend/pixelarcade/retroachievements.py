"""RetroAchievements: chiave Web API, account dei profili, trofei dei giochi e delle partite.

- La **chiave Web API** è unica per la dashboard e sta nella tabella
  ``settings`` come chiave interna (``API_KEY``): non compare mai nelle
  risposte dell'API, che ne mostrano solo gli ultimi 4 caratteri.
- Ogni **profilo** si collega con nome utente e password: la password serve
  solo a ottenere il token (``RAClient.login``) e non si salva.
- A ogni avvio RetroArch accede con l'account del **profilo P1**
  (``retroarch_options``), con la modalità hardcore spenta: con l'hardcore
  gli stati di salvataggio, e quindi «Riprendi», non funzionano.
- Durante la partita ``SessionTracker`` legge il log di RetroArch: gioco
  riconosciuto e trofei sbloccati. A fine partita i trofei si registrano per
  tutti i profili presenti (``finish_session``); sul sito restano solo
  sull'account del P1.
- Il gioco RetroAchievements di un file si ricava dall'hash (``ra_hash``) e
  dall'elenco dei giochi della console, tenuto in cache su disco; per dischi
  e ``7z`` dal log della prima partita. ``check`` controlla in background i
  file della libreria, così la griglia sa quali sono compatibili.

Righe del log di RetroArch 1.22.2 usate (non tradotte, verificate sulla console
il 2026-10-01; quella dello sblocco dal sorgente di rcheevos):

- ``[RCHEEVOS] Generated hash <md5>``
- ``[RCHEEVOS] Identified game: <id> "<titolo>" (<md5>)``
- ``[RCHEEVOS] Load failed (-29): Unknown game``
- ``[RCHEEVOS] <utente> logged in successfully`` / ``Login failed``
- ``[RCHEEVOS] Awarding achievement <id>: <titolo>``
"""
import datetime
import json
import logging
import os
import re
import threading
import time

from . import ra_hash
from .errors import ProfileError
from .ra_client import RAAuthError, RAError
from .repositories.cores import now_iso
from .systems import describe

log = logging.getLogger(__name__)

# Chiave interna della tabella ``settings`` (vedi ``config.INTERNAL_KEYS``).
API_KEY = 'retroachievements.api_key'
KEY_PATTERN = re.compile(r'^[A-Za-z0-9]{16,64}$')
USERNAME_PATTERN = re.compile(r'^[A-Za-z0-9_.-]{2,32}$')
PASSWORD_MAX = 256
BADGE_PATTERN = re.compile(r'^[A-Za-z0-9_-]{1,32}$')
# Icona di un gioco: numero dell'immagine (``/Images/085573.png`` → ``085573``).
ICON_PATTERN = re.compile(r'^[0-9]{1,12}$')
# Giochi dell'account per pagina nella scheda «Trofei» del profilo.
GAMES_PAGE = 30

# Cache in memoria delle risposte della Web API.
RESPONSE_TTL = 300
# Elenco dei giochi di una console (con gli hash), su disco.
GAME_LIST_TTL = 3 * 24 * 3600
CACHE_DIR = 'retroachievements'
# Dopo un errore di rete il controllo dei file di una console si ritenta dopo questi secondi.
CHECK_RETRY = 300

# Un gioco con titolo così è una versione del file che RetroAchievements non supporta.
UNSUPPORTED_PREFIX = 'Unsupported Game Version'

GENERATED = re.compile(r'\[RCHEEVOS\] Generated hash ([0-9a-f]{32})')
IDENTIFIED = re.compile(r'\[RCHEEVOS\] Identified game: (\d+) "(.*)" \(([0-9a-f]{32})\)')
UNKNOWN_GAME = re.compile(r'\[RCHEEVOS\] (?:Load failed \(-?\d+\): Unknown game|Game not recognized)')
LOGGED_IN = re.compile(r'\[RCHEEVOS\] (\S+) logged in successfully')
LOGIN_FAILED = re.compile(r'\[RCHEEVOS\] (?:RetroAchievements )?[Ll]ogin failed')
AWARDING = re.compile(r'\[RCHEEVOS\] Awarding achievement (\d+): (.*)$')
# Da qui in su gli id sono avvisi di RetroArch registrati come trofei («Unsupported Game Version»), non trofei veri.
WARNING_ID_MIN = 101000000


def valid_id(value):
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def game_status(title):
    """``unsupported`` per le versioni non supportate, altrimenti ``found``."""
    return 'unsupported' if (title or '').startswith(UNSUPPORTED_PREFIX) else 'found'


class SessionTracker:
    """Legge il log di una partita: hash, gioco riconosciuto, accesso e trofei sbloccati.

    ``feed`` si chiama dal thread di lettura del log; gli altri metodi da
    quello della partita. Gli ascoltatori di ``add_award_listener`` ricevono
    ogni trofeo nuovo ``{id, title, at}`` dal thread di lettura, appena compare.
    """

    def __init__(self, now=now_iso):
        self.now = now
        self.lock = threading.Lock()
        self.hash = None
        self.game_id = None
        self.title = None
        self.unknown = False
        self.logged_in = None
        self.unlocks = []
        self.listeners = []

    def add_award_listener(self, listener):
        with self.lock:
            self.listeners.append(listener)

    def feed(self, line):
        if '[RCHEEVOS]' not in line:
            return
        awarded = None
        with self.lock:
            match = AWARDING.search(line)
            if match:
                achievement = int(match.group(1))
                if all(item['id'] != achievement for item in self.unlocks):
                    awarded = {'id': achievement, 'title': match.group(2).strip(), 'at': self.now()}
                    self.unlocks.append(awarded)
                    listeners = list(self.listeners)
            else:
                self.parse(line)
        if awarded is not None:
            for listener in listeners:
                try:
                    listener(dict(awarded))
                except Exception:
                    log.exception('Trofeo %s non passato a un ascoltatore', awarded['id'])

    def parse(self, line):
        """Righe del log diverse dai trofei: gioco riconosciuto, hash, accesso (con ``lock`` già preso)."""
        match = IDENTIFIED.search(line)
        if match:
            self.game_id = int(match.group(1))
            self.title = match.group(2)
            self.hash = match.group(3)
            return
        match = GENERATED.search(line)
        if match:
            self.hash = match.group(1)
            return
        if UNKNOWN_GAME.search(line):
            self.unknown = True
            return
        if LOGGED_IN.search(line):
            self.logged_in = True
        elif LOGIN_FAILED.search(line):
            self.logged_in = False

    def snapshot(self):
        """Stato raccolto: ``{hash, gameId, title, unknown, loggedIn, unlocks}``."""
        with self.lock:
            return {'hash': self.hash, 'gameId': self.game_id, 'title': self.title, 'unknown': self.unknown,
                    'loggedIn': self.logged_in, 'unlocks': [dict(item) for item in self.unlocks]}


class RAService:
    """Servizio RetroAchievements della dashboard.

    ``settings_repo`` è il ``SettingsRepository`` (chiave Web API),
    ``profiles_repo`` serve a controllare che i profili esistano, ``library``
    a trovare i file dei giochi. ``data_dir`` ospita la cache degli elenchi dei
    giochi e dei badge (``None``: solo in memoria).
    """

    def __init__(self, repo, settings_repo, client, profiles_repo=None, library=None, data_dir=None,
                 now=now_iso, clock=time.time):
        self.repo = repo
        self.settings = settings_repo
        self.client = client
        self.profiles = profiles_repo
        self.library = library
        self.cache_dir = os.path.join(data_dir, CACHE_DIR) if data_dir else None
        self.now = now
        self.clock = clock
        self.lock = threading.Lock()
        self.responses = {}
        self.game_lists = {}
        # Controllo in background dei file della libreria (``check``): file ancora da controllare per sistema,
        # thread in corso, ultimo errore di rete e file di cui qui non si calcola l'hash.
        self.checking = {}
        self.check_threads = {}
        self.check_failed = {}
        self.unhashable = set()

    # --- Chiave Web API ------------------------------------------------------

    def api_key(self):
        value = self.settings.get_all().get(API_KEY)
        return value if isinstance(value, str) and value else None

    def key_status(self):
        """``{set, last4}``: mai la chiave intera."""
        key = self.api_key()
        return {'set': key is not None, 'last4': key[-4:] if key else None}

    def set_key(self, key):
        """Controlla la chiave con una richiesta di prova e la salva. ``RAAuthError`` se rifiutata."""
        key = key.strip() if isinstance(key, str) else ''
        if not KEY_PATTERN.match(key):
            raise RAAuthError('La chiave Web API contiene solo lettere e numeri (la trovi su '
                              'retroachievements.org, Impostazioni → Keys).')
        self.client.check_key(key)
        self.settings.set_many({API_KEY: key})
        self.clear_cache()
        log.info('Chiave Web API di RetroAchievements salvata.')
        return self.key_status()

    def remove_key(self):
        self.settings.set_many({API_KEY: ''})
        self.clear_cache()
        return self.key_status()

    def clear_cache(self):
        with self.lock:
            self.responses.clear()

    # --- Account dei profili -------------------------------------------------

    def check_profile(self, account_id):
        if not valid_id(account_id) or (self.profiles is not None and self.profiles.get(account_id) is None):
            raise ProfileError('Profilo non trovato.')

    def link(self, account_id, username, password):
        """Collega il profilo all'account RetroAchievements; restituisce ``{username}``.

        La password serve solo a ottenere il token e non si salva né si scrive nel log.
        """
        self.check_profile(account_id)
        username = username.strip() if isinstance(username, str) else ''
        if not USERNAME_PATTERN.match(username):
            raise RAAuthError('Nome utente RetroAchievements non valido.')
        if not isinstance(password, str) or not password or len(password) > PASSWORD_MAX:
            raise RAAuthError('Inserisci la password di RetroAchievements.')
        reply = self.client.login(username, password)
        self.repo.link(account_id, reply['user'], reply['token'], self.now())
        self.clear_cache()
        log.info('Profilo %s collegato a RetroAchievements come %s.', account_id, reply['user'])
        return {'username': reply['user']}

    def unlink(self, account_id):
        self.check_profile(account_id)
        self.repo.unlink(account_id)
        self.clear_cache()
        return {'username': None}

    def username(self, account_id):
        account = self.repo.account(account_id) if valid_id(account_id) else None
        return account['username'] if account else None

    def usernames(self):
        """``{id profilo (stringa): nome utente}`` dei profili collegati."""
        return {str(account_id): name for account_id, name in self.repo.usernames().items()}

    # --- RetroArch -----------------------------------------------------------

    def retroarch_options(self, players, encore=False):
        """Chiavi ``cheevos_*`` per l'account del profilo P1; senza account i trofei restano spenti.

        ``encore`` (partite della Sfida trofeo) accende la modalità Encore di RetroArch: anche i trofei già
        sbloccati dall'account scattano di nuovo.
        """
        first = list(players or [None])[0]
        account = self.repo.account(first) if valid_id(first) else None
        if account is None:
            return [('cheevos_enable', 'false')]
        return [
            ('cheevos_enable', 'true'),
            ('cheevos_username', account['username']),
            ('cheevos_token', account['token']),
            ('cheevos_password', ''),
            ('cheevos_hardcore_mode_enable', 'false'),
            ('cheevos_start_active', 'true' if encore else 'false'),
            ('cheevos_test_unofficial', 'false'),
        ]

    def tracker(self):
        return SessionTracker(self.now)

    def finish_session(self, session_id, system_id, game_id, players, tracker):
        """Fine partita: memorizza il gioco riconosciuto e i trofei per i profili presenti.

        Restituisce i trofei sbloccati ``[{id, title, at}]``, più ``earner``
        (id del P1 con l'account collegato, oppure ``None``).
        """
        state = tracker.snapshot()
        if state['gameId'] is not None:
            self.repo.set_game(system_id, game_id, state['hash'], state['gameId'], state['title'],
                               game_status(state['title']), 'log', self.now())
        elif state['unknown'] and state['hash']:
            self.repo.set_game(system_id, game_id, state['hash'], None, None, 'unknown', 'log', self.now())
        if not state['unlocks']:
            return {'unlocks': [], 'earner': None}
        ids = []
        for account_id in list(players or [])[:2]:
            if valid_id(account_id) and account_id not in ids and (
                    self.profiles is None or self.profiles.get(account_id) is not None):
                ids.append(account_id)
        first = list(players or [None])[0]
        earner = first if valid_id(first) and self.repo.account(first) is not None else None
        rows = [(session_id, account_id, item['id'], item['title'], state['gameId'], earner, item['at'])
                for account_id in ids for item in state['unlocks']]
        if rows:
            self.repo.add_unlocks(rows)
        self.clear_cache()
        return {'unlocks': state['unlocks'], 'earner': earner}

    # --- Riconoscimento dei giochi -------------------------------------------

    def game_list_path(self, console_id):
        return os.path.join(self.cache_dir, 'games-%d.json' % console_id) if self.cache_dir else None

    def hash_index(self, key, console_id):
        """``{md5: (id, titolo)}`` dei giochi della console, dalla cache su disco o dalla Web API."""
        now = self.clock()
        with self.lock:
            cached = self.game_lists.get(console_id)
        if cached and now - cached[0] < GAME_LIST_TTL:
            return cached[1]
        path = self.game_list_path(console_id)
        if cached is None and path and os.path.isfile(path):
            try:
                with open(path, encoding='utf-8') as stream:
                    data = json.load(stream)
                if now - float(data['fetchedAt']) < GAME_LIST_TTL:
                    index = {md5: tuple(value) for md5, value in data['hashes'].items()}
                    with self.lock:
                        self.game_lists[console_id] = (float(data['fetchedAt']), index)
                    return index
            except (OSError, ValueError, KeyError, TypeError):
                log.warning('Cache dei giochi RetroAchievements %s non leggibile: la riscarico.', path)
        index = {}
        for game in self.client.game_list(key, console_id):
            for value in game.get('Hashes') or []:
                if isinstance(value, str):
                    index[value.lower()] = (int(game['ID']), str(game.get('Title') or ''))
        with self.lock:
            self.game_lists[console_id] = (now, index)
        if path:
            try:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                tmp = path + '.tmp'
                with open(tmp, 'w', encoding='utf-8') as stream:
                    json.dump({'fetchedAt': now, 'hashes': {k: list(v) for k, v in index.items()}}, stream)
                os.replace(tmp, path)
            except OSError as error:
                log.warning('Cache dei giochi RetroAchievements non scritta: %s', error)
        return index

    def known(self, system_id):
        """``{id del file: compatibile}`` per i file di cui RetroAchievements ha già detto se li conosce:
        vero se il gioco è stato riconosciuto, falso per una versione non supportata o un gioco ignoto."""
        return {game_id: status == 'found' for game_id, status in self.repo.statuses(system_id).items()}

    def list_time(self, preset):
        """Quando sono stati scaricati gli elenchi delle console del preset (il più vecchio), o ``None``."""
        with self.lock:
            times = [self.game_lists.get(console_id, (None,))[0] for console_id in ra_hash.console_ids(preset)]
        return None if not times or None in times else min(times)

    def stale(self, row, list_time):
        """Vero se il responso «non riconosciuto» dell'hash è più vecchio dell'elenco (o l'elenco non è in memoria)."""
        if row['status'] != 'unknown' or row['source'] != 'hash':
            return False
        if list_time is None:
            return True
        try:
            updated = datetime.datetime.fromisoformat(row['updatedAt']).timestamp()
        except (TypeError, ValueError):
            return True
        return updated < list_time

    def check(self, system_id, games):
        """Controlla in background i file ``games`` del sistema che RetroAchievements non ha ancora giudicato.

        Per le console di cui l'hash si calcola qui (non dischi né ``7z``):
        un file riconosciuto si memorizza come ``found``, uno non riconosciuto
        come ``unknown`` con la data, e si ricontrolla quando l'elenco dei giochi
        della console è più recente. Restituisce quanti file sono ancora da
        controllare (0 senza chiave Web API, per qualche minuto dopo un errore di
        rete e quando non c'è nulla da fare).
        """
        preset = describe(system_id)['preset']
        if self.api_key() is None or self.library is None or not ra_hash.supported(preset):
            return 0
        with self.lock:
            if system_id in self.checking:
                return self.checking[system_id]
            failed = self.check_failed.get(system_id)
        if failed is not None and self.clock() - failed < CHECK_RETRY:
            return 0
        rows = self.repo.games(system_id)
        list_time = self.list_time(preset)
        todo = []
        for game in games:
            row = rows.get(game['id'])
            if row is None:
                if (system_id, game['id']) in self.unhashable or game['id'].lower().endswith('.7z'):
                    continue
            elif not self.stale(row, list_time):
                continue
            todo.append(game)
        if not todo:
            return 0
        with self.lock:
            if system_id in self.checking:
                return self.checking[system_id]
            self.checking[system_id] = len(todo)
            thread = threading.Thread(target=self.run_check, args=(system_id, todo), name='ra-check', daemon=True)
            self.check_threads[system_id] = thread
        thread.start()
        return len(todo)

    def run_check(self, system_id, games):
        system = describe(system_id)
        preset = system['preset']
        try:
            key = self.api_key()
            if key is None:
                return
            indexes = [self.hash_index(key, console_id) for console_id in ra_hash.console_ids(preset)]
            list_time = self.list_time(preset)
            for game in games:
                self.check_game(system_id, system, game, indexes, list_time)
                with self.lock:
                    self.checking[system_id] -= 1
            with self.lock:
                self.check_failed.pop(system_id, None)
        except RAError as error:
            log.info('Controllo RetroAchievements di %s rimandato: %s', system_id, error)
            with self.lock:
                self.check_failed[system_id] = self.clock()
        except Exception:  # noqa: BLE001 - il thread non deve morire in silenzio
            log.exception('Controllo RetroAchievements di %s interrotto.', system_id)
            with self.lock:
                self.check_failed[system_id] = self.clock()
        finally:
            with self.lock:
                self.checking.pop(system_id, None)

    def check_game(self, system_id, system, game, indexes, list_time):
        """Hash del file e responso nella tabella ``ra_games``; un file senza hash calcolabile si ricorda in memoria."""
        row = self.repo.game(system_id, game['id'])
        if row is not None and not self.stale(row, list_time):
            return
        try:
            value = ra_hash.file_hash(self.rom_path(system_id, game), system['preset'], system['extensions'])
        except OSError as error:
            log.info('Hash RetroAchievements di %s/%s non calcolato: %s', system_id, game['id'], error)
            value = None
        if value is None:
            self.unhashable.add((system_id, game['id']))
            return
        for index in indexes:
            found = index.get(value)
            if found:
                self.repo.set_game(system_id, game['id'], value, found[0], found[1], game_status(found[1]), 'hash',
                                   self.now())
                return
        self.repo.set_game(system_id, game['id'], value, None, None, 'unknown', 'hash', self.now())

    def rom_path(self, system_id, game):
        return os.path.join(self.library.roms_dir(), system_id, *game['id'].split('/'))

    def identify(self, system_id, game_id):
        """Gioco RetroAchievements del file: ``{raGameId, title, status, hash}`` oppure ``None`` se ignoto.

        Usa quanto già memorizzato; altrimenti calcola l'hash e lo cerca
        negli elenchi delle console del preset. Un hash non trovato non si
        memorizza, così si ritenta quando l'elenco si aggiorna. ``RAError``
        senza rete.
        """
        stored = self.repo.game(system_id, game_id)
        if stored is not None and stored['status'] != 'unknown':
            return stored
        system = describe(system_id)
        preset = system['preset']
        key = self.api_key()
        if key is None or self.library is None or not ra_hash.supported(preset):
            return stored
        game = self.library.find(system_id, game_id)
        if game is None:
            return stored
        try:
            value = ra_hash.file_hash(self.rom_path(system_id, game), preset, system['extensions'])
        except OSError as error:
            log.info('Hash RetroAchievements di %s/%s non calcolato: %s', system_id, game_id, error)
            return stored
        if value is None:
            return stored
        for console_id in ra_hash.console_ids(preset):
            found = self.hash_index(key, console_id).get(value)
            if found:
                self.repo.set_game(system_id, game_id, value, found[0], found[1], game_status(found[1]), 'hash',
                                   self.now())
                return self.repo.game(system_id, game_id)
        return {'hash': value, 'raGameId': None, 'title': None, 'status': 'unknown', 'source': 'hash',
                'updatedAt': None}

    # --- Dati per l'interfaccia ----------------------------------------------

    def cached(self, cache_key, fetch):
        now = self.clock()
        with self.lock:
            hit = self.responses.get(cache_key)
        if hit and now - hit[0] < RESPONSE_TTL:
            return hit[1]
        value = fetch()
        with self.lock:
            self.responses[cache_key] = (now, value)
        return value

    def game_info(self, system_id, game_id, account_id=None):
        """Trofei del gioco per la scheda: ``{status, message, user, game, achievements}``.

        ``status``: ``ok``, ``no_key`` (manca la chiave), ``unknown`` (gioco
        non riconosciuto o non ancora giocato), ``unsupported`` (versione non
        supportata), ``offline``. ``user`` è il nome utente del profilo
        ``account_id`` (di solito P1), se collegato; i trofei sbloccati sono i suoi.
        """
        user = self.username(account_id)
        result = {'status': 'ok', 'message': None, 'user': user, 'game': None, 'achievements': []}
        key = self.api_key()
        if key is None:
            return dict(result, status='no_key', message='Inserisci la chiave Web API nelle Impostazioni.')
        try:
            found = self.identify(system_id, game_id)
            if found is None or found['raGameId'] is None:
                message = ('Gioco non riconosciuto da RetroAchievements.' if found is not None else
                           'Trofei non ancora noti: avvia il gioco una volta.')
                return dict(result, status='unknown', message=message)
            if found['status'] == 'unsupported':
                return dict(result, status='unsupported',
                            message='Questa versione del gioco non è supportata da RetroAchievements.')
            ra_id = found['raGameId']
            if user:
                data = self.cached(('progress', ra_id, user), lambda: self.client.game_progress(key, ra_id, user))
            else:
                data = self.cached(('game', ra_id), lambda: self.client.game_extended(key, ra_id))
        except RAError as error:
            return dict(result, status='offline', message=str(error))
        return dict(result, game=game_summary(data), achievements=achievement_list(data))

    def profile_info(self, account_id):
        """Trofei del profilo: ``{user, status, message, summary, recent, session}``.

        ``summary`` e ``recent`` vengono dal sito (punti, rank, ultimi trofei);
        ``session`` sono gli ultimi trofei sbloccati in partita salvati in
        locale, con ``coop`` vero per quelli vinti come P2.
        """
        self.check_profile(account_id)
        user = self.username(account_id)
        local = [dict(item, coop=item['earnerId'] != account_id) for item in self.repo.unlocks(account_id)]
        result = {'user': user, 'status': 'ok', 'message': None, 'summary': None, 'recent': [], 'session': local}
        if user is None:
            return dict(result, status='not_linked')
        key = self.api_key()
        if key is None:
            return dict(result, status='no_key', message='Inserisci la chiave Web API nelle Impostazioni.')
        try:
            data = self.cached(('summary', user), lambda: self.client.user_summary(key, user))
        except RAError as error:
            return dict(result, status='offline', message=str(error))
        return dict(result, summary=user_summary(data), recent=recent_achievements(data))

    def profile_games(self, account_id, offset=0):
        """Giochi in cui l'account del profilo ha preso trofei, ``GAMES_PAGE`` per volta da ``offset``.

        Restituisce ``{user, status, message, games, total, offset, more}``
        con ``games`` = ``[{id, title, console, icon, earned, total, lastAt}]``
        nell'ordine del sito; ``status`` come in ``profile_info``.
        """
        self.check_profile(account_id)
        user = self.username(account_id)
        offset = offset if isinstance(offset, int) and offset > 0 else 0
        result = {'user': user, 'status': 'ok', 'message': None, 'games': [], 'total': 0, 'offset': offset,
                  'more': False}
        if user is None:
            return dict(result, status='not_linked')
        key = self.api_key()
        if key is None:
            return dict(result, status='no_key', message='Inserisci la chiave Web API nelle Impostazioni.')
        try:
            data = self.cached(('completion', user, offset),
                               lambda: self.client.completion_progress(key, user, GAMES_PAGE, offset))
        except RAError as error:
            return dict(result, status='offline', message=str(error))
        games = completion_games(data)
        total = as_int(data.get('Total'), offset + len(games))
        return dict(result, games=games, total=total, more=bool(games) and offset + len(games) < total)

    def profile_game(self, account_id, ra_game_id):
        """Tutti i trofei del gioco RetroAchievements ``ra_game_id``, con quelli presi dall'account del profilo.

        Restituisce ``{user, status, message, game, achievements}`` come
        ``game_info``. ``ProfileError`` per un profilo o un gioco non validi.
        """
        self.check_profile(account_id)
        if not valid_id(ra_game_id):
            raise ProfileError('Gioco non valido.')
        user = self.username(account_id)
        result = {'user': user, 'status': 'ok', 'message': None, 'game': None, 'achievements': []}
        if user is None:
            return dict(result, status='not_linked')
        key = self.api_key()
        if key is None:
            return dict(result, status='no_key', message='Inserisci la chiave Web API nelle Impostazioni.')
        try:
            data = self.cached(('progress', ra_game_id, user),
                               lambda: self.client.game_progress(key, ra_game_id, user))
        except RAError as error:
            return dict(result, status='offline', message=str(error))
        return dict(result, game=game_summary(data), achievements=achievement_list(data))

    def badge(self, name, locked=False):
        """PNG del badge, dalla cache su disco o da RetroAchievements. ``ProfileError`` per un nome non valido."""
        if not isinstance(name, str) or not BADGE_PATTERN.match(name):
            raise ProfileError('Badge non valido.')
        filename = '%s%s.png' % (name, '_lock' if locked else '')
        return self.image('badges', filename, lambda: self.client.badge(name, locked))

    def icon(self, name):
        """PNG dell'icona di un gioco, dalla cache su disco o da RetroAchievements. ``ProfileError`` per un nome non valido."""
        if not isinstance(name, str) or not ICON_PATTERN.match(name):
            raise ProfileError('Icona non valida.')
        return self.image('icons', name + '.png', lambda: self.client.game_icon(name))

    def image(self, folder, filename, fetch):
        """Immagine dalla cache su disco (``<cache>/<folder>/<filename>``) oppure da ``fetch()``, poi salvata."""
        path = os.path.join(self.cache_dir, folder, filename) if self.cache_dir else None
        if path and os.path.isfile(path):
            with open(path, 'rb') as stream:
                return stream.read()
        data = fetch()
        if path:
            try:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path + '.tmp', 'wb') as stream:
                    stream.write(data)
                os.replace(path + '.tmp', path)
            except OSError as error:
                log.warning('Immagine %s non salvata nella cache: %s', filename, error)
        return data


def as_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def game_summary(data):
    """Dati del gioco di ``API_GetGameInfoAndUserProgress``: ``{id, title, console, total, earned, points,
    earnedPoints}``."""
    achievements = achievement_list(data)
    return {
        'id': as_int(data.get('ID')),
        'title': str(data.get('Title') or ''),
        'console': str(data.get('ConsoleName') or ''),
        'total': len(achievements),
        'earned': sum(1 for item in achievements if item['unlocked']),
        'points': sum(item['points'] for item in achievements),
        'earnedPoints': sum(item['points'] for item in achievements if item['unlocked']),
    }


def achievement_list(data):
    """Trofei nell'ordine del gioco: ``[{id, title, description, points, badge, unlocked, unlockedAt}]``."""
    raw = data.get('Achievements') if isinstance(data, dict) else None
    items = list(raw.values()) if isinstance(raw, dict) else list(raw or [])
    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        earned = item.get('DateEarned') or item.get('DateEarnedHardcore')
        result.append({
            'id': as_int(item.get('ID')),
            'title': str(item.get('Title') or ''),
            'description': str(item.get('Description') or ''),
            'points': as_int(item.get('Points')),
            'badge': str(item.get('BadgeName') or ''),
            'unlocked': bool(earned),
            'unlockedAt': earned or None,
            'order': as_int(item.get('DisplayOrder')),
        })
    result.sort(key=lambda item: (item['order'], item['id']))
    for item in result:
        del item['order']
    return result


def icon_name(path):
    """Numero dell'immagine da ``ImageIcon`` (``/Images/085573.png`` → ``085573``), oppure ``None``."""
    name = os.path.splitext(os.path.basename(str(path or '')))[0]
    return name if ICON_PATTERN.match(name) else None


def completion_games(data):
    """Giochi di ``API_GetUserCompletionProgress``: ``[{id, title, console, icon, earned, total, lastAt}]``."""
    raw = data.get('Results') if isinstance(data, dict) else None
    result = []
    for item in (raw if isinstance(raw, list) else []):
        if not isinstance(item, dict) or not as_int(item.get('GameID')):
            continue
        result.append({
            'id': as_int(item.get('GameID')),
            'title': str(item.get('Title') or ''),
            'console': str(item.get('ConsoleName') or ''),
            'icon': icon_name(item.get('ImageIcon')),
            'earned': as_int(item.get('NumAwarded')),
            'total': as_int(item.get('MaxPossible')),
            'lastAt': item.get('MostRecentAwardedDate') or None,
        })
    return result


def user_summary(data):
    """Dati dell'utente di ``API_GetUserSummary``: ``{points, softcorePoints, rank, totalRanked, motto}``."""
    rank = data.get('Rank')
    return {
        'points': as_int(data.get('TotalPoints')),
        'softcorePoints': as_int(data.get('TotalSoftcorePoints')),
        'rank': as_int(rank) if rank not in (None, '') else None,
        'totalRanked': as_int(data.get('TotalRanked')),
        'motto': str(data.get('Motto') or ''),
    }


def recent_achievements(data, limit=10):
    """Ultimi trofei del sito, dal più recente: ``[{id, title, description, points, badge, game, at}]``."""
    raw = data.get('RecentAchievements') if isinstance(data, dict) else None
    result = []
    for games in (raw.values() if isinstance(raw, dict) else []):
        for item in (games.values() if isinstance(games, dict) else []):
            if not isinstance(item, dict):
                continue
            result.append({
                'id': as_int(item.get('ID')),
                'title': str(item.get('Title') or ''),
                'description': str(item.get('Description') or ''),
                'points': as_int(item.get('Points')),
                'badge': str(item.get('BadgeName') or ''),
                'game': str(item.get('GameTitle') or ''),
                'at': str(item.get('DateAwarded') or ''),
            })
    result.sort(key=lambda item: item['at'], reverse=True)
    return result[:limit]
