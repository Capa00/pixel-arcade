import os
import tempfile
import unittest

from pixelarcade.db import Database
from pixelarcade.repositories.profiles import ProfilesRepository
from pixelarcade.repositories.tournament_matches import TournamentMatchesRepository
from pixelarcade.repositories.tournaments import TournamentsRepository
from pixelarcade.tournament_formats import build_single

NOW = '2026-11-02T18:00:00+00:00'


class TournamentMatchesRepositoryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        self.repo = TournamentMatchesRepository(self.db)
        self.tournaments = TournamentsRepository(self.db)
        profiles = ProfilesRepository(self.db)
        self.players = [profiles.create(name, '#ff5d73', NOW) for name in ('ada', 'bea', 'cleo', 'dan', 'eva')]
        self.tournament = self.tournaments.create(self.players[0], 'Torneo', NOW)
        for player in self.players:
            self.tournaments.add_player(self.tournament, player, NOW)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def test_salva_il_tabellone_e_risolve_le_chiavi(self):
        matches = build_single(self.players, 1, None, 3, True)
        ids = self.repo.create_all(self.tournament, matches)
        self.assertEqual(set(ids), {match['key'] for match in matches})
        saved = self.repo.list(self.tournament)
        self.assertEqual(len(saved), len(matches))
        by_id = {item['id']: item for item in saved}
        for match in matches:
            item = by_id[ids[match['key']]]
            self.assertEqual((item['round'], item['slot'], item['bracket'], item['playOrder'], item['series']),
                             (match['round'], match['slot'], match['bracket'], match['play_order'], match['series']))
            self.assertEqual((item['playerA'], item['playerB'], item['status'], item['winnerId'], item['bye']),
                             (match['player_a'], match['player_b'], match['status'], match['winner_id'],
                              bool(match['bye'])))
            for side in ('a', 'b'):
                source = match['from_' + side]
                expected = None if not source else '%s:%d' % (source.split(':')[0], ids[source.split(':')[1]])
                self.assertEqual(item['from' + side.upper()], expected)
        # Il 3° posto viene dopo gli altri incontri dello stesso turno.
        self.assertEqual(saved[-1]['bracket'], 'third')
        self.assertEqual(saved[-1]['fromA'], 'loser:%d' % ids['r2s0'])

    def test_get_e_update(self):
        ids = self.repo.create_all(self.tournament, build_single(self.players[:4], 1, None, 1, False))
        match_id = ids['r1s0']
        self.repo.update(match_id, status='playing', startedAt=NOW, walkover=True)
        item = self.repo.get(match_id)
        self.assertEqual((item['status'], item['startedAt'], item['walkover']), ('playing', NOW, True))
        self.assertIsNone(self.repo.get(9999))
        self.repo.update(match_id)

    def test_partite(self):
        ids = self.repo.create_all(self.tournament, build_single(self.players[:4], 3, None, 3, False))
        match_id = ids['r1s0']
        self.assertEqual(self.repo.games(match_id), [])
        self.assertFalse(self.repo.delete_last_game(match_id))
        self.assertEqual(self.repo.add_game(match_id, self.players[0], 'p1', NOW), 1)
        self.assertEqual(self.repo.add_game(match_id, self.players[3], 'p2', NOW, 2, 3, None), 2)
        games = self.repo.games(match_id)
        self.assertEqual([game['gameNo'] for game in games], [1, 2])
        self.assertEqual(games[1], {'gameNo': 2, 'winnerId': self.players[3], 'sideA': 'p2', 'scoreA': 2,
                                    'scoreB': 3, 'sessionId': None, 'declaredAt': NOW})
        self.assertEqual(list(self.repo.games_of(self.tournament)), [match_id])
        self.assertTrue(self.repo.delete_last_game(match_id))
        self.assertEqual([game['gameNo'] for game in self.repo.games(match_id)], [1])

    def test_teste_di_serie(self):
        self.repo.set_seeds(self.tournament, {self.players[2]: 1, self.players[0]: 2})
        rows = dict(self.db.query('SELECT account_id, seed FROM tournament_players WHERE tournament_id = ?',
                                  (self.tournament,)))
        self.assertEqual((rows[self.players[2]], rows[self.players[0]], rows[self.players[1]]), (1, 2, None))

    def test_eliminando_il_torneo_spariscono_gli_incontri(self):
        ids = self.repo.create_all(self.tournament, build_single(self.players[:4], 1, None, 1, False))
        self.repo.add_game(ids['r1s0'], self.players[0], 'p1', NOW)
        self.tournaments.delete(self.tournament)
        self.assertEqual(self.repo.list(self.tournament), [])
        self.assertEqual(self.repo.games(ids['r1s0']), [])


if __name__ == '__main__':
    unittest.main()
