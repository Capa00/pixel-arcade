import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import Avatar from '../components/Avatar.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import FaceButton from '../components/FaceButton.jsx'
import PadTester from '../components/PadTester.jsx'
import Podium from '../components/Podium.jsx'
import { moveChoice, YES_NO } from '../components/confirmChoices.js'
import { wraps } from '../input/wrap.js'
import {
  adminPress,
  autoDeclared,
  autoDeclaredText,
  comboButton,
  declareBody,
  gameLine,
  moveDeclare,
  padAssignPress,
  padAssignStart,
  padAssignTest,
  padsByPlayer,
  padsForOrder,
  padSide,
  savedAdmin,
  scoreProblem,
  sideOrder,
  startScore,
  stepScore,
  swapSide,
  tallyText,
} from '../lib/tournament.js'
import { playing } from '../lib/run.js'
import { xpLine } from '../lib/sessionResult.js'
import { play } from '../lib/sound.js'
import { matchClose, matchSides, requestMatch, showToast } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import { PLAYER_INFO, SLOTS } from '../state/players.js'
import * as store from '../state/tournamentStore.js'
import styles from './MatchLayer.module.css'
import { ComboDialog } from './SettingsTournament.jsx'

// Durata dell'animazione del sorteggio dei lati (ms).
const DRAW_MS = 1400
// Tasti tenuti premuti da ciascun lato nella prova dei tasti.
const NO_HELD = { p1: [], p2: [] }
// Attesa massima dell'avvio della partita dopo i due «Pronto» (ms), poi si può riprovare.
const START_WAIT_MS = 8000
const SIDE_NAMES = { alternate: 'Lati alternati', random: 'Lati sorteggiati', free: 'Lati liberi' }
const NOT_ADMIN = 'Il risultato lo dichiara chi ha creato il torneo, entrato come P1 prima dell’incontro.'
const PAD_LOST = 'Un joypad dell’incontro è stato scollegato: rifate l’assegnazione.'

// Joypad collegati adesso (indici della Gamepad API).
function connectedPads() {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) {
    return []
  }
  return Array.from(navigator.getGamepads() || []).filter(Boolean).map((pad) => pad.index)
}

function lockedError(error) {
  return Boolean(error && error.data && error.data.locked)
}

/**
 * Schermata «Incontro» del torneo (README «Torneo»), aperta da «Gioca
 * l'incontro» nel tabellone (`state.match`). Mostra i due giocatori con il
 * lato di ciascuno, la partita e la serie. Con i lati sorteggiati c'è
 * l'animazione del sorteggio. Poi l'assegnazione dei joypad ai lati
 * (`padAssignPress` in src/lib/tournament.js), senza scambiarsi i joypad:
 * «<P1> premi START» (con i lati liberi qui ◀ ▶ scambiano i lati), «<P2>
 * premi START» (SELECT torna a P1), infine la prova dei tasti, che si
 * accendono sul joypad disegnato del lato, con START per PRONTO e SELECT
 * per ANNULLA (due ANNULLA: si riassegna). Con due PRONTO la partita parte
 * coi joypad assegnati (src/views/RunLayer.jsx, richiesta `match` con
 * `pads`); gli slot della dashboard tengono i loro joypad, così l'admin
 * governa sempre col suo. L'assegnazione vale per tutto l'incontro e segue
 * i giocatori: dalla partita dopo si riparte dalla prova dei tasti.
 * Tastiera e mouse non assegnano. Per tutto l'incontro P1 e P2 della
 * dashboard sono i due profili secondo i lati; ○ (o Esc) torna al tabellone
 * e rimette quelli di prima, ma nella prova dei tasti ○ del joypad si accende
 * soltanto. Durante la partita la schermata si nasconde e
 * riappare alla fine con «Chi ha vinto la partita N?»: ◀ ▶ tra i due
 * giocatori (nel girone con i pareggi anche PAREGGIO in mezzo), ▼ «Nessuno
 * dei due: rigioca», ✕ dichiara. Se il torneo registra il punteggio, dopo ✕
 * compaiono due numeri: ▲ ▼ cambiano quello selezionato, ◀ ▶ passano
 * all'altro, ✕ conferma (se è coerente), ○ torna alla scelta. Con la serie
 * fissa l'incontro può finire pari. Dichiara l'admin (il
 * P1 di prima dell'incontro, col suo joypad o la tastiera), con la
 * combinazione se il torneo ce l'ha. Poi la partita dopo coi lati aggiornati,
 * oppure «<Nome> vince l'incontro 2-1» e ✕ torna al tabellone. Dopo la
 * finale ✕ apre invece il podio, e ✕ dal podio chiude e torna alla scheda
 * TOURNAMENT sul torneo concluso. A incontro
 * iniziato ○ chiede «Sospendere l'incontro?»: si riprende dal tabellone.
 * Riceve gli eventi da `inputRef.current(event)` e indica la legenda con
 * `onContext`.
 */
export default function MatchLayer({ inputRef, onContext }) {
  const { state, dispatch } = useApp()
  const { list } = store.useTournaments()
  const current = state.match
  const [screen, setScreen] = useState(null)
  const [freeSide, setFreeSide] = useState('p1')
  const [assign, setAssign] = useState(padAssignStart)
  const [held, setHeld] = useState(NO_HELD)
  const [padCount, setPadCount] = useState(() => connectedPads().length)
  const [drawing, setDrawing] = useState(false)
  const [starting, setStarting] = useState(false)
  // Dichiarazione: scelta evidenziata (id del giocatore, `draw` o `replay`), punteggio in corso `{outcome, values,
  // at, error}` (`values` nell'ordine dei lati), combinazione `{sequence, message, error, winner, values}`, richiesta
  // in corso; conferma della sospensione `{choice}`; incontro chiuso `{player, draw, players, score, points,
  // tournament}` (`player` null se pari; `tournament` concluso, col podio, dopo la finale) e podio aperto.
  const [pick, setPick] = useState(null)
  const [scoring, setScoring] = useState(null)
  const [combo, setCombo] = useState(null)
  const [sending, setSending] = useState(false)
  const [suspendAsk, setSuspendAsk] = useState(null)
  const [won, setWon] = useState(null)
  const [podium, setPodium] = useState(false)
  const [reload, setReload] = useState(0)
  const live = useRef({})
  const drawnFor = useRef(null)
  // Joypad di ogni giocatore dell'incontro (`{id: joypad}`), dall'ultima assegnazione completata.
  const byPlayer = useRef(null)
  const freeRef = useRef(freeSide)
  freeRef.current = freeSide

  const busy = playing(state.run) || Boolean(state.run && state.run.running)
  const runSeq = state.run.lastResult ? state.run.lastResult.seq : 0
  const tournament = current ? (list || []).find((item) => item.id === current.tournament) || null : null
  const tournamentId = current ? current.tournament : null
  const matchId = current ? current.match : null
  const played = useRef(runSeq)
  // Partita dichiarata da un'estensione (vedi `autoDeclared`): a incontro chiuso la schermata resta quella di prima.
  const auto = autoDeclared(state.run.lastResult, matchId)
  const autoClosed = Boolean(auto && auto.done)

  // Un incontro nuovo riparte dall'assegnazione dei joypad.
  useEffect(() => {
    byPlayer.current = null
    setAssign(padAssignStart())
  }, [tournamentId, matchId])

  // Dati della schermata: all'apertura e dopo ogni partita. Coi joypad già assegnati si riparte dalla prova dei tasti.
  useEffect(() => {
    if (tournamentId === null) {
      setScreen(null)
      return undefined
    }
    if (autoClosed) {
      return undefined
    }
    let alive = true
    api.tournamentMatchScreen(tournamentId, matchId)
      .then((data) => {
        if (alive) {
          setScreen(data)
          const side = data.sides === 'free' ? freeRef.current : data.sideA
          const pads = side ? padsForOrder(byPlayer.current, sideOrder(data.players, side)) : null
          setAssign(pads ? padAssignTest(pads) : padAssignStart())
          setStarting(false)
          setPick(null)
          setScoring(null)
        }
      })
      .catch((error) => {
        if (alive) {
          dispatch(showToast(error.message, 'error'))
          dispatch(matchClose())
          store.refresh()
        }
      })
    return () => {
      alive = false
    }
  }, [tournamentId, matchId, runSeq, reload, autoClosed, dispatch])

  // Dopo una partita la richiesta d'avvio è finita (anche se non è partita).
  useEffect(() => {
    if (played.current !== runSeq) {
      played.current = runSeq
      setStarting(false)
      store.refresh()
    }
  }, [runSeq])

  // Joypad collegati: con meno di due l'assegnazione non può finire.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }
    const update = () => setPadCount(connectedPads().length)
    window.addEventListener('gamepadconnected', update)
    window.addEventListener('gamepaddisconnected', update)
    update()
    return () => {
      window.removeEventListener('gamepadconnected', update)
      window.removeEventListener('gamepaddisconnected', update)
    }
  }, [])

  // I tasti accesi si spengono a ogni cambio di passo.
  useEffect(() => {
    setHeld(NO_HELD)
  }, [assign.step])

  const sideA = screen ? (screen.sides === 'free' ? freeSide : screen.sideA) : null
  const order = screen && sideA ? sideOrder(screen.players, sideA) : null
  const orderKey = order ? order.map((player) => player.id).join(',') : ''

  // P1 e P2 della dashboard seguono i lati.
  useEffect(() => {
    if (!order) {
      return
    }
    const now = SLOTS.map((key) => (state.players[key].user ? state.players[key].user.id : null)).join(',')
    if (now !== orderKey) {
      dispatch(matchSides(order))
    }
  }, [orderKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Avvio non partito (errore già notificato da RunLayer): dopo un po' si può riprovare.
  useEffect(() => {
    if (!starting || busy) {
      return undefined
    }
    const timer = window.setTimeout(() => {
      setStarting(false)
      setAssign((value) => (value.step === 'test' ? padAssignTest(value.pads) : value))
    }, START_WAIT_MS)
    return () => window.clearTimeout(timer)
  }, [starting, busy])

  // Sorteggio: animazione una volta per partita.
  const drawKey = screen && screen.drawn ? `${matchId}:${screen.gameNo}` : null
  useEffect(() => {
    if (!drawKey || drawnFor.current === drawKey) {
      return undefined
    }
    drawnFor.current = drawKey
    setDrawing(true)
    const timer = window.setTimeout(() => setDrawing(false), DRAW_MS)
    return () => window.clearTimeout(timer)
  }, [drawKey])

  const close = useCallback(() => {
    setCombo(null)
    setSuspendAsk(null)
    setWon(null)
    setPodium(false)
    dispatch(matchClose())
    store.refresh()
  }, [dispatch])

  // Dopo «vince l'incontro»: alla finale il podio, poi la scheda TOURNAMENT sul torneo concluso.
  const afterWin = useCallback(() => {
    const value = live.current
    if (value.won && value.won.tournament && !value.podium) {
      setPodium(true)
      play('confirm')
      return
    }
    const finished = value.won && value.won.tournament
    close()
    if (finished) {
      store.requestFocus(finished.id, null, false)
    }
  }, [close])

  // Giocatori nell'ordine dei lati della partita da dichiarare.
  const pending = screen ? screen.played : null
  const playedOrder = screen && pending ? sideOrder(screen.players, pending.sideA === 'p2' ? 'p2' : 'p1') : null
  const choice = playedOrder ? (pick === null ? playedOrder[0].id : pick) : null

  // Incontro chiuso dalla dichiarazione `result` (a mano o automatica) con i dati `data` della schermata.
  const showWon = useCallback((result, data) => {
    const index = result.draw || data.players[0].id === result.winner ? 0 : 1
    if (result.finished) {
      store.replace(result.tournament)
    }
    const scores = result.scores || [0, 0]
    setWon({
      player: result.draw ? null : data.players[index],
      draw: Boolean(result.draw),
      players: data.players,
      score: [result.wins[index], result.wins[1 - index]],
      points: data.rules && data.rules.score ? [scores[index], scores[1 - index]] : null,
      tournament: result.finished ? result.tournament : null,
    })
  }, [])

  // Dichiarazione automatica appena arrivata: incontro chiuso = «vince l'incontro», altrimenti un avviso e la
  // partita dopo (la schermata si ricarica da sola con l'esito nuovo).
  const autoSeq = useRef(runSeq)
  useEffect(() => {
    if (autoSeq.current === runSeq) {
      return
    }
    autoSeq.current = runSeq
    const data = live.current.screen
    if (!auto || !data) {
      return
    }
    drawnFor.current = null
    store.refresh()
    if (auto.done) {
      showWon(auto, data)
    } else {
      play('confirm')
      dispatch(showToast(autoDeclaredText(auto, data.players, data.played ? data.played.gameNo : data.gameNo)))
    }
  }, [runSeq, auto, showWon, dispatch])

  // Invio della dichiarazione (`winner` = id, `draw` o `replay`) con la combinazione `code` e il punteggio
  // `values` (nell'ordine dei lati, `null` senza).
  const declare = useCallback(async (winner, code, values = null) => {
    const data = live.current.screen
    const sides = live.current.playedOrder
    const admin = savedAdmin(current ? current.saved : null)
    if (!data || !current) {
      return
    }
    if (!admin) {
      dispatch(showToast(NOT_ADMIN, 'error'))
      return
    }
    setSending(true)
    try {
      const body = declareBody(data.players, sides || data.players, winner, values)
      const result = await api.tournamentMatchDeclare(current.tournament, current.match, admin.id, code,
        body.winner, body.draw, body.score)
      setCombo(null)
      setScoring(null)
      drawnFor.current = null
      store.refresh()
      if (result.done) {
        showWon(result, data)
      } else {
        play('confirm')
        setReload((value) => value + 1)
      }
    } catch (error) {
      if (lockedError(error) && live.current.combo) {
        setCombo({ ...live.current.combo, sequence: [], message: error.message, error: true })
      } else {
        setCombo(null)
        dispatch(showToast(error.message, 'error'))
      }
    } finally {
      setSending(false)
    }
  }, [current, dispatch, showWon])

  // Dichiarazione pronta (scelta e punteggio): con la combinazione si apre la sua finestra, altrimenti si invia.
  const submit = useCallback((winner, values) => {
    if (tournament && tournament.combo) {
      setCombo({ sequence: [], message: '', error: false, winner, values })
      return
    }
    declare(winner, null, values)
  }, [tournament, declare])

  // ✕ sulla dichiarazione: col punteggio da registrare prima i due numeri, poi l'invio.
  const choose = useCallback((winner) => {
    if (!savedAdmin(current ? current.saved : null)) {
      dispatch(showToast(NOT_ADMIN, 'error'))
      return
    }
    const data = live.current.screen
    if (data && data.rules && data.rules.score && winner !== 'replay') {
      setScoring({ outcome: winner, ...startScore(live.current.playedOrder, winner), error: '' })
      return
    }
    submit(winner, null)
  }, [current, submit, dispatch])

  // ✕ sul punteggio: si invia solo se è coerente con la scelta.
  const confirmScore = useCallback(() => {
    const value = live.current.scoring
    if (!value) {
      return
    }
    const problem = scoreProblem(live.current.playedOrder, value.outcome, value.values)
    if (problem) {
      play('error')
      setScoring({ ...value, error: problem })
      return
    }
    submit(value.outcome, value.values)
  }, [submit])

  const comboConfirm = useCallback(() => {
    const value = live.current.combo
    if (value && !live.current.sending) {
      declare(value.winner, value.sequence, value.values || null)
    }
  }, [declare])

  const comboClear = useCallback(() => {
    const value = live.current.combo
    if (!value) {
      return
    }
    setCombo(value.sequence.length ? { ...value, sequence: [], message: '', error: false } : null)
  }, [])

  const suspend = useCallback(async () => {
    const data = live.current.screen
    setSuspendAsk(null)
    if (!current || !data) {
      return
    }
    const account = current.account !== null ? current.account : data.players[0].id
    try {
      await api.tournamentMatchSuspend(current.tournament, current.match, account)
    } catch (error) {
      dispatch(showToast(error.message, 'error'))
    }
    close()
  }, [current, close, dispatch])

  // ○: a incontro iniziato chiede se sospendere, altrimenti torna al tabellone.
  const back = useCallback(() => {
    const data = live.current.screen
    if (data && (data.status === 'playing' || data.played)) {
      setSuspendAsk({ choice: 'no' })
      play('back')
      return
    }
    close()
  }, [close])

  const start = useCallback((pads) => {
    const { screen: data, sideA: side } = live.current
    if (!tournament || !data) {
      return
    }
    const connected = connectedPads()
    if (!connected.includes(pads.p1) || !connected.includes(pads.p2)) {
      byPlayer.current = null
      setAssign(padAssignStart())
      dispatch(showToast(PAD_LOST, 'error'))
      return
    }
    setStarting(true)
    const game = { id: tournament.game, title: tournament.gameInfo ? tournament.gameInfo.title : tournament.game }
    dispatch(requestMatch(tournament.system, game, {
      id: tournament.id,
      match: matchId,
      account: current && current.account !== null ? current.account : data.players[0].id,
      sideA: side,
      pads: [pads.p1, pads.p2],
    }))
  }, [tournament, matchId, current, dispatch])

  // START e SELECT dei joypad nell'assegnazione; arrivati alla prova dei tasti si ricorda chi ha quale joypad.
  const pressAssign = useCallback((event) => {
    const value = live.current
    const result = padAssignPress(value.assign, event.pad, event.button)
    if (!result.sound) {
      return
    }
    if (result.assign.step === 'test' && value.assign.step !== 'test' && value.order) {
      byPlayer.current = padsByPlayer(result.assign.pads, value.order)
    }
    setAssign(result.assign)
    play(result.sound)
    if (result.go) {
      start(result.assign.pads)
    }
  }, [start])

  useEffect(() => {
    live.current = { screen, sideA, order, assign, drawing, starting, busy, choice, playedOrder, combo, sending, suspendAsk, won,
      podium, scoring }
  })

  const open = Boolean(current && !busy)
  let context = null
  if (open) {
    const begun = Boolean(screen && screen.status === 'playing')
    if (won && podium) {
      context = 'matchPodium'
    } else if (won) {
      context = won.tournament ? 'matchWonFinal' : 'matchWon'
    } else if (suspendAsk) {
      context = 'confirm'
    } else if (combo) {
      context = 'tournamentCombo'
    } else if (pending && scoring) {
      context = 'matchScore'
    } else if (pending) {
      context = screen.rules && screen.rules.draws ? 'matchDeclareDraw' : 'matchDeclare'
    } else if (assign.step === 'test') {
      context = begun ? 'matchTestSuspend' : 'matchTest'
    } else if (assign.step === 'p2') {
      context = begun ? 'matchPick2Suspend' : 'matchPick2'
    } else if (screen && screen.sides === 'free') {
      context = begun ? 'matchPickFreeSuspend' : 'matchPickFree'
    } else {
      context = begun ? 'matchPickSuspend' : 'matchPick'
    }
  }
  useEffect(() => {
    onContext(context)
  }, [context, onContext])
  useEffect(() => () => onContext(null), [onContext])

  useEffect(() => {
    inputRef.current = (event) => {
      const value = live.current
      if (!current || value.busy) {
        return false
      }
      const press = event.kind === 'press'
      // Prova dei tasti: il tasto del joypad di un lato si accende finché resta premuto.
      const testing = value.screen && !value.screen.played && value.assign.step === 'test' && !value.starting
      if (testing && (press || event.kind === 'release') && event.button) {
        const side = padSide(value.assign, event.pad)
        if (side) {
          setHeld((now) => {
            const rest = now[side].filter((button) => button !== event.button)
            return { ...now, [side]: press ? [...rest, event.button] : rest }
          })
        }
      }
      if (event.kind === 'release') {
        return true
      }
      const step = press || event.kind === 'repeat'
      if (value.won) {
        if (press && (event.button === 'a' || event.button === 'b')) {
          afterWin()
        }
        return true
      }
      if (value.suspendAsk) {
        if (press && event.button === 'a') {
          if (value.suspendAsk.choice === 'yes') {
            suspend()
          } else {
            setSuspendAsk(null)
          }
        } else if (press && event.button === 'b') {
          setSuspendAsk(null)
        } else if (step) {
          setSuspendAsk({ choice: moveChoice(YES_NO, value.suspendAsk.choice, event.button, wraps(event)) })
        }
        return true
      }
      if (value.combo) {
        // La combinazione la compone solo l'admin; START conferma, SELECT ricomincia (vuota: chiude).
        if (!adminPress(current.saved, event.pad) || value.sending) {
          return true
        }
        if (press && event.button === 'start') {
          comboConfirm()
        } else if (press && event.button === 'select') {
          comboClear()
        } else {
          const button = comboButton(event)
          if (button) {
            setCombo({ ...value.combo, sequence: [...value.combo.sequence, button], message: '', error: false })
          }
        }
        return true
      }
      if (value.starting || value.drawing || !value.screen || value.sending) {
        return true
      }
      if (value.screen.played && value.scoring) {
        // Punteggio: ▲ ▼ cambiano il numero selezionato, ◀ ▶ passano all'altro, ✕ conferma, ○ torna alla scelta.
        const scoring = value.scoring
        if (press && event.button === 'b') {
          setScoring(null)
        } else if (adminPress(current.saved, event.pad)) {
          if (press && event.button === 'a') {
            confirmScore()
          } else if (step && (event.button === 'up' || event.button === 'down')) {
            const values = [...scoring.values]
            values[scoring.at] = stepScore(values[scoring.at], event.button === 'up' ? 1 : -1, wraps(event))
            setScoring({ ...scoring, values, error: '' })
          } else if (press && (event.button === 'left' || event.button === 'right')) {
            setScoring({ ...scoring, at: 1 - scoring.at })
          }
        }
        return true
      }
      if (value.screen.played) {
        if (press && event.button === 'b') {
          back()
        } else if (adminPress(current.saved, event.pad)) {
          if (press && event.button === 'a') {
            choose(value.choice)
          } else if (step && ['left', 'right', 'up', 'down'].includes(event.button)) {
            const draws = Boolean(value.screen.rules && value.screen.rules.draws)
            setPick(moveDeclare(value.playedOrder, value.choice, event.button, wraps(event), draws))
          }
        }
        return true
      }
      const fromPad = event.pad !== null && event.pad !== undefined
      if (press && (event.button === 'start' || event.button === 'select')) {
        pressAssign(event)
      } else if (press && event.button === 'b' && (value.assign.step !== 'test' || !fromPad)) {
        back()
      } else if (step && (event.button === 'left' || event.button === 'right') && value.screen.sides === 'free'
        && value.assign.step === 'p1') {
        setFreeSide((side) => swapSide(side))
      }
      return true
    }
    return () => {
      inputRef.current = null
    }
  }, [inputRef, current, pressAssign, afterWin, back, suspend, choose, confirmScore, comboConfirm, comboClear])

  if (!open) {
    return null
  }
  if (won && podium && won.tournament) {
    return (
      <div className={styles.layer}>
        <div className={styles.backdrop} />
        <section className={styles.podium} role="dialog" aria-label="Podio">
          <Podium tournament={won.tournament} full />
          <button type="button" className={`pix ${styles.choice} ${styles.active} ${styles.withKey} ${styles.podiumClose}`} onClick={afterWin}>
            <FaceButton position="south" />
            CHIUDI
          </button>
        </section>
      </div>
    )
  }
  const winsOf = (player) => screen.wins[screen.players[0].id === player.id ? 0 : 1]
  const rules = (screen && screen.rules) || {}
  const drawCount = (screen && screen.drawCount) || 0
  let body
  if (!screen) {
    body = <p className={styles.line}>Caricamento…</p>
  } else if (won) {
    const faces = won.draw ? won.players : [won.player]
    body = (
      <div className={styles.won}>
        <div className={styles.faces}>
          {faces.map((player) => (
            <Avatar key={player.id} id={player.id} name={player.name} className={styles.avatar}
              style={{ background: player.color || 'var(--gold)' }} />
          ))}
        </div>
        <p className={`pix ${styles.wonText}`}>
          {won.draw ? `Pareggio ${won.score[0]}-${won.score[1]}`
            : `${won.player.name} vince l’incontro ${won.score[0]}-${won.score[1]}`}
        </p>
        {won.points && <p className={styles.line}>Punteggio {won.points[0]}–{won.points[1]}</p>}
        <button type="button" className={`pix ${styles.choice} ${styles.active} ${styles.withKey}`} onClick={afterWin}>
          <FaceButton position="south" />
          {won.tournament ? 'PODIO' : 'TABELLONE'}
        </button>
      </div>
    )
  } else if (pending) {
    const creator = tournament && tournament.creator ? tournament.creator.name : null
    // XP della partita appena giocata, sotto ogni giocatore (dall'esito di questa partita dell'incontro).
    const last = state.run.lastResult
    const gained = last && last.kind === 'match' && last.match && last.match.match === matchId &&
      last.match.gameNo === pending.gameNo ? last.players || {} : {}
    const chosen = scoring ? scoring.outcome : choice
    body = (
      <>
        <p className={styles.line}>{gameLine(pending.gameNo, screen.series, rules.fixed)}</p>
        <p className={`pix ${styles.question}`}>
          {scoring ? `Punteggio della partita ${pending.gameNo}` : `Chi ha vinto la partita ${pending.gameNo}?`}
        </p>
        <div className={rules.draws ? `${styles.duel} ${styles.duelWide}` : styles.duel}>
          {playedOrder.map((player, index) => {
            const slot = SLOTS[index]
            const info = PLAYER_INFO[slot]
            const classes = [styles.side, styles.pickable, chosen === player.id && styles.picked].filter(Boolean)
            return (
              <button key={slot} type="button" className={classes.join(' ')} style={{ '--side': info.color }}
                onClick={() => {
                  if (scoring) {
                    setScoring({ ...scoring, at: index })
                    return
                  }
                  setPick(player.id)
                  choose(player.id)
                }}>
                <span className={`pix ${styles.tag}`}>{info.tag}</span>
                <Avatar id={player.id} name={player.name} className={styles.avatar}
                  style={{ background: player.color || info.color }} />
                <span className={`pix ${styles.name}`}>{player.name}</span>
                <span className={styles.meta}>{screen.series > 1 ? tallyText(winsOf(player), drawCount) : ''}</span>
                <span className={styles.xp}>{xpLine(gained[String(player.id)])}</span>
                {scoring && (
                  <span className={`pix ${styles.score} ${scoring.at === index ? styles.scoreOn : ''}`}>
                    <span className={styles.scoreArrow} aria-hidden="true">▲</span>
                    {scoring.values[index]}
                    <span className={styles.scoreArrow} aria-hidden="true">▼</span>
                  </span>
                )}
              </button>
            )
          })}
          {rules.draws ? (
            <button type="button"
              className={`pix ${styles.choice} ${styles.drawPick} ${chosen === 'draw' ? styles.active : ''}`}
              onClick={() => {
                if (scoring) {
                  return
                }
                setPick('draw')
                choose('draw')
              }}>
              PAREGGIO
            </button>
          ) : (
            <span className={`pix ${styles.versus}`}>VS</span>
          )}
        </div>
        {scoring ? (
          <p className={scoring.error ? `${styles.hint} ${styles.scoreError}` : styles.hint}>
            {scoring.error || (scoring.outcome === 'draw' ? 'Pareggio: il punteggio è uguale.'
              : 'Chi vince deve avere più punti.')}
          </p>
        ) : (
          <button type="button" className={choice === 'replay' ? `${styles.choice} ${styles.active}` : styles.choice}
            onClick={() => {
              setPick('replay')
              choose('replay')
            }}>
            Nessuno dei due: rigioca
          </button>
        )}
        <p className={styles.hint}>
          {creator ? `Dichiara ${creator}, che ha creato il torneo` : 'Dichiara chi ha creato il torneo'}
          {tournament && tournament.combo ? ', con la combinazione.' : '.'}
        </p>
        {sending && <p className={styles.hint}>Registrazione…</p>}
      </>
    )
  } else {
    const begun = screen.status === 'playing'
    const { step } = assign
    let prompt = 'Provate i tasti, poi START'
    if (step === 'p1') {
      prompt = `${order[0].name} premi START`
    } else if (step === 'p2') {
      prompt = `${order[1].name} premi START`
    }
    // Stato sotto ogni lato: chi deve premere START, joypad preso, oppure PRONTO / ANNULLA nella prova.
    const status = (slot) => {
      if (step === 'test') {
        if (assign.ready[slot]) {
          return { text: 'PRONTO', className: styles.on }
        }
        if (assign.cancel[slot]) {
          return { text: 'ANNULLA', className: styles.cancel }
        }
        return { text: 'START PER CONTINUARE', className: '' }
      }
      if (slot === step) {
        return { text: 'PREMI START', className: styles.call }
      }
      return slot === 'p1' ? { text: 'JOYPAD ASSEGNATO', className: styles.on } : { text: 'IN ATTESA', className: '' }
    }
    body = (
      <>
        <p className={styles.line}>
          {gameLine(screen.gameNo, screen.series, rules.fixed)} · {SIDE_NAMES[screen.sides] || ''}
          {begun && screen.series > 1 && order ? ` · ${winsOf(order[0])}-${winsOf(order[1])}` : ''}
        </p>
        {!drawing && <p className={`pix ${styles.question}`}>{prompt}</p>}
        <div className={drawing ? `${styles.duel} ${styles.drawing}` : styles.duel}>
          {order.map((player, index) => {
            const slot = SLOTS[index]
            const info = PLAYER_INFO[slot]
            const mark = status(slot)
            return (
              <div key={slot} className={styles.side} style={{ '--side': info.color }}>
                <span className={`pix ${styles.tag}`}>{info.tag}</span>
                <Avatar id={player.id} name={player.name} className={styles.avatar}
                  style={{ background: player.color || info.color }} />
                <span className={`pix ${styles.name}`}>{drawing ? '???' : player.name}</span>
                <span className={styles.meta}>
                  {player.seed ? `Testa di serie ${player.seed}` : ''}
                  {screen.series > 1 ? ` · ${tallyText(winsOf(player), drawCount)}` : ''}
                </span>
                {step === 'test' && <PadTester pressed={held[slot]} />}
                {!drawing && (
                  <span className={`pix ${styles.ready} ${mark.className}`}>{mark.text}</span>
                )}
              </div>
            )
          })}
          <span className={`pix ${styles.versus}`}>VS</span>
        </div>
        {drawing && <p className={`pix ${styles.draw}`}>SORTEGGIO DEI LATI…</p>}
        {!drawing && step === 'p1' && screen.sides === 'free' && <p className={styles.hint}>◀ ▶ scambiano i lati</p>}
        {!drawing && step === 'p2' && <p className={styles.hint}>SELECT torna all’assegnazione di P1</p>}
        {!drawing && step === 'test' && (
          <p className={styles.hint}>SELECT per ANNULLA: con tutti e due su ANNULLA si riassegnano i joypad</p>
        )}
        {!drawing && step !== 'test' && padCount < 2 && (
          <p className={styles.hint}>Servono due joypad collegati.</p>
        )}
        {screen.savesLocked && <p className={styles.hint}>Salvataggi bloccati: niente slot in partita.</p>}
        {starting && <p className={styles.hint}>Avvio della partita…</p>}
      </>
    )
  }
  return (
    <div className={styles.layer}>
      <div className={styles.backdrop} />
      <section className={styles.panel} role="dialog" aria-label="Incontro">
        <span className={`pix ${styles.kicker}`}>INCONTRO</span>
        {tournament && <h2 className={`pix ${styles.title}`}>{tournament.fullTitle}</h2>}
        {body}
      </section>
      {combo && (
        <ComboDialog combo={{ ...combo, kind: 'enter' }} onConfirm={comboConfirm} onClear={comboClear}
          onCancel={() => setCombo(null)} />
      )}
      {suspendAsk && (
        <ConfirmDialog
          text={pending ? 'Sospendere l’incontro? La partita giocata resta da dichiarare.' : 'Sospendere l’incontro?'}
          choice={suspendAsk.choice}
          onHover={(id) => setSuspendAsk({ choice: id })}
          onChoose={(id) => (id === 'yes' ? suspend() : setSuspendAsk(null))}
        />
      )}
    </div>
  )
}
