import hashlib
import io
import json
import os
import tempfile
import unittest
import urllib.error

from pixelarcade.db import Database
from pixelarcade.errors import ProfileError
from pixelarcade.ra_client import RAAuthError, RAClient, RAError
from pixelarcade.repositories.profiles import ProfilesRepository
from pixelarcade.repositories.retroachievements import RARepository
from pixelarcade.repositories.sessions import SessionsRepository
from pixelarcade.repositories.settings import SettingsRepository
from pixelarcade.retroachievements import API_KEY, RAService, SessionTracker

from tests.fakes import fake_png

NOW = '2026-10-01T18:00:00+00:00'
KEY = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345'
TOKEN = 'tok3n5egret0000a'
PASSWORD = 'pass-segreta-123'
NES_ROM = b'NES\x1a' + b'\x00' * 12 + b'\x01' * 64
NES_HASH = hashlib.md5(NES_ROM[16:]).hexdigest()

# Righe reali del log di RetroArch 1.22.2 (prove del 2026-10-01).
LOG = [
    '[INFO] [RCHEEVOS] Attempting to log in Player1 (with token)',
    '[INFO] [RCHEEVOS] Generated hash e06129a966aa07fcdf9b6b03b50b9698',
    '[INFO] [RCHEEVOS] Player1 logged in successfully',
    '[INFO] [RCHEEVOS] Identified game: 1770 "The Jungle Book" (e06129a966aa07fcdf9b6b03b50b9698)',
    '[INFO] [RCHEEVOS] Hai 0 di 37 obiettivi sbloccati',
    '[INFO] [RCHEEVOS] Awarding achievement 12345: Jungle by Day',
    '[INFO] [RCHEEVOS] Achievement 12345 awarded, new score: 10',
    '[INFO] [RCHEEVOS] Awarding achievement 12345: Jungle by Day',
]


class FakeClient:
    def __init__(self):
        self.calls = []
        self.offline = False
        self.lists = {7: [{'ID': 1770, 'Title': 'The Jungle Book', 'Hashes': ['E06129A966AA07FCDF9B6B03B50B9698']}]}

    def record(self, name, *args):
        self.calls.append((name,) + args)
        if self.offline:
            raise RAError('RetroAchievements non raggiungibile: controlla la connessione.')

    def login(self, username, password):
        self.record('login', username)
        if password != PASSWORD:
            raise RAAuthError('Nome utente o password non validi.')
        return {'user': 'Player1', 'token': TOKEN, 'score': 0, 'softcoreScore': 10}

    def check_key(self, key):
        self.record('check_key')
        if key != KEY:
            raise RAAuthError('Chiave Web API non valida.')
        return True

    def game_list(self, key, console_id):
        self.record('game_list', console_id)
        return self.lists.get(console_id, [])

    def game_progress(self, key, game_id, username):
        self.record('game_progress', game_id, username)
        return {'ID': game_id, 'Title': 'The Jungle Book', 'ConsoleName': 'NES/Famicom', 'Achievements': {
            '2': {'ID': 2, 'Title': 'Secondo', 'Description': 'B', 'Points': 5, 'BadgeName': '222',
                  'DisplayOrder': 2},
            '1': {'ID': 1, 'Title': 'Primo', 'Description': 'A', 'Points': 10, 'BadgeName': '111',
                  'DisplayOrder': 1, 'DateEarned': '2026-10-01 17:00:00'},
        }}

    def game_extended(self, key, game_id):
        self.record('game_extended', game_id)
        return {'ID': game_id, 'Title': 'The Jungle Book', 'Achievements': {}}

    def user_summary(self, key, username):
        self.record('user_summary', username)
        return {'TotalPoints': 10, 'TotalSoftcorePoints': 25, 'Rank': '1234', 'TotalRanked': 90000,
                'RecentAchievements': {'1770': {
                    '1': {'ID': 1, 'Title': 'Primo', 'Points': 10, 'BadgeName': '111', 'GameTitle': 'The Jungle Book',
                          'DateAwarded': '2026-10-01 17:00:00'},
                    '2': {'ID': 2, 'Title': 'Secondo', 'Points': 5, 'BadgeName': '222',
                          'GameTitle': 'The Jungle Book', 'DateAwarded': '2026-10-01 17:30:00'}}}}

    def badge(self, name, locked=False):
        self.record('badge', name, locked)
        return fake_png(name.encode())

    def game_icon(self, name):
        self.record('game_icon', name)
        return fake_png(name.encode())

    def completion_progress(self, key, username, count, offset):
        self.record('completion_progress', username, count, offset)
        results = [
            {'GameID': 1770, 'Title': 'The Jungle Book', 'ImageIcon': '/Images/085573.png', 'ConsoleName': 'NES/Famicom',
             'MaxPossible': 40, 'NumAwarded': 12, 'NumAwardedHardcore': 8,
             'MostRecentAwardedDate': '2026-10-01T17:30:00+00:00'},
            {'GameID': 1, 'Title': 'Sonic', 'ImageIcon': '/Images/../segreto.png', 'ConsoleName': 'Genesis/Mega Drive',
             'MaxPossible': 23, 'NumAwarded': 23},
            {'GameID': 0, 'Title': 'Rotto'},
        ]
        return {'Count': len(results), 'Total': 32, 'Results': results}


class FakeLibrary:
    def __init__(self, base, games):
        self.base = base
        self.games = games

    def roms_dir(self):
        return self.base

    def find(self, system_id, game_id):
        if (system_id, game_id) not in self.games:
            return None
        return {'id': game_id, 'file': game_id.split('/')[-1], 'title': game_id}


class TrackerTest(unittest.TestCase):
    def test_log_reale(self):
        tracker = SessionTracker(lambda: NOW)
        for line in LOG + ['[INFO] [Core] riga senza trofei']:
            tracker.feed(line)
        self.assertEqual(tracker.snapshot(), {
            'hash': 'e06129a966aa07fcdf9b6b03b50b9698', 'gameId': 1770, 'title': 'The Jungle Book',
            'unknown': False, 'loggedIn': True,
            'unlocks': [{'id': 12345, 'title': 'Jungle by Day', 'at': NOW}]})

    def test_gioco_sconosciuto_e_accesso_fallito(self):
        tracker = SessionTracker(lambda: NOW)
        for line in ('[INFO] [RCHEEVOS] Generated hash 67406a645d4f7145a3a4e0f1fe61ee3a',
                     '[INFO] [RCHEEVOS] Load failed (-29): Unknown game',
                     '[INFO] [RCHEEVOS] RetroAchievements login failed: No response'):
            tracker.feed(line)
        state = tracker.snapshot()
        self.assertEqual((state['hash'], state['gameId'], state['unknown'], state['loggedIn']),
                         ('67406a645d4f7145a3a4e0f1fe61ee3a', None, True, False))


class RAServiceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        self.profiles = ProfilesRepository(self.db)
        self.luca = self.profiles.create('LUCA', '#ff5d73', NOW)
        self.sara = self.profiles.create('SARA', '#3ccfc4', NOW)
        self.sessions = SessionsRepository(self.db)
        self.settings = SettingsRepository(self.db)
        self.repo = RARepository(self.db)
        self.client = FakeClient()
        roms = os.path.join(self.tmp.name, 'games')
        os.makedirs(os.path.join(roms, 'nes'))
        with open(os.path.join(roms, 'nes', 'jungle.nes'), 'wb') as stream:
            stream.write(NES_ROM)
        self.library = FakeLibrary(roms, {('nes', 'jungle.nes'), ('psx', 'disco.cue')})
        self.clock = [1000.0]
        self.data_dir = os.path.join(self.tmp.name, 'data')
        self.service = self.make_service()

    def make_service(self):
        return RAService(self.repo, self.settings, self.client, self.profiles, self.library, self.data_dir,
                         lambda: NOW, lambda: self.clock[0])

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def database_text(self):
        """Tutto il contenuto del database come testo, per cercare valori che non devono esserci."""
        rows = []
        for (table,) in self.db.query("SELECT name FROM sqlite_master WHERE type = 'table'"):
            rows.extend(self.db.query('SELECT * FROM "%s"' % table))
        return repr(rows)

    def test_chiave_controllata_e_mai_restituita(self):
        self.assertEqual(self.service.key_status(), {'set': False, 'last4': None})
        with self.assertRaises(RAAuthError):
            self.service.set_key('corta')
        with self.assertRaises(RAAuthError):
            self.service.set_key('X' * 32)
        self.assertEqual(self.service.set_key('  %s ' % KEY), {'set': True, 'last4': '2345'})
        self.assertEqual(self.settings.get_all()[API_KEY], KEY)
        self.assertEqual(self.service.remove_key(), {'set': False, 'last4': None})

    def test_collegamento_senza_salvare_la_password(self):
        with self.assertRaises(RAAuthError):
            self.service.link(self.luca, 'Player1', 'sbagliata')
        with self.assertRaises(RAAuthError):
            self.service.link(self.luca, 'nome con spazi', PASSWORD)
        with self.assertRaises(ProfileError):
            self.service.link(999, 'Player1', PASSWORD)
        self.assertEqual(self.service.link(self.luca, 'player1', PASSWORD), {'username': 'Player1'})
        self.assertEqual(self.repo.account(self.luca)['token'], TOKEN)
        self.assertNotIn(PASSWORD, self.database_text())
        self.assertEqual(self.service.usernames(), {str(self.luca): 'Player1'})
        self.assertEqual(self.service.unlink(self.luca), {'username': None})
        self.assertIsNone(self.repo.account(self.luca))

    def test_opzioni_di_retroarch_per_p1(self):
        self.assertEqual(self.service.retroarch_options([self.luca, None]), [('cheevos_enable', 'false')])
        self.service.link(self.sara, 'Player1', PASSWORD)
        self.assertEqual(self.service.retroarch_options([self.luca, self.sara]), [('cheevos_enable', 'false')])
        options = dict(self.service.retroarch_options([self.sara, self.luca]))
        self.assertEqual(options['cheevos_enable'], 'true')
        self.assertEqual(options['cheevos_username'], 'Player1')
        self.assertEqual(options['cheevos_token'], TOKEN)
        self.assertEqual(options['cheevos_password'], '')
        self.assertEqual(options['cheevos_hardcore_mode_enable'], 'false')
        self.assertEqual(self.service.retroarch_options(None), [('cheevos_enable', 'false')])

    def test_fine_partita_trofei_per_entrambi(self):
        self.service.link(self.luca, 'Player1', PASSWORD)
        session = self.sessions.start('nes', 'jungle.nes', 'fceumm', NOW)
        tracker = self.service.tracker()
        for line in LOG:
            tracker.feed(line)
        result = self.service.finish_session(session, 'nes', 'jungle.nes', [self.luca, self.sara], tracker)
        self.assertEqual(result, {'unlocks': [{'id': 12345, 'title': 'Jungle by Day', 'at': NOW}],
                                  'earner': self.luca})
        self.assertEqual(self.repo.game('nes', 'jungle.nes')['raGameId'], 1770)
        self.assertEqual(self.repo.game('nes', 'jungle.nes')['source'], 'log')
        luca = self.service.profile_info(self.luca)['session']
        sara = self.service.profile_info(self.sara)['session']
        self.assertEqual([(item['achievementId'], item['coop']) for item in luca], [(12345, False)])
        self.assertEqual([(item['achievementId'], item['coop'], item['earnerName']) for item in sara],
                         [(12345, True, 'LUCA')])

    def test_fine_partita_senza_trofei_e_gioco_sconosciuto(self):
        session = self.sessions.start('psx', 'disco.cue', 'mednafen_psx', NOW)
        tracker = self.service.tracker()
        tracker.feed('[INFO] [RCHEEVOS] Generated hash 67406a645d4f7145a3a4e0f1fe61ee3a')
        tracker.feed('[INFO] [RCHEEVOS] Load failed (-29): Unknown game')
        self.assertEqual(self.service.finish_session(session, 'psx', 'disco.cue', [None, None], tracker),
                         {'unlocks': [], 'earner': None})
        self.assertEqual(self.repo.game('psx', 'disco.cue')['status'], 'unknown')

    def test_riconoscimento_dall_hash_con_cache(self):
        self.client.lists = {7: [{'ID': 99, 'Title': 'Prova', 'Hashes': [NES_HASH]}]}
        self.settings.set_many({API_KEY: KEY})
        found = self.service.identify('nes', 'jungle.nes')
        self.assertEqual((found['raGameId'], found['title'], found['status'], found['source']),
                         (99, 'Prova', 'found', 'hash'))
        # Il NES cerca anche tra i giochi del Famicom Disk System.
        self.assertEqual([call for call in self.client.calls if call[0] == 'game_list'],
                         [('game_list', 7)])
        self.assertTrue(os.path.isfile(os.path.join(self.data_dir, 'retroachievements', 'games-7.json')))
        # Un nuovo servizio legge l'elenco dalla cache su disco.
        self.repo.set_game('nes', 'jungle.nes', None, None, None, 'unknown', 'hash', NOW)
        self.client.calls.clear()
        self.assertEqual(self.make_service().identify('nes', 'jungle.nes')['raGameId'], 99)
        self.assertEqual(self.client.calls, [])

    def test_hash_non_trovato_non_si_memorizza(self):
        self.client.lists = {}
        self.settings.set_many({API_KEY: KEY})
        found = self.service.identify('nes', 'jungle.nes')
        self.assertEqual((found['raGameId'], found['status']), (None, 'unknown'))
        self.assertIsNone(self.repo.game('nes', 'jungle.nes'))
        self.assertEqual([call[1] for call in self.client.calls], [7, 81])

    def test_scheda_del_gioco(self):
        info = self.service.game_info('nes', 'jungle.nes', self.luca)
        self.assertEqual(info['status'], 'no_key')
        self.settings.set_many({API_KEY: KEY})
        self.client.lists = {}
        self.assertEqual(self.service.game_info('nes', 'jungle.nes')['status'], 'unknown')
        self.assertEqual(self.service.game_info('psx', 'disco.cue')['status'], 'unknown')
        self.repo.set_game('nes', 'jungle.nes', None, 1770, 'The Jungle Book', 'found', 'log', NOW)
        info = self.service.game_info('nes', 'jungle.nes')
        self.assertEqual((info['status'], info['user']), ('ok', None))
        self.assertIn(('game_extended', 1770), self.client.calls)
        self.service.link(self.luca, 'Player1', PASSWORD)
        info = self.service.game_info('nes', 'jungle.nes', self.luca)
        self.assertEqual(info['user'], 'Player1')
        self.assertEqual(info['game'], {'id': 1770, 'title': 'The Jungle Book', 'console': 'NES/Famicom',
                                        'total': 2, 'earned': 1, 'points': 15, 'earnedPoints': 10})
        self.assertEqual([(item['id'], item['unlocked']) for item in info['achievements']], [(1, True), (2, False)])
        # La seconda richiesta arriva dalla cache.
        calls = len(self.client.calls)
        self.service.game_info('nes', 'jungle.nes', self.luca)
        self.assertEqual(len(self.client.calls), calls)
        self.repo.set_game('nes', 'jungle.nes', None, 1100000828, 'Unsupported Game Version (Jungle)', 'unsupported',
                           'log', NOW)
        self.assertEqual(self.service.game_info('nes', 'jungle.nes')['status'], 'unsupported')

    def test_compatibilita_nota(self):
        self.assertEqual(self.service.known('nes'), {})
        self.repo.set_game('nes', 'jungle.nes', None, 1770, 'The Jungle Book', 'found', 'log', NOW)
        self.repo.set_game('nes', 'altro.nes', 'ab', None, None, 'unknown', 'log', NOW)
        self.repo.set_game('nes', 'vecchio.nes', None, 1100000828, 'Unsupported Game Version (Jungle)', 'unsupported',
                           'log', NOW)
        self.repo.set_game('snes', 'jungle.sfc', None, 1, 'Jungle', 'found', 'log', NOW)
        self.assertEqual(self.service.known('nes'), {'jungle.nes': True, 'altro.nes': False, 'vecchio.nes': False})

    def run_check(self, system_id, games):
        pending = self.service.check(system_id, games)
        thread = self.service.check_threads.get(system_id)
        if thread is not None:
            thread.join(5)
        return pending

    def test_controllo_in_background(self):
        games = [{'id': 'jungle.nes'}, {'id': 'manca.nes'}, {'id': 'pacco.7z'}]
        # Senza chiave Web API non si controlla nulla.
        self.assertEqual(self.run_check('nes', games), 0)
        self.assertEqual(self.client.calls, [])
        self.settings.set_many({API_KEY: KEY})
        self.client.lists = {7: [{'ID': 99, 'Title': 'Prova', 'Hashes': [NES_HASH]}]}
        # Il 7z si salta; il file che manca dal disco si ricorda in memoria.
        self.assertEqual(self.run_check('nes', games), 2)
        self.assertEqual(self.service.known('nes'), {'jungle.nes': True})
        self.assertEqual(self.repo.game('nes', 'jungle.nes')['source'], 'hash')
        self.assertEqual(self.run_check('nes', games), 0)
        # Un disco si riconosce solo dal log.
        self.assertEqual(self.run_check('psx', [{'id': 'disco.cue'}]), 0)

    def test_controllo_non_riconosciuto_e_ricontrollato(self):
        self.settings.set_many({API_KEY: KEY})
        self.client.lists = {}
        games = [{'id': 'jungle.nes'}]
        self.assertEqual(self.run_check('nes', games), 1)
        self.assertEqual(self.service.known('nes'), {'jungle.nes': False})
        self.assertEqual(self.repo.game('nes', 'jungle.nes')['hash'], NES_HASH)
        # Elenco già in memoria e responso più recente: non si ricontrolla.
        self.client.calls.clear()
        self.assertEqual(self.run_check('nes', games), 0)
        # Responso più vecchio dell'elenco: si ricontrolla con l'elenco aggiornato.
        self.repo.set_game('nes', 'jungle.nes', NES_HASH, None, None, 'unknown', 'hash', '1969-01-01T00:00:00+00:00')
        self.service.game_lists[7] = (self.clock[0], {NES_HASH: (99, 'Prova')})
        self.assertEqual(self.run_check('nes', games), 1)
        self.assertEqual(self.service.known('nes'), {'jungle.nes': True})
        # Il responso del log non si sovrascrive.
        self.repo.set_game('nes', 'jungle.nes', None, None, None, 'unknown', 'log', '1969-01-01T00:00:00+00:00')
        self.assertEqual(self.run_check('nes', games), 0)

    def test_controllo_senza_rete(self):
        self.settings.set_many({API_KEY: KEY})
        self.client.offline = True
        games = [{'id': 'jungle.nes'}]
        self.assertEqual(self.run_check('nes', games), 1)
        self.assertEqual(self.service.known('nes'), {})
        # Si ritenta solo dopo qualche minuto.
        self.assertEqual(self.run_check('nes', games), 0)
        self.client.offline = False
        self.clock[0] += 301
        self.assertEqual(self.run_check('nes', games), 1)
        self.assertEqual(self.service.known('nes'), {'jungle.nes': False})

    def test_scheda_senza_rete(self):
        self.settings.set_many({API_KEY: KEY})
        self.repo.set_game('nes', 'jungle.nes', None, 1770, 'The Jungle Book', 'found', 'log', NOW)
        self.client.offline = True
        info = self.service.game_info('nes', 'jungle.nes')
        self.assertEqual(info['status'], 'offline')
        self.assertIn('connessione', info['message'])

    def test_profilo(self):
        self.assertEqual(self.service.profile_info(self.luca)['status'], 'not_linked')
        self.service.link(self.luca, 'Player1', PASSWORD)
        self.assertEqual(self.service.profile_info(self.luca)['status'], 'no_key')
        self.settings.set_many({API_KEY: KEY})
        info = self.service.profile_info(self.luca)
        self.assertEqual(info['summary'], {'points': 10, 'softcorePoints': 25, 'rank': 1234, 'totalRanked': 90000,
                                           'motto': ''})
        self.assertEqual([item['id'] for item in info['recent']], [2, 1])
        with self.assertRaises(ProfileError):
            self.service.profile_info(999)

    def test_giochi_e_trofei_dell_account(self):
        self.assertEqual(self.service.profile_games(self.luca)['status'], 'not_linked')
        self.assertEqual(self.service.profile_game(self.luca, 1770)['status'], 'not_linked')
        self.service.link(self.luca, 'Player1', PASSWORD)
        self.assertEqual(self.service.profile_games(self.luca)['status'], 'no_key')
        self.settings.set_many({API_KEY: KEY})
        page = self.service.profile_games(self.luca)
        self.assertEqual(page['games'], [
            {'id': 1770, 'title': 'The Jungle Book', 'console': 'NES/Famicom', 'icon': '085573', 'earned': 12,
             'total': 40, 'lastAt': '2026-10-01T17:30:00+00:00'},
            {'id': 1, 'title': 'Sonic', 'console': 'Genesis/Mega Drive', 'icon': None, 'earned': 23, 'total': 23,
             'lastAt': None},
        ])
        self.assertEqual((page['user'], page['total'], page['offset'], page['more']), ('Player1', 32, 0, True))
        last = self.service.profile_games(self.luca, 30)
        self.assertEqual((last['offset'], last['more']), (30, False))
        self.assertEqual(self.service.profile_games(self.luca, -5)['offset'], 0)
        self.service.profile_games(self.luca)
        calls = [call for call in self.client.calls if call[0] == 'completion_progress']
        self.assertEqual(calls, [('completion_progress', 'Player1', 30, 0), ('completion_progress', 'Player1', 30, 30)])
        game = self.service.profile_game(self.luca, 1770)
        self.assertEqual((game['status'], game['game']['earned'], game['game']['total']), ('ok', 1, 2))
        self.assertEqual([item['unlocked'] for item in game['achievements']], [True, False])
        with self.assertRaises(ProfileError):
            self.service.profile_game(self.luca, 0)
        with self.assertRaises(ProfileError):
            self.service.profile_games(999)
        self.client.offline = True
        self.clock[0] += 1000
        self.assertEqual(self.service.profile_games(self.luca)['status'], 'offline')

    def test_icona_in_cache(self):
        data = self.service.icon('085573')
        self.assertEqual(data, fake_png(b'085573'))
        self.assertEqual(self.service.icon('085573'), data)
        self.assertEqual([call for call in self.client.calls if call[0] == 'game_icon'], [('game_icon', '085573')])
        for name in ('../segreto', 'abc', None):
            with self.assertRaises(ProfileError):
                self.service.icon(name)

    def test_badge_in_cache(self):
        data = self.service.badge('12345', locked=True)
        self.assertEqual(data, fake_png(b'12345'))
        self.assertEqual(self.service.badge('12345', locked=True), data)
        self.assertEqual([call for call in self.client.calls if call[0] == 'badge'], [('badge', '12345', True)])
        with self.assertRaises(ProfileError):
            self.service.badge('../segreto')


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class RAClientTest(unittest.TestCase):
    def opener(self, reply=None, error=None):
        self.requests = []

        def open_url(request, timeout=None):
            self.requests.append(request)
            if error is not None:
                raise error
            return FakeResponse(json.dumps(reply).encode('utf-8'))
        return open_url

    def test_login(self):
        client = RAClient(self.opener({'Success': True, 'User': 'Player1', 'Token': TOKEN, 'Score': 0,
                                       'SoftcoreScore': 10}))
        self.assertEqual(client.login('player1', PASSWORD),
                         {'user': 'Player1', 'token': TOKEN, 'score': 0, 'softcoreScore': 10})
        request = self.requests[0]
        self.assertEqual(request.get_method(), 'POST')
        self.assertIn(b'r=login2', request.data)
        self.assertNotIn(PASSWORD, request.full_url)

    def test_login_rifiutato(self):
        error = urllib.error.HTTPError('https://retroachievements.org/dorequest.php', 401, 'Unauthorized', {}, None)
        with self.assertRaisesRegex(RAAuthError, 'password'):
            RAClient(self.opener(error=error)).login('player1', 'sbagliata')
        with self.assertRaisesRegex(RAAuthError, 'password'):
            RAClient(self.opener({'Success': False, 'Error': 'Invalid'})).login('player1', 'sbagliata')

    def test_web_api_e_errori(self):
        client = RAClient(self.opener([{'ID': 1, 'Name': 'Genesis/Mega Drive'}]))
        self.assertTrue(client.check_key(KEY))
        self.assertIn('API_GetConsoleIDs.php?y=' + KEY, self.requests[0].full_url)
        error = urllib.error.HTTPError('u', 401, 'Unauthorized', {}, None)
        with self.assertRaisesRegex(RAAuthError, 'Chiave'):
            RAClient(self.opener(error=error)).check_key(KEY)
        with self.assertRaisesRegex(RAError, 'connessione') as context:
            RAClient(self.opener(error=urllib.error.URLError('rete assente'))).user_summary(KEY, 'Player1')
        self.assertNotIn(KEY, str(context.exception))
        client = RAClient(self.opener({'Count': 0, 'Total': 0, 'Results': []}))
        self.assertEqual(client.completion_progress(KEY, 'Player1', 30, 60)['Total'], 0)
        self.assertIn('API_GetUserCompletionProgress.php?', self.requests[0].full_url)
        self.assertIn('c=30&o=60', self.requests[0].full_url)
        with self.assertRaisesRegex(RAError, 'non valido'):
            RAClient(self.opener([])).completion_progress(KEY, 'Player1', 30, 0)


if __name__ == '__main__':
    unittest.main()
