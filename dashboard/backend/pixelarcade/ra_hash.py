"""Hash RetroAchievements dei file della libreria, calcolato come rcheevos.

Riproduce ``deps/rcheevos/src/rhash`` di RetroArch 1.22.2 per le console a
cartuccia e per l'arcade; i dischi (PS1, Saturn, PSP…) e gli archivi ``7z``
non si calcolano qui: il loro gioco si ricava dal log di RetroArch alla prima
partita (``RA_LOG_GAME``).

Regole:

- MD5 dell'intero file (al massimo ``MAX_SIZE`` byte);
- NES e Famicom Disk System: senza l'intestazione di 16 byte ``NES\\x1a`` o ``FDS\\x1a``;
- SNES: senza i 512 byte del copier se la dimensione è un multiplo di 8 KB più 512;
- PC Engine: senza 512 byte se la dimensione ha il bit 512 acceso;
- Atari 7800: senza 128 byte se i byte 1–9 sono ``ATARI7800``;
- Atari Lynx: senza 64 byte se il file inizia con ``LYNX\\0``;
- Nintendo 64: riportato a big-endian (``.z64``) da ``.v64`` e ``.n64``;
- arcade: MD5 del nome del file senza estensione (con la cartella per i
  sottosistemi FBNeo, che la libreria non usa);
- ``zip`` fuori dall'arcade: il primo file dell'archivio con un'estensione
  ammessa, come lo carica RetroArch.
"""
import hashlib
import os
import zipfile

# ID delle console di RetroAchievements (rc_consoles.h) per ogni preset di ``systems.py``.
CONSOLES = {
    'arcade': [27],
    'nes': [7, 81],
    'fds': [81],
    'snes': [3],
    'gb': [4],
    'gbc': [6],
    'gba': [5],
    'n64': [2],
    'nds': [18],
    'vb': [28],
    'pokemini': [24],
    'md': [1, 10],
    'sega32x': [10],
    'segacd': [9],
    'sms': [11],
    'gg': [15],
    'sg1000': [33],
    'saturn': [39],
    'dreamcast': [40],
    'psx': [12],
    'ps2': [21],
    'psp': [41],
    'pce': [8],
    'pcecd': [76],
    'pcfx': [49],
    'neogeocd': [56],
    'ngp': [14],
    'wonderswan': [53],
    'atari2600': [25],
    'atari7800': [51],
    'lynx': [13],
    'jaguar': [17],
    '3do': [43],
    'colecovision': [44],
    'msx': [29],
    'intellivision': [45],
    'odyssey2': [23],
    'vectrex': [46],
    'channelf': [57],
    'cpc': [37],
    'pc88': [47],
    'arcadia2001': [73],
    'vc4000': [74],
    'elektor': [75],
    'supervision': [63],
    'megaduck': [69],
    'arduboy': [71],
    'uzebox': [80],
    'wasm4': [72],
}

# Preset il cui hash si calcola qui; gli altri (dischi, DS, Arduboy) solo dal log di RetroArch.
PLAIN = frozenset(('gb', 'gbc', 'gba', 'vb', 'pokemini', 'md', 'sega32x', 'sms', 'gg', 'sg1000', 'ngp',
                   'wonderswan', 'atari2600', 'jaguar', 'colecovision', 'intellivision', 'odyssey2', 'vectrex',
                   'channelf', 'arcadia2001', 'vc4000', 'elektor', 'supervision', 'megaduck', 'uzebox', 'wasm4'))
SPECIAL = frozenset(('nes', 'fds', 'snes', 'pce', 'atari7800', 'lynx', 'n64'))

MAX_SIZE = 64 * 1024 * 1024
CHUNK = 1024 * 1024


def console_ids(preset):
    """ID RetroAchievements delle console del preset (lista vuota se nessuna)."""
    return list(CONSOLES.get(preset, []))


def supported(preset):
    """Vero se l'hash del preset si può calcolare senza avviare RetroArch."""
    return preset == 'arcade' or preset in PLAIN or preset in SPECIAL


def md5(data):
    return hashlib.md5(data).hexdigest()


def strip_header(preset, data):
    """Contenuto del file senza l'intestazione che rcheevos ignora."""
    if preset in ('nes', 'fds') and data[:4] in (b'NES\x1a', b'FDS\x1a'):
        return data[16:]
    if preset == 'snes' and len(data) % 0x2000 == 512:
        return data[512:]
    if preset == 'pce' and len(data) & 512:
        return data[512:]
    if preset == 'atari7800' and data[1:10] == b'ATARI7800':
        return data[128:]
    if preset == 'lynx' and data[:5] == b'LYNX\x00':
        return data[64:]
    return data


def to_z64(data):
    """ROM del Nintendo 64 in ordine big-endian; ``None`` se non è una ROM riconoscibile."""
    if not data:
        return None
    first = data[0]
    if first in (0x80, 0xE8, 0x22):
        return data
    if first == 0x37:
        return swap(data, 2)
    if first == 0x40:
        return swap(data, 4)
    return None


def swap(data, size):
    """Inverte l'ordine dei byte a gruppi di ``size``; gli ultimi byte di un gruppo incompleto restano uguali."""
    whole = len(data) - len(data) % size
    swapped = bytearray(data)
    for offset in range(size):
        swapped[offset:whole:size] = data[size - 1 - offset:whole:size]
    return bytes(swapped)


def content_hash(preset, data):
    """Hash del contenuto ``data`` (già letto, al massimo ``MAX_SIZE`` byte); ``None`` se non calcolabile."""
    if preset == 'n64':
        data = to_z64(data)
        return None if data is None else md5(data)
    if preset in SPECIAL:
        return md5(strip_header(preset, data))
    if preset in PLAIN:
        return md5(data)
    return None


def read_limited(stream):
    return stream.read(MAX_SIZE)


def zip_member(archive, extensions):
    """Primo file dell'archivio con un'estensione di ``extensions`` (o il primo file se nessuna lista)."""
    names = [info.filename for info in archive.infolist() if not info.is_dir()]
    for name in names:
        ext = os.path.splitext(name)[1].lower().lstrip('.')
        if not extensions or ext in extensions:
            return name
    return None


def arcade_hash(path):
    """MD5 del nome del file senza estensione."""
    name = os.path.splitext(os.path.basename(path))[0]
    return md5(name.encode('utf-8'))


def file_hash(path, preset, extensions=()):
    """Hash RetroAchievements del file ``path`` della console ``preset``; ``None`` se non calcolabile qui.

    ``extensions`` sono le estensioni dei file di gioco della console (per
    scegliere il file dentro uno ``zip``). Un file illeggibile solleva ``OSError``.
    """
    if preset == 'arcade':
        return arcade_hash(path)
    if not supported(preset):
        return None
    ext = os.path.splitext(path)[1].lower().lstrip('.')
    if ext == '7z':
        return None
    if ext == 'zip':
        inner = [item for item in extensions if item not in ('zip', '7z')]
        try:
            with zipfile.ZipFile(path) as archive:
                member = zip_member(archive, inner)
                if member is None:
                    return None
                with archive.open(member) as stream:
                    return content_hash(preset, read_limited(stream))
        except zipfile.BadZipFile:
            return None
    with open(path, 'rb') as stream:
        return content_hash(preset, read_limited(stream))
