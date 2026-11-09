import os
import tempfile
import threading
import time
import unittest

from pixelarcade import joypads
from pixelarcade.errors import ConflictError
from pixelarcade.web import api
from pixelarcade.web.router import ApiError

CONTROLLER = {'index': 0, 'name': 'Pad Uno', 'vendor': 120, 'product': 6, 'controller': True}
JOYSTICK = {'index': 1, 'name': 'Pad Due', 'vendor': 121, 'product': 6, 'controller': False}

BINDS = {'b': 'b0', 'a': 'b1', 'y': 'b2', 'x': 'b3', 'l': '+4', 'r': '+5', 'l2': 'b9', 'r2': 'b10',
         'select': 'b4', 'start': 'b6', 'up': '-1', 'down': '+1', 'left': '-0', 'right': '+0'}


class FakePad:
    def __init__(self, buttons=4, axes=2, hats=1, rest=None):
        self.buttons = buttons
        self.axes = axes
        self.hats = hats
        self.down = set()
        self.values = dict(rest or {})
        self.hat_bits = 0
        self.closed = False
        self.reads = 0

    def button(self, index):
        self.reads += 1
        return index in self.down

    def axis(self, index):
        return self.values.get(index, 0)

    def hat(self, index):
        return self.hat_bits

    def close(self):
        self.closed = True


class FakeSdl:
    def __init__(self, devices, pad=None):
        self.lock = threading.Lock()
        self.list = devices
        self.pad = pad or FakePad()
        self.opened = 0

    def open(self):
        self.opened += 1

    def close(self):
        self.opened -= 1

    def devices(self):
        return [dict(device) for device in self.list]

    def open_pad(self, device):
        return self.pad

    def update(self):
        pass


class FakeConfig:
    def __init__(self, cores):
        self.cores = cores

    def resolve_path(self, key):
        return self.cores


class FakePlay:
    def __init__(self, base, keys):
        self.config = FakeConfig(os.path.join(base, 'cores'))
        self.keys = keys
        self.busy = False

    def known_keys(self):
        return dict(self.keys)

    def playing(self):
        return self.busy


class PressDetectorTest(unittest.TestCase):
    def test_pulsanti_assi_e_cappelli(self):
        pad = FakePad(rest={1: -32768})
        pad.down.add(1)
        detector = joypads.PressDetector()
        # Il tasto già premuto alla prima lettura non conta.
        self.assertEqual(detector.feed(pad), [])
        self.assertEqual(detector.feed(pad), [])
        pad.down.clear()
        pad.down.add(2)
        self.assertEqual(detector.feed(pad), ['b2'])
        self.assertEqual(detector.feed(pad), [])
        pad.down.clear()
        detector.feed(pad)
        pad.down.add(2)
        self.assertEqual(detector.feed(pad), ['b2'])
        pad.values[0] = -30000
        self.assertEqual(detector.feed(pad), ['-0'])
        pad.values[0] = -20000
        self.assertEqual(detector.feed(pad), [])
        pad.values[0] = 0
        detector.feed(pad)
        pad.values[0] = 30000
        self.assertEqual(detector.feed(pad), ['+0'])
        # Grilletto analogico che a riposo vale -32768: premuto diventa «+1».
        pad.values[1] = 32767
        self.assertEqual(detector.feed(pad), ['+1'])
        pad.hat_bits = 1
        self.assertEqual(detector.feed(pad), ['h0up'])
        pad.hat_bits = 1 | 2
        self.assertEqual(detector.feed(pad), ['h0right'])


class AutoconfigTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def test_testo(self):
        text = joypads.autoconfig_text(CONTROLLER, {'b': 'b0', 'l': '+4', 'up': 'h0up', 'x': ''})
        lines = text.splitlines()
        self.assertIn('input_driver = "sdl2"', lines)
        self.assertIn('input_device = "Pad Uno"', lines)
        self.assertIn('input_vendor_id = "120"', lines)
        self.assertEqual(lines[-3:], ['input_b_btn = "0"', 'input_l_axis = "+4"', 'input_up_btn = "h0up"'])

    def test_lettura_e_ricerca(self):
        sub = os.path.join(self.tmp.name, 'udev')
        os.makedirs(sub)
        with open(os.path.join(sub, 'altro.cfg'), 'w') as stream:
            stream.write('input_driver = "udev"\ninput_vendor_id = "120"\ninput_product_id = "6"\n')
        self.assertIsNone(joypads.find_profile(self.tmp.name, CONTROLLER))
        path = os.path.join(self.tmp.name, 'Pad Uno.cfg')
        with open(path, 'w') as stream:
            stream.write(joypads.autoconfig_text(CONTROLLER, BINDS))
        self.assertEqual(joypads.find_profile(self.tmp.name, CONTROLLER), path)
        self.assertEqual(joypads.find_profile(self.tmp.name, dict(CONTROLLER, vendor=1)), path)
        self.assertIsNone(joypads.find_profile(self.tmp.name, JOYSTICK))
        binds = joypads.profile_binds(joypads.parse_profile(path))
        self.assertEqual(binds['b'], ['b0'])
        self.assertEqual(binds['l'], ['+4'])
        self.assertNotIn('l3', binds)

    def test_levette_nell_autoconfig(self):
        binds = dict(BINDS, l_x_plus='+2', l_y_minus='-3', r_x_minus='b7')
        text = joypads.autoconfig_text(CONTROLLER, joypads.check_binds(binds))
        self.assertIn('input_l_x_plus_axis = "+2"', text)
        self.assertIn('input_l_y_minus_axis = "-3"', text)
        self.assertIn('input_r_x_minus_btn = "7"', text)
        path = os.path.join(self.tmp.name, 'Pad Uno.cfg')
        with open(path, 'w') as stream:
            stream.write(text)
        self.assertEqual(joypads.profile_binds(joypads.parse_profile(path))['l_x_plus'], ['+2'])

    def test_controllo_dei_tasti(self):
        self.assertEqual(joypads.check_binds(dict(BINDS, l3='')), BINDS)
        for binds in (None, dict(BINDS, zz='b1'), dict(BINDS, b='x9'), dict(BINDS, a='b0'),
                      {key: value for key, value in BINDS.items() if key != 'start'}):
            with self.assertRaises(joypads.JoypadError):
                joypads.check_binds(binds)

    def test_home_di_retroarch(self):
        cfg = '/h/snap/retroarch/common/.config/retroarch/retroarch.cfg'
        self.assertEqual(joypads.expand_home('~/.config/retroarch/autoconfig', cfg),
                         '/h/snap/retroarch/common/.config/retroarch/autoconfig')
        self.assertEqual(joypads.expand_home('/x/autoconfig', cfg), '/x/autoconfig')
        self.assertEqual(joypads.expand_home('~/a', '/altro/retroarch.cfg'), os.path.expanduser('~/a'))

    def test_nome_del_file(self):
        self.assertEqual(joypads.profile_filename('Pad/Strano: "1"'), 'Pad_Strano_ _1_.cfg')
        self.assertEqual(joypads.profile_filename('...'), 'Joypad.cfg')

    def test_riparazione(self):
        text = ('config_save_on_exit = "true"\n# input_player1_b_btn = "0"\ninput_player1_b_btn = "0"\n'
                'input_player1_b = "z"\ninput_player2_up_axis = "-1"\ninput_player3_b_btn = "1"\n'
                'input_player1_a_btn = "nul"')
        fixed, changed = joypads.repair_text(text)
        self.assertEqual(changed, 3)
        self.assertEqual(fixed, 'config_save_on_exit = "false"\n# input_player1_b_btn = "0"\n'
                                'input_player1_b_btn = "nul"\ninput_player1_b = "z"\n'
                                'input_player2_up_axis = "nul"\ninput_player3_b_btn = "1"\n'
                                'input_player1_a_btn = "nul"')


class JoypadServiceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = self.tmp.name
        os.makedirs(os.path.join(self.base, 'cores'))
        self.cfg = os.path.join(self.base, 'retroarch.cfg')
        with open(self.cfg, 'w') as stream:
            stream.write('input_joypad_driver = "sdl2"\nconfig_save_on_exit = "true"\ninput_player1_b_btn = "0"\n')
        os.chmod(self.cfg, 0o664)
        self.play = FakePlay(self.base, {'input_joypad_driver': 'sdl2'})
        self.sdl = FakeSdl([CONTROLLER, JOYSTICK])
        self.running = False
        self.service = joypads.JoypadService(self.play, lambda: self.sdl, wall=lambda: 0,
                                             running=lambda: self.running)

    def tearDown(self):
        self.service.stop()
        self.tmp.cleanup()

    def test_joypad_dei_giocatori_per_modello(self):
        dragon = {'index': 0, 'name': 'Generic', 'vendor': 0x0079, 'product': 0x0006, 'controller': False}
        xbox = {'index': 1, 'name': 'X-Box', 'vendor': 0x045e, 'product': 0x028e, 'controller': True}
        self.sdl.list = [dragon, xbox]
        dragon_model = {'vendor': 0x0079, 'product': 0x0006, 'rank': 0}
        xbox_model = {'vendor': 0x045e, 'product': 0x028e, 'rank': 0}
        # Chrome li ha numerati al contrario di SDL (joypad staccato e ricollegato).
        self.assertEqual(self.service.retroarch_pads([1, 0], [dragon_model, xbox_model]), [0, 1])
        self.assertEqual(self.service.retroarch_pads([1, None], [dragon_model, None]), [0, None])
        # Senza modelli, con un modello assente o con due giocatori sullo stesso joypad restano gli indici di Chrome.
        self.assertEqual(self.service.retroarch_pads([1, 0], None), [1, 0])
        self.assertEqual(self.service.retroarch_pads([3, None], [{'vendor': 1, 'product': 2, 'rank': 0}, None]), [3, None])
        self.assertEqual(self.service.retroarch_pads([1, 0], [dragon_model, dragon_model]), [1, 0])
        # Due joypad uguali: conta la posizione tra quelli dello stesso modello.
        self.sdl.list = [dict(dragon), dict(dragon, index=1)]
        self.assertEqual(self.service.retroarch_pads([1, 0], [dict(dragon_model, rank=1), dragon_model]), [1, 0])
        self.assertIsNone(self.service.retroarch_pads(None, [dragon_model]))

    def test_elenco(self):
        data = self.service.overview()
        self.assertTrue(data['supported'])
        self.assertEqual([device['configured'] for device in data['devices']], [False, False])
        self.assertEqual(self.sdl.opened, 0)
        self.play.keys['input_joypad_driver'] = 'udev'
        data = self.service.overview()
        self.assertFalse(data['supported'])
        self.assertIn('udev', data['error'])

    def test_salvataggio(self):
        result = self.service.save(120, 6, BINDS)
        self.assertEqual(result['profile'], 'Pad Uno.cfg')
        self.assertIsNone(result['backup'])
        device = self.service.overview()['devices'][0]
        self.assertTrue(device['configured'])
        self.assertEqual(device['binds']['start'], ['b6'])
        result = self.service.save(120, 6, dict(BINDS, start='b7'))
        self.assertTrue(result['backup'].startswith('Pad Uno.cfg.bak-'))
        self.assertEqual(self.service.overview()['devices'][0]['binds']['start'], ['b7'])
        with self.assertRaises(joypads.JoypadError):
            self.service.save(1, 2, BINDS)
        directory = os.path.join(self.base, 'autoconfig')
        self.assertEqual(sorted(os.listdir(directory))[0], 'Pad Uno.cfg')

    def test_cartella_impostata(self):
        custom = os.path.join(self.base, 'mia')
        self.play.keys['joypad_autoconfig_dir'] = custom
        self.service.save(121, 6, BINDS)
        self.assertTrue(os.path.isfile(os.path.join(custom, 'Pad Due.cfg')))

    def test_riparazione(self):
        result = self.service.repair()
        self.assertEqual(result['changed'], 2)
        with open(self.cfg) as stream:
            self.assertIn('input_player1_b_btn = "nul"', stream.read())
        self.assertEqual(os.stat(self.cfg).st_mode & 0o777, 0o664)
        self.assertEqual(self.service.repair(), {'changed': 0, 'backup': None})
        self.running = True
        with self.assertRaises(ConflictError):
            self.service.repair()

    def test_apprendimento(self):
        result = self.service.start_learn(121, 6)
        self.assertEqual(result['device']['name'], 'Pad Due')
        deadline = time.time() + 2
        while not self.sdl.pad.reads and time.time() < deadline:
            time.sleep(0.01)
        self.sdl.pad.down.add(3)
        state = self.service.learn_state(0)
        while not state['presses'] and time.time() < deadline:
            time.sleep(0.02)
            state = self.service.learn_state(0)
        self.assertTrue(state['active'])
        self.assertEqual(state['presses'], [{'seq': 1, 'input': 'b3'}])
        self.assertEqual(self.service.learn_state(1)['presses'], [])
        self.service.stop_learn()
        self.assertFalse(self.service.learn_state(0)['active'])
        self.assertTrue(self.sdl.pad.closed)
        self.assertEqual(self.sdl.opened, 0)
        self.play.busy = True
        with self.assertRaises(ConflictError):
            self.service.start_learn(121, 6)


class JoypadApiTest(unittest.TestCase):
    def test_id_del_joypad(self):
        self.assertEqual(api.joypad_ids({'vendor': 120, 'product': 6}), (120, 6))
        for body in (None, {}, {'vendor': '120', 'product': 6}, {'vendor': True, 'product': 6},
                     {'vendor': 70000, 'product': 6}):
            with self.assertRaises(ApiError):
                api.joypad_ids(body)


if __name__ == '__main__':
    unittest.main()
