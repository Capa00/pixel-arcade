"""Processi di RetroArch e orologio finti per i test della ricerca e del gioco."""
import os

from pixelarcade.fsutil import PNG_END, PNG_SIGNATURE


def fake_png(data=b'png'):
    """PNG finto ma completo (firma e blocco ``IEND``) con ``data`` in mezzo."""
    return PNG_SIGNATURE + data + PNG_END


class FakeClock:
    """Orologio simulato: ``wait`` fa avanzare il tempo invece di aspettare."""

    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now

    def wait(self, seconds):
        self.now += seconds
        return False


class FakeProcess:
    """RetroArch finto.

    ``lines`` vengono emesse all'avvio; ``exit_after`` sono i secondi dopo i
    quali il processo termina da solo con ``code`` (``None`` = resta attivo
    finché non viene terminato o chiuso con ``quit()``). Con ``session``
    (cartella di sessione) il processo annota in ``found`` i file presenti
    all'avvio e ci scrive ``files`` (``{nome: bytes}``), come gli stati e i
    salvataggi interni di RetroArch.
    """

    def __init__(self, clock, core, lines=(), exit_after=None, code=0, session=None, files=None):
        self.clock = clock
        self.core = core
        self.lines = list(lines)
        self.exit_after = exit_after
        self.code = code
        self.listeners = []
        self.started_at = None
        self.terminated = False
        self.grace = None
        self.forced = None
        self.text = ''
        self.session = session
        self.files = dict(files or {})
        self.found = None
        self.found_data = None

    def add_listener(self, listener):
        self.listeners.append(listener)

    def emit(self, line):
        self.text += line + '\n'
        for listener in self.listeners:
            listener(line)

    def start(self):
        self.started_at = self.clock()
        if self.session is not None:
            self.found = sorted(os.listdir(self.session))
            self.found_data = {}
            for name in self.found:
                path = os.path.join(self.session, name)
                if os.path.isfile(path):
                    with open(path, 'rb') as stream:
                        self.found_data[name] = stream.read()
            for name, data in self.files.items():
                path = os.path.join(self.session, name)
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, 'wb') as stream:
                    stream.write(data)
        for line in self.lines:
            self.emit(line)
        return self

    @property
    def log(self):
        return self.text

    @property
    def returncode(self):
        if self.forced is not None:
            return self.forced
        if self.exit_after is not None and self.clock() - self.started_at >= self.exit_after:
            return self.code
        return None

    def running(self):
        return self.returncode is None

    def wait(self, timeout=None):
        return self.returncode

    def terminate(self, grace=None):
        if self.returncode is None:
            self.terminated = True
            self.grace = grace
            self.forced = -15
        return self.returncode

    def quit(self, code=0):
        """L'utente chiude RetroArch (combinazione d'uscita)."""
        self.forced = code

    def seconds(self):
        return self.clock() - self.started_at


class FakeFactory:
    """Crea i processi finti secondo un copione per core: ``{core: dict(lines, exit_after, code)}``."""

    def __init__(self, clock, scripts):
        self.clock = clock
        self.scripts = scripts
        self.created = []

    def __call__(self, core, rom=None):
        process = FakeProcess(self.clock, core, **self.scripts.get(core, {}))
        self.created.append(process)
        return process
