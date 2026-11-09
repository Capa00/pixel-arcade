/**
 * Giocatori P1/P2 (sprint 07, README §G): slot, finestre «Chi gioca?» e
 * instradamento degli eventi per giocatore. Funzioni pure, usate dal reducer
 * (src/state/reducer.js) e da App.
 *
 * Il primo joypad che preme START occupa P1, il secondo P2. Tastiera e mouse
 * (`pad` nullo) entrano senza joypad con F2 o col clic su uno slot. Se P1
 * esce, P2 diventa P1. Un joypad scollegato fa uscire il suo giocatore.
 */
export const SLOTS = ['p1', 'p2']

export const PLAYER_INFO = {
  p1: { tag: 'P1', label: 'Giocatore 1', color: '#ff5d73', guest: 'Ospite 1' },
  p2: { tag: 'P2', label: 'Giocatore 2', color: '#3ccfc4', guest: 'Ospite 2' },
}

// Gli 8 colori dei profili (come in backend/pixelarcade/profiles.py).
export const SWATCHES = ['#ff5d73', '#3ccfc4', '#f5c542', '#8fd46a', '#a48bff', '#ff9a52', '#5b93ff', '#f3f1f8']

export const GUEST_COLOR = '#d8d5e3'
export const NAME_MAX = 25
// Nome mostrato nell'anteprima e usato se il campo resta vuoto (come nella demo).
export const DEFAULT_NAME = 'NUOVO_PLAYER'

export const FULL_MESSAGE = 'Due giocatori già attivi'
export const JOIN_HINT = 'Premi START per entrare'

/** Slot vuoto: nessun giocatore, finestra chiusa. */
export function emptySlot(key) {
  return {
    joined: false,
    pad: null,
    padId: null,
    user: null,
    modal: false,
    step: 'choose',
    form: { name: '', color: PLAYER_INFO[key].color },
    error: null,
    saving: false,
  }
}

export const initialPlayers = { p1: emptySlot('p1'), p2: emptySlot('p2') }

/** Nome come nel backend: senza spazi ai bordi, maiuscolo, spazi → `_`, solo `A-Z 0-9 _ . -`, al massimo `NAME_MAX` (25) caratteri. */
export function normalizeName(text) {
  return String(text || '')
    .trim()
    .toUpperCase()
    .replace(/\s/g, '_')
    .replace(/[^A-Z0-9_.-]/g, '')
    .slice(0, NAME_MAX)
}

function hasPad(pad) {
  return pad !== null && pad !== undefined
}

/**
 * Vero se l'evento può comandare la tastiera a schermo: quella aperta da un
 * joypad risponde solo a quel joypad; tastiera fisica e mouse (`pad` nullo)
 * la comandano sempre.
 */
export function ownsKeyboard(osk, event) {
  return !hasPad(osk.owner) || !hasPad(event.pad) || event.pad === osk.owner
}

/** Slot (`p1`/`p2`) del joypad `pad`, oppure `null`. */
export function slotOfPad(players, pad) {
  if (!hasPad(pad)) {
    return null
  }
  return SLOTS.find((key) => players[key].joined && players[key].pad === pad) || null
}

/**
 * Giocatore (`p1`/`p2`) dell'evento: lo slot del joypad; tastiera e mouse
 * valgono per lo slot entrato senza joypad, poi per P1. `null` se nessuno.
 */
export function eventSlot(players, event) {
  if (hasPad(event.pad)) {
    return slotOfPad(players, event.pad)
  }
  const own = SLOTS.find((key) => players[key].joined && !hasPad(players[key].pad))
  return own || (players.p1.joined ? 'p1' : null)
}

/** Primo slot libero, oppure `null`. */
export function freeSlot(players) {
  return SLOTS.find((key) => !players[key].joined) || null
}

/** Vero se almeno una finestra «Chi gioca?» è aperta. */
export function anyModal(players) {
  return SLOTS.some((key) => players[key].modal)
}

/**
 * Joypad che comanda libreria e Impostazioni: quello di P1, oppure quello di
 * P2 se P1 è entrato senza joypad; `null` se nessuno.
 */
export function leaderPad(players) {
  for (const key of SLOTS) {
    const slot = players[key]
    if (slot.joined && hasPad(slot.pad)) {
      return slot.pad
    }
  }
  return null
}

/** Finestra comandata da tastiera e mouse: quella dello slot senza joypad, poi P1, poi P2. */
export function keyboardModal(players) {
  const own = SLOTS.find((key) => players[key].modal && !hasPad(players[key].pad))
  return own || SLOTS.find((key) => players[key].modal) || null
}

function update(players, key, patch) {
  return { ...players, [key]: { ...players[key], ...patch } }
}

function join(players, key, pad, padId) {
  const slot = emptySlot(key)
  const withPad = hasPad(pad)
  return {
    ...players,
    [key]: {
      ...slot,
      joined: true,
      pad: withPad ? pad : null,
      padId: withPad && padId ? padId : null,
      modal: true,
    },
  }
}

/** Riapre la finestra dello slot sulla scelta del profilo (cambio profilo). */
export function openModal(players, key) {
  return update(players, key, { modal: true, step: 'choose', error: null })
}

/**
 * START (o F2, con `pad` nullo). Un joypad già entrato riapre la sua
 * finestra; uno libero occupa il primo slot libero, ricordando il suo id
 * (`padId`). Tastiera e mouse riaprono o occupano P1. Restituisce `null` se
 * entrambi gli slot sono occupati.
 */
export function pressStart(players, pad, padId = null) {
  if (!hasPad(pad)) {
    return players.p1.joined ? openModal(players, 'p1') : join(players, 'p1', null)
  }
  const own = slotOfPad(players, pad)
  if (own) {
    return openModal(players, own)
  }
  const key = freeSlot(players)
  return key ? join(players, key, pad, padId) : null
}

/** Clic su uno slot: occupato → riapre la sua finestra; vuoto → entra senza joypad nel primo slot libero. */
export function clickSlot(players, key) {
  if (players[key].joined) {
    return openModal(players, key)
  }
  const free = freeSlot(players)
  return free ? join(players, free, null) : players
}

/** Libera lo slot; se esce P1, P2 diventa P1 con profilo, joypad e finestra. */
export function leave(players, key) {
  if (key === 'p1' && players.p2.joined) {
    const moved = { ...players.p2, form: { ...players.p2.form } }
    return { p1: moved, p2: emptySlot('p2') }
  }
  return { ...players, [key]: emptySlot(key) }
}

/** Chiude la finestra: con un profilo resta nello slot, altrimenti lo slot si libera. */
export function closeModal(players, key) {
  if (!players[key].user) {
    return leave(players, key)
  }
  return update(players, key, { modal: false, step: 'choose', error: null })
}

/** Profilo scelto (`account` dell'API): la finestra si chiude. */
export function login(players, key, account) {
  const user = { id: account.id, name: account.name, color: account.color, guest: false }
  return update(players, key, { user, modal: false, step: 'choose', error: null, saving: false })
}

/** Accesso come ospite: nulla viene salvato. */
export function guest(players, key) {
  const user = { id: null, name: PLAYER_INFO[key].guest, color: GUEST_COLOR, guest: true }
  return update(players, key, { user, modal: false, step: 'choose', error: null })
}

/** Passa a «Nuovo profilo» (`new`) o torna a «Chi gioca?» (`choose`). */
export function setStep(players, key, step) {
  return update(players, key, { step, error: null })
}

/** Modifica il modulo del nuovo profilo (`name`, `color`). */
export function setForm(players, key, patch) {
  return update(players, key, { form: { ...players[key].form, ...patch }, error: null })
}

/** Profilo appena creato: entra nello slot e il nome del modulo si svuota. */
export function created(players, key, account) {
  const next = login(players, key, account)
  return update(next, key, { form: { ...next[key].form, name: '' } })
}

export function saving(players, key) {
  return update(players, key, { saving: true, error: null })
}

export function failed(players, key, message) {
  return update(players, key, { saving: false, error: message })
}

/**
 * Joypad visibili (`pads`, `[{index, id}]` della Gamepad API): il giocatore
 * di un joypad scollegato esce, anche con un profilo. Il joypad di uno slot
 * si riconosce anche dall'id: un altro joypad collegato con lo stesso indice
 * non prende il posto del precedente.
 */
export function padsChanged(players, pads) {
  const ids = new Map((pads || []).map((pad) => [pad.index, pad.id]))
  let next = players
  for (const key of ['p2', 'p1']) {
    const slot = next[key]
    if (!slot.joined || !hasPad(slot.pad)) {
      continue
    }
    const id = ids.get(slot.pad)
    if (id === undefined || (slot.padId !== null && slot.padId !== id)) {
      next = leave(next, key)
    } else if (slot.padId === null) {
      next = update(next, key, { padId: id })
    }
  }
  return next
}

/**
 * Slot dei due giocatori di un incontro di torneo: `users` (`[{id, name,
 * color}]`, lato P1 e lato P2) entrano con i joypad `pads` (e i loro id
 * `padIds`), senza finestre aperte.
 */
export function matchPlayers(users, pads, padIds = [null, null]) {
  const next = {}
  SLOTS.forEach((key, index) => {
    const user = users[index]
    next[key] = {
      ...emptySlot(key),
      joined: true,
      pad: hasPad(pads[index]) ? pads[index] : null,
      padId: hasPad(pads[index]) ? padIds[index] || null : null,
      user: { id: user.id, name: user.name, color: user.color, guest: false },
    }
  })
  return next
}

/** Giocatori con un profilo o ospiti: `[{key, user}]`, P1 per primo. */
export function activeUsers(players) {
  return SLOTS.filter((key) => players[key].user).map((key) => ({ key, user: players[key].user }))
}

/** `players` di `POST /api/launch`: id dei profili, `null` per ospiti e slot vuoti. */
export function launchPlayers(players) {
  return SLOTS.map((key) => (players[key].user && !players[key].user.guest ? players[key].user.id : null))
}

/** `pads` di `POST /api/launch`: joypad dei giocatori entrati, `null` senza joypad. */
export function launchPads(players) {
  return SLOTS.map((key) => (players[key].user && hasPad(players[key].pad) ? players[key].pad : null))
}

/**
 * Giocatori `players` coi joypad `pads` (`[joypad P1, joypad P2]`) al posto
 * di quelli degli slot, per l'avvio: l'incontro di torneo assegna i joypad
 * ai lati senza toccare gli slot della dashboard. Un `null` lascia quello dello slot.
 */
export function withPads(players, pads) {
  const next = { ...players }
  SLOTS.forEach((key, index) => {
    if (pads && hasPad(pads[index])) {
      next[key] = { ...players[key], pad: pads[index] }
    }
  })
  return next
}

// Produttore e modello nel nome di un joypad di Chrome: «… (Vendor: 0079 Product: 0006)».
const PAD_MODEL = /Vendor: ([0-9a-f]{4}) Product: ([0-9a-f]{4})/i

/**
 * `padModels` di `POST /api/launch`: modello dei joypad dei giocatori
 * (`{vendor, product, rank}`, `rank` = posizione tra i joypad collegati dello
 * stesso modello, in ordine di indice), `null` senza joypad o senza modello
 * nel nome. `gamepads` è `navigator.getGamepads()`. Il backend ritrova così il
 * joypad tra quelli di RetroArch, che li numera in modo indipendente da Chrome.
 */
export function launchPadModels(players, gamepads) {
  const list = Array.from(gamepads || [])
  const model = (pad) => {
    const match = pad && PAD_MODEL.exec(pad.id || '')
    return match ? { vendor: parseInt(match[1], 16), product: parseInt(match[2], 16) } : null
  }
  return SLOTS.map((key) => {
    const slot = players[key]
    const own = slot.user && hasPad(slot.pad) ? model(list[slot.pad]) : null
    if (!own) {
      return null
    }
    const rank = list.slice(0, slot.pad).filter((pad) => {
      const other = model(pad)
      return other && other.vendor === own.vendor && other.product === own.product
    }).length
    return { ...own, rank }
  })
}

/** Riga dei giocatori nella schermata di avvio: «NOME1 vs NOME2», «NOME1 · 1 giocatore» o vuota. */
export function versusLabel(players) {
  const [first, second] = activeUsers(players)
  if (!first) {
    return ''
  }
  return second ? `${first.user.name}  vs  ${second.user.name}` : `${first.user.name} · 1 giocatore`
}

/**
 * Dove va l'evento `event` (README §G). Restituisce:
 * - `{to: 'app'}`: flusso normale (livello di gioco, Impostazioni, profilo o
 *   libreria); la pagina profilo risponde solo al joypad del suo giocatore,
 *   più tastiera e mouse;
 * - `{to: 'start'}`: START di un joypad (o F2) nella libreria → `pressStart`;
 * - `{to: 'modal', slot}`: finestra «Chi gioca?» di quello slot;
 * - `{to: 'follower'}`: joypad di un giocatore che non comanda la libreria
 *   (solo il livello di gioco può usarlo);
 * - `{to: 'blocked'}`: joypad non entrato (con `hint` alla pressione);
 * - `{to: 'ignore'}`.
 */
export function gate(state, event) {
  const { players } = state
  const fromPad = hasPad(event.pad)
  const press = event.kind === 'press'
  if (state.osk && ownsKeyboard(state.osk, event)) {
    return { to: 'app' }
  }
  const library = state.view === 'library' && !state.osk && !(state.run && state.run.running)
  const startPress = press && event.button === 'start' && library
  const own = fromPad ? slotOfPad(players, event.pad) : null
  if (fromPad && !own) {
    if (startPress) {
      return { to: 'start' }
    }
    return { to: 'blocked', hint: press }
  }
  const modal = fromPad ? (players[own].modal ? own : null) : keyboardModal(players)
  if (modal) {
    return { to: 'modal', slot: modal }
  }
  if (state.osk) {
    return { to: 'ignore' }
  }
  if (startPress) {
    return { to: 'start' }
  }
  if (anyModal(players)) {
    return { to: 'ignore' }
  }
  if (state.view === 'profile') {
    return !fromPad || own === state.profileSlot ? { to: 'app' } : { to: 'follower' }
  }
  if (fromPad && event.pad !== leaderPad(players)) {
    return { to: 'follower' }
  }
  return { to: 'app' }
}
