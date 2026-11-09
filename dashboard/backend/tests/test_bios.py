import hashlib
import os
import tempfile
import unittest

from pixelarcade.bios import BiosService, browse, describe, relative_path, roots
from pixelarcade.core_info import firmware, parse_info
from pixelarcade.db import Database
from pixelarcade.errors import ConfigError, ConflictError
from pixelarcade.repositories.bios import BiosRepository

AT = '2026-10-17T22:00:00+00:00'
US = b'bios americano'
US_MD5 = hashlib.md5(US).hexdigest()

INFO = {
    'mednafen_psx_hw': '''
firmware_count = 3
firmware0_desc = "scph5501.bin (PS1 US BIOS)"
firmware0_path = "scph5501.bin"
firmware0_opt = "false"
firmware1_desc = "scph5502.bin (PS1 EU BIOS)"
firmware1_path = "scph5502.bin"
firmware1_opt = "false"
firmware2_desc = "psxonpsp660.bin (PSP PS1 BIOS)"
firmware2_path = "psxonpsp660.bin"
firmware2_opt = "true"
notes = "(!) scph5501.bin (md5): %s|(!) scph5502.bin (md5): 32736f17079d0b2b7024407c39bd3050"
''' % US_MD5,
    'pcsx2': '''
firmware_count = 2
firmware0_desc = "'pcsx2/bios' folder"
firmware0_path = "pcsx2/bios"
firmware0_opt = "false"
firmware1_desc = "pcsx2/resources/GameIndex.yaml (Game Database)"
firmware1_path = "pcsx2/resources/GameIndex.yaml"
firmware1_opt = "false"
''',
    'play': 'display_name = "Play!"',
    'ppsspp': '''
firmware_count = 1
firmware0_desc = "ppge_atlas.zim (PPSSPP Data ROM)"
firmware0_path = "PPSSPP/ppge_atlas.zim"
firmware0_opt = "false"
''',
}
SYSTEM_CORES = {'ps1': ['mednafen_psx_hw'], 'ps2': ['play', 'pcsx2', 'senzainfo'], 'psp': ['ppsspp']}
OPTIONS = {
    'play': [
        {'key': 'play_bios', 'label': 'BIOS', 'values': [{'value': 'auto'}, {'value': 'ps2/scph39001.bin'},
                                                          {'value': '../fuori.bin'}]},
        {'key': 'play_res_multi', 'label': 'Risoluzione', 'values': [{'value': 'x1.bin'}]},
    ],
}


class FakeCatalog:
    def __init__(self):
        self.data = {name: {'label': name, 'firmware': firmware(parse_info(text))} for name, text in INFO.items()}

    def cores(self):
        return self.data


class FakeConfig:
    def __init__(self, root):
        self.root = root
        self.info = FakeCatalog()

    def resolve_path(self, key):
        return os.path.join(self.root, {'paths.cores': 'common/.config/retroarch/cores', 'paths.roms': 'roms'}[key])

    def catalog(self):
        return self.info

    def system_cores(self, system_id):
        return list(SYSTEM_CORES[system_id])

    def installed_cores(self):
        return ['mednafen_psx_hw', 'play']


class BiosTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        self.db = Database(os.path.join(self.root, 'test.db'))
        self.db.migrate()
        self.keys = {'system_directory': '~/.config/retroarch/system'}
        self.forgotten = []
        self.playing = False
        self.service = BiosService(BiosRepository(self.db), FakeConfig(self.root), lambda: self.keys,
                                   lambda system_id, core: OPTIONS.get(core, []), self.forgotten.append,
                                   lambda: self.playing, lambda: AT)
        self.system = os.path.join(self.root, 'common', '.config', 'retroarch', 'system')
        self.downloads = os.path.join(self.root, 'Scaricati')
        os.makedirs(self.downloads)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def source(self, name, data):
        path = os.path.join(self.downloads, name)
        with open(path, 'wb') as stream:
            stream.write(data)
        return path

    def files(self, system_id, core):
        page = self.service.page(system_id)
        entry = next(item for item in page['cores'] if item['core'] == core)
        return {row['id']: row for row in entry['files']}

    def test_firmware_dal_info(self):
        info = firmware(parse_info(INFO['mednafen_psx_hw']))
        self.assertEqual([(item['path'], item['optional'], item['folder']) for item in info],
                         [('scph5501.bin', False, False), ('scph5502.bin', False, False),
                          ('psxonpsp660.bin', True, False)])
        self.assertEqual(info[0]['md5'], US_MD5)
        self.assertIsNone(info[2]['md5'])
        folder = firmware(parse_info(INFO['pcsx2']))
        self.assertEqual([item['folder'] for item in folder], [True, False])
        self.assertEqual(firmware({'firmware_count': 'x'}), [])
        self.assertEqual(firmware({'firmware_count': '1', 'firmware0_path': '../fuori.bin'}), [])
        self.assertEqual(describe('scph5501.bin (PS1 US BIOS)', 'scph5501.bin'), 'PS1 US BIOS')
        self.assertEqual(describe("'pcsx2/bios' folder", 'pcsx2/bios'), "'pcsx2/bios' folder")

    def test_cartella_di_sistema(self):
        # La «~» di RetroArch snap è la cartella che contiene .config/retroarch.
        self.assertEqual(self.service.system_dir(), self.system)
        self.assertEqual(self.service.retroarch_options(),
                         [('system_directory', self.system), ('systemfiles_in_content_dir', 'false')])
        self.keys = {'system_directory': 'default'}
        self.assertEqual(self.service.read_system_dir(), self.system)
        self.keys = {'system_directory': '/srv/bios'}
        self.assertEqual(self.service.read_system_dir(), '/srv/bios')

    def test_elenco_e_stato(self):
        files = self.files('ps1', 'mednafen_psx_hw')
        self.assertEqual(list(files), ['info:scph5501.bin', 'info:scph5502.bin', 'info:psxonpsp660.bin'])
        self.assertEqual({row['status'] for row in files.values()}, {'missing'})
        self.assertEqual(files['info:scph5501.bin']['note'], 'PS1 US BIOS')
        self.assertTrue(files['info:scph5501.bin']['required'])
        self.assertEqual(self.service.missing_required('mednafen_psx_hw'), ['scph5501.bin', 'scph5502.bin'])
        self.assertEqual(self.service.different_files('mednafen_psx_hw'), [])
        self.assertEqual(self.service.summary('ps1', 'mednafen_psx_hw')['status'], 'missing')
        os.makedirs(self.system)
        for name, data in (('scph5501.bin', US), ('scph5502.bin', b'altro')):
            with open(os.path.join(self.system, name), 'wb') as stream:
                stream.write(data)
        files = self.files('ps1', 'mednafen_psx_hw')
        self.assertEqual([row['status'] for row in files.values()], ['ok', 'different', 'missing'])
        # Non copiati dalla dashboard: non si tolgono.
        self.assertFalse(files['info:scph5501.bin']['removable'])
        self.assertEqual(self.service.missing_required('mednafen_psx_hw'), [])
        self.assertEqual(self.service.different_files('mednafen_psx_hw'), ['scph5502.bin'])
        self.assertEqual(self.service.summary('ps1', 'mednafen_psx_hw'), {'status': 'present', 'label': '2 di 3 presenti'})

    def test_core_senza_bios_e_opzioni(self):
        page = self.service.page('ps2')
        # Solo i core con un .info.
        self.assertEqual([entry['core'] for entry in page['cores']], ['play', 'pcsx2'])
        play = self.files('ps2', 'play')
        # Dall'opzione che parla di BIOS, solo i valori che sono nomi di file dentro la cartella di sistema.
        self.assertEqual(list(play), ['option:ps2/scph39001.bin'])
        self.assertEqual(play['option:ps2/scph39001.bin']['note'], 'Indicato dall\'opzione «BIOS»')
        self.assertEqual(self.service.summary('ps2', 'play'), {'status': 'present', 'label': '0 di 1 presenti'})
        self.assertEqual(self.service.summary('ps2', None)['status'], 'none')

    def test_cartella_dichiarata(self):
        files = self.files('ps2', 'pcsx2')
        self.assertTrue(files['info:pcsx2/bios']['folder'])
        self.assertEqual(files['info:pcsx2/bios']['status'], 'missing')
        source = self.source('SCPH-39001.BIN', b'ps2')
        result = self.service.import_file('ps2', 'pcsx2', 'info:pcsx2/bios', source)
        self.assertEqual(result, {'saved': True, 'path': 'pcsx2/bios/SCPH-39001.BIN', 'warning': None})
        files = self.files('ps2', 'pcsx2')
        self.assertEqual(files['info:pcsx2/bios']['status'], 'present')
        self.assertTrue(files['folderFile:pcsx2/bios/SCPH-39001.BIN']['removable'])
        self.assertEqual(self.service.missing_required('pcsx2'), ['pcsx2/resources/GameIndex.yaml'])
        self.assertEqual(self.forgotten, ['pcsx2'])

    def test_opzione_con_i_file_della_cartella(self):
        # ``pcsx2_bios`` elenca i nomi dei file in ``pcsx2/bios``, non nella cartella di sistema.
        options = [{'key': 'pcsx2_bios', 'label': 'BIOS', 'values': [{'value': 'A.BIN'}, {'value': 'B.BIN'}]}]
        self.service.config.installed_cores = lambda: ['pcsx2']
        self.service.core_options = lambda system_id, core: options
        self.service.import_file('ps2', 'pcsx2', 'info:pcsx2/bios', self.source('A.BIN', b'ps2'))
        files = self.files('ps2', 'pcsx2')
        self.assertEqual([key for key in files if key.endswith('.BIN')],
                         ['folderFile:pcsx2/bios/A.BIN', 'option:pcsx2/bios/B.BIN'])
        self.assertEqual(files['folderFile:pcsx2/bios/A.BIN']['status'], 'present')
        self.assertEqual(files['option:pcsx2/bios/B.BIN']['status'], 'missing')

    def test_copia_con_conferma_e_avviso(self):
        source = self.source('bios usa.bin', US)
        result = self.service.import_file('ps1', 'mednafen_psx_hw', 'info:scph5501.bin', source)
        self.assertEqual(result, {'saved': True, 'path': 'scph5501.bin', 'warning': None})
        with open(os.path.join(self.system, 'scph5501.bin'), 'rb') as stream:
            self.assertEqual(stream.read(), US)
        # Il file scelto resta dov'era.
        self.assertTrue(os.path.isfile(source))
        self.assertEqual(self.service.repo.all()['scph5501.bin']['original'], 'bios usa.bin')
        other = self.source('altro.bin', b'diverso')
        self.assertIn('confirm', self.service.import_file('ps1', 'mednafen_psx_hw', 'info:scph5501.bin', other))
        result = self.service.import_file('ps1', 'mednafen_psx_hw', 'info:scph5501.bin', other, confirm=True)
        self.assertIn('non è la versione attesa', result['warning'])
        self.assertIn('schermo nero', result['warning'])
        with open(os.path.join(self.system, 'scph5501.bin'), 'rb') as stream:
            self.assertEqual(stream.read(), b'diverso')

    def test_file_in_coppia_non_nel_info(self):
        # ``ppge_atlas.meta`` non è nel .info di PPSSPP ma serve: obbligatorio come quelli del .info.
        files = self.files('psp', 'ppsspp')
        self.assertEqual(list(files), ['info:PPSSPP/ppge_atlas.zim', 'info:PPSSPP/ppge_atlas.meta'])
        self.assertTrue(files['info:PPSSPP/ppge_atlas.meta']['required'])
        self.assertEqual(files['info:PPSSPP/ppge_atlas.meta']['note'], 'Caratteri di ppge_atlas.zim, stessa versione')
        # Senza il .meta accanto il .zim si copia, con l'avviso di sceglierlo a parte.
        zim = self.source('ppge_atlas.zim', b'zim')
        result = self.service.import_file('psp', 'ppsspp', 'info:PPSSPP/ppge_atlas.zim', zim)
        self.assertEqual(result['path'], 'PPSSPP/ppge_atlas.zim')
        self.assertIn('non c\'è ppge_atlas.meta', result['warning'])
        self.assertEqual(self.service.missing_required('ppsspp'), ['PPSSPP/ppge_atlas.meta'])
        self.assertEqual(self.service.summary('psp', 'ppsspp')['status'], 'missing')
        # Il .meta si sceglie dalla sua riga, da un'altra cartella e con un altro nome.
        other = os.path.join(self.root, 'altrove')
        os.makedirs(other)
        meta = os.path.join(other, 'atlas.meta')
        with open(meta, 'wb') as stream:
            stream.write(b'meta')
        result = self.service.import_file('psp', 'ppsspp', 'info:PPSSPP/ppge_atlas.meta', meta)
        self.assertEqual(result['path'], 'PPSSPP/ppge_atlas.meta')
        # Accanto ad atlas.meta non c'è il .zim: avviso, ma quello già copiato resta.
        self.assertIn('non c\'è ppge_atlas.zim', result['warning'])
        self.assertEqual(self.service.missing_required('ppsspp'), [])
        self.assertTrue(self.files('psp', 'ppsspp')['info:PPSSPP/ppge_atlas.meta']['removable'])
        # Con i due file nella stessa cartella basta sceglierne uno: l'altro si sostituisce senza chiedere.
        self.source('ppge_atlas.meta', b'meta nuovo')
        zim = self.source('ppge_atlas.zim', b'zim nuovo')
        result = self.service.import_file('psp', 'ppsspp', 'info:PPSSPP/ppge_atlas.zim', zim, confirm=True)
        self.assertIsNone(result['warning'])
        for name, data in (('ppge_atlas.zim', b'zim nuovo'), ('ppge_atlas.meta', b'meta nuovo')):
            with open(os.path.join(self.system, 'PPSSPP', name), 'rb') as stream:
                self.assertEqual(stream.read(), data)
        self.assertEqual(self.service.repo.all()['PPSSPP/ppge_atlas.meta']['original'], 'ppge_atlas.meta')

    def test_aggiunto_a_mano_e_rimozione(self):
        source = self.source('ps2.bin', b'x')
        result = self.service.import_file('ps2', 'play', 'manual', source, folder='play/bios', name='scph.bin')
        self.assertEqual(result['path'], 'play/bios/scph.bin')
        files = self.files('ps2', 'play')
        self.assertEqual(files['manual:play/bios/scph.bin']['status'], 'present')
        self.assertTrue(files['manual:play/bios/scph.bin']['removable'])
        self.assertIn('play/bios', self.service.folders())
        self.service.remove('ps2', 'play', 'play/bios/scph.bin')
        self.assertFalse(os.path.exists(os.path.join(self.system, 'play', 'bios', 'scph.bin')))
        self.assertNotIn('manual:play/bios/scph.bin', self.files('ps2', 'play'))
        with self.assertRaises(ConfigError):
            self.service.remove('ps2', 'play', 'play/bios/scph.bin')

    def test_controlli(self):
        source = self.source('a.bin', b'x')
        for folder, name in (('../fuori', 'a.bin'), ('', '..'), ('a', 'b/c'), ('', ' a.bin')):
            with self.assertRaises(ConfigError):
                self.service.import_file('ps2', 'play', 'manual', source, folder=folder, name=name)
        with self.assertRaises(ConfigError):
            self.service.import_file('ps2', 'play', 'option:../fuori.bin', source)
        with self.assertRaises(ConfigError):
            self.service.import_file('ps2', 'mednafen_psx_hw', 'manual', source)
        with self.assertRaises(ConfigError):
            self.service.import_file('ps2', 'play', 'manual', os.path.join(self.downloads, 'manca.bin'))
        self.playing = True
        with self.assertRaises(ConflictError):
            self.service.import_file('ps2', 'play', 'manual', source)
        self.assertEqual(relative_path('', 'a.bin'), 'a.bin')
        self.assertEqual(relative_path('x/y/', 'a.bin'), 'x/y/a.bin')

    def test_selettore_dei_file(self):
        os.makedirs(os.path.join(self.downloads, 'Cartella'))
        self.source('.nascosto', b'')
        self.source('b.bin', b'12')
        listing = browse(self.downloads + '/')
        self.assertEqual(listing['path'], self.downloads)
        self.assertEqual(listing['parent'], self.root)
        self.assertEqual([(entry['name'], entry['dir'], entry['size']) for entry in listing['entries']],
                         [('Cartella', True, None), ('b.bin', False, 2)])
        self.assertEqual(listing['hidden'], 1)
        self.assertEqual(len(browse(self.downloads, hidden=True)['entries']), 3)
        self.assertIsNone(browse('/')['parent'])
        for path in ('relativo', os.path.join(self.root, 'manca')):
            with self.assertRaises(ConfigError):
                browse(path)
        found = roots(os.path.join(self.root, 'roms'), home=self.root, user='nessuno')
        self.assertEqual([entry['id'] for entry in found], ['home', 'root'])


if __name__ == '__main__':
    unittest.main()
