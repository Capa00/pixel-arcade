/**
 * Combinazione dei salvataggi in partita (Sprint 04 dei salvataggi),
 * predefinita SELECT + grilletto sinistro (`['select', 'lt']`, nomi di
 * src/input/mapping.js). Solo funzioni pure.
 *
 * Durante la partita RetroArch è in primo piano e la dashboard non riceve gli
 * eventi del joypad: RunLayer legge `navigator.getGamepads()` con un timer
 * (`requestAnimationFrame` si ferma, Sprint 01) e passa qui i joypad letti.
 */
import { BUTTON_NAMES, buttonsFor, readPad } from './mapping.js'
import { SLOTS, slotOfPad } from '../state/players.js'

export const DEFAULT_SAVE_COMBO = ['select', 'lt']
// Intervallo di lettura dei joypad durante la partita.
export const COMBO_POLL_MS = 100

const QUIT = new Set(['start', 'select'])

/** Stato iniziale: nessun joypad con la combinazione premuta. */
export function initialSaveCombo() {
  return { held: {} }
}

/** Vero se nei tasti logici premuti (`pressed`, un `Set`) ci sono entrambi i tasti della combinazione. */
export function comboHeld(pressed, combo) {
  return Array.isArray(combo) && combo.length === 2 && combo.every((name) => pressed.has(name))
}

/**
 * Applica una lettura dei joypad (`gamepads`, come `navigator.getGamepads()`,
 * con `padButtons` i tasti di ogni joypad, `{id: {a: 0, …}}`). Restituisce `{state, fired}`:
 * `fired` sono gli indici dei joypad che hanno appena premuto la
 * combinazione. Ogni pressione vale una volta sola: si ripete solo dopo aver
 * rilasciato almeno uno dei due tasti.
 */
export function comboStep(state, gamepads, padButtons, combo) {
  const held = {}
  const fired = []
  for (const pad of gamepads || []) {
    if (!pad) {
      continue
    }
    const now = comboHeld(readPad(pad, buttonsFor(padButtons, pad)), combo)
    held[pad.index] = now
    if (now && !state.held[pad.index]) {
      fired.push(pad.index)
    }
  }
  return { state: { held }, fired }
}

/**
 * Giocatore (`p1`/`p2`) che ha premuto la combinazione sul joypad `pad`: chi
 * possiede quel joypad, altrimenti il primo giocatore entrato senza joypad
 * (in RetroArch riceve un joypad libero); `null` se nessuno.
 */
export function comboSlot(players, pad) {
  const owner = slotOfPad(players, pad)
  if (owner) {
    return owner
  }
  return SLOTS.find((key) => players[key].user && (players[key].pad === null || players[key].pad === undefined)) || null
}

/** Motivo per cui la combinazione `names` non va bene, oppure `null`. Come la validazione del backend. */
export function comboError(names) {
  if (!Array.isArray(names) || names.length !== 2 || !names.every((name) => BUTTON_NAMES.includes(name))) {
    return 'Tieni premuti insieme due tasti del joypad.'
  }
  if (names[0] === names[1]) {
    return 'Servono due tasti diversi.'
  }
  if (names.every((name) => QUIT.has(name))) {
    return 'START+SELECT è il reset di molti giochi: scegli un\'altra combinazione.'
  }
  return null
}

/**
 * Combinazione dai tasti grezzi tenuti insieme (`indices`) con la mappatura
 * `buttons` (`{a: 0, …}`): `{combo}` se va bene, altrimenti `{error}`.
 */
export function learnCombo(buttons, indices) {
  const names = []
  for (const index of indices) {
    const name = BUTTON_NAMES.find((entry) => buttons[entry] === index)
    if (!name) {
      return { error: 'Usa due tasti tra quelli assegnati qui sopra (non la croce).' }
    }
    names.push(name)
  }
  const error = comboError(names)
  return error ? { error } : { combo: names }
}
