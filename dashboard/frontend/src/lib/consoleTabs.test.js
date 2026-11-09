import { describe, expect, it } from 'vitest'
import {
  EMPTY_PREFS, allFocus, groupSystems, inRow, normalizePrefs, rowSystems, setForProfile, stepBrand, withOff,
} from './consoleTabs.js'

const systems = [{ id: 'nes' }, { id: 'snes' }, { id: 'gb' }]

describe('consoleTabs', () => {
  it('senza scelte sono tutte nella riga', () => {
    expect(rowSystems(systems, EMPTY_PREFS, null).map((s) => s.id)).toEqual(['nes', 'snes', 'gb'])
  })

  it('le Impostazioni spengono per tutti, il profilo accende e spegne le sue', () => {
    let prefs = withOff(EMPTY_PREFS, ['snes'])
    expect(rowSystems(systems, prefs, null).map((s) => s.id)).toEqual(['nes', 'gb'])
    prefs = setForProfile(prefs, 7, 'snes', true)
    prefs = setForProfile(prefs, 7, 'nes', false)
    expect(rowSystems(systems, prefs, 7).map((s) => s.id)).toEqual(['snes', 'gb'])
    expect(rowSystems(systems, prefs, 8).map((s) => s.id)).toEqual(['nes', 'gb'])
    expect(prefs.profiles[7]).toEqual({ add: ['snes'], remove: ['nes'] })
  })

  it('la scelta del profilo resta anche quando cambiano le Impostazioni', () => {
    // GB accesa per tutti: il profilo la conferma, poi le Impostazioni la spengono.
    let prefs = setForProfile(EMPTY_PREFS, 7, 'gb', true)
    expect(prefs.profiles[7]).toEqual({ add: ['gb'], remove: [] })
    prefs = withOff(prefs, ['gb'])
    expect(inRow(prefs, 7, 'gb')).toBe(true)
    expect(inRow(prefs, 8, 'gb')).toBe(false)
    // Le console mai toccate seguono le Impostazioni.
    expect(inRow(withOff(prefs, ['nes']), 7, 'nes')).toBe(false)
    prefs = setForProfile(prefs, 7, 'gb', false)
    expect(prefs.profiles[7]).toEqual({ add: [], remove: ['gb'] })
  })

  it('la console preferita è sempre nella riga', () => {
    const prefs = setForProfile(withOff(EMPTY_PREFS, ['snes']), 7, 'gb', false)
    expect(inRow(prefs, 7, 'snes', 'snes')).toBe(true)
    expect(inRow(prefs, 7, 'gb', 'gb')).toBe(true)
    expect(rowSystems(systems, prefs, 7, 'snes').map((s) => s.id)).toEqual(['nes', 'snes'])
  })

  it('legge le preferenze dell\'API scartando valori sbagliati', () => {
    expect(normalizePrefs({ off: ['a', 1], profiles: { 2: { add: 'x' } } })).toEqual({ off: ['a'], profiles: {} })
    expect(normalizePrefs({ off: [], profiles: { 3: { add: ['gb'], remove: [] } } }).profiles[3]).toEqual({ add: ['gb'], remove: [] })
    expect(normalizePrefs(null)).toEqual(EMPTY_PREFS)
  })

  it('divide le console per marca, nell\'ordine dei gruppi', () => {
    const list = [
      { id: 'ps1', preset: 'psx', name: 'PS1' },
      { id: 'mega_drive', preset: 'md', name: 'MEGA DRIVE' },
      { id: 'snes', preset: 'snes', name: 'SNES' },
      { id: 'nes', preset: 'nes', name: 'NES' },
      { id: 'mame', preset: null, arcade: true, name: 'MAME' },
      { id: 'boh', preset: null, name: 'BOH' },
    ]
    expect(groupSystems(list).map((group) => [group.brand, group.systems.map((s) => s.id)])).toEqual([
      ['arcade', ['mame']],
      ['nintendo', ['nes', 'snes']],
      ['sega', ['mega_drive']],
      ['sony', ['ps1']],
      ['other', ['boh']],
    ])
  })

  it('la riga segue l\'ordine delle marche', () => {
    const list = [
      { id: 'ps1', preset: 'psx', name: 'PS1' },
      { id: 'mame', preset: null, arcade: true, name: 'MAME' },
      { id: 'mega_drive', preset: 'md', name: 'MEGA DRIVE' },
      { id: 'gba', preset: 'gba', name: 'GBA' },
      { id: 'nes', preset: 'nes', name: 'NES' },
    ]
    const prefs = withOff(EMPTY_PREFS, ['gba'])
    expect(rowSystems(list, prefs, null).map((s) => s.id)).toEqual(['mame', 'nes', 'mega_drive', 'ps1'])
  })
  it('posizione di TUTTE sulla marca di una console', () => {
    const list = [{ id: 'ps1', preset: 'psx', name: 'PS1' }]
    expect(allFocus(list, 'ps1')).toEqual([['allConsoles', 'sys:ps1'], ['allBrands', 'brand:sony'], ['allBrand', 'sony']])
    expect(allFocus(list, 'manca')).toEqual([])
  })
  it('LT/RT passano alla marca vicina, ripartendo dall\'altro capo', () => {
    const groups = groupSystems([
      { id: 'ps1', preset: 'psx', name: 'PS1' },
      { id: 'nes', preset: 'nes', name: 'NES' },
      { id: 'mame', preset: null, arcade: true, name: 'MAME' },
      { id: 'boh', preset: null, name: 'BOH' },
    ])
    expect(groups.map((group) => group.brand)).toEqual(['arcade', 'nintendo', 'sony', 'other'])
    expect(stepBrand(groups, 'arcade', 1)).toBe('nintendo')
    expect(stepBrand(groups, 'sony', -1)).toBe('nintendo')
    // Oltre i bordi: dall'ultima alla prima e viceversa.
    expect(stepBrand(groups, 'other', 1)).toBe('arcade')
    expect(stepBrand(groups, 'arcade', -1)).toBe('other')
    // Marca sconosciuta (nessuna selezionata): si parte dalla prima.
    expect(stepBrand(groups, '', 1)).toBe('nintendo')
    expect(stepBrand(groups.slice(0, 1), 'arcade', 1)).toBe('arcade')
    expect(stepBrand([], 'arcade', 1)).toBeNull()
  })
})
