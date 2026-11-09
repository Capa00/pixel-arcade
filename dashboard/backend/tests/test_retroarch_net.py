import os
import tempfile
import unittest

from pixelarcade.errors import RetroArchError
from pixelarcade.retroarch_net import LOAD_AFTER_SAVE, PAUSED, PLAYING, RetroArchNet, parse_status

from tests.fakes import FakeClock, fake_png


class FakeRetroArch:
    """RetroArch finto che riceve i comandi di rete.

    ``status`` è ``PLAYING``, ``PAUSED`` oppure ``None`` (non risponde);
    ``SAVE_STATE`` scrive ``state`` (e la miniatura, se ``thumb``) in
    ``path``; ``ignore`` sono i comandi che non hanno effetto.
    """

    def __init__(self, path=None):
        self.status = PLAYING
        self.path = path
        self.thumb = True
        self.state = b'stato'
        self.ignore = set()
        self.received = []
        self.shots = 0

    def handle(self, command):
        self.received.append(command)
        if command in self.ignore:
            return None
        if command == 'GET_STATUS':
            return None if self.status is None else 'GET_STATUS %s nes,Zelda,crc32=1234abcd' % self.status
        if command == 'PAUSE_TOGGLE':
            self.status = PAUSED if self.status == PLAYING else PLAYING
        elif command == 'SCREENSHOT':
            self.shots += 1
            name = 'Zelda-261001-1000%02d.png' % self.shots
            with open(os.path.join(os.path.dirname(self.path), name), 'wb') as stream:
                stream.write(fake_png(b'cattura'))
        elif command == 'SAVE_STATE':
            with open(self.path, 'wb') as stream:
                stream.write(self.state)
            if self.thumb:
                with open(self.path + '.png', 'wb') as stream:
                    stream.write(fake_png())
        return None


class FakeSocket:
    def __init__(self, retroarch):
        self.retroarch = retroarch
        self.reply = None
        self.closed = False

    def settimeout(self, value):
        self.timeout = value

    def sendto(self, data, address):
        self.address = address
        self.reply = self.retroarch.handle(data.decode('ascii'))

    def recvfrom(self, size):
        if self.reply is None:
            raise TimeoutError('timed out')
        return self.reply.encode('utf-8'), ('127.0.0.1', 55355)

    def close(self):
        self.closed = True


class RetroArchNetTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, 'Zelda.state')
        self.retroarch = FakeRetroArch(self.path)
        self.clock = FakeClock()
        self.sockets = []

        def factory():
            sock = FakeSocket(self.retroarch)
            self.sockets.append(sock)
            return sock

        self.net = RetroArchNet(55400, socket_factory=factory, clock=self.clock, sleep=self.clock.wait)

    def tearDown(self):
        self.tmp.cleanup()

    def test_stato(self):
        self.assertEqual(parse_status('GET_STATUS PAUSED snes,Zelda,crc32=1'), 'PAUSED')
        self.assertEqual(parse_status('GET_STATUS CONTENTLESS'), 'CONTENTLESS')
        self.assertIsNone(parse_status('VERSION 1.22.2'))
        self.assertIsNone(parse_status(None))
        self.assertEqual(self.net.status(), PLAYING)
        self.assertEqual(self.sockets[0].address, ('127.0.0.1', 55400))
        self.assertTrue(all(sock.closed for sock in self.sockets))
        self.retroarch.status = None
        self.assertIsNone(self.net.status())

    def test_pausa_senza_invertire(self):
        self.net.pause()
        self.assertEqual(self.retroarch.status, PAUSED)
        self.net.pause()
        self.assertEqual(self.retroarch.received.count('PAUSE_TOGGLE'), 1)
        self.assertTrue(self.net.resume())
        self.assertEqual(self.retroarch.status, PLAYING)
        self.assertFalse(self.net.resume())
        self.assertEqual(self.retroarch.received.count('PAUSE_TOGGLE'), 2)

    def test_pausa_non_riuscita(self):
        self.retroarch.ignore.add('PAUSE_TOGGLE')
        with self.assertRaises(RetroArchError):
            self.net.pause()
        self.retroarch.status = None
        with self.assertRaises(RetroArchError):
            self.net.pause()
        self.assertFalse(self.net.resume())

    def test_salvataggio_con_miniatura(self):
        self.assertTrue(self.net.save_state(self.path))
        with open(self.path, 'rb') as stream:
            self.assertEqual(stream.read(), b'stato')
        self.assertIn('SAVE_STATE', self.retroarch.received)

    def test_salvataggio_senza_miniatura_nuova(self):
        for name in (self.path, self.path + '.png'):
            with open(name, 'wb') as stream:
                stream.write(b'vecchio')
        self.retroarch.thumb = False
        self.retroarch.state = b'vecchio'
        self.assertFalse(self.net.save_state(self.path))
        self.assertFalse(os.path.exists(self.path + '.png'))

    def test_salvataggio_non_riuscito(self):
        with open(self.path, 'wb') as stream:
            stream.write(b'vecchio')
        self.retroarch.ignore.add('SAVE_STATE')
        start = self.clock()
        with self.assertRaises(RetroArchError):
            self.net.save_state(self.path, timeout=2)
        self.assertGreaterEqual(self.clock() - start, 2)

    def test_png_incompleta(self):
        # RetroArch scrive ancora la miniatura: senza il blocco finale non vale.
        self.retroarch.thumb = False
        with open(self.path + '.png', 'wb') as stream:
            stream.write(fake_png()[:-4])
        self.assertFalse(self.net.save_state(self.path))

    def test_cattura(self):
        with open(self.path + '.png', 'wb') as stream:
            stream.write(b'miniatura')
        first = self.net.screenshot(self.tmp.name)
        self.assertEqual(os.path.basename(first), 'Zelda-261001-100001.png')
        self.assertEqual(os.path.basename(self.net.screenshot(self.tmp.name)), 'Zelda-261001-100002.png')
        self.retroarch.ignore.add('SCREENSHOT')
        self.assertIsNone(self.net.screenshot(self.tmp.name, timeout=1))
        self.assertIsNone(self.net.screenshot(os.path.join(self.tmp.name, 'manca'), timeout=1))

    def test_caricamento(self):
        self.net.load_state()
        self.assertEqual(self.retroarch.received[-1], 'LOAD_STATE')
        self.assertNotIn('LOAD_STATE_SLOT', ' '.join(self.retroarch.received))
        self.retroarch.status = None
        with self.assertRaises(RetroArchError):
            self.net.load_state()

    def test_caricamento_dopo_un_salvataggio(self):
        # RetroArch scarta un LOAD_STATE che arriva subito dopo un SAVE_STATE: si aspetta LOAD_AFTER_SAVE.
        self.retroarch.status = PAUSED
        self.net.save_state(self.path, thumb_timeout=0)
        saved = self.clock()
        self.net.load_state()
        self.assertGreaterEqual(self.clock() - saved, LOAD_AFTER_SAVE)
        self.assertEqual(self.retroarch.received[-1], 'LOAD_STATE')
        # Passato già abbastanza tempo, non si aspetta altro.
        self.net.save_state(self.path, thumb_timeout=0)
        self.clock.wait(LOAD_AFTER_SAVE + 1)
        before = self.clock()
        self.net.load_state()
        self.assertEqual(self.clock(), before)


if __name__ == '__main__':
    unittest.main()
