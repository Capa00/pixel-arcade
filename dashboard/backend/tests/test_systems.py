import re
import unittest

from pixelarcade.ra_cores import COMPATIBLE
from pixelarcade.systems import PRESETS, colors, describe, display_name

HEX = re.compile(r'^#[0-9a-f]{6}$')


class SystemsTest(unittest.TestCase):
    def test_nome_dalla_cartella(self):
        self.assertEqual(display_name('nes'), 'NES')
        self.assertEqual(display_name('mega_drive'), 'MEGA DRIVE')
        self.assertEqual(display_name('game-boy.color'), 'GAME BOY COLOR')
        self.assertEqual(display_name('  Sega__Saturnò - JP '), 'SEGA SATURNÒ JP')
        self.assertEqual(display_name('___'), '___')

    def test_alias(self):
        for folder in ('MegaDrive', 'mega_drive', 'Genesis', 'md'):
            system = describe(folder)
            self.assertEqual(system['preset'], 'md')
            self.assertEqual(system['id'], folder)
        self.assertEqual(describe('mega_drive')['name'], 'MEGA DRIVE')
        self.assertEqual(describe('PS1')['preset'], 'psx')
        self.assertEqual(describe('Game Boy')['preset'], 'gb')
        self.assertEqual(describe('arcade')['arcade'], True)

    def test_cartella_sconosciuta(self):
        system = describe('Oric_Atmos')
        self.assertIsNone(system['preset'])
        self.assertEqual(system['name'], 'ORIC ATMOS')
        self.assertEqual(system['id'], 'Oric_Atmos')
        self.assertEqual(system['extensions'], [])
        self.assertEqual(system['quote'], 'Press Start.')
        self.assertEqual(system['types'], [])
        self.assertEqual(system['cores'], [])

    def test_tipologie_dei_preset(self):
        self.assertEqual(describe('arcade')['types'], ['Arcade'])
        self.assertEqual(describe('sms')['types'], ['Sega - Master System - Mark III'])
        self.assertEqual(describe('Mega_Drive')['types'], ['Sega - Mega Drive - Genesis'])
        self.assertIn('32x', describe('Mega_Drive')['extensions'])
        self.assertEqual(describe('arcade')['bios'], ['neogeo'])
        self.assertEqual(describe('Oric_Atmos')['bios'], [])
        # Database dei core diverso dal nome di libretro-thumbnails, oppure nessuna copertina.
        self.assertEqual(describe('PC-88')['types'], ['NEC - PC-8001 - PC-8801'])
        self.assertEqual(describe('PC-88')['thumbnails'], 'NEC - PC-88')
        self.assertEqual(describe('Mega Duck')['types'], [])
        for preset_id, preset in PRESETS.items():
            self.assertLessEqual(len(preset['types']), 1, preset_id)

    def test_core_compatibili_retroachievements(self):
        self.assertEqual(describe('Mega_Drive')['cores'], ['genesis_plus_gx', 'picodrive'])
        self.assertEqual(describe('SNES')['cores'], ['snes9x', 'mesen-s'])
        self.assertEqual(describe('PS1')['cores'], ['mednafen_psx_hw', 'mednafen_psx', 'swanstation'])
        self.assertEqual(describe('psp')['cores'], ['ppsspp'])
        self.assertEqual(describe('PS2')['preset'], 'ps2')
        self.assertEqual(describe('PS2')['cores'], [])
        self.assertEqual(describe('32X')['preset'], 'sega32x')
        self.assertEqual(describe('32X')['cores'], ['picodrive'])
        # Una copia per chiamata: modificarla non cambia i preset.
        describe('psp')['cores'].append('altro')
        self.assertEqual(describe('psp')['cores'], ['ppsspp'])

    def test_ogni_preset_ha_core_compatibili(self):
        self.assertEqual(sorted(COMPATIBLE), sorted(PRESETS))
        for preset_id in PRESETS:
            cores = describe(preset_id)['cores']
            # La PS2 non ha core libretro compatibili con RetroAchievements.
            self.assertEqual(bool(cores), preset_id != 'ps2', preset_id)
            self.assertEqual(len(cores), len(set(cores)), preset_id)

    def test_alias_unici(self):
        seen = {}
        for preset_id, preset in PRESETS.items():
            for alias in preset['aliases']:
                self.assertNotIn(alias, PRESETS, preset_id)
                self.assertNotIn(alias, seen, preset_id)
                seen[alias] = preset_id

    def test_dischi_senza_bin(self):
        for preset_id in ('psx', 'ps2', 'segacd', 'saturn', 'pcecd', 'pcfx', 'neogeocd', 'dreamcast', 'psp'):
            self.assertNotIn('bin', describe(preset_id)['extensions'], preset_id)

    def test_colori_calcolati_dal_nome(self):
        accent, covers = colors('ARCADE')
        self.assertRegex(accent, HEX)
        self.assertEqual(len(covers), 4)
        for color in covers:
            self.assertRegex(color, HEX)
        self.assertEqual(colors('ARCADE'), (accent, covers))
        self.assertNotEqual(colors('NES')[0], accent)

    def test_stesso_nome_stessi_colori(self):
        self.assertEqual(describe('mega_drive')['accent'], describe('Mega-Drive')['accent'])
        self.assertEqual(describe('mega_drive')['covers'], describe('MEGA DRIVE')['covers'])

    def test_preset_completi(self):
        for preset_id, preset in PRESETS.items():
            self.assertTrue(preset['extensions'], preset_id)
            self.assertIn('quote', preset, preset_id)


if __name__ == '__main__':
    unittest.main()
