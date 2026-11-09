/** Azioni del reducer (src/state/reducer.js). */

export const BOOTSTRAP_LOADED = 'bootstrapLoaded'
export const LOAD_FAILED = 'loadFailed'
export const GAMES_LOADED = 'gamesLoaded'
export const SELECT_SYSTEM = 'selectSystem'
export const MOVE_SELECTION = 'moveSelection'
export const SET_COLUMNS = 'setColumns'
export const SELECT_INDEX = 'selectIndex'
export const SHOW_TOAST = 'showToast'
export const HIDE_TOAST = 'hideToast'
export const INPUT = 'input'
export const CYCLE_SYSTEM = 'cycleSystem'
export const ADDON_CONSOLES = 'addonConsoles'
export const JUMP_LETTER = 'jumpLetter'
export const JUMP_TO_LETTER = 'jumpToLetter'
export const SET_QUERY = 'setQuery'
export const CLEAR_SEARCH = 'clearSearch'
export const OPEN_KEYBOARD = 'openKeyboard'
export const OSK_MOVE = 'oskMove'
export const OSK_FOCUS = 'oskFocus'
export const OSK_PRESS = 'oskPress'
export const OSK_TYPE = 'oskType'
export const OSK_ERASE = 'oskErase'
export const OSK_CARET = 'oskCaret'
export const OSK_CONFIRM = 'oskConfirm'
export const OSK_CANCEL = 'oskCancel'
export const SET_FOCUS = 'setFocus'
export const SYSTEMS_LOADED = 'systemsLoaded'
export const OPEN_SETTINGS = 'openSettings'
export const CLOSE_SETTINGS = 'closeSettings'
export const SETTINGS_LOADED = 'settingsLoaded'
export const SETTINGS_FAILED = 'settingsFailed'
export const SETTINGS_CHANGE = 'settingsChange'
export const SYSTEM_CHANGE = 'systemChange'
export const SETTINGS_SAVING = 'settingsSaving'
export const SETTINGS_SAVED = 'settingsSaved'
export const SETTINGS_SAVE_FAILED = 'settingsSaveFailed'
export const CORES_ADD = 'coresAdd'
export const CORE_REMOVE = 'coreRemove'
export const CORES_REFRESHING = 'coresRefreshing'
export const CORES_REFRESHED = 'coresRefreshed'
export const CORES_REFRESH_FAILED = 'coresRefreshFailed'
export const SET_PICKER_FILTER = 'setPickerFilter'
export const RUN_UPDATED = 'runUpdated'
export const SET_HERO_FOCUS = 'setHeroFocus'
export const SET_HERO_IMAGE = 'setHeroImage'
export const STEP_HERO_IMAGE = 'stepHeroImage'
export const TOGGLE_HERO_PANEL = 'toggleHeroPanel'
export const SCROLL_HERO = 'scrollHero'
export const REQUEST = 'request'
export const GAME_UPDATED = 'gameUpdated'
export const PROFILES_LOADED = 'profilesLoaded'
export const PRESS_START = 'pressStart'
export const CLICK_SLOT = 'clickSlot'
export const CLOSE_LOGIN = 'closeLogin'
export const LEAVE_SLOT = 'leaveSlot'
export const RESET_PLAYERS = 'resetPlayers'
export const LOGIN = 'login'
export const LOGIN_GUEST = 'loginGuest'
export const LOGIN_STEP = 'loginStep'
export const LOGIN_FORM = 'loginForm'
export const PROFILE_SAVING = 'profileSaving'
export const PROFILE_CREATED = 'profileCreated'
export const RESERVE_GAME = 'reserveGame'
export const PROFILE_FAILED = 'profileFailed'
export const PADS_CHANGED = 'padsChanged'
export const TOGGLE_FAVORITE = 'toggleFavorite'
export const FAVORITE_SYNCED = 'favoriteSynced'
export const PATCH_PROFILE = 'patchProfile'
export const PROFILE_SYNCED = 'profileSynced'
export const SYNC_FAILED = 'syncFailed'
export const OPEN_PROFILE = 'openProfile'
export const CLOSE_PROFILE = 'closeProfile'
export const GOTO_GAME = 'gotoGame'
export const OPEN_FILTERS = 'openFilters'
export const CLOSE_FILTERS = 'closeFilters'
export const SET_FILTER = 'setFilter'
export const RESET_FILTERS = 'resetFilters'
export const SHOW_GAME = 'showGame'
export const PLAYLISTS_LOADED = 'playlistsLoaded'
export const PLAYED_LOADED = 'playedLoaded'
export const OPEN_PLAYLIST_MENU = 'openPlaylistMenu'
export const CLOSE_PLAYLIST_MENU = 'closePlaylistMenu'
export const OPEN_CONTROLS_MENU = 'openControlsMenu'
export const CLOSE_CONTROLS_MENU = 'closeControlsMenu'
export const OPEN_CONFIG_MENU = 'openConfigMenu'
export const CLOSE_CONFIG_MENU = 'closeConfigMenu'
export const OPEN_MORE_MENU = 'openMoreMenu'
export const CLOSE_MORE_MENU = 'closeMoreMenu'
export const OPEN_WRAPPED = 'openWrapped'
export const CLOSE_WRAPPED = 'closeWrapped'
export const PAD_BUTTONS_SAVED = 'padButtonsSaved'
export const MATCH_OPEN = 'matchOpen'
export const MATCH_SIDES = 'matchSides'
export const MATCH_CLOSE = 'matchClose'

export const bootstrapLoaded = (data) => ({ type: BOOTSTRAP_LOADED, data })
export const loadFailed = (message) => ({ type: LOAD_FAILED, message })
export const gamesLoaded = (system, games) => ({ type: GAMES_LOADED, system, games })
export const selectSystem = (system) => ({ type: SELECT_SYSTEM, system })
export const moveSelection = (dx, dy, wrap = false) => ({ type: MOVE_SELECTION, dx, dy, wrap })
export const setColumns = (columns) => ({ type: SET_COLUMNS, columns })
export const selectIndex = (index) => ({ type: SELECT_INDEX, index })
/**
 * Notifica in basso (4 s); `variant` vale `info` o `error`. Con `queue` la
 * notifica aspetta che quella mostrata scada invece di sostituirla.
 */
export const showToast = (message, variant = 'info', queue = false) => ({ type: SHOW_TOAST, message, variant, queue })
export const hideToast = () => ({ type: HIDE_TOAST })

/** Evento logico di input (`{pad, button, kind, source, text}`), instradato da src/input/controller.js. */
export const input = (event) => ({ type: INPUT, event })
/** Console successiva (`dir` = 1) o precedente (-1), con ritorno al primo gioco. */
export const cycleSystem = (dir) => ({ type: CYCLE_SYSTEM, dir })
/** Console delle estensioni (`[{id, name, accent, addon}]`), in coda a quelle dei giochi. */
export const addonConsolesLoaded = (consoles) => ({ type: ADDON_CONSOLES, consoles })
/** Primo gioco dell'iniziale successiva (`dir` = 1) o precedente (-1). */
export const jumpLetter = (dir, wrap = true) => ({ type: JUMP_LETTER, dir, wrap })
/** Primo gioco con l'iniziale `letter` (`#` o `A`–`Z`), se presente. */
export const jumpToLetter = (letter) => ({ type: JUMP_TO_LETTER, letter })
export const setQuery = (query) => ({ type: SET_QUERY, query })
export const clearSearch = () => ({ type: CLEAR_SEARCH })
/**
 * Apre la tastiera a schermo per `purpose` (`search`, `field`, `filter` per
 * la ricerca nei menu delle Impostazioni, `profileName` per il nome di un
 * nuovo profilo, `extension` per un'estensione, che legge il testo da
 * `state.extensionText`, `text` per un testo che la vista legge da
 * `state.keyboardText` dopo la conferma); `owner` è il joypad che la comanda; `upper` parte con le
 * maiuscole. `title` e `placeholder` sostituiscono quelli del
 * `purpose`; `target` indica dove va il testo confermato di un campo
 * (`{kind: 'setting', key, number}`, `{kind: 'extensions', system}`,
 * `{kind: 'profile', slot}` o, per un'estensione, un oggetto scelto da lei).
 * Con `secret` (password) il testo compare come pallini, finché MOSTRA non lo rivela.
 */
export const openKeyboard = (
  purpose,
  {
    owner = null,
    value = '',
    max = 32,
    position = 'center',
    title = null,
    placeholder = null,
    target = null,
    upper = false,
    secret = false,
  } = {},
) => ({
  type: OPEN_KEYBOARD,
  purpose,
  owner,
  value,
  max,
  position,
  title,
  placeholder,
  target,
  upper,
  secret,
})
export const oskMove = (dir, wrap = false) => ({ type: OSK_MOVE, dir, wrap })
/** Evidenzia il tasto `{row, col}` senza premerlo (passaggio del mouse). */
export const oskFocus = (row, col) => ({ type: OSK_FOCUS, row, col })
/** Preme il tasto evidenziato, oppure il tasto `{row, col}` se indicato (clic). */
export const oskPress = (row, col) => ({ type: OSK_PRESS, row, col })
export const oskType = (text) => ({ type: OSK_TYPE, text })
export const oskErase = () => ({ type: OSK_ERASE })
/** Cursore del testo all'inizio (`start`) o alla fine (`end`). */
export const oskCaret = (to) => ({ type: OSK_CARET, to })
export const oskConfirm = () => ({ type: OSK_CONFIRM })
export const oskCancel = () => ({ type: OSK_CANCEL })
/** Elemento con il focus nell'ambito `scope` (src/input/useFocusScope.js). */
export const setFocus = (scope, id) => ({ type: SET_FOCUS, scope, id })
/** Sistemi riletti dal backend (dopo «Aggiorna libreria» o un salvataggio): i giochi si ricaricano. */
export const systemsLoaded = (systems) => ({ type: SYSTEMS_LOADED, systems })

/** Apre la vista Impostazioni (i dati si caricano in src/state/AppContext.jsx). */
export const openSettings = () => ({ type: OPEN_SETTINGS })
/** Torna alla libreria scartando la bozza delle Impostazioni. */
export const closeSettings = () => ({ type: CLOSE_SETTINGS })
/** Dati di `GET /api/settings`; con `keepDraft` le modifiche non salvate restano. */
export const settingsLoaded = (data, keepDraft = false) => ({ type: SETTINGS_LOADED, data, keepDraft })
export const settingsFailed = (message) => ({ type: SETTINGS_FAILED, message })
/** Cambia un'impostazione generale nella bozza (`paths.roms`, `buttons`, …). */
export const settingsChange = (key, value) => ({ type: SETTINGS_CHANGE, key, value })
/** Cambia le estensioni di una console nella bozza. */
export const systemChange = (system, patch) => ({ type: SYSTEM_CHANGE, system, patch })
export const settingsSaving = () => ({ type: SETTINGS_SAVING })
/** Risposta di `POST /api/settings`: diventa il nuovo originale; i tasti del joypad si aggiornano. */
export const settingsSaved = (data) => ({ type: SETTINGS_SAVED, data })
export const settingsSaveFailed = (message) => ({ type: SETTINGS_SAVE_FAILED, message })
/** Aggiunge `cores` (nomi brevi) alla lista della console `system`, nell'ordine automatico. */
export const coresAdd = (system, cores) => ({ type: CORES_ADD, system, cores })
/** Toglie `core` dalla lista della console `system`. */
export const coreRemove = (system, core) => ({ type: CORE_REMOVE, system, core })
export const coresRefreshing = () => ({ type: CORES_REFRESHING })
/** Risposta di `POST /api/cores/refresh`: dati nuovi, bozza mantenuta. */
export const coresRefreshed = (data) => ({ type: CORES_REFRESHED, data })
export const coresRefreshFailed = (message) => ({ type: CORES_REFRESH_FAILED, message })
/** Testo della ricerca nel menu aperto delle Impostazioni (tastiera a schermo `filter`). */
export const setPickerFilter = (text) => ({ type: SET_PICKER_FILTER, text })

/** Stato della partita (`GET /api/run`, README §E). */
export const runUpdated = (run) => ({ type: RUN_UPDATED, run })
/**
 * Focus nella sezione in alto (`cover`, `play`, `core`, `text`, vedi
 * `heroActionsFor` in src/input/controller.js), oppure `null` per la griglia.
 */
export const setHeroFocus = (focus) => ({ type: SET_HERO_FOCUS, focus })
/** Immagine `kind` (`cover`, `title`, `snap`) sulla copertina del gioco selezionato. */
export const setHeroImage = (kind) => ({ type: SET_HERO_IMAGE, kind })
/** Immagine successiva (`dir` 1) o precedente (-1) sulla copertina del gioco selezionato, in cerchio. */
export const stepHeroImage = (dir) => ({ type: STEP_HERO_IMAGE, dir })
/** Accanto alla copertina: dalla scheda alla descrizione e viceversa. */
/** Apre il pannello `panel` (`text` o `trophies`) della sezione in alto, o torna alla scheda se è già aperto. */
export const toggleHeroPanel = (panel = 'text') => ({ type: TOGGLE_HERO_PANEL, panel })
/** Scorre la descrizione di un passo in su (`dir` -1) o in giù (1). */
export const scrollHero = (dir) => ({ type: SCROLL_HERO, dir })
/**
 * Richiesta per il livello di gioco (src/views/RunLayer.jsx): `launch` avvia
 * il gioco, `coreMenu` apre il menu «Core ▸». Con `resume` (`{account,
 * slot}`, «Gioca da qui» nel Profilo) `launch` avvia subito da quello slot,
 * senza la modale dei salvataggi.
 */
export const request = (kind, system, game, resume = null) => ({ type: REQUEST, kind, system, game, resume })
// Gioca la Sfida trofeo `challenge` (`{id, system, game, title}`): la avvia il livello di gioco (src/views/RunLayer.jsx).
export const requestChallenge = (challenge) => ({
  type: REQUEST,
  kind: 'challenge',
  system: challenge.system,
  game: { id: challenge.game, title: challenge.title },
  challenge: challenge.id,
})
// Registra lo stato di partenza del torneo `tournament` (`{id, account, combo, source}`) giocando `game` (`{id, title}`):
// lo avvia il livello di gioco (src/views/RunLayer.jsx).
export const requestTournamentRecord = (system, game, tournament) => ({
  type: REQUEST,
  kind: 'tournament',
  system,
  game,
  tournament,
})
// Gioca una partita dell'incontro `match` (`{id, match, account, sideA, pads}`) di `game` (`{id, title}`): la avvia
// il livello di gioco (src/views/RunLayer.jsx) con P1 e P2 dell'incontro e i joypad `pads` (`[P1, P2]`) assegnati.
export const requestMatch = (system, game, match) => ({
  type: REQUEST,
  kind: 'match',
  system,
  game,
  match,
})
/**
 * Schermata «Incontro» aperta (src/views/MatchLayer.jsx) sull'incontro `match`
 * (`{tournament, match}`): P1 e P2 della dashboard si mettono da parte e
 * diventano i due profili `users` (`[utente del lato P1, utente del lato P2]`)
 * con i joypad `pads` (`[joypad P1, joypad P2]`).
 */
export const matchOpen = (match, users, pads) => ({ type: MATCH_OPEN, match, users, pads })
/** Lati scambiati: i profili `users` (`[lato P1, lato P2]`) passano ai due slot, i joypad restano. */
export const matchSides = (users) => ({ type: MATCH_SIDES, users })
/** Schermata «Incontro» chiusa: tornano P1 e P2 della dashboard di prima. */
export const matchClose = () => ({ type: MATCH_CLOSE })
/** Gioco aggiornato dal backend (core associato cambiato). */
export const gameUpdated = (system, game) => ({ type: GAME_UPDATED, system, game })

/** Profili di `GET /api/profiles` e riepiloghi dei giochi citati (`games`). */
export const profilesLoaded = (accounts, games = null) => ({ type: PROFILES_LOADED, accounts, games })
/** START di un joypad (o F2, con `pad` nullo): entra o riapre la propria finestra «Chi gioca?». */
export const pressStart = (pad, padId = null) => ({ type: PRESS_START, pad, padId })
/** Clic su uno slot dell'intestazione (`p1`/`p2`). */
export const clickSlot = (slot) => ({ type: CLICK_SLOT, slot })
/** Chiude la finestra dello slot; senza profilo lo slot si libera. */
export const closeLogin = (slot) => ({ type: CLOSE_LOGIN, slot })
/** «Esci»: libera lo slot (se esce P1, P2 diventa P1). */
export const leaveSlot = (slot) => ({ type: LEAVE_SLOT, slot })
/** START+SELECT premuti brevemente: escono tutti e due i giocatori, finestre e viste si chiudono. */
export const resetPlayers = () => ({ type: RESET_PLAYERS })
/** Profilo scelto nella finestra dello slot. */
export const login = (slot, account) => ({ type: LOGIN, slot, account })
export const loginGuest = (slot) => ({ type: LOGIN_GUEST, slot })
/** Passo della finestra: `choose` o `new`. */
export const loginStep = (slot, step) => ({ type: LOGIN_STEP, slot, step })
/** Modifica il modulo del nuovo profilo (`{name}`, `{color}`, `{console}`). */
export const loginForm = (slot, patch) => ({ type: LOGIN_FORM, slot, patch })
export const profileSaving = (slot) => ({ type: PROFILE_SAVING, slot })
/** Profilo creato da `POST /api/profiles`: entra nell'elenco e nello slot. */
export const profileCreated = (slot, account) => ({ type: PROFILE_CREATED, slot, account })
/**
 * Gioco prenotato dalla classifica di «Chi gioca?»: quando lo slot `slot`
 * entra (profilo, ospite o profilo nuovo) la libreria va su «Gioca» di quel
 * gioco. `title` serve alla fascia della finestra; `system` nullo toglie la prenotazione.
 */
export const reserveGame = (slot, system = null, id = null, title = '') => ({ type: RESERVE_GAME, slot, system, id, title })
export const profileFailed = (slot, message) => ({ type: PROFILE_FAILED, slot, message })
/** Indici dei joypad visibili alla Gamepad API. */
export const padsChanged = (pads) => ({ type: PADS_CHANGED, pads })

/**
 * Y: aggiunge o toglie il gioco (`system`, `id`) dai preferiti del giocatore
 * dello slot; senza `system` vale il gioco selezionato nella libreria.
 */
export const toggleFavorite = (slot, system = null, id = null) => ({ type: TOGGLE_FAVORITE, slot, system, id })
/** Preferiti confermati dal backend per l'operazione `seq`. */
export const favoriteSynced = (seq, favorites, games) => ({ type: FAVORITE_SYNCED, seq, favorites, games })
/** Modifica delle preferenze del giocatore dello slot (pagina profilo). */
export const patchProfile = (slot, patch) => ({ type: PATCH_PROFILE, slot, patch })
/** Profilo confermato dal backend per l'operazione `seq`. */
export const profileSynced = (seq, account) => ({ type: PROFILE_SYNCED, seq, account })
/** Operazione `seq` rifiutata dal backend: la modifica viene annullata e compare `message`. */
export const syncFailed = (seq, message) => ({ type: SYNC_FAILED, seq, message })
/** Pagina profilo del giocatore dello slot (SELECT). */
export const openProfile = (slot) => ({ type: OPEN_PROFILE, slot })
export const closeProfile = () => ({ type: CLOSE_PROFILE })
/** Torna alla libreria selezionando il gioco `id` della console `system` (preferito del profilo). */
export const gotoGame = (system, id) => ({ type: GOTO_GAME, system, id })

/** Apre il pannello «Filtri» della libreria (X). */
export const openFilters = () => ({ type: OPEN_FILTERS })
export const closeFilters = () => ({ type: CLOSE_FILTERS })
/**
 * Filtro `field` della libreria con il valore `value` (src/state/libraryFilters.js);
 * il valore vuoto del campo lo toglie.
 */
export const setFilter = (field, value) => ({ type: SET_FILTER, field, value })
/** Toglie tutti i filtri e la ricerca per titolo. */
export const resetFilters = () => ({ type: RESET_FILTERS })
/**
 * Seleziona il gioco `id` della console `system` tenendo ricerca e filtri
 * («Sorprendimi»): chiude il pannello dei filtri e porta il cursore su «Gioca».
 */
export const showGame = (system, id) => ({ type: SHOW_GAME, system, id })
/** Playlist di `GET /api/playlists` (o di una modifica) e riepiloghi dei giochi aggiunti a mano. */
export const playlistsLoaded = (playlists, games = {}) => ({ type: PLAYLISTS_LOADED, playlists, games })
/** Giochi già giocati dal profilo `account` (`GET /api/profiles/played`), come chiavi `<system>/<id>`. */
export const playedLoaded = (account, keys) => ({ type: PLAYED_LOADED, account, keys })
/** Menu «Playlist» del gioco selezionato (sezione in alto), oppure chiusura. */
export const openPlaylistMenu = () => ({ type: OPEN_PLAYLIST_MENU })
export const closePlaylistMenu = () => ({ type: CLOSE_PLAYLIST_MENU })
/** Finestra «Comandi» del gioco selezionato (sezione in alto), oppure chiusura. */
export const openControlsMenu = () => ({ type: OPEN_CONTROLS_MENU })
export const closeControlsMenu = () => ({ type: CLOSE_CONTROLS_MENU })
/** Pagina «Configurazione» del gioco selezionato (sezione in alto), oppure chiusura. */
export const openConfigMenu = () => ({ type: OPEN_CONFIG_MENU })
export const closeConfigMenu = () => ({ type: CLOSE_CONFIG_MENU })

// Menu «Altro» della scheda: core, comandi, configurazione e playlist del gioco selezionato.
export const openMoreMenu = () => ({ type: OPEN_MORE_MENU })
export const closeMoreMenu = () => ({ type: CLOSE_MORE_MENU })

/** Wrapped del profilo `account` (`null` = casa) per `period` (src/views/WrappedLayer.jsx), oppure chiusura. */
export const openWrapped = (account, period) => ({ type: OPEN_WRAPPED, account, period })
export const closeWrapped = () => ({ type: CLOSE_WRAPPED })

/** Tasti di tutti i joypad dopo il salvataggio di uno (`POST /api/joypads/buttons`). */
export const padButtonsSaved = (padButtons) => ({ type: PAD_BUTTONS_SAVED, padButtons })