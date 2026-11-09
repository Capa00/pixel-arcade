-- Salvataggi per profilo: stati di RetroArch conservati per profilo, gioco e slot.

-- Slot 0 = «Riprendi» (stato automatico all'uscita), slot 1–9 = salvataggi manuali.
-- I file stanno in <data_dir>/saves/<account_id>/<chiave del gioco>/ (saves.py).
CREATE TABLE saves (
    account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    system_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    slot INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 9),
    core TEXT NOT NULL,
    name TEXT,
    protected INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (account_id, system_id, game_id, slot)
);

CREATE INDEX saves_account ON saves (account_id);
