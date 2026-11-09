import io
import os
import tempfile
import unittest
import urllib.error

from pixelarcade import thumbnails
from pixelarcade.thumbnails import ImageCache, cache_dir, image_url, libretro_name

PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 32
SYSTEM = 'Sony - PlayStation'

UNHOLY = {'id': 'unholy-war', 'thumbnail': 'Unholy War, The (Europe) (En,Fr,De,Es,It)'}


class FakeResponse(io.BytesIO):
    def __init__(self, data, content_type='image/png', status=200):
        super().__init__(data)
        self.status = status
        self.headers = {'Content-Type': content_type}


class FakeOpener:
    """Server finto: conta le chiamate e restituisce la risposta indicata."""

    def __init__(self, data=PNG, content_type='image/png', status=200, error=None):
        self.calls = []
        self.data = data
        self.content_type = content_type
        self.status = status
        self.error = error

    def __call__(self, url, timeout):
        self.calls.append((url, timeout))
        if self.error:
            raise self.error
        if callable(self.data):
            return self.data(url)
        return FakeResponse(self.data, self.content_type, self.status)


def not_found(url):
    raise urllib.error.HTTPError(url, 404, 'Not Found', {}, None)


class ImageCacheTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = os.path.join(self.tmp.name, 'thumbnails')

    def cache(self, opener):
        return ImageCache(self.dir, opener)

    def test_download_then_cache(self):
        opener = FakeOpener()
        cache = self.cache(opener)
        self.assertEqual(cache.get(UNHOLY, 'cover', SYSTEM), PNG)
        self.assertEqual(len(opener.calls), 1)
        self.assertEqual(opener.calls[0][1], 15)
        path = os.path.join(self.dir, 'unholy-war', 'cover.png')
        with open(path, 'rb') as stream:
            self.assertEqual(stream.read(), PNG)
        self.assertFalse(os.path.exists(path + '.tmp'))
        self.assertEqual(cache.get(UNHOLY, 'cover', SYSTEM), PNG)
        self.assertEqual(len(opener.calls), 1)

    def test_cache_survives_new_instance(self):
        self.cache(FakeOpener()).get(UNHOLY, 'snap', SYSTEM)
        opener = FakeOpener(error=urllib.error.URLError('rete assente'))
        self.assertEqual(self.cache(opener).get(UNHOLY, 'snap', SYSTEM), PNG)
        self.assertEqual(opener.calls, [])

    def test_without_cache_dir_downloads_every_time(self):
        opener = FakeOpener()
        cache = ImageCache(None, opener)
        self.assertEqual(cache.get(UNHOLY, 'cover', SYSTEM), PNG)
        self.assertEqual(cache.get(UNHOLY, 'cover', SYSTEM), PNG)
        self.assertEqual(len(opener.calls), 2)

    def test_network_error(self):
        opener = FakeOpener(error=urllib.error.URLError('rete assente'))
        with self.assertLogs('pixelarcade.thumbnails', 'WARNING') as logs:
            cache = self.cache(opener)
            self.assertIsNone(cache.get(UNHOLY, 'cover', SYSTEM))
            self.assertIsNone(cache.get(UNHOLY, 'cover', SYSTEM))
        self.assertEqual(len(opener.calls), 2)
        self.assertEqual(len(logs.records), 1)
        self.assertFalse(os.path.exists(os.path.join(self.dir, 'unholy-war')))

    def test_not_png(self):
        opener = FakeOpener(data=b'<html>no</html>', content_type='text/html')
        self.assertIsNone(self.cache(opener).get(UNHOLY, 'title', SYSTEM))
        self.assertFalse(os.path.exists(os.path.join(self.dir, 'unholy-war', 'title.png')))

    def test_png_signature_without_content_type(self):
        opener = FakeOpener(content_type='application/octet-stream')
        self.assertEqual(self.cache(opener).get(UNHOLY, 'title', SYSTEM), PNG)

    def test_http_status_not_200(self):
        self.assertIsNone(self.cache(FakeOpener(status=204)).get(UNHOLY, 'cover', SYSTEM))

    def test_too_large(self):
        opener = FakeOpener(data=PNG + b'\x00' * thumbnails.MAX_SIZE)
        self.assertIsNone(self.cache(opener).get(UNHOLY, 'cover', SYSTEM))
        self.assertFalse(os.path.exists(os.path.join(self.dir, 'unholy-war', 'cover.png')))

    def test_url_is_quoted(self):
        opener = FakeOpener()
        cache = self.cache(opener)
        for kind in ('cover', 'title', 'snap'):
            cache.get(UNHOLY, kind, SYSTEM)
        name = 'Unholy%20War%2C%20The%20%28Europe%29%20%28En%2CFr%2CDe%2CEs%2CIt%29.png'
        base = 'https://thumbnails.libretro.com/Sony%20-%20PlayStation/'
        self.assertEqual([url for url, _ in opener.calls], [
            base + 'Named_Boxarts/' + name,
            base + 'Named_Titles/' + name,
            base + 'Named_Snaps/' + name,
        ])

    def test_nothing_to_download(self):
        opener = FakeOpener()
        cache = self.cache(opener)
        self.assertIsNone(cache.get({'id': 'senza', 'thumbnail': ''}, 'cover', SYSTEM))
        self.assertIsNone(cache.get(UNHOLY, 'cover', None))
        self.assertIsNone(cache.get(UNHOLY, 'poster', SYSTEM))
        self.assertEqual(opener.calls, [])

    def test_missing_image_is_remembered(self):
        opener = FakeOpener(data=not_found)
        self.assertIsNone(self.cache(opener).get(UNHOLY, 'cover', SYSTEM))
        self.assertTrue(os.path.isfile(os.path.join(self.dir, 'unholy-war', 'cover.missing')))
        self.assertIsNone(self.cache(opener).get(UNHOLY, 'cover', SYSTEM))
        self.assertEqual(len(opener.calls), 1)

    def test_missing_image_is_asked_again_later(self):
        self.cache(FakeOpener(data=not_found)).get(UNHOLY, 'cover', SYSTEM)
        marker = os.path.join(self.dir, 'unholy-war', 'cover.missing')
        old = os.path.getmtime(marker) - thumbnails.MISSING_TTL - 1
        os.utime(marker, (old, old))
        opener = FakeOpener()
        self.assertEqual(self.cache(opener).get(UNHOLY, 'cover', SYSTEM), PNG)
        self.assertEqual(len(opener.calls), 1)

    def test_network_error_is_not_remembered(self):
        opener = FakeOpener(error=urllib.error.URLError('rete assente'))
        with self.assertLogs('pixelarcade.thumbnails', 'WARNING'):
            self.cache(opener).get(UNHOLY, 'cover', SYSTEM)
        self.assertFalse(os.path.exists(os.path.join(self.dir, 'unholy-war', 'cover.missing')))

    def test_first_available(self):
        def only_snap(url):
            if 'Named_Snaps' not in url:
                not_found(url)
            return FakeResponse(PNG)

        opener = FakeOpener(data=only_snap)
        cache = self.cache(opener)
        self.assertEqual(cache.first(UNHOLY, thumbnails.FALLBACK, SYSTEM), ('snap', PNG))
        self.assertEqual(len(opener.calls), 3)
        self.assertEqual(cache.first(UNHOLY, thumbnails.FALLBACK, SYSTEM), ('snap', PNG))
        self.assertEqual(len(opener.calls), 3)
        self.assertEqual(cache.first(UNHOLY, ('cover',), SYSTEM), (None, None))

    def test_libretro_name(self):
        self.assertEqual(libretro_name('A&B*C/D:E`F<G>H?I\\J|K"L'), 'A_B_C_D_E_F_G_H_I_J_K_L')
        self.assertEqual(libretro_name('Actua Pool (Europe)'), 'Actua Pool (Europe)')

    def test_url_for_other_console(self):
        self.assertEqual(image_url('Arkanoid (USA)', 'snap', 'Nintendo - Nintendo Entertainment System'),
                         'https://thumbnails.libretro.com/Nintendo%20-%20Nintendo%20Entertainment%20System/'
                         'Named_Snaps/Arkanoid%20%28USA%29.png')

    def test_cache_dir(self):
        self.assertEqual(cache_dir('/dati'), os.path.join('/dati', 'thumbnails'))
        self.assertIsNone(cache_dir(None))


if __name__ == '__main__':
    unittest.main()
