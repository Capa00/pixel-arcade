-- Impostazioni delle estensioni per il torneo (README «Estensioni dei tornei»): JSON `{id dell'estensione: {...}}`.
-- Un'estensione senza voce usa i suoi valori predefiniti.
ALTER TABLE tournaments ADD COLUMN addons TEXT NOT NULL DEFAULT '{}';
