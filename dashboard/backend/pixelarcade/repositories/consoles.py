"""Repository delle console della riga (tabelle ``console_settings`` e ``account_consoles``)."""


class ConsolesRepository:
    """Stato delle console deciso nelle Impostazioni e scelte dei profili."""

    def __init__(self, db):
        self.db = db

    def settings(self):
        """Stato deciso nelle Impostazioni: ``(accese, spente)``, liste di id in ordine alfabetico."""
        rows = self.db.query('SELECT system_id, shown FROM console_settings ORDER BY system_id')
        return ([system_id for system_id, shown in rows if shown],
                [system_id for system_id, shown in rows if not shown])

    def set_settings(self, on, off):
        """Sostituisce lo stato deciso nelle Impostazioni (liste di id accese e spente)."""
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM console_settings')
            for system_id in dict.fromkeys(on):
                conn.execute('INSERT INTO console_settings (system_id, shown) VALUES (?, 1)', (system_id,))
            for system_id in dict.fromkeys(off):
                conn.execute('INSERT OR REPLACE INTO console_settings (system_id, shown) VALUES (?, 0)', (system_id,))

    def choices(self):
        """Scelte dei profili: ``[(account_id, system_id, shown)]`` con ``shown`` booleano."""
        rows = self.db.query('SELECT account_id, system_id, shown FROM account_consoles '
                             'ORDER BY account_id, system_id')
        return [(account_id, system_id, bool(shown)) for account_id, system_id, shown in rows]

    def set_choice(self, account_id, system_id, shown):
        """Salva la scelta del profilo (``True`` accesa, ``False`` spenta); ``None`` la cancella."""
        with self.db.transaction() as conn:
            if shown is None:
                conn.execute('DELETE FROM account_consoles WHERE account_id = ? AND system_id = ?',
                             (account_id, system_id))
            else:
                conn.execute('INSERT INTO account_consoles (account_id, system_id, shown) VALUES (?, ?, ?) '
                             'ON CONFLICT (account_id, system_id) DO UPDATE SET shown = excluded.shown',
                             (account_id, system_id, int(shown)))
