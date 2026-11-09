#!/usr/bin/env python3
"""Scarica da Wikimedia Commons i loghi delle console mostrati nella scheda TUTTE.

I loghi non stanno nella repo: questo script li scarica in
``dashboard/frontend/public/logos/`` (esclusa dal ``.gitignore``) come PNG
larghi ``RASTER_WIDTH`` pixel, ``<preset>.png``, che la build
del frontend copia in ``dist/logos/``. Senza loghi la dashboard mostra il nome
della console al loro posto.

Per ogni sistema riconosciuto (``preset`` del backend) ``LOGOS`` indica il file
di Commons. Accanto ai loghi lo script scrive ``index.json``:
``{preset: {file, source, license, author}}``, con fonte e licenza di ognuno.
I loghi sono marchi dei rispettivi proprietari.

Uso: ``python3 dashboard/tools/fetch_logos.py [--out CARTELLA] [--force]``.
Rispetta le regole di Wikimedia: User-Agent che identifica lo script e un
file alla volta, con una pausa tra le richieste.
"""
import argparse
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

API = 'https://commons.wikimedia.org/w/api.php'
USER_AGENT = 'PixelArcadeLogoFetcher/0.1 (https://github.com/Capa00/pixel-arcade)'
PAUSE = 1.0
# Larghezza dei PNG scaricati: Commons li genera anche dagli SVG, che possono pesare decine
# di MB (il logo del Saturn ne pesa 44) e rallentano il disegno della pagina.
RASTER_WIDTH = 480
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(HERE, '..', 'frontend', 'public', 'logos')

# Sistema (``preset`` del backend) o marca (``brand-<id>``, src/lib/consoleTabs.js) → file di Wikimedia Commons.
LOGOS = {
    'nes': 'NES logo.svg',
    'snes': 'SNES logo.svg',
    'n64': 'Nintendo 64 wordmark.svg',
    'gamecube': 'Nintendo GameCube Official Logo.svg',
    'wii': 'Wii.svg',
    'gb': 'Gameboy logo.svg',
    'gbc': 'Game Boy Color logo.svg',
    'gba': 'Game Boy Advance logo.svg',
    'vb': 'Virtualboy logo.svg',
    'pokemini': 'Pokemon mini logo.svg',
    'nds': 'Nintendo DS Logo.svg',
    '3ds': 'Nintendo 3DS logo.svg',
    'sg1000': 'SG-1000 Logo.svg',
    'sms': 'Master System Logo.svg',
    'md': 'MegaDriveJPLogo.svg',
    'segacd': 'Mega-CD logo.png',
    'sega32x': 'Sega 32X logo.svg',
    'saturn': 'Sega Saturn USA logo.svg',
    'dreamcast': 'Dreamcast logo PAL.svg',
    'gg': 'Game gear eu logo.svg',
    'psx': 'PlayStation wordmark (1994-2009).svg',
    'ps2': 'PlayStation 2 logo.svg',
    'psp': 'PSP Logo.svg',
    'atari2600': 'Logo Atari 2600.svg',
    'atari5200': 'Atari 5200 logo.svg',
    'atari7800': 'Atari 7800 logo-09.svg',
    'jaguar': 'Atari Jaguar logo.svg',
    'lynx': 'Atari Lynx logo.svg',
    'pce': 'PC engine logo red.svg',
    'supergrafx': 'SuperGrafx logo.svg',
    'pcfx': 'PC-FX textlogo.svg',
    'neogeocd': 'NEOGEO CD logo.svg',
    'ngp': 'Neo Geo Pocket logo.svg',
    'wonderswan': 'WonderSwan logo.svg',
    'wonderswancolor': 'Wonderswan-Color-Logo.svg',
    'channelf': 'Channel F Logo.svg',
    'intellivision': 'Intellivision-logo.svg',
    'colecovision': 'COLECO VISION LOGO.svg',
    'vectrex': 'Vectrex logo (rest of the world).svg',
    'c64': 'Commodore 64 logo-05.svg',
    'zxspectrum': 'Sinclair ZX Spectrum-02.svg',
    'cpc': 'Amstrad CPC logo.svg',
    'msx': 'MSX-Logo.svg',
    'atarist': 'Atari ST logo-01.svg',
    'amiga': 'Amiga Logo 1985.svg',
    'dos': 'MS-DOS logo black.svg',
    'pico8': 'PICO-8 logo modern.svg',
    # Marche (gruppi della scheda TUTTE, `brand-<id>`).
    'brand-nintendo': 'Nintendo logo.svg',
    'brand-sega': 'SEGA logo.svg',
    'brand-sony': 'Sony logo.svg',
    'brand-atari': 'Atari Official 2012 Logo.svg',
    'brand-nec': 'NEC logo.svg',
    'brand-snk': 'SNK logo.svg',
    'brand-bandai': 'Logo Bandai.svg',
}


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def plain(value):
    """Testo dei metadati di Commons senza tag HTML."""
    return html.unescape(re.sub(r'<[^>]+>', '', value or '')).strip()


def info(title):
    """URL da scaricare, estensione, pagina, licenza e autore del file ``title`` di Commons."""
    query = urllib.parse.urlencode({
        'action': 'query',
        'format': 'json',
        'titles': 'File:' + title,
        'prop': 'imageinfo',
        'iiprop': 'url|mime|extmetadata',
        'iiurlwidth': RASTER_WIDTH,
    })
    pages = json.loads(fetch(API + '?' + query))['query']['pages']
    page = next(iter(pages.values()))
    if 'imageinfo' not in page:
        return None
    image = page['imageinfo'][0]
    meta = image.get('extmetadata', {})
    return {
        'url': image.get('thumburl') or image['url'],
        'ext': '.png',
        'source': image['descriptionurl'],
        'license': plain(meta.get('LicenseShortName', {}).get('value')),
        'author': plain(meta.get('Artist', {}).get('value')),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--out', default=DEFAULT_OUT, help='cartella dei loghi')
    parser.add_argument('--force', action='store_true', help='scarica anche i loghi già presenti')
    args = parser.parse_args()
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    index_path = os.path.join(out, 'index.json')
    try:
        with open(index_path, encoding='utf-8') as handle:
            index = json.load(handle)
    except (OSError, ValueError):
        index = {}

    missing = []
    for preset, title in LOGOS.items():
        known = index.get(preset)
        if known and not args.force and os.path.exists(os.path.join(out, known['file'])):
            continue
        try:
            found = info(title)
            time.sleep(PAUSE)
            if not found:
                missing.append(f'{preset}: «{title}» non trovato su Commons')
                continue
            data = fetch(found['url'])
            time.sleep(PAUSE)
        except OSError as error:
            missing.append(f'{preset}: {error}')
            continue
        name = preset + found['ext']
        with open(os.path.join(out, name), 'wb') as handle:
            handle.write(data)
        index[preset] = {'file': name, 'source': found['source'], 'license': found['license'], 'author': found['author']}
        print(f'{preset}: {name} ({found["license"] or "licenza non indicata"})')

    with open(index_path, 'w', encoding='utf-8') as handle:
        json.dump(index, handle, ensure_ascii=False, indent=2, sort_keys=True)
    print(f'{len(index)} loghi in {out}')
    for line in missing:
        print('Mancante:', line, file=sys.stderr)
    return 1 if missing else 0


if __name__ == '__main__':
    sys.exit(main())
