import os
import tempfile
import unittest

from pixelarcade import retroarch_net
from pixelarcade.db import Database
from pixelarcade.errors import ConflictError, LaunchError
from pixelarcade.profiles import ProfileService
from pixelarcade.replays import MIN_GAME, Recorder, ReplayService, allowed, choose, day_label
from pixelarcade.repositories.profiles import ProfilesRepository
from pixelarcade.repositories.replays import ReplaysRepository
from pixelarcade.repositories.sessions import SessionsRepository

NOW = '2026-10-19T10:00:00+00:00'
GAME = {'system': 'gba', 'id': 'tetris.gba', 'title': 'Tetris Worlds'}


class FakeNet:
    """Comandi di rete finti: ``RECORD_REPLAY`` crea ``<n>.replayN`` nella cartella degli stati."""

    def __init__(self, session=None):
        self.session = session
        self.sent = []
        self.messages = []
        self.made = 0

    def status(self):
        return retroarch_net.PLAYING

    def send(self, command):
        self.sent.append(command)
        if command == 'RECORD_REPLAY' and self.session:
            self.made += 1
            with open(os.path.join(self.session, 'gioco.replay%d' % self.made), 'wb') as stream:
                stream.write(b'x' * 10)

    def show_message(self, text):
        self.messages.append(text)


class FakeLibrary:
    def systems(self):
        return [{'id': 'gba', 'preset': 'gba'}, {'id': 'ps2', 'preset': 'ps2'}, {'id': 'neogeo', 'preset': 'arcade'}]

    def find(self, system_id, game_id):
        return dict(GAME) if (system_id, game_id) == (GAME['system'], GAME['id']) else None


class FakeConfig:
    def __init__(self, folder):
        self.folder = folder
        self.settings = {'retroarch.network_port': 55355, 'retroarch.command': 'retroarch',
                         'ui.screensaver_content': 'mixed', 'ui.screensaver_minutes': 2}

    def get(self):
        return dict(self.settings)

    def resolve_path(self, key):
        return os.path.join(self.folder, 'append.cfg')


class FakePlay:
    def __init__(self, folder):
        self.config = FakeConfig(folder)
        self.running = False

    def busy(self):
        return self.running

    def installed(self, core):
        return core == 'mgba'

    def known_keys(self):
        return {'audio_enable', 'cheevos_enable', 'savestate_auto_load'}

    def rom_path(self, system_id, game):
        return '/giochi/' + game['id']


class FakeProcess:
    def __init__(self):
        self.returncode = None
        self.listeners = []
        self.started = False
        self.terminated = False
        self.exit_on_wait = False

    def add_listener(self, listener):
        self.listeners.append(listener)

    def start(self):
        self.started = True

    def wait(self, timeout):
        if self.exit_on_wait:
            self.returncode = 0
        return self.returncode

    def terminate(self):
        self.terminated = True
        self.returncode = -15


class FunctionsTest(unittest.TestCase):
    def test_console_escluse(self):
        self.assertTrue(allowed({'id': 'gba', 'preset': 'gba'}))
        self.assertFalse(allowed({'id': 'ps2', 'preset': 'ps2'}))
        self.assertFalse(allowed({'id': 'neogeo', 'preset': 'arcade'}))
        self.assertFalse(allowed(None))

    def test_data(self):
        self.assertEqual(day_label('2026-10-05T10:00:00+00:00'), '5 ottobre')

    def test_scelta(self):
        piece = {'index': 1, 'start': 90, 'end': 135, 'file': 'a', 'trophy': None}
        self.assertEqual(choose([piece]), piece)
        # Pezzi senza file o troppo corti non contano, salvo un trofeo.
        self.assertIsNone(choose([dict(piece, file=None)]))
        self.assertIsNone(choose([dict(piece, end=100)]))
        self.assertEqual(choose([dict(piece, end=100, trophy='Primo')])['trophy'], 'Primo')
        self.assertIsNone(choose([]))


class RecorderTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.session = os.path.join(self.tmp.name, 'session')
        os.makedirs(self.session)
        self.run_dir = os.path.join(self.tmp.name, 'run')
        self.net = FakeNet(self.session)
        self.recorder = Recorder(self.net, self.session, self.run_dir, lambda: False, sleep=lambda seconds: None,
                                 segment=10, start_at=30)

    def tearDown(self):
        self.tmp.cleanup()

    def test_un_solo_pezzo(self):
        for second in range(200):
            if second == 5:
                self.recorder.awarded('Prima del pezzo')
            if second == 35:
                self.recorder.awarded('Nel pezzo')
            self.recorder.tick(1)
        segments, played = self.recorder.finish()
        # Il tempo si conta fino alla fine; il pezzo va da 30 a 40 s e si registra una volta sola.
        self.assertEqual(played, 200)
        self.assertEqual((self.net.sent.count('RECORD_REPLAY'), self.net.sent.count('HALT_REPLAY')), (1, 1))
        self.assertEqual([(item['start'], item['end'], item['trophy']) for item in segments], [(30, 40, 'Nel pezzo')])
        self.assertEqual(os.listdir(self.run_dir), ['1.replay'])

    def test_partita_finita_durante_il_pezzo(self):
        for second in range(35):
            self.recorder.tick(1)
        segments, played = self.recorder.finish()
        self.assertEqual(self.net.sent.count('HALT_REPLAY'), 0)
        self.assertEqual([(item['start'], item['end']) for item in segments], [(30, 35)])

    def test_partita_finita_prima_del_pezzo(self):
        for second in range(20):
            self.recorder.tick(1)
        self.assertEqual(self.recorder.finish(), ([], 20))
        self.assertEqual(self.net.sent, [])


class ServiceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        profiles = ProfileService(ProfilesRepository(self.db), SessionsRepository(self.db), FakeLibrary(),
                                  lambda: NOW)
        self.ada = profiles.create('ada', '#ff5d73')['id']
        self.bea = profiles.create('bea', '#3ccfc4')['id']
        self.repo = ReplaysRepository(self.db)
        self.play = FakePlay(self.tmp.name)
        self.net = FakeNet()
        self.processes = []
        self.spawned = []
        self.clock = [100.0]
        self.service = ReplayService(self.repo, ProfilesRepository(self.db), FakeLibrary(), self.play,
                                     self.tmp.name, lambda: self.net, process_factory=self.process,
                                     spawn=self.spawned.append, clock=lambda: self.clock[0], now=lambda: NOW,
                                     sleep=lambda seconds: None)

    def tearDown(self):
        self.tmp.cleanup()

    def process(self, core, rom_path, config, replay):
        process = FakeProcess()
        process.args = (core, rom_path, config, replay)
        self.processes.append(process)
        return process

    def clip(self, name, data=b'replay'):
        path = os.path.join(self.tmp.name, name)
        with open(path, 'wb') as stream:
            stream.write(data)
        return path

    def stored(self, account, name, size=6, recorded=NOW):
        os.makedirs(self.service.root, exist_ok=True)
        with open(os.path.join(self.service.root, name), 'wb') as stream:
            stream.write(b'x' * size)
        return self.repo.add({'account': account, 'system': 'gba', 'game': 'tetris.gba', 'core': 'mgba',
                              'file': name, 'size': size, 'seconds': 45, 'trophy': None, 'recordedAt': recorded})

    def finish(self, account, played=MIN_GAME + 10, trophy='Primo', name='1.replay'):
        recorder = Recorder(self.net, self.tmp.name, self.service.run_dir(), lambda: False)
        recorder.played = played
        recorder.segments = [{'index': 1, 'start': 0, 'end': 45, 'trophy': trophy, 'file': self.clip(name)}]
        self.service.recorder = recorder
        self.service.recording = {'account': account, 'system': 'gba', 'game': 'tetris.gba', 'core': 'mgba'}
        return self.service.game_finished()

    def test_solo_partite_ammesse(self):
        session = os.path.join(self.tmp.name, 'session')
        self.service.game_started(GAME, 'mgba', [None], session)
        self.assertIsNone(self.service.recorder)
        self.service.game_started(GAME, 'mgba', [self.ada], session, eligible=False)
        self.assertIsNone(self.service.recorder)
        self.service.game_started({'system': 'ps2', 'id': 'x.iso'}, 'pcsx2', [self.ada], session)
        self.assertIsNone(self.service.recorder)

    def test_solo_se_serve(self):
        session = os.path.join(self.tmp.name, 'session')
        self.service.net_factory = lambda: FakeNet(session)
        # Il salvaschermo non rigioca gli spezzoni: con «Copertine» o con l'attesa «Mai».
        for key, value in (('ui.screensaver_content', 'covers'), ('ui.screensaver_minutes', 0)):
            self.play.config.settings.update({'ui.screensaver_content': 'mixed', 'ui.screensaver_minutes': 2})
            self.play.config.settings[key] = value
            self.service.game_started(GAME, 'mgba', [self.ada], session)
            self.assertIsNone(self.service.recorder, key)
        self.play.config.settings.update({'ui.screensaver_content': 'games', 'ui.screensaver_minutes': 2})
        # Il gioco ha già uno spezzone, di qualsiasi profilo.
        self.stored(self.bea, 'tetris.replay')
        self.service.game_started(GAME, 'mgba', [self.ada], session)
        self.assertIsNone(self.service.recorder)
        self.repo.delete(self.repo.all()[0]['id'])
        self.service.game_started(GAME, 'mgba', [self.ada], session)
        self.assertIsNotNone(self.service.recorder)
        self.service.game_finished_quietly()

    def test_coda_di_cinque(self):
        old = self.stored(self.ada, 'vecchio.replay')
        replay = self.finish(self.ada)
        self.assertEqual((replay['seconds'], replay['trophy']), (45, 'Primo'))
        # Lo spezzone precedente dello stesso profilo resta.
        self.assertEqual([item['id'] for item in self.repo.all()], [old, replay['id']])
        for number in range(4):
            self.finish(self.bea, trophy=None, name='%d.replay' % number)
        # Al sesto si cancella il più vecchio, file compreso.
        self.assertEqual(len(self.repo.all()), 5)
        self.assertIsNone(self.repo.get(old))
        self.assertEqual(sorted(os.listdir(self.service.root)), sorted(item['file'] for item in self.repo.all()))

    def test_partita_corta_scartata(self):
        self.assertIsNone(self.finish(self.ada, played=MIN_GAME - 1))
        self.assertEqual(self.repo.all(), [])

    def test_rotazione(self):
        first = self.stored(self.ada, 'a.replay', recorded='2026-10-01T10:00:00+00:00')
        second = self.stored(self.ada, 'b.replay')
        self.stored(self.bea, 'c.replay')
        shown = self.service.next()
        self.assertEqual((shown['id'], shown['name'], shown['title'], shown['date']),
                         (first, 'ADA', 'Tetris Worlds', '1 ottobre'))
        self.service.start(first)
        self.processes[0].returncode = 0
        self.spawned[0]()
        self.assertEqual(self.service.next()['id'], second)

    def test_riproduzione(self):
        replay_id = self.stored(self.ada, 'a.replay')
        status = self.service.start(replay_id)
        self.assertTrue(status['playing'])
        self.assertEqual(status['showing']['name'], 'ADA')
        core, rom, config, replay = self.processes[0].args
        self.assertEqual((core, rom), ('mgba', '/giochi/tetris.gba'))
        self.assertEqual(os.path.dirname(os.path.dirname(replay)), self.tmp.name)
        with open(config) as stream:
            text = stream.read()
        for line in ('audio_enable = "false"', 'cheevos_enable = "false"', 'savestate_auto_load = "false"'):
            self.assertIn(line, text)
        with self.assertRaises(ConflictError):
            self.service.start(replay_id)
        # Fine del filmato: un solo QUIT, poi la riproduzione risulta finita.
        self.service.log_line('[INFO] [Replay] EOF after buttons.')
        self.service.log_line('[INFO] [Replay] La riproduzione del film è terminata.')
        self.assertEqual(self.net.sent, ['QUIT'])
        self.processes[0].exit_on_wait = True
        self.spawned[0]()
        self.assertIn('ADA · Tetris Worlds', self.net.messages[0])
        self.assertEqual(self.service.status(), {'playing': False, 'reason': 'ended',
                                                 'showing': status['showing']})

    def test_chiuso_e_fermato(self):
        replay_id = self.stored(self.ada, 'a.replay')
        self.service.start(replay_id)
        self.processes[0].returncode = 0
        self.spawned[0]()
        self.assertEqual(self.service.status()['reason'], 'closed')
        self.service.start(replay_id)
        self.assertEqual(self.service.stop()['reason'], 'stopped')
        self.assertTrue(self.processes[1].terminated)

    def test_rifiuti(self):
        with self.assertRaises(LaunchError):
            self.service.start(1)
        replay_id = self.stored(self.ada, 'a.replay')
        self.play.running = True
        with self.assertRaises(ConflictError):
            self.service.start(replay_id)


if __name__ == '__main__':
    unittest.main()
