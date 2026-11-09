import os
import tempfile
import unittest

from pixelarcade.db import Database
from pixelarcade.errors import ChallengeError, ConflictError, LaunchError
from pixelarcade.profiles import ProfileService
from pixelarcade.repositories.profiles import ProfilesRepository
from pixelarcade.repositories.retroachievements import RARepository
from pixelarcade.repositories.sessions import SessionsRepository
from pixelarcade.repositories.trophy_challenges import TrophyChallengesRepository
from pixelarcade.trophy_challenges import TrophyChallengeService, pick_state, ranking

NOW = '2026-10-19T10:00:00+00:00'
GAME = {'system': 'gba', 'id': 'tetris.gba', 'title': 'Tetris Worlds'}


class FakeLibrary:
    def find(self, system_id, game_id):
        return None


class FakeRescue:
    """Stati periodici finti: ``items`` e secondi di gioco ``now``."""

    def __init__(self):
        self.items = []
        self.now = 0.0

    def run_items(self):
        return list(self.items)

    def played(self):
        return self.now


def entry(folder, number, played):
    path = os.path.join(folder, '%d.state' % number)
    with open(path, 'wb') as stream:
        stream.write(b'stato %d' % number)
    return {'at': NOW, 'core': 'mgba', 'state': path, 'png': None, 'played': played}


class FunctionsTest(unittest.TestCase):
    def test_stato_vicino_a_cinque_minuti(self):
        items = [{'played': value} for value in (60, 120, 180, 240, 300)]
        # Trofeo a 430 s: il bersaglio è 130 s, vince lo stato a 120 s.
        self.assertEqual(pick_state(items, 430)['played'], 120)
        # Partita più corta di 5 minuti: lo stato più vecchio.
        self.assertEqual(pick_state(items, 320)['played'], 60)
        # A pari distanza vince il più vecchio (sfida più lunga).
        self.assertEqual(pick_state([{'played': 100}, {'played': 140}], 420)['played'], 100)
        # Nessuno stato prima del trofeo.
        self.assertIsNone(pick_state(items, 50))
        self.assertIsNone(pick_state([], 500))

    def test_classifica(self):
        runs = [
            {'account': 1, 'won': True, 'seconds': 300, 'at': 'a'},
            {'account': 2, 'won': False, 'seconds': None, 'at': 'b'},
            {'account': 2, 'won': True, 'seconds': 250, 'at': 'c'},
            {'account': 3, 'won': False, 'seconds': None, 'at': 'd'},
            {'account': 1, 'won': True, 'seconds': 280, 'at': 'e'},
        ]
        names = {1: {'name': 'ada', 'color': '#f00'}, 2: {'name': 'bea', 'color': '#0f0'}}
        board = ranking(runs, names)
        self.assertEqual([(row['name'], row['best'], row['attempts']) for row in board],
                         [('bea', 250, 2), ('ada', 280, 2), ('?', None, 1)])


class ServiceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        profiles = ProfileService(ProfilesRepository(self.db), SessionsRepository(self.db), FakeLibrary(),
                                  lambda: NOW)
        self.ada = profiles.create('ada', '#ff5d73')['id']
        self.bea = profiles.create('bea', '#3ccfc4')['id']
        self.cid = profiles.create('cid', '#f5c542')['id']
        self.ra = RARepository(self.db)
        self.ra.link(self.ada, 'Ada', 'token', NOW)
        self.ra.link(self.bea, 'Bea', 'token', NOW)
        self.now = NOW
        self.rescue = FakeRescue()
        self.runs = os.path.join(self.tmp.name, 'rescue')
        os.makedirs(self.runs)
        self.service = TrophyChallengeService(TrophyChallengesRepository(self.db), self.rescue, self.ra,
                                              ProfilesRepository(self.db), FakeLibrary(), self.tmp.name,
                                              spawn=lambda target: target(), now=lambda: self.now)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def play_creator(self, unlocks=((7, 'Single Pringle', 430),)):
        """Partita di ada con stati periodici ogni minuto e i trofei ``(id, titolo, secondi)``."""
        self.rescue.items = [entry(self.runs, number, number * 60) for number in range(1, 8)]
        self.service.started(GAME, 'mgba', [self.ada, None])
        for achievement, title, played in unlocks:
            self.rescue.now = played
            self.service.awarded({'id': achievement, 'title': title, 'at': NOW})
        earned = [{'id': achievement, 'title': title, 'at': NOW} for achievement, title, _ in unlocks]
        return self.service.finished([self.ada, None], {'unlocks': earned, 'earner': self.ada}, 1234)

    def test_punti_di_sfida_e_creazione(self):
        result = self.play_creator([(7, 'Single Pringle', 430), (8, 'Double Trouble', 450),
                                    (101000001, 'Unsupported Game Version', 460)])
        # Stato a 120 s (il più vicino a 5 minuti prima): 310 s e 330 s; l'avviso di RetroArch non conta.
        self.assertEqual(result['challengeCandidates'],
                         [{'achievementId': 7, 'title': 'Single Pringle', 'seconds': 310},
                          {'achievementId': 8, 'title': 'Double Trouble', 'seconds': 330}])
        self.assertEqual(sorted(os.listdir(self.service.run_dir())), ['7.state', '8.state'])
        with self.assertRaises(ConflictError):
            self.service.create(self.bea, [7])
        with self.assertRaises(ChallengeError):
            self.service.create(self.ada, [])
        created = self.service.create(self.ada, [8])['created']
        self.assertEqual(len(created), 1)
        # Il punto non scelto si cancella, quello scelto diventa la sfida.
        self.assertFalse(os.path.exists(self.service.run_dir()))
        self.assertEqual(self.service.candidates(), [])
        overview = self.service.overview(self.ada)
        self.assertEqual(len(overview['mine']), 1)
        mine = overview['mine'][0]
        self.assertEqual((mine['achievementTitle'], mine['seconds'], mine['raGameId'], mine['daysLeft']),
                         ('Double Trouble', 330, 1234, 15))
        self.assertEqual(mine['record'], {'account': self.ada, 'name': 'ADA', 'seconds': 330})
        # Per gli altri è aperta, con l'avviso (anche per chi non ha l'account, che però non può giocarla).
        self.assertEqual(len(self.service.overview(self.bea)['open']), 1)
        notices = self.service.notices(self.cid)
        self.assertEqual((len(notices['challenges']), notices['linked']), (1, False))
        self.assertEqual(self.service.notices(self.ada)['challenges'], [])
        self.service.mark_seen(self.cid, created[0], 'notice')
        self.assertEqual(self.service.notices(self.cid)['challenges'], [])
        with self.assertRaises(LaunchError):
            self.service.launch(created[0], [self.cid, None])
        launch = self.service.launch(created[0], [self.bea, None])
        self.assertEqual((launch['system'], launch['game'], launch['challenge']['core']), ('gba', 'tetris.gba', 'mgba'))
        self.assertTrue(os.path.exists(launch['challenge']['state']))

    def test_nessuna_scelta_cancella_tutto(self):
        self.play_creator()
        self.assertTrue(os.path.exists(self.service.run_dir()))
        self.service.discard()
        self.assertFalse(os.path.exists(self.service.run_dir()))
        with self.assertRaises(ConflictError):
            self.service.create(self.ada, [7])

    def test_nuova_partita_cancella_i_punti(self):
        self.play_creator()
        self.service.started(GAME, 'mgba', [self.bea, None])
        self.assertEqual(self.service.candidates(), [])
        self.assertFalse(os.path.exists(self.service.run_dir()))

    def test_senza_account_niente_punti(self):
        self.rescue.items = [entry(self.runs, 1, 60)]
        self.service.started(GAME, 'mgba', [self.cid, None])
        self.rescue.now = 200
        self.service.awarded({'id': 7, 'title': 'Single Pringle', 'at': NOW})
        result = self.service.finished([self.cid, None], {'unlocks': [{'id': 7}], 'earner': None})
        self.assertEqual(result, {})

    def test_tentativi_e_record(self):
        self.play_creator()
        challenge_id = self.service.create(self.ada, [7])['created'][0]
        # bea: tempo dallo stato caricato (offset 2 s), trofeo a 252 s → 250 s, record battuto.
        self.rescue.now = 2
        self.service.started(GAME, 'mgba', [self.bea, None], challenge_id)
        self.rescue.now = 252
        self.service.awarded({'id': 7, 'title': 'Single Pringle', 'at': NOW})
        outcome = self.service.finished([self.bea, None], {'unlocks': [{'id': 7}]})['challenge']
        self.assertEqual((outcome['won'], outcome['seconds'], outcome['beatRecord'], outcome['attempts']),
                         (True, 250, True, 1))
        self.assertEqual(outcome['previousRecord']['name'], 'ADA')
        self.assertEqual(outcome['record']['name'], 'BEA')
        # Tentativo senza trofeo.
        self.rescue.now = 0
        self.service.started(GAME, 'mgba', [self.bea, None], challenge_id)
        outcome = self.service.finished([self.bea, None], {'unlocks': []})['challenge']
        self.assertEqual((outcome['won'], outcome['attempts']), (False, 2))
        # ada migliora il suo tempo (Encore): record di nuovo suo.
        self.rescue.now = 0
        self.service.started(GAME, 'mgba', [self.ada, None], challenge_id)
        self.rescue.now = 200
        self.service.awarded({'id': 7, 'title': 'Single Pringle', 'at': NOW})
        outcome = self.service.finished([self.ada, None], {'unlocks': [{'id': 7}]})['challenge']
        self.assertTrue(outcome['personalBest'])
        self.assertTrue(outcome['beatRecord'])
        board = self.service.overview(self.ada)['mine'][0]['ranking']
        self.assertEqual([(row['name'], row['best'], row['attempts']) for row in board],
                         [('ADA', 200, 2), ('BEA', 250, 2)])

    def test_scadenza(self):
        self.play_creator()
        challenge_id = self.service.create(self.ada, [7])['created'][0]
        self.service.started(GAME, 'mgba', [self.bea, None], challenge_id)
        self.service.finished([self.bea, None], {'unlocks': []})
        self.now = '2026-11-03T10:00:01+00:00'
        overview = self.service.overview(self.bea)
        self.assertEqual((overview['open'], len(overview['ended'])), ([], 1))
        self.assertEqual(self.service.overview(self.cid)['ended'], [])
        self.assertEqual(os.listdir(self.service.root), [])
        with self.assertRaises(LaunchError):
            self.service.launch(challenge_id, [self.bea, None])
        # Riepilogo finale a chi ha partecipato, creatore compreso, una volta sola.
        self.assertEqual(len(self.service.notices(self.bea)['finals']), 1)
        self.assertEqual(len(self.service.notices(self.ada)['finals']), 1)
        self.assertEqual(self.service.notices(self.cid)['finals'], [])
        self.service.mark_seen(self.bea, challenge_id, 'final')
        self.assertEqual(self.service.notices(self.bea)['finals'], [])


if __name__ == '__main__':
    unittest.main()
