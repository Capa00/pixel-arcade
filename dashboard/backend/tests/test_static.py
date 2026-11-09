import os
import tempfile
import unittest

from pixelarcade.web import static


class ResolveTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dist = os.path.join(self.tmp.name, 'dist')
        os.makedirs(os.path.join(self.dist, 'assets'))
        self.write('index.html')
        self.write('assets/app-123.js')
        self.write('assets/font.woff2')
        self.write('assets/image-123.webp')
        self.write('note.txt')
        with open(os.path.join(self.tmp.name, 'segreto.html'), 'w') as stream:
            stream.write('x')

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, relative):
        with open(os.path.join(self.dist, relative), 'w') as stream:
            stream.write('x')

    def test_radice_su_index(self):
        path, content_type, cache = static.resolve(self.dist, '/')
        self.assertEqual(path, os.path.join(os.path.realpath(self.dist), 'index.html'))
        self.assertEqual(content_type, 'text/html; charset=utf-8')
        self.assertEqual(cache, 'no-store')

    def test_asset_con_cache_lunga(self):
        path, content_type, cache = static.resolve(self.dist, '/assets/app-123.js')
        self.assertTrue(path.endswith('app-123.js'))
        self.assertEqual(content_type, 'text/javascript; charset=utf-8')
        self.assertIn('immutable', cache)
        self.assertEqual(static.resolve(self.dist, '/assets/font.woff2')[1], 'font/woff2')
        self.assertEqual(static.resolve(self.dist, '/assets/image-123.webp')[1], 'image/webp')

    def test_estensione_non_consentita(self):
        self.assertIsNone(static.resolve(self.dist, '/note.txt'))

    def test_file_inesistente(self):
        self.assertIsNone(static.resolve(self.dist, '/manca.js'))

    def test_percorsi_fuori_da_dist(self):
        self.assertIsNone(static.resolve(self.dist, '/../segreto.html'))
        self.assertIsNone(static.resolve(self.dist, '/%2e%2e/segreto.html'))
        self.assertIsNone(static.resolve(self.dist, '/assets/../../segreto.html'))
        self.assertIsNone(static.resolve(self.dist, '//segreto.html'))
        self.assertIsNone(static.resolve(self.dist, '/..%5csegreto.html'))

    def test_symlink_rifiutati(self):
        os.symlink(os.path.join(self.tmp.name, 'segreto.html'), os.path.join(self.dist, 'link.html'))
        os.symlink(os.path.join(self.dist, 'assets'), os.path.join(self.dist, 'cartella'))
        self.assertIsNone(static.resolve(self.dist, '/link.html'))
        self.assertIsNone(static.resolve(self.dist, '/cartella/app-123.js'))


if __name__ == '__main__':
    unittest.main()
