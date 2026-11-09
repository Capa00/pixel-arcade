import { describe, expect, it } from 'vitest'
import { DEFAULT_QUIT_COMBO, QUIT_COMBOS, quitComboById, sharedHold } from './quitCombo.js'
import { DEFAULT_RESCUE_COMBO } from './rescueCombo.js'

describe('uscita dal gioco', () => {
  it('ha le tre scelte del backend, con START tenuto come predefinita', () => {
    expect(QUIT_COMBOS.map((combo) => combo.id)).toEqual(['hold_start', 'hold_select', 'start_select'])
    expect(quitComboById(DEFAULT_QUIT_COMBO).hold).toBe('start')
    expect(quitComboById('boh').id).toBe('hold_start')
  })

  it('trova il tasto da tenere che c\'è anche nella combinazione di emergenza', () => {
    expect(sharedHold('hold_start', DEFAULT_RESCUE_COMBO)).toBeNull()
    expect(sharedHold('hold_select', DEFAULT_RESCUE_COMBO)).toBe('select')
    expect(sharedHold('hold_start', ['start', 'rt'])).toBe('start')
    expect(sharedHold('start_select', ['start', 'rt'])).toBeNull()
  })
})
