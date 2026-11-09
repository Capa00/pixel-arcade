-- Serie ed edizioni dei tornei (README «Torneo»): ogni torneo è un'edizione di una serie.

-- La serie ha nome, descrizione, creatore e combinazione dell'admin (vale per tutte le edizioni).
CREATE TABLE tournament_series (
    id INTEGER PRIMARY KEY,
    creator_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    combo_hash TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- `edition`: numero dell'edizione, dato alla creazione (il più alto tra le non annullate + 1); vuoto se annullata.
-- `title` del torneo diventa il titolo facoltativo dell'edizione.
ALTER TABLE tournaments ADD COLUMN series_id INTEGER REFERENCES tournament_series(id) ON DELETE CASCADE;
ALTER TABLE tournaments ADD COLUMN edition INTEGER;

-- I tornei già presenti diventano la 1ª edizione di una serie con il loro titolo.
INSERT INTO tournament_series (id, creator_id, name, combo_hash, created_at, updated_at)
    SELECT id, creator_id, title, combo_hash, created_at, updated_at FROM tournaments;
UPDATE tournaments SET series_id = id, title = '', combo_hash = '',
    edition = CASE WHEN status = 'cancelled' THEN NULL ELSE 1 END;

CREATE INDEX tournaments_series ON tournaments (series_id);
