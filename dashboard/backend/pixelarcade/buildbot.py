"""Elenco dei core scaricabili dal buildbot libretro (``.index-extended``)."""
import re
import urllib.error
import urllib.request

from .errors import ConfigError

INDEX_NAME = '.index-extended'
MAX_INDEX_BYTES = 1024 * 1024

# «2026-09-22 edf888ae mednafen_supergrafx_libretro.so.zip»
INDEX_LINE = re.compile(r'^(\d{4}-\d{2}-\d{2})\s+([0-9a-fA-F]{1,16})\s+([A-Za-z0-9_+.-]+)_libretro\.so\.zip$')


def parse_index(text):
    """Voci dell'indice: ``{core: {'crc': …, 'date': …}}``; le righe diverse vengono ignorate."""
    result = {}
    for line in text.splitlines():
        match = INDEX_LINE.match(line.strip())
        if match:
            date, crc, core = match.groups()
            result[core] = {'crc': crc.lower(), 'date': date}
    return result


def fetch_index(url, opener=urllib.request.urlopen, timeout=15):
    """Scarica e legge ``<url>.index-extended``.

    ``opener`` è sostituibile nei test. Solleva ``ConfigError`` con un
    messaggio leggibile se il buildbot non risponde, se la risposta supera
    1 MiB o se non contiene core.
    """
    address = url + INDEX_NAME
    try:
        with opener(address, timeout=timeout) as response:
            data = response.read(MAX_INDEX_BYTES + 1)
    except (urllib.error.URLError, OSError, ValueError) as error:
        reason = getattr(error, 'reason', error)
        raise ConfigError('Elenco dei core non scaricato dal buildbot libretro: %s.' % reason)
    if len(data) > MAX_INDEX_BYTES:
        raise ConfigError('Elenco dei core del buildbot troppo grande: ignorato.')
    entries = parse_index(data.decode('utf-8', errors='replace'))
    if not entries:
        raise ConfigError('L\'elenco del buildbot non contiene core: controlla l\'indirizzo.')
    return entries
