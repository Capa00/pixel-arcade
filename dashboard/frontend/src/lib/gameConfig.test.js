import { describe, expect, it } from 'vitest'
import {
  canReset,
  fixedRows,
  levelIndex,
  levelItems,
  levelOf,
  modeLabel,
  stepCore,
  stepSection,
  valueItems,
  valueLabel,
  visibleOptions,
} from './gameConfig.js'

const LEVELS = [
  { id: 'original', label: 'Originale', note: '' },
  { id: 'enhanced', label: 'Migliorata', note: '' },
  { id: 'max', label: 'Massima', note: '' },
]

function page(extra = {}) {
  return {
    system: 'ps1',
    id: null,
    core: 'mednafen_psx_hw',
    cores: ['mednafen_psx_hw', 'pcsx_rearmed'],
    levels: LEVELS,
    mode: 'max',
    custom: false,
    consoleMode: 'max',
    sections: [
      { id: 'graphics', options: [] },
      { id: 'latency', options: [] },
      { id: 'audio', options: [] },
      { id: 'emulation', options: [] },
    ],
    ...extra,
  }
}

const SMOOTH = {
  source: 'retroarch',
  key: 'video_smooth',
  label: 'Filtro bilineare',
  group: 'RetroArch',
  values: [{ value: 'true', label: 'Sì' }, { value: 'false', label: 'No' }],
  value: 'false',
  origin: 'level',
}

describe('pagina «Configurazione»', () => {
  it('livello della console e del gioco', () => {
    expect(modeLabel(page())).toBe('Massima')
    expect(modeLabel(page({ mode: 'custom' }))).toBe('Personalizzata')
    const game = page({ id: 'a.cue', mode: null, custom: true })
    expect(modeLabel(game)).toBe('Come la console (Massima)')
    const items = levelItems(game)
    expect(items.map((item) => item.id)).toEqual(['console', 'original', 'enhanced', 'max', 'custom'])
    expect(levelIndex(game, items)).toBe(0)
    expect(levelOf(items[0])).toBeNull()
    expect(levelOf(items[2])).toBe('enhanced')
    // Senza Personalizzata salvata non si può scegliere.
    expect(levelItems(page()).map((item) => item.id)).toEqual(['original', 'enhanced', 'max'])
    expect(levelIndex(page(), levelItems(page()))).toBe(2)
  })

  it('righe fisse per sezione', () => {
    expect(fixedRows(page(), 'graphics')).toEqual(['level', 'core'])
    expect(fixedRows(page(), 'audio')).toEqual(['core'])
    expect(fixedRows(page({ id: 'a.cue', cores: ['pcsx_rearmed'], mode: 'custom' }), 'graphics')).toEqual(['level', 'promote'])
    expect(fixedRows(page({ id: 'a.cue', cores: ['pcsx_rearmed'] }), 'latency')).toEqual([])
    const bios = { status: 'missing', label: 'Manca un file obbligatorio' }
    expect(fixedRows(page({ bios }), 'emulation')).toEqual(['core', 'bios'])
    expect(fixedRows(page({ id: 'a.cue', cores: ['pcsx_rearmed'], bios }), 'emulation')).toEqual(['bios'])
    expect(fixedRows(page({ bios }), 'audio')).toEqual(['core'])
  })

  it('valori, ricerca e ritorno all\'origine', () => {
    expect(valueLabel(SMOOTH)).toBe('No')
    expect(valueItems(SMOOTH).map((item) => item.note)).toEqual(['', 'In uso'])
    expect(valueItems(SMOOTH, 'sì').map((item) => item.id)).toEqual(['true'])
    const section = { options: [SMOOTH, { ...SMOOTH, key: 'beetle_psx_hw_filter', label: 'Filtro Texture', group: 'Video' }] }
    expect(visibleOptions(section, ' texture ').map((option) => option.key)).toEqual(['beetle_psx_hw_filter'])
    expect(visibleOptions(section, 'retroarch').map((option) => option.key)).toEqual(['video_smooth'])
    expect(visibleOptions(section, '')).toHaveLength(2)
    expect(canReset(page(), SMOOTH)).toBe(false)
    expect(canReset(page(), { ...SMOOTH, origin: 'custom' })).toBe(true)
    expect(canReset(page(), { ...SMOOTH, origin: 'console' })).toBe(true)
    expect(canReset(page({ id: 'a.cue' }), { ...SMOOTH, origin: 'console' })).toBe(false)
    expect(canReset(page({ id: 'a.cue' }), { ...SMOOTH, origin: 'game' })).toBe(true)
  })

  it('core e sezioni circolari', () => {
    expect(stepCore(page(), 1)).toBe('pcsx_rearmed')
    expect(stepCore(page(), -1)).toBe('pcsx_rearmed')
    expect(stepCore(page({ cores: ['mednafen_psx_hw'] }), 1)).toBe('mednafen_psx_hw')
    expect(stepSection(page(), 0, -1)).toBe(3)
    expect(stepSection(page(), 3, 1)).toBe(0)
  })
})
