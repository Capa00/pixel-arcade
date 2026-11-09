import { describe, expect, it } from 'vitest'
import { MODE_IDS, chosenMode, resolveMode } from './modes.js'

describe('modalità', () => {
  it('le stesse del backend (config.py)', () => {
    expect(MODE_IDS).toEqual(['system', 'day', 'night'])
  })

  it('giorno e notte fissi, sistema secondo la preferenza', () => {
    expect(resolveMode('day', true)).toBe('day')
    expect(resolveMode('night', false)).toBe('night')
    expect(resolveMode('system', true)).toBe('night')
    expect(resolveMode('system', false)).toBe('day')
  })

  it('modalità salvata e modalità in prova', () => {
    const base = { view: 'library', settings: null, mode: 'night' }
    expect(chosenMode(base)).toBe('night')
    expect(chosenMode({ ...base, mode: undefined })).toBe('system')
    expect(chosenMode({ ...base, mode: 'sparita' })).toBe('system')
    // Nelle Impostazioni si vede subito la modalità scelta ma non ancora salvata.
    const draft = { draft: { settings: { 'ui.mode': 'day' } } }
    expect(chosenMode({ ...base, view: 'settings', settings: draft })).toBe('day')
    expect(chosenMode({ ...base, view: 'library', settings: draft })).toBe('night')
  })
})
