import { describe, expect, it } from 'vitest'
import { LOGO_RECTS, logoPixels } from './logo.js'
import { initialLoadDone, isSplashStart, pixelDelay, shouldLogout } from './splash.js'

const SYSTEMS = [{ id: 'ps1' }]

function state(patch) {
  return { status: 'ready', systems: SYSTEMS, systemId: 'ps1', games: {}, ...patch }
}

describe('initialLoadDone', () => {
  it('aspetta i dati di avvio', () => {
    expect(initialLoadDone(state({ status: 'loading' }))).toBe(false)
  })

  it('aspetta i giochi della console selezionata', () => {
    expect(initialLoadDone(state())).toBe(false)
    expect(initialLoadDone(state({ games: { ps1: [] } }))).toBe(true)
  })

  it('non aspetta senza console, con un errore o dopo il tempo massimo', () => {
    expect(initialLoadDone(state({ systems: [], systemId: null }))).toBe(true)
    expect(initialLoadDone(state({ status: 'error' }))).toBe(true)
    expect(initialLoadDone(state(), true)).toBe(true)
  })
})

describe('isSplashStart', () => {
  it('entra con START, F2, Invio e spazio', () => {
    expect(isSplashStart({ button: 'start', kind: 'press', source: 'pad', pad: 0 })).toBe(true)
    expect(isSplashStart({ button: 'start', kind: 'press', source: 'keyboard', pad: null })).toBe(true)
    expect(isSplashStart({ button: 'a', kind: 'press', source: 'keyboard', pad: null })).toBe(true)
  })

  it('ignora gli altri tasti, A del joypad e i rilasci', () => {
    expect(isSplashStart({ button: 'a', kind: 'press', source: 'pad', pad: 0 })).toBe(false)
    expect(isSplashStart({ button: 'b', kind: 'press', source: 'keyboard', pad: null })).toBe(false)
    expect(isSplashStart({ button: 'start', kind: 'release', source: 'pad', pad: 0 })).toBe(false)
    expect(isSplashStart(null)).toBe(false)
  })
})

describe('shouldLogout', () => {
  it('fa uscire i profili dopo l\'attesa, mai con 0', () => {
    expect(shouldLogout(59999, 1)).toBe(false)
    expect(shouldLogout(60000, 1)).toBe(true)
    expect(shouldLogout(30000, 0.5)).toBe(true)
    expect(shouldLogout(10 * 60000, 0)).toBe(false)
  })
})

describe('logo pixel', () => {
  it('ricava i pixel dai rettangoli, con quelli dopo sopra', () => {
    const pixels = logoPixels()
    const at = (x, y) => pixels.find((pixel) => pixel.x === x && pixel.y === y)
    expect(pixels).toHaveLength(66)
    expect(at(0, 0)).toBeUndefined()
    expect(at(2, 4).fill).toBe(LOGO_RECTS[2].fill)
    expect(at(6, 4).fill).toBe('#ff5d73')
    expect(at(7, 5).fill).toBe('#3ccfc4')
  })

  it('fa cadere tutti i pixel entro 1,2 s, dal basso', () => {
    const delays = logoPixels().map((pixel) => pixelDelay(pixel))
    expect(Math.max(...delays)).toBeLessThanOrEqual(1200)
    expect(pixelDelay({ x: 0, y: 9 })).toBeLessThan(pixelDelay({ x: 0, y: 2 }))
  })
})
