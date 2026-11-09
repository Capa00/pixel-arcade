import os
import tempfile
import unittest

from pixelarcade.db import Database
from pixelarcade.errors import ConflictError, PlaylistError
from pixelarcade.playlists import PlaylistService, normalize_filters, normalize_name
from pixelarcade.profiles import ProfileService
from pixelarcade.repositories.playlists import PlaylistsRepository
from pixelarcade.repositories.profiles import ProfilesRepository
from pixelarcade.repositories.sessions import SessionsRepository

NOW = '2026-10-02T10:00:00+00:00'


class FakeLibrary:
    """Libreria con due giochi: uno arcade e uno del NES."""

    games = {
        ('arcade', 'sf2.zip'): {'title': 'Street Fighter II', 'metaId': 'sf2-meta', 'cover': True},
        ('nes', 'Zelda.nes'): {'title': 'Zelda', 'cover': False},
    }

    def find(self, system_id, game_id):
        game = self.games.get((system_id, game_id))
        return None if game is None else dict(game, id=game_id)


class PlaylistServiceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        self.sessions = SessionsRepository(self.db)
        self.profiles = ProfileService(ProfilesRepository(self.db), self.sessions, FakeLibrary(), lambda: NOW)
        self.service = PlaylistService(PlaylistsRepository(self.db), self.profiles, lambda: NOW)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def test_nome(self):
        self.assertEqual(normalize_name('  Picchiaduro   a 2  '), 'Picchiaduro a 2')
        for value in ('', '   ', None, 3, 'x' * 33):
            with self.assertRaises(PlaylistError):
                normalize_name(value)

    def test_filtri(self):
        self.assertEqual(normalize_filters(None), {})
        self.assertEqual(normalize_filters({
            'title': '  mario ', 'genre': ['Picchiaduro', 'Picchiaduro'], 'region': [], 'players': '2',
            'played': None, 'year': ['1991'],
        }), {'title': 'mario', 'genre': ['Picchiaduro'], 'players': '2', 'year': ['1991']})
        # «exclude» tiene solo i campi attivi, senza ripetizioni.
        self.assertEqual(normalize_filters({
            'kind': ['hack', 'translation'], 'achievements': ['yes'], 'exclude': ['kind', 'kind', 'genre'],
        }), {'kind': ['hack', 'translation'], 'achievements': ['yes'], 'exclude': ['kind']})
        self.assertEqual(normalize_filters({'genre': ['Sport'], 'exclude': []}), {'genre': ['Sport']})
        for value in ([], {'colore': ['rosso']}, {'genre': 'Sport'}, {'genre': ['']}, {'players': '5'},
                      {'played': 'sempre'}, {'title': 3}, {'year': [1991]}, {'exclude': 'kind'},
                      {'genre': ['Sport'], 'exclude': ['players']}):
            with self.assertRaises(PlaylistError, msg=value):
                normalize_filters(value)

    def test_crea_modifica_elimina(self):
        data = self.service.create('Picchiaduro 2G', {'genre': ['Picchiaduro'], 'players': '2'}, ['arcade/sf2.zip'])
        playlist = data['playlists'][0]
        self.assertEqual(playlist, {'id': playlist['id'], 'name': 'Picchiaduro 2G',
                                    'filters': {'genre': ['Picchiaduro'], 'players': '2'},
                                    'games': ['arcade/sf2.zip']})
        self.assertEqual(data['games']['arcade/sf2.zip']['title'], 'Street Fighter II')
        with self.assertRaises(ConflictError):
            self.service.create('picchiaduro 2g')
        data = self.service.update(playlist['id'], {'name': 'Botte', 'filters': {}})
        self.assertEqual((data['playlists'][0]['name'], data['playlists'][0]['filters']), ('Botte', {}))
        other = self.service.create('Altra')['playlists'][1]
        with self.assertRaises(ConflictError):
            self.service.update(other['id'], {'name': 'BOTTE'})
        for patch in (None, {}, {'colore': 'rosso'}, {'name': ''}, {'filters': {'players': '9'}}):
            with self.assertRaises(PlaylistError, msg=patch):
                self.service.update(playlist['id'], patch)
        data = self.service.delete(playlist['id'])
        self.assertEqual([item['name'] for item in data['playlists']], ['Altra'])
        for playlist_id in (playlist['id'], 'x', True, None):
            with self.assertRaises(PlaylistError):
                self.service.delete(playlist_id)

    def test_giochi_aggiunti_a_mano(self):
        playlist_id = self.service.create('Mano')['playlists'][0]['id']
        data = self.service.set_game(playlist_id, 'nes/Zelda.nes', True)
        data = self.service.set_game(playlist_id, 'arcade/sf2.zip', True)
        data = self.service.set_game(playlist_id, 'nes/Zelda.nes', True)
        self.assertEqual(data['playlists'][0]['games'], ['nes/Zelda.nes', 'arcade/sf2.zip'])
        self.assertEqual(sorted(data['games']), ['arcade/sf2.zip', 'nes/Zelda.nes'])
        for key, on in (('nes/Manca.nes', True), ('Zelda.nes', True), ('nes/Zelda.nes', 'sì')):
            with self.assertRaises(PlaylistError):
                self.service.set_game(playlist_id, key, on)
        # Un gioco non più presente si può comunque togliere.
        data = self.service.set_game(playlist_id, 'nes/Manca.nes', False)
        data = self.service.set_game(playlist_id, 'nes/Zelda.nes', False)
        self.assertEqual(data['playlists'][0]['games'], ['arcade/sf2.zip'])
        self.service.delete(playlist_id)
        self.assertEqual(self.db.query('SELECT COUNT(*) FROM playlist_games')[0][0], 0)

    def test_giochi_giocati(self):
        account = self.profiles.create('UNO', '#ff5d73')
        other = self.profiles.create('DUE', '#3ccfc4')
        for game in ('sf2.zip', 'sf2.zip', 'pang.zip'):
            session = self.sessions.start('arcade', game, 'fbneo', NOW)
            self.sessions.finish(session, NOW, 60, 0)
            self.profiles.record_session(session, [account['id'], None], 60)
        self.assertEqual(self.profiles.played_keys(account['id']), ['arcade/pang.zip', 'arcade/sf2.zip'])
        self.assertEqual(self.profiles.played_keys(other['id']), [])


if __name__ == '__main__':
    unittest.main()
