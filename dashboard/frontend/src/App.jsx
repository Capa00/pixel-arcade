import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from './api/client.js'
import { addons } from './addons/index.js'
import {
  addonConsoles,
  availableItems,
  commandButton,
  commandId,
  commandKeys,
  holdCommands,
  mergeLegends,
} from './addons/registry.js'
import { returnToSplash } from './addons/splash.js'
import Stage, { useWindowLayout } from './components/Stage.jsx'
import Header from './components/Header.jsx'
import Footer, { LEGENDS } from './components/Footer.jsx'
import Screensaver from './components/Screensaver.jsx'
import Backdrop from './components/Backdrop.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'
import { YES_NO, moveChoice } from './components/confirmChoices.js'
import ConsoleTabs from './components/ConsoleTabs.jsx'
import CrtOverlay from './components/CrtOverlay.jsx'
import OnScreenKeyboard from './components/OnScreenKeyboard.jsx'
import PlayerSlot from './components/PlayerSlot.jsx'
import Splash from './components/Splash.jsx'
import Toast from './components/Toast.jsx'
import WrappedSplashNote from './components/WrappedSplashNote.jsx'
import ExitOverlay from './views/ExitOverlay.jsx'
import Library from './views/Library.jsx'
import LibraryLayer from './views/LibraryLayer.jsx'
import MatchLayer from './views/MatchLayer.jsx'
import LoginLayer from './views/LoginLayer.jsx'
import Profile from './views/Profile.jsx'
import RandomPickLayer from './views/RandomPickLayer.jsx'
import RunLayer from './views/RunLayer.jsx'
import Settings from './views/Settings.jsx'
import IngameOverlay from './views/IngameOverlay.jsx'
import WrappedLayer from './views/WrappedLayer.jsx'
import ChallengeLayer from './views/ChallengeLayer.jsx'
import TournamentNoticeLayer from './views/TournamentNoticeLayer.jsx'
import TournamentView from './views/TournamentView.jsx'
import PadSetupLayer from './views/PadSetupLayer.jsx'
import { followerActions } from './input/controller.js'
import { EXIT_HOLD_MS, TAP_MS, comboInput, comboProgress, initialCombo } from './input/exitCombo.js'
import { holdInput, holdProgress, holdTick, initialHold } from './input/holdGesture.js'
import { usePointerVisibility } from './input/pointer.js'
import { useInput } from './input/useInput.js'
import { wraps } from './input/wrap.js'
import { EXIT_CANCEL, EXIT_CHOICE, exitQuestion } from './lib/exit.js'
import { pulse } from './lib/haptics.js'
import { playing } from './lib/run.js'
import { inputSound, play, setLevels, setMusic, soundLevels, unlock } from './lib/sound.js'
import { idleContext, shouldStart } from './lib/screensaver.js'
import { GAMES_WAIT_MS, INTRO_MS, initialLoadDone, isSplashStart, shouldLogout } from './lib/splash.js'
import { chosenMode, useColorMode } from './lib/modes.js'
import { activeTheme } from './lib/themes.js'
import { TOURNAMENT_CONSOLE, hasRunning, tabTournaments } from './lib/tournament.js'
import {
  addonConsolesLoaded,
  clickSlot,
  hideToast,
  input,
  oskFocus,
  oskPress,
  oskType,
  padsChanged,
  pressStart,
  resetPlayers,
  selectSystem,
  setColumns,
  showToast,
} from './state/actions.js'
import { AppProvider, useApp } from './state/AppContext.jsx'
import { allConsoles, currentAddonConsole, heroView } from './state/reducer.js'
import { JOIN_HINT, SLOTS, activeUsers, anyModal, gate } from './state/players.js'
import { crtOn, vibrates } from './state/profiles.js'
import * as tournamentStore from './state/tournamentStore.js'
import styles from './App.module.css'

const TOAST_MS = 4000
// Legende della barra comandi con quelle delle estensioni (src/addons/).
const ALL_LEGENDS = mergeLegends(LEGENDS, addons)
// Console delle estensioni (`consoles`), in coda alle schede di quelle dei giochi.
const ADDON_CONSOLES = addonConsoles(addons)
const NO_COMMANDS = []
const COMMAND_CONTEXTS = new Set(['library', 'players'])
// Comando della dashboard «Cosa gioco?» (src/views/RandomPickLayer.jsx): Y tenuto, oppure R.
const RANDOM_PICK = 'random-pick'
const RANDOM_HOLD_MS = 800
// Ogni quanto si controlla l'inattività per il salvaschermo, e movimento minimo del mouse che lo chiude (px).
const IDLE_CHECK_MS = 1000
const POINTER_WAKE_PX = 4
// Ogni quanto si rileggono i tornei per la scheda TOURNAMENT e gli avvisi (ms).
const TOURNAMENT_POLL_MS = 30000
// Attesa prima di cambiare brano col cambio di console (ms): scorrendo le console la musica non si interrompe a ogni scheda.
const MUSIC_SWITCH_MS = 700
// Finestra dei salvataggi in partita, aperta dal servizio sopra il gioco (Sprint 04 dei salvataggi).
const OVERLAY = new URLSearchParams(window.location.search).get('overlay') === '1'

function reducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

function Shell() {
  const { state, dispatch, loadGames } = useApp()
  const pasteText = useCallback((text) => dispatch(oskType(text)), [dispatch])
  const pasteFailed = useCallback((message) => dispatch(showToast(message, 'error')), [dispatch])
  const layout = useWindowLayout()

  useEffect(() => {
    dispatch(setColumns(layout.columns))
  }, [layout.columns, dispatch])

  // Tornei (README «Torneo»): riletti a intervalli e al ritorno nella libreria, per la scheda e gli avvisi.
  const { list: tournamentList, starting: tournamentStarting } = tournamentStore.useTournaments()
  const tournamentTab = tabTournaments(tournamentList).length > 0
  const tournamentLive = hasRunning(tournamentList)
  const libraryShown = state.status !== 'loading' && state.view === 'library'
  useEffect(() => {
    if (!libraryShown) {
      return undefined
    }
    tournamentStore.refresh()
    const timer = window.setInterval(tournamentStore.refresh, TOURNAMENT_POLL_MS)
    return () => window.clearInterval(timer)
  }, [libraryShown])

  // Console delle estensioni: sempre visibili, oppure secondo `watchConsoles` (nascoste finché non lo dice).
  // In fondo la scheda TOURNAMENT, solo con un torneo in iscrizione o in corso (`live`: pallino rosso).
  const [shownConsoles, setShownConsoles] = useState(() => new Set())
  useEffect(() => {
    const visible = ADDON_CONSOLES.filter((entry) => {
      const addon = addons.find((item) => item.id === entry.addon)
      return !addon.watchConsoles || shownConsoles.has(entry.id)
    })
    if (tournamentTab) {
      visible.push({ ...TOURNAMENT_CONSOLE, live: tournamentLive })
    }
    dispatch(addonConsolesLoaded(visible))
  }, [shownConsoles, tournamentTab, tournamentLive, dispatch])

  // Con il salvaschermo aperto il primo evento lo chiude e non va oltre.
  // Ogni evento passa prima dalla combinazione START+SELECT (src/input/exitCombo.js:
  // colpo breve = giocatori scollegati e «PRESS START», tenuta = chiusura),
  // poi dal tasto tenuto dei comandi delle estensioni (src/input/holdGesture.js;
  // i tasti logici `cmd:<id>` eseguono il comando e si fermano qui). Se è aperta
  // la conferma di uscita riceve lei ogni evento; altrimenti si passa alle
  // regole dei giocatori (`gate`, src/state/players.js): joypad non entrati
  // bloccati, finestre «Chi gioca?», START. Poi il livello di gioco, «Cosa gioco?», i livelli
  // delle estensioni e quello della libreria (pannello «Filtri» e menu
  // «＋ Playlist», src/views/LibraryLayer.jsx); nelle viste Impostazioni e profilo (senza tastiera a
  // schermo) lo gestisce la vista, altrimenti il reducer con
  // src/input/controller.js. Il joypad di P2 nella libreria usa solo Y
  // (preferito) e SELECT (profilo).
  const stateRef = useRef(state)
  const viewInput = useRef(null)
  const runInput = useRef(null)
  const loginInput = useRef(null)
  const libraryInput = useRef(null)
  const combo = useRef(initialCombo())
  // Gestore di un'estensione che ha preso tutto l'input (`host.capture`), oppure `null`.
  const captured = useRef(null)
  // Vero mentre un'estensione ha l'input: niente salvaschermo né ritorno a «PRESS START».
  const [capturing, setCapturing] = useState(false)
  const hold = useRef(initialHold())
  const commandsRef = useRef(NO_COMMANDS)
  const layerRefs = useRef(Object.fromEntries(addons.map((addon) => [addon.id, { current: null }])))
  const randomInput = useRef(null)
  const randomOpen = useRef(null)
  const wrappedInput = useRef(null)
  // Legenda dell'avviso o delle schermate del Wrapped (src/views/WrappedLayer.jsx), oppure `null`.
  const [wrappedContext, setWrappedContext] = useState(null)
  const challengeInput = useRef(null)
  // Scheda TOURNAMENT (src/views/TournamentView.jsx) e avviso dei tornei all'ingresso (src/views/TournamentNoticeLayer.jsx).
  const tournamentInput = useRef(null)
  const tournamentNoticeInput = useRef(null)
  // Schermata «Incontro» del torneo (src/views/MatchLayer.jsx): riceve gli eventi dei due giocatori dell'incontro.
  const matchInput = useRef(null)
  const [matchContext, setMatchContext] = useState(null)
  const [tournamentContext, setTournamentContext] = useState(null)
  const [tournamentNoticeContext, setTournamentNoticeContext] = useState(null)
  // Configurazione di un joypad nuovo (src/views/PadSetupLayer.jsx): riceve tutti gli eventi finché è aperta.
  const padSetupInput = useRef(null)
  const [padSetupContext, setPadSetupContext] = useState(null)
  // Legenda dell'avviso di una Sfida trofeo (src/views/ChallengeLayer.jsx), oppure `null`.
  const [challengeContext, setChallengeContext] = useState(null)
  const [randomContext, setRandomContext] = useState(null)
  // Legenda della classifica in «Chi gioca?» o del gioco prenotato, oppure `null` (src/views/LoginLayer.jsx).
  const [loginContext, setLoginContext] = useState(null)
  // Salvaschermo: aperto o no, ultimo comando (ms di `performance.now`) e tasti
  // premuti per chiuderlo, da non inoltrare fino al rilascio (`<source>:<pad>:<tasto>`).
  const [saver, setSaver] = useState(false)
  const saverRef = useRef(false)
  const lastActivity = useRef(performance.now())
  // Ultimo comando (ms di `performance.now`) per l'uscita dei profili: a differenza di
  // `lastActivity` non riparte quando cambia il punto della dashboard.
  const lastCommand = useRef(performance.now())
  const swallowed = useRef(new Set())
  const [addonContext, setAddonContext] = useState(null)
  // Legenda del pannello «Filtri» o del menu «＋ Playlist» della libreria, oppure `null`.
  const [libraryContext, setLibraryContext] = useState(null)
  const [holdActive, setHoldActive] = useState(false)
  const [holdView, setHoldView] = useState(null)
  const [settingsContext, setSettingsContext] = useState('settings')
  // Legenda della modale dei salvataggi nel Profilo, oppure `null`.
  const [profileContext, setProfileContext] = useState(null)
  const [runContext, setRunContext] = useState(null)
  const [holding, setHolding] = useState(false)
  const [exitProgress, setExitProgress] = useState(0)
  // Chiusura partita: `'all'` (Chrome e servizio) o `'background'` (solo Chrome); `null` altrimenti.
  const [closing, setClosing] = useState(null)
  // Conferma di uscita con attività in corso: `{text, choice}`, o `null`.
  const [exitAsk, setExitAsk] = useState(null)
  const exitAskRef = useRef(null)
  const checkingExit = useRef(false)
  // Schermata iniziale (src/components/Splash.jsx): visibile finché un giocatore
  // non entra con START o col clic; «PRESS START» quando sono finiti
  // l'animazione d'ingresso e il caricamento iniziale.
  const [splash, setSplash] = useState(true)
  const [introDone, setIntroDone] = useState(false)
  const [gamesTimedOut, setGamesTimedOut] = useState(false)
  const splashRef = useRef(true)
  // Ritorni a «PRESS START»: nella chiave dei livelli delle finestre, che così ripartono chiusi.
  const [splashSeq, setSplashSeq] = useState(0)
  const splashReady = introDone && initialLoadDone(state, gamesTimedOut)
  const splashReadyRef = useRef(false)
  useEffect(() => {
    stateRef.current = state
    exitAskRef.current = exitAsk
    splashReadyRef.current = splashReady
  })

  useEffect(() => {
    const timer = window.setTimeout(() => setIntroDone(true), reducedMotion() ? 0 : INTRO_MS)
    return () => window.clearTimeout(timer)
  }, [])

  const bootstrapped = state.status !== 'loading'
  useEffect(() => {
    if (!bootstrapped) {
      return undefined
    }
    const timer = window.setTimeout(() => setGamesTimedOut(true), GAMES_WAIT_MS)
    return () => window.clearTimeout(timer)
  }, [bootstrapped])

  // Chi entra dalla schermata iniziale diventa P1 (il joypad dell'evento, oppure
  // tastiera e mouse con `pad` nullo o senza evento), salvo con una partita già in corso.
  const leaveSplash = useCallback((event) => {
    if (!splashRef.current) {
      return
    }
    splashRef.current = false
    setSplash(false)
    play('start')
    if (!playing(stateRef.current.run)) {
      dispatch(event ? pressStart(event.pad, event.padId) : pressStart(null))
    }
  }, [dispatch])

  // START+SELECT premuti brevemente: escono tutti i giocatori e torna «PRESS START»
  // (non con la schermata già aperta, una partita in corso, la chiusura o la sua conferma).
  // Si chiude tutto: prima le azioni delle estensioni (`onSplash`) e i loro store, poi i
  // livelli delle finestre ricreati (`splashSeq`); RunLayer chiude da sé le sue finestre.
  const exitAllowedRef = useRef(false)
  const backToSplash = useCallback(() => {
    if (splashRef.current || !exitAllowedRef.current) {
      return
    }
    returnToSplash(addons)
    dispatch(resetPlayers())
    setSplashSeq((seq) => seq + 1)
    splashRef.current = true
    setSplash(true)
  }, [dispatch])

  const closeDashboard = useCallback(async (keepRunning) => {
    setClosing(keepRunning ? 'background' : 'all')
    try {
      const data = await api.exitDashboard({ keepRunning })
      dispatch(showToast(data.message))
    } catch (error) {
      setClosing(null)
      dispatch(showToast(error.message, 'error'))
    }
  }, [dispatch])

  // Chiusura: se le estensioni hanno attività in corso chiede se continuarle
  // dopo la chiusura; se il controllo non riesce chiude come sempre.
  const exit = useCallback(async () => {
    if (checkingExit.current) {
      return
    }
    checkingExit.current = true
    let busy = []
    try {
      busy = (await api.exitCheck()).busy || []
    } catch {
      busy = []
    }
    checkingExit.current = false
    if (busy.length) {
      setExitAsk({ text: exitQuestion(busy), choice: EXIT_CHOICE })
      return
    }
    closeDashboard(false)
  }, [closeDashboard])

  // Risposta alla conferma di uscita: «Sì» continua in background, «No» chiude tutto, altrimenti annulla.
  const answerExit = useCallback((choice) => {
    setExitAsk(null)
    if (choice === 'yes' || choice === 'no') {
      closeDashboard(choice === 'yes')
    }
  }, [closeDashboard])

  const route = useCallback((event) => {
    // La configurazione di un joypad nuovo, anche sopra la schermata iniziale: senza tasti quel joypad non può premere START.
    if (padSetupInput.current && padSetupInput.current(event)) {
      return
    }
    // La schermata iniziale riceve tutti gli eventi: solo START (o Invio) la chiude, a caricamento finito.
    if (splashRef.current) {
      if (splashReadyRef.current && isSplashStart(event)) {
        leaveSplash(event)
      }
      return
    }
    // La conferma di uscita riceve tutti gli eventi: croce e frecce (circolari), A conferma, B annulla.
    const ask = exitAskRef.current
    if (ask) {
      if (event.kind === 'press' && event.button === 'a') {
        answerExit(ask.choice)
      } else if (event.kind === 'press' && event.button === 'b') {
        answerExit(EXIT_CANCEL)
      } else if (event.kind === 'press' || event.kind === 'repeat') {
        const choice = moveChoice(YES_NO, ask.choice, event.button, wraps(event))
        exitAskRef.current = { ...ask, choice }
        setExitAsk(exitAskRef.current)
      }
      return
    }
    const current = stateRef.current
    // La schermata «Incontro» riceve tutti gli eventi (anche da un joypad non entrato), fuori dalle partite.
    if (matchInput.current && matchInput.current(event)) {
      return
    }
    const target = gate(current, event)
    if (target.to === 'blocked') {
      if (target.hint && (!current.toast || current.toast.message !== JOIN_HINT)) {
        dispatch(showToast(JOIN_HINT))
      }
      return
    }
    if (target.to === 'ignore') {
      return
    }
    if (target.to === 'modal') {
      if (loginInput.current) {
        loginInput.current(target.slot, event)
      }
      return
    }
    if (runInput.current && runInput.current(event)) {
      return
    }
    if (!current.osk && wrappedInput.current && wrappedInput.current(event)) {
      return
    }
    if (!current.osk && challengeInput.current && challengeInput.current(event)) {
      return
    }
    if (!current.osk && tournamentNoticeInput.current && tournamentNoticeInput.current(event)) {
      return
    }
    if (!current.osk && randomInput.current && randomInput.current(event)) {
      return
    }
    // Con la tastiera a schermo aperta gli eventi vanno a lei, anche sopra la finestra di un'estensione.
    for (const addon of current.osk ? [] : addons) {
      const layer = layerRefs.current[addon.id]
      if (layer && layer.current && layer.current(event)) {
        return
      }
    }
    if (!current.osk && current.view === 'library' && tournamentInput.current && tournamentInput.current(event)) {
      return
    }
    if (!current.osk && libraryInput.current && libraryInput.current(event, target)) {
      return
    }
    if (target.to === 'start') {
      dispatch(pressStart(event.pad, event.padId))
      return
    }
    if (target.to === 'follower') {
      for (const action of followerActions(current, event)) {
        dispatch(action)
      }
      return
    }
    if (!current.osk && (current.view === 'settings' || current.view === 'profile') && viewInput.current) {
      viewInput.current(event)
    } else {
      dispatch(input(event))
    }
  }, [dispatch, answerExit, leaveSplash])

  // Comando di un'estensione: solo se è disponibile ora e se il dispositivo
  // che lo chiede comanda la libreria (niente joypad non entrati o di P2).
  const runCommand = useCallback((command, event) => {
    if (splashRef.current || !command || !commandsRef.current.some((item) => item.id === command.id)) {
      return
    }
    if (gate(stateRef.current, { ...event, kind: 'press' }).to !== 'app') {
      return
    }
    command.run()
  }, [])

  // Suono di un comando che arriva alla dashboard (src/lib/sound.js): non dai joypad non entrati,
  // né con la schermata iniziale, il salvaschermo, una partita in corso o il Wrapped (che ha i suoi).
  const inputFeedback = useCallback((event) => {
    const name = inputSound(event)
    const current = stateRef.current
    if (!name || splashRef.current || saverRef.current || playing(current.run) || current.wrapped) {
      return
    }
    const target = gate(current, event).to
    if (target !== 'blocked' && target !== 'ignore') {
      play(name)
    }
  }, [])

  // Torneo del manifesto a schermo nel salvaschermo: START lo apre nella scheda TOURNAMENT.
  const adRef = useRef(null)
  const showAd = useCallback((id) => {
    adRef.current = id
  }, [])

  const closeSaver = useCallback(() => {
    adRef.current = null
    saverRef.current = false
    setSaver(false)
    lastActivity.current = performance.now()
    lastCommand.current = lastActivity.current
  }, [])

  const handleInput = useCallback((event) => {
    const now = performance.now()
    // Per il salvaschermo conta solo una pressione: un tasto o una levetta che restano «tenuti»
    // (per esempio un asse del joypad che a riposo non torna a zero) non lo tengono spento.
    if (event.kind === 'press' || event.kind === 'text') {
      lastActivity.current = now
      lastCommand.current = now
    }
    // Un'estensione che ha preso l'input riceve ogni evento così com'è.
    if (captured.current && !saverRef.current) {
      captured.current(event)
      return
    }
    // Il tasto che chiude il salvaschermo non arriva alla dashboard, nemmeno al rilascio.
    const device = `${event.source}:${event.pad ?? '-'}:${event.button}`
    if (swallowed.current.has(device)) {
      if (event.kind === 'release') {
        swallowed.current.delete(device)
      }
      return
    }
    if (saverRef.current) {
      // Lo chiude solo una pressione: un tasto rimasto tenuto non lo spegne appena parte.
      if (event.kind === 'press' || event.kind === 'text') {
        if (event.kind === 'press') {
          swallowed.current.add(device)
        }
        const ad = adRef.current
        closeSaver()
        if (ad !== null && event.kind === 'press' && event.button === 'start') {
          tournamentStore.requestFocus(ad, null, false)
          dispatch(selectSystem(TOURNAMENT_CONSOLE.id))
        }
      }
      return
    }
    const result = comboInput(combo.current, event, now)
    combo.current = result.combo
    setHolding(result.combo.active !== null)
    if (result.tap) {
      backToSplash()
    }
    for (const next of result.events) {
      const held = holdInput(hold.current, next, now, commandsRef.current)
      hold.current = held.hold
      setHoldActive(held.hold.pending !== null)
      if (held.fire) {
        runCommand(held.fire, next)
      }
      for (const forwarded of held.events) {
        const id = commandId(forwarded.button)
        if (id !== null) {
          if (forwarded.kind === 'press') {
            runCommand(commandsRef.current.find((item) => item.id === id), forwarded)
          }
          continue
        }
        inputFeedback(forwarded)
        route(forwarded)
      }
    }
  }, [route, runCommand, backToSplash, closeSaver, inputFeedback, dispatch])

  // Legenda e comandi delle estensioni, solo nella libreria senza finestre aperte.
  const settingsView = state.view === 'settings'
  const profileView = state.view === 'profile'
  let context = activeUsers(state.players).length ? 'players' : 'library'
  if (padSetupContext) {
    context = padSetupContext
  } else if (exitAsk) {
    context = 'confirm'
  } else if (runContext) {
    context = runContext
  } else if (matchContext) {
    context = matchContext
  } else if (state.osk) {
    context = 'keyboard'
  } else if (addonContext) {
    context = addonContext
  } else if (tournamentContext && !settingsView && !profileView && !anyModal(state.players)) {
    context = tournamentContext
  } else if (randomContext && !settingsView && !profileView) {
    context = randomContext
  } else if (libraryContext && !settingsView && !profileView) {
    context = libraryContext
  } else if (anyModal(state.players)) {
    context = loginContext || 'login'
  } else if (settingsView) {
    context = settingsContext
  } else if (profileView) {
    context = profileContext || 'profile'
  } else if (state.heroFocus === 'cover') {
    context = 'heroCover'
  } else if (state.heroFocus === 'text' && heroView(state).panel === 'text') {
    context = 'heroText'
  } else if (state.heroFocus === 'play' || state.heroFocus === 'core') {
    context = state.heroFocus === 'play' ? 'heroPlay' : 'heroCore'
  } else if (state.heroFocus) {
    context = 'hero'
  }
  // Contesto senza Wrapped e sfide: i loro avvisi compaiono solo nella libreria senza finestre.
  const baseContext = context
  if (padSetupContext) {
    context = padSetupContext
  } else if (wrappedContext && !exitAsk && !runContext) {
    context = wrappedContext
  } else if (challengeContext && !exitAsk && !runContext) {
    context = challengeContext
  } else if (tournamentNoticeContext && !exitAsk && !runContext) {
    context = tournamentNoticeContext
  }
  const canNotify = !splash && !saver && !closing && !playing(state.run) && COMMAND_CONTEXTS.has(baseContext)
  const randomCommand = useMemo(() => ({
    id: RANDOM_PICK,
    hold: { button: 'y', ms: RANDOM_HOLD_MS },
    key: 'r',
    label: 'Cosa gioco?',
    run: () => randomOpen.current && randomOpen.current(),
  }), [])
  // Comandi col tasto tenuto: «Cosa gioco?» e quelli delle estensioni.
  const commands = COMMAND_CONTEXTS.has(context) ? [randomCommand, ...holdCommands(addons, state)] : NO_COMMANDS
  const extraKeys = commandKeys(commands)
  useEffect(() => {
    commandsRef.current = commands
  })

  const { source, pads, emit, gamepad } = useInput(handleInput, state.padButtons, Boolean(state.osk), extraKeys)
  // La rotellina si ferma ai bordi della griglia, come una direzione tenuta premuta.
  const wheelMove = useCallback((direction) => emit(direction, 'repeat'), [emit])

  // Joypad scollegati o sostituiti: stato degli slot (src/state/players.js).
  const padKey = JSON.stringify(pads)
  useEffect(() => {
    dispatch(padsChanged(JSON.parse(padKey)))
  }, [padKey, dispatch])

  // START+SELECT tenuti: anello di avanzamento, poi chiusura (solo senza partita in corso).
  // Il primo secondo è la fascia del colpo breve (`backToSplash`).
  const exitAllowed = !playing(state.run) && !closing && !exitAsk
  useEffect(() => {
    exitAllowedRef.current = exitAllowed
  })
  useEffect(() => {
    if (!holding || !exitAllowed) {
      setExitProgress(0)
      return undefined
    }
    let frame = 0
    const tick = () => {
      const progress = comboProgress(combo.current, performance.now())
      if (progress === null) {
        setExitProgress(0)
        return
      }
      setExitProgress(progress)
      if (progress >= 1) {
        exit()
        return
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [holding, exitAllowed, exit])

  // Tasto tenuto di un comando: anello di avanzamento, poi il comando.
  useEffect(() => {
    if (!holdActive) {
      setHoldView(null)
      return undefined
    }
    let frame = 0
    const tick = () => {
      const now = performance.now()
      const result = holdTick(hold.current, now)
      hold.current = result.hold
      if (result.fire) {
        runCommand(result.fire, result.hold.pending.event)
      }
      const progress = holdProgress(hold.current, now)
      if (progress === null) {
        setHoldView(null)
        return
      }
      const { command } = hold.current.pending
      setHoldView({ addon: command.addon, id: command.id, progress })
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [holdActive, runCommand])

  // Salvaschermo: parte dopo `state.screensaver` minuti senza comandi, solo
  // nella libreria e nel profilo senza finestre aperte (src/lib/screensaver.js)
  // e sulla schermata iniziale, dove si torna dopo `state.logout` minuti;
  // il conto riparte quando si torna in un punto in cui può partire.
  const idleAllowed = !closing && !exitAsk && !playing(state.run) && !capturing &&
    (splash ? !padSetupContext : idleContext(context))
  const minutes = state.screensaver
  useEffect(() => {
    if (!idleAllowed || !minutes) {
      return undefined
    }
    lastActivity.current = performance.now()
    const timer = window.setInterval(() => {
      if (!saverRef.current && shouldStart(performance.now() - lastActivity.current, minutes)) {
        saverRef.current = true
        setSaver(true)
      }
    }, IDLE_CHECK_MS)
    return () => window.clearInterval(timer)
  }, [idleAllowed, minutes])

  // Uscita dei profili: dopo `state.logout` minuti senza comandi, fuori dalle partite, escono
  // tutti e torna «PRESS START» come con START+SELECT (`backToSplash`), anche sotto il
  // salvaschermo, che resta aperto; il conto riparte quando si esce da una partita. Con l'input
  // a un'estensione (`host.capture`) escono solo i giocatori e si resta dove si è. Non scatta
  // mentre l'admin ha aperta la schermata «Avvia» del torneo: il conto riparte quando si chiude.
  const logoutAllowed = !splash && !closing && !exitAsk && !playing(state.run) && !tournamentStarting && !state.match
  const logoutMinutes = state.logout
  useEffect(() => {
    if (!logoutAllowed || !logoutMinutes) {
      return undefined
    }
    lastCommand.current = performance.now()
    const timer = window.setInterval(() => {
      if (!shouldLogout(performance.now() - lastCommand.current, logoutMinutes)) {
        return
      }
      if (!captured.current) {
        backToSplash()
      } else if (exitAllowedRef.current && SLOTS.some((key) => stateRef.current.players[key].joined)) {
        dispatch(resetPlayers())
      }
    }, IDLE_CHECK_MS)
    return () => window.clearInterval(timer)
  }, [logoutAllowed, logoutMinutes, backToSplash, dispatch])

  // Il mouse conta come comando; mosso (o la rotellina) chiude il salvaschermo.
  useEffect(() => {
    const moved = (event) => {
      if (event.type === 'pointermove' && Math.hypot(event.movementX || 0, event.movementY || 0) < POINTER_WAKE_PX) {
        return
      }
      lastActivity.current = performance.now()
      lastCommand.current = lastActivity.current
      if (saverRef.current) {
        closeSaver()
      }
    }
    window.addEventListener('pointermove', moved)
    window.addEventListener('wheel', moved, { passive: true })
    return () => {
      window.removeEventListener('pointermove', moved)
      window.removeEventListener('wheel', moved)
    }
  }, [closeSaver])

  // Una partita o una finestra che si apre (per esempio dal servizio) chiudono il salvaschermo.
  useEffect(() => {
    if (saver && !idleAllowed) {
      closeSaver()
    }
  }, [saver, idleAllowed, closeSaver])

  // Servizi dell'app per le estensioni.
  const host = useMemo(() => ({
    request: api.request,
    loadGames,
    showToast: (message, variant) => dispatch(showToast(message, variant)),
    gamepad,
    capture: (handler) => {
      captured.current = typeof handler === 'function' ? handler : null
      setCapturing(captured.current !== null)
      combo.current = initialCombo()
      hold.current = initialHold()
      setHolding(false)
      setHoldActive(false)
    },
  }), [loadGames, dispatch, gamepad])
  const runButton = useCallback((id) => emit(commandButton(id)), [emit])

  const hostRef = useRef(host)
  useEffect(() => {
    hostRef.current = host
  })
  useEffect(() => {
    const show = (id, visible) => setShownConsoles((current) => {
      if (current.has(id) === Boolean(visible)) {
        return current
      }
      const next = new Set(current)
      if (visible) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
    const stops = addons.filter((addon) => addon.watchConsoles).map((addon) => addon.watchConsoles(hostRef.current, show))
    return () => stops.forEach((stop) => typeof stop === 'function' && stop())
  }, [])

  // Vibrazione chiesta dal reducer (preferito cambiato), se il giocatore l'ha attivata.
  // Con il suono del preferito aggiunto o tolto.
  const { haptic } = state
  useEffect(() => {
    const current = stateRef.current
    if (haptic) {
      play(haptic.on === false ? 'favOff' : 'favOn')
    }
    if (haptic && vibrates(current, haptic.slot)) {
      pulse(current.players[haptic.slot].pad)
    }
  }, [haptic])

  // Suoni e musica (src/lib/sound.js): volumi delle Impostazioni (anche la bozza non salvata) e
  // brano del momento: niente prima delle impostazioni, durante le partite e la chiusura, quello del Wrapped,
  // quello della schermata iniziale o quello della console selezionata.
  const levels = soundLevels(state)
  useEffect(() => {
    setLevels({ on: levels.on, effects: levels.effects, music: levels.music })
  }, [levels.on, levels.effects, levels.music])
  // Gioco davanti alla pagina: animazioni in pausa (styles/base.css, `data-ingame`).
  const ingame = playing(state.run) && state.run.phase === 'running'
  useEffect(() => {
    const root = document.documentElement
    if (ingame) {
      root.dataset.ingame = ''
    } else {
      delete root.dataset.ingame
    }
    return () => {
      delete root.dataset.ingame
    }
  }, [ingame])

  let musicTrack = state.systemId ? `system:${state.systemId}` : 'title'
  if (state.status === 'loading' || closing || playing(state.run)) {
    musicTrack = null
  } else if (state.wrapped) {
    musicTrack = 'wrapped'
  } else if (splash) {
    musicTrack = 'title'
  }
  useEffect(() => {
    if (!musicTrack || !musicTrack.startsWith('system:')) {
      setMusic(musicTrack)
      return undefined
    }
    const timer = window.setTimeout(() => setMusic(musicTrack), MUSIC_SWITCH_MS)
    return () => window.clearTimeout(timer)
  }, [musicTrack])
  useEffect(() => () => setMusic(null), [])

  // Senza il flag di avvio di Chrome l'audio si sblocca al primo tasto della tastiera o clic.
  useEffect(() => {
    window.addEventListener('keydown', unlock)
    window.addEventListener('pointerdown', unlock)
    return () => {
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('pointerdown', unlock)
    }
  }, [])


  const { toast } = state
  useEffect(() => {
    if (!toast) {
      return undefined
    }
    if (toast.variant === 'error') {
      play('error')
    }
    const timer = window.setTimeout(() => dispatch(hideToast()), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast, dispatch])

  const legends = COMMAND_CONTEXTS.has(context)
    ? { ...ALL_LEGENDS, [context]: availableItems(ALL_LEGENDS[context], commands) }
    : ALL_LEGENDS

  // Console di un'estensione selezionata: la sua vista prende il posto della libreria.
  const consoleTab = currentAddonConsole(state)
  const addonView = consoleTab ? addons.find((addon) => addon.id === consoleTab.addon && addon.ConsoleView) || null : null
  const tournamentView = Boolean(consoleTab && consoleTab.id === TOURNAMENT_CONSOLE.id)

  const theme = activeTheme(state)
  useColorMode(chosenMode(state), state.status === 'ready' ? state.mode : null)

  return (
    <Stage layout={layout}>
      <Backdrop key={theme.id} theme={theme} />
      {/* Decorazioni delle estensioni: sopra lo sfondo, dietro il contenuto. */}
      {addons
        .filter((addon) => addon.Decor)
        .map((addon) => (
          <addon.Decor key={addon.id} state={state} />
        ))}
      <Header
        tabs={
          settingsView || profileView ? null : (
            <ConsoleTabs
              systems={allConsoles(state)}
              current={state.systemId}
              onSelect={(id) => dispatch(selectSystem(id))}
            />
          )
        }
        extras={
          settingsView || profileView
            ? null
            : addons
              .filter((addon) => addon.HeaderItem)
              .map((addon) => (
                <addon.HeaderItem
                  key={addon.id}
                  state={state}
                  holdProgress={holdView && holdView.addon === addon.id ? holdView.progress : 0}
                  command={runButton}
                  host={host}
                />
              ))
        }
        slots={SLOTS.map((slot) => (
          <PlayerSlot key={slot} slotKey={slot} slot={state.players[slot]} onClick={() => dispatch(clickSlot(slot))} />
        ))}
      />
      <main className={styles.content}>
        {settingsView && <Settings inputRef={viewInput} gamepad={gamepad} onContext={setSettingsContext} />}
        {profileView && <Profile inputRef={viewInput} onContext={setProfileContext} />}
        {!settingsView && !profileView && tournamentView && (
          <TournamentView inputRef={tournamentInput} onContext={setTournamentContext} />
        )}
        {!settingsView && !profileView && !tournamentView && (addonView ? (
          <addonView.ConsoleView key={consoleTab.id} console={consoleTab} host={host} />
        ) : (
          <Library onWheelMove={wheelMove} />
        ))}
      </main>
      {crtOn(state) && <CrtOverlay />}
      <LoginLayer inputRef={loginInput} onContext={setLoginContext} />
      {/* RunLayer non si ricrea: perderebbe le richieste già gestite e le scelte sul BIOS. */}
      <RunLayer inputRef={runInput} gamepad={gamepad} onContext={setRunContext} onExit={exit} splashSeq={splashSeq} />
      {/* Livelli delle finestre: la chiave con `splashSeq` li ricrea chiusi a ogni ritorno a «PRESS START». */}
      {addons
        .filter((addon) => addon.Layer)
        .map((addon) => (
          <addon.Layer
            key={`${addon.id}-${splashSeq}`}
            inputRef={layerRefs.current[addon.id]}
            onContext={setAddonContext}
            host={host}
          />
        ))}
      <MatchLayer inputRef={matchInput} onContext={setMatchContext} />
      <LibraryLayer key={`library-${splashSeq}`} inputRef={libraryInput} onContext={setLibraryContext} />
      <RandomPickLayer
        key={`random-${splashSeq}`}
        openRef={randomOpen}
        inputRef={randomInput}
        onContext={setRandomContext}
        holdProgress={holdView && holdView.id === RANDOM_PICK ? holdView.progress : 0}
      />
      <WrappedLayer
        key={`wrapped-${splashSeq}`}
        inputRef={wrappedInput}
        onContext={setWrappedContext}
        canNotify={canNotify && !challengeContext && !tournamentNoticeContext}
      />
      {/* Gli avvisi delle sfide aspettano quelli del Wrapped, e viceversa: mai due insieme. */}
      <ChallengeLayer
        key={`challenge-${splashSeq}`}
        inputRef={challengeInput}
        onContext={setChallengeContext}
        canNotify={canNotify && !wrappedContext && !tournamentNoticeContext}
      />
      {/* Avviso dei tornei all'ingresso di un giocatore: dopo quelli del Wrapped e delle sfide. */}
      <TournamentNoticeLayer
        key={`tournament-${splashSeq}`}
        inputRef={tournamentNoticeInput}
        onContext={setTournamentNoticeContext}
        canNotify={canNotify && !wrappedContext && !challengeContext}
      />
      <PadSetupLayer
        pads={pads}
        gamepad={gamepad}
        inputRef={padSetupInput}
        onContext={setPadSetupContext}
        canSetup={state.status === 'ready' && !saver && !closing && !playing(state.run)}
      />
      {/* Dopo le estensioni, così resta sopra le loro finestre. */}
      {state.osk && (
        <OnScreenKeyboard
          osk={state.osk}
          onPress={(row, col) => dispatch(oskPress(row, col))}
          onHover={(row, col) => dispatch(oskFocus(row, col))}
          onPaste={pasteText}
          onPasteError={pasteFailed}
        />
      )}
      {(closing || (holding && exitAllowed && exitProgress > 0)) && (
        <ExitOverlay
          progress={closing ? 1 : exitProgress}
          tapping={!closing && exitProgress * EXIT_HOLD_MS < TAP_MS}
          closing={Boolean(closing)}
          background={closing === 'background'}
        />
      )}
      {exitAsk && (
        <ConfirmDialog
          text={exitAsk.text}
          choice={exitAsk.choice}
          cancel={EXIT_CANCEL}
          onHover={(choice) => setExitAsk({ ...exitAsk, choice })}
          onChoose={answerExit}
        />
      )}
      {toast && <Toast key={toast.id} message={toast.message} variant={toast.variant} />}
      <Footer source={source} pads={pads.length} context={context} onCommand={emit} legends={legends} />
      {splash && (
        <Splash
          ready={splashReady}
          onStart={() => leaveSplash(null)}
          extras={[
            <WrappedSplashNote key="wrapped" ready={splashReady} />,
            ...addons
              .filter((addon) => addon.SplashItem)
              .map((addon) => (
                <addon.SplashItem key={addon.id} ready={splashReady} />
              )),
          ]}
        />
      )}
      {/* Dopo la schermata iniziale: il salvaschermo parte anche sopra «PRESS START». */}
      {saver && <Screensaver onClose={closeSaver} gamepad={gamepad} onAd={showAd} />}
    </Stage>
  )
}

export default function App() {
  usePointerVisibility()

  return (
    <AppProvider>{OVERLAY ? <IngameOverlay /> : <Shell />}</AppProvider>
  )
}
