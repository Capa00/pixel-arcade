"""Repository dei premi dei tornei (tabella ``tournament_rewards``).

Le righe restano anche dopo l'eliminazione del torneo (niente chiave esterna
sul torneo): per questo il titolo è copiato qui, per la cronologia del profilo.
"""


class TournamentRewardsRepository:
    """Premi dei tornei conclusi: XP sommati a quelli del profilo, righe della cronologia."""

    def __init__(self, db):
        self.db = db

    def add_all(self, tournament_id, title, rewards, at):
        """Scrive i premi ``rewards`` = ``[(account_id, place, xp)]`` del torneo, in una transazione."""
        with self.db.transaction() as conn:
            for account_id, place, xp in rewards:
                conn.execute('INSERT INTO tournament_rewards (account_id, tournament_id, title, place, xp, awarded_at) '
                             'VALUES (?, ?, ?, ?, ?, ?)', (account_id, tournament_id, title, place, xp, at))

    def of_tournament(self, tournament_id):
        """Premi del torneo: ``[{account, place, xp}]`` dal piazzamento migliore."""
        rows = self.db.query('SELECT account_id, place, xp FROM tournament_rewards WHERE tournament_id = ? '
                             'ORDER BY place, account_id', (tournament_id,))
        return [{'account': row[0], 'place': row[1], 'xp': row[2]} for row in rows]

    def of_account(self, account_id):
        """Premi del profilo, dal più recente: ``[{tournament, title, place, xp, at}]``."""
        rows = self.db.query('SELECT tournament_id, title, place, xp, awarded_at FROM tournament_rewards '
                             'WHERE account_id = ? ORDER BY awarded_at DESC, rowid DESC', (account_id,))
        keys = ('tournament', 'title', 'place', 'xp', 'at')
        return [dict(zip(keys, row)) for row in rows]
