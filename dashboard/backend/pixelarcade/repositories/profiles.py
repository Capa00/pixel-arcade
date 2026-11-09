"""Repository dei profili (tabelle ``accounts``, ``account_genres`` e ``favorites``)."""
import sqlite3

from ..errors import DuplicateNameError

DUPLICATE_NAME = 'Nome già in uso'

COLUMNS = ('id', 'name', 'color', 'created_at', 'fav_system', 'difficulty', 'opt_crt', 'opt_vib', 'opt_save',
           'gravatar')


# Colonne di ``accounts`` modificabili con ``update``.
UPDATABLE = ('name', 'color', 'fav_system', 'difficulty', 'opt_crt', 'opt_vib', 'opt_save', 'gravatar')


class ProfilesRepository:
    """Legge, crea e modifica i profili dei giocatori e i loro preferiti."""

    def __init__(self, db):
        self.db = db

    def genres(self):
        """Generi di tutti i profili: ``{account_id: [genere, …]}`` in ordine alfabetico."""
        result = {}
        for account_id, genre in self.db.query('SELECT account_id, genre FROM account_genres '
                                               'ORDER BY account_id, genre'):
            result.setdefault(account_id, []).append(genre)
        return result

    def row(self, values, genres):
        account = dict(zip(COLUMNS, values))
        account['genres'] = genres.get(account['id'], [])
        return account

    def list(self):
        """Tutti i profili, in ordine di creazione, come dizionari con i nomi delle colonne più ``genres``."""
        genres = self.genres()
        rows = self.db.query('SELECT %s FROM accounts ORDER BY id' % ', '.join(COLUMNS))
        return [self.row(values, genres) for values in rows]

    def get(self, account_id):
        """Profilo con quell'id, oppure ``None``."""
        rows = self.db.query('SELECT %s FROM accounts WHERE id = ?' % ', '.join(COLUMNS), (account_id,))
        if not rows:
            return None
        return self.row(rows[0], self.genres())

    def create(self, name, color, created_at, fav_system=None, difficulty='Normale',
               opt_crt=False, opt_vib=True, opt_save=True, genres=()):
        """Crea il profilo e ne restituisce l'id.

        Il nome è unico senza distinguere maiuscole e minuscole: un doppione
        solleva ``DuplicateNameError('Nome già in uso')``, sottoclasse di
        ``ProfileError`` con status 409.
        """
        try:
            with self.db.transaction() as conn:
                cursor = conn.execute(
                    'INSERT INTO accounts (name, color, created_at, fav_system, difficulty, opt_crt, opt_vib, opt_save) '
                    'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    (name, color, created_at, fav_system, difficulty, int(opt_crt), int(opt_vib), int(opt_save)),
                )
                account_id = cursor.lastrowid
                for genre in dict.fromkeys(genres):
                    conn.execute('INSERT INTO account_genres (account_id, genre) VALUES (?, ?)', (account_id, genre))
        except sqlite3.IntegrityError:
            raise DuplicateNameError(DUPLICATE_NAME)
        return account_id

    def update(self, account_id, fields, genres=None):
        """Aggiorna le colonne ``fields`` (``{colonna: valore}``, solo quelle di ``UPDATABLE``) e,
        se ``genres`` non è ``None``, sostituisce i generi; tutto in una transazione.

        Un nome già usato da un altro profilo (senza distinguere maiuscole e minuscole)
        solleva ``DuplicateNameError`` e non salva nulla.
        """
        unknown = set(fields) - set(UPDATABLE)
        if unknown:
            raise ValueError('Colonne non modificabili: %s' % ', '.join(sorted(unknown)))
        try:
            with self.db.transaction() as conn:
                if fields:
                    # I nomi delle colonne vengono da UPDATABLE, i valori sono parametri.
                    columns = [column for column in UPDATABLE if column in fields]
                    assignments = ', '.join('%s = ?' % column for column in columns)
                    conn.execute('UPDATE accounts SET %s WHERE id = ?' % assignments,
                                 [fields[column] for column in columns] + [account_id])
                if genres is not None:
                    self.set_genres(account_id, genres)
        except sqlite3.IntegrityError:
            raise DuplicateNameError(DUPLICATE_NAME)

    def set_genres(self, account_id, genres):
        """Sostituisce i generi preferiti del profilo, in una transazione."""
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM account_genres WHERE account_id = ?', (account_id,))
            for genre in dict.fromkeys(genres):
                conn.execute('INSERT INTO account_genres (account_id, genre) VALUES (?, ?)', (account_id, genre))

    def set_favorite(self, account_id, system_id, game_id, on, created_at):
        """Aggiunge (``on``) o toglie il gioco dai preferiti; ripetere la stessa operazione non cambia nulla."""
        with self.db.transaction() as conn:
            if on:
                conn.execute('INSERT OR IGNORE INTO favorites (account_id, system_id, game_id, created_at) '
                             'VALUES (?, ?, ?, ?)', (account_id, system_id, game_id, created_at))
            else:
                conn.execute('DELETE FROM favorites WHERE account_id = ? AND system_id = ? AND game_id = ?',
                             (account_id, system_id, game_id))

    def favorites(self, account_id):
        """Preferiti del profilo come ``[(system_id, game_id)]``, dal più recente."""
        rows = self.db.query('SELECT system_id, game_id FROM favorites WHERE account_id = ? '
                             'ORDER BY created_at DESC, rowid DESC', (account_id,))
        return [(system_id, game_id) for system_id, game_id in rows]
