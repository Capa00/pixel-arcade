import hashlib
import json
import os
import tempfile
import unittest

from pixelarcade.db import Database
from pixelarcade.errors import DuplicateNameError, ProfileError
from pixelarcade.profiles import COLORS, ProfileService, normalize_name
from pixelarcade.repositories.profiles import ProfilesRepository
from pixelarcade.repositories.sessions import SessionsRepository

NOW = '2026-09-23T10:00:00+00:00'


class FakeLibrary:
    """Libreria con due giochi arcade (solo ``sf2.zip`` ha i metadati); ``zelda.nes`` è stato cancellato dal disco."""

    games = {
        ('arcade', 'pang.zip'): {'title': 'pang', 'cover': False},
        ('arcade', 'sf2.zip'): {'title': 'Street Fighter II', 'metaId': 'sf2-meta', 'cover': True},
    }

    def find(self, system_id, game_id):
        game = self.games.get((system_id, game_id))
        return None if game is None else dict(game, id=game_id)


class ProfileServiceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        self.sessions = SessionsRepository(self.db)
        self.service = ProfileService(ProfilesRepository(self.db), self.sessions, FakeLibrary(), lambda: NOW)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def play(self, game, seconds, players, ended='2026-09-23T11:00:00+00:00'):
        session = self.sessions.start('arcade', game, 'fbneo', NOW)
        self.sessions.finish(session, ended, seconds, 0)
        return self.service.record_session(session, players, seconds)

    def test_normalizzazione(self):
        self.assertEqual(normalize_name('  luca 8bit '), 'LUCA_8BIT')
        self.assertEqual(normalize_name('sara.exe'), 'SARA.EXE')
        self.assertEqual(normalize_name('àb-c!?d'), 'B-CD')
        self.assertEqual(normalize_name('abcdefghijklmnopqrstuvwxyz0123'), 'ABCDEFGHIJKLMNOPQRSTUVWXY')
        for value in ('', '   ', '!!!', None, 3):
            with self.assertRaises(ProfileError):
                normalize_name(value)

    def test_creazione_con_valori_predefiniti(self):
        account = self.service.create('prova 1', '#f5c542', 'snes')
        self.assertEqual(account, {
            'id': account['id'], 'name': 'PROVA_1', 'color': '#f5c542', 'createdAt': NOW,
            'favConsole': 'snes', 'difficulty': 'Normale', 'opts': {'crt': False, 'vib': True},
            'genres': [], 'level': 1, 'xp': 0, 'xpPercent': 0, 'title': 'Recluta', 'hours': 0, 'played': 0,
            'sessions': 0, 'favorites': [], 'recent': [], 'raUser': None, 'avatar': False,
        })
        self.assertEqual(self.service.list_public(), [account])

    def test_colori_della_demo(self):
        self.assertEqual(len(COLORS), 8)
        for color in COLORS:
            self.service.create('C' + color[1:5], color)
        with self.assertRaises(ProfileError) as caught:
            self.service.create('ROSSO', '#ff0000')
        self.assertEqual(str(caught.exception), 'Colore non valido.')

    def test_duplicato_e_console_non_valida(self):
        self.service.create('PROVA_1', '#ff5d73')
        with self.assertRaises(DuplicateNameError):
            self.service.create('prova 1', '#ff5d73')
        with self.assertRaises(ProfileError):
            self.service.create('ALTRO', '#ff5d73', ['snes'])
        self.assertEqual(self.service.create('SENZA', '#ff5d73', '')['favConsole'], None)

    def test_aggiornamento(self):
        account = self.service.create('LUCA', '#ff5d73')
        updated = self.service.update(account['id'], {
            'favConsole': 'nes', 'genres': ['Puzzle', 'Platform', 'Puzzle'], 'difficulty': 'Difficile',
            'opts': {'crt': True, 'save': False}, 'color': '#3ccfc4',
        })
        self.assertEqual((updated['favConsole'], updated['genres'], updated['difficulty'], updated['color']),
                         ('nes', ['Platform', 'Puzzle'], 'Difficile', '#3ccfc4'))
        # «save» non esiste più: si ignora senza errori.
        self.assertEqual(updated['opts'], {'crt': True, 'vib': True})
        self.assertEqual(self.service.update(account['id'], {'genres': []})['genres'], [])
        self.assertEqual(self.service.update(account['id'], {'favConsole': None})['favConsole'], None)
        self.assertEqual(self.service.retroarch_opts(account['id']), {'crt': True, 'vib': True})
        self.assertEqual(self.service.retroarch_opts(None), {'crt': False, 'vib': True})

    def test_aggiornamento_non_valido_non_salva(self):
        account = self.service.create('LUCA', '#ff5d73')
        patches = ({'genres': ['Platform', 'Bocce']}, {'difficulty': 'Incubo'}, {'opts': {'crt': 1}},
                   {'opts': {'turbo': True}}, {'color': 'rosso'}, {'name': '?!'}, {'name': 3}, {'favConsole': 3}, 'x',
                   {'difficulty': 'Facile', 'genres': 'Puzzle'})
        for patch in patches:
            with self.assertRaises(ProfileError, msg=patch):
                self.service.update(account['id'], patch)
        self.assertEqual(self.service.public(self.service.account(account['id']))['difficulty'], 'Normale')
        with self.assertRaises(ProfileError):
            self.service.update(999, {'difficulty': 'Facile'})
        with self.assertRaises(ProfileError):
            self.service.update(True, {'difficulty': 'Facile'})

    def test_cambio_del_nome(self):
        account = self.service.create('LUCA', '#ff5d73')
        self.service.create('SARA', '#3ccfc4')
        updated = self.service.update(account['id'], {'name': ' luca 8bit ', 'color': '#5b93ff'})
        self.assertEqual((updated['name'], updated['color']), ('LUCA_8BIT', '#5b93ff'))
        # Lo stesso nome con maiuscole diverse resta possibile per sé, non per un altro profilo.
        self.assertEqual(self.service.update(account['id'], {'name': 'Luca_8bit'})['name'], 'LUCA_8BIT')
        with self.assertRaises(DuplicateNameError):
            self.service.update(account['id'], {'name': 'sara', 'difficulty': 'Facile'})
        saved = self.service.public(self.service.account(account['id']))
        self.assertEqual((saved['name'], saved['difficulty']), ('LUCA_8BIT', 'Normale'))

    def test_email_gravatar_solo_hash(self):
        account = self.service.create('LUCA', '#ff5d73')
        updated = self.service.update(account['id'], {'email': '  Luca@Example.COM '})
        self.assertTrue(updated['avatar'])
        stored = self.service.account(account['id'])['gravatar']
        self.assertEqual(stored, hashlib.sha256(b'luca@example.com').hexdigest())
        text = json.dumps(updated)
        self.assertNotIn('example', text.lower())
        self.assertNotIn(stored, text)
        for value in ('senza-chiocciola', 'a@b', 'a b@c.it', 3, 'x' * 250 + '@a.it'):
            with self.assertRaises(ProfileError, msg=value):
                self.service.update(account['id'], {'email': value, 'difficulty': 'Facile'})
        self.assertEqual(self.service.account(account['id'])['gravatar'], stored)
        self.assertEqual(self.service.account(account['id'])['difficulty'], 'Normale')
        self.assertFalse(self.service.update(account['id'], {'email': None})['avatar'])
        self.assertIsNone(self.service.account(account['id'])['gravatar'])
        self.service.update(account['id'], {'email': 'luca@example.com'})
        self.assertFalse(self.service.update(account['id'], {'email': ''})['avatar'])

    def test_preferiti_idempotenti(self):
        account = self.service.create('LUCA', '#ff5d73')['id']
        self.assertEqual(self.service.set_favorite(account, 'arcade/pang.zip', True), ['arcade/pang.zip'])
        self.assertEqual(self.service.set_favorite(account, 'arcade/pang.zip', True), ['arcade/pang.zip'])
        self.assertEqual(self.service.set_favorite(account, 'arcade/sf2.zip', True),
                         ['arcade/sf2.zip', 'arcade/pang.zip'])
        self.assertEqual(self.service.set_favorite(account, 'arcade/pang.zip', False), ['arcade/sf2.zip'])
        self.assertEqual(self.service.set_favorite(account, 'arcade/pang.zip', False), ['arcade/sf2.zip'])
        for key, on in (('arcade/manca.zip', True), ('arcade', True), ('/pang.zip', True), ('arcade/pang.zip', 1)):
            with self.assertRaises(ProfileError):
                self.service.set_favorite(account, key, on)
        with self.assertRaises(ProfileError):
            self.service.set_favorite(999, 'arcade/pang.zip', True)

    def test_partite_e_statistiche_di_due_giocatori(self):
        luca = self.service.create('LUCA', '#ff5d73')['id']
        sara = self.service.create('SARA', '#3ccfc4')['id']
        # 12 minuti a pang, prima volta per entrambi: 12 + 5 + 25 = 42.
        result = self.play('pang.zip', 12 * 60, [luca, sara])
        self.assertEqual(result[luca], {
            'slot': 'p1', 'xpGained': 42, 'levelBefore': 1, 'levelAfter': 1, 'title': 'Recluta',
            'titleBefore': 'Recluta', 'percentBefore': 0, 'percentAfter': 42,
            'parts': {'minutes': 12, 'session': 5, 'newGame': 25, 'challenge': 0}})
        self.assertEqual(result[sara]['xpGained'], 42)
        # Di nuovo pang (niente bonus), 60 minuti: 60 + 5 = 65 → 107 XP, livello 2.
        result = self.play('pang.zip', 3600, [luca, None], '2026-09-23T12:00:00+00:00')
        self.assertEqual(result, {luca: {
            'slot': 'p1', 'xpGained': 65, 'levelBefore': 1, 'levelAfter': 2, 'title': 'Recluta',
            'titleBefore': 'Recluta', 'percentBefore': 42, 'percentAfter': 3,
            'parts': {'minutes': 60, 'session': 5, 'newGame': 0, 'challenge': 0}}})
        # sf2 come P2: gioco nuovo.
        result = self.play('sf2.zip', 60, [None, luca], '2026-09-23T13:00:00+00:00')
        self.assertEqual(result[luca]['xpGained'], 31)
        account = self.service.public(self.service.account(luca))
        self.assertEqual((account['xp'], account['level'], account['xpPercent'], account['title']),
                         (138, 2, 19, 'Recluta'))
        self.assertEqual((account['hours'], account['played'], account['sessions']), (1.2, 2, 3))
        self.assertEqual(account['recent'], [
            {'game': 'arcade/sf2.zip', 'at': '2026-09-23T13:00:00+00:00', 'seconds': 60},
            {'game': 'arcade/pang.zip', 'at': '2026-09-23T12:00:00+00:00', 'seconds': 3600},
        ])
        other = self.service.public(self.service.account(sara))
        self.assertEqual((other['xp'], other['played'], other['sessions'], other['hours']), (42, 1, 1, 0.2))
        slots = self.db.query('SELECT slot FROM session_players WHERE account_id = ? ORDER BY session_id', (luca,))
        self.assertEqual([row[0] for row in slots], ['p1', 'p1', 'p2'])

    def test_statistiche_e_storico(self):
        from pixelarcade import profiles
        luca = self.service.create('LUCA', '#ff5d73')['id']
        sara = self.service.create('SARA', '#3ccfc4')['id']
        with self.assertRaises(ProfileError):
            self.service.stats(999)
        self.assertEqual(self.service.stats(luca), {'systems': [], 'top': [], 'history': [], 'more': False, 'games': {},
                                               'tournaments': {'played': 0, 'won': 0, 'best': None}})
        self.play('pang.zip', 600, [luca, sara], '2026-09-23T11:00:00+00:00')
        # 25 s: conta nelle ore ma non compare nello storico.
        self.play('sf2.zip', 25, [luca, None], '2026-09-23T12:00:00+00:00')
        stats = self.service.stats(luca)
        self.assertEqual(stats['systems'], [{'system': 'arcade', 'name': 'ARCADE', 'seconds': 625, 'sessions': 2}])
        self.assertEqual([(item['game'], item['seconds']) for item in stats['top']],
                         [('arcade/pang.zip', 600), ('arcade/sf2.zip', 25)])
        self.assertEqual(len(stats['history']), 1)
        entry = stats['history'][0]
        self.assertEqual((entry['game'], entry['seconds'], entry['xp'], entry['slot'], entry['trophies']),
                         ('arcade/pang.zip', 600, 40, 'p1', []))
        self.assertEqual(entry['partners'], [{'id': sara, 'name': 'SARA', 'color': '#3ccfc4'}])
        self.assertFalse(stats['more'])
        self.assertEqual(set(stats['games']), {'arcade/pang.zip', 'arcade/sf2.zip'})
        # Pagine dello storico.
        old_page = profiles.HISTORY_PAGE
        profiles.HISTORY_PAGE = 1
        try:
            self.play('pang.zip', 60, [luca], '2026-09-23T13:00:00+00:00')
            first = self.service.stats(luca)
            self.assertEqual((len(first['history']), first['more']), (1, True))
            second = self.service.stats(luca, first['history'][0]['id'])
            self.assertEqual((second['history'][0]['id'], second['more']), (entry['id'], False))
        finally:
            profiles.HISTORY_PAGE = old_page

    def test_premi_dei_tornei(self):
        from pixelarcade import profiles
        from pixelarcade.repositories.tournament_rewards import TournamentRewardsRepository
        rewards = TournamentRewardsRepository(self.db)
        self.service.rewards = rewards
        luca = self.service.create('LUCA', '#ff5d73')['id']
        self.play('pang.zip', 600, [luca], '2026-09-23T11:00:00+00:00')
        xp = self.service.public(self.service.repo.get(luca))['xp']
        rewards.add_all(7, 'Coppa', [(luca, 1, 100)], '2026-09-23T12:00:00+00:00')
        rewards.add_all(8, 'Notte', [(luca, 5, 0)], '2026-09-23T10:00:00+00:00')
        # Gli XP del premio contano nel profilo (livello e titolo compresi).
        self.assertEqual(self.service.public(self.service.repo.get(luca))['xp'], xp + 100)
        stats = self.service.stats(luca)
        self.assertEqual(stats['tournaments'], {'played': 2, 'won': 1, 'best': 1})
        self.assertEqual([(item['kind'], item.get('title'), item.get('place')) for item in stats['history']],
                         [('reward', 'Coppa', 1), ('session', None, None), ('reward', 'Notte', 5)])
        # A pagine: ogni piazzamento compare una volta, nel periodo delle sue partite.
        self.play('pang.zip', 60, [luca], '2026-09-23T13:00:00+00:00')
        old_page = profiles.HISTORY_PAGE
        profiles.HISTORY_PAGE = 1
        try:
            first = self.service.stats(luca)
            self.assertEqual([item['kind'] for item in first['history']], ['session'])
            second = self.service.stats(luca, first['history'][0]['id'])
            self.assertEqual([(item['kind'], item.get('title')) for item in second['history']],
                             [('reward', 'Coppa'), ('session', None), ('reward', 'Notte')])
        finally:
            profiles.HISTORY_PAGE = old_page

    def test_partite_ignorate(self):
        luca = self.service.create('LUCA', '#ff5d73')['id']
        self.assertEqual(self.play('pang.zip', 19, [luca, None]), {})
        self.assertEqual(self.play('pang.zip', 30, [999, 'x', True]), {})
        self.assertEqual(list(self.play('pang.zip', 30, [luca, luca])), [luca])
        self.assertEqual(self.service.record_session(12345, [luca], 60), {})
        self.assertEqual(self.db.query('SELECT COUNT(*) FROM session_players')[0][0], 1)

    def test_riepiloghi_dei_giochi(self):
        luca = self.service.create('LUCA', '#ff5d73')['id']
        self.service.set_favorite(luca, 'arcade/pang.zip', True)
        self.play('zelda.nes', 60, [luca])
        accounts = self.service.list_public()
        games = self.service.games_of(accounts)
        self.assertEqual(games['arcade/pang.zip'], {
            'system': 'arcade', 'id': 'pang.zip', 'title': 'pang', 'systemName': 'ARCADE', 'systemFull': 'ARCADE',
            'metaId': None, 'cover': False, 'missing': False,
        })
        self.assertTrue(games['arcade/zelda.nes']['missing'])
        self.assertIsNone(games['arcade/zelda.nes']['metaId'])
        self.assertEqual(games['arcade/zelda.nes']['title'], 'zelda')

    def test_riepilogo_con_metadati(self):
        luca = self.service.create('LUCA', '#ff5d73')['id']
        self.service.set_favorite(luca, 'arcade/sf2.zip', True)
        games = self.service.games_of(self.service.list_public())
        self.assertEqual(games['arcade/sf2.zip']['title'], 'Street Fighter II')
        self.assertEqual((games['arcade/sf2.zip']['metaId'], games['arcade/sf2.zip']['cover']), ('sf2-meta', True))

    def test_cancellazione_a_cascata(self):
        luca = self.service.create('LUCA', '#ff5d73')['id']
        self.service.set_favorite(luca, 'arcade/pang.zip', True)
        self.play('pang.zip', 60, [luca])
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM accounts WHERE id = ?', (luca,))
        self.assertEqual(self.db.query('SELECT COUNT(*) FROM favorites')[0][0], 0)
        self.assertEqual(self.db.query('SELECT COUNT(*) FROM session_players')[0][0], 0)
        self.assertEqual(self.db.query('SELECT COUNT(*) FROM sessions')[0][0], 1)

    def test_partita_di_torneo_con_xp(self):
        luca = self.service.create('LUCA', '#ff5d73')['id']
        session = self.sessions.start('arcade', 'pang.zip', 'fbneo', NOW, tournament_id=2)
        self.sessions.finish(session, NOW, 600, 0)
        gained = self.service.record_session(session, [luca, None], 600)
        self.assertGreater(gained[luca]['xpGained'], 0)
        self.assertEqual(gained[luca]['parts']['newGame'], 25)
        # Il gioco non è più «nuovo» dopo la partita di torneo.
        self.assertEqual(self.play('pang.zip', 600, [luca, None])[luca]['parts']['newGame'], 0)
        stats = self.service.stats(luca)
        self.assertEqual([item['tournament'] for item in stats['history']], [None, {'id': 2, 'title': None}])
        self.assertEqual(stats['history'][1]['xp'], gained[luca]['xpGained'])
        self.assertEqual(self.service.public(self.service.repo.get(luca))['sessions'], 2)

if __name__ == '__main__':
    unittest.main()
