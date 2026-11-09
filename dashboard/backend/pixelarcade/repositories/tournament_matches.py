"""Repository degli incontri dei tornei (tabelle ``tournament_matches`` e ``tournament_games``).

Gli incontri sono dizionari con le chiavi di ``FIELDS``. ``fromA``/``fromB``
sono ``winner:<id>`` o ``loser:<id>`` dell'incontro da cui arriva il
giocatore. Le partite sono ``{gameNo, winnerId, sideA, scoreA, scoreB,
sessionId, declaredAt}``.
"""

# Colonne della tabella e chiavi dei dizionari, nello stesso ordine.
FIELDS = (
    ('id', 'id'),
    ('tournament_id', 'tournamentId'),
    ('stage', 'stage'),
    ('group_no', 'groupNo'),
    ('bracket', 'bracket'),
    ('round', 'round'),
    ('slot', 'slot'),
    ('play_order', 'playOrder'),
    ('player_a', 'playerA'),
    ('player_b', 'playerB'),
    ('from_a', 'fromA'),
    ('from_b', 'fromB'),
    ('series', 'series'),
    ('status', 'status'),
    ('winner_id', 'winnerId'),
    ('walkover', 'walkover'),
    ('bye', 'bye'),
    ('started_at', 'startedAt'),
    ('finished_at', 'finishedAt'),
)
COLUMNS = ', '.join(column for column, _ in FIELDS)
KEYS = tuple(key for _, key in FIELDS)
COLUMN_OF = {key: column for column, key in FIELDS}
BOOLEANS = ('walkover', 'bye')
GAME_FIELDS = (
    ('game_no', 'gameNo'),
    ('winner_id', 'winnerId'),
    ('side_a', 'sideA'),
    ('score_a', 'scoreA'),
    ('score_b', 'scoreB'),
    ('session_id', 'sessionId'),
    ('declared_at', 'declaredAt'),
)
GAME_COLUMNS = ', '.join(column for column, _ in GAME_FIELDS)
GAME_KEYS = tuple(key for _, key in GAME_FIELDS)
# Colonne scritte da ``create_all`` (dalle chiavi di ``tournament_formats``, tranne ``from_a``/``from_b``).
INSERT_COLUMNS = ('stage', 'group_no', 'bracket', 'round', 'slot', 'play_order', 'player_a', 'player_b',
                  'series', 'status', 'winner_id', 'walkover', 'bye')


def row_dict(row):
    item = dict(zip(KEYS, row))
    for key in BOOLEANS:
        item[key] = bool(item[key])
    return item


def resolve_source(source, ids):
    """``winner:<chiave>`` → ``winner:<id>`` con gli id appena inseriti; vuoto resta vuoto."""
    if not source:
        return None
    kind, key = source.split(':', 1)
    return '%s:%d' % (kind, ids[key])


class TournamentMatchesRepository:
    """Legge e scrive incontri e partite; le date sono ISO in UTC, come nel resto del database."""

    def __init__(self, db):
        self.db = db

    def create_all(self, tournament_id, matches):
        """Inserisce gli incontri di ``tournament_formats`` (con ``key`` locali) in una transazione.

        ``from_a``/``from_b`` che puntano alle chiavi diventano ``winner:<id>``
        o ``loser:<id>``. Restituisce ``{chiave: id}``.
        """
        ids = {}
        with self.db.transaction() as conn:
            for match in matches:
                values = [match.get(column) for column in INSERT_COLUMNS]
                cursor = conn.execute(
                    'INSERT INTO tournament_matches (tournament_id, %s) VALUES (?, %s)'
                    % (', '.join(INSERT_COLUMNS), ', '.join('?' * len(INSERT_COLUMNS))),
                    [tournament_id] + [int(value) if isinstance(value, bool) else value for value in values])
                ids[match['key']] = cursor.lastrowid
            for match in matches:
                if match.get('from_a') or match.get('from_b'):
                    conn.execute('UPDATE tournament_matches SET from_a = ?, from_b = ? WHERE id = ?',
                                 (resolve_source(match.get('from_a'), ids), resolve_source(match.get('from_b'), ids),
                                  ids[match['key']]))
        return ids

    def list(self, tournament_id):
        """Incontri del torneo in ordine di fase, tabellone, turno e casella."""
        rows = self.db.query(
            "SELECT %s FROM tournament_matches WHERE tournament_id = ? "
            "ORDER BY stage, CASE bracket WHEN 'third' THEN 1 ELSE 0 END, round, slot, id" % COLUMNS,
            (tournament_id,))
        return [row_dict(row) for row in rows]

    def get(self, match_id):
        rows = self.db.query('SELECT %s FROM tournament_matches WHERE id = ?' % COLUMNS, (match_id,))
        return row_dict(rows[0]) if rows else None

    def update(self, match_id, **fields):
        """Aggiorna i campi ``fields`` (chiavi dei dizionari, tranne ``id``)."""
        keys = [key for key in fields if key != 'id']
        if not keys:
            return
        params = [int(fields[key]) if key in BOOLEANS else fields[key] for key in keys]
        assignments = ', '.join('%s = ?' % COLUMN_OF[key] for key in keys)
        with self.db.transaction() as conn:
            conn.execute('UPDATE tournament_matches SET %s WHERE id = ?' % assignments, params + [match_id])

    def delete_many(self, match_ids):
        """Cancella gli incontri ``match_ids`` (con le loro partite)."""
        if not match_ids:
            return
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM tournament_matches WHERE id IN (%s)' % ', '.join('?' * len(match_ids)),
                         list(match_ids))

    # --- Partite ---------------------------------------------------------------------

    def games(self, match_id):
        """Partite dell'incontro in ordine."""
        rows = self.db.query('SELECT %s FROM tournament_games WHERE match_id = ? ORDER BY game_no' % GAME_COLUMNS,
                             (match_id,))
        return [dict(zip(GAME_KEYS, row)) for row in rows]

    def games_of(self, tournament_id):
        """Partite di tutti gli incontri del torneo: ``{match_id: [partite]}``."""
        rows = self.db.query(
            'SELECT g.match_id, %s FROM tournament_games g JOIN tournament_matches m ON m.id = g.match_id '
            'WHERE m.tournament_id = ? ORDER BY g.match_id, g.game_no'
            % ', '.join('g.' + column for column, _ in GAME_FIELDS), (tournament_id,))
        result = {}
        for row in rows:
            result.setdefault(row[0], []).append(dict(zip(GAME_KEYS, row[1:])))
        return result

    def add_game(self, match_id, winner_id, side_a, declared_at, score_a=None, score_b=None, session_id=None):
        """Aggiunge la partita successiva dell'incontro; restituisce il suo numero (da 1)."""
        with self.db.transaction() as conn:
            game_no = conn.execute('SELECT COALESCE(MAX(game_no), 0) + 1 FROM tournament_games WHERE match_id = ?',
                                   (match_id,)).fetchone()[0]
            conn.execute('INSERT INTO tournament_games (match_id, game_no, winner_id, side_a, score_a, score_b, '
                         'session_id, declared_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                         (match_id, game_no, winner_id, side_a, score_a, score_b, session_id, declared_at))
            return game_no

    def delete_last_game(self, match_id):
        """Toglie l'ultima partita dell'incontro; ``False`` se non ce n'erano."""
        with self.db.transaction() as conn:
            cursor = conn.execute(
                'DELETE FROM tournament_games WHERE match_id = ? AND game_no = '
                '(SELECT MAX(game_no) FROM tournament_games WHERE match_id = ?)', (match_id, match_id))
            return cursor.rowcount > 0

    # --- Teste di serie --------------------------------------------------------------

    def set_seeds(self, tournament_id, seeds):
        """Scrive le teste di serie degli iscritti: ``seeds`` = ``{account: seed}``."""
        with self.db.transaction() as conn:
            for account_id, seed in seeds.items():
                conn.execute('UPDATE tournament_players SET seed = ? WHERE tournament_id = ? AND account_id = ?',
                             (seed, tournament_id, account_id))
