import hashlib
import json
import os
import tempfile
import unittest
import zlib

from pixelarcade import gameinfo
from pixelarcade.gameinfo import GameInfo, HashCache, Index, file_hashes, file_key, normalize, read_metadata
from pixelarcade.library import Library
from pixelarcade.web import api
from pixelarcade.web.router import RawResponse, Request, Router

from tests.test_library import FakeConfig

PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 16

ZELDA = b'zelda'
CONTRA = b'contra'


def crc(data):
    return '%08x' % zlib.crc32(data)


def md5(data):
    return hashlib.md5(data).hexdigest()


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as stream:
        stream.write(data)


def metadata(*entries):
    return {'games': list(entries)}


ENTRIES = [
    {'id': 'zelda-nes', 'title': 'The Legend of Zelda', 'year': 1986, 'genre': ['Avventura'], 'players': '1',
     'developer': 'Nintendo', 'publisher': 'Nintendo', 'region': 'Europa', 'languages': ['en'],
     'description': 'Avventura.', 'plot': None, 'thumbnail': 'Legend of Zelda, The (Europe)',
     'hashes': {'md5': md5(ZELDA)}, 'keys': ['thelegendofzelda', 'legendofzeldathe', 'zelda'], 'achievements': True},
    {'id': 'contra-nes', 'title': 'Contra', 'year': 1988, 'genre': ['Azione'], 'players': '1–2',
     'thumbnail': 'Contra (USA)', 'hashes': {'md5': md5(CONTRA)}, 'keys': ['contra'], 'achievements': True},
    {'id': 'tetris-a', 'title': 'Tetris', 'hashes': {'md5': md5(b'tetris-a')}, 'keys': ['tetris']},
    {'id': 'tetris-b', 'title': 'Tetris', 'hashes': {'md5': md5(b'tetris-b')}, 'keys': ['tetris']},
]


class NormalizeTest(unittest.TestCase):
    def test_normalize(self):
        self.assertEqual(normalize('Tom & Jerry (Europe) [!]'), 'tomandjerry')
        self.assertEqual(normalize('Pokémon: Edición Azul'), 'pokemonedicionazul')
        self.assertEqual(normalize("'96 Zenkoku Koukou Soccer"), '96zenkokukoukousoccer')
        self.assertEqual(normalize(''), '')
        self.assertEqual(normalize(None), '')

    def test_file_key(self):
        self.assertEqual(file_key('Super_Mario Bros (USA).nes'), 'supermariobros')
        self.assertEqual(file_key('yard.zip'), 'yard')


class IndexTest(unittest.TestCase):
    def setUp(self):
        self.index = Index(ENTRIES)

    def test_hash_first(self):
        entry, match = self.index.match({'md5': md5(ZELDA)}, 'contra')
        self.assertEqual((entry['id'], match), ('zelda-nes', 'hash'))

    def test_hash_is_case_insensitive(self):
        entry, match = self.index.match({'md5': md5(CONTRA).upper()}, '')
        self.assertEqual((entry['id'], match), ('contra-nes', 'hash'))

    def test_name_when_hash_unknown(self):
        entry, match = self.index.match({'md5': md5(b'altro')}, 'zelda')
        self.assertEqual((entry['id'], match), ('zelda-nes', 'name'))

    def test_ambiguous_name_gives_nothing(self):
        self.assertEqual(self.index.match({}, 'tetris'), (None, None))
        self.assertEqual(self.index.match({}, 'nessuno'), (None, None))


class ReadMetadataTest(unittest.TestCase):
    def test_invalid_entries_are_skipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'nes.json')
            with open(path, 'w', encoding='utf-8') as stream:
                json.dump(metadata(ENTRIES[0], {'id': 'senza-titolo'}, ENTRIES[0], 'x'), stream)
            with self.assertLogs('pixelarcade.gameinfo', 'WARNING'):
                entries = read_metadata(path)
            self.assertEqual([entry['id'] for entry in entries], ['zelda-nes'])
            self.assertEqual(read_metadata(os.path.join(tmp, 'manca.json')), [])

    def test_public_files_are_valid(self):
        """I metadati pubblici hanno id unici tra tutte le console e solo i campi previsti."""
        allowed = set(gameinfo.FIELDS) | {'id', 'thumbnail', 'thumbnailSystem', 'hashes', 'keys', 'achievements'}
        seen = set()
        for name in sorted(os.listdir(gameinfo.METADATA_DIR)):
            entries = read_metadata(os.path.join(gameinfo.METADATA_DIR, name))
            self.assertTrue(entries, name)
            for entry in entries:
                self.assertNotIn(entry['id'], seen)
                seen.add(entry['id'])
                self.assertLessEqual(set(entry), allowed, entry['id'])
                self.assertTrue(entry['hashes'], entry['id'])
                self.assertIn(entry.get('achievements'), (True, False, None), entry['id'])
                self.assertNotIn('http', json.dumps(entry), entry['id'])


class HashTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def path(self, *parts):
        return os.path.join(self.tmp.name, *parts)

    def test_file_hashes(self):
        write(self.path('a.nes'), ZELDA)
        self.assertEqual(file_hashes(self.path('a.nes')), {'crc32': crc(ZELDA), 'md5': md5(ZELDA)})

    def test_playlist_uses_first_file(self):
        write(self.path('.gioco', 'Disco 1.cue'), b'disco 1')
        write(self.path('.gioco', 'Disco 2.cue'), b'disco 2')
        write(self.path('Gioco.m3u'), b'# commento\n\n.gioco/Disco 1.cue\n.gioco/Disco 2.cue\n')
        self.assertEqual(file_hashes(self.path('Gioco.m3u'))['md5'], md5(b'disco 1'))
        write(self.path('Vuota.m3u'), b'')
        self.assertEqual(file_hashes(self.path('Vuota.m3u')), {})

    def test_large_files_are_skipped(self):
        write(self.path('grande.bin'), b'x' * 10)
        old = gameinfo.MAX_HASH_SIZE
        gameinfo.MAX_HASH_SIZE = 5
        try:
            self.assertEqual(file_hashes(self.path('grande.bin')), {})
        finally:
            gameinfo.MAX_HASH_SIZE = old

    def test_cache_in_background_and_saved(self):
        write(self.path('a.nes'), ZELDA)
        stat = os.stat(self.path('a.nes'))
        item = (self.path('a.nes'), stat.st_size, stat.st_mtime_ns)
        cache = HashCache(self.path('data', 'hashes.json'))
        self.assertIsNone(cache.get(*item))
        self.assertEqual(cache.request('nes', [item]), 1)
        cache.join(5)
        self.assertEqual(cache.get(*item)['md5'], md5(ZELDA))
        self.assertEqual(cache.request('nes', [item]), 0)
        again = HashCache(self.path('data', 'hashes.json'), hasher=self.fail)
        self.assertEqual(again.get(*item)['md5'], md5(ZELDA))
        self.assertIsNone(again.get(item[0], item[1] + 1, item[2]))

    def test_unreadable_file_is_not_retried(self):
        item = (self.path('manca.nes'), 3, 1)
        cache = HashCache()
        with self.assertLogs('pixelarcade.gameinfo', 'WARNING'):
            cache.request('nes', [item])
            cache.join(5)
        self.assertEqual(cache.get(*item), {})

    def test_remember_skips_reading(self):
        write(self.path('a.nes'), ZELDA)
        cache = HashCache(hasher=self.fail)
        cache.remember(self.path('a.nes'), {'md5': md5(ZELDA).upper(), 'sha1': 'x'})
        stat = os.stat(self.path('a.nes'))
        self.assertEqual(cache.get(self.path('a.nes'), stat.st_size, stat.st_mtime_ns), {'md5': md5(ZELDA)})

    def test_first_group_goes_first(self):
        order = []

        def hasher(path):
            order.append(os.path.basename(path))
            return {}

        cache = HashCache(hasher=hasher)
        cache._thread = FakeThread()
        cache.request('a', [('a1', 1, 1), ('a2', 1, 1)])
        cache.request('b', [('b1', 1, 1)], first=True)
        cache._run()
        self.assertEqual(order, ['b1', 'a1', 'a2'])

    def fail(self, path):
        raise AssertionError('il file non doveva essere riletto: %s' % path)


class FakeThread:
    """Thread che risulta sempre attivo: la coda si svuota chiamando ``_run`` a mano."""

    def is_alive(self):
        return True

    def join(self, timeout=None):
        pass


class LibraryMetadataTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.roms = os.path.join(self.tmp.name, 'games')
        self.meta = os.path.join(self.tmp.name, 'metadata')
        os.makedirs(self.meta)
        with open(os.path.join(self.meta, 'nes.json'), 'w', encoding='utf-8') as stream:
            json.dump(metadata(*ENTRIES), stream)
        self.info = GameInfo(os.path.join(self.tmp.name, 'data'), self.meta)
        self.addCleanup(self.info.stop)
        self.library = Library(FakeConfig(self.roms), info=self.info)

    def game_file(self, name, data, system='nes'):
        write(os.path.join(self.roms, system, name), data)

    def status(self, system='nes'):
        return self.library.games_status(system, first=True)

    def ready(self, system='nes'):
        self.status(system)
        self.info.hashes.join(5)
        games, pending = self.status(system)
        self.assertEqual(pending, 0)
        return {game['id']: game for game in games}

    def test_metadata_after_hashes(self):
        self.game_file('zelda (qualsiasi nome).nes', ZELDA)
        games, pending = self.status()
        self.assertEqual(pending, 1)
        self.assertIsNone(games[0]['match'])
        self.assertEqual(games[0]['title'], 'zelda')
        game = self.ready()['zelda (qualsiasi nome).nes']
        self.assertEqual(game['title'], 'The Legend of Zelda')
        self.assertEqual((game['match'], game['metaId'], game['cover']), ('hash', 'zelda-nes', True))
        self.assertEqual((game['year'], game['genre'], game['players']), (1986, ['Avventura'], '1'))
        self.assertEqual(game['file'], 'zelda (qualsiasi nome).nes')
        self.assertNotIn('hashes', game)
        self.assertNotIn('keys', game)

    def test_name_match_and_ambiguous_name(self):
        self.game_file('Contra (Japan).nes', b'altra versione')
        self.game_file('Tetris.nes', b'tetris c')
        self.game_file('Sconosciuto.nes', b'?')
        games = self.ready()
        self.assertEqual((games['Contra (Japan).nes']['metaId'], games['Contra (Japan).nes']['match']),
                         ('contra-nes', 'name'))
        self.assertIsNone(games['Tetris.nes']['match'])
        self.assertIsNone(games['Sconosciuto.nes']['match'])
        self.assertNotIn('metaId', games['Sconosciuto.nes'])

    def test_achievements_only_for_the_same_file(self):
        self.game_file('Zelda.nes', ZELDA)
        self.game_file('Contra (Japan).nes', b'altra versione')
        self.game_file('Sconosciuto.nes', b'?')
        games = self.ready()
        self.assertIs(games['Zelda.nes']['achievements'], True)
        self.assertIsNone(games['Contra (Japan).nes']['achievements'])
        self.assertIsNone(games['Sconosciuto.nes']['achievements'])

    def test_sorted_by_metadata_title(self):
        self.game_file('b.nes', ZELDA)
        self.game_file('c.nes', CONTRA)
        self.ready()
        self.assertEqual([game['title'] for game in self.library.games('nes')], ['Contra', 'The Legend of Zelda'])

    def test_console_without_metadata_is_untouched(self):
        self.game_file('Gioco.pce', b'pce', 'pce')
        games, pending = self.status('pce')
        self.assertEqual(pending, 0)
        self.assertNotIn('match', games[0])

    def test_remembered_hash_needs_no_reading(self):
        self.game_file('Zelda.nes', ZELDA)
        self.info.hashes.hasher = self.fail
        self.info.remember(os.path.join(self.roms, 'nes', 'Zelda.nes'), {'md5': md5(ZELDA)})
        games, pending = self.status()
        self.assertEqual((pending, games[0]['match']), (0, 'hash'))

    def fail(self, path):
        raise AssertionError('il file non doveva essere riletto: %s' % path)


class FakeImages:
    def __init__(self, data):
        self.data = data
        self.calls = []

    def get(self, game, kind, system):
        self.calls.append((game['id'], kind, system))
        return self.data.get(kind) if isinstance(self.data, dict) else self.data

    def first(self, game, kinds, system):
        for kind in kinds:
            data = self.get(game, kind, system)
            if data is not None:
                return kind, data
        return None, None


class ImageRouteTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        roms = os.path.join(self.tmp.name, 'games')
        os.makedirs(os.path.join(roms, 'nes'))
        os.makedirs(os.path.join(roms, 'megadrive'))
        meta = os.path.join(self.tmp.name, 'metadata')
        write(os.path.join(meta, 'nes.json'), json.dumps(metadata(*ENTRIES)).encode())
        write(os.path.join(meta, 'md.json'), json.dumps(metadata(
            {'id': 'knuckles-32x', 'title': 'Knuckles', 'thumbnail': 'Knuckles (World)', 'thumbnailSystem': 'Sega - 32X',
             'hashes': {'crc32': '00000000'}, 'keys': []})).encode())
        self.info = GameInfo(None, meta)
        self.images = FakeImages(PNG)
        self.ctx = {'library': Library(FakeConfig(roms)), 'gameinfo': self.info, 'thumbnails': self.images}
        self.router = Router()
        api.register(self.router)

    def get(self, query):
        return self.router.dispatch(self.ctx, Request('GET', '/api/image', query))

    def test_image_served(self):
        status, data = self.get({'system': 'nes', 'game': 'zelda-nes', 'kind': 'title'})
        self.assertEqual(status, 200)
        self.assertIsInstance(data, RawResponse)
        self.assertEqual((data.body, data.content_type, data.cache), (PNG, 'image/png', 'private, max-age=86400'))
        self.assertEqual(self.images.calls, [('zelda-nes', 'title', 'Nintendo - Nintendo Entertainment System')])

    def test_other_libretro_folder(self):
        self.assertEqual(self.get({'system': 'megadrive', 'game': 'knuckles-32x', 'kind': 'cover'})[0], 200)
        self.assertEqual(self.images.calls, [('knuckles-32x', 'cover', 'Sega - 32X')])

    def test_invalid_requests(self):
        self.assertEqual(self.get({'system': 'nes', 'game': 'zelda-nes', 'kind': 'poster'})[0], 400)
        self.assertEqual(self.get({'system': 'nes', 'kind': 'cover'})[0], 400)
        self.assertEqual(self.get({'system': 'snes', 'game': 'zelda-nes', 'kind': 'cover'})[0], 404)
        self.assertEqual(self.get({'system': 'megadrive', 'game': 'zelda-nes', 'kind': 'cover'})[0], 404)
        self.assertEqual(self.images.calls, [])

    def test_cover_falls_back_to_title_then_snap(self):
        self.images.data = {'snap': PNG}
        status, data = self.get({'system': 'nes', 'game': 'zelda-nes', 'kind': 'cover', 'fallback': '1'})
        self.assertEqual((status, data.body), (200, PNG))
        self.assertEqual([call[1] for call in self.images.calls], ['cover', 'title', 'snap'])
        self.images.calls = []
        self.assertEqual(self.get({'system': 'nes', 'game': 'zelda-nes', 'kind': 'cover'})[0], 404)
        self.assertEqual(self.get({'system': 'nes', 'game': 'zelda-nes', 'kind': 'title', 'fallback': '1'})[0], 404)
        self.assertEqual([call[1] for call in self.images.calls], ['cover', 'title'])

    def test_image_missing(self):
        self.images.data = None
        self.assertEqual(self.get({'system': 'nes', 'game': 'contra-nes', 'kind': 'snap'}),
                         (404, {'error': 'Immagine non disponibile.'}))


if __name__ == '__main__':
    unittest.main()
