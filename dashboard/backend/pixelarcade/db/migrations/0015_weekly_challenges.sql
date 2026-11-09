-- Sfida della settimana: il gioco estratto per ogni settimana, che resta lo stesso fino a domenica.

-- `week` è la data del lunedì (ora locale, `AAAA-MM-GG`); il gioco viene da quelli già giocati da un profilo.
CREATE TABLE weekly_challenges (
    week TEXT PRIMARY KEY,
    system_id TEXT NOT NULL,
    game_id TEXT NOT NULL,
    picked_at TEXT NOT NULL
);
