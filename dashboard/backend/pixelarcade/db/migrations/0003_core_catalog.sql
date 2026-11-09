-- Sprint 04b: lista dei core per console senza posizione (ordine automatico),
-- nomi brevi dei core ("fbneo" invece di "fbneo_libretro.so") ed elenco del buildbot.

-- 1 se la lista dei core è stata salvata; 0 = lista predefinita (core delle tipologie del preset).
ALTER TABLE systems ADD COLUMN cores_set INTEGER NOT NULL DEFAULT 0;

UPDATE systems SET cores_set = 1 WHERE id IN (SELECT system_id FROM system_cores);

CREATE TABLE system_cores_new (
    system_id TEXT NOT NULL REFERENCES systems (id) ON DELETE CASCADE,
    core TEXT NOT NULL,
    PRIMARY KEY (system_id, core)
);

INSERT OR IGNORE INTO system_cores_new (system_id, core)
    SELECT system_id, substr(core, 1, length(core) - 12) FROM system_cores
    WHERE substr(core, -12) = '_libretro.so' AND length(core) > 12;

DROP TABLE system_cores;

ALTER TABLE system_cores_new RENAME TO system_cores;

-- Core scaricabili per Linux x86_64 (.index-extended del buildbot libretro).
CREATE TABLE buildbot_cores (
    core TEXT PRIMARY KEY,
    crc TEXT NOT NULL,
    date TEXT NOT NULL
);

-- Core scaricati dalla dashboard (sprint 05): solo questi si possono eliminare.
CREATE TABLE downloaded_cores (
    core TEXT PRIMARY KEY,
    size INTEGER NOT NULL,
    downloaded_at TEXT NOT NULL
);
