/**
 * Lettura dei joypad con la Gamepad API: un ciclo `requestAnimationFrame`
 * legge `navigator.getGamepads()` e trasforma i tasti in eventi logici con
 * i tasti salvati per ogni joypad; un joypad non configurato non genera
 * eventi. Chrome espone un joypad solo dopo la prima pressione di un suo tasto.
 */
import { buttonsFor, diff, initialPadState, rawAxes, rawPressed, readPad } from './mapping.js'

function listPads() {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) {
    return []
  }
  return Array.from(navigator.getGamepads() || []).filter(Boolean)
}

export class GamepadInput {
  /**
   * `onEvent({pad, button, kind})` riceve gli eventi logici; `onPads(joypad)`
   * i joypad visibili (`[{index, id}]`) quando cambiano; `onFrame(now)` è
   * chiamata a ogni fotogramma del ciclo. `padButtons` = tasti di ogni
   * joypad (`{id: {a: 0, …}}`).
   */
  constructor({ onEvent, onPads, onFrame, padButtons = {} }) {
    this.onEvent = onEvent
    this.onPads = onPads
    this.onFrame = onFrame
    this.padButtons = padButtons
    this.states = new Map()
    this.raw = new Map()
    this.rawListeners = new Set()
    this.locked = false
    this.padKey = ''
    this.frame = 0
    this.loop = this.loop.bind(this)
    this.connected = this.connected.bind(this)
  }

  start() {
    window.addEventListener('gamepadconnected', this.connected)
    window.addEventListener('gamepaddisconnected', this.connected)
    this.frame = window.requestAnimationFrame(this.loop)
  }

  stop() {
    window.removeEventListener('gamepadconnected', this.connected)
    window.removeEventListener('gamepaddisconnected', this.connected)
    window.cancelAnimationFrame(this.frame)
  }

  setButtons(padButtons) {
    this.padButtons = padButtons || {}
  }

  /** Ignora gli eventi finché tutti i tasti di tutti i joypad non sono rilasciati. */
  lockUntilReleased() {
    this.locked = true
  }

  /**
   * Registra `cb({pad, id, pressed: [indici], axes: ['+1', …]})` per i tasti
   * e gli assi grezzi; restituisce
   * la funzione di rimozione. Al primo fotogramma ogni joypad visibile
   * riporta i tasti premuti in quel momento (anche nessuno), poi solo i cambi.
   */
  onRaw(cb) {
    this.raw.clear()
    this.rawListeners.add(cb)
    return () => this.rawListeners.delete(cb)
  }

  connected() {
    this.poll(performance.now())
  }

  loop(now) {
    this.poll(now)
    if (this.onFrame) {
      this.onFrame(now)
    }
    this.frame = window.requestAnimationFrame(this.loop)
  }

  poll(now) {
    const pads = listPads()
    const visible = pads.map((pad) => ({ index: pad.index, id: pad.id }))
    const padKey = JSON.stringify(visible)
    if (padKey !== this.padKey) {
      this.padKey = padKey
      if (this.onPads) {
        this.onPads(visible)
      }
    }
    const seen = new Set()
    const events = []
    let anyPressed = false
    for (const pad of pads) {
      seen.add(pad.index)
      const pressed = readPad(pad, buttonsFor(this.padButtons, pad))
      const result = diff(this.states.get(pad.index) || initialPadState(), pressed, now)
      this.states.set(pad.index, result.state)
      anyPressed = anyPressed || pressed.size > 0
      for (const event of result.events) {
        events.push({ pad: pad.index, padId: pad.id, ...event })
      }
      this.pollRaw(pad)
    }
    for (const index of Array.from(this.states.keys())) {
      if (!seen.has(index)) {
        this.states.delete(index)
        this.raw.delete(index)
      }
    }
    if (this.locked) {
      if (!anyPressed) {
        this.locked = false
      }
      return
    }
    for (const event of events) {
      this.onEvent(event)
    }
  }

  pollRaw(pad) {
    if (!this.rawListeners.size) {
      return
    }
    const pressed = rawPressed(pad)
    const axes = rawAxes(pad)
    const key = `${pressed.join(',')}|${axes.join(',')}`
    if (this.raw.get(pad.index) === key) {
      return
    }
    this.raw.set(pad.index, key)
    for (const cb of this.rawListeners) {
      cb({ pad: pad.index, id: pad.id, pressed, axes })
    }
  }
}
