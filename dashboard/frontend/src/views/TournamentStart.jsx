import { useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import Avatar from '../components/Avatar.jsx'
import Bracket from '../components/Bracket.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { YES_NO, moveChoice } from '../components/confirmChoices.js'
import FaceButton from '../components/FaceButton.jsx'
import FormatDialog from '../components/FormatDialog.jsx'
import LeagueCalendar from '../components/LeagueCalendar.jsx'
import { stepIndex, wraps } from '../input/wrap.js'
import {
  FORMATS,
  bracketLayout,
  countLabel,
  defaultOptions,
  crossingSlot,
  firstMatch,
  formatLine,
  formatStartable,
  isDouble,
  isFirstRound,
  isLeague,
  jumpSection,
  matchCount,
  moveCursor,
  moveSeed,
  sectionOf,
  seedValueLabel,
  seedingLabel,
  swapCrossing,
  swapSlots,
} from '../lib/tournament.js'
import { showToast } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import * as store from '../state/tournamentStore.js'
import styles from './TournamentStart.module.css'

const STEPS = [
  { id: 1, label: 'Formato' },
  { id: 2, label: 'Teste di serie' },
  { id: 3, label: 'Anteprima' },
]
const VERTICAL = { up: -1, down: 1 }
const DIRECTIONS = { up: 'up', down: 'down', left: 'left', right: 'right' }
// Attesa prima di salvare la bozza dopo l'ultimo cambiamento (ms).
const DRAFT_DELAY_MS = 400

/** Giocatori del primo turno (della diretta o dei vincenti) nell'ordine in cui il tabellone li mostra (dall'alto). */
function firstRoundPlayers(matches) {
  return (matches || [])
    .filter(isFirstRound)
    .sort((a, b) => a.slot - b.slot)
    .flatMap((match) => [match.playerA, match.playerB])
    .filter((player) => player !== null && player !== undefined)
}

/**
 * Inizio di ogni sezione del disegno tra i giocatori da scambiare `list`:
 * gli indici in `list` del primo giocatore di ciascuna sezione (`bracket`
 * dell'incontro in cui sta). L1/R1 saltano da un inizio all'altro.
 */
function swapSectionStarts(list, matches) {
  const sectionOfPlayer = (player) => {
    const found = (matches || []).find((match) => match.playerA === player || match.playerB === player)
    return found ? found.bracket : null
  }
  return list.reduce((starts, player, at) => {
    if (at === 0 || sectionOfPlayer(player) !== sectionOfPlayer(list[at - 1])) {
      starts.push(at)
    }
    return starts
  }, [])
}

/**
 * Incontro da cui parte il cursore del disegno quando lascia il giocatore
 * `player` del primo turno: `{key, bye}` con il suo incontro, oppure, se ha
 * il bye (senza scheda), quello del turno dopo in cui aspetta (`bye` vero).
 */
function boardStart(player, matches) {
  const own = (matches || []).find((match) => isFirstRound(match) &&
    (match.playerA === player || match.playerB === player))
  if (!own || !own.bye) {
    return { key: own ? own.key : null, bye: false }
  }
  const following = (matches || []).find((match) => match.fromA === `winner:${own.key}` ||
    match.fromB === `winner:${own.key}`)
  return { key: following ? following.key : null, bye: true }
}

/**
 * Schermata «Avvia» del torneo (README «Torneo»), a tutta pagina, per
 * l'admin come P1. Tre passi:
 *
 * 1. **Formato**: iscritti e formati col numero di incontri; quello delle
 *    impostazioni è segnato e preselezionato, i formati non pronti sono
 *    grigi. △ apre le opzioni (`FormatDialog`), ✕ o START vanno avanti.
 * 2. **Teste di serie**: ordine calcolato dal backend, col valore usato;
 *    ✕ prende un giocatore, ▲ ▼ lo spostano, ✕ lo lascia; □ rimescola.
 *    START va avanti.
 * 3. **Anteprima**: il tabellone vero; ✕ segna un giocatore del primo turno,
 *    ✕ su un altro li scambia di casella (le teste di serie restano). Nella
 *    doppia ✕ segna anche uno slot «Perdente di V…» dei perdenti e ✕ su un
 *    altro della stessa colonna scambia gli incroci; □ ripristina quelli
 *    standard (gli scambi del 1° turno restano). Nel girone: a sinistra le
 *    posizioni nel calendario (✕ segna un giocatore, ✕ su un altro li
 *    scambia; le teste di serie restano e decidono i lati), a destra
 *    l'anteprima del calendario; L1/R1 passano dall'una all'altra (▲ ▼
 *    scorrono gli incontri), □ ripristina le posizioni delle teste di serie.
 *    START chiede conferma e avvia.
 *
 * ○ torna al passo prima; dal passo 1 chiude senza avviare. Le scelte si
 * salvano a ogni cambiamento come bozza nel torneo (`start/draft`): rientrando
 * si riparte dal passo e dalle scelte salvate (con gli iscritti cambiati,
 * teste di serie e scambi si rifanno). Al passo 1, con una bozza, □
 * «Ricomincia da capo» torna alle impostazioni del torneo e la cancella.
 *
 * `start` è `{check, combo}` (risposta di `start/check`, con `draft`, e combinazione già inserita),
 * `onClose()` chiude. Gli eventi (solo del P1) arrivano da
 * `inputRef.current(event)`; `onContext(nome)` indica la legenda.
 */
export default function TournamentStart({ tournament, start, adminId, inputRef, onContext, onClose }) {
  const { dispatch } = useApp()
  const { check, combo } = start
  const players = check.players
  const draft = check.draft || null
  const initial = draft ? draft.settings : check.settings
  const [step, setStep] = useState(1)
  const [settings, setSettings] = useState(() => ({ ...initial, options: { ...initial.options } }))
  const [formatCursor, setFormatCursor] = useState(() =>
    Math.max(0, FORMATS.findIndex((item) => item.id === initial.format)))
  // Bozza salvata nel torneo (per «Ricomincia da capo»).
  const [hasDraft, setHasDraft] = useState(Boolean(draft))
  // Salvataggio della bozza: attivo dopo la ripresa; `skipSave` salta il prossimo (dopo «Ricomincia»).
  const saving = useRef(!draft || draft.step === 1)
  const skipSave = useRef(!draft || draft.step === 1)
  // Scelta in attesa di essere salvata.
  const pending = useRef(null)
  const [formatOpen, setFormatOpen] = useState(false)
  const [formatContext, setFormatContext] = useState('tournamentFormat')
  const formatInput = useRef(null)
  // Anteprima del backend: teste di serie (per id), ordine, caselle, incontri.
  const [seeds, setSeeds] = useState({})
  const [order, setOrder] = useState(() => (draft ? draft.order : null))
  const [slots, setSlots] = useState(() => (draft ? draft.slots : null))
  // Doppia: incroci dei perdenti `{colonna: [chiavi]}` (`null` = standard), slot col cursore e ingresso scelto.
  const [crossings, setCrossings] = useState(() => (draft ? draft.crossings || null : null))
  const [crossSide, setCrossSide] = useState('a')
  const [crossMarked, setCrossMarked] = useState(null)
  const [matches, setMatches] = useState([])
  const [seedCursor, setSeedCursor] = useState(0)
  const [grab, setGrab] = useState(false)
  const [swapCursor, setSwapCursor] = useState(0)
  // Doppia: incontro col cursore quando si guarda il resto del disegno (`null` = sui giocatori del 1° turno).
  const [view, setView] = useState(null)
  // Girone: incontro col cursore nell'anteprima del calendario (`null` = sulle posizioni dei giocatori).
  const [calendarKey, setCalendarKey] = useState(null)
  const [marked, setMarked] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  const toast = (message, variant) => dispatch(showToast(message, variant))

  // Lasciando l'anteprima il cursore del disegno torna sui giocatori.
  useEffect(() => {
    if (step !== 3) {
      setView(null)
      setCrossMarked(null)
      setCalendarKey(null)
    }
  }, [step])
  const leagueBoard = isLeague(matches)
  const ringRef = useRef(null)
  // Girone: la posizione col cursore resta in vista nell'elenco.
  useEffect(() => {
    const found = ringRef.current && ringRef.current.querySelector('[data-ring-cursor]')
    if (found) {
      found.scrollIntoView({ block: 'nearest' })
    }
  }, [swapCursor, leagueBoard, step])
  // Nel girone si scambiano le posizioni nel calendario (le «caselle»), nell'ordine in cui le mostra l'elenco.
  const swapList = leagueBoard ? (slots || []) : firstRoundPlayers(matches)
  const swapStarts = swapSectionStarts(swapList, matches)
  const swapSectioned = swapStarts.length > 1
  const doubleBoard = isDouble(matches)

  useEffect(() => {
    let context = `tournamentStart${step}`
    if (step === 1 && hasDraft && !confirm && !formatOpen) {
      context = 'tournamentStart1Draft'
    }
    if (confirm) {
      context = 'confirm'
    } else if (formatOpen) {
      context = formatContext
    } else if (step === 2 && grab) {
      context = 'tournamentStart2Move'
    } else if (step === 3 && leagueBoard) {
      context = calendarKey ? 'tournamentStart3LeagueCalendar' : 'tournamentStart3League'
    } else if (step === 3 && doubleBoard) {
      context = view ? 'tournamentStart3Board' : 'tournamentStart3Double'
    } else if (step === 3 && swapSectioned) {
      context = 'tournamentStart3Sections'
    }
    onContext(context)
  }, [step, grab, confirm, formatOpen, formatContext, onContext, hasDraft, swapSectioned, doubleBoard, view,
    leagueBoard, calendarKey])

  // Chiede l'anteprima al backend; restituisce vero se è arrivata.
  // Gli incroci valgono solo per la doppia; `null` chiede quelli standard.
  const preview = async (nextOrder, nextSlots, nextSettings = settings, nextCrossings = crossings) => {
    setBusy(true)
    try {
      const data = await api.tournamentStartPreview(tournament.id, adminId, combo, nextSettings, nextOrder, nextSlots,
        nextSettings.format === 'double' ? nextCrossings : null)
      setSeeds(Object.fromEntries(data.seeds.map((seed) => [seed.id, seed])))
      setOrder(data.order)
      setSlots(data.slots)
      setCrossings(data.crossings || null)
      setMatches(data.matches)
      return true
    } catch (error) {
      toast(error.message, 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  // Ripresa della bozza: dal passo 2 in poi servono teste di serie e tabellone del backend.
  useEffect(() => {
    if (draft && draft.playersChanged) {
      toast('Gli iscritti sono cambiati: teste di serie rifatte.')
    }
    if (!draft || draft.step === 1) {
      return
    }
    preview(draft.order, draft.slots, draft.settings, draft.crossings || null).then((ok) => {
      if (ok) {
        setStep(draft.step)
      }
      saving.current = true
    })
    // Solo all'apertura della schermata.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Bozza salvata a ogni scelta, poco dopo l'ultimo cambiamento (i tasti tenuti non fanno una richiesta per passo).
  useEffect(() => {
    if (!saving.current) {
      return undefined
    }
    if (skipSave.current) {
      skipSave.current = false
      return undefined
    }
    const kept = settings.format === 'double' ? crossings : null
    pending.current = { step, settings, order, slots, crossings: kept }
    const timer = window.setTimeout(() => {
      pending.current = null
      api.tournamentStartDraft(tournament.id, adminId, combo, { step, settings, order, slots, crossings: kept })
        .then(() => setHasDraft(true))
        .catch(() => {})
    }, DRAFT_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [step, settings, order, slots, crossings, tournament.id, adminId, combo])

  // Alla chiusura (anche per l'uscita dei profili) si salva subito l'ultima scelta non ancora salvata.
  useEffect(() => () => {
    if (pending.current) {
      api.tournamentStartDraft(tournament.id, adminId, combo, pending.current).catch(() => {})
    }
    // Solo alla chiusura della schermata.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const restart = async () => {
    skipSave.current = true
    pending.current = null
    setSettings({ ...check.settings, options: { ...check.settings.options } })
    setFormatCursor(Math.max(0, FORMATS.findIndex((item) => item.id === check.settings.format)))
    setOrder(null)
    setSlots(null)
    setSeeds({})
    setMatches([])
    setHasDraft(false)
    try {
      await api.tournamentStartDraft(tournament.id, adminId, combo, null)
      toast('Si ricomincia da capo.')
    } catch (error) {
      toast(error.message, 'error')
    }
  }

  const chooseFormat = async () => {
    const entry = FORMATS[formatCursor]
    if (!formatStartable(entry.id)) {
      toast(`«${entry.label}» non è ancora disponibile.`)
      return
    }
    const chosen = entry.id === settings.format ? settings
      : { ...settings, format: entry.id, options: defaultOptions(entry.id) }
    setSettings(chosen)
    if (await preview(order, slots, chosen)) {
      setStep(2)
    }
  }

  const confirmFormat = (value) => {
    if (value.seeding !== settings.seeding || value.seedingWeight !== settings.seedingWeight) {
      // Teste di serie da rifare con il nuovo metodo.
      setOrder(null)
      setSlots(null)
    }
    setSettings(value)
    setFormatOpen(false)
  }

  const moveGrabbed = (dir, wrap) => {
    if (!order) {
      return
    }
    const to = stepIndex(seedCursor, dir, order.length, wrap)
    if (to === seedCursor) {
      return
    }
    setOrder(moveSeed(order, seedCursor, to))
    // Nuove teste di serie: il tabellone torna quello standard.
    setSlots(null)
    setSeedCursor(to)
  }

  const reshuffle = async () => {
    setGrab(false)
    if (await preview(null, null)) {
      setSeedCursor(0)
    }
  }

  const goPreview = async () => {
    setGrab(false)
    if (await preview(order, slots)) {
      setSwapCursor(0)
      setMarked(null)
      setStep(3)
    }
  }

  const pickPlayer = async (player) => {
    setCrossMarked(null)
    if (marked === null) {
      setMarked(player)
      return
    }
    if (marked === player) {
      setMarked(null)
      return
    }
    const nextSlots = swapSlots(slots, marked, player)
    setMarked(null)
    await preview(order, nextSlots)
  }

  /**
   * Doppia: ✕ su uno slot «Perdente di V…» (ingresso `entry` degli incroci)
   * lo segna; ✕ su un altro della stessa colonna li scambia. Un ingresso di
   * un'altra colonna non scambia e lascia la scelta.
   */
  const pickCrossing = async (entry) => {
    if (!entry) {
      return
    }
    setMarked(null)
    if (crossMarked === null) {
      setCrossMarked(entry)
      return
    }
    if (crossMarked === entry) {
      setCrossMarked(null)
      return
    }
    const next = swapCrossing(crossings, crossMarked, entry)
    if (!next) {
      return
    }
    setCrossMarked(null)
    await preview(order, slots, settings, next)
  }

  // □ nella doppia: incroci standard, le caselle del 1° turno restano.
  const restoreCrossings = async () => {
    setCrossMarked(null)
    await preview(order, slots, settings, null)
  }

  /**
   * Passo 3 del girone. Sulle posizioni: ▲ ▼ scelgono il giocatore, ✕ lo
   * segna o lo scambia, □ ripristina le posizioni delle teste di serie.
   * L1/R1 passano all'anteprima del calendario, dove ▲ ▼ scorrono gli
   * incontri, e tornano indietro. Vero se ha gestito il tasto.
   */
  const handleLeague = (event, press) => {
    const dir = VERTICAL[event.button]
    const order3 = [...matches].sort((a, b) => a.playOrder - b.playOrder).map((match) => match.key)
    if (press && (event.button === 'lb' || event.button === 'rb')) {
      setMarked(null)
      setCalendarKey(calendarKey ? null : (first ? first.key : order3[0] || null))
      return true
    }
    if (calendarKey) {
      if (dir && order3.length) {
        const at = Math.max(0, order3.indexOf(calendarKey))
        setCalendarKey(order3[stepIndex(at, dir, order3.length, wraps(event))])
      } else if (press && event.button === 'b') {
        setCalendarKey(null)
      } else if (press && event.button === 'start') {
        setConfirm({ kind: 'start', choice: 'no' })
      }
      return true
    }
    if (press && event.button === 'x') {
      setMarked(null)
      preview(order, null)
      return true
    }
    return false
  }

  // Slot di `match` che si possono scambiare negli incroci (`a`, `b`).
  const crossRows = (match) => ['a', 'b'].filter((side) => crossingSlot(match, side, matches))

  const startNow = async () => {
    setBusy(true)
    try {
      pending.current = null
      const data = await api.tournamentStart(tournament.id, adminId, combo, settings, order, slots,
        settings.format === 'double' ? crossings : null)
      store.replace(data.tournament)
      toast(`«${tournament.fullTitle}» è iniziato!`)
      onClose()
    } catch (error) {
      toast(error.message, 'error')
      store.refresh()
    } finally {
      setBusy(false)
    }
  }

  const confirmed = (kind) => {
    if (kind === 'restart') {
      restart()
    } else {
      startNow()
    }
  }

  // Passa ai giocatori del 1° turno dei vincenti, sul primo dell'incontro `key`.
  const toPlayers = (key) => {
    const match = matches.find((item) => item.key === key)
    const at = match ? swapList.indexOf(match.playerA) : -1
    if (at >= 0) {
      setSwapCursor(at)
    }
    setView(null)
  }

  /**
   * Passo 3 della doppia: oltre ai giocatori del 1° turno dei vincenti il
   * cursore gira per tutto il disegno. ◀ ▶ (e ▲ ▼ fuori dal 1° turno) si
   * muovono tra gli incontri come nel tabellone del torneo; L1/R1 saltano tra
   * vincenti, perdenti e gran finale. Tornando su un incontro del 1° turno il
   * cursore riprende i giocatori da scambiare. Negli incontri dei perdenti il
   * cursore sta su uno slot «Perdente di V…» (▲ ▼ passano prima tra i due
   * slot della stessa scheda) e ✕ lo sceglie per lo scambio degli incroci.
   * Vero se ha gestito il tasto.
   */
  const moveDoubleView = (event, press) => {
    const layout = bracketLayout(matches)
    const player = swapList.length ? swapList[Math.min(swapCursor, swapList.length - 1)] : null
    const start = view ? { key: view, bye: false } : boardStart(player, matches)
    const from = start.key
    const land = (key, direction) => {
      const match = matches.find((item) => item.key === key)
      if (match && isFirstRound(match)) {
        toPlayers(key)
      } else {
        const rows = match ? crossRows(match) : []
        setCrossSide(rows.length ? rows[direction === 'up' ? rows.length - 1 : 0] : 'a')
        setView(key)
      }
    }
    const shoulder = press && (event.button === 'lb' || event.button === 'rb')
    if (shoulder) {
      const target = jumpSection(layout, from, event.button === 'rb' ? 1 : -1)
      if (sectionOf(layout, target) === 'winners' && !view) {
        return true
      }
      land(target)
      return true
    }
    const here = view ? matches.find((item) => item.key === view) : null
    if (here && press && event.button === 'a') {
      // Fuori dal 1° turno dei vincenti si scambiano solo gli slot «Perdente di V…».
      pickCrossing(crossingSlot(here, crossSide, matches))
      return true
    }
    const direction = DIRECTIONS[event.button]
    if (!direction || (!view && VERTICAL[event.button])) {
      // Sui giocatori del 1° turno ▲ ▼ restano quelli di sempre.
      return false
    }
    if (here && VERTICAL[event.button]) {
      // Prima tra i due slot da scambiare della stessa scheda.
      const rows = crossRows(here)
      const to = rows.indexOf(crossSide) + VERTICAL[event.button]
      if (rows.length > 1 && rows.includes(crossSide) && to >= 0 && to < rows.length) {
        setCrossSide(rows[to])
        return true
      }
    }
    // Dal giocatore col bye, ▶ va all'incontro in cui aspetta.
    land(start.bye && direction === 'right' ? from : moveCursor(layout, from, direction, wraps(event)), direction)
    return true
  }

  const handle = (event) => {
    if (event.kind === 'release') {
      return
    }
    const press = event.kind === 'press'
    if (confirm) {
      if (press && event.button === 'a') {
        setConfirm(null)
        if (confirm.choice === 'yes') {
          confirmed(confirm.kind)
        }
      } else if (press && event.button === 'b') {
        setConfirm(null)
      } else {
        setConfirm({ ...confirm, choice: moveChoice(YES_NO, confirm.choice, event.button, wraps(event)) })
      }
      return
    }
    if (formatOpen) {
      if (formatInput.current) {
        formatInput.current(event)
      }
      return
    }
    if (busy) {
      return
    }
    const dir = VERTICAL[event.button]
    if (step === 1) {
      if (dir) {
        setFormatCursor(stepIndex(formatCursor, dir, FORMATS.length, wraps(event)))
      } else if (press && (event.button === 'a' || event.button === 'start')) {
        chooseFormat()
      } else if (press && event.button === 'y') {
        setFormatOpen(true)
      } else if (press && event.button === 'x' && hasDraft) {
        setConfirm({ kind: 'restart', choice: 'no' })
      } else if (press && event.button === 'b') {
        onClose()
      }
      return
    }
    if (step === 2) {
      const count = order ? order.length : 0
      if (dir && count) {
        if (grab) {
          moveGrabbed(dir, wraps(event))
        } else {
          setSeedCursor(stepIndex(seedCursor, dir, count, wraps(event)))
        }
      } else if (press && event.button === 'a') {
        setGrab(!grab)
      } else if (press && event.button === 'x') {
        reshuffle()
      } else if (press && event.button === 'start') {
        goPreview()
      } else if (press && event.button === 'b') {
        if (grab) {
          setGrab(false)
        } else {
          setStep(1)
        }
      }
      return
    }
    if (doubleBoard && moveDoubleView(event, press)) {
      return
    }
    if (leagueBoard && handleLeague(event, press)) {
      return
    }
    if (dir && swapList.length) {
      setSwapCursor(stepIndex(Math.min(swapCursor, swapList.length - 1), dir, swapList.length, wraps(event)))
    } else if (press && (event.button === 'lb' || event.button === 'rb') && swapSectioned) {
      // Alla prima casella della sezione successiva o precedente, in modo circolare.
      const current = Math.min(swapCursor, swapList.length - 1)
      const own = swapStarts.reduce((found, start, at) => (start <= current ? at : found), 0)
      setSwapCursor(swapStarts[stepIndex(own, event.button === 'rb' ? 1 : -1, swapStarts.length, true)])
    } else if (press && event.button === 'a' && swapList.length) {
      pickPlayer(swapList[Math.min(swapCursor, swapList.length - 1)])
    } else if (press && event.button === 'x' && doubleBoard) {
      restoreCrossings()
    } else if (press && event.button === 'start') {
      setConfirm({ kind: 'start', choice: 'no' })
    } else if (press && event.button === 'b') {
      if (crossMarked !== null) {
        setCrossMarked(null)
      } else if (marked !== null) {
        setMarked(null)
      } else {
        setStep(2)
      }
    }
  }

  // Ad ogni render la funzione dei tasti vede i valori aggiornati.
  useEffect(() => {
    inputRef.current = handle
    return () => {
      inputRef.current = null
    }
  })

  const n = players.length
  const countOf = (entry) => {
    if (formatStartable(entry.id) && entry.id === settings.format) {
      return matchCount(entry.id, n, settings.thirdPlace, settings.options)
    }
    const found = check.counts.find((item) => item.format === entry.id)
    return found ? found.matches : null
  }
  const seedList = order ? order.map((id) => seeds[id]).filter(Boolean) : []
  const bracketPlayers = seedList.map((seed) => ({ id: seed.id, name: seed.name, color: seed.color, seed: seed.seed }))
  const first = firstMatch(matches)
  const nameOf = (id) => (seeds[id] ? seeds[id].name : '?')
  const cursorPlayer = swapList.length && !view ? swapList[Math.min(swapCursor, swapList.length - 1)] : null

  return (
    <div className={styles.overlay}>
      <section className={styles.screen} role="dialog" aria-label="Avvia il torneo">
        <header className={styles.head}>
          <div className={styles.titles}>
            <span className={`pix ${styles.kicker}`}>AVVIA IL TORNEO</span>
            <h2 className={`pix ${styles.title}`}>{tournament.fullTitle}</h2>
          </div>
          <ol className={styles.steps}>
            {STEPS.map((entry) => {
              const classes = [styles.step]
              if (entry.id === step) {
                classes.push(styles.stepActive)
              } else if (entry.id < step) {
                classes.push(styles.stepDone)
              }
              return (
                <li key={entry.id} className={classes.join(' ')}>
                  <span className={`pix ${styles.stepNo}`}>{entry.id}</span>
                  {entry.label}
                </li>
              )
            })}
          </ol>
        </header>

        {step === 1 && (
          <div className={styles.body}>
            <p className={styles.lead}>
              <span className={`pix ${styles.big}`}>{n}</span> iscritti. Scegli il formato: il numero di incontri è
              calcolato su di loro.
            </p>
            <ul className={styles.formats}>
              {FORMATS.map((entry, index) => {
                const classes = [styles.format]
                const startable = formatStartable(entry.id)
                if (!startable) {
                  classes.push(styles.soon)
                }
                if (index === formatCursor) {
                  classes.push(styles.active)
                }
                const count = startable ? countOf(entry) : null
                return (
                  <li key={entry.id}>
                    <button type="button" className={classes.join(' ')} onClick={() => setFormatCursor(index)}>
                      <span className={styles.formatName}>{entry.label}</span>
                      {entry.id === tournament.format && <span className={styles.fromSettings}>dalle impostazioni</span>}
                      <span className={`pix ${styles.formatCount}`}>{countLabel(count, entry.id)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className={styles.summary}>
              {formatLine(settings)}
              <span className={styles.summaryKey}>
                <FaceButton position="north" />
                opzioni
              </span>
            </p>
            {hasDraft && (
              <p className={styles.draftNote}>
                Scelte salvate: riprendi da dove eri rimasto.
                <span className={styles.summaryKey}>
                  <FaceButton position="west" />
                  ricomincia da capo
                </span>
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className={styles.body}>
            <p className={styles.lead}>
              Teste di serie {seedingLabel(settings)}: la 1 è la migliore. Sposta un giocatore per cambiare l’ordine.
            </p>
            <ol className={styles.seeds}>
              {seedList.map((seed, index) => {
                const classes = [styles.seedRow]
                if (index === seedCursor) {
                  classes.push(grab ? styles.grabbed : styles.active)
                }
                return (
                  <li key={seed.id} className={classes.join(' ')} style={{ '--player': seed.color || 'var(--text-4)' }}>
                    <span className={`pix ${styles.position}`}>{index + 1}</span>
                    <Avatar id={seed.id} name={seed.name} className={styles.avatar} style={{ background: seed.color }} />
                    <span className={styles.seedName}>{seed.name}</span>
                    <span className={styles.seedValue}>{seedValueLabel(settings.seeding, seed)}</span>
                    {index === seedCursor && grab && <span className={styles.grabMark}>▲▼</span>}
                  </li>
                )
              })}
            </ol>
          </div>
        )}

        {step === 3 && leagueBoard && (
          <div className={`${styles.body} ${styles.previewBody}`}>
            <p className={styles.lead}>
              {first ? (
                <>
                  Primo incontro: <strong>{nameOf(first.playerA)}</strong> contro <strong>{nameOf(first.playerB)}</strong>
                </>
              ) : (
                'Nessun incontro da giocare.'
              )}
              {marked !== null && <span className={styles.markNote}>Scegli con chi scambiare {nameOf(marked)}.</span>}
            </p>
            <div className={styles.league}>
              <section className={styles.leaguePanel}>
                <h3 className={`pix ${styles.panelTitle}`}>ORDINE NEL CALENDARIO</h3>
                <p className={styles.panelNote}>Le teste di serie restano e decidono i lati.</p>
                <ol className={styles.ringList} ref={ringRef}>
                  {swapList.map((id, index) => {
                    const seed = seeds[id]
                    const classes = [styles.seedRow]
                    if (id === marked) {
                      classes.push(styles.grabbed)
                    } else if (!calendarKey && index === Math.min(swapCursor, swapList.length - 1)) {
                      classes.push(styles.active)
                    }
                    const here = !calendarKey && index === Math.min(swapCursor, swapList.length - 1)
                    return (
                      <li
                        key={id}
                        className={classes.join(' ')}
                        data-ring-cursor={here ? '' : undefined}
                        style={{ '--player': (seed && seed.color) || 'var(--text-4)' }}
                        onClick={() => {
                          setSwapCursor(index)
                          setCalendarKey(null)
                          pickPlayer(id)
                        }}
                      >
                        <span className={`pix ${styles.position}`}>{index + 1}</span>
                        <Avatar id={id} name={seed ? seed.name : '?'} className={styles.avatar}
                          style={{ background: seed ? seed.color : undefined }} />
                        <span className={styles.seedName}>{seed ? seed.name : '?'}</span>
                        {seed && <span className={styles.seedValue}>testa di serie {seed.seed}</span>}
                        {id === marked && <span className={styles.grabMark}>da scambiare</span>}
                      </li>
                    )
                  })}
                </ol>
              </section>
              <section className={styles.leaguePanel}>
                <h3 className={`pix ${styles.panelTitle}`}>CALENDARIO · ANTEPRIMA</h3>
                <LeagueCalendar
                  matches={matches}
                  players={bracketPlayers}
                  next={first ? first.key : null}
                  focus={calendarKey}
                  onFocus={(key) => setCalendarKey(key)}
                />
              </section>
            </div>
          </div>
        )}
        {step === 3 && !leagueBoard && (
          <div className={`${styles.body} ${styles.previewBody}`}>
            <p className={styles.lead}>
              {first ? (
                <>
                  Primo incontro: <strong>{nameOf(first.playerA)}</strong> contro <strong>{nameOf(first.playerB)}</strong>
                </>
              ) : (
                'Nessun incontro da giocare.'
              )}
              {marked !== null && <span className={styles.markNote}>Scegli con chi scambiare {nameOf(marked)}.</span>}
              {crossMarked !== null && (
                <span className={styles.markNote}>Scegli lo slot dei perdenti della stessa colonna con cui scambiarlo.</span>
              )}
            </p>
            <Bracket
              matches={matches}
              players={bracketPlayers}
              cursor={cursorPlayer}
              marked={marked}
              next={first ? first.key : null}
              focus={view}
              crossCursor={doubleBoard ? (view ? { key: view, side: crossSide } : null) : undefined}
              crossMarked={crossMarked}
              onCross={doubleBoard ? (key, side) => {
                const match = matches.find((item) => item.key === key)
                setView(key)
                setCrossSide(side)
                pickCrossing(crossingSlot(match, side, matches))
              } : undefined}
              onFocus={doubleBoard ? (key) => {
                const match = matches.find((item) => item.key === key)
                if (match && !isFirstRound(match)) {
                  setView(key)
                }
              } : undefined}
              onPick={(player) => {
                const at = swapList.indexOf(player)
                if (at >= 0) {
                  setSwapCursor(at)
                }
                setView(null)
                pickPlayer(player)
              }}
            />
          </div>
        )}
        {busy && <span className={`pix ${styles.busy}`}>…</span>}
      </section>

      {formatOpen && (
        <FormatDialog
          value={settings}
          sides={tournament.sides}
          inputRef={formatInput}
          onConfirm={confirmFormat}
          onCancel={() => setFormatOpen(false)}
          onContext={setFormatContext}
          startableOnly
        />
      )}
      {confirm && (
        <ConfirmDialog
          text={confirm.kind === 'restart'
            ? 'Ricominciare da capo? Le scelte salvate si perdono.'
            : 'Avviare il torneo? Le iscrizioni si chiudono.'}
          choice={confirm.choice}
          onHover={(choice) => setConfirm({ ...confirm, choice })}
          onChoose={(choice) => {
            setConfirm(null)
            if (choice === 'yes') {
              confirmed(confirm.kind)
            }
          }}
        />
      )}
    </div>
  )
}
