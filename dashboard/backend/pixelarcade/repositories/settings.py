"""Repository delle impostazioni (tabella ``settings``)."""
import json


class SettingsRepository:
    """Legge e scrive le impostazioni come coppie chiave-valore JSON."""

    def __init__(self, db):
        self.db = db

    def get_all(self):
        """Restituisce un dizionario con i valori JSON già decodificati."""
        rows = self.db.query('SELECT key, value FROM settings ORDER BY key')
        return {key: json.loads(value) for key, value in rows}

    def set_many(self, values):
        """Inserisce o aggiorna più impostazioni in una sola transazione."""
        with self.db.transaction() as conn:
            for key, value in values.items():
                conn.execute(
                    'INSERT INTO settings (key, value) VALUES (?, ?) '
                    'ON CONFLICT (key) DO UPDATE SET value = excluded.value',
                    (key, json.dumps(value, ensure_ascii=False, sort_keys=True)),
                )
