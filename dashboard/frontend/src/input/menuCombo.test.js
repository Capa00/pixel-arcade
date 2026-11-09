import { describe, expect, it } from 'vitest'
import { DEFAULT_MENU_COMBO, MENU_COMBOS, menuComboById } from './menuCombo.js'

describe('menu rapido', () => {
  it('ha le scelte del backend, con L1+R1+START+SELECT come predefinita', () => {
    expect(MENU_COMBOS.map((combo) => combo.id)).toEqual(['l1_r1_start_select', 'l2_r2', 'l1_r1', 'down_select', 'none'])
    expect(menuComboById(DEFAULT_MENU_COMBO).buttons).toEqual(['lb', 'rb', 'start', 'select'])
    expect(menuComboById('boh').id).toBe(DEFAULT_MENU_COMBO)
    expect(menuComboById('none').buttons).toEqual([])
  })
})
