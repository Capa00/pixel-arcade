/**
 * Tastiera fisica tradotta negli stessi tasti logici del joypad (README §G).
 * La ripetizione automatica del sistema è ignorata: le direzioni si ripetono
 * con gli stessi tempi del joypad (vedi `diff` in mapping.js).
 */
import { diff, initialPadState } from './mapping.js'

const KEYS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'a',
  ' ': 'a',
  Escape: 'b',
  Backspace: 'b',
  '/': 'x',
  Delete: 'x',
  p: 'y',
  P: 'y',
  '[': 'lb',
  ']': 'rb',
  PageUp: 'lt',
  PageDown: 'rt',
  F2: 'start',
  F3: 'select',
}

/**
 * Tasto logico per un evento di tastiera (`{key, ctrlKey, altKey, metaKey}`),
 * oppure `null` se il tasto non è usato dalla dashboard. `extraKeys`
 * (`{g: 'cmd:<id>'}`) aggiunge i tasti dei comandi delle estensioni, senza
 * modificatori e solo per i tasti non già usati.
 */
export function keyToButton(event, extraKeys = {}) {
  if (event.altKey || event.metaKey) {
    return null
  }
  if (event.ctrlKey) {
    if (event.key === 'q' || event.key === 'Q') {
      // Chiusura della dashboard, con conferma (src/views/RunLayer.jsx).
      return 'quit'
    }
    return event.key === 'f' || event.key === 'F' ? 'x' : null
  }
  if (KEYS[event.key]) {
    return KEYS[event.key]
  }
  const key = typeof event.key === 'string' ? event.key.toLowerCase() : ''
  return Object.hasOwn(extraKeys, key) ? extraKeys[key] : null
}

// Con la tastiera a schermo aperta: tasti di modifica del testo (README §G).
const TEXT_KEYS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'start',
  Escape: 'b',
  Backspace: 'x',
  Home: 'lb',
  End: 'rb',
}

/**
 * Input da un evento di tastiera: `{button}` per un tasto logico, `{text}`
 * per un carattere da scrivere, oppure `null`. Con `textMode` (tastiera a
 * schermo aperta) i caratteri stampabili si scrivono direttamente, Invio
 * conferma (START), Esc annulla (B), Backspace cancella (X), Home/Fine
 * portano il cursore a inizio/fine (LB/RB della tastiera fisica: su joypad
 * spostano di un carattere, vedi src/input/controller.js). `extraKeys` vale solo fuori da
 * `textMode` (vedi `keyToButton`).
 */
export function keyInput(event, textMode, extraKeys = {}) {
  if (!textMode) {
    const button = keyToButton(event, extraKeys)
    return button ? { button } : null
  }
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return null
  }
  if (TEXT_KEYS[event.key]) {
    return { button: TEXT_KEYS[event.key] }
  }
  return [...event.key].length === 1 ? { text: event.key } : null
}

/**
 * Stato della tastiera: tasti fisici tenuti premuti (`event.code`) e relativo
 * tasto logico. Più tasti fisici possono valere lo stesso tasto logico
 * (Invio e Spazio → A): il tasto logico resta premuto finché ne resta uno.
 */
export class KeyboardState {
  constructor() {
    this.held = new Map()
    this.pad = initialPadState()
  }

  logical() {
    return new Set(this.held.values())
  }

  update(now) {
    const { state, events } = diff(this.pad, this.logical(), now)
    this.pad = state
    return events
  }

  /** Tasto premuto: restituisce gli eventi logici generati. */
  down(code, button, now) {
    this.held.set(code, button)
    return this.update(now)
  }

  /** Tasto rilasciato: restituisce gli eventi logici generati. */
  up(code, now) {
    this.held.delete(code)
    return this.update(now)
  }

  /** Ripetizioni dovute al tempo `now` per le direzioni tenute premute. */
  tick(now) {
    return this.held.size ? this.update(now) : []
  }

  /** Rilascia tutto (per esempio quando la finestra perde il focus). */
  clear(now) {
    this.held.clear()
    return this.update(now)
  }
}
