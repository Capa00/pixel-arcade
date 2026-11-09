"""Repository dei BIOS copiati dalla dashboard (tabella ``bios_files``)."""

COLUMNS = ('path', 'core', 'kind', 'original', 'md5', 'size', 'addedAt')


class BiosRepository:
    """File copiati nella cartella di sistema, con il core per cui sono stati scelti."""

    def __init__(self, db):
        self.db = db

    def all(self):
        """``{path: {path, core, kind, original, md5, size, addedAt}}``."""
        rows = self.db.query('SELECT path, core, kind, original, md5, size, added_at FROM bios_files ORDER BY path')
        return {row[0]: dict(zip(COLUMNS, row)) for row in rows}

    def add(self, path, core, kind, original, md5, size, at):
        """Registra (o aggiorna) il file ``path``."""
        with self.db.transaction() as conn:
            conn.execute(
                'INSERT INTO bios_files (path, core, kind, original, md5, size, added_at) VALUES (?, ?, ?, ?, ?, ?, ?) '
                'ON CONFLICT (path) DO UPDATE SET core = excluded.core, kind = excluded.kind, '
                'original = excluded.original, md5 = excluded.md5, size = excluded.size, added_at = excluded.added_at',
                (path, core, kind, original, md5, size, at))

    def delete(self, path):
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM bios_files WHERE path = ?', (path,))
