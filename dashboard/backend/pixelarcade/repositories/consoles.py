"""Repository delle console della riga (tabelle ``consoles_off`` e ``account_consoles``)."""


class ConsolesRepository:
    """Console spente per tutti e scelte dei profili rispetto alle Impostazioni."""

    def __init__(self, db):
        self.db = db

    def off(self):
        """Id delle console spente per tutti, in ordine alfabetico."""
        return [system_id for (system_id,) in self.db.query('SELECT system_id FROM consoles_off ORDER BY system_id')]

    def set_off(self, system_ids):
        """Sostituisce l'elenco delle console spente per tutti."""
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM consoles_off')
            for system_id in dict.fromkeys(system_ids):
                conn.execute('INSERT INTO consoles_off (system_id) VALUES (?)', (system_id,))

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
