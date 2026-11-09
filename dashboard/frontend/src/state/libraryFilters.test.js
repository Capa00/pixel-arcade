import { describe, expect, it } from 'vitest'
import {
  bootstrapLoaded,
  closeControlsMenu,
  closeFilters,
  gamesLoaded,
  gotoGame,
  openControlsMenu,
  openFilters,
  openPlaylistMenu,
  playedLoaded,
  playlistsLoaded,
  resetFilters,
  selectSystem,
  setColumns,
  setFilter,
  setQuery,
  showGame,
} from './actions.js'
import {
  EMPTY_FILTERS,
  filterLibrary,
  filtersForPlaylist,
  inPlaylist,
  librarySummary,
  playedOptions,
  playlistFilterNames,
  playlistFilters,
  playlistOptions,
  prunePlaylists,
  savedFilters,
} from './libraryFilters.js'
import { currentGame, filtered, filtersActive, initialState, reducer } from './reducer.js'

const GAMES = [
  { id: 'sf2.zip', title: 'Street Fighter II', genre: ['Picchiaduro'], players: '1–2', year: 1991 },
  { id: 'mk.zip', title: 'Mortal Kombat', genre: ['Picchiaduro'], players: '1–2', year: 1992 },
  { id: 'tekken.zip', title: 'Tekken', genre: ['Picchiaduro'], players: '1', year: 1994 },
  { id: 'pang.zip', title: 'Pang', genre: ['Azione'], players: '1–2', year: 1989 },
  { id: 'galaga.zip', title: 'Galaga', genre: null, players: null, year: null },
]

const NES = [
  { id: 'Zelda.nes', title: 'Zelda', genre: ['Avventura'], players: '1' },
  { id: 'DoubleDragon.nes', title: 'Double Dragon', genre: ['Picchiaduro'], players: '1–2' },
]

const systems = [
  { id: 'arcade', name: 'ARCADE', count: 1, arcade: true },
  { id: 'mame', name: 'MAME', count: 1, arcade: true },
]

function ids(list) {
  return list.map((game) => game.id)
}

function ready() {
  let state = reducer(initialState, bootstrapLoaded({ systems, warnings: [] }))
  state = reducer(state, gamesLoaded('arcade', GAMES))
  state = reducer(state, gamesLoaded('mame', NES))
  return reducer(state, setColumns(4))
}

describe('filtri della libreria', () => {
  it('genere e giocatori in «e», valori dello stesso campo in «o»', () => {
    const filters = { ...EMPTY_FILTERS, genre: ['Picchiaduro', 'Azione'], players: '2' }
    expect(ids(filterLibrary(GAMES, 'arcade', filters, null, []))).toEqual(['sf2.zip', 'mk.zip', 'pang.zip'])
    expect(filterLibrary(GAMES, 'arcade', EMPTY_FILTERS, null, [])).toBe(GAMES)
  })

  it('Stato vale solo se si conoscono i giochi giocati del P1', () => {
    const filters = { ...EMPTY_FILTERS, played: 'never' }
    const played = new Set(['arcade/sf2.zip', 'arcade/pang.zip'])
    expect(ids(filterLibrary(GAMES, 'arcade', filters, played, []))).toEqual(['mk.zip', 'tekken.zip', 'galaga.zip'])
    expect(ids(filterLibrary(GAMES, 'arcade', { ...filters, played: 'played' }, played, []))).toEqual(['sf2.zip', 'pang.zip'])
    expect(filterLibrary(GAMES, 'arcade', filters, null, [])).toBe(GAMES)
  })

  it('playlist: giochi aggiunti a mano oppure che rispettano i filtri', () => {
    const playlists = [
      { id: 1, name: 'Botte a 2', filters: { genre: ['Picchiaduro'], players: '2' }, games: ['arcade/galaga.zip'] },
      { id: 2, name: 'A mano', filters: {}, games: ['arcade/pang.zip', 'nes/Zelda.nes'] },
      { id: 3, name: 'Mai giocati', filters: { played: 'never' }, games: [] },
    ]
    expect(ids(filterLibrary(GAMES, 'arcade', { ...EMPTY_FILTERS, playlist: ['1'] }, null, playlists)))
      .toEqual(['sf2.zip', 'mk.zip', 'galaga.zip'])
    expect(ids(filterLibrary(GAMES, 'arcade', { ...EMPTY_FILTERS, playlist: ['1', '2'] }, null, playlists)))
      .toEqual(['sf2.zip', 'mk.zip', 'pang.zip', 'galaga.zip'])
    expect(ids(filterLibrary(NES, 'nes', { ...EMPTY_FILTERS, playlist: ['2'] }, null, playlists))).toEqual(['Zelda.nes'])
    // Una playlist sparita non filtra più.
    expect(filterLibrary(GAMES, 'arcade', { ...EMPTY_FILTERS, playlist: ['9'] }, null, playlists)).toBe(GAMES)
    // Stato in una playlist: senza giochi giocati noti non contiene nulla.
    expect(inPlaylist(playlists[2], 'arcade', GAMES[0], null)).toBe(false)
    expect(inPlaylist(playlists[2], 'arcade', GAMES[0], new Set())).toBe(true)
    expect(playlistOptions(playlists, GAMES, 'arcade', null)).toEqual([
      { id: '1', label: 'Botte a 2', note: '3' },
      { id: '2', label: 'A mano', note: '1' },
      { id: '3', label: 'Mai giocati', note: '0' },
    ])
  })

  it('riepilogo, opzioni di Stato e filtri da salvare', () => {
    const playlists = [{ id: 4, name: 'Preferite', filters: {}, games: [] }]
    const filters = { ...EMPTY_FILTERS, genre: ['Picchiaduro'], players: '2', played: 'never', playlist: ['4'] }
    expect(librarySummary(filters, null, playlists)).toEqual([
      { id: 'genre', label: 'Genere', value: 'Picchiaduro' },
      { id: 'players', label: 'Giocatori', value: 'Almeno 2' },
      { id: 'playlist', label: 'Playlist', value: 'Preferite' },
    ])
    expect(librarySummary(filters, new Set(), playlists).map((item) => item.id)).toEqual(['genre', 'players', 'played', 'playlist'])
    expect(playedOptions(GAMES, 'arcade', new Set(['arcade/sf2.zip'])).map((item) => item.note)).toEqual(['5', '4', '1'])
    expect(filtersForPlaylist(filters, ' street ')).toEqual({ title: 'street', genre: ['Picchiaduro'], players: '2', played: 'never' })
    expect(savedFilters(playlistFilters({ year: ['1991'] }))).toEqual({ year: ['1991'] })
    expect(playlistFilterNames({ title: 'x', genre: ['Sport'], played: 'played' })).toBe('Titolo, Genere, Stato')
    expect(prunePlaylists(filters, [])).toEqual({ ...filters, playlist: [] })
    expect(prunePlaylists(filters, playlists)).toBe(filters)
  })
})

describe('filtri nel reducer', () => {
  it('restano cambiando console e tengono selezionato lo stesso gioco', () => {
    let state = ready()
    state = reducer(state, { type: 'selectIndex', index: 1 })
    expect(currentGame(state).id).toBe('mk.zip')
    state = reducer(state, setFilter('genre', ['Picchiaduro']))
    expect(filtersActive(state)).toBe(true)
    expect(currentGame(state).id).toBe('mk.zip')
    state = reducer(state, selectSystem('mame'))
    expect(ids(filtered(state))).toEqual(['DoubleDragon.nes'])
    state = reducer(state, setFilter('genre', null))
    expect(state.filters.genre).toEqual([])
    expect(filtered(state)).toHaveLength(2)
  })

  it('apertura e chiusura del pannello, azzera filtri e ricerca', () => {
    let state = reducer(ready(), openFilters())
    expect(state.filtersOpen).toBe(true)
    state = reducer(state, setFilter('players', '2'))
    state = reducer(state, setQuery('st'))
    expect(ids(filtered(state))).toEqual(['sf2.zip'])
    state = reducer(state, resetFilters())
    expect(state.query).toBe('')
    expect(state.filters).toBe(EMPTY_FILTERS)
    expect(reducer(state, closeFilters()).filtersOpen).toBe(false)
    expect(reducer(state, setFilter('colore', ['rosso']))).toBe(state)
  })

  it('«Sorprendimi»: seleziona il gioco tenendo i filtri e porta su «Gioca»', () => {
    let state = reducer(ready(), setFilter('players', '2'))
    state = reducer(reducer(state, openFilters()), showGame('mame', 'DoubleDragon.nes'))
    expect(state.systemId).toBe('mame')
    expect(currentGame(state).id).toBe('DoubleDragon.nes')
    expect(state.heroFocus).toBe('play')
    expect(state.filtersOpen).toBe(false)
    // Un gioco escluso dai filtri non si seleziona.
    expect(reducer(state, showGame('mame', 'Zelda.nes'))).toBe(state)
  })

  it('giocati del P1 e playlist eliminate', () => {
    let state = ready()
    state = reducer(state, setFilter('played', 'never'))
    // Senza P1 il filtro Stato non vale.
    expect(filtered(state)).toHaveLength(5)
    state = { ...state, players: { ...state.players, p1: { ...state.players.p1, user: { id: 7, name: 'UNO' } } } }
    state = reducer(state, playedLoaded(7, ['arcade/sf2.zip']))
    expect(filtered(state)).toHaveLength(4)
    state = reducer(state, playlistsLoaded([{ id: 1, name: 'X', filters: {}, games: ['arcade/pang.zip'] }]))
    state = reducer(state, setFilter('playlist', ['1']))
    expect(ids(filtered(state))).toEqual(['pang.zip'])
    state = reducer(state, playlistsLoaded([]))
    expect(state.filters.playlist).toEqual([])
    expect(filtered(state)).toHaveLength(4)
  })

  it('andare a un gioco nascosto dai filtri (preferito dal profilo) toglie i filtri', () => {
    let state = reducer(ready(), setFilter('genre', ['Picchiaduro']))
    state = reducer(state, gotoGame('arcade', 'mk.zip'))
    expect(currentGame(state).id).toBe('mk.zip')
    expect(state.filters.genre).toEqual(['Picchiaduro'])
    state = reducer(state, gotoGame('arcade', 'pang.zip'))
    expect(currentGame(state).id).toBe('pang.zip')
    expect(state.filters).toBe(EMPTY_FILTERS)
  })

  it('menu «＋ Playlist» sul gioco selezionato', () => {
    const state = reducer(ready(), openPlaylistMenu())
    expect(state.playlistMenu).toEqual({ system: 'arcade', id: 'sf2.zip' })
  })

  it('finestra «Comandi» sul gioco selezionato', () => {
    let state = reducer(ready(), openControlsMenu())
    expect(state.controlsMenu).toMatchObject({ system: 'arcade', id: 'sf2.zip' })
    expect(state.controlsMenu.title).toBeTruthy()
    state = reducer(state, closeControlsMenu())
    expect(state.controlsMenu).toBeNull()
  })
})

describe('playlist con campi in modo «Nascondi»', () => {
  it('salva exclude solo per i campi attivi e lo rilegge', () => {
    const filters = { ...EMPTY_FILTERS, genre: ['Picchiaduro'], exclude: ['genre', 'kind'] }
    expect(savedFilters(filters)).toEqual({ genre: ['Picchiaduro'], exclude: ['genre'] })
    const playlist = { id: 1, name: 'Niente picchiaduro', filters: savedFilters(filters), games: [] }
    expect(playlistFilters(playlist.filters).exclude).toEqual(['genre'])
    expect(GAMES.filter((game) => inPlaylist(playlist, 'arcade', game, null)).map((game) => game.id)).toEqual([
      'pang.zip',
      'galaga.zip',
    ])
  })
})
