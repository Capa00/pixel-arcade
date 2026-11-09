import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import { stepIndex, wraps } from '../input/wrap.js'
import { clock, finalText, noticeText } from '../lib/challenges.js'
import { play } from '../lib/sound.js'
import { requestChallenge, showToast } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import styles from './ChallengeLayer.module.css'

// Righe della classifica nel riepilogo di una sfida conclusa.
const FINAL_ROWS = 3

function registeredId(user) {
  return user && !user.guest && Number.isInteger(user.id) ? user.id : null
}

/** Pulsanti dell'avviso, da sinistra: «Gioca / Più tardi» oppure il solo «Ok». */
function actionsOf(notice) {
  if (notice.kind === 'challenge' && notice.linked) {
    return [{ id: 'play', label: 'Gioca' }, { id: 'later', label: 'Più tardi' }]
  }
  return [{ id: 'ok', label: 'Ok' }]
}

/**
 * Avvisi della Sfida trofeo (README «Sfida trofeo») quando un profilo entra
 * come P1: le sfide nuove di altri («Gioca / Più tardi»; senza account
 * RetroAchievements solo «Ok», con l'invito a collegarlo dal profilo) e il riepilogo di
 * quelle concluse a cui ha partecipato. «Gioca», «Più tardi» e «Ok» segnano
 * l'avviso come visto: con «Più tardi» la sfida non compare più come avviso
 * e resta nella sezione «Sfide trofeo» del profilo, come ricorda un messaggio. Gli avvisi
 * aspettano `canNotify` (libreria senza finestre, nessuna partita, nessun
 * avviso del Wrapped).
 *
 * Finché un avviso è aperto riceve tutti gli eventi da `inputRef.current(event)`
 * e indica la legenda con `onContext` (`challengeNotice` o `challengeInfo`).
 */
export default function ChallengeLayer({ inputRef, onContext, canNotify }) {
  const { state, dispatch } = useApp()
  // Avvisi in attesa: `[{kind: 'challenge' | 'final', challenge, linked, account}]`.
  const [queue, setQueue] = useState([])
  const [choice, setChoice] = useState(0)
  const live = useRef({})

  const p1 = registeredId(state.players.p1.user)
  const runSeq = state.run.lastResult ? state.run.lastResult.seq : 0

  // Nuovo P1 registrato (o partita appena finita): i suoi avvisi; quelli di un P1 precedente non valgono più.
  useEffect(() => {
    if (p1 === null) {
      setQueue([])
      return undefined
    }
    let alive = true
    api.challengeNotices(p1)
      .then((data) => {
        if (!alive) {
          return
        }
        setQueue([
          ...data.finals.map((challenge) => ({ kind: 'final', challenge, linked: data.linked, account: p1 })),
          ...data.challenges.map((challenge) => ({ kind: 'challenge', challenge, linked: data.linked, account: p1 })),
        ])
      })
      .catch(() => alive && setQueue([]))
    return () => {
      alive = false
    }
  }, [p1, runSeq])

  const notice = canNotify && queue.length ? queue[0] : null
  const noticeKey = notice ? `${notice.kind}:${notice.challenge.id}` : null
  useEffect(() => {
    if (noticeKey) {
      setChoice(0)
      play('notice')
    }
  }, [noticeKey])

  const answer = useCallback((action) => {
    const current = live.current.notice
    if (!current) {
      return
    }
    setQueue((items) => items.filter((item) => item !== current))
    if (action === 'later') {
      dispatch(showToast('Sfida rimandata: per riprenderla vai sul tuo profilo, in «Sfide trofeo».'))
    }
    const kind = current.kind === 'final' ? 'final' : 'notice'
    api.challengeSeen(current.account, current.challenge.id, kind).catch(() => {})
    if (action === 'play') {
      dispatch(requestChallenge(current.challenge))
    }
  }, [dispatch])

  useEffect(() => {
    live.current = { notice, choice }
  })

  let context = null
  if (notice) {
    context = actionsOf(notice).length > 1 ? 'challengeNotice' : 'challengeInfo'
  }
  useEffect(() => {
    onContext(context)
  }, [context, onContext])
  useEffect(() => () => onContext(null), [onContext])

  useEffect(() => {
    inputRef.current = (event) => {
      const current = live.current.notice
      if (!current) {
        return false
      }
      const actions = actionsOf(current)
      if ((event.button === 'left' || event.button === 'right') && event.kind !== 'release') {
        setChoice((at) => stepIndex(at, event.button === 'right' ? 1 : -1, actions.length, wraps(event)))
        return true
      }
      if (event.kind === 'press' && event.button === 'a') {
        answer(actions[Math.min(live.current.choice, actions.length - 1)].id)
      } else if (event.kind === 'press' && event.button === 'b') {
        answer(actions.length > 1 ? 'later' : 'ok')
      }
      return true
    }
    return () => {
      inputRef.current = null
    }
  }, [inputRef, answer])

  if (!notice) {
    return null
  }
  const { challenge } = notice
  const actions = actionsOf(notice)
  const final = notice.kind === 'final'
  const text = final ? finalText(challenge, notice.account) : noticeText(challenge)
  return (
    <div className={styles.layer}>
      <div className={styles.backdrop} onClick={() => answer(actions.length > 1 ? 'later' : 'ok')} />
      <div className={styles.notice} role="alertdialog" aria-label={text.title}>
        <span className={`pix ${styles.kicker}`}>{final ? 'SFIDA CONCLUSA' : 'SFIDA TROFEO'}</span>
        {challenge.thumb && !final && (
          <img className={styles.thumb} src={api.challengeThumbUrl(challenge.id)} alt="" />
        )}
        <h2 className={`pix ${styles.title}`}>{text.title}</h2>
        <p className={styles.text}>{text.text}</p>
        {!final && <p className={styles.detail}>{text.detail}</p>}
        {!final && !notice.linked && (
          <p className={styles.warning}>
            Per giocarla collega il tuo account RetroAchievements: profilo → Trofei → «Collega account».
          </p>
        )}
        {final && (
          <ol className={styles.ranking}>
            {challenge.ranking.slice(0, FINAL_ROWS).map((row) => (
              <li key={row.account} className={row.account === notice.account ? styles.me : ''}>
                <span className={styles.who}>{row.name}</span>
                <span className={`pix ${styles.time}`}>{clock(row.best)}</span>
              </li>
            ))}
          </ol>
        )}
        <div className={styles.actions}>
          {actions.map((action, position) => (
            <button
              key={action.id}
              type="button"
              className={choice === position ? `${styles.button} ${styles.chosen}` : styles.button}
              onPointerEnter={() => setChoice(position)}
              onClick={() => answer(action.id)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
