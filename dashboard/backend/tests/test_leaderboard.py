import datetime
import os
import tempfile
import unittest

from pixelarcade.db import Database
from pixelarcade.leaderboard import LeaderboardService
from pixelarcade.profiles import ProfileService
from pixelarcade.repositories.challenges import ChallengesRepository
from pixelarcade.repositories.profiles import ProfilesRepository
from pixelarcade.repositories.sessions import SessionsRepository

UTC = datetime.timezone.utc
NOW = '2026-10-19T10:00:00+00:00'


class FakeLibrary:
    """Libreria con tre giochi arcade; ``gone.zip`` è stato cancellato dal disco."""

    games = {
        ('arcade', 'pang.zip'): {'title': 'Pang', 'cover': True},
        ('arcade', 'sf2.zip'): {'title': 'Street Fighter II', 'cover': True},
        ('arcade', 'mslug.zip'): {'title': 'Metal Slug', 'cover': False},
    }

    def find(self, system_id, game_id):
        game = self.games.get((system_id, game_id))
        return None if game is None else dict(game, id=game_id)


class LeaderboardTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        self.sessions = SessionsRepository(self.db)
        self.profiles = ProfileService(ProfilesRepository(self.db), self.sessions, FakeLibrary(), lambda: NOW)
        # Mercoledì 21 ottobre 2026: la settimana va da lunedì 19 a lunedì 26 (esclusa).
        self.moment = datetime.datetime(2026, 10, 21, 12, 0, tzinfo=UTC)
        self.repo = ChallengesRepository(self.db)
        self.service = LeaderboardService(self.repo, self.sessions, self.profiles, tz=UTC,
                                          clock=lambda: self.moment, now=lambda: NOW)
        self.profiles.challenge = self.service.is_challenge
        self.ada = self.profiles.create('ada', '#ff5d73')['id']
        self.bea = self.profiles.create('bea', '#3ccfc4')['id']

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def play(self, game, seconds, players, ended='2026-10-20T11:00:00+00:00'):
        session = self.sessions.start('arcade', game, 'fbneo', ended)
        self.sessions.finish(session, ended, seconds, 0)
        return self.profiles.record_session(session, players, seconds)

    def test_settimana(self):
        week = self.service.week()
        self.assertEqual((week['week'], week['start'], week['end']),
                         ('2026-10-19', '2026-10-19T00:00:00+00:00', '2026-10-26T00:00:00+00:00'))
        self.assertEqual(self.service.week(back=1)['week'], '2026-10-12')
        sunday = datetime.datetime(2026, 10, 25, 23, 59, tzinfo=UTC)
        self.assertEqual(self.service.week(sunday)['week'], '2026-10-19')

    def test_nessuna_sfida_senza_partite(self):
        board = self.service.board()
        self.assertIsNone(board['challenge'])
        self.assertIsNone(self.repo.get('2026-10-19'))
        self.assertEqual([item['name'] for item in board['leaders']], ['ADA', 'BEA'])
        self.assertEqual(board['topGames'], [])

    def test_sfida_estratta_tra_i_giocati_e_stabile(self):
        self.play('pang.zip', 600, [self.ada, None], '2026-10-01T10:00:00+00:00')
        self.play('sf2.zip', 600, [self.bea, None], '2026-10-01T11:00:00+00:00')
        # Gioco non più presente nella libreria: non si estrae.
        self.play('gone.zip', 600, [self.bea, None], '2026-10-01T12:00:00+00:00')
        game = self.service.challenge_game('2026-10-19')
        self.assertIn(game, [('arcade', 'pang.zip'), ('arcade', 'sf2.zip')])
        # Un gioco nuovo giocato in settimana non cambia la sfida.
        self.play('mslug.zip', 600, [self.ada, None], '2026-10-20T10:00:00+00:00')
        self.assertEqual(self.service.challenge_game('2026-10-19'), game)
        self.assertEqual(self.repo.get('2026-10-19'), game)

    def test_minuti_doppi_sul_gioco_della_sfida(self):
        self.play('pang.zip', 60, [self.ada, None], '2026-10-01T10:00:00+00:00')
        self.assertEqual(self.service.challenge_game('2026-10-19'), ('arcade', 'pang.zip'))
        gained = self.play('pang.zip', 10 * 60, [self.ada, self.bea])
        self.assertEqual(gained[self.ada]['parts'], {'minutes': 10, 'session': 5, 'newGame': 0, 'challenge': 10})
        self.assertEqual(gained[self.bea]['xpGained'], 10 + 10 + 5 + 25)
        other = self.play('sf2.zip', 10 * 60, [self.ada, None])
        self.assertEqual(other[self.ada]['parts']['challenge'], 0)

    def test_classifica_della_sfida_e_vincitore_precedente(self):
        self.repo.add('2026-10-12', 'arcade', 'sf2.zip', NOW)
        self.repo.add('2026-10-19', 'arcade', 'pang.zip', NOW)
        self.play('sf2.zip', 300, [self.ada, None], '2026-10-13T10:00:00+00:00')
        self.play('sf2.zip', 900, [self.bea, None], '2026-10-14T10:00:00+00:00')
        self.play('pang.zip', 120, [self.ada, None], '2026-10-20T10:00:00+00:00')
        self.play('pang.zip', 300, [self.ada, self.bea], '2026-10-21T10:00:00+00:00')
        # Fuori settimana: non conta.
        self.play('pang.zip', 5000, [self.bea, None], '2026-10-18T23:00:00+00:00')
        board = self.service.board()
        challenge = board['challenge']
        self.assertEqual((challenge['game'], challenge['week'], challenge['daysLeft']), ('arcade/pang.zip', '2026-10-19', 5))
        self.assertEqual([(item['name'], item['seconds']) for item in challenge['ranking']], [('ADA', 420), ('BEA', 300)])
        self.assertEqual((board['lastWinner']['name'], board['lastWinner']['game'], board['lastWinner']['seconds']),
                         ('BEA', 'arcade/sf2.zip', 900))
        self.assertEqual(board['games']['arcade/pang.zip']['title'], 'Pang')

    def test_classifica_dei_profili_e_giochi_di_casa(self):
        self.play('pang.zip', 30 * 60, [self.bea, None], '2026-10-01T10:00:00+00:00')
        self.play('sf2.zip', 5 * 60, [self.bea, None], '2026-10-01T11:00:00+00:00')
        self.play('sf2.zip', 10 * 60, [self.ada, None], '2026-10-01T12:00:00+00:00')
        self.profiles.create('cleo', '#f5c542')
        board = self.service.board()
        self.assertEqual([item['name'] for item in board['leaders']], ['BEA', 'ADA', 'CLEO'])
        bea = board['leaders'][0]
        self.assertEqual((bea['xp'], bea['played'], bea['top']), (30 + 5 + 25 + 5 + 5 + 25, 2,
                                                                 {'game': 'arcade/pang.zip', 'seconds': 1800}))
        self.assertIsNone(board['leaders'][2]['top'])
        self.assertEqual(board['topGames'], [{'game': 'arcade/pang.zip', 'seconds': 1800, 'players': 1},
                                             {'game': 'arcade/sf2.zip', 'seconds': 900, 'players': 2}])

    def test_al_massimo_cinque_profili(self):
        for name in ('c', 'd', 'e', 'f'):
            self.profiles.create(name, '#f5c542')
        self.assertEqual(len(self.service.board()['leaders']), 5)


if __name__ == '__main__':
    unittest.main()
