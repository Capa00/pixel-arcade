"""Repository della sfida della settimana (tabella ``weekly_challenges``)."""


class ChallengesRepository:
    """Legge e registra il gioco estratto per ogni settimana."""

    def __init__(self, db):
        self.db = db

    def get(self, week):
        """Gioco della settimana ``week`` (data del lunedì) come ``(system_id, game_id)``, oppure ``None``."""
        rows = self.db.query('SELECT system_id, game_id FROM weekly_challenges WHERE week = ?', (week,))
        return tuple(rows[0]) if rows else None

    def add(self, week, system_id, game_id, picked_at):
        """Registra il gioco della settimana; se ce n'è già uno resta quello. Restituisce il gioco registrato."""
        with self.db.transaction() as conn:
            conn.execute('INSERT OR IGNORE INTO weekly_challenges (week, system_id, game_id, picked_at) '
                         'VALUES (?, ?, ?, ?)', (week, system_id, game_id, picked_at))
        return self.get(week)
