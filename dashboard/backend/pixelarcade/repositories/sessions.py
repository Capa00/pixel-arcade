"""Repository delle partite (tabelle ``sessions`` e ``session_players``).

Le partite di torneo (``sessions.tournament_id``) contano come le altre in
statistiche, tempo per gioco, giochi già giocati e classifiche; nella
cronologia (``history``) portano il torneo.
"""


# Titolo completo del torneo della partita (come ``tournaments.full_title``), ``NULL`` se il torneo non c'è più.
FULL_TITLE = ("CASE WHEN t.id IS NULL THEN NULL ELSE COALESCE(ts.name, '') "
              "|| CASE WHEN t.edition IS NOT NULL THEN ' · ' || t.edition || 'ª edizione' ELSE '' END "
              "|| CASE WHEN COALESCE(t.title, '') != '' THEN ' — ' || t.title ELSE '' END END")

class SessionsRepository:
    """Registra le partite e i profili che le hanno giocate; ne calcola le statistiche."""

    def __init__(self, db):
        self.db = db

    def start(self, system_id, game_id, core, started_at, tournament_id=None):
        """Apre una partita e ne restituisce l'id; ``tournament_id`` per una partita di un incontro di torneo."""
        with self.db.transaction() as conn:
            cursor = conn.execute(
                'INSERT INTO sessions (system_id, game_id, core, started_at, tournament_id) VALUES (?, ?, ?, ?, ?)',
                (system_id, game_id, core, started_at, tournament_id),
            )
            return cursor.lastrowid

    def finish(self, session_id, ended_at, seconds, exit_code):
        """Chiude la partita con la durata in secondi e il codice di uscita di RetroArch."""
        with self.db.transaction() as conn:
            conn.execute('UPDATE sessions SET ended_at = ?, seconds = ?, exit_code = ? WHERE id = ?',
                         (ended_at, seconds, exit_code, session_id))

    def get(self, session_id):
        """Partita come dizionario, oppure ``None``."""
        rows = self.db.query('SELECT id, system_id, game_id, core, started_at, ended_at, seconds, exit_code '
                             'FROM sessions WHERE id = ?', (session_id,))
        if not rows:
            return None
        keys = ('id', 'system', 'game', 'core', 'startedAt', 'endedAt', 'seconds', 'exitCode')
        return dict(zip(keys, rows[0]))

    def add_players(self, session_id, players):
        """Registra i profili della partita: ``players`` = ``[(account_id, slot, xp_gained)]``, in una transazione."""
        with self.db.transaction() as conn:
            for account_id, slot, xp_gained in players:
                conn.execute('INSERT INTO session_players (session_id, account_id, slot, xp_gained) '
                             'VALUES (?, ?, ?, ?)', (session_id, account_id, slot, xp_gained))

    def stats(self, account_id):
        """Statistiche calcolate del profilo: ``{seconds, sessions, xp, played}`` (``played`` = giochi diversi).

        ``xp`` comprende i premi dei tornei (``tournament_rewards``): livello e
        titolo li contano ovunque.
        """
        rows = self.db.query(
            "SELECT COALESCE(SUM(s.seconds), 0), COUNT(*), COALESCE(SUM(p.xp_gained), 0), "
            "COUNT(DISTINCT s.system_id || '/' || s.game_id) "
            'FROM session_players p JOIN sessions s ON s.id = p.session_id '
            'WHERE p.account_id = ?',
            (account_id,))
        seconds, sessions, xp, played = rows[0]
        xp += self.db.query('SELECT COALESCE(SUM(xp), 0) FROM tournament_rewards WHERE account_id = ?',
                            (account_id,))[0][0]
        return {'seconds': seconds, 'sessions': sessions, 'xp': xp, 'played': played}

    def recent(self, account_id, limit=5):
        """Ultima partita di ogni gioco del profilo, dalla più recente: ``[{system, game, endedAt, seconds}]``."""
        rows = self.db.query(
            'SELECT s.system_id, s.game_id, s.ended_at, s.seconds '
            'FROM sessions s JOIN session_players p ON p.session_id = s.id '
            'WHERE p.account_id = ? AND s.id = ('
            '    SELECT s2.id FROM sessions s2 JOIN session_players p2 ON p2.session_id = s2.id '
            '    WHERE p2.account_id = p.account_id AND s2.system_id = s.system_id AND s2.game_id = s.game_id '
            '    ORDER BY s2.ended_at DESC, s2.id DESC LIMIT 1) '
            'ORDER BY s.ended_at DESC, s.id DESC LIMIT ?',
            (account_id, limit))
        keys = ('system', 'game', 'endedAt', 'seconds')
        return [dict(zip(keys, row)) for row in rows]

    def has_played(self, account_id, system_id, game_id):
        """Vero se il profilo ha già una partita registrata con quel gioco."""
        rows = self.db.query(
            'SELECT 1 FROM session_players p JOIN sessions s ON s.id = p.session_id '
            'WHERE p.account_id = ? AND s.system_id = ? AND s.game_id = ? LIMIT 1',
            (account_id, system_id, game_id))
        return bool(rows)

    def played_games(self, account_id):
        """Giochi con almeno una partita registrata del profilo: ``[(system_id, game_id)]``."""
        rows = self.db.query(
            'SELECT DISTINCT s.system_id, s.game_id FROM session_players p JOIN sessions s ON s.id = p.session_id '
            'WHERE p.account_id = ? ORDER BY s.system_id, s.game_id',
            (account_id,))
        return [(system_id, game_id) for system_id, game_id in rows]

    def by_system(self, account_id):
        """Tempo del profilo per console, dalla più giocata: ``[{system, seconds, sessions}]``."""
        rows = self.db.query(
            'SELECT s.system_id, COALESCE(SUM(s.seconds), 0), COUNT(*) '
            'FROM session_players p JOIN sessions s ON s.id = p.session_id '
            'WHERE p.account_id = ? '
            'GROUP BY s.system_id ORDER BY 2 DESC, s.system_id',
            (account_id,))
        keys = ('system', 'seconds', 'sessions')
        return [dict(zip(keys, row)) for row in rows]

    def top_games(self, account_id, limit=10):
        """Giochi del profilo per tempo totale: ``[{system, game, seconds, sessions, lastAt}]``."""
        rows = self.db.query(
            'SELECT s.system_id, s.game_id, COALESCE(SUM(s.seconds), 0), COUNT(*), MAX(s.ended_at) '
            'FROM session_players p JOIN sessions s ON s.id = p.session_id '
            'WHERE p.account_id = ? '
            'GROUP BY s.system_id, s.game_id ORDER BY 3 DESC, 5 DESC LIMIT ?',
            (account_id, limit))
        keys = ('system', 'game', 'seconds', 'sessions', 'lastAt')
        return [dict(zip(keys, row)) for row in rows]

    def history(self, account_id, limit=30, before=None, min_seconds=0):
        """Partite del profilo dalla più recente, lunghe almeno ``min_seconds``.

        ``before`` (id di partita) restituisce solo quelle precedenti, per
        leggere la pagina successiva. Ogni voce è ``{id, system, game,
        startedAt, endedAt, seconds, xp, slot, partners, trophies, tournament}``:
        ``partners`` sono gli id degli altri profili della partita,
        ``trophies`` i titoli dei trofei sbloccati dal profilo in quella partita,
        ``tournament`` ``{id, title}`` per una partita di torneo (``title`` è il titolo completo,
        «Serie · Nª edizione — titolo», ``None`` se il torneo non c'è più), altrimenti ``None``.
        """
        sql = ('SELECT s.id, s.system_id, s.game_id, s.started_at, s.ended_at, s.seconds, p.xp_gained, p.slot, '
               's.tournament_id, ' + FULL_TITLE + ' '
               'FROM session_players p JOIN sessions s ON s.id = p.session_id '
               'LEFT JOIN tournaments t ON t.id = s.tournament_id '
               'LEFT JOIN tournament_series ts ON ts.id = t.series_id '
               'WHERE p.account_id = ? AND COALESCE(s.seconds, 0) >= ?')
        params = [account_id, min_seconds]
        if before is not None:
            sql += ' AND s.id < ?'
            params.append(before)
        sql += ' ORDER BY s.id DESC LIMIT ?'
        params.append(limit)
        keys = ('id', 'system', 'game', 'startedAt', 'endedAt', 'seconds', 'xp', 'slot')
        result = [dict(zip(keys, row[:8]), partners=[], trophies=[],
                       tournament={'id': row[8], 'title': row[9]} if row[8] is not None else None)
                  for row in self.db.query(sql, params)]
        if not result:
            return result
        by_id = {item['id']: item for item in result}
        marks = ', '.join('?' * len(by_id))
        ids = list(by_id)
        for session_id, partner in self.db.query(
                'SELECT session_id, account_id FROM session_players '
                'WHERE session_id IN (%s) AND account_id != ? ORDER BY slot' % marks, ids + [account_id]):
            by_id[session_id]['partners'].append(partner)
        for session_id, title in self.db.query(
                'SELECT session_id, title FROM ra_unlocks '
                'WHERE session_id IN (%s) AND account_id = ? ORDER BY unlocked_at, achievement_id' % marks,
                ids + [account_id]):
            by_id[session_id]['trophies'].append(title)
        return result

    def played_by_anyone(self):
        """Giochi con almeno una partita registrata di un profilo: ``[(system_id, game_id)]`` in ordine."""
        rows = self.db.query(
            'SELECT DISTINCT s.system_id, s.game_id FROM session_players p JOIN sessions s ON s.id = p.session_id '
            'ORDER BY s.system_id, s.game_id')
        return [(system_id, game_id) for system_id, game_id in rows]

    def game_time(self, system_id, game_id, since, until):
        """Tempo dei profili sul gioco nelle partite finite tra ``since`` (incluso) e ``until`` (escluso).

        Le date sono ISO in UTC, come ``ended_at``. Restituisce ``[{account, seconds}]`` dal tempo più alto.
        """
        rows = self.db.query(
            'SELECT p.account_id, COALESCE(SUM(s.seconds), 0) '
            'FROM session_players p JOIN sessions s ON s.id = p.session_id '
            'WHERE s.system_id = ? AND s.game_id = ? AND s.ended_at >= ? AND s.ended_at < ? '
            'GROUP BY p.account_id HAVING SUM(s.seconds) > 0 ORDER BY 2 DESC, MIN(s.ended_at), p.account_id',
            (system_id, game_id, since, until))
        return [{'account': account_id, 'seconds': seconds} for account_id, seconds in rows]

    def game_seconds_by_account(self, system_id, game_id, account_ids):
        """Tempo di ogni profilo di ``account_ids`` sul gioco, senza le partite di torneo: ``{account: secondi}``.

        I profili senza partite valgono 0.
        """
        result = {account_id: 0 for account_id in account_ids}
        if not result:
            return result
        marks = ', '.join('?' * len(result))
        rows = self.db.query(
            'SELECT p.account_id, COALESCE(SUM(s.seconds), 0) '
            'FROM session_players p JOIN sessions s ON s.id = p.session_id '
            'WHERE s.system_id = ? AND s.game_id = ? AND p.account_id IN (%s) '
            'GROUP BY p.account_id' % marks,
            [system_id, game_id] + list(result))
        for account_id, seconds in rows:
            result[account_id] = seconds
        return result

    def house_top_games(self, limit=3):
        """Giochi con più tempo dei profili, sommato: ``[{system, game, seconds, players}]``.

        Una partita in due conta per entrambi i profili; ``players`` è il numero di profili diversi.
        """
        rows = self.db.query(
            'SELECT s.system_id, s.game_id, COALESCE(SUM(s.seconds), 0), COUNT(DISTINCT p.account_id) '
            'FROM session_players p JOIN sessions s ON s.id = p.session_id '
            'GROUP BY s.system_id, s.game_id HAVING SUM(s.seconds) > 0 ORDER BY 3 DESC, MAX(s.ended_at) DESC LIMIT ?',
            (limit,))
        keys = ('system', 'game', 'seconds', 'players')
        return [dict(zip(keys, row)) for row in rows]
