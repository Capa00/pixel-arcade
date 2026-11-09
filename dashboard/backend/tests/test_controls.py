import os
import tempfile
import unittest

from pixelarcade.controls import (ControlsService, DescriptorReader, EDITABLE, button_of, check_labels, check_mapping,
                                  read_remap, remap_dir, remap_text)
from pixelarcade.db import Database
from pixelarcade.errors import ConflictError, LaunchError
from pixelarcade.ingame import IngameService
from pixelarcade.repositories.controls import ControlsRepository
from pixelarcade.repositories.profiles import ProfilesRepository
from pixelarcade.repositories.saves import SavesRepository
from pixelarcade.retroarch_net import PAUSED, PLAYING, RetroArchNet
from pixelarcade.saves import SaveStore

from tests.fakes import FakeClock
from tests.test_ingame import FakePlay, FakeWindow
from tests.test_retroarch_net import FakeRetroArch, FakeSocket

AT = '2026-10-07T10:00:00+00:00'

# Log di PCSX ReARMed con Tekken 3 (RetroArch 1.22.2 in italiano, 7 ottobre 2026), accorciato.
PCSX_LOG = '''[INFO] [Environ] SET_INPUT_DESCRIPTORS.
[DEBUG]    Porta 1:
[DEBUG]       "D-Pad Su" => "D-Pad Up"
[DEBUG]       "Pulsante B (giù)" => "Cross"
[DEBUG]       "Pulsante A (destra)" => "Circle"
[DEBUG]       "Pulsante Y (sinistro)" => "Square"
[DEBUG]       "Pulsante X (in alto)" => "Triangle"
[DEBUG]       "Pulsante Select" => "Select"
[DEBUG]       "Pulsante Start" => "Start"
[DEBUG]       "Pulsante L (laterale)" => "L1"
[DEBUG]       "Pulsante R (laterale)" => "R1"
[DEBUG]       "Pulsante L2 (grilletto)" => "L2"
[DEBUG]       "Pulsante R2 (grilletto)" => "R2"
[DEBUG]       "Pulsante L3 (Analogico)" => "L3"
[DEBUG]       "Pulsante R3 (Analogico)" => "R3"
[DEBUG]       "Analogico sinistro Y- (su)" => "Left Analog Y"
[DEBUG]       "Analogico Destro X+ (destra)" => "Right Analog X"
[DEBUG]    Porta 2:
[DEBUG]       "Pulsante B (giù)" => "Cross"
[DEBUG]    Porta 3:
[DEBUG]       "Pulsante B (giù)" => "Cross"
[DEBUG] [Environ] SET_CORE_OPTIONS_DISPLAY: pcsx_rearmed_show_gpu_peops_settings = hidden'''.splitlines()


def feed(reader, lines):
    for line in lines:
        reader.feed(line)


class LabelsTest(unittest.TestCase):
    def test_etichette_italiane_e_inglesi(self):
        cases = {
            'Pulsante B (giù)': 'b', 'Pulsante A (destra)': 'a', 'Pulsante Y (sinistro)': 'y',
            'Pulsante X (in alto)': 'x', 'Pulsante L (laterale)': 'l', 'Pulsante R2 (grilletto)': 'r2',
            'Pulsante L3 (Analogico)': 'l3', 'Pulsante Select': 'select', 'Pulsante Start': 'start',
            'B Button (Down)': 'b', 'R Button (Shoulder)': 'r', 'L2 Button (Trigger)': 'l2', 'Start Button': 'start',
            'D-Pad Su': None, 'D-Pad Left': None, 'Analogico sinistro Y- (su)': None, 'Left Analog X+ (Right)': None,
        }
        for label, expected in cases.items():
            self.assertEqual(button_of(label), expected, label)


class DescriptorReaderTest(unittest.TestCase):
    def test_nomi_di_p1_e_p2(self):
        reader = DescriptorReader()
        self.assertIsNone(reader.result())
        feed(reader, PCSX_LOG)
        self.assertTrue(reader.ready.is_set())
        result = reader.result()
        self.assertEqual(set(result), {'p1', 'p2'})
        self.assertEqual(result['p1'], {'b': 'Cross', 'a': 'Circle', 'y': 'Square', 'x': 'Triangle',
                                        'select': 'Select', 'start': 'Start', 'l': 'L1', 'r': 'R1', 'l2': 'L2',
                                        'r2': 'R2', 'l3': 'L3', 'r3': 'R3'})
        self.assertEqual(result['p2'], {'b': 'Cross'})

    def test_blocco_vuoto_non_conta(self):
        # Beetle PSX manda prima un blocco senza nomi.
        reader = DescriptorReader()
        feed(reader, ['[INFO] [Environ] SET_INPUT_DESCRIPTORS.', '[INFO] [Environ] GET_RUMBLE_INTERFACE.'])
        self.assertFalse(reader.ready.is_set())
        self.assertIsNone(reader.result())
        feed(reader, PCSX_LOG)
        self.assertTrue(reader.ready.is_set())
        self.assertEqual(reader.result()['p1']['b'], 'Cross')

    def test_vale_l_ultimo_blocco(self):
        reader = DescriptorReader()
        feed(reader, PCSX_LOG)
        feed(reader, ['[INFO] [Environ] SET_INPUT_DESCRIPTORS.', '[DEBUG]    Port 1:',
                      '[DEBUG]       "B Button (Down)" => "Jump"', '[INFO] fine'])
        self.assertEqual(reader.result(), {'p1': {'b': 'Jump'}})

    def test_blocco_non_finito_a_fine_log(self):
        reader = DescriptorReader()
        feed(reader, PCSX_LOG[:4])
        self.assertFalse(reader.ready.is_set())
        self.assertEqual(reader.result(), {'p1': {'b': 'Cross'}})


class RemapFileTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, 'gioco.rmp')

    def tearDown(self):
        self.tmp.cleanup()

    def test_cartella_dei_remap(self):
        retroarch = os.path.join('/home/utente/snap/retroarch/common', '.config', 'retroarch')
        self.assertEqual(remap_dir(retroarch, '~/.config/retroarch/config/remaps'),
                         '/home/utente/snap/retroarch/common/.config/retroarch/config/remaps')
        self.assertEqual(remap_dir(retroarch, '/srv/remaps/'), '/srv/remaps')
        self.assertEqual(remap_dir(retroarch, ''), os.path.join(retroarch, 'config', 'remaps'))
        self.assertEqual(remap_dir('/opt/retroarch', '~/remaps'), os.path.join('/opt/retroarch', 'config', 'remaps'))

    def test_scrittura_e_lettura(self):
        mapping = check_mapping({'p1': {'b': 'a', 'a': 'b'}, 'p2': {'l2': 'r2', 'r2': 'l2'}})
        text = remap_text(mapping, ['input_libretro_device_p1 = "1"'])
        self.assertEqual(text.splitlines(), [
            'input_libretro_device_p1 = "1"',
            'input_player1_btn_a = "0"',
            'input_player1_btn_b = "8"',
            'input_player2_btn_r2 = "12"',
            'input_player2_btn_l2 = "13"',
        ])
        with open(self.path, 'w') as stream:
            stream.write(text)
        read, others = read_remap(self.path)
        self.assertEqual(read, mapping)
        self.assertEqual(others, ['input_libretro_device_p1 = "1"'])

    def test_nessuna_riassegnazione(self):
        self.assertEqual(remap_text(check_mapping({})), '')
        mapping, others = read_remap(os.path.join(self.tmp.name, 'manca.rmp'))
        self.assertEqual(mapping['p1'], {button: button for button in EDITABLE})
        self.assertEqual(others, [])

    def test_assegnazioni_non_riconosciute(self):
        # B tolto (-1) e A su START: per P1 si torna ai tasti predefiniti, le altre righe restano.
        with open(self.path, 'w') as stream:
            stream.write('input_player1_btn_b = "-1"\ninput_player1_btn_a = "3"\ninput_player1_btn_up = "5"\n'
                         'input_player2_btn_x = "1"\ninput_player2_btn_y = "9"\n')
        mapping, others = read_remap(self.path)
        self.assertEqual(mapping['p1'], {button: button for button in EDITABLE})
        self.assertEqual(mapping['p2']['y'], 'x')
        self.assertEqual(mapping['p2']['x'], 'y')
        self.assertEqual(others, ['input_player1_btn_up = "5"'])

    def test_controlli_delle_richieste(self):
        with self.assertRaises(LaunchError):
            check_mapping({'p1': {'b': 'a'}})
        with self.assertRaises(LaunchError):
            check_mapping({'p1': {'start': 'b', 'b': 'start'}})
        with self.assertRaises(LaunchError):
            check_mapping({'p3': {}})
        with self.assertRaises(LaunchError):
            check_mapping([])
        self.assertEqual(check_labels({'p1': {'b': '  Pagaia   sinistra ', 'a': '', 'start': 'Pausa'}}),
                         {'p1': {'b': 'Pagaia sinistra', 'start': 'Pausa'}})
        self.assertEqual(check_labels({'p1': {'b': 'x' * 40}})['p1']['b'], 'x' * 24)
        with self.assertRaises(LaunchError):
            check_labels({'p1': {'up': 'Su'}})
        with self.assertRaises(LaunchError):
            check_labels({'p1': {'b': 3}})


class FakeConfig:
    def __init__(self, cores_dir):
        self.cores_dir = cores_dir

    def resolve_path(self, key):
        return {'paths.cores': self.cores_dir}[key]


class FakeCores:
    def __init__(self):
        self.association = None

    def game_core(self, system_id, game_id):
        return self.association


class FakeIngame:
    def __init__(self):
        self.opened = 0

    def open_controls(self):
        self.opened += 1


GAME = {'id': 'Tekken 3.cue', 'file': 'Tekken 3.cue'}


class ControlsServiceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        home = os.path.join(self.tmp.name, 'common')
        self.retroarch = os.path.join(home, '.config', 'retroarch')
        self.cores_dir = os.path.join(self.retroarch, 'cores')
        os.makedirs(self.cores_dir)
        with open(os.path.join(self.retroarch, 'retroarch.cfg'), 'w') as stream:
            stream.write('input_remapping_directory = "~/.config/retroarch/config/remaps"\n')
        with open(os.path.join(self.cores_dir, 'pcsx_rearmed_libretro.so'), 'wb') as stream:
            stream.write(b'core')
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        self.repo = ControlsRepository(self.db)
        self.cores = FakeCores()
        self.names = []
        self.sleeps = []
        self.service = ControlsService(self.repo, FakeConfig(self.cores_dir), self.cores, self.library_name,
                                       lambda target: target(), self.sleeps.append, lambda: AT, descriptor_wait=0)
        self.ingame = FakeIngame()
        self.service.ingame = self.ingame
        self.remap = os.path.join(self.retroarch, 'config', 'remaps', 'PCSX-ReARMed', 'Tekken 3.rmp')

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def library_name(self, path):
        self.names.append(path)
        return 'PCSX-ReARMed'

    def started(self, running=True):
        reader = DescriptorReader()
        feed(reader, PCSX_LOG)
        job = {'system': 'ps1', 'game': GAME}
        self.service.game_started(job, 'pcsx_rearmed', reader, lambda: running)
        return reader

    def test_prima_partita_apre_la_finestra(self):
        self.started()
        self.assertEqual(self.ingame.opened, 1)
        self.assertEqual(self.sleeps, [2.0])
        row = self.repo.get('ps1', GAME['id'], 'pcsx_rearmed')
        self.assertEqual(row['descriptors']['p1']['b'], 'Cross')
        self.assertIsNone(row['confirmedAt'])
        # Partita già finita o in riavvio: niente finestra.
        self.started(running=False)
        self.assertEqual(self.ingame.opened, 1)

    def test_senza_nomi_niente_finestra(self):
        reader = DescriptorReader()
        self.service.game_started({'system': 'ps1', 'game': GAME}, 'pcsx_rearmed', reader, lambda: True)
        self.assertEqual(self.ingame.opened, 0)
        self.assertIsNone(self.repo.get('ps1', GAME['id'], 'pcsx_rearmed'))

    def test_salvataggio_scrive_il_remap(self):
        with self.assertRaises(LaunchError):
            self.service.save('ps1', GAME, {}, {}, 'pcsx_rearmed')
        self.started()
        changed = self.service.save('ps1', GAME, {'p1': {'b': 'a', 'a': 'b'}}, {'p1': {'b': 'Calcio'}},
                                    'pcsx_rearmed')
        self.assertTrue(changed)
        with open(self.remap) as stream:
            self.assertEqual(stream.read(), 'input_player1_btn_a = "0"\ninput_player1_btn_b = "8"\n')
        self.assertEqual(oct(os.stat(self.remap).st_mode & 0o777), '0o644')
        row = self.repo.get('ps1', GAME['id'], 'pcsx_rearmed')
        self.assertEqual((row['labels'], row['confirmedAt']), ({'p1': {'b': 'Calcio'}}, AT))
        # Stesse assegnazioni: nessun riavvio. Il nome del core si legge una volta sola.
        self.assertFalse(self.service.save('ps1', GAME, {'p1': {'b': 'a', 'a': 'b'}}, {}, 'pcsx_rearmed'))
        self.assertEqual(len(self.names), 1)
        # Configurazione confermata: alla partita successiva nessuna finestra.
        self.started()
        self.assertEqual(self.ingame.opened, 1)

    def test_dualshock_nei_remap_ps1(self):
        rom = os.path.join(self.tmp.name, 'games', 'ps1', 'Tekken 3.cue')
        folder = os.path.join(os.path.dirname(self.remap), 'ps1.rmp')
        device = 'input_libretro_device_p1 = "517"\ninput_libretro_device_p2 = "517"\n'
        # Senza remap del gioco: solo quello della cartella.
        self.service.ensure_device('ps1', GAME, 'pcsx_rearmed', rom, 'dualshock')
        with open(folder) as stream:
            self.assertEqual(stream.read(), device)
        self.assertFalse(os.path.exists(self.remap))
        # Il remap del gioco ha la precedenza: le righe vanno anche lì, le altre restano.
        with open(self.remap, 'w') as stream:
            stream.write('input_player1_btn_a = "0"\ninput_libretro_device_p1 = "1"\ninput_player1_btn_b = "8"\n')
        self.service.ensure_device('ps1', GAME, 'pcsx_rearmed', rom, 'dualshock')
        with open(self.remap) as stream:
            self.assertEqual(stream.read(), 'input_player1_btn_a = "0"\ninput_player1_btn_b = "8"\n' + device)
        mark = os.stat(folder).st_mtime_ns
        self.service.ensure_device('ps1', GAME, 'pcsx_rearmed', rom, 'dualshock')
        self.assertEqual(os.stat(folder).st_mtime_ns, mark)
        # Le righe del controller restano quando si tolgono le riassegnazioni.
        self.started()
        self.service.save('ps1', GAME, {}, {}, 'pcsx_rearmed')
        with open(self.remap) as stream:
            self.assertEqual(stream.read(), device)

    def test_pad_digitale_senza_dato(self):
        rom = os.path.join(self.tmp.name, 'games', 'ps1', 'Tekken 3.cue')
        folder = os.path.join(os.path.dirname(self.remap), 'ps1.rmp')
        digital = 'input_libretro_device_p1 = "1"\ninput_libretro_device_p2 = "1"\n'
        for controller in (None, 'digital', 'sconosciuto'):
            self.service.ensure_device('ps1', GAME, 'pcsx_rearmed', rom, controller)
            with open(folder) as stream:
                self.assertEqual(stream.read(), digital)
        # Il remap della cartella cambia con il gioco che parte.
        self.service.ensure_device('ps1', GAME, 'pcsx_rearmed', rom, 'dualshock')
        with open(folder) as stream:
            self.assertEqual(stream.read(), digital.replace('"1"', '"517"'))

    def test_controller_solo_per_le_console_che_lo_chiedono(self):
        rom = os.path.join(self.tmp.name, 'games', 'nes', 'Tekken 3.cue')
        self.service.ensure_device('nes', GAME, 'pcsx_rearmed', rom)
        self.assertFalse(os.path.exists(os.path.dirname(self.remap)))
        self.assertEqual(self.names, [])

    def test_tasti_predefiniti_tolgono_il_file(self):
        self.started()
        os.makedirs(os.path.dirname(self.remap))
        with open(self.remap, 'w') as stream:
            stream.write('input_player1_btn_a = "0"\ninput_player1_btn_b = "8"\n')
        self.assertTrue(self.service.save('ps1', GAME, {}, {}, 'pcsx_rearmed'))
        self.assertFalse(os.path.exists(self.remap))

    def test_descrizione_per_l_interfaccia(self):
        data = self.service.describe('ps1', GAME)
        self.assertEqual((data['core'], data['descriptors'], data['confirmed']), (None, {}, False))
        self.started()
        self.cores.association = {'core': 'pcsx_rearmed', 'status': 'ok', 'confirmedBy': 'auto'}
        self.service.save('ps1', GAME, {'p1': {'l': 'r', 'r': 'l'}}, {}, None)
        data = self.service.describe('ps1', GAME)
        self.assertEqual(data['core'], 'pcsx_rearmed')
        self.assertTrue(data['confirmed'])
        self.assertEqual(data['map']['p1']['l'], 'r')
        self.assertEqual(data['descriptors']['p1']['l'], 'L1')
        self.assertEqual(data['editable'], list(EDITABLE))
        # Senza associazione vale l'ultimo core che ha dato i nomi.
        self.cores.association = None
        self.assertEqual(self.service.describe('ps1', GAME)['core'], 'pcsx_rearmed')

    def test_core_non_installato_o_nome_illeggibile(self):
        self.repo.set_descriptors('ps1', GAME['id'], 'snes9x', {'p1': {'b': 'B'}}, AT)
        with self.assertRaises(LaunchError):
            self.service.save('ps1', GAME, {'p1': {'b': 'a', 'a': 'b'}}, {}, 'snes9x')
        self.started()
        self.service.library_name = lambda path: None
        self.service.names.clear()
        with self.assertRaises(LaunchError):
            self.service.save('ps1', GAME, {'p1': {'b': 'a', 'a': 'b'}}, {}, 'pcsx_rearmed')


class FakeControls:
    def __init__(self):
        self.saved = []
        self.changed = True
        self.fail = False

    def save(self, system_id, game, mapping, labels, core=None):
        if self.fail:
            raise LaunchError('Comandi non validi.')
        self.saved.append((system_id, game['id'], mapping, labels, core))
        return self.changed


class FakeLibrary:
    def find(self, system_id, game_id):
        return {'id': game_id, 'file': game_id}


class RestartingPlay(FakePlay):
    def __init__(self, *args):
        super().__init__(*args)
        self.library = FakeLibrary()
        self.restarts = 0
        self.cancelled = 0

    def request_restart(self):
        self.restarts += 1

    def cancel_restart(self):
        self.cancelled += 1


class IngameControlsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        luca = ProfilesRepository(self.db).create('LUCA', '#ff5d73', AT)
        store = SaveStore(os.path.join(self.tmp.name, 'data'), SavesRepository(self.db), lambda: AT)
        session = os.path.join(self.tmp.name, 'sessione')
        os.makedirs(session)
        self.retroarch = FakeRetroArch(os.path.join(session, 'Zelda.state'))
        self.clock = FakeClock()
        self.play = RestartingPlay(session, [luca, None], {luca})
        self.window = FakeWindow(self.retroarch)
        self.controls = FakeControls()
        self.ingame = IngameService(self.play, store, self.net, self.window, clock=self.clock, controls=self.controls)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def net(self):
        return RetroArchNet(55355, socket_factory=lambda: FakeSocket(self.retroarch), clock=self.clock,
                            sleep=self.clock.wait)

    def test_finestra_dei_comandi(self):
        state = self.ingame.open_controls()
        self.assertEqual((state['open'], state['kind'], state['slot']), (True, 'controls', 'p1'))
        self.assertEqual((self.retroarch.status, self.window.opened), (PAUSED, 1))
        # Con la finestra dei comandi aperta i salvataggi non si usano e la combinazione non apre altro.
        with self.assertRaises(ConflictError):
            self.ingame.save(1)
        self.ingame.open('p2')
        self.assertEqual(self.ingame.state()['kind'], 'controls')
        self.assertEqual(state['players'], ['p1'])
        # «Più tardi»: il gioco riprende senza salvare.
        self.ingame.close()
        self.assertFalse(self.ingame.state()['open'])
        self.assertEqual((self.retroarch.status, self.controls.saved), (PLAYING, []))

    def test_giocatori_presenti(self):
        # P2 c'è se all'avvio aveva un profilo o un joypad.
        self.play.info['pads'] = [0, 1]
        self.assertEqual(self.ingame.open_controls()['players'], ['p1', 'p2'])
        self.ingame.close()
        self.play.info['pads'] = [0, None]
        self.assertEqual(self.ingame.open_controls()['players'], ['p1'])
        self.ingame.close()
        self.play.info['players'] = [None, 7]
        self.assertEqual(self.ingame.open_controls()['players'], ['p1', 'p2'])

    def test_salva_e_riavvia(self):
        with self.assertRaises(ConflictError):
            self.ingame.save_controls({}, {})
        self.ingame.open_controls()
        self.ingame.save_controls({'p1': {'b': 'a', 'a': 'b'}}, {})
        self.assertEqual(self.controls.saved, [('nes', 'Zelda.nes', {'p1': {'b': 'a', 'a': 'b'}}, {}, 'fceumm')])
        self.assertEqual((self.play.restarts, self.window.closed), (1, 1))
        self.assertEqual(self.retroarch.received[-1], 'QUIT')
        self.assertFalse(self.ingame.state()['open'])

    def test_salva_senza_cambi_riprende(self):
        self.controls.changed = False
        self.ingame.open_controls()
        self.ingame.save_controls({}, {'p1': {'b': 'Salta'}})
        self.assertEqual(self.play.restarts, 0)
        self.assertNotIn('QUIT', self.retroarch.received)
        self.assertEqual(self.retroarch.status, PLAYING)

    def test_errore_lascia_la_finestra_aperta(self):
        self.controls.fail = True
        self.ingame.open_controls()
        with self.assertRaises(LaunchError):
            self.ingame.save_controls({}, {})
        self.assertTrue(self.ingame.state()['open'])
        self.assertEqual(self.retroarch.status, PAUSED)


if __name__ == '__main__':
    unittest.main()
