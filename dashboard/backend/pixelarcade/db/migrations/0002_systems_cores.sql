-- Console con impostazioni proprie: una riga per cartella di games/.
-- Estensioni vuote = quelle predefinite del sistema (systems.py).
CREATE TABLE systems (
    id TEXT PRIMARY KEY,
    extensions TEXT NOT NULL DEFAULT ''
);

-- Core di ogni console, nell'ordine in cui vanno provati (posizione da 0).
CREATE TABLE system_cores (
    system_id TEXT NOT NULL REFERENCES systems (id) ON DELETE CASCADE,
    core TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (system_id, core),
    UNIQUE (system_id, position)
);
