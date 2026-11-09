-- Console nella riga delle schede (API.md, «Console della riga»).

-- Console spente per tutti dalle Impostazioni: senza riga sono accese.
CREATE TABLE consoles_off (
    system_id TEXT PRIMARY KEY
);

-- Scelte di un profilo che si scostano dalle Impostazioni:
-- shown = 1 console aggiunta alla sua riga, shown = 0 console tolta.
CREATE TABLE account_consoles (
    account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    system_id TEXT NOT NULL,
    shown INTEGER NOT NULL CHECK (shown IN (0, 1)),
    PRIMARY KEY (account_id, system_id)
);
