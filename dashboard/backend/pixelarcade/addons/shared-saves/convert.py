"""File caricati dalle Impostazioni → file della cartella di un salvataggio condiviso.

- PS2: una memory card ``.ps2`` va così com'è (``Mcd001.ps2``); i salvataggi
  esportati (``.max``, ``.psu``, ``.cbs``, ``.xps``, ``.sps``, ``.npo``) si
  importano con ``mymcplus`` in una memory card nuova, formattata.
- Le altre console: il salvataggio interno grezzo del core. ``.sav``,
  ``.mcr``, ``.mcd`` e ``.mc`` (memory card PS1) diventano ``.srm``, il nome
  che RetroArch dà al salvataggio interno; le altre estensioni restano.

``mymcplus`` (https://github.com/thestr4ng3r/mymcplus) è un programma esterno:
la dashboard lo cerca nel ``PATH`` e in ``<data_dir>/tools/mymcplus/bin/``.
"""
import os
import re
import shutil
import subprocess

from pixelarcade.systems import describe

from .store import StoreError

CARD = 'Mcd001.ps2'
PS2_EXPORTS = ('.max', '.psu', '.cbs', '.xps', '.sps', '.npo')
PS2_FILES = PS2_EXPORTS + ('.ps2',)
# Estensioni che il core legge come ``.srm``.
SRM_ALIASES = ('.srm', '.sav', '.mcr', '.mcd', '.mc')
EXTENSION = re.compile(r'^\.[a-z0-9]{1,8}$')
MYMC_TIMEOUT = 60
# Importazione riuscita: «Importing <file> to <cartella>».
IMPORTED = re.compile(r'^Importing .* to (\S+)\s*$', re.MULTILINE)


def is_ps2(system_id):
    return describe(system_id)['preset'] == 'ps2' or system_id == 'ps2'


def find_mymcplus(data_dir):
    """Percorso di ``mymcplus``, oppure ``None`` se non è installato."""
    found = shutil.which('mymcplus')
    if found:
        return found
    if data_dir:
        path = os.path.join(data_dir, 'tools', 'mymcplus', 'bin', 'mymcplus')
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    return None


def run_mymc(mymc, *args):
    try:
        result = subprocess.run([mymc, *args], capture_output=True, text=True, timeout=MYMC_TIMEOUT)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise StoreError('mymcplus non risponde: %s' % error)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or '').strip().splitlines()
        raise StoreError('mymcplus non ha importato il file%s' % (': ' + detail[-1] if detail else '.'))
    return result.stdout


def ps2_card(source, work_dir, mymc):
    """Memory card nuova in ``work_dir`` con dentro il salvataggio ``source``; ``(percorso, cartella importata)``."""
    if mymc is None:
        raise StoreError('Per i salvataggi PS2 serve mymcplus (README «Salvataggi condivisi»), oppure carica '
                         'una memory card .ps2.')
    card = os.path.join(work_dir, CARD)
    if os.path.exists(card):
        os.unlink(card)
    run_mymc(mymc, card, 'format')
    output = run_mymc(mymc, card, 'import', source)
    match = IMPORTED.search(output)
    return card, match.group(1) if match else None


def prepare(system_id, source, file_name, work_dir, mymc):
    """File del salvataggio da ``source`` (caricato col nome ``file_name``): ``({nome: percorso}, nota)``.

    ``nota`` è la cartella PS2 importata (per esempio ``BASLUS-21059``), oppure ``None``.
    """
    ext = os.path.splitext(file_name or '')[1].lower()
    if not EXTENSION.match(ext):
        raise StoreError('Il file deve avere un\'estensione, per esempio .srm o .max.')
    if is_ps2(system_id):
        if ext == '.ps2':
            return {CARD: source}, None
        if ext in PS2_EXPORTS:
            card, folder = ps2_card(source, work_dir, mymc)
            return {CARD: card}, folder
        raise StoreError('Per la PS2 servono un salvataggio .max, .psu, .cbs, .xps, .sps, .npo o una memory card .ps2.')
    if ext in PS2_FILES:
        raise StoreError('I salvataggi %s sono della PS2.' % ext)
    if ext in SRM_ALIASES:
        return {'salvataggio.srm': source}, None
    return {'salvataggio' + ext: source}, None
