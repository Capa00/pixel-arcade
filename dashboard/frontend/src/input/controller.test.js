import { describe, expect, it } from 'vitest'
import { bootstrapLoaded, gamesLoaded, input, openKeyboard, setColumns } from '../state/actions.js'
import { currentGame, filtered, heroView, initialState, presentLetters, reducer } from '../state/reducer.js'
import { heroActionsFor, route, settingsCommand } from './controller.js'

const systems = [
  { id: 'arcade', name: 'ARCADE', count: 1, arcade: true, covers: [] },
  { id: 'mame', name: 'MAME', count: 1, arcade: true, covers: [] },
  { id: 'neogeo', name: 'NEO GEO', count: 1, arcade: true, covers: [] },
]

const titles = ['1942', 'Asteroids', 'Bomb Jack', 'Dig Dug', 'Dig Dug II', 'Donkey Kong', 'Élite', 'Galaga', 'Zaxxon']

function games() {
  return titles.map((title) => ({ id: `${title.toLowerCase().replace(/\W/g, '')}.zip`, file: `${title.toLowerCase().replace(/\W/g, '')}.zip`, title }))
}

function ready() {
  let state = reducer(initialState, bootstrapLoaded({ systems, warnings: [] }))
  state = reducer(state, gamesLoaded('arcade', games()))
  return reducer(state, setColumns(4))
}

function press(button, pad = 0) {
  return { pad, button, kind: 'press', source: 'pad' }
}

function send(state, ...events) {
  return events.reduce((current, event) => reducer(current, input(event)), state)
}

// Tastiera a schermo della ricerca, come la apre «Titolo» nel pannello «Filtri» (joypad 0).
function search(state) {
  return reducer(state, openKeyboard('search', { owner: 0, value: state.query, max: 40 }))
}

function types(actions) {
  return actions.map((action) => action.type)
}

describe('route', () => {
  it('libreria: direzioni, console, lettere, filtri', () => {
    const state = ready()
    expect(types(route(state, press('right')))).toEqual(['moveSelection'])
    expect(types(route(state, { pad: 0, button: 'down', kind: 'repeat' }))).toEqual(['moveSelection'])
    expect(route(state, press('rb'))).toEqual([{ type: 'cycleSystem', dir: 1 }])
    expect(route(state, press('lb'))).toEqual([{ type: 'cycleSystem', dir: -1 }])
    expect(route(state, press('rt'))).toEqual([{ type: 'jumpLetter', dir: 1, wrap: true }])
    expect(route(state, press('lt'))).toEqual([{ type: 'jumpLetter', dir: -1, wrap: true }])
    expect(route(state, press('x', 1))).toEqual([{ type: 'openFilters' }])
  })

  it('ignora rilasci, testo in libreria e stato non pronto', () => {
    expect(route(ready(), { pad: 0, button: 'a', kind: 'release' })).toEqual([])
    expect(route(ready(), { pad: null, kind: 'text', text: 'd' })).toEqual([])
    expect(route(initialState, press('right'))).toEqual([])
    expect(route(ready(), { pad: 0, button: 'rb', kind: 'repeat' })).toEqual([])
  })

  it('B cancella la ricerca solo se attiva', () => {
    expect(route(ready(), press('b'))).toEqual([])
    const state = { ...ready(), query: 'dig' }
    expect(types(route(state, press('b')))).toEqual(['clearSearch'])
  })

  it('tastiera a schermo: comandi e proprietario', () => {
    const state = reducer(ready(), openKeyboard('search', { owner: 0 }))
    expect(types(route(state, press('left')))).toEqual(['oskMove'])
    expect(types(route(state, press('a')))).toEqual(['oskPress'])
    expect(types(route(state, press('x')))).toEqual(['oskErase'])
    expect(route(state, press('y'))).toEqual([{ type: 'oskType', text: ' ' }])
    expect(route(state, press('lb'))).toEqual([{ type: 'oskCaret', to: 'left' }])
    expect(route(state, press('rb'))).toEqual([{ type: 'oskCaret', to: 'right' }])
    expect(route(state, { ...press('rb'), kind: 'repeat' })).toEqual([{ type: 'oskCaret', to: 'right' }])
    expect(route(state, { ...press('lb'), source: 'keyboard' })).toEqual([{ type: 'oskCaret', to: 'start' }])
    expect(route(state, { ...press('rb'), source: 'keyboard' })).toEqual([{ type: 'oskCaret', to: 'end' }])
    expect(types(route(state, press('start')))).toEqual(['oskConfirm'])
    expect(types(route(state, press('b')))).toEqual(['oskCancel'])
    // Un altro joypad non la comanda; tastiera fisica e mouse sì.
    expect(route(state, press('a', 1))).toEqual([])
    expect(types(route(state, { pad: null, button: 'a', kind: 'press', source: 'mouse' }))).toEqual(['oskPress'])
    expect(route(state, { pad: null, kind: 'text', text: 'k', source: 'keyboard' })).toEqual([{ type: 'oskType', text: 'k' }])
  })
})

describe('Impostazioni', () => {
  it('SELECT dalla libreria apre le Impostazioni', () => {
    expect(route(ready(), press('select'))).toEqual([{ type: 'openSettings' }])
    const state = send(ready(), press('select'))
    expect(state.view).toBe('settings')
    expect(state.settings).toEqual({ status: 'loading', error: null })
  })

  it('nella vista Impostazioni la libreria non riceve comandi', () => {
    const state = send(ready(), press('select'))
    expect(route(state, press('right'))).toEqual([])
    expect(route(state, press('select'))).toEqual([])
    expect(send(state, press('rb')).systemId).toBe('arcade')
  })

  it('B e SELECT chiudono, con conferma se ci sono modifiche', () => {
    expect(settingsCommand(press('b'), false)).toBe('close')
    expect(settingsCommand(press('select'), false)).toBe('close')
    expect(settingsCommand(press('b'), true)).toBe('confirm')
    expect(settingsCommand(press('a'), true)).toBeNull()
    expect(settingsCommand({ pad: 0, button: 'b', kind: 'release' }, false)).toBeNull()
  })
})

describe('instradamento nel reducer', () => {
  it('RB/LB cambiano console con ritorno al primo gioco', () => {
    let state = send(ready(), press('right'), press('right'))
    expect(state.index).toBe(2)
    state = send(state, press('rb'))
    expect(state.systemId).toBe('mame')
    expect(state.index).toBe(0)
    state = send(state, press('lb'), press('lb'))
    expect(state.systemId).toBe('neogeo')
    state = send(state, press('rb'))
    expect(state.systemId).toBe('arcade')
  })

  it('una sola console: LB/RB non fanno nulla', () => {
    let state = reducer(initialState, bootstrapLoaded({ systems: [systems[0]], warnings: [] }))
    state = reducer(state, gamesLoaded('arcade', games()))
    expect(send(state, press('rb'))).toBe(state)
  })

  it('RT/LT saltano all\'iniziale successiva o precedente, saltando i gruppi vuoti e ripartendo dall\'altro capo', () => {
    let state = ready()
    expect(currentGame(state).title).toBe('1942')
    state = send(state, press('rt'))
    expect(currentGame(state).title).toBe('Asteroids')
    state = send(state, press('rt'), press('rt'))
    expect(currentGame(state).title).toBe('Dig Dug')
    state = send(state, press('right'), press('rt'))
    // «Élite» senza accento è nel gruppo E.
    expect(currentGame(state).title).toBe('Élite')
    state = send(state, press('rt'), press('rt'))
    expect(currentGame(state).title).toBe('Zaxxon')
    expect(currentGame(send(state, press('rt'))).title).toBe('1942')
    state = send(state, press('lt'))
    expect(currentGame(state).title).toBe('Galaga')
    state = send(state, press('lt'), press('lt'), press('lt'), press('lt'), press('lt'))
    expect(currentGame(state).title).toBe('1942')
    expect(currentGame(send(state, press('lt'))).title).toBe('Zaxxon')
  })

  it('griglia: una pressione oltre il bordo riparte dall\'altro capo, il tasto tenuto si ferma', () => {
    const hold = (button) => ({ pad: 0, button, kind: 'repeat', source: 'pad' })
    // 9 giochi su 4 colonne: righe 0–3, 4–7 e 8.
    let state = send(ready(), press('left'))
    expect(currentGame(state).title).toBe('Zaxxon')
    expect(send(ready(), hold('left')).index).toBe(0)
    expect(send(state, hold('right')).index).toBe(8)
    expect(send(state, press('right')).index).toBe(0)
    expect(send(ready(), press('right'), press('up')).index).toBe(8)
    expect(send(ready(), press('down'), press('down'), press('down')).index).toBe(0)
    expect(send(ready(), press('down'), press('down'), hold('down')).index).toBe(8)
    state = send(ready(), press('right'), press('right'), press('down'))
    expect(send(state, press('down')).index).toBe(8)
    expect(send(state, press('down'), press('down')).index).toBe(0)
  })

  it('iniziali presenti', () => {
    expect(presentLetters(ready())).toEqual(new Set(['#', 'A', 'B', 'D', 'E', 'G', 'Z']))
  })

  it('ricerca con la tastiera a schermo: «dig», conferma e cancellazione', () => {
    let state = search(ready())
    expect(state.osk).toMatchObject({ purpose: 'search', owner: 0, value: '' })
    // Dalla q: giù → a, destra ×2 → d.
    state = send(state, press('down'), press('right'), press('right'), press('a'))
    expect(state.osk.value).toBe('d')
    // Il resto arriva dalla tastiera fisica.
    state = send(state, { pad: 0, kind: 'text', text: 'ig' })
    expect(state.query).toBe('dig')
    expect(filtered(state).map((game) => game.title)).toEqual(['Dig Dug', 'Dig Dug II'])
    expect(state.index).toBe(0)
    state = send(state, press('start'))
    expect(state.osk).toBeNull()
    expect(state.query).toBe('dig')
    state = send(state, press('b'))
    expect(state.query).toBe('')
    // Resta selezionato lo stesso gioco.
    expect(currentGame(state).title).toBe('Dig Dug')
  })

  it('B nella tastiera a schermo ripristina il filtro precedente', () => {
    let state = { ...ready(), query: 'dig' }
    state = search(state)
    expect(state.osk.value).toBe('dig')
    state = send(state, press('x'), press('x'), press('x'), { pad: 0, kind: 'text', text: 'zax' })
    expect(filtered(state).map((game) => game.title)).toEqual(['Zaxxon'])
    state = send(state, press('b'))
    expect(state.osk).toBeNull()
    expect(state.query).toBe('dig')
    expect(filtered(state)).toHaveLength(2)
  })

  it('nessun risultato', () => {
    const state = send(search(ready()), { pad: 0, kind: 'text', text: 'pacman' }, press('start'))
    expect(filtered(state)).toEqual([])
    expect(currentGame(state)).toBeNull()
    expect(send(state, press('right'))).toBe(state)
  })
})

describe('azioni del gioco', () => {
  it('A sulla griglia porta a «Gioca», A su «Gioca» chiede l\'avvio', () => {
    let state = ready()
    state = send(state, press('right'))
    expect(route(state, press('a'))).toEqual([{ type: 'setHeroFocus', focus: 'play' }])
    state = send(state, press('a'))
    expect(state.heroFocus).toBe('play')
    const [action] = route(state, press('a'))
    expect(action).toMatchObject({ type: 'request', kind: 'launch', system: 'arcade' })
    expect(action.game).toBe(currentGame(state))
  })

  it('← → tra Gioca, Trofei e Altro, anche dall\'altro capo; su e giù non escono; B torna alla griglia', () => {
    let state = send(ready(), press('down'), press('a'))
    expect(state.heroFocus).toBe('play')
    state = send(state, press('right'))
    expect(state.heroFocus).toBe('trophies')
    state = send(state, press('right'))
    expect(state.heroFocus).toBe('more')
    expect(route(state, press('a'))).toEqual([{ type: 'openMoreMenu' }])
    expect(send(state, { pad: 0, button: 'right', kind: 'repeat', source: 'pad' }).heroFocus).toBe('more')
    state = send(state, press('right'))
    expect(state.heroFocus).toBe('play')
    state = send(state, press('left'), press('up'), press('down'))
    expect(state.heroFocus).toBe('more')
    expect(state.index).toBe(4)
    expect(send(state, press('a')).moreMenu).toMatchObject({ system: 'arcade' })
    state = send(state, press('right'))
    expect(state.heroFocus).toBe('play')
    state = send(state, press('b'))
    expect(state.heroFocus).toBeNull()
    expect(state.index).toBe(4)
  })

  it('↓ da «Gioca» porta al core, A apre il menu dei core, ↑ torna a «Gioca»', () => {
    let state = send(ready(), press('a'))
    expect(state.heroFocus).toBe('play')
    state = send(state, press('down'))
    expect(state.heroFocus).toBe('core')
    const [action] = route(state, press('a'))
    expect(action).toMatchObject({ type: 'request', kind: 'coreMenu', system: 'arcade' })
    expect(send(state, press('down')).heroFocus).toBe('play')
    expect(send(state, press('up')).heroFocus).toBe('play')
    expect(send(state, press('right')).heroFocus).toBe('trophies')
  })

  it('↑ dalla prima riga non porta più alle azioni: va all\'ultima riga', () => {
    const state = send(ready(), press('up'))
    expect(state.heroFocus).toBeNull()
    expect(state.index).toBe(8)
  })

  it('cambiare console azzera il focus', () => {
    const state = send(ready(), press('a'), press('rb'))
    expect(state.heroFocus).toBeNull()
  })

  it('senza giochi A non fa nulla', () => {
    const state = { ...ready(), query: 'nessuno' }
    expect(route(state, press('a'))).toEqual([])
  })
})

describe('copertina e descrizione nella sezione in alto', () => {
  const full = { id: 'zelda.nes', file: 'zelda.nes', title: 'Zelda', metaId: 'zelda-nes', cover: true, description: 'Avventura.' }

  function withMetadata() {
    let state = reducer(initialState, bootstrapLoaded({ systems, warnings: [] }))
    state = reducer(state, gamesLoaded('mame', [full, { id: 'b.nes', file: 'b.nes', title: 'B' }]))
    state = reducer(state, { type: 'selectSystem', system: 'mame' })
    return send(reducer(state, setColumns(4)), press('a'))
  }

  it('elementi secondo i dati del gioco', () => {
    expect(heroActionsFor(full)).toEqual(['cover', 'play', 'text', 'trophies', 'more'])
    expect(heroActionsFor({ ...full, cover: false, description: null })).toEqual(['play', 'trophies', 'more'])
    expect(heroActionsFor({ id: 'x.nes', title: 'x' })).toEqual(['play', 'trophies', 'more'])
  })

  it('A su Trofei apre i trofei, ↑↓ li scorrono e A torna alla scheda', () => {
    let state = send(withMetadata(), press('right'), press('right'))
    expect(state.heroFocus).toBe('trophies')
    state = send(state, press('a'))
    expect(heroView(state).panel).toBe('trophies')
    const seq = state.heroScroll.seq
    state = send(state, press('down'))
    expect(state.heroScroll).toEqual({ dir: 1, seq: seq + 1 })
    state = send(state, press('a'))
    expect(heroView(state).panel).toBe('info')
  })

  it('← da Gioca porta alla copertina, dove ← → cambiano immagine e ↓ torna a Gioca', () => {
    let state = send(withMetadata(), press('left'))
    expect(state.heroFocus).toBe('cover')
    state = send(state, press('right'))
    expect(state.heroFocus).toBe('cover')
    expect(heroView(state).image).toBe('title')
    state = send(state, press('right'), press('right'))
    expect(heroView(state).image).toBe('cover')
    state = send(state, press('left'))
    expect(heroView(state).image).toBe('snap')
    expect(send(state, { pad: 0, button: 'left', kind: 'repeat', source: 'pad' })).toBe(state)
    state = send(state, press('a'))
    expect(heroView(state).image).toBe('cover')
    state = send(state, press('down'))
    expect(state.heroFocus).toBe('play')
  })

  it('A su Descrizione cambia vista, ↑↓ scorrono solo la descrizione', () => {
    let state = send(withMetadata(), press('right'))
    expect(state.heroFocus).toBe('text')
    expect(route(state, press('down'))).toEqual([])
    state = send(state, press('a'))
    expect(heroView(state).panel).toBe('text')
    expect(route(state, press('down'))).toEqual([{ type: 'scrollHero', dir: 1 }])
    expect(route(state, { pad: 0, button: 'up', kind: 'repeat', source: 'pad' })).toEqual([{ type: 'scrollHero', dir: -1 }])
    state = send(state, press('down'))
    expect(state.heroScroll.seq).toBe(1)
    state = send(state, press('a'))
    expect(heroView(state).panel).toBe('info')
  })

  it('un altro gioco riparte da copertina e scheda', () => {
    let state = send(withMetadata(), press('right'), press('a'))
    state = send(state, press('left'), press('left'), press('right'))
    expect(heroView(state)).toEqual({ image: 'title', panel: 'text' })
    state = send(state, press('b'), press('right'))
    expect(heroView(state)).toEqual({ image: 'cover', panel: 'info' })
    state = send(state, press('left'))
    expect(heroView(state)).toEqual({ image: 'cover', panel: 'info' })
  })
})
