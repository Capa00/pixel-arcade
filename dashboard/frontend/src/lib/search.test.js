import { describe, expect, it } from 'vitest'
import { filterGames, splitQuery } from './search.js'

const GAMES = [
  { id: 'smb.nes', title: 'Super Mario Bros.', file: 'smb.nes' },
  { id: 'smk.sfc', title: 'Super Mario Kart', file: 'smk.sfc' },
  { id: 'xmen.md', title: 'X-Men', file: 'xmen.md' },
]

describe('ricerca con esclusione', () => {
  it('divide le parole da trovare e quelle precedute da -', () => {
    expect(splitQuery('Mario -Kart')).toEqual({ words: ['mario'], without: ['kart'] })
    expect(splitQuery('x-men - ')).toEqual({ words: ['x-men', '-'], without: [] })
  })

  it('esclude i giochi con le parole precedute da -', () => {
    expect(filterGames(GAMES, 'mario -kart').map((game) => game.id)).toEqual(['smb.nes'])
    expect(filterGames(GAMES, '-mario').map((game) => game.id)).toEqual(['xmen.md'])
    expect(filterGames(GAMES, 'x-men').map((game) => game.id)).toEqual(['xmen.md'])
    expect(filterGames(GAMES, '')).toBe(GAMES)
  })
})
