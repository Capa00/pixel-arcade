import os
import threading
import unittest

from pixelarcade import addons
from pixelarcade.errors import TournamentError

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
addon = addons.load_package(HERE)
rules = __import__(addons.module_name('autoresult') + '.rules', fromlist=['rules'])

WJ_HASH = 'c9a5750db3e5f76e917e153dc097e738'
ACTIVE, P1, P2 = 0x101, 0x873, 0x8f3


def windjammers():
    return rules.find(rules.load(), 'arcade', WJ_HASH)


def values(players, p1, p2):
    return {ACTIVE: players, P1: p1, P2: p2}


def run(detector, readings):
    """Primo esito della sequenza ``readings`` (ognuna letta due volte, come a 5 letture al secondo)."""
    for reading in readings:
        for _ in range(2):
            found = detector.feed(values(*reading))
            if found is not None:
                return found
    return None


class RulesTest(unittest.TestCase):
    def test_windjammers_rules_load(self):
        game = windjammers()
        self.assertEqual(game['title'], 'Windjammers')
        self.assertEqual([mode['id'] for mode in game['modes']], ['match'])
        self.assertIsNone(rules.find(rules.load(), 'snes', WJ_HASH))

    def detector(self):
        return rules.Detector(windjammers()['modes'][0]['detect'])

    def test_win_after_tied_set(self):
        # Partita registrata il 2026-11-05: set pari (1–1), poi P2 vince il set finale.
        found = run(self.detector(), [(3, 0, 0), (3, 1, 1), (3, 1, 2)])
        self.assertEqual(found, {'winner': 'p2', 'score': [1, 2]})

    def test_sudden_death_win(self):
        found = run(self.detector(), [(3, 0, 0), (3, 1, 1), (3, 2, 2), (3, 3, 2)])
        self.assertEqual(found, {'winner': 'p1', 'score': [3, 2]})

    def test_draw_game(self):
        found = run(self.detector(), [(3, 0, 0), (3, 1, 1), (3, 2, 2), (3, 3, 3)])
        self.assertEqual(found, {'winner': None, 'score': [3, 3]})

    def test_old_values_and_demo_ignored(self):
        # Valori rimasti dalla partita prima e demo (un solo giocatore): niente esito finché non si gioca a due.
        self.assertIsNone(run(self.detector(), [(3, 1, 2), (1, 0, 0), (1, 2, 0)]))

    def test_single_reading_not_enough(self):
        detector = self.detector()
        detector.feed(values(3, 0, 0))
        self.assertIsNone(detector.feed(values(3, 2, 0)))
        self.assertIsNone(detector.feed(values(3, 0, 0)))

    def test_invalid_rules(self):
        with self.assertRaises(rules.RuleError):
            rules.check_game({'title': 'x', 'system': 'arcade', 'hashes': ['a'], 'modes': [
                {'id': 'm', 'label': 'M', 'text': 'T', 'detect': {'kind': 'other'}}]})


class FakeNet:
    """RetroArch finto: ``READ_CORE_RAM`` legge da ``ram`` e i comandi inviati vanno in ``sent``."""

    def __init__(self):
        self.ram = {ACTIVE: 3, P1: 0, P2: 0}
        self.sent = []
        self.quit = threading.Event()

    def ask(self, command):
        name, at, _ = command.split()
        at = int(at, 16)
        return '%s %x %02X' % (name, at, self.ram.get(at, 0))

    def send(self, command):
        self.sent.append(command)
        if command == 'QUIT':
            self.quit.set()


class FakeRepo:
    def game(self, system, game):
        return {'hash': WJ_HASH} if (system, game) == ('arcade', 'wj') else None

    def games(self, system):
        return {'wj': {'hash': WJ_HASH}, 'other': {'hash': 'x'}} if system == 'arcade' else {}


class FakeRA:
    repo = FakeRepo()


class FakeLibrary:
    def find(self, system, game):
        return {'id': game}


def tournament(**addon_values):
    return {'id': 1, 'status': 'open', 'system': 'arcade', 'game': 'wj',
            'addons': {'autoresult': addon_values} if addon_values else {}}


class WatcherTest(unittest.TestCase):
    def setUp(self):
        self.net = FakeNet()
        self.watcher = addon.Watcher({'ra': FakeRA(), 'library': FakeLibrary()}, net_factory=lambda: self.net,
                                     poll=0.005, delay=0.01)

    def info(self, **addon_values):
        return {'tournament': tournament(**addon_values), 'match': 7, 'gameNo': 1, 'sideA': 'p1',
                'players': [10, 20], 'core': 'fbneo'}

    def test_end_detected_closes_game_and_gives_verdict(self):
        self.watcher.game_started(self.info())
        threading.Timer(0.05, lambda: self.net.ram.update({P1: 2, P2: 1})).start()
        self.assertTrue(self.net.quit.wait(2))
        verdict = self.watcher.game_ended(self.info())
        self.assertEqual(verdict, {'addon': 'autoresult', 'winner': 'p1', 'score': [2, 1]})

    def test_closed_before_end_gives_nothing(self):
        self.watcher.game_started(self.info())
        self.assertIsNone(self.watcher.game_ended(self.info()))
        self.assertEqual(self.net.sent, [])

    def test_disabled_does_not_watch(self):
        self.watcher.game_started(self.info(enabled=False))
        self.assertIsNone(self.watcher.current)

    def test_check(self):
        self.assertEqual(self.watcher.check(tournament(), {'enabled': False}), {'enabled': False, 'mode': None})
        self.assertEqual(self.watcher.check(tournament(), {'mode': 'match'}), {'enabled': True, 'mode': 'match'})
        with self.assertRaises(TournamentError):
            self.watcher.check(tournament(), {'mode': 'lines'})
        with self.assertRaises(TournamentError):
            self.watcher.check(tournament(), {'enabled': 'yes'})

    def test_bootstrap_lists_known_games(self):
        data = self.watcher.bootstrap()['tournament']
        self.assertEqual([(item['system'], item['game']) for item in data['games']], [('arcade', 'wj')])
        self.assertEqual(data['games'][0]['modes'][0]['label'], 'Vittoria della partita')

    def test_parse_byte(self):
        self.assertEqual(addon.parse_byte('READ_CORE_RAM 873 02', 0x873), 2)
        self.assertIsNone(addon.parse_byte('READ_CORE_RAM 873 -1 no memory', 0x873))
        self.assertIsNone(addon.parse_byte(None, 0x873))


if __name__ == '__main__':
    unittest.main()
