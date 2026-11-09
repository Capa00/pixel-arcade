"""Notifiche del desktop spente mentre la dashboard è aperta.

Su GNOME la modalità «Non disturbare» è la chiave ``show-banners`` dello
schema ``org.gnome.desktop.notifications``: con ``false`` i riquadri delle
notifiche (per esempio gli aggiornamenti disponibili) non compaiono sopra la
dashboard e restano solo nell'elenco delle notifiche. All'avvio
la dashboard la mette a ``false`` e annota in ``state_path`` che prima era
``true``; alla chiusura la rimette. Se la dashboard si chiude male, il file
resta e le notifiche tornano alla chiusura successiva. Se «Non disturbare»
era già attivo, la dashboard non lo tocca. Senza GNOME (``gsettings`` assente
o schema mancante) non fa nulla.
"""
import logging
import os
import shutil
import subprocess

from .fsutil import atomic_write_text

log = logging.getLogger(__name__)

SCHEMA = 'org.gnome.desktop.notifications'
KEY = 'show-banners'
TIMEOUT = 5


class Notifications:
    def __init__(self, state_path, run=subprocess.run, which=shutil.which):
        self.state_path = state_path
        self.run = run
        self.which = which

    def _gsettings(self, *args):
        """Output di ``gsettings``, oppure ``None`` se non riesce."""
        if self.which('gsettings') is None:
            return None
        try:
            result = self.run(['gsettings'] + list(args), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, timeout=TIMEOUT)
        except (OSError, subprocess.SubprocessError) as error:
            log.warning('gsettings non riuscito: %s', error)
            return None
        if result.returncode != 0:
            log.info('gsettings %s: codice %s %s', ' '.join(args), result.returncode,
                     (result.stderr or b'').decode('utf-8', 'replace').strip())
            return None
        return (result.stdout or b'').decode('utf-8', 'replace').strip()

    def mute(self):
        """Avvio della dashboard: spegne i riquadri delle notifiche, se erano accesi."""
        if os.path.exists(self.state_path):
            # Chiusura precedente non ordinata: le notifiche sono ancora spente da noi.
            self._gsettings('set', SCHEMA, KEY, 'false')
            return
        current = self._gsettings('get', SCHEMA, KEY)
        if current is None:
            log.info('Notifiche del desktop non gestite: serve GNOME (gsettings %s).', SCHEMA)
            return
        if current != 'true':
            return
        if self._gsettings('set', SCHEMA, KEY, 'false') is not None:
            atomic_write_text(self.state_path, 'true\n')
            log.info('Notifiche del desktop spente finché la dashboard è aperta.')

    def restore(self):
        """Chiusura della dashboard: riaccende i riquadri spenti da ``mute``."""
        if not os.path.exists(self.state_path):
            return
        if self._gsettings('set', SCHEMA, KEY, 'true') is None:
            return
        try:
            os.remove(self.state_path)
        except OSError:
            pass
        log.info('Notifiche del desktop riaccese.')
