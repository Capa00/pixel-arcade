"""Repository del Wrapped: partite di un periodo e riepiloghi già visti (tabella ``wrapped_seen``)."""


class WrappedRepository:
    """Legge le partite dei profili per periodo e registra i Wrapped visti.

    Le date sono ISO in UTC, come ``sessions.ended_at``; una partita appartiene
    al periodo in cui è finita. Contano solo le partite registrate per almeno
    un profilo (``session_players``), comprese quelle dei tornei.
    """

    def __init__(self, db):
        self.db = db

    def ended_dates(self, account_id=None):
        """Fine delle partite del profilo ``account_id`` (``None`` = di tutti i profili, una volta per partita)."""
        if account_id is None:
            rows = self.db.query(
                'SELECT DISTINCT s.id, s.ended_at FROM sessions s JOIN session_players p ON p.session_id = s.id '
                'WHERE s.ended_at IS NOT NULL')
            return [row[1] for row in rows]
        rows = self.db.query(
            'SELECT s.ended_at FROM sessions s JOIN session_players p ON p.session_id = s.id '
            'WHERE p.account_id = ? AND s.ended_at IS NOT NULL', (account_id,))
        return [row[0] for row in rows]

    def players(self, since, until):
        """Profili delle partite finite tra ``since`` (incluso) e ``until`` (escluso).

        Una riga per profilo e partita: ``[{session, system, game, startedAt, endedAt, seconds, account, slot, xp}]``
        in ordine di partita.
        """
        rows = self.db.query(
            'SELECT s.id, s.system_id, s.game_id, s.started_at, s.ended_at, COALESCE(s.seconds, 0), '
            'p.account_id, p.slot, p.xp_gained '
            'FROM sessions s JOIN session_players p ON p.session_id = s.id '
            'WHERE s.ended_at >= ? AND s.ended_at < ? ORDER BY s.id, p.slot',
            (since, until))
        keys = ('session', 'system', 'game', 'startedAt', 'endedAt', 'seconds', 'account', 'slot', 'xp')
        return [dict(zip(keys, row)) for row in rows]

    def unlocks(self, since, until):
        """Trofei sbloccati nelle partite finite nel periodo: ``[{account, session, title, system, game, at}]``."""
        rows = self.db.query(
            'SELECT u.account_id, u.session_id, u.title, s.system_id, s.game_id, u.unlocked_at '
            'FROM ra_unlocks u JOIN sessions s ON s.id = u.session_id '
            'WHERE s.ended_at >= ? AND s.ended_at < ? '
            'ORDER BY u.unlocked_at, u.achievement_id',
            (since, until))
        keys = ('account', 'session', 'title', 'system', 'game', 'at')
        return [dict(zip(keys, row)) for row in rows]

    def first_plays(self):
        """Prima partita di ogni profilo con ogni gioco: ``[(account_id, system_id, game_id, ended_at)]``."""
        rows = self.db.query(
            'SELECT p.account_id, s.system_id, s.game_id, MIN(s.ended_at) '
            'FROM sessions s JOIN session_players p ON p.session_id = s.id '
            'WHERE s.ended_at IS NOT NULL GROUP BY p.account_id, s.system_id, s.game_id')
        return [tuple(row) for row in rows]

    def seen(self, account_id):
        """Periodi già visti dal profilo (0 = casa), come insieme."""
        rows = self.db.query('SELECT period FROM wrapped_seen WHERE account_id = ?', (account_id,))
        return {row[0] for row in rows}

    def mark_seen(self, account_id, period, seen_at):
        """Registra il periodo come visto; se lo era già resta la prima data."""
        with self.db.transaction() as conn:
            conn.execute('INSERT OR IGNORE INTO wrapped_seen (account_id, period, seen_at) VALUES (?, ?, ?)',
                         (account_id, period, seen_at))
