import os
import stat
import tempfile
import unittest
from unittest import mock

from pixelarcade.fsutil import PNG_END, PNG_SIGNATURE, atomic_copy, atomic_write_text, png_complete


class AtomicWriteTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, 'file.cfg')

    def tearDown(self):
        self.tmp.cleanup()

    def test_scrive_il_testo(self):
        atomic_write_text(self.path, 'chiave = "è"\n')
        with open(self.path, encoding='utf-8') as stream:
            self.assertEqual(stream.read(), 'chiave = "è"\n')

    def test_sostituisce_il_file_esistente(self):
        atomic_write_text(self.path, 'vecchio')
        atomic_write_text(self.path, 'nuovo')
        with open(self.path, encoding='utf-8') as stream:
            self.assertEqual(stream.read(), 'nuovo')

    def test_permessi(self):
        atomic_write_text(self.path, 'x')
        self.assertEqual(stat.S_IMODE(os.stat(self.path).st_mode), 0o600)
        atomic_write_text(self.path, 'x', mode=0o644)
        self.assertEqual(stat.S_IMODE(os.stat(self.path).st_mode), 0o644)

    def test_errore_non_lascia_temporanei(self):
        atomic_write_text(self.path, 'originale')
        with mock.patch('pixelarcade.fsutil.os.replace', side_effect=OSError('guasto')):
            with self.assertRaises(OSError):
                atomic_write_text(self.path, 'nuovo')
        self.assertEqual(os.listdir(self.tmp.name), ['file.cfg'])
        with open(self.path, encoding='utf-8') as stream:
            self.assertEqual(stream.read(), 'originale')

    def test_errore_in_scrittura_non_lascia_temporanei(self):
        with self.assertRaises(TypeError):
            atomic_write_text(self.path, b'non testo')
        self.assertEqual(os.listdir(self.tmp.name), [])

    def test_copia_atomica(self):
        source = os.path.join(self.tmp.name, 'origine.bin')
        with open(source, 'wb') as stream:
            stream.write(b'\x00\xffdati')
        atomic_copy(source, self.path, mode=0o644)
        with open(self.path, 'rb') as stream:
            self.assertEqual(stream.read(), b'\x00\xffdati')
        self.assertEqual(stat.S_IMODE(os.stat(self.path).st_mode), 0o644)
        with self.assertRaises(FileNotFoundError):
            atomic_copy(os.path.join(self.tmp.name, 'manca'), self.path)
        self.assertEqual(sorted(os.listdir(self.tmp.name)), ['file.cfg', 'origine.bin'])


class PngCompleteTest(unittest.TestCase):
    def test_png_scritta_per_intero(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, 'a.png')
            self.assertFalse(png_complete(path))
            for data, expected in ((PNG_SIGNATURE + b'dati' + PNG_END, True), ((PNG_SIGNATURE + b'dati' + PNG_END)[:-1], False),
                                   (b'GIF89a' + PNG_END, False), (b'', False)):
                with open(path, 'wb') as stream:
                    stream.write(data)
                self.assertEqual(png_complete(path), expected, data)


if __name__ == '__main__':
    unittest.main()
