import hashlib
import io
import os
import tempfile
import unittest
import urllib.error

from pixelarcade.errors import ProfileError
from pixelarcade.gravatar import TTL, GravatarCache, email_hash, image_type

PNG = b'\x89PNG\r\n\x1a\nimmagine'
JPEG = b'\xff\xd8\xffimmagine'
DIGEST = hashlib.sha256(b'luca@example.com').hexdigest()


class FakeResponse(io.BytesIO):
    status = 200


class FakeOpener:
    """Gravatar finto: risponde con ``reply`` (byte, ``404`` o ``offline``) e ricorda gli URL chiesti."""

    def __init__(self, reply=PNG):
        self.reply = reply
        self.urls = []

    def __call__(self, request, timeout):
        self.urls.append(request.full_url)
        if self.reply == 'offline':
            raise urllib.error.URLError('rete assente')
        if self.reply == 404:
            raise urllib.error.HTTPError(request.full_url, 404, 'Not Found', {}, None)
        return FakeResponse(self.reply)


class EmailHashTest(unittest.TestCase):
    def test_email_normalizzata(self):
        self.assertEqual(email_hash('  Luca@Example.COM\n'), DIGEST)
        for value in ('', 'luca', 'luca@example', 'lu ca@example.com', None, 7, 'a' * 250 + '@b.it'):
            with self.assertRaises(ProfileError, msg=value):
                email_hash(value)

    def test_tipo_immagine(self):
        self.assertEqual(image_type(PNG), 'image/png')
        self.assertEqual(image_type(JPEG), 'image/jpeg')
        self.assertIsNone(image_type(b'<html>'))


class GravatarCacheTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.clock = [1000000.0]
        self.opener = FakeOpener()
        self.cache = GravatarCache(self.tmp.name, self.opener, lambda: self.clock[0])

    def tearDown(self):
        self.tmp.cleanup()

    def age(self, seconds):
        """Fa invecchiare i file della cache di ``seconds`` secondi."""
        self.clock[0] += seconds

    def touch_all(self):
        for name in os.listdir(self.tmp.name):
            os.utime(os.path.join(self.tmp.name, name), (self.clock[0], self.clock[0]))

    def test_scarica_e_poi_legge_dalla_cache(self):
        self.assertEqual(self.cache.get(DIGEST), (PNG, 'image/png'))
        self.assertEqual(self.opener.urls, ['https://gravatar.com/avatar/%s?s=160&d=404' % DIGEST])
        self.touch_all()
        self.assertEqual(self.cache.get(DIGEST), (PNG, 'image/png'))
        self.assertEqual(len(self.opener.urls), 1)
        self.age(TTL + 1)
        self.opener.reply = JPEG
        self.assertEqual(self.cache.get(DIGEST), (JPEG, 'image/jpeg'))
        self.assertEqual(len(self.opener.urls), 2)

    def test_senza_gravatar_si_ricorda(self):
        self.opener.reply = 404
        self.assertIsNone(self.cache.get(DIGEST))
        self.touch_all()
        self.assertIsNone(self.cache.get(DIGEST))
        self.assertEqual(len(self.opener.urls), 1)
        self.age(TTL + 1)
        self.opener.reply = PNG
        self.assertEqual(self.cache.get(DIGEST), (PNG, 'image/png'))
        self.assertEqual(os.listdir(self.tmp.name), [DIGEST + '.img'])

    def test_immagine_tolta_da_gravatar(self):
        self.cache.get(DIGEST)
        self.touch_all()
        self.age(TTL + 1)
        self.opener.reply = 404
        self.assertIsNone(self.cache.get(DIGEST))
        self.assertEqual(os.listdir(self.tmp.name), [DIGEST + '.missing'])

    def test_offline_usa_la_cache_scaduta(self):
        self.cache.get(DIGEST)
        self.touch_all()
        self.age(TTL + 1)
        self.opener.reply = 'offline'
        self.assertEqual(self.cache.get(DIGEST), (PNG, 'image/png'))
        empty = GravatarCache(os.path.join(self.tmp.name, 'vuota'), self.opener)
        self.assertIsNone(empty.get(DIGEST))

    def test_risposte_non_valide(self):
        self.opener.reply = b'<html>non un\'immagine</html>'
        self.assertIsNone(self.cache.get(DIGEST))
        self.opener.reply = PNG + b'x' * (1024 * 1024)
        self.assertIsNone(self.cache.get(DIGEST))
        self.assertEqual(os.listdir(self.tmp.name), [])
        for digest in (None, 'abc', DIGEST.upper(), '../' + DIGEST[3:]):
            self.assertIsNone(self.cache.get(digest))
        self.assertEqual(len(self.opener.urls), 2)

    def test_senza_cartella_scarica_ogni_volta(self):
        cache = GravatarCache(None, self.opener)
        self.assertEqual(cache.get(DIGEST), (PNG, 'image/png'))
        self.assertEqual(cache.get(DIGEST), (PNG, 'image/png'))
        self.assertEqual(len(self.opener.urls), 2)


if __name__ == '__main__':
    unittest.main()
