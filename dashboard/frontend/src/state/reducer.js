/**
 * Stato globale dell'app: reducer puro e selettori.
 * Le azioni sono in actions.js; i caricamenti asincroni in AppContext.jsx.
 */
import * as A from './actions.js'
import { DEFAULT_QUIT_COMBO } from '../input/quitCombo.js'
import { DEFAULT_RESCUE_COMBO } from '../input/rescueCombo.js'
import { DEFAULT_SAVE_COMBO } from '../input/saveCombo.js'
import { route } from '../input/controller.js'
import { stepIndex } from '../input/wrap.js'
import { filterGames, jumpIndex, letterIndex } from '../lib/search.js'
import { DEFAULT_CONTENT, DEFAULT_MINUTES } from '../lib/screensaver.js'
import { DEFAULT_LOGOUT } from '../lib/splash.js'
import { DEFAULT_SOUND } from '../lib/sound.js'
import { EMPTY_FILTERS, emptyValue, filterLibrary, libraryFiltered, prunePlaylists } from './libraryFilters.js'
import { stepImage } from '../lib/gameInfo.js'
import { START, clampPos, keyAt, keyChar, layout as oskLayout, move as oskMoveTo } from '../components/oskLayout.js'
import { applyField, settingsReducer } from './settings.js'
import * as P from './players.js'
import * as PR from './profiles.js'
import { ALL_CONSOLE, EMPTY_PREFS, normalizePrefs, rowSystems } from '../lib/consoleTabs.js'

export const initialState = {
  status: 'loading',
  error: null,
  systems: [],
  systemId: null,
  games: {},
  index: 0,
  columns: 8,
  // Tasti della dashboard di ogni joypad (`{id della Gamepad API: {a: 0, …}}`, src/input/mapping.js).
  padButtons: {},
  // Combinazione dei salvataggi in partita (`input.save_combo`, src/input/saveCombo.js).
  saveCombo: DEFAULT_SAVE_COMBO,
  // Combinazione di emergenza (`input.rescue_combo`, src/input/rescueCombo.js).
  rescueCombo: DEFAULT_RESCUE_COMBO,
  // Uscita dal gioco col joypad (`input.quit_combo`, src/input/quitCombo.js).
  quitCombo: DEFAULT_QUIT_COMBO,
  warnings: [],
  toast: null,
  // Notifiche in attesa (`showToast(…, queue = true)`), mostrate una dopo l'altra.
  toastQueue: [],
  // Testo della ricerca; filtra i giochi della console selezionata.
  query: '',
  // Filtri della libreria (src/state/libraryFilters.js): restano quando si cambia console.
  filters: EMPTY_FILTERS,
  // Pannello «Filtri» aperto (src/views/LibraryLayer.jsx).
  filtersOpen: false,
  // Playlist condivise (`GET /api/playlists`) e riepiloghi dei giochi aggiunti a mano.
  playlists: [],
  playlistGames: {},
  // Giochi già giocati dal profilo del P1: `{account, keys: Set}`, oppure `null`.
  played: null,
  // Menu «Playlist» del gioco selezionato: `{system, id}`, oppure `null`.
  playlistMenu: null,
  // Finestra «Comandi» del gioco selezionato: `{system, id, title}`, oppure `null`.
  controlsMenu: null,
  // Pagina «Configurazione» del gioco selezionato: `{system, id, title}`, oppure `null`.
  configMenu: null,
  // Menu «Altro» del gioco selezionato (core, comandi, configurazione, playlist): `{system, id}`, oppure `null`.
  moreMenu: null,
  // Tastiera a schermo aperta, oppure `null`.
  osk: null,
  // Ultimo testo della tastiera a schermo di un'estensione (`purpose` `extension`):
  // `{target, value}`, aggiornato a ogni modifica e all'annullamento (testo iniziale).
  extensionText: null,
  // Testo confermato con la tastiera a schermo aperta per `purpose` `text`
  // (per esempio il nome di uno slot): `{target, value}`. Torna `null` a ogni apertura.
  keyboardText: null,
  // Elemento con il focus per ogni ambito di navigazione spaziale.
  focus: {},
  // Vista mostrata: `library`, `settings` o `profile` (pagina profilo dello slot `profileSlot`).
  view: 'library',
  profileSlot: null,
  // Vista Impostazioni: originale e bozza (src/state/settings.js), `null` fuori dalla vista.
  settings: null,
  // Testo della ricerca nel menu aperto delle Impostazioni (tastiera a schermo `filter`).
  pickerFilter: '',
  // Stato della partita (`GET /api/run`).
  run: { running: false, phase: 'idle' },
  // Elemento con il focus nella sezione in alto (`cover`, `play`, `core`, `text`), `null` = griglia.
  heroFocus: null,
  // Immagine sulla copertina e vista accanto (`info` scheda, `text` descrizione) del gioco `key`
  // (`<console>/<id>`): un altro gioco riparte da copertina e scheda (vedi `heroView`).
  hero: { key: null, image: 'cover', panel: 'info' },
  // Ultima richiesta di scorrere la descrizione: `{dir, seq}`.
  heroScroll: { dir: 0, seq: 0 },
  // Ultima richiesta per il livello di gioco: `{kind, system, game, seq}`.
  request: null,
  // Schermata «Incontro» del torneo: `{tournament, match, account, saved}` (`account` = chi l'ha aperta, `saved` =
  // P1 e P2 di prima), oppure `null`.
  match: null,
  // Slot P1/P2 (src/state/players.js).
  players: P.initialPlayers,
  // Profili di `GET /api/profiles`.
  accounts: [],
  // Riepiloghi dei giochi citati da preferiti e recenti (`games` di `GET /api/profiles`).
  profileGames: {},
  // Modifiche ai profili in attesa del backend (src/state/profiles.js) e loro contatore.
  sync: [],
  syncSeq: 0,
  // Ultima richiesta di vibrazione: `{slot, seq}` (src/lib/haptics.js).
  haptic: null,
  // Gioco da selezionare quando arrivano i giochi della sua console: `{system, id}`.
  pendingGame: null,
  // Gioco prenotato dalla classifica di «Chi gioca?»: `{slot, system, id, title}` (si va lì quando lo slot entra).
  reservedGame: null,
  // Tema grafico salvato (`ui.theme`: `random` o un tema) e quello estratto all'avvio (src/lib/themes.js).
  theme: 'random',
  randomTheme: null,
  // Minuti senza comandi prima del salvaschermo (`ui.screensaver_minutes`, 0 = mai; src/lib/screensaver.js).
  screensaver: DEFAULT_MINUTES,
  // Cosa mostra il salvaschermo (`ui.screensaver_content`): `mixed`, `covers` o `games`.
  screensaverContent: DEFAULT_CONTENT,
  // Manifesto dei tornei di oggi nel salvaschermo (`ui.tournament_ads`).
  tournamentAds: true,
  // Minuti senza comandi prima che escano i profili e torni «PRESS START» (`ui.logout_minutes`, 0 = mai; src/lib/splash.js).
  logout: DEFAULT_LOGOUT,
  // Modalità dei colori salvata (`ui.mode`: `system`, `day` o `night`; src/lib/modes.js).
  mode: 'system',
  // Suoni della dashboard (`ui.sound`, `ui.sound_effects`, `ui.sound_music`; src/lib/sound.js).
  sound: DEFAULT_SOUND,
  // Wrapped aperto: `{account, period}` (`account` nullo = casa), oppure `null` (src/views/WrappedLayer.jsx).
  wrapped: null,
  // Dati iniziali delle estensioni (`addons` di `GET /api/bootstrap`): `{id: dati}`.
  addons: {},
  // Console delle estensioni, senza giochi (`[{id, name, accent, addon}]`, src/addons/registry.js).
  extraConsoles: [],
  // Console accese per tutti e scelte dei profili per la riga delle schede (src/lib/consoleTabs.js).
  consolePrefs: EMPTY_PREFS,
  // Console aperta dalla scheda TUTTE (BACK riporta lì), oppure `null`.
  fromAll: null,
}

/** Profilo che decide la riga delle schede: quello del P1, se non ospite; altrimenti `null`. */
export function rowAccount(state) {
  const user = state.players.p1.user
  return user && !user.guest ? user.id : null
}

/** Console preferita del profilo della riga (sempre nella sua riga), oppure `null`. */
export function rowFavorite(state) {
  if (rowAccount(state) === null) {
    return null
  }
  const profile = PR.profileOf(state, 'p1')
  return (profile && profile.favConsole) || null
}

/**
 * Schede della riga: le console dei giochi accese (Impostazioni e scelte del
 * profilo del P1) e, in coda, quelle delle estensioni (TUTTE, TOURNAMENT…).
 */
export function allConsoles(state) {
  const shown = rowSystems(state.systems, state.consolePrefs, rowAccount(state), rowFavorite(state))
  return state.extraConsoles.length ? [...shown, ...state.extraConsoles] : shown
}

/** Scheda evidenziata: la console selezionata, oppure TUTTE se è fuori dalla riga. */
export function activeTab(state) {
  const tabs = allConsoles(state)
  if (tabs.some((entry) => entry.id === state.systemId)) {
    return state.systemId
  }
  return tabs.some((entry) => entry.id === ALL_CONSOLE.id) ? ALL_CONSOLE.id : state.systemId
}

/** Vero se BACK nella griglia riporta alla scheda TUTTE (console aperta da lì o fuori dalla riga). */
export function backToAll(state) {
  if (state.systemId === ALL_CONSOLE.id || !state.extraConsoles.some((entry) => entry.id === ALL_CONSOLE.id)) {
    return false
  }
  return state.fromAll === state.systemId || activeTab(state) === ALL_CONSOLE.id
}

/** Prima console della riga, per la scelta iniziale. */
function firstConsole(state) {
  const shown = rowSystems(state.systems, state.consolePrefs, rowAccount(state), rowFavorite(state))
  const first = shown[0] || state.systems[0]
  return first ? first.id : null
}

/** Console di un'estensione selezionata, oppure `null` (su una console dei giochi). */
export function currentAddonConsole(state) {
  return state.extraConsoles.find((entry) => entry.id === state.systemId) || null
}

/** Vero se `id` è una console, dei giochi (anche fuori dalla riga) o di un'estensione. */
function knownConsole(state, id) {
  return state.systems.some((entry) => entry.id === id) || state.extraConsoles.some((entry) => entry.id === id)
}

/** Sistema dei giochi selezionato, oppure `null` (anche sulla console di un'estensione). */
export function currentSystem(state) {
  return state.systems.find((system) => system.id === state.systemId) || null
}

/** Tutti i giochi del sistema selezionato, oppure `null` se non ancora caricati. */
export function currentGames(state) {
  return state.games[state.systemId] || null
}

/** Giochi già giocati dal P1 (`Set` di chiavi `<system>/<id>`), se il P1 ha un profilo e sono arrivati; altrimenti `null`. */
export function playedKeys(state) {
  const user = state.players.p1.user
  const { played } = state
  if (!played || !user || user.guest || user.id !== played.account) {
    return null
  }
  return played.keys
}

/** Vero se i filtri della libreria (non la ricerca) restringono l'elenco. */
export function filtersActive(state) {
  return libraryFiltered(state.filters, playedKeys(state), state.playlists)
}

const filteredCache = new WeakMap()

/**
 * Giochi del sistema selezionato filtrati dalla ricerca (tutte le parole, in
 * titolo e file) e dai filtri della libreria, oppure `null` se non ancora
 * caricati. Memorizzato: stesso array finché giochi, ricerca, filtri,
 * playlist e giochi giocati non cambiano.
 */
export function filtered(state) {
  const games = currentGames(state)
  if (!games) {
    return null
  }
  const searched = filterGames(games, state.query)
  const played = playedKeys(state)
  const cached = filteredCache.get(searched)
  if (
    cached &&
    cached.system === state.systemId &&
    cached.filters === state.filters &&
    cached.played === played &&
    cached.playlists === state.playlists
  ) {
    return cached.result
  }
  const result = filterLibrary(searched, state.systemId, state.filters, played, state.playlists)
  filteredCache.set(searched, { system: state.systemId, filters: state.filters, played, playlists: state.playlists, result })
  return result
}

/** Gioco selezionato, oppure `null`. */
export function currentGame(state) {
  const games = filtered(state)
  return games ? games[state.index] || null : null
}

const HERO_DEFAULT = { image: 'cover', panel: 'info' }

/** Immagine sulla copertina e vista accanto per il gioco selezionato: `{image, panel}`. */
export function heroView(state) {
  const game = currentGame(state)
  if (!game || !state.hero || state.hero.key !== `${state.systemId}/${game.id}`) {
    return HERO_DEFAULT
  }
  return { image: state.hero.image, panel: state.hero.panel }
}

/** Stato con `patch` (`{image}` o `{panel}`) applicato alla vista del gioco selezionato. */
function withHeroView(state, patch) {
  const game = currentGame(state)
  if (!game) {
    return state
  }
  return { ...state, hero: { ...heroView(state), ...patch, key: `${state.systemId}/${game.id}` } }
}

/** Riga del gioco selezionato e numero di righe, a partire da 0. */
export function rowInfo(state) {
  const games = filtered(state)
  const count = games ? games.length : 0
  return {
    row: Math.floor(state.index / state.columns),
    rows: Math.ceil(count / state.columns),
  }
}

/** Iniziali con almeno un gioco tra quelli filtrati. */
export function presentLetters(state) {
  const games = filtered(state)
  return games ? new Set(letterIndex(games).keys()) : new Set()
}

function clampIndex(index, count) {
  return Math.max(0, Math.min(index, count - 1))
}

function withIndex(state, index) {
  return index === state.index ? state : { ...state, index }
}

/**
 * Selezione spostata di `dx` giochi o `dy` righe. Con `wrap` (pressione
 * singola) oltre il bordo si riparte dall'altro capo: in orizzontale dal
 * primo o dall'ultimo gioco, in verticale dalla stessa colonna della prima o
 * dell'ultima riga (se manca, dall'ultimo gioco).
 */
function move(state, dx, dy, wrap) {
  const games = filtered(state)
  const count = games ? games.length : 0
  if (!count) {
    return state
  }
  let index = state.index
  if (dx) {
    index = stepIndex(index, dx, count, wrap)
  }
  if (dy) {
    const { columns } = state
    const target = index + dy * columns
    const lastRow = Math.floor((count - 1) / columns)
    if (target >= 0 && target < count) {
      index = target
    } else if (dy > 0 && Math.floor(index / columns) < lastRow) {
      // Ultima riga incompleta: si va all'ultimo gioco.
      index = count - 1
    } else if (wrap) {
      const column = index % columns
      index = dy > 0 ? column : Math.min(lastRow * columns + column, count - 1)
    }
  }
  return withIndex(state, index)
}

function cycle(state, dir) {
  const consoles = allConsoles(state)
  const count = consoles.length
  if (count < 2) {
    return state
  }
  const at = consoles.findIndex((system) => system.id === activeTab(state))
  const next = consoles[(at + dir + count) % count]
  // Arrivando su TUTTE con L1/R1 si riparte dalle marche (`allBrand`, src/views/AllConsolesView.jsx).
  return { ...state, systemId: next.id, index: 0, fromAll: null, focus: { ...state.focus, allBrand: null } }
}

/**
 * Nuovo stato `next` (ricerca o filtri cambiati) con selezionato lo stesso
 * gioco di `state` se resta tra i risultati; altrimenti il primo.
 */
function keepSelection(state, next) {
  const game = currentGame(state)
  const games = filtered(next)
  const at = games && game ? games.indexOf(game) : -1
  return { ...next, index: at >= 0 ? at : 0 }
}

/** Cambia la ricerca mantenendo selezionato lo stesso gioco, se resta tra i risultati. */
function withQuery(state, query) {
  if (query === state.query) {
    return state
  }
  return keepSelection(state, { ...state, query })
}

/** Cambia i filtri della libreria mantenendo selezionato lo stesso gioco, se resta tra i risultati. */
function withFilters(state, filters) {
  if (filters === state.filters) {
    return state
  }
  return keepSelection(state, { ...state, filters })
}

/** Seleziona il gioco `id` della console `system` tenendo ricerca e filtri («Sorprendimi»). */
function showGame(state, system, id) {
  if (!state.systems.some((entry) => entry.id === system) || !state.games[system]) {
    return state
  }
  const next = { ...state, view: 'library', systemId: system, filtersOpen: false, pendingGame: null }
  const at = filtered(next).findIndex((game) => game.id === id)
  if (at < 0) {
    return state
  }
  return { ...next, index: at, heroFocus: 'play' }
}

/** Azioni dei filtri e delle playlist della libreria (src/state/libraryFilters.js). */
function filtersReducer(state, action) {
  switch (action.type) {
    case A.OPEN_FILTERS:
      return state.filtersOpen || state.view !== 'library' ? state : { ...state, filtersOpen: true, heroFocus: null }
    case A.CLOSE_FILTERS:
      return state.filtersOpen ? { ...state, filtersOpen: false } : state
    case A.SET_FILTER: {
      if (!(action.field in EMPTY_FILTERS)) {
        return state
      }
      const value = action.value === undefined || action.value === null ? emptyValue(action.field) : action.value
      return withFilters(state, { ...state.filters, [action.field]: value })
    }
    case A.RESET_FILTERS:
      return keepSelection(state, { ...state, filters: EMPTY_FILTERS, query: '' })
    case A.SHOW_GAME:
      return showGame(state, action.system, action.id)
    case A.PLAYLISTS_LOADED: {
      const playlists = action.playlists || []
      const next = { ...state, playlists, playlistGames: action.games || {} }
      return keepSelection(state, { ...next, filters: prunePlaylists(state.filters, playlists) })
    }
    case A.PLAYED_LOADED:
      return keepSelection(state, { ...state, played: { account: action.account, keys: new Set(action.keys || []) } })
    case A.OPEN_PLAYLIST_MENU: {
      const game = currentGame(state)
      return game ? { ...state, playlistMenu: { system: state.systemId, id: game.id } } : state
    }
    case A.CLOSE_PLAYLIST_MENU:
      return state.playlistMenu ? { ...state, playlistMenu: null } : state
    case A.OPEN_CONTROLS_MENU: {
      const game = currentGame(state)
      return game ? { ...state, controlsMenu: { system: state.systemId, id: game.id, title: game.title } } : state
    }
    case A.CLOSE_CONTROLS_MENU:
      return state.controlsMenu ? { ...state, controlsMenu: null } : state
    case A.OPEN_CONFIG_MENU: {
      const game = currentGame(state)
      return game ? { ...state, configMenu: { system: state.systemId, id: game.id, title: game.title } } : state
    }
    case A.CLOSE_CONFIG_MENU:
      return state.configMenu ? { ...state, configMenu: null } : state
    case A.OPEN_MORE_MENU: {
      const game = currentGame(state)
      return game ? { ...state, moreMenu: { system: state.systemId, id: game.id } } : state
    }
    case A.CLOSE_MORE_MENU:
      return state.moreMenu ? { ...state, moreMenu: null } : state
    default:
      return state
  }
}

/**
 * Nuovo stato della tastiera a schermo; per la ricerca, il filtro dei menu,
 * il nome di un nuovo profilo e le estensioni il risultato segue il testo.
 */
function withOsk(state, osk) {
  const next = { ...state, osk }
  if (osk.purpose === 'extension') {
    return { ...next, extensionText: { target: osk.target, value: osk.value } }
  }
  if (osk.purpose === 'filter') {
    return { ...next, pickerFilter: osk.value }
  }
  if (osk.purpose === 'profileName' && osk.target) {
    return { ...next, players: P.setForm(state.players, osk.target.slot, { name: P.normalizeName(osk.value) }) }
  }
  return osk.purpose === 'search' ? withQuery(next, osk.value) : next
}

function oskType(state, text) {
  const { osk } = state
  const room = osk.max - osk.value.length
  const chars = [...text].slice(0, Math.max(0, room)).join('')
  if (!chars) {
    return state
  }
  const value = osk.value.slice(0, osk.caret) + chars + osk.value.slice(osk.caret)
  return withOsk(state, { ...osk, value, caret: osk.caret + chars.length })
}

function oskErase(state) {
  const { osk } = state
  if (!osk.caret) {
    return state
  }
  const value = osk.value.slice(0, osk.caret - 1) + osk.value.slice(osk.caret)
  return withOsk(state, { ...osk, value, caret: osk.caret - 1 })
}

function oskConfirm(state) {
  const { osk } = state
  const next = { ...state, osk: null }
  if (osk.purpose === 'field' && osk.target) {
    next.settings = applyField(state.settings, osk.target, osk.value)
  }
  if (osk.purpose === 'text') {
    next.keyboardText = { target: osk.target, value: osk.value }
  }
  return next
}

function oskCancel(state) {
  const { osk } = state
  const next = { ...state, osk: null }
  if (osk.purpose === 'filter') {
    return { ...next, pickerFilter: osk.initial }
  }
  if (osk.purpose === 'extension') {
    return { ...next, extensionText: { target: osk.target, value: osk.initial } }
  }
  if (osk.purpose === 'profileName' && osk.target) {
    return { ...next, players: P.setForm(state.players, osk.target.slot, { name: P.normalizeName(osk.initial) }) }
  }
  return osk.purpose === 'search' ? withQuery(next, osk.initial) : next
}

/**
 * Nuovi slot dei giocatori. La tastiera a schermo del nome di un profilo si
 * chiude se la sua finestra non è più aperta o è passata a un altro joypad.
 */
function withPlayers(state, players) {
  if (players === state.players) {
    return state
  }
  const next = { ...state, players }
  if (state.view === 'profile' && !(players[state.profileSlot] && players[state.profileSlot].user)) {
    next.view = 'library'
    next.profileSlot = null
  }
  const { osk } = state
  if (osk && osk.purpose === 'profileName' && osk.target) {
    const slot = players[osk.target.slot]
    if (!slot.modal || slot.step !== 'new' || slot.pad !== osk.target.pad) {
      next.osk = null
    }
  }
  // Con il filtro Stato i risultati dipendono dal profilo del P1.
  return state.filters.played ? keepSelection(state, next) : next
}

function toast(state, message, variant = 'info', queue = false) {
  if (queue && state.toast) {
    return { ...state, toastQueue: [...state.toastQueue, { message, variant }] }
  }
  return { ...state, toast: { message, variant, id: (state.toast ? state.toast.id : 0) + 1 } }
}

function hideToast(state) {
  if (!state.toastQueue.length) {
    return { ...state, toast: null }
  }
  const [first, ...rest] = state.toastQueue
  return toast({ ...state, toastQueue: rest }, first.message, first.variant)
}

/** P1 entra con un profilo: la libreria passa alla sua console preferita, se esiste. */
function withFavoriteConsole(state, slot, account) {
  const id = account && account.favConsole
  if (slot !== 'p1' || !id || id === state.systemId || !state.systems.some((system) => system.id === id)) {
    return state
  }
  return { ...state, systemId: id, index: 0, heroFocus: null, query: '' }
}

/**
 * Indice del gioco `id` tra quelli mostrati in `state` (ricerca e filtri);
 * se i filtri lo nascondono si tolgono, così il gioco compare. Restituisce
 * `{state, index}` con `index` -1 se il gioco non c'è.
 */
function findShown(state, id) {
  let index = filtered(state).findIndex((game) => game.id === id)
  if (index < 0 && currentGames(state).some((game) => game.id === id)) {
    state = { ...state, filters: EMPTY_FILTERS }
    index = filtered(state).findIndex((game) => game.id === id)
  }
  return { state, index }
}

/** Seleziona nella libreria il gioco `id` della console `system`, subito o all'arrivo dei suoi giochi. */
function gotoGame(state, system, id) {
  if (!state.systems.some((entry) => entry.id === system)) {
    return toast(state, 'Console non più presente.', 'error')
  }
  const next = {
    ...state,
    view: 'library',
    profileSlot: null,
    systemId: system,
    query: '',
    heroFocus: null,
    osk: null,
    filtersOpen: false,
    playlistMenu: null,
    controlsMenu: null,
    configMenu: null,
    moreMenu: null,
  }
  const games = state.games[system]
  if (!games) {
    return { ...next, index: 0, pendingGame: { system, id } }
  }
  const shown = findShown(next, id)
  if (shown.index < 0) {
    return toast({ ...next, index: 0, pendingGame: null }, 'Gioco non più presente nella libreria.', 'error')
  }
  return { ...shown.state, index: shown.index, pendingGame: null }
}

/** Azioni su preferiti e preferenze (src/state/profiles.js). */
function profilesReducer(state, action) {
  switch (action.type) {
    case A.PROFILES_LOADED:
      return PR.profilesLoaded(state, action.accounts, action.games)
    case A.TOGGLE_FAVORITE: {
      let { system, id } = action
      if (!system) {
        const game = currentGame(state)
        if (!game) {
          return state
        }
        system = state.systemId
        id = game.id
      }
      const result = PR.toggleFavorite(state, action.slot, PR.gameKey(system, id))
      return result.message ? toast(result.state, result.message) : result.state
    }
    case A.FAVORITE_SYNCED:
      return PR.favoriteSynced(state, action.seq, action.favorites, action.games)
    case A.PATCH_PROFILE:
      return PR.patchProfile(state, action.slot, action.patch)
    case A.PROFILE_SYNCED:
      return PR.profileSynced(state, action.seq, action.account)
    case A.SYNC_FAILED:
      return toast(PR.syncFailed(state, action.seq), action.message || 'Modifica non salvata.', 'error')
    case A.OPEN_PROFILE:
      if (!state.players[action.slot] || !state.players[action.slot].user) {
        return state
      }
      return {
        ...state,
        view: 'profile',
        profileSlot: action.slot,
        heroFocus: null,
        filtersOpen: false,
        playlistMenu: null,
        controlsMenu: null,
        configMenu: null,
        moreMenu: null,
        settings: null,
        focus: { ...state.focus, profile: null },
      }
    case A.CLOSE_PROFILE:
      return state.view === 'profile' ? { ...state, view: 'library', profileSlot: null } : state
    case A.GOTO_GAME:
      return gotoGame(state, action.system, action.id)
    default:
      return state
  }
}

/**
 * Lo slot `slot` è appena entrato: se aveva prenotato un gioco dalla
 * classifica (e la sua finestra si è chiusa) la libreria va su «Gioca» di
 * quel gioco, oppure ci arriva quando i giochi della console sono caricati.
 */
function withReserved(state, slot) {
  const reserved = state.reservedGame
  if (!reserved || reserved.slot !== slot || state.players[slot].modal) {
    return state
  }
  const next = gotoGame({ ...state, reservedGame: null }, reserved.system, reserved.id)
  return next.pendingGame || !currentGame(next) || currentGame(next).id !== reserved.id ? next : { ...next, heroFocus: 'play' }
}

/** Azioni dei giocatori (src/state/players.js). */
function playersReducer(state, action) {
  const { players } = state
  switch (action.type) {
    case A.PRESS_START: {
      const next = P.pressStart(players, action.pad, action.padId)
      return next ? withPlayers(state, next) : toast(state, P.FULL_MESSAGE)
    }
    case A.CLICK_SLOT:
      return withPlayers(state, P.clickSlot(players, action.slot))
    case A.CLOSE_LOGIN:
      return withPlayers({ ...state, reservedGame: null }, P.closeModal(players, action.slot))
    case A.LEAVE_SLOT:
      return withPlayers({ ...state, reservedGame: null }, P.leave(players, action.slot))
    case A.RESERVE_GAME:
      return {
        ...state,
        reservedGame: action.system ? { slot: action.slot, system: action.system, id: action.id, title: action.title || action.id } : null,
      }
    case A.RESET_PLAYERS: {
      // Si torna alla libreria con tutto chiuso, come all'avvio.
      const closed = {
        ...state,
        view: 'library',
        profileSlot: null,
        settings: null,
        pickerFilter: '',
        osk: null,
        filtersOpen: false,
        playlistMenu: null,
        controlsMenu: null,
        configMenu: null,
        moreMenu: null,
        heroFocus: null,
        reservedGame: null,
      }
      return withPlayers(closed, P.initialPlayers)
    }
    case A.LOGIN: {
      const next = withPlayers(state, P.login(players, action.slot, action.account))
      return withReserved(withFavoriteConsole(next, action.slot, action.account), action.slot)
    }
    case A.LOGIN_GUEST:
      return withReserved(withPlayers(state, P.guest(players, action.slot)), action.slot)
    case A.LOGIN_STEP:
      return withPlayers(state, P.setStep(players, action.slot, action.step))
    case A.LOGIN_FORM:
      return withPlayers(state, P.setForm(players, action.slot, action.patch))
    case A.PROFILE_SAVING:
      return withPlayers(state, P.saving(players, action.slot))
    case A.PROFILE_FAILED:
      return withPlayers(state, P.failed(players, action.slot, action.message))
    case A.PROFILE_CREATED: {
      const known = state.accounts.some((account) => account.id === action.account.id)
      const accounts = known ? state.accounts : [...state.accounts, action.account]
      const next = withPlayers({ ...state, accounts }, P.created(players, action.slot, action.account))
      return withReserved(withFavoriteConsole(next, action.slot, action.account), action.slot)
    }
    case A.PADS_CHANGED:
      // Durante l'incontro gli slot sono dei due giocatori: un joypad scollegato non li fa uscire.
      return state.match ? state : withPlayers(state, P.padsChanged(players, action.pads))
    case A.MATCH_OPEN: {
      const saved = state.match ? state.match.saved : players
      const next = { ...state, match: { tournament: action.match.tournament, match: action.match.match, account: action.match.account ?? null, saved } }
      return withPlayers(next, P.matchPlayers(action.users, action.pads))
    }
    case A.MATCH_SIDES:
      if (!state.match) {
        return state
      }
      return withPlayers(state, P.matchPlayers(action.users, P.SLOTS.map((key) => players[key].pad),
        P.SLOTS.map((key) => players[key].padId)))
    case A.MATCH_CLOSE:
      if (!state.match) {
        return state
      }
      return withPlayers({ ...state, match: null }, state.match.saved)
    default:
      return state
  }
}

function oskPress(state, action) {
  let { osk } = state
  if (Number.isInteger(action.row) && Number.isInteger(action.col)) {
    if (!keyAt(action, oskLayout(osk))) {
      return state
    }
    osk = { ...osk, row: action.row, col: action.col }
    state = { ...state, osk }
  }
  const key = keyAt(osk, oskLayout(osk))
  switch (key.type) {
    case 'page': {
      const next = { ...osk, symbols: !osk.symbols }
      return { ...state, osk: { ...next, ...clampPos(next, oskLayout(next)) } }
    }
    case 'reveal':
      return { ...state, osk: { ...osk, reveal: !osk.reveal } }
    case 'char':
      return oskType(state, keyChar(key, osk.upper))
    case 'shift':
      return { ...state, osk: { ...osk, upper: !osk.upper } }
    case 'space':
      return oskType(state, ' ')
    case 'erase':
      return oskErase(state)
    case 'ok':
      return oskConfirm(state)
    default:
      return state
  }
}

/** Azioni della tastiera a schermo; ignorate se non è aperta. */
function oskReducer(state, action) {
  const { osk } = state
  switch (action.type) {
    case A.OSK_MOVE: {
      const pos = oskMoveTo(osk, action.dir, action.wrap, oskLayout(osk))
      return pos.row === osk.row && pos.col === osk.col ? state : { ...state, osk: { ...osk, ...pos } }
    }
    case A.OSK_FOCUS:
      if (!keyAt(action, oskLayout(osk)) || (action.row === osk.row && action.col === osk.col)) {
        return state
      }
      return { ...state, osk: { ...osk, row: action.row, col: action.col } }
    case A.OSK_PRESS:
      return oskPress(state, action)
    case A.OSK_TYPE:
      return oskType(state, action.text)
    case A.OSK_ERASE:
      return oskErase(state)
    case A.OSK_CARET: {
      // `start`/`end` (Home/Fine) oppure un carattere a sinistra/destra (`left`/`right`, LB/RB).
      const caret = {
        start: 0,
        end: osk.value.length,
        left: Math.max(0, osk.caret - 1),
        right: Math.min(osk.value.length, osk.caret + 1),
      }[action.to] ?? osk.caret
      return caret === osk.caret ? state : { ...state, osk: { ...osk, caret } }
    }
    case A.OSK_CONFIRM:
      return oskConfirm(state)
    case A.OSK_CANCEL:
      return oskCancel(state)
    default:
      return state
  }
}

/**
 * Reducer dell'app. Quando la selezione passa a un altro gioco, immagine e
 * vista della sezione in alto ripartono da copertina e scheda.
 */
export function reducer(state, action) {
  const next = baseReducer(state, action)
  if (next.hero.key === null || next === state) {
    return next
  }
  const game = currentGame(next)
  return game && next.hero.key === `${next.systemId}/${game.id}` ? next : { ...next, hero: initialState.hero }
}

function baseReducer(state, action) {
  switch (action.type) {
    case A.INPUT:
      return route(state, action.event).reduce(reducer, state)
    case A.BOOTSTRAP_LOADED: {
      const { systems, padButtons, saveCombo, rescueCombo, quitCombo, warnings, run, theme, mode, screensaver, screensaverContent, tournamentAds, logout, sound, addons, consoles } = action.data
      const keep = knownConsole({ ...state, systems }, state.systemId)
      const consolePrefs = consoles ? normalizePrefs(consoles) : state.consolePrefs
      return {
        ...state,
        status: 'ready',
        error: null,
        systems,
        padButtons: padButtons || {},
        saveCombo: saveCombo || DEFAULT_SAVE_COMBO,
        rescueCombo: rescueCombo || DEFAULT_RESCUE_COMBO,
        quitCombo: quitCombo || DEFAULT_QUIT_COMBO,
        theme: theme || state.theme,
        mode: mode || state.mode,
        screensaver: screensaver ?? state.screensaver,
        screensaverContent: screensaverContent || state.screensaverContent,
        tournamentAds: tournamentAds ?? state.tournamentAds,
        logout: logout ?? state.logout,
        sound: sound || state.sound,
        warnings: warnings || [],
        run: run || state.run,
        addons: addons || {},
        consolePrefs,
        systemId: keep ? state.systemId : firstConsole({ ...state, systems, consolePrefs }),
        index: keep ? state.index : 0,
      }
    }
    case A.LOAD_FAILED:
      return { ...state, status: 'error', error: action.message }
    case A.GAMES_LOADED: {
      const games = { ...state.games, [action.system]: action.games }
      const next = { ...state, games }
      const pending = state.pendingGame
      if (pending && pending.system === action.system && action.system === state.systemId) {
        next.pendingGame = null
        const shown = findShown(next, pending.id)
        const result = { ...shown.state, index: Math.max(0, shown.index) }
        return shown.index < 0 ? toast(result, 'Gioco non più presente nella libreria.', 'error') : result
      }
      if (action.system === state.systemId) {
        // Giochi ricaricati (per esempio all'arrivo dei metadati): la selezione resta sullo stesso gioco.
        const previous = state.games[action.system] ? currentGame(state) : null
        const list = filtered(next)
        const at = previous ? list.findIndex((game) => game.id === previous.id) : -1
        next.index = at >= 0 ? at : list.length ? clampIndex(state.index, list.length) : 0
      }
      return next
    }
    case A.SELECT_SYSTEM:
      if (action.system === state.systemId || !knownConsole(state, action.system)) {
        return state
      }
      return {
        ...state,
        systemId: action.system,
        index: 0,
        heroFocus: null,
        pendingGame: null,
        fromAll: action.fromAll ? action.system : null,
      }
    case A.CONSOLE_PREFS:
      return action.prefs === state.consolePrefs ? state : { ...state, consolePrefs: action.prefs }
    case A.ADDON_CONSOLES: {
      const next = { ...state, extraConsoles: action.consoles }
      if (state.extraConsoles.some((entry) => entry.id === state.systemId) && !knownConsole(next, state.systemId)) {
        return { ...next, systemId: state.systems[0] ? state.systems[0].id : null, index: 0, heroFocus: null }
      }
      return next
    }
    case A.CYCLE_SYSTEM: {
      const next = cycle(state, action.dir)
      return next === state ? state : { ...next, heroFocus: null }
    }
    case A.MOVE_SELECTION:
      return move(state, action.dx, action.dy, action.wrap)
    case A.SET_COLUMNS:
      return action.columns === state.columns || !(action.columns > 0) ? state : { ...state, columns: action.columns }
    case A.SELECT_INDEX: {
      const games = filtered(state)
      if (!games || !games.length) {
        return state
      }
      const next = withIndex(state, clampIndex(action.index, games.length))
      return next.heroFocus ? { ...next, heroFocus: null } : next
    }
    case A.JUMP_LETTER: {
      const games = filtered(state)
      return games ? withIndex(state, jumpIndex(games, state.index, action.dir, action.wrap)) : state
    }
    case A.JUMP_TO_LETTER: {
      const games = filtered(state)
      const index = games ? letterIndex(games).get(action.letter) : undefined
      return index === undefined ? state : withIndex(state, index)
    }
    case A.SET_QUERY:
      return withQuery(state, action.query)
    case A.CLEAR_SEARCH:
      return withQuery(state, '')
    case A.OPEN_KEYBOARD: {
      const value = action.value.slice(0, action.max)
      return {
        ...state,
        keyboardText: null,
        osk: {
          owner: action.owner,
          purpose: action.purpose,
          position: action.position,
          title: action.title || null,
          placeholder: action.placeholder || null,
          target: action.target || null,
          value,
          initial: value,
          max: action.max,
          upper: Boolean(action.upper),
          secret: Boolean(action.secret),
          reveal: false,
          symbols: false,
          row: START.row,
          col: START.col,
          caret: value.length,
        },
      }
    }
    case A.OSK_MOVE:
    case A.OSK_FOCUS:
    case A.OSK_PRESS:
    case A.OSK_TYPE:
    case A.OSK_ERASE:
    case A.OSK_CARET:
    case A.OSK_CONFIRM:
    case A.OSK_CANCEL:
      return state.osk ? oskReducer(state, action) : state
    case A.SET_FOCUS:
      if (state.focus[action.scope] === action.id) {
        return state
      }
      return { ...state, focus: { ...state.focus, [action.scope]: action.id } }
    case A.SYSTEMS_LOADED: {
      const { systems } = action
      const keep = knownConsole({ ...state, systems }, state.systemId)
      return {
        ...state,
        systems,
        games: {},
        systemId: keep ? state.systemId : firstConsole({ ...state, systems }),
        index: keep ? state.index : 0,
      }
    }
    case A.OPEN_SETTINGS:
      if (state.view === 'settings') {
        return state
      }
      return {
        ...state,
        view: 'settings',
        settings: { status: 'loading', error: null },
        focus: { ...state.focus, settings: null },
        filtersOpen: false,
        playlistMenu: null,
        controlsMenu: null,
        configMenu: null,
        moreMenu: null,
      }
    case A.CLOSE_SETTINGS:
      return state.view === 'library' ? state : { ...state, view: 'library', settings: null, osk: null, pickerFilter: '' }
    case A.SET_PICKER_FILTER:
      return action.text === state.pickerFilter ? state : { ...state, pickerFilter: action.text }
    case A.SETTINGS_LOADED:
    case A.SETTINGS_FAILED:
    case A.SETTINGS_CHANGE:
    case A.SYSTEM_CHANGE:
    case A.CORES_ADD:
    case A.CORE_REMOVE:
    case A.CORES_REFRESHING:
    case A.CORES_REFRESHED:
    case A.CORES_REFRESH_FAILED:
    case A.SETTINGS_SAVING:
    case A.SETTINGS_SAVE_FAILED: {
      const settings = settingsReducer(state.settings, action)
      return settings === state.settings ? state : { ...state, settings }
    }
    case A.SETTINGS_SAVED: {
      const settings = settingsReducer(state.settings, action)
      return {
        ...state,
        settings,
        saveCombo: action.data.settings['input.save_combo'] || state.saveCombo,
        rescueCombo: action.data.settings['input.rescue_combo'] || state.rescueCombo,
        quitCombo: action.data.settings['input.quit_combo'] || state.quitCombo,
        theme: action.data.settings['ui.theme'] || state.theme,
        mode: action.data.settings['ui.mode'] || state.mode,
        screensaver: action.data.settings['ui.screensaver_minutes'] ?? state.screensaver,
        screensaverContent: action.data.settings['ui.screensaver_content'] || state.screensaverContent,
        tournamentAds: action.data.settings['ui.tournament_ads'] ?? state.tournamentAds,
        logout: action.data.settings['ui.logout_minutes'] ?? state.logout,
        sound: {
          on: action.data.settings['ui.sound'] ?? state.sound.on,
          effects: action.data.settings['ui.sound_effects'] ?? state.sound.effects,
          music: action.data.settings['ui.sound_music'] ?? state.sound.music,
        },
      }
    }
    case A.SHOW_TOAST:
      return toast(state, action.message, action.variant === 'error' ? 'error' : 'info', Boolean(action.queue))
    case A.RUN_UPDATED:
      if (!action.run) {
        return state
      }
      // Partita avviata: all'uscita da RetroArch il cursore è di nuovo sulla griglia.
      return { ...state, run: action.run, heroFocus: action.run.running ? null : state.heroFocus }
    case A.SET_HERO_FOCUS:
      return action.focus === state.heroFocus ? state : { ...state, heroFocus: action.focus }
    case A.SET_HERO_IMAGE:
      return withHeroView(state, { image: action.kind })
    case A.STEP_HERO_IMAGE:
      return withHeroView(state, { image: stepImage(heroView(state).image, action.dir) })
    case A.TOGGLE_HERO_PANEL:
      return withHeroView(state, { panel: heroView(state).panel === action.panel ? 'info' : action.panel })
    case A.SCROLL_HERO:
      return { ...state, heroScroll: { dir: action.dir, seq: state.heroScroll.seq + 1 } }
    case A.REQUEST:
      return {
        ...state,
        request: {
          kind: action.kind,
          system: action.system,
          game: action.game,
          resume: action.resume || null,
          challenge: action.challenge || null,
          tournament: action.tournament || null,
          match: action.match || null,
          seq: (state.request ? state.request.seq : 0) + 1,
        },
      }
    case A.GAME_UPDATED: {
      const list = state.games[action.system]
      if (!list || !action.game) {
        return state
      }
      const games = list.map((game) => (game.id === action.game.id ? { ...game, ...action.game } : game))
      return { ...state, games: { ...state.games, [action.system]: games } }
    }
    case A.HIDE_TOAST:
      return hideToast(state)
    case A.PROFILES_LOADED:
    case A.TOGGLE_FAVORITE:
    case A.FAVORITE_SYNCED:
    case A.PATCH_PROFILE:
    case A.PROFILE_SYNCED:
    case A.SYNC_FAILED:
    case A.OPEN_PROFILE:
    case A.CLOSE_PROFILE:
    case A.GOTO_GAME:
      return profilesReducer(state, action)
    case A.OPEN_FILTERS:
    case A.CLOSE_FILTERS:
    case A.SET_FILTER:
    case A.RESET_FILTERS:
    case A.SHOW_GAME:
    case A.PLAYLISTS_LOADED:
    case A.PLAYED_LOADED:
    case A.OPEN_PLAYLIST_MENU:
    case A.CLOSE_PLAYLIST_MENU:
    case A.OPEN_CONTROLS_MENU:
    case A.CLOSE_CONTROLS_MENU:
    case A.OPEN_CONFIG_MENU:
    case A.CLOSE_CONFIG_MENU:
    case A.OPEN_MORE_MENU:
    case A.CLOSE_MORE_MENU:
      return filtersReducer(state, action)
    case A.OPEN_WRAPPED:
      return { ...state, wrapped: { account: action.account ?? null, period: action.period } }
    case A.CLOSE_WRAPPED:
      return { ...state, wrapped: null }
    case A.PAD_BUTTONS_SAVED:
      return { ...state, padButtons: action.padButtons }
    case A.RESET_PLAYERS:
      // Tornando a «PRESS START» si chiude anche il Wrapped.
      return { ...playersReducer(state, action), wrapped: null, match: null }
    case A.MATCH_OPEN:
    case A.MATCH_SIDES:
    case A.MATCH_CLOSE:
    case A.PRESS_START:
    case A.CLICK_SLOT:
    case A.CLOSE_LOGIN:
    case A.LEAVE_SLOT:
    case A.LOGIN:
    case A.LOGIN_GUEST:
    case A.LOGIN_STEP:
    case A.LOGIN_FORM:
    case A.PROFILE_SAVING:
    case A.PROFILE_CREATED:
    case A.PROFILE_FAILED:
    case A.PADS_CHANGED:
    case A.RESERVE_GAME:
      return playersReducer(state, action)
    default:
      return state
  }
}
