import { useCallback, useEffect, useRef, useState } from 'react'
import Leaderboard from '../components/Leaderboard.jsx'
import { useWindowLayout } from '../components/Stage.jsx'
import { boardSide, enterDirection } from '../lib/leaderboard.js'
import { useApp } from '../state/AppContext.jsx'
import { SLOTS, anyModal } from '../state/players.js'
import LoginModal from './LoginModal.jsx'
import styles from './LoginLayer.module.css'

// Layout in cui la finestra occupa tutta la larghezza: niente classifica.
const NARROW = new Set(['compact', 'portrait'])

/**
 * Finestre di accesso dei giocatori (livello 10): sfondo sfocato se almeno
 * una è aperta, poi la finestra di P1 a sinistra e quella di P2 a destra.
 * Con una sola finestra aperta la classifica di casa occupa l'altra metà e
 * la finestra si stringe come quando sono due.
 *
 * `inputRef.current(slot, event)` consegna l'evento alla finestra dello slot
 * (App decide lo slot con `gate`, src/state/players.js). Nella scelta del
 * profilo la direzione verso la classifica (→ per P1, ← per P2) porta il
 * joypad dentro la classifica, che da lì riceve gli eventi finché non si
 * torna alla finestra. `onContext` indica la legenda: `loginBoard` o
 * `loginPlayer` nella classifica, `loginReserved` con un gioco prenotato,
 * altrimenti `null` (legenda `login`).
 */
export default function LoginLayer({ inputRef, onContext }) {
  const { state } = useApp()
  const layout = useWindowLayout()
  const handlers = useRef({})
  const boardHandler = useRef(null)
  const [boardOn, setBoardOn] = useState(false)
  const [boardContext, setBoardContext] = useState(null)

  const register = useCallback((slot, handle) => {
    handlers.current[slot] = handle
  }, [])
  const registerBoard = useCallback((handle) => {
    boardHandler.current = handle
  }, [])
  const enterBoard = useCallback(() => setBoardOn(true), [])
  const leaveBoard = useCallback(() => setBoardOn(false), [])

  const { players } = state
  const open = SLOTS.filter((slot) => players[slot].modal)
  const side = NARROW.has(layout.name) ? null : boardSide(open)
  const boardSlot = side ? open[0] : null
  const choosing = Boolean(boardSlot) && players[boardSlot].step === 'choose'
  const boardActive = boardOn && choosing

  // Chiusa la classifica (seconda finestra, profilo nuovo, finestra chiusa) il joypad torna alla finestra.
  useEffect(() => {
    if (!choosing) {
      setBoardOn(false)
    }
  }, [choosing])

  const routing = useRef({})
  useEffect(() => {
    routing.current = { boardSlot, boardActive, choosing, osk: Boolean(state.osk) }
  })

  useEffect(() => {
    inputRef.current = (slot, event) => {
      const current = routing.current
      if (slot === current.boardSlot && current.boardActive && boardHandler.current) {
        boardHandler.current(event)
        return
      }
      if (slot === current.boardSlot && current.choosing && !current.osk && event.kind === 'press' &&
          event.button === enterDirection(slot)) {
        setBoardOn(true)
        return
      }
      const handle = handlers.current[slot]
      if (handle) {
        handle(event)
      }
    }
    return () => {
      inputRef.current = null
    }
  }, [inputRef])

  const reserved = state.reservedGame
  let context = null
  if (boardActive) {
    context = boardContext
  } else if (reserved && players[reserved.slot] && players[reserved.slot].modal) {
    context = 'loginReserved'
  }
  useEffect(() => {
    onContext(context)
  }, [context, onContext])
  useEffect(() => () => onContext(null), [onContext])

  if (!anyModal(players)) {
    return null
  }
  return (
    <>
      <div className={styles.backdrop} />
      {side && (
        <Leaderboard
          key={side}
          side={side}
          slotKey={boardSlot}
          active={boardActive}
          register={registerBoard}
          onEnter={enterBoard}
          onLeave={leaveBoard}
          onContext={setBoardContext}
        />
      )}
      {open.map((slot) => (
        <LoginModal
          key={slot}
          slotKey={slot}
          dual={open.length > 1 || Boolean(side)}
          away={slot === boardSlot && boardActive}
          onReturn={leaveBoard}
          register={register}
        />
      ))}
    </>
  )
}
