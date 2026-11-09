-- Configurazione dei giochi: Grafica a livelli con la Personalizzata, e opzioni di Latenza, Audio ed Emulazione.

-- Una riga per console (`game_id` vuoto) e una per ogni gioco con scelte sue.
-- `mode` è il livello della Grafica (`original`, `soft`, `smooth`, `enhanced`, `max`) oppure `custom`;
-- in una riga di gioco `NULL` vuol dire «Come la console».
-- `custom` è la Personalizzata in JSON, `{"base": livello, "retroarch": {...}, "cores": {core: {...}}}`,
-- oppure `NULL`; resta salvata anche quando si sceglie un livello.
-- `options` sono le altre opzioni scelte, JSON `{"retroarch": {chiave: valore}, "cores": {core: {chiave: valore}}}`.
CREATE TABLE game_config (
    system_id TEXT NOT NULL,
    game_id TEXT NOT NULL DEFAULT '',
    mode TEXT,
    custom TEXT,
    options TEXT NOT NULL DEFAULT '{"retroarch": {}, "cores": {}}',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (system_id, game_id)
);

-- Dalla grafica precedente: il dettaglio 3D se migliorato, altrimenti il livello dell'immagine.
INSERT INTO game_config (system_id, game_id, mode, updated_at)
SELECT system_id, game_id,
       CASE WHEN detail IN ('enhanced', 'max') THEN detail ELSE image END,
       updated_at
FROM graphics;

DROP TABLE graphics;
