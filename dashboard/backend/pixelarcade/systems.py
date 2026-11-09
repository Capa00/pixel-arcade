"""Sistemi: nome e colori ricavati dalla cartella, preset per estensioni e citazioni.

Il nome mostrato è quello della cartella normalizzato; i colori si calcolano
dal nome, sempre uguali per lo stesso nome. I preset (riconosciuti tramite
alias) danno solo estensioni, titoli arcade, nome libretro-thumbnails,
tipologie dei core (sprint 04b) e citazione: quelle della demo, per gli
altri «Press Start.». I core compatibili con RetroAchievements, messi in
testa all'ordine automatico, stanno in ``ra_cores.py``.
Sono dati di presentazione, non stato: restano nel codice e non nel database.
"""
import colorsys
import re

from .ra_cores import compatible_cores

DEFAULT_QUOTE = 'Press Start.'
DEFAULT_SOURCE = 'Pixel Arcade'

PRESETS = {
    'arcade': {
        'quote': 'All your base are belong to us.',
        'source': 'Zero Wing',
        'extensions': ['zip', '7z'],
        'thumbnails': 'MAME',
        'arcade': True,
        # BIOS che i core arcade cercano accanto ai giochi: file di sistema, non giochi da mostrare.
        'bios': ['neogeo'],
        'aliases': ['mame', 'fbneo', 'fba', 'finalburn', 'finalburnneo'],
    },
    'nes': {
        'quote': 'Thank you Mario! But our princess is in another castle!',
        'source': 'Super Mario Bros.',
        'extensions': ['nes', 'fds', 'unf', 'unif', 'zip', '7z'],
        'thumbnails': 'Nintendo - Nintendo Entertainment System',
        'arcade': False,
        'aliases': ['famicom', 'fc', 'nintendo'],
    },
    'snes': {
        'quote': 'Hadouken!',
        'source': 'Street Fighter II',
        'extensions': ['sfc', 'smc', 'fig', 'swc', 'bs', 'zip', '7z'],
        'thumbnails': 'Nintendo - Super Nintendo Entertainment System',
        'arcade': False,
        'aliases': ['superfamicom', 'sfc', 'supernintendo', 'supernes'],
    },
    'md': {
        'quote': 'Finish him!',
        'source': 'Mortal Kombat',
        'extensions': ['md', 'gen', 'smd', 'bin', '68k', 'sgd', '32x', 'zip', '7z'],
        'thumbnails': 'Sega - Mega Drive - Genesis',
        'arcade': False,
        'aliases': ['megadrive', 'genesis', 'segagenesis', 'segamegadrive'],
    },
    'gb': {
        'quote': "Gotta catch 'em all!",
        'source': 'Pokémon',
        'extensions': ['gb', 'dmg', 'zip', '7z'],
        'thumbnails': 'Nintendo - Game Boy',
        'arcade': False,
        'aliases': ['gameboy'],
    },
    'gbc': {
        'quote': DEFAULT_QUOTE,
        'source': DEFAULT_SOURCE,
        'extensions': ['gbc', 'zip', '7z'],
        'thumbnails': 'Nintendo - Game Boy Color',
        'arcade': False,
        'aliases': ['gameboycolor', 'gameboycolour'],
    },
    'gba': {
        'quote': DEFAULT_QUOTE,
        'source': DEFAULT_SOURCE,
        'extensions': ['gba', 'zip', '7z'],
        'thumbnails': 'Nintendo - Game Boy Advance',
        'arcade': False,
        'aliases': ['gameboyadvance'],
    },
    'n64': {
        'quote': DEFAULT_QUOTE,
        'source': DEFAULT_SOURCE,
        'extensions': ['n64', 'z64', 'v64', 'zip', '7z'],
        'thumbnails': 'Nintendo - Nintendo 64',
        'arcade': False,
        'aliases': ['nintendo64'],
    },
    'sms': {
        'quote': DEFAULT_QUOTE,
        'source': DEFAULT_SOURCE,
        'extensions': ['sms', 'zip', '7z'],
        'thumbnails': 'Sega - Master System - Mark III',
        'arcade': False,
        'aliases': ['mastersystem', 'segamastersystem'],
    },
    'gg': {
        'quote': DEFAULT_QUOTE,
        'source': DEFAULT_SOURCE,
        'extensions': ['gg', 'zip', '7z'],
        'thumbnails': 'Sega - Game Gear',
        'arcade': False,
        'aliases': ['gamegear', 'segagamegear'],
    },
    'pce': {
        'quote': DEFAULT_QUOTE,
        'source': DEFAULT_SOURCE,
        'extensions': ['pce', 'cue', 'chd', 'zip', '7z'],
        'thumbnails': 'NEC - PC Engine - TurboGrafx 16',
        'arcade': False,
        'aliases': ['pcengine', 'turbografx', 'turbografx16', 'tg16'],
    },
    'psx': {
        'quote': 'Snake? Snake?! SNAAAAAKE!',
        'source': 'Metal Gear Solid',
        'extensions': ['cue', 'chd', 'pbp', 'm3u'],
        'thumbnails': 'Sony - PlayStation',
        'arcade': False,
        'aliases': ['ps1', 'ps', 'playstation', 'playstation1', 'sonyplaystation'],
    },
    'ps2': {
        'quote': 'Ah shit, here we go again.',
        'source': 'Grand Theft Auto: San Andreas',
        'extensions': ['iso', 'chd', 'cso', 'm3u'],
        'thumbnails': 'Sony - PlayStation 2',
        'arcade': False,
        'aliases': ['playstation2', 'sonyplaystation2'],
    },
}


def _preset(extensions, thumbnails, aliases, types=None):
    """Preset con la citazione predefinita (console aggiunte per RetroAchievements, 2026-10-01).

    ``types`` serve solo quando il nome del database dei core (campo
    ``database`` dei ``.info``) è diverso da quello di libretro-thumbnails.
    """
    preset = {
        'quote': DEFAULT_QUOTE,
        'source': DEFAULT_SOURCE,
        'extensions': extensions,
        'thumbnails': thumbnails,
        'arcade': False,
        'aliases': aliases,
    }
    if types is not None:
        preset['types'] = types
    return preset


# Dischi: niente ``bin``, che accompagna i ``cue`` e comparirebbe come gioco doppio.
PRESETS.update({
    'fds': _preset(['fds', 'zip', '7z'], 'Nintendo - Family Computer Disk System',
                   ['famicomdisksystem', 'disksystem', 'famicomdisk']),
    'nds': _preset(['nds', 'zip', '7z'], 'Nintendo - Nintendo DS', ['ds', 'nintendods']),
    'vb': _preset(['vb', 'vboy', 'zip', '7z'], 'Nintendo - Virtual Boy', ['virtualboy']),
    'pokemini': _preset(['min', 'zip', '7z'], 'Nintendo - Pokemon Mini', ['pokemonmini']),
    'sega32x': _preset(['32x', 'zip', '7z'], 'Sega - 32X', ['32x', 's32x', 'mega32x', 'genesis32x']),
    'segacd': _preset(['cue', 'chd', 'm3u'], 'Sega - Mega-CD - Sega CD', ['megacd', 'scd', 'mcd']),
    'sg1000': _preset(['sg', 'zip', '7z'], 'Sega - SG-1000', ['sg', 'sega1000']),
    'saturn': _preset(['cue', 'chd', 'm3u'], 'Sega - Saturn', ['segasaturn', 'ss']),
    'dreamcast': _preset(['chd', 'cdi', 'gdi', 'm3u'], 'Sega - Dreamcast', ['dc', 'segadreamcast']),
    'psp': _preset(['iso', 'cso', 'chd', 'pbp'], 'Sony - PlayStation Portable',
                   ['playstationportable', 'sonypsp']),
    'pcecd': _preset(['cue', 'chd', 'm3u'], 'NEC - PC Engine CD - TurboGrafx-CD',
                     ['pcenginecd', 'turbografxcd', 'tgcd']),
    'pcfx': _preset(['cue', 'chd', 'm3u'], 'NEC - PC-FX', []),
    'neogeocd': _preset(['cue', 'chd'], 'SNK - Neo Geo CD', ['ngcd']),
    'ngp': _preset(['ngp', 'ngc', 'zip', '7z'], 'SNK - Neo Geo Pocket',
                   ['neogeopocket', 'neogeopocketcolor', 'ngpc'], types=['SNK - Neo Geo Pocket', 'SNK - Neo Geo Pocket Color']),
    'wonderswan': _preset(['ws', 'wsc', 'zip', '7z'], 'Bandai - WonderSwan',
                          ['ws', 'wsc', 'wonderswancolor'], types=['Bandai - WonderSwan', 'Bandai - WonderSwan Color']),
    'atari2600': _preset(['a26', 'bin', 'zip', '7z'], 'Atari - 2600', ['2600', 'vcs', 'atarivcs']),
    'atari7800': _preset(['a78', 'bin', 'zip', '7z'], 'Atari - 7800', ['7800']),
    'lynx': _preset(['lnx', 'zip', '7z'], 'Atari - Lynx', ['atarilynx']),
    'jaguar': _preset(['j64', 'jag', 'zip', '7z'], 'Atari - Jaguar', ['atarijaguar']),
    '3do': _preset(['iso', 'chd', 'cue'], 'The 3DO Company - 3DO', ['3docompany', 'panasonic3do']),
    'colecovision': _preset(['col', 'rom', 'zip', '7z'], 'Coleco - ColecoVision', ['coleco']),
    'msx': _preset(['rom', 'mx1', 'mx2', 'dsk', 'cas', 'zip', '7z'], 'Microsoft - MSX', ['msx1', 'msx2'],
                   types=['Microsoft - MSX', 'Microsoft - MSX2']),
    'intellivision': _preset(['int', 'bin', 'rom', 'zip', '7z'], 'Mattel - Intellivision', ['intv']),
    'odyssey2': _preset(['bin', 'zip', '7z'], 'Magnavox - Odyssey2', ['odyssey', 'videopac']),
    'vectrex': _preset(['vec', 'bin', 'zip', '7z'], 'GCE - Vectrex', []),
    'channelf': _preset(['chf', 'bin', 'zip', '7z'], 'Fairchild - Channel F', ['fairchild']),
    'cpc': _preset(['dsk', 'sna', 'cdt', 'cpr', 'm3u', 'zip'], 'Amstrad - CPC', ['amstrad', 'amstradcpc']),
    'pc88': _preset(['d88', 'u88', 'm3u'], 'NEC - PC-88', ['pc8800', 'pc8801', 'pc8000'],
                    types=['NEC - PC-8001 - PC-8801']),
    'arcadia2001': _preset(['bin', 'zip'], 'Emerson - Arcadia 2001', ['arcadia']),
    'vc4000': _preset(['bin', 'zip'], None, ['intertonvc4000', 'interton'], types=[]),
    'elektor': _preset(['bin', 'zip'], None, ['elektortvgames', 'tvgamescomputer'], types=[]),
    'supervision': _preset(['sv', 'bin', 'zip', '7z'], 'Watara - Supervision', ['watara']),
    'megaduck': _preset(['bin', 'zip'], None, ['duck'], types=['Welback Holdings - Mega Duck']),
    'arduboy': _preset(['hex', 'arduboy'], 'Arduboy Inc - Arduboy', []),
    'uzebox': _preset(['uze'], None, [], types=['Uzebox', 'Uzebox - Uzebox']),
    'wasm4': _preset(['wasm'], 'WASM-4', []),
})

# Altre console e computer dei core di RetroArch (campo ``database`` dei ``.info``, 2026-11-09).
# Restano fuori motori di gioco, varianti della stessa console, arcade già nella console Arcade,
# calcolatrici e macchine virtuali.
PRESETS.update({
    'gamecube': _preset(['iso', 'gcm', 'gcz', 'rvz', 'ciso', 'wbfs', 'm3u'], 'Nintendo - GameCube',
                        ['gc', 'nintendogamecube']),
    'wii': _preset(['iso', 'wbfs', 'rvz', 'gcz', 'ciso', 'wad', 'm3u'], 'Nintendo - Wii', ['nintendowii'],
                   types=['Nintendo - Wii', 'Nintendo - Wii (Digital)']),
    '3ds': _preset(['3ds', 'cci', 'cxi', '3dsx', 'app'], 'Nintendo - Nintendo 3DS', ['n3ds', 'nintendo3ds']),
    'gameandwatch': _preset(['mgw'], 'Handheld Electronic Game', ['gw', 'gamewatch'],
                            types=['Handheld Electronic']),
    'pico': _preset(['md', 'bin', 'zip', '7z'], 'Sega - PICO', ['segapico']),
    'atari5200': _preset(['a52', 'bin', 'car', 'zip', '7z'], 'Atari - 5200', ['5200']),
    'supergrafx': _preset(['sgx', 'pce', 'cue', 'chd'], 'NEC - PC Engine SuperGrafx', ['sgx', 'pcenginesupergrafx']),
    'gx4000': _preset(['cpr', 'dsk', 'zip'], 'Amstrad - GX4000', ['amstradgx4000']),
    'scv': _preset(['cart', 'bin', 'rom', 'zip'], 'Epoch - Super Cassette Vision',
                   ['supercassettevision', 'epochscv']),
    'cdi': _preset(['chd', 'cue', 'iso'], 'Philips - CD-i', ['philipscdi']),
    'videopacplus': _preset(['bin', 'zip'], 'Philips - Videopac+', []),
    'xbox': _preset(['iso'], 'Microsoft - Xbox', ['microsoftxbox']),
    'cd32': _preset(['chd', 'cue', 'iso', 'm3u'], 'Commodore - CD32', ['amigacd32']),
    'cdtv': _preset(['chd', 'cue', 'iso', 'm3u'], 'Commodore - CDTV', ['commodorecdtv', 'amigacdtv']),
    'atari8bit': _preset(['atr', 'xex', 'xfd', 'dcm', 'atx', 'cas', 'car', 'rom', 'com', 'zip', 'm3u'],
                         'Atari - 8-bit Family', ['atari800', 'atarixl']),
    'atarist': _preset(['st', 'msa', 'stx', 'dim', 'ipf', 'zip', 'm3u'], 'Atari - ST', []),
    'c64': _preset(['d64', 't64', 'tap', 'prg', 'crt', 'g64', 'd81', 'x64', 'p00', 'zip', 'm3u'], 'Commodore - 64',
                   ['commodore64']),
    'amiga': _preset(['adf', 'adz', 'dms', 'ipf', 'hdf', 'hdz', 'lha', 'zip', 'm3u'], 'Commodore - Amiga',
                     ['commodoreamiga']),
    'vic20': _preset(['d64', 't64', 'tap', 'prg', 'crt', 'zip', 'm3u'], 'Commodore - VIC-20', ['commodorevic20']),
    'plus4': _preset(['d64', 't64', 'tap', 'prg', 'crt', 'zip', 'm3u'], 'Commodore - Plus-4',
                     ['commodoreplus4', 'c16']),
    'pet': _preset(['d64', 't64', 'tap', 'prg', 'zip', 'm3u'], 'Commodore - PET', ['commodorepet']),
    'zx81': _preset(['p', 'tzx', 't81'], 'Sinclair - ZX 81', ['sinclairzx81']),
    'zxspectrum': _preset(['tzx', 'tap', 'z80', 'sna', 'szx', 'rzx', 'dsk', 'trd', 'scl', 'zip'],
                          'Sinclair - ZX Spectrum', ['spectrum', 'sinclairzxspectrum'],
                          types=['Sinclair - ZX Spectrum', 'Sinclair - ZX Spectrum +3']),
    'apple2': _preset(['dsk', 'do', 'po', 'nib', 'woz', '2mg', 'hdv', 'zip', 'm3u'], 'Apple - II', ['appleii']),
    'mac68k': _preset(['dsk', 'img', 'zip'], 'Apple - Mac68k', ['macintosh']),
    'bbcmicro': _preset(['ssd', 'dsd'], 'Acorn - BBC Micro', ['acornbbc']),
    'pc98': _preset(['d98', 'hdi', 'fdi', 'fdd', 'd88', 'zip', 'm3u'], 'NEC - PC-98', ['pc9801']),
    'x1': _preset(['dx1', '2d', 'd88', 'tap', 'zip'], 'Sharp - X1', ['sharpx1']),
    'x68000': _preset(['dim', 'hdf', 'xdf', 'd88', '2hd', 'm3u'], 'Sharp - X68000', ['x68k', 'sharpx68000']),
    'dos': _preset(['zip', 'dosz', 'exe', 'com', 'bat', 'iso', 'cue', 'm3u', 'conf'], 'Microsoft - DOS', ['msdos']),
    'spectravideo': _preset(['rom', 'cas', 'dsk', 'zip'], 'Spectravideo - SVI-318 - SVI-328', ['svi318', 'svi328']),
    'enterprise': _preset(['img', 'dsk', 'tap', 'com', 'zip'], 'Enterprise - 128', ['enterprise128']),
    'samcoupe': _preset(['dsk', 'mgt', 'sad', 'sbt'], 'Miles Gordon Technology - SAM coupe', []),
    'thomson': _preset(['fd', 'sap', 'k7', 'm7', 'm5', 'rom'], 'Thomson - MOTO', ['thomsonmoto']),
    'p2000t': _preset(['cas'], 'Philips - P2000T', ['philipsp2000t']),
    'tvcomputer': _preset(['img', 'dsk', 'tap', 'cas'], 'Videoton - TV-Computer', []),
    'pico8': _preset(['p8', 'png'], 'Lexaloffle - PICO-8', []),
})

# Marche delle console, ciascuna con i suoi sistemi in ordine di uscita: ordinano la riga delle
# schede, la scheda TUTTE e le Impostazioni (README, «Riga delle console e scheda TUTTE»).
BRANDS = {
    'arcade': ['arcade'],
    'atari': ['atari2600', 'atari5200', 'atari7800', 'lynx', 'jaguar'],
    'bandai': ['wonderswan'],
    'computer': ['pet', 'apple2', 'zx81', 'vic20', 'atari8bit', 'bbcmicro', 'zxspectrum', 'c64', 'pc88', 'x1',
                 'spectravideo', 'msx', 'plus4', 'cpc', 'thomson', 'enterprise', 'mac68k', 'p2000t', 'tvcomputer',
                 'pc98', 'atarist', 'amiga', 'x68000', 'samcoupe', 'dos'],
    'nec': ['pce', 'pcecd', 'supergrafx', 'pcfx'],
    'nintendo': ['gameandwatch', 'nes', 'fds', 'snes', 'gb', 'vb', 'n64', 'gbc', 'pokemini', 'gba', 'gamecube',
                 'nds', 'wii', '3ds'],
    'sega': ['sg1000', 'sms', 'md', 'gg', 'segacd', 'sega32x', 'pico', 'saturn', 'dreamcast'],
    'snk': ['neogeocd', 'ngp'],
    'sony': ['psx', 'ps2', 'psp'],
    'other': ['channelf', 'odyssey2', 'videopacplus', 'intellivision', 'colecovision', 'vectrex', 'arcadia2001',
              'vc4000', 'elektor', 'scv', 'gx4000', 'cdtv', '3do', 'cdi', 'cd32', 'supervision', 'megaduck', 'xbox',
              'arduboy', 'uzebox', 'pico8', 'wasm4'],
}
BRAND_OF = {preset_id: (brand, index) for brand, ids in BRANDS.items() for index, preset_id in enumerate(ids)}

# Cartella di ogni sistema dentro la cartella dei giochi: il backend crea quelle mancanti all'avvio
# (``Library.ensure_folders``) e la repo le porta vuote, con un ``.gitkeep``. Il nome mostrato viene
# dalla cartella (``display_name``). Per i sistemi non elencati la cartella ha il nome del preset.
FOLDERS = {
    'md': 'mega_drive', 'sms': 'master_system', 'gg': 'game_gear', 'psx': 'ps1', 'pce': 'pc_engine',
    'pcecd': 'pc_engine_cd', 'pcfx': 'pc_fx', 'fds': 'famicom_disk_system', 'nds': 'nintendo_ds',
    'vb': 'virtual_boy', 'pokemini': 'pokemon_mini', 'sega32x': 'sega_32x', 'segacd': 'sega_cd',
    'sg1000': 'sg_1000', 'neogeocd': 'neo_geo_cd', 'ngp': 'neo_geo_pocket', 'atari2600': 'atari_2600',
    'atari5200': 'atari_5200', 'atari7800': 'atari_7800', 'channelf': 'channel_f', 'cpc': 'amstrad_cpc',
    'pc88': 'pc_88', 'arcadia2001': 'arcadia_2001', 'vc4000': 'vc_4000', 'megaduck': 'mega_duck',
    '3ds': 'nintendo_3ds', 'gameandwatch': 'game_and_watch', 'pico': 'sega_pico', 'gx4000': 'amstrad_gx4000',
    'scv': 'super_cassette_vision', 'cdi': 'philips_cdi', 'videopacplus': 'videopac_plus', 'cd32': 'amiga_cd32',
    'cdtv': 'commodore_cdtv', 'atari8bit': 'atari_8bit', 'atarist': 'atari_st', 'c64': 'commodore_64',
    'vic20': 'vic_20', 'plus4': 'commodore_plus4', 'pet': 'commodore_pet', 'zxspectrum': 'zx_spectrum',
    'apple2': 'apple_ii', 'mac68k': 'macintosh', 'bbcmicro': 'bbc_micro', 'pc98': 'pc_98', 'x1': 'sharp_x1',
    'enterprise': 'enterprise_128', 'samcoupe': 'sam_coupe', 'thomson': 'thomson_moto',
    'p2000t': 'philips_p2000t', 'tvcomputer': 'tv_computer', 'pico8': 'pico_8',
}


def folder_of(preset_id):
    """Nome della cartella del sistema ``preset_id`` dentro la cartella dei giochi."""
    return FOLDERS.get(preset_id, preset_id)


def brand_of(preset_id, arcade=False):
    """``(marca, posizione nella marca)``; un sistema non riconosciuto va in fondo ad ``arcade`` o ``other``."""
    if preset_id in BRAND_OF:
        return BRAND_OF[preset_id]
    return ('arcade' if arcade else 'other'), None

GENERIC = {
    'quote': DEFAULT_QUOTE,
    'source': DEFAULT_SOURCE,
    # Nessuna estensione: la libreria accetta ogni file tranne quelli di servizio.
    'extensions': [],
    'thumbnails': None,
    'arcade': False,
    'types': [],
}


def preset_types(preset):
    """Tipologie dei core di un preset (tipologie_core.md): Arcade, oppure il nome libretro-thumbnails."""
    if preset.get('arcade'):
        return ['Arcade']
    return [preset['thumbnails']] if preset.get('thumbnails') else []


for _item in PRESETS.values():
    _item.setdefault('types', preset_types(_item))


def display_name(folder):
    """Nome mostrato: maiuscolo, separatori (``_``, ``-``, ``.``…) come spazi.

    ``mega_drive`` → ``MEGA DRIVE``; le lettere accentate restano.
    """
    name = re.sub(r'[\W_]+', ' ', folder).strip().upper()
    return name or folder.upper()


def fnv1a(text):
    """Hash FNV-1a a 32 bit dei byte UTF-8 di ``text``."""
    value = 0x811c9dc5
    for byte in text.encode('utf-8'):
        value = ((value ^ byte) * 0x01000193) & 0xffffffff
    return value


def hsl(hue, saturation, lightness):
    """Colore ``#rrggbb`` da tinta (gradi), saturazione e luminosità (0–1)."""
    red, green, blue = colorsys.hls_to_rgb((hue % 360) / 360.0, lightness, saturation)
    return '#%02x%02x%02x' % (round(red * 255), round(green * 255), round(blue * 255))


def colors(name):
    """Colore della scheda e 4 colori di copertina calcolati dal nome mostrato.

    La tinta viene dall'hash del nome; saturazione e luminosità sono fisse,
    così la scheda resta leggibile sullo sfondo scuro.
    """
    hue = fnv1a(name) % 360
    accent = hsl(hue, 0.85, 0.65)
    covers = [
        hsl(hue, 0.70, 0.50),
        hsl(hue, 0.45, 0.18),
        hsl(hue + 30, 0.65, 0.58),
        hsl(hue + 180, 0.55, 0.45),
    ]
    return accent, covers


def normalize(folder):
    """Nome di cartella ridotto a minuscole e cifre (``Mega_Drive`` → ``megadrive``)."""
    return re.sub(r'[^a-z0-9]', '', folder.lower())


ALIASES = {}
for preset_id, preset in PRESETS.items():
    ALIASES[preset_id] = preset_id
    for alias in preset['aliases']:
        ALIASES[alias] = preset_id


def describe(folder):
    """Descrive la cartella ROM ``folder``.

    ``id`` è il nome della cartella, ``name`` il nome mostrato, ``accent`` e
    ``covers`` i colori calcolati dal nome, ``types`` le tipologie dei core
    predefiniti, ``cores`` i core compatibili con RetroAchievements in ordine di
    priorità (``ra_cores.py``), ``bios`` i nomi
    (senza estensione) dei file di sistema da non mostrare in libreria. Una cartella non riconosciuta usa il preset generico (ogni
    estensione, nessuna tipologia, «Press Start.»).
    """
    preset_id = ALIASES.get(normalize(folder))
    data = GENERIC if preset_id is None else PRESETS[preset_id]
    name = display_name(folder)
    accent, covers = colors(name)
    result = {'id': folder, 'preset': preset_id, 'name': name, 'accent': accent, 'covers': covers}
    for key in ('quote', 'source', 'thumbnails', 'arcade'):
        result[key] = data[key]
    result['extensions'] = list(data['extensions'])
    result['types'] = list(data['types'])
    result['cores'] = compatible_cores(preset_id)
    result['bios'] = list(data.get('bios', []))
    return result
