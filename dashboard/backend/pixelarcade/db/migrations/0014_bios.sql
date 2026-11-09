-- BIOS e altri file di sistema copiati dalla dashboard nella cartella di sistema di RetroArch.

-- `path` è relativo alla cartella di sistema (`scph5501.bin`, `pcsx2/bios/ps2.bin`).
-- `kind`: `info` (dichiarato nel `.info` del core), `option` (indicato da un'opzione del core)
-- oppure `manual` (aggiunto a mano). `original` è il nome del file scelto, `md5` il suo checksum.
-- Solo i file di questa tabella si possono togliere dalla dashboard.
CREATE TABLE bios_files (
    path TEXT PRIMARY KEY,
    core TEXT NOT NULL,
    kind TEXT NOT NULL,
    original TEXT NOT NULL,
    md5 TEXT NOT NULL,
    size INTEGER NOT NULL,
    added_at TEXT NOT NULL
);
