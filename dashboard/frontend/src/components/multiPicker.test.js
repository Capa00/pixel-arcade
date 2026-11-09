import { describe, expect, it } from 'vitest'
import {
  ALL,
  MODE,
  allSelected,
  filterItems,
  groupRows,
  initialGroup,
  jumpGroup,
  keepCursor,
  moveCursor,
  toggle,
  toggleAll,
} from './multiPicker.js'

const items = [
  { id: 'Arcade', label: 'Arcade', group: 'Arcade' },
  { id: 'Nintendo - Game Boy', label: 'Nintendo - Game Boy', group: 'Nintendo' },
  { id: 'Nintendo - Super Nintendo Entertainment System', label: 'Nintendo - Super Nintendo Entertainment System', group: 'Nintendo' },
  { id: 'Sega - Game Gear', label: 'Sega - Game Gear', group: 'Sega' },
  { id: 'Sega - Master System - Mark III', label: 'Sega - Master System - Mark III', group: 'Sega' },
  { id: 'DOOM', label: 'DOOM', group: 'Motori di gioco', search: 'prboom' },
]

const ids = (list) => list.map((item) => item.id)

describe('ricerca', () => {
  it('trova il testo in qualunque punto, senza maiuscole né accenti', () => {
    expect(ids(filterItems(items, 'gear'))).toEqual(['Sega - Game Gear'])
    expect(ids(filterItems(items, 'NTENDO'))).toEqual(['Nintendo - Game Boy', 'Nintendo - Super Nintendo Entertainment System'])
    expect(ids(filterItems(items, 'mäster'))).toEqual(['Sega - Master System - Mark III'])
    expect(ids(filterItems(items, 'game sega'))).toEqual(['Sega - Game Gear'])
  })

  it('cerca anche nella nota e nel testo di ricerca', () => {
    expect(ids(filterItems(items, 'boom'))).toEqual(['DOOM'])
    expect(ids(filterItems([{ id: 'fbneo', label: 'fbneo', note: 'Arcade (FinalBurn Neo)' }], 'burn'))).toEqual(['fbneo'])
  })

  it('senza testo restituisce la stessa lista', () => {
    expect(filterItems(items, '  ')).toBe(items)
  })
})

describe('gruppi', () => {
  it('intestazione prima di ogni gruppo, gruppi vuoti nascosti', () => {
    const rows = groupRows(filterItems(items, 'game'))
    expect(rows.map((row) => (row.kind === 'group' ? `[${row.group}]` : row.item.id))).toEqual([
      '[Nintendo]',
      'Nintendo - Game Boy',
      '[Sega]',
      'Sega - Game Gear',
    ])
  })

  it('salto di gruppo, fermo ai bordi', () => {
    expect(jumpGroup(items, ALL, 1)).toBe('Arcade')
    expect(jumpGroup(items, 'Arcade', 1)).toBe('Nintendo - Game Boy')
    expect(jumpGroup(items, 'Nintendo - Super Nintendo Entertainment System', 1)).toBe('Sega - Game Gear')
    expect(jumpGroup(items, 'Sega - Master System - Mark III', -1)).toBe('Nintendo - Game Boy')
    expect(jumpGroup(items, 'DOOM', 1)).toBe('DOOM')
    expect(jumpGroup(items, 'Arcade', -1)).toBe('Arcade')
    expect(jumpGroup(items, ALL, -1)).toBe(ALL)
    expect(jumpGroup([], ALL, 1)).toBe(ALL)
  })

  it('salto di gruppo con una pressione: riparte dall\'altro capo', () => {
    expect(jumpGroup(items, 'DOOM', 1, true)).toBe('Arcade')
    expect(jumpGroup(items, 'Arcade', -1, true)).toBe('DOOM')
    expect(jumpGroup(items, ALL, -1, true)).toBe('DOOM')
    expect(jumpGroup(filterItems(items, 'sega'), 'Sega - Game Gear', 1, true)).toBe('Sega - Game Gear')
  })

  it('iniziale per i core', () => {
    expect(initialGroup('fbneo')).toBe('F')
    expect(initialGroup('2048')).toBe('#')
    expect(initialGroup('éxtra')).toBe('E')
  })
})

describe('cursore', () => {
  it('si muove tra «Seleziona tutte» e le voci filtrate', () => {
    const visible = filterItems(items, 'sega')
    expect(moveCursor(visible, ALL, -1)).toBe(ALL)
    expect(moveCursor(visible, ALL, 1)).toBe('Sega - Game Gear')
    expect(moveCursor(visible, 'Sega - Master System - Mark III', 1)).toBe('Sega - Master System - Mark III')
  })

  it('con una pressione riparte dall\'altro capo', () => {
    const visible = filterItems(items, 'sega')
    expect(moveCursor(visible, ALL, -1, true)).toBe('Sega - Master System - Mark III')
    expect(moveCursor(visible, 'Sega - Master System - Mark III', 1, true)).toBe(ALL)
  })

  it('resta sulla voce se è ancora visibile', () => {
    expect(keepCursor(filterItems(items, 'sega'), 'Sega - Game Gear')).toBe('Sega - Game Gear')
    expect(keepCursor(filterItems(items, 'sega'), 'Arcade')).toBe('Sega - Game Gear')
    expect(keepCursor(filterItems(items, 'nessuna'), 'Arcade')).toBe(ALL)
    expect(keepCursor(items, ALL)).toBe(ALL)
  })
})

describe('spunte', () => {
  it('spunta e toglie la spunta', () => {
    expect(toggle([], 'Arcade')).toEqual(['Arcade'])
    expect(toggle(['Arcade', 'DOOM'], 'Arcade')).toEqual(['DOOM'])
  })

  it('le spunte restano cambiando il filtro', () => {
    let selected = toggleAll([], filterItems(items, 'sega'))
    expect(selected).toEqual(['Sega - Game Gear', 'Sega - Master System - Mark III'])
    selected = toggle(selected, 'Nintendo - Game Boy')
    expect(allSelected(selected, filterItems(items, 'gear'))).toBe(true)
    expect(selected).toContain('Sega - Master System - Mark III')
  })

  it('«seleziona tutte» agisce solo sulle filtrate', () => {
    const nintendo = filterItems(items, 'nintendo')
    let selected = ['DOOM', 'Nintendo - Game Boy']
    expect(allSelected(selected, nintendo)).toBe(false)
    selected = toggleAll(selected, nintendo)
    expect(selected).toEqual(['DOOM', 'Nintendo - Game Boy', 'Nintendo - Super Nintendo Entertainment System'])
    expect(allSelected(selected, nintendo)).toBe(true)
    selected = toggleAll(selected, nintendo)
    expect(selected).toEqual(['DOOM'])
    expect(allSelected([], [])).toBe(false)
    expect(toggleAll(['DOOM'], [])).toEqual(['DOOM'])
  })
})

describe('riga «Modo»', () => {
  it('sta prima di «Seleziona tutte» solo quando il menu la ha', () => {
    const visible = items.slice(0, 2)
    expect(moveCursor(visible, ALL, -1, false, true)).toBe(MODE)
    expect(moveCursor(visible, ALL, -1, false, false)).toBe(ALL)
    expect(moveCursor(visible, MODE, 1, false, true)).toBe(ALL)
    expect(moveCursor(visible, MODE, -1, true, true)).toBe(visible[1].id)
    expect(keepCursor(visible, MODE)).toBe(MODE)
  })
})
