"""Repository dei salvataggi per profilo (tabella ``saves``).

Slot 0 = «Riprendi», slot 1–9 = salvataggi manuali. I file stanno su disco
(``saves.SaveStore``); qui ci sono solo core, nome, protezione, date e
salvataggio condiviso di partenza (``shared``, ``None`` se la partita usava
il salvataggio interno del profilo).
"""

COLUMNS = ('account_id', 'system_id', 'game_id', 'slot', 'core', 'name', 'protected', 'created_at', 'updated_at',
           'shared')
KEYS = ('account', 'system', 'game', 'slot', 'core', 'name', 'protected', 'createdAt', 'updatedAt', 'shared')


class SavesRepository:
    """Registra gli slot dei salvataggi di ogni profilo e gioco."""

    def __init__(self, db):
        self.db = db

    @staticmethod
    def row(values):
        save = dict(zip(KEYS, values))
        save['protected'] = bool(save['protected'])
        return save

    def upsert(self, account_id, system_id, game_id, slot, core, at, shared=None):
        """Crea lo slot o ne aggiorna core, data e salvataggio condiviso (nome e protezione restano).

        Restituisce ``False`` senza scrivere nulla se il profilo non esiste più.
        """
        with self.db.transaction() as conn:
            cursor = conn.execute(
                'INSERT INTO saves (account_id, system_id, game_id, slot, core, created_at, updated_at, shared) '
                'SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ?) '
                'ON CONFLICT (account_id, system_id, game_id, slot) DO UPDATE SET '
                'core = excluded.core, updated_at = excluded.updated_at, shared = excluded.shared',
                (account_id, system_id, game_id, slot, core, at, at, shared, account_id))
            return cursor.rowcount > 0

    def get(self, account_id, system_id, game_id, slot):
        """Slot come dizionario, oppure ``None``."""
        rows = self.db.query('SELECT %s FROM saves WHERE account_id = ? AND system_id = ? AND game_id = ? '
                             'AND slot = ?' % ', '.join(COLUMNS), (account_id, system_id, game_id, slot))
        return self.row(rows[0]) if rows else None

    def list_for_game(self, account_id, system_id, game_id):
        """Slot del profilo per quel gioco, in ordine di numero."""
        rows = self.db.query('SELECT %s FROM saves WHERE account_id = ? AND system_id = ? AND game_id = ? '
                             'ORDER BY slot' % ', '.join(COLUMNS), (account_id, system_id, game_id))
        return [self.row(values) for values in rows]

    def games_for_account(self, account_id):
        """Giochi con salvataggi, dal più recente: ``[{system, game, slots, updatedAt, resumeAt}]``.

        ``slots`` conta tutti gli slot, «Riprendi» compreso; ``resumeAt`` è la
        data del «Riprendi» (``None`` se manca).
        """
        rows = self.db.query(
            'SELECT system_id, game_id, COUNT(*), MAX(updated_at), '
            'MAX(CASE WHEN slot = 0 THEN updated_at END) '
            'FROM saves WHERE account_id = ? GROUP BY system_id, game_id '
            'ORDER BY MAX(updated_at) DESC, system_id, game_id', (account_id,))
        keys = ('system', 'game', 'slots', 'updatedAt', 'resumeAt')
        return [dict(zip(keys, values)) for values in rows]

    def rename(self, account_id, system_id, game_id, slot, name):
        """Cambia il nome dello slot (``None`` lo toglie); restituisce ``True`` se lo slot esiste."""
        with self.db.transaction() as conn:
            cursor = conn.execute('UPDATE saves SET name = ? WHERE account_id = ? AND system_id = ? AND game_id = ? '
                                  'AND slot = ?', (name, account_id, system_id, game_id, slot))
            return cursor.rowcount > 0

    def set_protected(self, account_id, system_id, game_id, slot, protected):
        """Protegge lo slot o toglie la protezione; restituisce ``True`` se lo slot esiste."""
        with self.db.transaction() as conn:
            cursor = conn.execute('UPDATE saves SET protected = ? WHERE account_id = ? AND system_id = ? '
                                  'AND game_id = ? AND slot = ?',
                                  (1 if protected else 0, account_id, system_id, game_id, slot))
            return cursor.rowcount > 0

    def delete(self, account_id, system_id, game_id, slot):
        """Elimina lo slot; restituisce ``True`` se esisteva."""
        with self.db.transaction() as conn:
            cursor = conn.execute('DELETE FROM saves WHERE account_id = ? AND system_id = ? AND game_id = ? '
                                  'AND slot = ?', (account_id, system_id, game_id, slot))
            return cursor.rowcount > 0
