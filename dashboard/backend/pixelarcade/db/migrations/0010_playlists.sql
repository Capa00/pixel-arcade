-- Playlist condivise tra tutti i profili: filtri salvati (JSON) e giochi aggiunti a mano.

-- Una playlist: nome unico (senza distinguere maiuscole e minuscole) e filtri in JSON (`{}` = nessun filtro).
CREATE TABLE playlists (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    filters TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

-- Giochi aggiunti a mano a una playlist, di qualunque console.
CREATE TABLE playlist_games (
    playlist_id INTEGER NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
    system_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (playlist_id, system_id, game_id)
);
