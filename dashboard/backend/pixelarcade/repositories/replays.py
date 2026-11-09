"""Repository degli spezzoni del salvaschermo (tabella ``replays``)."""

KEYS = ('id', 'account', 'system', 'game', 'core', 'file', 'size', 'seconds', 'trophy', 'recordedAt')
COLUMNS = 'id, account_id, system_id, game_id, core, file, size, seconds, trophy, recorded_at'


class ReplaysRepository:
    """Coda degli spezzoni di tutta la casa; le date sono ISO in UTC."""

    def __init__(self, db):
        self.db = db

    def all(self):
        """Tutti gli spezzoni, dal più vecchio."""
        rows = self.db.query('SELECT %s FROM replays ORDER BY id' % COLUMNS)
        return [dict(zip(KEYS, row)) for row in rows]

    def get(self, replay_id):
        rows = self.db.query('SELECT %s FROM replays WHERE id = ?' % COLUMNS, (replay_id,))
        return dict(zip(KEYS, rows[0])) if rows else None

    def add(self, replay):
        """Aggiunge lo spezzone in fondo alla coda e ne restituisce l'``id``."""
        with self.db.transaction() as conn:
            cursor = conn.execute(
                'INSERT INTO replays (%s) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)' % COLUMNS.split(', ', 1)[1],
                tuple(replay[key] for key in KEYS[1:]))
            return cursor.lastrowid

    def delete(self, replay_id):
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM replays WHERE id = ?', (replay_id,))
