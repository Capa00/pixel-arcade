import { describe, expect, it } from 'vitest'
import { nextFocus } from './spatialNav.js'

function rect(id, left, top, width = 100, height = 40) {
  return { id, left, top, right: left + width, bottom: top + height }
}

// Griglia 3×2 con spazi di 20 px.
const grid = [
  rect('a', 0, 0), rect('b', 120, 0), rect('c', 240, 0),
  rect('d', 0, 60), rect('e', 120, 60), rect('f', 240, 60),
]

describe('nextFocus', () => {
  it('griglia: vicini nelle quattro direzioni', () => {
    expect(nextFocus(grid, 'e', 'left')).toBe('d')
    expect(nextFocus(grid, 'e', 'right')).toBe('f')
    expect(nextFocus(grid, 'e', 'up')).toBe('b')
    expect(nextFocus(grid, 'b', 'down')).toBe('e')
  })

  it('senza candidati resta sul corrente', () => {
    expect(nextFocus(grid, 'a', 'left')).toBe('a')
    expect(nextFocus(grid, 'a', 'up')).toBe('a')
    expect(nextFocus(grid, 'f', 'down')).toBe('f')
  })

  it('con una pressione riparte dall\'altro capo, allineato', () => {
    expect(nextFocus(grid, 'a', 'left', true)).toBe('c')
    expect(nextFocus(grid, 'b', 'up', true)).toBe('e')
    expect(nextFocus(grid, 'f', 'down', true)).toBe('c')
    expect(nextFocus(grid, 'd', 'right', true)).toBe('e')
    expect(nextFocus([rect('solo', 0, 0)], 'solo', 'up', true)).toBe('solo')
  })

  it('campi in colonna: dal primo con ↑ si va all\'ultimo', () => {
    const form = [rect('primo', 0, 0, 300), rect('secondo', 0, 50, 300), rect('ultimo', 0, 100, 300), rect('salva', 200, 160)]
    expect(nextFocus(form, 'primo', 'up', true)).toBe('salva')
    expect(nextFocus(form, 'salva', 'down', true)).toBe('primo')
  })

  it('colonna: sale e scende', () => {
    const column = [rect('x', 0, 0), rect('y', 0, 50), rect('z', 0, 100)]
    expect(nextFocus(column, 'y', 'down')).toBe('z')
    expect(nextFocus(column, 'y', 'up')).toBe('x')
    expect(nextFocus(column, 'y', 'right')).toBe('y')
  })

  it('elementi sfalsati: preferisce l\'allineamento alla vicinanza', () => {
    const items = [
      rect('cur', 0, 0, 100, 40),
      // Vicino ma molto spostato di lato.
      rect('near', 300, 50, 100, 40),
      // Più lontano ma sotto il corrente.
      rect('below', 20, 120, 100, 40),
    ]
    expect(nextFocus(items, 'cur', 'down')).toBe('below')
  })

  it('a parità di punteggio vince il centro più allineato', () => {
    const items = [rect('top', 0, 0, 300, 40), rect('l', 0, 60), rect('m', 100, 60), rect('r', 200, 60)]
    expect(nextFocus(items, 'top', 'down')).toBe('m')
  })

  it('id sconosciuto: primo elemento; lista vuota: invariato', () => {
    expect(nextFocus(grid, 'manca', 'down')).toBe('a')
    expect(nextFocus([], 'manca', 'down')).toBe('manca')
  })
})
