import { describe, expect, it } from 'vitest'
import { YES_NO, moveChoice } from './confirmChoices.js'

const EXIT = [{ id: 'cancel' }, { id: 'discard' }, { id: 'save' }]

describe('moveChoice', () => {
  it('Sì/No: una direzione passa all\'altra scelta', () => {
    expect(moveChoice(YES_NO, 'no', 'left', true)).toBe('yes')
    expect(moveChoice(YES_NO, 'no', 'right', true)).toBe('yes')
    expect(moveChoice(YES_NO, 'yes', 'down', true)).toBe('no')
  })

  it('tre scelte: da sinistra a destra, con una pressione riparte dall\'altro capo', () => {
    expect(moveChoice(EXIT, 'save', 'left', true)).toBe('discard')
    expect(moveChoice(EXIT, 'save', 'right', true)).toBe('cancel')
    expect(moveChoice(EXIT, 'cancel', 'left', true)).toBe('save')
  })

  it('tenendo premuto si ferma al bordo; gli altri tasti non spostano', () => {
    expect(moveChoice(EXIT, 'save', 'right', false)).toBe('save')
    expect(moveChoice(EXIT, 'discard', 'right', false)).toBe('save')
    expect(moveChoice(EXIT, 'save', 'a', true)).toBe('save')
  })
})
