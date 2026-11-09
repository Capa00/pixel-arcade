import { describe, expect, it } from 'vitest'
import {
  addonConsolesLoaded,
  bootstrapLoaded,
  cycleSystem,
  clearSearch,
  closeLogin,
  closeConfigMenu,
  gameUpdated,
  gamesLoaded,
  jumpToLetter,
  login,
  loginGuest,
  matchClose,
  matchOpen,
  matchSides,
  padsChanged,
  moveSelection,
  oskCancel,
  oskConfirm,
  oskErase,
  oskType,
  openConfigMenu,
  pressStart,
  openKeyboard,
  padButtonsSaved,
  request,
  requestChallenge,
  requestMatch,
  reserveGame,
  runUpdated,
  selectIndex,
  selectSystem,
  setColumns,
  setHeroFocus,
  setQuery,
  showToast,
} from './actions.js'
import { allConsoles, currentAddonConsole, currentGame, currentSystem, filtered, initialState, reducer, rowInfo } from './reducer.js'

const systems = [
  { id: 'arcade', name: 'ARCADE', covers: [] },
  { id: 'nes', name: 'NES', covers: [] },
]

function makeGames(count) {
  return Array.from({ length: count }, (_, index) => ({ id: `g${index}.zip`, title: `Gioco ${index}` }))
}

function ready(count = 20, columns = 8) {
  let state = reducer(initialState, bootstrapLoaded({ systems, padButtons: null, warnings: [] }))
  state = reducer(state, gamesLoaded('arcade', makeGames(count)))
  return reducer(state, setColumns(columns))
}

function apply(state, ...actions) {
  return actions.reduce(reducer, state)
}

describe('reducer', () => {
  it('console delle estensioni in coda alle schede, senza giochi', () => {
    let state = apply(ready(), addonConsolesLoaded([{ id: 'cube', name: 'CUBE', addon: 'box' }]))
    expect(allConsoles(state).map((entry) => entry.id)).toEqual(['arcade', 'nes', 'cube'])
    state = apply(state, cycleSystem(-1))
    expect(state.systemId).toBe('cube')
    expect(currentAddonConsole(state)).toMatchObject({ id: 'cube', addon: 'box' })
    expect(currentSystem(state)).toBeNull()
    state = apply(state, bootstrapLoaded({ systems, padButtons: null, warnings: [] }))
    expect(state.systemId).toBe('cube')
    state = apply(state, cycleSystem(1))
    expect(state.systemId).toBe('arcade')
    state = apply(state, selectSystem('cube'))
    expect(state.systemId).toBe('cube')
    // Console nascosta mentre è selezionata: si torna alla prima.
    state = apply(state, addonConsolesLoaded([]))
    expect(state.systemId).toBe('arcade')
  })

  it('gioco prenotato dalla classifica: entrato il giocatore si va su «Gioca»', () => {
    let state = apply(ready(), pressStart(0), reserveGame('p1', 'arcade', 'g7.zip'))
    expect(state.reservedGame).toEqual({ slot: 'p1', system: 'arcade', id: 'g7.zip', title: 'g7.zip' })
    state = reducer(state, loginGuest('p1'))
    expect(state.reservedGame).toBeNull()
    expect(currentGame(state).id).toBe('g7.zip')
    expect(state.heroFocus).toBe('play')
  })

  it('prenotazione su una console non caricata, annullata o tolta', () => {
    let state = apply(ready(), pressStart(0), reserveGame('p1', 'nes', 'mario.nes'))
    state = reducer(state, login('p1', { id: 1, name: 'ADA', color: '#ff5d73', favConsole: null, favorites: [] }))
    expect(state.systemId).toBe('nes')
    expect(state.pendingGame).toEqual({ system: 'nes', id: 'mario.nes' })
    state = apply(ready(), pressStart(0), reserveGame('p1', 'arcade', 'g7.zip'), closeLogin('p1'))
    expect(state.reservedGame).toBeNull()
    expect(currentGame(state).id).toBe('g0.zip')
    state = apply(ready(), pressStart(0), reserveGame('p1', 'arcade', 'g7.zip'), reserveGame('p1'), loginGuest('p1'))
    expect(currentGame(state).id).toBe('g0.zip')
  })

  it('pagina «Configurazione» del gioco selezionato', () => {
    let state = reducer(ready(), openConfigMenu())
    expect(state.configMenu).toEqual({ system: 'arcade', id: 'g0.zip', title: 'Gioco 0' })
    state = reducer(state, closeConfigMenu())
    expect(state.configMenu).toBeNull()
  })

  it('bootstrap seleziona la prima console', () => {
    const state = reducer(initialState, bootstrapLoaded({ systems, padButtons: null, warnings: ['x'] }))
    expect(state.status).toBe('ready')
    expect(state.systemId).toBe('arcade')
    expect(state.padButtons).toEqual({})
    expect(reducer(state, padButtonsSaved({ P: { a: 0, b: 1, select: 8, start: 9 } })).padButtons.P.start).toBe(9)
    expect(state.warnings).toEqual(['x'])
  })

  it('combinazione dei salvataggi dal bootstrap', () => {
    expect(reducer(initialState, bootstrapLoaded({ systems, padButtons: null, warnings: [] })).saveCombo).toEqual(['select', 'lt'])
    const state = reducer(initialState, bootstrapLoaded({ systems, padButtons: null, saveCombo: ['select', 'rt'], warnings: [] }))
    expect(state.saveCombo).toEqual(['select', 'rt'])
  })

  it('bootstrap senza console', () => {
    const state = reducer(initialState, bootstrapLoaded({ systems: [], warnings: [] }))
    expect(state.systemId).toBeNull()
  })

  it('bootstrap salva i dati delle estensioni', () => {
    expect(reducer(initialState, bootstrapLoaded({ systems, warnings: [] })).addons).toEqual({})
    const addons = { demo: { systems: ['arcade'] } }
    expect(reducer(initialState, bootstrapLoaded({ systems, warnings: [], addons })).addons).toEqual(addons)
  })

  it('movimento orizzontale fermo ai bordi e a capo tra le righe', () => {
    let state = ready()
    state = apply(state, moveSelection(-1, 0))
    expect(state.index).toBe(0)
    state = apply(state, selectIndex(7), moveSelection(1, 0))
    expect(state.index).toBe(8)
    expect(rowInfo(state)).toEqual({ row: 1, rows: 3 })
    state = apply(state, selectIndex(19), moveSelection(1, 0))
    expect(state.index).toBe(19)
  })

  it('movimento verticale di una riga', () => {
    let state = ready()
    state = apply(state, selectIndex(2), moveSelection(0, 1))
    expect(state.index).toBe(10)
    state = apply(state, moveSelection(0, -1), moveSelection(0, -1))
    expect(state.index).toBe(2)
  })

  it('giù verso l\'ultima riga incompleta porta all\'ultimo gioco', () => {
    let state = ready()
    state = apply(state, selectIndex(14), moveSelection(0, 1))
    expect(state.index).toBe(19)
    state = apply(state, moveSelection(0, 1))
    expect(state.index).toBe(19)
  })

  it('cambio di colonne mantiene il gioco selezionato', () => {
    let state = apply(ready(), selectIndex(13))
    const game = currentGame(state)
    state = apply(state, setColumns(3))
    expect(currentGame(state)).toBe(game)
    expect(rowInfo(state)).toEqual({ row: 4, rows: 7 })
  })

  it('cambio di console azzera l\'indice', () => {
    let state = apply(ready(), selectIndex(5), selectSystem('nes'))
    expect(state.systemId).toBe('nes')
    expect(state.index).toBe(0)
    expect(currentGame(state)).toBeNull()
    expect(apply(state, moveSelection(1, 0))).toBe(state)
    expect(apply(state, selectSystem('manca')).systemId).toBe('nes')
  })

  it('giochi ricaricati con i metadati: la selezione resta sullo stesso gioco', () => {
    const state = apply(ready(), selectIndex(3))
    expect(currentGame(state).id).toBe('g3.zip')
    const renamed = makeGames(20).map((game) => (game.id === 'g3.zip' ? { ...game, title: 'AAA primo' } : game))
    renamed.sort((a, b) => a.title.localeCompare(b.title))
    const next = reducer(state, gamesLoaded('arcade', renamed))
    expect(next.index).toBe(0)
    expect(currentGame(next).id).toBe('g3.zip')
    const gone = reducer(state, gamesLoaded('arcade', makeGames(20).filter((game) => game.id !== 'g3.zip')))
    expect(gone.index).toBe(3)
  })

  it('selectIndex limitato ai giochi presenti', () => {
    expect(apply(ready(), selectIndex(99)).index).toBe(19)
    expect(apply(ready(), selectIndex(-3)).index).toBe(0)
  })
})

describe('ricerca', () => {
  const titled = [
    { id: 'dd.zip', file: 'digdug.zip', title: 'Dig Dug' },
    { id: 'pm.zip', file: 'pacman.zip', title: 'Pac-Man' },
    { id: 'mp.zip', file: 'mspacman.zip', title: 'Ms. Pac-Man' },
    { id: 'pk.zip', file: 'pokemon.zip', title: 'Pokémon' },
  ]

  function withTitles() {
    const state = reducer(initialState, bootstrapLoaded({ systems, padButtons: null, warnings: [] }))
    return reducer(state, gamesLoaded('arcade', titled))
  }

  it('filtra con tutte le parole, senza maiuscole né accenti, in titolo e file', () => {
    const state = withTitles()
    const titles = (query) => filtered(apply(state, setQuery(query))).map((game) => game.title)
    expect(titles('PAC man')).toEqual(['Pac-Man', 'Ms. Pac-Man'])
    expect(titles('ms pac')).toEqual(['Ms. Pac-Man'])
    expect(titles('pokemon')).toEqual(['Pokémon'])
    expect(titles('digdug')).toEqual(['Dig Dug'])
    expect(titles('  ')).toHaveLength(4)
  })

  it('selettore memorizzato', () => {
    const state = apply(withTitles(), setQuery('pac'))
    expect(filtered(state)).toBe(filtered({ ...state, index: 1 }))
    expect(filtered(withTitles())).toBe(withTitles().games.arcade)
  })

  it('mantiene il gioco selezionato se resta tra i risultati', () => {
    let state = apply(withTitles(), selectIndex(2), setQuery('pac'))
    expect(currentGame(state).title).toBe('Ms. Pac-Man')
    state = apply(state, clearSearch())
    expect(state.index).toBe(2)
    state = apply(state, setQuery('dig'))
    expect(state.index).toBe(0)
  })

  it('salto a una lettera dalla striscia', () => {
    const state = withTitles()
    expect(currentGame(apply(state, jumpToLetter('P'))).title).toBe('Pac-Man')
    expect(apply(state, jumpToLetter('Z'))).toBe(state)
  })
})

describe('tastiera a schermo delle estensioni', () => {
  const target = { addon: 'demo', key: 'title' }

  it('il testo segue la scrittura e la conferma lo lascia', () => {
    let state = apply(ready(), openKeyboard('extension', { value: 'ab', target }))
    expect(state.extensionText).toBe(null)
    state = apply(state, oskType('c'))
    expect(state.extensionText).toEqual({ target, value: 'abc' })
    state = apply(state, oskErase(), oskConfirm())
    expect(state.osk).toBe(null)
    expect(state.extensionText).toEqual({ target, value: 'ab' })
    expect(state.query).toBe('')
  })

  it("l'annullamento riporta il testo iniziale", () => {
    const state = apply(ready(), openKeyboard('extension', { value: 'ab', target }), oskType('cd'), oskCancel())
    expect(state.osk).toBe(null)
    expect(state.extensionText).toEqual({ target, value: 'ab' })
  })
})

describe('tastiera a schermo per un testo', () => {
  const target = { kind: 'saveName', slot: 2 }

  it('il testo arriva solo con la conferma', () => {
    let state = apply(ready(), openKeyboard('text', { value: 'Boss', max: 20, target }), oskType(' finale'))
    expect(state.keyboardText).toBe(null)
    state = apply(state, oskConfirm())
    expect(state.osk).toBe(null)
    expect(state.keyboardText).toEqual({ target, value: 'Boss finale' })
    expect(state.query).toBe('')
    state = apply(state, openKeyboard('text', { value: 'x', target }))
    expect(state.keyboardText).toBe(null)
    state = apply(state, oskType('y'), oskCancel())
    expect(state.keyboardText).toBe(null)
  })
})

describe('partita e core dei giochi', () => {
  it('stato della partita dal bootstrap e dal polling', () => {
    let state = reducer(initialState, bootstrapLoaded({ systems, run: { running: true, phase: 'running' } }))
    expect(state.run.phase).toBe('running')
    state = reducer(state, runUpdated({ running: false, phase: 'idle' }))
    expect(state.run.running).toBe(false)
    state = reducer(state, setHeroFocus('play'))
    state = reducer(state, runUpdated({ running: true, phase: 'probing' }))
    expect(state.heroFocus).toBeNull()
  })

  it('richieste numerate e gioco aggiornato', () => {
    let state = reducer(initialState, bootstrapLoaded({ systems }))
    state = reducer(state, gamesLoaded('arcade', [{ id: 'a.zip', title: 'A', core: null, coreStatus: null }]))
    state = reducer(state, request('launch', 'arcade', { id: 'a.zip' }))
    state = reducer(state, request('launch', 'arcade', { id: 'a.zip' }))
    expect(state.request).toMatchObject({ kind: 'launch', system: 'arcade', resume: null, seq: 2 })
    state = reducer(state, request('launch', 'arcade', { id: 'a.zip' }, { account: 1, slot: 3 }))
    expect(state.request).toMatchObject({ resume: { account: 1, slot: 3 }, challenge: null, seq: 3 })
    state = reducer(state, requestChallenge({ id: 9, system: 'arcade', game: 'a.zip', title: 'A' }))
    expect(state.request).toMatchObject({
      kind: 'challenge', system: 'arcade', game: { id: 'a.zip', title: 'A' }, challenge: 9, seq: 4,
    })
    state = reducer(state, gameUpdated('arcade', { id: 'a.zip', core: 'fbneo', coreStatus: 'ok' }))
    expect(state.games.arcade[0]).toMatchObject({ title: 'A', core: 'fbneo', coreStatus: 'ok' })
  })

  it('il clic su una tessera toglie il focus dalle azioni', () => {
    let state = reducer(initialState, bootstrapLoaded({ systems }))
    state = reducer(state, gamesLoaded('arcade', makeGames(10)))
    state = reducer(state, setHeroFocus('core'))
    state = reducer(state, selectIndex(3))
    expect(state.heroFocus).toBeNull()
  })

  it('notifiche con variante', () => {
    expect(reducer(initialState, showToast('ciao')).toast).toMatchObject({ message: 'ciao', variant: 'info' })
    expect(reducer(initialState, showToast('guasto', 'error')).toast.variant).toBe('error')
  })
})

describe('incontro di torneo', () => {
  const ada = { id: 1, name: 'ADA', color: '#ff5d73' }
  const bea = { id: 2, name: 'BEA', color: '#3ccfc4' }
  const ugo = { id: 3, name: 'UGO', color: '#f5c542' }

  it('mette da parte P1 e P2, scambia i lati e li ripristina', () => {
    let state = reducer(ready(), pressStart(0, 'pad0'))
    state = reducer(state, login('p1', ugo))
    const before = state.players
    state = reducer(state, matchOpen({ tournament: 4, match: 9 }, [ada, bea], [0, 1]))
    expect(state.match).toEqual({ tournament: 4, match: 9, account: null, saved: before })
    expect([state.players.p1.user.id, state.players.p1.pad]).toEqual([1, 0])
    expect([state.players.p2.user.id, state.players.p2.pad, state.players.p2.joined]).toEqual([2, 1, true])
    state = reducer(state, matchSides([bea, ada]))
    expect([state.players.p1.user.id, state.players.p1.pad, state.players.p2.user.id]).toEqual([2, 0, 1])
    // Un joypad scollegato non fa uscire i giocatori dell'incontro.
    state = reducer(state, padsChanged([{ index: 0, id: 'pad0' }]))
    expect(state.players.p2.user.id).toBe(1)
    // Riaprendo resta il P1/P2 di prima da ripristinare.
    state = reducer(state, matchOpen({ tournament: 4, match: 9 }, [ada, bea], [0, 1]))
    expect(state.match.saved).toBe(before)
    state = reducer(state, matchClose())
    expect(state.match).toBeNull()
    expect(state.players).toBe(before)
    expect(reducer(state, matchClose())).toBe(state)
  })

  it('richiesta di una partita dell\'incontro', () => {
    const state = reducer(ready(), requestMatch('md', { id: 'sf2.md', title: 'SF2' }, { id: 4, match: 9, account: 1, sideA: 'p1' }))
    expect(state.request).toMatchObject({ kind: 'match', system: 'md', match: { id: 4, match: 9 } })
  })
})
