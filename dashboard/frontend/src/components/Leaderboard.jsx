import { useEffect, useState } from 'react'
import * as api from '../api/client.js'
import { useFocusScope } from '../input/useFocusScope.js'
import { daysLeftLabel, podium, points } from '../lib/leaderboard.js'
import { duration, hours } from '../lib/format.js'
import { reserveGame, setFocus } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import { PLAYER_INFO } from '../state/players.js'
import { gameSummary, splitKey } from '../state/profiles.js'
import Avatar from './Avatar.jsx'
import { Cup, GameCard } from './LeaderboardParts.jsx'
import LeaderboardPlayer from './LeaderboardPlayer.jsx'
import styles from './Leaderboard.module.css'

/** Posto in classifica: la coppa per i primi tre, il numero per gli altri. */
function Place({ position }) {
  const tone = podium(position)
  return <span className={styles.place}>{tone ? <Cup tone={tone} /> : position + 1}</span>
}

/** Riga piccola sotto il nome: livello, ore, punti RA e gioco più giocato. */
function leaderLine(leader, ra, top) {
  const parts = [`Liv. ${leader.level} · ${leader.title}`, `${hours(leader.hours)} h`]
  if (ra !== undefined) {
    parts.push(`${points(ra)} pt RA`)
  }
  if (top) {
    parts.push(top.title)
  }
  return parts.join(' · ')
}

/**
 * Classifica di casa nella metà libera dello schermo, quando è aperta una
 * sola finestra «Chi gioca?» (`side`: `left` o `right`; `slotKey` è lo slot
 * di quella finestra).
 *
 * Mostra i primi cinque profili per XP (coppe d'oro, d'argento e di bronzo ai
 * primi tre), la sfida della settimana con i primi tre per tempo e il
 * vincitore della settimana prima, e i giochi più giocati di casa
 * (`GET /api/leaderboard`). I punti RetroAchievements arrivano dopo, per i
 * profili collegati.
 *
 * `active` è vero quando il joypad dello slot è dentro la classifica (ci si
 * entra con la direzione verso la classifica, src/views/LoginLayer.jsx);
 * `register(handle)` consegna a LoginLayer la funzione che riceve i suoi
 * eventi. ↑↓ scorrono le voci, A su una persona apre la sua scheda
 * (src/components/LeaderboardPlayer.jsx), A su un gioco (card) lo prenota
 * per lo slot (`reserveGame`) e torna alla finestra; ← → passano tra le card
 * della stessa fila. La direzione verso la finestra, quando da quella parte
 * non c'è un'altra card, torna alla finestra (`onLeave`) anche dalla scheda,
 * che resta aperta;
 * B dalla scheda torna alla classifica, dalla classifica alla finestra. Col mouse il clic fa lo
 * stesso e porta dentro la classifica (`onEnter`).
 */
export default function Leaderboard({ side, slotKey, active, register, onEnter, onLeave, onContext }) {
  const { state, dispatch } = useApp()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  // Punti RetroAchievements per id del profilo, quando arrivano dal sito.
  const [raPoints, setRaPoints] = useState({})
  // Profilo di cui è aperta la scheda, oppure `null` per la classifica.
  const [person, setPerson] = useState(null)
  const scopeName = `board-${slotKey}-${person === null ? 'list' : 'person'}`
  const scope = useFocusScope(scopeName)
  const exit = side === 'right' ? 'left' : 'right'

  useEffect(() => {
    let alive = true
    api
      .leaderboard()
      .then((result) => {
        if (!alive) {
          return
        }
        setData(result)
        for (const leader of result.leaders) {
          if (!leader.raUser) {
            continue
          }
          api
            .raProfile(leader.id)
            .then((profile) => {
              const summary = profile && profile.summary
              if (alive && summary) {
                const total = (summary.points || 0) + (summary.softcorePoints || 0)
                setRaPoints((current) => ({ ...current, [leader.id]: total }))
              }
            })
            .catch(() => {})
        }
      })
      .catch((failure) => alive && setError(failure.message))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    onContext(active ? (person === null ? 'loginBoard' : 'loginPlayer') : null)
  }, [active, person, onContext])
  useEffect(() => () => onContext(null), [onContext])

  const summaryOf = (key) => (data && data.games[key]) || gameSummary(state, key)

  const reserve = (key) => {
    const { system, id } = splitKey(key)
    dispatch(reserveGame(slotKey, system, id, summaryOf(key).title))
    onLeave()
  }

  const openPerson = (id) => {
    onEnter()
    setPerson(id)
  }

  const choose = (onActivate) => () => {
    onEnter()
    onActivate()
  }

  // B: dalla scheda si torna alla classifica, dalla classifica alla finestra.
  const back = () => {
    if (person !== null) {
      setPerson(null)
    } else {
      onLeave()
    }
  }

  // ← → tra le card della stessa fila (`data-row`, `data-col`); vero se il cursore si è spostato.
  const moveInRow = (direction) => {
    const container = scope.ref.current
    const element = container && container.querySelector('.focused')
    if (!element || element.dataset.row === undefined) {
      return false
    }
    const cards = Array.from(container.querySelectorAll(`[data-row="${element.dataset.row}"]`))
    const next = cards[cards.indexOf(element) + (direction === 'right' ? 1 : -1)]
    if (!next) {
      return false
    }
    dispatch(setFocus(scopeName, next.dataset.focusId))
    return true
  }

  const handle = (event) => {
    if (event.kind === 'release') {
      return
    }
    if (event.kind === 'press' && event.button === 'b') {
      back()
      return
    }
    // Verso la finestra si torna a «Chi gioca?», anche dalla scheda, solo dall'ultima card della fila
    // (o da una voce senza card); la scheda aperta resta visibile, col cursore nella finestra.
    if (event.button === 'left' || event.button === 'right') {
      if (!moveInRow(event.button) && event.button === exit && event.kind === 'press') {
        onLeave()
      }
      return
    }
    if (event.button === 'up' || event.button === 'down' || (event.kind === 'press' && event.button === 'a')) {
      scope.handle(event)
    }
  }

  useEffect(() => {
    register(handle)
  })
  useEffect(() => () => register(null), [register])

  const classes = [styles.board, side === 'left' ? styles.left : styles.right, active ? styles.active : ''].join(' ')
  const look = { '--player': PLAYER_INFO[slotKey].color }
  const enterHint = side === 'right' ? 'Premi → per entrare' : 'Premi ← per entrare'

  if (person !== null) {
    const account = state.accounts.find((entry) => entry.id === person)
    if (account) {
      return (
        <aside className={classes} style={look} ref={scope.ref}>
          <LeaderboardPlayer
            account={account}
            slotKey={slotKey}
            raPoints={raPoints[account.id]}
            item={scope.item}
            onBack={() => setPerson(null)}
            onGame={(key) => reserve(key)}
          />
        </aside>
      )
    }
  }

  return (
    <aside className={classes} style={look} ref={scope.ref}>
      <div className={styles.head}>
        <span className={`pix ${styles.kicker}`}>CLASSIFICA DI CASA</span>
        {!active && <span className={styles.enter}>{enterHint}</span>}
      </div>

      <div className={styles.body}>
        {!data && <p className={styles.note}>{error || 'Caricamento…'}</p>}

        {data && (
          <>
            {data.leaders.length ? (
              <div className={styles.list}>
                {data.leaders.map((leader, position) => {
                  const top = leader.top ? summaryOf(leader.top.game) : null
                  return (
                    <button
                      key={leader.id}
                      type="button"
                      className={styles.leader}
                      data-autofocus={position === 0 || undefined}
                      {...scope.item(`person-${leader.id}`, () => openPerson(leader.id))}
                    >
                      <Place position={position} />
                      <Avatar id={leader.id} name={leader.name} className={styles.avatar} style={{ background: leader.color }} />
                      <span className={styles.who}>
                        <span className={styles.name}>{leader.name}</span>
                        <span className={styles.line}>{leaderLine(leader, raPoints[leader.id], top)}</span>
                      </span>
                      <span className={styles.xp}>
                        {points(leader.xp)}
                        <span className={styles.unit}>XP</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className={styles.note}>Nessun profilo: creane uno per entrare in classifica.</p>
            )}

            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={`pix ${styles.sectionTitle}`}>SFIDA DELLA SETTIMANA</span>
                <span className={styles.badge}>XP ×2</span>
              </div>
              {data.challenge ? (
                <div className={styles.challenge}>
                  <GameCard
                    big
                    summary={summaryOf(data.challenge.game)}
                    systems={state.systems}
                    detail={daysLeftLabel(data.challenge.daysLeft)}
                    row="challenge"
                    col={0}
                    focus={scope.item('challenge', choose(() => reserve(data.challenge.game)))}
                  />
                  <div className={styles.challengeSide}>
                    <span className={styles.line}>
                      {summaryOf(data.challenge.game).systemName} · vince chi gioca di più
                    </span>
                    {data.challenge.ranking.length ? (
                      <ol className={styles.ranking}>
                        {data.challenge.ranking.map((entry, position) => (
                          <li key={entry.id} className={styles.rankItem}>
                            <Cup tone={podium(position)} className={styles.smallCup} />
                            <span className={styles.rankName} style={{ color: entry.color }}>{entry.name}</span>
                            <span className={styles.rankTime}>{duration(entry.seconds)}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className={styles.note}>Nessuno ci ha ancora giocato questa settimana.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className={styles.note}>La sfida parte appena un profilo ha giocato almeno una partita.</p>
              )}
              {data.lastWinner && (
                <p className={styles.note}>
                  Settimana scorsa: <Cup tone="gold" className={styles.inlineCup} />{' '}
                  <strong style={{ color: data.lastWinner.color }}>{data.lastWinner.name}</strong> su{' '}
                  <button
                    type="button"
                    className={styles.inlineGame}
                    {...scope.item('last', choose(() => reserve(data.lastWinner.game)))}
                  >
                    {summaryOf(data.lastWinner.game).title}
                  </button>{' '}
                  · {duration(data.lastWinner.seconds)}
                </p>
              )}
            </section>

            {data.topGames.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={`pix ${styles.sectionTitle}`}>I PIÙ GIOCATI DI CASA</span>
                </div>
                <div className={styles.cards}>
                  {data.topGames.map((entry, position) => (
                    <GameCard
                      key={entry.game}
                      summary={summaryOf(entry.game)}
                      systems={state.systems}
                      detail={`${duration(entry.seconds)} · ${entry.players === 1 ? '1 giocatore' : `${entry.players} giocatori`}`}
                      row="house"
                      col={position}
                      focus={scope.item(`top-${entry.game}`, choose(() => reserve(entry.game)))}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
