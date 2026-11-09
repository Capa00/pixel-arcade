"""File ``--appendconfig`` di RetroArch: chiavi che la dashboard impone a ogni avvio.

Si scrivono solo le chiavi presenti nel ``retroarch.cfg`` della console, per
non introdurre nomi che la versione installata non conosce (sprint 05, Task 0:
RetroArch 1.22.2).
"""
import logging
import os
import re

from .fsutil import atomic_write_text

log = logging.getLogger(__name__)

QUIT_COMBO_KEY = 'input_quit_gamepad_combo'
# Impostazione ``input.quit_combo`` → valore dell'enumerazione di RetroArch: ``INPUT_COMBO_HOLD_START`` (START
# tenuto 2 secondi, predefinita), ``INPUT_COMBO_HOLD_SELECT`` e ``INPUT_COMBO_START_SELECT``. START+SELECT arriva
# anche al gioco ed è il reset di molti giochi PS1 (Tekken 3 torna al menu e «Riprendi» riparte da lì); START
# invece mette in pausa, e «Riprendi» riparte dalla pausa.
QUIT_COMBO_VALUES = {'hold_start': '7', 'hold_select': '8', 'start_select': '4'}
QUIT_COMBO_DEFAULT = 'hold_start'

MENU_COMBO_KEY = 'input_menu_toggle_gamepad_combo'
# Impostazione ``input.menu_combo`` → valore dell'enumerazione di RetroArch per aprire il menu rapido col
# joypad: ``INPUT_COMBO_NONE`` (0), ``INPUT_COMBO_L1_R1_START_SELECT`` (3), ``INPUT_COMBO_L1_R1`` (6),
# ``INPUT_COMBO_DOWN_SELECT`` (9) e ``INPUT_COMBO_L2_R2`` (10). Le combinazioni con L3/R3 restano fuori: il joypad
# Microntek della console non li ha.
MENU_COMBO_VALUES = {'none': '0', 'l1_r1_start_select': '3', 'l1_r1': '6', 'down_select': '9', 'l2_r2': '10'}
MENU_COMBO_DEFAULT = 'none'

LINE = re.compile(r'^\s*([A-Za-z0-9_]+)\s*=\s*"?(.*?)"?\s*$')


def retroarch_cfg_path(cores_dir):
    """``…/retroarch/cores`` → ``…/retroarch/retroarch.cfg``."""
    return os.path.join(os.path.dirname(os.path.normpath(cores_dir)), 'retroarch.cfg')


def read_known_keys(path):
    """Chiavi del ``retroarch.cfg`` con i loro valori; dizionario vuoto se il file non è leggibile."""
    result = {}
    try:
        with open(path, encoding='utf-8', errors='replace') as stream:
            for line in stream:
                if line.lstrip().startswith('#'):
                    continue
                match = LINE.match(line)
                if match:
                    result[match.group(1)] = match.group(2)
    except OSError as error:
        log.warning('retroarch.cfg non leggibile (%s): %s', path, error)
    return result


def append_options(quit_combo=QUIT_COMBO_DEFAULT, menu_combo=MENU_COMBO_DEFAULT):
    """Chiavi imposte in questo sprint, nell'ordine in cui vanno scritte.

    - la combinazione d'uscita ``quit_combo`` (``QUIT_COMBO_VALUES``, START tenuto 2 secondi se sconosciuta)
      chiude RetroArch;
    - la combinazione del menu rapido ``menu_combo`` (``MENU_COMBO_VALUES``, nessuna se sconosciuta);
    - ``auto_overrides_enable = false``: RetroArch non carica gli override di core, cartella o gioco, che
      verrebbero applicati dopo questo file e ne scavalcherebbero le chiavi (Pixel Arcade comanda su tutto);
    - ``config_save_on_exit = false``: RetroArch non salva nel suo
      ``retroarch.cfg`` i valori di questo file;
    - ``frontend_log_level = 0`` e ``libretro_log_level = 0`` (debug): nel log
      compaiono i nomi dei tasti dati dal core, che RetroArch scrive solo con
      entrambi (``controls``, 7 ottobre 2026: 235–686 righe nei primi 25 s,
      quasi tutte all'avvio);
    - ``remap_save_on_exit = false``: i remap dei giochi li scrive solo la dashboard.
    """
    return [
        (QUIT_COMBO_KEY, QUIT_COMBO_VALUES.get(quit_combo, QUIT_COMBO_VALUES[QUIT_COMBO_DEFAULT])),
        ('quit_press_twice', 'false'),
        (MENU_COMBO_KEY, MENU_COMBO_VALUES.get(menu_combo, MENU_COMBO_VALUES[MENU_COMBO_DEFAULT])),
        ('auto_overrides_enable', 'false'),
        ('config_save_on_exit', 'false'),
        ('frontend_log_level', '0'),
        ('libretro_log_level', '0'),
        ('remap_save_on_exit', 'false'),
    ]


# Joypad dei giocatori 1 e 2 di RetroArch (sprint 07).
PLAYER_PAD_KEYS = ('input_player1_joypad_index', 'input_player2_joypad_index')


def retroarch_pad(index):
    """Indice del joypad per RetroArch a partire dall'indice della Gamepad API di Chrome.

    Per ora è l'identità: va confermata sulla console (sprint 07, Task 0).
    """
    return index


def joypad_options(pads):
    """Chiavi che assegnano i joypad di P1 e P2 ai giocatori 1 e 2 di RetroArch.

    ``pads`` = ``[joypad P1 | None, joypad P2 | None]`` (indici di Chrome).
    Senza alcun joypad restituisce una lista vuota: RetroArch usa il suo
    ordine. Un giocatore senza joypad riceve il primo indice libero, così i
    due giocatori non comandano mai lo stesso joypad.
    """
    indices = [None if pad is None else retroarch_pad(pad) for pad in list(pads or [])[:2]]
    indices += [None] * (2 - len(indices))
    if all(index is None for index in indices):
        return []
    used = {index for index in indices if index is not None}
    for position, index in enumerate(indices):
        if index is None:
            free = 0
            while free in used:
                free += 1
            indices[position] = free
            used.add(free)
    return [(key, str(index)) for key, index in zip(PLAYER_PAD_KEYS, indices)]


# Controller emulato dei giocatori 1 e 2 per console: PS1 con il DualShock (517) o con il pad digitale (1),
# uguali in Beetle PSX HW e PCSX ReARMed (letti dai core installati il 29 ottobre 2026). I giochi che
# richiedono il DualShock (Ape Escape) col digitale non rispondono; Beetle tiene il DualShock sempre in
# analogico e i giochi solo digitali (Herc's Adventures, 1° novembre 2026) non rispondono a lui.
# Si sceglie col campo ``controller`` dei metadati (.ai/controller/calcola.py) o a mano dal menu «Altro»
# (``GameConfigService.controller``); senza dato ``DEFAULT_CONTROLLER``.
# RetroArch 1.22.2 legge ``input_libretro_device_pN`` solo dai remap: lo scrive ``ControlsService.ensure_device``.
SYSTEM_DEVICES = {'ps1': {'dualshock': '517', 'digital': '1'}}
DEFAULT_CONTROLLER = 'digital'


# Tasti del RetroPad presi dall'autoconfig del joypad collegato. Croce, L3 e R3
# restano al ``retroarch.cfg``: un joypad senza autoconfig (Microntek, 7 ottobre
# 2026) resterebbe senza direzioni. Le levette analogiche non si toccano.
AUTOCONFIG_BUTTONS = ('a', 'b', 'x', 'y', 'l', 'r', 'l2', 'r2', 'start', 'select')


def autoconfig_button_options(players=(1, 2)):
    """Chiavi che riportano i tasti dei giocatori all'autoconfig del joypad.

    Con ``"nul"`` RetroArch ignora il tasto scritto nel ``retroarch.cfg`` e usa
    quello dell'autoconfig: un ``retroarch.cfg`` con tasti sbagliati (Toobin',
    4 ottobre 2026: B, X e Y di P1 ruotati) non conta più. Riguarda solo i
    joypad: i tasti della tastiera (``input_player1_b`` e simili) restano.
    """
    return [('input_player%d_%s_%s' % (player, button, kind), 'nul')
            for player in players for button in AUTOCONFIG_BUTTONS for kind in ('btn', 'axis')]


def flag(value):
    return 'true' if value else 'false'


def player_options(opts):
    """Chiavi dalle preferenze del giocatore P1 (sprint 08): ``opts.vib`` → vibrazione al 100% oppure spenta.

    Lo shader CRT (``opts.crt``) non è una chiave: passa con ``--set-shader``
    (vedi ``crt_shader``), perché ``video_shader`` non compare nel ``retroarch.cfg``.
    """
    return [
        ('input_rumble_gain', '100' if opts.get('vib') else '0'),
    ]


def crt_shader(opts, path=''):
    """Shader CRT del P1: ``path`` (percorso assoluto) se ``opts.crt`` è acceso e il percorso è impostato."""
    return path if path and opts.get('crt') else None


SESSION_DIR = 'pixel-arcade-session'
# Porta UDP predefinita dei comandi di rete di RetroArch (pausa e stati, Sprint 04 dei salvataggi).
NETWORK_CMD_PORT = '55355'


def session_dir(appendconfig):
    """Cartella di sessione accanto al file ``--appendconfig``, leggibile e scrivibile dalla snap."""
    return os.path.join(os.path.dirname(os.path.abspath(appendconfig)), SESSION_DIR)


def session_options(directory, port=NETWORK_CMD_PORT):
    """Chiavi della cartella di sessione dei salvataggi (Sprint 01 dei salvataggi, RetroArch 1.22.2).

    - stati, salvataggi interni e catture (``SCREENSHOT``) nella cartella ``directory``, senza sottocartelle;
    - stato automatico all'uscita (anche con SIGTERM) e caricato all'avvio, con miniatura;
    - ``savestate_auto_index`` spento: ``SAVE_STATE`` scrive sempre nello slot attivo;
    - ``content_runtime_log`` spento: RetroArch non ricorda lo slot di ogni gioco e
      parte sempre dallo slot 0 (le partite le registra già la dashboard);
    - comandi di rete su ``127.0.0.1:<port>`` (``retroarch.network_port``, predefinita 55355).
    """
    return [
        ('savestate_directory', directory),
        ('savefile_directory', directory),
        ('screenshot_directory', directory),
        ('sort_savestates_enable', 'false'),
        ('sort_savefiles_enable', 'false'),
        ('sort_savestates_by_content_enable', 'false'),
        ('sort_savefiles_by_content_enable', 'false'),
        ('savestate_auto_save', 'true'),
        ('savestate_auto_load', 'true'),
        ('savestate_auto_index', 'false'),
        ('savestate_thumbnail_enable', 'true'),
        ('content_runtime_log', 'false'),
        ('network_cmd_enable', 'true'),
        ('network_cmd_port', str(port)),
    ]


def build_append(known_keys, options=None):
    """Testo del file: solo le chiavi presenti in ``known_keys``."""
    lines = ['# Scritto da Pixel Arcade a ogni avvio di un gioco: non modificare.']
    for key, value in options if options is not None else append_options():
        if key in known_keys:
            lines.append('%s = "%s"' % (key, value))
    return '\n'.join(lines) + '\n'


def quit_combo_supported(known_keys):
    """Vero se la versione di RetroArch ha la combinazione d'uscita col joypad."""
    return QUIT_COMBO_KEY in known_keys


def write_append(path, known_keys, options=None):
    """Scrive il file ``--appendconfig`` in modo atomico e ne restituisce il testo.

    Il file può contenere il token RetroAchievements del P1: è leggibile solo
    dal proprietario (RetroArch gira con lo stesso utente).
    """
    text = build_append(known_keys, options)
    atomic_write_text(path, text, mode=0o600)
    return text
