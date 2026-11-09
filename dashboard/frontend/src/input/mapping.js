/**
 * Mappatura del joypad (Gamepad API, mappatura standard) in tasti logici e
 * generazione degli eventi `press` / `release` / `repeat`. Solo funzioni pure.
 */

export const BUTTON_NAMES = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'select', 'start']
export const DIRECTIONS = ['up', 'down', 'left', 'right']

export const DEFAULT_BUTTONS = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  select: 8,
  start: 9,
}

/**
 * Tasti del joypad `gamepad` (`{id}` della Gamepad API) tra quelli salvati
 * per ogni joypad (`padButtons`, `{id: {a: 0, …}}`); `null` se il joypad non
 * è ancora configurato.
 */
export function buttonsFor(padButtons, gamepad) {
  const id = gamepad && gamepad.id
  return (id && padButtons && padButtons[id]) || null
}

// Croce direzionale della mappatura standard.
export const DPAD = { up: 12, down: 13, left: 14, right: 15 }

export const AXIS_THRESHOLD = 0.5
export const TRIGGER_THRESHOLD = 0.5
export const REPEAT_DELAY = 350
export const REPEAT_INTERVAL = 90

const TRIGGERS = new Set(['lt', 'rt'])

function isDown(button, analog) {
  if (!button) {
    return false
  }
  if (analog) {
    return button.value > TRIGGER_THRESHOLD
  }
  return Boolean(button.pressed)
}

// Direzioni imparate per ogni joypad: croce e levetta sinistra (`ls_*`).
const LEARNED_DIRECTIONS = {
  up: ['up', 'ls_up'],
  down: ['down', 'ls_down'],
  left: ['left', 'ls_left'],
  right: ['right', 'ls_right'],
}

/** Vero se l'asse `token` (`+1`, `-0`) supera la soglia in quella direzione. */
function axisDown(axes, token) {
  const match = /^([+-])(\d{1,2})$/.exec(token)
  if (!match) {
    return false
  }
  const value = axes[Number(match[2])] || 0
  return match[1] === '+' ? value > AXIS_THRESHOLD : value < -AXIS_THRESHOLD
}

/** Vero se l'ingresso `value` (pulsante, oppure asse come `+1`) è premuto. */
function inputDown(gamepad, value, analog) {
  if (Number.isInteger(value)) {
    return isDown((gamepad.buttons || [])[value], analog)
  }
  return typeof value === 'string' && axisDown(gamepad.axes || [], value)
}

/**
 * Tasti logici premuti sul joypad `gamepad`, con i tasti configurati in
 * `buttons` (`{a: 0, b: 1, …}`; un valore può essere anche un asse, `+1`).
 * Se `buttons` indica croce o levetta (`up`, `ls_up`…) le direzioni sono
 * quelle; altrimenti croce sui tasti 12–15 e stick sinistro sugli assi 0/1.
 * Soglia 0,5 per assi e grilletti. Con `buttons` nullo (joypad non
 * configurato) nessun tasto risulta premuto.
 */
export function readPad(gamepad, buttons = DEFAULT_BUTTONS) {
  const pressed = new Set()
  if (!gamepad || !buttons) {
    return pressed
  }
  for (const name of BUTTON_NAMES) {
    if (inputDown(gamepad, buttons[name], TRIGGERS.has(name))) {
      pressed.add(name)
    }
  }
  const learned = Object.values(LEARNED_DIRECTIONS).some((keys) => keys.some((key) => buttons[key] !== undefined))
  if (learned) {
    for (const name of DIRECTIONS) {
      if (LEARNED_DIRECTIONS[name].some((key) => inputDown(gamepad, buttons[key], false))) {
        pressed.add(name)
      }
    }
    return pressed
  }
  const list = gamepad.buttons || []
  for (const name of DIRECTIONS) {
    if (isDown(list[DPAD[name]], false)) {
      pressed.add(name)
    }
  }
  const axes = gamepad.axes || []
  const x = axes[0] || 0
  const y = axes[1] || 0
  if (x < -AXIS_THRESHOLD) {
    pressed.add('left')
  }
  if (x > AXIS_THRESHOLD) {
    pressed.add('right')
  }
  if (y < -AXIS_THRESHOLD) {
    pressed.add('up')
  }
  if (y > AXIS_THRESHOLD) {
    pressed.add('down')
  }
  return pressed
}

/** Indici dei tasti grezzi premuti (per l'assegnazione dei tasti nelle Impostazioni). */
export function rawPressed(gamepad) {
  const result = []
  const list = (gamepad && gamepad.buttons) || []
  for (let index = 0; index < list.length; index += 1) {
    const button = list[index]
    if (button && (button.pressed || button.value > TRIGGER_THRESHOLD)) {
      result.push(index)
    }
  }
  return result
}

/** Assi oltre la soglia, come token `+N` / `-N` (per l'apprendimento della croce e delle levette). */
export function rawAxes(gamepad) {
  const result = []
  const axes = (gamepad && gamepad.axes) || []
  axes.forEach((value, index) => {
    if (value > AXIS_THRESHOLD) {
      result.push(`+${index}`)
    } else if (value < -AXIS_THRESHOLD) {
      result.push(`-${index}`)
    }
  })
  return result
}

/** Stato iniziale per `diff`: nessun tasto premuto. */
export function initialPadState() {
  return { pressed: new Set(), repeatAt: {} }
}

/** Istante della prossima ripetizione di una direzione premuta a `now`. */
export function firstRepeat(now) {
  return now + REPEAT_DELAY
}

/**
 * Confronta lo stato precedente con i tasti premuti ora (`next`) al tempo
 * `now` (ms). Restituisce `{ state, events }`: `press` per i tasti nuovi,
 * `release` per quelli rilasciati, `repeat` per le direzioni tenute premute
 * (dopo 350 ms, poi ogni 90 ms).
 */
export function diff(prev, next, now) {
  const events = []
  const repeatAt = {}
  for (const button of prev.pressed) {
    if (!next.has(button)) {
      events.push({ button, kind: 'release' })
    }
  }
  for (const button of next) {
    const isDirection = DIRECTIONS.includes(button)
    if (!prev.pressed.has(button)) {
      events.push({ button, kind: 'press' })
      if (isDirection) {
        repeatAt[button] = firstRepeat(now)
      }
    } else if (isDirection) {
      let at = prev.repeatAt[button]
      if (at === undefined) {
        at = firstRepeat(now)
      } else if (now >= at) {
        events.push({ button, kind: 'repeat' })
        at = now + REPEAT_INTERVAL
      }
      repeatAt[button] = at
    }
  }
  return { state: { pressed: new Set(next), repeatAt }, events }
}
