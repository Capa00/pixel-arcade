import { describe, expect, it } from 'vitest'
import {
  bootstrapLoaded,
  clickSlot,
  closeLogin,
  leaveSlot,
  login,
  loginForm,
  loginGuest,
  loginStep,
  oskCancel,
  oskConfirm,
  oskType,
  openKeyboard,
  padsChanged,
  pressStart,
  profileCreated,
  profileFailed,
  resetPlayers,
} from './actions.js'
import {
  FULL_MESSAGE,
  gate,
  launchPadModels,
  launchPads,
  launchPlayers,
  leaderPad,
  normalizeName,
  versusLabel,
} from './players.js'
import { initialState, reducer } from './reducer.js'

const systems = [
  { id: 'arcade', name: 'ARCADE', covers: [] },
  { id: 'nes', name: 'NES', covers: [] },
]

const LUCA = { id: 1, name: 'LUCA_8BIT', color: '#ff5d73' }
const SARA = { id: 2, name: 'SARA.EXE', color: '#3ccfc4' }

function ready() {
  return reducer(initialState, bootstrapLoaded({ systems, warnings: [] }))
}

function apply(state, ...actions) {
  return actions.reduce(reducer, state)
}

function press(button, pad = 0) {
  return { pad, button, kind: 'press', source: pad === null ? 'keyboard' : 'pad' }
}

// P1 = joypad 1 (LUCA), P2 = joypad 0 (SARA), finestre chiuse.
function twoPlayers() {
  return apply(ready(), pressStart(1), login('p1', LUCA), pressStart(0), login('p2', SARA))
}

describe('START e slot', () => {
  it('il primo joypad che preme START è P1, il secondo P2, un terzo trova gli slot pieni', () => {
    let state = apply(ready(), pressStart(2))
    expect(state.players.p1).toMatchObject({ joined: true, pad: 2, modal: true, step: 'choose', user: null })
    expect(state.players.p1.form).toEqual({ name: '', color: '#ff5d73', console: 'arcade' })
    state = apply(state, pressStart(0))
    expect(state.players.p2).toMatchObject({ joined: true, pad: 0, modal: true })
    expect(state.players.p2.form.color).toBe('#3ccfc4')
    const before = state.players
    state = apply(state, pressStart(3))
    expect(state.players).toBe(before)
    expect(state.toast.message).toBe(FULL_MESSAGE)
  })

  it('START di un joypad già entrato riapre la sua finestra', () => {
    let state = twoPlayers()
    expect(state.players.p1.modal).toBe(false)
    state = apply(state, loginStep('p2', 'new'), pressStart(1))
    expect(state.players.p1).toMatchObject({ modal: true, step: 'choose', user: expect.objectContaining({ id: 1 }) })
    expect(state.players.p2.modal).toBe(false)
  })

  it('F2 e il clic: tastiera e mouse entrano senza joypad', () => {
    let state = apply(ready(), pressStart(null))
    expect(state.players.p1).toMatchObject({ joined: true, pad: null, modal: true })
    state = apply(state, closeLogin('p1'), clickSlot('p2'))
    expect(state.players.p1).toMatchObject({ joined: true, pad: null })
    expect(state.players.p2.joined).toBe(false)
    state = apply(state, login('p1', LUCA), clickSlot('p2'))
    expect(state.players.p2).toMatchObject({ joined: true, pad: null, modal: true })
    state = apply(state, closeLogin('p2'), clickSlot('p1'))
    expect(state.players.p1).toMatchObject({ modal: true, step: 'choose' })
  })

  it('B senza profilo libera lo slot; con profilo chiude soltanto', () => {
    let state = apply(ready(), pressStart(0), closeLogin('p1'))
    expect(state.players.p1.joined).toBe(false)
    state = apply(state, pressStart(0), loginGuest('p1'), pressStart(0), closeLogin('p1'))
    expect(state.players.p1).toMatchObject({ joined: true, modal: false })
    expect(state.players.p1.user).toEqual({ id: null, name: 'Ospite 1', color: '#d8d5e3', guest: true })
  })

  it('se esce P1, P2 diventa P1 con profilo e joypad', () => {
    let state = apply(twoPlayers(), leaveSlot('p1'))
    expect(state.players.p1).toMatchObject({ joined: true, pad: 0, user: expect.objectContaining({ name: 'SARA.EXE' }) })
    expect(state.players.p2.joined).toBe(false)
    state = apply(state, pressStart(1))
    expect(state.players.p2).toMatchObject({ joined: true, pad: 1, modal: true })
    // P1 che chiude senza profilo mentre P2 sceglie: P2 sale.
    state = apply(ready(), pressStart(0), pressStart(1), closeLogin('p1'))
    expect(state.players.p1).toMatchObject({ joined: true, pad: 1, modal: true })
    expect(state.players.p2.joined).toBe(false)
  })

  it('START+SELECT breve: escono tutti, finestre e viste si chiudono', () => {
    let state = apply(twoPlayers(), openKeyboard('search'), pressStart(0))
    expect(state.osk).not.toBeNull()
    expect(state.players.p2.modal).toBe(true)
    state = { ...state, view: 'profile', profileSlot: 'p1', filtersOpen: true }
    state = apply(state, resetPlayers())
    expect(state.players.p1.joined).toBe(false)
    expect(state.players.p2.joined).toBe(false)
    expect(state).toMatchObject({ view: 'library', profileSlot: null, osk: null, filtersOpen: false })
    // Poi il primo joypad che preme START torna P1.
    state = apply(state, pressStart(0))
    expect(state.players.p1).toMatchObject({ joined: true, pad: 0, modal: true })
  })

  it('joypad scollegato: il suo giocatore esce, anche con un profilo', () => {
    const A = { index: 0, id: 'Joypad A' }
    const B = { index: 1, id: 'Joypad B' }
    let state = apply(twoPlayers(), padsChanged([A, B]))
    expect(state.players.p1).toMatchObject({ pad: 1, padId: 'Joypad B' })
    expect(state.players.p2).toMatchObject({ pad: 0, padId: 'Joypad A' })
    state = apply(state, padsChanged([A]))
    // P1 (joypad 1) esce: P2 sale con profilo e joypad.
    expect(state.players.p1).toMatchObject({ pad: 0, user: expect.objectContaining({ name: 'SARA.EXE' }) })
    expect(state.players.p2.joined).toBe(false)
    expect(leaderPad(state.players)).toBe(0)
    // Senza profilo lo slot si libera come prima.
    state = apply(ready(), pressStart(0), pressStart(1), padsChanged([B]))
    expect(state.players.p1).toMatchObject({ joined: true, pad: 1 })
    expect(state.players.p2.joined).toBe(false)
  })

  it('un altro joypad con lo stesso indice non prende il posto del precedente', () => {
    let state = apply(ready(), pressStart(0, 'Joypad A'), login('p1', LUCA))
    expect(state.players.p1.padId).toBe('Joypad A')
    state = apply(state, padsChanged([{ index: 0, id: 'Joypad A' }]))
    expect(state.players.p1.user).toEqual(expect.objectContaining({ id: 1 }))
    state = apply(state, padsChanged([{ index: 0, id: 'Joypad B' }]))
    expect(state.players.p1.joined).toBe(false)
    expect(state.players.p1.user).toBeNull()
  })
})

describe('nuovo profilo', () => {
  it('normalizza il nome come il backend', () => {
    expect(normalizeName(' luca 8bit ')).toBe('LUCA_8BIT')
    expect(normalizeName('sara.exe')).toBe('SARA.EXE')
    expect(normalizeName('abcdefghijklmnopqrstuvwxyz0123')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXY')
    expect(normalizeName('àbcdefghijklmnop!')).toBe('BCDEFGHIJKLMNOP')
  })

  it('tastiera a schermo del nome: testo normalizzato, annulla e conferma', () => {
    let state = apply(ready(), pressStart(1), loginStep('p1', 'new'))
    const keyboard = openKeyboard('profileName', { owner: 1, max: 12, position: 'left', upper: true, target: { kind: 'profile', slot: 'p1', pad: 1 } })
    state = apply(state, keyboard, oskType('pro va'))
    expect(state.osk.upper).toBe(true)
    expect(state.players.p1.form.name).toBe('PRO_VA')
    state = apply(state, oskCancel())
    expect(state.players.p1.form.name).toBe('')
    state = apply(state, keyboard, oskType('prova_1'), oskConfirm())
    expect(state.osk).toBe(null)
    expect(state.players.p1.form.name).toBe('PROVA_1')
  })

  it('la tastiera del nome si chiude se la finestra si chiude o passa a un altro giocatore', () => {
    let state = apply(ready(), pressStart(1), pressStart(0), loginStep('p2', 'new'))
    state = apply(state, openKeyboard('profileName', { owner: 0, target: { kind: 'profile', slot: 'p2', pad: 0 } }))
    state = apply(state, closeLogin('p1'))
    expect(state.players.p1.pad).toBe(0)
    expect(state.osk).toBe(null)
  })

  it('profilo creato: entra nello slot e nell\'elenco; errore sotto il nome', () => {
    let state = apply(ready(), pressStart(0), loginStep('p1', 'new'), loginForm('p1', { name: 'PROVA_1', color: '#f5c542' }))
    state = apply(state, profileFailed('p1', 'Nome già in uso'))
    expect(state.players.p1).toMatchObject({ error: 'Nome già in uso', saving: false, modal: true })
    state = apply(state, loginForm('p1', { name: 'PROVA_2' }))
    expect(state.players.p1.error).toBe(null)
    const account = { id: 7, name: 'PROVA_2', color: '#f5c542' }
    state = apply(state, profileCreated('p1', account))
    expect(state.accounts).toEqual([account])
    expect(state.players.p1).toMatchObject({ modal: false, user: { id: 7, name: 'PROVA_2', color: '#f5c542', guest: false } })
    expect(state.players.p1.form.name).toBe('')
  })
})

describe('testi e avvio', () => {
  it('riga della schermata di avvio', () => {
    let state = ready()
    expect(versusLabel(state.players)).toBe('')
    state = apply(state, pressStart(1), login('p1', LUCA))
    expect(versusLabel(state.players)).toBe('LUCA_8BIT · 1 giocatore')
    state = apply(state, pressStart(0), loginGuest('p2'))
    expect(versusLabel(state.players)).toBe('LUCA_8BIT  vs  Ospite 2')
  })

  it('players e pads di POST /api/launch', () => {
    expect(launchPlayers(ready().players)).toEqual([null, null])
    expect(launchPads(ready().players)).toEqual([null, null])
    const state = apply(twoPlayers(), loginGuest('p2'))
    expect(launchPlayers(state.players)).toEqual([1, null])
    expect(launchPads(state.players)).toEqual([1, 0])
    // Un giocatore che sta ancora scegliendo non ha joypad in RetroArch.
    const choosing = apply(ready(), pressStart(1), login('p1', LUCA), pressStart(0))
    expect(launchPads(choosing.players)).toEqual([1, null])
  })

  it('padModels di POST /api/launch: modello e posizione tra i joypad uguali', () => {
    const xbox = { id: 'Microsoft X-Box 360 pad (STANDARD GAMEPAD Vendor: 045e Product: 028e)' }
    const generic = { id: 'DragonRise Inc.   Generic   USB  Joystick   (Vendor: 0079 Product: 0006)' }
    const state = apply(twoPlayers(), loginGuest('p2'))
    // P1 ha il joypad 1, P2 il joypad 0.
    expect(launchPadModels(state.players, [xbox, generic])).toEqual([
      { vendor: 0x0079, product: 0x0006, rank: 0 },
      { vendor: 0x045e, product: 0x028e, rank: 0 },
    ])
    expect(launchPadModels(state.players, [generic, generic])).toEqual([
      { vendor: 0x0079, product: 0x0006, rank: 1 },
      { vendor: 0x0079, product: 0x0006, rank: 0 },
    ])
    expect(launchPadModels(state.players, [{ id: 'senza modello' }, null])).toEqual([null, null])
    expect(launchPadModels(ready().players, [xbox])).toEqual([null, null])
  })
})

describe('gate', () => {
  it('joypad non entrati: solo START nella libreria', () => {
    const state = ready()
    expect(gate(state, press('down'))).toEqual({ to: 'blocked', hint: true })
    expect(gate(state, { pad: 0, button: 'down', kind: 'repeat', source: 'pad' })).toEqual({ to: 'blocked', hint: false })
    expect(gate(state, press('start'))).toEqual({ to: 'start' })
    expect(gate({ ...state, view: 'settings' }, press('start'))).toEqual({ to: 'blocked', hint: true })
    expect(gate({ ...state, run: { running: true } }, press('start'))).toEqual({ to: 'blocked', hint: true })
    // Tastiera e mouse navigano sempre.
    expect(gate(state, press('down', null))).toEqual({ to: 'app' })
    expect(gate(state, press('start', null))).toEqual({ to: 'start' })
  })

  it('due finestre aperte: ogni joypad la sua, la tastiera quella di P1', () => {
    const state = apply(ready(), pressStart(1), pressStart(0))
    expect(gate(state, press('down', 1))).toEqual({ to: 'modal', slot: 'p1' })
    expect(gate(state, press('a', 0))).toEqual({ to: 'modal', slot: 'p2' })
    expect(gate(state, press('b', null))).toEqual({ to: 'modal', slot: 'p1' })
    expect(gate(state, press('down', 2))).toEqual({ to: 'blocked', hint: true })
  })

  it('libreria: comanda il joypad di P1; P2 solo START; con una finestra aperta gli altri aspettano', () => {
    let state = twoPlayers()
    expect(gate(state, press('right', 1))).toEqual({ to: 'app' })
    expect(gate(state, press('right', 0))).toEqual({ to: 'follower' })
    expect(gate(state, press('start', 0))).toEqual({ to: 'start' })
    expect(gate(state, press('right', null))).toEqual({ to: 'app' })
    state = apply(state, pressStart(0))
    expect(gate(state, press('right', 1))).toEqual({ to: 'ignore' })
    expect(gate(state, press('start', 1))).toEqual({ to: 'start' })
    expect(gate(state, press('right', null))).toEqual({ to: 'modal', slot: 'p2' })
  })

  it('tastiera a schermo: solo il suo proprietario e la tastiera fisica', () => {
    let state = apply(ready(), pressStart(1), pressStart(0), loginStep('p1', 'new'))
    state = apply(state, openKeyboard('profileName', { owner: 1, target: { kind: 'profile', slot: 'p1', pad: 1 } }))
    expect(gate(state, press('a', 1))).toEqual({ to: 'app' })
    expect(gate(state, press('a', null))).toEqual({ to: 'app' })
    expect(gate(state, press('a', 0))).toEqual({ to: 'modal', slot: 'p2' })
  })
})
