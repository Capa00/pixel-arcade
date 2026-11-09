-- Sprint 07: profili dei giocatori e loro generi preferiti.

-- Profilo: nome unico senza distinzione tra maiuscole e minuscole, colore e preferenze.
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL,
    fav_system TEXT,
    difficulty TEXT NOT NULL DEFAULT 'Normale',
    opt_crt INTEGER NOT NULL DEFAULT 0,
    opt_vib INTEGER NOT NULL DEFAULT 1,
    opt_save INTEGER NOT NULL DEFAULT 1
);

-- Generi preferiti di un profilo.
CREATE TABLE account_genres (
    account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    genre TEXT NOT NULL,
    PRIMARY KEY (account_id, genre)
);
