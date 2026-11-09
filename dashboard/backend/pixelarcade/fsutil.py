"""Utilità per il file system."""
import os
import shutil
import tempfile


def atomic_write(path, write, mode=0o600, binary=False):
    """Scrive ``path`` in modo atomico con ``write(stream)``.

    Il contenuto va prima in un file temporaneo nella stessa cartella, poi
    viene sincronizzato su disco e sostituisce il file finale con
    ``os.replace``. In caso di errore il file temporaneo viene rimosso e il
    file originale resta invariato.
    """
    path = os.fspath(path)
    directory = os.path.dirname(os.path.abspath(path))
    fd, temp = tempfile.mkstemp(prefix='.' + os.path.basename(path) + '.', suffix='.tmp', dir=directory)
    try:
        os.fchmod(fd, mode)
        stream = os.fdopen(fd, 'wb') if binary else os.fdopen(fd, 'w', encoding='utf-8')
        with stream:
            fd = None
            write(stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    except BaseException:
        if fd is not None:
            os.close(fd)
        try:
            os.unlink(temp)
        except FileNotFoundError:
            pass
        raise


def atomic_write_text(path, text, mode=0o600):
    """Scrive ``text`` in ``path`` in modo atomico (vedi ``atomic_write``)."""
    atomic_write(path, lambda stream: stream.write(text), mode)


PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'
# Ultimo blocco di ogni PNG: lunghezza 0, «IEND» e il suo CRC.
PNG_END = b'\x00\x00\x00\x00IEND\xaeB`\x82'


def png_complete(path):
    """Vero se ``path`` è un PNG scritto per intero (firma all'inizio e blocco ``IEND`` alla fine)."""
    try:
        with open(path, 'rb') as stream:
            head = stream.read(len(PNG_SIGNATURE))
            stream.seek(0, os.SEEK_END)
            if stream.tell() < len(PNG_SIGNATURE) + len(PNG_END):
                return False
            stream.seek(-len(PNG_END), os.SEEK_END)
            tail = stream.read()
    except OSError:
        return False
    return head == PNG_SIGNATURE and tail == PNG_END


def atomic_copy(source, path, mode=0o600):
    """Copia il file ``source`` in ``path`` in modo atomico (vedi ``atomic_write``)."""
    with open(source, 'rb') as origin:
        atomic_write(path, lambda stream: shutil.copyfileobj(origin, stream), mode, binary=True)
