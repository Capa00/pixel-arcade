import { describe, expect, it, vi } from 'vitest'
import { returnToSplash, subscribeSplash } from './splash.js'

describe('returnToSplash', () => {
  it('chiama prima onSplash delle estensioni, poi gli store iscritti', () => {
    const order = []
    const stop = subscribeSplash(() => order.push('store'))
    returnToSplash([{ id: 'a', onSplash: () => order.push('a') }, { id: 'b' }])
    stop()
    returnToSplash([])
    expect(order).toEqual(['a', 'store'])
  })

  it('un errore di un\'estensione non ferma le altre', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const closed = vi.fn()
    const stop = subscribeSplash(closed)
    returnToSplash([{ id: 'rotta', onSplash: () => { throw new Error('no') } }, { id: 'ok', onSplash: closed }])
    stop()
    expect(closed).toHaveBeenCalledTimes(2)
    expect(error).toHaveBeenCalledTimes(1)
    error.mockRestore()
  })
})
