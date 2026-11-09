import { useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import { coverStyle } from '../lib/covers.js'
import { dayTime, duration, hours, relativeDay } from '../lib/format.js'
import { placeLabel, rewardLine, tournamentsLine } from '../lib/tournament.js'
import { setFocus } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import { gameSummary } from '../state/profiles.js'
import profileStyles from './Profile.module.css'
import styles from './ProfileStats.module.css'

const SCOPE = 'profile'

function plural(count, one, many) {
  return count === 1 ? `1 ${one}` : `${count} ${many}`
}

/**
 * Scheda «Statistiche» della pagina profilo: ore per console, giochi più
 * giocati e storico delle partite (`GET /api/profiles/stats`), 30 per volta
 * con «Mostra altre». Con almeno un torneo concluso c'è la riga «Tornei: …»
 * e nello storico, tra le partite, le righe dei piazzamenti.
 *
 * `item(id, onActivate)` sono le voci navigabili della pagina; `goTo(summary)`
 * porta al gioco; `version` cambia dopo ogni partita, per rileggere i dati.
 */
export default function ProfileStats({ accountId, version, item, goTo }) {
  const { state, dispatch } = useApp()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  // Al primo arrivo dei dati il focus va sul gioco più giocato (prima era sull'intestazione).
  const placed = useRef(false)

  useEffect(() => {
    let alive = true
    setError(null)
    api
      .profileStats(accountId)
      .then((result) => {
        if (!alive) {
          return
        }
        setData(result)
        if (!placed.current && result.top.length) {
          placed.current = true
          dispatch(setFocus(SCOPE, `top-${result.top[0].game}`))
        }
      })
      .catch((failure) => alive && setError(failure.message))
    return () => {
      alive = false
    }
  }, [accountId, version, dispatch])

  // Ultima partita ricevuta (le righe dei piazzamenti non contano per la pagina dopo).
  const lastSession = (history) => [...history].reverse().find((entry) => entry.kind !== 'reward') || null

  const loadMore = () => {
    if (busy || !data || !lastSession(data.history)) {
      return
    }
    setBusy(true)
    api
      .profileStats(accountId, lastSession(data.history).id)
      .then((result) => {
        setData((current) => ({
          ...current,
          history: [...current.history, ...result.history],
          more: result.more,
          games: { ...current.games, ...result.games },
        }))
        if (result.history.length) {
          dispatch(setFocus(SCOPE, `hist-${result.history[0].id}`))
        }
      })
      .catch((failure) => setError(failure.message))
      .finally(() => setBusy(false))
  }

  if (!data) {
    return <span className={profileStyles.emptyText}>{error || 'Caricamento…'}</span>
  }

  const now = Date.now()
  const systemOf = (id) => state.systems.find((entry) => entry.id === id) || null
  const summaryOf = (key) => data.games[key] || gameSummary(state, key)
  const longest = data.systems.length ? data.systems[0].seconds : 0

  const tournaments = tournamentsLine(data.tournaments)

  if (!data.systems.length && !tournaments) {
    return <span className={profileStyles.emptyText}>Nessuna partita finora: le statistiche compariranno dopo la prima.</span>
  }

  return (
    <>
      {tournaments && <p className={`pix ${styles.tournamentsLine}`}>{tournaments}</p>}
      <div className={styles.grid}>
        <section className={profileStyles.section}>
          <h2 className={profileStyles.sectionTitle}>Ore per console</h2>
          <ul className={styles.bars}>
            {data.systems.map((entry) => {
              const system = systemOf(entry.system)
              const width = longest ? Math.max(2, Math.round((entry.seconds / longest) * 100)) : 0
              return (
                <li key={entry.system} className={styles.barRow} style={system ? { '--accent': system.accent } : undefined}>
                  <span className={`pix ${styles.barName}`}>{system ? system.name : entry.name}</span>
                  <span className={styles.barTrack}>
                    <span className={styles.barFill} style={{ width: `${width}%` }} />
                  </span>
                  <span className={styles.barValue}>{hours(entry.seconds / 3600)} h</span>
                  <span className={styles.barCount}>{plural(entry.sessions, 'partita', 'partite')}</span>
                </li>
              )
            })}
          </ul>
        </section>

        <section className={profileStyles.section}>
          <h2 className={profileStyles.sectionTitle}>Più giocati</h2>
          <div className={styles.rows}>
            {data.top.map((entry, position) => {
              const summary = summaryOf(entry.game)
              const at = Date.parse(entry.lastAt)
              return (
                <button
                  key={entry.game}
                  type="button"
                  className={summary.missing ? `${styles.row} ${styles.missing}` : styles.row}
                  data-autofocus={position === 0 || undefined}
                  {...item(`top-${entry.game}`, () => goTo(summary))}
                >
                  <span className={styles.rank}>{position + 1}</span>
                  <span className={styles.swatch} style={{ background: coverStyle(systemOf(summary.system), summary.id).bg }} />
                  <span className={styles.text}>
                    <span className={styles.title}>{summary.title}</span>
                    <span className={styles.meta}>
                      {summary.missing ? 'Non più presente' : summary.systemName}
                      {' · '}
                      {plural(entry.sessions, 'partita', 'partite')}
                      {Number.isNaN(at) ? '' : ` · ${relativeDay(at, now)}`}
                    </span>
                  </span>
                  <span className={styles.time}>{duration(entry.seconds)}</span>
                </button>
              )
            })}
          </div>
        </section>
      </div>

      <section className={profileStyles.section}>
        <div className={profileStyles.sectionHead}>
          <h2 className={profileStyles.sectionTitle}>Storico delle partite</h2>
          <span className={profileStyles.sectionCount}>Partite di almeno 30 secondi</span>
        </div>
        {data.history.length ? (
          <div className={styles.rows}>
            {data.history.map((entry) => {
              if (entry.kind === 'reward') {
                const at = Date.parse(entry.at)
                return (
                  <div key={entry.id} className={`${styles.row} ${styles.reward}`} aria-label={rewardLine(entry)}>
                    <span className={`pix ${styles.swatch} ${styles.medal} ${styles[`place${Math.min(entry.place, 4)}`]}`}>
                      {placeLabel(entry.place)}
                    </span>
                    <span className={styles.text}>
                      <span className={styles.title}>{entry.title}: {placeLabel(entry.place)}</span>
                      <span className={styles.meta}>
                        Torneo concluso{Number.isNaN(at) ? '' : ` · ${dayTime(at, now)}`}
                      </span>
                    </span>
                    <span className={styles.xp}>{entry.xp ? `+${entry.xp} XP` : ''}</span>
                    <span className={styles.time} />
                  </div>
                )
              }
              const summary = summaryOf(entry.game)
              const at = Date.parse(entry.endedAt || entry.startedAt)
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={summary.missing ? `${styles.row} ${styles.missing}` : styles.row}
                  {...item(`hist-${entry.id}`, () => goTo(summary))}
                >
                  <span className={styles.swatch} style={{ background: coverStyle(systemOf(summary.system), summary.id).bg }} />
                  <span className={styles.text}>
                    <span className={styles.title}>{summary.title}</span>
                    <span className={styles.meta}>
                      {summary.missing ? 'Non più presente' : summary.systemName}
                      {Number.isNaN(at) ? '' : ` · ${dayTime(at, now)}`}
                    </span>
                    {entry.tournament && (
                      <span className={`pix ${styles.tournament}`}>
                        {entry.tournament.title ? `TORNEO · ${entry.tournament.title}` : 'TORNEO'}
                      </span>
                    )}
                    {entry.trophies.length > 0 && (
                      <span className={styles.trophies}>
                        {plural(entry.trophies.length, 'trofeo', 'trofei')}: {entry.trophies.join(', ')}
                      </span>
                    )}
                  </span>
                  {entry.partners.map((partner) => (
                    <span key={partner.id} className={styles.partner} style={{ '--partner': partner.color }}>
                      con {partner.name}
                    </span>
                  ))}
                  <span className={styles.xp}>{entry.xp ? `+${entry.xp} XP` : entry.tournament ? '0 XP' : ''}</span>
                  <span className={styles.time}>{duration(entry.seconds)}</span>
                </button>
              )
            })}
            {data.more && (
              <button type="button" className={`${profileStyles.ghost} ${styles.more}`} {...item('hist-more', loadMore)}>
                {busy ? 'Caricamento…' : 'Mostra altre'}
              </button>
            )}
          </div>
        ) : (
          <span className={profileStyles.emptyText}>Nessuna partita di almeno 30 secondi.</span>
        )}
        {error && <span className={profileStyles.emptyText}>{error}</span>}
      </section>
    </>
  )
}
