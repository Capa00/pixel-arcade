-- Spezzoni del salvaschermo: non più uno per profilo ma una coda di tutta la casa (gli ultimi cinque).

-- `id` cresce a ogni spezzone; gli spezzoni già registrati restano, nell'ordine di registrazione.
CREATE TABLE replays_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    system_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    core TEXT NOT NULL,
    file TEXT NOT NULL,
    size INTEGER NOT NULL,
    seconds INTEGER NOT NULL,
    trophy TEXT,
    recorded_at TEXT NOT NULL
);

INSERT INTO replays_new (account_id, system_id, game_id, core, file, size, seconds, trophy, recorded_at)
    SELECT account_id, system_id, game_id, core, file, size, seconds, trophy, recorded_at
    FROM replays ORDER BY recorded_at, account_id;

DROP TABLE replays;

ALTER TABLE replays_new RENAME TO replays;
