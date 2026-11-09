import { useEffect, useState } from 'react'
import * as api from '../api/client.js'
import { duration, hours, relativeDay } from '../lib/format.js'
import { consoleShares, levelProgress, points } from '../lib/leaderboard.js'
import { login } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import { gameSummary, splitKey } from '../state/profiles.js'
import Avatar from './Avatar.jsx'
import { GameCard } from './LeaderboardParts.jsx'
import styles from './LeaderboardPlayer.module.css'

const OTHER = { p1: 'p2', p2: 'p1' }
// Card per fila (più giocati, ultime partite, preferiti): la fila scorre, se ne vedono 4 e un quarto.
const CARDS_MAX = 10

/** Riquadro di un numero della scheda: valore grande, etichetta e nota facoltativa. */
function Tile({ value, label, note }) {
  return (
    <span className={styles.tile}>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.tileLabel}>{label}</span>
      {note && <span className={styles.tileNote}>{note}</span>}
    </span>
  )
}

/** Fila di card con la sua intestazione; niente se `entries` è vuota. */
function CardRow({ title, entries }) {
  if (!entries.length) {
    return null
  }
  return (
    <section className={styles.section}>
      <h3 className={`pix ${styles.sectionTitle}`}>{title}</h3>
      <div className={styles.cards}>{entries}</div>
    </section>
  )
}

/**
 * Scheda di un profilo nella classifica di «Chi gioca?» (al posto
 * dell'elenco; B o «‹ Classifica» tornano indietro con `onBack`).
 *
 * Dall'alto: fascia nel colore del profilo con avatar, livello e barra degli
 * XP; quattro riquadri (ore, giochi, partite, punti e rank RetroAchievements);
 * «Gioca come NOME», che entra con quel profilo nello slot `slotKey` (spento
 * se il profilo è dell'altro giocatore); la barra con le ore per console;
 * file di card dei giochi più giocati, delle ultime partite e dei preferiti
 * (A o il clic li prenotano con `onGame(key)`), senza quelli non più nella libreria. Dati da
 * `GET /api/profiles/stats` e `GET /api/ra/profile`; `item` sono le voci
 * della navigazione.
 */
export default function LeaderboardPlayer({ account, slotKey, raPoints, item, onBack, onGame }) {
  const { state, dispatch } = useApp()
  const [stats, setStats] = useState(null)
  const [ra, setRa] = useState(null)
  const other = state.players[OTHER[slotKey]].user
  const taken = Boolean(other && !other.guest && other.id === account.id)

  useEffect(() => {
    let alive = true
    api.profileStats(account.id).then((data) => alive && setStats(data)).catch(() => {})
    if (account.raUser) {
      api.raProfile(account.id).then((data) => alive && data && setRa(data.summary || null)).catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [account.id, account.raUser])

  const summaryOf = (key) => (stats && stats.games[key]) || gameSummary(state, key)
  // Giochi non più nella libreria: segnati dal backend, oppure assenti dai giochi già caricati della console.
  const present = (key) => {
    if (summaryOf(key).missing) {
      return false
    }
    const { system, id } = splitKey(key)
    const games = state.games[system]
    return !games || games.some((game) => game.id === id)
  }
  const systemOf = (id) => state.systems.find((entry) => entry.id === id) || null
  const now = Date.now()
  const progress = levelProgress(account.xp, account.level)
  const raTotal = ra ? (ra.points || 0) + (ra.softcorePoints || 0) : raPoints
  const shares = stats ? consoleShares(stats.systems) : []

  const card = (key, id, row, col, badge) => (
    <GameCard
      key={id}
      summary={summaryOf(key)}
      systems={state.systems}
      badge={badge}
      row={row}
      col={col}
      focus={item(id, () => onGame(key))}
    />
  )
  const top = stats ? stats.top.filter((entry) => present(entry.game)).slice(0, CARDS_MAX).map((entry, col) =>
    card(entry.game, `top-${entry.game}`, 'top', col, duration(entry.seconds))) : []
  // Ultime partite: un gioco solo una volta, con la partita più recente (i piazzamenti nei tornei no).
  const recent = stats ? stats.history
    .filter((entry) => entry.kind !== 'reward')
    .filter((entry, index, list) => present(entry.game) && list.findIndex((other) => other.game === entry.game) === index)
    .slice(0, CARDS_MAX).map((entry, col) => {
    const at = Date.parse(entry.endedAt || entry.startedAt)
    return card(entry.game, `recent-${entry.id}`, 'recent', col, Number.isNaN(at) ? null : relativeDay(at, now))
  }) : []
  const favorites = (account.favorites || []).filter(present).slice(0, CARDS_MAX).map((key, col) =>
    card(key, `fav-${key}`, 'favorites', col, summaryOf(key).systemName))

  return (
    <>
      <div className={styles.hero} style={{ '--profile': account.color }}>
        <button type="button" className={styles.back} onClick={onBack}>
          ‹ Classifica
        </button>
        <div className={styles.who}>
          <Avatar id={account.id} name={account.name} className={styles.avatar} style={{ background: account.color }} />
          <span className={styles.text}>
            <span className={styles.name}>{account.name}</span>
            <span className={styles.level}>
              Livello {account.level} · {account.title}
            </span>
            <span className={styles.xpRow}>
              <span className={styles.xpTrack}>
                <span className={styles.xpFill} style={{ width: `${account.xpPercent}%` }} />
              </span>
              <span className={styles.xpText}>
                {points(progress.done)} / {points(progress.needed)} XP
              </span>
            </span>
          </span>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.tiles}>
          <Tile value={hours(account.hours)} label="ore" />
          <Tile value={account.played} label="giochi" />
          <Tile value={account.sessions} label="partite" />
          <Tile
            value={raTotal === undefined || raTotal === null ? '—' : points(raTotal)}
            label="punti RA"
            note={ra && ra.rank ? `rank ${points(ra.rank)}` : null}
          />
        </div>

        {taken ? (
          <span className={`${styles.play} ${styles.off}`}>In uso dall&apos;altro giocatore</span>
        ) : (
          <button type="button" className={styles.play} data-autofocus {...item('play', () => dispatch(login(slotKey, account)))}>
            Gioca come {account.name}
          </button>
        )}

        {shares.length > 0 && (
          <section className={styles.section}>
            <h3 className={`pix ${styles.sectionTitle}`}>CONSOLE</h3>
            <span className={styles.split}>
              {shares.map((part) => (
                <span
                  key={part.system}
                  className={styles.part}
                  style={{ width: `${part.share}%`, '--accent': (systemOf(part.system) || {}).accent }}
                />
              ))}
            </span>
            <span className={styles.legend}>
              {shares.map((part) => {
                const system = systemOf(part.system)
                return (
                  <span key={part.system} className={styles.legendItem} style={{ '--accent': (system || {}).accent }}>
                    <span className={styles.dot} />
                    {system ? system.name : part.name} {hours(part.seconds / 3600)} h
                  </span>
                )
              })}
            </span>
          </section>
        )}

        {!stats && <p className={styles.note}>Caricamento…</p>}
        {stats && !top.length && !recent.length && !favorites.length && (
          <p className={styles.note}>Nessuna partita finora.</p>
        )}

        <CardRow title="PIÙ GIOCATI" entries={top} />
        <CardRow title="ULTIME PARTITE" entries={recent} />
        <CardRow title="PREFERITI" entries={favorites} />

      </div>
    </>
  )
}
