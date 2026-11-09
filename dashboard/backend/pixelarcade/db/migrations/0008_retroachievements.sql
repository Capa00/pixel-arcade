-- RetroAchievements: account dei profili, gioco RetroAchievements di ogni file e trofei delle partite.
-- La chiave Web API, unica per la dashboard, sta in settings (chiave interna retroachievements.api_key).

-- Account RetroAchievements di un profilo: nome utente e token di accesso. La password non si salva.
CREATE TABLE ra_accounts (
    account_id INTEGER PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    token TEXT NOT NULL,
    linked_at TEXT NOT NULL
);

-- Gioco RetroAchievements di un file della libreria, dall'hash calcolato o dal log di RetroArch.
-- status: found (riconosciuto), unknown (hash non riconosciuto), unsupported (versione non supportata).
CREATE TABLE ra_games (
    system_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    hash TEXT,
    ra_game_id INTEGER,
    title TEXT,
    status TEXT NOT NULL CHECK (status IN ('found', 'unknown', 'unsupported')),
    source TEXT NOT NULL CHECK (source IN ('hash', 'log')),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (system_id, game_id)
);

-- Trofei sbloccati in una partita, per ogni profilo presente.
-- earner_id è il profilo P1, sul cui account RetroAchievements il trofeo è stato registrato.
CREATE TABLE ra_unlocks (
    session_id INTEGER NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    achievement_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    ra_game_id INTEGER,
    earner_id INTEGER REFERENCES accounts (id) ON DELETE SET NULL,
    unlocked_at TEXT NOT NULL,
    PRIMARY KEY (session_id, account_id, achievement_id)
);
CREATE INDEX ra_unlocks_account ON ra_unlocks (account_id, unlocked_at);
