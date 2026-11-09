/**
 * Combinazione START+SELECT (README §G) sullo stesso joypad: rilasciata entro
 * 1 s scollega i giocatori e torna a «PRESS START» (colpo breve, `tap`);
 * rilasciata tra 1 e 3 s si annulla; tenuta 3 s chiude la dashboard.
 * Funzioni pure: `comboInput` riceve gli eventi logici prima del controller e
 * restituisce quelli da inoltrare.
 *
 * START e SELECT da soli agiscono al rilascio: la pressione viene trattenuta
 * e, al rilascio, si inoltrano una pressione e un rilascio. Se sullo stesso
 * joypad sono stati premuti insieme, i due rilasci non si inoltrano. Un
 * rilascio senza pressione vista (per esempio tasti ancora premuti al
 * ritorno da RetroArch) viene ignorato.
 */

export const EXIT_HOLD_MS = 3000
// Entro questo tempo il rilascio della combinazione è un colpo breve.
export const TAP_MS = 1000

const COMBO = new Set(['start', 'select'])

/** Stato iniziale: nessun tasto tenuto, nessuna combinazione in corso. */
export function initialCombo() {
  return { held: {}, active: null, since: 0, used: {} }
}

function padKey(event) {
  return event.pad === null || event.pad === undefined ? 'none' : String(event.pad)
}

/**
 * Applica l'evento `event` al tempo `now` (ms). Restituisce
 * `{combo, events, tap}`: il nuovo stato, gli eventi da inoltrare al
 * controller e, vero, se la combinazione è stata rilasciata entro `TAP_MS`.
 */
export function comboInput(combo, event, now) {
  if (!event || !COMBO.has(event.button) || (event.kind !== 'press' && event.kind !== 'release')) {
    return { combo, events: event ? [event] : [] }
  }
  const key = padKey(event)
  const held = combo.held[key] || []
  if (event.kind === 'press') {
    const next = held.includes(event.button) ? held : [...held, event.button]
    const result = { ...combo, held: { ...combo.held, [key]: next } }
    if (next.length === COMBO.size && combo.active === null) {
      result.active = key
      result.since = now
      result.used = { ...combo.used, [key]: true }
    }
    return { combo: result, events: [] }
  }
  if (!held.includes(event.button)) {
    return { combo, events: [] }
  }
  const rest = held.filter((button) => button !== event.button)
  const result = { ...combo, held: { ...combo.held, [key]: rest } }
  const tap = combo.active === key && now - combo.since < TAP_MS
  if (combo.active === key) {
    result.active = null
  }
  if (combo.used[key]) {
    if (!rest.length) {
      result.used = { ...combo.used, [key]: false }
    }
    return { combo: result, events: [], tap }
  }
  return { combo: result, events: [{ ...event, kind: 'press' }, event] }
}

/** Avanzamento della combinazione (da 0 a 1) al tempo `now`, oppure `null` se non è in corso. */
export function comboProgress(combo, now) {
  if (combo.active === null) {
    return null
  }
  return Math.max(0, Math.min(1, (now - combo.since) / EXIT_HOLD_MS))
}
