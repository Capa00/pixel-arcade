import { useEffect, useState } from 'react'
import * as api from '../api/client.js'
import { hasImages, imageUrl } from '../lib/gameInfo.js'
import {
  eliminatedRound, formatLabel, formatStart, matchRound, nextMatch, progressLabel, seatsLabel,
} from '../lib/tournament.js'
import * as tournamentStore from '../state/tournamentStore.js'
import Avatar from './Avatar.jsx'
import GameCover from './GameCover.jsx'
import Podium from './Podium.jsx'
import styles from './TournamentPoster.module.css'

// Con più tornei di oggi i manifesti si alternano.
export const POSTER_MS = 30000
// Contro il burn-in copertina e stato di partenza si scambiano di lato.
const SWAP_MS = 180000
// Iscritti mostrati al massimo (gli altri in «+N»).
const ROSTER_MAX = 12

function pad2(value) {
  return String(value).padStart(2, '0')
}

/** «02:41:10» (con i giorni davanti, «1 g 02:41:10»); `null` se l'ora è passata o manca. */
function clock(iso, now) {
  const time = iso ? new Date(iso).getTime() : NaN
  const left = Math.floor((time - now.getTime()) / 1000)
  if (Number.isNaN(left) || left <= 0) {
    return null
  }
  const days = Math.floor(left / 86400)
  const text = `${pad2(Math.floor((left % 86400) / 3600))}:${pad2(Math.floor((left % 3600) / 60))}:${pad2(left % 60)}`
  return days ? `${days} g ${text}` : text
}

function personOf(tournament, id) {
  return (tournament.players || []).find((item) => item.id === id) || { id, name: '?', color: null }
}

/** Avatar con l'immagine del profilo, se c'è, altrimenti l'iniziale nel suo colore. */
function Face({ player, className }) {
  return (
    <Avatar id={player.id} name={player.name} className={className}
      style={{ background: player.color || 'var(--text-3)' }} />
  )
}

/** Iscritti veri: avatar e nome, posti liberi tratteggiati; a torneo in corso teste di serie ed eliminati. */
function Roster({ tournament }) {
  const players = tournament.players || []
  const running = tournament.status === 'running'
  const shown = players.slice(0, ROSTER_MAX)
  const free = tournament.maxPlayers && !running ? Math.max(0, tournament.maxPlayers - players.length) : 0
  return (
    <section className={styles.roster}>
      <p className={`pix ${styles.label}`}>ISCRITTI <span className={styles.labelValue}>{seatsLabel(tournament)}</span></p>
      <ul className={styles.people}>
        {shown.map((player) => {
          const out = running && (player.withdrawn || eliminatedRound(tournament, player.id) !== null)
          return (
            <li key={player.id} className={out ? `${styles.person} ${styles.out}` : styles.person}>
              <Face player={player} className={styles.face} />
              <span className={styles.personName}>{player.name}</span>
              {running && player.seed && <span className={styles.seed}>#{player.seed}</span>}
            </li>
          )
        })}
        {players.length > ROSTER_MAX && <li className={styles.more}>+{players.length - ROSTER_MAX}</li>}
        {Array.from({ length: Math.min(free, ROSTER_MAX - shown.length) }, (_, index) => (
          <li key={`free-${index}`} className={`${styles.person} ${styles.free}`}>
            <span className={`${styles.face} ${styles.freeFace}`} />
            <span className={styles.personName}>libero</span>
          </li>
        ))}
        {players.length === 0 && !free && <li className={styles.more}>Ancora nessuno: sii il primo!</li>}
      </ul>
    </section>
  )
}

/** Centro del manifesto secondo il momento: conto alla rovescia, prossimo incontro o podio. */
function Moment({ tournament, now }) {
  if (tournament.status === 'done') {
    return (
      <div className={styles.moment}>
        <p className={`pix ${styles.badge}`}>CONCLUSO OGGI</p>
        <div className={styles.podium}><Podium tournament={tournament} /></div>
      </div>
    )
  }
  if (tournament.status === 'running') {
    const matches = tournament.matches || []
    const next = nextMatch(matches)
    const progress = progressLabel(matches)
    return (
      <div className={styles.moment}>
        <p className={`pix ${styles.badge} ${styles.live}`}>● IN CORSO</p>
        {next && next.playerA && next.playerB ? (
          <div className={styles.versus}>
            {[next.playerA, next.playerB].map((id, index) => {
              const player = personOf(tournament, id)
              return (
                <div key={id} className={styles.fighter} style={{ order: index * 2 }}>
                  <Face player={player} className={styles.fighterFace} />
                  <span className={`pix ${styles.fighterName}`}>{player.name}</span>
                </div>
              )
            })}
            <span className={`pix ${styles.vs}`} style={{ order: 1 }}>VS</span>
          </div>
        ) : null}
        <p className={styles.line}>
          {[next ? `Prossimo: ${matchRound(next, matches)}` : '', progress].filter(Boolean).join(' · ')}
        </p>
      </div>
    )
  }
  const left = clock(tournament.startsAt, now)
  return (
    <div className={styles.moment}>
      <p className={`pix ${styles.badge}`}>{formatStart(tournament.startsAt).toUpperCase()}</p>
      {left ? <p className={`pix ${styles.clock}`}>{left}</p> : <p className={`pix ${styles.clock}`}>SI PARTE!</p>}
    </div>
  )
}

/**
 * Manifesto dei tornei di oggi nel salvaschermo (README «Salvaschermo»), a
 * tutto schermo: sfondo con la copertina sfocata che si ingrandisce piano,
 * da un lato copertina nitida e stato di partenza, uno sopra l'altro e larghi
 * uguali, dall'altro
 * serie, edizione, gioco, il momento (conto alla rovescia, prossimo incontro o
 * podio) e gli iscritti con i loro avatar; in fondo premi, formato e la fascia
 * «PREMI START E ISCRIVITI». Con più tornei si alternano ogni `POSTER_MS`;
 * contro il burn-in tutto si sposta piano e ogni `SWAP_MS` immagini e testi si
 * scambiano di lato. Le misure seguono lo schermo (`vmin`), anche in 4:3. `onShown(id)` dice quale torneo è a schermo (START apre la sua scheda).
 */
export default function TournamentPoster({ tournaments, systems, onShown }) {
  const [index, setIndex] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const [swapped, setSwapped] = useState(false)
  const count = tournaments.length
  const tournament = tournaments[index % Math.max(1, count)]

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 1000)
    const swap = window.setInterval(() => setSwapped((value) => !value), SWAP_MS)
    return () => {
      window.clearInterval(tick)
      window.clearInterval(swap)
    }
  }, [])
  useEffect(() => {
    if (count < 2) {
      return undefined
    }
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % count), POSTER_MS)
    return () => window.clearInterval(timer)
  }, [count])
  const shownId = tournament ? tournament.id : null
  useEffect(() => {
    onShown(shownId)
  }, [shownId, onShown])

  if (!tournament) {
    return null
  }
  const game = tournament.gameInfo
  const system = game ? systems.find((entry) => entry.id === game.system) || { id: game.system } : null
  const backdrop = game && hasImages(game) ? { backgroundImage: `url("${imageUrl(game.system, game, 'cover')}")` } : undefined
  const edition = tournament.edition
    ? `${tournament.edition}ª EDIZIONE${tournament.title ? ` — ${tournament.title.toUpperCase()}` : ''}`
    : ''
  const open = tournament.status === 'open'
  const xp = tournamentStore.getSnapshot().rewardXp || []
  const rewards = tournament.rewards && tournament.status !== 'done' && xp.length
  return (
    <div key={tournament.id} className={styles.poster}>
      <span className={styles.backdrop} style={backdrop} aria-hidden="true" />
      <span className={styles.shade} aria-hidden="true" />
      <div className={swapped ? `${styles.stage} ${styles.swapped}` : styles.stage}>
        <div className={tournament.thumb ? `${styles.media} ${styles.withStart}` : styles.media}>
          {game ? <GameCover system={system} game={game} className={styles.cover} />
            : <span className={`${styles.cover} ${styles.noCover}`}>?</span>}
          {tournament.thumb && (
            <figure className={styles.start}>
              <img src={api.tournamentThumbUrl(tournament.id, tournament.updatedAt)} alt="" draggable="false" />
              <figcaption className={`pix ${styles.startCaption}`}>SI PARTE DA QUI</figcaption>
            </figure>
          )}
        </div>
        <div className={styles.main}>
          <p className={`pix ${styles.kicker}`}>★ TOURNAMENT ★</p>
          <h2 className={`pix ${styles.name}`}>{tournament.series ? tournament.series.name : tournament.fullTitle}</h2>
          {edition && <p className={`pix ${styles.edition}`}>{edition}</p>}
          {game && (
            <p className={styles.game}>
              {game.title}
              <span className={`pix ${styles.system}`}>{game.systemName}</span>
            </p>
          )}
          <Moment tournament={tournament} now={now} />
          {tournament.status !== 'done' && <Roster tournament={tournament} />}
          <p className={styles.facts}>
            {[rewards ? `Premi ${xp.join(' · ')} XP` : '', formatLabel(tournament.format || 'single')].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      {open && <p className={`pix ${styles.banner}`}>▶ PREMI START E ISCRIVITI</p>}
      {!open && tournament.status === 'running' && <p className={`pix ${styles.banner}`}>▶ PREMI START E SEGUI IL TORNEO</p>}
    </div>
  )
}
