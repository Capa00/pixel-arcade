-- Salvataggi condivisi (README «Salvataggi condivisi»): lo slot ricorda da quale salvataggio condiviso è nato.
-- NULL = partita con il salvataggio interno del profilo; altrimenti il nome della cartella del salvataggio condiviso.
ALTER TABLE saves ADD COLUMN shared TEXT;
