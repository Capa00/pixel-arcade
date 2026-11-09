-- Sprint 05: core associato a ogni gioco, tentativi della ricerca del core e partite.

-- Core associato a un gioco: in prova, confermato oppure nessun core compatibile.
CREATE TABLE game_cores (
    system_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    core TEXT,
    status TEXT NOT NULL CHECK (status IN ('trial', 'ok', 'incompatible')),
    confirmed_by TEXT CHECK (confirmed_by IN ('auto', 'user', 'manual')),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (system_id, game_id)
);

-- Ogni core provato per un gioco, con l'esito e le ultime righe del log di RetroArch.
CREATE TABLE core_attempts (
    id INTEGER PRIMARY KEY,
    system_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    core TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('ok', 'failed')),
    reason TEXT,
    log_tail TEXT,
    at TEXT NOT NULL
);

CREATE INDEX core_attempts_game ON core_attempts (system_id, game_id);

-- Partite giocate: una riga per ogni avvio di RetroArch superata la verifica.
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY,
    system_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    core TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    seconds INTEGER,
    exit_code INTEGER
);

CREATE INDEX sessions_game ON sessions (system_id, game_id);
