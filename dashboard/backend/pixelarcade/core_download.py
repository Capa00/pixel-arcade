"""Download dei core mancanti dal buildbot libretro, come l'Online Updater di RetroArch.

Il file ``<buildbot_url><core>_libretro.so.zip`` viene scaricato in un file
temporaneo nella cartella dati, controllato ed estratto nella cartella dei
core con una scrittura atomica. Un core già presente non viene mai
sovrascritto.
"""
import logging
import os
import tempfile
import urllib.error
import urllib.request
import zipfile

from .config import CORE_SUFFIX, is_core_name
from .errors import LaunchError

log = logging.getLogger(__name__)

MAX_BYTES = 1024 * 1024 * 1024
CHUNK = 64 * 1024
TIMEOUT = 30
# Sopra questa dimensione si chiede conferma prima di scaricare.
CONFIRM_BYTES = 50 * 1000 * 1000


class DownloadCancelled(Exception):
    """Download interrotto dall'utente."""


def core_url(base_url, core):
    """Indirizzo dello zip del core sul buildbot."""
    return base_url + core + CORE_SUFFIX + '.zip'


def remove_quietly(path):
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


class CoreDownloader:
    """Scarica i core nella cartella ``paths.cores``.

    ``config`` fornisce ``get()`` (per ``cores.buildbot_url``) e
    ``resolve_path('paths.cores')``; ``temp_dir`` è la cartella dati;
    ``cores_repo`` registra i core scaricati; ``opener`` sostituisce
    ``urllib.request.urlopen`` nei test.
    """

    def __init__(self, config, cores_repo, temp_dir, opener=urllib.request.urlopen):
        self.config = config
        self.cores = cores_repo
        self.temp_dir = temp_dir
        self.opener = opener

    def url(self, core):
        return core_url(self.config.get()['cores.buildbot_url'], core)

    def size(self, core):
        """Dimensione dello zip (``Content-Length`` di una richiesta ``HEAD``), oppure ``None`` se non nota."""
        request = urllib.request.Request(self.url(core), method='HEAD')
        try:
            with self.opener(request, timeout=TIMEOUT) as response:
                value = response.headers.get('Content-Length')
        except (urllib.error.URLError, OSError, ValueError) as error:
            log.warning('Dimensione di %s non disponibile: %s', core, error)
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def download(self, core, on_progress=None, cancel=None):
        """Scarica ed estrae il core; restituisce il percorso del file ``.so``.

        ``on_progress(bytes, total)`` riceve l'avanzamento (``total`` può
        essere ``None``); ``cancel()`` vero interrompe con
        ``DownloadCancelled``. Solleva ``LaunchError`` se il download o il
        file non sono validi. In ogni caso non resta nessun file parziale.
        """
        if not is_core_name(core):
            raise LaunchError('Nome del core non valido: %s.' % core)
        folder = self.config.resolve_path('paths.cores')
        if not folder or not os.path.isdir(folder):
            raise LaunchError('La cartella dei core non esiste: %s.' % (folder or '(non impostata)'))
        target = os.path.join(folder, core + CORE_SUFFIX)
        if os.path.lexists(target):
            return target
        os.makedirs(self.temp_dir, exist_ok=True)
        fd, archive = tempfile.mkstemp(prefix='.core-', suffix='.zip', dir=self.temp_dir)
        try:
            with os.fdopen(fd, 'wb') as stream:
                size = self.fetch(core, stream, on_progress, cancel)
            self.extract(core, archive, target)
        finally:
            remove_quietly(archive)
        self.cores.add_downloaded(core, size)
        log.info('Core scaricato: %s (%d byte)', core, size)
        return target

    def unused(self):
        """Core scaricati dalla dashboard che nessun gioco usa (``ok`` o ``trial``): ``[{name, size}]``.

        Si elencano solo quelli ancora presenti nella cartella dei core; i core
        installati da RetroArch non sono mai in ``downloaded_cores``.
        """
        folder = self.config.resolve_path('paths.cores')
        result = []
        for core, size in self.cores.unused_downloaded().items():
            path = os.path.join(folder, core + CORE_SUFFIX) if folder else ''
            if path and os.path.isfile(path) and not os.path.islink(path):
                result.append({'name': core, 'size': os.path.getsize(path)})
        return result

    def delete_unused(self):
        """Cancella i core di ``unused()`` e li toglie dall'elenco dei core scaricati."""
        folder = self.config.resolve_path('paths.cores')
        for core in self.unused():
            remove_quietly(os.path.join(folder, core['name'] + CORE_SUFFIX))
            self.cores.remove_downloaded(core['name'])
            log.info('Core inutilizzato eliminato: %s', core['name'])

    def fetch(self, core, stream, on_progress, cancel):
        """Scrive lo zip in ``stream`` e ne restituisce la dimensione."""
        address = self.url(core)
        try:
            with self.opener(address, timeout=TIMEOUT) as response:
                total = response.headers.get('Content-Length') if getattr(response, 'headers', None) else None
                total = int(total) if total and str(total).isdigit() else None
                if total is not None and total > MAX_BYTES:
                    raise LaunchError('Il core %s è troppo grande (oltre 1 GiB).' % core)
                received = 0
                while True:
                    if cancel is not None and cancel():
                        raise DownloadCancelled()
                    chunk = response.read(CHUNK)
                    if not chunk:
                        break
                    received += len(chunk)
                    if received > MAX_BYTES:
                        raise LaunchError('Il core %s è troppo grande (oltre 1 GiB).' % core)
                    stream.write(chunk)
                    if on_progress is not None:
                        on_progress(received, total)
        except (urllib.error.URLError, OSError, ValueError) as error:
            reason = getattr(error, 'reason', error)
            raise LaunchError('Download di %s non riuscito: %s.' % (core, reason))
        if total is not None and received != total:
            raise LaunchError('Download di %s incompleto.' % core)
        return received

    def extract(self, core, archive, target):
        """Estrae ``<core>_libretro.so`` dallo zip in ``target`` con una scrittura atomica."""
        name = core + CORE_SUFFIX
        try:
            with zipfile.ZipFile(archive) as bundle:
                members = [info for info in bundle.infolist() if not info.is_dir()]
                if len(members) != 1 or members[0].filename != name:
                    raise LaunchError('Il file scaricato per %s non contiene solo %s.' % (core, name))
                member = members[0]
                if member.file_size > MAX_BYTES:
                    raise LaunchError('Il core %s è troppo grande (oltre 1 GiB).' % core)
                folder = os.path.dirname(target)
                fd, temp = tempfile.mkstemp(prefix='.' + name + '.', suffix='.tmp', dir=folder)
                try:
                    with os.fdopen(fd, 'wb') as out, bundle.open(member) as source:
                        written = 0
                        while True:
                            chunk = source.read(CHUNK)
                            if not chunk:
                                break
                            written += len(chunk)
                            if written > MAX_BYTES:
                                raise LaunchError('Il core %s è troppo grande (oltre 1 GiB).' % core)
                            out.write(chunk)
                        out.flush()
                        os.fsync(out.fileno())
                    os.chmod(temp, 0o644)
                    if os.path.lexists(target):
                        raise LaunchError('Il core %s è già presente.' % core)
                    os.replace(temp, target)
                except BaseException:
                    remove_quietly(temp)
                    raise
        except (zipfile.BadZipFile, zipfile.LargeZipFile, OSError, RuntimeError) as error:
            raise LaunchError('Il file scaricato per %s non è valido: %s.' % (core, error))
