import os
import tempfile
import unittest

from pixelarcade import retroarch_cfg


class RetroArchCfgTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, text):
        path = os.path.join(self.tmp.name, 'retroarch.cfg')
        with open(path, 'w') as stream:
            stream.write(text)
        return path

    def test_percorso(self):
        self.assertEqual(retroarch_cfg.retroarch_cfg_path('/h/snap/retroarch/common/.config/retroarch/cores/'),
                         '/h/snap/retroarch/common/.config/retroarch/retroarch.cfg')

    def test_chiavi(self):
        path = self.write('# commento = "x"\ninput_quit_gamepad_combo = "4"\nquit_press_twice = "true"\n'
                          'video_driver = gl\nriga strana\n')
        self.assertEqual(retroarch_cfg.read_known_keys(path),
                         {'input_quit_gamepad_combo': '4', 'quit_press_twice': 'true', 'video_driver': 'gl'})
        self.assertEqual(retroarch_cfg.read_known_keys(os.path.join(self.tmp.name, 'manca.cfg')), {})

    def test_solo_chiavi_presenti(self):
        text = retroarch_cfg.build_append({'input_quit_gamepad_combo': '0', 'quit_press_twice': 'true',
                                           'config_save_on_exit': 'true'})
        self.assertEqual(text.splitlines()[1:], ['input_quit_gamepad_combo = "7"', 'quit_press_twice = "false"',
                                                 'config_save_on_exit = "false"'])
        text = retroarch_cfg.build_append({'quit_press_twice': 'true'})
        self.assertEqual(text.splitlines()[1:], ['quit_press_twice = "false"'])

    def test_combinazione_d_uscita(self):
        known = {'input_quit_gamepad_combo': '0'}
        for value, expected in (('hold_start', '7'), ('hold_select', '8'), ('start_select', '4'), ('boh', '7')):
            text = retroarch_cfg.build_append(known, retroarch_cfg.append_options(value))
            self.assertEqual(text.splitlines()[1:], ['input_quit_gamepad_combo = "%s"' % expected], value)

    def test_menu_rapido_e_override(self):
        known = {'input_menu_toggle_gamepad_combo': '0', 'auto_overrides_enable': 'true'}
        for value, expected in (('l1_r1_start_select', '3'), ('l2_r2', '10'), ('l1_r1', '6'), ('down_select', '9'),
                                ('none', '0'), ('boh', '0')):
            text = retroarch_cfg.build_append(known, retroarch_cfg.append_options('hold_start', value))
            self.assertEqual(text.splitlines()[1:], ['input_menu_toggle_gamepad_combo = "%s"' % expected,
                                                     'auto_overrides_enable = "false"'], value)
        text = retroarch_cfg.build_append(known)
        self.assertIn('input_menu_toggle_gamepad_combo = "0"', text.splitlines())

    def test_combinazione_supportata(self):
        self.assertTrue(retroarch_cfg.quit_combo_supported({'input_quit_gamepad_combo': '0'}))
        self.assertFalse(retroarch_cfg.quit_combo_supported({}))

    def test_joypad_dei_giocatori(self):
        keys = ('input_player1_joypad_index', 'input_player2_joypad_index')
        self.assertEqual(retroarch_cfg.joypad_options(None), [])
        self.assertEqual(retroarch_cfg.joypad_options([None, None]), [])
        self.assertEqual(retroarch_cfg.joypad_options([1, 0]), list(zip(keys, ('1', '0'))))
        self.assertEqual(retroarch_cfg.joypad_options([2]), list(zip(keys, ('2', '0'))))
        self.assertEqual(retroarch_cfg.joypad_options([0, None]), list(zip(keys, ('0', '1'))))
        self.assertEqual(retroarch_cfg.joypad_options([None, 0]), list(zip(keys, ('1', '0'))))
        options = retroarch_cfg.append_options() + retroarch_cfg.joypad_options([1, 0])
        text = retroarch_cfg.build_append({'input_quit_gamepad_combo': '4', 'input_player1_joypad_index': '0'}, options)
        self.assertEqual(text.splitlines()[1:], ['input_quit_gamepad_combo = "7"', 'input_player1_joypad_index = "1"'])

    def test_tasti_dall_autoconfig(self):
        options = retroarch_cfg.autoconfig_button_options()
        self.assertEqual(len(options), 2 * 10 * 2)
        self.assertTrue(all(value == 'nul' for _, value in options))
        keys = {key for key, _ in options}
        for key in ('input_player1_b_btn', 'input_player1_start_btn', 'input_player2_select_btn', 'input_player2_r2_btn'):
            self.assertIn(key, keys)
        for key in ('input_player1_up_axis', 'input_player1_l3_btn', 'input_player1_r_y_minus_btn', 'input_player1_b', 'input_player1_joypad_index'):
            self.assertNotIn(key, keys)
        text = retroarch_cfg.build_append({'input_player1_b_btn': '0', 'input_player1_b': 'z'}, options)
        self.assertEqual(text.splitlines()[1:], ['input_player1_b_btn = "nul"'])

    def test_preferenze_del_giocatore(self):
        options = retroarch_cfg.player_options({'crt': False, 'vib': True})
        self.assertEqual(options, [('input_rumble_gain', '100')])
        options = retroarch_cfg.player_options({'crt': True, 'vib': False, 'save': False})
        self.assertEqual(dict(options), {'input_rumble_gain': '0'})
        # Lo shader CRT non è una chiave: passa con --set-shader.
        self.assertEqual(retroarch_cfg.crt_shader({'crt': True}, '/s/crt.slangp'), '/s/crt.slangp')
        self.assertIsNone(retroarch_cfg.crt_shader({'crt': False}, '/s/crt.slangp'))
        self.assertIsNone(retroarch_cfg.crt_shader({'crt': True}, ''))

    def test_cartella_di_sessione(self):
        self.assertEqual(retroarch_cfg.session_dir('/home/utente/snap/retroarch/common/pixel-arcade.cfg'),
                         '/home/utente/snap/retroarch/common/pixel-arcade-session')
        options = dict(retroarch_cfg.session_options('/s/sessione'))
        self.assertEqual(options['savestate_directory'], '/s/sessione')
        self.assertEqual(options['savefile_directory'], '/s/sessione')
        self.assertEqual(options['screenshot_directory'], '/s/sessione')
        for key in ('savestate_auto_save', 'savestate_auto_load', 'savestate_thumbnail_enable', 'network_cmd_enable'):
            self.assertEqual(options[key], 'true', key)
        for key in ('sort_savestates_enable', 'sort_savefiles_enable', 'sort_savestates_by_content_enable',
                    'sort_savefiles_by_content_enable', 'savestate_auto_index', 'content_runtime_log'):
            self.assertEqual(options[key], 'false', key)
        self.assertEqual(options['network_cmd_port'], '55355')
        self.assertEqual(dict(retroarch_cfg.session_options('/s/sessione', 55400))['network_cmd_port'], '55400')
        # Solo le chiavi note al retroarch.cfg della console.
        known = {'savestate_directory': '~/states', 'network_cmd_enable': 'false'}
        text = retroarch_cfg.build_append(known, retroarch_cfg.session_options('/s/sessione'))
        self.assertEqual(text.splitlines()[1:], ['savestate_directory = "/s/sessione"', 'network_cmd_enable = "true"'])

    def test_scrittura(self):
        path = os.path.join(self.tmp.name, 'pixel-arcade.cfg')
        retroarch_cfg.write_append(path, {'input_quit_gamepad_combo': '4'})
        with open(path) as stream:
            self.assertIn('input_quit_gamepad_combo = "7"', stream.read())
        self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()
