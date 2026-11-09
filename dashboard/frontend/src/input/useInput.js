import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GamepadInput } from './gamepad.js'
import { KeyboardState, keyInput } from './keyboard.js'

// Tasto laterale «indietro» del mouse.
const MOUSE_BACK = 3
const NO_KEYS = {}

function isTextField(target) {
  return Boolean(target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)))
}

/**
 * Unico punto d'ingresso dell'input: joypad, tastiera e mouse diventano gli
 * stessi eventi logici `{pad, button, kind, source}`, con `kind` pari a
 * `press`, `release` o `repeat` e `source` pari a `pad`, `keyboard` o `mouse`.
 * Con `textMode` (tastiera a schermo aperta) la tastiera fisica scrive: ogni
 * carattere arriva come `{pad: null, kind: 'text', text, source: 'keyboard'}`.
 *
 * I tasti di ogni joypad sono in `padButtons` (`{id: {a: 0, …}}`).
 * Restituisce `{source, pads, emit, gamepad}`: la sorgente usata per ultima
 * (joypad o tastiera), i joypad visibili (`[{index, id}]`), `emit(button, kind)`
 * per i comandi generati dai componenti col mouse (per esempio la rotellina,
 * che usa `repeat` per fermarsi ai bordi come una direzione tenuta) e
 * `gamepad` con `onRaw(cb)` (tasti grezzi, per l'apprendimento dei tasti) e
 * `lockUntilReleased()`. Gli eventi del joypad arrivano solo se la finestra
 * di Chrome ha il focus. `extraKeys` (`{g: 'cmd:<id>'}`) aggiunge i tasti
 * della tastiera dei comandi delle estensioni.
 */
export function useInput(handler, padButtons, textMode = false, extraKeys = NO_KEYS) {
  const handlerRef = useRef(handler)
  const textRef = useRef(textMode)
  const extraRef = useRef(extraKeys)
  const padRef = useRef(null)
  const padButtonsRef = useRef(padButtons)
  const [source, setSource] = useState('pad')
  const [pads, setPads] = useState([])

  useEffect(() => {
    handlerRef.current = handler
    textRef.current = textMode
    extraRef.current = extraKeys
  })

  const deliver = useCallback((event) => {
    if (event.source !== 'mouse') {
      setSource(event.source)
    }
    handlerRef.current(event)
  }, [])

  const emit = useCallback((button, kind = 'press') => {
    deliver({ pad: null, button, kind, source: 'mouse' })
    deliver({ pad: null, button, kind: 'release', source: 'mouse' })
  }, [deliver])

  useEffect(() => {
    const keyboard = new KeyboardState()
    const fromKeyboard = (events) => {
      for (const event of events) {
        deliver({ pad: null, ...event, source: 'keyboard' })
      }
    }
    const input = new GamepadInput({
      // Solo con Chrome in primo piano: i tasti premuti in RetroArch non
      // devono arrivare alla dashboard (per esempio B due volte interromperebbe la partita).
      onEvent: (event) => {
        if (document.hasFocus()) {
          deliver({ ...event, source: 'pad' })
        }
      },
      onPads: setPads,
      onFrame: (now) => fromKeyboard(keyboard.tick(now)),
      padButtons: padButtonsRef.current,
    })
    const keyDown = (event) => {
      if (isTextField(event.target)) {
        return
      }
      const result = keyInput(event, textRef.current, extraRef.current)
      if (!result) {
        return
      }
      event.preventDefault()
      if (result.text) {
        // I caratteri seguono la ripetizione del sistema, come in un campo di testo.
        deliver({ pad: null, kind: 'text', text: result.text, source: 'keyboard' })
      } else if (!event.repeat) {
        fromKeyboard(keyboard.down(event.code || event.key, result.button, performance.now()))
      }
    }
    const keyUp = (event) => {
      fromKeyboard(keyboard.up(event.code || event.key, performance.now()))
    }
    const blur = () => fromKeyboard(keyboard.clear(performance.now()))
    const mouseBack = (event) => {
      if (event.button !== MOUSE_BACK) {
        return
      }
      event.preventDefault()
      if (event.type === 'mouseup') {
        emit('b')
      }
    }
    padRef.current = input
    input.start()
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', blur)
    window.addEventListener('mousedown', mouseBack)
    window.addEventListener('mouseup', mouseBack)
    window.addEventListener('auxclick', mouseBack)
    return () => {
      input.stop()
      padRef.current = null
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', blur)
      window.removeEventListener('mousedown', mouseBack)
      window.removeEventListener('mouseup', mouseBack)
      window.removeEventListener('auxclick', mouseBack)
    }
  }, [deliver, emit])

  useEffect(() => {
    padButtonsRef.current = padButtons
    if (padRef.current) {
      padRef.current.setButtons(padButtons)
    }
  }, [padButtons])

  const gamepad = useMemo(() => ({
    onRaw: (cb) => (padRef.current ? padRef.current.onRaw(cb) : () => {}),
    lockUntilReleased: () => {
      if (padRef.current) {
        padRef.current.lockUntilReleased()
      }
    },
  }), [])

  return { source, pads, emit, gamepad }
}
