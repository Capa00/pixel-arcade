import { describe, expect, it } from 'vitest'
import { boardSide, consoleShares, daysLeftLabel, enterDirection, levelProgress, podium, points } from './leaderboard.js'

describe('leaderboard', () => {
  it('lato libero con una sola finestra aperta', () => {
    expect(boardSide(['p1'])).toBe('right')
    expect(boardSide(['p2'])).toBe('left')
    expect(boardSide(['p1', 'p2'])).toBeNull()
    expect(boardSide([])).toBeNull()
    expect(boardSide(null)).toBeNull()
    expect(enterDirection('p1')).toBe('right')
    expect(enterDirection('p2')).toBe('left')
  })

  it('coppe solo per i primi tre', () => {
    expect([0, 1, 2, 3, 4].map(podium)).toEqual(['gold', 'silver', 'bronze', null, null])
  })

  it('avanzamento nel livello', () => {
    expect(levelProgress(0, 1)).toEqual({ done: 0, needed: 100 })
    expect(levelProgress(440, 3)).toEqual({ done: 140, needed: 300 })
  })

  it('quote delle console', () => {
    const systems = [60, 20, 10, 5, 3, 2].map((seconds, index) => ({ system: `s${index}`, name: `S${index}`, seconds }))
    const parts = consoleShares(systems)
    expect(parts.map((part) => part.system)).toEqual(['s0', 's1', 's2', 's3', 'other'])
    expect(parts[0].share).toBe(60)
    expect(parts[4]).toMatchObject({ name: 'Altre', seconds: 5, share: 5 })
    expect(consoleShares([])).toEqual([])
  })

  it('giorni rimasti e punti', () => {
    expect(daysLeftLabel(1)).toBe('Ultimo giorno')
    expect(daysLeftLabel(0)).toBe('Ultimo giorno')
    expect(daysLeftLabel(5)).toBe('Ancora 5 giorni')
    expect(points(12480)).toBe('12.480')
    expect(points(null)).toBe('0')
  })
})
