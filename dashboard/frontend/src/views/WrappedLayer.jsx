import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import { stepIndex, wraps } from '../input/wrap.js'
import { play } from '../lib/sound.js'
import { noticeText, slidesFor } from '../lib/wrapped.js'
import { closeWrapped, openWrapped } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import WrappedSlide from './WrappedSlides.jsx'
import styles from './WrappedLayer.module.css'

// Pulsanti dell'avviso, da sinistra: ← → li scorrono, A preme quello evidenziato.
const NOTICE_ACTIONS = ['watch', 'later']
// Attesa del suono della rivelazione del personaggio (ms), in sincrono con l'animazione.
const REVEAL_MS = 700

function registeredId(user) {
  return user && !user.guest && Number.isInteger(user.id) ? user.id : null
}

/**
 * Wrapped (README «Wrapped»): avviso «È pronto il tuo Wrapped» e schermate
 * del riepilogo (src/views/WrappedSlides.jsx).
 *
 * Avvisi: quando un profilo entra come P1 e il Wrapped più recente
 * (`pending` di `GET /api/wrapped/list`) non è ancora stato visto, compare
 * «Guarda / Più tardi»; quando entra P2 (con P1 già dentro) compare quello
 * di casa, sempre dopo quello personale. «Più tardi» lo ripropone al
 * prossimo ingresso. Gli avvisi aspettano `canNotify` (libreria senza
 * finestre, nessuna partita).
 *
 * Schermate: si aprono con `openWrapped(account, period)` (avviso, profilo,
 * Impostazioni) e si segnano come viste all'apertura. ← → (o A) scorrono le
 * schermate, B chiude; col mouse, clic a destra o a sinistra.
 *
 * Finché avviso o schermate sono aperti riceve tutti gli eventi da
 * `inputRef.current(event)` e indica la legenda con `onContext`
 * (`wrappedNotice` o `wrapped`).
 */
export default function WrappedLayer({ inputRef, onContext, canNotify }) {
  const { state, dispatch } = useApp()
  // Avvisi in attesa: `[{account, period, kind, label, name}]` (`account` nullo = casa), quello personale prima.
  const [queue, setQueue] = useState([])
  const [choice, setChoice] = useState(0)
  const open = state.wrapped
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [index, setIndex] = useState(0)
  const live = useRef({})

  const p1 = registeredId(state.players.p1.user)
  const p1Name = state.players.p1.user ? state.players.p1.user.name : ''
  const together = Boolean(state.players.p1.user && state.players.p2.user)

  const enqueue = useCallback((notice) => {
    setQueue((current) => {
      const rest = current.filter((item) => item.account !== notice.account)
      return [...rest, notice].sort((a, b) => (a.account === null) - (b.account === null))
    })
  }, [])

  // Nuovo P1 registrato: il suo avviso, se c'è; quello di un P1 precedente non vale più.
  useEffect(() => {
    setQueue((current) => current.filter((item) => item.account === null || item.account === p1))
    if (p1 === null) {
      return undefined
    }
    let alive = true
    api.wrappedList(p1)
      .then((list) => {
        const found = list.pending && list.periods.find((item) => item.period === list.pending)
        if (alive && found) {
          enqueue({ account: p1, period: found.period, kind: found.kind, label: found.label, name: p1Name })
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
    // Il nome serve solo al testo: conta l'ingresso del profilo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p1, enqueue])

  // Entra P2 con P1 già dentro: avviso del Wrapped di casa; se uno dei due esce, l'avviso sparisce.
  useEffect(() => {
    if (!together) {
      setQueue((current) => current.filter((item) => item.account !== null))
      return undefined
    }
    let alive = true
    api.wrappedList(null)
      .then((list) => {
        const found = list.pending && list.periods.find((item) => item.period === list.pending)
        if (alive && found) {
          enqueue({ account: null, period: found.period, kind: found.kind, label: found.label, name: '' })
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [together, enqueue])

  const notice = canNotify && !open && queue.length ? queue[0] : null
  const noticeKey = notice ? `${notice.account}:${notice.period}` : null
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
    if (action === 'watch') {
      dispatch(openWrapped(current.account, current.period))
    }
  }, [dispatch])

  // Schermate: dati del Wrapped aperto, segnato come visto appena arriva.
  const openKey = open ? `${open.account}:${open.period}` : null
  useEffect(() => {
    if (!open) {
      setData(null)
      setError(null)
      return undefined
    }
    let alive = true
    setData(null)
    setError(null)
    setIndex(0)
    api.wrapped(open.account, open.period)
      .then((result) => {
        if (!alive) {
          return
        }
        setData(result)
        setQueue((items) => items.filter((item) => !(item.account === open.account && item.period === open.period)))
        api.wrappedSeen(open.account, open.period).catch(() => {})
      })
      .catch((failure) => alive && setError(failure.message))
    return () => {
      alive = false
    }
    // Si rilegge solo quando cambia il Wrapped aperto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey])

  const slides = slidesFor(data)
  const slide = slides[index] || null
  useEffect(() => {
    if (!slide) {
      return undefined
    }
    if (slide === 'persona' || slide === 'personas') {
      const timer = window.setTimeout(() => play('reveal'), REVEAL_MS)
      return () => window.clearTimeout(timer)
    }
    if (slide === 'trophies') {
      play('trophy')
    }
    return undefined
  }, [slide, data])

  const close = useCallback(() => dispatch(closeWrapped()), [dispatch])

  const move = useCallback((dir, wrap) => {
    const { count, index: at } = live.current
    if (!count) {
      return
    }
    const next = stepIndex(at, dir, count, wrap)
    if (next !== at) {
      setIndex(next)
      play('slide')
    }
  }, [])

  useEffect(() => {
    live.current = { notice, choice, count: slides.length, index }
  })

  let context = null
  if (open) {
    context = 'wrapped'
  } else if (notice) {
    context = 'wrappedNotice'
  }
  useEffect(() => {
    onContext(context)
  }, [context, onContext])
  useEffect(() => () => onContext(null), [onContext])

  useEffect(() => {
    inputRef.current = (event) => {
      if (live.current.notice && !open) {
        if ((event.button === 'left' || event.button === 'right') && event.kind !== 'release') {
          setChoice((current) => stepIndex(current, event.button === 'right' ? 1 : -1, NOTICE_ACTIONS.length, wraps(event)))
          return true
        }
        if (event.kind === 'press' && event.button === 'a') {
          answer(NOTICE_ACTIONS[live.current.choice])
        } else if (event.kind === 'press' && event.button === 'b') {
          answer('later')
        }
        return true
      }
      if (!open) {
        return false
      }
      if (event.kind === 'release') {
        return true
      }
      const { count, index: at } = live.current
      if (event.button === 'right') {
        move(1, wraps(event))
      } else if (event.button === 'left') {
        move(-1, wraps(event))
      } else if (event.kind === 'press' && event.button === 'a') {
        if (!count || at >= count - 1) {
          close()
        } else {
          move(1, false)
        }
      } else if (event.kind === 'press' && event.button === 'b') {
        close()
      }
      return true
    }
    return () => {
      inputRef.current = null
    }
  }, [inputRef, open, answer, move, close])

  if (open) {
    const progress = slides.length ? slides.map((id, position) => (
      <span key={id} className={position <= index ? `${styles.dot} ${styles.dotOn}` : styles.dot} />
    )) : null
    return (
      <div className={`${styles.show} ${data && data.scope === 'house' ? styles.house : ''}`} role="dialog" aria-label="Wrapped">
        <div className={styles.sky} aria-hidden="true">
          <span className={styles.orbA} />
          <span className={styles.orbB} />
          <span className={styles.grid} />
        </div>
        <div className={styles.progress}>{progress}</div>
        <button type="button" className={styles.close} onClick={close} aria-label="Chiudi il Wrapped">
          ✕
        </button>
        <div className={styles.stage}>
          {!data && !error && <span className={`pix ${styles.loading}`}>Preparo il tuo Wrapped…</span>}
          {error && <span className={styles.error}>{error}</span>}
          {slide && (
            <div key={`${openKey}-${slide}`} className={styles.slide}>
              <WrappedSlide id={slide} data={data} systems={state.systems} />
            </div>
          )}
        </div>
        <button type="button" className={`${styles.tap} ${styles.tapLeft}`} aria-label="Indietro" onClick={() => move(-1, false)} />
        <button
          type="button"
          className={`${styles.tap} ${styles.tapRight}`}
          aria-label="Avanti"
          onClick={() => (index >= slides.length - 1 ? close() : move(1, false))}
        />
      </div>
    )
  }

  if (!notice) {
    return null
  }
  const text = noticeText(notice)
  return (
    <div className={styles.noticeLayer}>
      <div className={styles.noticeBackdrop} onClick={() => answer('later')} />
      <div className={styles.notice} role="alertdialog" aria-label={text.title}>
        <span className={styles.noticeSpark} aria-hidden="true" />
        <span className={`pix ${styles.noticeKicker}`}>WRAPPED</span>
        <h2 className={`pix ${styles.noticeTitle}`}>{text.title}</h2>
        <p className={styles.noticeText}>{text.subtitle}</p>
        <p className={styles.noticeQuestion}>{text.question}</p>
        <div className={styles.noticeActions}>
          {[
            { id: 'watch', label: 'Guarda' },
            { id: 'later', label: 'Più tardi' },
          ].map((action, position) => (
            <button
              key={action.id}
              type="button"
              className={choice === position ? `${styles.noticeButton} ${styles.chosen}` : styles.noticeButton}
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
