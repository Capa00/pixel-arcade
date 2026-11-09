import { useEffect, useRef } from 'react'
import { leagueDays, leagueResult } from '../lib/tournament.js'
import Avatar from './Avatar.jsx'
import styles from './LeagueCalendar.module.css'

function Side({ id, people, match, align }) {
  const player = people.get(id)
  const done = match.status === 'done'
  const won = done && match.winnerId === id
  const lost = done && match.winnerId !== null && match.winnerId !== undefined && match.winnerId !== id
  const classes = [styles.side, align === 'right' ? styles.right : '']
  if (won) {
    classes.push(styles.won)
  } else if (lost) {
    classes.push(styles.lost)
  }
  return (
    <span className={classes.join(' ')} style={{ '--player': (player && player.color) || 'var(--text-4)' }}>
      <Avatar id={id} name={player ? player.name : '?'} className={styles.avatar}
        style={{ background: player ? player.color : undefined }} />
      <span className={styles.name}>{player ? player.name : '?'}</span>
    </span>
  )
}

/**
 * Calendario del girone (README «Torneo»): elenco verticale diviso per
 * giornate, con gli incontri («Anna – Luca», il risultato a incontro
 * concluso) e chi riposa. Il prossimo incontro ha l'etichetta PROSSIMO,
 * quello in gioco IN GIOCO, quello vinto a tavolino TAVOLINO.
 *
 * `matches` sono gli incontri (del torneo o dell'anteprima dell'«Avvia»),
 * `players` gli iscritti (`{id, name, color}`), `next` la chiave del
 * prossimo, `focus` quella col cursore (`null` = nessuno; la vista la segue),
 * `onFocus(key)` al clic. Con `dim` il cursore è altrove (contorno attenuato).
 * `options` sono le opzioni del girone: con il punteggio registrato il risultato è il punteggio totale, a
 * tavolino quello che conta la classifica (vedi `leagueResult`). `playoff` è `tournament.playoff`: le
 * giornate di spareggio in fondo dicono il posto in palio.
 */
export default function LeagueCalendar({ matches, players, next, focus, onFocus, dim = false, options = null,
  playoff = null }) {
  const boxRef = useRef(null)
  const placed = useRef(false)
  const people = new Map((players || []).map((player) => [player.id, player]))
  const days = leagueDays(matches, (players || []).map((player) => player.id), playoff)
  const target = focus || next

  useEffect(() => {
    const box = boxRef.current
    const found = box && box.querySelector('[data-target]')
    if (!found) {
      return
    }
    // La giornata del cursore resta in vista, con la sua intestazione.
    const day = found.closest('[data-day]') || found
    const view = box.getBoundingClientRect()
    const rect = found.getBoundingClientRect()
    const head = day.getBoundingClientRect()
    let top = box.scrollTop
    if (rect.bottom > view.bottom) {
      top += rect.bottom - view.bottom + rect.height
    } else if (head.top < view.top || rect.top < view.top) {
      top -= view.top - Math.min(head.top, rect.top)
    }
    box.scrollTo({ top: Math.max(0, top), behavior: placed.current ? 'smooth' : 'auto' })
    placed.current = true
  }, [target])

  return (
    <div className={styles.calendar} ref={boxRef}>
      {days.map((day) => (
        <section key={day.round} className={styles.day} data-day="">
          <h3 className={`pix ${styles.dayName}`}>{day.name.toUpperCase()}</h3>
          <ul className={styles.list}>
            {day.matches.map((match) => {
              const classes = [styles.match]
              const isNext = match.key === next
              const playing = match.status === 'playing'
              if (playing) {
                classes.push(styles.playing)
              } else if (isNext) {
                classes.push(styles.next)
              }
              if (match.key === focus) {
                classes.push(dim ? styles.focusDim : styles.focus)
              }
              return (
                <li key={match.key}>
                  <button
                    type="button"
                    className={classes.join(' ')}
                    data-target={match.key === target ? '' : undefined}
                    onClick={onFocus ? () => onFocus(match.key) : undefined}
                  >
                    <Side id={match.playerA} people={people} match={match} align="left" />
                    <span className={`pix ${styles.result}`}>{leagueResult(match, match.playerA, options)}</span>
                    <Side id={match.playerB} people={people} match={match} align="right" />
                    <span className={styles.tags}>
                      {playing && (
                        <span className={`pix ${styles.tag} ${styles.liveTag}`}>
                          <span className={styles.liveDot} aria-hidden="true" />
                          IN GIOCO
                        </span>
                      )}
                      {!playing && isNext && <span className={`pix ${styles.tag} ${styles.nextTag}`}>PROSSIMO</span>}
                      {match.walkover && <span className={`pix ${styles.tag}`}>TAVOLINO</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {day.resting.length > 0 && (
            <p className={styles.resting}>
              Riposa: {day.resting.map((id) => (people.get(id) ? people.get(id).name : '?')).join(', ')}
            </p>
          )}
        </section>
      ))}
    </div>
  )
}
