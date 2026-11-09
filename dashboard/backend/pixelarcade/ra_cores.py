"""Core compatibili con RetroAchievements per ogni preset di ``systems.py``.

Fonte: documentazione di RetroAchievements, «Emulator Support»
(https://docs.retroachievements.org/general/emulator-support-and-issues.html),
consultata il 2026-10-01: solo i core libretro, nell'ordine della pagina, con
il core «most recommended» per primo. Nomi brevi verificati sul buildbot
libretro per Linux x86_64.

L'ordine automatico dei core (``config.core_order``) mette questi core in
testa, nell'ordine dato qui, prima di tutti gli altri.
"""

COMPATIBLE = {
    'arcade': ['fbneo', 'flycast'],
    'nes': ['fceumm', 'mesen', 'quicknes'],
    'fds': ['mesen'],
    'snes': ['snes9x', 'mesen-s'],
    'gb': ['gambatte', 'gearboy', 'mgba', 'vbam'],
    'gbc': ['gambatte', 'gearboy', 'mgba', 'vbam'],
    'gba': ['mgba', 'vbam', 'mednafen_gba', 'vba_next'],
    'n64': ['mupen64plus_next', 'parallel_n64'],
    'nds': ['desmume', 'melonds', 'melondsds'],
    'vb': ['mednafen_vb'],
    'pokemini': ['pokemini'],
    'md': ['genesis_plus_gx', 'picodrive'],
    'sega32x': ['picodrive'],
    'segacd': ['genesis_plus_gx', 'picodrive'],
    'sms': ['genesis_plus_gx', 'gearsystem'],
    'gg': ['genesis_plus_gx', 'gearsystem'],
    'sg1000': ['genesis_plus_gx', 'bluemsx'],
    'saturn': ['mednafen_saturn'],
    'dreamcast': ['flycast'],
    'psx': ['mednafen_psx_hw', 'mednafen_psx', 'swanstation'],
    # PS2: RetroAchievements la supporta solo con emulatori standalone (PCSX2…), nessun core libretro.
    'ps2': [],
    'psp': ['ppsspp'],
    'pce': ['mednafen_supergrafx', 'mednafen_pce_fast'],
    'pcecd': ['mednafen_supergrafx', 'mednafen_pce_fast'],
    'pcfx': ['mednafen_pcfx'],
    'neogeocd': ['neocd'],
    'ngp': ['mednafen_ngp'],
    'wonderswan': ['mednafen_wswan'],
    'atari2600': ['stella', 'stella2014'],
    'atari7800': ['prosystem'],
    'lynx': ['handy', 'mednafen_lynx'],
    'jaguar': ['virtualjaguar'],
    '3do': ['opera'],
    'colecovision': ['bluemsx'],
    'msx': ['bluemsx'],
    'intellivision': ['freeintv'],
    'odyssey2': ['o2em'],
    'vectrex': ['vecx'],
    'channelf': ['freechaf'],
    'cpc': ['cap32'],
    'pc88': ['quasi88'],
    'arcadia2001': ['amiarcadia'],
    'vc4000': ['amiarcadia'],
    'elektor': ['amiarcadia'],
    'supervision': ['potator'],
    'megaduck': ['sameduck'],
    'arduboy': ['ardens', 'arduous'],
    'uzebox': ['uzem'],
    'wasm4': ['wasm4'],
}


def compatible_cores(preset_id):
    """Core compatibili del preset ``preset_id``, in ordine di priorità; lista vuota se nessuno."""
    return list(COMPATIBLE.get(preset_id, []))
