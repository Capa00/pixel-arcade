import { describe, expect, it } from 'vitest'
import { HERO_ACTIONS, followerActions, route } from '../input/controller.js'
import {
  bootstrapLoaded,
  consolePrefsChanged,
  favoriteSynced,
  gamesLoaded,
  gotoGame,
  hideToast,
  input,
  leaveSlot,
  login,
  loginGuest,
  openProfile,
  patchProfile,
  pressStart,
  profileSynced,
  profilesLoaded,
  selectIndex,
  selectSystem,
  setHeroFocus,
  showToast,
  syncFailed,
  toggleFavorite,
} from './actions.js'
import { gate } from './players.js'
import { stepId } from '../input/wrap.js'
import { crtOn, favoriteSlots, gameSummary, isFavorite, profileOf, profileTabs, vibrates } from './profiles.js'
import { allConsoles, currentGame, initialState, reducer } from './reducer.js'

const systems = [
  { id: 'arcade', name: 'ARCADE', covers: [] },
  { id: 'mame', name: 'MAME', arcade: true, covers: [] },
]

function account(id, name, extra = {}) {
  return {
    id,
    name,
    color: '#ff5d73',
    favConsole: null,
    difficulty: 'Normale',
    opts: { crt: false, vib: true },
    genres: [],
    level: 1,
    xpPercent: 0,
    title: 'Recluta',
    hours: 0,
    played: 0,
    sessions: 0,
    favorites: [],
    recent: [],
    ...extra,
  }
}

const LUCA = account(1, 'LUCA_8BIT', { opts: { crt: true, vib: true } })
const SARA = account(2, 'SARA.EXE', { color: '#3ccfc4', favorites: ['nes/zelda.nes'] })
const NONNO = account(3, 'NONNO', { favConsole: 'mame' })

function apply(state, ...actions) {
  return actions.reduce(reducer, state)
}

function press(button, pad = 0) {
  return { pad, button, kind: 'press', source: 'pad' }
}

function ready() {
  let state = apply(initialState, bootstrapLoaded({ systems, warnings: [] }), profilesLoaded([LUCA, SARA, NONNO]))
  state = apply(state, gamesLoaded('arcade', [{ id: 'pang.zip', title: 'pang' }, { id: 'sf2.zip', title: 'sf2', metaId: 'sf2-meta', cover: true }]))
  return state
}

// LUCA è P1 col joypad 1, SARA è P2 col joypad 0; la libreria resta su arcade.
function twoPlayers() {
  return apply(ready(), pressStart(1), login('p1', LUCA), pressStart(0), login('p2', SARA))
}

describe('preferiti', () => {
  it('Y di P1 e di P2 sul gioco selezionato, con operazioni da inviare e vibrazione', () => {
    let state = twoPlayers()
    state = apply(state, toggleFavorite('p1'))
    expect(isFavorite(state, 'p1', 'arcade/pang.zip')).toBe(true)
    expect(favoriteSlots(state, 'arcade/pang.zip')).toEqual(['p1'])
    expect(state.sync).toEqual([{ seq: 1, kind: 'favorite', account: 1, key: 'arcade/pang.zip', on: true }])
    expect(state.haptic).toEqual({ slot: 'p1', seq: 1, on: true })
    state = apply(state, toggleFavorite('p2'))
    expect(favoriteSlots(state, 'arcade/pang.zip')).toEqual(['p1', 'p2'])
    expect(profileOf(state, 'p2').favorites).toEqual(['arcade/pang.zip', 'nes/zelda.nes'])
    expect(currentGame(state).id).toBe('pang.zip')
    state = apply(state, toggleFavorite('p1'))
    expect(favoriteSlots(state, 'arcade/pang.zip')).toEqual(['p2'])
    expect(state.sync.map((op) => op.on)).toEqual([true, true, false])
  })

  it('conferma e annullamento dal backend', () => {
    let state = apply(twoPlayers(), toggleFavorite('p1'), toggleFavorite('p1', 'arcade', 'sf2.zip'))
    // Il server conferma la prima operazione: la seconda, ancora in attesa, resta applicata.
    state = apply(state, favoriteSynced(1, ['arcade/pang.zip'], { 'arcade/pang.zip': { title: 'pang' } }))
    expect(profileOf(state, 'p1').favorites).toEqual(['arcade/sf2.zip', 'arcade/pang.zip'])
    expect(state.profileGames['arcade/pang.zip'].title).toBe('pang')
    state = apply(state, syncFailed(2, 'Gioco non trovato.'))
    expect(profileOf(state, 'p1').favorites).toEqual(['arcade/pang.zip'])
    expect(state.sync).toEqual([])
    expect(state.toast).toMatchObject({ message: 'Gioco non trovato.', variant: 'error' })
  })

  it('ospite: solo locale; senza giocatore un avviso', () => {
    let state = apply(ready(), pressStart(0), loginGuest('p1'), toggleFavorite('p1'))
    expect(isFavorite(state, 'p1', 'arcade/pang.zip')).toBe(true)
    expect(state.sync).toEqual([])
    expect(profileOf(state, 'p1')).toMatchObject({ title: 'Ospite', level: 1, guest: true })
    state = apply(ready(), toggleFavorite('p1'))
    expect(state.toast.message).toBe('Premi START per entrare e salvare i preferiti.')
  })

  it('Y dal joypad di P1, P2 e dalla tastiera', () => {
    const state = twoPlayers()
    expect(route(state, press('y', 1))).toEqual([toggleFavorite('p1')])
    expect(route(state, press('y', null))).toEqual([toggleFavorite('p1')])
    expect(gate(state, press('y', 0))).toEqual({ to: 'follower' })
    expect(followerActions(state, press('y', 0))).toEqual([toggleFavorite('p2')])
    expect(followerActions(state, press('select', 0))).toEqual([openProfile('p2')])
    expect(followerActions(state, press('right', 0))).toEqual([])
    expect(followerActions({ ...state, view: 'settings' }, press('y', 0))).toEqual([])
  })

  it('nella sezione in alto i preferiti non sono azioni: Y vale anche lì', () => {
    const state = apply(twoPlayers(), setHeroFocus('play'))
    expect(HERO_ACTIONS).toEqual(['cover', 'play', 'text', 'trophies', 'more'])
    expect(route(state, press('right', 1))).toEqual([setHeroFocus('trophies')])
    expect(route(state, press('y', 1))).toEqual([toggleFavorite('p1')])
  })
})

describe('preferenze', () => {
  it('modifica ottimistica, conferma e annullamento', () => {
    let state = twoPlayers()
    expect(crtOn(state)).toBe(true)
    state = apply(state, patchProfile('p1', { opts: { crt: false } }))
    expect(crtOn(state)).toBe(false)
    expect(profileOf(state, 'p1').opts).toEqual({ crt: false, vib: true })
    expect(state.sync[0]).toMatchObject({ kind: 'patch', account: 1, before: { opts: { crt: true, vib: true } } })
    state = apply(state, patchProfile('p1', { difficulty: 'Difficile' }))
    state = apply(state, syncFailed(state.sync[0].seq, 'Errore'))
    expect(crtOn(state)).toBe(true)
    expect(profileOf(state, 'p1').difficulty).toBe('Difficile')
    state = apply(state, profileSynced(state.sync[0].seq, { ...LUCA, difficulty: 'Difficile', color: '#8fd46a' }))
    expect(state.players.p1.user.color).toBe('#8fd46a')
    expect(state.sync).toEqual([])
  })

  it('ospite: preferenze locali; vibrazione', () => {
    let state = apply(ready(), pressStart(0), loginGuest('p1'))
    expect(vibrates(state, 'p1')).toBe(true)
    state = apply(state, patchProfile('p1', { opts: { vib: false }, genres: ['Puzzle'] }))
    expect(vibrates(state, 'p1')).toBe(false)
    expect(profileOf(state, 'p1')).toMatchObject({ genres: ['Puzzle'], opts: { crt: false, vib: false } })
    expect(state.sync).toEqual([])
    expect(vibrates(state, 'p2')).toBe(false)
  })

  it('P1 entra: la libreria passa alla sua console preferita', () => {
    const state = apply(ready(), pressStart(0), login('p1', NONNO))
    expect(state.systemId).toBe('mame')
    const other = apply(ready(), pressStart(0), pressStart(1), login('p2', NONNO))
    expect(other.systemId).toBe('arcade')
  })

  it('la console preferita del P1 è sempre nella sua riga', () => {
    let state = apply(ready(), consolePrefsChanged({ off: ['mame'], profiles: { 3: { add: [], remove: ['mame'] } } }))
    expect(allConsoles(state).map((entry) => entry.id)).toEqual(['arcade'])
    state = apply(state, pressStart(0), login('p1', NONNO))
    expect(allConsoles(state).map((entry) => entry.id)).toEqual(['arcade', 'mame'])
    state = apply(state, patchProfile('p1', { favConsole: null }))
    expect(allConsoles(state).map((entry) => entry.id)).toEqual(['arcade'])
  })
})

describe('pagina profilo', () => {
  it('SELECT del proprio joypad; senza giocatori le Impostazioni', () => {
    const state = twoPlayers()
    expect(route(state, press('select', 1))).toEqual([openProfile('p1')])
    expect(route(state, press('select', null))).toEqual([openProfile('p1')])
    expect(route(ready(), press('select', null))).toEqual([{ type: 'openSettings' }])
    const profile = apply(state, openProfile('p2'))
    expect(profile.view).toBe('profile')
    expect(gate(profile, press('down', 0))).toEqual({ to: 'app' })
    expect(gate(profile, press('down', 1))).toEqual({ to: 'follower' })
    expect(gate(profile, press('down', null))).toEqual({ to: 'app' })
  })

  it('«Esci» libera lo slot e torna alla libreria; slot vuoto non apre nulla', () => {
    let state = apply(twoPlayers(), openProfile('p2'), leaveSlot('p2'))
    expect(state.view).toBe('library')
    expect(state.players.p2.joined).toBe(false)
    state = apply(state, openProfile('p2'))
    expect(state.view).toBe('library')
  })

  it('A su un preferito: libreria sul gioco, anche prima che arrivino i giochi', () => {
    let state = apply(twoPlayers(), selectIndex(0), openProfile('p1'), gotoGame('arcade', 'sf2.zip'))
    expect(state.view).toBe('library')
    expect(currentGame(state).id).toBe('sf2.zip')
    state = apply(state, openProfile('p1'), gotoGame('mame', 'zelda.nes'))
    expect(state.systemId).toBe('mame')
    expect(state.pendingGame).toEqual({ system: 'mame', id: 'zelda.nes' })
    state = apply(state, gamesLoaded('mame', [{ id: 'mario.zip', title: 'Mario' }, { id: 'zelda.nes', title: 'Zelda' }]))
    expect(currentGame(state).id).toBe('zelda.nes')
    expect(state.pendingGame).toBeNull()
    state = apply(state, gotoGame('snes', 'x.sfc'))
    expect(state.toast.message).toBe('Console non più presente.')
    state = apply(state, selectSystem('arcade'), gotoGame('arcade', 'manca.zip'))
    expect(state.toast.message).toBe('Gioco non più presente nella libreria.')
  })

  it('riepilogo dei giochi: libreria, dati del backend o nome del file', () => {
    const state = { ...twoPlayers(), profileGames: { 'nes/zelda.nes': { title: 'Zelda', missing: true } } }
    expect(gameSummary(state, 'arcade/pang.zip')).toMatchObject({ title: 'pang', systemName: 'ARCADE', metaId: null, cover: false, missing: false })
    expect(gameSummary(state, 'arcade/sf2.zip')).toMatchObject({ metaId: 'sf2-meta', cover: true })
    expect(gameSummary(state, 'nes/zelda.nes')).toEqual({ title: 'Zelda', missing: true })
    expect(gameSummary(state, 'snes/dir/mario.sfc')).toMatchObject({ system: 'snes', id: 'dir/mario.sfc', title: 'dir/mario', metaId: null, cover: false, missing: true })
  })
})

describe('notifiche', () => {
  it('le notifiche in coda aspettano quella mostrata', () => {
    let state = apply(ready(), showToast('uno'), showToast('due', 'info', true), showToast('tre', 'info', true))
    expect(state.toast.message).toBe('uno')
    state = apply(state, hideToast())
    expect(state.toast.message).toBe('due')
    state = apply(state, hideToast(), hideToast())
    expect(state.toast).toBeNull()
    state = apply(state, showToast('quattro', 'info', true))
    expect(state.toast.message).toBe('quattro')
  })

  it('evento Y instradato dal reducer', () => {
    const state = apply(twoPlayers(), input(press('y', 1)))
    expect(isFavorite(state, 'p1', 'arcade/pang.zip')).toBe(true)
  })
})

describe('schede del profilo', () => {
  it('un ospite vede solo Panoramica e Preferenze', () => {
    expect(profileTabs(true).map((tab) => tab.id)).toEqual(['overview', 'stats', 'trophies', 'saves', 'wrapped', 'challenges', 'prefs'])
    expect(profileTabs(false).map((tab) => tab.id)).toEqual(['overview', 'prefs'])
  })

  it('LB e RB girano in cerchio', () => {
    const tabs = profileTabs(true)
    expect(stepId(tabs, 'overview', 1)).toBe('stats')
    expect(stepId(tabs, 'prefs', 1)).toBe('overview')
    expect(stepId(tabs, 'overview', -1)).toBe('prefs')
    expect(stepId(profileTabs(false), 'stats', 1)).toBe('prefs')
  })
})
