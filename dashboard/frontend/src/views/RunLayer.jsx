import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import BiosModal from '../components/BiosModal.jsx'
import ChallengePicker from '../components/ChallengePicker.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { moveChoice } from '../components/confirmChoices.js'
import PickerMenu from '../components/PickerMenu.jsx'
import RescueModal from '../components/RescueModal.jsx'
import SavesModal from '../components/SavesModal.jsx'
import { initialRescueCombo, rescueHoldMs, rescueStep } from '../input/rescueCombo.js'
import { COMBO_POLL_MS, comboSlot, comboStep, initialSaveCombo } from '../input/saveCombo.js'
import { stepIndex, wraps } from '../input/wrap.js'
import { MISSING_CHOICES, differentText, missingText } from '../lib/bios.js'
import { outcomeText, pickerItems } from '../lib/challenges.js'
import { pulse } from '../lib/haptics.js'
import { INSERT_MS } from '../lib/insert.js'
import { BLOCKED_CHOICES, BLOCKED_TEXT, PREVIOUS, SUSPECT, notBlockedChoice } from '../lib/rescue.js'
import { sessionCards, trophyGroups } from '../lib/sessionResult.js'
import { QUESTION_PHASES, downloadQuestion, noStateToast, overlayOpen, resultToast, tournamentToast } from '../lib/run.js'
import { confirmText, focusScope, launchResume, saveTabs } from '../lib/saves.js'
import { gameUpdated, runUpdated, setFocus, showToast } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import { SLOTS, launchPadModels, launchPads, launchPlayers, versusLabel, withPads } from '../state/players.js'
import { profileOf, vibrates } from '../state/profiles.js'
import { useRunPolling } from '../state/useRunPolling.js'
import LaunchOverlay from './LaunchOverlay.jsx'
import SessionResult from './SessionResult.jsx'
import VerdictDialog from './VerdictDialog.jsx'

// Dopo il primo B, il secondo interrompe entro questo tempo.
const STOP_ARM_MS = 3000
const AUTO = '__auto'
const HORIZONTAL = new Set(['left', 'right', 'up', 'down'])
const VERTICAL = { up: -1, down: 1 }
// Fasi con RetroArch aperto (avvio, prova del core, partita).
const RETROARCH_PHASES = new Set(['probing', 'running'])

function coreItems(cores, game) {
  return [
    { id: AUTO, label: 'Ricerca automatica al prossimo avvio' },
    ...cores.map((core) => {
      let note = core.installed ? 'installato' : 'da scaricare'
      if (core.name === game.core) {
        note = game.coreStatus === 'trial' ? 'in prova' : 'in uso'
      }
      return { id: core.name, label: core.name, note }
    }),
  ]
}

/**
 * Livello di gioco (sprint 05): schermata di avvio e di gioco, domanda sul
 * download oltre i 50 MB, «Il gioco ha funzionato?», menu «Core ▸»,
 * «Riprova la ricerca», modale dei salvataggi all'avvio (saltata con
 * «Gioca da qui» nel Profilo), combinazione dei
 * salvataggi in partita (Sprint 04: apre la modale sopra il gioco),
 * modale «Fine partita» con XP, livelli e trofei, conferma di chiusura (Ctrl+Q)
 * e, prima di giocare, l'avviso se al core del gioco manca un BIOS
 * obbligatorio («Scegli il BIOS…» apre la pagina «BIOS» della console;
 * «Avvia comunque» non lo chiede più per quel gioco fino alla chiusura della dashboard).
 * Al ritorno a «PRESS START» (`splashSeq` che cambia) chiude le sue finestre, tranne il soccorso.
 *
 * Riceve gli eventi prima del resto dell'app tramite `inputRef.current(event)`,
 * che restituisce vero se li ha usati. `onContext(nome | null)` indica ad App
 * la legenda della barra comandi; `onExit()` chiude la dashboard; `gamepad`
 * serve a bloccare l'input finché i tasti usati in RetroArch non sono rilasciati.
 */
/** Account RetroAchievements del P1, che riceve i trofei della partita; `null` se non c'è. */
function trophiesUser(state) {
  const profile = state.players.p1.user ? profileOf(state, 'p1') : null
  return (profile && !profile.guest && profile.raUser) || null
}

// Modelli dei joypad dei giocatori al momento dell'avvio (src/state/players.js).
function padModels(players) {
  return launchPadModels(players, navigator.getGamepads ? navigator.getGamepads() : [])
}

export default function RunLayer({ inputRef, gamepad, onContext, onExit, splashSeq = 0 }) {
  const { state, dispatch, loadGames, loadProfiles } = useApp()
  const { run } = state
  const [dialog, setDialog] = useState(null)
  const [menu, setMenu] = useState(null)
  const [saves, setSaves] = useState(null)
  // Modale «Fine partita»: `{result, cards, groups, skipped, done}`.
  const [summary, setSummary] = useState(null)
  // Scelta dei trofei della Sfida trofeo dopo la modale: `{candidates, chosen, index, game, earner, busy}`.
  const [picker, setPicker] = useState(null)
  const savesInput = useRef(null)
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [downloadChoice, setDownloadChoice] = useState('yes')
  // Avviso del BIOS mancante: `{text, choice, system, core, key, proceed}`; pagina «BIOS» aperta da lì.
  const [biosAsk, setBiosAsk] = useState(null)
  const [biosPage, setBiosPage] = useState(null)
  const [biosContext, setBiosContext] = useState('bios')
  const biosInput = useRef(null)
  // Giochi avviati con «Avvia comunque» (`console/gioco/core`).
  const biosSkipped = useRef(new Set())
  // BIOS con una versione diversa per gioco (`sistema/id`), detti a fine partita: un blocco a schermo nero può venire da lì.
  const biosDifferent = useRef(new Map())
  // Soccorso dopo un blocco: scelta della domanda «Il gioco era bloccato?» e modale «Da dove riprendere».
  const [blockedChoice, setBlockedChoice] = useState('yes')
  const [rescueOpen, setRescueOpen] = useState(false)
  const rescueInput = useRef(null)
  const seen = useRef(undefined)
  const phase = useRef(run.phase)
  const handled = useRef(null)
  // Schermata di avvio aperta prima della richiesta (`{system, game}`): la
  // richiesta parte dopo `INSERT_MS`. Il numero cambia a ogni avvio e
  // all'interruzione, così un'attesa vecchia non avvia più niente.
  const [intro, setIntro] = useState(null)
  const introSeq = useRef(0)

  // Ritorno a «PRESS START» (`splashSeq` cambiato): si chiudono le finestre fuori dalle partite.
  // Il soccorso dopo un blocco resta: aspetta una risposta del backend.
  const lastSplash = useRef(splashSeq)
  useEffect(() => {
    if (lastSplash.current === splashSeq) {
      return
    }
    lastSplash.current = splashSeq
    setDialog(null)
    setMenu(null)
    setSaves(null)
    setSummary(null)
    setPicker(null)
    setBiosAsk(null)
    setBiosPage(null)
  }, [splashSeq])

  const updateRun = useCallback((next) => dispatch(runUpdated(next)), [dispatch])
  useRunPolling(Boolean(run.running), updateRun)

  const toastError = useCallback((error) => dispatch(showToast(error.message, 'error')), [dispatch])

  // Giocatori al momento dell'avvio: profili e joypad di P1 e P2 (sprint 07).
  // Chi ha attivato la vibrazione sente un breve impulso sul proprio joypad (sprint 08).
  const { players } = state
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })
  // Apre subito la schermata di avvio e dopo `INSERT_MS` chiama `send()`:
  // la schermata dura almeno l'animazione di inserimento. Restituisce la
  // risposta, oppure `null` se nel frattempo l'avvio è stato interrotto.
  const afterIntro = useCallback(async (system, game, send) => {
    introSeq.current += 1
    const seq = introSeq.current
    setIntro({ system, game })
    await new Promise((resolve) => window.setTimeout(resolve, INSERT_MS))
    if (introSeq.current !== seq) {
      return null
    }
    const data = await send()
    for (const slot of SLOTS) {
      if (vibrates(stateRef.current, slot)) {
        pulse(players[slot].pad)
      }
    }
    return data
  }, [players])

  // Chiude la schermata di avvio d'attesa insieme all'arrivo della partita
  // (stesso aggiornamento, così la schermata resta aperta senza ripartire).
  const begin = useCallback((data) => {
    setIntro(null)
    if (data) {
      updateRun(data)
    }
  }, [updateRun])

  // `resume` è `{account, slot}`, `{shared}` (salvataggio condiviso) oppure `null` (src/lib/saves.js, `launchResume`).
  const start = useCallback((system, game, resume = null) => afterIntro(system, game,
    () => api.launch(system, game.id, launchPlayers(players), launchPads(players),
      resume && resume.shared ? null : resume, padModels(players), resume && resume.shared ? resume.shared : null)),
    [afterIntro, players])

  // Sfida trofeo: parte dallo stato della sfida, con il suo core (backend).
  const startChallenge = useCallback(async (id, system, game) => {
    try {
      const data = await afterIntro(system, game, () => api.challengeStart(id, launchPlayers(players), launchPads(players), padModels(players)))
      if (data) {
        begin(data)
      }
    } catch (error) {
      setIntro(null)
      toastError(error)
    }
  }, [players, afterIntro, begin, toastError])

  // Torneo: registrazione dello stato di partenza col creatore come P1, dall'inizio o da un suo slot (backend).
  const startTournament = useCallback(async (tournament, system, game) => {
    try {
      const data = await afterIntro(system, game, () => api.tournamentRecord(tournament.id, tournament.account,
        tournament.combo, tournament.source, launchPlayers(players), launchPads(players), padModels(players)))
      if (data) {
        begin(data)
      }
    } catch (error) {
      setIntro(null)
      toastError(error)
    }
  }, [players, afterIntro, begin, toastError])

  // Incontro di torneo: P1 e P2 sono già i due profili secondo i lati (src/views/MatchLayer.jsx), coi joypad
  // assegnati nella schermata «Incontro» (`match.pads`) al posto di quelli degli slot.
  const startMatch = useCallback(async (match, system, game) => {
    const seated = withPads(players, match.pads)
    try {
      const data = await afterIntro(system, game, () => api.tournamentMatchPlay(match.id, match.match, match.account,
        match.sideA, launchPads(seated), padModels(seated)))
      if (data) {
        begin(data)
      }
    } catch (error) {
      setIntro(null)
      toastError(error)
    }
  }, [players, afterIntro, begin, toastError])

  const openPicker = useCallback((finished) => {
    const candidates = finished.challengeCandidates || []
    if (!candidates.length) {
      return
    }
    setPicker({
      candidates,
      chosen: new Set(),
      index: 0,
      game: finished.game || null,
      earner: finished.achievements ? finished.achievements.earner : null,
      busy: false,
    })
  }, [])

  // Fine di RetroArch: input bloccato finché i tasti dell'uscita non sono rilasciati.
  // Anche dalla prova del core: con un'uscita rapida la fase `running` può non arrivare mai.
  useEffect(() => {
    if (RETROARCH_PHASES.has(phase.current) && (run.phase === 'idle' || QUESTION_PHASES.has(run.phase))) {
      gamepad.lockUntilReleased()
    }
    if (run.phase === 'rescue' && phase.current !== 'rescue') {
      setBlockedChoice('yes')
      setRescueOpen(false)
    }
    if (run.phase === 'download_confirm' && phase.current !== 'download_confirm') {
      setDownloadChoice('yes')
    }
    phase.current = run.phase
  }, [run.phase, gamepad])

  // Combinazioni in partita: quella dei salvataggi (src/input/saveCombo.js)
  // e quella di emergenza, tenuta per uscire senza salvare il «Riprendi»
  // (src/input/rescueCombo.js). Con RetroArch davanti la pagina non ha il
  // focus e `requestAnimationFrame` si ferma: i joypad si leggono con un
  // timer. Il backend ignora la richiesta dei salvataggi se il menu è già aperto.
  const ingame = run.phase === 'running'
  const { saveCombo, rescueCombo, padButtons } = state
  // Uscita della partita (del gioco, della console o delle Impostazioni): con lo stesso tasto l'emergenza scatta in 1 secondo.
  const holdMs = rescueHoldMs(run.quitCombo || state.quitCombo, rescueCombo)
  useEffect(() => {
    if (!ingame || typeof navigator === 'undefined' || !navigator.getGamepads) {
      return undefined
    }
    let combo = initialSaveCombo()
    let emergency = initialRescueCombo()
    const timer = window.setInterval(() => {
      const gamepads = Array.from(navigator.getGamepads() || [])
      const result = comboStep(combo, gamepads, padButtons, saveCombo)
      combo = result.state
      for (const pad of result.fired) {
        const slot = comboSlot(stateRef.current.players, pad)
        if (slot) {
          api.ingameOpen(slot).catch(toastError)
        }
      }
      const rescue = rescueStep(emergency, gamepads, padButtons, rescueCombo, Date.now(), holdMs)
      emergency = rescue.state
      if (rescue.fired) {
        api.runRescue().then(updateRun).catch(toastError)
      }
    }, COMBO_POLL_MS)
    return () => window.clearInterval(timer)
  }, [ingame, saveCombo, rescueCombo, holdMs, padButtons, toastError, updateRun])

  // Esito nuovo: modale «Fine partita» se qualcuno ha guadagnato XP, altrimenti
  // notifica; libreria riletta (core associato cambiato) e profili riletti
  // (tempo, XP, partite recenti).
  const result = run.lastResult || null
  const seq = result ? result.seq : 0
  useEffect(() => {
    if (seen.current === undefined) {
      seen.current = seq
      return
    }
    if (seq === seen.current || !result) {
      return
    }
    seen.current = seq
    if (result.game && result.game.system) {
      loadGames(result.game.system)
    }
    const cards = sessionCards(result, stateRef.current.accounts)
    if (result.players && Object.keys(result.players).length) {
      loadProfiles()
    }
    // Partita di un incontro di torneo: niente XP né riepilogo, torna la schermata «Incontro».
    if (result.kind === 'match' && !result.error && !QUESTION_PHASES.has(run.phase)) {
      return
    }
    if (!QUESTION_PHASES.has(run.phase)) {
      const toast = resultToast(result)
      // Con la modale la sola «Partita terminata» non serve: la modale la dice già.
      if (toast && !(cards.length && toast.variant === 'info' && !result.confirmed)) {
        dispatch(showToast(toast.message, toast.variant))
      }
      if (cards.length) {
        setSummary({ result, cards, groups: trophyGroups(result, cards), skipped: false, done: false })
      } else {
        // Senza la modale l'esito della sfida va in una notifica e la scelta dei trofei si apre subito.
        const outcome = outcomeText(result.challenge)
        if (outcome) {
          dispatch(showToast(`${outcome.title} ${outcome.text}`))
        }
        openPicker(result)
      }
      const noState = noStateToast(result)
      if (noState) {
        dispatch(showToast(noState, 'info', true))
      }
      const recorded = tournamentToast(result)
      if (recorded) {
        dispatch(showToast(recorded, result.tournament.recorded ? 'info' : 'error', true))
      }
      const different = result.game ? differentText(biosDifferent.current.get(`${result.game.system}/${result.game.id}`)) : null
      if (different) {
        dispatch(showToast(different, 'error', true))
      }
    }
  }, [seq, result, run.phase, dispatch, loadGames, loadProfiles, openPicker])

  useEffect(() => {
    if (!armed) {
      return undefined
    }
    const timer = window.setTimeout(() => setArmed(false), STOP_ARM_MS)
    return () => window.clearTimeout(timer)
  }, [armed])

  const startGame = useCallback(async (system, game, resume = null) => {
    try {
      const data = await start(system, game, resume)
      if (data) {
        begin(data)
      }
    } catch (error) {
      setIntro(null)
      if (error.data && error.data.incompatible) {
        loadGames(system)
        const tried = (error.data.tried || []).join(', ')
        setDialog({
          text: `Nessun core compatibile${tried ? `: provati ${tried}` : ''}. Riprova la ricerca?`,
          choice: 'yes',
          onYes: async () => {
            try {
              const data = await api.resetGameCore(system, game.id)
              dispatch(gameUpdated(system, data.game))
              const next = await start(system, game, resume)
              if (next) {
                begin(next)
              }
            } catch (retryError) {
              setIntro(null)
              toastError(retryError)
            }
          },
        })
      } else {
        toastError(error)
      }
    }
  }, [dispatch, loadGames, start, begin, toastError])

  // Prima di giocare: se al core del gioco manca un BIOS obbligatorio, lo chiede; altrimenti `proceed()`.
  // Se il controllo non riesce si gioca lo stesso.
  const checkBios = useCallback(async (system, game, proceed) => {
    let check = null
    try {
      check = await api.biosCheck(system, game.id)
    } catch {
      check = null
    }
    const key = check ? `${system}/${game.id}/${check.core}` : ''
    biosDifferent.current.set(`${system}/${game.id}`, check ? check.different || [] : [])
    if (!check || !check.missing.length || biosSkipped.current.has(key)) {
      proceed()
      return
    }
    setBiosAsk({ text: missingText(check.core, check.missing), choice: 'play', system, game, core: check.core, key, proceed })
  }, [])

  const answerBios = (choice) => {
    const current = biosAsk
    setBiosAsk(null)
    if (!current) {
      return
    }
    if (choice === 'choose') {
      setBiosPage(current)
    } else if (choice === 'play') {
      biosSkipped.current.add(current.key)
      current.proceed()
    }
  }

  // Chiusa la pagina «BIOS» si controlla di nuovo: se il BIOS c'è il gioco parte.
  const closeBios = () => {
    const current = biosPage
    setBiosPage(null)
    if (current) {
      checkBios(current.system, current.game, current.proceed)
    }
  }

  // A su un gioco: se i giocatori collegati hanno salvataggi del gioco, o il
  // gioco ha dei salvataggi condivisi, si apre la modale dei salvataggi,
  // altrimenti si avvia subito. Se la lettura non riesce si avvia come prima,
  // con una notifica.
  const launch = useCallback(async (system, game) => {
    const accounts = launchPlayers(players).filter((id) => id !== null)
    let tabs = []
    let shared = []
    try {
      const data = await api.gameSaves(system, game.id, accounts)
      shared = data.shared || []
      tabs = saveTabs(players, data.accounts, shared)
    } catch (error) {
      dispatch(showToast(`Salvataggi non letti, il gioco parte dall'inizio: ${error.message}`, 'error'))
    }
    if (!tabs.length) {
      startGame(system, game)
      return
    }
    // Ogni apertura parte dalla prima voce di ogni scheda («Riprendi» se c'è).
    for (const tab of tabs) {
      dispatch(setFocus(focusScope(tab), null))
    }
    setSaves({ system, game, tabs, tab: 0, shared })
  }, [players, dispatch, startGame])

  const pickSave = (item) => {
    const current = saves
    const resume = launchResume(current.tabs[current.tab], item)
    setDialog({
      text: confirmText(item),
      choice: 'yes',
      onYes: () => {
        setSaves(null)
        startGame(current.system, current.game, resume)
      },
    })
  }

  const openCoreMenu = useCallback(async (system, game) => {
    try {
      const data = await api.gameCores(system, game.id)
      const items = coreItems(data.cores, game)
      const index = Math.max(0, items.findIndex((item) => item.id === game.core))
      setMenu({ title: `CORE · ${game.title}`, items, index, system, game })
    } catch (error) {
      toastError(error)
    }
  }, [toastError])

  const pickCore = async (entry) => {
    const { system, game } = menu
    setMenu(null)
    try {
      const data = entry.id === AUTO
        ? await api.resetGameCore(system, game.id)
        : await api.setGameCore(system, game.id, entry.id)
      dispatch(gameUpdated(system, data.game))
      dispatch(showToast(entry.id === AUTO ? 'Ricerca automatica al prossimo avvio' : `Core memorizzato: ${entry.id}`))
    } catch (error) {
      toastError(error)
    }
  }

  // Richieste dalla libreria (A su un gioco, «Core ▸»).
  const { request } = state
  useEffect(() => {
    if (!request || handled.current === request.seq) {
      return
    }
    handled.current = request.seq
    if (run.running || intro) {
      return
    }
    const { system, game, resume } = request
    if (request.kind === 'launch' && resume) {
      // «Gioca da qui» nel Profilo: avvio da quello slot, senza la modale dei salvataggi.
      checkBios(system, game, () => startGame(system, game, resume))
    } else if (request.kind === 'launch') {
      checkBios(system, game, () => launch(system, game))
    } else if (request.kind === 'challenge') {
      checkBios(system, game, () => startChallenge(request.challenge, system, game))
    } else if (request.kind === 'tournament') {
      checkBios(system, game, () => startTournament(request.tournament, system, game))
    } else if (request.kind === 'match') {
      checkBios(system, game, () => startMatch(request.match, system, game))
    } else if (request.kind === 'coreMenu') {
      openCoreMenu(system, game)
    }
  }, [request, run.running, intro, launch, startGame, startChallenge, startTournament, startMatch, openCoreMenu,
    checkBios])

  const stop = async () => {
    setArmed(false)
    // Prima della richiesta di avvio: il gioco non parte proprio.
    if (intro && !run.running) {
      introSeq.current += 1
      setIntro(null)
      return
    }
    try {
      updateRun(await api.stop())
    } catch (error) {
      toastError(error)
    }
  }

  const pressStop = () => {
    if (armed) {
      stop()
    } else {
      setArmed(true)
    }
  }

  const answerVerdict = async (worked) => {
    if (busy || !run.question) {
      return
    }
    setBusy(true)
    try {
      updateRun(await api.verdict(run.question.system, run.question.id, worked))
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(false)
    }
  }

  // Risposta al soccorso: lo stato scelto diventa il «Riprendi», `previous` lo lascia com'era.
  const answerRescue = async (choice) => {
    if (busy || !run.question) {
      return
    }
    setBusy(true)
    try {
      updateRun(await api.rescueAnswer(choice))
      // Con uno stato la partita riparte da lì: nessuna notifica.
      if (choice === PREVIOUS) {
        dispatch(showToast('«Riprendi» lasciato com\'era', 'info', true))
      }
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(false)
    }
  }

  const answerBlocked = (choice) => {
    if (choice === 'yes') {
      setRescueOpen(true)
    } else {
      answerRescue(notBlockedChoice(run.question))
    }
  }

  const answerDownload = async (choice) => {
    if (busy || !run.question) {
      return
    }
    setBusy(true)
    try {
      updateRun(await api.answerDownload(run.question.core, choice === 'yes'))
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(false)
    }
  }

  const summaryDone = useCallback(() => setSummary((current) => current && { ...current, done: true }), [])

  // A o B (o «Continua»): prima porta alla fine dell'animazione, poi chiude.
  const pressSummary = () => {
    if (summary.done) {
      setSummary(null)
      openPicker(summary.result)
    } else {
      setSummary({ ...summary, skipped: true, done: true })
    }
  }

  const closePicker = async (create) => {
    const current = picker
    if (!current || current.busy) {
      return
    }
    if (!create) {
      setPicker(null)
      api.challengeDiscard().catch(() => {})
      return
    }
    setPicker({ ...current, busy: true })
    try {
      const data = await api.challengeCreate(current.earner, [...current.chosen])
      const count = data.created.length
      dispatch(showToast(count === 1 ? 'Sfida lanciata: dura 15 giorni' : `${count} sfide lanciate: durano 15 giorni`))
      setPicker(null)
    } catch (error) {
      toastError(error)
      setPicker(null)
    }
  }

  // A (o il clic) sulla voce `position`: spunta il trofeo, lancia le sfide o chiude senza sfidare.
  const activatePicker = (position) => {
    if (!picker || picker.busy) {
      return
    }
    const entry = pickerItems(picker.candidates, picker.chosen)[position]
    if (!entry) {
      return
    }
    if (entry.kind === 'trophy') {
      const chosen = new Set(picker.chosen)
      const id = entry.item.achievementId
      if (chosen.has(id)) {
        chosen.delete(id)
      } else {
        chosen.add(id)
      }
      setPicker({ ...picker, chosen, index: position })
    } else if (entry.kind === 'launch' && !entry.disabled) {
      closePicker(true)
    } else if (entry.kind === 'skip') {
      closePicker(false)
    }
  }

  const answerDialog = (choice) => {
    const current = dialog
    setDialog(null)
    if (choice === 'yes' && current) {
      current.onYes()
    }
  }

  const overlay = overlayOpen(run) || Boolean(intro)
  const verdict = run.phase === 'verdict' && run.question
  const downloadAsk = run.phase === 'download_confirm' && run.question
  const rescue = run.phase === 'rescue' && run.question
  // Uscita normale con gli indizi di blocco: prima la domanda, poi la scelta; con la combinazione subito la scelta.
  const blockedAsk = Boolean(rescue && rescue.reason === SUSPECT && !rescueOpen)
  const rescuePick = Boolean(rescue && !blockedAsk)

  let context = null
  if (biosPage) {
    context = biosContext
  } else if (dialog || downloadAsk || biosAsk || blockedAsk) {
    context = 'confirm'
  } else if (summary) {
    context = summary.done ? 'sessionResult' : 'sessionResultAnim'
  } else if (picker) {
    context = 'challengePicker'
  } else if (saves) {
    context = saves.tabs.length > 1 ? 'saves' : 'savesOne'
  } else if (menu) {
    context = 'picker'
  } else if (verdict) {
    context = 'verdict'
  } else if (rescuePick) {
    context = 'rescue'
  } else if (overlay) {
    context = 'run'
  }
  useEffect(() => {
    onContext(context)
  }, [context, onContext])

  const handle = (event) => {
    if (event.kind === 'release') {
      return Boolean(context)
    }
    const press = event.kind === 'press'
    if (biosPage) {
      if (biosInput.current) {
        biosInput.current(event)
      }
      return true
    }
    if (biosAsk) {
      const choice = moveChoice(MISSING_CHOICES, biosAsk.choice, event.button, wraps(event))
      if (choice !== biosAsk.choice) {
        setBiosAsk({ ...biosAsk, choice })
      } else if (press && event.button === 'a') {
        answerBios(biosAsk.choice)
      } else if (press && event.button === 'b') {
        answerBios('no')
      }
      return true
    }
    if (dialog) {
      if (press && HORIZONTAL.has(event.button)) {
        setDialog({ ...dialog, choice: dialog.choice === 'yes' ? 'no' : 'yes' })
      } else if (press && event.button === 'a') {
        answerDialog(dialog.choice)
      } else if (press && event.button === 'b') {
        answerDialog('no')
      }
      return true
    }
    if (summary) {
      if (press && (event.button === 'a' || event.button === 'b')) {
        pressSummary()
      }
      return true
    }
    if (picker) {
      const dir = VERTICAL[event.button]
      if (dir) {
        const count = pickerItems(picker.candidates, picker.chosen).length
        const index = stepIndex(picker.index, dir, count, wraps(event))
        if (index !== picker.index) {
          setPicker({ ...picker, index })
        }
      } else if (press && event.button === 'a') {
        activatePicker(picker.index)
      } else if (press && event.button === 'b') {
        closePicker(false)
      }
      return true
    }
    if (saves) {
      if (savesInput.current) {
        savesInput.current(event)
      }
      return true
    }
    if (blockedAsk) {
      const choice = moveChoice(BLOCKED_CHOICES, blockedChoice, event.button, wraps(event))
      if (choice !== blockedChoice) {
        setBlockedChoice(choice)
      } else if (press && event.button === 'a') {
        answerBlocked(blockedChoice)
      } else if (press && event.button === 'b') {
        answerBlocked('no')
      }
      return true
    }
    if (rescuePick) {
      if (rescueInput.current) {
        rescueInput.current(event)
      }
      return true
    }
    if (downloadAsk) {
      if (press && HORIZONTAL.has(event.button)) {
        setDownloadChoice(downloadChoice === 'yes' ? 'no' : 'yes')
      } else if (press && event.button === 'a') {
        answerDownload(downloadChoice)
      } else if (press && event.button === 'b') {
        answerDownload('no')
      }
      return true
    }
    if (menu) {
      if (VERTICAL[event.button]) {
        const index = stepIndex(menu.index, VERTICAL[event.button], menu.items.length, wraps(event))
        setMenu({ ...menu, index })
      } else if (press && event.button === 'a') {
        pickCore(menu.items[menu.index])
      } else if (press && event.button === 'b') {
        setMenu(null)
      }
      return true
    }
    if (verdict) {
      if (press && event.button === 'a') {
        answerVerdict(true)
      } else if (press && event.button === 'b') {
        answerVerdict(false)
      }
      return true
    }
    if (overlay) {
      if (press && event.button === 'b') {
        pressStop()
      }
      return true
    }
    if (press && event.button === 'quit') {
      setDialog({ text: 'Chiudere Pixel Arcade?', choice: 'no', onYes: onExit })
      return true
    }
    return false
  }

  useEffect(() => {
    inputRef.current = handle
  })

  useEffect(() => () => {
    inputRef.current = null
  }, [inputRef])

  // Prima della risposta del backend la schermata mostra il gioco richiesto.
  const shown = overlayOpen(run) || !intro
    ? run
    : { phase: 'starting', game: { system: intro.system, id: intro.game.id, title: intro.game.title } }
  const system = shown.game ? state.systems.find((entry) => entry.id === shown.game.system) || null : null
  // Gioco della libreria, per la copertina sull'etichetta dell'animazione di inserimento.
  const libraryGame = shown.game ? (state.games[shown.game.system] || []).find((entry) => entry.id === shown.game.id) || null : null
  return (
    <>
      {overlay && (
        <LaunchOverlay
          run={shown}
          system={system}
          libraryGame={libraryGame}
          armed={armed}
          versus={versusLabel(players)}
          trophies={trophiesUser(state)}
          quitCombo={run.quitCombo || state.quitCombo}
          saveCombo={saveCombo}
          rescueCombo={rescueCombo}
          onStop={pressStop}
        />
      )}
      {verdict && (
        <VerdictDialog question={run.question} game={run.game} system={system} busy={busy} onAnswer={answerVerdict} />
      )}
      {blockedAsk && (
        <ConfirmDialog
          text={BLOCKED_TEXT}
          choices={BLOCKED_CHOICES}
          choice={blockedChoice}
          onHover={setBlockedChoice}
          onChoose={answerBlocked}
        />
      )}
      {rescuePick && run.game && (
        <RescueModal
          question={rescue}
          game={run.game}
          version={(run.lastResult && run.lastResult.seq) || ''}
          inputRef={rescueInput}
          onPick={answerRescue}
        />
      )}
      {summary && (
        <SessionResult
          result={summary.result}
          cards={summary.cards}
          groups={summary.groups}
          game={summary.result.game || null}
          skipped={summary.skipped}
          onDone={summaryDone}
          onContinue={pressSummary}
        />
      )}
      {picker && !summary && (
        <ChallengePicker
          candidates={picker.candidates}
          chosen={picker.chosen}
          index={picker.index}
          game={picker.game}
          earner={picker.earner}
          busy={picker.busy}
          onActivate={activatePicker}
        />
      )}
      {downloadAsk && (
        <ConfirmDialog
          text={downloadQuestion(run.question)}
          choice={downloadChoice}
          onHover={setDownloadChoice}
          onChoose={answerDownload}
        />
      )}
      {saves && (
        <SavesModal
          game={{ system: saves.system, id: saves.game.id, title: saves.game.title }}
          system={state.systems.find((entry) => entry.id === saves.system) || null}
          tabs={saves.tabs}
          tab={saves.tab}
          shared={saves.shared}
          coverGame={saves.game}
          inputRef={savesInput}
          onTab={(tab) => setSaves({ ...saves, tab })}
          onPick={pickSave}
          onClose={() => setSaves(null)}
        />
      )}
      {menu && (
        <PickerMenu
          title={menu.title}
          items={menu.items}
          index={menu.index}
          empty=""
          onHover={(index) => setMenu({ ...menu, index })}
          onPick={(index) => pickCore(menu.items[index])}
          onClose={() => setMenu(null)}
        />
      )}
      {biosAsk && (
        <ConfirmDialog
          text={biosAsk.text}
          choices={MISSING_CHOICES}
          choice={biosAsk.choice}
          onHover={(choice) => setBiosAsk({ ...biosAsk, choice })}
          onChoose={answerBios}
        />
      )}
      {biosPage && (
        <BiosModal
          system={biosPage.system}
          title={(state.systems.find((entry) => entry.id === biosPage.system) || {}).name || biosPage.system}
          core={biosPage.core}
          inputRef={biosInput}
          onContext={setBiosContext}
          onClose={closeBios}
        />
      )}
      {dialog && (
        <ConfirmDialog
          text={dialog.text}
          choice={dialog.choice}
          onHover={(choice) => setDialog({ ...dialog, choice })}
          onChoose={answerDialog}
        />
      )}
    </>
  )
}
