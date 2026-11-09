/**
 * Disposizione della tastiera a schermo e movimento nella sua griglia
 * irregolare. Solo funzioni pure.
 *
 * Ogni riga è larga `WIDTH` unità ed è centrata; ogni tasto ha una larghezza
 * in unità. Salendo o scendendo si va sul tasto della riga vicina con il
 * centro più vicino a quello del tasto attuale.
 */

import { stepIndex } from '../input/wrap.js'

export const WIDTH = 10

function chars(text) {
  return [...text].map((char) => ({ type: 'char', char, width: 1 }))
}

const PAGE_KEY = { type: 'page', label: '#+=', width: 2 }
const LETTERS_KEY = { type: 'page', label: 'ABC', width: 2 }

function bottomRow(secret, reveal) {
  if (!secret) {
    return [
      { type: 'shift', label: 'MAIUSC', width: 2 },
      { type: 'space', label: 'SPAZIO', width: 4 },
      { type: 'erase', label: '⌫', width: 2 },
      { type: 'ok', label: 'OK', width: 2 },
    ]
  }
  return [
    { type: 'shift', label: 'MAIUSC', width: 2 },
    { type: 'space', label: 'SPAZIO', width: 2 },
    { type: 'reveal', label: reveal ? 'NASCONDI' : 'MOSTRA', width: 2 },
    { type: 'erase', label: '⌫', width: 2 },
    { type: 'ok', label: 'OK', width: 2 },
  ]
}

/** Pagina delle lettere (quella iniziale). */
export const ROWS = [
  chars('1234567890'),
  chars('qwertyuiop'),
  chars('asdfghjkl'),
  chars('zxcvbnm'),
  [...chars("/~.-_'&"), PAGE_KEY],
  bottomRow(false),
]

/**
 * Pagina dei simboli: con le cifre, tutti i caratteri stampabili ASCII che non
 * sono lettere, gli ordinali ° ª º («1° torneo», «1ª edizione») e le vocali
 * accentate dell'italiano (con MAIUSC in maiuscolo).
 */
export const SYMBOL_ROWS = [
  chars('1234567890'),
  chars('!@#$%^&*()'),
  chars('-_=+[]{};'),
  chars(':\'",.<>?/'),
  [...chars('\\|`~°ªº'), LETTERS_KEY],
  chars('àèéìòóù'),
  bottomRow(false),
]

/**
 * Righe della tastiera `osk`: pagina dei simboli con `osk.symbols`; con
 * `osk.secret` (password) l'ultima riga ha anche MOSTRA/NASCONDI.
 */
export function layout(osk) {
  const rows = osk && osk.symbols ? SYMBOL_ROWS : ROWS
  if (!osk || !osk.secret) {
    return rows
  }
  return [...rows.slice(0, -1), bottomRow(true, osk.reveal)]
}

/** Posizione iniziale del cursore: la `q`. */
export const START = { row: 1, col: 0 }

/** Tasto in posizione `{row, col}` delle righe `rows`, oppure `null`. */
export function keyAt(pos, rows = ROWS) {
  const row = rows[pos.row]
  return (row && row[pos.col]) || null
}

/** Stessa riga, o l'ultimo tasto se la riga di `rows` è più corta (cambio di pagina). */
export function clampPos(pos, rows = ROWS) {
  const row = Math.min(pos.row, rows.length - 1)
  return { row, col: Math.min(pos.col, rows[row].length - 1) }
}

/** Carattere scritto dal tasto `key`, in maiuscolo se `upper`. */
export function keyChar(key, upper) {
  return upper ? key.char.toUpperCase() : key.char
}

/** Centro orizzontale, in unità, del tasto `col` della riga `row` di `rows`. */
export function keyCenter(row, col, rows = ROWS) {
  const keys = rows[row]
  const total = keys.reduce((sum, key) => sum + key.width, 0)
  let x = (WIDTH - total) / 2
  for (let at = 0; at < col; at += 1) {
    x += keys[at].width
  }
  return x + keys[col].width / 2
}

/**
 * Nuova posizione spostandosi di un tasto nella direzione `dir`
 * (`up`, `down`, `left`, `right`). Oltre il bordo, con `wrap` (pressione
 * singola) si ricomincia dall'altro capo della riga o della colonna,
 * altrimenti ci si ferma. `rows` sono le righe della pagina (`layout(osk)`).
 */
export function move(pos, dir, wrap = false, rows = ROWS) {
  if (dir === 'left' || dir === 'right') {
    return { row: pos.row, col: stepIndex(pos.col, dir === 'left' ? -1 : 1, rows[pos.row].length, wrap) }
  }
  if (dir !== 'up' && dir !== 'down') {
    return pos
  }
  const row = stepIndex(pos.row, dir === 'up' ? -1 : 1, rows.length, wrap)
  if (row === pos.row) {
    return pos
  }
  const x = keyCenter(pos.row, pos.col, rows)
  let best = 0
  for (let col = 1; col < rows[row].length; col += 1) {
    if (Math.abs(keyCenter(row, col, rows) - x) < Math.abs(keyCenter(row, best, rows) - x)) {
      best = col
    }
  }
  return { row, col: best }
}
