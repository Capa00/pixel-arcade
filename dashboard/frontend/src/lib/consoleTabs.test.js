import { describe, expect, it } from 'vitest'
import {
  EMPTY_PREFS, allFocus, groupSystems, inRow, normalizePrefs, rowSystems, setForAll, setForProfile, stepBrand, withSettings,
} from './consoleTabs.js'

const systems = [
  { id: 'nes', brand: 'nintendo', order: 1, count: 3 },
  { id: 'snes', brand: 'nintendo', order: 3, count: 2 },
  { id: 'gb', brand: 'nintendo', order: 4, count: 1 },
]
const [NES, SNES, GB] = systems

describe('consoleTabs', () => {
  it('senza scelte sono tutte nella riga', () => {
    expect(rowSystems(systems, EMPTY_PREFS, null).map((s) => s.id)).toEqual(['nes', 'snes', 'gb'])
  })

  it('le Impostazioni spengono per tutti, il profilo accende e spegne le sue', () => {
    let prefs = withSettings(EMPTY_PREFS, [], ['snes'])
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
    prefs = withSettings(prefs, [], ['gb'])
    expect(inRow(prefs, 7, GB)).toBe(true)
    expect(inRow(prefs, 8, GB)).toBe(false)
    // Le console mai toccate seguono le Impostazioni.
    expect(inRow(withSettings(prefs, [], ['nes']), 7, NES)).toBe(false)
    prefs = setForProfile(prefs, 7, 'gb', false)
    expect(prefs.profiles[7]).toEqual({ add: [], remove: ['gb'] })
  })

  it('la console preferita è sempre nella riga', () => {
    const prefs = setForProfile(withSettings(EMPTY_PREFS, [], ['snes']), 7, 'gb', false)
    expect(inRow(prefs, 7, SNES, 'snes')).toBe(true)
    expect(inRow(prefs, 7, GB, 'gb')).toBe(true)
    expect(rowSystems(systems, prefs, 7, 'snes').map((s) => s.id)).toEqual(['nes', 'snes'])
  })

  it('legge le preferenze dell\'API scartando valori sbagliati', () => {
    expect(normalizePrefs({ off: ['a', 1], profiles: { 2: { add: 'x' } } })).toEqual({ on: [], off: ['a'], profiles: {} })
    expect(normalizePrefs({ off: [], profiles: { 3: { add: ['gb'], remove: [] } } }).profiles[3]).toEqual({ add: ['gb'], remove: [] })
    expect(normalizePrefs(null)).toEqual(EMPTY_PREFS)
  })

  it('divide le console per marca, nell\'ordine dei gruppi', () => {
    const list = [
      { id: 'ps1', brand: 'sony', order: 0, count: 1, name: 'PS1' },
      { id: 'mega_drive', brand: 'sega', order: 2, count: 1, name: 'MEGA DRIVE' },
      { id: 'snes', brand: 'nintendo', order: 3, count: 1, name: 'SNES' },
      { id: 'nes', brand: 'nintendo', order: 1, count: 1, name: 'NES' },
      { id: 'mame', count: 1, arcade: true, name: 'MAME' },
      { id: 'boh', count: 1, name: 'BOH' },
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
      { id: 'ps1', brand: 'sony', order: 0, count: 1, name: 'PS1' },
      { id: 'mame', count: 1, arcade: true, name: 'MAME' },
      { id: 'mega_drive', brand: 'sega', order: 2, count: 1, name: 'MEGA DRIVE' },
      { id: 'gba', brand: 'nintendo', order: 9, count: 1, name: 'GBA' },
      { id: 'nes', brand: 'nintendo', order: 1, count: 1, name: 'NES' },
    ]
    const prefs = withSettings(EMPTY_PREFS, [], ['gba'])
    expect(rowSystems(list, prefs, null).map((s) => s.id)).toEqual(['mame', 'nes', 'mega_drive', 'ps1'])
  })
  it('posizione di TUTTE sulla marca di una console', () => {
    const list = [{ id: 'ps1', brand: 'sony', order: 0, count: 1, name: 'PS1' }]
    expect(allFocus(list, 'ps1')).toEqual([['allConsoles', 'sys:ps1'], ['allBrands', 'brand:sony'], ['allBrand', 'sony']])
    expect(allFocus(list, 'manca')).toEqual([])
  })
  it('LT/RT passano alla marca vicina, ripartendo dall\'altro capo', () => {
    const groups = groupSystems([
      { id: 'ps1', brand: 'sony', order: 0, count: 1, name: 'PS1' },
      { id: 'nes', brand: 'nintendo', order: 1, count: 1, name: 'NES' },
      { id: 'mame', count: 1, arcade: true, name: 'MAME' },
      { id: 'boh', count: 1, name: 'BOH' },
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
  it('una console senza giochi è spenta finché le Impostazioni o il profilo non la accendono', () => {
    const empty = { id: 'saturn', brand: 'sega', order: 7, count: 0 }
    const list = [...systems, empty]
    expect(rowSystems(list, EMPTY_PREFS, null).map((s) => s.id)).toEqual(['nes', 'snes', 'gb'])
    let prefs = withSettings(EMPTY_PREFS, ...Object.values(setForAll(EMPTY_PREFS, 'saturn', true)))
    expect(prefs.on).toEqual(['saturn'])
    expect(rowSystems(list, prefs, null).map((s) => s.id)).toEqual(['nes', 'snes', 'gb', 'saturn'])
    // Spenta per tutti, ma accesa dal profilo 7; spegnere una console con giochi la mette in `off`.
    prefs = setForProfile(withSettings(prefs, [], []), 7, 'saturn', true)
    expect(inRow(prefs, 7, empty)).toBe(true)
    expect(inRow(prefs, null, empty)).toBe(false)
    expect(setForAll({ on: ['saturn'], off: [] }, 'saturn', false)).toEqual({ on: [], off: ['saturn'] })
  })
})
