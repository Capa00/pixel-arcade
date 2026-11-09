/**
 * Filtri della libreria e playlist. Solo funzioni pure, usate dal reducer
 * (src/state/reducer.js), dal pannello «Filtri» e dalle Impostazioni.
 *
 * I filtri della libreria sono quelli dei metadati (src/lib/filters.js) più
 * `played` (Stato: `never` mai giocati, `played` già giocati dal profilo del
 * P1) e `playlist` (id delle playlist scelte, in «o» tra loro). La ricerca
 * per titolo resta `state.query`, che cerca anche nel nome del file: qui
 * `title` non si usa.
 *
 * Una playlist è `{id, name, filters, games}`: `filters` usa gli stessi campi
 * (titolo compreso, playlist escluse) e `games` sono le chiavi
 * `<system>/<id>` aggiunte a mano. Un gioco ne fa parte se è stato aggiunto a
 * mano oppure se rispetta i filtri, quando ce ne sono. `exclude` (in
 * filtri e playlist) elenca i campi in modo «Nascondi».
 */
import {
  ANY,
  EMPTY_FILTERS as BASE_EMPTY,
  FIELDS,
  NONE,
  activeFields,
  fieldSummary as baseSummary,
  isExcluded,
  matchesFilters,
  applyFilters,
} from '../lib/filters.js'

export const PLAYED_VALUES = ['never', 'played']
export const PLAYED_LABELS = { never: 'Mai giocati', played: 'Già giocati' }

/** Filtri vuoti della libreria. */
export const EMPTY_FILTERS = Object.freeze({ ...BASE_EMPTY, played: null, playlist: [] })

/** Filtri vuoti di una playlist (niente filtro Playlist). */
export const EMPTY_PLAYLIST_FILTERS = Object.freeze({ ...BASE_EMPTY, played: null })

/** Campi dei metadati del pannello, nell'ordine (senza il titolo). */
export const META_FIELDS = FIELDS.filter((field) => field.id !== 'title')

/** Valore «vuoto» del campo `id` (toglie il filtro). */
export function emptyValue(id) {
  return id in EMPTY_FILTERS ? EMPTY_FILTERS[id] : EMPTY_PLAYLIST_FILTERS[id]
}

/** Filtri completi a partire da quelli salvati di una playlist (solo i campi attivi). */
export function playlistFilters(saved) {
  const result = { ...EMPTY_PLAYLIST_FILTERS }
  for (const key of Object.keys(result)) {
    if (saved && saved[key] !== undefined && saved[key] !== null) {
      result[key] = saved[key]
    }
  }
  return result
}

/**
 * Filtri da salvare di una playlist: solo i campi attivi (`{}` = nessuno), come li vuole il backend;
 * `exclude` elenca quelli attivi in modo «Nascondi».
 */
export function savedFilters(filters) {
  const result = {}
  const active = activeFields(filters)
  for (const id of active) {
    result[id] = id === 'title' ? filters.title.trim() : filters[id]
  }
  const exclude = active.filter((id) => isExcluded(filters, id))
  if (exclude.length) {
    result.exclude = exclude
  }
  if (filters && PLAYED_VALUES.includes(filters.played)) {
    result.played = filters.played
  }
  return result
}

/** Vero se `filters` di una playlist ha almeno un filtro (metadati, titolo o Stato). */
export function playlistHasFilters(filters) {
  return activeFields(filters).length > 0 || PLAYED_VALUES.includes(filters && filters.played)
}

/** Chiave di un gioco: `<system>/<id>`. */
function keyOf(system, game) {
  return `${system}/${game.id}`
}

/** Vero se il gioco rispetta lo Stato `value`; senza giochi giocati noti (`played` nullo) il filtro non vale. */
function playedMatch(system, game, value, played) {
  if (!played || !PLAYED_VALUES.includes(value)) {
    return true
  }
  return played.has(keyOf(system, game)) === (value === 'played')
}

/**
 * Vero se il gioco `game` della console `system` fa parte della playlist:
 * aggiunto a mano, oppure (se ha filtri) rispetta i suoi filtri. `played` è
 * l'insieme dei giochi già giocati dal P1, oppure `null`.
 */
export function inPlaylist(playlist, system, game, played) {
  if (playlist.games.includes(keyOf(system, game))) {
    return true
  }
  const filters = playlist.filters || {}
  if (!playlistHasFilters(filters)) {
    return false
  }
  if (PLAYED_VALUES.includes(filters.played) && !played) {
    return false
  }
  return matchesFilters(game, filters) && playedMatch(system, game, filters.played, played)
}

/** Playlist scelte in `filters` che esistono ancora. */
function chosenPlaylists(filters, playlists) {
  const ids = new Set(filters.playlist || [])
  return ids.size ? (playlists || []).filter((playlist) => ids.has(String(playlist.id))) : []
}

/** Vero se il filtro Stato vale ora (serve l'elenco dei giochi giocati del P1). */
function playedActive(filters, played) {
  return Boolean(played) && PLAYED_VALUES.includes(filters.played)
}

/**
 * Giochi di `games` (console `system`) che rispettano i filtri della libreria
 * `filters`. `played` = giochi già giocati dal P1 (`Set` di chiavi) o `null`;
 * `playlists` = tutte le playlist. Senza filtri attivi restituisce `games` stesso.
 */
export function filterLibrary(games, system, filters, played, playlists) {
  if (!games || !filters) {
    return games
  }
  let result = applyFilters(games, filters)
  if (playedActive(filters, played)) {
    result = result.filter((game) => playedMatch(system, game, filters.played, played))
  }
  const chosen = chosenPlaylists(filters, playlists)
  if (chosen.length) {
    result = result.filter((game) => chosen.some((playlist) => inPlaylist(playlist, system, game, played)))
  }
  return result
}

/** Vero se almeno un filtro della libreria restringe l'elenco. */
export function libraryFiltered(filters, played, playlists) {
  return (
    activeFields(filters).length > 0 || playedActive(filters, played) || chosenPlaylists(filters, playlists).length > 0
  )
}

/** Valore del filtro `id` della libreria nel pannello e nel riepilogo («Tutti» se non è attivo). */
export function fieldSummary(filters, id, played, playlists) {
  if (id === 'played') {
    if (!PLAYED_VALUES.includes(filters.played)) {
      return 'Tutti'
    }
    return played ? PLAYED_LABELS[filters.played] : `${PLAYED_LABELS[filters.played]} (serve un profilo P1)`
  }
  if (id === 'playlist') {
    const names = chosenPlaylists(filters, playlists).map((playlist) => playlist.name)
    if (!names.length) {
      return 'Tutte'
    }
    return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ')
  }
  return baseSummary(filters, id)
}

/** Riepilogo dei filtri attivi della libreria: `[{id, label, value}]`. */
export function librarySummary(filters, played, playlists) {
  const result = META_FIELDS.filter((field) => activeFields(filters).includes(field.id)).map((field) => ({
    id: field.id,
    label: field.label,
    value: baseSummary(filters, field.id),
  }))
  if (playedActive(filters, played)) {
    result.push({ id: 'played', label: 'Stato', value: PLAYED_LABELS[filters.played] })
  }
  if (chosenPlaylists(filters, playlists).length) {
    result.push({ id: 'playlist', label: 'Playlist', value: fieldSummary(filters, 'playlist', played, playlists) })
  }
  return result
}

/** Riepilogo breve dei filtri di una playlist: «Genere, Giocatori», oppure stringa vuota. */
export function playlistFilterNames(filters) {
  const names = FIELDS.filter((field) => activeFields(filters).includes(field.id)).map((field) => field.label)
  if (filters && PLAYED_VALUES.includes(filters.played)) {
    names.push('Stato')
  }
  return names.join(', ')
}

/** Filtri della libreria senza le playlist che non esistono più. */
export function prunePlaylists(filters, playlists) {
  const ids = new Set((playlists || []).map((playlist) => String(playlist.id)))
  const kept = (filters.playlist || []).filter((id) => ids.has(id))
  return kept.length === (filters.playlist || []).length ? filters : { ...filters, playlist: kept }
}

/**
 * Voci del menu Stato per i giochi `games` della console `system`:
 * «Qualsiasi», «Mai giocati» e «Già giocati», con il numero di giochi (se si conoscono i giocati).
 */
export function playedOptions(games, system, played) {
  const total = (games || []).length
  const done = played ? (games || []).filter((game) => played.has(keyOf(system, game))).length : null
  return [
    { id: ANY, label: 'Qualsiasi', note: String(total) },
    { id: 'never', label: PLAYED_LABELS.never, note: done === null ? '' : String(total - done) },
    { id: 'played', label: PLAYED_LABELS.played, note: done === null ? '' : String(done) },
  ]
}

/** Voci del menu Playlist: una per playlist con i suoi giochi nella console `system`. */
export function playlistOptions(playlists, games, system, played) {
  return (playlists || []).map((playlist) => {
    const count = (games || []).filter((game) => inPlaylist(playlist, system, game, played)).length
    return { id: String(playlist.id), label: playlist.name, note: String(count) }
  })
}

/** Filtri della libreria da salvare come playlist: quelli dei metadati, Stato e la ricerca per titolo. */
export function filtersForPlaylist(filters, query) {
  return savedFilters({ ...filters, title: query || '' })
}

export { ANY, NONE }
