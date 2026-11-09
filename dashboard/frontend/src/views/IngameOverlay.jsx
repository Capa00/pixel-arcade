import { useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import ControlsModal from '../components/ControlsModal.jsx'
import { YES_NO, moveChoice } from '../components/confirmChoices.js'
import Footer from '../components/Footer.jsx'
import PickerMenu from '../components/PickerMenu.jsx'
import SavesModal from '../components/SavesModal.jsx'
import Stage, { useWindowLayout } from '../components/Stage.jsx'
import { useInput } from '../input/useInput.js'
import { stepIndex, wraps } from '../input/wrap.js'
import { changedMap, controlPlayers, mapChanged } from '../lib/controls.js'
import OnScreenKeyboard from '../components/OnScreenKeyboard.jsx'
import {
  NAME_MAX,
  UNDO,
  cleanName,
  hideBrokenImage,
  ingameConfirmText,
  ingameProgress,
  ingameTab,
  itemLabel,
  slotActions,
} from '../lib/saves.js'
import { input, oskFocus, oskPress, openKeyboard } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import { useRunPolling } from '../state/useRunPolling.js'
import styles from './IngameOverlay.module.css'

const GUEST_TEXT = 'Gli ospiti non hanno salvataggi: entra con un profilo per salvare'
const GUEST_CHOICES = [{ id: 'close', label: 'Torna al gioco' }]
// Incontro di torneo con i salvataggi bloccati: si torna al gioco o si esce.
const LOCKED_TEXT = 'In questo torneo i salvataggi sono bloccati'
const LOCKED_CHOICES = [{ id: 'close', label: 'Torna al gioco' }, { id: 'quit', label: 'Esci' }]
const VERTICAL = { up: -1, down: 1 }
// START e SELECT del joypad non si usano: insieme chiuderebbero RetroArch.
const IGNORED = new Set(['start', 'select'])
// Azioni dopo le quali la modale si chiude e il gioco riprende.
const RESUMING = new Set(['load', UNDO])
const NAME_TARGET = 'saveName'

function otherSlot(slot) {
  return slot === 'p1' ? 'p2' : 'p1'
}

/**
 * Pagina della finestra sopra il gioco in pausa (`/?overlay=1`): il servizio
 * la apre e la chiude terminando il processo di Chrome. Con `run.menu.kind`
 * uguale a `controls` mostra la finestra «Comandi» (`ControlsOverlay`),
 * altrimenti quella dei salvataggi (`SavesOverlay`).
 */
export default function IngameOverlay() {
  const { state } = useApp()
  const [polled, setPolled] = useState(null)
  useRunPolling(state.status === 'ready', setPolled)
  const run = polled || state.run
  const menu = run.menu || null
  if (menu && menu.open && menu.kind === 'controls' && run.phase === 'running' && run.game) {
    return <ControlsOverlay run={run} />
  }
  return <SavesOverlay run={run} />
}

/**
 * Finestra «Comandi» al primo avvio di un gioco con un core mai configurato.
 * Mostra i comandi del gioco in corso (`ControlsModal`, modo `game`):
 * «Salva» li registra e, se le assegnazioni sono cambiate, il gioco si
 * riavvia dallo stato appena salvato; «Più tardi» o B fanno riprendere il
 * gioco e la domanda torna alla prossima partita. START e SELECT non si
 * usano. Sullo sfondo c'è la cattura del gioco in pausa.
 */
function ControlsOverlay({ run }) {
  const { state, dispatch } = useApp()
  const layout = useWindowLayout()
  const [controls, setControls] = useState(null)
  const [busy, setBusy] = useState(false)
  const [closing, setClosing] = useState(false)
  const [status, setStatus] = useState(null)
  const [context, setContext] = useState('controlsGame')
  const controlsInput = useRef(null)
  const gameSystem = run.game.system
  const gameId = run.game.id
  const menu = run.menu

  const close = async () => {
    if (busy || closing) {
      return
    }
    setClosing(true)
    setStatus({ text: 'Ritorno al gioco…', error: false })
    try {
      await api.ingameClose()
    } catch (error) {
      setClosing(false)
      setStatus({ text: error.message, error: true })
    }
  }

  // Comandi del gioco in corso; senza nomi dei tasti la finestra si chiude.
  useEffect(() => {
    let active = true
    api.gameControls(gameSystem, gameId)
      .then((data) => {
        if (!active) {
          return
        }
        if (controlPlayers(data.controls).length) {
          setControls(data.controls)
        } else {
          setClosing(true)
          api.ingameClose().catch(() => {})
        }
      })
      .catch((error) => {
        if (active) {
          setStatus({ text: error.message, error: true })
        }
      })
    return () => {
      active = false
    }
  }, [gameSystem, gameId])

  const save = async (draft) => {
    if (busy || closing || !controls) {
      return
    }
    const restart = mapChanged(controls, draft)
    setBusy(true)
    setStatus({ text: 'Salvataggio dei comandi…', error: false })
    try {
      await api.ingameControls(changedMap(draft), draft.labels)
      setClosing(true)
      setStatus({ text: restart ? 'Riavvio del gioco con i nuovi comandi…' : 'Ritorno al gioco…', error: false })
    } catch (error) {
      setStatus({ text: error.message, error: true })
    } finally {
      setBusy(false)
    }
  }

  const handle = (event) => {
    // Con la tastiera a schermo aperta gli eventi vanno a lei (START dalla tastiera fisica conferma).
    if (state.osk) {
      if (!(IGNORED.has(event.button) && event.pad !== null)) {
        dispatch(input(event))
      }
      return
    }
    if (IGNORED.has(event.button) || closing) {
      return
    }
    if (controlsInput.current) {
      controlsInput.current(event)
    } else if (event.kind === 'press' && event.button === 'b') {
      close()
    }
  }

  const { source, pads, emit, gamepad } = useInput(handle, state.padButtons, Boolean(state.osk))

  useEffect(() => {
    gamepad.lockUntilReleased()
  }, [gamepad])

  let wait = ''
  if (closing) {
    wait = status && status.text ? '' : 'Ritorno al gioco…'
  } else if (!controls) {
    wait = 'Caricamento dei comandi…'
  }

  return (
    <Stage layout={layout}>
      <main className={styles.page}>
        {menu.shot !== null && <img className={styles.shot} src={api.ingameShotUrl(menu.shot)} alt="" onError={hideBrokenImage} />}
        {wait && <p className={`pix ${styles.wait}`}>{wait}</p>}
        {controls && !closing && (
          <ControlsModal
            title={run.game.title}
            controls={controls}
            mode="game"
            closeLabel="Più tardi"
            present={menu.players && menu.players.length ? menu.players : ['p1']}
            busy={busy}
            inputRef={controlsInput}
            onContext={setContext}
            onSave={save}
            onClose={close}
          />
        )}
        {state.osk && (
          <OnScreenKeyboard
            osk={state.osk}
            onPress={(row, col) => dispatch(oskPress(row, col))}
            onHover={(row, col) => dispatch(oskFocus(row, col))}
          />
        )}
      </main>
      <div className={styles.bar}>
        {status && status.text && (
          <div className={status.error ? `${styles.status} ${styles.error}` : styles.status} role="status">
            {status.text}
          </div>
        )}
        <Footer source={source} pads={pads.length} context={state.osk ? 'savesKeyboard' : context} onCommand={emit} />
      </div>
    </Stage>
  )
}

/**
 * Finestra dei salvataggi in partita (Sprint 04 dei salvataggi).
 *
 * Mostra la modale «Salvataggi» del giocatore che ha premuto la
 * combinazione (`run.menu`), con gli slot 1–9 del suo profilo. Su uno slot
 * si apre il menu dello slot (Sprint 05: «Salva qui», «Carica», «Rinomina»,
 * «Proteggi», «Elimina», «Copia a <nome>»), poi la conferma. «Rinomina»
 * passa prima dalla tastiera a schermo, «Copia» dalla griglia degli slot
 * dell'altro giocatore. Se il giocatore ha caricato uno slot, in cima c'è
 * «Annulla ultimo caricamento» (`menu.undo`). B chiude e il gioco riprende;
 * dopo «Carica» o «Annulla» il gioco riprende dallo stato caricato. Un
 * ospite vede solo un avviso. I tasti tenuti all'apertura (la combinazione)
 * si ignorano finché non sono rilasciati. Sullo sfondo c'è la cattura del
 * gioco in pausa (`menu.shot`), se il servizio è riuscito a farla: una
 * finestra di Chrome non può essere trasparente.
 */
function SavesOverlay({ run }) {
  const { state, dispatch } = useApp()
  const layout = useWindowLayout()
  const [slots, setSlots] = useState(null)
  const [picker, setPicker] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [busy, setBusy] = useState(false)
  const [closing, setClosing] = useState(false)
  const [status, setStatus] = useState(null)
  // Copia in corso di scelta: `{item, slots}` (slot dell'altro giocatore, `null` mentre arrivano).
  const [copy, setCopy] = useState(null)
  // Slot che si sta rinominando con la tastiera a schermo, oppure `null`.
  const [naming, setNaming] = useState(null)
  // Scelta evidenziata con i salvataggi bloccati.
  const [lockedChoice, setLockedChoice] = useState('close')
  const savesInput = useRef(null)
  const copyInput = useRef(null)

  const ready = state.status === 'ready'
  const menu = run.menu || null
  const open = Boolean(menu && menu.open && run.phase === 'running')
  const locked = Boolean(open && menu.locked)
  const temp = Boolean(open && menu.temp)
  const guest = open && !locked && menu.account === null
  const account = open && !guest && !locked ? state.accounts.find((entry) => entry.id === menu.account) || null : null
  const accountId = account ? account.id : null
  const gameSystem = run.game ? run.game.system : null
  const gameId = run.game ? run.game.id : null
  const other = account && menu.other !== null ? state.accounts.find((entry) => entry.id === menu.other) || null : null
  const undo = Boolean(open && menu.undo)

  // Slot del profilo per il gioco in corso.
  useEffect(() => {
    if (accountId === null || !gameSystem) {
      return undefined
    }
    let active = true
    // Negli incontri senza blocco gli slot sono quelli temporanei dell'incontro.
    const load = temp ? api.ingameSlots().then((data) => data.slots)
      : api.gameSaves(gameSystem, gameId, [accountId])
        .then((data) => {
          const entry = data.accounts.find((item) => item.id === accountId)
          return entry ? entry.slots : []
        })
    load
      .then((list) => {
        if (active) {
          setSlots(list)
        }
      })
      .catch((error) => {
        if (active) {
          setSlots([])
          setStatus({ text: error.message, error: true })
        }
      })
    return () => {
      active = false
    }
  }, [accountId, gameSystem, gameId, temp])

  const fail = (error) => setStatus({ text: error.message, error: true })

  // Tastiera chiusa: con la conferma si chiede se rinominare, con l'annullamento si torna alla modale.
  const keyboardText = state.keyboardText
  const keyboardOpen = Boolean(state.osk)
  useEffect(() => {
    if (!naming || keyboardOpen) {
      return
    }
    setNaming(null)
    if (!keyboardText || !keyboardText.target || keyboardText.target.kind !== NAME_TARGET) {
      return
    }
    const name = cleanName(keyboardText.value)
    if (name === cleanName(naming.save && naming.save.name)) {
      return
    }
    setDialog({ text: ingameConfirmText('rename', naming, { name }), choice: 'yes', action: 'rename', item: naming, extra: { name } })
  }, [naming, keyboardOpen, keyboardText])

  const close = async () => {
    if (busy || closing) {
      return
    }
    setClosing(true)
    setStatus({ text: 'Ritorno al gioco…', error: false })
    try {
      await api.ingameClose()
    } catch (error) {
      setClosing(false)
      fail(error)
    }
  }

  // «Esci» con i salvataggi bloccati: la finestra si chiude con il gioco.
  const quit = async () => {
    if (closing) {
      return
    }
    setClosing(true)
    setStatus({ text: 'Uscita dal gioco…', error: false })
    try {
      await api.ingameQuit()
    } catch (error) {
      setClosing(false)
      fail(error)
    }
  }

  const chooseLocked = (choice) => (choice === 'quit' ? quit() : close())

  const key = { account: accountId, system: gameSystem, game: gameId }

  const request = (action, item, extra) => {
    switch (action) {
      case 'save':
        return api.ingameSave(item.slot)
      case 'load':
        return api.ingameLoad(item.slot)
      case UNDO:
        return api.ingameUndo()
      case 'rename':
        return api.renameSave(key, item.slot, extra.name)
      case 'protect':
      case 'unprotect':
        return api.protectSave(key, item.slot, action === 'protect')
      case 'delete':
        return api.deleteSave(key, item.slot)
      case 'copy':
        return api.copySave(key, item.slot, extra.other.id, extra.target.slot)
      default:
        return Promise.reject(new Error('Azione non valida'))
    }
  }

  const perform = async (action, item, extra = {}) => {
    const [during, after] = ingameProgress(action, item, extra)
    setBusy(true)
    setStatus({ text: during, error: false })
    try {
      const data = await request(action, item, extra)
      if (RESUMING.has(action)) {
        setClosing(true)
      } else if (action !== 'copy') {
        setSlots(data.slots)
      }
      setStatus({ text: after, error: false })
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  const ask = (action, item, extra = {}) => {
    setDialog({ text: ingameConfirmText(action, item, extra), choice: 'yes', action, item, extra })
  }

  const pick = (item) => {
    if (busy || closing) {
      return
    }
    if (item.kind === UNDO) {
      ask(UNDO, item)
    } else {
      setPicker({ item, items: slotActions(item, { other, temp }), index: 0 })
    }
  }

  // Griglia degli slot dell'altro giocatore per scegliere dove copiare.
  const startCopy = async (item) => {
    setCopy({ item, slots: null })
    try {
      const data = await api.gameSaves(gameSystem, gameId, [other.id])
      const entry = data.accounts.find((value) => value.id === other.id)
      setCopy((current) => (current && current.item === item ? { item, slots: entry ? entry.slots : [] } : current))
    } catch (error) {
      setCopy(null)
      fail(error)
    }
  }

  const choose = (entry) => {
    const { item } = picker
    if (entry.disabled) {
      setStatus({ text: entry.reason, error: true })
      return
    }
    setPicker(null)
    if (entry.id === 'rename') {
      setNaming(item)
      const slotName = (item.save && item.save.name) || ''
      dispatch(openKeyboard('text', {
        value: slotName,
        max: NAME_MAX,
        title: `Nome dello slot ${item.slot}`,
        placeholder: `Slot ${item.slot}`,
        target: { kind: NAME_TARGET, slot: item.slot },
      }))
    } else if (entry.id === 'copy') {
      startCopy(item)
    } else {
      ask(entry.id, item)
    }
  }

  const pickTarget = (target) => {
    if (!copy || target.disabled) {
      return
    }
    const { item } = copy
    setCopy(null)
    ask('copy', item, { other, target })
  }

  const answer = (choice) => {
    const current = dialog
    setDialog(null)
    if (choice === 'yes' && current) {
      perform(current.action, current.item, current.extra)
    }
  }

  const handle = (event) => {
    // Con la tastiera a schermo aperta gli eventi vanno a lei (START dalla tastiera fisica conferma).
    if (state.osk) {
      if (!(IGNORED.has(event.button) && event.pad !== null)) {
        dispatch(input(event))
      }
      return
    }
    if (IGNORED.has(event.button) || event.kind === 'release' || event.kind === 'text') {
      return
    }
    const press = event.kind === 'press'
    if (dialog) {
      const choice = moveChoice(YES_NO, dialog.choice, event.button, wraps(event))
      if (choice !== dialog.choice) {
        setDialog({ ...dialog, choice })
      } else if (press && event.button === 'a') {
        answer(dialog.choice)
      } else if (press && event.button === 'b') {
        answer('no')
      }
      return
    }
    if (picker) {
      if (VERTICAL[event.button]) {
        setPicker({ ...picker, index: stepIndex(picker.index, VERTICAL[event.button], picker.items.length, wraps(event)) })
      } else if (press && event.button === 'a') {
        choose(picker.items[picker.index])
      } else if (press && event.button === 'b') {
        setPicker(null)
      }
      return
    }
    if (busy || closing) {
      return
    }
    if (copy) {
      if (copyInput.current) {
        copyInput.current(event)
      }
      return
    }
    if (locked) {
      const choice = moveChoice(LOCKED_CHOICES, lockedChoice, event.button, wraps(event))
      if (choice !== lockedChoice) {
        setLockedChoice(choice)
      } else if (press && event.button === 'a') {
        chooseLocked(lockedChoice)
      } else if (press && event.button === 'b') {
        close()
      }
      return
    }
    if (guest) {
      if (press && (event.button === 'a' || event.button === 'b')) {
        close()
      }
      return
    }
    if (savesInput.current) {
      savesInput.current(event)
    }
  }

  const { source, pads, emit, gamepad } = useInput(handle, state.padButtons, Boolean(state.osk))

  // La combinazione è ancora premuta quando la finestra si apre: si aspetta il rilascio.
  useEffect(() => {
    gamepad.lockUntilReleased()
  }, [gamepad])

  const tab = account && slots && !closing ? ingameTab(menu.slot, account, slots) : null
  const copyTab = tab && copy && copy.slots && other ? ingameTab(otherSlot(menu.slot), other, copy.slots) : null
  let wait = ''
  if (state.status === 'error') {
    wait = state.error
  } else if (!ready) {
    wait = 'Caricamento…'
  } else if (!open || closing) {
    wait = 'Ritorno al gioco…'
  } else if (!guest && !locked && !tab) {
    wait = 'Caricamento dei salvataggi…'
  }

  let context = 'savesGame'
  if (state.osk) {
    context = 'savesKeyboard'
  } else if (dialog || locked) {
    context = 'confirm'
  } else if (picker) {
    context = 'picker'
  } else if (copy) {
    context = 'savesCopy'
  }

  return (
    <Stage layout={layout}>
      <main className={styles.page}>
        {open && menu.shot !== null && <img className={styles.shot} src={api.ingameShotUrl(menu.shot)} alt="" onError={hideBrokenImage} />}
        {wait && <p className={`pix ${styles.wait}`}>{wait}</p>}
        {tab && !copy && (
          <SavesModal
            game={{ system: gameSystem, id: gameId, title: run.game.title }}
            system={state.systems.find((entry) => entry.id === gameSystem) || null}
            tabs={[tab]}
            tab={0}
            mode="game"
            undo={undo}
            inputRef={savesInput}
            onTab={() => {}}
            onPick={pick}
            onClose={close}
            thumbUrl={temp ? (item) => api.ingameThumbUrl(item.slot, item.save.updatedAt) : null}
          />
        )}
        {copy && !copyTab && <p className={`pix ${styles.wait}`}>Caricamento dei salvataggi…</p>}
        {copyTab && (
          <SavesModal
            game={{ system: gameSystem, id: gameId, title: run.game.title }}
            system={state.systems.find((entry) => entry.id === gameSystem) || null}
            tabs={[copyTab]}
            tab={0}
            mode="copy"
            kicker={`COPIA LO SLOT ${copy.item.slot} IN`}
            inputRef={copyInput}
            onTab={() => {}}
            onPick={pickTarget}
            onClose={() => setCopy(null)}
          />
        )}
        {locked && !closing && (
          <ConfirmDialog
            text={LOCKED_TEXT}
            choices={LOCKED_CHOICES}
            choice={lockedChoice}
            cancel="close"
            onHover={setLockedChoice}
            onChoose={chooseLocked}
          />
        )}
        {guest && !closing && (
          <ConfirmDialog text={GUEST_TEXT} choices={GUEST_CHOICES} choice="close" cancel="close" onHover={() => {}} onChoose={close} />
        )}
        {picker && (
          <PickerMenu
            title={itemLabel(picker.item)}
            items={picker.items}
            index={picker.index}
            empty=""
            onHover={(index) => setPicker({ ...picker, index })}
            onPick={(index) => choose(picker.items[index])}
            onClose={() => setPicker(null)}
          />
        )}
        {state.osk && (
          <OnScreenKeyboard
            osk={state.osk}
            onPress={(row, col) => dispatch(oskPress(row, col))}
            onHover={(row, col) => dispatch(oskFocus(row, col))}
          />
        )}
        {dialog && (
          <ConfirmDialog
            text={dialog.text}
            choice={dialog.choice}
            onHover={(choice) => setDialog({ ...dialog, choice })}
            onChoose={answer}
          />
        )}
      </main>
      <div className={styles.bar}>
        {status && status.text && (
          <div className={status.error ? `${styles.status} ${styles.error}` : styles.status} role="status">
            {status.text}
          </div>
        )}
        <Footer source={source} pads={pads.length} context={context} onCommand={emit} />
      </div>
    </Stage>
  )
}
