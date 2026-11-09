import os
import tempfile
import unittest
from unittest import mock

from pixelarcade.core_options import AUDIO, EMULATION, GRAPHICS
from pixelarcade import gameconfig
from pixelarcade.db import Database
from pixelarcade.errors import ConfigError
from pixelarcade.gameconfig import GameConfigService, opt_text, write_opt
from pixelarcade.repositories.gameconfig import GameConfigRepository

AT = '2026-10-17T20:00:00+00:00'

KNOWN = {
    'video_driver': 'gl', 'video_smooth': 'false', 'video_scale_integer': 'false', 'aspect_ratio_index': '22',
    'video_crop_overscan': 'true', 'video_vsync': 'true', 'audio_latency': '64', 'run_ahead_enabled': 'false',
    'global_core_options': 'false',
}


def option(key, section, values, default=None, group=None):
    return {'key': key, 'label': key, 'info': None, 'category': None, 'section': section, 'group': group,
            'values': [{'value': value, 'label': None} for value in values], 'default': default or values[0]}


CATALOGS = {
    'mednafen_psx_hw': [
        option('beetle_psx_hw_internal_resolution', GRAPHICS, ['1x(native)', '2x', '4x']),
        option('beetle_psx_hw_filter', GRAPHICS, ['nearest', 'bilinear']),
        option('beetle_psx_hw_pgxp_mode', GRAPHICS, ['disabled', 'memory only']),
        option('beetle_psx_hw_pgxp_texture', GRAPHICS, ['disabled', 'enabled']),
        option('beetle_psx_hw_depth', GRAPHICS, ['16bpp(native)', '32bpp']),
        option('beetle_psx_hw_dither_mode', GRAPHICS, ['1x(native)', 'internal resolution', 'disabled']),
        option('beetle_psx_hw_cd_fastload', EMULATION, ['2x(native)', '4x']),
        option('beetle_psx_hw_analog_toggle', EMULATION, ['disabled', 'enabled']),
    ],
    'pcsx_rearmed': [option('pcsx_rearmed_dithering', GRAPHICS, ['enabled', 'disabled'])],
    'fceumm': [option('fceumm_palette', GRAPHICS, ['default', 'nes-classic']),
               option('fceumm_sndquality', AUDIO, ['Low', 'High'])],
}
SYSTEM_CORES = {'ps1': ['mednafen_psx_hw', 'pcsx_rearmed'], 'nes': ['fceumm']}
LIBRARY_NAMES = {'mednafen_psx_hw': 'Beetle PSX HW', 'pcsx_rearmed': 'PCSX-ReARMed', 'fceumm': 'FCEUmm'}


class FakeConfig:
    def __init__(self, root):
        self.root = root
        self.settings = {'input.quit_combo': 'hold_start', 'input.rescue_combo': ['select', 'rt']}

    def get(self):
        return dict(self.settings)

    def resolve_path(self, key):
        return os.path.join(self.root, {'paths.cores': 'retroarch/cores', 'paths.roms': 'roms'}[key])

    def system_cores(self, system_id):
        return list(SYSTEM_CORES[system_id])

    def installed_cores(self):
        return sorted(core for cores in SYSTEM_CORES.values() for core in cores)


class FakeCatalog:
    def __init__(self):
        self.reads = []

    def read(self, core, game_path=None):
        self.reads.append((core, game_path))
        options = CATALOGS.get(core)
        return {'version': 2, 'categories': [], 'options': options, 'needsGame': False} if options else None


class FakeLibrary:
    def games(self, system_id):
        return [{'id': 'a.cue'}, {'id': 'b.cue'}] if system_id == 'ps1' else [{'id': 'x.nes'}]


class FakeCores:
    def __init__(self):
        self.associations = {}

    def game_core(self, system_id, game_id):
        return self.associations.get((system_id, game_id))


class GameConfigTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = self.tmp.name
        for path in ('retroarch/cores', 'retroarch/shaders/shaders_glsl/xbr', 'retroarch/shaders/shaders_slang/xbr',
                     'retroarch/config'):
            os.makedirs(os.path.join(root, path))
        for path in ('shaders_glsl/xbr/xbr-lv2.glslp', 'shaders_slang/xbr/xbr-lv2.slangp',
                     'shaders_glsl/xbr/xbr-lv3.glslp'):
            with open(os.path.join(root, 'retroarch/shaders', path), 'w') as stream:
                stream.write('shader')
        self.db = Database(os.path.join(root, 'test.db'))
        self.db.migrate()
        self.repo = GameConfigRepository(self.db)
        self.cores = FakeCores()
        self.catalog = FakeCatalog()
        self.service = GameConfigService(self.repo, FakeConfig(root), self.catalog, FakeLibrary(),
                                         LIBRARY_NAMES.get, lambda: dict(KNOWN), self.cores, lambda: AT,
                                         screen_size=lambda: self.screen)
        self.screen = (1024, 768)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def options(self, page, section=GRAPHICS):
        sections = {item['id']: item for item in page['sections']}
        return {item['key']: item for item in sections[section]['options']}

    def set(self, system, game, key, value, source='retroarch', core=None, confirm=False):
        core = core or ('mednafen_psx_hw' if system == 'ps1' else 'fceumm')
        return self.service.set_option(system, game, core, source, key, value, confirm)

    # --- Pagina ---------------------------------------------------------------

    def test_pagina_della_console(self):
        page = self.service.page('ps1')
        self.assertEqual((page['mode'], page['family'], page['core'], page['custom']),
                         ('original', '3d', 'mednafen_psx_hw', False))
        self.assertEqual(page['cores'], ['mednafen_psx_hw', 'pcsx_rearmed'])
        self.assertEqual([level['id'] for level in page['levels']], ['original', 'enhanced', 'max'])
        graphics = self.options(page)
        self.assertEqual((graphics['video_smooth']['value'], graphics['video_smooth']['origin']), ('false', 'level'))
        self.assertEqual(graphics['beetle_psx_hw_internal_resolution']['value'], '1x(native)')
        # Chiavi di RetroArch assenti dal retroarch.cfg: non si mostrano.
        self.assertNotIn('video_rotation', graphics)
        self.assertEqual([item['value'] for item in graphics['shader']['values']],
                         ['', 'shaders_glsl/xbr/xbr-lv2.glslp', 'shaders_glsl/xbr/xbr-lv3.glslp'])
        self.assertEqual(self.options(page, EMULATION)['beetle_psx_hw_cd_fastload']['origin'], 'default')
        self.assertEqual(self.options(page, AUDIO), {'audio_latency': self.options(page, AUDIO)['audio_latency']})
        # Selettore del core: un altro core della console.
        other = self.service.page('ps1', core='pcsx_rearmed')
        self.assertEqual(other['core'], 'pcsx_rearmed')
        self.assertIn('pcsx_rearmed_dithering', self.options(other))

    def test_core_del_gioco(self):
        self.cores.associations[('ps1', 'b.cue')] = {'core': 'pcsx_rearmed', 'status': 'ok', 'confirmedBy': 'auto'}
        page = self.service.page('ps1', 'b.cue', core='mednafen_psx_hw')
        self.assertEqual((page['core'], page['cores'], page['mode']), ('pcsx_rearmed', ['pcsx_rearmed'], None))
        self.assertIn(('pcsx_rearmed', os.path.join(self.tmp.name, 'roms', 'ps1', 'b.cue')), self.catalog.reads)

    def test_livelli(self):
        self.service.set_level('ps1', None, 'max')
        graphics = self.options(self.service.page('ps1'))
        self.assertEqual(graphics['beetle_psx_hw_internal_resolution']['value'], '4x')
        self.assertEqual(graphics['video_smooth']['value'], 'true')
        with self.assertRaises(ConfigError):
            self.service.set_level('ps1', None, 'smooth')
        with self.assertRaises(ConfigError):
            self.service.set_level('ps1', None, None)
        with self.assertRaises(ConfigError):
            self.service.set_level('ps1', None, 'custom')

    # --- Personalizzata ----------------------------------------------------------

    def test_personalizzata_della_console(self):
        self.service.set_level('ps1', None, 'max')
        self.assertEqual(self.set('ps1', None, 'video_scale_integer', 'true'), {'saved': True})
        row = self.repo.get('ps1', '')
        self.assertEqual(row['mode'], 'custom')
        self.assertEqual(row['custom'], {'base': 'max', 'retroarch': {'video_scale_integer': 'true'}, 'cores': {}})
        page = self.service.page('ps1')
        graphics = self.options(page)
        self.assertEqual((page['mode'], page['custom']), ('custom', True))
        self.assertEqual(graphics['video_scale_integer']['origin'], 'custom')
        self.assertEqual(graphics['beetle_psx_hw_internal_resolution'][('value')], '4x')
        self.assertEqual(graphics['beetle_psx_hw_internal_resolution']['origin'], 'level')
        # Tornata uguale al livello di partenza: la Personalizzata sparisce.
        self.set('ps1', None, 'video_scale_integer', None)
        self.assertEqual((self.repo.get('ps1', '')['mode'], self.repo.get('ps1', '')['custom']), ('max', None))

    def test_personalizzata_uguale_a_un_altro_livello(self):
        self.set('nes', None, 'video_smooth', 'true')
        self.assertEqual((self.repo.get('nes', '')['mode'], self.repo.get('nes', '')['custom']), ('soft', None))
        # Dettaglio 3D di un solo core: uguale a «Migliorata» solo se lo è per tutti i core della console.
        for key, value in (('beetle_psx_hw_internal_resolution', '2x'), ('beetle_psx_hw_pgxp_mode', 'memory only'),
                           ('beetle_psx_hw_pgxp_texture', 'enabled'), ('beetle_psx_hw_filter', 'bilinear'),
                           ('beetle_psx_hw_depth', '32bpp'), ('beetle_psx_hw_dither_mode', 'disabled')):
            self.set('ps1', None, key, value, source='core')
        self.set('ps1', None, 'video_smooth', 'true')
        self.assertEqual(self.repo.get('ps1', '')['mode'], 'custom')
        self.set('ps1', None, 'pcsx_rearmed_dithering', 'disabled', source='core', core='pcsx_rearmed')
        self.assertEqual((self.repo.get('ps1', '')['mode'], self.repo.get('ps1', '')['custom']), ('enhanced', None))

    def test_nuova_personalizzata_chiede_conferma(self):
        self.set('ps1', None, 'video_scale_integer', 'true')
        self.service.set_level('ps1', None, 'original')
        # La Personalizzata resta salvata e si può riscegliere.
        self.assertTrue(self.service.page('ps1')['custom'])
        result = self.set('ps1', None, 'video_crop_overscan', 'false')
        self.assertIn('Sostituisce', result['confirm'])
        self.assertEqual(self.repo.get('ps1', '')['mode'], 'original')
        self.set('ps1', None, 'video_crop_overscan', 'false', confirm=True)
        self.assertEqual(self.repo.get('ps1', '')['custom']['retroarch'], {'video_crop_overscan': 'false'})
        self.service.set_level('ps1', None, 'custom')
        self.assertEqual(self.repo.get('ps1', '')['mode'], 'custom')

    def test_personalizzata_del_gioco(self):
        self.service.set_level('ps1', None, 'max')
        self.set('ps1', None, 'video_scale_integer', 'true')
        page = self.service.page('ps1', 'a.cue')
        self.assertEqual(page['mode'], None)
        self.assertEqual(self.options(page)['video_scale_integer']['origin'], 'console')
        # Parte dai valori in uso, cioè dalla Personalizzata della console.
        self.set('ps1', 'a.cue', 'beetle_psx_hw_filter', 'nearest', source='core')
        custom = self.repo.get('ps1', 'a.cue')['custom']
        self.assertEqual(custom, {'base': 'max', 'retroarch': {'video_scale_integer': 'true'},
                                  'cores': {'mednafen_psx_hw': {'beetle_psx_hw_filter': 'nearest'}}})
        self.assertEqual(self.service.page('ps1', 'a.cue')['mode'], 'custom')
        # «Usa per tutta la console»: sostituisce quella della console, dopo la conferma.
        self.assertIn('console', self.service.promote('ps1', 'a.cue')['confirm'])
        self.assertEqual(self.service.promote('ps1', 'a.cue', confirm=True), {'saved': True})
        self.assertEqual(self.repo.get('ps1', '')['custom'], custom)
        self.assertIsNone(self.repo.get('ps1', 'a.cue'))
        with self.assertRaises(ConfigError):
            self.service.promote('ps1', 'a.cue')

    def test_livello_del_gioco_uguale_alla_console(self):
        self.service.set_level('nes', None, 'soft')
        self.set('nes', 'x.nes', 'video_scale_integer', 'true')
        self.assertEqual(self.repo.get('nes', 'x.nes')['mode'], 'custom')
        # Tornata uguale al livello della console: il gioco la segue di nuovo.
        self.set('nes', 'x.nes', 'video_scale_integer', None)
        self.assertIsNone(self.repo.get('nes', 'x.nes'))

    # --- Altre sezioni -------------------------------------------------------------

    def test_opzioni_ereditate(self):
        self.set('ps1', None, 'audio_latency', '32')
        self.set('ps1', None, 'beetle_psx_hw_cd_fastload', '4x', source='core')
        audio = self.options(self.service.page('ps1', 'a.cue'), AUDIO)['audio_latency']
        self.assertEqual((audio['value'], audio['origin']), ('32', 'console'))
        self.set('ps1', 'a.cue', 'audio_latency', '128')
        audio = self.options(self.service.page('ps1', 'a.cue'), AUDIO)['audio_latency']
        self.assertEqual((audio['value'], audio['origin']), ('128', 'game'))
        self.assertIn(('audio_latency', '128'), self.service.launch_options('ps1', 'a.cue')[0])
        self.set('ps1', 'a.cue', 'audio_latency', None)
        self.assertIn(('audio_latency', '32'), self.service.launch_options('ps1', 'a.cue')[0])
        # Le altre sezioni non toccano livello e Personalizzata.
        self.assertEqual(self.repo.get('ps1', '')['mode'], None)
        self.assertEqual(self.service.page('ps1')['mode'], 'original')

    def test_predefiniti_della_dashboard(self):
        # Predefinito della dashboard al posto di quello del core, salvo scelta diversa.
        with mock.patch.dict(gameconfig.CORE_DEFAULTS, {'mednafen_psx_hw': {'beetle_psx_hw_analog_toggle': 'enabled'}}):
            values = self.service.core_launch_values('ps1', 'a.cue', 'mednafen_psx_hw', None)
            self.assertEqual(values['beetle_psx_hw_analog_toggle'], 'enabled')
            self.set('ps1', 'a.cue', 'beetle_psx_hw_analog_toggle', 'disabled', source='core')
            values = self.service.core_launch_values('ps1', 'a.cue', 'mednafen_psx_hw', None)
            self.assertEqual(values['beetle_psx_hw_analog_toggle'], 'disabled')

    def test_uscita_dal_gioco(self):
        option = self.options(self.service.page('ps1', 'a.cue'), EMULATION)['quit_combo']
        self.assertEqual((option['value'], option['origin']), ('hold_start', 'default'))
        self.assertEqual([item['value'] for item in option['values']], ['hold_start', 'hold_select', 'start_select'])
        self.set('ps1', 'a.cue', 'quit_combo', 'start_select', source='dashboard')
        self.assertEqual(self.service.quit_combo('ps1', 'a.cue'), 'start_select')
        self.assertEqual(self.service.quit_combo('ps1', 'b.cue'), 'hold_start')
        option = self.options(self.service.page('ps1', 'a.cue'), EMULATION)['quit_combo']
        self.assertEqual((option['value'], option['origin']), ('start_select', 'game'))
        # SELECT tenuto va anche con la combinazione di emergenza SELECT+RT (scatta prima, nella dashboard).
        self.set('ps1', 'b.cue', 'quit_combo', 'hold_select', source='dashboard')
        self.assertEqual(self.service.quit_combo('ps1', 'b.cue'), 'hold_select')
        # Senza scelta del gioco segue le Impostazioni.
        self.service.config.settings['input.quit_combo'] = 'hold_select'
        self.set('ps1', 'a.cue', 'quit_combo', None, source='dashboard')
        self.assertEqual(self.service.quit_combo('ps1', 'a.cue'), 'hold_select')

    def test_salvataggio_periodico(self):
        option = self.options(self.service.page('ps1'), EMULATION)['periodic_save']
        self.assertEqual((option['source'], option['value'], option['origin'], option['group']),
                         ('dashboard', '60', 'default', 'Pixel Arcade'))
        self.assertEqual(self.service.periodic_seconds('ps1', 'a.cue'), 60)
        self.assertEqual(self.service.periodic_seconds('n64', None), 300)
        self.assertEqual(self.service.periodic_seconds('ps2', 'gioco.iso'), 300)
        self.set('ps1', None, 'periodic_save', '180', source='dashboard')
        option = self.options(self.service.page('ps1', 'a.cue'), EMULATION)['periodic_save']
        self.assertEqual((option['value'], option['origin']), ('180', 'console'))
        self.set('ps1', 'a.cue', 'periodic_save', '0', source='dashboard')
        self.assertEqual(self.service.periodic_seconds('ps1', 'a.cue'), 0)
        self.assertEqual(self.service.periodic_seconds('ps1', 'b.cue'), 180)
        # Non passa a RetroArch.
        self.assertNotIn('periodic_save', dict(self.service.launch_options('ps1', 'a.cue')[0]))
        # Uguale a quello ereditato: il gioco torna a seguire la console, e la console il predefinito.
        self.set('ps1', 'a.cue', 'periodic_save', '180', source='dashboard')
        self.assertIsNone(self.repo.get('ps1', 'a.cue'))
        self.set('ps1', None, 'periodic_save', '60', source='dashboard')
        self.assertNotIn('dashboard', self.repo.get('ps1', '')['options'])
        with self.assertRaises(ConfigError):
            self.set('ps1', None, 'periodic_save', '45', source='dashboard')
        with self.assertRaises(ConfigError):
            self.set('ps1', None, 'altro', '60', source='dashboard')

    def test_controller_del_gioco(self):
        game = {'id': 'a.cue', 'controller': 'dualshock'}
        self.assertEqual(self.service.controller('ps1', game),
                         {'auto': 'dualshock', 'choice': None, 'value': 'dualshock', 'choices': ['digital', 'dualshock']})
        # Senza dato nei metadati: il pad digitale.
        self.assertEqual(self.service.controller('ps1', {'id': 'b.cue'})['value'], 'digital')
        self.assertIsNone(self.service.controller('nes', {'id': 'x.nes'}))
        # Scelta a mano: vale per il gioco, non sta nella pagina e resta con le altre opzioni.
        self.assertEqual(self.service.set_controller('ps1', game, 'digital')['value'], 'digital')
        self.assertEqual(self.service.controller('ps1', {'id': 'b.cue'})['value'], 'digital')
        self.set('ps1', 'a.cue', 'quit_combo', 'start_select', source='dashboard')
        self.assertEqual(self.service.controller('ps1', game)['choice'], 'digital')
        self.assertNotIn('controller', self.options(self.service.page('ps1', 'a.cue'), EMULATION))
        self.set('ps1', 'a.cue', 'quit_combo', None, source='dashboard')
        # Uguale ai metadati, o None: torna automatico e la riga sparisce.
        self.assertEqual(self.service.set_controller('ps1', game, 'dualshock')['choice'], None)
        self.assertIsNone(self.repo.get('ps1', 'a.cue'))
        self.service.set_controller('ps1', game, 'digital')
        self.service.set_controller('ps1', game, None)
        self.assertIsNone(self.repo.get('ps1', 'a.cue'))
        with self.assertRaises(ConfigError):
            self.service.set_controller('ps1', game, 'mouse')
        with self.assertRaises(ConfigError):
            self.service.set_controller('nes', {'id': 'x.nes'}, 'digital')

    def test_valore_uguale_a_quello_ereditato(self):
        self.set('ps1', None, 'audio_latency', '32')
        self.set('ps1', 'a.cue', 'audio_latency', '128')
        # Rimesso il valore della console: il gioco torna a seguirla.
        self.set('ps1', 'a.cue', 'audio_latency', '32')
        self.assertIsNone(self.repo.get('ps1', 'a.cue'))
        audio = self.options(self.service.page('ps1', 'a.cue'), AUDIO)['audio_latency']
        self.assertEqual((audio['value'], audio['origin']), ('32', 'console'))
        # Per la console, il predefinito non resta come scelta.
        self.set('ps1', None, 'beetle_psx_hw_cd_fastload', '4x', source='core')
        self.set('ps1', None, 'beetle_psx_hw_cd_fastload', '2x(native)', source='core')
        self.assertEqual(self.repo.get('ps1', '')['options']['cores'], {})
        self.set('ps1', None, 'audio_latency', '64')
        self.assertEqual(self.repo.get('ps1', '')['options']['retroarch'], {})

    def test_personalizzata_del_gioco_uguale_alla_console(self):
        self.set('ps1', None, 'video_scale_integer', 'true')
        self.set('ps1', 'a.cue', 'beetle_psx_hw_filter', 'bilinear', source='core')
        self.assertEqual(self.repo.get('ps1', 'a.cue')['mode'], 'custom')
        self.set('ps1', 'a.cue', 'beetle_psx_hw_filter', 'nearest', source='core')
        self.assertIsNone(self.repo.get('ps1', 'a.cue'))
        self.assertEqual(self.options(self.service.page('ps1', 'a.cue'))['beetle_psx_hw_filter']['origin'], 'console')

    def test_valori_non_ammessi(self):
        with self.assertRaises(ConfigError):
            self.set('ps1', None, 'audio_latency', '33')
        with self.assertRaises(ConfigError):
            self.set('ps1', None, 'video_rotation', '1')
        with self.assertRaises(ConfigError):
            self.set('ps1', None, 'manca', 'x', source='core')
        with self.assertRaises(ConfigError):
            self.set('ps1', None, 'shader', '../../fuori.glslp')
        with self.assertRaises(ConfigError):
            self.set('ps1', None, 'video_smooth', 'true', source='altro')

    # --- Avvio ----------------------------------------------------------------------

    def test_chiavi_e_shader_all_avvio(self):
        self.service.set_level('nes', None, 'smooth')
        keys, shader = self.service.launch_options('nes', 'x.nes')
        self.assertIn(('video_smooth', 'true'), keys)
        self.assertNotIn('shader', dict(keys))
        self.assertEqual(shader, os.path.join(self.tmp.name, 'retroarch/shaders/shaders_glsl/xbr/xbr-lv2.glslp'))
        # Con Vulkan lo shader del livello passa al formato slang.
        self.set('nes', None, 'video_driver', 'vulkan')
        keys, shader = self.service.launch_options('nes', 'x.nes')
        self.assertIn(('video_driver', 'vulkan'), keys)
        self.assertTrue(shader.endswith('shaders_slang/xbr/xbr-lv2.slangp'))
        # Uno shader GLSL scelto a mano non va con Vulkan: nessuno shader.
        self.set('nes', None, 'shader', 'shaders_glsl/xbr/xbr-lv3.glslp')
        self.assertIsNone(self.service.launch_options('nes', 'x.nes')[1])

    def test_margine_per_la_tv(self):
        # Solo per gioco: la console non lo mostra e non lo accetta.
        self.assertNotIn('tv_margin', self.options(self.service.page('ps1')))
        with self.assertRaises(ConfigError):
            self.set('ps1', None, 'tv_margin', '5', source='dashboard')
        option = self.options(self.service.page('ps1', 'a.cue'))['tv_margin']
        self.assertEqual((option['value'], option['origin']), ('0', 'default'))
        self.assertNotIn('custom_viewport_width', dict(self.service.launch_options('ps1', 'a.cue')[0]))
        # Non tocca il livello della Grafica.
        self.set('ps1', 'a.cue', 'tv_margin', '5', source='dashboard')
        page = self.service.page('ps1', 'a.cue')
        self.assertIsNone(page['mode'])
        self.assertEqual(self.options(page)['tv_margin']['origin'], 'game')
        # 4:3 su 1024×768: 90% dell'altezza; il centro lo mette RetroArch (x e y a 0).
        self.set('ps1', 'a.cue', 'aspect_ratio_index', '0')
        keys = dict(self.service.launch_options('ps1', 'a.cue')[0])
        self.assertEqual((keys['aspect_ratio_index'], keys['video_scale_integer']), ('23', 'false'))
        self.assertEqual([keys['custom_viewport_' + name] for name in ('width', 'height', 'x', 'y')],
                         ['922', '691', '0', '0'])
        # 16:9: la larghezza è il limite, fasce sopra e sotto.
        self.set('ps1', 'a.cue', 'aspect_ratio_index', '1', confirm=True)
        keys = dict(self.service.launch_options('ps1', 'a.cue')[0])
        self.assertEqual([keys['custom_viewport_' + name] for name in ('width', 'height', 'x', 'y')],
                         ['922', '518', '0', '0'])
        # Gli altri giochi non hanno il margine; senza risoluzione non si applica.
        self.assertNotIn('custom_viewport_width', dict(self.service.launch_options('ps1', 'b.cue')[0]))
        self.screen = None
        self.assertEqual(dict(self.service.launch_options('ps1', 'a.cue')[0])['aspect_ratio_index'], '1')
        # «0» toglie la scelta.
        self.set('ps1', 'a.cue', 'tv_margin', '0', source='dashboard')
        self.assertEqual(self.options(self.service.page('ps1', 'a.cue'))['tv_margin']['origin'], 'default')

    def test_livelli_n64_con_parallel(self):
        for level, upscaling in (('original', '1x'), ('enhanced', '2x'), ('max', '4x')):
            retroarch, core = gameconfig.Context(dict(KNOWN), None, 'mupen64plus_next', 'n64').level(level)
            self.assertEqual(retroarch['video_driver'], 'vulkan')
            self.assertEqual(core['mupen64plus-rdp-plugin'], 'parallel')
            self.assertEqual(core['mupen64plus-parallel-rdp-upscaling'], upscaling)
        # Le altre console tengono il driver del ``retroarch.cfg``.
        self.assertEqual(gameconfig.Context(dict(KNOWN), None, None, 'ps1').level('max')[0]['video_driver'], 'gl')

    def test_area_ridotta(self):
        self.assertEqual(gameconfig.margin_viewport(1920, 1080, '24', 0)['custom_viewport_width'], '1920')
        keys = gameconfig.margin_viewport(1920, 1080, '22', 5)
        self.assertEqual((keys['custom_viewport_width'], keys['custom_viewport_height']), ('1296', '972'))

    def test_risoluzione_dello_schermo(self):
        from pixelarcade.screen import screen_size
        result = mock.Mock(stdout='Screen 0: minimum 16 x 16, current 1024 x 768, maximum 32767 x 32767\n')
        self.assertEqual(screen_size(run=lambda *args, **kwargs: result), (1024, 768))
        self.assertIsNone(screen_size(run=lambda *args, **kwargs: mock.Mock(stdout='')))

        def missing(*args, **kwargs):
            raise FileNotFoundError('xrandr')
        self.assertIsNone(screen_size(run=missing))

    def test_opt_scritto_all_avvio(self):
        folder = os.path.join(self.tmp.name, 'retroarch/config/Beetle PSX HW')
        os.makedirs(folder)
        path = os.path.join(folder, 'Beetle PSX HW.opt')
        with open(path, 'w') as stream:
            stream.write('beetle_psx_hw_internal_resolution = "4x"\naltro_core = "x"\n')
        rom = os.path.join(self.tmp.name, 'roms/ps1/a.cue')
        self.service.apply_core('ps1', 'a.cue', 'mednafen_psx_hw', rom)
        with open(path) as stream:
            text = stream.read()
        self.assertIn('beetle_psx_hw_internal_resolution = "1x(native)"', text)
        self.assertIn('beetle_psx_hw_cd_fastload = "2x(native)"', text)
        self.assertIn('altro_core = "x"', text)
        with open(path + '.bak-pixel-arcade') as stream:
            self.assertIn('"4x"', stream.read())
        self.assertFalse(write_opt(path, {'beetle_psx_hw_filter': 'nearest'}))

    def test_opt_text(self):
        self.assertEqual(opt_text('a = "1"\n# nota\n', {'a': '2', 'b': '3'}), 'a = "2"\n# nota\nb = "3"\n')


if __name__ == '__main__':
    unittest.main()
