-- Console della riga (API.md, «Console della riga»): stato deciso nelle Impostazioni.
-- shown = 1 accesa per tutti, shown = 0 spenta; senza riga vale il predefinito
-- (accesa se la console ha giochi). Le console spente finora restano spente.
CREATE TABLE console_settings (
    system_id TEXT PRIMARY KEY,
    shown INTEGER NOT NULL CHECK (shown IN (0, 1))
);

INSERT INTO console_settings (system_id, shown) SELECT system_id, 0 FROM consoles_off;

DROP TABLE consoles_off;
