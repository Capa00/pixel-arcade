-- Avatar Gravatar dei profili: solo l'hash SHA-256 dell'email normalizzata, l'email non si salva.
ALTER TABLE accounts ADD COLUMN gravatar TEXT;
