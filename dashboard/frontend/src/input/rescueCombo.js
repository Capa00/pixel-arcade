/**
 * Combinazione di emergenza dei salvataggi di soccorso, predefinita SELECT +
 * grilletto destro (`['select', 'rt']`): tenuta per `RESCUE_HOLD_MS` chiude
 * il gioco senza salvare il «Riprendi» (`POST /api/run/rescue`), poi si
 * sceglie da dove riprendere. Si legge con lo stesso timer della
 * combinazione dei salvataggi (src/input/saveCombo.js). Solo funzioni pure.
 */
import { buttonsFor, readPad } from './mapping.js'
import { sharedHold } from './quitCombo.js'
import { comboError, comboHeld } from './saveCombo.js'

export const DEFAULT_RESCUE_COMBO = ['select', 'rt']
// Tempo di pressione: evita di uscire per sbaglio.
export const RESCUE_HOLD_MS = 2000
// Con il tasto dell'uscita nella combinazione: la richiesta arriva al backend
// prima che RetroArch esca da solo dopo 2 secondi salvando il «Riprendi».
export const RESCUE_SHARED_MS = 1000

/** Tempo di pressione dell'emergenza `rescue` con l'uscita `quitCombo` (ms). */
export function rescueHoldMs(quitCombo, rescue) {
  return sharedHold(quitCombo, rescue) ? RESCUE_SHARED_MS : RESCUE_HOLD_MS
}

/** Stato iniziale: nessun joypad con la combinazione tenuta. */
export function initialRescueCombo() {
  return { since: {}, done: {} }
}

/**
 * Applica una lettura dei joypad (`gamepads`, come `navigator.getGamepads()`,
 * con `padButtons` i tasti di ogni joypad) al tempo `now` (ms). Restituisce `{state, fired}`: `fired` è vero quando un
 * joypad ha appena tenuto la combinazione per `holdMs`. Ogni pressione vale
 * una volta sola: si ripete solo dopo aver rilasciato.
 */
export function rescueStep(state, gamepads, padButtons, combo, now, holdMs = RESCUE_HOLD_MS) {
  const since = {}
  const done = {}
  let fired = false
  for (const pad of gamepads || []) {
    if (!pad || !comboHeld(readPad(pad, buttonsFor(padButtons, pad)), combo)) {
      continue
    }
    since[pad.index] = state.since[pad.index] ?? now
    done[pad.index] = Boolean(state.done[pad.index])
    if (!done[pad.index] && now - since[pad.index] >= holdMs) {
      done[pad.index] = true
      fired = true
    }
  }
  return { state: { since, done }, fired }
}

/** Vero se le due combinazioni usano gli stessi tasti, in qualunque ordine. */
export function sameCombo(first, second) {
  return Array.isArray(first) && Array.isArray(second) && first.length === second.length &&
    first.every((name) => second.includes(name))
}

/**
 * Motivo per cui `names` non va bene come combinazione di emergenza, oppure
 * `null`. Come la validazione del backend.
 */
export function rescueComboError(names, saveCombo) {
  const error = comboError(names)
  if (error) {
    return error
  }
  if (sameCombo(names, saveCombo)) {
    return 'Questa combinazione apre già i salvataggi: scegline un\'altra.'
  }
  return null
}
