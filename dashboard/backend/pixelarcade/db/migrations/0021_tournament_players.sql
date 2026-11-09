-- Iscritti ai tornei (README «Torneo»): un profilo si iscrive da solo dalla scheda TOURNAMENT oppure lo iscrive l'admin.

-- `registration_closed`: iscrizioni chiuse dall'admin (il torneo resta `open` e visibile, ma nessuno si iscrive o si ritira).
ALTER TABLE tournaments ADD COLUMN registration_closed INTEGER NOT NULL DEFAULT 0;

-- `added_by`: profilo dell'admin che l'ha iscritto, vuoto se si è iscritto da solo. `joined_at` è ISO in UTC.
CREATE TABLE tournament_players (
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL,
    added_by INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    PRIMARY KEY (tournament_id, account_id)
);
