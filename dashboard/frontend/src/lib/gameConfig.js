/**
 * Pagina «Configurazione» (backend `gameconfig.py`, `GET /api/config`): opzioni
 * di RetroArch e del core in quattro sezioni (Grafica, Latenza, Audio,
 * Emulazione), per console o per gioco. Solo funzioni pure.
 *
 * La pagina è `{system, id, core, cores, family, levels, mode, custom,
 * consoleMode, coreOptions, sections: [{id, label, options}]}`; ogni opzione
 * è `{source, key, label, info, group, values: [{value, label}], value,
 * origin}`. `mode` è il livello della Grafica, `custom` (la Personalizzata)
 * oppure, per un gioco, `null` = come la console.
 */

export const CUSTOM = 'custom'
// Voce «Come la console» del menu del livello di un gioco (livello `null`).
export const FOLLOW = 'console'

const ORIGIN_LABELS = {
  level: 'Livello',
  custom: 'Personalizzata',
  game: 'Gioco',
  console: 'Console',
  default: 'Predefinito',
}

/** Nome dell'origine di un valore: livello, Personalizzata, gioco, console o predefinito. */
export function originLabel(origin) {
  return ORIGIN_LABELS[origin] || ''
}

/** Nome di un livello (`custom` = «Personalizzata»). */
export function levelLabel(page, id) {
  if (id === CUSTOM) {
    return 'Personalizzata'
  }
  const level = page.levels.find((entry) => entry.id === id)
  return level ? level.label : id
}

/** Valore della riga «Livello»: il livello, «Personalizzata» o «Come la console (…)». */
export function modeLabel(page) {
  if (page.id && page.mode === null) {
    return `Come la console (${levelLabel(page, page.consoleMode)})`
  }
  return levelLabel(page, page.mode)
}

/** Voci del menu del livello: per un gioco prima «Come la console», in fondo la Personalizzata se c'è. */
export function levelItems(page) {
  const items = []
  if (page.id) {
    items.push({ id: FOLLOW, label: 'Come la console', note: levelLabel(page, page.consoleMode) })
  }
  for (const level of page.levels) {
    items.push({ id: level.id, label: level.label, note: level.note })
  }
  if (page.custom) {
    items.push({ id: CUSTOM, label: 'Personalizzata', note: page.id ? 'Di questo gioco' : 'Della console' })
  }
  return items
}

/** Livello da inviare al backend per una voce del menu del livello. */
export function levelOf(item) {
  return item.id === FOLLOW ? null : item.id
}

/** Voce evidenziata all'apertura del menu del livello. */
export function levelIndex(page, items) {
  const current = page.id && page.mode === null ? FOLLOW : page.mode
  return Math.max(0, items.findIndex((item) => item.id === current))
}

/** Nome del valore attuale di un'opzione. */
export function valueLabel(option) {
  const entry = option.values.find((item) => item.value === option.value)
  return entry ? entry.label : option.value
}

function matches(text, filter) {
  return String(text || '').toLowerCase().includes(filter)
}

/** Opzioni della sezione che contengono il testo cercato nel nome, nella chiave o nel gruppo. */
export function visibleOptions(section, filter = '') {
  const text = filter.trim().toLowerCase()
  if (!text) {
    return section.options
  }
  return section.options.filter((option) =>
    matches(option.label, text) || matches(option.key, text) || matches(option.group, text))
}

/** Voci del menu dei valori, filtrate dal testo cercato; il valore in uso ha la nota «In uso». */
export function valueItems(option, filter = '') {
  const text = filter.trim().toLowerCase()
  return option.values
    .filter((item) => !text || matches(item.label, text) || matches(item.value, text))
    .map((item) => ({ id: item.value, label: item.label, note: item.value === option.value ? 'In uso' : '' }))
}

/**
 * Vero se X può riportare l'opzione all'origine: nella pagina del gioco i
 * valori del gioco, in quella della console quelli della console; nella
 * Grafica i valori cambiati dalla Personalizzata.
 */
export function canReset(page, option) {
  return option.origin === CUSTOM || option.origin === (page.id ? 'game' : 'console')
}

/** Core successivo (o precedente con `dir` -1) del selettore della console, sempre circolare. */
export function stepCore(page, dir) {
  const { cores } = page
  if (cores.length < 2) {
    return page.core
  }
  const at = Math.max(0, cores.indexOf(page.core))
  return cores[(at + dir + cores.length) % cores.length]
}

/** Sezione dopo un passo `dir` (-1, 1) da `index`: sempre circolare. */
export function stepSection(page, index, dir) {
  const count = page.sections.length
  return (index + dir + count) % count
}

/**
 * Righe fisse in testa alla sezione: Livello (solo nella Grafica), Core
 * (solo per la console con più core), «Usa per tutta la console» (solo per
 * un gioco con la sua Personalizzata in uso), BIOS (nell'Emulazione, con il
 * riassunto `page.bios` del core della pagina).
 */
export function fixedRows(page, sectionId) {
  const rows = []
  if (sectionId === 'graphics') {
    rows.push('level')
  }
  if (!page.id && page.cores.length > 1) {
    rows.push('core')
  }
  if (sectionId === 'graphics' && page.id && page.mode === CUSTOM) {
    rows.push('promote')
  }
  if (sectionId === 'emulation' && page.bios) {
    rows.push('bios')
  }
  return rows
}

/** Id del focus di un'opzione. */
export function optionFocus(option) {
  return `opt:${option.source}:${option.key}`
}
