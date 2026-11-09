import { describe, expect, it } from 'vitest'
import { DEFAULT_BUTTONS, buttonsFor, diff, initialPadState, rawAxes, rawPressed, readPad } from './mapping.js'
import { KeyboardState, keyInput, keyToButton } from './keyboard.js'

function pad({ pressed = [], values = {}, axes = [0, 0] } = {}) {
  const buttons = Array.from({ length: 17 }, (_, index) => ({
    pressed: pressed.includes(index),
    value: values[index] ?? (pressed.includes(index) ? 1 : 0),
  }))
  return { index: 0, buttons, axes }
}

function names(events) {
  return events.map((event) => `${event.kind}:${event.button}`)
}

describe('readPad', () => {
  it('legge tasti e croce con la mappatura standard', () => {
    expect(readPad(pad({ pressed: [0, 9, 12, 15] }))).toEqual(new Set(['a', 'start', 'up', 'right']))
  })

  it('usa la mappatura configurata', () => {
    const buttons = { ...DEFAULT_BUTTONS, a: 1, b: 0 }
    expect(readPad(pad({ pressed: [1] }), buttons)).toEqual(new Set(['a']))
  })

  it('croce, levetta e grilletti imparati, anche sugli assi', () => {
    const buttons = { a: 0, b: 1, select: 8, start: 9, lt: '+5', up: '-7', down: '+7', ls_left: '-0', ls_right: '+0' }
    expect(readPad(pad({ axes: [0, 0, 0, 0, 0, 0.9, 0, -1] }), buttons)).toEqual(new Set(['lt', 'up']))
    expect(readPad(pad({ axes: [-0.8, 0] }), buttons)).toEqual(new Set(['left']))
    // Con le direzioni imparate i tasti 12–15 e l'asse 1 non contano più.
    expect(readPad(pad({ pressed: [12], axes: [0, 0.9] }), buttons).size).toBe(0)
    expect(rawAxes(pad({ axes: [0.2, -0.7, 0.6] }))).toEqual(['-1', '+2'])
  })

  it('ogni joypad con i suoi tasti; uno non configurato non preme nulla', () => {
    const padButtons = { A: { ...DEFAULT_BUTTONS, a: 1, b: 0 } }
    expect(buttonsFor(padButtons, { id: 'A' })).toBe(padButtons.A)
    expect(buttonsFor(padButtons, { id: 'B' })).toBeNull()
    expect(readPad(pad({ pressed: [0, 12] }), buttonsFor(padButtons, { id: 'B' })).size).toBe(0)
  })

  it('lo stick conta oltre la soglia di 0,5', () => {
    expect(readPad(pad({ axes: [-0.4, 0.4] })).size).toBe(0)
    expect(readPad(pad({ axes: [-0.6, 0.7] }))).toEqual(new Set(['left', 'down']))
    expect(readPad(pad({ axes: [0.9, -0.9] }))).toEqual(new Set(['right', 'up']))
  })

  it('i trigger analogici contano solo oltre 0,5', () => {
    expect(readPad(pad({ values: { 6: 0.4, 7: 0.3 } })).size).toBe(0)
    expect(readPad(pad({ values: { 6: 0.8 } }))).toEqual(new Set(['lt']))
  })

  it('joypad assente o senza tasti', () => {
    expect(readPad(null).size).toBe(0)
    expect(readPad({ buttons: [], axes: [] }).size).toBe(0)
  })

  it('tasti grezzi premuti', () => {
    expect(rawPressed(pad({ pressed: [3], values: { 7: 0.9 } }))).toEqual([3, 7])
  })
})

describe('diff', () => {
  it('pressione e rilascio', () => {
    let result = diff(initialPadState(), new Set(['a']), 0)
    expect(names(result.events)).toEqual(['press:a'])
    result = diff(result.state, new Set(['a']), 500)
    expect(result.events).toEqual([])
    result = diff(result.state, new Set(), 600)
    expect(names(result.events)).toEqual(['release:a'])
  })

  it('le direzioni si ripetono dopo 350 ms, poi ogni 90 ms', () => {
    let result = diff(initialPadState(), new Set(['down']), 1000)
    expect(names(result.events)).toEqual(['press:down'])
    const events = []
    for (let now = 1016; now <= 1700; now += 16) {
      result = diff(result.state, new Set(['down']), now)
      events.push(...result.events.map((event) => [event.kind, now]))
    }
    const times = events.map(([, now]) => now)
    expect(events.every(([kind]) => kind === 'repeat')).toBe(true)
    expect(times[0]).toBeGreaterThanOrEqual(1350)
    expect(times[0]).toBeLessThan(1366)
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(90)
    expect(times[1] - times[0]).toBeLessThan(106)
  })

  it('i tasti non direzionali non si ripetono', () => {
    let result = diff(initialPadState(), new Set(['a']), 0)
    result = diff(result.state, new Set(['a']), 5000)
    expect(result.events).toEqual([])
  })

  it('una nuova pressione riparte dal ritardo iniziale', () => {
    let result = diff(initialPadState(), new Set(['left']), 0)
    result = diff(result.state, new Set(), 100)
    result = diff(result.state, new Set(['left']), 200)
    result = diff(result.state, new Set(['left']), 500)
    expect(result.events).toEqual([])
    result = diff(result.state, new Set(['left']), 560)
    expect(names(result.events)).toEqual(['repeat:left'])
  })
})

describe('tastiera', () => {
  it('mappa i tasti di README §G', () => {
    const cases = {
      ArrowUp: 'up',
      ArrowLeft: 'left',
      Enter: 'a',
      ' ': 'a',
      Escape: 'b',
      Backspace: 'b',
      '/': 'x',
      p: 'y',
      P: 'y',
      '[': 'lb',
      ']': 'rb',
      PageUp: 'lt',
      PageDown: 'rt',
      F2: 'start',
      F3: 'select',
    }
    for (const [key, button] of Object.entries(cases)) {
      expect(keyToButton({ key })).toBe(button)
    }
  })

  it('Ctrl+F cerca, gli altri tasti con modificatori sono ignorati', () => {
    expect(keyToButton({ key: 'f', ctrlKey: true })).toBe('x')
    expect(keyToButton({ key: 'q', ctrlKey: true })).toBe('quit')
    expect(keyToButton({ key: 'q' })).toBeNull()
    expect(keyToButton({ key: 'p', ctrlKey: true })).toBeNull()
    expect(keyToButton({ key: 'ArrowUp', altKey: true })).toBeNull()
    expect(keyToButton({ key: 'q' })).toBeNull()
  })

  it('Invio e Spazio tengono premuto A finché non sono rilasciati entrambi', () => {
    const keyboard = new KeyboardState()
    expect(names(keyboard.down('Enter', 'a', 0))).toEqual(['press:a'])
    expect(keyboard.down('Space', 'a', 10)).toEqual([])
    expect(keyboard.up('Enter', 20)).toEqual([])
    expect(names(keyboard.up('Space', 30))).toEqual(['release:a'])
  })

  it('le frecce si ripetono con i tempi del joypad', () => {
    const keyboard = new KeyboardState()
    keyboard.down('ArrowRight', 'right', 0)
    expect(keyboard.tick(300)).toEqual([])
    expect(names(keyboard.tick(360))).toEqual(['repeat:right'])
    expect(keyboard.tick(400)).toEqual([])
    expect(names(keyboard.tick(460))).toEqual(['repeat:right'])
    expect(names(keyboard.clear(470))).toEqual(['release:right'])
    expect(keyboard.tick(1000)).toEqual([])
  })
})

describe('tastiera in modalità testo', () => {
  it('senza tastiera a schermo usa i tasti di README §G', () => {
    expect(keyInput({ key: '/' }, false)).toEqual({ button: 'x' })
    expect(keyInput({ key: 'Enter' }, false)).toEqual({ button: 'a' })
    expect(keyInput({ key: 'q' }, false)).toBeNull()
  })

  it('con la tastiera a schermo scrive e modifica il testo', () => {
    expect(keyInput({ key: 'd' }, true)).toEqual({ text: 'd' })
    expect(keyInput({ key: '/' }, true)).toEqual({ text: '/' })
    expect(keyInput({ key: ' ' }, true)).toEqual({ text: ' ' })
    expect(keyInput({ key: 'P' }, true)).toEqual({ text: 'P' })
    expect(keyInput({ key: 'Backspace' }, true)).toEqual({ button: 'x' })
    expect(keyInput({ key: 'Enter' }, true)).toEqual({ button: 'start' })
    expect(keyInput({ key: 'Escape' }, true)).toEqual({ button: 'b' })
    expect(keyInput({ key: 'Home' }, true)).toEqual({ button: 'lb' })
    expect(keyInput({ key: 'End' }, true)).toEqual({ button: 'rb' })
    expect(keyInput({ key: 'ArrowLeft' }, true)).toEqual({ button: 'left' })
    expect(keyInput({ key: 'Shift' }, true)).toBeNull()
    expect(keyInput({ key: 'c', ctrlKey: true }, true)).toBeNull()
  })
})

describe('tasti dei comandi delle estensioni', () => {
  const extra = { g: 'cmd:x' }

  it('G diventa il comando, anche maiuscola', () => {
    expect(keyToButton({ key: 'g' }, extra)).toBe('cmd:x')
    expect(keyToButton({ key: 'G' }, extra)).toBe('cmd:x')
    expect(keyInput({ key: 'g' }, false, extra)).toEqual({ button: 'cmd:x' })
  })

  it('senza estensioni, con modificatori o in modalità testo G non è un comando', () => {
    expect(keyToButton({ key: 'g' })).toBeNull()
    expect(keyToButton({ key: 'g', ctrlKey: true }, extra)).toBeNull()
    expect(keyToButton({ key: 'g', altKey: true }, extra)).toBeNull()
    expect(keyInput({ key: 'g' }, true, extra)).toEqual({ text: 'g' })
  })

  it('i tasti già usati dalla dashboard restano invariati', () => {
    expect(keyToButton({ key: 'p' }, { p: 'cmd:x' })).toBe('y')
  })
})
