/**
 * Logica pura della configurazione di un joypad (src/components/JoypadSetup.jsx).
 * I tasti arrivano dal backend come token letti con SDL2, come li legge
 * RetroArch (backend/pixelarcade/joypads.py): `b3` pulsante, `+4`/`-1` asse,
 * `h0up` cappello. Nello stesso momento la dashboard vede lo stesso tasto
 * con la Gamepad API: le due letture si abbinano (`linkToken`, `linkPress`)
 * per ricavare i tasti della dashboard di quel joypad.
 */

/**
 * Tasti del RetroPad nell'ordine in cui si chiedono. `face` e `shoulder`
 * scelgono l'icona; i tasti `optional` si possono saltare se il joypad non li
 * ha. In fondo le levette (`stick`): si possono saltare tutte insieme con
 * START, perché non tutti i joypad le hanno.
 */
export const SETUP_STEPS = [
  { key: 'b', title: 'Tasto in basso', note: '✕ · A', face: 'south' },
  { key: 'a', title: 'Tasto a destra', note: '○ · B', face: 'east' },
  { key: 'y', title: 'Tasto a sinistra', note: '□ · X', face: 'west', optional: true },
  { key: 'x', title: 'Tasto in alto', note: '△ · Y', face: 'north', optional: true },
  { key: 'l', title: 'Dorsale sinistro', note: 'L1 · LB', shoulder: 'lb', optional: true },
  { key: 'r', title: 'Dorsale destro', note: 'R1 · RB', shoulder: 'rb', optional: true },
  { key: 'l2', title: 'Grilletto sinistro', note: 'L2 · LT', shoulder: 'lt', optional: true },
  { key: 'r2', title: 'Grilletto destro', note: 'R2 · RT', shoulder: 'rt', optional: true },
  { key: 'select', title: 'SELECT', note: 'Select · Back' },
  { key: 'start', title: 'START', note: 'Start' },
  { key: 'up', title: 'Croce su', note: '' },
  { key: 'down', title: 'Croce giù', note: '' },
  { key: 'left', title: 'Croce sinistra', note: '' },
  { key: 'right', title: 'Croce destra', note: '' },
  { key: 'l3', title: 'Levetta sinistra premuta', note: 'L3', optional: true, stick: true },
  { key: 'r3', title: 'Levetta destra premuta', note: 'R3', optional: true, stick: true },
  { key: 'l_y_minus', title: 'Levetta sinistra su', note: 'Spingila fino in fondo', optional: true, stick: true },
  { key: 'l_y_plus', title: 'Levetta sinistra giù', note: 'Spingila fino in fondo', optional: true, stick: true },
  { key: 'l_x_minus', title: 'Levetta sinistra a sinistra', note: 'Spingila fino in fondo', optional: true, stick: true },
  { key: 'l_x_plus', title: 'Levetta sinistra a destra', note: 'Spingila fino in fondo', optional: true, stick: true },
  { key: 'r_y_minus', title: 'Levetta destra su', note: 'Spingila fino in fondo', optional: true, stick: true },
  { key: 'r_y_plus', title: 'Levetta destra giù', note: 'Spingila fino in fondo', optional: true, stick: true },
  { key: 'r_x_minus', title: 'Levetta destra a sinistra', note: 'Spingila fino in fondo', optional: true, stick: true },
  { key: 'r_x_plus', title: 'Levetta destra a destra', note: 'Spingila fino in fondo', optional: true, stick: true },
]

const TITLES = Object.fromEntries(SETUP_STEPS.map((step) => [step.key, step.title]))

/**
 * Tasto della dashboard (src/input/mapping.js) di ogni tasto del RetroPad: in
 * basso conferma, a destra indietro; croce e levetta sinistra spostano.
 */
export const DASHBOARD_KEYS = {
  b: 'a',
  a: 'b',
  y: 'x',
  x: 'y',
  l: 'lb',
  r: 'rb',
  l2: 'lt',
  r2: 'rt',
  select: 'select',
  start: 'start',
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  l_y_minus: 'ls_up',
  l_y_plus: 'ls_down',
  l_x_minus: 'ls_left',
  l_x_plus: 'ls_right',
}

/** Passi senza RetroArch: solo i tasti che servono alla dashboard. */
export const PAD_STEPS = SETUP_STEPS.filter((step) => DASHBOARD_KEYS[step.key])

// Tasti della dashboard senza i quali un joypad non la comanda (come il backend).
const DASHBOARD_REQUIRED = ['a', 'b', 'select', 'start']

// Tempo massimo (ms) tra la lettura di RetroArch e quella del browser dello stesso tasto.
export const LINK_MS = 1000

/** Stato iniziale della procedura. */
export function initialSetup() {
  return { step: 0, binds: {}, message: '' }
}

/** Vero quando tutti i passi `steps` sono stati chiesti. */
export function setupDone(setup, steps = SETUP_STEPS) {
  return setup.step >= steps.length
}

/**
 * Applica il token `token` premuto al passo corrente. Ripremere il tasto in
 * basso (il primo imparato) salta un tasto facoltativo; START tra le levette
 * le salta tutte e finisce; un tasto già usato viene rifiutato con un messaggio.
 */
export function setupPress(setup, token, steps = SETUP_STEPS) {
  if (setupDone(setup, steps)) {
    return setup
  }
  const current = steps[setup.step]
  if (current.stick && setup.binds.start && token === setup.binds.start) {
    return { ...setup, step: steps.length, message: 'Levette saltate.' }
  }
  const skip = setup.binds.b && token === setup.binds.b && current.key !== 'b'
  if (skip) {
    if (!current.optional) {
      return { ...setup, message: `${current.title} è obbligatorio: premi il tasto giusto.` }
    }
    return { ...setup, step: setup.step + 1, message: `${current.title} saltato.` }
  }
  const used = Object.keys(setup.binds).find((key) => setup.binds[key] === token)
  if (used) {
    return { ...setup, message: `Tasto già usato per ${TITLES[used]}.` }
  }
  return { step: setup.step + 1, binds: { ...setup.binds, [current.key]: token }, message: '' }
}

/** Token attuali di un autoconfig (`binds` di `GET /api/joypads`, `{tasto: [token]}`): il primo di ogni tasto. */
export function currentBinds(deviceBinds) {
  const binds = {}
  for (const [key, tokens] of Object.entries(deviceBinds || {})) {
    if (Array.isArray(tokens) && tokens.length) {
      binds[key] = tokens[0]
    }
  }
  return binds
}

/**
 * Cambia un solo tasto: `{binds}` con `key` sul token `token`, `{same: true}`
 * se il tasto era già quello, `{error}` se il token è di un altro tasto.
 */
export function replaceBind(binds, key, token) {
  if (binds[key] === token) {
    return { same: true }
  }
  const used = Object.keys(binds).find((other) => other !== key && binds[other] === token)
  if (used) {
    return { error: `Tasto già usato per ${TITLES[used]}.` }
  }
  return { binds: { ...binds, [key]: token } }
}

/**
 * Tasti della dashboard `buttons` con il tasto del RetroPad `key` sul tasto
 * del browser `input`; un altro tasto che lo usava lo perde. `buttons`
 * invariato se `key` non serve alla dashboard.
 */
export function replaceDashboard(buttons, key, input) {
  const name = DASHBOARD_KEYS[key]
  if (!name) {
    return buttons
  }
  const next = {}
  for (const [other, value] of Object.entries(buttons || {})) {
    if (value !== input) {
      next[other] = value
    }
  }
  return { ...next, [name]: input }
}

/** Torna al tasto precedente, dimenticandolo. */
export function setupBack(setup, steps = SETUP_STEPS) {
  if (setup.step === 0) {
    return setup
  }
  const step = setup.step - 1
  const binds = { ...setup.binds }
  delete binds[steps[step].key]
  return { step, binds, message: '' }
}

/** Token di un tasto letto con la Gamepad API, quando RetroArch non legge i joypad. */
export function chromeToken(index) {
  return `b${index}`
}

/** Abbinamento iniziale: nessun tasto del browser ancora legato al RetroPad. */
export function initialLink() {
  return { chrome: {}, last: null, waiting: null }
}

function linkUsed(link, input) {
  return Object.values(link.chrome).includes(input)
}

/**
 * Il browser ha visto premere il tasto `index` (pulsante, oppure asse come `+1`) al tempo `now`: se RetroArch
 * aveva appena imparato un tasto senza abbinamento, il tasto è suo;
 * altrimenti si ricorda per il prossimo tasto imparato. I tasti già
 * abbinati (per esempio quello che salta i facoltativi) non contano.
 */
export function linkPress(link, index, now) {
  if (linkUsed(link, index)) {
    return link
  }
  if (link.waiting && now - link.waiting.at <= LINK_MS) {
    return { chrome: { ...link.chrome, [link.waiting.key]: index }, last: null, waiting: null }
  }
  return { ...link, last: { index, at: now }, waiting: null }
}

/**
 * RetroArch ha imparato il tasto `key` del RetroPad al tempo `now`: prende
 * il tasto appena visto dal browser, oppure aspetta il prossimo. Con `key`
 * nullo (tasto saltato o rifiutato) o senza un tasto della dashboard
 * l'eventuale pressione in sospeso si dimentica.
 */
export function linkToken(link, key, now) {
  if (!key || !DASHBOARD_KEYS[key]) {
    return { ...link, last: null, waiting: null }
  }
  if (link.last && now - link.last.at <= LINK_MS) {
    return { chrome: { ...link.chrome, [key]: link.last.index }, last: null, waiting: null }
  }
  return { ...link, last: null, waiting: { key, at: now } }
}

/** Dimentica l'abbinamento del tasto `key` (passo annullato con «Indietro»). */
export function linkForget(link, key) {
  const chrome = { ...link.chrome }
  delete chrome[key]
  return { chrome, last: null, waiting: null }
}

/** Vero per un ingresso del browser: pulsante (intero) o asse in una direzione (`+1`). */
function isInput(value) {
  return Number.isInteger(value) || (typeof value === 'string' && /^[+-]\d{1,2}$/.test(value))
}

/** Tasti della dashboard (`{a: 0, up: '-1', …}`) dai tasti del browser abbinati al RetroPad (`{b: 0, …}`). */
export function dashboardButtons(chrome) {
  const buttons = {}
  for (const [key, input] of Object.entries(chrome || {})) {
    if (DASHBOARD_KEYS[key] && isInput(input)) {
      buttons[DASHBOARD_KEYS[key]] = input
    }
  }
  return buttons
}

/** Token di un ingresso del browser: `b<N>` per un pulsante, l'asse (`+1`) così com'è. */
export function inputToken(input) {
  return Number.isInteger(input) ? chromeToken(input) : input
}

/** Ingresso del browser di un token della procedura senza RetroArch, oppure `null`. */
export function tokenInput(token) {
  const match = /^b(\d+)$/.exec(String(token))
  if (match) {
    return Number(match[1])
  }
  return isInput(token) ? token : null
}

/** Tasti della dashboard dai token della procedura senza RetroArch (`b<N>`, `+1`). */
export function chromeButtons(binds) {
  const chrome = {}
  for (const [key, token] of Object.entries(binds || {})) {
    const input = tokenInput(token)
    if (input !== null) {
      chrome[key] = input
    }
  }
  return dashboardButtons(chrome)
}

/** Messaggio se ai tasti della dashboard `buttons` manca un tasto obbligatorio, altrimenti `null`. */
export function dashboardError(buttons) {
  const missing = DASHBOARD_REQUIRED.find((name) => !Number.isInteger(buttons[name]))
  if (!missing) {
    return null
  }
  const key = Object.keys(DASHBOARD_KEYS).find((retro) => DASHBOARD_KEYS[retro] === missing)
  return `La dashboard non ha letto «${TITLES[key]}»: annulla e ripeti la configurazione.`
}

/**
 * Id USB dal nome del joypad nella Gamepad API (Chrome: `… (Vendor: 0078
 * Product: 0006)`); `null` se il nome non li contiene.
 */
export function padIds(id) {
  const match = /Vendor:\s*([0-9a-f]{4})\s+Product:\s*([0-9a-f]{4})/i.exec(String(id || ''))
  return match ? { vendor: parseInt(match[1], 16), product: parseInt(match[2], 16) } : null
}

/** Joypad di RetroArch (`devices` di `GET /api/joypads`) con gli stessi id USB, oppure `null`. */
export function findDevice(devices, ids) {
  if (!ids) {
    return null
  }
  return (devices || []).find((device) => device.vendor === ids.vendor && device.product === ids.product) || null
}

/**
 * Joypad della Gamepad API (`gamepads`, come `navigator.getGamepads()`) con
 * gli stessi id USB del joypad di RetroArch `device`: `{index, id}`, oppure `null`.
 */
export function chromePadOf(gamepads, device) {
  for (const gamepad of gamepads || []) {
    const ids = gamepad && padIds(gamepad.id)
    if (ids && device && ids.vendor === device.vendor && ids.product === device.product) {
      return { index: gamepad.index, id: gamepad.id }
    }
  }
  return null
}

/**
 * Tasto del RetroPad che corrisponde a `token` nei tasti `binds`
 * (`{tasto: token}` della procedura oppure `{tasto: [token]}` di un autoconfig).
 */
export function retropadKey(binds, token) {
  for (const [key, value] of Object.entries(binds || {})) {
    if (Array.isArray(value) ? value.includes(token) : value === token) {
      return key
    }
  }
  return null
}

/** Etichetta di un token per l'utente: «tasto 3», «asse 1 −», «croce su». */
export function tokenLabel(token) {
  if (!token) {
    return '—'
  }
  if (token[0] === 'b') {
    return `tasto ${token.slice(1)}`
  }
  if (token[0] === 'h') {
    const dirs = { up: 'su', down: 'giù', left: 'sinistra', right: 'destra' }
    const match = /^h(\d)(\w+)$/.exec(token)
    return match ? `cappello ${match[1]} ${dirs[match[2]] || match[2]}` : token
  }
  return `asse ${token.slice(1)} ${token[0] === '+' ? '+' : '−'}`
}
