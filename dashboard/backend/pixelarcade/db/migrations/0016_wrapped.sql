-- Wrapped: riepiloghi del mese e dell'anno già visti, per non riproporre l'avviso.

-- `account_id` è il profilo, 0 per il Wrapped di casa; `period` è `AAAA-MM` (mese) o `AAAA` (anno).
CREATE TABLE wrapped_seen (
    account_id INTEGER NOT NULL,
    period TEXT NOT NULL,
    seen_at TEXT NOT NULL,
    PRIMARY KEY (account_id, period)
);
