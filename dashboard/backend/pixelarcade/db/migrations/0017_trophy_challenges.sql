-- Sfida trofeo: un trofeo RetroAchievements da sbloccare partendo da uno stato salvato, aperta per 15 giorni.

-- `state` è il nome del file dello stato in `<saves>/challenges/` (vuoto dopo la scadenza, quando il file si cancella);
-- `core` il core con cui è stato fatto lo stato; `seconds` il tempo di gioco del creatore dallo stato al trofeo.
CREATE TABLE trophy_challenges (
    id INTEGER PRIMARY KEY,
    creator_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    system_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    title TEXT NOT NULL,
    core TEXT NOT NULL,
    achievement_id INTEGER NOT NULL,
    achievement_title TEXT NOT NULL,
    ra_game_id INTEGER,
    seconds INTEGER NOT NULL,
    state TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

-- Tentativi: `won` = 1 col trofeo sbloccato (con `seconds` di gioco dallo stato), 0 senza.
-- Il primo tentativo del creatore è la partita da cui è nata la sfida.
CREATE TABLE trophy_challenge_runs (
    id INTEGER PRIMARY KEY,
    challenge_id INTEGER NOT NULL REFERENCES trophy_challenges(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    won INTEGER NOT NULL,
    seconds INTEGER,
    at TEXT NOT NULL
);

CREATE INDEX trophy_challenge_runs_challenge ON trophy_challenge_runs (challenge_id);

-- Avvisi già visti: `kind` è `notice` (nuova sfida) o `final` (riepilogo dopo la scadenza).
CREATE TABLE trophy_challenge_seen (
    challenge_id INTEGER NOT NULL REFERENCES trophy_challenges(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    seen_at TEXT NOT NULL,
    PRIMARY KEY (challenge_id, account_id, kind)
);
