"""Connessione SQLite condivisa, transazioni e migrazioni versionate."""
import contextlib
import logging
import os
import re
import sqlite3
import threading

from ..errors import DatabaseError

log = logging.getLogger(__name__)

MIGRATIONS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'migrations')
MIGRATION_NAME = re.compile(r'^(\d{4})_[A-Za-z0-9_]+\.sql$')


def split_statements(script):
    """Divide uno script SQL in istruzioni.

    Una istruzione termina con ``;`` a fine riga. Le righe di commento
    ``--`` vengono ignorate. Le migrazioni non devono contenere trigger.
    """
    statements = []
    current = []
    for line in script.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith('--'):
            continue
        current.append(line)
        if stripped.endswith(';'):
            statements.append('\n'.join(current))
            current = []
    if current:
        statements.append('\n'.join(current))
    return statements


def list_migrations(directory=MIGRATIONS_DIR):
    """Restituisce le migrazioni come lista ordinata di ``(versione, percorso)``."""
    result = []
    for name in os.listdir(directory):
        match = MIGRATION_NAME.match(name)
        if match:
            result.append((int(match.group(1)), os.path.join(directory, name)))
    result.sort()
    versions = [version for version, _ in result]
    if len(set(versions)) != len(versions):
        raise DatabaseError('Due migrazioni hanno lo stesso numero di versione.')
    return result


class Database:
    """Connessione SQLite condivisa tra i thread e protetta da un lock."""

    def __init__(self, path, migrations_dir=MIGRATIONS_DIR):
        self.path = os.fspath(path)
        self.migrations_dir = migrations_dir
        self.lock = threading.RLock()
        # Profondità delle transazioni aperte: quelle annidate si uniscono alla più esterna.
        self.depth = 0
        try:
            self.conn = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
            self.conn.execute('PRAGMA journal_mode=WAL')
            self.conn.execute('PRAGMA foreign_keys=ON')
            self.conn.execute('PRAGMA busy_timeout=5000')
            self.conn.execute('PRAGMA synchronous=NORMAL')
        except sqlite3.Error as error:
            raise DatabaseError('Impossibile aprire il database: %s' % error)

    @contextlib.contextmanager
    def transaction(self):
        """Esegue il blocco in una transazione ``BEGIN IMMEDIATE``.

        Restituisce la connessione. Alla fine esegue il commit, oppure il
        rollback se il blocco solleva un'eccezione. Una transazione aperta
        dentro un'altra (stesso thread) si unisce a quella esterna: commit e
        rollback avvengono una volta sola, alla fine della più esterna.
        """
        with self.lock:
            if self.depth:
                self.depth += 1
                try:
                    yield self.conn
                finally:
                    self.depth -= 1
                return
            self.conn.execute('BEGIN IMMEDIATE')
            self.depth = 1
            try:
                yield self.conn
            except BaseException:
                self.depth = 0
                self.conn.execute('ROLLBACK')
                raise
            self.depth = 0
            self.conn.execute('COMMIT')

    def query(self, sql, params=()):
        """Esegue una lettura e restituisce tutte le righe."""
        with self.lock:
            return self.conn.execute(sql, params).fetchall()

    def version(self):
        """Restituisce la versione dello schema (``PRAGMA user_version``)."""
        with self.lock:
            return self.conn.execute('PRAGMA user_version').fetchone()[0]

    def migrate(self):
        """Applica in ordine le migrazioni non ancora eseguite.

        Ogni migrazione è una transazione unica insieme all'aggiornamento di
        ``user_version``. Se fallisce, viene annullata e si solleva
        ``DatabaseError``. Restituisce la versione finale.
        """
        with self.lock:
            current = self.version()
            for version, path in list_migrations(self.migrations_dir):
                if version <= current:
                    continue
                with open(path, encoding='utf-8') as stream:
                    statements = split_statements(stream.read())
                log.info('Applico la migrazione %s', os.path.basename(path))
                try:
                    with self.transaction() as conn:
                        for statement in statements:
                            conn.execute(statement)
                        conn.execute('PRAGMA user_version = %d' % version)
                except sqlite3.Error as error:
                    raise DatabaseError('Migrazione %s non riuscita: %s' % (os.path.basename(path), error))
                current = version
            return current

    def integrity_ok(self):
        """Restituisce ``True`` se ``PRAGMA integrity_check`` risponde ``ok``."""
        with self.lock:
            rows = self.conn.execute('PRAGMA integrity_check').fetchall()
        return len(rows) == 1 and rows[0][0] == 'ok'

    def close(self):
        """Chiude la connessione."""
        with self.lock:
            self.conn.close()
