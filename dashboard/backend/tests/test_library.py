import os
import tempfile
import unittest

from pixelarcade.errors import LibraryError
from pixelarcade.library import Library, clean_title
from pixelarcade.systems import PRESETS, describe, folder_of


class FakeConfig:
    """Configurazione minima: liste dei core già ordinate, estensioni dei core in ``core_extensions``."""

    def __init__(self, roms):
        self.roms = roms
        self.systems = {}
        self.available = {}
        self.core_extensions = []

    def resolve_path(self, key):
        return self.roms

    def systems_settings(self):
        return self.systems

    def available_cores(self):
        return self.available

    def candidate_cores(self, system_id, stored=None, available=None):
        result = []
        for name in (stored or {}).get('cores') or []:
            core = self.available.get(name, {})
            result.append({'name': name, 'label': name, 'extensions': [],
                           'installed': core.get('installed', False), 'downloadable': core.get('downloadable', False)})
        return result

    def default_extensions(self, system_id, stored=None, available=None):
        return describe(system_id)['extensions'] or list(self.core_extensions)


def touch(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as stream:
        stream.write('x')


class LibraryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.roms = os.path.join(self.tmp.name, 'games')
        os.makedirs(self.roms)
        self.config = FakeConfig(self.roms)
        self.library = Library(self.config)

    def tearDown(self):
        self.tmp.cleanup()

    def path(self, *parts):
        return os.path.join(self.roms, *parts)

    def ids(self, system):
        return [game['id'] for game in self.library.games(system)]

    def test_cartelle_dei_sistemi(self):
        # Il Mega Drive ha già una cartella con un altro nome: non se ne crea una seconda.
        os.makedirs(self.path('megadrive'))
        created = self.library.ensure_folders()
        self.assertNotIn('mega_drive', created)
        self.assertIn('ps1', created)
        self.assertIn('commodore_64', created)
        self.assertEqual(len(created), len(PRESETS) - 1)
        self.assertEqual({describe(folder)['preset'] for folder in self.library.folders()}, set(PRESETS))
        self.assertEqual(self.library.ensure_folders(), [])
        # Senza cartella dei giochi non si crea niente.
        self.assertEqual(Library(FakeConfig(self.path('manca'))).ensure_folders(), [])

    def test_marca_e_ordine(self):
        for folder in ('ps1', 'mega_drive', 'boh', 'mame'):
            os.makedirs(self.path(folder))
        systems = {system['id']: system for system in self.library.systems()}
        self.assertEqual((systems['ps1']['brand'], systems['ps1']['order']), ('sony', 0))
        self.assertEqual((systems['mega_drive']['brand'], systems['mega_drive']['order']), ('sega', 2))
        self.assertEqual((systems['boh']['brand'], systems['boh']['order']), ('other', None))
        self.assertEqual(systems['mame']['brand'], 'arcade')
        self.assertEqual(folder_of('md'), 'mega_drive')

    def test_titoli(self):
        self.assertEqual(clean_title('digdug2.zip', True), 'digdug2')
        self.assertEqual(clean_title('Super_Mario  Bros (USA) [!].nes', False), 'Super Mario Bros')
        self.assertEqual(clean_title('(Proto).nes', False), '(Proto)')

    def test_filtro_estensioni_e_sottocartelle(self):
        touch(self.path('nes', 'Zelda (E).nes'))
        touch(self.path('nes', 'leggimi.txt'))
        touch(self.path('nes', 'Giappone', 'Contra.zip'))
        self.assertEqual(self.ids('nes'), ['Giappone/Contra.zip', 'Zelda (E).nes'])
        game = self.library.find('nes', 'Zelda (E).nes')
        self.assertEqual(game, {'id': 'Zelda (E).nes', 'file': 'Zelda (E).nes', 'title': 'Zelda', 'year': None,
                                'genre': None, 'players': None, 'cover': False,
                                'core': None, 'coreStatus': None})
        self.assertIsNone(self.library.find('nes', 'manca.nes'))

    def test_core_associato_sempre_aggiornato(self):
        class FakeCores:
            associations = {}

            def game_cores_for(self, system_id):
                return dict(self.associations) if system_id == 'nes' else {}

        cores = FakeCores()
        library = Library(self.config, cores)
        touch(self.path('nes', 'Zelda.nes'))
        touch(self.path('nes', 'Contra.nes'))
        self.assertEqual(library.find('nes', 'Zelda.nes')['coreStatus'], None)
        cores.associations = {'Zelda.nes': ('nestopia', 'ok'), 'Contra.nes': (None, 'incompatible')}
        zelda = library.find('nes', 'Zelda.nes')
        self.assertEqual((zelda['core'], zelda['coreStatus']), ('nestopia', 'ok'))
        self.assertEqual(library.find('nes', 'Contra.nes')['coreStatus'], 'incompatible')
        # La cache contiene solo i file, senza le associazioni.
        self.assertNotIn('core', library.cache['nes'][0])

    def test_esclude_nascosti_e_link_simbolici(self):
        touch(self.path('arcade', 'pacman.zip'))
        touch(self.path('arcade', '.nascosto.zip'))
        touch(self.path('arcade', '.cartella', 'galaga.zip'))
        touch(os.path.join(self.tmp.name, 'fuori', 'dkong.zip'))
        os.symlink(os.path.join(self.tmp.name, 'fuori', 'dkong.zip'), self.path('arcade', 'dkong.zip'))
        os.symlink(os.path.join(self.tmp.name, 'fuori'), self.path('arcade', 'collegata'))
        os.symlink(os.path.join(self.tmp.name, 'fuori'), self.path('collegato'))
        os.makedirs(self.path('.segreta'))
        self.assertEqual(self.ids('arcade'), ['pacman.zip'])
        self.assertEqual(self.library.folders(), ['arcade'])

    def test_esclude_i_bios_arcade(self):
        touch(self.path('arcade', 'mslug.zip'))
        touch(self.path('arcade', 'neogeo.zip'))
        touch(self.path('nes', 'neogeo.zip'))
        self.assertEqual(self.ids('arcade'), ['mslug.zip'])
        self.assertEqual(self.ids('nes'), ['neogeo.zip'])

    def test_ordinamento_per_titolo(self):
        for name in ('bubble.zip', 'Asteroids.zip', 'zaxxon.zip', '1942.zip'):
            touch(self.path('arcade', name))
        self.assertEqual([game['title'] for game in self.library.games('arcade')],
                         ['1942', 'Asteroids', 'bubble', 'zaxxon'])

    def test_sistema_generico_accetta_ogni_estensione_tranne_servizio(self):
        touch(self.path('oric', 'mine.vec'))
        touch(self.path('oric', 'note.txt'))
        touch(self.path('oric', 'senza_estensione'))
        self.assertEqual(self.ids('oric'), ['mine.vec'])

    def test_id_non_valido(self):
        touch(self.path('nes', 'a.nes'))
        for system in ('', '..', '.nascosta', 'nes/..', '../games', 'manca', None):
            with self.assertRaises(LibraryError):
                self.library.games(system)

    def test_sistemi_e_cache(self):
        touch(self.path('nes', 'a.nes'))
        touch(self.path('Arcade', 'pacman.zip'))
        systems = self.library.systems()
        self.assertEqual([system['id'] for system in systems], ['Arcade', 'nes'])
        self.assertEqual(systems[0]['name'], 'ARCADE')
        self.assertEqual(systems[0]['count'], 1)
        self.assertEqual(systems[1]['cores'], [])
        self.assertFalse(systems[1]['ready'])
        touch(self.path('nes', 'b.nes'))
        self.assertEqual(len(self.library.games('nes')), 1)
        self.library.invalidate()
        self.assertEqual(len(self.library.games('nes')), 2)

    def test_core_e_prontezza(self):
        touch(self.path('arcade', 'pacman.zip'))
        touch(self.path('nes', 'a.nes'))
        touch(self.path('snes', 'a.sfc'))
        touch(self.path('md', 'a.md'))
        self.config.systems = {
            'arcade': {'extensions': '', 'cores': ['fbneo', 'mame']},
            'nes': {'extensions': '', 'cores': ['nestopia']},
            'md': {'extensions': '', 'cores': ['picodrive']},
        }
        self.config.available = {
            'fbneo': {'installed': True, 'downloadable': True},
            'picodrive': {'installed': False, 'downloadable': True},
        }
        systems = {system['id']: system for system in self.library.systems()}
        self.assertEqual(systems['arcade']['cores'], [{'name': 'fbneo', 'installed': True, 'downloadable': True},
                                                      {'name': 'mame', 'installed': False, 'downloadable': False}])
        self.assertTrue(systems['arcade']['ready'])
        # Scaricabile ma non installato: pronta (il download arriva con lo sprint 05).
        self.assertTrue(systems['md']['ready'])
        self.assertFalse(systems['nes']['ready'])
        self.assertEqual(systems['snes']['cores'], [])
        self.assertFalse(systems['snes']['ready'])

    def test_estensioni_salvate_o_predefinite(self):
        touch(self.path('nes', 'a.nes'))
        touch(self.path('nes', 'b.zip'))
        touch(self.path('nes', 'c.unf'))
        self.assertEqual(self.ids('nes'), ['a.nes', 'b.zip', 'c.unf'])
        self.config.systems = {'nes': {'extensions': 'nes zip', 'cores': []}}
        self.library.invalidate()
        self.assertEqual(self.ids('nes'), ['a.nes', 'b.zip'])

    def test_estensioni_dai_core_per_cartelle_non_riconosciute(self):
        touch(self.path('oric', 'a.vec'))
        touch(self.path('oric', 'b.bin'))
        touch(self.path('oric', 'leggimi.txt'))
        self.assertEqual(self.ids('oric'), ['a.vec', 'b.bin'])
        self.config.core_extensions = ['vec']
        self.library.invalidate()
        self.assertEqual(self.ids('oric'), ['a.vec'])

    def test_cartella_rom_mancante(self):
        library = Library(FakeConfig(os.path.join(self.tmp.name, 'manca')))
        self.assertEqual(library.systems(), [])
        self.assertEqual(len(library.warnings()), 1)
        self.assertEqual(self.library.warnings(), [])


if __name__ == '__main__':
    unittest.main()
