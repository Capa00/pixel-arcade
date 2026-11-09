import { describe, expect, it } from 'vitest'
import { MAX_GAMES, matchingGames, saveLabel } from './shared.js'

describe('shared-saves', () => {
  it('ricerca dei giochi senza maiuscole e accenti', () => {
    const games = [
      { id: 'Tekken 5 (USA).iso', title: 'Tekken 5' },
      { id: 'Pokémon Rosso.gb', title: 'Pokémon Rosso' },
      { id: 'tekken3.bin', title: 'Tekken 3' },
    ]
    expect(matchingGames(games, 'tekken 5').items.map((game) => game.title)).toEqual(['Tekken 5'])
    expect(matchingGames(games, 'POKEMON').items.map((game) => game.title)).toEqual(['Pokémon Rosso'])
    expect(matchingGames(games, 'usa').items.map((game) => game.title)).toEqual(['Tekken 5'])
    expect(matchingGames(games, '').items).toHaveLength(3)
    const many = Array.from({ length: MAX_GAMES + 5 }, (_, at) => ({ id: `g${at}`, title: `Gioco ${at}` }))
    expect(matchingGames(many, 'gioco')).toMatchObject({ more: true })
    expect(matchingGames(many, 'gioco').items).toHaveLength(MAX_GAMES)
    expect(matchingGames(null, 'x')).toEqual({ items: [], more: false })
  })

  it('testo delle righe', () => {
    expect(saveLabel({ gameTitle: 'Tekken 5', systemName: 'PlayStation 2', description: '' })).toBe('Tekken 5 · PlayStation 2')
    expect(saveLabel({ gameTitle: 'Zelda', systemName: 'SNES', description: 'Fine' })).toBe('Zelda · SNES · Fine')
  })
})
