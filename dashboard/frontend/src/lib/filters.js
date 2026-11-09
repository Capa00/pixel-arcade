/**
 * Filtri sui metadati dei giochi: campi filtrabili, valori presenti (con il
 * numero di giochi), giochi che rispettano i filtri e riepilogo dei filtri
 * attivi. Tra i valori dello stesso campo vale «o», tra campi diversi «e».
 * I giochi senza un dato hanno il valore `NONE` («Non indicato»), che si può
 * scegliere come gli altri. Solo funzioni pure.
 *
 * `filters.exclude` è l'elenco dei campi `multi` in modo «Nascondi»: lì i
 * valori scelti escludono i giochi che li hanno invece di tenerli. Nel campo
 * Titolo una parola preceduta da `-` esclude (src/lib/search.js, `splitQuery`).
 *
 * `filterKit(fields)` crea le stesse funzioni per un altro elenco di campi;
 * quelle esportate qui usano `FIELDS`.
 */
import { initialGroup } from '../components/multiPicker.js'
import { languageName } from './gameInfo.js'
import { normalizeText, queryWords, splitQuery, textMatches } from './search.js'

export const NONE = '__none__'
export const NONE_LABEL = 'Non indicato'

// Voce «Qualsiasi» del filtro Giocatori (nessun filtro).
export const ANY = '__any__'
// Numeri minimi di giocatori proposti dal filtro Giocatori.
const MIN_PLAYERS = [2, 3, 4]

/** Valori di un campo come lista di testi non vuoti. */
export function list(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' && item !== '')
  }
  return typeof value === 'string' && value !== '' ? [value] : []
}

function byLabel(a, b) {
  return a.label.localeCompare(b.label, 'it', { sensitivity: 'base' })
}

/** Ordinamento per numero delle voci di un menu (anni, dischi). */
export function byNumber(a, b) {
  return Number(a.id) - Number(b.id)
}

/** Tipi del campo `kind` dei metadati, nell'ordine del menu, con il nome mostrato. */
export const KIND_LABELS = {
  original: 'Originale',
  hack: 'Hack',
  translation: 'Traduzione',
  prototype: 'Prototipo',
  homebrew: 'Homebrew',
  unreleased: 'Inedito',
  bootleg: 'Bootleg',
  unlicensed: 'Senza licenza',
  demo: 'Demo',
}
const KIND_ORDER = Object.keys(KIND_LABELS)

function decade(value) {
  return `Anni ${Math.floor(Number(value) / 10) * 10}`
}

/**
 * Campi filtrabili, nell'ordine del pannello. `kind`: `text` (ricerca nel
 * titolo), `multi` (più valori) o `single` (Giocatori: almeno N). Per i
 * campi `multi`: `values(game)` dà i valori del gioco, `name(value)` il
 * nome mostrato (se diverso dal valore), `group(value)` il gruppo nel menu, `order` l'ordinamento.
 */
export const FIELDS = [
  { id: 'title', label: 'Titolo', kind: 'text' },
  { id: 'genre', label: 'Genere', kind: 'multi', values: (game) => list(game.genre) },
  { id: 'region', label: 'Regione', kind: 'multi', values: (game) => list(game.region) },
  { id: 'language', label: 'Lingua', kind: 'multi', values: (game) => list(game.languages), name: languageName },
  {
    id: 'year',
    label: 'Anno',
    kind: 'multi',
    values: (game) => (Number.isInteger(game.year) ? [String(game.year)] : []),
    group: decade,
    order: byNumber,
  },
  { id: 'players', label: 'Giocatori', kind: 'single' },
  { id: 'developer', label: 'Sviluppatore', kind: 'multi', values: (game) => list(game.developer), group: initialGroup },
  { id: 'publisher', label: 'Editore', kind: 'multi', values: (game) => list(game.publisher), group: initialGroup },
  {
    id: 'kind',
    label: 'Tipo',
    kind: 'multi',
    values: (game) => list(game.kind),
    name: (value) => KIND_LABELS[value] || value,
    order: (a, b) => KIND_ORDER.indexOf(a.id) - KIND_ORDER.indexOf(b.id),
    optional: true,
  },
  {
    id: 'achievements',
    label: 'Trofei',
    kind: 'multi',
    values: (game) => (game.achievements === true ? ['yes'] : game.achievements === false ? ['no'] : []),
    name: (value) => (value === 'yes' ? 'Compatibili' : 'Non compatibili'),
    optional: true,
  },
]

/** Vero se almeno un gioco di `games` ha un valore nel campo `multi` `field`. */
function hasData(field, games) {
  return (games || []).some((game) => field.values(game).length > 0)
}

/**
 * Campi di `fields` da mostrare per i giochi `games`: quelli `optional`
 * (Tipo, Trofei) solo se almeno un gioco ha il dato.
 */
export function shownFields(fields, games) {
  return fields.filter((field) => !field.optional || hasData(field, games))
}

/** Vero se il campo `id` di `filters` è in modo «Nascondi». */
export function isExcluded(filters, id) {
  return Boolean(filters && Array.isArray(filters.exclude) && filters.exclude.includes(id))
}

/** Elenco `exclude` di `filters` con il campo `id` in modo «Nascondi» (`on`) oppure «Mostra solo». */
export function withExcluded(filters, id, on) {
  const current = (filters && Array.isArray(filters.exclude) ? filters.exclude : []).filter((entry) => entry !== id)
  return on ? [...current, id] : current
}

/** Numero massimo di giocatori dal testo «1–4» (o «2»), oppure `null` se non è indicato. */
export function playerMax(game) {
  const numbers = String((game && game.players) || '').match(/\d+/g)
  return numbers ? Math.max(...numbers.map(Number)) : null
}

// Valori mostrati per esteso nel riepilogo di un campo; gli altri diventano «+N».
const SHOWN_VALUES = 2

/** Funzioni dei filtri per i campi `fields` (vedi `FIELDS`). */
export function filterKit(fields) {
  const byId = new Map(fields.map((field) => [field.id, field]))
  const titles = new WeakMap()

  /** Campo `id`, oppure `undefined`. */
  function fieldOf(id) {
    return byId.get(id)
  }

  /** Filtri vuoti: nessun testo, nessun valore scelto, Giocatori qualsiasi, nessun campo in modo «Nascondi». */
  const EMPTY_FILTERS = Object.freeze({
    ...Object.fromEntries(fields.map((field) => [field.id, { text: '', single: null, multi: [] }[field.kind]])),
    exclude: [],
  })

  /** Valori del gioco `game` nel campo `multi` `field`; `[NONE]` se non ne ha. */
  function gameValues(field, game) {
    const values = field.values(game)
    return values.length ? values : [NONE]
  }

  /** Nome del valore `value` del campo `id`. */
  function valueLabel(id, value) {
    if (value === NONE) {
      return NONE_LABEL
    }
    if (id === 'players') {
      return value === ANY || value === null ? 'Qualsiasi' : `Almeno ${value} giocatori`
    }
    const field = fieldOf(id)
    return field && field.name ? field.name(value) : value
  }

  /**
   * Voci del menu del campo `multi` `id` per i giochi `games`: `{id, label,
   * note, group}` con il numero di giochi in `note`, ordinate per nome (o per
   * numero), con «Non indicato» in fondo. I valori di `keep` (già scelti)
   * restano nel menu anche se nessun gioco li ha, con 0 giochi.
   */
  function filterOptions(games, id, keep = []) {
    const field = fieldOf(id)
    const counts = new Map()
    for (const game of games || []) {
      for (const value of new Set(gameValues(field, game))) {
        counts.set(value, (counts.get(value) || 0) + 1)
      }
    }
    for (const value of keep) {
      if (!counts.has(value)) {
        counts.set(value, 0)
      }
    }
    const items = []
    let none = null
    for (const [value, count] of counts) {
      const item = { id: value, label: valueLabel(id, value), note: String(count) }
      if (value === NONE) {
        none = item
      } else {
        items.push(field.group ? { ...item, group: field.group(value) } : item)
      }
    }
    items.sort(field.order || byLabel)
    if (none) {
      items.push(field.group ? { ...none, group: '—' } : none)
    }
    return items
  }

  function titleText(game) {
    let text = titles.get(game)
    if (text === undefined) {
      text = normalizeText(game.title)
      titles.set(game, text)
    }
    return text
  }

  /** Vero se il campo `id` di `filters` restringe l'elenco. */
  function fieldActive(filters, id) {
    const value = filters[id]
    const field = fieldOf(id)
    if (!field) {
      return false
    }
    if (field.kind === 'text') {
      return queryWords(value).length > 0
    }
    if (field.kind === 'single') {
      return value !== null && value !== undefined && value !== ANY
    }
    return Array.isArray(value) && value.length > 0
  }

  /** Id dei campi attivi, nell'ordine del pannello. */
  function activeFields(filters) {
    return fields.filter((field) => fieldActive(filters || EMPTY_FILTERS, field.id)).map((field) => field.id)
  }

  /** Vero se almeno un filtro è attivo. */
  function hasFilters(filters) {
    return activeFields(filters).length > 0
  }

  function matches(game, filters, active, words) {
    for (const id of active) {
      if (id === 'title') {
        if (!textMatches(titleText(game), words)) {
          return false
        }
      } else if (id === 'players') {
        const max = playerMax(game)
        if (filters.players === NONE ? max !== null : max === null || max < Number(filters.players)) {
          return false
        }
      } else {
        const chosen = filters[id]
        const hit = gameValues(fieldOf(id), game).some((value) => chosen.includes(value))
        if (hit === isExcluded(filters, id)) {
          return false
        }
      }
    }
    return true
  }

  /** Vero se il gioco `game` rispetta `filters`. */
  function matchesFilters(game, filters) {
    return matches(game, filters, activeFields(filters), splitQuery(filters && filters.title))
  }

  /** Giochi di `games` che rispettano `filters`; senza filtri attivi restituisce `games` stesso. */
  function applyFilters(games, filters) {
    const active = activeFields(filters)
    if (!active.length || !games) {
      return games
    }
    const words = splitQuery(filters.title)
    return games.filter((game) => matches(game, filters, active, words))
  }

  /** Valore del campo `id` nel riepilogo: «Tutti» se il campo non è attivo, «tranne …» in modo «Nascondi». */
  function fieldSummary(filters, id) {
    if (!fieldActive(filters, id)) {
      return 'Tutti'
    }
    const value = filters[id]
    const field = fieldOf(id)
    if (field.kind === 'text') {
      return `«${value.trim()}»`
    }
    if (id === 'players') {
      return value === NONE ? NONE_LABEL : `Almeno ${value}`
    }
    if (field.kind === 'single') {
      return valueLabel(id, value)
    }
    const labels = value.map((item) => valueLabel(id, item))
    const extra = labels.length - SHOWN_VALUES
    const text = extra > 0 ? `${labels.slice(0, SHOWN_VALUES).join(', ')} +${extra}` : labels.join(', ')
    return isExcluded(filters, id) ? `tranne ${text}` : text
  }

  /** Riepilogo dei filtri attivi: `[{id, label, value}]`, vuoto senza filtri. */
  function filterSummary(filters) {
    return activeFields(filters).map((id) => ({ id, label: fieldOf(id).label, value: fieldSummary(filters, id) }))
  }

  return {
    fields,
    EMPTY_FILTERS,
    fieldOf,
    valueLabel,
    filterOptions,
    activeFields,
    hasFilters,
    matchesFilters,
    applyFilters,
    fieldSummary,
    filterSummary,
  }
}

/** Voci del menu Giocatori: «Qualsiasi», «Almeno N giocatori» e «Non indicato», con il numero di giochi. */
export function playerOptions(games) {
  const maxima = (games || []).map(playerMax)
  const count = (test) => String(maxima.filter(test).length)
  return [
    { id: ANY, label: 'Qualsiasi', note: String(maxima.length) },
    ...MIN_PLAYERS.map((min) => ({ id: String(min), label: `Almeno ${min} giocatori`, note: count((max) => max >= min) })),
    { id: NONE, label: NONE_LABEL, note: count((max) => max === null) },
  ]
}

export const {
  EMPTY_FILTERS,
  fieldOf,
  valueLabel,
  filterOptions,
  activeFields,
  hasFilters,
  matchesFilters,
  applyFilters,
  fieldSummary,
  filterSummary,
} = filterKit(FIELDS)
