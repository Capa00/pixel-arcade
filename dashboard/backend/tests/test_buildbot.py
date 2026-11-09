import io
import unittest
import urllib.error

from pixelarcade.buildbot import MAX_INDEX_BYTES, fetch_index, parse_index
from pixelarcade.errors import ConfigError

INDEX = '''2026-09-22 edf888ae mednafen_supergrafx_libretro.so.zip
2026-09-21 3A224A58 mesen-s_libretro.so.zip
riga estranea
2026-09-20 00000000 leggimi.txt
2026-09-20 d84226c0 vitaquake2-rogue_libretro.so.zip
'''


class FakeOpener:
    def __init__(self, data=None, error=None):
        self.data = data
        self.error = error
        self.calls = []

    def __call__(self, url, timeout):
        self.calls.append((url, timeout))
        if self.error:
            raise self.error
        return io.BytesIO(self.data)


class BuildbotTest(unittest.TestCase):
    def test_indice_valido_e_righe_estranee(self):
        self.assertEqual(parse_index(INDEX), {
            'mednafen_supergrafx': {'crc': 'edf888ae', 'date': '2026-09-22'},
            'mesen-s': {'crc': '3a224a58', 'date': '2026-09-21'},
            'vitaquake2-rogue': {'crc': 'd84226c0', 'date': '2026-09-20'},
        })

    def test_scaricamento(self):
        opener = FakeOpener(INDEX.encode())
        entries = fetch_index('https://example.test/latest/', opener)
        self.assertEqual(len(entries), 3)
        self.assertEqual(opener.calls, [('https://example.test/latest/.index-extended', 15)])

    def test_risposta_troppo_grande(self):
        with self.assertRaises(ConfigError):
            fetch_index('https://example.test/', FakeOpener(b'x' * (MAX_INDEX_BYTES + 1)))

    def test_errore_di_rete_leggibile(self):
        opener = FakeOpener(error=urllib.error.URLError('Name or service not known'))
        with self.assertRaises(ConfigError) as caught:
            fetch_index('https://example.test/', opener)
        self.assertIn('Name or service not known', str(caught.exception))

    def test_indice_vuoto(self):
        with self.assertRaises(ConfigError):
            fetch_index('https://example.test/', FakeOpener(b'<html>errore</html>'))


if __name__ == '__main__':
    unittest.main()
