/**
 * Comandi dei giochi (finestra «Comandi»): righe dei tasti, scambi e testi.
 * Solo funzioni pure.
 *
 * I tasti sono quelli del RetroPad di RetroArch (`b`, `a`, `y`, `x`, `l`,
 * `r`, `l2`, `r2`, …). `map` di un giocatore è `{azione: tasto fisico}`:
 * l'azione è il tasto che arriva al core, il tasto fisico quello premuto.
 * I nomi delle azioni vengono dal core (`descriptors`) e, se scritti a mano,
 * da `labels`.
 */

export const CONTROL_PLAYERS = ['p1', 'p2']
export const LABEL_MAX = 24

// Tasti logici della dashboard (mappatura standard) → tasti fisici del RetroPad.
export const PAD_TO_RETROPAD = {
  a: 'b',
  b: 'a',
  x: 'y',
  y: 'x',
  lb: 'l',
  rb: 'r',
  lt: 'l2',
  rt: 'r2',
}

// Icona di ogni tasto fisico: posizione nel rombo dei frontali o tasto delle spalle.
export const BUTTON_ICONS = {
  b: { face: 'south' },
  a: { face: 'east' },
  y: { face: 'west' },
  x: { face: 'north' },
  l: { shoulder: 'lb' },
  r: { shoulder: 'rb' },
  l2: { shoulder: 'lt' },
  r2: { shoulder: 'rt' },
  select: { text: 'SELECT' },
  start: { text: 'START' },
  l3: { text: 'L3' },
  r3: { text: 'R3' },
}

// Nome del tasto fisico, senza lettere legate a una marca.
export const BUTTON_TITLES = {
  b: 'Tasto in basso',
  a: 'Tasto a destra',
  y: 'Tasto a sinistra',
  x: 'Tasto in alto',
  l: 'Dorsale sinistro',
  r: 'Dorsale destro',
  l2: 'Grilletto sinistro',
  r2: 'Grilletto destro',
  select: 'SELECT',
  start: 'START',
  l3: 'Levetta sinistra',
  r3: 'Levetta destra',
}

/**
 * Giocatori con dei nomi dei tasti (`p1`, poi `p2`), tra quelli di `present`
 * (i core danno i nomi anche per la porta 2 quando P2 non c'è).
 */
export function controlPlayers(controls, present = CONTROL_PLAYERS) {
  const descriptors = (controls && controls.descriptors) || {}
  return CONTROL_PLAYERS.filter(
    (player) => present.includes(player) && Object.keys(descriptors[player] || {}).length > 0,
  )
}

/** Giocatori presenti nella libreria (entrati con START); senza nessuno, solo P1. */
export function presentPlayers(players) {
  const present = CONTROL_PLAYERS.filter((key) => players && players[key] && players[key].user)
  return present.length ? present : ['p1']
}

/** Copia della bozza: `{map, labels}` di tutti i giocatori, da modificare nella finestra. */
export function controlsDraft(controls) {
  const map = {}
  const labels = {}
  for (const player of CONTROL_PLAYERS) {
    map[player] = { ...((controls.map && controls.map[player]) || {}) }
    labels[player] = { ...((controls.labels && controls.labels[player]) || {}) }
  }
  return { map, labels }
}

/**
 * Righe della finestra per il giocatore `player`: prima le azioni
 * riassegnabili che il core usa, poi quelle fisse (START, SELECT, L3, R3).
 * Ogni riga è `{action, name, label, button, editable}`: `button` è il tasto
 * fisico che la attiva.
 */
export function controlRows(controls, draft, player) {
  const names = (controls.descriptors && controls.descriptors[player]) || {}
  const labels = draft.labels[player] || {}
  const map = draft.map[player] || {}
  const row = (action, editable) => ({
    action,
    name: names[action],
    label: labels[action] || '',
    button: (editable && map[action]) || action,
    editable,
  })
  return [
    ...controls.editable.filter((action) => names[action]).map((action) => row(action, true)),
    ...controls.fixed.filter((action) => names[action]).map((action) => row(action, false)),
  ]
}

/**
 * Bozza con l'azione `action` di `player` sul tasto fisico `button`.
 * L'azione che usava quel tasto passa al tasto lasciato libero (scambio).
 * La mappa del giocatore è completa (tutti i tasti riassegnabili, come la
 * manda il servizio); un tasto che non c'è lascia la bozza com'è.
 */
export function assignButton(draft, player, action, button) {
  const map = { ...draft.map[player] }
  const previous = map[action]
  const other = Object.keys(map).find((key) => map[key] === button)
  if (previous === undefined || other === undefined || previous === button) {
    return draft
  }
  map[action] = button
  map[other] = previous
  return { ...draft, map: { ...draft.map, [player]: map } }
}

/** Bozza con il nome scritto a mano dell'azione (vuoto = solo il nome del core). */
export function setLabel(draft, player, action, text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX)
  const labels = { ...draft.labels[player] }
  if (value) {
    labels[action] = value
  } else {
    delete labels[action]
  }
  return { ...draft, labels: { ...draft.labels, [player]: labels } }
}

/** Assegnazioni con le sole differenze dai tasti predefiniti: `{p1: {azione: tasto}}`. */
export function changedMap(draft) {
  const result = {}
  for (const player of CONTROL_PLAYERS) {
    const entries = Object.entries(draft.map[player] || {}).filter(([action, button]) => action !== button)
    if (entries.length) {
      result[player] = Object.fromEntries(entries)
    }
  }
  return result
}

/** Vero se le assegnazioni della bozza sono diverse da quelle salvate (in partita il gioco si riavvia). */
export function mapChanged(controls, draft) {
  const saved = changedMap(controlsDraft(controls))
  const current = changedMap(draft)
  return JSON.stringify(sortKeys(saved)) !== JSON.stringify(sortKeys(current))
}

function sortKeys(value) {
  if (!value || typeof value !== 'object') {
    return value
  }
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]))
}

/** Vero se la bozza è diversa da quanto salvato (assegnazioni o nomi). */
export function draftChanged(controls, draft) {
  const saved = controlsDraft(controls)
  const labels = JSON.stringify(sortKeys(saved.labels)) !== JSON.stringify(sortKeys(draft.labels))
  return mapChanged(controls, draft) || labels
}

/** Testo principale di una riga: il nome scritto a mano, altrimenti quello del core. */
export function rowTitle(row) {
  return row.label || row.name
}
