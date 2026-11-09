import GameHero from '../components/GameHero.jsx'
import GameGrid from '../components/GameGrid.jsx'
import {
  jumpToLetter,
  openMoreMenu,
  request,
  selectIndex,
  setHeroFocus,
  setHeroImage,
  toggleHeroPanel,
} from '../state/actions.js'
import {
  currentGame,
  currentGames,
  currentSystem,
  filtered,
  filtersActive,
  heroView,
  playedKeys,
  presentLetters,
} from '../state/reducer.js'
import { librarySummary } from '../state/libraryFilters.js'
import { useApp } from '../state/AppContext.jsx'
import { PLAYER_INFO, SLOTS } from '../state/players.js'
import { favoritesOf, gameKey } from '../state/profiles.js'
import { letterOf } from '../lib/search.js'
import { activeTheme } from '../lib/themes.js'
import styles from './Library.module.css'

/** Id del profilo del P1, i cui trofei sbloccati compaiono nella scheda; `null` per un ospite o senza P1. */
function p1Account(state) {
  const user = state.players.p1.user
  return user && !user.guest && Number.isInteger(user.id) ? user.id : null
}

function Message({ title, text }) {
  return (
    <div className={styles.message}>
      <div className={styles.messageTitle}>{title}</div>
      {text && <div className={styles.messageText}>{text}</div>}
    </div>
  )
}

/**
 * Libreria: gioco selezionato in alto e riga della griglia sotto, filtrata
 * dalla ricerca e dai filtri (riepilogati accanto al titolo della griglia). `onWheelMove(direzione)` riceve la rotellina come comando
 * `up`/`down`.
 */
export default function Library({ onWheelMove }) {
  const { state, dispatch } = useApp()

  if (state.status === 'loading') {
    return <Message title="Caricamento…" />
  }
  if (state.status === 'error') {
    return <Message title="Servizio non disponibile" text={state.error} />
  }
  const system = currentSystem(state)
  if (!system) {
    return <Message title="Nessuna console trovata in games/" text={state.warnings.join(' ')} />
  }
  if (!currentGames(state)) {
    return <Message title="Caricamento dei giochi…" />
  }
  const games = filtered(state)
  const game = currentGame(state)
  // Preferiti dei giocatori presenti: cuori sotto «Gioca» e pallini sulle copertine (colori P1/P2).
  const present = SLOTS.filter((slot) => state.players[slot].user).map((slot) => ({
    slot,
    tag: PLAYER_INFO[slot].tag,
    color: PLAYER_INFO[slot].color,
    keys: new Set(favoritesOf(state, slot)),
  }))
  const dotsFor = (entry) => present.filter((player) => player.keys.has(gameKey(system.id, entry.id)))

  if (!game && !state.query && !filtersActive(state)) {
    return <Message title={`Nessun gioco per ${system.name}`} text="Aggiungi i file dei giochi nella cartella della console." />
  }
  return (
    <div className={styles.library}>
      {game ? (
        <GameHero
          system={system}
          game={game}
          heroFocus={state.heroFocus}
          view={heroView(state)}
          scroll={state.heroScroll}
          favoredBy={dotsFor(game)}
          account={p1Account(state)}
          onFocus={(id) => dispatch(setHeroFocus(id))}
          onActivate={(id) => {
            if (id === 'text' || id === 'trophies') {
              dispatch(setHeroFocus(id))
              dispatch(toggleHeroPanel(id))
            } else if (id === 'more') {
              dispatch(setHeroFocus(id))
              dispatch(openMoreMenu())
            } else if (id === 'core') {
              dispatch(setHeroFocus(id))
              dispatch(request('coreMenu', system.id, game))
            } else {
              dispatch(request('launch', system.id, game))
            }
          }}
          onImage={(kind) => dispatch(setHeroImage(kind))}
        />
      ) : (
        <div className={styles.empty} />
      )}
      <GameGrid
        system={system}
        games={games}
        index={state.index}
        columns={state.columns}
        query={state.query}
        filters={librarySummary(state.filters, playedKeys(state), state.playlists)}
        letter={game ? letterOf(game.title) : null}
        present={presentLetters(state)}
        onSelect={(index) => dispatch(selectIndex(index))}
        onWheelMove={onWheelMove}
        onJumpLetter={(letter) => dispatch(jumpToLetter(letter))}
        dotsFor={dotsFor}
        icon={activeTheme(state).icon}
      />
    </div>
  )
}
