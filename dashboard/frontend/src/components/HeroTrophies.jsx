import { forwardRef, useEffect, useState } from 'react'
import * as api from '../api/client.js'
import { hideBrokenImage } from '../lib/saves.js'
import styles from './HeroTrophies.module.css'

/** Riepilogo in alto: «3/37 trofei · 30/375 punti di Player1». */
function summaryText(data) {
  const { game, user } = data
  const owner = user ? ` · ${user}` : ''
  if (!user) {
    return `${game.total} trofei · ${game.points} punti`
  }
  return `${game.earned}/${game.total} trofei · ${game.earnedPoints}/${game.points} punti${owner}`
}

/**
 * Trofei RetroAchievements del gioco nella sezione in alto (pannello
 * `trophies`). `account` è il profilo del P1 (`null` per un ospite o senza
 * giocatori): i trofei già sbloccati sono i suoi. Il contenitore
 * dell'elenco riceve il `ref`, che la sezione usa per scorrere con ↑↓.
 */
const HeroTrophies = forwardRef(function HeroTrophies({ system, game, account }, ref) {
  const [data, setData] = useState(null)
  const key = `${system}/${game}/${account}`

  useEffect(() => {
    let alive = true
    api
      .raGame(system, game, account)
      .then((reply) => alive && setData({ key, ...reply }))
      .catch((error) => alive && setData({ key, status: 'offline', message: error.message, achievements: [] }))
    return () => {
      alive = false
    }
  }, [system, game, account, key])

  if (!data || data.key !== key) {
    return <div className={styles.message}>Caricamento dei trofei…</div>
  }
  if (data.status !== 'ok') {
    return <div className={styles.message}>{data.message}</div>
  }
  if (!data.achievements.length) {
    return <div className={styles.message}>Questo gioco non ha ancora trofei su RetroAchievements.</div>
  }
  return (
    <div className={styles.box}>
      <div className={styles.summary}>{summaryText(data)}</div>
      <ul ref={ref} className={styles.list}>
        {data.achievements.map((entry) => (
          <li key={entry.id} className={entry.unlocked ? styles.item : `${styles.item} ${styles.locked}`}>
            <img
              className={styles.badge}
              src={api.raBadgeUrl(entry.badge, !entry.unlocked)}
              alt=""
              loading="lazy"
              onError={hideBrokenImage}
            />
            <span className={styles.text}>
              <span className={styles.title}>{entry.title}</span>
              <span className={styles.description}>{entry.description}</span>
            </span>
            <span className={styles.points}>{entry.points}</span>
          </li>
        ))}
      </ul>
    </div>
  )
})

export default HeroTrophies
