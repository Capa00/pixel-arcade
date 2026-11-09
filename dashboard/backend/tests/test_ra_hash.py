import hashlib
import os
import tempfile
import unittest
import zipfile

from pixelarcade import ra_hash
from pixelarcade.ra_cores import COMPATIBLE
from pixelarcade.systems import PRESETS


def md5(data):
    return hashlib.md5(data).hexdigest()


class RAHashTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name, data):
        path = os.path.join(self.tmp.name, name)
        with open(path, 'wb') as stream:
            stream.write(data)
        return path

    def test_ogni_preset_ha_una_console(self):
        # Le console aggiunte dai core di RetroArch (2026-11-09) non hanno ancora il calcolo dell'hash.
        self.assertLessEqual(set(ra_hash.CONSOLES), set(PRESETS))
        self.assertEqual(sorted(ra_hash.CONSOLES), sorted(COMPATIBLE))
        self.assertEqual(ra_hash.console_ids('md'), [1, 10])
        self.assertEqual(ra_hash.console_ids('sconosciuta'), [])

    def test_file_intero(self):
        path = self.write('gioco.gb', b'ROM DEL GAME BOY')
        self.assertEqual(ra_hash.file_hash(path, 'gb'), md5(b'ROM DEL GAME BOY'))

    def test_nes_senza_intestazione(self):
        body = b'\x01' * 64
        path = self.write('gioco.nes', b'NES\x1a' + b'\x00' * 12 + body)
        self.assertEqual(ra_hash.file_hash(path, 'nes'), md5(body))
        path = self.write('gioco.fds', b'FDS\x1a' + b'\x00' * 12 + body)
        self.assertEqual(ra_hash.file_hash(path, 'nes'), md5(body))
        path = self.write('senza.nes', body)
        self.assertEqual(ra_hash.file_hash(path, 'nes'), md5(body))

    def test_snes_con_e_senza_copier(self):
        body = b'\x02' * 0x4000
        path = self.write('gioco.smc', b'\xff' * 512 + body)
        self.assertEqual(ra_hash.file_hash(path, 'snes'), md5(body))
        path = self.write('gioco.sfc', body)
        self.assertEqual(ra_hash.file_hash(path, 'snes'), md5(body))

    def test_altre_intestazioni(self):
        body = b'\x03' * 0x2000
        self.assertEqual(ra_hash.content_hash('pce', b'\x00' * 512 + body), md5(body))
        self.assertEqual(ra_hash.content_hash('pce', body), md5(body))
        header = b'\x01ATARI7800' + b'\x00' * 118
        self.assertEqual(ra_hash.content_hash('atari7800', header + body), md5(body))
        self.assertEqual(ra_hash.content_hash('lynx', b'LYNX\x00' + b'\x00' * 59 + body), md5(body))

    def test_n64_in_big_endian(self):
        z64 = bytes([0x80, 0x37, 0x12, 0x40, 1, 2, 3, 4])
        v64 = bytes([0x37, 0x80, 0x40, 0x12, 2, 1, 4, 3])
        n64 = bytes([0x40, 0x12, 0x37, 0x80, 4, 3, 2, 1])
        for data in (z64, v64, n64):
            self.assertEqual(ra_hash.content_hash('n64', data), md5(z64))
        self.assertIsNone(ra_hash.content_hash('n64', b'\x00\x01'))

    def test_arcade_dal_nome(self):
        path = self.write('dkong.zip', b'non conta')
        # Valore verificato con RetroArch 1.22.2 (Donkey Kong, gioco 11943).
        self.assertEqual(ra_hash.file_hash(path, 'arcade'), '02bbe063efc4b8883206c66e6cb775c9')

    def test_zip_primo_file_con_estensione_ammessa(self):
        path = os.path.join(self.tmp.name, 'gioco.zip')
        with zipfile.ZipFile(path, 'w') as archive:
            archive.writestr('leggimi.txt', b'testo')
            archive.writestr('gioco.gbc', b'ROM GBC')
        self.assertEqual(ra_hash.file_hash(path, 'gbc', ['gbc', 'zip', '7z']), md5(b'ROM GBC'))
        self.assertIsNone(ra_hash.file_hash(path, 'gbc', ['gb']))
        self.assertIsNone(ra_hash.file_hash(self.write('rotto.zip', b'non zip'), 'gbc', ['gbc']))

    def test_non_calcolabili(self):
        self.assertIsNone(ra_hash.file_hash(self.write('gioco.7z', b'7z'), 'snes'))
        self.assertIsNone(ra_hash.file_hash(self.write('gioco.cue', b'cue'), 'psx'))
        self.assertFalse(ra_hash.supported('psx'))
        self.assertFalse(ra_hash.supported(None))
        self.assertTrue(ra_hash.supported('arcade'))
        with self.assertRaises(OSError):
            ra_hash.file_hash(os.path.join(self.tmp.name, 'manca.gb'), 'gb')


if __name__ == '__main__':
    unittest.main()
