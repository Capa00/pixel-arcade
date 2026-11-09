"""Ricerca del core: prova in ordine i candidati e scarta quelli che falliscono in modo evidente (README §I).

Segnali dello sprint 05, calibrati sulla console il 23/09/2026 (RetroArch 1.22.2):

- il processo termina entro ``probe.window_seconds`` (contenuto rifiutato: codice 1;
  crash del core: codice 139). Il codice 0 è invece l'uscita dell'utente col
  joypad: il core resta in prova e all'uscita l'utente dice se il gioco ha
  funzionato;
- nel log compare un marcatore d'errore del core o del contenuto (``FAILURE_MARKERS``).
  FBNeo con ROM mancanti non esce: mostra un messaggio e resta aperto, quindi il
  processo va terminato;
- durante tutta la partita, ``dummy core`` nel log indica che il core ha chiuso il
  gioco e RetroArch è tornato al suo menu (``CLOSE_MARKERS``): va chiuso. Dentro la
  finestra di prova scarta anche il core. L'uscita col joypad non scrive
  questa riga.

Il log di RetroArch mescola inglese e italiano, quindi i marcatori ci sono in
entrambe le lingue. Il confronto non distingue maiuscole e minuscole.
"""
import logging
import threading
import time

from .launcher import MENU_TERMINATE_GRACE

log = logging.getLogger(__name__)

FAILURE_MARKERS = (
    'is required',
    'required files are missing',
    'cannot be run',
    'failed to load content',
    'impossibile caricare il contenuto',
)
CLOSE_MARKERS = (
    'dummy core',
)
POLL_SECONDS = 0.1


def find_marker(line, markers):
    """Vero se ``line`` contiene uno dei marcatori (senza distinguere maiuscole)."""
    lowered = line.lower()
    return any(marker in lowered for marker in markers)


class SearchStopped(Exception):
    """Ricerca interrotta dall'utente."""


class Verifier:
    """Punto di estensione della verifica del core (lo sprint 06 aggiunge rete e schermate).

    ``observe(process)`` restituisce ``'failed'``, ``'confirmed'`` o ``'unknown'``.
    """

    def observe(self, process):
        return 'unknown'


class LogVerifier(Verifier):
    """Legge il log di RetroArch riga per riga e ricorda il primo marcatore trovato."""

    def __init__(self, failure_markers=FAILURE_MARKERS, close_markers=CLOSE_MARKERS):
        self.failure_markers = failure_markers
        self.close_markers = close_markers
        self.lock = threading.Lock()
        self.failure = None
        self.closed = None

    def feed(self, line):
        """Ascoltatore del log (``RetroArchProcess.add_listener``)."""
        with self.lock:
            if self.failure is None and find_marker(line, self.failure_markers):
                self.failure = line.strip()
            if self.closed is None and find_marker(line, self.close_markers):
                self.closed = line.strip()

    def observe(self, process):
        """``'failed'`` se è comparso un marcatore d'errore, altrimenti ``'unknown'``."""
        with self.lock:
            return 'failed' if self.failure is not None else 'unknown'

    def close_line(self):
        """Riga che indica il ritorno di RetroArch al suo menu, oppure ``None``."""
        with self.lock:
            return self.closed


class ProbeResult:
    """Esito della prova di un core.

    ``result`` vale ``'trial'`` (controlli superati: ``process`` ancora
    attivo, oppure già chiuso dall'utente con ``reason`` = ``user_exit``) oppure ``'failed'`` con ``reason`` = ``exited``, ``marker``,
    ``closed`` (RetroArch tornato al suo menu) o ``stopped`` e ``detail``
    (codice di uscita o riga del log).
    """

    def __init__(self, result, process, verifier, reason=None, detail=None):
        self.result = result
        self.process = process
        self.verifier = verifier
        self.reason = reason
        self.detail = detail

    @property
    def log_tail(self):
        return self.process.log if self.process is not None else ''


def probe_one(process_factory, core, window_seconds, stop, clock=time.monotonic, wait=None):
    """Avvia il core e lo osserva per ``window_seconds``.

    ``process_factory(core)`` restituisce un ``RetroArchProcess`` non ancora
    avviato; ``stop`` è un ``threading.Event`` impostato dall'utente per
    interrompere; ``wait(secondi)`` (predefinito ``stop.wait``) scandisce i
    controlli. Con un marcatore, il ritorno al menu di RetroArch o
    un'interruzione il processo viene terminato.
    """
    wait = stop.wait if wait is None else wait
    process = process_factory(core)
    verifier = LogVerifier()
    process.add_listener(verifier.feed)
    process.start()
    started = clock()
    while True:
        if verifier.observe(process) == 'failed':
            process.terminate()
            return ProbeResult('failed', process, verifier, 'marker', verifier.failure)
        if verifier.close_line() is not None:
            log.info('Il core ha chiuso il gioco durante la prova: chiudo RetroArch.')
            process.terminate(MENU_TERMINATE_GRACE)
            return ProbeResult('failed', process, verifier, 'closed', verifier.close_line())
        code = process.returncode
        if code is not None:
            process.wait(2)
            if verifier.observe(process) == 'failed':
                return ProbeResult('failed', process, verifier, 'marker', verifier.failure)
            if code == 0:
                log.info('Uscita col joypad durante la prova: il core resta in prova.')
                return ProbeResult('trial', process, verifier, 'user_exit', code)
            return ProbeResult('failed', process, verifier, 'exited', code)
        if stop.is_set():
            process.terminate()
            return ProbeResult('failed', process, verifier, 'stopped', None)
        if clock() - started >= window_seconds:
            return ProbeResult('trial', process, verifier)
        wait(POLL_SECONDS)


def find_core(candidates, tried, prepare, probe, on_attempt=None, on_failed=None, stopped=None):
    """Prova in ordine i candidati non ancora provati e si ferma al primo che supera i controlli.

    - ``candidates``: nomi dei core nell'ordine automatico;
    - ``tried``: core già scartati per il gioco (``tried_cores``);
    - ``prepare(core)``: rende disponibile il core (download). Restituisce
      ``False`` se il core va saltato (download rifiutato o fallito, già
      registrato); può sollevare ``SearchStopped``;
    - ``probe(core)`` → ``ProbeResult``;
    - ``on_attempt(index, total, core)``: ``index`` = core già provati più uno;
    - ``on_failed(core, result)``: registra il fallimento;
    - ``stopped()``: vero se l'utente ha interrotto.

    Restituisce ``{'status': 'found', core, index, total, result}``,
    ``{'status': 'none', total}`` oppure ``{'status': 'stopped', total}``.
    """
    total = len(candidates)
    done = set(tried) & set(candidates)
    for core in candidates:
        if core in done:
            continue
        if stopped is not None and stopped():
            return {'status': 'stopped', 'total': total}
        index = len(done) + 1
        if on_attempt is not None:
            on_attempt(index, total, core)
        try:
            if not prepare(core):
                done.add(core)
                continue
        except SearchStopped:
            return {'status': 'stopped', 'total': total}
        result = probe(core)
        if result.result == 'trial':
            return {'status': 'found', 'core': core, 'index': index, 'total': total, 'result': result}
        log.info('Core %s scartato: %s %s', core, result.reason, result.detail)
        if on_failed is not None:
            on_failed(core, result)
        if result.reason == 'stopped':
            return {'status': 'stopped', 'total': total}
        done.add(core)
    return {'status': 'none', 'total': total}
