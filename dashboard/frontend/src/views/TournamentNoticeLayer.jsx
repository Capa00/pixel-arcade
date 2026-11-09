import { useCallback, useEffect, useRef, useState } from 'react'
import GameCover from '../components/GameCover.jsx'
import { stepIndex, wraps } from '../input/wrap.js'
import { TOURNAMENT_CONSOLE, noticeText, noticeTournaments } from '../lib/tournament.js'
import { play } from '../lib/sound.js'
import { clickSlot, loginStep, selectSystem } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import { SLOTS, eventSlot } from '../state/players.js'
import * as store from '../state/tournamentStore.js'
import styles from './ChallengeLayer.module.css'
import own from './TournamentNoticeLayer.module.css'

/** Chi è nello slot: `id:<profilo>`, `guest:<nome>` per l'ospite, `null` se vuoto. */
function identity(user) {
  if (!user) {
    return null
  }
  return user.guest ? `guest:${user.name}` : `id:${user.id}`
}

function actionsOf(guest) {
  return guest
    ? [{ id: 'create', label: 'Crea profilo' }, { id: 'no', label: 'No' }]
    : [{ id: 'yes', label: 'Sì' }, { id: 'no', label: 'No' }]
}

/**
 * Avviso dei tornei all'ingresso di un giocatore (README «Torneo»), P1 o P2,
 * a ogni ingresso, se ci sono tornei con le iscrizioni aperte e posti liberi
 * a cui il profilo non è iscritto:
 *
 * - profilo: «Ti vuoi iscrivere?» (o «Vuoi vederli?» con più tornei). «Sì»
 *   apre la scheda TOURNAMENT sul torneo con il menu e «Iscriviti»
 *   evidenziato, oppure sull'elenco;
 * - ospite: «Crea un profilo se vuoi partecipare.» «Crea profilo» apre
 *   «Chi gioca?» di quel giocatore sul modulo del nuovo profilo; il profilo
 *   creato prende il posto dell'ospite e si va alla scheda come dopo «Sì»,
 *   senza un altro avviso. Tornando indietro dal modulo si resta ospiti.
 *
 * Risponde il joypad del giocatore appena entrato (tastiera e mouse sempre).
 * Gli avvisi aspettano `canNotify` (libreria senza finestre, nessuna partita,
 * nessun altro avviso). Finché un avviso è aperto riceve tutti gli eventi da
 * `inputRef.current(event)` e indica la legenda con `onContext`.
 */
export default function TournamentNoticeLayer({ inputRef, onContext, canNotify }) {
  const { state, dispatch } = useApp()
  const { list } = store.useTournaments()
  // Avvisi in attesa: `[{slot, key}]` (`key` = chi è entrato).
  const [queue, setQueue] = useState([])
  const [choice, setChoice] = useState(0)
  const previous = useRef({ p1: null, p2: null })
  // Vero se all'ultimo controllo c'era la schermata «Incontro» (src/views/MatchLayer.jsx).
  const matchSeen = useRef(false)
  const inMatch = Boolean(state.match)
  const live = useRef({})

  const { players } = state
  const keys = SLOTS.map((slot) => identity(players[slot].user))
  const modals = SLOTS.map((slot) => Boolean(players[slot].modal))

  // Apre la scheda TOURNAMENT per il giocatore `slot` col profilo `user`.
  const goToTab = useCallback((slot, user) => {
    const targets = noticeTournaments(store.getSnapshot().list, user)
    if (targets.length === 1) {
      store.requestFocus(targets[0].id, slot, true)
    } else {
      store.requestFocus(null, slot, false)
    }
    dispatch(selectSystem(TOURNAMENT_CONSOLE.id))
  }, [dispatch])

  // Chi entra in uno slot (e non c'era già, per esempio P2 che diventa P1) riceve l'avviso.
  const keyText = keys.join('|')
  const modalText = modals.join('|')
  useEffect(() => {
    const current = Object.fromEntries(SLOTS.map((slot, at) => [slot, keys[at]]))
    // I giocatori dell'incontro e il ritorno di quelli di prima non sono ingressi: nessun avviso.
    if (inMatch || matchSeen.current) {
      matchSeen.current = inMatch
      previous.current = current
      setQueue([])
      return
    }
    const before = new Set(Object.values(previous.current).filter(Boolean))
    const added = []
    for (const slot of SLOTS) {
      const user = players[slot].user
      if (store.creating.has(slot)) {
        if (user && !user.guest) {
          store.creating.delete(slot)
          goToTab(slot, user)
        } else if (!players[slot].modal) {
          store.creating.delete(slot)
        }
        continue
      }
      if (current[slot] && !before.has(current[slot])) {
        added.push({ slot, key: current[slot] })
      }
    }
    previous.current = current
    setQueue((items) => [...items.filter((item) => current[item.slot] === item.key), ...added])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyText, modalText, goToTab, inMatch])

  const head = queue.length ? queue[0] : null
  const user = head ? players[head.slot].user : null
  const targets = head && list ? noticeTournaments(list, user) : []

  // Nessun torneo da proporre (già iscritto, posti finiti, nessun torneo aperto): l'avviso cade.
  useEffect(() => {
    if (head && list && !targets.length) {
      setQueue((items) => items.slice(1))
    }
  }, [head, list, targets.length])

  const notice = canNotify && head && targets.length ? head : null
  const noticeKey = notice ? `${notice.slot}:${notice.key}` : null
  useEffect(() => {
    if (noticeKey) {
      setChoice(0)
      play('notice')
    }
  }, [noticeKey])

  const answer = useCallback((action) => {
    const current = live.current
    if (!current.notice) {
      return
    }
    const { slot } = current.notice
    setQueue((items) => items.filter((item) => item !== current.notice))
    if (action === 'yes' && current.user) {
      goToTab(slot, current.user)
    } else if (action === 'create') {
      store.creating.add(slot)
      dispatch(clickSlot(slot))
      dispatch(loginStep(slot, 'new'))
    }
  }, [goToTab, dispatch])

  useEffect(() => {
    live.current = { notice, user, choice, players }
  })

  const context = notice ? 'tournamentNotice' : null
  useEffect(() => {
    onContext(context)
  }, [context, onContext])
  useEffect(() => () => onContext(null), [onContext])

  useEffect(() => {
    inputRef.current = (event) => {
      const current = live.current
      if (!current.notice) {
        return false
      }
      const fromPad = event.pad !== null && event.pad !== undefined
      if (fromPad && eventSlot(current.players, event) !== current.notice.slot) {
        return true
      }
      const actions = actionsOf(Boolean(current.user && current.user.guest))
      if ((event.button === 'left' || event.button === 'right') && event.kind !== 'release') {
        setChoice((at) => stepIndex(at, event.button === 'right' ? 1 : -1, actions.length, wraps(event)))
        return true
      }
      if (event.kind === 'press' && event.button === 'a') {
        answer(actions[Math.min(current.choice, actions.length - 1)].id)
      } else if (event.kind === 'press' && event.button === 'b') {
        answer('no')
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
  const guest = Boolean(user && user.guest)
  const text = noticeText(targets, guest, new Date())
  const actions = actionsOf(guest)
  // Con un solo torneo la sua copertina; con più tornei quella del più vicino.
  const game = targets[0].gameInfo
  return (
    <div className={styles.layer}>
      <div className={styles.backdrop} onClick={() => answer('no')} />
      <div className={styles.notice} role="alertdialog" aria-label={text.title}>
        <span className={`pix ${styles.kicker}`}>TOURNAMENT · {user ? user.name : ''}</span>
        {game && (
          <GameCover
            key={`${game.system}:${game.id}`}
            system={state.systems.find((entry) => entry.id === game.system) || { id: game.system }}
            game={game}
            className={own.cover}
          />
        )}
        <h2 className={`pix ${styles.title}`}>{text.title}</h2>
        <p className={styles.text}>{text.text}</p>
        <p className={styles.detail}>{text.question}</p>
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
