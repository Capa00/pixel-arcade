import random
import unittest

from pixelarcade.errors import TournamentError
from pixelarcade.tournament_formats import (FORMATS, READY, STARTABLE, apply_winner, bracket_size, build_single,
                                            check_crossings, check_options, default_options, game_sides, layout_double,
                                            layout_from_slots, match_count, merge_options, placements,
                                            placements_double, placements_single, played_count, ready_matches,
                                            revert_winner, seed_order, seed_positions, standard_crossings,
                                            first_round_slots, undo_problem, undo_state, all_closed,
                                            match_code, seed_rank, layout_round_robin, league_rounds,
                                            league_standings, series_choices, fit_series,
                                            game_rules, check_game_result, series_result)

SIZES = (3, 4, 5, 7, 8, 9, 13, 16, 33, 64)


def players(n):
    """Id dei giocatori in ordine di testa di serie: 101 è la testa di serie 1."""
    return [100 + seed for seed in range(1, n + 1)]


def seed_of(player):
    return player - 100


def play_all(matches, seeds, pick=min):
    """Gioca il torneo in ordine: vince ``pick`` tra i due (min = la testa di serie migliore)."""
    played = []
    following = ready_matches(matches)
    while following is not None:
        played.append(following['key'])
        following = apply_winner(matches, following['key'], pick(following['player_a'], following['player_b']),
                                 seeds)
    return played


class OptionsTest(unittest.TestCase):
    def test_formati(self):
        self.assertEqual(FORMATS, ('single', 'double', 'round_robin', 'swiss', 'two_stage'))
        self.assertEqual(READY, ('single', 'double', 'round_robin'))
        self.assertEqual(STARTABLE, ('single', 'double', 'round_robin'))
        with self.assertRaises(TournamentError):
            default_options('ffa')

    def test_opzioni_eliminazione(self):
        self.assertEqual(default_options('single'), {'semiSeries': None})
        self.assertEqual(check_options('single', {}), {'semiSeries': None})
        self.assertEqual(check_options('single', None), {'semiSeries': None})
        for value in (1, 3, 5, None):
            self.assertEqual(check_options('single', {'semiSeries': value}), {'semiSeries': value})
        for options in ({'semiSeries': 2}, {'semiSeries': True}, {'semiSeries': '3'}, {'legs': 2}, [1]):
            with self.assertRaises(TournamentError):
                check_options('single', options)

    def test_opzioni_doppia(self):
        defaults = {'grandFinal': 'reset', 'grandSeries': None}
        self.assertEqual(default_options('double'), defaults)
        self.assertEqual(check_options('double', None), defaults)
        for grand in ('reset', 'single', 'none'):
            for series in (None, 1, 3, 5):
                options = {'grandFinal': grand, 'grandSeries': series}
                self.assertEqual(check_options('double', options), options)
        for options in ({'grandFinal': 'twice'}, {'grandSeries': 2}, {'grandSeries': True}, {'semiSeries': 3},
                        {'thirdPlace': True}):
            with self.assertRaises(TournamentError):
                check_options('double', options)

    def test_opzioni_degli_altri_formati(self):
        for fmt in ('swiss', 'two_stage'):
            self.assertEqual(default_options(fmt), {})
            self.assertEqual(check_options(fmt, {}), {})
            with self.assertRaises(TournamentError):
                check_options(fmt, {'semiSeries': 3})

    def test_cambio_di_formato(self):
        self.assertEqual(merge_options('single', {'semiSeries': 5}, 'double'),
                         {'grandFinal': 'reset', 'grandSeries': None})
        self.assertEqual(merge_options('double', {'grandFinal': 'none'}, 'single'), {'semiSeries': None})
        self.assertEqual(merge_options('double', {'grandFinal': 'single', 'grandSeries': 5}, 'double'),
                         {'grandFinal': 'single', 'grandSeries': 5})
        self.assertEqual(merge_options('single', {'semiSeries': 5}, 'single'), {'semiSeries': 5})
        self.assertEqual(merge_options('single', {'semiSeries': 7}, 'single'), {'semiSeries': None})


class BracketTest(unittest.TestCase):
    def test_posizioni(self):
        self.assertEqual(seed_positions(2), [1, 2])
        self.assertEqual(seed_positions(4), [1, 4, 3, 2])
        self.assertEqual(seed_positions(16), [1, 16, 9, 8, 5, 12, 13, 4, 3, 14, 11, 6, 7, 10, 15, 2])
        for size in (2, 4, 8, 16, 32, 64):
            order = seed_positions(size)
            self.assertEqual(sorted(order), list(range(1, size + 1)))
            # Ogni coppia somma size + 1: le migliori contro le peggiori.
            self.assertTrue(all(order[i] + order[i + 1] == size + 1 for i in range(0, size, 2)))
            # 1 e 2 in metà opposte.
            self.assertTrue(order.index(1) < size // 2 <= order.index(2))
        self.assertEqual([bracket_size(n) for n in (2, 3, 4, 5, 9, 33, 64)], [2, 4, 4, 8, 16, 64, 64])

    def test_numero_di_incontri(self):
        for n in SIZES:
            for third in (False, True):
                matches = build_single(players(n), 1, None, 3, third)
                played = [match for match in matches if not match['bye']]
                expected = n - 1 + (1 if third and n >= 4 else 0)
                self.assertEqual(len(played), expected, (n, third))
                self.assertEqual(match_count('single', n, {}, third), expected)
        self.assertEqual(match_count('single', 5, {}, False), 4)
        self.assertEqual(match_count('single', 5, {}, True), 5)
        self.assertEqual(match_count('round_robin', 5, {}, True), 10)
        self.assertEqual(match_count('round_robin', 5, {'legs': 'double'}, False), 20)
        self.assertIsNone(match_count('swiss', 5, {}, False))

    def test_bye_alle_teste_di_serie_migliori(self):
        for n in SIZES:
            matches = build_single(players(n), 1, None, 3, True)
            byes = [match for match in matches if match['bye']]
            self.assertEqual(len(byes), bracket_size(n) - n)
            self.assertEqual(sorted(seed_of(match['player_a']) for match in byes),
                             list(range(1, len(byes) + 1)))
            for match in byes:
                self.assertEqual((match['status'], match['winner_id'], match['play_order'], match['round']),
                                 ('done', match['player_a'], 0, 1))
                self.assertIsNone(match['player_b'])
            # Il vincitore del bye è già nel turno dopo.
            second = [match for match in matches if match['round'] == 2 and match['bracket'] == 'main']
            waiting = {player for match in second for player in (match['player_a'], match['player_b'])}
            self.assertTrue({match['player_a'] for match in byes} <= waiting)

    def test_testa_di_serie_migliore_in_a(self):
        for n in SIZES:
            matches = build_single(players(n), 1, None, 3, True)
            seeds = players(n)
            while True:
                for match in matches:
                    if match['player_a'] is not None and match['player_b'] is not None:
                        self.assertLess(match['player_a'], match['player_b'])
                following = ready_matches(matches)
                if following is None:
                    break
                # Vince sempre il peggiore: le sorprese restano ordinate.
                apply_winner(matches, following['key'], max(following['player_a'], following['player_b']), seeds)

    def test_uno_e_due_solo_in_finale(self):
        for n in SIZES:
            matches = build_single(players(n), 1, None, 3, True)
            play_all(matches, players(n))
            meetings = [match for match in matches if {match['player_a'], match['player_b']} == {101, 102}]
            self.assertEqual(len(meetings), 1)
            self.assertEqual(meetings[0]['bracket'], 'main')
            self.assertEqual(meetings[0]['round'], max(match['round'] for match in matches))

    def test_ordine_di_gioco(self):
        for n in SIZES:
            matches = build_single(players(n), 1, None, 3, True)
            numbers = sorted(match['play_order'] for match in matches if not match['bye'])
            self.assertEqual(numbers, list(range(1, len(numbers) + 1)))
            ordered = sorted((match for match in matches if not match['bye']), key=lambda item: item['play_order'])
            # Turno per turno, ordine del tabellone dentro il turno.
            keys = [(match['round'], match['bracket'] != 'third', match['slot']) for match in ordered]
            self.assertEqual(keys, sorted(keys))
            played = play_all(matches, players(n))
            self.assertEqual(played, [match['key'] for match in ordered])
            if n >= 4:
                self.assertEqual(played[-2:], ['third', played[-1]])
                self.assertEqual(ordered[-1]['bracket'], 'main')

    def test_tre_iscritti(self):
        matches = build_single(players(3), 1, None, 3, True)
        self.assertFalse([match for match in matches if match['bracket'] == 'third'])
        final = [match for match in matches if match['round'] == 2][0]
        self.assertEqual(final['player_a'], 101)
        semi = ready_matches(matches)
        self.assertEqual((semi['player_a'], semi['player_b'], semi['play_order']), (102, 103, 1))
        self.assertEqual(final['play_order'], 2)

    def test_serie(self):
        matches = build_single(players(16), 1, 3, 5, True)
        series = {(match['round'], match['bracket']): match['series'] for match in matches}
        self.assertEqual(series, {(1, 'main'): 1, (2, 'main'): 1, (3, 'main'): 3, (4, 'main'): 5, (4, 'third'): 3})
        matches = build_single(players(5), 3, None, 5, True)
        series = {(match['round'], match['bracket']): match['series'] for match in matches}
        self.assertEqual(series, {(1, 'main'): 3, (2, 'main'): 3, (3, 'main'): 5, (3, 'third'): 3})

    def test_propagazione_e_annullamento(self):
        seeds = players(5)
        matches = build_single(seeds, 1, None, 3, True)
        first = ready_matches(matches)
        self.assertEqual((first['player_a'], first['player_b']), (104, 105))
        following = apply_winner(matches, first['key'], 105, seeds)
        semi = [match for match in matches if match['from_a'] == 'winner:' + first['key']
                or match['from_b'] == 'winner:' + first['key']][0]
        self.assertEqual((semi['player_a'], semi['player_b'], semi['status']), (101, 105, 'ready'))
        self.assertEqual(following['key'], semi['key'])
        with self.assertRaises(TournamentError):
            apply_winner(matches, first['key'], 105, seeds)
        with self.assertRaises(TournamentError):
            apply_winner(matches, semi['key'], 103, seeds)
        # Annullato: il vincitore esce dalla semifinale e l'incontro torna il prossimo.
        following = revert_winner(matches, first['key'])
        self.assertEqual(following['key'], first['key'])
        self.assertEqual((semi['player_b'], semi['status']), (None, 'waiting'))
        self.assertEqual((first['winner_id'], first['status']), (None, 'ready'))
        # Con la semifinale iniziata non si annulla più.
        apply_winner(matches, first['key'], 104, seeds)
        semi['status'] = 'playing'
        with self.assertRaises(TournamentError):
            revert_winner(matches, first['key'])
        with self.assertRaises(TournamentError):
            revert_winner(matches, [match for match in matches if match['bye']][0]['key'])

    def test_annullamento_della_semifinale_toglie_anche_il_perdente(self):
        seeds = players(4)
        matches = build_single(seeds, 1, None, 3, True)
        semi = ready_matches(matches)
        apply_winner(matches, semi['key'], 104, seeds)
        third = [match for match in matches if match['bracket'] == 'third'][0]
        self.assertEqual(third['player_a'], 101)
        revert_winner(matches, semi['key'])
        self.assertIsNone(third['player_a'])
        self.assertIsNone(third['player_b'])

    def test_tavolino_automatico_contro_un_ritirato(self):
        # 5 iscritti: 101, 102, 103 col bye; 101 aspetta il vincitore di 104-105.
        seeds = players(5)
        matches = build_single(seeds, 1, None, 1, False)
        first = ready_matches(matches)
        withdrawn = {101}
        apply_winner(matches, first['key'], 105, seeds, withdrawn)
        semi = [match for match in matches if 'winner:' + first['key'] in (match['from_a'], match['from_b'])][0]
        self.assertEqual((semi['status'], semi['winner_id'], semi['walkover']), ('done', 105, 1))
        # Il vincitore a tavolino è già in finale.
        final = [match for match in matches if 'winner:' + semi['key'] in (match['from_a'], match['from_b'])][0]
        self.assertIn(105, (final['player_a'], final['player_b']))
        self.assertEqual(undo_state(matches, semi['key'], withdrawn), ('withdrawal', None))
        # Annullando il primo incontro si riapre anche il tavolino automatico.
        self.assertIsNone(undo_problem(matches, first['key'], withdrawn))
        self.assertEqual(undo_state(matches, first['key'], withdrawn, 1), ('result', None))
        revert_winner(matches, first['key'], withdrawn)
        self.assertEqual((semi['status'], semi['winner_id'], semi['walkover'], semi['player_b']),
                         ('waiting', None, 0, None))
        self.assertNotIn(105, (final['player_a'], final['player_b']))
        self.assertEqual(first['status'], 'ready')

    def test_tavolino_a_mano_e_annulla_bloccato(self):
        seeds = players(4)
        matches = build_single(seeds, 1, None, 1, False)
        semi = ready_matches(matches)
        apply_winner(matches, semi['key'], 104, seeds, walkover=True)
        self.assertEqual((semi['walkover'], semi['winner_id']), (1, 104))
        self.assertEqual(undo_state(matches, semi['key']), ('walkover', None))
        final = [match for match in matches if match['round'] == 2][0]
        final['status'] = 'playing'
        self.assertEqual(undo_state(matches, semi['key']), ('walkover', 'L\'incontro successivo è già iniziato.'))
        # Incontro in attesa con un ritirato: si annulla il ritiro; con partite, l'ultima partita.
        other = [match for match in matches if match['round'] == 1 and match is not semi][0]
        self.assertEqual(undo_state(matches, other['key'], {other['player_a']}), ('withdrawal', None))
        self.assertEqual(undo_state(matches, other['key'], (), 2), ('game', None))
        self.assertEqual(undo_state(matches, other['key']), (None, None))

    def test_posizioni_scelte_a_mano(self):
        seeds = players(4)
        matches = layout_from_slots([101, 102, 103, 104], 1, None, 3, False, seeds)
        first = ready_matches(matches)
        self.assertEqual((first['player_a'], first['player_b']), (101, 102))
        with self.assertRaises(TournamentError):
            layout_from_slots([101, 102, 103], 1, None, 3, False)
        with self.assertRaises(TournamentError):
            layout_from_slots([101, 102, None, None], 1, None, 3, False)
        with self.assertRaises(TournamentError):
            layout_from_slots([101, 101, 102, 103], 1, None, 3, False)


GRAND_FINALS = ('reset', 'single', 'none')


def double(n, grand='reset', seeds=None):
    seeds = seeds or players(n)
    return layout_double(first_round_slots(seeds), 1, 3, grand, None, seeds)


def by_key(matches):
    return {match['key']: match for match in matches}


def real_sources(matches, source):
    """Incontri giocati da cui arriva ``source`` (attraverso i bye nascosti)."""
    if source is None:
        return []
    match = by_key(matches)[source.split(':', 1)[1]]
    if not match['bye']:
        return [match]
    return [item for side in ('a', 'b') for item in real_sources(matches, match['from_' + side])]


class DoubleTest(unittest.TestCase):
    def test_numero_di_incontri(self):
        for n in range(3, 34):
            for grand in GRAND_FINALS:
                matches = double(n, grand)
                played = [match for match in matches if not match['bye']]
                count = match_count('double', n, {'grandFinal': grand})
                self.assertEqual(len(played), count['max'], (n, grand))
                least = 2 * n - 3 if grand == 'none' else 2 * n - 2
                self.assertEqual(count, {'min': least, 'max': least + (grand == 'reset')}, (n, grand))
                numbers = sorted(match['play_order'] for match in played)
                self.assertEqual(numbers, list(range(1, len(played) + 1)))
                self.assertTrue(all(match['play_order'] == 0 for match in matches if match['bye']))
        self.assertEqual(match_count('double', 10, {}), {'min': 18, 'max': 19})
        self.assertEqual(match_count('double', 10, {'grandFinal': 'single'}), {'min': 18, 'max': 18})
        self.assertEqual(match_count('double', 10, {'grandFinal': 'none'}), {'min': 17, 'max': 17})

    def test_nessuno_dipende_da_un_incontro_dopo(self):
        for n in range(3, 34):
            matches = double(n)
            for match in matches:
                if match['bye']:
                    continue
                for side in ('a', 'b'):
                    for source in real_sources(matches, match['from_' + side]):
                        self.assertLess(source['play_order'], match['play_order'], (n, match['key']))

    def test_ordine_alterno_per_colonne(self):
        for n in (5, 8, 10, 16, 33):
            matches = [match for match in double(n) if not match['bye']]
            ordered = sorted(matches, key=lambda item: item['play_order'])
            columns = []
            for match in ordered:
                column = (match['bracket'], match['round'])
                if not columns or columns[-1] != column:
                    columns.append(column)
            total = max(match['round'] for match in matches if match['bracket'] == 'winners')
            expected = []
            for round_no in range(1, total + 1):
                expected += [('winners', round_no), ('losers', round_no)]
            expected += [('losers', column) for column in range(total + 1, 2 * total - 1)]
            expected += [('grand', 1), ('grand', 2)]
            shown = [column for column in expected if column in columns]
            self.assertEqual(columns, shown, n)
            # Dentro la colonna l'ordine del tabellone.
            for column in columns:
                slots = [match['slot'] for match in ordered if (match['bracket'], match['round']) == column]
                self.assertEqual(slots, sorted(slots))

    def test_tre_iscritti(self):
        matches = double(3)
        played = sorted((match for match in matches if not match['bye']), key=lambda item: item['play_order'])
        keys = by_key(matches)
        self.assertEqual([(match['bracket'], match['round']) for match in played],
                         [('winners', 1), ('winners', 2), ('losers', 2), ('grand', 1), ('grand', 2)])
        self.assertEqual((played[0]['player_a'], played[0]['player_b']), (102, 103))
        self.assertEqual(played[1]['player_a'], 101)
        self.assertEqual(played[1]['from_b'], 'winner:' + played[0]['key'])
        # 2-3, poi il 1° contro il vincitore; il perdente di 2-3 aspetta il perdente di quell'incontro.
        apply_winner(matches, played[0]['key'], 103, players(3))
        hidden = keys['lr1s0']
        self.assertEqual((hidden['bye'], hidden['status'], hidden['winner_id']), (1, 'done', 102))
        following = apply_winner(matches, played[1]['key'], 103, players(3))
        self.assertEqual(following['key'], played[2]['key'])
        self.assertEqual({following['player_a'], following['player_b']}, {101, 102})
        following = apply_winner(matches, following['key'], 102, players(3))
        self.assertEqual((following['bracket'], following['player_a'], following['player_b']), ('grand', 103, 102))

    def test_incroci_di_challonge(self):
        self.assertEqual(standard_crossings(8), {1: ['wr1s0', 'wr1s1', 'wr1s2', 'wr1s3'],
                                                 2: ['wr2s1', 'wr2s0'], 4: ['wr3s0']})
        self.assertEqual(standard_crossings(16), {1: ['wr1s%d' % slot for slot in range(8)],
                                                  2: ['wr2s3', 'wr2s2', 'wr2s1', 'wr2s0'],
                                                  4: ['wr3s1', 'wr3s0'], 6: ['wr4s0']})
        self.assertEqual(standard_crossings(32)[4], ['wr3s2', 'wr3s3', 'wr3s0', 'wr3s1'])
        keys = by_key(double(8))
        self.assertEqual((keys['lr1s0']['from_a'], keys['lr1s0']['from_b']), ('loser:wr1s0', 'loser:wr1s1'))
        self.assertEqual((keys['lr2s0']['from_a'], keys['lr2s0']['from_b']), ('winner:lr1s0', 'loser:wr2s1'))
        self.assertEqual((keys['lr2s1']['from_a'], keys['lr2s1']['from_b']), ('winner:lr1s1', 'loser:wr2s0'))
        self.assertEqual((keys['lr3s0']['from_a'], keys['lr3s0']['from_b']), ('winner:lr2s0', 'winner:lr2s1'))
        self.assertEqual((keys['lr4s0']['from_a'], keys['lr4s0']['from_b']), ('winner:lr3s0', 'loser:wr3s0'))
        self.assertEqual((keys['g1']['from_a'], keys['g1']['from_b']), ('winner:wr3s0', 'winner:lr4s0'))
        self.assertEqual((keys['g2']['from_a'], keys['g2']['from_b']), ('loser:g1', 'winner:g1'))
        # Incroci dati a mano.
        crossings = standard_crossings(8)
        crossings[2] = ['wr2s0', 'wr2s1']
        keys = by_key(layout_double(first_round_slots(players(8)), 1, 3, seeds=players(8), crossings=crossings))
        self.assertEqual(keys['lr2s0']['from_b'], 'loser:wr2s0')

    def test_incroci_ritoccati(self):
        standard = standard_crossings(8)
        swapped = {**standard, 2: ['wr2s0', 'wr2s1']}
        self.assertEqual(check_crossings({str(key): value for key, value in swapped.items()}, 8), swapped)
        wrong = ({**standard, 2: ['wr2s0', 'wr3s0']},             # chiave di un'altra colonna
                 {**standard, 2: ['wr2s0', 'wr9s9']},             # chiave estranea
                 {**standard, 2: ['wr2s0', 'wr2s0']},             # doppione
                 {**standard, 2: ['wr2s0']},                      # ingresso mancante
                 {1: standard[1], 2: standard[2]},                       # colonna mancante
                 {**standard, 3: []}, dict(standard, x=[]), 'incroci', None)
        for crossings in wrong:
            with self.assertRaises(TournamentError):
                check_crossings(crossings, 8)
        with self.assertRaises(TournamentError):
            layout_double(first_round_slots(players(8)), 1, 1, 'reset', None, players(8), wrong[0])
        keys = by_key(layout_double(first_round_slots(players(8)), 1, 1, 'reset', None, players(8), swapped))
        self.assertEqual(keys['lr2s0']['from_b'], 'loser:wr2s0')
        self.assertEqual(keys['lr2s1']['from_b'], 'loser:wr2s1')

    def test_incroci_ritoccati_ricalcolano_i_bye_nascosti(self):
        for n, column, first, second in ((5, 1, 1, 2), (10, 2, 0, 3)):
            seeds = players(n)
            slots = first_round_slots(seeds)
            crossings = standard_crossings(len(slots))
            crossings[column][first], crossings[column][second] = crossings[column][second], crossings[column][first]
            before = layout_double(slots, 1, 3, 'reset', None, seeds)
            after = layout_double(slots, 1, 3, 'reset', None, seeds, crossings)
            self.assertEqual(len([match for match in after if not match['bye']]),
                             len([match for match in before if not match['bye']]))
            self.assertEqual(sorted(match['play_order'] for match in after if match['play_order']),
                             sorted(match['play_order'] for match in before if match['play_order']))
            for match in after:
                if match['bracket'] != 'losers':
                    continue
                sources = [source for source in (match['from_a'], match['from_b']) if source]
                self.assertEqual(bool(match['bye']), len(sources) < 2, match['key'])
                self.assertEqual(match['status'] == 'done', not sources, match['key'])
        keys = by_key(layout_double(first_round_slots(players(5)), 1, 3, 'reset', None, players(5),
                                    {1: ['wr1s0', 'wr1s2', 'wr1s1', 'wr1s3'], 2: ['wr2s1', 'wr2s0'], 4: ['wr3s0']}))
        self.assertEqual((keys['lr1s0']['status'], keys['lr1s1']['from_a']), ('done', 'loser:wr1s1'))
        self.assertEqual((keys['lr2s0']['bye'], keys['lr2s1']['bye']), (1, 0))

    def test_bye_nascosti(self):
        matches = double(5)
        keys = by_key(matches)
        # Seeds 1, 2, 3 col bye: nei perdenti un incontro vuoto e due con un solo slot.
        self.assertEqual((keys['lr1s1']['bye'], keys['lr1s1']['status'], keys['lr1s1']['winner_id']), (1, 'done', None))
        self.assertEqual((keys['lr1s0']['bye'], keys['lr1s0']['status'], keys['lr1s0']['from_b']), (1, 'waiting', None))
        self.assertEqual((keys['lr2s1']['bye'], keys['lr2s1']['from_a'], keys['lr2s1']['from_b']),
                         (1, 'loser:wr2s0', None))
        first = ready_matches(matches)
        apply_winner(matches, first['key'], 104, players(5))
        self.assertEqual((keys['lr1s0']['status'], keys['lr1s0']['winner_id']), ('done', 105))
        self.assertEqual(keys['lr2s0']['player_a'], 105)
        # Annullando, il bye nascosto si riapre.
        self.assertIsNone(undo_problem(matches, first['key']))
        revert_winner(matches, first['key'])
        self.assertEqual((keys['lr1s0']['status'], keys['lr1s0']['player_a'], keys['lr2s0']['player_a']),
                         ('waiting', None, None))
        # Con l'incontro dei perdenti iniziato non si annulla più.
        apply_winner(matches, first['key'], 104, players(5))
        keys['lr2s0']['status'] = 'playing'
        self.assertIsNotNone(undo_problem(matches, first['key']))

    def test_tutti_possono_arrivare_alla_finale_dei_perdenti(self):
        for n in (3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 16, 17):
            for player in players(n):
                matches = double(n, 'none')
                lost = set()
                following = ready_matches(matches)
                while following is not None:
                    pair = (following['player_a'], following['player_b'])
                    if player in pair:
                        # Perde il primo incontro dei vincenti, poi vince sempre.
                        other = pair[1] if pair[0] == player else pair[0]
                        winner = other if following['bracket'] == 'winners' and player not in lost else player
                        if winner != player:
                            lost.add(player)
                    else:
                        winner = min(pair)
                    final = following
                    following = apply_winner(matches, following['key'], winner, players(n))
                self.assertEqual(final['bracket'], 'losers')
                self.assertIn(player, (final['player_a'], final['player_b']), (n, player))

    def test_chi_perde_nei_vincenti_scende_nello_slot_giusto(self):
        for n in (3, 5, 8, 10, 16):
            matches = double(n)
            keys = by_key(matches)
            following = ready_matches(matches)
            while following is not None:
                winner = max(following['player_a'], following['player_b'])
                loser = min(following['player_a'], following['player_b'])
                key = following['key']
                following = apply_winner(matches, key, winner, players(n))
                for match in matches:
                    for side in ('a', 'b'):
                        if match['from_' + side] == 'loser:' + key and match['status'] != 'skipped':
                            # Anche nei bye nascosti, che passano subito: lì è il vincitore.
                            self.assertIn(loser, (match['player_a'], match['player_b'], match['winner_id']))
            self.assertTrue(all(match['status'] in ('done', 'skipped') for match in keys.values()))
            self.assertTrue(all_closed(matches))

    def test_gran_finale(self):
        seeds = players(8)
        matches = double(8)
        keys = by_key(matches)
        self.assertEqual(keys['g1']['series'], 3)
        following = ready_matches(matches)
        while following['bracket'] != 'grand':
            # Vince sempre il peggiore: dai vincenti arriva 108, dai perdenti chi è rimasto.
            following = apply_winner(matches, following['key'], max(following['player_a'], following['player_b']),
                                     seeds)
        self.assertEqual(following['key'], 'g1')
        self.assertEqual(following['player_a'], 108)
        self.assertLess(following['player_b'], 108)
        with_series = layout_double(first_round_slots(seeds), 1, 3, 'single', 5, seeds)
        grand = [match for match in with_series if match['bracket'] == 'grand']
        self.assertEqual([(match['round'], match['series']) for match in grand], [(1, 5)])
        self.assertFalse([match for match in double(8, 'none') if match['bracket'] == 'grand'])
        series = {(match['bracket'], match['round']): match['series'] for match in double(8)}
        self.assertEqual(series[('winners', 2)], 1)
        self.assertEqual(series[('winners', 3)], 3)
        self.assertEqual(series[('losers', 3)], 1)
        self.assertEqual(series[('losers', 4)], 3)
        with self.assertRaises(TournamentError):
            layout_double(first_round_slots(seeds), 1, 3, 'twice', None, seeds)


def play_double(matches, seeds, grand_winner):
    """Gioca la doppia: vince sempre la testa di serie migliore, in gran finale ``grand_winner`` (``a`` o ``b``)."""
    following = ready_matches(matches)
    while following is not None:
        if following['bracket'] == 'grand':
            winner = following['player_' + grand_winner]
        else:
            winner = min(following['player_a'], following['player_b'])
        following = apply_winner(matches, following['key'], winner, seeds)
    return matches


class ResetTest(unittest.TestCase):
    def test_vince_chi_arriva_dai_vincenti(self):
        seeds = players(8)
        matches = double(8)
        keys = by_key(matches)
        following = ready_matches(matches)
        while following['key'] != 'g1':
            following = apply_winner(matches, following['key'], min(following['player_a'], following['player_b']),
                                     seeds)
        self.assertEqual(played_count(matches), {'min': 14, 'max': 15})
        self.assertIsNone(apply_winner(matches, 'g1', 101, seeds))
        self.assertEqual((keys['g2']['status'], keys['g2']['player_a'], keys['g2']['player_b'], keys['g2']['winner_id']),
                         ('skipped', None, None, None))
        self.assertTrue(all_closed(matches))
        self.assertEqual(played_count(matches), 14)
        # Annullando la gran finale la rivincita torna da decidere.
        self.assertIsNone(undo_problem(matches, 'g1'))
        following = revert_winner(matches, 'g1')
        self.assertEqual(following['key'], 'g1')
        self.assertEqual(keys['g2']['status'], 'waiting')
        self.assertFalse(all_closed(matches))
        with self.assertRaises(TournamentError):
            apply_winner(matches, 'g2', 101, seeds)

    def test_vince_chi_arriva_dai_perdenti(self):
        seeds = players(8)
        matches = double(8)
        keys = by_key(matches)
        following = ready_matches(matches)
        while following['key'] != 'g1':
            following = apply_winner(matches, following['key'], min(following['player_a'], following['player_b']),
                                     seeds)
        self.assertEqual((following['player_a'], following['player_b']), (101, 102))
        following = apply_winner(matches, 'g1', 102, seeds)
        # Stessi due giocatori, chi arrivava dai vincenti resta in player_a (lato svantaggiato).
        self.assertEqual((following['key'], following['status'], following['player_a'], following['player_b']),
                         ('g2', 'ready', 101, 102))
        self.assertEqual(played_count(matches), 15)
        self.assertEqual(game_sides(1, 'alternate', 'p1'), 'p2')
        apply_winner(matches, 'g2', 102, seeds)
        self.assertTrue(all_closed(matches))
        self.assertEqual(placements_double(matches)[102], 1)
        self.assertEqual(placements_double(matches)[101], 2)
        # Con la rivincita iniziata la gran finale non si annulla.
        revert_winner(matches, 'g2')
        keys['g2']['status'] = 'playing'
        self.assertIsNotNone(undo_problem(matches, 'g1'))

    def test_skipped_mai_prossimo(self):
        seeds = players(4)
        matches = play_double(double(4), seeds, 'a')
        self.assertIsNone(ready_matches(matches))
        self.assertEqual(by_key(matches)['g2']['status'], 'skipped')


class DoublePlacementsTest(unittest.TestCase):
    def test_sedici_iscritti(self):
        seeds = players(16)
        for grand, grand_winner in (('reset', 'a'), ('reset', 'b'), ('single', 'b'), ('none', None)):
            matches = play_double(double(16, grand), seeds, grand_winner or 'a')
            self.assertTrue(all_closed(matches), grand)
            places = placements('double', matches)
            self.assertEqual(len(places), 16)
            counts = {}
            for place in places.values():
                counts[place] = counts.get(place, 0) + 1
            self.assertEqual(counts, {1: 1, 2: 1, 3: 1, 4: 1, 5: 2, 7: 2, 9: 4, 13: 4}, grand)
            if grand == 'none' or grand_winner == 'a':
                self.assertEqual((places[101], places[102]), (1, 2))
            else:
                self.assertEqual((places[102], places[101]), (1, 2))
            self.assertEqual(places[103], 3)

    def test_senza_gran_finale(self):
        seeds = players(5)
        matches = play_double(double(5, 'none'), seeds, 'a')
        keys = by_key(matches)
        places = placements_double(matches)
        winners_final = max((match for match in matches if match['bracket'] == 'winners'), key=lambda m: m['round'])
        losers = [match for match in matches if match['bracket'] == 'losers']
        losers_final = max(losers, key=lambda m: m['round'])
        self.assertEqual(places[winners_final['winner_id']], 1)
        self.assertEqual(places[losers_final['winner_id']], 2)
        self.assertEqual(places[losers_final['player_a'] if losers_final['winner_id'] == losers_final['player_b']
                                else losers_final['player_b']], 3)
        self.assertNotIn('g1', keys)
        self.assertEqual(sorted(places.values()), [1, 2, 3, 4, 5])

    def test_pochi_iscritti(self):
        for n, expected in ((3, [1, 2, 3]), (5, [1, 2, 3, 4, 5]), (8, [1, 2, 3, 4, 5, 5, 7, 7])):
            for grand_winner in ('a', 'b'):
                matches = play_double(double(n), players(n), grand_winner)
                self.assertEqual(sorted(placements_double(matches).values()), expected, (n, grand_winner))

    def test_tutti_piazzati_fino_a_33(self):
        for n in range(3, 34):
            matches = play_double(double(n), players(n), 'b')
            places = placements_double(matches)
            self.assertEqual(len(places), n, n)
            self.assertEqual(sorted(places.values())[:3], [1, 2, 3])
            # Posto = 1 + giocatori piazzati sopra.
            for place in set(places.values()):
                self.assertEqual(place, 1 + sum(1 for other in places.values() if other < place), n)

    def test_ritirato_nei_perdenti(self):
        seeds = players(8)
        matches = double(8)
        keys = by_key(matches)
        # 108 perde il primo turno dei vincenti, poi si ritira: perde a tavolino nella 1ª colonna dei perdenti.
        following = ready_matches(matches)
        withdrawn = set()
        while following is not None:
            pair = (following['player_a'], following['player_b'])
            if following['bracket'] == 'losers' and 108 in pair:
                withdrawn.add(108)
                ready_matches(matches, withdrawn, None)
                following = ready_matches(matches, withdrawn)
                continue
            following = apply_winner(matches, following['key'], min(pair), seeds, withdrawn)
        lost = next(match for match in matches if match['bracket'] == 'losers' and 108 in
                    (match['player_a'], match['player_b']))
        self.assertTrue(lost['walkover'])
        self.assertEqual(placements_double(matches)[108], 7)
        self.assertEqual(keys['g2']['status'], 'skipped')


def to_grand(matches, seeds, withdrawn=None):
    """Gioca fino alla gran finale vincendo sempre la testa di serie migliore; restituisce la gran finale."""
    following = ready_matches(matches, withdrawn)
    while following is not None and following['key'] != 'g1':
        following = apply_winner(matches, following['key'], min(following['player_a'], following['player_b']),
                                 seeds, withdrawn)
    return following


class DoubleUndoWithdrawTest(unittest.TestCase):
    def test_codice_del_perdenti_iniziato(self):
        seeds = players(8)
        matches = double(8)
        keys = by_key(matches)
        first, second = keys['wr1s0'], keys['wr1s1']
        apply_winner(matches, 'wr1s0', min(first['player_a'], first['player_b']), seeds)
        apply_winner(matches, 'wr1s1', min(second['player_a'], second['player_b']), seeds)
        target = next(match for match in matches if match['bracket'] == 'losers' and match['status'] == 'ready')
        self.assertEqual(match_code(matches, target), 'P1-1')
        target['status'] = 'playing'
        self.assertEqual(undo_problem(matches, 'wr1s0'), 'P1-1 è già iniziato.')
        self.assertEqual(undo_state(matches, 'wr1s0', (), 1), ('result', 'P1-1 è già iniziato.'))
        target['status'] = 'ready'
        revert_winner(matches, 'wr1s0')
        self.assertEqual((target['status'], keys['wr2s0']['status']), ('waiting', 'waiting'))
        self.assertNotIn(None, (keys['wr1s0']['player_a'], keys['wr1s0']['player_b']))

    def test_annulla_gran_finale_con_rivincita_pronta_o_iniziata(self):
        seeds = players(8)
        matches = double(8)
        keys = by_key(matches)
        grand = to_grand(matches, seeds)
        apply_winner(matches, 'g1', grand['player_b'], seeds)
        self.assertEqual(keys['g2']['status'], 'ready')
        keys['g2']['status'] = 'playing'
        self.assertEqual(undo_problem(matches, 'g1'), 'GF2 è già iniziato.')
        keys['g2']['status'] = 'ready'
        revert_winner(matches, 'g1')
        self.assertEqual((keys['g2']['status'], keys['g2']['player_a'], keys['g2']['player_b']),
                         ('waiting', None, None))

    def test_ritiro_nei_vincenti_con_avversario_noto(self):
        seeds = players(8)
        matches = double(8)
        keys = by_key(matches)
        first = keys['wr1s0']
        quitter = max(first['player_a'], first['player_b'])
        withdrawn = {quitter}
        apply_winner(matches, 'wr1s0', min(first['player_a'], first['player_b']), seeds, withdrawn, True)
        apply_winner(matches, 'wr1s1', min(keys['wr1s1']['player_a'], keys['wr1s1']['player_b']), seeds, withdrawn)
        lost = [match for match in matches if match['bracket'] == 'losers' and quitter in
                (match['player_a'], match['player_b'])]
        self.assertEqual(len(lost), 1)
        self.assertEqual((lost[0]['status'], bool(lost[0]['walkover'])), ('done', True))
        self.assertNotEqual(lost[0]['winner_id'], quitter)
        # Annullando il risultato dei vincenti si riapre anche il tavolino dei perdenti.
        self.assertIsNone(undo_problem(matches, 'wr1s0', withdrawn))
        revert_winner(matches, 'wr1s0', withdrawn)
        self.assertEqual(lost[0]['status'], 'waiting')

    def test_ritiro_in_gran_finale(self):
        for side in ('a', 'b'):
            seeds = players(8)
            matches = double(8)
            keys = by_key(matches)
            grand = to_grand(matches, seeds)
            quitter = grand['player_' + side]
            withdrawn = {quitter}
            following = ready_matches(matches, withdrawn, seed_rank(seeds))
            self.assertIsNone(following, side)
            self.assertTrue(all_closed(matches), side)
            places = placements_double(matches)
            self.assertEqual(places[quitter], 2, side)
            self.assertEqual(keys['g2']['status'], 'skipped' if side == 'b' else 'done', side)

    def test_ritiro_in_rivincita(self):
        seeds = players(4)
        matches = double(4)
        keys = by_key(matches)
        grand = to_grand(matches, seeds)
        apply_winner(matches, 'g1', grand['player_b'], seeds)
        quitter = keys['g2']['player_b']
        self.assertIsNone(ready_matches(matches, {quitter}, seed_rank(seeds)))
        self.assertTrue(all_closed(matches))
        self.assertEqual(placements_double(matches)[quitter], 2)


class SidesTest(unittest.TestCase):
    def test_alternati(self):
        self.assertEqual([game_sides(game, 'alternate', 'none') for game in (1, 2, 3)], ['p1', 'p2', 'p1'])
        self.assertEqual([game_sides(game, 'alternate', 'p1') for game in (1, 2, 3)], ['p2', 'p1', 'p2'])
        self.assertEqual([game_sides(game, 'alternate', 'p2') for game in (1, 2, 3)], ['p1', 'p2', 'p1'])

    def test_sorteggiati_e_liberi(self):
        rng = random.Random(1)
        drawn = {game_sides(game, 'random', 'p1', rng) for game in range(1, 30)}
        self.assertEqual(drawn, {'p1', 'p2'})
        self.assertIsNone(game_sides(1, 'free', 'p1'))
        with self.assertRaises(TournamentError):
            game_sides(1, 'other')


class PlacementsTest(unittest.TestCase):
    def test_con_il_terzo_posto(self):
        seeds = players(8)
        matches = build_single(seeds, 1, None, 3, True)
        play_all(matches, seeds)
        places = placements_single(matches)
        self.assertEqual(places, {101: 1, 102: 2, 103: 3, 104: 4, 105: 5, 106: 5, 107: 5, 108: 5})

    def test_senza_terzo_posto(self):
        seeds = players(16)
        matches = build_single(seeds, 1, None, 3, False)
        play_all(matches, seeds)
        places = placements_single(matches)
        self.assertEqual(places[101], 1)
        self.assertEqual(places[102], 2)
        self.assertEqual((places[103], places[104]), (3, 3))
        self.assertEqual(sorted(places[player] for player in seeds[4:8]), [5] * 4)
        self.assertEqual(sorted(places[player] for player in seeds[8:]), [9] * 8)

    def test_con_i_bye_e_il_terzo_posto_vinto_dal_peggiore(self):
        seeds = players(5)
        matches = build_single(seeds, 1, None, 3, True)
        play_all(matches, seeds, pick=max)
        places = placements_single(matches)
        # Vince sempre il peggiore: 4-5 → 5; semifinali 1-5 → 5, 2-3 → 3; 3° posto 1-2 → 2; finale 3-5 → 5.
        self.assertEqual(places, {105: 1, 103: 2, 102: 3, 101: 4, 104: 5})
        self.assertEqual(len(placements_single(build_single(players(33), 1, None, 3, False))), 0)

    def test_trentatre_iscritti(self):
        seeds = players(33)
        matches = build_single(seeds, 1, None, 3, False)
        play_all(matches, seeds)
        places = placements_single(matches)
        self.assertEqual(len(places), 33)
        self.assertEqual(places[133], 33)
        self.assertEqual(places[117], 17)


class SeedOrderTest(unittest.TestCase):
    PLAYERS = [{'account': 1, 'xp': 100, 'seconds': 0}, {'account': 2, 'xp': 400, 'seconds': 60},
               {'account': 3, 'xp': 0, 'seconds': 600}, {'account': 4, 'xp': 0, 'seconds': 0},
               {'account': 5, 'xp': 0, 'seconds': 0}]

    def accounts(self, method, weight=50, seed=1):
        return [item['account'] for item in seed_order(self.PLAYERS, method, weight, random.Random(seed))]

    def test_a_caso(self):
        result = seed_order(self.PLAYERS, 'random', 50, random.Random(3))
        self.assertEqual(sorted(item['account'] for item in result), [1, 2, 3, 4, 5])
        self.assertTrue(all(item['value'] is None for item in result))
        orders = {tuple(self.accounts('random', seed=seed)) for seed in range(20)}
        self.assertGreater(len(orders), 1)

    def test_per_xp_e_per_tempo(self):
        result = seed_order(self.PLAYERS, 'xp', 50, random.Random(1))
        self.assertEqual([item['account'] for item in result[:2]], [2, 1])
        self.assertEqual([item['value'] for item in result], [400, 100, 0, 0, 0])
        self.assertEqual(sorted(self.accounts('xp')[2:]), [3, 4, 5])
        self.assertEqual(self.accounts('time')[:2], [3, 2])

    def test_pareggi_a_caso(self):
        tails = {tuple(self.accounts('xp', seed=seed)[2:]) for seed in range(30)}
        self.assertGreater(len(tails), 1)

    def test_misto(self):
        # 50/50: 2 = 0.5 + 0.05, 3 = 0.5, 1 = 0.125.
        result = seed_order(self.PLAYERS, 'mix', 50, random.Random(1))
        self.assertEqual([item['account'] for item in result[:3]], [2, 3, 1])
        self.assertEqual([item['value'] for item in result[:3]], [55.0, 50.0, 12.5])
        self.assertEqual(self.accounts('mix', 100)[:2], [2, 1])
        self.assertEqual(self.accounts('mix', 0)[:2], [3, 2])
        # Tutti a zero: nessuna divisione per zero.
        zero = [{'account': n, 'xp': 0, 'seconds': 0} for n in (1, 2, 3)]
        self.assertEqual([item['value'] for item in seed_order(zero, 'mix', 50, random.Random(1))], [0, 0, 0])

    def test_metodo_sconosciuto(self):
        with self.assertRaises(TournamentError):
            seed_order(self.PLAYERS, 'elo', 50)

    def test_caselle_del_primo_turno(self):
        self.assertEqual(first_round_slots([11, 12, 13, 14, 15]), [11, None, 15, 14, 13, None, None, 12])
        self.assertEqual(first_round_slots([11, 12, 13]), [11, None, 13, 12])


if __name__ == '__main__':
    unittest.main()


RR_DEFAULTS = {'legs': 'single', 'draws': False, 'points': [3, 1, 0], 'score': False, 'walkoverScore': [1, 0]}


class RoundRobinOptionsTest(unittest.TestCase):
    def test_predefiniti(self):
        self.assertEqual(default_options('round_robin'), RR_DEFAULTS)
        self.assertEqual(check_options('round_robin', None), RR_DEFAULTS)
        # Le liste non sono condivise con i predefiniti.
        default_options('round_robin')['points'][0] = 9
        self.assertEqual(default_options('round_robin')['points'], [3, 1, 0])

    def test_valori(self):
        good = {'legs': 'double', 'draws': True, 'points': [2, 1, 1], 'score': True, 'walkoverScore': [3, 0]}
        self.assertEqual(check_options('round_robin', good), good)
        for options in ({'legs': 2}, {'draws': 1}, {'score': 'sì'}, {'points': [1, 1, 0]}, {'points': [3, 0, 1]},
                        {'points': [3, 1]}, {'points': [11, 1, 0]}, {'points': [3, True, 0]},
                        {'walkoverScore': [0, 0]}, {'walkoverScore': [1, 2]}, {'walkoverScore': [100, 0]},
                        {'semiSeries': 3}):
            with self.assertRaises(TournamentError, msg=options):
                check_options('round_robin', options)

    def test_cambio_di_formato(self):
        self.assertEqual(merge_options('single', {'semiSeries': 5}, 'round_robin'), RR_DEFAULTS)
        options = merge_options('round_robin', {'draws': True, 'points': [2, 1, 0]}, 'round_robin')
        self.assertEqual((options['draws'], options['points']), (True, [2, 1, 0]))
        self.assertEqual(merge_options('round_robin', {'draws': True}, 'single'), {'semiSeries': None})

    def test_serie(self):
        self.assertEqual(series_choices('round_robin', {'draws': False}), (1, 3, 5))
        self.assertEqual(series_choices('round_robin', {'draws': True}), (1, 2, 3))
        self.assertEqual(series_choices('single', {'draws': True}), (1, 3, 5))
        self.assertEqual([fit_series(value, (1, 2, 3)) for value in (1, 3, 5)], [1, 3, 3])
        self.assertEqual([fit_series(value, (1, 3, 5)) for value in (1, 2, 3)], [1, 3, 3])


def pairs_of(matches):
    return [frozenset((match['player_a'], match['player_b'])) for match in matches]


class RoundRobinLayoutTest(unittest.TestCase):
    def test_ognuno_incontra_tutti_una_volta(self):
        for n in range(3, 21):
            seeds = players(n)
            matches = layout_round_robin(seeds, 1)
            self.assertEqual(len(matches), n * (n - 1) // 2, n)
            self.assertEqual(len(matches), match_count('round_robin', n))
            self.assertEqual(set(pairs_of(matches)),
                             {frozenset((a, b)) for a in seeds for b in seeds if a < b}, n)
            self.assertEqual(len(set(pairs_of(matches))), len(matches), n)

    def test_giornate_e_riposi(self):
        for n in range(3, 21):
            matches = layout_round_robin(players(n), 1)
            rounds = sorted({match['round'] for match in matches})
            self.assertEqual(rounds, list(range(1, league_rounds(n) + 1)), n)
            rested = []
            for round_no in rounds:
                inside = [match for match in matches if match['round'] == round_no]
                busy = [player for match in inside for player in (match['player_a'], match['player_b'])]
                # Nessuno gioca due volte nella stessa giornata.
                self.assertEqual(len(busy), len(set(busy)), (n, round_no))
                self.assertEqual(len(inside), n // 2, (n, round_no))
                rested.extend(set(players(n)) - set(busy))
            # Con un numero dispari ognuno riposa una sola volta; con un numero pari nessuno.
            self.assertEqual(sorted(rested), players(n) if n % 2 else [], n)

    def test_ordine_di_gioco_e_campi(self):
        matches = layout_round_robin(players(6), 3)
        self.assertEqual([match['play_order'] for match in matches], list(range(1, 16)))
        self.assertEqual([match['round'] for match in matches], sorted(match['round'] for match in matches))
        for match in matches:
            self.assertEqual((match['bracket'], match['status'], match['series'], match['bye']),
                             ('league', 'ready', 3, 0))
            self.assertLess(seed_of(match['player_a']), seed_of(match['player_b']))
            self.assertEqual(match['key'], 'rr%ds%d' % (match['round'], match['slot']))
        self.assertEqual(ready_matches(matches)['key'], matches[0]['key'])

    def test_niente_incontri_di_fila(self):
        # Con 3 o 4 iscritti non si può (ogni giornata ha tutti, o quasi, in campo); con 5 e il ritorno ne resta uno.
        def back_to_back(matches):
            return sum(1 for before, after in zip(matches, matches[1:])
                       if {before['player_a'], before['player_b']} & {after['player_a'], after['player_b']})

        for n in range(5, 33):
            self.assertEqual(back_to_back(layout_round_robin(players(n), 1)), 0, n)
            self.assertEqual(back_to_back(layout_round_robin(players(n), 1, 'double')), 1 if n == 5 else 0, n)

    def test_posizioni_e_teste_di_serie(self):
        seeds = players(6)
        ring = [106, 102, 103, 104, 105, 101]
        matches = layout_round_robin(ring, 1, 'single', seeds)
        self.assertEqual(set(pairs_of(matches)), {frozenset((a, b)) for a in seeds for b in seeds if a < b})
        for match in matches:
            self.assertLess(seed_of(match['player_a']), seed_of(match['player_b']))
        self.assertNotEqual(pairs_of(matches), pairs_of(layout_round_robin(seeds, 1)))

    def test_teste_di_serie_non_sempre_prime(self):
        matches = layout_round_robin(players(8), 1)
        first = [match for match in matches if match['slot'] == 1]
        self.assertLess(sum(1 for match in first if 101 in (match['player_a'], match['player_b'])), len(first))

    def test_andata_e_ritorno(self):
        for n in (3, 4, 5, 8):
            matches = layout_round_robin(players(n), 1, 'double')
            legs = league_rounds(n)
            self.assertEqual(len(matches), n * (n - 1))
            self.assertEqual(league_rounds(n, 'double'), 2 * legs)
            first = [match for match in matches if match['round'] <= legs]
            back = [match for match in matches if match['round'] > legs]
            self.assertEqual(sorted(pairs_of(first), key=sorted), sorted(pairs_of(back), key=sorted))
            # Al ritorno la testa di serie peggiore è player_a: i lati si invertono.
            for match in back:
                self.assertGreater(seed_of(match['player_a']), seed_of(match['player_b']))


def finish(matches, key, winner, walkover=False):
    for match in matches:
        if match['key'] == key:
            match.update(status='done', winner_id=winner, walkover=1 if walkover else 0)
            return match


def league(n, series=1):
    return {match['key']: match for match in layout_round_robin(players(n), series)}


def between(matches, a, b):
    return next(match for match in matches.values() if {match['player_a'], match['player_b']} == {a, b})


class RoundRobinStandingsTest(unittest.TestCase):
    def setUp(self):
        self.matches = league(4)
        self.games = {}

    def play(self, a, b, winner, games=None, walkover=False):
        match = between(self.matches, a, b)
        match.update(status='done', winner_id=winner, walkover=1 if walkover else 0)
        if games is not None:
            self.games[match['key']] = games

    def table(self, options=None, withdrawn=None):
        return league_standings(players(4), list(self.matches.values()), self.games, options, withdrawn)

    def test_iniziale(self):
        table = self.table()
        self.assertEqual([row['id'] for row in table], players(4))
        self.assertTrue(all(row['rank'] == 1 and row['tied'] and row['played'] == 0 for row in table))

    def test_vittorie_e_differenza_partite(self):
        self.play(101, 102, 102, [{'winnerId': 102}])
        self.play(103, 104, 103, [{'winnerId': 103}])
        self.play(101, 103, 101, [{'winnerId': 101}])
        self.play(102, 104, 102, [{'winnerId': 102}])
        table = self.table()
        self.assertEqual([row['id'] for row in table][:1], [102])
        top = table[0]
        self.assertEqual((top['played'], top['won'], top['lost'], top['gamesFor'], top['points'], top['rank'],
                          top['tied']), (2, 2, 0, 2, 6, 1, False))
        # 101 e 103: una vittoria a testa; lo scontro diretto lo ha vinto 101.
        self.assertEqual([(row['id'], row['rank']) for row in table[1:3]], [(101, 2), (103, 3)])
        self.assertEqual(table[3]['id'], 104)

    def test_senza_pareggi_contano_le_vittorie(self):
        # Con la sconfitta che vale 1 punto, chi ha giocato di più non scavalca chi ha vinto di più.
        self.play(101, 102, 101, [{'winnerId': 101}])
        self.play(103, 104, 104, [{'winnerId': 104}])
        self.play(103, 102, 102, [{'winnerId': 102}])
        options = dict(RR_DEFAULTS, points=[3, 1, 1])
        table = self.table(options)
        # 101 ha battuto 102; tra 102 e 104 (nessuno scontro diretto) decide la differenza partite.
        self.assertEqual([row['id'] for row in table if row['won'] == 1], [101, 104, 102])
        self.assertEqual(table[-1]['id'], 103)

    def test_pareggi_e_punti(self):
        options = dict(RR_DEFAULTS, draws=True)
        self.play(101, 102, None, [{'winnerId': 101}, {'winnerId': 102}])
        self.play(103, 104, 104, [{'winnerId': 104}, {'winnerId': None}])
        table = {row['id']: row for row in self.table(options)}
        self.assertEqual((table[101]['drawn'], table[101]['points']), (1, 1))
        self.assertEqual((table[104]['won'], table[104]['points'], table[104]['gamesFor']), (1, 3, 1))
        self.assertEqual((table[103]['lost'], table[103]['points']), (1, 0))
        self.assertEqual(self.table(options)[0]['id'], 104)

    def test_punteggio(self):
        options = dict(RR_DEFAULTS, score=True)
        self.play(101, 102, 101, [{'winnerId': 101, 'scoreA': 3, 'scoreB': 0}])
        self.play(103, 104, 103, [{'winnerId': 103, 'scoreA': 1, 'scoreB': 0}])
        table = self.table(options)
        # Stesse vittorie, nessuno scontro diretto: decide la differenza punteggio.
        self.assertEqual([row['id'] for row in table[:2]], [101, 103])
        self.assertEqual((table[0]['scoreFor'], table[0]['scoreAgainst']), (3, 0))
        self.assertFalse(table[0]['tied'])

    def test_pari_dopo_tutti_i_criteri(self):
        self.play(101, 102, 101, [{'winnerId': 101}])
        self.play(103, 104, 103, [{'winnerId': 103}])
        table = self.table()
        self.assertEqual([(row['id'], row['rank'], row['tied']) for row in table],
                         [(101, 1, True), (103, 1, True), (102, 3, True), (104, 3, True)])

    def test_tavolino(self):
        options = dict(RR_DEFAULTS, score=True, walkoverScore=[2, 0])
        self.matches = league(4, 3)
        self.play(101, 102, 102, walkover=True)
        table = {row['id']: row for row in self.table(options, withdrawn={101})}
        self.assertEqual((table[102]['won'], table[102]['gamesFor'], table[102]['scoreFor']), (1, 2, 2))
        self.assertEqual((table[101]['lost'], table[101]['gamesAgainst'], table[101]['scoreAgainst']), (1, 2, 2))
        self.assertTrue(table[101]['withdrawn'])
        self.assertFalse(table[102]['withdrawn'])
        # Con i pareggi la serie fissa da 2 vale 2–0.
        self.matches = league(4, 2)
        self.play(101, 102, 102, walkover=True)
        table = {row['id']: row for row in self.table(dict(RR_DEFAULTS, draws=True))}
        self.assertEqual((table[102]['gamesFor'], table[101]['gamesAgainst']), (2, 2))


class GameResultTest(unittest.TestCase):
    def test_regole(self):
        self.assertEqual(game_rules('single', 'main', {}), {'draws': False, 'score': False, 'fixed': False})
        self.assertEqual(game_rules('round_robin', 'league', {}), {'draws': False, 'score': False, 'fixed': False})
        self.assertEqual(game_rules('round_robin', 'league', {'draws': True, 'score': True}),
                         {'draws': True, 'score': True, 'fixed': True})

    def test_controllo(self):
        rules = {'draws': True, 'score': True, 'fixed': True}
        self.assertEqual(check_game_result(rules, 1, 2, 2, score=[0, 3]), (2, 0, 3))
        self.assertEqual(check_game_result(rules, 1, 2, None, draw=True, score=[1, 1]), ('draw', 1, 1))
        self.assertEqual(check_game_result(rules, 1, 2, None), ('replay', None, None))
        self.assertEqual(check_game_result({'draws': False, 'score': False, 'fixed': False}, 1, 2, 1), (1, None, None))
        for winner, draw, score in ((3, False, [1, 0]), (True, False, [1, 0]), (1, False, [0, 0]), (2, False, [2, 1]),
                                    (None, True, [2, 1]), (1, False, None), (1, False, [1, -1]), (1, False, [1]),
                                    (1, False, [True, 0]), (None, False, [1, 0]), (1, True, [1, 1])):
            with self.assertRaises(TournamentError):
                check_game_result(rules, 1, 2, winner, draw, score)
        with self.assertRaises(TournamentError):
            check_game_result({'draws': False, 'score': False, 'fixed': False}, 1, 2, None, draw=True)

    def test_serie(self):
        self.assertEqual(series_result(3, False, 1, 2, [1, 2]), (False, None))
        self.assertEqual(series_result(3, False, 1, 2, [1, 2, 2]), (True, 2))
        self.assertEqual(series_result(2, True, 1, 2, [1]), (False, None))
        self.assertEqual(series_result(2, True, 1, 2, [1, 2]), (True, None))
        self.assertEqual(series_result(3, True, 1, 2, [None, 1, None]), (True, 1))
        self.assertEqual(series_result(1, True, 1, 2, [None]), (True, None))

    def test_incontro_pari(self):
        matches = layout_round_robin(players(3), 1)
        key = matches[0]['key']
        apply_winner(matches, key, None, draw=True)
        match = next(item for item in matches if item['key'] == key)
        self.assertEqual((match['status'], match['winner_id']), ('done', None))
        self.assertEqual(undo_state(matches, key)[0], 'result')
        revert_winner(matches, key)
        self.assertEqual(match['status'], 'ready')
        single = build_single(players(4), 1, None, 1, False)
        with self.assertRaises(TournamentError):
            apply_winner(single, single[0]['key'], None, draw=True)


class PlayoffTest(unittest.TestCase):
    """Spareggi e piazzamenti del girone (logica pura)."""

    def row(self, player, rank, withdrawn=False):
        return {'id': player, 'rank': rank, 'withdrawn': withdrawn}

    def test_gruppi_pari_sul_podio(self):
        from pixelarcade.tournament_formats import podium_ties
        # Il ritirato pari al 1° non conta: resta un solo attivo, niente spareggio per il 1° posto.
        standings = [self.row(1, 1), self.row(9, 1, True), self.row(2, 3), self.row(3, 3), self.row(4, 5),
                     self.row(5, 5)]
        self.assertEqual(podium_ties(standings), [{'players': [2, 3], 'place': 2}])
        # Tre pari al 3° posto: tutti e tre nello spareggio; pari dal 4° in giù restano pari.
        standings = [self.row(1, 1), self.row(2, 2), self.row(3, 3), self.row(4, 3), self.row(5, 3),
                     self.row(6, 6), self.row(7, 6)]
        self.assertEqual(podium_ties(standings), [{'players': [3, 4, 5], 'place': 3}])

    def test_serie_e_incontri_dello_spareggio(self):
        from pixelarcade.tournament_formats import game_rules, layout_playoff, playoff_mini, playoff_series
        self.assertEqual([playoff_series(n, True) for n in (1, 2, 3)], [1, 3, 3])
        self.assertEqual([playoff_series(n, False) for n in (1, 3, 5)], [1, 3, 5])
        matches = layout_playoff([{'players': [4, 2], 'place': 1}, {'players': [7, 5, 6], 'place': 3}], 2, True,
                                 [2, 4, 5, 6, 7], start=10)
        self.assertEqual([(m['group_no'], m['round'], m['series'], m['play_order']) for m in matches],
                         [(1, 1, 3, 11), (2, 1, 2, 12), (2, 2, 2, 13), (2, 3, 2, 14)])
        self.assertEqual((matches[0]['player_a'], matches[0]['player_b']), (2, 4))
        self.assertEqual({frozenset((m['player_a'], m['player_b'])) for m in matches[1:]},
                         {frozenset((5, 6)), frozenset((5, 7)), frozenset((6, 7))})
        self.assertTrue(all(m['bracket'] == 'playoff' and m['status'] == 'ready' for m in matches))
        self.assertFalse(playoff_mini(matches, matches[0]))
        self.assertTrue(playoff_mini(matches, matches[1]))
        self.assertEqual(game_rules('round_robin', 'playoff', {'draws': True}, mini=False),
                         {'draws': False, 'score': False, 'fixed': False})
        self.assertEqual(game_rules('round_robin', 'playoff', {'draws': True, 'score': True}, mini=True),
                         {'draws': True, 'score': True, 'fixed': True})

    def test_piazzamenti_col_ritirato(self):
        from pixelarcade.tournament_formats import placements_league
        standings = [self.row(1, 1, True), self.row(2, 2), self.row(3, 3), self.row(4, 4), self.row(5, 4),
                     self.row(6, 6, True)]
        # Il ritirato primo in classifica non va sul podio: scala chi sta sotto; i pari restano a pari merito.
        self.assertEqual(placements_league(standings), {2: 1, 3: 2, 4: 3, 5: 3, 1: 5, 6: 6})

    def test_annulla_bloccato_dallo_spareggio(self):
        from pixelarcade.tournament_formats import layout_playoff, layout_round_robin, undo_state
        league = layout_round_robin([1, 2, 3], 1)
        for match in league:
            match.update(status='done', winner_id=match['player_a'])
        playoff = layout_playoff([{'players': [1, 2], 'place': 1}], 1, False, [1, 2, 3], start=3)
        matches = league + playoff
        self.assertEqual(undo_state(matches, league[0]['key']), ('result', None))
        playoff[0]['status'] = 'playing'
        self.assertEqual(undo_state(matches, league[0]['key']), ('result', 'Prima va annullato lo spareggio.'))
        playoff[0].update(status='done', winner_id=1)
        self.assertEqual(undo_state(matches, playoff[0]['key']), ('result', None))
