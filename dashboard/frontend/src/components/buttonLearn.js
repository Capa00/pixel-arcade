/**
 * Nomi dei tasti logici e annullamento col tasto tenuto
 * (src/components/ComboLearn.jsx, src/lib/tips.js).
 */

/** Tempo (ms) per cui tenere premuto il tasto «indietro» del joypad per annullare. */
export const CANCEL_HOLD_MS = 1500

/** Nome mostrato di ogni tasto logico (senza lettere legate a una marca, README §G). */
export const BUTTON_TITLES = {
  a: 'Conferma',
  b: 'Indietro',
  x: 'Cerca',
  y: 'Preferito',
  lb: 'Dorsale sinistro',
  rb: 'Dorsale destro',
  lt: 'Grilletto sinistro',
  rt: 'Grilletto destro',
  select: 'SELECT',
  start: 'START',
}
