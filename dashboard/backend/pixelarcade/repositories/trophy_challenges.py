"""Repository della Sfida trofeo: sfide, tentativi e avvisi visti (tabelle ``trophy_challenge*``)."""

CHALLENGE_KEYS = ('id', 'creatorId', 'system', 'game', 'title', 'core', 'achievementId', 'achievementTitle',
                  'raGameId', 'seconds', 'state', 'createdAt', 'expiresAt')
CHALLENGE_COLUMNS = ('id, creator_id, system_id, game_id, title, core, achievement_id, achievement_title, '
                     'ra_game_id, seconds, state, created_at, expires_at')


class TrophyChallengesRepository:
    """Legge e scrive le sfide; le date sono ISO in UTC, come nel resto del database."""

    def __init__(self, db):
        self.db = db

    def create(self, challenge, at):
        """Nuova sfida (``challenge`` con le chiavi di ``CHALLENGE_KEYS`` tranne ``id``) e primo tentativo del
        creatore, vinto in ``seconds``. Restituisce l'id."""
        with self.db.transaction() as conn:
            cursor = conn.execute(
                'INSERT INTO trophy_challenges (creator_id, system_id, game_id, title, core, achievement_id, '
                'achievement_title, ra_game_id, seconds, state, created_at, expires_at) '
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (challenge['creatorId'], challenge['system'], challenge['game'], challenge['title'],
                 challenge['core'], challenge['achievementId'], challenge['achievementTitle'],
                 challenge['raGameId'], challenge['seconds'], challenge['state'], challenge['createdAt'],
                 challenge['expiresAt']))
            challenge_id = cursor.lastrowid
            conn.execute('INSERT INTO trophy_challenge_runs (challenge_id, account_id, won, seconds, at) '
                         'VALUES (?, ?, 1, ?, ?)', (challenge_id, challenge['creatorId'], challenge['seconds'], at))
        return challenge_id

    def get(self, challenge_id):
        rows = self.db.query('SELECT %s FROM trophy_challenges WHERE id = ?' % CHALLENGE_COLUMNS, (challenge_id,))
        return dict(zip(CHALLENGE_KEYS, rows[0])) if rows else None

    def all(self):
        """Tutte le sfide, dalla più recente."""
        rows = self.db.query('SELECT %s FROM trophy_challenges ORDER BY created_at DESC, id DESC' % CHALLENGE_COLUMNS)
        return [dict(zip(CHALLENGE_KEYS, row)) for row in rows]

    def add_run(self, challenge_id, account_id, won, seconds, at):
        with self.db.transaction() as conn:
            conn.execute('INSERT INTO trophy_challenge_runs (challenge_id, account_id, won, seconds, at) '
                         'VALUES (?, ?, ?, ?, ?)', (challenge_id, account_id, 1 if won else 0, seconds, at))

    def runs(self):
        """Tutti i tentativi, in ordine: ``[{challenge, account, won, seconds, at}]``."""
        rows = self.db.query('SELECT challenge_id, account_id, won, seconds, at FROM trophy_challenge_runs '
                             'ORDER BY id')
        keys = ('challenge', 'account', 'won', 'seconds', 'at')
        return [dict(zip(keys, row), won=bool(row[2])) for row in rows]

    def clear_state(self, challenge_id):
        """Toglie il file dello stato (cancellato dopo la scadenza)."""
        with self.db.transaction() as conn:
            conn.execute("UPDATE trophy_challenges SET state = '' WHERE id = ?", (challenge_id,))

    def seen(self, account_id):
        """Avvisi già visti dal profilo: insieme di ``(challenge_id, kind)``."""
        rows = self.db.query('SELECT challenge_id, kind FROM trophy_challenge_seen WHERE account_id = ?',
                             (account_id,))
        return {(row[0], row[1]) for row in rows}

    def mark_seen(self, challenge_id, account_id, kind, at):
        with self.db.transaction() as conn:
            conn.execute('INSERT OR IGNORE INTO trophy_challenge_seen (challenge_id, account_id, kind, seen_at) '
                         'VALUES (?, ?, ?, ?)', (challenge_id, account_id, kind, at))
