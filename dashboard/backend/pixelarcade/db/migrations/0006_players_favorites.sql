-- Sprint 08: giocatori di ogni partita (con gli XP guadagnati) e preferiti dei profili.

-- Profili registrati in una partita: tempo e XP si calcolano da qui e da sessions.
CREATE TABLE session_players (
    session_id INTEGER NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    slot TEXT NOT NULL CHECK (slot IN ('p1', 'p2')),
    xp_gained INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, account_id)
);

CREATE INDEX session_players_account ON session_players (account_id);

-- Giochi preferiti di un profilo.
CREATE TABLE favorites (
    account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    system_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (account_id, system_id, game_id)
);

CREATE INDEX favorites_account ON favorites (account_id);
