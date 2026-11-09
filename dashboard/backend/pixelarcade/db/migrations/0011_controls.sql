-- Comandi dei giochi: nomi dei tasti letti dal core, nomi scritti a mano e conferma della configurazione.
-- L'assegnazione dei tasti sta nel file di remap di RetroArch (`remaps/<core>/<gioco>.rmp`).

-- Una riga per gioco e core: `descriptors` e `labels` sono JSON `{"p1": {"b": "…"}, "p2": {…}}`
-- con i tasti del RetroPad come chiavi; `confirmed_at` è vuoto finché la configurazione non è confermata.
CREATE TABLE game_controls (
    system_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    core TEXT NOT NULL,
    descriptors TEXT NOT NULL DEFAULT '{}',
    labels TEXT NOT NULL DEFAULT '{}',
    confirmed_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (system_id, game_id, core)
);
