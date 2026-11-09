import os
import shutil
import tempfile
import unittest

from pixelarcade.core_info import MAX_INFO_BYTES, CoreCatalog, classify, parse_info

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'core_info')


def fixture(name):
    with open(os.path.join(FIXTURES, name + '_libretro.info'), encoding='utf-8') as stream:
        return parse_info(stream.read())


class ClassifyTest(unittest.TestCase):
    def test_lettura(self):
        info = parse_info('# commento\ndisplay_name = "Prova"\n\nriga senza uguale\nnotes = "a|b"  \n')
        self.assertEqual(info, {'display_name': 'Prova', 'notes': 'a|b'})

    def test_arcade(self):
        for name in ('fbneo', 'mame2003_plus', 'hbmame'):
            self.assertEqual(classify(fixture(name), name), {'kind': 'console', 'types': ['Arcade']}, name)

    def test_multi_non_e_arcade(self):
        self.assertEqual(classify(fixture('mamemess'), 'mamemess'), {'kind': 'console', 'types': ['Multi (various)']})

    def test_core_multi_console(self):
        self.assertEqual(classify(fixture('genesis_plus_gx'))['types'], [
            'Sega - Game Gear', 'Sega - Master System - Mark III', 'Sega - Mega-CD - Sega CD',
            'Sega - Mega Drive - Genesis', 'Sega - PICO', 'Sega - SG-1000'])
        self.assertEqual(classify(fixture('nestopia'))['types'], [
            'Nintendo - Nintendo Entertainment System', 'Nintendo - Family Computer Disk System'])

    def test_database_senza_produttore(self):
        self.assertEqual(classify(fixture('dosbox_pure')), {'kind': 'console', 'types': ['Microsoft - DOS']})

    def test_tipologia_dedicata(self):
        self.assertEqual(classify(fixture('daphne'))['types'], ['Daphne - Laserdisc'])

    def test_motori_di_gioco(self):
        self.assertEqual(classify(fixture('prboom'), 'prboom'), {'kind': 'engine', 'types': ['DOOM']})
        self.assertEqual(classify(fixture('scummvm'), 'scummvm'), {'kind': 'engine', 'types': ['ScummVM']})
        self.assertEqual(classify(fixture('vircon32'), 'vircon32'), {'kind': 'engine', 'types': ['Vircon32']})

    def test_gioco_senza_contenuto_ed_escluso(self):
        self.assertEqual(classify(fixture('2048'), '2048'), {'kind': 'nogame', 'types': []})
        self.assertEqual(classify(fixture('testgl'), 'testgl'), {'kind': None, 'types': []})
        self.assertEqual(classify({}), {'kind': None, 'types': []})


class CatalogTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = os.path.join(self.tmp.name, 'cores')
        shutil.copytree(FIXTURES, self.dir)

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name, text):
        with open(os.path.join(self.dir, name), 'w', encoding='utf-8') as stream:
            stream.write(text)

    def test_catalogo(self):
        cores = CoreCatalog(self.dir).cores()
        self.assertEqual(len(cores), 15)
        self.assertEqual(cores['fbneo']['label'], 'Arcade (FinalBurn Neo)')
        self.assertEqual(cores['fbneo']['extensions'], ['zip', '7z', 'cue', 'ccd'])
        self.assertEqual(cores['vircon32']['extensions'], ['v32'])
        self.assertEqual(cores['testgl']['kind'], None)

    def test_tipologie_e_gruppi(self):
        types = CoreCatalog(self.dir).types()
        names = [entry['name'] for entry in types]
        self.assertEqual(names[0], 'Arcade')
        self.assertEqual(types[0], {'name': 'Arcade', 'group': 'Arcade', 'cores': ['fbneo', 'hbmame', 'mame2003_plus']})
        groups = [entry['group'] for entry in types]
        self.assertEqual(groups[-3:], ['Motori di gioco'] * 3)
        self.assertLess(groups.index('Microsoft'), groups.index('Nintendo'))
        self.assertLess(groups.index('Sega'), groups.index('Altri'))
        gamecube = next(entry for entry in types if entry['name'] == 'Nintendo - GameCube')
        self.assertEqual(gamecube['cores'], ['dolphin', 'ishiiruka'])
        self.assertNotIn('2048', [core for entry in types for core in entry['cores']])

    def test_tipologie_solo_con_core_disponibili(self):
        types = CoreCatalog(self.dir).types({'dolphin', 'prboom'})
        self.assertEqual([(entry['name'], entry['cores']) for entry in types], [
            ('Nintendo - GameCube', ['dolphin']), ('Nintendo - Wii', ['dolphin']),
            ('Nintendo - Wii (Digital)', ['dolphin']), ('DOOM', ['prboom'])])

    def test_file_malformati_troppo_grandi_e_link(self):
        self.write('rotto_libretro.info', 'nessuna voce valida\n')
        self.write('grande_libretro.info', 'display_name = "x"\n' + '#' * MAX_INFO_BYTES)
        self.write('altro.txt', 'display_name = "x"\n')
        os.symlink(os.path.join(self.dir, 'fbneo_libretro.info'), os.path.join(self.dir, 'link_libretro.info'))
        with self.assertLogs('pixelarcade.core_info', 'WARNING'):
            cores = CoreCatalog(self.dir).cores()
        for name in ('rotto', 'grande', 'link', 'altro'):
            self.assertNotIn(name, cores)

    def test_cache_per_mtime(self):
        catalog = CoreCatalog(self.dir)
        first = catalog.cores()
        self.assertIs(catalog.cores(), first)
        self.write('nuovo_libretro.info', 'display_name = "Nuovo"\ncategories = "Emulator"\n'
                                          'database = "Casa - Console"\n')
        stat = os.stat(self.dir)
        os.utime(self.dir, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000_000))
        self.assertIn('nuovo', catalog.cores())
        self.assertEqual(CoreCatalog(os.path.join(self.tmp.name, 'manca')).cores(), {})


if __name__ == '__main__':
    unittest.main()
