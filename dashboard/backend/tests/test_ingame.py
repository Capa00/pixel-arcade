import os
import tempfile
import threading
import unittest

from pixelarcade.db import Database
from pixelarcade.errors import ConflictError, LaunchError, RetroArchError
from pixelarcade.ingame import IngameService
from pixelarcade.repositories.profiles import ProfilesRepository
from pixelarcade.repositories.saves import SavesRepository
from pixelarcade.retroarch_net import LOAD_AFTER_SAVE, PAUSED, PLAYING, RetroArchNet
from pixelarcade.saves import SaveStore

from tests.fakes import FakeClock, fake_png
from tests.test_retroarch_net import FakeRetroArch, FakeSocket

AT = '2026-10-01T10:00:00+00:00'


class FakePlay:
    """Partita in corso finta: fase, gioco, core, giocatori e cartella di sessione."""

    def __init__(self, session, players, known):
        self.info = {'phase': 'running', 'game': {'system': 'nes', 'id': 'Zelda.nes', 'title': 'Zelda'},
                     'core': 'fceumm', 'players': players, 'content': 'Zelda', 'session': session}
        self.known = known
        self.listeners = []
        self.pause_sources = []

    def ingame_info(self):
        return dict(self.info)

    def profile_ids(self, players):
        return [account for account in players if account in self.known]

    def add_end_listener(self, listener):
        self.listeners.append(listener)

    def add_pause_source(self, source):
        self.pause_sources.append(source)


class FakeWindow:
    def __init__(self, retroarch=None):
        self.retroarch = retroarch
        self.opened = 0
        self.closed = 0
        self.fail = False
        # Come sulla console: chiusa la finestra, RetroArch torna in primo piano e riparte da solo.
        self.resumes = True

    def open(self):
        if self.fail:
            raise OSError('chrome assente')
        self.opened += 1

    def close(self):
        self.closed += 1
        if self.retroarch is not None and self.resumes:
            self.retroarch.status = PLAYING


class IngameTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        profiles = ProfilesRepository(self.db)
        self.luca = profiles.create('LUCA', '#ff5d73', AT)
        self.anna = profiles.create('ANNA', '#3ccfc4', AT)
        self.store = SaveStore(os.path.join(self.tmp.name, 'data'), SavesRepository(self.db), lambda: AT)
        self.session = os.path.join(self.tmp.name, 'sessione')
        os.makedirs(self.session)
        self.retroarch = FakeRetroArch(os.path.join(self.session, 'Zelda.state'))
        self.clock = FakeClock()
        self.play = FakePlay(self.session, [self.luca, None], {self.luca, self.anna})
        self.window = FakeWindow(self.retroarch)
        self.ingame = IngameService(self.play, self.store, self.net, self.window, clock=self.clock)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def net(self):
        return RetroArchNet(55355, socket_factory=lambda: FakeSocket(self.retroarch), clock=self.clock,
                            sleep=self.clock.wait)

    def test_apertura_e_chiusura(self):
        self.assertEqual(self.ingame.state(), {'open': False, 'kind': None, 'slot': None, 'account': None,
                                               'other': None, 'undo': False, 'busy': False, 'shot': None,
                                               'players': [], 'locked': False, 'temp': False})
        state = self.ingame.open('p1')
        self.assertEqual(state, {'open': True, 'kind': 'saves', 'slot': 'p1', 'account': self.luca, 'other': None,
                                 'undo': False, 'busy': False, 'shot': 1, 'players': ['p1'], 'locked': False,
                                 'temp': False})
        with open(self.ingame.shot_file(), 'rb') as stream:
            self.assertEqual(stream.read(), fake_png(b'cattura'))
        self.assertEqual((self.retroarch.status, self.window.opened), (PAUSED, 1))
        # Una seconda combinazione non apre un'altra finestra né toglie la pausa.
        self.ingame.open('p1')
        self.ingame.open('p2')
        self.assertEqual((self.retroarch.status, self.window.opened), (PAUSED, 1))
        self.assertEqual(self.ingame.state()['slot'], 'p1')
        self.assertFalse(self.ingame.close()['open'])
        self.assertIsNone(self.ingame.shot_file())
        self.assertEqual((self.retroarch.status, self.window.closed), (PLAYING, 1))
        # RetroArch è ripartito da solo: nessun secondo PAUSE_TOGGLE.
        self.assertEqual(self.retroarch.received.count('PAUSE_TOGGLE'), 1)
        self.assertFalse(self.ingame.close()['open'])

    def test_pausa_tolta_se_retroarch_non_riparte(self):
        self.window.resumes = False
        self.ingame.open('p1')
        self.ingame.close()
        self.assertEqual(self.retroarch.status, PLAYING)
        self.assertEqual(self.retroarch.received.count('PAUSE_TOGGLE'), 2)

    def test_ignorata_senza_partita(self):
        self.play.info['phase'] = 'probing'
        self.assertFalse(self.ingame.open('p1')['open'])
        self.assertEqual((self.retroarch.received, self.window.opened), ([], 0))
        with self.assertRaises(LaunchError):
            self.ingame.open('p3')

    def test_giocatore_2_e_ospite(self):
        self.play.info['players'] = [self.luca, self.anna]
        state = self.ingame.open('p2')
        self.assertEqual((state['account'], state['other']), (self.anna, self.luca))
        self.ingame.close()
        self.play.info['players'] = [self.luca, None]
        state = self.ingame.open('p2')
        self.assertEqual((state['open'], state['account']), (True, None))
        with self.assertRaises(LaunchError):
            self.ingame.save(1)
        self.assertTrue(self.ingame.state()['open'])

    def test_pausa_non_riuscita(self):
        self.retroarch.status = None
        with self.assertRaises(RetroArchError):
            self.ingame.open('p1')
        self.assertFalse(self.ingame.state()['open'])
        self.assertEqual(self.window.opened, 0)

    def test_finestra_non_aperta(self):
        self.window.fail = True
        with self.assertLogs('pixelarcade.ingame', level='ERROR'):
            with self.assertRaises(RetroArchError):
                self.ingame.open('p1')
        self.assertFalse(self.ingame.state()['open'])
        self.assertEqual(self.retroarch.status, PLAYING)

    def test_salva_e_carica(self):
        self.ingame.open('p1')
        result = self.ingame.save(3)
        self.assertEqual(result['menu']['open'], True)
        self.assertEqual([(slot['slot'], slot['core'], slot['thumb'], slot['loadable']) for slot in result['slots']],
                         [(3, 'fceumm', True, True)])
        with open(self.store.state_file(self.luca, 'nes', 'Zelda.nes', 3), 'rb') as stream:
            self.assertEqual(stream.read(), b'stato')
        # Si gioca ancora: lo slot di lavoro cambia, poi si carica lo slot 3.
        with open(self.retroarch.path, 'wb') as stream:
            stream.write(b'dopo')
        state = self.ingame.load(3)
        self.assertFalse(state['open'])
        with open(self.retroarch.path, 'rb') as stream:
            self.assertEqual(stream.read(), b'stato')
        self.assertIn('LOAD_STATE', self.retroarch.received)
        self.assertEqual((self.retroarch.status, self.window.closed), (PLAYING, 1))

    def match_service(self, locked):
        """Partita di un incontro di torneo (incontro 12) con o senza salvataggi bloccati."""
        self.play.info['match'] = {'tournament': 3, 'match': 12, 'gameNo': 1, 'savesLocked': locked}
        root = os.path.join(self.tmp.name, 'temp')
        os.makedirs(os.path.join(root, 'match-99'))
        ingame = IngameService(self.play, self.store, self.net, self.window, clock=self.clock, match_root=root)
        # Gli slot rimasti da un avvio precedente si tolgono.
        self.assertFalse(os.path.exists(os.path.join(root, 'match-99')))
        return ingame, root

    def test_incontro_con_salvataggi_bloccati(self):
        ingame, _ = self.match_service(True)
        state = ingame.open('p1')
        self.assertEqual((state['open'], state['locked'], state['temp'], state['other']), (True, True, False, None))
        for call in (lambda: ingame.save(3), lambda: ingame.load(3), ingame.undo, ingame.menu_slots):
            with self.assertRaisesRegex(LaunchError, 'bloccati'):
                call()
        self.assertIsNone(ingame.menu_thumb(3))
        # «Esci»: la finestra si chiude, la pausa finisce e RetroArch riceve la chiusura.
        state = ingame.quit()
        self.assertFalse(state['open'])
        self.assertIn('QUIT', self.retroarch.received)
        self.assertEqual(self.window.closed, 1)

    def test_incontro_con_slot_temporanei(self):
        self.play.info['players'] = [self.luca, self.anna]
        ingame, root = self.match_service(False)
        state = ingame.open('p1')
        self.assertEqual((state['locked'], state['temp'], state['other']), (False, True, None))
        result = ingame.save(3)
        self.assertEqual([slot['slot'] for slot in result['slots']], [3])
        self.assertEqual([slot['slot'] for slot in ingame.menu_slots()['slots']], [3])
        self.assertTrue(ingame.menu_thumb(3).startswith(os.path.join(root, 'match-12')))
        # Negli slot del profilo non c'è niente.
        self.assertIsNone(self.store.state_file(self.luca, 'nes', 'Zelda.nes', 3))
        with open(self.retroarch.path, 'wb') as stream:
            stream.write(b'dopo')
        ingame.load(3)
        with open(self.retroarch.path, 'rb') as stream:
            self.assertEqual(stream.read(), b'stato')
        # Fine dell'incontro: gli slot temporanei spariscono.
        ingame.drop_match(12)
        self.assertFalse(os.path.exists(os.path.join(root, 'match-12')))
        ingame.open('p1')
        self.assertEqual(ingame.menu_slots(), {'slots': []})

    def test_miniatura_di_riserva(self):
        self.ingame.open('p1')
        self.retroarch.thumb = False
        with self.assertLogs('pixelarcade.ingame', level='WARNING'):
            self.assertTrue(self.ingame.save(1)['slots'][0]['thumb'])
        with open(self.store.thumb_file(self.luca, 'nes', 'Zelda.nes', 1), 'rb') as stream:
            self.assertEqual(stream.read(), fake_png(b'cattura'))

    def test_senza_cattura_ne_miniatura(self):
        self.retroarch.ignore.add('SCREENSHOT')
        with self.assertLogs('pixelarcade.ingame', level='WARNING'):
            self.assertIsNone(self.ingame.open('p1')['shot'])
        self.ingame.save(1)
        self.retroarch.thumb = False
        self.retroarch.state = b'nuovo'
        with self.assertLogs('pixelarcade.ingame', level='WARNING'):
            self.assertFalse(self.ingame.save(1)['slots'][0]['thumb'])

    def test_errori_lasciano_il_menu_aperto(self):
        with self.assertRaises(ConflictError):
            self.ingame.save(1)
        self.ingame.open('p1')
        for slot in (0, 10, True, '1', 1.0):
            with self.assertRaises(LaunchError):
                self.ingame.save(slot)
        with self.assertRaises(LaunchError):
            self.ingame.load(2)
        self.retroarch.ignore.add('SAVE_STATE')
        with self.assertRaises(RetroArchError):
            self.ingame.save(2)
        self.assertEqual(self.ingame.state(), {'open': True, 'kind': 'saves', 'slot': 'p1', 'account': self.luca,
                                               'other': None, 'undo': False, 'busy': False, 'shot': 1,
                                               'players': ['p1'], 'locked': False, 'temp': False})
        self.assertEqual(self.retroarch.status, PAUSED)

    def test_core_diverso(self):
        state = os.path.join(self.tmp.name, 'altro.state')
        with open(state, 'wb') as stream:
            stream.write(b'x')
        self.store.store_state(self.luca, 'nes', 'Zelda.nes', 4, 'nestopia', state)
        self.ingame.open('p1')
        with self.assertRaisesRegex(LaunchError, 'nestopia'):
            self.ingame.load(4)
        self.assertTrue(self.ingame.state()['open'])

    def test_una_operazione_alla_volta(self):
        self.ingame.open('p1')
        self.ingame.operation.acquire()
        try:
            with self.assertRaises(ConflictError):
                self.ingame.save(1)
            self.assertTrue(self.ingame.open('p1')['open'])
        finally:
            self.ingame.operation.release()

    def write_work(self, data):
        with open(self.retroarch.path, 'wb') as stream:
            stream.write(data)

    def read_work(self):
        with open(self.retroarch.path, 'rb') as stream:
            return stream.read()

    def test_caricamento_aspetta_lo_stato_di_riserva(self):
        # Lo stato di riserva appena salvato farebbe scartare a RetroArch il LOAD_STATE mandato subito dopo.
        self.ingame.open('p1')
        self.ingame.save(1)
        self.ingame.close()
        times = {}
        handle = self.retroarch.handle

        def timed(command):
            times[command] = self.clock()
            return handle(command)

        self.retroarch.handle = timed
        self.ingame.open('p1')
        self.ingame.load(1)
        self.assertGreaterEqual(times['LOAD_STATE'] - times['SAVE_STATE'], LOAD_AFTER_SAVE)

    def test_annulla_ultimo_caricamento(self):
        self.ingame.open('p1')
        self.ingame.save(1)
        self.ingame.close()
        # Si gioca ancora: al caricamento RetroArch salva prima il momento attuale.
        self.retroarch.state = b'prima del caricamento'
        self.ingame.open('p1')
        self.assertFalse(self.ingame.state()['undo'])
        self.ingame.load(1)
        self.assertEqual(self.read_work(), b'stato')
        self.write_work(b'dopo')
        self.assertTrue(self.ingame.open('p1')['undo'])
        state = self.ingame.undo()
        self.assertFalse(state['open'])
        self.assertEqual(self.read_work(), b'prima del caricamento')
        self.assertEqual(self.retroarch.received.count('LOAD_STATE'), 2)
        self.assertEqual(self.retroarch.status, PLAYING)
        # Si annulla una volta sola.
        self.assertFalse(self.ingame.open('p1')['undo'])
        with self.assertRaises(ConflictError):
            self.ingame.undo()
        self.assertTrue(self.ingame.state()['open'])

    def test_annullamento_solo_dell_ultimo_giocatore(self):
        self.play.info['players'] = [self.luca, self.anna]
        self.ingame.open('p1')
        self.ingame.save(1)
        self.ingame.load(1)
        self.ingame.open('p2')
        self.assertFalse(self.ingame.state()['undo'])
        with self.assertRaises(ConflictError):
            self.ingame.undo()
        self.ingame.save(2)
        self.ingame.load(2)
        # B ha caricato dopo A: l'annullamento è di B.
        self.assertFalse(self.ingame.open('p1')['undo'])
        self.ingame.close()
        self.assertTrue(self.ingame.open('p2')['undo'])
        self.ingame.close()
        # A fine partita l'annullamento non c'è più.
        for listener in self.play.listeners:
            listener()
        self.assertFalse(self.ingame.open('p2')['undo'])

    def test_caricamento_senza_stato_di_riserva(self):
        self.ingame.open('p1')
        self.ingame.save(1)
        self.retroarch.ignore.add('SAVE_STATE')
        with self.assertLogs('pixelarcade.ingame', level='WARNING'):
            self.ingame.load(1)
        self.assertEqual(self.read_work(), b'stato')
        self.assertFalse(self.ingame.open('p1')['undo'])

    def test_slot_protetto_in_partita(self):
        self.ingame.open('p1')
        self.ingame.save(1)
        self.store.set_protected(self.luca, 'nes', 'Zelda.nes', 1, True)
        with self.assertRaisesRegex(ConflictError, 'protetto'):
            self.ingame.save(1)
        self.assertTrue(self.ingame.state()['open'])

    def test_tempo_di_pausa(self):
        self.assertEqual(self.play.pause_sources, [self.ingame.take_paused])
        self.ingame.open('p1')
        self.clock.wait(40)
        self.ingame.close()
        self.clock.wait(100)
        self.ingame.open('p1')
        self.clock.wait(20)
        self.ingame.save(1)
        self.ingame.load(1)
        paused = self.ingame.take_paused()
        # 40 s del primo menu, almeno 20 del secondo; non i 100 s di gioco in mezzo.
        self.assertGreaterEqual(paused, 60)
        self.assertLess(paused, 100)
        self.assertEqual(self.ingame.take_paused(), 0)

    def test_pausa_fino_alla_fine_della_partita(self):
        self.ingame.open('p1')
        self.clock.wait(30)
        for listener in self.play.listeners:
            listener()
        self.clock.wait(50)
        paused = self.ingame.take_paused()
        # La pausa finisce con la partita: i 50 s dopo non contano.
        self.assertGreaterEqual(paused, 30)
        self.assertLess(paused, 50)

    def test_finestra_non_aperta_senza_pausa(self):
        self.window.fail = True
        with self.assertLogs('pixelarcade.ingame', level='ERROR'):
            with self.assertRaises(RetroArchError):
                self.ingame.open('p1')
        self.assertLess(self.ingame.take_paused(), 5)

    def test_fine_della_partita(self):
        self.ingame.open('p1')
        for listener in self.play.listeners:
            listener()
        self.assertFalse(self.ingame.state()['open'])
        self.assertEqual(self.window.closed, 1)

    def test_finestra_chiusa_dall_esterno(self):
        self.ingame.open('p1')
        self.ingame.window_closed()
        self.assertFalse(self.ingame.state()['open'])
        self.assertEqual(self.retroarch.status, PLAYING)
        self.ingame.window_closed()


class OverlayThreadTest(unittest.TestCase):
    def test_lock_non_bloccante(self):
        ingame = IngameService(FakePlay('/s', [None, None], set()), None, window=FakeWindow())
        done = threading.Event()
        ingame.begin()
        threading.Thread(target=lambda: (ingame.state(), done.set())).start()
        self.assertTrue(done.wait(2))
        ingame.end()


if __name__ == '__main__':
    unittest.main()
