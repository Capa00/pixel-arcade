-- Tornei (README «Torneo»): uno solo non concluso alla volta, creato dal P1 nelle Impostazioni.

-- `status`: `draft` (bozza), `open` (iscrizioni), `running` (in corso), `done` (concluso), `cancelled` (annullato).
-- `starts_at` è la data d'inizio (ISO in UTC, facoltativa). `state` è il nome del file dello stato di partenza in
-- `<saves>/tournaments/` (vuoto senza stato: si parte dall'inizio); `core` il core con cui è stato fatto lo stato.
-- `max_players` vuoto = nessun limite. `round_series` e `final_series` sono le partite delle serie (1, 3 o 5).
-- `sides`: `alternate`, `random` o `free`. `combo_hash` è l'impronta della combinazione dell'admin (vuota = nessuna).
CREATE TABLE tournaments (
    id INTEGER PRIMARY KEY,
    creator_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    starts_at TEXT,
    system_id TEXT,
    game_id TEXT,
    core TEXT,
    state TEXT NOT NULL DEFAULT '',
    max_players INTEGER,
    round_series INTEGER NOT NULL DEFAULT 1,
    final_series INTEGER NOT NULL DEFAULT 3,
    third_place INTEGER NOT NULL DEFAULT 1,
    saves_locked INTEGER NOT NULL DEFAULT 1,
    sides TEXT NOT NULL DEFAULT 'alternate',
    rewards INTEGER NOT NULL DEFAULT 1,
    combo_hash TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT
);

CREATE INDEX tournaments_status ON tournaments (status);
