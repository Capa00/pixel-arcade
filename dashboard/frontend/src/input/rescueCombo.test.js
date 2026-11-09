import { describe, expect, it } from 'vitest'
import { DEFAULT_BUTTONS } from './mapping.js'
import { DEFAULT_SAVE_COMBO } from './saveCombo.js'
import {
  DEFAULT_RESCUE_COMBO,
  RESCUE_HOLD_MS,
  RESCUE_SHARED_MS,
  initialRescueCombo,
  rescueHoldMs,
  rescueComboError,
  rescueStep,
  sameCombo,
} from './rescueCombo.js'

// Tasti di ogni joypad: solo quello con id `P` è configurato.
const PAD_BUTTONS = { P: DEFAULT_BUTTONS }

function pad(index, pressed = []) {
  const buttons = Array.from({ length: 17 }, (_, at) => ({ pressed: pressed.includes(at), value: pressed.includes(at) ? 1 : 0 }))
  return { index, id: 'P', buttons, axes: [0, 0] }
}

const HELD = [DEFAULT_BUTTONS.select, DEFAULT_BUTTONS.rt]

function step(state, pads, now) {
  return rescueStep(state, pads, PAD_BUTTONS, DEFAULT_RESCUE_COMBO, now)
}

describe('combinazione di emergenza', () => {
  it('scatta dopo il tempo di pressione, una volta per pressione', () => {
    let result = step(initialRescueCombo(), [pad(0, HELD)], 1000)
    expect(result.fired).toBe(false)
    result = step(result.state, [pad(0, HELD)], 1000 + RESCUE_HOLD_MS - 1)
    expect(result.fired).toBe(false)
    result = step(result.state, [pad(0, HELD)], 1000 + RESCUE_HOLD_MS)
    expect(result.fired).toBe(true)
    result = step(result.state, [pad(0, HELD)], 5000)
    expect(result.fired).toBe(false)
    // Rilasciata e ripremuta: il tempo riparte.
    result = step(result.state, [pad(0, [])], 5100)
    result = step(result.state, [pad(0, HELD)], 5200)
    expect(result.fired).toBe(false)
    expect(step(result.state, [pad(0, HELD)], 5200 + RESCUE_HOLD_MS).fired).toBe(true)
  })

  it('premuta di sfuggita o con un solo tasto non scatta', () => {
    let result = step(initialRescueCombo(), [pad(0, HELD)], 0)
    result = step(result.state, [pad(0, [DEFAULT_BUTTONS.select])], 500)
    result = step(result.state, [pad(0, HELD)], 600)
    expect(step(result.state, [pad(0, HELD)], 600 + RESCUE_HOLD_MS - 1).fired).toBe(false)
    expect(step(initialRescueCombo(), [null, pad(1, [DEFAULT_BUTTONS.rt])], 0).fired).toBe(false)
  })

  it('ogni joypad ha il suo tempo', () => {
    let result = step(initialRescueCombo(), [pad(0, HELD), pad(1, [])], 0)
    result = step(result.state, [pad(0, []), pad(1, HELD)], 1500)
    expect(step(result.state, [pad(0, []), pad(1, HELD)], 1500 + RESCUE_HOLD_MS - 1).fired).toBe(false)
    expect(step(result.state, [pad(0, []), pad(1, HELD)], 1500 + RESCUE_HOLD_MS).fired).toBe(true)
  })

  it('combinazioni ammesse', () => {
    expect(sameCombo(['select', 'lt'], ['lt', 'select'])).toBe(true)
    expect(sameCombo(['select', 'lt'], ['select', 'rt'])).toBe(false)
    expect(rescueComboError(DEFAULT_RESCUE_COMBO, DEFAULT_SAVE_COMBO)).toBeNull()
    expect(rescueComboError(['lt', 'select'], DEFAULT_SAVE_COMBO)).toContain('apre già i salvataggi')
    expect(rescueComboError(['start', 'select'], DEFAULT_SAVE_COMBO)).toContain('START+SELECT')
    expect(rescueComboError(['rt', 'rt'], DEFAULT_SAVE_COMBO)).toBe('Servono due tasti diversi.')
    expect(rescueComboError(['start', 'rt'], DEFAULT_SAVE_COMBO)).toBeNull()
  })

  it('con il tasto dell\'uscita scatta prima di RetroArch', () => {
    expect(rescueHoldMs('hold_start', DEFAULT_RESCUE_COMBO)).toBe(RESCUE_HOLD_MS)
    expect(rescueHoldMs('hold_select', DEFAULT_RESCUE_COMBO)).toBe(RESCUE_SHARED_MS)
    expect(rescueHoldMs('hold_start', ['start', 'rt'])).toBe(RESCUE_SHARED_MS)
    expect(rescueHoldMs('start_select', ['start', 'rt'])).toBe(RESCUE_HOLD_MS)
    const held = rescueStep(initialRescueCombo(), [pad(0, HELD)], PAD_BUTTONS, DEFAULT_RESCUE_COMBO, 0, RESCUE_SHARED_MS)
    expect(rescueStep(held.state, [pad(0, HELD)], PAD_BUTTONS, DEFAULT_RESCUE_COMBO, RESCUE_SHARED_MS, RESCUE_SHARED_MS).fired).toBe(true)
  })
})
