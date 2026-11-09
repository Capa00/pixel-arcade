"""Repository delle playlist (tabelle ``playlists`` e ``playlist_games``)."""
import sqlite3

from ..errors import ConflictError

DUPLICATE_NAME = 'Esiste già una playlist con questo nome.'


class PlaylistsRepository:
    """Legge, crea, modifica ed elimina le playlist e i loro giochi aggiunti a mano."""

    def __init__(self, db):
        self.db = db

    def list(self):
        """Tutte le playlist in ordine di creazione: ``[{id, name, filters, games}]``.

        ``filters`` è il testo JSON salvato; ``games`` sono le coppie
        ``(system_id, game_id)`` aggiunte a mano, nell'ordine di aggiunta.
        """
        games = {}
        for playlist_id, system_id, game_id in self.db.query(
                'SELECT playlist_id, system_id, game_id FROM playlist_games ORDER BY created_at, rowid'):
            games.setdefault(playlist_id, []).append((system_id, game_id))
        rows = self.db.query('SELECT id, name, filters FROM playlists ORDER BY id')
        return [{'id': playlist_id, 'name': name, 'filters': filters, 'games': games.get(playlist_id, [])}
                for playlist_id, name, filters in rows]

    def exists(self, playlist_id):
        return bool(self.db.query('SELECT 1 FROM playlists WHERE id = ?', (playlist_id,)))

    def create(self, name, filters, created_at, games=()):
        """Crea la playlist e ne restituisce l'id; un nome già usato solleva ``ConflictError``."""
        try:
            with self.db.transaction() as conn:
                cursor = conn.execute('INSERT INTO playlists (name, filters, created_at) VALUES (?, ?, ?)',
                                      (name, filters, created_at))
                playlist_id = cursor.lastrowid
                for system_id, game_id in dict.fromkeys(games):
                    conn.execute('INSERT INTO playlist_games (playlist_id, system_id, game_id, created_at) '
                                 'VALUES (?, ?, ?, ?)', (playlist_id, system_id, game_id, created_at))
        except sqlite3.IntegrityError:
            raise ConflictError(DUPLICATE_NAME)
        return playlist_id

    def update(self, playlist_id, name=None, filters=None):
        """Cambia nome e/o filtri (``None`` = invariato); un nome già usato solleva ``ConflictError``."""
        try:
            with self.db.transaction() as conn:
                if name is not None:
                    conn.execute('UPDATE playlists SET name = ? WHERE id = ?', (name, playlist_id))
                if filters is not None:
                    conn.execute('UPDATE playlists SET filters = ? WHERE id = ?', (filters, playlist_id))
        except sqlite3.IntegrityError:
            raise ConflictError(DUPLICATE_NAME)

    def delete(self, playlist_id):
        """Elimina la playlist con i suoi giochi."""
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM playlists WHERE id = ?', (playlist_id,))

    def set_game(self, playlist_id, system_id, game_id, on, created_at):
        """Aggiunge (``on``) o toglie un gioco; ripetere la stessa operazione non cambia nulla."""
        with self.db.transaction() as conn:
            if on:
                conn.execute('INSERT OR IGNORE INTO playlist_games (playlist_id, system_id, game_id, created_at) '
                             'VALUES (?, ?, ?, ?)', (playlist_id, system_id, game_id, created_at))
            else:
                conn.execute('DELETE FROM playlist_games WHERE playlist_id = ? AND system_id = ? AND game_id = ?',
                             (playlist_id, system_id, game_id))
