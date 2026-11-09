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
                   ['neogeopocket', 'neogeopocketcolor', 'ngpc']),
    'wonderswan': _preset(['ws', 'wsc', 'zip', '7z'], 'Bandai - WonderSwan',
                          ['ws', 'wsc', 'wonderswancolor']),
    'atari2600': _preset(['a26', 'bin', 'zip', '7z'], 'Atari - 2600', ['2600', 'vcs', 'atarivcs']),
    'atari7800': _preset(['a78', 'bin', 'zip', '7z'], 'Atari - 7800', ['7800']),
    'lynx': _preset(['lnx', 'zip', '7z'], 'Atari - Lynx', ['atarilynx']),
    'jaguar': _preset(['j64', 'jag', 'zip', '7z'], 'Atari - Jaguar', ['atarijaguar']),
    '3do': _preset(['iso', 'chd', 'cue'], 'The 3DO Company - 3DO', ['3docompany', 'panasonic3do']),
    'colecovision': _preset(['col', 'rom', 'zip', '7z'], 'Coleco - ColecoVision', ['coleco']),
    'msx': _preset(['rom', 'mx1', 'mx2', 'dsk', 'cas', 'zip', '7z'], 'Microsoft - MSX', ['msx1', 'msx2']),
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
    'megaduck': _preset(['bin', 'zip'], None, ['duck'], types=[]),
    'arduboy': _preset(['hex', 'arduboy'], 'Arduboy Inc - Arduboy', []),
    'uzebox': _preset(['uze'], None, [], types=['Uzebox']),
    'wasm4': _preset(['wasm'], 'WASM-4', []),
})

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
