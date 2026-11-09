import { describe, expect, it } from 'vitest'
import { buildSlides, contentLabel, idleContext, minutesLabel, padPresses, sceneLayout, scenes, shouldStart } from './screensaver.js'

const system = { id: 'nes' }
const item = (id, extra = {}) => ({ system, game: { id }, ...extra })

describe('screensaver', () => {
  it('etichette e attesa', () => {
    expect(minutesLabel(0)).toBe('Mai')
    expect(minutesLabel(10 / 60)).toBe('10 secondi')
    expect(shouldStart(9999, 10 / 60)).toBe(false)
    expect(shouldStart(10001, 10 / 60)).toBe(true)
    expect(minutesLabel(0.25)).toBe('15 secondi')
    expect(minutesLabel(0.5)).toBe('30 secondi')
    expect(minutesLabel(1)).toBe('1 minuto')
    expect(shouldStart(14999, 0.25)).toBe(false)
    expect(shouldStart(15000, 0.25)).toBe(true)
    expect(minutesLabel(5)).toBe('5 minuti')
    expect(shouldStart(119999, 2)).toBe(false)
    expect(shouldStart(120000, 2)).toBe(true)
    expect(shouldStart(10 ** 9, 0)).toBe(false)
  })

  it('contenuto', () => {
    expect(contentLabel('mixed')).toBe('Misto')
    expect(contentLabel('games')).toBe('Partite')
    expect(contentLabel('boh')).toBe('Misto')
  })

  it('pressioni nuove sui joypad', () => {
    const pad = (pressed, axis = 0) => ({ index: 0, buttons: [{ pressed }, { pressed: false }], axes: [axis] })
    // Tasto già tenuto all'inizio: non conta finché non si rilascia e si ripreme.
    let step = padPresses(new Set(), [pad(true)])
    step = padPresses(step.held, [pad(true)])
    expect(step.pressed).toBe(false)
    step = padPresses(step.held, [pad(false)])
    expect(step.pressed).toBe(false)
    expect(padPresses(step.held, [pad(true)]).pressed).toBe(true)
    // Levetta inclinata: conta; poco inclinata no.
    expect(padPresses(new Set(), [pad(false, 0.3)]).pressed).toBe(false)
    expect(padPresses(new Set(), [null, pad(false, -0.9)]).pressed).toBe(true)
  })

  it('solo nella libreria e nel profilo', () => {
    expect(idleContext('library')).toBe(true)
    expect(idleContext('heroPlay')).toBe(true)
    expect(idleContext('profile')).toBe(true)
    expect(idleContext('login')).toBe(false)
    expect(idleContext('settings')).toBe(false)
    expect(idleContext('filters')).toBe(false)
  })

  it('alterna copertine, preferiti e «Riprendi»', () => {
    const slides = buildSlides({
      covers: [item('a'), item('b'), item('c')],
      favorites: [item('f', { owner: { name: 'ADA' } })],
      resumes: [item('r', { owner: { name: 'BEA' } })],
    }, () => 0)
    expect(slides.map((slide) => slide.kind)).toEqual(['cover', 'favorite', 'resume', 'cover', 'cover'])
    expect(new Set(slides.map((slide) => slide.key)).size).toBe(5)
    expect(buildSlides({ covers: [item('a'), item('b'), item('c')] }, () => 0, 2)).toHaveLength(2)
    expect(buildSlides({})).toEqual([])
  })

  it('scene da 2 a 4 immagini', () => {
    const list = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    expect(scenes(list, () => 0)).toEqual([[1, 2], [3, 4], [5, 6], [7, 8], [9]])
    expect(scenes(list, () => 0.99)).toEqual([[1, 2, 3, 4], [5, 6, 7, 8], [9]])
    expect(scenes(list, () => 0.99, 2)[0]).toEqual([1, 2])
    expect(scenes([])).toEqual([])
  })

  it('posti senza sovrapposizioni e dentro lo schermo', () => {
    let seed = 7
    const random = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    for (let round = 0; round < 200; round += 1) {
      const aspects = Array.from({ length: 2 + (round % 3) }, (_, index) => (index % 2 ? 4 / 3 : 3 / 4))
      const [width, height] = round % 2 ? [1600, 900] : [390, 844]
      const places = sceneLayout(aspects, width, height, random)
      expect(places).toHaveLength(aspects.length)
      const shown = places.filter(Boolean)
      expect(shown.length).toBeGreaterThanOrEqual(2)
      places.forEach((place, index) => {
        if (!place) {
          return
        }
        expect(place.width / place.height).toBeCloseTo(aspects[index])
        expect(place.left).toBeGreaterThanOrEqual(0)
        expect(place.top).toBeGreaterThanOrEqual(0)
        expect(place.left + place.width).toBeLessThanOrEqual(width)
        expect(place.top + place.height * 1.24).toBeLessThanOrEqual(height + 0.001)
      })
      // Nessuna coppia di riquadri (immagine e didascalia) si tocca, né all'inizio né alla fine del movimento.
      for (const side of [-1, 1]) {
        const moved = shown.map((place) => ({ ...place, left: place.left + side * place.dx, top: place.top + side * place.dy }))
        moved.forEach((a, i) => {
          expect(a.left).toBeGreaterThanOrEqual(0)
          expect(a.top + a.height * 1.24).toBeLessThanOrEqual(height + 0.001)
          moved.slice(i + 1).forEach((b) => {
            const apart = a.left + a.width <= b.left || b.left + b.width <= a.left ||
              a.top + a.height * 1.24 <= b.top || b.top + b.height * 1.24 <= a.top
            expect(apart).toBe(true)
          })
        })
      }
    }
    expect(sceneLayout([], 100, 100)).toEqual([])
  })
})
