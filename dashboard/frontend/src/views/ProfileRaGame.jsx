import { useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import { hideBrokenImage } from '../lib/saves.js'
import heroStyles from '../components/HeroTrophies.module.css'
import styles from './ProfileRaGame.module.css'

/** Data del sito («2026-10-01 17:30:00» o ISO) come «01/10/2026», oppure vuota. */
function shortDate(value) {
  const at = Date.parse(String(value || '').replace(' ', 'T'))
  return Number.isNaN(at) ? '' : new Date(at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Finestra con tutti i trofei RetroAchievements di un gioco dell'account
 * (`game` = `{id, title, console}` di `raProfileGames`): quelli presi a
 * colori con la data, quelli mancanti in grigio.
 *
 * Gli eventi arrivano da Profile con `inputRef.current(event)`: ↑↓ scorrono
 * l'elenco, A e B chiudono (`onClose`), come il clic fuori dal pannello.
 * `onContext(nome | null)` indica la legenda della barra comandi.
 */
export default function ProfileRaGame({ inputRef, accountId, game, onClose, onContext }) {
  const [data, setData] = useState(null)
  const list = useRef(null)

  useEffect(() => {
    let alive = true
    api
      .raProfileGame(accountId, game.id)
      .then((reply) => alive && setData(reply))
      .catch((error) => alive && setData({ status: 'offline', message: error.message, achievements: [] }))
    return () => {
      alive = false
    }
  }, [accountId, game.id])

  useEffect(() => {
    onContext('raGame')
  }, [onContext])

  useEffect(() => () => onContext(null), [onContext])

  const handle = (event) => {
    if (event.kind === 'release') {
      return
    }
    if (event.button === 'up' || event.button === 'down') {
      const box = list.current
      if (box) {
        box.scrollBy({ top: (event.button === 'up' ? -1 : 1) * box.clientHeight * 0.4, behavior: 'smooth' })
      }
    } else if (event.kind === 'press' && (event.button === 'b' || event.button === 'a')) {
      onClose()
    }
  }

  useEffect(() => {
    inputRef.current = handle
  })

  useEffect(() => () => {
    inputRef.current = null
  }, [inputRef])

  const info = data && data.game
  let body
  if (!data) {
    body = <div className={heroStyles.message}>Caricamento dei trofei…</div>
  } else if (data.status !== 'ok') {
    body = <div className={heroStyles.message}>{data.message}</div>
  } else if (!data.achievements.length) {
    body = <div className={heroStyles.message}>Questo gioco non ha trofei su RetroAchievements.</div>
  } else {
    body = (
      <ul ref={list} className={`${heroStyles.list} ${styles.list}`}>
        {data.achievements.map((entry) => (
          <li key={entry.id} className={entry.unlocked ? heroStyles.item : `${heroStyles.item} ${heroStyles.locked}`}>
            <img
              className={heroStyles.badge}
              src={api.raBadgeUrl(entry.badge, !entry.unlocked)}
              alt=""
              loading="lazy"
              onError={hideBrokenImage}
            />
            <span className={heroStyles.text}>
              <span className={heroStyles.title}>{entry.title}</span>
              <span className={heroStyles.description}>{entry.description}</span>
              {entry.unlocked && <span className={styles.date}>Preso il {shortDate(entry.unlockedAt)}</span>}
            </span>
            <span className={heroStyles.points}>{entry.points}</span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div
      className={styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section className={styles.panel} role="dialog" aria-label={`Trofei di ${game.title}`}>
        <div className={styles.head}>
          <div className={styles.heading}>
            <h2 className={styles.title}>{game.title}</h2>
            <span className={styles.summary}>
              {game.console}
              {info ? ` · ${info.earned}/${info.total} trofei · ${info.earnedPoints}/${info.points} punti` : ''}
            </span>
          </div>
          <button type="button" className={styles.close} aria-label="Chiudi" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {body}
      </section>
    </div>
  )
}
