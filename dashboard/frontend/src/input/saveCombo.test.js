import { describe, expect, it } from 'vitest'
import { DEFAULT_BUTTONS } from './mapping.js'
import { initialPlayers } from '../state/players.js'
import {
  DEFAULT_SAVE_COMBO,
  comboError,
  comboHeld,
  comboSlot,
  comboStep,
  initialSaveCombo,
  learnCombo,
} from './saveCombo.js'

// Joypad della Gamepad API con i tasti `pressed` (indici) e la croce sugli assi.
// Tasti di ogni joypad: solo quello con id `P` è configurato.
const PAD_BUTTONS = { P: DEFAULT_BUTTONS }

function pad(index, pressed = [], axes = [0, 0]) {
  const buttons = Array.from({ length: 17 }, (_, at) => ({ pressed: pressed.includes(at), value: pressed.includes(at) ? 1 : 0 }))
  return { index, id: 'P', buttons, axes }
}

const SELECT = DEFAULT_BUTTONS.select
const LT = DEFAULT_BUTTONS.lt

function step(state, pads, combo = DEFAULT_SAVE_COMBO) {
  return comboStep(state, pads, PAD_BUTTONS, combo)
}

describe('combinazione dei salvataggi', () => {
  it('tasti tenuti insieme', () => {
    expect(comboHeld(new Set(['select', 'lt']), DEFAULT_SAVE_COMBO)).toBe(true)
    expect(comboHeld(new Set(['select']), DEFAULT_SAVE_COMBO)).toBe(false)
    expect(comboHeld(new Set(['select', 'lt']), null)).toBe(false)
  })

  it('una volta per pressione e per joypad', () => {
    let result = step(initialSaveCombo(), [pad(0, [SELECT])])
    expect(result.fired).toEqual([])
    result = step(result.state, [pad(0, [SELECT, LT])])
    expect(result.fired).toEqual([0])
    result = step(result.state, [pad(0, [SELECT, LT])])
    expect(result.fired).toEqual([])
    result = step(result.state, [pad(0, [LT])])
    result = step(result.state, [pad(0, [SELECT, LT]), pad(1, [SELECT, LT])])
    expect(result.fired).toEqual([0, 1])
  })

  it('i due tasti devono essere sullo stesso joypad', () => {
    expect(step(initialSaveCombo(), [pad(0, [SELECT]), pad(1, [LT])]).fired).toEqual([])
  })

  it('combinazione cambiata nelle Impostazioni', () => {
    const combo = ['select', 'rt']
    expect(step(initialSaveCombo(), [pad(0, [SELECT, LT])], combo).fired).toEqual([])
    expect(step(initialSaveCombo(), [pad(0, [SELECT, DEFAULT_BUTTONS.rt])], combo).fired).toEqual([0])
  })

  it('joypad scollegati o assenti', () => {
    expect(step(initialSaveCombo(), [null, pad(1, [SELECT, LT])]).fired).toEqual([1])
    expect(step(initialSaveCombo(), null).fired).toEqual([])
  })

  it('ogni joypad con i suoi tasti; i joypad non configurati non contano', () => {
    const other = { ...pad(1, [SELECT, 3]), id: 'Q' }
    const padButtons = { ...PAD_BUTTONS, Q: { ...DEFAULT_BUTTONS, lt: 3, x: 6 } }
    expect(comboStep(initialSaveCombo(), [pad(0, [SELECT, LT]), other], padButtons, DEFAULT_SAVE_COMBO).fired).toEqual([0, 1])
    expect(step(initialSaveCombo(), [{ ...pad(0, [SELECT, LT]), id: 'nuovo' }]).fired).toEqual([])
  })

  it('giocatore della combinazione', () => {
    const user = { id: 1, name: 'LUCA', guest: false }
    const players = {
      p1: { ...initialPlayers.p1, joined: true, pad: 0, user },
      p2: { ...initialPlayers.p2, joined: true, pad: 2, user: { id: 2, name: 'ANNA', guest: false } },
    }
    expect(comboSlot(players, 0)).toBe('p1')
    expect(comboSlot(players, 2)).toBe('p2')
    expect(comboSlot(players, 1)).toBeNull()
    const keyboard = { ...players, p1: { ...players.p1, pad: null } }
    expect(comboSlot(keyboard, 1)).toBe('p1')
    expect(comboSlot(initialPlayers, 0)).toBeNull()
  })

  it('validazione', () => {
    expect(comboError(['select', 'lt'])).toBeNull()
    expect(comboError(['select', 'start'])).toMatch(/START\+SELECT/)
    expect(comboError(['start', 'select'])).toMatch(/START\+SELECT/)
    expect(comboError(['lt', 'lt'])).toMatch(/diversi/)
    expect(comboError(['lt'])).not.toBeNull()
    expect(comboError(['lt', 'up'])).not.toBeNull()
  })

  it('apprendimento dai tasti grezzi', () => {
    expect(learnCombo(DEFAULT_BUTTONS, [SELECT, DEFAULT_BUTTONS.rt])).toEqual({ combo: ['select', 'rt'] })
    expect(learnCombo(DEFAULT_BUTTONS, [DEFAULT_BUTTONS.start, SELECT]).error).toMatch(/START\+SELECT/)
    expect(learnCombo(DEFAULT_BUTTONS, [SELECT, 12]).error).toMatch(/croce/)
    const swapped = { ...DEFAULT_BUTTONS, lt: 7, rt: 6 }
    expect(learnCombo(swapped, [SELECT, 6])).toEqual({ combo: ['select', 'rt'] })
  })
})
