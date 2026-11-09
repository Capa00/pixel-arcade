import { useCallback, useEffect, useRef, useState } from 'react'
import SeriesRankings, { stepRanking } from '../components/SeriesRankings.jsx'
import * as api from '../api/client.js'
import Avatar from '../components/Avatar.jsx'
import Bracket from '../components/Bracket.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { YES_NO, moveChoice } from '../components/confirmChoices.js'
import FaceButton from '../components/FaceButton.jsx'
import GameCover from '../components/GameCover.jsx'
import LeagueCalendar from '../components/LeagueCalendar.jsx'
import LeagueTable from '../components/LeagueTable.jsx'
import PickerMenu from '../components/PickerMenu.jsx'
import Podium from '../components/Podium.jsx'
import { stepIndex, wraps } from '../input/wrap.js'
import { hasImages, imageUrl } from '../lib/gameInfo.js'
import {
  bracketLayout,
  cursorSections,
  isLeague,
  isReturnLeg,
  jumpSection,
  leagueDayLabel,
  leagueDayStep,
  leagueDays,
  leagueOptions,
  leagueTable,
  lotsRows,
  lotsText,
  playerMatches,
  playoffNotice,
  sectionOf,
  canPlayMatch,
  comboButton,
  countdownParts,
  formatChips,
  formatLabel,
  formatStart,
  freeSeats,
  gameRows,
  hasBoard,
  PLAYERS_MIN,
  isEnrolled,
  isFull,
  matchCount,
  matchPads,
  matchRound,
  matchTitle,
  matchesText,
  adminMatchItems,
  menuItems,
  moveCursor,
  nextMatch,
  progressLabel,
  roundsOf,
  rosterEntry,
  rosterOrder,
  undoText,
  undoneMessage,
  withdrawCandidates,
  withdrawText,
  seatsLabel,
  matchSeriesLabel,
  slotText,
  statusBadge,
  tabStatus,
  tabTournaments,
} from '../lib/tournament.js'
import { clickSlot, loginStep, matchOpen, showGame, showToast } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import { PLAYER_INFO, SLOTS, eventSlot as slotOf } from '../state/players.js'
import * as store from '../state/tournamentStore.js'
import { ComboDialog } from './SettingsTournament.jsx'
import TournamentStart from './TournamentStart.jsx'
import styles from './TournamentView.module.css'

// Tasti che sulla scheda (fuori dal torneo) passano alla dashboard: cambio console, giocatori e profilo.
const PASS_TAB = new Set(['lb', 'rb', 'start', 'select'])
// Ogni quanto si aggiorna il conto alla rovescia (ms).
const CLOCK_MS = 30000
const NOT_JOINED = 'Premi START per entrare'
const NO_ACTIONS = 'Nessuna azione disponibile per questo torneo.'
// Caselle dei posti liberi mostrate al massimo (le altre si contano in «+N»).
const FREE_SHOWN = 12
// Scorrimento di «Info torneo» a ogni pressione di ▲ ▼, in parti dell'altezza visibile.
const INFO_STEP = 0.4
const NO_GAMES = 'Nessuna partita giocata'
const DIRECTIONS = new Set(['up', 'down', 'left', 'right'])
const MEDALS = [
  { id: 'gold', label: '1°' },
  { id: 'silver', label: '2°' },
  { id: 'bronze', label: '3°' },
]

function lockedError(error) {
  return Boolean(error && error.data && error.data.locked)
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

/** Console del gioco del torneo tra quelle caricate (per i colori della copertina pixel art). */
function systemOf(systems, game) {
  return game ? systems.find((entry) => entry.id === game.system) || { id: game.system } : null
}

/** Copertina del gioco del torneo, nelle proporzioni 3:4. */
function Cover({ game, systems, className }) {
  if (!game) {
    return <span className={`${styles.cover} ${styles.noCover} ${className || ''}`}>?</span>
  }
  return (
    <GameCover
      key={`${game.system}:${game.id}`}
      system={systemOf(systems, game)}
      game={game}
      className={`${styles.cover} ${className || ''}`}
    />
  )
}

/** Sfondo della testata: la copertina ingrandita, sfocata e scurita. */
function HeroBackdrop({ game }) {
  const style = hasImages(game) ? { backgroundImage: `url("${imageUrl(game.system, game, 'cover')}")` } : undefined
  return (
    <span className={styles.heroBackdrop} aria-hidden="true">
      <span className={styles.heroImage} style={style} />
      <span className={styles.heroShade} />
    </span>
  )
}

/** Etichetta colorata dello stato: verde, grigia o rossa (che pulsa). */
function StatusBadge({ tournament }) {
  const badge = statusBadge(tournament)
  return (
    <span className={`pix ${styles.badge} ${styles[badge.tone]}`}>
      {badge.tone === 'live' && <span className={styles.liveDot} aria-hidden="true" />}
      {badge.label}
    </span>
  )
}

/** Conto alla rovescia a riquadri, stile tabellone; passata l'ora (o senza data) una riga di testo. */
function Countdown({ tournament, now }) {
  if (tournament.status === 'running' || tournament.status === 'done') {
    return null
  }
  const parts = countdownParts(tournament.startsAt, now)
  if (!parts) {
    return <p className={styles.waiting}>{tabStatus(tournament, now)}</p>
  }
  const boxes = [
    { id: 'd', value: parts.days, unit: 'G' },
    { id: 'h', value: parts.hours, unit: 'H' },
    { id: 'm', value: parts.minutes, unit: 'MIN' },
  ]
  return (
    <div className={styles.countdown} aria-label={tabStatus(tournament, now)}>
      {boxes.map((box) => (
        <span key={box.id} className={styles.digitBox}>
          <span className={`pix ${styles.digits}`}>{pad2(box.value)}</span>
          <span className={`pix ${styles.unit}`}>{box.unit}</span>
        </span>
      ))}
    </div>
  )
}

/** Testata del torneo: sfondo sfocato, copertina, stato, titolo, gioco, data e conto alla rovescia. */
function Hero({ tournament, systems, now, poster, children }) {
  const game = tournament.gameInfo
  return (
    <header className={poster ? `${styles.hero} ${styles.poster}` : styles.hero}>
      <HeroBackdrop game={game} />
      <Cover game={game} systems={systems} className={poster ? styles.posterCover : styles.heroCover} />
      <div className={styles.heroText}>
        <span className={`pix ${styles.kicker}`}>TOURNAMENT</span>
        <StatusBadge tournament={tournament} />
        <h2 className={`pix ${styles.title}`}>{tournament.series ? tournament.series.name : tournament.fullTitle}</h2>
        {tournament.edition && (
          <p className={`pix ${styles.edition}`}>
            {tournament.edition}ª EDIZIONE{tournament.title ? ` — ${tournament.title.toUpperCase()}` : ''}
          </p>
        )}
        {game && (
          <p className={styles.game}>
            {game.title}
            <span className={`pix ${styles.system}`}>{game.systemName}</span>
          </p>
        )}
        {tournament.startsAt && <p className={styles.date}>{formatStart(tournament.startsAt)}</p>}
        <Countdown tournament={tournament} now={now} />
        {children}
      </div>
    </header>
  )
}

/** Pallini dei posti: uno per iscritto nel suo colore, tratteggiati quelli liberi. */
function SeatDots({ tournament }) {
  const free = freeSeats(tournament)
  const shown = free === null ? 0 : Math.min(free, FREE_SHOWN)
  return (
    <div className={styles.seatDots}>
      {(tournament.players || []).map((player) => (
        <span key={player.id} className={styles.seatDot} style={{ background: player.color }} title={player.name} />
      ))}
      {Array.from({ length: shown }, (_, at) => (
        <span key={`free-${at}`} className={`${styles.seatDot} ${styles.seatFree}`} />
      ))}
      {free !== null && free > shown && <span className={styles.seatMore}>+{free - shown}</span>}
      <span className={styles.seatText}>{seatsLabel(tournament)}</span>
    </div>
  )
}

/**
 * Schede degli iscritti: avatar, nome, corona dell'admin, P1/P2 per chi è entrato; posti liberi tratteggiati.
 * Col torneo in corso sono in ordine di testa di serie (nella doppia prima chi è in gioco, poi gli usciti per
 * piazzamento), con il numero, e gli eliminati sono attenuati con il turno in cui sono usciti; a torneo
 * concluso hanno il piazzamento.
 */
function Roster({ tournament, players }) {
  const running = hasBoard(tournament)
  const done = tournament.status === 'done'
  const free = running ? null : freeSeats(tournament)
  const shown = free === null ? 0 : Math.min(free, FREE_SHOWN)
  const rounds = roundsOf(tournament.matches)
  const slotOfAccount = (id) => SLOTS.find((slot) => players[slot].user && !players[slot].user.guest &&
    players[slot].user.id === id) || null
  const list = running ? rosterOrder(tournament) : tournament.players || []
  return (
    <section className={styles.roster}>
      <div className={styles.sectionHead}>
        <span className={`pix ${styles.label}`}>ISCRITTI</span>
        <span className={styles.seatText}>
          {done ? `${list.length} iscritti` : running ? `${list.length} in gara` : seatsLabel(tournament)}
        </span>
      </div>
      <ul className={styles.rosterGrid}>
        {list.map((player) => {
          const slot = slotOfAccount(player.id)
          const entry = running ? rosterEntry(tournament, player.id, rounds) : null
          const out = entry ? entry.note : null
          // A torneo concluso si attenua chi non è sul podio; in corso chi è uscito.
          const dim = done ? !player.place || player.place > 3 : Boolean(entry && entry.out)
          return (
            <li key={player.id} className={dim ? `${styles.card} ${styles.out}` : styles.card}
              style={{ '--player': player.color || 'var(--text-4)' }}>
              {running && player.seed ? <span className={`pix ${styles.seedTag}`}>{player.seed}</span> : null}
              <Avatar id={player.id} name={player.name} className={styles.avatar} style={{ background: player.color }} />
              <span className={styles.cardText}>
                <span className={styles.cardName}>{player.name}</span>
                {out && <span className={styles.cardNote}>{out}</span>}
              </span>
              {player.id === tournament.creatorId && <span className={styles.crown} title="Admin">♛</span>}
              {slot && (
                <span className={`pix ${styles.slotTag}`} style={{ background: PLAYER_INFO[slot].color }}>
                  {PLAYER_INFO[slot].tag}
                </span>
              )}
            </li>
          )
        })}
        {Array.from({ length: shown }, (_, at) => (
          <li key={`free-${at}`} className={`${styles.card} ${styles.freeCard}`}>
            <span className={`${styles.avatar} ${styles.freeAvatar}`}>+</span>
            <span className={styles.cardName}>Posto libero</span>
          </li>
        ))}
        {free !== null && free > shown && (
          <li className={`${styles.card} ${styles.freeCard}`}>
            <span className={styles.cardName}>e altri {free - shown} posti</span>
          </li>
        )}
      </ul>
      {!(tournament.players || []).length && free === null && (
        <p className={`${styles.empty} ${styles.emptyKey}`}>
          Ancora nessuno: premi
          <FaceButton position="south" />
          per iscriverti.
        </p>
      )}
    </section>
  )
}

/** Premi con le medaglie: oro, argento e bronzo con gli XP. */
function Prizes({ tournament, rewardXp }) {
  return (
    <section className={styles.panel}>
      <span className={`pix ${styles.label}`}>PREMI</span>
      {tournament.rewards ? (
        <div className={styles.medals}>
          {MEDALS.map((medal, at) => (
            <span key={medal.id} className={`${styles.medal} ${styles[medal.id]}`}>
              <span className={`pix ${styles.medalPlace}`}>{medal.label}</span>
              <span className={styles.medalXp}>{rewardXp[at] ? `${rewardXp[at]} XP` : 'XP'}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>Nessun premio: si gioca per la gloria.</p>
      )}
    </section>
  )
}

/** Formato a etichette e admin. */
function Rules({ tournament }) {
  return (
    <section className={styles.panel}>
      <span className={`pix ${styles.label}`}>FORMATO</span>
      <ul className={styles.chips}>
        {formatChips(tournament).map((chip) => (
          <li key={chip.id} className={styles.chip}>
            <span className={styles.chipLabel}>{chip.label}</span>
            {chip.value && <span className={styles.chipValue}>{chip.value}</span>}
          </li>
        ))}
      </ul>
      <p className={styles.admin}>
        <span className={styles.chipLabel}>Admin</span>
        <span className={styles.adminName}>
          <span className={styles.adminDot} style={{ background: tournament.creator.color || 'var(--text-4)' }} />
          <span className={styles.adminText}>{tournament.creator.name}</span>
          <span className={styles.crown}>♛</span>
        </span>
      </p>
    </section>
  )
}

/** Dettaglio di un torneo: testata, descrizione, stato di partenza, formato, premi e iscritti. */
function Detail({ tournament, systems, now, wide, rewardXp, players, series, rankTab, boxRef }) {
  const about = tournament.series && tournament.series.description
  const game = tournament.gameInfo
  const edition = tournament.edition
    ? `${tournament.edition}ª EDIZIONE${tournament.title ? ` — ${tournament.title.toUpperCase()}` : ''}`
    : ''
  return (
    <article key={tournament.id} ref={boxRef} className={wide ? `${styles.detail} ${styles.wide}` : styles.detail}>
      {/* Come il manifesto del salvaschermo: copertina e stato di partenza da un lato, le informazioni dall'altro. */}
      <header className={styles.top}>
        <HeroBackdrop game={game} />
        <div className={styles.media}>
          <Cover game={game} systems={systems} className={styles.mediaCover} />
          {tournament.thumb && (
            <figure className={`${styles.start} ${styles.mediaStart}`}>
              <img src={api.tournamentThumbUrl(tournament.id, tournament.updatedAt)} alt="" />
              <figcaption className={`pix ${styles.startCaption}`}>SI PARTE DA QUI</figcaption>
            </figure>
          )}
        </div>
        <div className={styles.topInfo}>
          <div className={styles.heroText}>
            <span className={`pix ${styles.kicker}`}>TOURNAMENT</span>
            <StatusBadge tournament={tournament} />
            <h2 className={`pix ${styles.title}`}>{tournament.series ? tournament.series.name : tournament.fullTitle}</h2>
            {edition && <p className={`pix ${styles.edition}`}>{edition}</p>}
            {game && (
              <p className={styles.game}>
                {game.title}
                <span className={`pix ${styles.system}`}>{game.systemName}</span>
              </p>
            )}
            {tournament.startsAt && <p className={styles.date}>{formatStart(tournament.startsAt)}</p>}
            <Countdown tournament={tournament} now={now} />
          </div>
          {(about || tournament.description) && (
            <div className={styles.texts}>
              {about && <p className={styles.description}>{about}</p>}
              {tournament.description && <p className={styles.description}>{tournament.description}</p>}
            </div>
          )}
          <div className={styles.stack}>
            <Rules tournament={tournament} />
            {tournament.status === 'done' ? (
              <section className={styles.panel}>
                <span className={`pix ${styles.label}`}>PODIO</span>
                <Podium tournament={tournament} />
              </section>
            ) : (
              <Prizes tournament={tournament} rewardXp={rewardXp} />
            )}
          </div>
        </div>
      </header>
      <div className={styles.body}>
        <Roster tournament={tournament} players={players} />
        {series && (
          <section className={styles.panel}>
            <span className={`pix ${styles.label}`}>CLASSIFICHE DELLA SERIE</span>
            <SeriesRankings series={series} tab={rankTab} />
          </section>
        )}
      </div>
    </article>
  )
}

/** Primo antenato che scorre davvero (il contenitore della scheda), per ▲ ▼ nel dettaglio. */
function scrollParent(node) {
  let element = node ? node.parentElement : null
  while (element) {
    const overflow = window.getComputedStyle(element).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && element.scrollHeight > element.clientHeight) {
      return element
    }
    element = element.parentElement
  }
  return null
}

/** Uno dei due giocatori del prossimo incontro: avatar, nome e testa di serie (o da dove arriverà). */
function Contender({ match, side, people, matches }) {
  const id = side === 'a' ? match.playerA : match.playerB
  const person = id === null || id === undefined ? null : people.get(id)
  if (!person) {
    return (
      <span className={styles.contender}>
        <span className={`${styles.avatar} ${styles.freeAvatar}`}>?</span>
        <span className={styles.contenderName}>{slotText(match, side, people, matches)}</span>
      </span>
    )
  }
  return (
    <span className={styles.contender} style={{ '--player': person.color || 'var(--text-4)' }}>
      <Avatar id={person.id} name={person.name} className={`${styles.avatar} ${styles.bigAvatar}`}
        style={{ background: person.color }} />
      <span className={styles.contenderName}>{person.name}</span>
      {person.seed ? <span className={`pix ${styles.contenderSeed}`}>TESTA DI SERIE {person.seed}</span> : null}
    </span>
  )
}

/**
 * Riquadro del torneo in corso: «Prossimo incontro» (o «In gioco ora» col pallino rosso) con i due
 * giocatori, il turno e la serie, e «Incontro N di M».
 */
function NextMatch({ tournament }) {
  const matches = tournament.matches || []
  const match = nextMatch(matches)
  const step = progressLabel(matches)
  const notice = playoffNotice(tournament)
  if (!match) {
    return step || notice ? (
      <>
        {notice && <p className={styles.playoffNotice}>{notice}.</p>}
        {step && <p className={`pix ${styles.progress}`}>{step.toUpperCase()}</p>}
      </>
    ) : null
  }
  const people = new Map((tournament.players || []).map((player) => [player.id, player]))
  const playing = match.status === 'playing'
  const league = match.bracket === 'league'
  // Nel girone «Giornata 3 di 7» (con «· Ritorno») e chi riposa in quella giornata.
  const round = league
    ? `${leagueDayLabel(match, matches)}${isReturnLeg(match, matches) ? ' · Ritorno' : ''}`
    : matchRound(match, matches)
  const day = league
    ? leagueDays(matches, (tournament.players || []).map((player) => player.id)).find((item) => item.round === match.round)
    : null
  const resting = day ? day.resting.map((id) => (people.get(id) ? people.get(id).name : '?')) : []
  return (
    <div className={playing ? `${styles.nextBox} ${styles.nextLive}` : styles.nextBox}>
      <span className={`pix ${styles.nextHead}`}>
        {playing && <span className={styles.liveDot} aria-hidden="true" />}
        {playing ? 'IN GIOCO ORA' : 'PROSSIMO INCONTRO'}
      </span>
      <div className={styles.versus}>
        <Contender match={match} side="a" people={people} matches={matches} />
        <span className={`pix ${styles.vs}`}>VS</span>
        <Contender match={match} side="b" people={people} matches={matches} />
      </div>
      <span className={styles.nextMeta}>
        {round} · {matchSeriesLabel(tournament, match.series)}
      </span>
      {resting.length > 0 && <span className={styles.nextMeta}>Riposa: {resting.join(', ')}</span>}
      {notice && <span className={styles.playoffNotice}>{notice}.</span>}
      {step && <span className={`pix ${styles.progress}`}>{step.toUpperCase()}</span>}
    </div>
  )
}

/**
 * Tabellone a tutta larghezza, sotto una fascia con titolo, gioco, formato e avanzamento (in corso) o
 * «CONCLUSO» (in sola lettura).
 */
function Board({ tournament, systems, cursor, onFocus, pane = 'calendar', row = null, onRow }) {
  const matches = tournament.matches || []
  const next = nextMatch(matches)
  const game = tournament.gameInfo
  return (
    <div className={styles.board}>
      <header className={styles.band}>
        <HeroBackdrop game={game} />
        <Cover game={game} systems={systems} className={styles.miniCover} />
        <span className={styles.bandText}>
          <span className={`pix ${styles.bandTitle}`}>{tournament.fullTitle}</span>
          <span className={styles.bandNote}>
            {game ? game.title : 'Senza gioco'} · {formatLabel(tournament.format || 'single')}
          </span>
        </span>
        <span className={styles.bandSide}>
          <StatusBadge tournament={tournament} />
          {tournament.status === 'running' && (
            <span className={`pix ${styles.progress}`}>{progressLabel(matches).toUpperCase()}</span>
          )}
          {playoffNotice(tournament) && <span className={styles.playoffNotice}>{playoffNotice(tournament)}</span>}
        </span>
      </header>
      {isLeague(matches) ? (
        // Girone: classifica e calendario affiancati; L1/R1 passano dall'uno all'altro.
        <div className={styles.league}>
          <section className={pane === 'table' ? `${styles.pane} ${styles.paneOn}` : styles.pane}>
            <h2 className={`pix ${styles.paneTitle}`}>CLASSIFICA</h2>
            <LeagueTable tournament={tournament} focus={row} onFocus={onRow} dim={pane !== 'table'} />
          </section>
          <section className={pane === 'table' ? styles.pane : `${styles.pane} ${styles.paneOn}`}>
            <h2 className={`pix ${styles.paneTitle}`}>CALENDARIO</h2>
            <LeagueCalendar
              matches={matches}
              players={tournament.players}
              next={next ? next.key : null}
              focus={cursor}
              onFocus={onFocus}
              dim={pane === 'table'}
              options={leagueOptions(tournament)}
              playoff={tournament.playoff}
            />
          </section>
        </div>
      ) : (
        <Bracket
          matches={matches}
          players={tournament.players}
          next={next ? next.key : null}
          focus={cursor}
          onFocus={onFocus}
        />
      )}
    </div>
  )
}

/** Anteprima sulla scheda, prima di entrare: manifesto del primo torneo e piccole schede degli altri. */
function Preview({ tournaments, systems, now, onEnter }) {
  const [first, ...others] = tournaments
  return (
    <div className={styles.preview}>
      <Hero tournament={first} systems={systems} now={now} poster>
        {first.status === 'running' && <NextMatch tournament={first} />}
        {first.status === 'done' && <div className={styles.previewPodium}><Podium tournament={first} /></div>}
        {first.status !== 'running' && first.status !== 'done' && <SeatDots tournament={first} />}
        <button type="button" className={`pix ${styles.enter}`} onClick={onEnter}>
          <FaceButton position="south" />
          ENTRA
        </button>
      </Hero>
      {others.length > 0 && (
        <div className={styles.others}>
          <span className={`pix ${styles.label}`}>{others.length === 1 ? 'ALTRO TORNEO' : `ALTRI ${others.length} TORNEI`}</span>
          <ul className={styles.otherList}>
            {others.map((item) => (
              <li key={item.id} className={styles.other}>
                <Cover game={item.gameInfo} systems={systems} className={styles.miniCover} />
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{item.fullTitle}</span>
                  <span className={styles.rowNote}>{tabStatus(item, now)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Scheda TOURNAMENT tra le console (README «Torneo»), come la scheda
 * Minecraft su due livelli:
 *
 * - **sulla scheda** un'anteprima; L1/R1, START e SELECT restano della
 *   dashboard, ✕ (A) entra;
 * - **dentro** tutti i tasti vanno alla scheda (tranne START, per far entrare
 *   un giocatore): con più tornei l'elenco a sinistra (▲ ▼) e il dettaglio a
 *   destra, con uno solo il dettaglio a tutta larghezza. ✕ apre il menu del
 *   giocatore che l'ha premuto (Iscriviti / Ritirati, e per l'admin come P1
 *   le sue azioni, con la combinazione se il torneo ce l'ha); ○ (B) torna
 *   alla scheda.
 *
 * «Iscrivi un profilo…» e «Togli un iscritto…» chiedono la combinazione una
 * volta sola, all'apertura dell'elenco, valida finché resta aperto.
 * Il torneo in corso, primo dell'elenco, con ✕ apre il tabellone (dalla
 * scheda direttamente, se è l'unico torneo): la croce sposta il cursore tra
 * gli incontri, ✕ apre il menu dell'incontro («Partite»), △ (Y) «Info
 * torneo», ○ torna indietro di un livello.
 * L'avviso all'ingresso apre la scheda su un torneo con `store.requestFocus`.
 * Riceve gli eventi da `inputRef.current(event)` e indica la legenda con `onContext`.
 */
export default function TournamentView({ inputRef, onContext }) {
  const { state, dispatch, loadAllGames } = useApp()
  const { list, focus, rewardXp, series: seriesList } = store.useTournaments()
  // Classifica della serie mostrata nel dettaglio (le spalle la cambiano).
  const [rankTab, setRankTab] = useState('medals')
  // Dettaglio a schermo: ▲ ▼ fanno scorrere il suo contenitore.
  const detailRef = useRef(null)
  const tournaments = tabTournaments(list)
  const [inside, setInside] = useState(false)
  const [index, setIndex] = useState(0)
  // Menu del torneo: `{slot, cursor}`.
  const [menu, setMenu] = useState(null)
  // Elenco dei profili dell'admin: `{kind: 'add' | 'remove', combo, cursor}`.
  const [picker, setPicker] = useState(null)
  // Combinazione dell'admin: `{kind: 'enter', sequence, message, error, submit}`.
  const [combo, setCombo] = useState(null)
  // Conferma: `{text, choice, onYes}`.
  const [confirm, setConfirm] = useState(null)
  // Schermata «Avvia» dell'admin: `{id, check, combo}`, con la sua legenda e la funzione dei tasti.
  const [start, setStart] = useState(null)
  const [startContext, setStartContext] = useState('tournamentStart1')
  const startInput = useRef(null)
  // Tabellone del torneo in corso: `{cursor}` = chiave dell'incontro col cursore; nel girone anche
  // `pane` ('calendar' o 'table', il riquadro col cursore) e `row` (riga della classifica col cursore).
  const [board, setBoard] = useState(null)
  // Menu dell'incontro col cursore: `{slot, cursor}`; elenco delle sue partite: `{cursor}`.
  const [matchMenu, setMatchMenu] = useState(null)
  const [gameList, setGameList] = useState(null)
  // Incontri del giocatore scelto nella classifica del girone: `{player, cursor}`.
  const [playerList, setPlayerList] = useState(null)
  // Scelta del giocatore per un'azione dell'admin sull'incontro: `{kind: 'walkover' | 'withdraw', match, code, cursor}`.
  const [adminPick, setAdminPick] = useState(null)
  // Esito del sorteggio del girone: `{draw, tournament, step: 'draw' | 'podium', cursor}`.
  const [lots, setLots] = useState(null)
  // «Info torneo» aperta dal tabellone.
  const [info, setInfo] = useState(false)
  const infoRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const live = useRef({})
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), CLOCK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const count = tournaments.length
  const at = Math.min(index, Math.max(0, count - 1))
  const tournament = count ? tournaments[at] : null
  const running = Boolean(tournament && tournament.status === 'running')
  const shownId = tournament ? tournament.id : null
  useEffect(() => {
    const box = scrollParent(detailRef.current)
    if (box) {
      box.scrollTo({ top: 0 })
    }
  }, [shownId])
  const tournamentSeries = tournament && tournament.series
    ? (seriesList || []).find((item) => item.id === tournament.series.id) || null
    : null
  // Tabellone: del torneo in corso o, in sola lettura, di quello concluso.
  const boarded = hasBoard(tournament)
  const matches = boarded ? tournament.matches || [] : []
  const layout = bracketLayout(matches)
  const keys = layout.cells.map((cell) => cell.key)
  // L1/R1 tra le sezioni del disegno solo se ce n'è più d'una (nella diretta: tabellone e 3° posto).
  const sectioned = cursorSections(layout).length > 1
  const nextOne = nextMatch(matches)
  // Cursore del tabellone: quello scelto se l'incontro c'è ancora, altrimenti il prossimo incontro.
  const boardCursor = board && keys.includes(board.cursor) ? board.cursor
    : nextOne ? nextOne.key : keys.length ? keys[0] : null
  const focused = boardCursor ? matches.find((match) => match.key === boardCursor) || null : null
  // Girone: classifica e calendario affiancati, col cursore in uno dei due riquadri.
  const league = isLeague(matches)
  const table = league ? leagueTable(tournament) : []
  const pane = board && league && board.pane === 'table' ? 'table' : 'calendar'
  const tableRow = table.length ? Math.min((board && board.row) || 0, table.length - 1) : null
  const playerItems = playerList ? playerMatches(tournament, playerList.player) : []
  // Ultimo incontro visitato in ogni sezione, per tornarci con L1/R1; si azzera chiudendo il tabellone.
  const sectionMemory = useRef({})
  useEffect(() => {
    if (!board) {
      sectionMemory.current = {}
      return
    }
    const section = sectionOf(layout, boardCursor)
    if (section) {
      sectionMemory.current[section] = boardCursor
    }
  })
  const people = new Map(((tournament && tournament.players) || []).map((player) => [player.id, player]))

  // Chiusa la schermata «Incontro» (incontro vinto o sospeso), il cursore torna sul prossimo incontro.
  const matchOpenNow = Boolean(state.match)
  const wasMatch = useRef(matchOpenNow)
  useEffect(() => {
    if (wasMatch.current && !matchOpenNow) {
      setBoard((value) => (value ? { cursor: null } : value))
      setMatchMenu(null)
    }
    wasMatch.current = matchOpenNow
  }, [matchOpenNow])

  // Richiesta dell'avviso all'ingresso: si entra sul torneo (o sull'elenco), col menu del giocatore aperto.
  useEffect(() => {
    if (!focus || list === null) {
      return
    }
    store.clearFocus()
    const position = focus.id === null ? -1 : tournaments.findIndex((item) => item.id === focus.id)
    setInside(true)
    setPicker(null)
    setCombo(null)
    setConfirm(null)
    setBoard(null)
    setMatchMenu(null)
    setGameList(null)
    setPlayerList(null)
    setInfo(false)
    if (position >= 0) {
      setIndex(position)
    }
    setMenu(position >= 0 && focus.menu ? { slot: focus.slot, cursor: 0 } : null)
  }, [focus, list, tournaments])

  const toast = useCallback((message, variant) => dispatch(showToast(message, variant)), [dispatch])

  const userOf = useCallback((slot) => (slot ? state.players[slot].user : null), [state.players])

  // Esegue la chiamata `call` e aggiorna il torneo; restituisce vero se è andata.
  const perform = useCallback(async (call, done) => {
    setBusy(true)
    try {
      const data = await call()
      store.replace(data.tournament)
      if (done) {
        toast(typeof done === 'function' ? done(data) : done)
      }
      return true
    } catch (error) {
      if (lockedError(error)) {
        throw error
      }
      toast(error.message, 'error')
      store.refresh()
      return false
    } finally {
      setBusy(false)
    }
  }, [toast])

  // Azione dell'admin: con la combinazione se il torneo ce l'ha. `run(combo)` restituisce una promessa.
  const asAdmin = useCallback((target, run) => {
    if (!target.combo) {
      run(null).catch(() => {})
      return
    }
    setCombo({
      kind: 'enter',
      sequence: [],
      message: '',
      error: false,
      submit: run,
    })
  }, [])

  const comboConfirm = useCallback(async () => {
    const current = live.current.combo
    if (!current || live.current.busy) {
      return
    }
    try {
      await current.submit(current.sequence)
      setCombo(null)
    } catch (error) {
      if (lockedError(error)) {
        setCombo({ ...current, sequence: [], message: error.message, error: true })
      } else {
        setCombo(null)
        toast(error.message, 'error')
      }
    }
  }, [toast])

  const comboClear = useCallback(() => {
    const current = live.current.combo
    if (!current) {
      return
    }
    if (!current.sequence.length) {
      setCombo(null)
      return
    }
    setCombo({ ...current, sequence: [], message: '', error: false })
  }, [])

  const admin = state.players.p1.user
  const adminId = admin && !admin.guest ? admin.id : null

  // Voci dell'elenco dei profili: da iscrivere (profili non iscritti) o da togliere (iscritti).
  const pickerItems = useCallback((current, target) => {
    if (!current || !target) {
      return []
    }
    if (current.kind === 'add') {
      return state.accounts
        .filter((account) => !isEnrolled(target, account.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'it'))
        .map((account) => ({ id: account.id, label: account.name, color: account.color, disabled: isFull(target) }))
    }
    return (target.players || []).map((player) => ({ id: player.id, label: player.name, color: player.color }))
  }, [state.accounts])

  const pickProfile = useCallback((position) => {
    const current = live.current.picker
    const target = live.current.tournament
    const items = pickerItems(current, target)
    const item = items[position]
    if (!item || live.current.busy) {
      return
    }
    if (current.kind === 'add') {
      if (item.disabled) {
        toast('Iscrizioni al completo.')
        return
      }
      perform(() => api.tournamentPlayerAdd(target.id, adminId, current.combo, item.id), `${item.label} iscritto.`)
        .catch((error) => toast(error.message, 'error'))
      return
    }
    setConfirm({
      text: `Togliere ${item.label} dagli iscritti a «${target.fullTitle}»?`,
      choice: 'no',
      onYes: () => perform(() => api.tournamentPlayerRemove(target.id, adminId, current.combo, item.id),
        `${item.label} tolto dagli iscritti.`).catch((error) => toast(error.message, 'error')),
    })
  }, [pickerItems, perform, adminId, toast])

  // Voce `item` del menu del torneo, scelta dal giocatore `slot`.
  const chooseItem = useCallback((item, slot) => {
    const target = live.current.tournament
    if (!item || !target || live.current.busy) {
      return
    }
    if (item.disabled) {
      toast(item.id === 'remove' ? 'Non ci sono iscritti.' : `${item.label}.`)
      return
    }
    const user = userOf(slot)
    setMenu(null)
    switch (item.id) {
      case 'practice': {
        // Al gioco del torneo nella libreria: si caricano i giochi della sua console, poi si seleziona.
        const system = stateRef.current.systems.find((entry) => entry.id === target.system)
        if (!system) {
          toast('Il gioco del torneo non è nella libreria.')
          break
        }
        loadAllGames([system], stateRef.current.games).then(() => {
          setInside(false)
          dispatch(showGame(target.system, target.game))
        })
        break
      }
      case 'join':
        perform(() => api.tournamentJoin(target.id, user.id), `Iscritto a «${target.fullTitle}».`)
        break
      case 'leave':
        setConfirm({
          text: `Ritirarti da «${target.fullTitle}»?`,
          choice: 'no',
          onYes: () => perform(() => api.tournamentLeave(target.id, user.id), `Ti sei ritirato da «${target.fullTitle}».`),
        })
        break
      case 'create':
        store.creating.add(slot)
        dispatch(clickSlot(slot))
        dispatch(loginStep(slot, 'new'))
        break
      case 'add':
      case 'remove': {
        const open = (code) => {
          setPicker({ kind: item.id, combo: code, cursor: 0 })
          return Promise.resolve()
        }
        if (!target.combo) {
          open(null)
        } else {
          asAdmin(target, async (code) => {
            await api.tournamentUnlock(target.id, adminId, code)
            await open(code)
          })
        }
        break
      }
      case 'close': {
        // Conferma con il numero di incontri sugli iscritti attuali; il messaggio finale usa quello del backend.
        const count = (target.players || []).length
        setConfirm({
          text: `Chiudere le iscrizioni di «${target.fullTitle}»? ` +
            matchesText(count, matchCount(target.format || 'single', count, target.thirdPlace, target.options),
              target.format || 'single'),
          choice: 'no',
          onYes: () => asAdmin(target, async (code) => {
            await perform(() => api.tournamentRegistration(target.id, adminId, code, true),
              (data) => `Iscrizioni chiuse. ${matchesText((data.tournament.players || []).length, data.matches,
                data.tournament.format || 'single')}`)
          }),
        })
        break
      }
      case 'reopen':
        asAdmin(target, async (code) => {
          await perform(() => api.tournamentRegistration(target.id, adminId, code, false), 'Iscrizioni riaperte.')
        })
        break
      case 'start': {
        // Controlli prima della combinazione; il backend li ripete con `start/check`.
        if ((target.players || []).length < PLAYERS_MIN) {
          toast(`Servono almeno ${PLAYERS_MIN} iscritti per avviare il torneo.`)
          break
        }
        const running = (live.current.list || []).find((item) => item.status === 'running' && item.id !== target.id)
        if (running) {
          toast(`C’è già un torneo in corso: «${running.fullTitle}». Va concluso o annullato prima.`)
          break
        }
        const open = async (code) => {
          const check = await api.tournamentStartCheck(target.id, adminId, code)
          setStartContext('tournamentStart1')
          setStart({ id: target.id, check, combo: code, admin: adminId })
        }
        if (target.combo) {
          asAdmin(target, open)
        } else {
          setBusy(true)
          open(null)
            .catch((error) => toast(error.message, 'error'))
            .finally(() => setBusy(false))
        }
        break
      }
      default:
        break
    }
  }, [userOf, perform, dispatch, asAdmin, adminId, toast, loadAllGames])

  const openMenu = useCallback((slot) => {
    const target = live.current.tournament
    if (!target) {
      return
    }
    if (!slot) {
      toast(NOT_JOINED)
      return
    }
    const items = menuItems(target, slot, userOf(slot))
    if (!items.length) {
      toast(NO_ACTIONS)
      return
    }
    setMenu({ slot, cursor: 0 })
  }, [userOf, toast])

  // Apre il tabellone del torneo in corso, col cursore sul prossimo incontro.
  const openBoard = useCallback(() => {
    setBoard({ cursor: null })
    setMatchMenu(null)
    setGameList(null)
    setPlayerList(null)
    setInfo(false)
  }, [])

  // Menu dell'incontro col cursore, del giocatore che ha premuto.
  const openMatchMenu = useCallback((slot) => {
    if (!live.current.focused) {
      return
    }
    if (!slot) {
      toast(NOT_JOINED)
      return
    }
    setMatchMenu({ slot, cursor: 0 })
  }, [toast])

  // Incontro scelto tra quelli del giocatore della classifica: si chiude l'elenco e il cursore va su di lui
  // nel calendario.
  const showPlayerMatch = useCallback((position) => {
    const item = live.current.playerItems[position]
    if (!item) {
      return
    }
    setPlayerList(null)
    setBoard((value) => ({ ...value, cursor: item.id, pane: 'calendar' }))
  }, [])

  // Voce del menu dell'incontro. «Annulla il torneo…» (admin): conferma, poi la combinazione se c'è.
  const chooseMatchItem = useCallback((item) => {
    const target = live.current.tournament
    if (!item || !target || live.current.busy) {
      return
    }
    if (item.id === 'games') {
      setGameList({ cursor: 0 })
      return
    }
    if (item.id === 'play') {
      // Schermata «Incontro»: P1 e P2 diventano i due giocatori, con i joypad dei due slot (o quelli collegati).
      const { focused: match, people: known, matchMenu: opened } = live.current
      const user = opened ? stateRef.current.players[opened.slot].user : null
      if (!match || !user) {
        return
      }
      const users = [match.playerA, match.playerB].map((id) => {
        const person = known.get(id)
        return { id, name: person ? person.name : '?', color: person ? person.color : null }
      })
      const connected = typeof navigator !== 'undefined' && navigator.getGamepads
        ? Array.from(navigator.getGamepads() || []).filter(Boolean).map((pad) => pad.index) : []
      setMatchMenu(null)
      dispatch(matchOpen({ tournament: target.id, match: match.id, account: user.id }, users,
        matchPads(stateRef.current.players, connected)))
      return
    }
    if (item.disabled) {
      toast(item.note ? `${item.label.replace(/…$/, '')}: ${item.note}.` : NO_ACTIONS)
      return
    }
    if (item.id === 'walkover' || item.id === 'withdraw') {
      // Combinazione alla scelta dell'azione, poi chi vince o chi ritirare, poi la conferma.
      const match = live.current.focused
      setMatchMenu(null)
      asAdmin(target, async (code) => {
        if (target.combo) {
          await api.tournamentUnlock(target.id, adminId, code)
        }
        setAdminPick({ kind: item.id, match: match.key, code, cursor: 0 })
      })
      return
    }
    if (item.id === 'undo') {
      const match = live.current.focused
      const text = undoText(target, match, live.current.people, target.matches || [])
      setMatchMenu(null)
      asAdmin(target, async (code) => {
        if (target.combo) {
          await api.tournamentUnlock(target.id, adminId, code)
        }
        setConfirm({
          text,
          choice: 'no',
          onYes: () => perform(() => api.tournamentMatchUndo(target.id, match.id, adminId, code),
            (data) => undoneMessage(data.undone)).catch((error) => toast(error.message, 'error')),
        })
      })
      return
    }
    if (item.id === 'lots') {
      // Sorteggio del girone: conferma, combinazione, poi l'ordine estratto e il podio.
      setMatchMenu(null)
      setConfirm({
        text: lotsText(target, live.current.people),
        choice: 'no',
        onYes: () => asAdmin(target, async (code) => {
          setBusy(true)
          try {
            const data = await api.tournamentDraw(target.id, adminId, code)
            store.replace(data.tournament)
            setLots({ draw: data.draw, tournament: data.tournament, step: 'draw', cursor: 0 })
          } catch (error) {
            if (lockedError(error)) {
              throw error
            }
            toast(error.message, 'error')
            store.refresh()
          } finally {
            setBusy(false)
          }
        }),
      })
      return
    }
    if (item.id === 'cancel') {
      setMatchMenu(null)
      setConfirm({
        text: `Il torneo è in corso: annullare «${target.fullTitle}»? I risultati restano nello storico.`,
        choice: 'no',
        onYes: () => asAdmin(target, async (code) => {
          setBusy(true)
          try {
            await api.tournamentCancel(target.id, adminId, code)
            toast('Torneo annullato.')
          } catch (error) {
            if (lockedError(error)) {
              throw error
            }
            toast(error.message, 'error')
          } finally {
            setBusy(false)
            store.refresh()
          }
        }),
      })
    }
  }, [asAdmin, adminId, toast, dispatch, perform])

  // Giocatori tra cui scegliere nell'azione dell'admin: i due dell'incontro (chi vince) o quelli in gara (chi ritirare).
  const pickMatch = adminPick ? matches.find((match) => match.key === adminPick.match) || null : null
  const pickItems = pickMatch
    ? (adminPick.kind === 'walkover' ? [pickMatch.playerA, pickMatch.playerB]
      : withdrawCandidates(tournament, pickMatch)).filter((id) => id !== null).map((id) => {
      const person = people.get(id)
      return { id, label: person ? person.name : '?', color: person ? person.color : null }
    })
    : []

  // Giocatore scelto nell'azione dell'admin: conferma, poi la chiamata con la combinazione già data.
  const pickAdminPlayer = useCallback((position) => {
    const { tournament: target, adminPick: current, pickItems: items, pickMatch: match } = live.current
    const item = items[position]
    if (!target || !current || !match || !item || live.current.busy) {
      return
    }
    setAdminPick(null)
    if (current.kind === 'walkover') {
      setConfirm({
        text: `Vittoria a tavolino di ${item.label}?`,
        choice: 'no',
        onYes: () => perform(() => api.tournamentMatchWalkover(target.id, match.id, adminId, current.code, item.id),
          `Vittoria a tavolino di ${item.label}.`).catch((error) => toast(error.message, 'error')),
      })
      return
    }
    setConfirm({
      text: withdrawText(match, item.id, live.current.people, target),
      choice: 'no',
      onYes: () => perform(() => api.tournamentWithdraw(target.id, adminId, current.code, item.id),
        `${item.label} ritirato dal torneo.`).catch((error) => toast(error.message, 'error')),
    })
  }, [perform, adminId, toast])

  const menuList = menu && tournament ? menuItems(tournament, menu.slot, userOf(menu.slot)) : []
  const lotsItems = lots ? lotsRows(lots.draw, people) : []
  const matchItems = focused
    ? [{ id: 'games', label: 'Partite', note: (focused.games || []).length ? `${focused.games.length} giocate` : NO_GAMES }]
    : []
  // «Gioca l'incontro»: solo sul prossimo, per uno dei due giocatori o per l'admin come P1.
  if (focused && matchMenu && canPlayMatch(tournament, focused, nextOne, matchMenu.slot, userOf(matchMenu.slot))) {
    matchItems.unshift({ id: 'play', label: 'Gioca l’incontro' })
  }
  // Azioni dell'admin: solo per il creatore come P1.
  if (focused && matchMenu) {
    matchItems.push(...adminMatchItems(tournament, focused, matchMenu.slot, userOf(matchMenu.slot)))
  }
  const gameItems = focused ? gameRows(focused, people) : []
  const pickerList = pickerItems(picker, tournament)

  // Il torneo aperto non c'è più (concluso, annullato o tolto dalla scheda): si chiudono le finestre.
  useEffect(() => {
    if (!tournament) {
      setMenu(null)
      setPicker(null)
      setCombo(null)
      setConfirm(null)
      setStart(null)
      setInside(false)
    }
  }, [tournament])

  // Il tabellone resta aperto solo sul torneo in corso o concluso; il menu dell'incontro solo col suo giocatore.
  useEffect(() => {
    if (!boarded || !inside) {
      setBoard(null)
      setMatchMenu(null)
      setGameList(null)
      setPlayerList(null)
      setAdminPick(null)
      setInfo(false)
    }
  }, [boarded, inside])
  useEffect(() => {
    if (matchMenu && !state.players[matchMenu.slot].user) {
      setMatchMenu(null)
      setGameList(null)
    }
  }, [matchMenu, state.players])

  // Il P1 non è più l'admin (profili usciti, ritorno a PRESS START, cambio di giocatore): si chiudono la
  // schermata «Avvia» e le finestre dell'admin, che rispondono solo a lui. Il torneo resta com'era.
  useEffect(() => {
    if (adminId === null || (start && start.admin !== adminId)) {
      setStart(null)
      setPicker(null)
      setCombo(null)
      setAdminPick(null)
    }
  }, [adminId, start])

  // Menu e conferme di un giocatore che non c'è più si chiudono.
  useEffect(() => {
    if (menu && !state.players[menu.slot].user) {
      setMenu(null)
    }
    if (confirm && !state.players.p1.user && !state.players.p2.user) {
      setConfirm(null)
    }
  }, [menu, confirm, state.players])

  // Schermata «Avvia» aperta: App sospende l'uscita automatica dei profili.
  useEffect(() => {
    store.setStarting(Boolean(start))
  }, [start])
  useEffect(() => () => store.setStarting(false), [])

  // La schermata «Avvia» si chiude se il torneo non è più con le iscrizioni aperte (avviato altrove o annullato).
  useEffect(() => {
    if (start && !(list || []).some((item) => item.id === start.id && item.status === 'open')) {
      setStart(null)
    }
  }, [start, list])

  useEffect(() => {
    live.current = {
      tournament, combo, busy, picker, menu, confirm, inside, count, menuList, pickerList, list, start,
      running, boarded, board, boardCursor, layout, nextOne, focused, matchMenu, matchItems, gameList, gameItems, info, people,
      adminPick, pickItems, pickMatch, league, table, pane, tableRow, playerList, playerItems, lots, lotsItems,
    }
  })

  let context = 'tournamentTab'
  if (start) {
    context = startContext
  } else if (combo) {
    context = 'tournamentCombo'
  } else if (confirm) {
    context = 'confirm'
  } else if (lots) {
    context = lots.step === 'podium' ? 'matchPodium' : 'tournamentLots'
  } else if (picker || menu) {
    context = 'picker'
  } else if (board && adminPick) {
    context = 'picker'
  } else if (board && playerList) {
    context = 'tournamentPlayerMatches'
  } else if (board && gameList) {
    context = 'tournamentGames'
  } else if (board && matchMenu) {
    context = 'tournamentMatchMenu'
  } else if (board && info) {
    context = 'tournamentInfo'
  } else if (board && league) {
    context = pane === 'table' ? 'tournamentLeagueTable' : 'tournamentLeagueCalendar'
  } else if (board) {
    context = sectioned ? 'tournamentBracketSections' : 'tournamentBracket'
  } else if (inside) {
    context = count > 1 ? (boarded ? 'tournamentListRunning' : 'tournamentList') : 'tournamentDetail'
  }
  useEffect(() => {
    onContext(context)
  }, [context, onContext])
  useEffect(() => () => onContext(null), [onContext])

  useEffect(() => {
    inputRef.current = (event) => {
      const current = live.current
      if (!current.tournament) {
        return false
      }
      const press = event.kind === 'press'
      const step = press || event.kind === 'repeat'
      if (!current.inside) {
        if (PASS_TAB.has(event.button)) {
          return false
        }
        if (press && event.button === 'a') {
          setInside(true)
          // Con il solo torneo in corso (o concluso) si va dritti al tabellone.
          if (current.count === 1 && current.boarded) {
            openBoard()
          }
        }
        return true
      }
      if (current.combo) {
        // Solo P1 (l'admin) compone la combinazione; START conferma, SELECT ricomincia, B annulla.
        if (slotOf(stateRef.current.players, event) !== 'p1') {
          return true
        }
        if (press && event.button === 'start') {
          comboConfirm()
        } else if (press && event.button === 'select') {
          comboClear()
        } else {
          const button = comboButton(event)
          if (button) {
            setCombo({ ...current.combo, sequence: [...current.combo.sequence, button], message: '', error: false })
          }
        }
        return true
      }
      if (current.start) {
        // La schermata «Avvia» è dell'admin, che è il P1.
        if (slotOf(stateRef.current.players, event) === 'p1' && startInput.current) {
          startInput.current(event)
        }
        return true
      }
      if (event.button === 'start') {
        return false
      }
      if (current.confirm) {
        if (press && event.button === 'a') {
          const { onYes, choice } = current.confirm
          setConfirm(null)
          if (choice === 'yes') {
            onYes()
          }
        } else if (press && event.button === 'b') {
          setConfirm(null)
        } else if (step) {
          setConfirm({ ...current.confirm, choice: moveChoice(YES_NO, current.confirm.choice, event.button, wraps(event)) })
        }
        return true
      }
      if (current.lots) {
        // Esito del sorteggio: ▲▼ scorrono, ✕ apre il podio; dal podio ✕ chiude.
        const items = current.lotsItems
        if (current.lots.step === 'draw' && step && (event.button === 'up' || event.button === 'down') && items.length) {
          setLots({ ...current.lots, cursor: stepIndex(current.lots.cursor, event.button === 'down' ? 1 : -1,
            items.length, wraps(event)) })
        } else if (press && event.button === 'a') {
          setLots(current.lots.step === 'draw' ? { ...current.lots, step: 'podium' } : null)
        }
        return true
      }
      if (current.picker) {
        if (slotOf(stateRef.current.players, event) !== 'p1') {
          return true
        }
        const items = current.pickerList
        if (step && (event.button === 'up' || event.button === 'down') && items.length) {
          const cursor = stepIndex(current.picker.cursor, event.button === 'down' ? 1 : -1, items.length, wraps(event))
          setPicker({ ...current.picker, cursor })
        } else if (press && event.button === 'a') {
          pickProfile(Math.min(current.picker.cursor, items.length - 1))
        } else if (press && event.button === 'b') {
          setPicker(null)
        }
        return true
      }
      if (current.menu) {
        // Il menu risponde solo al giocatore che l'ha aperto.
        if (slotOf(stateRef.current.players, event) !== current.menu.slot) {
          return true
        }
        const items = current.menuList
        if (step && (event.button === 'up' || event.button === 'down') && items.length) {
          const cursor = stepIndex(current.menu.cursor, event.button === 'down' ? 1 : -1, items.length, wraps(event))
          setMenu({ ...current.menu, cursor })
        } else if (press && event.button === 'a') {
          chooseItem(items[Math.min(current.menu.cursor, items.length - 1)], current.menu.slot)
        } else if (press && event.button === 'b') {
          setMenu(null)
        }
        return true
      }
      if (current.board) {
        if (current.adminPick) {
          // Scelta del giocatore dell'azione dell'admin: solo P1.
          if (slotOf(stateRef.current.players, event) !== 'p1') {
            return true
          }
          const items = current.pickItems
          if (step && (event.button === 'up' || event.button === 'down') && items.length) {
            setAdminPick({ ...current.adminPick, cursor: stepIndex(current.adminPick.cursor,
              event.button === 'down' ? 1 : -1, items.length, wraps(event)) })
          } else if (press && event.button === 'a') {
            pickAdminPlayer(Math.min(current.adminPick.cursor, items.length - 1))
          } else if (press && event.button === 'b') {
            setAdminPick(null)
          }
          return true
        }
        if (current.playerList) {
          // Incontri del giocatore della classifica: ✕ porta al calendario su quell'incontro, ○ torna alla classifica.
          const items = current.playerItems
          if (step && (event.button === 'up' || event.button === 'down') && items.length) {
            setPlayerList({ ...current.playerList, cursor: stepIndex(current.playerList.cursor,
              event.button === 'down' ? 1 : -1, items.length, wraps(event)) })
          } else if (press && event.button === 'a' && items.length) {
            showPlayerMatch(Math.min(current.playerList.cursor, items.length - 1))
          } else if (press && event.button === 'b') {
            setPlayerList(null)
          }
          return true
        }
        if (current.gameList) {
          // Elenco delle partite: solo da guardare; ○ torna al menu dell'incontro.
          if (slotOf(stateRef.current.players, event) !== current.matchMenu.slot) {
            return true
          }
          const items = current.gameItems
          if (step && (event.button === 'up' || event.button === 'down') && items.length) {
            setGameList({ cursor: stepIndex(current.gameList.cursor, event.button === 'down' ? 1 : -1, items.length,
              wraps(event)) })
          } else if (press && event.button === 'b') {
            setGameList(null)
          }
          return true
        }
        if (current.matchMenu) {
          if (slotOf(stateRef.current.players, event) !== current.matchMenu.slot) {
            return true
          }
          const items = current.matchItems
          if (step && (event.button === 'up' || event.button === 'down') && items.length) {
            const cursor = stepIndex(current.matchMenu.cursor, event.button === 'down' ? 1 : -1, items.length, wraps(event))
            setMatchMenu({ ...current.matchMenu, cursor })
          } else if (press && event.button === 'a') {
            chooseMatchItem(items[Math.min(current.matchMenu.cursor, items.length - 1)])
          } else if (press && event.button === 'b') {
            setMatchMenu(null)
          }
          return true
        }
        if (current.info) {
          if (step && (event.button === 'up' || event.button === 'down') && infoRef.current) {
            const box = infoRef.current
            box.scrollBy({ top: (event.button === 'down' ? 1 : -1) * box.clientHeight * INFO_STEP, behavior: 'smooth' })
          } else if (press && event.button === 'b') {
            setInfo(false)
          }
          return true
        }
        if (current.league) {
          // Girone: L1/R1 tra classifica e calendario; nel calendario ▲▼ incontri e ◀▶ giornate, nella
          // classifica ▲▼ giocatori e ✕ i loro incontri.
          const inTable = current.pane === 'table'
          if (press && (event.button === 'lb' || event.button === 'rb')) {
            setBoard((value) => ({ ...value, pane: inTable ? 'calendar' : 'table' }))
          } else if (inTable && step && (event.button === 'up' || event.button === 'down') && current.table.length) {
            const row = stepIndex(current.tableRow || 0, event.button === 'down' ? 1 : -1, current.table.length,
              wraps(event))
            setBoard((value) => ({ ...value, row }))
          } else if (inTable && press && event.button === 'a' && current.table.length) {
            const row = current.table[current.tableRow || 0]
            const items = playerMatches(current.tournament, row.id)
            const at = items.findIndex((item) => item.note.startsWith('Prossimo') || item.note.startsWith('In gioco'))
            setPlayerList({ player: row.id, cursor: Math.max(0, at) })
          } else if (!inTable && step && (event.button === 'up' || event.button === 'down')) {
            const cursor = moveCursor(current.layout, current.boardCursor, event.button, wraps(event))
            setBoard((value) => ({ ...value, cursor }))
          } else if (!inTable && step && (event.button === 'left' || event.button === 'right')) {
            const cursor = leagueDayStep(current.tournament.matches, current.boardCursor,
              event.button === 'right' ? 1 : -1, wraps(event))
            setBoard((value) => ({ ...value, cursor }))
          } else if (!inTable && press && event.button === 'a') {
            openMatchMenu(slotOf(stateRef.current.players, event))
          } else if (press && event.button === 'y') {
            setInfo(true)
          } else if (press && event.button === 'b') {
            setBoard(null)
            if (current.count === 1) {
              setInside(false)
            }
          }
          return true
        }
        if (step && DIRECTIONS.has(event.button)) {
          const cursor = moveCursor(current.layout, current.boardCursor, event.button, wraps(event))
          setBoard({ cursor })
        } else if (press && (event.button === 'lb' || event.button === 'rb')) {
          const cursor = jumpSection(current.layout, current.boardCursor, event.button === 'rb' ? 1 : -1,
            sectionMemory.current, current.nextOne ? current.nextOne.key : null)
          setBoard({ cursor })
        } else if (press && event.button === 'a') {
          openMatchMenu(slotOf(stateRef.current.players, event))
        } else if (press && event.button === 'y') {
          setInfo(true)
        } else if (press && event.button === 'b') {
          setBoard(null)
          if (current.count === 1) {
            setInside(false)
          }
        }
        return true
      }
      if (press && (event.button === 'lb' || event.button === 'rb')) {
        // Classifica della serie: Medagliere, Punti, Incontri.
        setRankTab((value) => stepRanking(value, event.button === 'rb' ? 1 : -1))
      } else if (step && (event.button === 'up' || event.button === 'down')) {
        // ▲ ▼ fanno scorrere il dettaglio; con più tornei ◀ ▶ cambiano torneo.
        const box = scrollParent(detailRef.current)
        if (box) {
          box.scrollBy({ top: (event.button === 'down' ? 1 : -1) * box.clientHeight * INFO_STEP, behavior: 'smooth' })
        }
      } else if (step && (event.button === 'left' || event.button === 'right') && current.count > 1) {
        setIndex((position) => stepIndex(Math.min(position, current.count - 1), event.button === 'right' ? 1 : -1,
          current.count, wraps(event)))
      } else if (press && event.button === 'y' && current.tournament && current.tournament.system) {
        // △: «Allenati» in ogni stato, anche a torneo in corso (dove A apre il tabellone).
        chooseItem({ id: 'practice', disabled: false }, slotOf(stateRef.current.players, event))
      } else if (press && event.button === 'a') {
        if (current.boarded) {
          openBoard()
        } else {
          openMenu(slotOf(stateRef.current.players, event))
        }
      } else if (press && event.button === 'b') {
        setInside(false)
      }
      return true
    }
    return () => {
      inputRef.current = null
    }
  }, [inputRef, comboConfirm, comboClear, pickProfile, chooseItem, openMenu, openBoard, openMatchMenu, chooseMatchItem,
    pickAdminPlayer, showPlayerMatch])

  if (!tournament) {
    return null
  }

  let overlay = null
  const startTarget = start ? (list || []).find((item) => item.id === start.id) : null
  if (start && startTarget) {
    overlay = (
      <TournamentStart
        tournament={startTarget}
        start={start}
        adminId={adminId}
        inputRef={startInput}
        onContext={setStartContext}
        onClose={() => setStart(null)}
      />
    )
  } else if (combo) {
    overlay = <ComboDialog combo={combo} onConfirm={comboConfirm} onClear={comboClear} onCancel={() => setCombo(null)} />
  } else if (confirm) {
    overlay = (
      <ConfirmDialog
        text={confirm.text}
        choice={confirm.choice}
        onHover={(choice) => setConfirm({ ...confirm, choice })}
        onChoose={(choice) => {
          setConfirm(null)
          if (choice === 'yes') {
            confirm.onYes()
          }
        }}
      />
    )
  } else if (lots && lots.step === 'podium') {
    overlay = (
      <div className={styles.lotsLayer}>
        <div className={styles.lotsBackdrop} />
        <section className={styles.lotsPodium} role="dialog" aria-label="Podio">
          <Podium tournament={lots.tournament} full />
          <button type="button" className={`pix ${styles.lotsClose}`} onClick={() => setLots(null)}>
            <FaceButton position="south" />
            CHIUDI
          </button>
        </section>
      </div>
    )
  } else if (lots) {
    overlay = (
      <PickerMenu
        title="SORTEGGIO"
        items={lotsItems}
        index={Math.min(lots.cursor, Math.max(0, lotsItems.length - 1))}
        empty="Nessun giocatore."
        onHover={(cursor) => setLots({ ...lots, cursor })}
        onPick={() => setLots({ ...lots, step: 'podium' })}
        onClose={() => setLots({ ...lots, step: 'podium' })}
      />
    )
  } else if (picker) {
    overlay = (
      <PickerMenu
        title={picker.kind === 'add' ? 'ISCRIVI UN PROFILO' : 'TOGLI UN ISCRITTO'}
        items={pickerList}
        index={Math.min(picker.cursor, Math.max(0, pickerList.length - 1))}
        empty={picker.kind === 'add' ? 'Tutti i profili sono già iscritti.' : 'Non ci sono iscritti.'}
        onHover={(cursor) => setPicker({ ...picker, cursor })}
        onPick={pickProfile}
        onClose={() => setPicker(null)}
      />
    )
  } else if (menu) {
    const user = userOf(menu.slot)
    overlay = (
      <PickerMenu
        title={user ? `${tournament.fullTitle.toUpperCase()} · ${user.name}` : tournament.fullTitle.toUpperCase()}
        items={menuList.map((item) => ({ ...item, note: item.admin ? 'Admin' : undefined }))}
        index={Math.min(menu.cursor, Math.max(0, menuList.length - 1))}
        empty={NO_ACTIONS}
        onHover={(cursor) => setMenu({ ...menu, cursor })}
        onPick={(position) => chooseItem(menuList[position], menu.slot)}
        onClose={() => setMenu(null)}
      />
    )
  } else if (board && pickMatch && adminPick) {
    overlay = (
      <PickerMenu
        title={adminPick.kind === 'walkover' ? 'CHI VINCE A TAVOLINO?' : 'CHI RITIRARE?'}
        items={pickItems}
        index={Math.min(adminPick.cursor, Math.max(0, pickItems.length - 1))}
        empty="Nessun giocatore in gara."
        onHover={(cursor) => setAdminPick({ ...adminPick, cursor })}
        onPick={pickAdminPlayer}
        onClose={() => setAdminPick(null)}
      />
    )
  } else if (board && playerList) {
    const person = people.get(playerList.player)
    overlay = (
      <PickerMenu
        title={`INCONTRI DI ${(person ? person.name : '?').toUpperCase()}`}
        items={playerItems}
        index={Math.min(playerList.cursor, Math.max(0, playerItems.length - 1))}
        empty="Nessun incontro."
        onHover={(cursor) => setPlayerList({ ...playerList, cursor })}
        onPick={showPlayerMatch}
        onClose={() => setPlayerList(null)}
      />
    )
  } else if (board && focused && gameList) {
    overlay = (
      <PickerMenu
        title={`PARTITE · ${matchTitle(focused, people, matches).toUpperCase()}`}
        items={gameItems}
        index={Math.min(gameList.cursor, Math.max(0, gameItems.length - 1))}
        empty={`${NO_GAMES}.`}
        onHover={(cursor) => setGameList({ cursor })}
        onPick={() => {}}
        onClose={() => setGameList(null)}
      />
    )
  } else if (board && focused && matchMenu) {
    overlay = (
      <PickerMenu
        title={matchTitle(focused, people, matches).toUpperCase()}
        items={matchItems.map((item) => ({ ...item, note: item.admin && !item.note ? 'Admin' : item.note }))}
        index={Math.min(matchMenu.cursor, Math.max(0, matchItems.length - 1))}
        empty={NO_ACTIONS}
        onHover={(cursor) => setMatchMenu({ ...matchMenu, cursor })}
        onPick={(position) => chooseMatchItem(matchItems[position])}
        onClose={() => setMatchMenu(null)}
      />
    )
  }

  if (!inside) {
    const enter = () => {
      setInside(true)
      if (count === 1 && boarded) {
        openBoard()
      }
    }
    return (
      <div className={styles.view}>
        <Preview tournaments={tournaments} systems={state.systems} now={now} onEnter={enter} />
      </div>
    )
  }
  if (board) {
    return (
      <div className={`${styles.view} ${styles.boardView}`}>
        {info ? (
          <div className={styles.infoBox} ref={infoRef}>
            <Detail tournament={tournament} systems={state.systems} now={now} wide rewardXp={rewardXp}
              players={state.players} series={tournamentSeries} rankTab={rankTab} />
          </div>
        ) : (
          <Board tournament={tournament} systems={state.systems} cursor={boardCursor}
            onFocus={(cursor) => setBoard((value) => ({ ...value, cursor, pane: 'calendar' }))}
            pane={pane} row={tableRow} onRow={(row) => setBoard((value) => ({ ...value, row, pane: 'table' }))} />
        )}
        {overlay}
      </div>
    )
  }
  return (
    <div className={styles.view}>
      {count > 1 ? (
        <div className={styles.split}>
          <ul className={styles.list}>
            {tournaments.map((item, position) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={position === at ? `${styles.row} ${styles.active}` : styles.row}
                  onClick={() => (position === at && hasBoard(item) ? openBoard() : setIndex(position))}
                >
                  <Cover game={item.gameInfo} systems={state.systems} className={styles.miniCover} />
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>
                      {item.status === 'running' && <span className={styles.liveDot} aria-hidden="true" />}
                      {item.fullTitle}
                    </span>
                    <span className={styles.rowNote}>{item.gameInfo ? item.gameInfo.title : 'Senza gioco'}</span>
                    <span className={styles.rowMeta}>
                      {tabStatus(item, now)} · {(item.players || []).length} iscritti
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Detail
            tournament={tournament}
            systems={state.systems}
            now={now}
            wide={false}
            rewardXp={rewardXp}
            series={tournamentSeries}
            rankTab={rankTab}
            players={state.players}
            boxRef={detailRef}
          />
        </div>
      ) : (
        <Detail tournament={tournament} systems={state.systems} now={now} wide rewardXp={rewardXp} players={state.players}
          series={tournamentSeries} rankTab={rankTab} boxRef={detailRef} />
      )}
      {overlay}
    </div>
  )
}
