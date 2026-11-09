/**
 * Conferma di uscita con attività delle estensioni in corso (`GET /api/exit/check`).
 * Solo funzioni pure.
 */

// Scelta evidenziata all'apertura: continuare le attività dopo la chiusura.
export const EXIT_CHOICE = 'yes'

// Clic fuori dal pannello: la chiusura si annulla (non vale «No», che chiude del tutto).
export const EXIT_CANCEL = 'cancel'

/** Domanda della conferma per le frasi `busy`, come «2 operazioni in corso. Continuarli dopo la chiusura?». */
export function exitQuestion(busy) {
  return `${busy.join(' · ')}. Continuarli dopo la chiusura?`
}
