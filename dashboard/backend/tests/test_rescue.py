import os
import struct
import tempfile
import threading
import unittest
import zlib

from pixelarcade import rescue
from pixelarcade.errors import ConfigError, ConflictError, RetroArchError
from pixelarcade.rescue import (COMBO, FINAL, KEEP, PREVIOUS, STORE_MAX, SUSPECT, PeriodicSaver, RescueService,
                                RescueStore, is_dark, png_digest, suspicious)
from tests.fakes import fake_png


def png_chunk(kind, body):
    return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xffffffff)


def make_png(path, pixels, width, height, filters=(0,), color=2):
    """PNG vero a 8 bit: ``pixels(x, y)`` dà i canali del pixel; le righe usano a turno i filtri ``filters``."""
    channels = {0: 1, 2: 3, 6: 4}[color]
    previous = bytes(width * channels)
    raw = bytearray()
    for y in range(height):
        row = bytes(value for x in range(width) for value in pixels(x, y))
        kind = filters[y % len(filters)]
        encoded = bytearray(row)
        for at in range(len(row)):
            left = row[at - channels] if at >= channels else 0
            up = previous[at]
            corner = previous[at - channels] if at >= channels else 0
            if kind == 1:
                encoded[at] = (row[at] - left) & 0xff
            elif kind == 2:
                encoded[at] = (row[at] - up) & 0xff
            elif kind == 3:
                encoded[at] = (row[at] - ((left + up) >> 1)) & 0xff
            elif kind == 4:
                encoded[at] = (row[at] - rescue.paeth(left, up, corner)) & 0xff
        raw += bytes([kind]) + bytes(encoded)
        previous = row
    header = struct.pack('>IIBBBBB', width, height, 8, color, 0, 0, 0)
    data = (rescue.PNG_SIGNATURE + png_chunk(b'IHDR', header) + png_chunk(b'IDAT', zlib.compress(bytes(raw)))
            + png_chunk(b'IEND', b''))
    with open(path, 'wb') as stream:
        stream.write(data)
    return path


def black(x, y):
    return (3, 2, 5)


def scene(x, y):
    return ((x * 40) % 256, (y * 70) % 256, 128)


class PngTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def path(self, name):
        return os.path.join(self.tmp.name, name)

    def test_nera_o_no_con_tutti_i_filtri(self):
        for filters in ((0,), (1,), (2,), (3,), (4,), (0, 1, 2, 3, 4)):
            self.assertTrue(is_dark(make_png(self.path('nera.png'), black, 6, 5, filters)), filters)
            self.assertFalse(is_dark(make_png(self.path('scena.png'), scene, 6, 5, filters)), filters)
        # Qualche pixel acceso (titoli, cursore) non cambia: sotto il 2% resta nera.
        lit = make_png(self.path('quasi.png'), lambda x, y: (255, 255, 255) if (x, y) == (0, 0) else (0, 0, 0), 10, 10)
        self.assertTrue(is_dark(lit))
        self.assertTrue(is_dark(make_png(self.path('rgba.png'), lambda x, y: (1, 1, 1, 255), 4, 4, color=6)))
        self.assertTrue(is_dark(make_png(self.path('grigi.png'), lambda x, y: (5,), 4, 4, color=0)))

    def test_file_non_validi(self):
        with open(self.path('finta.png'), 'wb') as stream:
            stream.write(b'non un png')
        for name in ('finta.png', 'manca.png'):
            self.assertFalse(is_dark(self.path(name)))
            self.assertIsNone(png_digest(self.path(name)))

    def test_impronta(self):
        first = make_png(self.path('a.png'), scene, 6, 5)
        second = make_png(self.path('b.png'), scene, 6, 5)
        other = make_png(self.path('c.png'), black, 6, 5)
        self.assertEqual(png_digest(first), png_digest(second))
        self.assertNotEqual(png_digest(first), png_digest(other))


class FakeNet:
    """``save_state`` scrive stato e miniatura come RetroArch; ``error`` lo fa fallire."""

    def __init__(self, thumb=fake_png()):
        self.thumb = thumb
        self.error = None
        self.saves = 0

    def save_state(self, path):
        if self.error:
            raise RetroArchError(self.error)
        self.saves += 1
        with open(path, 'wb') as stream:
            stream.write(b'stato %d' % self.saves)
        if self.thumb is None:
            return False
        with open(path + '.png', 'wb') as stream:
            stream.write(self.thumb)
        return True


class FakeIngame:
    def __init__(self, net):
        self.net = net
        self.menu = False
        self.operation = threading.Lock()

    def menu_open(self):
        return self.menu

    def net_factory(self):
        return self.net

    def begin(self):
        if not self.operation.acquire(blocking=False):
            raise ConflictError('occupato')

    def end(self):
        self.operation.release()


class Times:
    def __init__(self):
        self.count = 0

    def __call__(self):
        self.count += 1
        return '2026-10-18T12:%02d:00+00:00' % self.count


class RescueTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.session = os.path.join(self.tmp.name, 'sessione')
        os.makedirs(self.session)
        self.store = RescueStore(os.path.join(self.tmp.name, 'data'))
        self.net = FakeNet()
        self.ingame = FakeIngame(self.net)
        self.info = {'game': {'system': 'ps1', 'id': 'sheep.cue'}, 'session': self.session, 'content': 'sheep'}
        self.times = Times()
        self.savers = []

        def factory(*args, **kwargs):
            saver = PeriodicSaver(*args, **kwargs)
            saver.start = lambda: None
            self.savers.append(saver)
            return saver

        self.interval = {'value': 60}
        self.service = RescueService(self.store, self.ingame, lambda system, game: self.interval['value'],
                                     now=self.times, saver_factory=factory)

    def tearDown(self):
        self.tmp.cleanup()

    def start(self):
        self.service.started(self.info, 'mednafen_psx_hw', lambda: False)
        return self.savers[-1] if self.savers else None

    def read(self, path):
        with open(path, 'rb') as stream:
            return stream.read()

    def final(self, png=None):
        state = os.path.join(self.session, 'sheep.state.auto')
        with open(state, 'wb') as stream:
            stream.write(b'finale')
        if png is not None:
            with open(state + '.png', 'wb') as stream:
                stream.write(png)
        return state, state + '.png'

    def test_stati_periodici_in_rotazione(self):
        saver = self.start()
        for _ in range(KEEP + 2):
            self.assertTrue(saver.save_once())
        items = saver.items()
        self.assertEqual([self.read(entry['state']) for entry in items],
                         [b'stato %d' % number for number in range(3, KEEP + 3)])
        self.assertTrue(all(entry['core'] == 'mednafen_psx_hw' and entry['png'] for entry in items))
        # Lo slot di lavoro resta vuoto e i più vecchi si cancellano.
        self.assertFalse(os.path.exists(os.path.join(self.session, 'sheep.state')))
        self.assertEqual(len(os.listdir(self.store.run_dir())), KEEP * 2)

    def test_salvataggio_rimandato_o_fermato(self):
        saver = self.start()
        self.ingame.begin()
        self.assertFalse(saver.save_once())
        self.ingame.end()
        self.net.thumb = None
        self.assertTrue(saver.save_once())
        self.assertIsNone(saver.items()[0]['png'])
        self.net.error = 'non salva'
        self.assertIsNone(saver.save_once())
        # Il blocco delle operazioni torna libero.
        self.ingame.begin()
        self.ingame.end()

    def test_intervallo_pause_e_stato_da_caricare(self):
        clock = {'now': 0.0}
        pending = {'value': True}
        saver = PeriodicSaver(self.store, self.ingame, self.info, 'core', 3, lambda: pending['value'],
                              clock=lambda: clock['now'], now=self.times)
        self.store.clear_run()

        def wait(seconds):
            clock['now'] += 1
            if clock['now'] == 4:
                pending['value'] = False
            self.ingame.menu = 6 <= clock['now'] < 9
            return clock['now'] > 14

        saver.stop_event.wait = wait
        saver.run()
        # Stato da caricare fino al giro 3, menu aperto dal 6 all'8: salvataggi ai giri 9 e 12.
        self.assertEqual(self.net.saves, 2)

    def test_disattivati_o_senza_intervallo(self):
        self.interval['value'] = 0
        self.assertIsNone(self.start())
        self.interval['value'] = None
        self.assertIsNone(self.start())

        def broken(system, game):
            raise ValueError('rotto')

        self.service.interval = broken
        self.assertIsNone(self.start())

    def test_indizi_di_blocco(self):
        saver = self.start()
        self.assertEqual(self.service.check(None, True), COMBO)
        self.assertIsNone(self.service.check(None, False))
        scena = make_png(os.path.join(self.tmp.name, 'scena.png'), scene, 6, 5)
        nera = make_png(os.path.join(self.tmp.name, 'nera.png'), black, 6, 5)
        self.assertEqual(self.service.check(nera, False), SUSPECT)
        self.assertIsNone(self.service.check(scena, False))
        # Immagine ferma: le ultime due miniature periodiche uguali alla finale.
        with open(scena, 'rb') as stream:
            self.net.thumb = stream.read()
        saver.save_once()
        self.assertIsNone(self.service.check(scena, False))
        saver.save_once()
        self.assertEqual(self.service.check(scena, False), SUSPECT)
        self.assertFalse(suspicious(os.path.join(self.tmp.name, 'manca.png'), saver.items()))

    def test_partita_finita_bene(self):
        saver = self.start()
        saver.save_once()
        saver.save_once()
        self.service.finished()
        self.service.clean_end()
        items = self.store.items('ps1', 'sheep.cue')
        self.assertEqual([self.read(entry['state']) for entry in items], [b'stato 2', b'stato 1'])
        self.assertEqual([entry['at'] for entry in items], ['2026-10-18T12:02:00+00:00', '2026-10-18T12:01:00+00:00'])
        # Una partita senza stati periodici (troppo breve) lascia quelli di prima.
        self.start()
        self.service.clean_end()
        self.assertEqual(len(self.store.items('ps1', 'sheep.cue')), 2)
        # Al massimo STORE_MAX.
        self.store.replace('ps1', 'sheep.cue', [items[0]] * (STORE_MAX + 3))
        self.assertEqual(len(self.store.items('ps1', 'sheep.cue')), STORE_MAX)

    def test_soccorso_con_uno_stato_periodico(self):
        saver = self.start()
        saver.save_once()
        self.service.finished()
        self.service.clean_end()
        saver = self.start()
        saver.save_once()
        saver.save_once()
        saver.save_once()
        final = self.final()
        question = self.service.open(COMBO, final)
        self.assertEqual([item['id'] for item in question['items']], ['r0', 'r1', 'r2', 's0'])
        self.assertEqual([item['run'] for item in question['items']], [True, True, True, False])
        self.assertTrue(question['final'])
        self.assertIsNotNone(self.service.thumb('r1'))
        self.assertIsNone(self.service.thumb('manca'))
        state, png, core = self.service.chosen('r1')
        self.assertEqual((self.read(state), core), (b'stato 3', 'mednafen_psx_hw'))
        with self.assertRaises(ConfigError):
            self.service.chosen('manca')
        path = self.service.close('r1')
        # La partita riparte dallo stato scelto: restano tutti, lui segnato come già provato.
        kept = self.store.items('ps1', 'sheep.cue')
        self.assertEqual([self.read(entry['state']) for entry in kept], [b'stato 4', b'stato 3', b'stato 2', b'stato 1'])
        self.assertEqual([entry['tried'] for entry in kept], [False, True, False, False])
        self.assertEqual((path, self.read(path)), (kept[1]['state'], b'stato 3'))
        with self.assertRaises(ConflictError):
            self.service.chosen('r1')
        # Bloccato anche lui: nella nuova scelta ci sono ancora tutti.
        self.start()
        question = self.service.open(COMBO, None)
        self.assertEqual([item['id'] for item in question['items']], ['s0', 's1', 's2', 's3'])
        self.assertEqual([item['tried'] for item in question['items']], [False, True, False, False])
        # Al massimo STORE_MAX, sempre con lo stato scelto.
        self.service.close(PREVIOUS)
        self.store.replace('ps1', 'sheep.cue', [kept[0]] * (STORE_MAX - 1) + [kept[3]])
        saver = self.start()
        saver.save_once()
        saver.save_once()
        self.service.open(COMBO, None)
        path = self.service.close('s%d' % (STORE_MAX - 1))
        kept = self.store.items('ps1', 'sheep.cue')
        self.assertEqual(len(kept), STORE_MAX)
        self.assertEqual((kept[-1]['tried'], path, self.read(path)), (True, kept[-1]['state'], b'stato 1'))

    def test_soccorso_con_il_riprendi_di_prima_o_lo_stato_finale(self):
        saver = self.start()
        saver.save_once()
        self.service.clean_end()
        before = [self.read(entry['state']) for entry in self.store.items('ps1', 'sheep.cue')]
        saver = self.start()
        saver.save_once()
        self.service.open(SUSPECT, None)
        self.assertIsNone(self.service.chosen(PREVIOUS))
        with self.assertRaises(ConfigError):
            self.service.chosen(FINAL)
        self.service.close(PREVIOUS)
        self.assertEqual([self.read(entry['state']) for entry in self.store.items('ps1', 'sheep.cue')], before)
        # «Non era bloccato»: lo stato finale, e la partita conta come finita bene.
        saver = self.start()
        saver.save_once()
        final = self.final(png=b'miniatura')
        self.service.open(SUSPECT, final)
        self.assertEqual(self.service.chosen(FINAL), (final[0], final[1], None))
        self.service.close(FINAL)
        self.assertEqual([self.read(entry['state']) for entry in self.store.items('ps1', 'sheep.cue')],
                         [b'stato 3'])


if __name__ == '__main__':
    unittest.main()
