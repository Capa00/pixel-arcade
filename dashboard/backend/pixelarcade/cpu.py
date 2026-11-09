"""Processore al massimo durante le partite: governor ``performance`` di cpufreq.

Il governor si cambia solo da root. Lo fa lo script di sistema ``HELPER``,
che la dashboard lancia con ``sudo -n`` grazie a una regola di sudoers che
permette solo quello (installazione nel README, «Processore al massimo»).
Prima di una partita si annota in ``state_path`` il governor in uso, poi si
passa a ``performance``; a fine partita si rimette quello annotato. Se la
dashboard si chiude a metà partita, il file resta e il governor si rimette
al prossimo avvio (``off``).
"""
import logging
import os
import subprocess

from .fsutil import atomic_write_text

log = logging.getLogger(__name__)

HELPER = '/usr/local/sbin/pixelarcade-cpu'
SETTING = 'play.cpu_boost'
BOOST = 'performance'
GOVERNOR = '/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor'
SUDO_SECONDS = 10


class CpuBoost:
    def __init__(self, config, state_path, run=subprocess.run, helper=HELPER, governor_path=GOVERNOR):
        self.config = config
        self.state_path = state_path
        self.run = run
        self.helper = helper
        self.governor_path = governor_path

    def governor(self):
        """Governor del primo core, oppure ``None`` se non si legge."""
        try:
            with open(self.governor_path) as stream:
                return stream.read().strip() or None
        except OSError:
            return None

    def sudo(self, *args):
        try:
            result = self.run(['sudo', '-n'] + list(args), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                              stderr=subprocess.PIPE, timeout=SUDO_SECONDS)
        except (OSError, subprocess.SubprocessError) as error:
            log.warning('sudo non riuscito: %s', error)
            return False
        if result.returncode != 0:
            log.warning('sudo %s: codice %s %s', ' '.join(args), result.returncode,
                        (result.stderr or b'').decode('utf-8', 'replace').strip())
        return result.returncode == 0

    def ready(self):
        """Vero se lo script c'è e la regola di sudoers permette di lanciarlo senza password."""
        return os.path.isfile(self.helper) and self.sudo('-l', self.helper)

    def info(self):
        """``{ready, governor}`` per la pagina Impostazioni."""
        return {'ready': self.ready(), 'governor': self.governor()}

    def on(self):
        """Inizio partita: con l'impostazione attiva passa a ``performance`` e annota il governor di prima."""
        if not self.config.get().get(SETTING) or not os.path.isfile(self.helper):
            return
        current = self.governor()
        if current is None or current == BOOST or os.path.exists(self.state_path):
            return
        if self.sudo(self.helper, BOOST):
            atomic_write_text(self.state_path, current + '\n')
            log.info('Processore al massimo: governor da %s a %s.', current, BOOST)

    def off(self):
        """Fine partita (e avvio della dashboard): rimette il governor annotato, se c'è."""
        try:
            with open(self.state_path) as stream:
                saved = stream.read().strip()
        except OSError:
            return
        if saved and not self.sudo(self.helper, saved):
            log.warning('Governor %s non rimesso: resta %s.', saved, self.governor())
            return
        try:
            os.remove(self.state_path)
        except OSError:
            pass
        log.info('Processore di nuovo con il governor %s.', saved)
