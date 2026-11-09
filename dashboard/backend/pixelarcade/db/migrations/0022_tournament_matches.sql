-- Avvio e svolgimento dei tornei (README «Torneo»): formato, teste di serie, incontri, partite e premi.

-- `format`: `single` (eliminazione diretta), `double` (doppia eliminazione), `round_robin` (girone all'italiana),
-- `swiss` (svizzero), `two_stage` (due fasi). `options` è il JSON delle opzioni proprie del formato (per
-- l'eliminazione diretta `semiSeries`: serie della semifinale, `null` = come i turni); le serie dei turni e
-- della finale e il 3° posto restano in `round_series`, `final_series` e `third_place`.
-- `seeding`: teste di serie `random` (a caso), `xp`, `time` (tempo giocato al gioco del torneo) o `mix`;
-- `seeding_weight` è il peso degli XP nel misto, in percentuale (il tempo è il resto).
-- `advantaged_side`: lato vantaggiato `none`, `p1` o `p2`; la testa di serie migliore parte nell'altro.
-- `started_at` e `finished_at` sono ISO in UTC.
ALTER TABLE tournaments ADD COLUMN format TEXT NOT NULL DEFAULT 'single';
ALTER TABLE tournaments ADD COLUMN options TEXT NOT NULL DEFAULT '{}';
ALTER TABLE tournaments ADD COLUMN seeding TEXT NOT NULL DEFAULT 'random';
ALTER TABLE tournaments ADD COLUMN seeding_weight INTEGER NOT NULL DEFAULT 50;
ALTER TABLE tournaments ADD COLUMN advantaged_side TEXT NOT NULL DEFAULT 'none';
ALTER TABLE tournaments ADD COLUMN started_at TEXT;
ALTER TABLE tournaments ADD COLUMN finished_at TEXT;

-- `seed`: testa di serie (1 = la migliore), scritta all'avvio. `group_no`: gruppo della prima fase.
-- `withdrawn_at`: ritirato dall'admin a torneo in corso. `place`: piazzamento finale.
ALTER TABLE tournament_players ADD COLUMN seed INTEGER;
ALTER TABLE tournament_players ADD COLUMN group_no INTEGER;
ALTER TABLE tournament_players ADD COLUMN withdrawn_at TEXT;
ALTER TABLE tournament_players ADD COLUMN place INTEGER;

-- Sessioni giocate per un torneo: escluse da XP, tempo giocato e statistiche. Senza chiave esterna, così
-- l'esclusione resta anche dopo l'eliminazione del torneo.
ALTER TABLE sessions ADD COLUMN tournament_id INTEGER;

-- Incontri. `bracket`: `main` (eliminazione diretta), `winners`, `losers`, `grand` (doppia), `third` (3° posto).
-- `play_order`: ordine di gioco (0 per i bye, che non si giocano). `player_a` è la testa di serie migliore.
-- `from_a`/`from_b`: `winner:<id>` o `loser:<id>` dell'incontro da cui arriva il giocatore, vuoto se assegnato
-- all'avvio. `series`: partite della serie. `status`: `waiting`, `ready`, `playing`, `done`. `winner_id` vuoto
-- a incontro concluso = pareggio (solo nei formati a classifica). `walkover`: vittoria a tavolino.
CREATE TABLE tournament_matches (
    id INTEGER PRIMARY KEY,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    stage INTEGER NOT NULL DEFAULT 1,
    group_no INTEGER,
    bracket TEXT NOT NULL,
    round INTEGER NOT NULL,
    slot INTEGER NOT NULL,
    play_order INTEGER NOT NULL,
    player_a INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    player_b INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    from_a TEXT,
    from_b TEXT,
    series INTEGER NOT NULL,
    status TEXT NOT NULL,
    winner_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    walkover INTEGER NOT NULL DEFAULT 0,
    bye INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    finished_at TEXT
);

CREATE INDEX tournament_matches_order ON tournament_matches (tournament_id, play_order);
CREATE INDEX tournament_matches_status ON tournament_matches (tournament_id, status);

-- Partite di un incontro. `winner_id` vuoto = pareggio. `side_a`: lato (`p1`/`p2`) di `player_a`.
-- `score_a`/`score_b`: punteggio facoltativo. `session_id`: sessione della partita, se c'è.
CREATE TABLE tournament_games (
    match_id INTEGER NOT NULL REFERENCES tournament_matches(id) ON DELETE CASCADE,
    game_no INTEGER NOT NULL,
    winner_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    side_a TEXT NOT NULL,
    score_a INTEGER,
    score_b INTEGER,
    session_id INTEGER,
    declared_at TEXT NOT NULL,
    PRIMARY KEY (match_id, game_no)
);

-- Premi dei tornei conclusi. Restano anche se il torneo viene eliminato (niente chiave esterna sul torneo):
-- per questo il titolo è copiato qui, per la cronologia del profilo.
CREATE TABLE tournament_rewards (
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    tournament_id INTEGER,
    title TEXT NOT NULL,
    place INTEGER NOT NULL,
    xp INTEGER NOT NULL,
    awarded_at TEXT NOT NULL
);

CREATE INDEX tournament_rewards_account ON tournament_rewards (account_id);
