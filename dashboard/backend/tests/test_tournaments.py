import os
import tempfile
import unittest

from pixelarcade.db import Database
from tests.fakes import fake_png
from pixelarcade.errors import TournamentError, TournamentLockedError
from pixelarcade.profiles import ProfileService
from pixelarcade.repositories.profiles import ProfilesRepository
from pixelarcade.repositories.saves import SavesRepository
from pixelarcade.repositories.sessions import SessionsRepository
from pixelarcade.repositories.tournaments import TournamentsRepository
from pixelarcade.saves import SaveStore
from pixelarcade.tournaments import (TournamentService, combo_matches, default_title, hash_combo,
                                     parse_start)

NOW = '2026-11-01T18:00:00+00:00'
PNG = fake_png()
GAME = {'system': 'md', 'id': 'Street Fighter II.md'}
OTHER = {'system': 'snes', 'id': 'Bomberman.sfc'}
COMBO = ['up', 'up', 'down', 'a']


class FakeLibrary:
    games = {('md', 'Street Fighter II.md'): {'id': 'Street Fighter II.md', 'title': 'Street Fighter II'},
             ('snes', 'Bomberman.sfc'): {'id': 'Bomberman.sfc', 'title': 'Bomberman'}}

    def find(self, system_id, game_id):
        return self.games.get((system_id, game_id))


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as stream:
        stream.write(data)


class FunctionsTest(unittest.TestCase):
    def test_combinazione(self):
        stored = hash_combo(COMBO, iterations=10)
        self.assertTrue(stored.startswith('pbkdf2$10$'))
        self.assertNotIn('up', stored)
        self.assertTrue(combo_matches(stored, COMBO))
        self.assertFalse(combo_matches(stored, ['up', 'up', 'down']))
        self.assertFalse(combo_matches(stored, None))
        self.assertFalse(combo_matches(stored, []))
        # Nessuna combinazione: sempre libera.
        self.assertEqual(hash_combo([]), '')
        self.assertTrue(combo_matches('', None))

    def test_data(self):
        self.assertEqual(parse_start('2026-11-01T20:30:45.120Z', NOW), '2026-11-01T20:30:00+00:00')
        self.assertEqual(parse_start('2026-11-01T21:30:00+01:00', NOW), '2026-11-01T20:30:00+00:00')
        self.assertIsNone(parse_start(None, NOW))
        self.assertIsNone(parse_start('', NOW))
        for value in ('2026-11-01T17:00:00Z', NOW, 'domani', '2026-11-01T20:30:00', 5):
            with self.assertRaises(TournamentError):
                parse_start(value, NOW)

    def test_classifiche(self):
        from pixelarcade.series_rankings import rankings

        def player(pid, place):
            return {'id': pid, 'name': 'P%d' % pid, 'color': None, 'place': place}

        def match(a, b, winner, walkover=0):
            return {'playerA': a, 'playerB': b, 'winnerId': winner, 'status': 'done', 'bye': 0, 'walkover': walkover}
        result = rankings([
            {'players': [player(1, 1), player(2, 2), player(3, 5), player(4, None)],
             'matches': [match(1, 2, 1), match(1, 3, None), match(2, 4, 2, walkover=1)]},
            {'players': [player(2, 1), player(1, 3)], 'matches': [match(2, 1, 2)]},
        ])
        self.assertEqual([(row['id'], row['position']) for row in result['medals']], [(2, 1), (1, 2), (3, 3), (4, 4)])
        self.assertEqual([(row['id'], row['points']) for row in result['points']], [(2, 17), (1, 15), (3, 2), (4, 1)])
        self.assertEqual([(row['id'], row['wins'], row['pct']) for row in result['matches']],
                         [(1, 1.5, 50), (2, 1, 50), (3, 0.5, 50), (4, 0, 0)])

    def test_titolo_predefinito(self):
        import datetime
        self.assertEqual(default_title(datetime.date(2026, 11, 1)), 'Torneo di novembre')


class ServiceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        self.data = os.path.join(self.tmp.name, 'data')
        library = FakeLibrary()
        profiles = ProfileService(ProfilesRepository(self.db), SessionsRepository(self.db), library, lambda: NOW)
        self.ada = profiles.create('ada', '#ff5d73')['id']
        self.bea = profiles.create('bea', '#3ccfc4')['id']
        self.saves = SaveStore(self.data, SavesRepository(self.db), lambda: NOW)
        self.service = TournamentService(TournamentsRepository(self.db), profiles, self.saves, library, self.data,
                                         lambda: NOW)
        self.session = os.path.join(self.tmp.name, 'sessione')

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def session_files(self, state=b'stato', png=True, sram=b'sram'):
        """Cartella di sessione con lo stato automatico, la miniatura e il salvataggio interno."""
        path = os.path.join(self.session, 'gioco.state.auto')
        write(path, state)
        if png:
            write(path + '.png', PNG)
        if sram is not None:
            write(os.path.join(self.session, 'gioco.srm'), sram)
        return path

    def tdir(self, name):
        return os.path.join(self.data, 'saves', 'tournaments', name)

    def created(self, account=None):
        return self.service.create(account or self.ada)['tournament']

    def update(self, item, changes, combo=None, account=None):
        return self.service.update(item['id'], account or self.ada, combo, changes)['tournament']

    def test_bozza_con_valori_predefiniti(self):
        item = self.created()
        self.assertEqual(item['status'], 'draft')
        self.assertEqual(item['title'], '')
        self.assertTrue(item['series']['name'].startswith('Torneo di '))
        self.assertEqual(item['edition'], 1)
        self.assertEqual(item['fullTitle'], item['series']['name'] + ' · 1ª edizione')
        self.assertEqual(item['creator']['name'], 'ADA')
        self.assertIsNone(item['maxPlayers'])
        self.assertEqual((item['roundSeries'], item['finalSeries']), (1, 3))
        self.assertTrue(item['thirdPlace'] and item['savesLocked'] and item['rewards'])
        self.assertEqual(item['sides'], 'alternate')
        self.assertFalse(item['combo'])
        self.assertNotIn('comboHash', item)
        self.assertIsNone(item['gameInfo'])
        overview = self.service.overview()
        self.assertEqual([entry['id'] for entry in overview['tournaments']], [item['id']])
        self.assertEqual(overview['rewardXp'], [100, 50, 25])

    def test_piu_tornei(self):
        first = self.created()
        second = self.created(self.bea)
        third = self.created()
        self.update(first, {'game': GAME})
        self.service.publish(first['id'], self.ada, None)
        self.update(third, {'game': OTHER})
        self.service.publish(third['id'], self.ada, None)
        overview = self.service.overview()
        self.assertEqual([(entry['id'], entry['status']) for entry in overview['tournaments']],
                         [(third['id'], 'open'), (second['id'], 'draft'), (first['id'], 'open')])
        # Ogni operazione vale solo per il suo torneo.
        self.assertEqual(self.update(second, {'title': 'Di Bea'}, account=self.bea)['title'], 'Di Bea')
        with self.assertRaises(TournamentLockedError):
            self.update(second, {'title': 'Mio'})
        self.service.cancel(first['id'], self.ada, None)
        with self.assertRaises(TournamentError):
            self.update(first, {'title': 'Annullato'})
        with self.assertRaises(TournamentError):
            self.service.update(999, self.ada, None, {'title': 'Nessuno'})
        self.assertEqual(len(self.service.overview()['tournaments']), 2)

    def test_campi(self):
        item = self.created()
        item = self.update(item, {
            'title': '  Notte   dei picchiaduro ', 'description': 'Start alle 21:30', 'game': GAME,
            'startsAt': '2026-11-01T20:30:00Z', 'maxPlayers': 8, 'roundSeries': 3, 'finalSeries': 5,
            'thirdPlace': False, 'savesLocked': False, 'sides': 'random', 'rewards': False})
        self.assertEqual(item['title'], 'Notte dei picchiaduro')
        self.assertEqual(item['startsAt'], '2026-11-01T20:30:00+00:00')
        self.assertEqual(item['gameInfo']['title'], 'Street Fighter II')
        self.assertEqual((item['maxPlayers'], item['roundSeries'], item['finalSeries']), (8, 3, 5))
        self.assertFalse(item['thirdPlace'] or item['savesLocked'] or item['rewards'])
        item = self.update(item, {'maxPlayers': None, 'startsAt': None})
        self.assertIsNone(item['maxPlayers'])
        self.assertIsNone(item['startsAt'])
        for changes in ({'name': ''}, {'title': 'x' * 41}, {'description': 'x' * 301}, {'maxPlayers': 2},
                        {'maxPlayers': True}, {'roundSeries': 2}, {'sides': 'left'}, {'rewards': 1},
                        {'game': {'system': 'md', 'id': 'nessuno.md'}}, {'other': 1}, {}, {'clearState': False}):
            with self.assertRaises(TournamentError, msg=changes):
                self.update(item, changes)

    def test_solo_il_creatore(self):
        item = self.created()
        with self.assertRaises(TournamentLockedError) as caught:
            self.update(item, {'title': 'Mio'}, account=self.bea)
        self.assertEqual(caught.exception.data, {'locked': True})
        with self.assertRaises(TournamentLockedError):
            self.service.delete(item['id'], self.bea)

    def test_combinazione(self):
        item = self.created()
        self.assertTrue(self.update(item, {'newCombo': COMBO})['combo'])
        # Con la combinazione serve anche quella, oltre al profilo del creatore.
        with self.assertRaises(TournamentLockedError):
            self.update(item, {'title': 'Altro'})
        with self.assertRaises(TournamentLockedError):
            self.update(item, {'title': 'Altro'}, ['up'])
        with self.assertRaises(TournamentLockedError):
            self.service.unlock(item['id'], self.bea, COMBO)
        self.assertEqual(self.service.unlock(item['id'], self.ada, COMBO), {'ok': True})
        self.update(item, {'title': 'Altro'}, COMBO)
        with self.assertRaises(TournamentError):
            self.update(item, {'newCombo': ['start']}, COMBO)
        # Combinazione tolta: di nuovo solo il profilo.
        self.assertFalse(self.update(item, {'newCombo': []}, COMBO)['combo'])
        self.update(item, {'title': 'Libero'})

    def test_partenze_della_registrazione(self):
        item = self.created()
        with self.assertRaises(TournamentError):
            self.service.record(item['id'], self.ada, None, [self.ada, None], {'kind': 'zero'})
        self.update(item, {'game': GAME})
        # La registra solo il creatore, come P1.
        with self.assertRaises(TournamentError):
            self.service.record(item['id'], self.ada, None, [self.bea, self.ada], {'kind': 'zero'})
        with self.assertRaises(TournamentLockedError):
            self.service.record(item['id'], self.bea, None, [self.bea, None], {'kind': 'zero'})
        for source in (None, {'kind': 'altro'}, {'kind': 'slot'}, {'kind': 'slot', 'slot': 3}):
            with self.assertRaises(TournamentError, msg=source):
                self.service.record(item['id'], self.ada, None, [self.ada, None], source)
        base = {'id': item['id'], 'system': 'md', 'game': 'Street Fighter II.md'}
        self.assertEqual(self.service.record(item['id'], self.ada, None, [self.ada, self.bea], {'kind': 'zero'}),
                         dict(base, sram='none', resume=None))
        self.assertEqual(self.service.record(item['id'], self.ada, None, [self.ada, None], {'kind': 'mine'}),
                         dict(base, sram='profile', resume=None))
        source = os.path.join(self.tmp.name, 'slot.state')
        write(source, b'tutti sbloccati')
        self.saves.store_state(self.ada, GAME['system'], GAME['id'], 3, 'genesis_plus_gx', source)
        self.assertEqual(self.service.record(item['id'], self.ada, None, [self.ada, None],
                                             {'kind': 'slot', 'slot': 3}),
                         dict(base, sram='profile', resume={'account': self.ada, 'slot': 3}))
        # Gli slot degli altri profili non contano.
        self.saves.store_state(self.bea, GAME['system'], GAME['id'], 4, 'genesis_plus_gx', source)
        with self.assertRaises(TournamentError):
            self.service.record(item['id'], self.ada, None, [self.ada, None], {'kind': 'slot', 'slot': 4})

    def test_registrazione(self):
        item = self.created()
        self.update(item, {'game': GAME})
        # Salvataggio interno di una registrazione vecchia: la nuova lo sostituisce.
        write(os.path.join(self.tdir('%d-sram' % item['id']), 'vecchio'), b'vecchio')
        state = self.session_files(b'scelta personaggi')
        result = self.service.recorded(item['id'], 'md', 'Street Fighter II.md', 'genesis_plus_gx', state,
                                       self.session, 'gioco')
        self.assertEqual(result, {'recorded': True})
        item = self.service.overview()['tournaments'][0]
        self.assertTrue(item['hasState'] and item['thumb'])
        self.assertEqual(item['core'], 'genesis_plus_gx')
        with open(self.tdir('%d.state' % item['id']), 'rb') as stream:
            self.assertEqual(stream.read(), b'scelta personaggi')
        self.assertIsNotNone(self.service.thumb(item['id']))
        self.assertEqual(os.listdir(self.tdir('%d-sram' % item['id'])), ['srm'])
        # Cambiando gioco si tolgono stato e salvataggio interno.
        item = self.update(item, {'game': OTHER})
        self.assertFalse(item['hasState'])
        self.assertIsNone(item['core'])
        self.assertFalse(os.path.exists(self.tdir('%d.state' % item['id'])))
        self.assertFalse(os.path.exists(self.tdir('%d-sram' % item['id'])))
        self.assertIsNone(self.service.thumb(item['id']))

    def test_registrazione_senza_stato(self):
        item = self.created()
        self.update(item, {'game': GAME})
        self.session_files()
        # Core che non salva gli stati: il salvataggio interno resta, lo stato no.
        result = self.service.recorded(item['id'], 'md', 'Street Fighter II.md', 'mame2000', None, self.session,
                                       'gioco')
        self.assertEqual(result, {'recorded': False})
        self.assertFalse(self.service.overview()['tournaments'][0]['hasState'])
        self.assertTrue(os.path.isdir(self.tdir('%d-sram' % item['id'])))
        # Torneo che nel frattempo ha cambiato gioco: niente.
        state = self.session_files()
        self.assertEqual(self.service.recorded(item['id'], 'snes', 'Bomberman.sfc', 'snes9x', state, self.session,
                                               'gioco'), {'recorded': False})
        self.assertFalse(self.service.overview()['tournaments'][0]['hasState'])

    def test_togli_stato(self):
        item = self.created()
        self.update(item, {'game': GAME})
        self.service.recorded(item['id'], 'md', 'Street Fighter II.md', 'genesis_plus_gx', self.session_files(),
                              self.session, 'gioco')
        self.assertFalse(self.update(item, {'clearState': True})['hasState'])
        self.assertFalse(os.path.exists(self.tdir('%d.state' % item['id'])))

    def test_serie_ed_edizioni(self):
        first = self.created()
        self.update(first, {'name': 'GameNight', 'title': 'Japan', 'game': GAME, 'newCombo': COMBO})
        self.service.recorded(first['id'], 'md', 'Street Fighter II.md', 'genesis_plus_gx', self.session_files(),
                              self.session, 'gioco')
        series = first['series']['id']
        with self.assertRaises(TournamentError):
            self.service.new_edition(series, self.ada, COMBO)
        repo = self.service.repo
        for account, place in ((self.ada, 1), (self.bea, 2)):
            repo.add_player(first['id'], account, NOW)
        repo.set_places(first['id'], {self.ada: 1, self.bea: 2})
        repo.update(first['id'], {'status': 'done', 'finishedAt': NOW}, NOW)
        with self.assertRaises(TournamentLockedError):
            self.service.new_edition(series, self.ada, None)
        second = self.service.new_edition(series, self.ada, COMBO)['tournament']
        self.assertEqual((second['edition'], second['title'], second['fullTitle']), (2, '', 'GameNight · 2ª edizione'))
        self.assertEqual((second['game'], second['players'], second['core']), (GAME['id'], [], 'genesis_plus_gx'))
        self.assertTrue(second['hasState'] and second['combo'])
        self.assertTrue(os.listdir(self.tdir('%d-sram' % second['id'])))
        # Annullata: perde il numero, che va alla successiva.
        self.service.publish(second['id'], self.ada, COMBO)
        self.service.cancel(second['id'], self.ada, COMBO)
        third = self.service.new_edition(series, self.ada, COMBO)['tournament']
        self.assertEqual(third['edition'], 2)
        detail = self.service.overview()['series'][0]
        self.assertEqual([item['edition'] for item in detail['editions']], [2, None, 1])
        self.assertFalse(detail['canAdd'])
        self.assertEqual([(row['name'], row['position'], row['points']) for row in detail['rankings']['points']],
                         [('ADA', 1, 10), ('BEA', 2, 7)])
        self.assertEqual(detail['honours'][0]['winners'][0]['name'], 'ADA')
        self.assertEqual(self.service.delete_series(series, self.ada, COMBO), {'series': None})
        self.assertEqual(self.service.overview()['series'], [])
        self.assertFalse(os.path.exists(self.tdir('%d.state' % first['id'])))

    def test_pubblica_e_annulla(self):
        item = self.created()
        self.update(item, {'newCombo': COMBO})
        with self.assertRaises(TournamentError):
            self.service.publish(item['id'], self.ada, COMBO)
        self.update(item, {'game': GAME}, COMBO)
        with self.assertRaises(TournamentLockedError):
            self.service.publish(item['id'], self.ada, None)
        item = self.service.publish(item['id'], self.ada, COMBO)['tournament']
        self.assertEqual(item['status'], 'open')
        self.assertEqual(item['publishedAt'], NOW)
        with self.assertRaises(TournamentError):
            self.service.publish(item['id'], self.ada, COMBO)
        # Con le iscrizioni aperte si cambia ancora tutto; la bozza non c'è più.
        self.update(item, {'roundSeries': 3}, COMBO)
        with self.assertRaises(TournamentError):
            self.service.delete(item['id'], self.ada)
        with self.assertRaises(TournamentLockedError):
            self.service.cancel(item['id'], self.ada, None)
        self.assertEqual(self.service.cancel(item['id'], self.ada, COMBO), {'tournament': None})
        overview = self.service.overview()
        self.assertEqual(overview['tournaments'], [])
        self.assertEqual([entry['status'] for entry in overview['history']], ['cancelled'])

    def test_pubblica_con_data_passata(self):
        item = self.created()
        self.update(item, {'game': GAME, 'startsAt': '2026-11-01T18:30:00Z'})
        self.service.now = lambda: '2026-11-01T19:00:00+00:00'
        with self.assertRaises(TournamentError):
            self.service.publish(item['id'], self.ada, None)

    def test_in_corso_solo_titolo_e_descrizione(self):
        item = self.created()
        self.service.repo.update(item['id'], {'status': 'running'}, NOW)
        self.update(item, {'title': 'Finale', 'description': 'Si gioca'})
        with self.assertRaises(TournamentError):
            self.update(item, {'roundSeries': 3})
        with self.assertRaises(TournamentError):
            self.service.record(item['id'], self.ada, None, [self.ada, None], {'kind': 'zero'})

    def test_elimina_bozza(self):
        item = self.created()
        self.update(item, {'newCombo': COMBO, 'game': GAME})
        self.service.recorded(item['id'], 'md', 'Street Fighter II.md', 'genesis_plus_gx', self.session_files(),
                              self.session, 'gioco')
        # La bozza si elimina senza combinazione.
        with self.assertRaises(TournamentError):
            self.service.cancel(item['id'], self.ada, COMBO)
        self.assertEqual(self.service.delete(item['id'], self.ada), {'tournament': None})
        self.assertFalse(os.path.exists(self.tdir('%d.state' % item['id'])))
        self.assertFalse(os.path.exists(self.tdir('%d-sram' % item['id'])))
        self.assertEqual(self.service.overview(), {'tournaments': [], 'recent': [], 'history': [], 'series': [],
                                                    'rewardXp': [100, 50, 25]})
        with self.assertRaises(TournamentError):
            self.service.delete(item['id'], self.ada)

    def published(self, changes=None, combo=None):
        item = self.created()
        self.update(item, dict({'game': GAME}, **(changes or {})))
        return self.service.publish(item['id'], self.ada, combo)['tournament']

    def names(self, item):
        return [player['name'] for player in item['players']]

    def test_iscrizione_e_ritiro(self):
        item = self.published()
        self.assertEqual(item['players'], [])
        self.assertFalse(item['registrationClosed'])
        item = self.service.join(item['id'], self.bea)['tournament']
        item = self.service.join(item['id'], self.ada)['tournament']
        self.assertEqual(self.names(item), ['BEA', 'ADA'])
        self.assertIsNone(item['players'][0]['addedBy'])
        with self.assertRaises(TournamentError):
            self.service.join(item['id'], self.bea)
        item = self.service.leave(item['id'], self.bea)['tournament']
        self.assertEqual(self.names(item), ['ADA'])
        with self.assertRaises(TournamentError):
            self.service.leave(item['id'], self.bea)
        with self.assertRaises(TournamentError):
            self.service.join(item['id'], 999)

    def test_iscrizione_solo_a_iscrizioni_aperte(self):
        draft = self.created()
        with self.assertRaises(TournamentError):
            self.service.join(draft['id'], self.bea)
        item = self.published()
        self.service.join(item['id'], self.bea)
        self.service.repo.update(item['id'], {'status': 'running'}, NOW)
        with self.assertRaises(TournamentError):
            self.service.leave(item['id'], self.bea)
        with self.assertRaises(TournamentError):
            self.service.join(item['id'], self.ada)

    def test_posti(self):
        item = self.published({'maxPlayers': 3})
        cid = self.service.profiles.create('cid', '#f5c542')['id']
        dan = self.service.profiles.create('dan', '#8fd46a')['id']
        for account in (self.ada, self.bea, cid):
            self.service.join(item['id'], account)
        with self.assertRaises(TournamentError):
            self.service.join(item['id'], dan)
        with self.assertRaises(TournamentError):
            self.service.add_player(item['id'], self.ada, None, dan)
        self.service.leave(item['id'], cid)
        self.service.join(item['id'], dan)
        item = self.update(item, {'maxPlayers': None})
        self.assertEqual(self.names(item), ['ADA', 'BEA', 'DAN'])

    def test_posti_ridotti_sotto_gli_iscritti(self):
        item = self.published()
        cid = self.service.profiles.create('cid', '#f5c542')['id']
        dan = self.service.profiles.create('dan', '#8fd46a')['id']
        for account in (self.ada, self.bea, cid, dan):
            self.service.join(item['id'], account)
        with self.assertRaises(TournamentError):
            self.update(item, {'maxPlayers': 3})
        self.assertEqual(self.update(item, {'maxPlayers': 4})['maxPlayers'], 4)

    def test_azioni_admin(self):
        item = self.published({'newCombo': COMBO}, combo=COMBO)
        with self.assertRaises(TournamentLockedError):
            self.service.add_player(item['id'], self.ada, None, self.bea)
        with self.assertRaises(TournamentLockedError):
            self.service.add_player(item['id'], self.bea, COMBO, self.bea)
        item = self.service.add_player(item['id'], self.ada, COMBO, self.bea)['tournament']
        self.assertEqual(item['players'][0]['addedBy'], self.ada)
        with self.assertRaises(TournamentError):
            self.service.add_player(item['id'], self.ada, COMBO, self.bea)
        # Iscrizioni chiuse: niente iscrizioni né ritiri da soli, l'admin iscrive e toglie.
        item = self.service.set_registration(item['id'], self.ada, COMBO, True)['tournament']
        self.assertTrue(item['registrationClosed'])
        self.assertEqual(item['status'], 'open')
        with self.assertRaises(TournamentError):
            self.service.join(item['id'], self.ada)
        with self.assertRaises(TournamentError):
            self.service.leave(item['id'], self.bea)
        item = self.service.add_player(item['id'], self.ada, COMBO, self.ada)['tournament']
        self.assertEqual(self.names(item), ['BEA', 'ADA'])
        with self.assertRaises(TournamentLockedError):
            self.service.remove_player(item['id'], self.ada, ['a'], self.bea)
        item = self.service.remove_player(item['id'], self.ada, COMBO, self.bea)['tournament']
        self.assertEqual(self.names(item), ['ADA'])
        with self.assertRaises(TournamentError):
            self.service.remove_player(item['id'], self.ada, COMBO, self.bea)
        item = self.service.set_registration(item['id'], self.ada, COMBO, False)['tournament']
        self.assertFalse(item['registrationClosed'])
        self.service.join(item['id'], self.bea)
        with self.assertRaises(TournamentError):
            self.service.set_registration(item['id'], self.ada, COMBO, 'sì')

    def test_formato_predefinito(self):
        item = self.created()
        self.assertEqual((item['format'], item['options'], item['seeding'], item['seedingWeight'],
                          item['advantagedSide']), ('single', {}, 'random', 50, 'none'))
        self.assertEqual(item['formats'][0], {'id': 'single', 'ready': True})
        self.assertEqual(item['formats'][1], {'id': 'double', 'ready': True})
        self.assertEqual([entry['id'] for entry in item['formats'] if not entry['ready']],
                         ['swiss', 'two_stage'])
        self.assertIsNone(item['startedAt'])

    def test_modifica_del_formato(self):
        item = self.created()
        item = self.update(item, {'format': 'single', 'options': {'semiSeries': 3}, 'seeding': 'mix',
                                  'seedingWeight': 60, 'advantagedSide': 'p2'})
        self.assertEqual((item['format'], item['options'], item['seeding'], item['seedingWeight'],
                          item['advantagedSide']), ('single', {'semiSeries': 3}, 'mix', 60, 'p2'))
        # Le opzioni mancanti prendono il predefinito.
        self.assertEqual(self.update(item, {'options': {}})['options'], {'semiSeries': None})
        for changes in ({'format': 'swiss'}, {'format': 'ffa'}, {'options': {'semiSeries': 2}},
                        {'options': {'legs': 2}}, {'options': 'x'}, {'seeding': 'elo'}, {'seedingWeight': 55},
                        {'seedingWeight': 110}, {'seedingWeight': True}, {'advantagedSide': 'p3'}):
            with self.assertRaises(TournamentError):
                self.update(item, changes)
        self.assertEqual(self.service.overview()['tournaments'][0]['options'], {'semiSeries': None})
        # Doppia: le serie restano, le opzioni sono le sue.
        item = self.update(item, {'roundSeries': 3, 'finalSeries': 5})
        item = self.update(item, {'format': 'double'})
        self.assertEqual((item['format'], item['options'], item['roundSeries'], item['finalSeries']),
                         ('double', {'grandFinal': 'reset', 'grandSeries': None}, 3, 5))
        item = self.update(item, {'options': {'grandFinal': 'none', 'grandSeries': 3}})
        self.assertEqual(item['options'], {'grandFinal': 'none', 'grandSeries': 3})
        for changes in ({'options': {'grandFinal': 'twice'}}, {'options': {'semiSeries': 3}}):
            with self.assertRaises(TournamentError):
                self.update(item, changes)
        item = self.update(item, {'format': 'single'})
        self.assertEqual((item['options'], item['roundSeries'], item['finalSeries']), ({'semiSeries': None}, 3, 5))

    def test_girone_e_serie(self):
        item = self.created()
        item = self.update(item, {'format': 'round_robin', 'roundSeries': 5})
        self.assertEqual((item['format'], item['options']['legs'], item['roundSeries']), ('round_robin', 'single', 5))
        # Accendendo i pareggi la serie diventa fissa: 5 passa a 3.
        item = self.update(item, {'options': dict(item['options'], draws=True)})
        self.assertEqual(item['roundSeries'], 3)
        item = self.update(item, {'roundSeries': 2})
        self.assertEqual(item['roundSeries'], 2)
        with self.assertRaises(TournamentError):
            self.update(item, {'roundSeries': 5})
        # Spegnendoli 2 diventa 3; scelta insieme, una serie fissa non va.
        item = self.update(item, {'options': dict(item['options'], draws=False)})
        self.assertEqual(item['roundSeries'], 3)
        with self.assertRaises(TournamentError):
            self.update(item, {'roundSeries': 2})
        with self.assertRaises(TournamentError):
            self.update(item, {'options': dict(item['options'], draws=True), 'roundSeries': 5})
        item = self.update(item, {'options': dict(item['options'], draws=True), 'roundSeries': 2})
        # Tornando all'eliminazione 2 non vale: diventa 3.
        item = self.update(item, {'format': 'single'})
        self.assertEqual((item['roundSeries'], item['options']), (3, {'semiSeries': None}))

    def test_formato_bloccato_a_torneo_in_corso(self):
        item = self.published()
        self.service.repo.update(item['id'], {'status': 'running'}, NOW)
        for changes in ({'format': 'single'}, {'options': {}}, {'seeding': 'xp'}, {'advantagedSide': 'p1'}):
            with self.assertRaises(TournamentError):
                self.update(item, changes)

    def test_chiusura_con_il_numero_di_incontri(self):
        item = self.published()
        accounts = [self.ada, self.bea] + [self.service.profiles.create(name, '#f5c542')['id']
                                           for name in ('cid', 'dan', 'eva')]
        for account in accounts:
            self.service.join(item['id'], account)
        result = self.service.set_registration(item['id'], self.ada, None, True)
        self.assertEqual(result['matches'], 5)
        self.service.set_registration(item['id'], self.ada, None, False)
        self.update(item, {'thirdPlace': False})
        self.assertEqual(self.service.set_registration(item['id'], self.ada, None, True)['matches'], 4)
        self.assertNotIn('matches', self.service.set_registration(item['id'], self.ada, None, False))
        self.update(item, {'format': 'double'})
        self.assertEqual(self.service.set_registration(item['id'], self.ada, None, True)['matches'],
                         {'min': 8, 'max': 9})


    def test_impostazioni_delle_estensioni(self):
        item = self.created()
        with self.assertRaisesRegex(TournamentError, 'non installata'):
            self.update(item, {'addons': {'prova': {'enabled': False}}})
        seen = []

        def check(tournament, value):
            seen.append(tournament['id'])
            if value.get('mode') == 'sbagliato':
                raise TournamentError('Tipo di conteggio sconosciuto.')
            return dict(value)

        self.service.addon_settings['prova'] = check
        item = self.update(item, {'addons': {'prova': {'enabled': True, 'mode': 'punti'}}})
        self.assertEqual(item['addons'], {'prova': {'enabled': True, 'mode': 'punti'}})
        self.assertEqual(seen, [item['id']])
        with self.assertRaisesRegex(TournamentError, 'sconosciuto'):
            self.update(item, {'addons': {'prova': {'mode': 'sbagliato'}}})
        # A torneo in corso si può solo spegnere.
        self.service.repo.update(item['id'], {'status': 'running'}, NOW)
        with self.assertRaisesRegex(TournamentError, 'solo titolo'):
            self.update(item, {'addons': {'prova': {'enabled': True}}})
        item = self.update(item, {'addons': {'prova': {'enabled': False}}})
        self.assertEqual(item['addons'], {'prova': {'enabled': False, 'mode': 'punti'}})


if __name__ == '__main__':
    unittest.main()
