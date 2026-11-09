"""Repository di RetroAchievements (tabelle ``ra_accounts``, ``ra_games``, ``ra_unlocks``)."""


class RARepository:
    """Account dei profili, gioco RetroAchievements dei file e trofei delle partite."""

    def __init__(self, db):
        self.db = db

    # --- Account -------------------------------------------------------------

    def account(self, account_id):
        """``{username, token, linkedAt}`` del profilo, oppure ``None``."""
        rows = self.db.query('SELECT username, token, linked_at FROM ra_accounts WHERE account_id = ?',
                             (account_id,))
        if not rows:
            return None
        username, token, linked_at = rows[0]
        return {'username': username, 'token': token, 'linkedAt': linked_at}

    def usernames(self):
        """Nome utente di ogni profilo collegato: ``{account_id: username}``."""
        return dict(self.db.query('SELECT account_id, username FROM ra_accounts'))

    def link(self, account_id, username, token, linked_at):
        with self.db.transaction() as conn:
            conn.execute(
                'INSERT INTO ra_accounts (account_id, username, token, linked_at) VALUES (?, ?, ?, ?) '
                'ON CONFLICT (account_id) DO UPDATE SET username = excluded.username, token = excluded.token, '
                'linked_at = excluded.linked_at',
                (account_id, username, token, linked_at))

    def unlink(self, account_id):
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM ra_accounts WHERE account_id = ?', (account_id,))

    # --- Giochi --------------------------------------------------------------

    def game(self, system_id, game_id):
        """``{hash, raGameId, title, status, source, updatedAt}`` del file, oppure ``None``."""
        rows = self.db.query('SELECT hash, ra_game_id, title, status, source, updated_at FROM ra_games '
                             'WHERE system_id = ? AND game_id = ?', (system_id, game_id))
        if not rows:
            return None
        keys = ('hash', 'raGameId', 'title', 'status', 'source', 'updatedAt')
        return dict(zip(keys, rows[0]))

    def statuses(self, system_id):
        """``{id del file: stato}`` dei file del sistema già riconosciuti (o no) da RetroAchievements."""
        rows = self.db.query('SELECT game_id, status FROM ra_games WHERE system_id = ?', (system_id,))
        return {game_id: status for game_id, status in rows}

    def games(self, system_id):
        """``{id del file: {hash, raGameId, title, status, source, updatedAt}}`` dei file del sistema."""
        rows = self.db.query('SELECT game_id, hash, ra_game_id, title, status, source, updated_at FROM ra_games '
                             'WHERE system_id = ?', (system_id,))
        keys = ('hash', 'raGameId', 'title', 'status', 'source', 'updatedAt')
        return {row[0]: dict(zip(keys, row[1:])) for row in rows}

    def set_game(self, system_id, game_id, hash_value, ra_game_id, title, status, source, updated_at):
        with self.db.transaction() as conn:
            conn.execute(
                'INSERT INTO ra_games (system_id, game_id, hash, ra_game_id, title, status, source, updated_at) '
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (system_id, game_id) DO UPDATE SET '
                'hash = excluded.hash, ra_game_id = excluded.ra_game_id, title = excluded.title, '
                'status = excluded.status, source = excluded.source, updated_at = excluded.updated_at',
                (system_id, game_id, hash_value, ra_game_id, title, status, source, updated_at))

    # --- Trofei delle partite ------------------------------------------------

    def add_unlocks(self, rows):
        """Registra i trofei: ``rows`` = ``[(session, account, achievement, title, ra_game, earner, at)]``."""
        with self.db.transaction() as conn:
            for row in rows:
                conn.execute(
                    'INSERT OR IGNORE INTO ra_unlocks (session_id, account_id, achievement_id, title, ra_game_id, '
                    'earner_id, unlocked_at) VALUES (?, ?, ?, ?, ?, ?, ?)', row)

    def unlocks(self, account_id, limit=20):
        """Ultimi trofei del profilo, dal più recente: ``[{sessionId, achievementId, title, raGameId,
        earnerId, earnerName, at, system, game}]``."""
        rows = self.db.query(
            'SELECT u.session_id, u.achievement_id, u.title, u.ra_game_id, u.earner_id, a.name, u.unlocked_at, '
            's.system_id, s.game_id FROM ra_unlocks u JOIN sessions s ON s.id = u.session_id '
            'LEFT JOIN accounts a ON a.id = u.earner_id '
            'WHERE u.account_id = ? ORDER BY u.unlocked_at DESC, u.session_id DESC, u.achievement_id LIMIT ?',
            (account_id, limit))
        keys = ('sessionId', 'achievementId', 'title', 'raGameId', 'earnerId', 'earnerName', 'at', 'system', 'game')
        return [dict(zip(keys, row)) for row in rows]
