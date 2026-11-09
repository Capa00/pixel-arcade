-- Bozza della schermata «Avvia» del torneo (README «Torneo»): le scelte dell'admin non ancora confermate.

-- `start_draft`: JSON `{step, settings, order, slots, players, savedAt}` (vuoto = nessuna bozza). `players` sono
-- gli iscritti al momento del salvataggio: se cambiano, teste di serie e caselle non valgono più. Si cancella
-- all'avvio, all'annullamento e quando l'admin cambia il formato nelle Impostazioni.
ALTER TABLE tournaments ADD COLUMN start_draft TEXT NOT NULL DEFAULT '';
