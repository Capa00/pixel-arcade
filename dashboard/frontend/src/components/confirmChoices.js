/**
 * Scelte della finestra di conferma (src/components/ConfirmDialog.jsx).
 * Ogni scelta è `{id, label, tone}`; `tone` facoltativo colora il pulsante
 * (`danger` rosso, `ok` verde). Solo funzioni pure.
 */
import { stepIndex } from '../input/wrap.js'

/** Scelte predefinite: Sì e No. */
export const YES_NO = [
  { id: 'yes', label: 'Sì' },
  { id: 'no', label: 'No' },
]

// Direzioni → verso dello spostamento tra le scelte (da sinistra a destra).
const STEPS = { left: -1, up: -1, right: 1, down: 1 }

/**
 * Scelta evidenziata dopo la direzione `button` partendo da `current`. Oltre
 * il bordo, con `wrap` (pressione singola) si riparte dall'altro capo.
 * Restituisce `current` se `button` non è una direzione.
 */
export function moveChoice(choices, current, button, wrap) {
  const dir = STEPS[button]
  if (!dir || !choices.length) {
    return current
  }
  const at = Math.max(0, choices.findIndex((choice) => choice.id === current))
  return choices[stepIndex(at, dir, choices.length, wrap)].id
}
