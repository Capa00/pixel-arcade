"""Risoluzione dello schermo su cui RetroArch apre il gioco.

RetroArch gira a schermo intero nella finestra del desktop (``video_windowed_fullscreen``),
quindi la sua area è la risoluzione attuale del display X (anche Xwayland), letta con
``xrandr --current``. Sulla console (6 novembre 2026) è 1024×768, come dice il log di
RetroArch («Using resolution 1024x768»).
"""
import logging
import re
import subprocess

log = logging.getLogger(__name__)

CURRENT = re.compile(r'current (\d+) x (\d+)')


def screen_size(run=subprocess.run):
    """``(larghezza, altezza)`` dello schermo in pixel, oppure ``None`` se non si legge."""
    try:
        result = run(['xrandr', '--current'], capture_output=True, text=True, timeout=5, check=False)
    except (OSError, subprocess.SubprocessError):
        log.warning('Risoluzione dello schermo non letta: xrandr non risponde.')
        return None
    match = CURRENT.search(result.stdout or '')
    if not match:
        log.warning('Risoluzione dello schermo non letta da xrandr.')
        return None
    width, height = int(match.group(1)), int(match.group(2))
    return (width, height) if width > 0 and height > 0 else None
