import { describe, expect, it } from 'vitest'
import { layoutFor } from './layout.js'

describe('layoutFor', () => {
  it('16:9 usa il layout della demo', () => {
    expect(layoutFor(1600, 900)).toEqual({ name: 'wide', columns: 8, unit: 1 })
    expect(layoutFor(1920, 1080)).toEqual({ name: 'wide', columns: 8, unit: 1.2 })
  })

  it('4:3 usa il layout standard a 6 colonne', () => {
    const layout = layoutFor(1024, 768)
    expect(layout.name).toBe('standard')
    expect(layout.columns).toBe(6)
    expect(layout.unit).toBeCloseTo(0.8)
  })

  it('telefono in verticale usa il layout compatto', () => {
    const layout = layoutFor(390, 844)
    expect(layout.name).toBe('compact')
    expect(layout.columns).toBe(3)
    expect(layout.unit).toBeCloseTo(0.8125)
  })

  it('telefono in orizzontale resta compatto', () => {
    expect(layoutFor(700, 360).name).toBe('compact')
  })

  it('tablet in verticale usa 4 colonne', () => {
    expect(layoutFor(810, 1080)).toMatchObject({ name: 'portrait', columns: 4 })
  })

  it('il compatto non ingrandisce oltre la demo', () => {
    expect(layoutFor(700, 1400).unit).toBe(1)
  })

  it('non scende sotto la scala minima', () => {
    expect(layoutFor(720, 200).unit).toBe(0.6)
  })

  it('dimensioni non valide danno il layout della demo', () => {
    expect(layoutFor(0, 900)).toEqual({ name: 'wide', columns: 8, unit: 1 })
    expect(layoutFor(undefined, 900).name).toBe('wide')
  })
})
