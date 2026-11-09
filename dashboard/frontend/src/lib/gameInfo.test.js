import { describe, expect, it } from 'vitest'
import {
  genres,
  hasImages,
  hasText,
  heroLabel,
  imageUrl,
  infoRows,
  languageList,
  playersLabel,
  stepImage,
} from './gameInfo.js'

const ZELDA = {
  id: 'Zelda.nes',
  metaId: 'zelda-nes',
  cover: true,
  title: 'The Legend of Zelda',
  year: 1986,
  region: 'Europa',
  genre: ['Avventura', 'Azione'],
  players: '1',
  developer: 'Nintendo',
  publisher: 'Nintendo',
  languages: ['en', 'fr'],
  serial: null,
  description: 'Avventura.',
  plot: null,
}

describe('gameInfo', () => {
  it('scrive i giocatori', () => {
    expect(playersLabel('1')).toBe('1 giocatore')
    expect(playersLabel(1)).toBe('1 giocatore')
    expect(playersLabel('1–2')).toBe('1–2 giocatori')
    expect(playersLabel('')).toBeNull()
    expect(playersLabel(null)).toBeNull()
  })

  it('scrive le lingue in italiano', () => {
    expect(languageList(['en', 'fr', 'xx'])).toBe('Inglese, francese, xx')
    expect(languageList([])).toBe('')
  })

  it('accetta il genere come lista o come testo', () => {
    expect(genres(ZELDA)).toEqual(['Avventura', 'Azione'])
    expect(genres({ genre: 'Sport' })).toEqual(['Sport'])
    expect(genres({ genre: null })).toEqual([])
  })


  it('riga sopra il titolo', () => {
    expect(heroLabel({ name: 'NES' }, ZELDA)).toBe('NES · 1986 · EUROPA')
    expect(heroLabel({ name: 'NES' }, { year: null, region: '' })).toBe('NES')
  })

  it('scheda con i soli campi noti', () => {
    expect(infoRows(ZELDA)).toEqual([
      { id: 'developer', label: 'Sviluppatore', value: 'Nintendo' },
      { id: 'genre', label: 'Genere', value: 'Avventura · Azione' },
      { id: 'publisher', label: 'Editore', value: 'Nintendo' },
      { id: 'players', label: 'Giocatori', value: '1 giocatore' },
      { id: 'languages', label: 'Lingue', value: 'Inglese, francese' },
    ])
    expect(infoRows({ id: 'x.nes', title: 'x' })).toEqual([])
  })

  it('immagini e testi solo se ci sono', () => {
    expect(hasImages(ZELDA)).toBe(true)
    expect(hasImages({ ...ZELDA, cover: false })).toBe(false)
    expect(hasImages({ id: 'x.nes', cover: true })).toBe(false)
    expect(hasText(ZELDA)).toBe(true)
    expect(hasText({ description: '', plot: 'Trama.' })).toBe(true)
    expect(hasText({ description: null, plot: null })).toBe(false)
  })

  it('URL delle immagini: la copertina chiede il ripiego su titolo e schermata', () => {
    expect(imageUrl('Super Nintendo', { metaId: 'a&b' }, 'snap')).toBe('/api/image?system=Super%20Nintendo&game=a%26b&kind=snap')
    expect(imageUrl('nes', { metaId: 'z' }, 'cover')).toBe('/api/image?system=nes&game=z&kind=cover&fallback=1')
  })

  it('le immagini girano in cerchio', () => {
    expect(stepImage('cover', 1)).toBe('title')
    expect(stepImage('snap', 1)).toBe('cover')
    expect(stepImage('cover', -1)).toBe('snap')
    expect(stepImage('boh', 1)).toBe('title')
  })
})
