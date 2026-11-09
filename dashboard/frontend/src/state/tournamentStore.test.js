import { describe, expect, it } from 'vitest'
import { getSnapshot, setStarting, subscribe } from './tournamentStore.js'

describe('tournamentStore', () => {
  it('schermata «Avvia» aperta: avvisa solo ai cambiamenti', () => {
    let calls = 0
    const stop = subscribe(() => {
      calls += 1
    })
    expect(getSnapshot().starting).toBe(false)
    setStarting(true)
    setStarting(true)
    expect(getSnapshot().starting).toBe(true)
    setStarting(false)
    expect(getSnapshot().starting).toBe(false)
    expect(calls).toBe(2)
    stop()
  })
})
