/**
 * Instradamento dei comandi (README §G): trasforma un evento logico di input
 * (`{pad, button, kind, source, text}`) nelle azioni da applicare, secondo lo
 * stato dell'app. Funzione pura: il reducer applica le azioni restituite
 * (azione `input`), così ogni evento vede lo stato più recente.
 *
 * Priorità:
 * 1. tastiera a schermo aperta (solo per il suo proprietario);
 * 2. vista Impostazioni: gli eventi li gestisce la vista (src/views/Settings.jsx),
 *    che usa la navigazione spaziale e `settingsCommand`;
 * 3. libreria (joypad di P1, più tastiera e mouse): la griglia oppure, dopo
 *    A su un gioco, gli elementi della sezione in alto (`state.heroFocus`:
 *    copertina, Gioca, Descrizione, Trofei, Altro; vedi `heroActions`); B torna alla griglia.
 *    X apre il pannello «Filtri» (src/views/LibraryLayer.jsx, che poi riceve gli eventi).
 *    Y aggiunge o toglie il gioco dai preferiti del giocatore di quel joypad,
 *    SELECT apre il suo profilo (senza giocatori, le Impostazioni).
 *
 * Il joypad di P2 non comanda la libreria, ma Y e SELECT valgono anche per
 * lui (`followerActions`, chiamata da App).
 *
 * Il livello di gioco (src/views/RunLayer.jsx) riceve gli eventi prima del
 * controller durante l'avvio, la partita e le sue finestre.
 */
import {
  clearSearch,
  cycleSystem,
  jumpLetter,
  moveSelection,
  oskCancel,
  oskCaret,
  oskConfirm,
  oskErase,
  oskMove,
  oskPress,
  oskType,
  openFilters,
  openMoreMenu,
  openProfile,
  openSettings,
  request,
  scrollHero,
  setHeroFocus,
  stepHeroImage,
  toggleFavorite,
  toggleHeroPanel,
} from '../state/actions.js'
import { SLOTS, ownsKeyboard, slotOfPad } from '../state/players.js'
import { currentGame, heroView } from '../state/reducer.js'
import { hasImages, hasText } from '../lib/gameInfo.js'
import { stepIndex, wraps } from './wrap.js'

// Direzioni → spostamento della selezione nella griglia (colonne, righe).
const MOVES = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
}

// Lunghezza massima del testo della ricerca.
export const SEARCH_MAX = 40

// La regola sul proprietario della tastiera a schermo sta con i giocatori (src/state/players.js).
export { ownsKeyboard }

function keyboardActions(osk, event) {
  if (!ownsKeyboard(osk, event)) {
    return []
  }
  if (event.kind === 'text') {
    return [oskType(event.text)]
  }
  if (MOVES[event.button]) {
    return [oskMove(event.button, wraps(event))]
  }
  // LB/RB spostano il cursore di un carattere (anche tenuti); Home/Fine della tastiera fisica a inizio/fine.
  if ((event.button === 'lb' || event.button === 'rb') && (event.kind === 'press' || event.kind === 'repeat')) {
    if (event.source === 'keyboard') {
      return event.kind === 'press' ? [oskCaret(event.button === 'lb' ? 'start' : 'end')] : []
    }
    return [oskCaret(event.button === 'lb' ? 'left' : 'right')]
  }
  if (event.kind !== 'press') {
    return []
  }
  switch (event.button) {
    case 'a':
      return [oskPress()]
    case 'x':
      return [oskErase()]
    case 'y':
      return [oskType(' ')]
    case 'start':
      return [oskConfirm()]
    case 'b':
      return [oskCancel()]
    default:
      return []
  }
}

// Elementi della sezione in alto, da sinistra a destra (i preferiti si cambiano con Y).
// Il core (`core`) sta sotto «Gioca», fuori dalla riga; Comandi, Configura e Playlist
// stanno nel menu «Altro» (src/views/LibraryLayer.jsx).
export const HERO_ACTIONS = ['cover', 'play', 'text', 'trophies', 'more']

/**
 * Elementi selezionabili della sezione in alto per il gioco `game`: la
 * copertina solo se ha immagini, «Descrizione» solo se ha una descrizione o una trama;
 * «Trofei» e «Altro» sempre.
 */
export function heroActionsFor(game) {
  return HERO_ACTIONS.filter((id) => (id !== 'cover' || hasImages(game)) && (id !== 'text' || hasText(game)))
}

/** Slot del giocatore che ha generato l'evento: quello del joypad, `p1` per tastiera e mouse. */
export function eventSlot(state, event) {
  if (event.pad === null || event.pad === undefined) {
    return 'p1'
  }
  return slotOfPad(state.players, event.pad)
}

// SELECT: profilo del giocatore (tastiera e mouse: il primo presente), senza giocatori le Impostazioni.
function selectActions(state, event) {
  let slot = eventSlot(state, event)
  if ((event.pad === null || event.pad === undefined) && !(slot && state.players[slot].user)) {
    slot = SLOTS.find((key) => state.players[key].user) || null
  }
  if (slot && state.players[slot].user) {
    return [openProfile(slot)]
  }
  return [openSettings()]
}

function launchActions(state, kind) {
  const game = currentGame(state)
  return game ? [request(kind, state.systemId, game)] : []
}

/**
 * Sezione in alto. Sulla copertina ← → cambiano immagine (in cerchio) e
 * ↑↓ portano a «Gioca»; sulle azioni ← → passano da un elemento all'altro
 * (da «Gioca» verso sinistra si arriva alla copertina) e, con la
 * descrizione o i trofei aperti e il loro pulsante selezionato, ↑↓ li scorrono.
 * Da «Gioca» ↓ porta al core, sotto; dal core ↑↓ tornano a «Gioca» e ← →
 * si muovono come da «Gioca». A su «Gioca» avvia, sul core apre il menu dei
 * core, su «Descrizione», «Trofei» o «Scheda» cambia vista, su «Altro» apre il
 * menu con comandi, configurazione e playlist, sulla copertina mostra l'immagine successiva.
 */
function heroActions(state, event, game) {
  const actions = heroActionsFor(game)
  let focus = actions.includes(state.heroFocus) ? state.heroFocus : 'play'
  if (state.heroFocus === 'core') {
    focus = 'core'
  }
  const horizontal = event.button === 'left' || event.button === 'right'
  const vertical = event.button === 'up' || event.button === 'down'
  if (focus === 'cover') {
    if (horizontal) {
      return event.kind === 'press' ? [stepHeroImage(event.button === 'left' ? -1 : 1)] : []
    }
    if (vertical) {
      return event.kind === 'press' ? [setHeroFocus('play')] : []
    }
  } else if (focus === 'core' && vertical) {
    return event.kind === 'press' ? [setHeroFocus('play')] : []
  } else if (focus === 'play' && event.button === 'down') {
    return event.kind === 'press' ? [setHeroFocus('core')] : []
  } else if (horizontal) {
    const at = actions.indexOf(focus === 'core' ? 'play' : focus)
    const next = actions[stepIndex(at, event.button === 'left' ? -1 : 1, actions.length, wraps(event))]
    return next !== state.heroFocus ? [setHeroFocus(next)] : []
  } else if (vertical) {
    if ((focus === 'text' || focus === 'trophies') && heroView(state).panel === focus) {
      return [scrollHero(event.button === 'up' ? -1 : 1)]
    }
    return []
  }
  if (event.kind !== 'press') {
    return []
  }
  switch (event.button) {
    case 'a':
      if (focus === 'cover') {
        return [stepHeroImage(1)]
      }
      if (focus === 'text' || focus === 'trophies') {
        return [toggleHeroPanel(focus)]
      }
      if (focus === 'more') {
        return [openMoreMenu()]
      }
      if (focus === 'core') {
        return launchActions(state, 'coreMenu')
      }
      return launchActions(state, 'launch')
    case 'b':
      return [setHeroFocus(null)]
    default:
      return null
  }
}

function libraryActions(state, event) {
  if (state.heroFocus && currentGame(state)) {
    const actions = heroActions(state, event, currentGame(state))
    if (actions) {
      return actions
    }
  }
  const move = MOVES[event.button]
  if (move) {
    return [moveSelection(move[0], move[1], wraps(event))]
  }
  if (event.kind !== 'press') {
    return []
  }
  switch (event.button) {
    case 'a':
      // A sul gioco porta alle sue azioni: A su «Gioca» lo avvia.
      return currentGame(state) ? [setHeroFocus('play')] : []
    case 'lb':
      return [cycleSystem(-1)]
    case 'rb':
      return [cycleSystem(1)]
    case 'lt':
      return [jumpLetter(-1)]
    case 'rt':
      return [jumpLetter(1)]
    case 'x':
      return [openFilters()]
    case 'b':
      return state.query ? [clearSearch()] : []
    case 'y': {
      const slot = eventSlot(state, event)
      return slot && currentGame(state) ? [toggleFavorite(slot)] : []
    }
    case 'select':
      return selectActions(state, event)
    default:
      return []
  }
}

/**
 * Azioni per un evento del joypad di un giocatore che non comanda la
 * libreria (P2): Y sul gioco selezionato e SELECT per il proprio profilo.
 */
export function followerActions(state, event) {
  if (event.kind !== 'press' || state.view !== 'library' || state.osk || state.status !== 'ready') {
    return []
  }
  const slot = eventSlot(state, event)
  if (!slot) {
    return []
  }
  if (event.button === 'y') {
    return currentGame(state) ? [toggleFavorite(slot)] : []
  }
  if (event.button === 'select' && state.players[slot].user) {
    return [openProfile(slot)]
  }
  return []
}

/**
 * Comando della vista Impostazioni per l'evento: `close` (B o SELECT senza
 * modifiche), `confirm` (B o SELECT con modifiche non salvate: prima si
 * chiede conferma), altrimenti `null`.
 */
export function settingsCommand(event, dirty) {
  if (!event || event.kind !== 'press' || (event.button !== 'b' && event.button !== 'select')) {
    return null
  }
  return dirty ? 'confirm' : 'close'
}

/** Azioni per l'evento `event` nello stato `state` (lista vuota se ignorato). */
export function route(state, event) {
  if (!event || event.kind === 'release') {
    return []
  }
  if (state.osk) {
    return keyboardActions(state.osk, event)
  }
  if (event.kind === 'text' || state.status !== 'ready' || state.view !== 'library') {
    return []
  }
  return libraryActions(state, event)
}
