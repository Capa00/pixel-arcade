import { describe, expect, it } from 'vitest'
import { holdInput, holdProgress, holdTick, initialHold } from './holdGesture.js'

const OPEN = { id: 'test.open', hold: { button: 'x', ms: 1000 } }
const COMMANDS = [OPEN]

function ev(button, kind, pad = 0, source = 'pad') {
  return { pad, button, kind, source }
}

function run(steps, start = initialHold(), commands = COMMANDS) {
  let hold = start
  const out = []
  const fired = []
  for (const [event, now] of steps) {
    const result = holdInput(hold, event, now, commands)
    hold = result.hold
    out.push(...result.events)
    if (result.fire) {
      fired.push(result.fire)
    }
  }
  return { hold, out, fired }
}

describe('holdInput', () => {
  it('senza comandi X passa invariato alla pressione', () => {
    const { out } = run([[ev('x', 'press'), 0]], initialHold(), [])
    expect(out).toEqual([ev('x', 'press')])
  })

  it('X breve: niente alla pressione, pressione e rilascio al rilascio', () => {
    const first = run([[ev('x', 'press'), 0]])
    expect(first.out).toEqual([])
    const { out, fired, hold } = run([[ev('x', 'release'), 200]], first.hold)
    expect(out).toEqual([ev('x', 'press'), ev('x', 'release')])
    expect(fired).toEqual([])
    expect(hold).toEqual(initialHold())
  })

  it('X tenuto 1000 ms: il comando parte una volta e il rilascio non passa', () => {
    let { hold } = run([[ev('x', 'press'), 0]])
    let tick = holdTick(hold, 999)
    expect(tick.fire).toBeNull()
    tick = holdTick(tick.hold, 1000)
    expect(tick.fire).toBe(OPEN)
    const again = holdTick(tick.hold, 1100)
    expect(again.fire).toBeNull()
    const { out, fired, hold: after } = run([[ev('x', 'release'), 1200]], again.hold)
    expect(out).toEqual([])
    expect(fired).toEqual([])
    expect(after).toEqual(initialHold())
    hold = after
    expect(holdProgress(hold, 1300)).toBeNull()
  })

  it('rilascio oltre la soglia senza tick: il comando parte al rilascio', () => {
    const { out, fired } = run([[ev('x', 'press'), 0], [ev('x', 'release'), 1500]])
    expect(out).toEqual([])
    expect(fired).toEqual([OPEN])
  })

  it('una direzione durante l\'attesa annulla il tenuto', () => {
    const { out, hold } = run([[ev('x', 'press'), 0], [ev('right', 'press'), 300]])
    expect(out).toEqual([ev('x', 'press'), ev('right', 'press')])
    expect(holdProgress(hold, 400)).toBeNull()
    const rest = run([[ev('right', 'release'), 350], [ev('x', 'release'), 400]], hold)
    expect(rest.out).toEqual([ev('right', 'release'), ev('x', 'release')])
    expect(holdTick(rest.hold, 2000).fire).toBeNull()
  })

  it('gli eventi repeat del tasto tenuto sono ignorati', () => {
    const { out } = run([[ev('x', 'press'), 0], [ev('x', 'repeat'), 400]])
    expect(out).toEqual([])
  })

  it('avanzamento a 0, 500 e 1000 ms', () => {
    const { hold } = run([[ev('x', 'press'), 0]])
    expect(holdProgress(initialHold(), 0)).toBeNull()
    expect(holdProgress(hold, 0)).toBe(0)
    expect(holdProgress(hold, 500)).toBeCloseTo(0.5)
    expect(holdProgress(hold, 1000)).toBe(1)
    expect(holdProgress(hold, 3000)).toBe(1)
  })

  it('un secondo joypad non interferisce', () => {
    const { out, hold } = run([
      [ev('x', 'press', 0), 0],
      [ev('right', 'press', 1), 100],
      [ev('x', 'press', 1), 150],
      [ev('x', 'release', 1), 200],
      [ev('right', 'release', 1), 250],
    ])
    expect(out).toEqual([
      ev('right', 'press', 1),
      ev('x', 'press', 1),
      ev('x', 'release', 1),
      ev('right', 'release', 1),
    ])
    expect(holdProgress(hold, 500)).toBeCloseTo(0.5)
    expect(holdTick(hold, 1000).fire).toBe(OPEN)
  })

  it('tastiera e mouse sono dispositivi diversi', () => {
    const { out } = run([
      [ev('x', 'press', null, 'keyboard'), 0],
      [ev('b', 'press', null, 'mouse'), 100],
    ])
    expect(out).toEqual([ev('b', 'press', null, 'mouse')])
  })
})
