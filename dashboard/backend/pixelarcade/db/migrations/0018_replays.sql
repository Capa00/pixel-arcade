-- Spezzoni del salvaschermo: una partita rigiocata da RetroArch (replay), uno per profilo, sostituito dal successivo.

-- `file` è il nome dello spezzone in `<saves>/replays/`; `core` quello con cui è stato registrato;
-- `seconds` la sua durata di gioco; `trophy` il titolo del trofeo sbloccato nello spezzone, se c'è.
CREATE TABLE replays (
    account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    system_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    core TEXT NOT NULL,
    file TEXT NOT NULL,
    size INTEGER NOT NULL,
    seconds INTEGER NOT NULL,
    trophy TEXT,
    recorded_at TEXT NOT NULL
);
