import { describe, expect, it } from 'vitest'
import { DARK_INK, LIGHT_INK, coverStyle, fnv1a, luminance } from './covers.js'

const arcade = { covers: ['#f5c542', '#1d1b3a', '#d9437f', '#26b3a6'] }

describe('coverStyle', () => {
  it('hash stabile (FNV-1a a 32 bit)', () => {
    expect(fnv1a('')).toBe(0x811c9dc5)
    expect(fnv1a('a')).toBe(0xe40c292c)
    expect(fnv1a('digdug2.zip')).toBe(fnv1a('digdug2.zip'))
  })

  it('lo stesso gioco ha sempre la stessa copertina', () => {
    expect(coverStyle(arcade, 'pacman.zip')).toEqual(coverStyle(arcade, 'pacman.zip'))
  })

  it('colore dalla lista del sistema e specchio dal bit basso', () => {
    const hash = fnv1a('pacman.zip')
    const style = coverStyle(arcade, 'pacman.zip')
    expect(style.bg).toBe(arcade.covers[hash % 4])
    expect(style.flip).toBe(hash % 2 ? -1 : 1)
    expect(style.glow).toBe(style.bg + '66')
  })

  it('inchiostro scuro sugli sfondi chiari', () => {
    expect(luminance('#f5c542')).toBeGreaterThan(0.6)
    expect(coverStyle({ covers: ['#f5c542'] }, 'x').ink).toBe(DARK_INK)
    expect(coverStyle({ covers: ['#1d1b3a'] }, 'x').ink).toBe(LIGHT_INK)
  })

  it('sistema senza colori usa una tavolozza neutra', () => {
    expect(coverStyle(null, 'x').bg).toMatch(/^#[0-9a-f]{6}$/)
  })
})
