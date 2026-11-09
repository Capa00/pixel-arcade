import { useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import Avatar from '../components/Avatar.jsx'
import FaceButton from '../components/FaceButton.jsx'
import { outcomeText } from '../lib/challenges.js'
import { formatDuration } from '../lib/format.js'
import { animationMs, finalFrame, frameAt, partLines } from '../lib/sessionResult.js'
import { play } from '../lib/sound.js'
import { PLAYER_INFO } from '../state/players.js'
import styles from './SessionResult.module.css'

// Quadratini dell'esplosione di «LVL UP!»: direzione (in unità) e ritardo.
const PIXELS = [
  [-150, -90, 0], [150, -90, 30], [-110, -150, 60], [110, -150, 20], [0, -170, 40],
  [-180, -20, 50], [180, -20, 10], [-130, 60, 70], [130, 60, 35], [-60, -120, 15],
  [60, -120, 55], [0, 80, 25],
]

// Attesa del suono dei trofei dopo l'apertura della modale (ms).
const TROPHY_SOUND_MS = 400
// Suono dell'esito della Sfida trofeo, dopo quello dei trofei (ms).
const CHALLENGE_SOUND_MS = 900
const CHALLENGE_SOUNDS = { record: 'levelUp', won: 'ding', failed: 'back' }

function reducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

/**
 * Tempo trascorso dall'apertura (ms), aggiornato a ogni fotogramma finché
 * non supera `length`. Con `skipped` (o movimento ridotto) è subito `Infinity`.
 */
function useElapsed(length, skipped) {
  const [elapsed, setElapsed] = useState(() => (reducedMotion() ? Infinity : 0))
  // Passa da vero a falso una volta sola: l'animazione parte all'apertura.
  const running = !skipped && elapsed < length
  useEffect(() => {
    if (!running) {
      return undefined
    }
    const start = performance.now()
    let frame = 0
    const tick = (now) => {
      const value = now - start
      setElapsed(value >= length ? Infinity : value)
      if (value < length) {
        frame = requestAnimationFrame(tick)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [running, length])
  return skipped ? Infinity : elapsed
}

function PlayerCard({ card, elapsed }) {
  const frame = elapsed === Infinity ? finalFrame(card) : frameAt(card, elapsed)
  const info = PLAYER_INFO[card.slot] || PLAYER_INFO.p1
  const reached = frame.level >= card.levelAfter
  const title = reached ? card.title : card.titleBefore
  const newTitle = reached && card.title !== card.titleBefore
  // Fanfara a ogni «LVL UP!».
  useEffect(() => {
    if (frame.burst) {
      play('levelUp')
    }
  }, [frame.burst, frame.ups])
  const classes = [styles.card, frame.burst ? styles.flash : '', frame.ups ? styles.leveled : ''].join(' ')
  return (
    <article className={classes} style={{ '--player': info.color, '--user': card.color || info.color }}>
      <header className={styles.who}>
        <Avatar id={card.id} name={card.name} className={styles.avatar} style={{ background: card.color || info.color }} />
        <div className={styles.whoText}>
          <span className={`pix ${styles.tag}`}>{info.tag}</span>
          <span className={styles.name}>{card.name}</span>
        </div>
      </header>
      <div className={`pix ${styles.gain}`}>+{frame.xp} XP</div>
      <ul className={styles.parts}>
        {partLines(card.parts).map((line) => (
          <li key={line.id}>
            <span>{line.label}</span>
            <span className={styles.partXp}>+{line.xp}</span>
          </li>
        ))}
      </ul>
      <div className={styles.levelRow}>
        <span key={frame.level} className={`pix ${styles.level} ${frame.ups ? styles.bump : ''}`}>
          LVL {frame.level}
        </span>
        {frame.ups > 0 && !frame.burst && <span className={`pix ${styles.upTag}`}>LVL UP!</span>}
        <span className={styles.next}>verso LVL {frame.level + 1}</span>
      </div>
      <div
        className={styles.bar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(frame.percent)}
        aria-label={`${Math.round(frame.percent)}% verso il livello ${frame.level + 1}`}
      >
        <span className={styles.fill} style={{ width: `${frame.percent}%` }} />
      </div>
      <div className={styles.title}>
        {title}
        {newTitle && <span className={styles.newTitle}>Nuovo titolo!</span>}
      </div>
      {frame.burst && (
        <div key={frame.ups} className={styles.burst} aria-live="polite">
          {PIXELS.map(([dx, dy, delay]) => (
            <span
              key={`${dx}:${dy}`}
              className={styles.pixel}
              style={{ '--dx': dx, '--dy': dy, animationDelay: `${delay}ms` }}
            />
          ))}
          <span className={`pix ${styles.burstText}`}>LVL UP!</span>
        </div>
      )}
    </article>
  )
}

function TrophyGroup({ group, badges }) {
  const info = PLAYER_INFO[group.slot] || PLAYER_INFO.p1
  return (
    <section className={styles.group} style={{ '--player': info.color }}>
      <h3 className={styles.groupTitle}>
        <span className={`pix ${styles.tag}`}>{info.tag}</span>
        {group.title}
      </h3>
      <ul className={styles.trophies}>
        {group.unlocks.map((item) => (
          <li key={item.id} className={styles.trophy}>
            {badges[item.id]
              ? <img className={styles.badge} src={api.raBadgeUrl(badges[item.id])} alt="" />
              : <span className={`${styles.badge} ${styles.star}`}>★</span>}
            <span className={styles.trophyTitle}>{item.title}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Modale «Fine partita»: una scheda per ogni giocatore che ha guadagnato XP
 * (una sola centrata o due affiancate), con contatore, voci degli XP, barra
 * del livello e «LVL UP!»; in basso, a parte, i trofei della partita. A o B
 * (li gestisce il livello di gioco) o «Continua» portano subito alla fine
 * dell'animazione, poi chiudono. `onDone` avvisa quando l'animazione è finita.
 * Dopo una partita della Sfida trofeo, in alto c'è il suo esito (`result.challenge`).
 */
export default function SessionResult({ result, cards, groups, game, skipped, onDone, onContinue }) {
  const length = Math.max(...cards.map(animationMs))
  const elapsed = useElapsed(length, skipped)
  const done = elapsed >= length
  const [badges, setBadges] = useState({})
  const notified = useRef(false)

  useEffect(() => {
    if (done && !notified.current) {
      notified.current = true
      onDone()
    }
  }, [done, onDone])

  // Suono dei trofei della partita, all'apertura.
  const trophies = groups.length > 0
  useEffect(() => {
    if (!trophies) {
      return undefined
    }
    const timer = window.setTimeout(() => play('trophy'), TROPHY_SOUND_MS)
    return () => window.clearTimeout(timer)
  }, [trophies])

  // Badge dei trofei dal gioco RetroAchievements; senza rete resta la stella.
  const earner = result.achievements ? result.achievements.earner : null
  const system = game ? game.system : null
  const gameId = game ? game.id : null
  useEffect(() => {
    if (!groups.length || !system || !gameId) {
      return undefined
    }
    let alive = true
    api
      .raGame(system, gameId, earner)
      .then((reply) => {
        if (alive) {
          setBadges(Object.fromEntries((reply.achievements || []).map((item) => [item.id, item.badge])))
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [groups.length, system, gameId, earner])

  const outcome = outcomeText(result.challenge)
  const outcomeTone = outcome ? outcome.tone : null
  useEffect(() => {
    if (!outcomeTone) {
      return undefined
    }
    const timer = window.setTimeout(() => play(CHALLENGE_SOUNDS[outcomeTone]), CHALLENGE_SOUND_MS)
    return () => window.clearTimeout(timer)
  }, [outcomeTone])

  const columns = { '--columns': cards.length }
  return (
    <div className={styles.overlay}>
      <section className={styles.panel} role="dialog" aria-label="Fine partita">
        <header className={styles.head}>
          <span className={`pix ${styles.kicker}`}>Partita terminata</span>
          <span className={styles.game}>
            {game ? game.title : ''}
            {typeof result.seconds === 'number' && <span className={styles.duration}> · {formatDuration(result.seconds)}</span>}
          </span>
        </header>
        {outcome && (
          <div className={`${styles.challenge} ${styles[outcome.tone]}`} role="status">
            <span className={`pix ${styles.challengeKicker}`}>Sfida trofeo</span>
            <strong className={styles.challengeTitle}>{outcome.title}</strong>
            <span className={styles.challengeText}>{outcome.text}</span>
          </div>
        )}
        <div className={cards.length > 1 ? styles.cards : `${styles.cards} ${styles.single}`} style={columns}>
          {cards.map((card) => (
            <PlayerCard key={card.id} card={card} elapsed={elapsed} />
          ))}
        </div>
        {groups.length > 0 && (
          <div className={cards.length > 1 ? styles.groups : `${styles.groups} ${styles.single}`} style={columns}>
            {groups.map((group) => (
              <TrophyGroup key={group.id} group={group} badges={badges} />
            ))}
          </div>
        )}
        <button type="button" className={styles.continue} onClick={onContinue}>
          <FaceButton position="south" />
          {done ? 'Continua' : 'Salta'}
        </button>
      </section>
    </div>
  )
}
