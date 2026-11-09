"""Processo di RetroArch: avvio, lettura del log riga per riga e chiusura.

Qui non c'è logica di ricerca del core: la usa ``core_probe``.
"""
import logging
import os
import subprocess
import threading
import time

log = logging.getLogger(__name__)

MAX_LOG = 16000
TERMINATE_GRACE = 5
MENU_TERMINATE_GRACE = 1


def retroarch_args(command, core_path, rom_path, append_path, shader=None, extra=None):
    """Riga di comando: ``[*command, --verbose, --fullscreen, -L core, --appendconfig file, --set-shader file, rom]``.

    ``rom_path = None`` avvia il core senza contenuto (giochi libretro, sprint 05b).
    ``shader`` (facoltativo) scavalca anche i preset automatici degli shader.
    ``extra`` sono opzioni in più prima del gioco (per esempio ``-P <replay>`` del salvaschermo).
    """
    args = list(command) + ['--verbose', '--fullscreen', '-L', core_path]
    if append_path:
        args += ['--appendconfig', append_path]
    if shader:
        args += ['--set-shader', shader]
    args += list(extra or [])
    if rom_path is not None:
        args.append(rom_path)
    return args


class RetroArchProcess:
    """Un avvio di RetroArch con il suo log.

    ``popen`` e ``clock`` sono sostituibili nei test. Gli ascoltatori
    aggiunti con ``add_listener`` ricevono ogni riga del log (senza il
    ritorno a capo) dal thread di lettura.
    """

    def __init__(self, command, core_path, rom_path, append_path, clock=time.monotonic, popen=subprocess.Popen,
                 shader=None, extra=None):
        self.args = retroarch_args(command, core_path, rom_path, append_path, shader, extra)
        self.clock = clock
        self.popen = popen
        self.child = None
        self.reader = None
        self.lock = threading.Lock()
        self.listeners = []
        self.text = ''
        self.started_at = None

    def add_listener(self, listener):
        """Aggiunge una funzione ``listener(riga)`` chiamata per ogni riga del log."""
        with self.lock:
            self.listeners.append(listener)

    def start(self):
        """Avvia RetroArch nella cartella home, con stdout e stderr uniti nel log."""
        log.info('Avvio RetroArch: %s', ' '.join(self.args))
        self.child = self.popen(self.args, cwd=os.path.expanduser('~'), stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        self.started_at = self.clock()
        self.reader = threading.Thread(target=self.read, name='retroarch-log', daemon=True)
        self.reader.start()
        return self

    def read(self):
        """Legge il log riga per riga finché RetroArch non chiude l'uscita."""
        stream = self.child.stdout
        try:
            for raw in iter(stream.readline, b''):
                line = raw.decode('utf-8', errors='replace').rstrip('\r\n')
                with self.lock:
                    self.text = (self.text + line + '\n')[-MAX_LOG:]
                    listeners = list(self.listeners)
                for listener in listeners:
                    try:
                        listener(line)
                    except Exception:
                        log.exception('Errore in un ascoltatore del log di RetroArch')
        except (OSError, ValueError):
            pass
        finally:
            try:
                stream.close()
            except OSError:
                pass

    @property
    def log(self):
        """Ultimi 16 000 caratteri del log."""
        with self.lock:
            return self.text

    @property
    def returncode(self):
        """Codice di uscita, oppure ``None`` se RetroArch è ancora attivo."""
        return self.child.poll() if self.child is not None else None

    def running(self):
        """Vero finché il processo è attivo."""
        return self.child is not None and self.child.poll() is None

    def wait(self, timeout=None):
        """Aspetta la fine del processo; restituisce il codice di uscita o ``None`` allo scadere del tempo.

        Alla fine aspetta anche il thread di lettura, così il log è completo.
        """
        try:
            code = self.child.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            return None
        if self.reader is not None:
            self.reader.join(timeout=2)
        return code

    def terminate(self, grace=None):
        """Chiude RetroArch: ``terminate``, poi ``kill`` se non esce entro ``grace`` secondi (predefiniti 5).

        Con RetroArch già tornato al suo menu non c'è una partita da salvare:
        si usa ``MENU_TERMINATE_GRACE`` per non lasciarlo a lungo sullo schermo.
        """
        grace = TERMINATE_GRACE if grace is None else grace
        if not self.running():
            return self.wait()
        self.child.terminate()
        code = self.wait(grace)
        if code is None:
            log.warning('RetroArch non si è chiuso entro %s secondi: lo termino forzatamente.', grace)
            self.child.kill()
            code = self.wait()
        return code

    def seconds(self):
        """Secondi trascorsi dall'avvio."""
        return 0 if self.started_at is None else self.clock() - self.started_at
