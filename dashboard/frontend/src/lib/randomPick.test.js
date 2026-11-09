import { describe, expect, it } from 'vitest'
import { pickGame, randomPool, reel, reelTimes } from './randomPick.js'

const games = ['a', 'b', 'c', 'd'].map((id) => ({ id }))

function sequence(values) {
  let i = 0
  return () => values[i++ % values.length]
}

describe('randomPick', () => {
  it('niente giochi incompatibili', () => {
    const pool = randomPool([{ id: 'a' }, { id: 'b', coreStatus: 'incompatible' }, { id: 'c', coreStatus: 'ok' }])
    expect(pool.map((game) => game.id)).toEqual(['a', 'c'])
    expect(randomPool(null)).toEqual([])
  })

  it('pesca evitando il gioco già selezionato', () => {
    expect(pickGame(games, null, () => 0.99).id).toBe('d')
    expect(pickGame(games, { id: 'a' }, () => 0).id).toBe('b')
    expect(pickGame([{ id: 'a' }], { id: 'a' }, () => 0).id).toBe('a')
    expect(pickGame([], null)).toBeNull()
  })

  it('rullo che finisce sul gioco scelto, senza copertine uguali vicine', () => {
    const list = reel(games, games[2], 10, sequence([0, 0.3, 0.6, 0.9, 0.5]))
    expect(list).toHaveLength(11)
    expect(list[list.length - 1]).toBe(games[2])
    for (let i = 1; i < list.length; i += 1) {
      expect(list[i].id).not.toBe(list[i - 1].id)
    }
    expect(reel([games[0]], games[0], 10)).toEqual([games[0]])
  })

  it('istanti crescenti che rallentano', () => {
    const times = reelTimes(10, 2000)
    expect(times).toHaveLength(10)
    expect(times[9]).toBe(2000)
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeGreaterThan(times[i - 1])
    }
    expect(times[9] - times[8]).toBeGreaterThan(times[1] - times[0])
  })
})
