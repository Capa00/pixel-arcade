import io
import os
import shutil
import tempfile
import unittest
import urllib.error

from pixelarcade.config import DEFAULTS, ConfigService, core_order, normalize_extensions, validate
from pixelarcade.db import Database
from pixelarcade.errors import ConfigError
from pixelarcade.repositories.cores import CoresRepository
from pixelarcade.repositories.settings import SettingsRepository


FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'core_info')

INDEX = b"""2026-09-22 aa000001 fbneo_libretro.so.zip
2026-09-22 aa000002 mame2003_plus_libretro.so.zip
2026-09-22 aa000003 genesis_plus_gx_libretro.so.zip
2026-09-22 aa000004 nestopia_libretro.so.zip
2026-09-22 aa000005 testgl_libretro.so.zip
2026-09-22 aa000006 senzainfo_libretro.so.zip
"""


def touch(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as stream:
        stream.write('x')


class FakeOpener:
    def __init__(self, data=INDEX):
        self.data = data
        self.error = None

    def __call__(self, url, timeout):
        if self.error:
            raise self.error
        return io.BytesIO(self.data)


class ConfigServiceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        self.repo = SettingsRepository(self.db)
        self.cores = CoresRepository(self.db)
        self.base = os.path.join(self.tmp.name, 'workspace')
        self.opener = FakeOpener()
        self.config = ConfigService(self.repo, self.base, self.cores, self.opener)

    def make_cores(self, installed=('hbmame', 'nestopia', 'altro')):
        """Cartella dei core con i .info delle fixture e i file .so di ``installed``."""
        folder = os.path.join(self.tmp.name, 'cores')
        shutil.copytree(FIXTURES, folder)
        for name in installed:
            touch(os.path.join(folder, name + '_libretro.so'))
        self.config.update({'paths.cores': folder})
        return folder

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def test_predefiniti(self):
        self.assertEqual(self.config.get(), DEFAULTS)

    def test_get_non_modifica_i_predefiniti(self):
        self.config.get()['buttons']['a'] = 99
        self.assertEqual(DEFAULTS['buttons']['a'], 0)

    def test_update_salva_e_unisce(self):
        result = self.config.update({'paths.roms': 'roms', 'buttons': {'a': 1, 'b': 0}})
        self.assertEqual(result['paths.roms'], 'roms')
        self.assertEqual(result['buttons']['a'], 1)
        self.assertEqual(result['buttons']['x'], 2)
        self.assertEqual(self.repo.get_all()['paths.roms'], 'roms')

    def test_percorso_relativo_e_con_tilde(self):
        self.assertEqual(self.config.resolve_path('paths.roms'), os.path.join(self.base, 'games'))
        self.config.update({'paths.roms': '~/roms'})
        self.assertEqual(self.config.resolve_path('paths.roms'), os.path.expanduser('~/roms'))
        self.config.update({'paths.roms': '/assoluto/roms'})
        self.assertEqual(self.config.resolve_path('paths.roms'), '/assoluto/roms')
        self.assertEqual(self.config.resolve_path('paths.crt_shader'), '')

    def test_tasti_duplicati_rifiutati(self):
        with self.assertRaises(ConfigError):
            self.config.update({'buttons': {'a': 1}})
        self.assertEqual(self.repo.get_all(), {})

    def test_tasti_per_joypad(self):
        self.assertEqual(self.config.pad_buttons(), {})
        first = {'a': 0, 'b': 1, 'x': 2, 'select': 8, 'start': 9, 'up': 12, 'ls_up': '-1', 'ls_down': '+1'}
        second = {'a': 1, 'b': 0, 'select': 6, 'start': 7}
        self.config.set_pad_buttons('A', first)
        self.assertEqual(self.config.set_pad_buttons('B', second), {'A': first, 'B': second})
        self.assertEqual(self.config.get(), DEFAULTS)
        for pad, buttons in (('', first), ('C', {'a': 0, 'b': 1, 'select': 8}), ('C', dict(first, x=1)),
                             ('C', dict(first, a=32)), ('C', dict(first, home=10)), (3, first),
                             ('C', dict(first, ls_left='-1')), ('C', dict(first, ls_left='x1'))):
            with self.assertRaises(ConfigError):
                self.config.set_pad_buttons(pad, buttons)
        self.assertEqual(sorted(self.config.pad_buttons()), ['A', 'B'])

    def test_tasti_fuori_intervallo(self):
        buttons = dict(DEFAULTS['buttons'], a=32)
        with self.assertRaises(ConfigError):
            validate({'buttons': buttons})
        with self.assertRaises(ConfigError):
            validate({'buttons': dict(DEFAULTS['buttons'], a=True)})

    def test_combinazione_dei_salvataggi(self):
        self.assertEqual(self.config.get()['input.save_combo'], ['select', 'lt'])
        # SELECT+R1 è dentro il menu rapido predefinito (L1+R1+START+SELECT): qui il menu è spento.
        with self.assertRaises(ConfigError):
            self.config.update({'input.save_combo': ['select', 'rb']})
        self.config.update({'input.menu_combo': 'none'})
        self.assertEqual(self.config.update({'input.save_combo': ['select', 'rb']})['input.save_combo'], ['select', 'rb'])
        for combo in (['start', 'select'], ['select', 'start'], ['lt', 'lt'], ['select'], ['select', 'lt', 'rt'],
                      ['select', 'up'], 'select+lt', [8, 6], None):
            with self.assertRaises(ConfigError, msg=repr(combo)):
                validate({'input.save_combo': combo})
        self.assertEqual(self.config.get()['input.save_combo'], ['select', 'rb'])

    def test_combinazione_di_emergenza(self):
        self.assertEqual(self.config.get()['input.rescue_combo'], ['select', 'rt'])
        self.assertEqual(self.config.update({'input.rescue_combo': ['lt', 'rt']})['input.rescue_combo'], ['lt', 'rt'])
        with self.assertRaises(ConfigError) as caught:
            validate({'input.rescue_combo': ['start', 'select']})
        self.assertIn('START+SELECT', str(caught.exception))
        # Uguale a quella dei salvataggi (anche in ordine diverso), cambiando l'una o l'altra.
        with self.assertRaises(ConfigError):
            self.config.update({'input.rescue_combo': ['lt', 'select']})
        with self.assertRaises(ConfigError):
            self.config.update({'input.save_combo': ['rt', 'lt']})
        with self.assertRaises(ConfigError):
            self.config.update({'input.save_combo': ['select', 'rb'], 'input.rescue_combo': ['rb', 'select']})
        self.assertEqual(self.config.get()['input.rescue_combo'], ['lt', 'rt'])

    def test_uscita_dal_gioco(self):
        self.assertEqual(self.config.get()['input.quit_combo'], 'hold_start')
        # START+SELECT è dentro il menu rapido predefinito (L1+R1+START+SELECT): si cambiano insieme.
        with self.assertRaises(ConfigError):
            self.config.update({'input.quit_combo': 'start_select'})
        self.assertEqual(self.config.update({'input.quit_combo': 'start_select', 'input.menu_combo': 'l1_r1'})
                         ['input.quit_combo'], 'start_select')
        for value in ('hold_l', '', None, 7):
            with self.assertRaises(ConfigError, msg=repr(value)):
                validate({'input.quit_combo': value})
        # La combinazione di emergenza può usare il tasto che, tenuto, esce dal gioco (scatta prima, nella dashboard).
        self.assertEqual(self.config.update({'input.quit_combo': 'hold_select'})['input.quit_combo'], 'hold_select')
        self.assertEqual(self.config.update({'input.quit_combo': 'hold_start', 'input.rescue_combo': ['start', 'rt']})
                         ['input.rescue_combo'], ['start', 'rt'])
        self.assertEqual(self.config.update({'input.quit_combo': 'hold_select', 'input.rescue_combo': ['lt', 'rt']})
                         ['input.quit_combo'], 'hold_select')

    def test_menu_rapido(self):
        self.assertEqual(self.config.get()['input.menu_combo'], 'l1_r1_start_select')
        for value in ('l2_r2', 'l1_r1', 'down_select', 'none', 'l1_r1_start_select'):
            self.assertEqual(self.config.update({'input.menu_combo': value})['input.menu_combo'], value)
        for value in ('l3_r3', 'start_select', '', None, 3):
            with self.assertRaises(ConfigError, msg=repr(value)):
                validate({'input.menu_combo': value})
        # Si scontra con l'uscita START+SELECT e con le combinazioni dei salvataggi e di emergenza.
        self.config.update({'input.menu_combo': 'none', 'input.quit_combo': 'start_select'})
        with self.assertRaises(ConfigError):
            self.config.update({'input.menu_combo': 'l1_r1_start_select'})
        self.config.update({'input.quit_combo': 'hold_start'})
        with self.assertRaises(ConfigError):
            self.config.update({'input.menu_combo': 'l2_r2', 'input.save_combo': ['lt', 'rt']})
        with self.assertRaises(ConfigError):
            self.config.update({'input.menu_combo': 'l1_r1_start_select', 'input.rescue_combo': ['select', 'rb']})
        self.assertEqual(self.config.update({'input.menu_combo': 'l2_r2'})['input.menu_combo'], 'l2_r2')
        self.assertEqual(self.config.get()['input.menu_combo'], 'l2_r2')

    def test_window_seconds_fuori_intervallo(self):
        for value in (2, 61, '10', 10.5, True):
            with self.assertRaises(ConfigError):
                validate({'probe.window_seconds': value})
        self.assertEqual(validate({'probe.window_seconds': 3}), {'probe.window_seconds': 3})

    def test_chiave_sconosciuta_e_comando_vuoto(self):
        with self.assertRaises(ConfigError):
            validate({'nuova': 1})
        for command in ('', '   ', 'snap run "retroarch'):
            with self.assertRaises(ConfigError):
                validate({'retroarch.command': command})
        with self.assertRaises(ConfigError):
            validate({'paths.roms': 5})

    def test_core_installati(self):
        cores = os.path.join(self.tmp.name, 'cores')
        for name in ('mame_libretro.so', 'fbneo_libretro.so', 'leggimi.txt', '.nascosto_libretro.so'):
            touch(os.path.join(cores, name))
        os.makedirs(os.path.join(cores, 'cartella_libretro.so'))
        self.config.update({'paths.cores': cores})
        self.assertEqual(self.config.installed_cores(), ['fbneo', 'mame'])
        self.config.update({'paths.cores': os.path.join(self.tmp.name, 'manca')})
        self.assertEqual(self.config.installed_cores(), [])

    def test_estensioni(self):
        self.assertEqual(normalize_extensions(' .ZIP, 7z;zip  nes '), 'zip 7z nes')
        self.assertEqual(normalize_extensions(''), '')
        for text in ('z!p', 'nes/..', 5, 'x' * 201):
            with self.assertRaises(ConfigError):
                normalize_extensions(text)

    def make_roms(self):
        touch(os.path.join(self.base, 'games', 'arcade', 'pacman.zip'))
        touch(os.path.join(self.base, 'games', 'nes', 'zelda.nes'))

    def test_update_all(self):
        self.make_roms()
        result = self.config.update_all({
            'settings': {'retroarch.command': 'retroarch', 'buttons': {'a': 1, 'b': 0}},
            'systems': [
                {'id': 'arcade', 'extensions': 'ZIP', 'cores': ['mame', 'fbneo', 'mame', 'mesen-s', 'vitaquake2-rogue']},
                {'id': 'nes', 'extensions': '', 'cores': []},
            ],
            'availableCores': ['ignorato'],
        })
        self.assertEqual(result['retroarch.command'], 'retroarch')
        self.assertEqual(result['buttons']['a'], 1)
        self.assertEqual(self.config.systems_settings(), {
            'arcade': {'extensions': 'zip', 'cores': ['fbneo', 'mame', 'mesen-s', 'vitaquake2-rogue']},
            'nes': {'extensions': '', 'cores': []},
        })
        # Le console non indicate restano invariate; ``None`` torna alla lista predefinita.
        self.config.update_all({'settings': {}, 'systems': [{'id': 'nes', 'extensions': 'nes', 'cores': None}]})
        self.assertEqual(self.config.systems_settings()['arcade']['cores'], ['fbneo', 'mame', 'mesen-s', 'vitaquake2-rogue'])
        self.assertIsNone(self.config.systems_settings()['nes']['cores'])

    def test_nessun_limite_di_core(self):
        self.make_roms()
        cores = ['core%03d' % index for index in range(400)]
        self.config.update_all({'settings': {}, 'systems': [{'id': 'arcade', 'extensions': '', 'cores': cores}]})
        self.assertEqual(len(self.config.systems_settings()['arcade']['cores']), 400)

    def test_update_all_cartella_rom_inesistente(self):
        self.make_roms()
        with self.assertRaises(ConfigError) as caught:
            self.config.update_all({'settings': {'paths.roms': 'manca', 'retroarch.command': 'retroarch'}})
        self.assertIn('non esiste', str(caught.exception))
        self.assertEqual(self.repo.get_all(), {})

    def test_update_all_errore_non_salva_nulla(self):
        self.make_roms()
        cases = [
            {'id': 'snes', 'extensions': '', 'cores': []},
            {'id': '../games', 'extensions': '', 'cores': []},
            {'id': 'arcade', 'extensions': '', 'cores': ['../mame']},
            {'id': 'arcade', 'extensions': '', 'cores': ['mame_libretro.so']},
            {'id': 'arcade', 'extensions': '', 'cores': ['.nascosto']},
            {'id': 'arcade', 'extensions': '', 'cores': ['']},
            {'id': 'arcade', 'extensions': '', 'cores': [5]},
            {'id': 'arcade', 'extensions': 'z!p', 'cores': []},
            {'id': 'arcade', 'extensions': '', 'cores': 'mame_libretro.so'},
        ]
        for item in cases:
            with self.assertRaises(ConfigError, msg=str(item)):
                self.config.update_all({'settings': {'retroarch.command': 'retroarch'},
                                        'systems': [{'id': 'nes', 'extensions': '', 'cores': []}, item]})
        self.assertEqual(self.repo.get_all(), {})
        self.assertEqual(self.config.systems_settings(), {})
        with self.assertRaises(ConfigError):
            self.config.update_all({'settings': {'buttons': {'a': 1}}})
        with self.assertRaises(ConfigError):
            self.config.update_all([])

    def test_update_all_con_nuova_cartella_rom(self):
        touch(os.path.join(self.tmp.name, 'altre', 'snes', 'mario.sfc'))
        self.config.update_all({'settings': {'paths.roms': os.path.join(self.tmp.name, 'altre')},
                                'systems': [{'id': 'snes', 'extensions': '', 'cores': ['snes9x']}]})
        self.assertEqual(self.config.systems_settings()['snes']['cores'], ['snes9x'])

    def test_indirizzo_del_buildbot(self):
        self.assertEqual(validate({'cores.buildbot_url': 'https://esempio.test/core/'}),
                         {'cores.buildbot_url': 'https://esempio.test/core/'})
        for url in ('http://esempio.test/', 'https://esempio.test', 'https://esem pio.test/', 5):
            with self.assertRaises(ConfigError):
                validate({'cores.buildbot_url': url})
        with self.assertRaises(ConfigError):
            validate({'cores.index_fetched_at': '2026-09-23'})

    def test_tema_grafico(self):
        self.assertEqual(self.config.get()['ui.theme'], 'random')
        for theme in ('random', 'nes', 'gameboy', '16bit', 'psx', 'n64', 'computer', 'arcade', 'y2k'):
            self.assertEqual(validate({'ui.theme': theme}), {'ui.theme': theme})
        for theme in ('', 'NES', 'snes', None, 3):
            with self.assertRaises(ConfigError):
                validate({'ui.theme': theme})
        self.assertEqual(self.config.update({'ui.theme': 'psx'})['ui.theme'], 'psx')

    def test_salvaschermo(self):
        self.assertEqual(self.config.get()['ui.screensaver_minutes'], 2)
        for minutes in (0, 10 / 60, 0.25, 0.5, 1, 2, 5, 10):
            self.assertEqual(validate({'ui.screensaver_minutes': minutes}), {'ui.screensaver_minutes': minutes})
        for minutes in (3, -1, 60, 0.75, '2', None, True):
            with self.assertRaises(ConfigError):
                validate({'ui.screensaver_minutes': minutes})
        self.assertEqual(self.config.update({'ui.screensaver_minutes': 0})['ui.screensaver_minutes'], 0)
        self.assertEqual(self.config.get()['ui.screensaver_content'], 'mixed')
        self.assertIs(self.config.get()['ui.tournament_ads'], True)
        self.assertEqual(validate({'ui.tournament_ads': False}), {'ui.tournament_ads': False})
        with self.assertRaises(ConfigError):
            validate({'ui.tournament_ads': 'no'})
        for content in ('mixed', 'covers', 'games'):
            self.assertEqual(validate({'ui.screensaver_content': content}), {'ui.screensaver_content': content})
        for content in ('', 'Mixed', 'video', None, 1):
            with self.assertRaises(ConfigError):
                validate({'ui.screensaver_content': content})

    def test_uscita_dei_profili(self):
        self.assertEqual(self.config.get()['ui.logout_minutes'], 1)
        for minutes in (0, 0.5, 1, 2, 5, 10):
            self.assertEqual(validate({'ui.logout_minutes': minutes}), {'ui.logout_minutes': minutes})
        for minutes in (3, -1, 0.25, '1', None, True):
            with self.assertRaises(ConfigError):
                validate({'ui.logout_minutes': minutes})
        self.assertEqual(self.config.update({'ui.logout_minutes': 0})['ui.logout_minutes'], 0)

    def test_suoni(self):
        values = self.config.get()
        self.assertEqual((values['ui.sound'], values['ui.sound_effects'], values['ui.sound_music']), (True, 75, 50))
        for volume in (0, 25, 50, 75, 100):
            self.assertEqual(validate({'ui.sound_effects': volume, 'ui.sound_music': volume}),
                             {'ui.sound_effects': volume, 'ui.sound_music': volume})
        for volume in (10, -25, 125, '50', None, True, 50.0):
            with self.assertRaises(ConfigError):
                validate({'ui.sound_music': volume})
        for value in ('si', 1, None):
            with self.assertRaises(ConfigError):
                validate({'ui.sound': value})
        self.assertEqual(self.config.update({'ui.sound': False})['ui.sound'], False)

    def test_modalita(self):
        self.assertEqual(self.config.get()['ui.mode'], 'system')
        for mode in ('system', 'day', 'night'):
            self.assertEqual(validate({'ui.mode': mode}), {'ui.mode': mode})
        for mode in ('', 'Day', 'auto', 'light', None, 1):
            with self.assertRaises(ConfigError):
                validate({'ui.mode': mode})
        self.assertEqual(self.config.update({'ui.mode': 'night'})['ui.mode'], 'night')

    def test_core_disponibili(self):
        self.make_cores()
        # Mai scaricato l'elenco: solo i core installati.
        self.assertEqual(sorted(self.config.available_cores()), ['altro', 'hbmame', 'nestopia'])
        self.config.refresh_core_index()
        available = self.config.available_cores()
        # testgl (escluso) e senzainfo (niente .info) restano fuori; ishiiruka non è scaricabile.
        self.assertEqual(sorted(available), ['altro', 'fbneo', 'genesis_plus_gx', 'hbmame', 'mame2003_plus', 'nestopia'])
        self.assertEqual(available['nestopia']['installed'], True)
        self.assertEqual(available['nestopia']['downloadable'], True)
        self.assertEqual(available['fbneo'], {
            'name': 'fbneo', 'label': 'Arcade (FinalBurn Neo)', 'types': ['Arcade'],
            'extensions': ['zip', '7z', 'cue', 'ccd'], 'installed': False, 'downloadable': True})
        self.assertEqual(available['altro'], {'name': 'altro', 'label': 'altro', 'types': [], 'extensions': [],
                                              'installed': True, 'downloadable': False})
        types = {entry['name']: entry['cores'] for entry in self.config.core_types()}
        self.assertEqual(types['Arcade'], ['fbneo', 'hbmame', 'mame2003_plus'])
        self.assertNotIn('Nintendo - GameCube', types)

    def test_lista_predefinita_e_ordine_automatico(self):
        self.make_cores()
        self.config.refresh_core_index()
        # Prima i compatibili con RetroAchievements (fbneo, anche se solo scaricabile),
        # poi gli installati in ordine alfabetico, poi gli scaricabili in ordine alfabetico.
        self.assertEqual(self.config.system_cores('arcade'), ['fbneo', 'hbmame', 'mame2003_plus'])
        self.assertEqual(self.config.system_cores('sms'), ['genesis_plus_gx'])
        self.assertEqual(self.config.system_cores('oric'), [])
        # Mega Drive: genesis_plus_gx è compatibile; picodrive non è disponibile e resta fuori.
        self.assertEqual(self.config.system_cores('mega_drive'), ['genesis_plus_gx'])
        self.cores.replace_system('arcade', '', ['mame2003_plus', 'sparito', 'altro', 'fbneo', 'flycast'])
        candidates = self.config.candidate_cores('arcade')
        # flycast è compatibile ma non disponibile: in fondo con gli altri non disponibili.
        self.assertEqual([core['name'] for core in candidates],
                         ['fbneo', 'altro', 'mame2003_plus', 'flycast', 'sparito'])
        self.assertEqual(candidates[-1], {'name': 'sparito', 'label': 'sparito', 'installed': False,
                                          'downloadable': False, 'extensions': []})
        self.assertEqual(candidates[0]['label'], 'Arcade (FinalBurn Neo)')

    def test_compatibili_in_testa_anche_di_altra_tipologia(self):
        self.make_cores()
        self.config.refresh_core_index()
        available = self.config.available_cores()
        # Un core compatibile con tipologia diversa da quella del preset entra lo stesso, in testa.
        available['mesen'] = {'name': 'mesen', 'label': 'Mesen', 'types': [], 'extensions': ['nes'],
                              'installed': False, 'downloadable': True}
        self.assertEqual(self.config.system_cores('nes', available=available), ['mesen', 'nestopia'])
        self.assertEqual(core_order('mesen', available, ['fceumm', 'mesen']), (0, 1, '', 'mesen'))
        self.assertEqual(core_order('nestopia', available, ['fceumm', 'mesen'])[0], 1)
        self.assertEqual(core_order('fceumm', available, ['fceumm', 'mesen'])[0], 3)

    def test_estensioni_predefinite(self):
        self.make_cores()
        self.config.refresh_core_index()
        self.assertEqual(self.config.default_extensions('sms'), ['sms', 'zip', '7z'])
        self.assertEqual(self.config.default_extensions('oric'), [])
        stored = {'extensions': '', 'cores': ['nestopia', 'fbneo']}
        self.assertEqual(self.config.default_extensions('famiglia', stored),
                         ['nes', 'fds', 'unf', 'unif', 'nsf', 'zip', '7z', 'cue', 'ccd'])

    def test_aggiorna_elenco_senza_rete(self):
        self.make_cores()
        self.assertEqual(self.config.core_index(), {'count': 0, 'fetchedAt': None, 'error': None})
        self.config.refresh_core_index()
        index = self.config.core_index()
        self.assertEqual(index['count'], 6)
        self.assertIsNotNone(index['fetchedAt'])
        self.opener.error = urllib.error.URLError('rete assente')
        with self.assertRaises(ConfigError):
            self.config.refresh_core_index()
        after = self.config.core_index()
        self.assertEqual((after['count'], after['fetchedAt']), (6, index['fetchedAt']))
        self.assertIn('rete assente', after['error'])
        # La riga interna non compare tra le impostazioni e non blocca l'import.
        self.assertNotIn('cores.index_fetched_at', self.config.get())


if __name__ == '__main__':
    unittest.main()
