import { describe, expect, it } from 'vitest'
import {
  PIXEL_SPRITES,
  TEXT_SPRITES,
  THEMES,
  THEME_IDS,
  VECTOR_SPRITES,
  activeTheme,
  pixelRuns,
  pixelSize,
  randomThemeId,
} from './themes.js'

function exists(name) {
  return Boolean(PIXEL_SPRITES[name] || VECTOR_SPRITES[name] || TEXT_SPRITES[name])
}

describe('temi', () => {
  it('otto temi, con gli stessi id del backend (config.py)', () => {
    expect(THEME_IDS).toEqual(['nes', 'gameboy', '16bit', 'psx', 'n64', 'computer', 'arcade', 'y2k'])
  })

  it('ogni tema ha luce, linea, icona e sprite esistenti', () => {
    for (const theme of THEMES) {
      expect(theme.glow).toHaveLength(2)
      expect(theme.stripe.length).toBeGreaterThanOrEqual(3)
      expect(exists(theme.icon.sprite), theme.icon.sprite).toBe(true)
      expect(theme.sprites.length).toBeGreaterThanOrEqual(5)
      for (const sprite of theme.sprites) {
        expect(exists(sprite.sprite), `${theme.id}: ${sprite.sprite}`).toBe(true)
        expect(sprite.colors.length).toBeGreaterThan(0)
        expect(sprite.duration).toBeGreaterThanOrEqual(20)
        expect(sprite.x).toBeGreaterThanOrEqual(0)
        expect(sprite.x).toBeLessThan(100)
      }
      expect(new Set(theme.sprites.map((sprite) => sprite.key)).size).toBe(theme.sprites.length)
      for (const color of [...theme.glow, ...theme.stripe]) {
        expect(color).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/)
      }
    }
  })

  it('sprite pixel: righe della stessa larghezza e solo caratteri ammessi', () => {
    for (const [name, rows] of Object.entries(PIXEL_SPRITES)) {
      const { width } = pixelSize(rows)
      for (const row of rows) {
        expect(row.length, name).toBe(width)
        expect(row, name).toMatch(/^[.abcd]+$/)
      }
    }
  })

  it('i pixel consecutivi dello stesso colore diventano un rettangolo', () => {
    expect(pixelRuns(['aab.', '.bbb'])).toEqual([
      { x: 0, y: 0, width: 2, color: 0 },
      { x: 2, y: 0, width: 1, color: 1 },
      { x: 1, y: 1, width: 3, color: 1 },
    ])
  })

  it('tema casuale e tema scelto', () => {
    expect(randomThemeId(() => 0)).toBe('nes')
    expect(randomThemeId(() => 0.999)).toBe('y2k')
    const base = { view: 'library', settings: null, theme: 'random', randomTheme: 'psx' }
    expect(activeTheme(base).id).toBe('psx')
    expect(activeTheme({ ...base, theme: 'n64' }).id).toBe('n64')
    // Nelle Impostazioni si vede subito il tema scelto ma non ancora salvato.
    const draft = { draft: { settings: { 'ui.theme': 'arcade' } } }
    expect(activeTheme({ ...base, view: 'settings', settings: draft }).id).toBe('arcade')
    expect(activeTheme({ ...base, view: 'library', settings: draft }).id).toBe('psx')
    expect(activeTheme({ ...base, theme: 'sparito' }).id).toBe('nes')
  })
})
