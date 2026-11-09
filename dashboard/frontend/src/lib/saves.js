/**
 * Modale «Salvataggi» (src/components/SavesModal.jsx): schede dei giocatori,
 * voci di ogni scheda e testi di conferma. Solo funzioni pure.
 *
 * I dati arrivano da `GET /api/saves/game`: `{accounts: [{id, slots: [{slot,
 * core, name, protected, updatedAt, thumb, loadable}]}]}`. Lo slot 0 è
 * «Riprendi», gli slot 1–9 sono quelli manuali.
 */
import { stepIndex } from '../input/wrap.js'
import { PLAYER_INFO, SLOTS } from '../state/players.js'

export const RESUME_SLOT = 0
export const MANUAL_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
export const NEW_GAME = 'new'
export const UNDO = 'undo'
// Voce di un salvataggio condiviso (`GET /api/saves/game`, `shared`).
export const SHARED = 'shared'
export const DELETE_ALL = 'deleteAll'
// Lunghezza massima del nome di uno slot (la stessa del servizio).
export const NAME_MAX = 20

/**
 * Schede della modale nell'ordine P1, P2: solo i giocatori con un profilo
 * (non ospiti) che hanno salvataggi del gioco. Ogni scheda è
 * `{key, tag, playerColor, account: {id, name, color}, slots}`. Se nessuno
 * ha salvataggi ma il gioco ha dei salvataggi condivisi (`shared`), c'è una
 * scheda sola per il primo giocatore collegato, anche ospite (`account.id`
 * nullo), con gli slot vuoti.
 */
export function saveTabs(players, accounts, shared = []) {
  const byId = new Map((accounts || []).map((entry) => [entry.id, entry.slots || []]))
  const tabs = []
  for (const key of SLOTS) {
    const user = players[key] && players[key].user
    if (!user || user.guest) {
      continue
    }
    const slots = byId.get(user.id) || []
    if (slots.length) {
      tabs.push({
        key,
        tag: PLAYER_INFO[key].tag,
        playerColor: PLAYER_INFO[key].color,
        account: { id: user.id, name: user.name, color: user.color },
        slots,
      })
    }
  }
  if (!tabs.length && shared && shared.length) {
    const key = SLOTS.find((entry) => players[entry] && players[entry].user) || SLOTS[0]
    const user = (players[key] && players[key].user) || null
    const color = PLAYER_INFO[key].color
    const account = user && !user.guest
      ? { id: user.id, name: user.name, color: user.color }
      : { id: null, name: (user && user.name) || 'Ospite', color }
    tabs.push({ key, tag: PLAYER_INFO[key].tag, playerColor: color, account, slots: [] })
  }
  return tabs
}

/** Indice della scheda dopo un passo nella direzione `dir` (-1, 1): sempre circolare, come nelle Impostazioni. */
export function stepTab(index, dir, count) {
  return stepIndex(index, dir, count, true)
}

function isProtected(save) {
  return Boolean(save && save.protected)
}

// All'avvio uno stato di un altro core non si sceglie; in partita sì, per sovrascriverlo.
// Come destinazione di una copia non si sceglie uno slot protetto.
function slotItem(slot, save, mode = 'start') {
  let disabled = false
  if (mode === 'start') {
    disabled = Boolean(save && !save.loadable)
  } else if (mode === 'copy') {
    disabled = isProtected(save)
  }
  return { id: `slot-${slot}`, kind: 'slot', slot, save, disabled }
}

/**
 * Voci di una scheda (`slots` del profilo).
 * - `start` (avvio del gioco): «Riprendi» se c'è, poi gli slot 1–9 occupati,
 *   poi «Nuova partita» e i salvataggi condivisi `shared` (`kind: 'shared'`,
 *   con `shared` = `{id, title, description}`).
 * - `game` (modale in partita): gli slot 1–9 tutti, vuoti compresi (`save`
 *   nullo), senza «Riprendi». Con `undo` vero, prima di tutti c'è
 *   «Annulla ultimo caricamento».
 * - `copy` (scelta dello slot di destinazione di una copia): gli slot 1–9
 *   dell'altro giocatore; quelli protetti non si scelgono.
 * - `profile` (gestione dal Profilo): «Riprendi» se c'è, poi gli slot 1–9
 *   occupati, tutti selezionabili, senza «Nuova partita».
 *
 * Ogni voce è `{id, kind: 'slot' | 'new' | 'undo', slot, save, disabled}`;
 * `disabled` è vero all'avvio per uno stato creato con un core diverso da
 * quello del gioco. In partita quello slot si sceglie lo stesso: si può
 * sovrascrivere.
 */
export function saveItems(slots, mode = 'start', { undo = false, shared = [] } = {}) {
  const bySlot = new Map((slots || []).map((save) => [save.slot, save]))
  if (mode === 'game' || mode === 'copy') {
    const items = MANUAL_SLOTS.map((slot) => slotItem(slot, bySlot.get(slot) || null, mode))
    return mode === 'game' && undo ? [{ id: UNDO, kind: UNDO, slot: null, save: null, disabled: false }, ...items] : items
  }
  const items = []
  for (const slot of [RESUME_SLOT, ...MANUAL_SLOTS]) {
    if (bySlot.has(slot)) {
      items.push(slotItem(slot, bySlot.get(slot), mode))
    }
  }
  if (mode !== 'profile') {
    items.push({ id: NEW_GAME, kind: 'new', slot: null, save: null, disabled: false })
  }
  if (mode === 'start') {
    for (const entry of shared || []) {
      items.push({ id: `shared-${entry.id}`, kind: SHARED, slot: null, save: null, shared: entry, disabled: false })
    }
  }
  return items
}

/**
 * Prima voce selezionabile (per il focus iniziale), oppure `null`.
 * «Annulla ultimo caricamento» non riceve il focus all'apertura: si parte dagli slot.
 */
export function firstEnabled(items) {
  const item = items.find((entry) => !entry.disabled && entry.kind !== UNDO)
  return item ? item.id : null
}

/** Titolo della voce: «Riprendi», il nome dello slot o «Slot N», «Nuova partita», «Annulla ultimo caricamento». */
export function itemLabel(item) {
  if (item.kind === 'new') {
    return 'Nuova partita'
  }
  if (item.kind === UNDO) {
    return 'Annulla ultimo caricamento'
  }
  if (item.kind === SHARED) {
    return item.shared.title
  }
  if (item.slot === RESUME_SLOT) {
    return 'Riprendi'
  }
  return (item.save && item.save.name) || `Slot ${item.slot}`
}

/** Nota di uno slot nato da un salvataggio condiviso: «Da «titolo»», oppure vuota. */
export function sharedNote(save) {
  if (!save || !save.shared) {
    return ''
  }
  return save.shared.title ? `Da «${save.shared.title}»` : 'Da un salvataggio condiviso eliminato'
}

/**
 * Nota sotto la voce: «Vuoto» per uno slot libero, «Protetto» per una
 * destinazione protetta, «Creato con <core>» per uno stato non caricabile,
 * «Da «titolo»» per uno slot nato da un salvataggio condiviso, la
 * descrizione per un salvataggio condiviso, altrimenti vuota.
 */
export function itemNote(item) {
  if (item.kind === UNDO) {
    return 'Torna a prima del caricamento'
  }
  if (item.kind === SHARED) {
    return item.shared.description || ''
  }
  if (item.kind === 'slot' && !item.save) {
    return 'Vuoto'
  }
  if (item.disabled && isProtected(item.save)) {
    return 'Protetto'
  }
  if (item.save && !item.save.loadable) {
    return `Creato con ${item.save.core}`
  }
  return sharedNote(item.save)
}

/** Data completa di un salvataggio, come «01/10/2026 alle 14:05»; vuota se la data non è leggibile. */
export function saveDate(iso) {
  const at = Date.parse(iso || '')
  if (Number.isNaN(at)) {
    return ''
  }
  const date = new Date(at)
  const day = date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  return `${day} alle ${time}`
}

// « «nome»» dello slot, oppure vuoto.
function quotedName(item) {
  return item.save && item.save.name ? ` «${item.save.name}»` : ''
}

// « del <data>» dello slot, oppure vuoto.
function when(item) {
  const date = saveDate(item.save && item.save.updatedAt)
  return date ? ` del ${date}` : ''
}

/** Domanda di conferma prima di avviare il gioco dalla voce scelta. */
export function confirmText(item) {
  if (item.kind === 'new') {
    return 'Iniziare una nuova partita?'
  }
  if (item.kind === SHARED) {
    return `Giocare con il salvataggio condiviso «${item.shared.title}»? Il tuo salvataggio resta com'è.`
  }
  if (item.slot === RESUME_SLOT) {
    return `Riprendere la partita${when(item)}?`
  }
  return `Caricare lo slot ${item.slot}${quotedName(item)}${when(item)}?`
}

const PROTECTED_SAVE = 'Slot protetto: togli la protezione per sovrascriverlo'
const PROTECTED_DELETE = 'Slot protetto: togli la protezione per eliminarlo'

function action(id, label, note = '', reason = '') {
  return { id, label, note, disabled: Boolean(reason), reason }
}

/** Motivo per cui lo stato di `save` non si avvia: creato con un altro core; vuoto se si avvia. */
export function playReason(save) {
  return save && !save.loadable ? `Creato con ${save.core}: non si carica con il core del gioco` : ''
}

/*
 * Voci del menu di uno slot nel Profilo: «Gioca da qui», poi per gli slot
 * 1–9 «Rinomina», «Proteggi» o «Togli protezione», «Elimina» e «Copia a…».
 * «Riprendi» ha solo «Gioca da qui» ed «Elimina». `context.play` e
 * `context.copy` sono i motivi per cui avvio e copia non sono disponibili
 * (vuoti se lo sono).
 */
function profileActions(item, context) {
  const { save } = item
  const locked = isProtected(save)
  const actions = [action('play', 'Gioca da qui', '', context.play || playReason(save))]
  if (item.slot !== RESUME_SLOT) {
    actions.push(action('rename', 'Rinomina', save.name || ''))
    actions.push(locked ? action('unprotect', 'Togli protezione') : action('protect', 'Proteggi'))
  }
  actions.push(action('delete', 'Elimina', locked ? 'Protetto' : '', locked ? PROTECTED_DELETE : ''))
  if (item.slot !== RESUME_SLOT) {
    actions.push(action('copy', 'Copia a…', '', context.copy || ''))
  }
  return actions
}

/**
 * Voci del menu di uno slot in partita (`PickerMenu`): «Salva qui» sempre,
 * «Carica» per uno stato caricabile, poi, per uno slot occupato,
 * «Rinomina», «Proteggi» o «Togli protezione», «Elimina» e, se
 * `context.other` è il profilo dell'altro giocatore (`{name}`),
 * «Copia a <nome>». Su uno slot protetto «Salva qui» ed «Elimina» sono
 * disattivate (`disabled`) e `reason` spiega perché.
 *
 * Con `context.mode` uguale a `profile` restituisce le voci del Profilo
 * (`profileActions`), dove la voce di uno slot è sempre occupata.
 */
export function slotActions(item, context = {}) {
  if (context.mode === 'profile') {
    return profileActions(item, context)
  }
  const { save } = item
  const locked = isProtected(save)
  let note = save ? 'Sovrascrive' : ''
  if (locked) {
    note = 'Protetto'
  }
  const actions = [action('save', 'Salva qui', note, locked ? PROTECTED_SAVE : '')]
  if (!save) {
    return actions
  }
  if (save.loadable) {
    actions.push(action('load', 'Carica'))
  }
  // Slot temporanei di un incontro di torneo: solo salvare e caricare.
  if (context.temp) {
    return actions
  }
  actions.push(action('rename', 'Rinomina', save.name || ''))
  actions.push(locked ? action('unprotect', 'Togli protezione') : action('protect', 'Proteggi'))
  actions.push(action('delete', 'Elimina', locked ? 'Protetto' : '', locked ? PROTECTED_DELETE : ''))
  if (context.other) {
    actions.push(action('copy', `Copia a ${context.other.name}`))
  }
  return actions
}

// «lo slot N» oppure «Riprendi».
function slotName(item) {
  return item.slot === RESUME_SLOT ? '«Riprendi»' : `lo slot ${item.slot}`
}

/**
 * Domanda di conferma in partita e nel Profilo per l'azione `action` sulla
 * voce `item`. `extra` porta i dati dell'azione: `name` (nuovo nome, già
 * ripulito con `cleanName`) per `rename`; `other` (`{name}`) e `target`
 * (voce dello slot di destinazione) per `copy`; `title` (titolo del gioco)
 * e `step` (1 o 2, la doppia conferma) per `deleteAll`.
 */
export function ingameConfirmText(action, item, extra = {}) {
  switch (action) {
    case 'load':
      return confirmText(item)
    case 'play':
      return `Avviare il gioco ${item.slot === RESUME_SLOT ? 'da «Riprendi»' : `dallo slot ${item.slot}`}${quotedName(item)}${when(item)}?`
    case DELETE_ALL:
      return extra.step === 2
        ? 'Confermi l\'eliminazione? Non si può annullare. Gli slot protetti restano.'
        : `Eliminare tutti i salvataggi di ${extra.title}?`
    case UNDO:
      return 'Annullare l\'ultimo caricamento e tornare a prima di esso?'
    case 'rename':
      return extra.name ? `Chiamare lo slot ${item.slot} «${extra.name}»?` : `Togliere il nome allo slot ${item.slot}?`
    case 'protect':
      return `Proteggere lo slot ${item.slot}${quotedName(item)}?`
    case 'unprotect':
      return `Togliere la protezione allo slot ${item.slot}${quotedName(item)}?`
    case 'delete':
      return `Eliminare ${slotName(item)}${quotedName(item)}${when(item)}?`
    case 'copy': {
      const { other, target } = extra
      if (target.save) {
        return `Sovrascrivere lo slot ${target.slot} di ${other.name}${when(target)} con lo slot ${item.slot}?`
      }
      return `Copiare lo slot ${item.slot}${quotedName(item)} nello slot ${target.slot} di ${other.name}?`
    }
    default:
      return item.save ? `Sovrascrivere lo slot ${item.slot}${when(item)}?` : `Salvare nello slot ${item.slot}?`
  }
}

/**
 * Testi della barra di stato (in partita e nel Profilo) per l'azione `action` sulla voce
 * `item`: `[durante, dopo]`. `extra` come in `ingameConfirmText`.
 */
export function ingameProgress(action, item, extra = {}) {
  const slot = item.slot
  switch (action) {
    case 'load':
      return [`Caricamento dello slot ${slot}…`, 'Ritorno al gioco…']
    case UNDO:
      return ['Annullamento del caricamento…', 'Ritorno al gioco…']
    case 'rename':
      return ['Rinomina…', extra.name ? `Slot ${slot} rinominato` : `Nome dello slot ${slot} tolto`]
    case 'protect':
      return ['Protezione…', `Slot ${slot} protetto`]
    case 'unprotect':
      return ['Protezione…', `Slot ${slot} senza protezione`]
    case 'delete':
      return ['Eliminazione…', slot === RESUME_SLOT ? '«Riprendi» eliminato' : `Slot ${slot} eliminato`]
    case DELETE_ALL:
      return ['Eliminazione…', extra.remaining ? 'Salvataggi eliminati, restano gli slot protetti' : 'Salvataggi eliminati']
    case 'copy':
      return ['Copia…', `Copiato nello slot ${extra.target.slot} di ${extra.other.name}`]
    default:
      return [`Salvataggio nello slot ${slot}…`, `Salvato nello slot ${slot}`]
  }
}

/**
 * Nome di uno slot come lo salva il servizio: senza caratteri di controllo
 * (categoria Unicode C), spazi ridotti, al massimo `NAME_MAX` caratteri.
 */
export function cleanName(value) {
  return String(value || '')
    .replace(/\p{C}/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
    .slice(0, NAME_MAX)
    .trimEnd()
}

/**
 * Scheda della modale in partita per il giocatore `slot` (`p1`/`p2`) con il
 * profilo `account` (`{id, name, color}`) e i suoi `slots` del gioco.
 */
export function ingameTab(slot, account, slots) {
  return {
    key: slot,
    tag: PLAYER_INFO[slot].tag,
    playerColor: PLAYER_INFO[slot].color,
    account: { id: account.id, name: account.name, color: account.color },
    slots: slots || [],
  }
}

/**
 * Scheda della modale nel Profilo (o della copia verso un profilo):
 * colori e nome del profilo `account` (`{id, name, color}`), senza la sigla
 * del giocatore.
 */
export function profileTab(account, slots) {
  return {
    key: `profile-${account.id}`,
    tag: '',
    playerColor: account.color,
    account: { id: account.id, name: account.name, color: account.color },
    slots: slots || [],
  }
}

/** Voci del menu «Copia a…»: gli altri profili (non `ownerId`), ognuno con il suo colore. */
export function copyTargets(accounts, ownerId) {
  return (accounts || [])
    .filter((account) => account.id !== ownerId)
    .map((account) => ({ id: account.id, label: account.name, color: account.color, note: '', disabled: false }))
}

/**
 * Partenza scelta nella scheda: `{account, slot}` (`resume` di `POST /api/launch`), `{shared}` per un
 * salvataggio condiviso, oppure `null` per «Nuova partita».
 */
export function launchResume(tab, item) {
  if (item && item.kind === SHARED) {
    return { shared: item.shared.id }
  }
  if (!tab || !item || item.kind !== 'slot' || !item.save) {
    return null
  }
  return { account: tab.account.id, slot: item.slot }
}

/** `onError` delle miniature: un'immagine che non si carica sparisce e resta il colore della copertina. */
export function hideBrokenImage(event) {
  event.currentTarget.style.visibility = 'hidden'
}

/** Nome del focus della scheda di un profilo (src/input/useFocusScope.js). */
export function focusScope(tab) {
  return `saves-${tab.account.id}`
}
