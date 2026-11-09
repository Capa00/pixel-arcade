import { describe, expect, it } from 'vitest'
import { EXIT_HOLD_MS, TAP_MS, comboInput, comboProgress, initialCombo } from './exitCombo.js'

function ev(button, kind, pad = 0) {
  return { pad, button, kind, source: 'pad' }
}

function run(events, start = initialCombo()) {
  let combo = start
  const out = []
  let taps = 0
  for (const [event, now] of events) {
    const result = comboInput(combo, event, now)
    combo = result.combo
    out.push(...result.events)
    taps += result.tap ? 1 : 0
  }
  return { combo, out, taps }
}

describe('comboInput', () => {
  it('inoltra subito gli altri tasti', () => {
    const { out } = run([[ev('a', 'press'), 0], [ev('up', 'repeat'), 10]])
    expect(out).toEqual([ev('a', 'press'), ev('up', 'repeat')])
  })

  it('SELECT da solo agisce al rilascio', () => {
    const first = run([[ev('select', 'press'), 0]])
    expect(first.out).toEqual([])
    const { out } = run([[ev('select', 'release'), 100]], first.combo)
    expect(out).toEqual([ev('select', 'press'), ev('select', 'release')])
  })

  it('combinazione completa: avanzamento fino a 1 e nessun comando al rilascio', () => {
    let { combo, out } = run([[ev('start', 'press'), 0], [ev('select', 'press'), 100]])
    expect(out).toEqual([])
    expect(comboProgress(combo, 100)).toBe(0)
    expect(comboProgress(combo, 100 + EXIT_HOLD_MS / 2)).toBeCloseTo(0.5)
    expect(comboProgress(combo, 100 + EXIT_HOLD_MS * 2)).toBe(1)
    ;({ combo, out } = run([[ev('start', 'release'), 4000], [ev('select', 'release'), 4100]], combo))
    expect(out).toEqual([])
    expect(comboProgress(combo, 4200)).toBeNull()
  })

  it('rilascio anticipato annulla la combinazione', () => {
    const { combo, out } = run([[ev('start', 'press'), 0], [ev('select', 'press'), 0], [ev('select', 'release'), 1000]])
    expect(out).toEqual([])
    expect(comboProgress(combo, 1000)).toBeNull()
    // Dopo aver rilasciato tutto, SELECT torna a funzionare da solo.
    const next = run([[ev('start', 'release'), 1100], [ev('select', 'press'), 2000], [ev('select', 'release'), 2100]], combo)
    expect(next.out).toEqual([ev('select', 'press'), ev('select', 'release')])
  })

  it('joypad diversi non formano la combinazione', () => {
    const { combo, out } = run([[ev('start', 'press', 0), 0], [ev('select', 'press', 1), 0]])
    expect(comboProgress(combo, 5000)).toBeNull()
    expect(out).toEqual([])
    const released = run([[ev('start', 'release', 0), 100]], combo)
    expect(released.out).toEqual([ev('start', 'press', 0), ev('start', 'release', 0)])
  })

  it('rilascio senza pressione vista ignorato (ritorno da RetroArch)', () => {
    const { out } = run([[ev('select', 'release'), 0], [ev('start', 'release'), 0]])
    expect(out).toEqual([])
  })

  it('tastiera e mouse (pad nullo) funzionano come un joypad', () => {
    const { combo } = run([[ev('start', 'press', null), 0], [ev('select', 'press', null), 0]])
    expect(comboProgress(combo, EXIT_HOLD_MS)).toBe(1)
  })

  it('colpo breve: rilascio entro TAP_MS, segnalato una volta sola', () => {
    let { combo, taps } = run([[ev('start', 'press'), 0], [ev('select', 'press'), 50]])
    let out
    ;({ combo, out, taps } = run([[ev('select', 'release'), 400], [ev('start', 'release'), 450]], combo))
    expect(taps).toBe(1)
    expect(out).toEqual([])
    expect(comboProgress(combo, 500)).toBeNull()
  })

  it('rilascio tra TAP_MS ed EXIT_HOLD_MS: nessun colpo breve', () => {
    const { taps } = run([
      [ev('start', 'press'), 0],
      [ev('select', 'press'), 0],
      [ev('start', 'release'), TAP_MS + 500],
      [ev('select', 'release'), TAP_MS + 600],
    ])
    expect(taps).toBe(0)
  })

  it('START o SELECT da soli non sono un colpo breve', () => {
    const { taps } = run([[ev('start', 'press'), 0], [ev('start', 'release'), 100]])
    expect(taps).toBe(0)
  })
})
