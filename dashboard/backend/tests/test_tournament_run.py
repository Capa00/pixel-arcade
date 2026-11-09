import os
import random
import tempfile
import unittest

from pixelarcade.db import Database
from pixelarcade.errors import TournamentError, TournamentLockedError
from pixelarcade.profiles import ProfileService
from pixelarcade.repositories.profiles import ProfilesRepository
from pixelarcade.repositories.saves import SavesRepository
from pixelarcade.repositories.sessions import SessionsRepository
from pixelarcade.repositories.tournament_matches import TournamentMatchesRepository
from pixelarcade.repositories.tournament_rewards import TournamentRewardsRepository
from pixelarcade.repositories.tournaments import TournamentsRepository
from pixelarcade.saves import SaveStore
from pixelarcade.tournament_formats import layout_round_robin
from pixelarcade.tournament_run import TournamentRunService
from pixelarcade.tournaments import TournamentService

NOW = '2026-11-02T18:00:00+00:00'
GAME = {'system': 'md', 'id': 'Street Fighter II.md'}
COMBO = ['up', 'down', 'a']


class FakeLibrary:
    games = {('md', 'Street Fighter II.md'): {'id': 'Street Fighter II.md', 'title': 'Street Fighter II'}}

    def find(self, system_id, game_id):
        return self.games.get((system_id, game_id))


class RunServiceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        data = os.path.join(self.tmp.name, 'data')
        library = FakeLibrary()
        self.sessions = SessionsRepository(self.db)
        profiles = ProfileService(ProfilesRepository(self.db), self.sessions, library, lambda: NOW)
        self.ids = [profiles.create(name, '#ff5d73')['id'] for name in ('ada', 'bea', 'cleo', 'dan', 'eva')]
        self.ada = self.ids[0]
        self.service = TournamentService(TournamentsRepository(self.db), profiles,
                                         SaveStore(data, SavesRepository(self.db), lambda: NOW), library, data,
                                         lambda: NOW)
        self.matches = TournamentMatchesRepository(self.db)
        self.service.matches_repo = self.matches
        self.rewards = TournamentRewardsRepository(self.db)
        self.service.rewards_repo = self.rewards
        profiles.rewards = self.rewards
        self.profiles = profiles
        self.run = TournamentRunService(self.service, self.matches, self.sessions, random.Random(7), lambda: NOW)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def tournament(self, players=5, combo=None, title='Torneo'):
        item = self.service.create(self.ada)['tournament']
        changes = {'title': title, 'game': GAME}
        if combo:
            changes['newCombo'] = combo
        self.service.update(item['id'], self.ada, None, changes)
        self.service.publish(item['id'], self.ada, combo)
        for account in self.ids[:players]:
            self.service.join(item['id'], account)
        return item['id']

    def play(self, account, seconds, xp, system='md', game='Street Fighter II.md', tournament_id=None):
        session = self.sessions.start(system, game, 'core', NOW)
        self.sessions.finish(session, NOW, seconds, 0)
        self.sessions.add_players(session, [(account, 'p1', xp)])
        if tournament_id is not None:
            with self.db.transaction() as conn:
                conn.execute('UPDATE sessions SET tournament_id = ? WHERE id = ?', (tournament_id, session))

    def test_controlli(self):
        two = self.tournament(players=2)
        with self.assertRaisesRegex(TournamentError, 'almeno 3 iscritti'):
            self.run.start_check(two, self.ada, None)
        five = self.tournament()
        check = self.run.start_check(five, self.ada, None)
        self.assertEqual([item['id'] for item in check['players']], self.ids)
        self.assertEqual(check['settings']['format'], 'single')
        counts = {item['format']: item for item in check['counts']}
        third = check['settings']['thirdPlace']
        self.assertEqual(counts['single'], {'format': 'single', 'ready': True, 'matches': 5 if third else 4})
        self.assertEqual(counts['double'], {'format': 'double', 'ready': True, 'matches': {'min': 8, 'max': 9}})
        self.assertEqual(counts['swiss'], {'format': 'swiss', 'ready': False, 'matches': None})
        self.assertEqual(counts['round_robin'], {'format': 'round_robin', 'ready': True, 'matches': 10})
        with self.assertRaises(TournamentLockedError):
            self.run.start_check(five, self.ids[1], None)

    def test_avvio_del_girone(self):
        item = self.tournament()
        settings = {'format': 'round_robin', 'roundSeries': 3, 'options': {'legs': 'double'}}
        preview = self.run.start_preview(item, self.ada, None, settings, self.ids)
        self.assertEqual(preview['slots'], self.ids)
        self.assertEqual((preview['count'], len(preview['matches'])), (20, 20))
        self.assertTrue(all(match['bracket'] == 'league' and match['status'] == 'ready' and match['series'] == 3
                            for match in preview['matches']))
        # Scambiare due posizioni cambia il calendario, non le teste di serie (player_a resta la migliore all'andata).
        ring = [self.ids[4]] + self.ids[1:4] + [self.ids[0]]
        swapped = self.run.start_preview(item, self.ada, None, settings, self.ids, ring)
        self.assertEqual(swapped['order'], self.ids)
        self.assertEqual(swapped['slots'], ring)
        self.assertNotEqual([(m['playerA'], m['playerB']) for m in swapped['matches']],
                            [(m['playerA'], m['playerB']) for m in preview['matches']])
        first_leg = [match for match in swapped['matches'] if match['round'] <= 5]
        self.assertTrue(all(self.ids.index(m['playerA']) < self.ids.index(m['playerB']) for m in first_leg))
        for bad in (self.ids[:4], self.ids + [None, None, None], [self.ids[0]] * 5):
            with self.assertRaises(TournamentError):
                self.run.start_preview(item, self.ada, None, settings, self.ids, bad)
        with self.assertRaises(TournamentError):
            self.run.start_preview(item, self.ada, None, settings, self.ids, None, {'2': ['1']})
        # Bozza con le posizioni del girone.
        self.run.save_draft(item, self.ada, None, {'step': 3, 'settings': settings, 'order': self.ids, 'slots': ring})
        draft = self.run.start_check(item, self.ada, None)['draft']
        self.assertEqual((draft['step'], draft['slots']), (3, ring))
        public = self.run.start(item, self.ada, None, settings, self.ids, ring)['tournament']
        self.assertEqual((public['status'], public['format'], public['thirdPlace'], public['count']),
                         ('running', 'round_robin', False, 20))
        self.assertEqual(len(public['standings']), 5)
        self.assertEqual([player['seed'] for player in sorted(public['players'], key=lambda p: self.ids.index(p['id']))],
                         [1, 2, 3, 4, 5])

    def test_classifica_del_girone(self):
        # Il girone non si avvia ancora: torneo in corso preparato a mano con il calendario vero.
        item = self.tournament()
        self.service.update(item, self.ada, None, {'format': 'round_robin'})
        self.service.repo.update(item, {'status': 'running', 'registrationClosed': True}, NOW)
        self.matches.set_seeds(item, {account: position + 1 for position, account in enumerate(self.ids)})
        keys = self.matches.create_all(item, layout_round_robin(self.ids, 1))
        first = self.matches.get(keys['rr1s1'])
        self.matches.add_game(first['id'], first['playerB'], 'p1', NOW)
        self.matches.update(first['id'], status='done', winnerId=first['playerB'])
        public = self.service.public(self.service.repo.get(item))
        table = public['standings']
        self.assertEqual(len(table), 5)
        self.assertEqual((table[0]['id'], table[0]['won'], table[0]['gamesFor'], table[0]['rank']),
                         (first['playerB'], 1, 1, 1))
        loser = next(row for row in table if row['id'] == first['playerA'])
        self.assertEqual((loser['lost'], loser['rank'], loser['withdrawn']), (1, 5, False))
        self.assertEqual(public['count'], 10)
        # Gli altri formati non hanno la classifica.
        self.assertNotIn('standings', self.service.public(self.service.repo.get(self.tournament(title='Altro'))))

    def test_combinazione(self):
        item = self.tournament(combo=COMBO)
        with self.assertRaises(TournamentLockedError):
            self.run.start_check(item, self.ada, ['up'])
        with self.assertRaises(TournamentLockedError):
            self.run.start_preview(item, self.ada, None, {})
        with self.assertRaises(TournamentLockedError):
            self.run.start(item, self.ada, None, {}, self.ids)
        self.assertEqual(len(self.run.start_check(item, self.ada, COMBO)['players']), 5)

    def test_anteprima_con_cinque_iscritti(self):
        item = self.tournament()
        preview = self.run.start_preview(item, self.ada, None, {'thirdPlace': True})
        self.assertEqual(preview['count'], 5)
        order = preview['order']
        self.assertEqual(sorted(order), sorted(self.ids))
        self.assertEqual([seed['seed'] for seed in preview['seeds']], [1, 2, 3, 4, 5])
        first = [match for match in preview['matches'] if match['round'] == 1]
        byes = [match for match in first if match['bye']]
        self.assertEqual(sorted(match['playerA'] for match in byes), sorted(order[:3]))
        played = [match for match in first if not match['bye']]
        self.assertEqual(len(played), 1)
        self.assertEqual((played[0]['playerA'], played[0]['playerB']), (order[3], order[4]))
        self.assertEqual(preview['slots'], [order[0], None, order[4], order[3], order[2], None, None, order[1]])
        # Niente salvato.
        self.assertEqual(self.matches.list(item), [])
        self.assertEqual(self.service.repo.get(item)['status'], 'open')

    def test_teste_di_serie_per_xp_e_per_tempo(self):
        item = self.tournament()
        self.play(self.ids[3], 60, 500)
        self.play(self.ids[1], 900, 100)
        self.play(self.ids[4], 300, 0, game='Altro.md')
        by_xp = self.run.start_preview(item, self.ada, None, {'seeding': 'xp'})
        self.assertEqual(by_xp['order'][:2], [self.ids[3], self.ids[1]])
        self.assertEqual([seed['value'] for seed in by_xp['seeds']][:2], [500, 100])
        by_time = self.run.start_preview(item, self.ada, None, {'seeding': 'time'})
        self.assertEqual(by_time['order'][:2], [self.ids[1], self.ids[3]])
        self.assertEqual([seed['value'] for seed in by_time['seeds']], [900, 60, 0, 0, 0])
        mix = self.run.start_preview(item, self.ada, None, {'seeding': 'mix', 'seedingWeight': 50})
        # 50/50: bea = 0.5 * 100/500 + 0.5 * 900/900 = 60, dan = 0.5 * 500/500 + 0.5 * 60/900 = 53.3.
        self.assertEqual(mix['order'][:2], [self.ids[1], self.ids[3]])
        self.assertEqual([seed['value'] for seed in mix['seeds']][:2], [60.0, 53.3])

    def test_ordine_e_caselle_scelti_a_mano(self):
        item = self.tournament()
        order = list(reversed(self.ids))
        preview = self.run.start_preview(item, self.ada, None, {}, order)
        self.assertEqual(preview['order'], order)
        slots = list(preview['slots'])
        # Scambio: la testa di serie 1 (con il bye) e la 4.
        one, four = slots.index(order[0]), slots.index(order[3])
        slots[one], slots[four] = slots[four], slots[one]
        swapped = self.run.start_preview(item, self.ada, None, {}, order, slots)
        self.assertEqual(swapped['slots'], slots)
        self.assertEqual([seed['id'] for seed in swapped['seeds']], order)
        played = [match for match in swapped['matches'] if match['round'] == 1 and not match['bye']][0]
        # In ``playerA`` la testa di serie migliore dell'incontro.
        self.assertEqual((played['playerA'], played['playerB']), (order[0], order[4]))

    def test_ordine_e_caselle_manipolati(self):
        item = self.tournament()
        for order in ([self.ids[0]] * 5, self.ids[:4], self.ids + [999], ['a'] * 5, self.ids[:4] + [999]):
            with self.assertRaises(TournamentError):
                self.run.start_preview(item, self.ada, None, {}, order)
        bad_slots = ([self.ids[0], None, None, None, self.ids[1], self.ids[2], self.ids[3], self.ids[4]],
                     self.ids + [None, None], self.ids + [None, None, 999], self.ids[:4] + [None] * 4,
                     [None, None] + self.ids + [None])
        for slots in bad_slots:
            with self.assertRaises(TournamentError):
                self.run.start_preview(item, self.ada, None, {}, self.ids, slots)
        with self.assertRaises(TournamentError):
            self.run.start(item, self.ada, None, {}, None)

    def test_impostazioni_non_valide(self):
        item = self.tournament()
        for settings in ({'format': 'swiss'}, {'format': 'ffa'}, {'roundSeries': 2}, {'options': {'legs': 2}},
                         {'seeding': 'elo'}, {'seedingWeight': 55}, {'thirdPlace': 'si'}, {'title': 'x'}):
            with self.assertRaises(TournamentError):
                self.run.start_preview(item, self.ada, None, settings)

    def test_avvio(self):
        item = self.tournament()
        order = list(self.ids)
        settings = {'thirdPlace': True, 'finalSeries': 3, 'seeding': 'xp', 'options': {'semiSeries': 3}}
        result = self.run.start(item, self.ada, None, settings, order)
        tournament = result['tournament']
        self.assertEqual(tournament['status'], 'running')
        self.assertTrue(tournament['registrationClosed'])
        self.assertEqual(tournament['startedAt'], NOW)
        self.assertEqual((tournament['thirdPlace'], tournament['finalSeries'], tournament['seeding']),
                         (True, 3, 'xp'))
        self.assertEqual(tournament['options'], {'semiSeries': 3})
        self.assertEqual({player['id']: player['seed'] for player in tournament['players']},
                         {account: position + 1 for position, account in enumerate(order)})
        matches = tournament['matches']
        # 5 iscritti: 8 caselle, 4 incontri del primo turno (3 bye), 2 semifinali giocate, 3° posto e finale.
        self.assertEqual(len([match for match in matches if match['bye']]), 3)
        self.assertEqual(len([match for match in matches if not match['bye']]), 5)
        played = sorted((match for match in matches if not match['bye']), key=lambda match: match['playOrder'])
        self.assertEqual([match['playOrder'] for match in played], [1, 2, 3, 4, 5])
        self.assertEqual(played[0]['status'], 'ready')
        self.assertEqual((played[0]['playerA'], played[0]['playerB']), (order[3], order[4]))
        self.assertEqual(played[-2]['bracket'], 'third')
        final = played[-1]
        self.assertEqual(final['series'], 3)
        keys = {match['key'] for match in matches}
        self.assertTrue(all(match['fromA'] is None or match['fromA'].split(':')[1] in keys for match in matches))
        self.assertTrue(all(match['games'] == [] for match in matches))
        # Le iscrizioni non sono più possibili; non si riavvia.
        with self.assertRaisesRegex(TournamentError, 'già iniziato'):
            self.service.join(item, self.ids[0])
        with self.assertRaisesRegex(TournamentError, 'già in corso'):
            self.run.start_check(item, self.ada, None)
        with self.assertRaises(TournamentError):
            self.service.update(item, self.ada, None, {'thirdPlace': False})

    def test_un_solo_torneo_in_corso(self):
        first = self.tournament(title='Primo')
        second = self.tournament(title='Secondo')
        self.run.start(first, self.ada, None, {}, list(self.ids))
        with self.assertRaisesRegex(TournamentError, '— Primo»'):
            self.run.start_check(second, self.ada, None)
        with self.assertRaises(TournamentError):
            self.run.start(second, self.ada, None, {}, list(self.ids))
        self.assertEqual(self.service.repo.get(second)['status'], 'open')
        self.assertEqual(self.matches.list(second), [])

    def test_tre_iscritti(self):
        item = self.tournament(players=3)
        result = self.run.start(item, self.ada, None, {'thirdPlace': True}, list(self.ids[:3]))
        matches = result['tournament']['matches']
        played = [match for match in matches if not match['bye']]
        self.assertEqual(len(played), 2)
        self.assertFalse(any(match['bracket'] == 'third' for match in matches))
        final = [match for match in matches if match['round'] == 2][0]
        self.assertEqual(final['playerA'], self.ids[0])

    def double_tournament(self, players, grand='reset'):
        while len(self.ids) < players:
            self.ids.append(self.profiles.create('p%d' % len(self.ids), '#ff5d73')['id'])
        item = self.tournament(players=players)
        settings = {'format': 'double', 'thirdPlace': True, 'roundSeries': 1, 'finalSeries': 1,
                    'options': {'grandFinal': grand}}
        preview = self.run.start_preview(item, self.ada, None, settings, self.ids[:players])
        result = self.run.start(item, self.ada, None, settings, self.ids[:players])
        return item, preview, result['tournament']

    def test_anteprima_e_avvio_della_doppia(self):
        for players, grand, count in ((3, 'reset', {'min': 4, 'max': 5}), (5, 'single', {'min': 8, 'max': 8}),
                                      (10, 'none', {'min': 17, 'max': 17})):
            item, preview, tournament = self.double_tournament(players, grand)
            self.assertEqual(preview['count'], count)
            self.assertEqual(preview['settings']['format'], 'double')
            self.assertEqual(tournament['format'], 'double')
            self.assertEqual(tournament['options'], {'grandFinal': grand, 'grandSeries': None})
            self.assertFalse(tournament['thirdPlace'])
            matches = tournament['matches']
            self.assertEqual(len([match for match in matches if not match['bye']]), count['max'])
            self.assertEqual({match['bracket'] for match in matches},
                             {'winners', 'losers'} | ({'grand'} if grand != 'none' else set()))
            self.assertFalse(any(match['bracket'] == 'third' for match in matches))
            keys = {match['key'] for match in matches}
            self.assertTrue(all(source is None or source.split(':')[1] in keys
                                for match in matches for source in (match['fromA'], match['fromB'])))
            # Il prossimo torneo si avvia solo con questo concluso: lo si annulla.
            self.service.cancel(item, self.ada, None)

    def test_doppia_giocata_fino_alla_gran_finale(self):
        item, _, tournament = self.double_tournament(5)
        stored = {match['id']: match for match in self.matches.list(item)}
        while True:
            pending = [match for match in self.matches.list(item) if match['status'] in ('ready', 'playing')]
            if not pending:
                break
            match = min(pending, key=lambda match: match['playOrder'])
            if match['bracket'] == 'grand':
                break
            self.game(item, match['id'])
            # Vince sempre il peggiore (playerB), così il perdente scende nei perdenti.
            self.run.declare(item, match['id'], self.ada, None, match['playerB'])
            loser = match['playerA']
            for other in self.matches.list(item):
                for side in ('A', 'B'):
                    if other['from' + side] == 'loser:%d' % match['id']:
                        self.assertIn(loser, (other['playerA'], other['playerB'], other['winnerId']))
        self.assertEqual(match['bracket'], 'grand')
        self.assertEqual(match['round'], 1)
        final = [item for item in stored.values() if item['bracket'] == 'winners' and item['round'] == 3][0]
        losers_final = [item for item in stored.values() if item['bracket'] == 'losers' and item['round'] == 4][0]
        self.assertEqual(match['playerA'], self.matches.get(final['id'])['winnerId'])
        self.assertEqual(match['playerB'], self.matches.get(losers_final['id'])['winnerId'])
        hidden = [item for item in self.matches.list(item) if item['bracket'] == 'losers' and item['bye']]
        self.assertTrue(all(item['status'] == 'done' for item in hidden))

    def test_incroci_della_doppia(self):
        item = self.tournament(players=5)
        settings = {'format': 'double', 'roundSeries': 1, 'finalSeries': 1, 'options': {'grandFinal': 'reset'}}
        order = self.ids[:5]
        preview = self.run.start_preview(item, self.ada, None, settings, order)
        standard = {1: ['wr1s0', 'wr1s1', 'wr1s2', 'wr1s3'], 2: ['wr2s1', 'wr2s0'], 4: ['wr3s0']}
        self.assertEqual(preview['crossings'], standard)
        swapped = {**standard, 1: ['wr1s0', 'wr1s2', 'wr1s1', 'wr1s3']}
        # Gli incroci restano anche cambiando le caselle del 1° turno: si riferiscono agli incontri.
        slots = list(preview['slots'])
        slots[0], slots[2] = slots[2], slots[0]
        changed = self.run.start_preview(item, self.ada, None, settings, order, slots,
                                         {str(key): value for key, value in swapped.items()})
        self.assertEqual((changed['crossings'], changed['count'], changed['slots']), (swapped, preview['count'], slots))
        hidden = [match for match in changed['matches'] if match['key'] == 'lr1s0'][0]
        self.assertEqual(hidden['status'], 'done')
        with self.assertRaises(TournamentError):
            self.run.start_preview(item, self.ada, None, settings, order, None, {**standard, 2: ['wr2s1']})
        with self.assertRaises(TournamentError):
            self.run.start_preview(item, self.ada, None, {'format': 'single'}, order, None, standard)
        self.assertIsNone(self.run.start_preview(item, self.ada, None, {'format': 'single'}, order)['crossings'])
        # Bozza: salvata e ripresa; scartata se il formato non è più la doppia.
        draft = {'step': 3, 'settings': settings, 'order': order, 'slots': slots, 'crossings': swapped}
        self.run.save_draft(item, self.ada, None, draft)
        self.assertEqual(self.run.start_check(item, self.ada, None)['draft']['crossings'], swapped)
        with self.assertRaises(TournamentError):
            self.run.save_draft(item, self.ada, None, dict(draft, settings={'format': 'single'}))
        stored = dict(self.service.repo.get(item)['startDraft'], settings={'format': 'single'})
        self.service.repo.update(item, {'startDraft': stored}, '2026-11-03T10:00:00')
        self.assertIsNone(self.run.start_check(item, self.ada, None)['draft']['crossings'])
        # Avvio: il tabellone rispetta gli incroci.
        tournament = self.run.start(item, self.ada, None, settings, order, slots, swapped)['tournament']
        place = {(match['bracket'], match['round'], match['slot']): match for match in tournament['matches']}
        source = place[('losers', 1, 1)]['fromA']
        self.assertEqual(source, 'loser:' + place[('winners', 1, 1)]['key'])

    def test_bozza_salvata_e_ripresa(self):
        item = self.tournament(combo=COMBO)
        self.assertIsNone(self.run.start_check(item, self.ada, COMBO)['draft'])
        order = list(reversed(self.ids))
        preview = self.run.start_preview(item, self.ada, COMBO, {'thirdPlace': True}, order)
        slots = list(preview['slots'])
        slots[0], slots[2] = slots[2], slots[0]
        draft = {'step': 3, 'settings': {'thirdPlace': True, 'finalSeries': 5}, 'order': order, 'slots': slots}
        self.assertEqual(self.run.save_draft(item, self.ada, COMBO, draft), {'ok': True})
        with self.assertRaises(TournamentLockedError):
            self.run.save_draft(item, self.ada, None, draft)
        restored = self.run.start_check(item, self.ada, COMBO)['draft']
        self.assertEqual((restored['step'], restored['order'], restored['slots'], restored['playersChanged']),
                         (3, order, slots, False))
        self.assertEqual((restored['settings']['thirdPlace'], restored['settings']['finalSeries']), (True, 5))
        # La bozza non compare nella risposta pubblica.
        self.assertNotIn('startDraft', self.service.overview()['tournaments'][0])
        self.run.save_draft(item, self.ada, COMBO, None)
        self.assertIsNone(self.run.start_check(item, self.ada, COMBO)['draft'])

    def test_bozza_con_iscritti_cambiati(self):
        item = self.tournament(players=4)
        self.run.save_draft(item, self.ada, None, {'step': 3, 'settings': {'seeding': 'xp'},
                                                   'order': self.ids[:4], 'slots': None})
        self.service.join(item, self.ids[4])
        restored = self.run.start_check(item, self.ada, None)['draft']
        self.assertEqual((restored['step'], restored['order'], restored['slots'], restored['playersChanged']),
                         (2, None, None, True))
        self.assertEqual(restored['settings']['seeding'], 'xp')

    def test_bozza_non_valida(self):
        item = self.tournament()
        for draft in ({'step': 4, 'settings': {}}, {'step': 1, 'settings': {'format': 'swiss'}},
                      {'step': 2, 'settings': {}, 'order': self.ids[:3]}, 'bozza'):
            with self.assertRaises(TournamentError):
                self.run.save_draft(item, self.ada, None, draft)

    def test_bozza_cancellata(self):
        item = self.tournament()
        draft = {'step': 2, 'settings': {}, 'order': list(self.ids)}
        # Cambio del formato nelle Impostazioni.
        self.run.save_draft(item, self.ada, None, draft)
        self.service.update(item, self.ada, None, {'title': 'Nuovo titolo'})
        self.assertIsNotNone(self.service.repo.get(item)['startDraft'])
        self.service.update(item, self.ada, None, {'finalSeries': 5})
        self.assertIsNone(self.service.repo.get(item)['startDraft'])
        # Avvio.
        self.run.save_draft(item, self.ada, None, draft)
        self.run.start(item, self.ada, None, {}, list(self.ids))
        self.assertIsNone(self.service.repo.get(item)['startDraft'])
        # Annullamento.
        other = self.tournament(title='Altro')
        self.service.repo.update(item, {'status': 'cancelled'}, NOW)
        self.run.save_draft(other, self.ada, None, draft)
        self.service.cancel(other, self.ada, None)
        self.assertIsNone(self.service.repo.get(other)['startDraft'])

    def test_annulla_in_corso(self):
        item = self.tournament()
        self.run.start(item, self.ada, None, {}, list(self.ids))
        first = self.matches.list(item)[0]['id']
        self.matches.add_game(first, self.ada, 'p1', NOW)
        count = len(self.matches.list(item))

        class FakePlay:
            current = {'tournament': item, 'match': first}

            def playing_match(self):
                return self.current

        self.service.play = FakePlay()
        with self.assertRaisesRegex(TournamentError, 'incontro in gioco'):
            self.service.cancel(item, self.ada, None)
        # Partita di un altro torneo, o nessuna partita aperta (incontro sospeso): si annulla.
        self.service.play.current = {'tournament': item + 1, 'match': first}
        self.assertEqual(self.service.cancel(item, self.ada, None), {'tournament': None})
        self.assertEqual(self.service.repo.get(item)['status'], 'cancelled')
        # Incontri e partite restano per lo storico.
        self.assertEqual(len(self.matches.list(item)), count)
        self.assertEqual(len(self.matches.games_of(item)[first]), 1)


    # --- Incontri ----------------------------------------------------------------------

    def running(self, sides='alternate', advantaged='none', locked=True):
        """Torneo di 4 iscritti avviato con l'ordine degli id: semifinali ada-dan e bea-cleo."""
        item = self.tournament(players=4)
        self.service.update(item, self.ada, None, {'sides': sides, 'savesLocked': locked})
        self.run.start(item, self.ada, None, {'thirdPlace': False, 'advantagedSide': advantaged}, self.ids[:4])
        matches = self.matches.list(item)
        semis = sorted((match for match in matches if match['round'] == 1), key=lambda match: match['playOrder'])
        return item, semis

    def test_schermata_e_avvio_dell_incontro(self):
        item, semis = self.running(advantaged='p1')
        first, second = semis
        screen = self.run.match_screen(item, first['id'])
        self.assertEqual([player['id'] for player in screen['players']], [first['playerA'], first['playerB']])
        self.assertEqual(screen['players'][0]['seed'], 1)
        self.assertEqual((screen['gameNo'], screen['series'], screen['wins'], screen['status']),
                         (1, first['series'], [0, 0], 'ready'))
        # Lati alternati con P1 vantaggiato: la testa di serie migliore parte al P2.
        self.assertEqual((screen['sides'], screen['sideA'], screen['drawn'], screen['savesLocked']),
                         ('alternate', 'p2', False, True))
        with self.assertRaisesRegex(TournamentError, 'solo il prossimo'):
            self.run.match_screen(item, second['id'])
        with self.assertRaisesRegex(TournamentError, 'non trovato'):
            self.run.match_screen(item, 999)
        # Solo i due giocatori o il creatore.
        with self.assertRaisesRegex(TournamentError, 'uno dei due giocatori'):
            self.run.play_match(item, first['id'], second['playerA'], None)
        data = self.run.play_match(item, first['id'], first['playerB'], 'p1')
        self.assertEqual(data['players'], [first['playerB'], first['playerA']])
        self.assertEqual((data['system'], data['game']), (GAME['system'], GAME['id']))
        match = data['match']
        self.assertEqual((match['tournament'], match['match'], match['gameNo'], match['sideA'], match['savesLocked']),
                         (item, first['id'], 1, 'p2', True))
        # Senza stato di partenza si parte dall'inizio; il salvataggio interno è quello del torneo.
        self.assertIsNone(match['state'])
        self.assertIsNone(match['core'])
        self.assertEqual(match['sram'], self.service.sram_dir(item))
        self.assertEqual(self.run.play_match(item, first['id'], self.ada, None)['match']['sideA'], 'p2')
        # Fino all'avvio l'incontro resta pronto; poi è in gioco e resta il prossimo.
        self.assertEqual(self.matches.get(first['id'])['status'], 'ready')
        self.run.match_started(match)
        current = self.matches.get(first['id'])
        self.assertEqual((current['status'], current['startedAt']), ('playing', NOW))
        self.assertEqual(self.run.match_screen(item, first['id'])['status'], 'playing')
        self.run.play_match(item, first['id'], first['playerA'], None)
        with self.assertRaisesRegex(TournamentError, 'solo il prossimo'):
            self.run.play_match(item, second['id'], second['playerA'], None)
        self.run.match_ended(first['id'], 42)
        self.assertEqual(self.run.last_session(first['id']), 42)
        self.assertIsNone(self.run.last_session(second['id']))

    def test_stato_di_partenza_del_torneo(self):
        item, semis = self.running()
        tournament = self.service.repo.get(item)
        path = self.service.state_path(tournament)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'wb') as stream:
            stream.write(b'stato')
        self.service.repo.update(item, {'state': os.path.basename(path), 'core': 'genesis_plus_gx'}, NOW)
        match = self.run.play_match(item, semis[0]['id'], self.ada, None)['match']
        self.assertEqual((match['state'], match['core']), (path, 'genesis_plus_gx'))
        os.unlink(path)
        match = self.run.play_match(item, semis[0]['id'], self.ada, None)['match']
        self.assertEqual((match['state'], match['core']), (None, None))

    def test_lati_sorteggiati(self):
        item, semis = self.running(sides='random')
        first = semis[0]
        drawn = self.run.match_screen(item, first['id'])
        self.assertTrue(drawn['drawn'])
        self.assertIn(drawn['sideA'], ('p1', 'p2'))
        # Il sorteggio resta lo stesso fino all'avvio della partita, qualunque lato chieda il client.
        self.assertEqual(self.run.match_screen(item, first['id'])['sideA'], drawn['sideA'])
        data = self.run.play_match(item, first['id'], self.ada, 'p1' if drawn['sideA'] == 'p2' else 'p2')
        self.assertEqual(data['match']['sideA'], drawn['sideA'])
        self.run.match_started(data['match'])
        self.assertEqual(self.run.drawn, {})

    def test_lati_liberi(self):
        free, semis = self.running(sides='free')
        screen = self.run.match_screen(free, semis[0]['id'])
        self.assertEqual((screen['sideA'], screen['drawn']), (None, False))
        players = (semis[0]['playerA'], semis[0]['playerB'])
        self.assertEqual(self.run.play_match(free, semis[0]['id'], self.ada, 'p2')['players'], [players[1], players[0]])
        self.assertEqual(self.run.play_match(free, semis[0]['id'], self.ada, None)['players'], list(players))
        with self.assertRaisesRegex(TournamentError, 'Lato non valido'):
            self.run.play_match(free, semis[0]['id'], self.ada, 'p3')

    def test_incontri_solo_a_torneo_in_corso(self):
        item = self.tournament()
        with self.assertRaisesRegex(TournamentError, 'non è in corso'):
            self.run.match_screen(item, 1)

    # --- Risultati -------------------------------------------------------------------

    def game(self, item, match_id, session=None):
        """Gioca una partita dell'incontro (avvio e fine) e restituisce i dati dell'avvio."""
        data = self.run.play_match(item, match_id, self.ada, None)['match']
        self.run.match_started(data)
        self.run.match_ended(match_id, session)
        return data

    def series_tournament(self, players=4, series=3, combo=None, third=False):
        item = self.tournament(players=players, combo=combo)
        self.service.update(item, self.ada, combo, {'sides': 'alternate'})
        settings = {'thirdPlace': third, 'roundSeries': series, 'finalSeries': series,
                    'options': {'semiSeries': series}}
        self.run.start(item, self.ada, combo, settings, self.ids[:players])
        played = sorted((match for match in self.matches.list(item) if not match['bye']),
                        key=lambda match: match['playOrder'])
        return item, played

    def test_serie_al_meglio_di_tre(self):
        drops = []

        class FakeIngame:
            def drop_match(self, match_id):
                drops.append(match_id)

        self.run.ingame = FakeIngame()
        item, played = self.series_tournament()
        first = played[0]
        a, b = first['playerA'], first['playerB']
        # Niente da dichiarare prima di giocare.
        with self.assertRaisesRegex(TournamentError, 'non è in gioco'):
            self.run.declare(item, first['id'], self.ada, None, a)
        data = self.game(item, first['id'], session=None)
        self.assertEqual(self.run.match_screen(item, first['id'])['played'], {'gameNo': 1, 'sideA': data['sideA']})
        result = self.run.declare(item, first['id'], self.ada, None, a)
        self.assertEqual((result['done'], result['winner'], result['gameNo'], result['wins'], result['nextMatch']),
                         (False, None, 2, [1, 0], first['id']))
        games = self.matches.games(first['id'])
        self.assertEqual([(game['gameNo'], game['winnerId'], game['sideA']) for game in games], [(1, a, 'p1')])
        # Doppia dichiarazione rifiutata.
        with self.assertRaisesRegex(TournamentError, 'partita da dichiarare'):
            self.run.declare(item, first['id'], self.ada, None, b)
        # Partita 2 coi lati scambiati.
        screen = self.run.match_screen(item, first['id'])
        self.assertEqual((screen['gameNo'], screen['sideA'], screen['wins'], screen['played']), (2, 'p2', [1, 0], None))
        self.assertEqual(self.game(item, first['id'])['sideA'], 'p2')
        self.run.declare(item, first['id'], self.ada, None, b)
        self.game(item, first['id'])
        result = self.run.declare(item, first['id'], self.ada, None, a)
        self.assertEqual((result['done'], result['winner'], result['gameNo'], result['wins']), (True, a, None, [2, 1]))
        self.assertEqual(result['nextMatch'], played[1]['id'])
        self.assertEqual(drops, [first['id']])
        done = self.matches.get(first['id'])
        self.assertEqual((done['status'], done['winnerId'], done['finishedAt']), ('done', a, NOW))
        final = [match for match in self.matches.list(item) if match['round'] == 2][0]
        self.assertIn(a, (final['playerA'], final['playerB']))
        self.assertEqual(final['status'], 'waiting')
        public = {match['id']: match for match in result['tournament']['matches']}
        self.assertEqual(len(public[first['id']]['games']), 3)
        with self.assertRaisesRegex(TournamentError, 'già concluso'):
            self.run.match_screen(item, first['id'])

    def test_partita_secca_e_serie_da_cinque(self):
        item, played = self.series_tournament(series=1)
        first = played[0]
        self.game(item, first['id'])
        result = self.run.declare(item, first['id'], self.ada, None, first['playerB'])
        self.assertEqual((result['done'], result['winner'], result['wins']), (True, first['playerB'], [0, 1]))
        self.service.repo.update(item, {'status': 'cancelled'}, NOW)
        five, played = self.series_tournament(series=5)
        match = played[0]
        for winner in ('playerA', 'playerB', 'playerA', 'playerB'):
            self.game(five, match['id'])
            self.assertFalse(self.run.declare(five, match['id'], self.ada, None, match[winner])['done'])
        self.game(five, match['id'])
        result = self.run.declare(five, match['id'], self.ada, None, match['playerA'])
        self.assertEqual((result['done'], result['wins']), (True, [3, 2]))

    def league_tournament(self, options, series=1, players=3):
        item = self.tournament(players=players)
        self.service.update(item, self.ada, None, {'sides': 'alternate'})
        settings = {'format': 'round_robin', 'roundSeries': series, 'options': options}
        self.run.start(item, self.ada, None, settings, self.ids[:players])
        played = sorted(self.matches.list(item), key=lambda match: match['playOrder'])
        return item, played

    def test_girone_pareggio_e_serie_fissa(self):
        item, played = self.league_tournament({'draws': True}, series=2)
        first = played[0]
        a, b = first['playerA'], first['playerB']
        self.game(item, first['id'])
        screen = self.run.match_screen(item, first['id'])
        self.assertEqual(screen['rules'], {'draws': True, 'score': False, 'fixed': True})
        # Senza punteggio registrato non se ne manda; il pari non ha vincitore.
        with self.assertRaisesRegex(TournamentError, 'non registra il punteggio'):
            self.run.declare(item, first['id'], self.ada, None, a, score=[1, 0])
        with self.assertRaisesRegex(TournamentError, 'non ha un vincitore'):
            self.run.declare(item, first['id'], self.ada, None, a, draw=True)
        result = self.run.declare(item, first['id'], self.ada, None, a)
        self.assertEqual((result['done'], result['gameNo'], result['wins']), (False, 2, [1, 0]))
        # Serie fissa da 2: si gioca anche la seconda, e 1 vinta a testa è pari.
        self.game(item, first['id'])
        result = self.run.declare(item, first['id'], self.ada, None, b)
        self.assertEqual((result['done'], result['winner'], result['draw'], result['wins']), (True, None, True, [1, 1]))
        done = self.matches.get(first['id'])
        self.assertEqual((done['status'], done['winnerId']), ('done', None))
        table = {row['id']: row for row in result['tournament']['standings']}
        self.assertEqual((table[a]['drawn'], table[a]['points'], table[b]['drawn']), (1, 1, 1))
        # Partita pari dichiarata: conta come giocata, nessuno vince.
        second = played[1]
        self.game(item, second['id'])
        result = self.run.declare(item, second['id'], self.ada, None, None, draw=True)
        self.assertEqual((result['done'], result['drawCount'], result['gameNo']), (False, 1, 2))
        self.assertIsNone(self.matches.games(second['id'])[0]['winnerId'])
        self.game(item, second['id'])
        result = self.run.declare(item, second['id'], self.ada, None, second['playerB'])
        self.assertEqual((result['done'], result['winner'], result['draw']), (True, second['playerB'], False))

    def test_girone_punteggio(self):
        item, played = self.league_tournament({'draws': True, 'score': True}, series=1)
        first = played[0]
        a, b = first['playerA'], first['playerB']
        self.game(item, first['id'])
        self.assertTrue(self.run.match_screen(item, first['id'])['rules']['score'])
        for winner, draw, score, text in ((a, False, None, 'Indica il punteggio'), (a, False, [1, 3], 'più punti'),
                                          (a, False, [2, 2], 'più punti'), (None, True, [2, 1], 'uguale'),
                                          (a, False, [100, 0], 'da 0 a 99'), (None, False, [1, 0], 'rigiocare')):
            with self.assertRaisesRegex(TournamentError, text):
                self.run.declare(item, first['id'], self.ada, None, winner, draw=draw, score=score)
        result = self.run.declare(item, first['id'], self.ada, None, b, score=[1, 3])
        self.assertEqual((result['done'], result['winner'], result['scores']), (True, b, [1, 3]))
        game = self.matches.games(first['id'])[0]
        self.assertEqual((game['scoreA'], game['scoreB']), (1, 3))
        table = {row['id']: row for row in result['tournament']['standings']}
        self.assertEqual((table[b]['scoreFor'], table[b]['scoreAgainst'], table[b]['points']), (3, 1, 3))

    def test_girone_ritiro_e_annulla(self):
        item, played = self.league_tournament({'score': True, 'walkoverScore': [3, 0]}, players=5)
        eva = self.ids[4]
        mine = [match for match in played if eva in (match['playerA'], match['playerB'])]
        other = lambda match: match['playerB'] if match['playerA'] == eva else match['playerA']
        self.assertEqual(len(mine), 4)
        # Tavolino dell'admin prima del ritiro: resta anche annullando il ritiro.
        self.run.walkover(item, mine[0]['id'], self.ada, None, other(mine[0]))
        self.run.now = lambda: '2026-11-02T19:00:00+00:00'
        result = self.run.withdraw(item, eva, self.ada, None)['tournament']
        public = {match['id']: match for match in result['matches']}
        self.assertTrue(all(public[match['id']]['status'] == 'done' and public[match['id']]['walkover'] and
                            public[match['id']]['winnerId'] == other(match) for match in mine))
        table = {row['id']: row for row in result['standings']}
        self.assertEqual((table[eva]['lost'], table[eva]['withdrawn'], table[eva]['scoreAgainst']), (4, True, 12))
        self.assertEqual(table[other(mine[1])]['scoreFor'], 3)
        with self.assertRaisesRegex(TournamentError, 'già ritirato'):
            self.run.withdraw(item, eva, self.ada, None)
        # Annullare un tavolino automatico annulla il ritiro: tornano da giocare solo quelli del ritiro.
        self.assertEqual(self.run.can_undo(self.service.repo.get(item), self.matches.get(mine[2]['id'])),
                         ('withdrawal', None))
        undone = self.run.undo(item, mine[2]['id'], self.ada, None)
        self.assertEqual(undone['undone'], 'withdrawal')
        statuses = [self.matches.get(match['id'])['status'] for match in mine]
        self.assertEqual(statuses, ['done', 'ready', 'ready', 'ready'])
        self.assertFalse(next(player for player in undone['tournament']['players'] if player['id'] == eva)['withdrawn'])
        # Si annulla anche un incontro vecchio: torna da giocare e, col numero d'ordine più basso, è il prossimo.
        self.run.undo(item, mine[0]['id'], self.ada, None)
        ready = [match for match in self.matches.list(item) if match['status'] == 'ready']
        self.assertEqual(min(ready, key=lambda match: match['playOrder'])['id'],
                         min((match for match in played if match['id'] in {m['id'] for m in ready}),
                             key=lambda match: match['playOrder'])['id'])
        self.assertEqual(self.matches.get(mine[0]['id'])['status'], 'ready')

    def test_girone_ritiro_a_incontri_finiti(self):
        item, played = self.league_tournament({}, players=3)
        ada_matches = [match for match in played if self.ada in (match['playerA'], match['playerB'])]
        for match in ada_matches:
            self.run.walkover(item, match['id'], self.ada, None, self.ada)
        with self.assertRaisesRegex(TournamentError, 'già giocato tutti'):
            self.run.withdraw(item, self.ada, self.ada, None)

    def test_pareggio_fuori_dal_girone(self):
        item, played = self.series_tournament(series=1)
        first = played[0]
        self.game(item, first['id'])
        self.assertEqual(self.run.match_screen(item, first['id'])['rules'],
                         {'draws': False, 'score': False, 'fixed': False})
        with self.assertRaisesRegex(TournamentError, 'non è ammesso'):
            self.run.declare(item, first['id'], self.ada, None, None, draw=True)

    def test_rigioca(self):
        item, played = self.series_tournament()
        first = played[0]
        self.game(item, first['id'], session=None)
        result = self.run.declare(item, first['id'], self.ada, None, None)
        self.assertEqual((result['done'], result['gameNo'], result['wins']), (False, 1, [0, 0]))
        self.assertEqual(self.matches.games(first['id']), [])
        screen = self.run.match_screen(item, first['id'])
        self.assertEqual((screen['gameNo'], screen['sideA'], screen['played']), (1, 'p1', None))
        with self.assertRaisesRegex(TournamentError, 'partita da dichiarare'):
            self.run.declare(item, first['id'], self.ada, None, None)

    def test_sessione_collegata(self):
        item, played = self.series_tournament()
        first = played[0]
        session = self.sessions.start('md', GAME['id'], 'core', NOW)
        self.game(item, first['id'], session=session)
        self.assertEqual(self.run.last_session(first['id']), session)
        self.run.declare(item, first['id'], self.ada, None, first['playerA'])
        self.assertEqual(self.matches.games(first['id'])[0]['sessionId'], session)
        self.assertIsNone(self.run.last_session(first['id']))

    def test_nuova_partita_scarta_quella_non_dichiarata(self):
        item, played = self.series_tournament()
        first = played[0]
        self.game(item, first['id'])
        data = self.run.play_match(item, first['id'], self.ada, None)['match']
        self.run.match_started(data)
        with self.assertRaisesRegex(TournamentError, 'partita da dichiarare'):
            self.run.declare(item, first['id'], self.ada, None, first['playerA'])

    def test_dichiarazione_solo_dell_admin(self):
        item, played = self.series_tournament(combo=COMBO)
        first = played[0]
        self.game(item, first['id'])
        with self.assertRaisesRegex(TournamentError, 'chi ha creato il torneo'):
            self.run.declare(item, first['id'], first['playerB'], COMBO, first['playerA'])
        with self.assertRaises(TournamentLockedError):
            self.run.declare(item, first['id'], self.ada, ['up'], first['playerA'])
        with self.assertRaises(TournamentLockedError):
            self.run.declare(item, first['id'], self.ada, None, first['playerA'])
        self.assertEqual(self.matches.games(first['id']), [])
        with self.assertRaisesRegex(TournamentError, 'non gioca'):
            self.run.declare(item, first['id'], self.ada, COMBO, played[1]['playerA'])
        result = self.run.declare(item, first['id'], self.ada, COMBO, first['playerA'])
        self.assertEqual(result['wins'], [1, 0])

    def test_propagazione_fino_alla_finale_con_terzo_posto(self):
        item, played = self.series_tournament(players=5, series=1, third=True)
        self.assertEqual([match['bracket'] for match in played], ['main', 'main', 'main', 'third', 'main'])
        losers = []
        for _ in range(3):
            match = self.matches.get(played[len(losers)]['id'])
            self.assertEqual(match['status'], 'ready')
            self.game(item, match['id'])
            result = self.run.declare(item, match['id'], self.ada, None, match['playerA'])
            losers.append(match['playerB'])
        third = self.matches.get(played[3]['id'])
        # I perdenti delle due semifinali (il perdente del primo turno è fuori).
        self.assertEqual(sorted((third['playerA'], third['playerB'])), sorted(losers[1:]))
        self.assertEqual(third['status'], 'ready')
        self.assertEqual(result['nextMatch'], third['id'])
        final = self.matches.get(played[4]['id'])
        self.assertEqual(final['status'], 'ready')
        # Il 3° posto si gioca prima della finale.
        with self.assertRaisesRegex(TournamentError, 'solo il prossimo'):
            self.run.match_screen(item, final['id'])
        self.game(item, third['id'])
        result = self.run.declare(item, third['id'], self.ada, None, third['playerB'])
        self.assertEqual(result['nextMatch'], final['id'])
        self.game(item, final['id'])
        result = self.run.declare(item, final['id'], self.ada, None, final['playerA'])
        self.assertEqual((result['done'], result['nextMatch']), (True, None))
        self.assertEqual(final['playerA'], self.ids[0])

    def test_sospensione(self):
        drops = []

        class FakeIngame:
            def drop_match(self, match_id):
                drops.append(match_id)

        self.run.ingame = FakeIngame()
        item, played = self.series_tournament()
        first = played[0]
        with self.assertRaisesRegex(TournamentError, 'non è in gioco'):
            self.run.suspend(item, first['id'], self.ada)
        self.game(item, first['id'])
        self.run.declare(item, first['id'], self.ada, None, first['playerA'])
        with self.assertRaisesRegex(TournamentError, 'uno dei due giocatori'):
            self.run.suspend(item, first['id'], played[1]['playerA'])
        result = self.run.suspend(item, first['id'], first['playerB'])
        self.assertEqual(drops, [first['id']])
        match = [entry for entry in result['tournament']['matches'] if entry['id'] == first['id']][0]
        self.assertEqual((match['status'], len(match['games'])), ('playing', 1))
        # Si riprende dalla partita 2.
        screen = self.run.match_screen(item, first['id'])
        self.assertEqual((screen['gameNo'], screen['wins']), (2, [1, 0]))
        self.assertEqual(self.run.play_match(item, first['id'], first['playerA'], None)['match']['gameNo'], 2)
        # Sospeso con una partita da dichiarare: resta da dichiarare.
        self.game(item, first['id'])
        self.run.suspend(item, first['id'], self.ada)
        self.assertEqual(self.run.match_screen(item, first['id'])['played']['gameNo'], 2)


    # --- Azioni dell'admin -------------------------------------------------------------

    def public_match(self, item, match_id):
        tournament = self.service.public(self.service.repo.get(item))
        return [match for match in tournament['matches'] if match['id'] == match_id][0]

    def test_tavolino(self):
        drops = []

        class FakeIngame:
            def drop_match(self, match_id):
                drops.append(match_id)

        self.run.ingame = FakeIngame()
        item, played = self.series_tournament(combo=COMBO)
        first, second = played[0], played[1]
        a, b = first['playerA'], first['playerB']
        with self.assertRaisesRegex(TournamentError, 'chi ha creato'):
            self.run.walkover(item, first['id'], b, COMBO, a)
        with self.assertRaises(TournamentLockedError):
            self.run.walkover(item, first['id'], self.ada, None, a)
        with self.assertRaisesRegex(TournamentError, 'non gioca'):
            self.run.walkover(item, first['id'], self.ada, COMBO, second['playerA'])
        final = [match for match in self.matches.list(item) if match['round'] == 2][0]
        with self.assertRaisesRegex(TournamentError, 'due giocatori'):
            self.run.walkover(item, final['id'], self.ada, COMBO, a)
        # In gioco con una partita dichiarata: la partita resta, l'incontro si chiude.
        self.game(item, first['id'])
        self.run.declare(item, first['id'], self.ada, COMBO, a)

        class FakePlay:
            current = {'tournament': item, 'match': first['id']}

            def playing_match(self):
                return self.current

        self.service.play = FakePlay()
        with self.assertRaisesRegex(TournamentError, 'partita dell\'incontro in gioco'):
            self.run.walkover(item, first['id'], self.ada, COMBO, b)
        self.service.play.current = None
        self.run.walkover(item, first['id'], self.ada, COMBO, b)
        done = self.matches.get(first['id'])
        self.assertEqual((done['status'], done['winnerId'], done['walkover'], done['finishedAt']), ('done', b, True, NOW))
        self.assertEqual(len(self.matches.games(first['id'])), 1)
        self.assertIn(b, (self.matches.get(final['id'])['playerA'], self.matches.get(final['id'])['playerB']))
        self.assertEqual(drops, [first['id']])
        with self.assertRaisesRegex(TournamentError, 'già concluso'):
            self.run.walkover(item, first['id'], self.ada, COMBO, a)
        public = self.public_match(item, first['id'])
        self.assertEqual((public['undoKind'], public['canUndo'], public['undoProblem']), ('walkover', True, None))
        # Annullato il tavolino: torna in gioco con la partita dichiarata, il vincitore esce dalla finale.
        self.assertEqual(self.run.undo(item, first['id'], self.ada, COMBO)['undone'], 'walkover')
        match = self.matches.get(first['id'])
        self.assertEqual((match['status'], match['winnerId'], match['walkover'], match['finishedAt']),
                         ('playing', None, False, None))
        self.assertEqual(len(self.matches.games(first['id'])), 1)
        self.assertNotIn(b, (self.matches.get(final['id'])['playerA'], self.matches.get(final['id'])['playerB']))

    def test_ritiro_con_avversario_noto(self):
        item, played = self.series_tournament()
        first = played[0]
        a, b = first['playerA'], first['playerB']
        with self.assertRaisesRegex(TournamentError, 'non è iscritto'):
            self.run.withdraw(item, self.ids[4], self.ada, None)
        result = self.run.withdraw(item, b, self.ada, None)
        players = {player['id']: player for player in result['tournament']['players']}
        self.assertTrue(players[b]['withdrawn'])
        match = self.matches.get(first['id'])
        self.assertEqual((match['status'], match['winnerId'], match['walkover']), ('done', a, True))
        with self.assertRaisesRegex(TournamentError, 'già ritirato'):
            self.run.withdraw(item, b, self.ada, None)
        public = self.public_match(item, first['id'])
        self.assertEqual(public['undoKind'], 'withdrawal')
        # Annullato: il ritiro sparisce e l'incontro è di nuovo da giocare.
        self.assertEqual(self.run.undo(item, first['id'], self.ada, None)['undone'], 'withdrawal')
        self.assertFalse({player['id']: player for player in self.service.repo.players(item)}[b]['withdrawn'])
        self.assertEqual(self.matches.get(first['id'])['status'], 'ready')
        # Un eliminato non si ritira.
        self.game(item, first['id'])
        self.run.declare(item, first['id'], self.ada, None, a)
        self.game(item, first['id'])
        self.run.declare(item, first['id'], self.ada, None, a)
        with self.assertRaisesRegex(TournamentError, 'già eliminato'):
            self.run.withdraw(item, b, self.ada, None)

    def test_ritiro_in_attesa_dell_avversario(self):
        # 5 iscritti: il 1° ha il bye e aspetta il vincitore di 4-5.
        item, played = self.series_tournament(players=5, series=1)
        first = played[0]
        semi = [match for match in self.matches.list(item)
                if match['round'] == 2 and self.ids[0] in (match['playerA'], match['playerB'])][0]
        self.run.withdraw(item, self.ids[0], self.ada, None)
        self.assertEqual(self.matches.get(semi['id'])['status'], 'waiting')
        public = self.public_match(item, semi['id'])
        self.assertEqual((public['undoKind'], public['canUndo']), ('withdrawal', True))
        self.game(item, first['id'])
        self.run.declare(item, first['id'], self.ada, None, first['playerB'])
        semi = self.matches.get(semi['id'])
        self.assertEqual((semi['status'], semi['winnerId'], semi['walkover'], semi['finishedAt']),
                         ('done', first['playerB'], True, NOW))
        # Annullando il primo incontro si riapre anche il tavolino; il 1° resta ritirato.
        self.assertEqual(self.run.undo(item, first['id'], self.ada, None)['undone'], 'result')
        semi = self.matches.get(semi['id'])
        self.assertEqual((semi['status'], semi['winnerId'], semi['walkover'], semi['finishedAt']),
                         ('waiting', None, False, None))
        self.assertTrue({player['id']: player for player in self.service.repo.players(item)}[self.ids[0]]['withdrawn'])
        self.assertEqual(self.matches.get(first['id'])['status'], 'playing')
        self.assertEqual(self.matches.games(first['id']), [])
        # Annullando nell'incontro in attesa il ritiro sparisce.
        self.assertEqual(self.run.undo(item, semi['id'], self.ada, None)['undone'], 'withdrawal')
        self.assertFalse({player['id']: player for player in self.service.repo.players(item)}[self.ids[0]]['withdrawn'])

    def test_annulla_partita_per_partita_e_bloccato(self):
        item, played = self.series_tournament()
        first, second = played[0], played[1]
        a = first['playerA']
        with self.assertRaisesRegex(TournamentError, 'risultato da annullare'):
            self.run.undo(item, first['id'], self.ada, None)
        for _ in range(2):
            self.game(item, first['id'])
            self.run.declare(item, first['id'], self.ada, None, a)
        self.assertEqual(self.matches.get(first['id'])['status'], 'done')
        # Incontro concluso: torna in gioco con una partita in meno ed è di nuovo il prossimo.
        result = self.run.undo(item, first['id'], self.ada, None)
        self.assertEqual(result['undone'], 'result')
        self.assertEqual((self.matches.get(first['id'])['status'], len(self.matches.games(first['id']))),
                         ('playing', 1))
        self.assertEqual(self.run.match_screen(item, first['id'])['gameNo'], 2)
        # In gioco: si toglie un'altra partita.
        self.assertEqual(self.run.undo(item, first['id'], self.ada, None)['undone'], 'game')
        self.assertEqual(self.matches.games(first['id']), [])
        # Con l'incontro dopo iniziato non si annulla.
        for match in (first, second):
            for _ in range(2):
                self.game(item, match['id'])
                self.run.declare(item, match['id'], self.ada, None, match['playerA'])
        final = [match for match in self.matches.list(item) if match['round'] == 2][0]
        self.game(item, final['id'])
        public = self.public_match(item, first['id'])
        self.assertEqual((public['canUndo'], public['undoProblem']), (False, 'L\'incontro successivo è già iniziato.'))
        with self.assertRaisesRegex(TournamentError, 'successivo è già iniziato'):
            self.run.undo(item, first['id'], self.ada, None)

    # --- Fine del torneo -------------------------------------------------------------

    def next_match(self, item):
        pending = [match for match in self.matches.list(item) if match['status'] in ('ready', 'playing')]
        return min(pending, key=lambda match: (match['status'] != 'playing', match['playOrder'])) if pending else None

    def play_all(self, item, winner=None, combo=None):
        """Gioca tutti gli incontri (vince ``player_a``, o ``winner(match)``); restituisce l'ultima dichiarazione."""
        result = None
        while True:
            match = self.next_match(item)
            if match is None:
                return result
            choice = winner(match) if winner else match['playerA']
            for _ in range(match['series'] // 2 + 1):
                self.game(item, match['id'])
                result = self.run.declare(item, match['id'], self.ada, combo, choice)

    def places(self, item):
        return {player['id']: player['place'] for player in self.service.repo.players(item)}

    def test_fine_con_terzo_posto(self):
        item, played = self.series_tournament(players=5, series=1, third=True)
        xp_before = {account: self.sessions.stats(account)['xp'] for account in self.ids}
        result = self.play_all(item)
        self.assertTrue(result['finished'])
        self.assertTrue(result['done'])
        tournament = result['tournament']
        self.assertEqual((tournament['status'], tournament['finishedAt']), ('done', NOW))
        places = self.places(item)
        self.assertEqual(sorted(places.values()), [1, 2, 3, 4, 5])
        self.assertEqual(places[self.ids[0]], 1)
        self.assertEqual([(entry['place'], entry['xp']) for entry in tournament['podium']], [(1, 100), (2, 50), (3, 25)])
        gained = {account: self.sessions.stats(account)['xp'] - xp_before[account] for account in self.ids}
        self.assertEqual(sorted(gained.values()), [0, 0, 25, 50, 100])
        self.assertEqual(gained[self.ids[0]], 100)
        # Tutti i piazzati hanno la riga del piazzamento, anche senza premio.
        self.assertEqual(sorted((row['place'], row['xp']) for row in self.rewards.of_tournament(item)),
                         [(1, 100), (2, 50), (3, 25), (4, 0), (5, 0)])
        # Concluso: niente più azioni di gioco o dell'admin.
        final = played[-1]
        with self.assertRaisesRegex(TournamentError, 'concluso'):
            self.run.undo(item, final['id'], self.ada, None)
        with self.assertRaisesRegex(TournamentError, 'concluso'):
            self.run.match_screen(item, final['id'])
        with self.assertRaisesRegex(TournamentError, 'concluso'):
            self.run.withdraw(item, self.ids[1], self.ada, None)
        # Per l'interfaccia: incontri senza «Annulla il risultato» e podio anche nell'elenco.
        public = self.service.public(self.service.repo.get(item))
        self.assertNotIn('undoKind', public['matches'][0])
        overview = self.service.overview()
        self.assertEqual([entry['id'] for entry in overview['recent']], [item])
        self.assertEqual([entry['id'] for entry in overview['history']], [item])
        self.assertEqual(overview['tournaments'], [])

    def test_fine_senza_terzo_posto(self):
        item, _ = self.series_tournament(players=4, series=1, third=False)
        result = self.play_all(item)
        podium = result['tournament']['podium']
        self.assertEqual([(entry['place'], entry['xp']) for entry in podium], [(1, 100), (2, 50), (3, 25), (3, 25)])
        self.assertEqual(sorted(self.places(item).values()), [1, 2, 3, 3])

    def test_premi_spenti(self):
        item = self.tournament(players=4)
        self.service.update(item, self.ada, None, {'rewards': False})
        self.run.start(item, self.ada, None, {'roundSeries': 1, 'finalSeries': 1}, self.ids[:4])
        before = {account: self.sessions.stats(account)['xp'] for account in self.ids}
        result = self.play_all(item)
        self.assertTrue(result['finished'])
        self.assertEqual({entry['xp'] for entry in result['tournament']['podium']}, {0})
        self.assertEqual({account: self.sessions.stats(account)['xp'] for account in self.ids}, before)

    def test_tre_iscritti_e_otto_con_ritirato(self):
        item, _ = self.series_tournament(players=3, series=1)
        self.play_all(item)
        places = self.places(item)
        self.assertEqual(places[self.ids[0]], 1)
        self.assertEqual(sorted(places.values()), [1, 2, 3])
        # 8 iscritti, uno ritirato al primo turno: 5° come gli altri usciti al primo turno.
        for name in ('fra', 'gio', 'ivo'):
            self.ids.append(self.profiles.create(name, '#ff5d73')['id'])
        item, played = self.series_tournament(players=8, series=1)
        first = played[0]
        self.run.withdraw(item, first['playerB'], self.ada, None)
        self.play_all(item)
        places = self.places(item)
        self.assertEqual(places[first['playerB']], 5)
        self.assertEqual(sorted(places.values()), [1, 2, 3, 3, 5, 5, 5, 5])

    def test_fine_con_un_tavolino(self):
        item, _ = self.series_tournament(players=3, series=1)
        first = self.next_match(item)
        self.game(item, first['id'])
        self.run.declare(item, first['id'], self.ada, None, first['playerA'])
        final = self.next_match(item)
        result = self.run.walkover(item, final['id'], self.ada, None, final['playerB'])
        self.assertEqual(result['tournament']['status'], 'done')
        self.assertEqual(self.places(item)[final['playerB']], 1)

    def public(self, item):
        return self.service.public(self.service.repo.get(item))

    def test_doppia_senza_rivincita(self):
        item, _, tournament = self.double_tournament(5)
        self.assertEqual(tournament['count'], {'min': 8, 'max': 9})
        # Vince sempre playerA: in gran finale chi arriva dai vincenti, la rivincita non si gioca.
        result = self.play_all(item)
        self.assertTrue(result['finished'])
        tournament = result['tournament']
        grand = {match['round']: match for match in tournament['matches'] if match['bracket'] == 'grand'}
        self.assertEqual((grand[2]['status'], grand[2]['playerA'], grand[2]['winnerId']), ('skipped', None, None))
        self.assertEqual(tournament['count'], 8)
        places = self.places(item)
        self.assertEqual(sorted(places.values()), [1, 2, 3, 4, 5])
        self.assertEqual(places[grand[1]['winnerId']], 1)
        self.assertEqual([(entry['place'], entry['xp']) for entry in tournament['podium']], [(1, 100), (2, 50), (3, 25)])
        self.assertEqual(sorted((row['place'], row['xp']) for row in self.rewards.of_tournament(item)),
                         [(1, 100), (2, 50), (3, 25), (4, 0), (5, 0)])

    def test_doppia_con_rivincita(self):
        while len(self.ids) < 4:
            self.ids.append(self.profiles.create('p%d' % len(self.ids), '#ff5d73')['id'])
        item = self.tournament(players=4)
        self.service.update(item, self.ada, None, {'sides': 'alternate', 'advantagedSide': 'p1'})
        settings = {'format': 'double', 'roundSeries': 1, 'finalSeries': 1, 'options': {'grandFinal': 'reset'}}
        self.run.start(item, self.ada, None, settings, self.ids[:4])

        def winner(match):
            return match['playerB'] if match['bracket'] == 'grand' and match['round'] == 1 else match['playerA']
        # Fino alla gran finale, che vince chi arriva dai perdenti.
        while True:
            match = self.next_match(item)
            self.game(item, match['id'])
            result = self.run.declare(item, match['id'], self.ada, None, winner(match))
            if match['bracket'] == 'grand':
                break
        self.assertFalse(result['finished'])
        reset = self.next_match(item)
        self.assertEqual((reset['bracket'], reset['round'], reset['status']), ('grand', 2, 'ready'))
        self.assertEqual((reset['playerA'], reset['playerB']), (match['playerA'], match['playerB']))
        self.assertEqual(result['nextMatch'], reset['id'])
        self.assertEqual(self.public(item)['count'], 7)
        # Chi arrivava dai vincenti (playerA) resta nel lato svantaggiato nella partita 1.
        screen = self.run.match_screen(item, reset['id'])
        self.assertEqual((screen['players'][0]['id'], screen['sideA']), (match['playerA'], 'p2'))
        self.game(item, reset['id'])
        result = self.run.declare(item, reset['id'], self.ada, None, reset['playerB'])
        self.assertTrue(result['finished'])
        places = self.places(item)
        self.assertEqual((places[reset['playerB']], places[reset['playerA']]), (1, 2))
        self.assertEqual(sorted(places.values()), [1, 2, 3, 4])

    def test_doppia_incontro_unico_e_senza_gran_finale(self):
        item, _, tournament = self.double_tournament(5, 'single')
        self.assertEqual(tournament['count'], 8)
        result = self.play_all(item, winner=lambda match: match['playerB'] if match['bracket'] == 'grand'
                               else match['playerA'])
        self.assertTrue(result['finished'])
        grand = [match for match in result['tournament']['matches'] if match['bracket'] == 'grand']
        self.assertEqual(len(grand), 1)
        self.assertEqual(self.places(item)[grand[0]['playerB']], 1)
        item, _, tournament = self.double_tournament(5, 'none')
        result = self.play_all(item)
        self.assertTrue(result['finished'])
        matches = result['tournament']['matches']
        winners_final = max((match for match in matches if match['bracket'] == 'winners'), key=lambda m: m['round'])
        losers_final = max((match for match in matches if match['bracket'] == 'losers'), key=lambda m: m['round'])
        places = self.places(item)
        self.assertEqual(places[winners_final['winnerId']], 1)
        self.assertEqual(places[losers_final['winnerId']], 2)
        self.assertEqual(places[losers_final['playerB']], 3)
        self.assertEqual([entry['place'] for entry in result['tournament']['podium']], [1, 2, 3])

    def test_archivio_e_scheda(self):
        item, _ = self.series_tournament(players=3, series=1, combo=COMBO)
        self.play_all(item, combo=COMBO)
        winner = [player for player in self.service.repo.players(item) if player['place'] == 1][0]['id']
        xp = self.sessions.stats(winner)['xp']
        # Dopo 3 giorni il torneo non è più sulla scheda, ma resta nell'archivio.
        self.service.now = lambda: '2026-11-05T18:00:00+00:00'
        self.assertEqual(self.service.overview()['recent'], [])
        self.service.now = lambda: '2026-11-05T17:59:00+00:00'
        self.assertEqual(len(self.service.overview()['recent']), 1)
        with self.assertRaises(TournamentLockedError):
            self.service.delete(item, self.ada, None)
        with self.assertRaises(TournamentLockedError):
            self.service.delete(item, self.ids[1], COMBO)
        self.assertEqual(self.service.delete(item, self.ada, COMBO), {'tournament': None})
        self.assertEqual(self.service.overview()['history'], [])
        # I premi restano.
        self.assertEqual(self.sessions.stats(winner)['xp'], xp)
        self.assertEqual(self.profiles.tournament_stats(winner), {'played': 1, 'won': 1, 'best': 1})


    def finish(self, item, match_id, winners):
        """Gioca e dichiara le partite dell'incontro: ``winners`` = id del vincitore o ``'draw'``."""
        result = None
        for winner in winners:
            self.game(item, match_id)
            if winner == 'draw':
                result = self.run.declare(item, match_id, self.ada, None, None, draw=True)
            else:
                result = self.run.declare(item, match_id, self.ada, None, winner)
        return result

    def play_league(self, item, matches, outcomes):
        """Gioca in ordine gli incontri ``matches``: ``outcomes`` = ``{frozenset((a, b)): [vincitori]}``."""
        result = None
        for match in sorted(matches, key=lambda m: m['playOrder']):
            result = self.finish(item, match['id'], outcomes[frozenset((match['playerA'], match['playerB']))])
        return result

    def pair(self, matches, a, b):
        return next(match for match in matches if {match['playerA'], match['playerB']} == {a, b})

    def test_spareggio_a_due_per_il_primo_e_il_terzo_posto(self):
        item, played = self.league_tournament({'draws': True}, series=2, players=4)
        ada, bea, cleo, dan = self.ids[:4]
        outcomes = {frozenset((w, l)): [w, w] for w, l in ((ada, cleo), (ada, dan), (bea, cleo), (bea, dan))}
        outcomes[frozenset((ada, bea))] = [ada, bea]
        outcomes[frozenset((cleo, dan))] = [cleo, dan]
        result = self.play_league(item, played, outcomes)
        last = max(played, key=lambda m: m['playOrder'])
        self.assertFalse(result['finished'])
        public = result['tournament']
        self.assertEqual(public['status'], 'running')
        playoff = [match for match in self.matches.list(item) if match['bracket'] == 'playoff']
        self.assertEqual(len(playoff), 2)
        self.assertEqual([(m['groupNo'], m['series'], m['status']) for m in playoff], [(1, 3, 'ready'), (2, 3, 'ready')])
        self.assertEqual(public['playoff']['status'], 'playing')
        self.assertEqual([(g['place'], sorted(g['players'])) for g in public['playoff']['groups']],
                         [(1, sorted([ada, bea])), (3, sorted([cleo, dan]))])
        self.assertEqual(public['count'], 8)
        self.assertEqual(result['nextMatch'], min(playoff, key=lambda m: m['playOrder'])['id'])
        # Lo spareggio a due ha sempre un vincitore, al meglio di 3.
        first = next(m for m in playoff if m['groupNo'] == 1)
        self.game(item, first['id'])
        self.assertEqual(self.run.match_screen(item, first['id'])['rules'], {'draws': False, 'score': False,
                                                                             'fixed': False})
        with self.assertRaisesRegex(TournamentError, 'non è ammesso'):
            self.run.declare(item, first['id'], self.ada, None, None, draw=True)
        self.run.declare(item, first['id'], self.ada, None, bea)
        # Spareggio iniziato: i risultati del girone non si annullano.
        public = self.service.public(self.service.repo.get(item))
        league = {m['id']: m for m in public['matches']}
        self.assertEqual((league[last['id']]['canUndo'], league[last['id']]['undoProblem']),
                         (False, 'Prima va annullato lo spareggio.'))
        with self.assertRaisesRegex(TournamentError, 'spareggio'):
            self.run.undo(item, last['id'], self.ada, None)
        self.finish(item, first['id'], [bea])
        third = next(m for m in playoff if m['groupNo'] == 2)
        result = self.finish(item, third['id'], [dan, dan])
        self.assertTrue(result['finished'])
        public = result['tournament']
        self.assertEqual(public['status'], 'done')
        self.assertEqual([(row['id'], row['rank'], row['tied']) for row in public['standings']],
                         [(bea, 1, False), (ada, 2, False), (dan, 3, False), (cleo, 4, False)])
        # I numeri della classifica contano solo il girone.
        self.assertEqual(public['standings'][0]['played'], 3)
        self.assertEqual([(p['id'], p['place']) for p in public['podium']], [(bea, 1), (ada, 2), (dan, 3)])
        self.assertEqual(public['playoff']['status'], 'over')

    def test_spareggio_non_iniziato_si_cancella_annullando_il_girone(self):
        item, played = self.league_tournament({}, players=3)
        ada, bea, cleo = self.ids[:3]
        cycle = {frozenset((w, l)): [w] for w, l in ((ada, bea), (bea, cleo), (cleo, ada))}
        self.play_league(item, played, cycle)
        last = max(played, key=lambda m: m['playOrder'])
        playoff = [match for match in self.matches.list(item) if match['bracket'] == 'playoff']
        # Tre pari: mini-girone di sola andata.
        self.assertEqual((len(playoff), {m['groupNo'] for m in playoff}), (3, {1}))
        result = self.run.undo(item, last['id'], self.ada, None)
        self.assertEqual(result['undone'], 'result')
        self.assertFalse([m for m in self.matches.list(item) if m['bracket'] == 'playoff'])
        self.assertEqual(result['tournament']['playoff']['status'], 'none')
        # Si ricrea a girone di nuovo finito.
        self.finish(item, last['id'], cycle[frozenset((last['playerA'], last['playerB']))])
        self.assertEqual(len([m for m in self.matches.list(item) if m['bracket'] == 'playoff']), 3)

    def test_mini_girone_ancora_pari_e_sorteggio(self):
        item, played = self.league_tournament({}, players=3)
        ada, bea, cleo = self.ids[:3]
        cycle = {frozenset((w, l)): [w] for w, l in ((ada, bea), (bea, cleo), (cleo, ada))}
        self.play_league(item, played, cycle)
        playoff = [m for m in self.matches.list(item) if m['bracket'] == 'playoff']
        with self.assertRaisesRegex(TournamentError, 'Non serve un sorteggio'):
            self.run.draw_lots(item, self.ada, None)
        result = self.play_league(item, playoff, cycle)
        self.assertFalse(result['finished'])
        public = result['tournament']
        self.assertEqual((public['status'], public['playoff']['status']), ('running', 'draw'))
        self.assertEqual([(g['place'], sorted(g['players'])) for g in public['playoff']['groups']],
                         [(1, sorted([ada, bea, cleo]))])
        with self.assertRaisesRegex(TournamentError, 'creato il torneo'):
            self.run.draw_lots(item, bea, None)
        drawn = self.run.draw_lots(item, self.ada, None)
        order = drawn['draw'][0]['players']
        self.assertEqual((drawn['draw'][0]['place'], sorted(order)), (1, sorted([ada, bea, cleo])))
        public = drawn['tournament']
        self.assertEqual(public['status'], 'done')
        self.assertEqual([p['id'] for p in public['podium']], order)
        self.assertEqual([(row['id'], row['rank'], row['tied']) for row in public['standings']],
                         [(order[0], 1, False), (order[1], 2, False), (order[2], 3, False)])
        with self.assertRaisesRegex(TournamentError, 'concluso'):
            self.run.draw_lots(item, self.ada, None)

    def test_girone_senza_spareggio_e_ritirato_fuori_dal_podio(self):
        item, played = self.league_tournament({}, players=4)
        ada, bea, cleo, dan = self.ids[:4]
        # Si ritira Dan (i suoi incontri vanno a tavolino), poi Ada vince tutto.
        self.run.withdraw(item, dan, self.ada, None)
        outcomes = {frozenset((ada, other)): [ada] for other in (bea, cleo)}
        outcomes[frozenset((bea, cleo))] = [bea]
        self.play_league(item, [m for m in played if dan not in (m['playerA'], m['playerB'])], outcomes)
        public = self.service.public(self.service.repo.get(item))
        self.assertEqual(public['status'], 'done')
        self.assertEqual(public['playoff']['status'], 'none')
        places = {player['id']: player['place'] for player in public['players']}
        self.assertEqual(places, {ada: 1, bea: 2, cleo: 3, dan: 4})
        self.assertEqual([p['id'] for p in public['podium']], [ada, bea, cleo])

    # --- Dichiarazione automatica (estensioni) ---------------------------------------

    def test_dichiarazione_automatica(self):
        class Listener:
            def __init__(self):
                self.verdict = None
                self.started = []

            def game_started(self, info):
                self.started.append(info)

            def game_ended(self, info):
                return self.verdict

        listener = Listener()
        self.run.add_game_listener(listener)
        item, played = self.series_tournament()
        first = played[0]
        a, b = first['playerA'], first['playerB']
        data = self.run.play_match(item, first['id'], self.ada, None)['match']
        self.run.match_started(data)
        self.run.game_started(data, 'core')
        info = listener.started[0]
        self.assertEqual((info['match'], info['gameNo'], info['players']), (first['id'], 1, [a, b]))
        # Senza esito la partita resta da dichiarare a mano.
        self.run.match_ended(first['id'], None)
        self.assertIsNone(self.run.auto_declare(data, 'core'))
        self.assertIsNotNone(self.run.match_screen(item, first['id'])['played'])
        # Con l'esito: P1 della partita vince.
        listener.verdict = {'addon': 'test', 'winner': 'p1', 'score': [2, 1]}
        result = self.run.auto_declare(data, 'core')
        self.assertEqual((result['auto'], result['done'], result['wins'], result['replay']), ('test', False, [1, 0],
                                                                                              False))
        # Partita 2 coi lati scambiati: il P2 della partita è player_a.
        data = self.run.play_match(item, first['id'], self.ada, None)['match']
        self.assertEqual(data['sideA'], 'p2')
        self.run.match_started(data)
        self.run.match_ended(first['id'], None)
        listener.verdict = {'addon': 'test', 'winner': 'p2', 'score': [1, 2]}
        result = self.run.auto_declare(data, 'core')
        self.assertEqual((result['done'], result['winner']), (True, a))
        # Pari senza pareggi ammessi: «rigioca».
        second = played[1]
        data = self.run.play_match(item, second['id'], self.ada, None)['match']
        self.run.match_started(data)
        self.run.match_ended(second['id'], None)
        listener.verdict = {'addon': 'test', 'winner': None, 'score': [3, 3]}
        result = self.run.auto_declare(data, 'core')
        self.assertEqual((result['replay'], result['wins'], result['gameNo']), (True, [0, 0], 1))
        self.assertEqual(self.matches.games(second['id']), [])


if __name__ == '__main__':
    unittest.main()
