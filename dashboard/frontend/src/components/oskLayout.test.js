import { describe, expect, it } from 'vitest'
import { bootstrapLoaded, oskCancel, oskCaret, oskErase, oskMove, oskPress, oskType, openKeyboard } from '../state/actions.js'
import { initialState, reducer } from '../state/reducer.js'
import { ROWS, START, SYMBOL_ROWS, keyAt, keyCenter, layout, move } from './oskLayout.js'

function label(pos) {
  const key = keyAt(pos)
  return key.type === 'char' ? key.char : key.type
}

function walk(pos, ...dirs) {
  return dirs.reduce((at, dir) => move(at, dir, true), pos)
}

function open(options = {}) {
  const state = reducer(initialState, bootstrapLoaded({ systems: [], warnings: [] }))
  return reducer(state, openKeyboard('name', { max: 5, ...options }))
}

function apply(state, ...actions) {
  return actions.reduce(reducer, state)
}

describe('oskLayout', () => {
  it('righe centrate su 10 unità', () => {
    expect(ROWS.map((row) => row.reduce((sum, key) => sum + key.width, 0))).toEqual([10, 10, 9, 7, 9, 10])
    expect(keyCenter(1, 0)).toBe(0.5)
    expect(keyCenter(2, 0)).toBe(1)
    expect(keyCenter(3, 0)).toBe(2)
    expect(keyCenter(5, 1)).toBe(4)
  })

  it('con una pressione si ricomincia dall\'altro capo della riga', () => {
    expect(label(START)).toBe('q')
    expect(label(move(START, 'left', true))).toBe('p')
    expect(label(move(START, 'left'))).toBe('q')
    expect(label(walk({ row: 3, col: 6 }, 'right'))).toBe('z')
  })

  it('in verticale va sul tasto più vicino della riga irregolare', () => {
    expect(label(walk(START, 'down'))).toBe('a')
    expect(label(walk(START, 'down', 'down'))).toBe('z')
    expect(label(walk({ row: 1, col: 9 }, 'down'))).toBe('l')
    expect(label(walk({ row: 1, col: 9 }, 'down', 'down'))).toBe('m')
    expect(label(walk({ row: 4, col: 0 }, 'down'))).toBe('shift')
    expect(label(walk({ row: 4, col: 3 }, 'down'))).toBe('space')
    expect(label(walk({ row: 5, col: 3 }, 'up'))).toBe('page')
    expect(label(walk({ row: 5, col: 1 }, 'up', 'up'))).toBe('c')
  })

  it('tenendo premuto si ferma alla prima e all\'ultima riga', () => {
    expect(move({ row: 0, col: 4 }, 'up')).toEqual({ row: 0, col: 4 })
    expect(move({ row: 5, col: 2 }, 'down')).toEqual({ row: 5, col: 2 })
  })

  it('con una pressione passa dalla prima all\'ultima riga e viceversa', () => {
    expect(move({ row: 0, col: 0 }, 'up', true).row).toBe(5)
    expect(move({ row: 5, col: 3 }, 'down', true).row).toBe(0)
  })
})

describe('pagina dei simboli e password', () => {
  it('tutti i caratteri stampabili ASCII che non sono lettere, gli ordinali e le accentate', () => {
    const chars = (rows) => rows.flat().filter((key) => key.type === 'char' && !/[a-z]/.test(key.char)).map((key) => key.char)
    const printable = [...Array(95)].map((_, at) => String.fromCharCode(32 + at)).filter((char) => !/[a-zA-Z ]/.test(char))
    const extra = [...'°ªºàèéìòóù']
    expect([...new Set([...chars(ROWS), ...chars(SYMBOL_ROWS)])].sort()).toEqual([...printable, ...extra].sort())
    for (const rows of [ROWS, SYMBOL_ROWS, layout({ secret: true }), layout({ secret: true, symbols: true })]) {
      for (const row of rows) {
        expect(row.reduce((sum, key) => sum + key.width, 0)).toBeLessThanOrEqual(10)
      }
    }
  })

  it('#+= passa ai simboli e ABC torna alle lettere, restando sulla stessa riga', () => {
    let state = apply(open({ max: 10 }), oskPress(4, 7))
    expect(state.osk.symbols).toBe(true)
    expect(keyAt(state.osk, layout(state.osk)).label).toBe('ABC')
    expect({ row: state.osk.row, col: state.osk.col }).toEqual({ row: 4, col: 7 })
    state = apply(state, oskPress(1, 0), oskPress(4, 7), oskPress(1, 0))
    expect(state.osk.value).toBe('!q')
    expect(state.osk.symbols).toBe(false)
  })

  it('una password resta nascosta finché MOSTRA non la rivela', () => {
    let state = open({ secret: true })
    expect(state.osk.secret).toBe(true)
    expect(layout(state.osk)[5].map((key) => key.type)).toEqual(['shift', 'space', 'reveal', 'erase', 'ok'])
    state = apply(state, oskPress(5, 2))
    expect(state.osk.reveal).toBe(true)
    expect(layout(state.osk)[5][2].label).toBe('NASCONDI')
    expect(open().osk.secret).toBe(false)
  })
})

describe('tastiera a schermo nel reducer', () => {
  it('digita il tasto evidenziato e rispetta il limite', () => {
    let state = apply(open(), oskPress(), oskMove('right'), oskPress())
    expect(state.osk.value).toBe('qw')
    state = apply(state, oskType('erty'))
    expect(state.osk.value).toBe('qwert')
    expect(apply(state, oskPress())).toBe(state)
  })

  it('MAIUSC scrive in maiuscolo', () => {
    const state = apply(open(), oskPress(5, 0), oskPress(1, 2), oskPress(5, 0), oskPress(1, 2))
    expect(state.osk.value).toBe('Ee')
    expect(state.osk.upper).toBe(false)
  })

  it('cursore a inizio e fine, cancella e spazio', () => {
    let state = apply(open({ value: 'ab' }), oskCaret('start'), oskType('x'))
    expect(state.osk.value).toBe('xab')
    expect(state.osk.caret).toBe(1)
    state = apply(state, oskCaret('end'), oskErase(), oskPress(5, 1))
    expect(state.osk.value).toBe('xa ')
    state = apply(state, oskCaret('start'))
    expect(apply(state, oskErase())).toBe(state)
  })

  it('cursore di un carattere a sinistra e a destra, fermo ai bordi', () => {
    let state = apply(open({ value: 'abc' }), oskCaret('left'), oskCaret('left'), oskType('x'))
    expect(state.osk.value).toBe('axbc')
    expect(state.osk.caret).toBe(2)
    state = apply(state, oskCaret('right'), oskCaret('right'), oskCaret('right'))
    expect(state.osk.caret).toBe(4)
    state = apply(state, oskCaret('start'), oskCaret('left'))
    expect(state.osk.caret).toBe(0)
  })

  it('ordinali e accentate dalla pagina dei simboli', () => {
    let state = apply(open({ max: 10 }), oskPress(4, 7))
    state = apply(state, oskPress(0, 0), oskPress(4, 4), oskPress(5, 0))
    expect(state.osk.value).toBe('1°à')
  })

  it('il valore iniziale è troncato al massimo', () => {
    expect(open({ value: 'abcdefg' }).osk.value).toBe('abcde')
  })

  it('OK chiude, annulla chiude', () => {
    expect(apply(open(), oskPress(5, 3)).osk).toBeNull()
    expect(apply(open(), oskCancel()).osk).toBeNull()
  })

  it('azioni ignorate a tastiera chiusa', () => {
    const state = reducer(initialState, bootstrapLoaded({ systems: [], warnings: [] }))
    expect(apply(state, oskType('a'), oskMove('up'), oskCancel())).toBe(state)
  })
})
