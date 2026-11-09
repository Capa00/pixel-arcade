import { useEffect, useState } from 'react'
import * as api from '../api/client.js'
import { clock, pickerItems } from '../lib/challenges.js'
import styles from './ChallengePicker.module.css'

/**
 * Scelta a fine partita della Sfida trofeo (README «Sfida trofeo»): i trofei
 * della partita con un punto di sfida, da spuntare, poi «Lancia le sfide» e
 * «Non sfidare». Mostra soltanto: voce evidenziata (`index`), trofei scelti
 * (`chosen`, insieme di id) e input li gestisce il livello di gioco
 * (src/views/RunLayer.jsx); col mouse `onActivate(posizione)`.
 */
export default function ChallengePicker({ candidates, chosen, index, game, earner, busy, onActivate }) {
  const [badges, setBadges] = useState({})
  const system = game ? game.system : null
  const gameId = game ? game.id : null
  useEffect(() => {
    if (!system || !gameId) {
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
  }, [system, gameId, earner])

  const items = pickerItems(candidates, chosen)
  return (
    <div className={styles.overlay}>
      <section className={styles.panel} role="dialog" aria-label="Sfida trofeo">
        <header className={styles.head}>
          <span className={`pix ${styles.kicker}`}>Sfida trofeo</span>
          <h2 className={styles.title}>Sfida tutta la casa</h2>
          <p className={styles.text}>
            Scegli i trofei: gli altri ripartiranno da circa 5 minuti prima e dovranno sbloccarli più in fretta di te.
            Le sfide durano 15 giorni.
          </p>
        </header>
        <ul className={styles.list}>
          {items.map((entry, position) => {
            const focused = position === index
            if (entry.kind === 'trophy') {
              const on = chosen.has(entry.item.achievementId)
              const badge = badges[entry.item.achievementId]
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={[styles.trophy, on ? styles.on : '', focused ? styles.focused : ''].join(' ')}
                    aria-pressed={on}
                    onClick={() => onActivate(position)}
                  >
                    <span className={styles.check} aria-hidden="true">{on ? '✓' : ''}</span>
                    {badge
                      ? <img className={styles.badge} src={api.raBadgeUrl(badge)} alt="" />
                      : <span className={`${styles.badge} ${styles.star}`}>★</span>}
                    <span className={styles.name}>{entry.item.title}</span>
                    <span className={`pix ${styles.time}`}>{clock(entry.item.seconds)}</span>
                  </button>
                </li>
              )
            }
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className={[
                    styles.action,
                    entry.kind === 'launch' ? styles.launch : '',
                    focused ? styles.focused : '',
                  ].join(' ')}
                  disabled={busy || entry.disabled}
                  onClick={() => onActivate(position)}
                >
                  {entry.label}
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
