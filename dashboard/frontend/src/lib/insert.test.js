import { describe, expect, it } from 'vitest'
import { sceneFor } from './insert.js'

describe('scena per console', () => {
  it('cartucce dal davanti e dall\'alto', () => {
    expect(sceneFor({ preset: 'nes' })).toEqual({ motion: 'front', body: 'nes', piece: 'nes', sound: 'insertCart' })
    expect(sceneFor({ preset: 'pce' })).toMatchObject({ motion: 'front', piece: 'card' })
    expect(sceneFor({ preset: 'fds' }).piece).toBe('floppy')
    expect(sceneFor({ preset: 'snes' })).toMatchObject({ motion: 'top', body: 'snes', piece: 'snes' })
    expect(sceneFor({ preset: 'sega32x' })).toMatchObject({ motion: 'top', body: 'md' })
    expect(sceneFor({ preset: 'n64' }).piece).toBe('n64')
  })

  it('portatili', () => {
    expect(sceneFor({ preset: 'gbc' })).toMatchObject({ motion: 'portrait', body: 'gbc', piece: 'gb' })
    expect(sceneFor({ preset: 'gba' })).toMatchObject({ motion: 'landscape', piece: 'gba' })
    expect(sceneFor({ preset: 'nds' })).toMatchObject({ motion: 'clam', piece: 'mini' })
    expect(sceneFor({ preset: 'psp' })).toEqual({ motion: 'landscape', body: 'psp', piece: 'umd', sound: 'insertDisc' })
  })

  it('dischi col coperchio e col cassetto, gettoni', () => {
    expect(sceneFor({ preset: 'psx' })).toEqual({ motion: 'lid', body: 'psx', piece: 'disc', sound: 'insertDisc' })
    expect(sceneFor({ preset: 'ps2' })).toMatchObject({ motion: 'tray', piece: 'disc' })
    expect(sceneFor({ preset: '3do' }).motion).toBe('tray')
    expect(sceneFor({ preset: 'arcade', arcade: true })).toEqual({ motion: 'coin', body: 'cab', piece: 'coin', sound: 'insertCoin' })
    expect(sceneFor({ preset: 'neogeo', arcade: true }).motion).toBe('coin')
  })

  it('console sconosciute e sistema mancante: cartuccia generica dall\'alto', () => {
    expect(sceneFor({ preset: null })).toEqual({ motion: 'top', body: 'generic', piece: 'generic', sound: 'insertCart' })
    expect(sceneFor(null).piece).toBe('generic')
  })
})
