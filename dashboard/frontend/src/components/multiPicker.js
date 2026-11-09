/**
 * Logica pura del menu a selezione multipla (src/components/MultiPickerMenu.jsx):
 * ricerca, gruppi, spunte e spostamenti. Le voci sono `{id, label, note,
 * group, search}`: `search` è altro testo in cui cercare (per esempio le
 * tipologie di un core). Le spunte sono una lista di id.
 */
import { normalizeText, queryWords } from '../lib/search.js'
import { stepIndex } from '../input/wrap.js'

/** Id della riga «Seleziona tutte», prima delle voci. */
export const ALL = '__all__'

/** Id della riga «Modo» (Mostra solo / Nascondi), prima di «Seleziona tutte» nei menu dei filtri che la hanno. */
export const MODE = '__mode__'

const haystacks = new WeakMap()

function haystack(item) {
  let text = haystacks.get(item)
  if (text === undefined) {
    text = normalizeText(`${item.label} ${item.note || ''} ${item.search || ''}`)
    haystacks.set(item, text)
  }
  return text
}

/**
 * Voci che contengono tutte le parole di `query` in un punto qualunque di
 * nome, nota o testo di ricerca, senza distinguere maiuscole e accenti.
 * Senza parole restituisce `items` stesso.
 */
export function filterItems(items, query) {
  const words = queryWords(query)
  if (!words.length) {
    return items
  }
  return items.filter((item) => {
    const text = haystack(item)
    return words.every((word) => text.includes(word))
  })
}

/**
 * Righe da mostrare: intestazione di gruppo (`{kind: 'group', group}`) prima
 * della prima voce di ogni gruppo, poi le voci (`{kind: 'item', item}`).
 * I gruppi senza voci filtrate non compaiono; le voci restano nell'ordine
 * ricevuto.
 */
export function groupRows(items) {
  const rows = []
  let last = null
  for (const item of items) {
    if (item.group && item.group !== last) {
      rows.push({ kind: 'group', group: item.group })
      last = item.group
    }
    rows.push({ kind: 'item', item })
  }
  return rows
}

/** Posizioni del cursore: la riga «Modo» (con `mode`), «Seleziona tutte» e poi gli id delle voci filtrate. */
export function cursorIds(visible, mode = false) {
  return [...(mode ? [MODE] : []), ALL, ...visible.map((item) => item.id)]
}

/** Cursore valido per le voci filtrate: resta dov'è se la voce è ancora visibile, altrimenti va sulla prima voce. */
export function keepCursor(visible, cursor) {
  if (cursor === ALL || cursor === MODE || visible.some((item) => item.id === cursor)) {
    return cursor
  }
  return visible.length ? visible[0].id : ALL
}

/**
 * Cursore spostato di `dir` righe (-1 su, 1 giù); ai bordi, con `wrap` riparte dall'altro capo.
 * Con `mode` c'è anche la riga «Modo».
 */
export function moveCursor(visible, cursor, dir, wrap = false, mode = false) {
  const ids = cursorIds(visible, mode)
  const at = Math.max(0, ids.indexOf(cursor))
  return ids[stepIndex(at, dir, ids.length, wrap)]
}

/**
 * Prima voce del gruppo successivo (`dir` = 1) o precedente (-1), come il
 * salto per lettera della libreria. Ai bordi, con `wrap` si riparte dal
 * gruppo all'altro capo, altrimenti il cursore non cambia; da «Seleziona
 * tutte», 1 va alla prima voce e -1 (con `wrap`) all'ultimo gruppo.
 */
export function jumpGroup(visible, cursor, dir, wrap = false) {
  if (!visible.length) {
    return cursor
  }
  const starts = []
  visible.forEach((item, index) => {
    if (index === 0 || item.group !== visible[index - 1].group) {
      starts.push(index)
    }
  })
  const at = visible.findIndex((item) => item.id === cursor)
  if (at < 0) {
    if (dir > 0) {
      return visible[0].id
    }
    return wrap ? visible[starts[starts.length - 1]].id : cursor
  }
  let current = 0
  while (current + 1 < starts.length && starts[current + 1] <= at) {
    current += 1
  }
  const target = current + (dir > 0 ? 1 : -1)
  if (target >= 0 && target < starts.length) {
    return visible[starts[target]].id
  }
  return wrap && starts.length > 1 ? visible[starts[target < 0 ? starts.length - 1 : 0]].id : cursor
}

/** Spunta o toglie la spunta alla voce `id`. */
export function toggle(selected, id) {
  return selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id]
}

/** Vero se tutte le voci filtrate (almeno una) sono spuntate. */
export function allSelected(selected, visible) {
  return visible.length > 0 && visible.every((item) => selected.includes(item.id))
}

/**
 * «Seleziona tutte»: spunta le voci filtrate; se lo sono già tutte, toglie
 * la spunta solo a quelle. Le spunte delle voci nascoste dal filtro restano.
 */
export function toggleAll(selected, visible) {
  if (allSelected(selected, visible)) {
    const shown = new Set(visible.map((item) => item.id))
    return selected.filter((id) => !shown.has(id))
  }
  const result = [...selected]
  for (const item of visible) {
    if (!result.includes(item.id)) {
      result.push(item.id)
    }
  }
  return result
}

/** Gruppo per iniziale (`A`–`Z`, `#` per cifre e simboli), per i menu senza produttore. */
export function initialGroup(text) {
  const first = normalizeText(text).charAt(0).toUpperCase()
  return first >= 'A' && first <= 'Z' ? first : '#'
}
