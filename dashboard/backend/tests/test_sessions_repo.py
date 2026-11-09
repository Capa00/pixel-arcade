import os
import tempfile
import unittest

from pixelarcade.db import Database
from pixelarcade.repositories.profiles import ProfilesRepository
from pixelarcade.repositories.sessions import SessionsRepository


class SessionsRepositoryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        self.repo = SessionsRepository(self.db)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def test_partita(self):
        first = self.repo.start('arcade', 'pang.zip', 'mame2010', '2026-09-23T10:00:00+00:00')
        second = self.repo.start('arcade', 'pang.zip', 'mame2010', '2026-09-23T11:00:00+00:00')
        self.assertNotEqual(first, second)
        self.assertEqual(self.repo.get(first)['seconds'], None)
        self.repo.finish(first, '2026-09-23T10:02:00+00:00', 120, 0)
        self.assertEqual(self.repo.get(first), {
            'id': first, 'system': 'arcade', 'game': 'pang.zip', 'core': 'mame2010',
            'startedAt': '2026-09-23T10:00:00+00:00', 'endedAt': '2026-09-23T10:02:00+00:00',
            'seconds': 120, 'exitCode': 0,
        })
        self.assertIsNone(self.repo.get(999))

    def session(self, game, ended, seconds):
        session = self.repo.start('arcade', game, 'fbneo', '2026-09-23T09:00:00+00:00')
        self.repo.finish(session, ended, seconds, 0)
        return session

    def test_statistiche_recenti_e_giochi_provati(self):
        profiles = ProfilesRepository(self.db)
        luca = profiles.create('LUCA', '#ff5d73', '2026-09-23T09:00:00+00:00')
        sara = profiles.create('SARA', '#3ccfc4', '2026-09-23T09:00:00+00:00')
        self.assertEqual(self.repo.stats(luca), {'seconds': 0, 'sessions': 0, 'xp': 0, 'played': 0})
        self.assertEqual(self.repo.recent(luca), [])
        first = self.session('pang.zip', '2026-09-23T10:00:00+00:00', 100)
        self.repo.add_players(first, [(luca, 'p1', 30), (sara, 'p2', 30)])
        self.assertTrue(self.repo.has_played(luca, 'arcade', 'pang.zip'))
        self.assertFalse(self.repo.has_played(luca, 'arcade', 'sf2.zip'))
        second = self.session('sf2.zip', '2026-09-23T11:00:00+00:00', 200)
        self.repo.add_players(second, [(luca, 'p1', 8)])
        third = self.session('pang.zip', '2026-09-23T12:00:00+00:00', 300)
        self.repo.add_players(third, [(luca, 'p2', 10)])
        self.assertEqual(self.repo.stats(luca), {'seconds': 600, 'sessions': 3, 'xp': 48, 'played': 2})
        self.assertEqual(self.repo.stats(sara), {'seconds': 100, 'sessions': 1, 'xp': 30, 'played': 1})
        self.assertEqual(self.repo.recent(luca), [
            {'system': 'arcade', 'game': 'pang.zip', 'endedAt': '2026-09-23T12:00:00+00:00', 'seconds': 300},
            {'system': 'arcade', 'game': 'sf2.zip', 'endedAt': '2026-09-23T11:00:00+00:00', 'seconds': 200},
        ])
        self.assertEqual(len(self.repo.recent(luca, 1)), 1)
        self.assertEqual([item['game'] for item in self.repo.recent(sara)], ['pang.zip'])

    def test_console_giochi_piu_giocati_e_storico(self):
        profiles = ProfilesRepository(self.db)
        luca = profiles.create('LUCA', '#ff5d73', '2026-09-23T09:00:00+00:00')
        sara = profiles.create('SARA', '#3ccfc4', '2026-09-23T09:00:00+00:00')
        self.assertEqual((self.repo.by_system(luca), self.repo.top_games(luca), self.repo.history(luca)), ([], [], []))
        first = self.session('pang.zip', '2026-09-23T10:00:00+00:00', 100)
        self.repo.add_players(first, [(luca, 'p1', 30), (sara, 'p2', 30)])
        short = self.session('sf2.zip', '2026-09-23T11:00:00+00:00', 25)
        self.repo.add_players(short, [(luca, 'p1', 3)])
        nes = self.repo.start('nes', 'zelda.nes', 'fceumm', '2026-09-23T11:30:00+00:00')
        self.repo.finish(nes, '2026-09-23T12:00:00+00:00', 500, 0)
        self.repo.add_players(nes, [(luca, 'p2', 9)])
        with self.db.transaction() as conn:
            conn.execute("INSERT INTO ra_unlocks (session_id, account_id, achievement_id, title, unlocked_at) "
                         "VALUES (?, ?, 2, 'Secondo', '2026-09-23T09:50:00+00:00'), "
                         "(?, ?, 1, 'Primo', '2026-09-23T09:40:00+00:00'), "
                         "(?, ?, 1, 'Di Sara', '2026-09-23T09:40:00+00:00')",
                         (first, luca, first, luca, first, sara))
        self.assertEqual(self.repo.by_system(luca), [
            {'system': 'nes', 'seconds': 500, 'sessions': 1},
            {'system': 'arcade', 'seconds': 125, 'sessions': 2},
        ])
        self.assertEqual(self.repo.top_games(luca), [
            {'system': 'nes', 'game': 'zelda.nes', 'seconds': 500, 'sessions': 1,
             'lastAt': '2026-09-23T12:00:00+00:00'},
            {'system': 'arcade', 'game': 'pang.zip', 'seconds': 100, 'sessions': 1,
             'lastAt': '2026-09-23T10:00:00+00:00'},
            {'system': 'arcade', 'game': 'sf2.zip', 'seconds': 25, 'sessions': 1,
             'lastAt': '2026-09-23T11:00:00+00:00'},
        ])
        self.assertEqual(len(self.repo.top_games(luca, 1)), 1)
        history = self.repo.history(luca, min_seconds=30)
        self.assertEqual([item['id'] for item in history], [nes, first])
        self.assertEqual(history[1], {
            'id': first, 'system': 'arcade', 'game': 'pang.zip', 'startedAt': '2026-09-23T09:00:00+00:00',
            'endedAt': '2026-09-23T10:00:00+00:00', 'seconds': 100, 'xp': 30, 'slot': 'p1',
            'partners': [sara], 'trophies': ['Primo', 'Secondo'], 'tournament': None,
        })
        self.assertEqual((history[0]['partners'], history[0]['trophies']), ([], []))
        self.assertEqual([item['id'] for item in self.repo.history(luca)], [nes, short, first])
        self.assertEqual([item['id'] for item in self.repo.history(luca, 1, before=nes)], [short])
        self.assertEqual(self.repo.history(sara)[0]['trophies'], ['Di Sara'])


    def test_tempo_per_gioco_con_i_tornei(self):
        profiles = ProfilesRepository(self.db)
        luca = profiles.create('LUCA', '#ff5d73', '2026-09-23T09:00:00+00:00')
        sara = profiles.create('SARA', '#3ccfc4', '2026-09-23T09:00:00+00:00')
        ugo = profiles.create('UGO', '#f5c542', '2026-09-23T09:00:00+00:00')
        first = self.session('pang.zip', '2026-09-23T10:00:00+00:00', 100)
        self.repo.add_players(first, [(luca, 'p1', 30), (sara, 'p2', 30)])
        second = self.session('pang.zip', '2026-09-23T11:00:00+00:00', 50)
        self.repo.add_players(second, [(luca, 'p1', 10)])
        other = self.session('sf2.zip', '2026-09-23T12:00:00+00:00', 500)
        self.repo.add_players(other, [(sara, 'p1', 10)])
        tournament = self.session('pang.zip', '2026-09-23T13:00:00+00:00', 900)
        self.repo.add_players(tournament, [(luca, 'p1', 0), (sara, 'p2', 0)])
        with self.db.transaction() as conn:
            conn.execute('UPDATE sessions SET tournament_id = 1 WHERE id = ?', (tournament,))
        self.assertEqual(self.repo.game_seconds_by_account('arcade', 'pang.zip', [luca, sara, ugo]),
                         {luca: 1050, sara: 1000, ugo: 0})
        self.assertEqual(self.repo.game_seconds_by_account('arcade', 'pang.zip', []), {})

    def test_partite_di_torneo_contano(self):
        profiles = ProfilesRepository(self.db)
        luca = profiles.create('LUCA', '#ff5d73', '2026-09-23T09:00:00+00:00')
        with self.db.transaction() as conn:
            conn.execute("INSERT INTO tournament_series (id, creator_id, name, created_at, updated_at) "
                         "VALUES (5, ?, 'Coppa', ?, ?)", (luca, '2026-09-23T09:00:00+00:00', '2026-09-23T09:00:00+00:00'))
            conn.execute("INSERT INTO tournaments (id, creator_id, title, status, created_at, updated_at, series_id, edition) "
                         "VALUES (5, ?, 'Japan', 'running', ?, ?, 5, 2)", (luca, '2026-09-23T09:00:00+00:00', '2026-09-23T09:00:00+00:00'))
        normal = self.session('pang.zip', '2026-09-23T10:00:00+00:00', 100)
        self.repo.add_players(normal, [(luca, 'p1', 10)])
        match = self.repo.start('arcade', 'sf2.zip', 'fbneo', '2026-09-23T11:00:00+00:00', tournament_id=5)
        self.repo.finish(match, '2026-09-23T11:30:00+00:00', 1800, 0)
        self.repo.add_players(match, [(luca, 'p1', 20)])
        self.assertEqual(self.repo.stats(luca), {'seconds': 1900, 'sessions': 2, 'xp': 30, 'played': 2})
        self.assertTrue(self.repo.has_played(luca, 'arcade', 'sf2.zip'))
        self.assertEqual(self.repo.played_by_anyone(), [('arcade', 'pang.zip'), ('arcade', 'sf2.zip')])
        self.assertEqual([item['game'] for item in self.repo.house_top_games()], ['sf2.zip', 'pang.zip'])
        history = self.repo.history(luca)
        self.assertEqual([(item['id'], item['tournament']) for item in history],
                         [(match, {'id': 5, 'title': 'Coppa · 2ª edizione — Japan'}), (normal, None)])
        # Torneo eliminato: resta la partita, senza titolo.
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM tournaments WHERE id = 5')
        self.assertEqual(self.repo.history(luca)[0]['tournament'], {'id': 5, 'title': None})


if __name__ == '__main__':
    unittest.main()
