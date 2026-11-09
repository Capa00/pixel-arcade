import { useCallback, useEffect, useRef, useState } from 'react'
import GameCover from '../components/GameCover.jsx'
import { stepIndex, wraps } from '../input/wrap.js'
import { pickGame, randomPool, reel, reelTimes } from '../lib/randomPick.js'
import { play } from '../lib/sound.js'
import { showGame, showToast } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import { currentGame, currentSystem, filtered } from '../state/reducer.js'
import styles from './RandomPickLayer.module.css'

// Sotto questa frazione del tasto tenuto non si mostra l'avviso: un tocco breve resta il preferito.
const HINT_FROM = 0.25
// Pulsanti della finestra, nell'ordine: ← → li scorrono, A preme quello evidenziato.
const ACTIONS = ['go', 'again', 'close']

function reducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

/**
 * «Cosa gioco?»: Y (triangolo) tenuto nella libreria, oppure R, pesca un
 * gioco a caso tra quelli della griglia (console, filtri e ricerca attivi,
 * senza i ⊘) e lo mostra dopo aver fatto scorrere le copertine come una slot
 * machine (src/lib/randomPick.js).
 *
 * `openRef.current()` apre la finestra (lo chiama il comando di App); finché
 * è aperta riceve tutti gli eventi da `inputRef.current(event)` e indica la
 * legenda con `onContext`: durante il giro A lo ferma; poi ← → scelgono tra
 * «Vai al gioco», «Ancora» e «Chiudi» e A preme quello evidenziato. X
 * ripesca e B chiude anche direttamente. `holdProgress` (0–1) è l'avanzamento del tasto
 * tenuto, per l'avviso in basso.
 */
export default function RandomPickLayer({ openRef, inputRef, onContext, holdProgress = 0 }) {
  const { state, dispatch } = useApp()
  const stateRef = useRef(state)
  // `{system, reel, step}`: copertine da far scorrere e quella mostrata ora (l'ultima è il gioco scelto).
  const [pick, setPick] = useState(null)
  const pickRef = useRef(null)
  // Pulsante evidenziato (indice in `ACTIONS`).
  const [choice, setChoice] = useState(0)
  const choiceRef = useRef(0)
  useEffect(() => {
    stateRef.current = state
    pickRef.current = pick
    choiceRef.current = choice
  })

  const spin = useCallback((avoid) => {
    const current = stateRef.current
    const system = currentSystem(current)
    const pool = randomPool(filtered(current))
    if (!system || !pool.length) {
      dispatch(showToast('Nessun gioco da pescare in questa console con i filtri attivi.'))
      return
    }
    const chosen = pickGame(pool, avoid)
    const list = reducedMotion() ? [chosen] : reel(pool, chosen)
    setPick({ system, reel: list, step: 0 })
    setChoice(0)
  }, [dispatch])

  useEffect(() => {
    openRef.current = () => spin(currentGame(stateRef.current))
    return () => {
      openRef.current = null
    }
  }, [openRef, spin])

  // Giro delle copertine: sempre più lento fino al gioco scelto.
  const spinning = Boolean(pick) && pick.step < pick.reel.length - 1
  const reelList = pick ? pick.reel : null
  useEffect(() => {
    if (!reelList || reelList.length < 2) {
      return undefined
    }
    const timers = reelTimes(reelList.length - 1).map((at, index) =>
      window.setTimeout(() => setPick((current) => (current && current.reel === reelList ? { ...current, step: index + 1 } : current)), at),
    )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [reelList])

  // Un tic a ogni copertina del rullo, un «ding» sul gioco scelto.
  const step = pick ? pick.step : null
  useEffect(() => {
    if (step !== null) {
      play(spinning ? 'tick' : 'ding')
    }
    // Suona a ogni passo del rullo, non quando cambia solo `spinning`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, reelList])

  const close = useCallback(() => setPick(null), [])

  const stop = useCallback(() => {
    setPick((current) => (current ? { ...current, step: current.reel.length - 1 } : current))
  }, [])

  const go = useCallback(() => {
    const current = pickRef.current
    if (!current) {
      return
    }
    const chosen = current.reel[current.reel.length - 1]
    setPick(null)
    dispatch(showGame(current.system.id, chosen.id))
  }, [dispatch])

  const again = useCallback(() => {
    const current = pickRef.current
    if (current) {
      spin(current.reel[current.reel.length - 1])
    }
  }, [spin])

  const open = Boolean(pick)
  useEffect(() => {
    onContext(open ? (spinning ? 'randomPickSpin' : 'randomPick') : null)
  }, [open, spinning, onContext])
  useEffect(() => () => onContext(null), [onContext])

  useEffect(() => {
    inputRef.current = (event) => {
      const current = pickRef.current
      if (!current) {
        return false
      }
      const turning = current.step < current.reel.length - 1
      if ((event.button === 'left' || event.button === 'right') && event.kind !== 'release' && !turning) {
        setChoice(stepIndex(choiceRef.current, event.button === 'right' ? 1 : -1, ACTIONS.length, wraps(event)))
        return true
      }
      if (event.kind !== 'press') {
        return true
      }
      if (event.button === 'b') {
        close()
      } else if (event.button === 'a') {
        if (turning) {
          stop()
        } else {
          ({ go, again, close })[ACTIONS[choiceRef.current]]()
        }
      } else if (event.button === 'x' && !turning) {
        again()
      }
      return true
    }
    return () => {
      inputRef.current = null
    }
  }, [inputRef, close, stop, go, again])

  const hint = !pick && holdProgress > HINT_FROM
  if (!pick) {
    return hint ? (
      <div className={styles.hint} style={{ '--progress': (holdProgress - HINT_FROM) / (1 - HINT_FROM) }}>
        <span className={styles.hintText}>Cosa gioco?</span>
        <span className={styles.hintBar} />
      </div>
    ) : null
  }

  const game = pick.reel[pick.step]
  return (
    <div className={styles.layer}>
      <div className={styles.backdrop} onClick={close} />
      <div className={styles.card} role="dialog" aria-label="Cosa gioco?">
        <span className={`pix ${styles.kicker}`}>COSA GIOCO?</span>
        <span className={styles.system}>{pick.system.name}</span>
        <div className={spinning ? `${styles.window} ${styles.turning}` : styles.window}>
          <GameCover key={`${pick.step}:${game.id}`} system={pick.system} game={game} className={styles.cover} />
        </div>
        <span className={spinning ? `${styles.title} ${styles.blur}` : styles.title}>{game.title}</span>
        <div className={styles.actions}>
          {[
            { id: 'go', label: spinning ? 'Ferma' : 'Vai al gioco', run: spinning ? stop : go },
            { id: 'again', label: 'Ancora', run: again, off: spinning },
            { id: 'close', label: 'Chiudi', run: close },
          ].map((action, index) => (
            <button
              key={action.id}
              type="button"
              className={!spinning && choice === index ? `${styles.button} ${styles.chosen}` : styles.button}
              disabled={action.off}
              onPointerEnter={() => !spinning && setChoice(index)}
              onClick={action.run}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
