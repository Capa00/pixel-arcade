"""Estensione «Fine partita automatica»: negli incontri dei tornei riconosce la fine della partita e il vincitore.

Per i giochi con un file in ``rules/`` (vedi ``rules.py``) la sezione dell'estensione compare nelle
impostazioni del torneo: interruttore (acceso per impostazione predefinita) e tipo di conteggio, con la
spiegazione. A torneo in corso si può solo spegnere.

Durante una partita di un incontro con l'estensione accesa si legge la RAM del gioco
(``READ_CORE_RAM`` sui comandi di rete di RetroArch) ogni ``POLL_SECONDS``. Quando la regola vede la fine
della partita si aspettano ``CLOSE_DELAY`` secondi (la schermata di vittoria), poi RetroArch si chiude
con ``QUIT``. Alla chiusura l'esito (``{addon, winner, score}``) passa alla dichiarazione automatica del
torneo (``TournamentRunService.auto_declare``). Se la RAM non si legge, o la partita si chiude prima della
fine, non succede niente: la partita si dichiara a mano.

Nessuna rotta: i dati per le Impostazioni arrivano con ``GET /api/bootstrap`` in ``addons.autoresult``::

    {"tournament": {"title": "...", "games": [{"system", "game", "title", "modes": [{"id", "label", "text"}]}]}}

``games`` sono i giochi della libreria riconosciuti da una regola. Impostazioni salvate nel torneo
(``addons.autoresult``): ``{"enabled": bool, "mode": "<id>"}``.
"""
import logging
import threading

from pixelarcade.errors import TournamentError
from pixelarcade.retroarch_net import RetroArchNet

from . import rules

ID = 'autoresult'
TITLE = 'Fine partita automatica'
POLL_SECONDS = 0.2
CLOSE_DELAY = 3.5

log = logging.getLogger(__name__)


def parse_byte(reply, at):
    """Byte letto da una risposta ``READ_CORE_RAM <indirizzo> <byte>``, oppure ``None``."""
    if not reply:
        return None
    parts = reply.split()
    if len(parts) != 3 or parts[0] != 'READ_CORE_RAM':
        return None
    try:
        if int(parts[1], 16) != at:
            return None
        return int(parts[2], 16)
    except ValueError:
        return None


def settings_of(tournament):
    """Impostazioni salvate nel torneo: ``{enabled, mode}`` (acceso se non c'è niente)."""
    value = (tournament.get('addons') or {}).get(ID) or {}
    return {'enabled': value.get('enabled') is not False, 'mode': value.get('mode')}


class Watcher:
    """Osservatore delle partite degli incontri (``TournamentRunService.add_game_listener``)."""

    def __init__(self, services, games=None, net_factory=None, poll=POLL_SECONDS, delay=CLOSE_DELAY):
        self.services = services
        self.games = rules.load(warn=self.warn) if games is None else games
        self.net_factory = net_factory or self.default_net
        self.poll = poll
        self.delay = delay
        self.lock = threading.Lock()
        # Partita osservata: ``{match, gameNo, stop, thread, verdict}``.
        self.current = None

    @staticmethod
    def warn(name, error):
        log.warning('Regole %s non valide: %s', name, error)

    def default_net(self):
        return RetroArchNet(self.services['play'].config.get()['retroarch.network_port'])

    def hash_of(self, system, game):
        ra = self.services.get('ra')
        repo = getattr(ra, 'repo', None)
        if repo is None or not system or not game:
            return None
        found = repo.game(system, game)
        return found['hash'] if found else None

    def game_rules(self, tournament):
        """Regole del gioco del torneo, oppure ``None``."""
        return rules.find(self.games, tournament.get('system'), self.hash_of(tournament.get('system'),
                                                                               tournament.get('game')))

    # --- Impostazioni del torneo -----------------------------------------------------

    def check(self, tournament, value):
        """Valore di ``addons.autoresult`` controllato (``TournamentService.addon_settings``)."""
        if not isinstance(value, dict) or set(value) - {'enabled', 'mode'}:
            raise TournamentError('Impostazioni della fine partita automatica non valide.')
        current = settings_of(tournament)
        enabled = value.get('enabled', current['enabled'])
        if not isinstance(enabled, bool):
            raise TournamentError('Impostazioni della fine partita automatica non valide.')
        mode = value.get('mode', current['mode'])
        if mode is not None:
            game = self.game_rules(tournament)
            if not isinstance(mode, str) or (game is not None and all(item['id'] != mode for item in game['modes'])):
                raise TournamentError('Tipo di conteggio sconosciuto.')
        return {'enabled': enabled, 'mode': mode}

    def bootstrap(self):
        games = []
        library = self.services.get('library')
        ra = self.services.get('ra')
        repo = getattr(ra, 'repo', None)
        if repo is None:
            return {'tournament': {'title': TITLE, 'games': games}}
        for system in sorted({game['system'] for game in self.games}):
            for game_id, info in sorted(repo.games(system).items()):
                game = rules.find(self.games, system, info.get('hash'))
                if game is None:
                    continue
                if library is not None and library.find(system, game_id) is None:
                    continue
                games.append({'system': system, 'game': game_id, 'title': game['title'],
                              'modes': [{key: mode[key] for key in ('id', 'label', 'text')}
                                        for mode in game['modes']]})
        return {'tournament': {'title': TITLE, 'games': games}}

    # --- Partite ---------------------------------------------------------------------

    def game_started(self, info):
        self.stop_current()
        tournament = info['tournament']
        settings = settings_of(tournament)
        if not settings['enabled']:
            return
        game = self.game_rules(tournament)
        if game is None:
            return
        mode = rules.mode_of(game, settings['mode'])
        watch = {'match': info['match'], 'gameNo': info['gameNo'], 'stop': threading.Event(), 'verdict': None}
        watch['thread'] = threading.Thread(target=self.run, args=(watch, mode['detect']), daemon=True,
                                           name='autoresult')
        with self.lock:
            self.current = watch
        log.info('Fine partita automatica attiva: %s, %s (incontro %d, partita %d).', game['title'], mode['label'],
                 info['match'], info['gameNo'])
        watch['thread'].start()

    def game_ended(self, info):
        watch = self.stop_current()
        if watch is None or info is None or watch['match'] != info['match'] or watch['gameNo'] != info['gameNo']:
            return None
        verdict = watch['verdict']
        if verdict is None:
            return None
        return {'addon': ID, 'winner': verdict['winner'], 'score': verdict['score']}

    def stop_current(self):
        with self.lock:
            watch, self.current = self.current, None
        if watch is not None:
            watch['stop'].set()
            if watch['thread'] is not threading.current_thread():
                watch['thread'].join(2)
        return watch

    def read(self, net, at):
        return parse_byte(net.ask('READ_CORE_RAM %x 1' % at), at)

    def run(self, watch, detect):
        detector = rules.Detector(detect)
        net = self.net_factory()
        stop = watch['stop']
        while not stop.wait(self.poll):
            values = {at: self.read(net, at) for at in rules.addresses(detect)}
            found = detector.feed(values)
            if found is None:
                continue
            watch['verdict'] = found
            log.info('Fine della partita rilevata (incontro %d, partita %d): %s.', watch['match'], watch['gameNo'],
                     found)
            if stop.wait(self.delay):
                return
            try:
                net.send('QUIT')
            except Exception as error:
                log.warning('Gioco non chiuso con QUIT, interrompo la partita: %s', error)
                self.services['play'].stop()
            return


def register(router, services):
    watcher = Watcher(services)
    services['autoresult'] = watcher
    services['tournaments'].addon_settings[ID] = watcher.check
    services['tournamentRun'].add_game_listener(watcher)


def bootstrap(services):
    watcher = services.get('autoresult')
    return watcher.bootstrap() if watcher is not None else {'tournament': {'title': TITLE, 'games': []}}


def stop():
    pass
