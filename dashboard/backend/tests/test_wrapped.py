import datetime
import os
import tempfile
import unittest

from pixelarcade.db import Database
from pixelarcade.errors import ProfileError, WrappedError
from pixelarcade.profiles import ProfileService
from pixelarcade.repositories.profiles import ProfilesRepository
from pixelarcade.repositories.retroachievements import RARepository
from pixelarcade.repositories.sessions import SessionsRepository
from pixelarcade.repositories.wrapped import WrappedRepository
from pixelarcade.wrapped import WrappedService, longest_streak, period_kind, period_label, persona

UTC = datetime.timezone.utc
NOW = '2026-10-19T10:00:00+00:00'


class FakeLibrary:
    games = {
        ('arcade', 'pang.zip'): {'title': 'Pang', 'cover': True},
        ('arcade', 'sf2.zip'): {'title': 'Street Fighter II', 'cover': True},
        ('nes', 'zelda.nes'): {'title': 'Zelda', 'cover': False},
    }

    def find(self, system_id, game_id):
        game = self.games.get((system_id, game_id))
        return None if game is None else dict(game, id=game_id)


def stats(**values):
    base = {'seconds': 3600, 'sessions': 4, 'games': 2, 'newGames': 0, 'trophies': 0, 'longest': 1200,
            'topShare': 0.3}
    base.update(values)
    return base


class FunctionsTest(unittest.TestCase):
    def test_periodi(self):
        self.assertEqual(period_kind('2026-10'), 'month')
        self.assertEqual(period_kind('2026'), 'year')
        for value in ('2026-13', '2026-1', '26', None, 2026, '2026-10-01', 'abcd'):
            self.assertIsNone(period_kind(value))
        self.assertEqual(period_label('2026-10'), 'Ottobre 2026')
        self.assertEqual(period_label('2026'), '2026')

    def test_giorni_consecutivi(self):
        day = datetime.date
        self.assertEqual(longest_streak([]), 0)
        self.assertEqual(longest_streak([day(2026, 9, 1), day(2026, 9, 2), day(2026, 9, 2), day(2026, 9, 3),
                                         day(2026, 9, 10), day(2026, 9, 11)]), 3)

    def test_personaggi(self):
        self.assertEqual(persona(stats(seconds=4 * 3 * 3600, longest=3 * 3600))['id'], 'marathon')
        self.assertEqual(persona(stats(trophies=25))['id'], 'collector')
        self.assertEqual(persona(stats(seconds=10 * 300, sessions=10))['id'], 'quick')
        self.assertEqual(persona(stats(topShare=0.95))['id'], 'loyal')
        self.assertEqual(persona(stats(games=20, newGames=12))['id'], 'explorer')
        # Poche partite brevi: niente «Mordi e fuggi».
        self.assertNotEqual(persona(stats(seconds=3 * 300, sessions=3))['id'], 'quick')


class WrappedTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        self.sessions = SessionsRepository(self.db)
        self.profiles = ProfileService(ProfilesRepository(self.db), self.sessions, FakeLibrary(), lambda: NOW)
        self.today = datetime.datetime(2026, 10, 19, 12, 0, tzinfo=UTC)
        self.service = WrappedService(WrappedRepository(self.db), self.profiles, tz=UTC,
                                      clock=lambda: self.today, now=lambda: NOW)
        self.ada = self.profiles.create('ada', '#ff5d73')['id']
        self.bea = self.profiles.create('bea', '#3ccfc4')['id']
        self.ra = RARepository(self.db)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def play(self, game, seconds, players, started, system='arcade'):
        start = datetime.datetime.fromisoformat(started)
        ended = (start + datetime.timedelta(seconds=seconds)).isoformat()
        session = self.sessions.start(system, game, 'fbneo', started)
        self.sessions.finish(session, ended, seconds, 0)
        self.profiles.record_session(session, players, seconds)
        return session

    def september(self):
        # Martedì 1, mercoledì 2 e giovedì 3 settembre, più sabato 12: ADA gioca quattro volte, BEA due con lei.
        self.play('pang.zip', 1800, [self.ada, self.bea], '2026-09-01T20:00:00+00:00')
        self.play('pang.zip', 1200, [self.ada, None], '2026-09-02T21:00:00+00:00')
        self.play('sf2.zip', 600, [self.ada, self.bea], '2026-09-03T09:00:00+00:00')
        self.play('zelda.nes', 3600, [self.ada, None], '2026-09-12T15:00:00+00:00', 'nes')

    def test_senza_partite_nessun_wrapped(self):
        self.assertEqual(self.service.overview(self.ada), {'periods': [], 'pending': None})
        self.assertEqual(self.service.overview(None), {'periods': [], 'pending': None})
        with self.assertRaises(WrappedError):
            self.service.data(self.ada, '2026-09')
        with self.assertRaises(ProfileError):
            self.service.overview(999)

    def test_periodi_disponibili_e_avviso(self):
        self.september()
        # Ottobre non è ancora finito: non c'è.
        self.play('pang.zip', 600, [self.ada, None], '2026-10-02T10:00:00+00:00')
        self.play('pang.zip', 600, [self.ada, None], '2026-10-03T10:00:00+00:00')
        self.play('pang.zip', 600, [self.ada, None], '2026-10-04T10:00:00+00:00')
        overview = self.service.overview(self.ada)
        self.assertEqual([item['period'] for item in overview['periods']], ['2026-09'])
        self.assertEqual(overview['periods'][0]['label'], 'Settembre 2026')
        self.assertEqual(overview['pending'], '2026-09')
        # BEA ha solo due partite: niente Wrapped.
        self.assertEqual(self.service.overview(self.bea)['periods'], [])
        # La casa conta le partite una volta sola: quattro.
        self.assertEqual(self.service.overview(None)['pending'], '2026-09')
        seen = self.service.mark_seen(self.ada, '2026-09')
        self.assertEqual(seen['pending'], None)
        self.assertTrue(seen['periods'][0]['seen'])
        # Visto da ADA, non dalla casa.
        self.assertEqual(self.service.overview(None)['pending'], '2026-09')
        with self.assertRaises(WrappedError):
            self.service.mark_seen(self.ada, '2026-10')

    def test_l_avviso_propone_solo_il_mese_appena_chiuso(self):
        self.september()
        self.today = datetime.datetime(2026, 11, 3, 12, 0, tzinfo=UTC)
        overview = self.service.overview(self.ada)
        self.assertEqual([item['period'] for item in overview['periods']], ['2026-09'])
        self.assertIsNone(overview['pending'])

    def test_a_gennaio_l_avviso_propone_l_anno(self):
        self.september()
        for day in (1, 2, 3):
            self.play('pang.zip', 600, [self.ada, None], '2026-12-%02dT10:00:00+00:00' % day)
        self.today = datetime.datetime(2027, 1, 2, 12, 0, tzinfo=UTC)
        overview = self.service.overview(self.ada)
        self.assertEqual([item['period'] for item in overview['periods']], ['2026', '2026-12', '2026-09'])
        self.assertEqual(overview['pending'], '2026')
        self.service.mark_seen(self.ada, '2026')
        self.assertIsNone(self.service.overview(self.ada)['pending'])

    def test_dati_del_profilo(self):
        self.september()
        session = self.play('sf2.zip', 300, [self.bea, None], '2026-09-20T10:00:00+00:00')
        self.ra.add_unlocks([(session, self.bea, 7, 'Primo colpo', 1, self.bea, '2026-09-20T10:01:00+00:00')])
        first = self.sessions.history(self.ada)[-1]['id']
        self.ra.add_unlocks([
            (first, self.ada, 1, 'Moneta', 10, self.ada, '2026-09-01T20:05:00+00:00'),
            (first, self.ada, 2, 'Bolla', 10, self.ada, '2026-09-01T20:10:00+00:00'),
        ])
        data = self.service.data(self.ada, '2026-09')
        self.assertEqual((data['period'], data['kind'], data['label'], data['scope']),
                         ('2026-09', 'month', 'Settembre 2026', 'profile'))
        self.assertEqual(data['profile']['name'], 'ADA')
        totals = data['totals']
        self.assertEqual((totals['seconds'], totals['sessions'], totals['games'], totals['days'], totals['newGames'],
                          totals['trophies']), (7200, 4, 3, 4, 3, 2))
        self.assertGreater(totals['xp'], 0)
        self.assertEqual([item['game'] for item in data['topGames']],
                         ['nes/zelda.nes', 'arcade/pang.zip', 'arcade/sf2.zip'])
        self.assertEqual([item['system'] for item in data['systems']], ['arcade', 'nes'])
        self.assertEqual(data['systems'][0]['seconds'], 3600)
        self.assertEqual(data['longest'], {'game': 'nes/zelda.nes', 'seconds': 3600,
                                           'at': '2026-09-12T15:00:00+00:00'})
        self.assertEqual(data['habits']['weekdayName'], 'sabato')
        self.assertEqual(data['habits']['part'], 'pomeriggio')
        self.assertEqual(data['habits']['hour'], 15)
        self.assertEqual(data['streak'], 3)
        self.assertEqual(data['trophies']['count'], 2)
        self.assertEqual(data['trophies']['recent'][0], {'title': 'Bolla', 'game': 'arcade/pang.zip'})
        self.assertEqual(data['trophies']['topGame'], {'game': 'arcade/pang.zip', 'count': 2})
        rival = data['rival']
        self.assertEqual(rival['person']['name'], 'BEA')
        self.assertEqual(rival['together'], {'sessions': 2, 'seconds': 2400})
        self.assertEqual(rival['them']['seconds'], 2700)
        self.assertIn(data['persona']['id'], ('marathon', 'collector', 'quick', 'loyal', 'explorer'))
        self.assertEqual(data['games']['nes/zelda.nes']['title'], 'Zelda')

    def test_rivale_senza_partite_insieme(self):
        self.september()
        carla = self.profiles.create('carla', '#f5c542')['id']
        for day in (5, 6, 7):
            self.play('pang.zip', 600, [carla, None], '2026-09-%02dT10:00:00+00:00' % day)
        rival = self.service.data(carla, '2026-09')['rival']
        self.assertEqual(rival['together'], {'sessions': 0, 'seconds': 0})
        self.assertIn(rival['person']['name'], ('ADA', 'BEA'))
        # Senza altri profili nel periodo non c'è rivale.
        self.today = datetime.datetime(2026, 12, 1, 12, 0, tzinfo=UTC)
        for day in (1, 2, 3):
            self.play('sf2.zip', 600, [carla, None], '2026-11-%02dT10:00:00+00:00' % day)
        self.assertIsNone(self.service.data(carla, '2026-11')['rival'])

    def test_giochi_nuovi_solo_se_mai_giocati_prima(self):
        self.play('pang.zip', 600, [self.ada, None], '2026-08-10T10:00:00+00:00')
        self.september()
        self.assertEqual(self.service.data(self.ada, '2026-09')['totals']['newGames'], 2)

    def test_dati_di_casa(self):
        self.september()
        self.play('sf2.zip', 900, [self.bea, None], '2026-09-20T10:00:00+00:00')
        data = self.service.data(None, '2026-09')
        self.assertEqual(data['scope'], 'house')
        # Le partite in due contano una volta: 1800 + 1200 + 600 + 3600 + 900.
        self.assertEqual((data['totals']['seconds'], data['totals']['sessions'], data['totals']['players']),
                         (8100, 5, 2))
        self.assertEqual([item['name'] for item in data['players']], ['ADA', 'BEA'])
        self.assertEqual(data['players'][1]['seconds'], 3300)
        self.assertIn('persona', data['players'][0])
        self.assertEqual([item['name'] for item in data['duo']['players']], ['ADA', 'BEA'])
        self.assertEqual((data['duo']['sessions'], data['duo']['seconds']), (2, 2400))

    def test_anno(self):
        self.september()
        self.today = datetime.datetime(2027, 3, 1, 12, 0, tzinfo=UTC)
        data = self.service.data(self.ada, '2026')
        self.assertEqual((data['kind'], data['label'], data['totals']['sessions']), ('year', '2026', 4))
        self.assertEqual(self.service.bounds('2026-12'), ('2026-12-01T00:00:00+00:00', '2027-01-01T00:00:00+00:00'))

    def test_partite_di_torneo_incluse(self):
        self.play('pang.zip', 1800, [self.ada, self.bea], '2026-09-01T20:00:00+00:00')
        start = '2026-09-02T20:00:00+00:00'
        session = self.sessions.start('arcade', 'sf2.zip', 'fbneo', start, tournament_id=4)
        self.sessions.finish(session, '2026-09-02T20:30:00+00:00', 1800, 0)
        self.profiles.record_session(session, [self.ada, self.bea], 1800)
        repo = WrappedRepository(self.db)
        since, until = '2026-09-01T00:00:00+00:00', '2026-10-01T00:00:00+00:00'
        self.assertEqual({row['game'] for row in repo.players(since, until)}, {'pang.zip', 'sf2.zip'})
        self.assertEqual(len(repo.ended_dates()), 2)
        self.assertEqual(len(repo.ended_dates(self.ada)), 2)
        self.assertEqual({row[2] for row in repo.first_plays()}, {'pang.zip', 'sf2.zip'})


if __name__ == '__main__':
    unittest.main()
