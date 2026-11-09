/**
 * Preferiti, preferenze e progressi dei giocatori (sprint 08, README §E, §H).
 * Funzioni pure usate dal reducer (src/state/reducer.js) e dalle viste.
 *
 * Le modifiche ai profili registrati sono ottimistiche: lo stato cambia
 * subito e l'operazione entra in `state.sync`; AppContext la invia al
 * backend e poi la conferma (`favoriteSynced`, `profileSynced`) o la annulla
 * (`syncFailed`). Per un ospite tutto resta nello stato locale, finché dura la
 * sessione.
 */
import { SLOTS } from './players.js'

export const GENRES = ['Platform', 'Avventura', 'Azione', 'GDR', 'Picchiaduro', 'Corse', 'Puzzle', 'Shooter', 'Run & Gun', 'Horror', 'Sport']
export const DIFFICULTIES = ['Facile', 'Normale', 'Difficile']
export const OPTIONS = [
  { id: 'crt', label: 'Filtro CRT' },
  { id: 'vib', label: 'Vibrazione joypad' },
]

/** Schede della pagina profilo, nell'ordine in cui LB/RB le fanno girare; `account` = solo profili registrati. */
export const PROFILE_TABS = [
  { id: 'overview', label: 'Panoramica' },
  { id: 'stats', label: 'Statistiche', account: true },
  { id: 'trophies', label: 'Trofei', account: true },
  { id: 'saves', label: 'Salvataggi', account: true },
  { id: 'wrapped', label: 'Wrapped', account: true },
  { id: 'challenges', label: 'Sfide', account: true },
  { id: 'prefs', label: 'Preferenze' },
]

/** Schede visibili: un ospite non ha storico, trofei, salvataggi né Wrapped. */
export function profileTabs(registered) {
  return registered ? PROFILE_TABS : PROFILE_TABS.filter((tab) => !tab.account)
}

export const NO_PLAYER_MESSAGE = 'Premi START per entrare e salvare i preferiti.'

/** Preferenze iniziali di un ospite (come un profilo appena creato). */
export function guestPrefs() {
  return { favorites: [], favConsole: null, genres: [], difficulty: 'Normale', opts: { crt: false, vib: true } }
}

/** Chiave di un gioco nelle API: `<system>/<id>`. */
export function gameKey(system, id) {
  return `${system}/${id}`
}

/** `<system>/<id>` → `{system, id}` (l'id può contenere `/`). */
export function splitKey(key) {
  const at = key.indexOf('/')
  return { system: key.slice(0, at), id: key.slice(at + 1) }
}

function findAccount(accounts, id) {
  return accounts.find((account) => account.id === id) || null
}

/**
 * Profilo dello slot come oggetto `account` (README §E), oppure `null` se lo
 * slot non ha un giocatore. Per un ospite: livello 1, titolo «Ospite»,
 * statistiche a zero e le preferenze locali.
 */
export function profileOf(state, slot) {
  const user = state.players[slot].user
  if (!user) {
    return null
  }
  if (user.guest) {
    return {
      ...guestPrefs(),
      ...user,
      level: 1,
      xp: 0,
      xpPercent: 0,
      title: 'Ospite',
      hours: 0,
      played: 0,
      sessions: 0,
      recent: [],
    }
  }
  return findAccount(state.accounts, user.id) || { ...guestPrefs(), ...user, level: 1, xpPercent: 0, title: 'Recluta', hours: 0, played: 0, sessions: 0, recent: [] }
}

/** Chiavi dei preferiti del giocatore dello slot (lista vuota senza giocatore). */
export function favoritesOf(state, slot) {
  const profile = profileOf(state, slot)
  return profile ? profile.favorites || [] : []
}

/** Vero se il gioco `key` è tra i preferiti del giocatore dello slot. */
export function isFavorite(state, slot, key) {
  return favoritesOf(state, slot).includes(key)
}

/** Slot che hanno quel gioco tra i preferiti, P1 per primo. */
export function favoriteSlots(state, key) {
  return SLOTS.filter((slot) => isFavorite(state, slot, key))
}

/** Vero se il giocatore dello slot ha attivato la vibrazione del joypad. */
export function vibrates(state, slot) {
  const profile = profileOf(state, slot)
  return Boolean(profile && profile.opts && profile.opts.vib)
}

/** Vero se P1 ha attivato il filtro CRT (righe di scansione sulla dashboard). */
export function crtOn(state) {
  const profile = profileOf(state, 'p1')
  return Boolean(profile && profile.opts && profile.opts.crt)
}

function withFavorite(list, key, on) {
  const rest = (list || []).filter((entry) => entry !== key)
  return on ? [key, ...rest] : rest
}

function updateAccount(accounts, id, change) {
  return accounts.map((account) => (account.id === id ? change(account) : account))
}

function updateUser(state, slot, patch) {
  const current = state.players[slot]
  return { ...state, players: { ...state.players, [slot]: { ...current, user: { ...current.user, ...patch } } } }
}

function nextSeq(state) {
  return (state.syncSeq || 0) + 1
}

// `on`: preferito aggiunto (vero) o tolto, per il suono (src/lib/sound.js).
function haptic(state, slot, seq, on) {
  return { ...state, haptic: { slot, seq, on } }
}

/** Applica una modifica di preferenze (`opts` si unisce a quelle esistenti). */
export function applyPatch(profile, patch) {
  const next = { ...profile, ...patch }
  if (patch.opts) {
    next.opts = { ...(profile.opts || {}), ...patch.opts }
  }
  return next
}

/**
 * Aggiunge o toglie il gioco `key` dai preferiti del giocatore dello slot
 * (Y). Restituisce `{state, message}`: `message` è l'avviso da mostrare se
 * lo slot non ha un giocatore.
 */
export function toggleFavorite(state, slot, key) {
  const user = state.players[slot] && state.players[slot].user
  if (!user) {
    return { state, message: NO_PLAYER_MESSAGE }
  }
  const on = !isFavorite(state, slot, key)
  const seq = nextSeq(state)
  if (user.guest) {
    const next = updateUser(state, slot, { favorites: withFavorite(user.favorites, key, on) })
    return { state: haptic({ ...next, syncSeq: seq }, slot, seq, on), message: null }
  }
  const accounts = updateAccount(state.accounts, user.id, (account) => ({ ...account, favorites: withFavorite(account.favorites, key, on) }))
  const sync = [...(state.sync || []), { seq, kind: 'favorite', account: user.id, key, on }]
  return { state: haptic({ ...state, accounts, sync, syncSeq: seq }, slot, seq, on), message: null }
}

/**
 * Modifica le preferenze del giocatore dello slot (`favConsole`, `genres`,
 * `difficulty`, `opts`, `color`). Per un profilo registrato l'operazione
 * conserva i valori precedenti (`before`) per poterla annullare.
 */
export function patchProfile(state, slot, patch) {
  const user = state.players[slot] && state.players[slot].user
  if (!user) {
    return state
  }
  if (user.guest) {
    return updateUser(state, slot, applyPatch({ ...guestPrefs(), ...user }, patch))
  }
  const account = findAccount(state.accounts, user.id)
  if (!account) {
    return state
  }
  const before = {}
  for (const name of Object.keys(patch)) {
    before[name] = name === 'opts' ? { ...account.opts } : account[name]
  }
  const seq = nextSeq(state)
  const accounts = updateAccount(state.accounts, user.id, (current) => applyPatch(current, patch))
  const sync = [...(state.sync || []), { seq, kind: 'patch', account: user.id, patch, before }]
  return { ...state, accounts, sync, syncSeq: seq }
}

// Rimette sopra i dati del server le operazioni ancora in attesa per quel profilo.
function reapply(account, pending) {
  return pending.reduce((current, op) => {
    if (op.account !== account.id) {
      return current
    }
    return op.kind === 'favorite'
      ? { ...current, favorites: withFavorite(current.favorites, op.key, op.on) }
      : applyPatch(current, op.patch)
  }, account)
}

function without(state, seq) {
  return (state.sync || []).filter((op) => op.seq !== seq)
}

/** Preferiti confermati dal backend (`POST /api/favorites`) con i riepiloghi dei giochi. */
export function favoriteSynced(state, seq, favorites, games) {
  const op = (state.sync || []).find((entry) => entry.seq === seq)
  const sync = without(state, seq)
  const next = { ...state, sync, profileGames: { ...(state.profileGames || {}), ...(games || {}) } }
  if (!op) {
    return next
  }
  next.accounts = updateAccount(state.accounts, op.account, (account) => reapply({ ...account, favorites }, sync))
  return next
}

/** Profilo aggiornato dal backend (`POST /api/profiles/update`). */
export function profileSynced(state, seq, account) {
  const sync = without(state, seq)
  const accounts = updateAccount(state.accounts, account.id, () => reapply(account, sync))
  return withSlotUsers({ ...state, sync, accounts })
}

/** Operazione rifiutata dal backend: la modifica ottimistica viene annullata. */
export function syncFailed(state, seq) {
  const op = (state.sync || []).find((entry) => entry.seq === seq)
  const sync = without(state, seq)
  if (!op) {
    return { ...state, sync }
  }
  const accounts = updateAccount(state.accounts, op.account, (account) => (
    op.kind === 'favorite'
      ? { ...account, favorites: withFavorite(account.favorites, op.key, !op.on) }
      : applyPatch(account, op.before)
  ))
  return withSlotUsers({ ...state, sync, accounts })
}

/**
 * Profili riletti da `GET /api/profiles`: le operazioni in attesa restano
 * applicate e gli slot aggiornano nome e colore.
 */
export function profilesLoaded(state, accounts, games) {
  const pending = state.sync || []
  const next = {
    ...state,
    accounts: (accounts || []).map((account) => reapply(account, pending)),
    profileGames: games ? { ...(state.profileGames || {}), ...games } : state.profileGames,
  }
  return withSlotUsers(next)
}

/** Nome e colore degli slot allineati ai profili (dopo un cambio di colore). */
export function withSlotUsers(state) {
  let players = state.players
  for (const slot of SLOTS) {
    const user = players[slot].user
    if (!user || user.guest) {
      continue
    }
    const account = findAccount(state.accounts, user.id)
    if (account && (account.name !== user.name || account.color !== user.color)) {
      players = { ...players, [slot]: { ...players[slot], user: { ...user, name: account.name, color: account.color } } }
    }
  }
  return players === state.players ? state : { ...state, players }
}

/** Riepilogo di un gioco per la pagina profilo: dalla libreria caricata, altrimenti da `GET /api/profiles`. */
export function gameSummary(state, key) {
  const { system, id } = splitKey(key)
  const known = state.systems.find((entry) => entry.id === system) || null
  const games = state.games[system]
  const game = games ? games.find((entry) => entry.id === id) : null
  const stored = (state.profileGames || {})[key] || null
  if (game) {
    const name = known ? known.name : (stored ? stored.systemName : system.toUpperCase())
    return { system, id, title: game.title, systemName: name, systemFull: name, metaId: game.metaId || null, cover: Boolean(game.cover), missing: false }
  }
  if (stored) {
    return stored
  }
  const name = known ? known.name : system.toUpperCase()
  return { system, id, title: id.replace(/\.[^.]+$/, ''), systemName: name, systemFull: name, metaId: null, cover: false, missing: !known }
}
