"""Repository dei tornei (tabelle ``tournaments``, ``tournament_series`` e ``tournament_players``)."""

import json

# Colonne della tabella e chiavi dei dizionari, nello stesso ordine.
FIELDS = (
    ('id', 'id'),
    ('creator_id', 'creatorId'),
    ('status', 'status'),
    ('title', 'title'),
    ('description', 'description'),
    ('starts_at', 'startsAt'),
    ('system_id', 'system'),
    ('game_id', 'game'),
    ('core', 'core'),
    ('state', 'state'),
    ('max_players', 'maxPlayers'),
    ('round_series', 'roundSeries'),
    ('final_series', 'finalSeries'),
    ('third_place', 'thirdPlace'),
    ('saves_locked', 'savesLocked'),
    ('sides', 'sides'),
    ('rewards', 'rewards'),
    ('combo_hash', 'comboHash'),
    ('created_at', 'createdAt'),
    ('updated_at', 'updatedAt'),
    ('published_at', 'publishedAt'),
    ('registration_closed', 'registrationClosed'),
    ('format', 'format'),
    ('options', 'options'),
    ('seeding', 'seeding'),
    ('seeding_weight', 'seedingWeight'),
    ('advantaged_side', 'advantagedSide'),
    ('started_at', 'startedAt'),
    ('finished_at', 'finishedAt'),
    ('start_draft', 'startDraft'),
    ('series_id', 'seriesId'),
    ('edition', 'edition'),
    ('addons', 'addons'),
)
# Campi letti dalla serie: la combinazione vale per tutte le edizioni (quella del torneo non si usa più).
SERIES_FIELDS = (('s.name', 'seriesName'), ('s.description', 'seriesDescription'))
COLUMNS = ', '.join('s.combo_hash' if column == 'combo_hash' else 't.' + column for column, _ in FIELDS) + \
    ', ' + ', '.join(column for column, _ in SERIES_FIELDS)
SOURCE = 'tournaments t LEFT JOIN tournament_series s ON s.id = t.series_id'
KEYS = tuple(key for _, key in FIELDS) + tuple(key for _, key in SERIES_FIELDS)
COLUMN_OF = {key: column for column, key in FIELDS if key != 'comboHash'}
# Campi della serie modificabili.
SERIES_COLUMN_OF = {'name': 'name', 'description': 'description', 'comboHash': 'combo_hash'}
BOOLEANS = ('thirdPlace', 'savesLocked', 'rewards', 'registrationClosed')
# Campi salvati come JSON.
JSON_FIELDS = ('options', 'addons')
# Stati di un torneo non concluso.
ACTIVE = ('draft', 'open', 'running')


def row_dict(row):
    item = dict(zip(KEYS, row))
    item['comboHash'] = item['comboHash'] or ''
    item['seriesName'] = item['seriesName'] or ''
    item['seriesDescription'] = item['seriesDescription'] or ''
    for key in BOOLEANS:
        item[key] = bool(item[key])
    for key in JSON_FIELDS:
        try:
            item[key] = json.loads(item[key] or '{}')
        except ValueError:
            item[key] = {}
        if not isinstance(item[key], dict):
            item[key] = {}
    # Bozza dell'avvio: ``None`` se non c'è o non si legge.
    try:
        draft = json.loads(item['startDraft']) if item['startDraft'] else None
    except ValueError:
        draft = None
    item['startDraft'] = draft if isinstance(draft, dict) else None
    return item


def column_value(key, value):
    if key in BOOLEANS:
        return int(value)
    if key in JSON_FIELDS:
        return json.dumps(value, sort_keys=True)
    if key == 'startDraft':
        return json.dumps(value, sort_keys=True) if value else ''
    return value


class TournamentsRepository:
    """Legge e scrive i tornei; le date sono ISO in UTC, come nel resto del database."""

    def __init__(self, db):
        self.db = db

    def create(self, creator_id, name, at):
        """Nuova serie con la 1ª edizione in bozza, con i valori predefiniti; restituisce l'id dell'edizione."""
        with self.db.transaction() as conn:
            series_id = conn.execute(
                'INSERT INTO tournament_series (creator_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
                (creator_id, name, at, at)).lastrowid
            cursor = conn.execute(
                "INSERT INTO tournaments (creator_id, status, title, created_at, updated_at, series_id, edition) "
                "VALUES (?, 'draft', '', ?, ?, ?, 1)", (creator_id, at, at, series_id))
            return cursor.lastrowid

    def create_edition(self, series_id, creator_id, values, at):
        """Nuova edizione in bozza della serie con i campi ``values`` (chiavi dei dizionari); restituisce l'id.

        Il numero è il più alto tra le edizioni non annullate + 1, nella stessa transazione.
        """
        values = dict(values, creatorId=creator_id, status='draft', title='', createdAt=at, updatedAt=at,
                      seriesId=series_id)
        keys = [key for key in values if key in COLUMN_OF and key != 'id']
        with self.db.transaction() as conn:
            last = conn.execute("SELECT MAX(edition) FROM tournaments WHERE series_id = ? AND status != 'cancelled'",
                                (series_id,)).fetchone()[0]
            columns = [COLUMN_OF[key] for key in keys] + ['edition']
            params = [column_value(key, values[key]) for key in keys] + [(last or 0) + 1]
            cursor = conn.execute('INSERT INTO tournaments (%s) VALUES (%s)'
                                  % (', '.join(columns), ', '.join('?' * len(columns))), params)
            return cursor.lastrowid

    def get(self, tournament_id):
        rows = self.db.query('SELECT %s FROM %s WHERE t.id = ?' % (COLUMNS, SOURCE), (tournament_id,))
        return row_dict(rows[0]) if rows else None

    def active(self):
        """Tornei non conclusi (bozze, iscrizioni o in corso), dal più recente."""
        rows = self.db.query('SELECT %s FROM %s WHERE t.status IN (?, ?, ?) ORDER BY t.id DESC'
                             % (COLUMNS, SOURCE), ACTIVE)
        return [row_dict(row) for row in rows]

    def history(self):
        """Tornei conclusi o annullati, dal più recente (fine del torneo o annullamento)."""
        rows = self.db.query("SELECT %s FROM %s WHERE t.status IN ('done', 'cancelled') "
                             "ORDER BY COALESCE(t.finished_at, t.updated_at) DESC, t.id DESC" % (COLUMNS, SOURCE))
        return [row_dict(row) for row in rows]

    def editions(self, series_id):
        """Edizioni della serie, dalla più recente."""
        rows = self.db.query('SELECT %s FROM %s WHERE t.series_id = ? ORDER BY t.id DESC' % (COLUMNS, SOURCE),
                             (series_id,))
        return [row_dict(row) for row in rows]

    # --- Serie -----------------------------------------------------------------------

    def series(self, series_id):
        """Serie ``{id, creatorId, name, description, comboHash, createdAt}`` oppure ``None``."""
        rows = self.db.query('SELECT id, creator_id, name, description, combo_hash, created_at FROM tournament_series '
                             'WHERE id = ?', (series_id,))
        keys = ('id', 'creatorId', 'name', 'description', 'comboHash', 'createdAt')
        return dict(zip(keys, rows[0])) if rows else None

    def all_series(self):
        """Tutte le serie, dalla più recente (ultima edizione creata)."""
        rows = self.db.query('SELECT s.id FROM tournament_series s LEFT JOIN tournaments t ON t.series_id = s.id '
                             'GROUP BY s.id ORDER BY MAX(COALESCE(t.id, 0)) DESC, s.id DESC')
        return [self.series(row[0]) for row in rows]

    def update_series(self, series_id, values, at):
        """Aggiorna nome, descrizione o impronta della combinazione (``name``, ``description``, ``comboHash``)."""
        keys = list(values)
        assignments = ', '.join('%s = ?' % SERIES_COLUMN_OF[key] for key in keys)
        with self.db.transaction() as conn:
            conn.execute('UPDATE tournament_series SET %s, updated_at = ? WHERE id = ?' % assignments,
                         [values[key] for key in keys] + [at, series_id])

    def delete_series(self, series_id):
        """Elimina la serie con tutte le sue edizioni."""
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM tournaments WHERE series_id = ?', (series_id,))
            conn.execute('DELETE FROM tournament_series WHERE id = ?', (series_id,))

    def update(self, tournament_id, values, at):
        """Aggiorna i campi ``values`` (chiavi dei dizionari, tranne ``id``) e ``updatedAt``."""
        values = dict(values, updatedAt=at)
        keys = [key for key in values if key != 'id']
        params = [column_value(key, values[key]) for key in keys]
        assignments = ', '.join('%s = ?' % COLUMN_OF[key] for key in keys)
        with self.db.transaction() as conn:
            conn.execute('UPDATE tournaments SET %s WHERE id = ?' % assignments, params + [tournament_id])

    def delete(self, tournament_id):
        """Elimina il torneo; se era l'ultima edizione della serie, anche la serie."""
        with self.db.transaction() as conn:
            row = conn.execute('SELECT series_id FROM tournaments WHERE id = ?', (tournament_id,)).fetchone()
            conn.execute('DELETE FROM tournaments WHERE id = ?', (tournament_id,))
            if row and row[0] is not None and not conn.execute('SELECT 1 FROM tournaments WHERE series_id = ?',
                                                               (row[0],)).fetchone():
                conn.execute('DELETE FROM tournament_series WHERE id = ?', (row[0],))

    # --- Iscritti --------------------------------------------------------------------

    def players(self, tournament_id):
        """Iscritti in ordine d'iscrizione: ``[{id, name, color, joinedAt, addedBy, seed, withdrawn, withdrawnAt,
        place}]``.

        ``seed`` è la testa di serie (da 1), scritta all'avvio; prima è ``None``.
        ``withdrawn`` è vero se l'admin l'ha ritirato a torneo in corso, con la data in ``withdrawnAt``;
        ``place`` è il piazzamento finale (``None`` prima della fine).
        """
        rows = self.db.query(
            'SELECT p.account_id, a.name, a.color, p.joined_at, p.added_by, p.seed, p.withdrawn_at, p.place '
            'FROM tournament_players p JOIN accounts a ON a.id = p.account_id WHERE p.tournament_id = ? '
            'ORDER BY p.joined_at, p.rowid', (tournament_id,))
        return [{'id': row[0], 'name': row[1], 'color': row[2], 'joinedAt': row[3], 'addedBy': row[4],
                 'seed': row[5], 'withdrawn': bool(row[6]), 'withdrawnAt': row[6], 'place': row[7]} for row in rows]

    def set_places(self, tournament_id, places):
        """Scrive i piazzamenti finali ``{account_id: posto}`` degli iscritti."""
        with self.db.transaction() as conn:
            for account_id, place in places.items():
                conn.execute('UPDATE tournament_players SET place = ? WHERE tournament_id = ? AND account_id = ?',
                             (place, tournament_id, account_id))

    def set_withdrawn(self, tournament_id, account_id, at):
        """Segna il ritiro dell'iscritto alla data ``at`` (``None`` lo annulla)."""
        with self.db.transaction() as conn:
            conn.execute('UPDATE tournament_players SET withdrawn_at = ? WHERE tournament_id = ? AND account_id = ?',
                         (at, tournament_id, account_id))

    def running(self):
        """Tornei in corso (normalmente al massimo uno)."""
        rows = self.db.query("SELECT %s FROM %s WHERE t.status = 'running' ORDER BY t.id" % (COLUMNS, SOURCE))
        return [row_dict(row) for row in rows]

    def add_player(self, tournament_id, account_id, at, added_by=None, limit=None):
        """Iscrive il profilo; ``False`` se è già iscritto o se gli iscritti sono già ``limit``.

        Il controllo dei posti e l'inserimento stanno nella stessa transazione.
        """
        with self.db.transaction() as conn:
            if conn.execute('SELECT 1 FROM tournament_players WHERE tournament_id = ? AND account_id = ?',
                            (tournament_id, account_id)).fetchone():
                return False
            if limit is not None:
                count = conn.execute('SELECT COUNT(*) FROM tournament_players WHERE tournament_id = ?',
                                     (tournament_id,)).fetchone()[0]
                if count >= limit:
                    return False
            conn.execute('INSERT INTO tournament_players (tournament_id, account_id, joined_at, added_by) '
                         'VALUES (?, ?, ?, ?)', (tournament_id, account_id, at, added_by))
            return True

    def remove_player(self, tournament_id, account_id):
        """Toglie il profilo dagli iscritti; ``False`` se non era iscritto."""
        with self.db.transaction() as conn:
            cursor = conn.execute('DELETE FROM tournament_players WHERE tournament_id = ? AND account_id = ?',
                                  (tournament_id, account_id))
            return cursor.rowcount > 0
