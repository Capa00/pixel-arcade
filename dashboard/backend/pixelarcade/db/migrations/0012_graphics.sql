-- Grafica dei giochi: livello dell'immagine, dettaglio 3D e opzioni extra.

-- Una riga per console (`game_id` vuoto) e una per ogni gioco con una scelta sua.
-- `image` e `detail` sono un livello (`original`, `soft`, `smooth` / `original`, `enhanced`, `max`);
-- in una riga di gioco `NULL` vuol dire «Come la console». `extras` è JSON `{"lcd": true}`, solo per console.
CREATE TABLE graphics (
    system_id TEXT NOT NULL,
    game_id TEXT NOT NULL DEFAULT '',
    image TEXT,
    detail TEXT,
    extras TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (system_id, game_id)
);
