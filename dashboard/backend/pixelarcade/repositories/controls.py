"""Repository dei comandi dei giochi (tabella ``game_controls``)."""
import json


def load_json(text):
    try:
        value = json.loads(text or '{}')
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


class ControlsRepository:
    """Nomi dei tasti letti dal core, nomi scritti a mano e conferma, per gioco e core."""

    def __init__(self, db):
        self.db = db

    def get(self, system_id, game_id, core):
        """``{core, descriptors, labels, confirmedAt, updatedAt}``, oppure ``None``."""
        rows = self.db.query('SELECT core, descriptors, labels, confirmed_at, updated_at FROM game_controls '
                             'WHERE system_id = ? AND game_id = ? AND core = ?', (system_id, game_id, core))
        return self.row(rows[0]) if rows else None

    def latest(self, system_id, game_id):
        """Riga del gioco aggiornata per ultima (con qualunque core), oppure ``None``."""
        rows = self.db.query('SELECT core, descriptors, labels, confirmed_at, updated_at FROM game_controls '
                             'WHERE system_id = ? AND game_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1',
                             (system_id, game_id))
        return self.row(rows[0]) if rows else None

    @staticmethod
    def row(values):
        core, descriptors, labels, confirmed_at, updated_at = values
        return {'core': core, 'descriptors': load_json(descriptors), 'labels': load_json(labels),
                'confirmedAt': confirmed_at, 'updatedAt': updated_at}

    def set_descriptors(self, system_id, game_id, core, descriptors, at):
        """Salva i nomi dei tasti letti dal log del core (nomi scritti a mano e conferma restano)."""
        with self.db.transaction() as conn:
            conn.execute(
                'INSERT INTO game_controls (system_id, game_id, core, descriptors, updated_at) VALUES (?, ?, ?, ?, ?) '
                'ON CONFLICT (system_id, game_id, core) DO UPDATE SET descriptors = excluded.descriptors, '
                'updated_at = excluded.updated_at',
                (system_id, game_id, core, json.dumps(descriptors, sort_keys=True), at))

    def set_labels(self, system_id, game_id, core, labels, at):
        """Salva i nomi delle azioni scritti a mano."""
        with self.db.transaction() as conn:
            conn.execute(
                'INSERT INTO game_controls (system_id, game_id, core, labels, updated_at) VALUES (?, ?, ?, ?, ?) '
                'ON CONFLICT (system_id, game_id, core) DO UPDATE SET labels = excluded.labels, '
                'updated_at = excluded.updated_at',
                (system_id, game_id, core, json.dumps(labels, sort_keys=True), at))

    def confirm(self, system_id, game_id, core, at):
        """Segna la configurazione come confermata: al prossimo avvio non si chiede più."""
        with self.db.transaction() as conn:
            conn.execute(
                'INSERT INTO game_controls (system_id, game_id, core, confirmed_at, updated_at) VALUES (?, ?, ?, ?, ?) '
                'ON CONFLICT (system_id, game_id, core) DO UPDATE SET confirmed_at = excluded.confirmed_at',
                (system_id, game_id, core, at, at))
