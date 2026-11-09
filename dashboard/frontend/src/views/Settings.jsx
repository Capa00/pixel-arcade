import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import * as api from '../api/client.js'
import { addons } from '../addons/index.js'
import { addonConsoles, addonSettingsTabs } from '../addons/registry.js'
import BiosModal from '../components/BiosModal.jsx'
import JoypadList from '../components/JoypadList.jsx'
import ComboLearn, { comboLabel } from '../components/ComboLearn.jsx'
import ConfigModal from '../components/ConfigModal.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { YES_NO, moveChoice } from '../components/confirmChoices.js'
import ItemList from '../components/ItemList.jsx'
import MultiPickerMenu from '../components/MultiPickerMenu.jsx'
import PickerMenu from '../components/PickerMenu.jsx'
import TextField from '../components/TextField.jsx'
import WrappedPeriods from '../components/WrappedPeriods.jsx'
import {
  ALL,
  allSelected,
  filterItems,
  groupRows,
  initialGroup,
  jumpGroup,
  keepCursor,
  moveCursor,
  toggle,
  toggleAll,
} from '../components/multiPicker.js'
import { settingsCommand } from '../input/controller.js'
import { QUIT_COMBOS, quitComboById } from '../input/quitCombo.js'
import { MENU_COMBOS, menuComboById } from '../input/menuCombo.js'
import { RESCUE_SHARED_MS, rescueComboError, rescueHoldMs, sameCombo } from '../input/rescueCombo.js'
import { useFocusScope } from '../input/useFocusScope.js'
import { stepIndex, wraps } from '../input/wrap.js'
import {
  closeSettings,
  coreRemove,
  coresAdd,
  openKeyboard,
  padButtonsSaved,
  setFocus,
  setPickerFilter,
  settingsChange,
  showToast,
} from '../state/actions.js'
import { missingCores } from '../lib/bios.js'
import { formatSize } from '../lib/format.js'
import { MODES, SYSTEM, modeById } from '../lib/modes.js'
import {
  DEFAULT_CONTENT, DEFAULT_MINUTES, SCREENSAVER_CONTENT, SCREENSAVER_MINUTES, contentLabel, minutesLabel,
} from '../lib/screensaver.js'
import { DEFAULT_LOGOUT, LOGOUT_MINUTES } from '../lib/splash.js'
import { DEFAULT_SOUND, VOLUMES, volumeLabel } from '../lib/sound.js'
import { RANDOM, THEMES, themeById } from '../lib/themes.js'
import { useApp } from '../state/AppContext.jsx'
import {
  SETTINGS_TABS,
  coreStatus,
  coreSummary,
  cpuNote,
  isDirty,
  settingsPayload,
  stepTab,
  suggestedExtensions,
} from '../state/settings.js'
import { usePlaylistSettings } from './SettingsPlaylists.jsx'
import { useTournamentSettings } from './SettingsTournament.jsx'
import styles from './Settings.module.css'

const SCOPE = 'settings'
// Schede delle estensioni (`settingsTab`, src/addons/registry.js), in coda a quelle fisse.
const ADDON_TABS = addonSettingsTabs(addons)
const TABS = [...SETTINGS_TABS, ...ADDON_TABS.map((entry) => ({ id: entry.id, label: entry.label }))]
// Impostazioni delle console delle estensioni (`consoleSettings`, src/addons/registry.js), con il nome della console.
const CONSOLE_SETTINGS = addons
  .filter((addon) => addon.consoleSettings)
  .map((addon) => {
    const entry = addonConsoles([addon]).find((item) => item.id === addon.consoleSettings.console)
    return { ...addon.consoleSettings, addon: addon.id, name: entry ? entry.name : addon.id }
  })
// Prefisso della finestra aperta di una console delle estensioni (`openSystem`).
const ADDON_PREFIX = 'addon:'

/** Vero se la bozza delle impostazioni di una console delle estensioni è cambiata. */
function addonChanged(entry) {
  return Boolean(entry && JSON.stringify(entry.draft) !== JSON.stringify(entry.original))
}
// Finestra di una console (lista dei core ed estensioni).
const SYSTEM_SCOPE = 'settingsSystem'

const PATHS = [
  { key: 'paths.roms', label: 'Cartella dei giochi' },
  { key: 'paths.cores', label: 'Cartella dei core di RetroArch' },
  { key: 'paths.thumbnails', label: 'Cartella delle copertine' },
  { key: 'paths.metadata', label: 'Cartella dei metadati' },
  { key: 'paths.appendconfig', label: 'Configurazione aggiuntiva di RetroArch' },
  { key: 'paths.crt_shader', label: 'Shader CRT', placeholder: 'Nessuno' },
]

// Lunghezza massima dei testi scritti con la tastiera a schermo.
const PATH_MAX = 200
const COMMAND_MAX = 200
const EXTENSIONS_MAX = 120
const FILTER_MAX = 40
const RA_KEY_MAX = 64
// Destinazione del testo della tastiera a schermo per la chiave RetroAchievements.
const RA_KEY_TARGET = 'raKey'

const STATUS_LABELS = {
  installed: 'installato',
  downloadable: 'da scaricare',
  missing: 'non disponibile',
}

const DATE_FORMAT = { day: '2-digit', month: '2-digit', year: 'numeric' }

// Valore del campo della chiave RetroAchievements: mai la chiave intera.
function raKeyLabel(ra, busy) {
  if (busy) {
    return 'Controllo…'
  }
  if (!ra) {
    return ''
  }
  return ra.key.set ? `••••••••${ra.key.last4}` : 'Non impostata'
}

// Data dell'elenco dei core come «23/09/2026».
function formatDate(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('it-IT', DATE_FORMAT)
}

// Voci di «Aggiungi da tipologia…»: solo le tipologie con core non ancora in lista.
function typeItems(coreTypes, cores) {
  return coreTypes
    .filter((type) => type.cores.some((core) => !cores.includes(core)))
    .map((type) => {
      const fresh = type.cores.filter((core) => !cores.includes(core)).length
      const total = type.cores.length === 1 ? '1 core' : `${type.cores.length} core`
      return {
        id: type.name,
        label: type.name,
        note: fresh === type.cores.length ? total : `${fresh} nuovi su ${total}`,
        group: type.group,
        search: type.cores.join(' '),
      }
    })
}

// Voci di «Aggiungi core…»: i core disponibili non ancora in lista, per iniziale.
function coreItems(available, cores) {
  return Object.values(available)
    .filter((core) => !cores.includes(core.name))
    .map((core) => ({
      id: core.name,
      label: core.name,
      note: core.installed ? core.label : `${core.label} · da scaricare`,
      group: initialGroup(core.name),
      search: core.types.join(' '),
    }))
}

// Voci del menu «Tema grafico»: casuale, poi gli otto temi.
/** Nota della combinazione di emergenza: 1 secondo se usa il tasto dell'uscita, altrimenti 2. */
/** Nome mostrato del menu rapido, per esempio «Dorsale sinistro + Dorsale destro + START + SELECT». */
function menuLabel(id) {
  const { buttons } = menuComboById(id)
  return buttons.length ? buttons.map((name) => (name === 'down' ? 'Giù' : comboLabel([name]))).join(' + ') : 'Nessuna'
}

function rescueNote(quitCombo, rescueCombo) {
  return rescueHoldMs(quitCombo, rescueCombo) === RESCUE_SHARED_MS
    ? 'Tenuta 1 secondo in partita (usa il tasto dell\'uscita) esce senza salvare il «Riprendi»'
    : 'Tenuta 2 secondi in partita esce senza salvare il «Riprendi»'
}

function themeItems(randomTheme) {
  const current = themeById(randomTheme)
  return [
    { id: RANDOM, label: 'Casuale a ogni avvio', note: current ? `ora: ${current.name}` : '' },
    ...THEMES.map((theme) => ({ id: theme.id, label: theme.name, note: theme.note })),
  ]
}

function themeLabel(id) {
  const theme = themeById(id)
  return theme ? theme.name : 'Casuale a ogni avvio'
}

function modeLabel(id) {
  return (modeById(id) || modeById(SYSTEM)).label
}

const VERTICAL = { up: -1, down: 1 }

// Uscita con modifiche non salvate: B vale «Annulla», all'apertura è evidenziata «Salva modifiche».
const EXIT_CHOICES = [
  { id: 'cancel', label: 'Annulla' },
  { id: 'discard', label: 'Scarta modifiche', tone: 'danger' },
  { id: 'save', label: 'Salva modifiche', tone: 'ok' },
]

/**
 * Schede in alto: una sola visibile alla volta, si cambiano con LB/RB (o
 * [ ]) e col clic. `alerts` sono le schede con un errore da vedere («!»).
 */
function Tabs({ current, alerts, onSelect }) {
  return (
    <div className={styles.tabs} role="tablist">
      {TABS.map((tab) => {
        const active = tab.id === current
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
            {alerts.has(tab.id) && (
              <span className={styles.tabAlert} aria-label="errore">
                !
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <section className={styles.panel}>
      <h2 className={`pix ${styles.heading}`}>{title}</h2>
      {children}
    </section>
  )
}

// Riassunto dei core di una console: «8 core · 7 installati».
function coresLabel(summary) {
  if (!summary.total) {
    return 'Aggiungi dei core'
  }
  const total = summary.total === 1 ? '1 core' : `${summary.total} core`
  const installed = summary.installed === 1 ? '1 installato' : `${summary.installed} installati`
  return `${total} · ${installed}`
}

/**
 * Finestra di una console (livello 40): lista dei core nell'ordine in cui
 * vengono provati, con «Aggiungi…», estensioni dei giochi, «Configurazione…»
 * (pagina con grafica, latenza, audio ed emulazione, salvata subito) e
 * «BIOS…» (file di sistema dei core, src/components/BiosModal.jsx).
 * Ha un proprio ambito di navigazione (`item`, contenitore `scopeRef`); B la
 * chiude (lo gestisce la vista), come il clic fuori dal pannello o su «Chiudi».
 */
function SystemDialog({
  system, available, scopeRef, item, onTypes, onCores, onCoreActions, onRemove, onExtensions, onConfig, onBios, biosState, onClose,
}) {
  const listId = `sys:${system.id}`
  const summary = coreSummary(system.cores, available)
  const biosMissing = system.cores.filter((core) =>
    core in biosState ? biosState[core] : Boolean(available[core] && available[core].biosMissing))
  return (
    <div
      className={styles.modalOverlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section className={styles.modal} role="dialog" aria-label={system.name} ref={scopeRef}>
        <div className={styles.systemHead}>
          <span className={`pix ${styles.systemName}`}>{system.name}</span>
          <span className={styles.count}>{system.count === 1 ? '1 gioco' : `${system.count} giochi`}</span>
          <span className={summary.ready ? `${styles.badge} ${styles.ready}` : styles.badge}>
            {summary.ready ? 'Pronta' : 'Non pronta'}
          </span>
          <span className={styles.count}>{coresLabel(summary)}</span>
          <button type="button" className={styles.modalClose} onClick={onClose}>
            Chiudi
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.cores}>
            <div className={styles.caption}>
              Core, nell’ordine in cui vengono provati: prima gli installati
              {system.coresDefault && <span className={styles.default}>predefinita</span>}
            </div>
            <ItemList
              id={listId}
              items={system.cores}
              item={item}
              muted={(core) => coreStatus(core, available) === 'missing'}
              renderItem={(core) => {
                const status = coreStatus(core, available)
                const label = available[core] ? available[core].label : ''
                return (
                  <span className={styles.core}>
                    <span className={styles.coreName}>{core}</span>
                    {label && label !== core && <span className={styles.coreLabel}>{label}</span>}
                    <span className={`${styles.tag} ${styles[status]}`}>{STATUS_LABELS[status]}</span>
                  </span>
                )
              }}
              actions={[
                { id: 'types', label: 'Aggiungi da tipologia…', onActivate: onTypes },
                { id: 'cores', label: 'Aggiungi core…', onActivate: onCores },
              ]}
              onActivateItem={onCoreActions}
              onRemove={onRemove}
            />
          </div>
          <div className={styles.side}>
            <TextField
              label="Estensioni dei giochi"
              value={system.extensions}
              placeholder={suggestedExtensions(system, available) || 'Tutti i file'}
              note={system.extensions ? 'Vuoto = predefinite' : system.defaultExtensions ? 'Predefinite del sistema' : 'Dai core della lista'}
              focus={item(`${listId}:ext`, onExtensions)}
            />
            <TextField
              label="Configurazione…"
              value="Grafica, latenza, audio, emulazione"
              note="Livelli e opzioni di RetroArch e dei core · si salva subito"
              focus={item(`${listId}:config`, onConfig)}
            />
            <TextField
              label="BIOS…"
              value={biosMissing.length ? `Manca un BIOS a ${biosMissing.join(', ')}` : 'File di sistema dei core'}
              note="Scegli il file dove si trova: la dashboard lo copia e lo configura"
              focus={item(`${listId}:bios`, onBios)}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

const NO_SUBSCRIBE = () => () => {}
const NO_SNAPSHOT = () => null

/**
 * Finestra di una console delle estensioni (livello 40): le voci di
 * `entry.fields(values, ctx, stato)` (`{id, label, value, note, onActivate}`)
 * come campi, con lo stesso ambito di navigazione della finestra delle
 * console. Lo stato viene da `entry.subscribe`/`entry.getSnapshot`, se ci
 * sono. B la chiude.
 */
function AddonConsoleDialog({ entry, values, ctx, scopeRef, item, onClose }) {
  const live = useSyncExternalStore(entry.subscribe || NO_SUBSCRIBE, entry.getSnapshot || NO_SNAPSHOT)
  const fields = entry.fields(values, ctx, live)
  return (
    <div
      className={styles.modalOverlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section className={styles.modal} role="dialog" aria-label={entry.name} ref={scopeRef}>
        <div className={styles.systemHead}>
          <span className={`pix ${styles.systemName}`}>{entry.name}</span>
          <button type="button" className={styles.modalClose} onClick={onClose}>
            Chiudi
          </button>
        </div>
        <div className={styles.fields}>
          {fields.map((field) => (
            <TextField
              key={field.id}
              label={field.label}
              value={field.value}
              note={field.note}
              focus={item(`${ADDON_PREFIX}${entry.addon}:${field.id}`, field.onActivate)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

/**
 * Vista Impostazioni (README §G, sprint 04 e 04b): percorsi, core,
 * estensioni per console, tasti del joypad e RetroArch, su una bozza salvata
 * solo con «Salva». I pannelli stanno in cinque schede (Aspetto, Console,
 * Playlist, Joypad, Configurazioni) che si cambiano con LB/RB; le playlist
 * (src/views/SettingsPlaylists.jsx) si salvano subito, fuori dalla bozza; si parte da Aspetto e
 * i pulsanti Aggiorna libreria, Annulla e Salva restano sempre in vista. Si comanda col joypad (navigazione spaziale), con la
 * tastiera (stessi tasti logici) e col mouse (clic sugli elementi).
 *
 * I core di ogni console sono nell'ordine automatico; si aggiungono per
 * tipologia o uno per uno dai menu a selezione multipla (`multi`), con la
 * ricerca scritta nella tastiera a schermo (`purpose: 'filter'`, testo in
 * `state.pickerFilter`).
 *
 * Le console sono un elenco compatto: A su una riga apre la sua finestra
 * (`SystemDialog`) con i core e le estensioni; «Elimina core inutilizzati»
 * sta subito sotto l'elenco. In coda ci sono le console delle estensioni con
 * `consoleSettings` (`AddonConsoleDialog`): le loro impostazioni stanno in una
 * bozza a parte e si salvano anche loro con «Salva».
 *
 * Gli eventi di input arrivano da App tramite `inputRef.current(event)`,
 * con priorità: apprendimento dei tasti, conferma, menu a comparsa,
 * finestra della console, vista.
 * `gamepad` serve all'apprendimento dei tasti; `onContext(nome)` indica ad
 * App la legenda della barra comandi (`settings`, `system`, `picker`,
 * `multipicker`, `confirm`, `exitSettings`, `learn`, `playlist`, `filters`, `filterMenu`,
 * `tournament`, `tournamentCombo`, `tournamentDate`, `tournamentGame`, `tournamentFormat`,
 * `tournamentFormatOptions`).
 */
export default function Settings({ inputRef, gamepad, onContext }) {
  const { state, dispatch, loadSettings, saveSettings, rescanLibrary, refreshCores } = useApp()
  const scope = useFocusScope(SCOPE)
  const systemScope = useFocusScope(SYSTEM_SCOPE)
  const [tab, setTab] = useState(SETTINGS_TABS[0].id)
  const [openSystem, setOpenSystem] = useState(null)
  const [picker, setPicker] = useState(null)
  const [multi, setMulti] = useState(null)
  const [confirm, setConfirm] = useState(null)
  // Apprendimento della combinazione dei salvataggi in partita.
  const [comboLearning, setComboLearning] = useState(false)
  // Configurazione di un joypad: i tasti li legge il backend, quelli di Chrome si ignorano.
  const [padSetup, setPadSetup] = useState(false)
  const padInput = useRef(null)
  // Pagina «Configurazione» della console aperta nella sua finestra (id della console).
  const [configFor, setConfigFor] = useState(null)
  const [configContext, setConfigContext] = useState('config')
  const configInput = useRef(null)
  // Pagina «BIOS» della console aperta nella sua finestra (id della console).
  const [biosFor, setBiosFor] = useState(null)
  const [biosContext, setBiosContext] = useState('bios')
  const biosInput = useRef(null)
  // BIOS mancanti per core letti dall'ultima pagina «BIOS» (src/lib/bios.js, `missingCores`).
  const [biosState, setBiosState] = useState({})
  const [busy, setBusy] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const rows = useRef(new Map())
  const playlists = usePlaylistSettings({ scope, scopeName: SCOPE, ask: setConfirm, choose: setPicker })
  const tournament = useTournamentSettings({
    scope, scopeName: SCOPE, ask: setConfirm, choose: setPicker, active: tab === 'tournament',
  })
  // Scheda di un'estensione: eventi della sua finestra, legenda ed elemento dove porta le finestre.
  const addonInput = useRef(null)
  const [addonMode, setAddonMode] = useState(null)
  const [overlayHost, setOverlayHost] = useState(null)
  const addonTab = ADDON_TABS.find((entry) => entry.id === tab) || null
  const { settings } = state
  const ready = Boolean(settings && settings.status === 'ready')
  // Bozze delle console delle estensioni: `{addon: {original, draft}}`.
  const [addonDrafts, setAddonDrafts] = useState({})
  const addonDirty = CONSOLE_SETTINGS.some((entry) => addonChanged(addonDrafts[entry.addon]))
  const dirty = isDirty(settings) || addonDirty

  useEffect(() => {
    let alive = true
    for (const entry of CONSOLE_SETTINGS) {
      entry
        .load(api.request)
        .then((values) => alive && setAddonDrafts((current) => ({ ...current, [entry.addon]: { original: values, draft: values } })))
        .catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Sulla prima voce della scheda la vista torna in cima: titolo e schede restano visibili
  // (non sono selezionabili, lo scorrimento verso la voce da solo li lascerebbe fuori).
  const focused = state.focus[SCOPE]
  useEffect(() => {
    const container = scope.ref.current
    const first = container ? container.querySelector('[data-focus-id]') : null
    if (first && first.dataset.focusId === focused) {
      container.scrollIntoView({ block: 'start' })
    }
  }, [focused, scope.ref])

  // RetroAchievements: stato della chiave Web API (mai la chiave intera, solo gli ultimi 4 caratteri).
  const [ra, setRa] = useState(null)
  const [raEditing, setRaEditing] = useState(false)
  const [raBusy, setRaBusy] = useState(false)
  useEffect(() => {
    let alive = true
    api
      .raStatus()
      .then((data) => alive && setRa(data))
      .catch(() => alive && setRa({ key: { set: false, last4: null }, accounts: {}, error: true }))
    return () => {
      alive = false
    }
  }, [])

  // Tastiera chiusa: con la conferma la chiave si prova su RetroAchievements e si salva.
  const keyboardText = state.keyboardText
  const keyboardOpen = Boolean(state.osk)
  useEffect(() => {
    if (!raEditing || keyboardOpen) {
      return
    }
    setRaEditing(false)
    if (!keyboardText || !keyboardText.target || keyboardText.target.kind !== RA_KEY_TARGET) {
      return
    }
    const value = keyboardText.value.trim()
    if (!value) {
      return
    }
    setRaBusy(true)
    api
      .raSetKey(value)
      .then((data) => {
        setRa((current) => ({ ...current, key: data.key, error: false }))
        dispatch(showToast('Chiave RetroAchievements salvata.'))
      })
      .catch((error) => dispatch(showToast(error.message, 'error')))
      .finally(() => setRaBusy(false))
  }, [raEditing, keyboardOpen, keyboardText, dispatch])

  const editRaKey = () => {
    if (raBusy || state.osk) {
      return
    }
    setRaEditing(true)
    dispatch(openKeyboard('text', {
      max: RA_KEY_MAX,
      title: 'Chiave Web API RetroAchievements',
      placeholder: 'Incolla o scrivi la chiave',
      target: { kind: RA_KEY_TARGET },
    }))
  }

  const removeRaKey = () => {
    if (raBusy) {
      return
    }
    setRaBusy(true)
    api
      .raRemoveKey()
      .then((data) => {
        setRa((current) => ({ ...current, key: data.key }))
        dispatch(showToast('Chiave RetroAchievements rimossa.'))
      })
      .catch((error) => dispatch(showToast(error.message, 'error')))
      .finally(() => setRaBusy(false))
  }

  let mode = 'settings'
  if (biosFor) {
    mode = biosContext
  } else if (configFor) {
    mode = configContext
  } else if (padSetup) {
    mode = 'padSetup'
  } else if (comboLearning) {
    mode = 'learn'
  } else if (confirm) {
    mode = confirm.legend || 'confirm'
  } else if (multi) {
    mode = 'multipicker'
  } else if (picker) {
    mode = 'picker'
  } else if (playlists.mode) {
    mode = playlists.mode
  } else if (tournament.mode) {
    mode = tournament.mode
  } else if (addonMode) {
    mode = addonMode
  } else if (openSystem) {
    mode = openSystem.startsWith(ADDON_PREFIX) ? 'consoleSettings' : 'system'
  }
  useEffect(() => {
    onContext(mode)
  }, [mode, onContext])

  const focusOn = (id) => dispatch(setFocus(SYSTEM_SCOPE, id))

  // Chiude la pagina «Configurazione» e riporta il focus sulla sua voce nella finestra della console.
  const closeConfig = () => {
    const id = configFor
    setConfigFor(null)
    if (id) {
      dispatch(setFocus(SYSTEM_SCOPE, `sys:${id}:config`))
    }
  }

  // Chiude la pagina «BIOS», ricorda i BIOS mancanti e riporta il focus sulla sua voce.
  const closeBios = (page) => {
    const id = biosFor
    setBiosFor(null)
    setBiosState((current) => ({ ...current, ...missingCores(page) }))
    if (id) {
      dispatch(setFocus(SYSTEM_SCOPE, `sys:${id}:bios`))
    }
  }

  // Cambio di scheda: il focus va sulla prima voce della nuova scheda.
  const showTab = (id) => {
    if (id !== tab) {
      setTab(id)
      dispatch(setFocus(SCOPE, null))
    }
  }

  const showSystem = (id) => {
    dispatch(setFocus(SYSTEM_SCOPE, null))
    setOpenSystem(id)
  }

  // Chiude la finestra della console e riporta il focus sulla sua riga.
  const closeSystem = () => {
    const id = openSystem
    setOpenSystem(null)
    dispatch(setFocus(SCOPE, `sys:${id}`))
  }

  const coresOf = (id) => {
    const system = settings.draft.systems.find((entry) => entry.id === id)
    return system ? system.cores : []
  }

  // Toglie il core e porta il focus sul core successivo, sul precedente o sulla prima voce «Aggiungi…».
  const removeCore = (id, core) => {
    const cores = coresOf(id)
    const at = cores.indexOf(core)
    const next = cores[at + 1] || cores[at - 1]
    dispatch(coreRemove(id, core))
    focusOn(next ? `sys:${id}:item:${next}` : `sys:${id}:action:types`)
  }

  // Tema grafico: si vede subito, si salva con «Salva».
  const chooseTheme = () => {
    const items = themeItems(state.randomTheme)
    setPicker({
      title: 'TEMA GRAFICO',
      items,
      index: Math.max(0, items.findIndex((item) => item.id === settings.draft.settings['ui.theme'])),
      empty: '',
      onPick: (entry) => dispatch(settingsChange('ui.theme', entry.id)),
    })
  }

  // Modalità giorno/notte: come il tema, si vede subito e si salva con «Salva».
  const chooseMode = () => {
    setPicker({
      title: 'MODALITÀ',
      items: MODES,
      index: Math.max(0, MODES.findIndex((mode) => mode.id === (settings.draft.settings['ui.mode'] || SYSTEM))),
      empty: '',
      onPick: (entry) => dispatch(settingsChange('ui.mode', entry.id)),
    })
  }

  // Attesa del salvaschermo: vale dopo «Salva».
  const chooseScreensaver = () => {
    const items = SCREENSAVER_MINUTES.map((minutes) => ({ id: String(minutes), label: minutesLabel(minutes) }))
    const current = settings.draft.settings['ui.screensaver_minutes'] ?? DEFAULT_MINUTES
    setPicker({
      title: 'SALVASCHERMO',
      items,
      index: Math.max(0, SCREENSAVER_MINUTES.indexOf(current)),
      empty: '',
      onPick: (entry) => dispatch(settingsChange('ui.screensaver_minutes', Number(entry.id))),
    })
  }

  // Contenuto del salvaschermo: vale dopo «Salva».
  const chooseScreensaverContent = () => {
    const current = settings.draft.settings['ui.screensaver_content'] ?? DEFAULT_CONTENT
    setPicker({
      title: 'CONTENUTO DEL SALVASCHERMO',
      items: SCREENSAVER_CONTENT,
      index: Math.max(0, SCREENSAVER_CONTENT.findIndex((item) => item.id === current)),
      empty: '',
      onPick: (entry) => dispatch(settingsChange('ui.screensaver_content', entry.id)),
    })
  }

  // Attesa prima che escano i profili e torni «PRESS START»: vale dopo «Salva».
  const chooseLogout = () => {
    const items = LOGOUT_MINUTES.map((minutes) => ({ id: String(minutes), label: minutesLabel(minutes) }))
    const current = settings.draft.settings['ui.logout_minutes'] ?? DEFAULT_LOGOUT
    setPicker({
      title: 'USCITA DEI PROFILI',
      items,
      index: Math.max(0, LOGOUT_MINUTES.indexOf(current)),
      empty: '',
      onPick: (entry) => dispatch(settingsChange('ui.logout_minutes', Number(entry.id))),
    })
  }

  // Volume di effetti o musica: si sente subito, si salva con «Salva».
  const chooseVolume = (key, title) => {
    const current = settings.draft.settings[key] ?? DEFAULT_SOUND[key === 'ui.sound_music' ? 'music' : 'effects']
    setPicker({
      title,
      items: VOLUMES.map((volume) => ({ id: String(volume), label: volumeLabel(volume) })),
      index: Math.max(0, VOLUMES.indexOf(current)),
      empty: '',
      onPick: (entry) => dispatch(settingsChange(key, Number(entry.id))),
    })
  }

  // Uscita dal gioco: vale dalla prossima partita, dopo «Salva». Con un tasto della
  // combinazione di emergenza, l'emergenza si tiene 1 secondo (src/input/rescueCombo.js).
  const chooseQuit = () => {
    const current = settings.draft.settings
    setPicker({
      title: 'USCITA DAL GIOCO',
      items: QUIT_COMBOS,
      index: Math.max(0, QUIT_COMBOS.findIndex((combo) => combo.id === quitComboById(current['input.quit_combo']).id)),
      empty: '',
      onPick: (entry) => {
        dispatch(settingsChange('input.quit_combo', entry.id))
      },
    })
  }

  // Menu rapido di RetroArch: vale dalla prossima partita, dopo «Salva». Il backend rifiuta
  // le combinazioni che si scontrano con l'uscita, i salvataggi o l'emergenza.
  const chooseMenu = () => {
    const current = settings.draft.settings
    setPicker({
      title: 'MENU RAPIDO',
      items: MENU_COMBOS.map((combo) => ({ ...combo, label: menuLabel(combo.id) })),
      index: Math.max(0, MENU_COMBOS.findIndex((combo) => combo.id === menuComboById(current['input.menu_combo']).id)),
      empty: '',
      onPick: (entry) => {
        dispatch(settingsChange('input.menu_combo', entry.id))
      },
    })
  }

  const coreActions = (system, core) => {
    setPicker({
      title: core.toUpperCase(),
      items: [{ id: 'remove', label: 'Togli dalla lista' }],
      index: 0,
      empty: '',
      onPick: () => removeCore(system.id, core),
    })
  }

  const openMulti = (system, kind) => {
    const byType = kind === 'types'
    dispatch(setPickerFilter(''))
    setMulti({
      system: system.id,
      kind,
      title: `${byType ? 'AGGIUNGI DA TIPOLOGIA' : 'AGGIUNGI CORE'} · ${system.name}`,
      items: byType ? typeItems(settings.coreTypes, system.cores) : coreItems(settings.available, system.cores),
      selected: [],
      cursor: ALL,
      placeholder: byType ? 'Nome della tipologia o di un core' : 'Nome, descrizione o tipologia del core',
      empty: byType
        ? 'Nessuna tipologia con core da aggiungere. Aggiorna l’elenco dei core nella scheda Configurazioni.'
        : 'Nessun core da aggiungere. Controlla la cartella dei core o aggiorna l’elenco dei core nella scheda Configurazioni.',
    })
  }

  const closeMulti = () => {
    setMulti(null)
    dispatch(setPickerFilter(''))
  }

  const confirmMulti = () => {
    if (!multi.selected.length) {
      return
    }
    let cores = multi.selected
    if (multi.kind === 'types') {
      const types = new Map(settings.coreTypes.map((type) => [type.name, type.cores]))
      cores = multi.selected.flatMap((name) => types.get(name) || [])
    }
    dispatch(coresAdd(multi.system, cores))
    closeMulti()
    const known = settings.available
    const needs = [...new Set(cores)].filter((core) =>
      core in biosState ? biosState[core] : Boolean(known[core] && known[core].biosMissing))
    if (needs.length) {
      dispatch(showToast(`${needs.join(', ')}: manca un BIOS obbligatorio. Aggiungilo da «BIOS…» in questa finestra.`, 'info', true))
    }
  }

  const openFilter = () => {
    if (!state.osk) {
      dispatch(openKeyboard('filter', {
        value: state.pickerFilter,
        max: FILTER_MAX,
        position: 'left',
        title: 'Cerca',
        placeholder: multi.placeholder,
      }))
    }
  }

  const openField = (target, value, { title, max, placeholder = null }) => {
    dispatch(openKeyboard('field', { value: value === null || value === undefined ? '' : String(value), max, title, placeholder, target }))
  }

  // Salvataggio della bozza: `{saved, error}` (vedi AppContext), `saved: false` se non si può salvare ora.
  // Poi le bozze cambiate delle console delle estensioni; se è cambiata solo una di loro, solo quella.
  const save = async () => {
    if (!ready || settings.saving) {
      return { saved: false }
    }
    const changed = CONSOLE_SETTINGS.filter((entry) => addonChanged(addonDrafts[entry.addon]))
    const main = isDirty(settings) || !changed.length
    if (main) {
      const result = await saveSettings(settingsPayload(settings))
      if (!result.saved) {
        return result
      }
    }
    for (const entry of changed) {
      try {
        const values = await entry.save(api.request, addonDrafts[entry.addon].draft)
        setAddonDrafts((current) => ({ ...current, [entry.addon]: { original: values, draft: values } }))
      } catch (error) {
        dispatch(showToast(error.message, 'error'))
        return { saved: false, error: error.message }
      }
    }
    if (!main) {
      dispatch(showToast('Impostazioni salvate.'))
    }
    return { saved: true }
  }

  // Risposta alla finestra d'uscita: si torna alla libreria scartando o dopo un salvataggio riuscito.
  const leave = async (choice) => {
    if (choice === 'discard') {
      dispatch(closeSettings())
      return
    }
    if (choice !== 'save') {
      return
    }
    const result = await save()
    if (result.saved) {
      dispatch(closeSettings())
    } else if (result.error) {
      dispatch(showToast(result.error, 'error'))
    }
  }

  const close = () => {
    if (dirty) {
      setConfirm({
        text: 'Ci sono modifiche non salvate.',
        choices: EXIT_CHOICES,
        choice: 'save',
        cancel: 'cancel',
        legend: 'exitSettings',
        onAnswer: leave,
      })
    } else {
      dispatch(closeSettings())
    }
  }

  const rescan = async () => {
    if (busy) {
      return
    }
    setBusy(true)
    try {
      await rescanLibrary()
    } finally {
      setBusy(false)
    }
  }

  // «Elimina core inutilizzati»: elenco dal backend, conferma con core e spazio, poi cancellazione.
  const cleanCores = async () => {
    if (cleaning || state.run.running) {
      return
    }
    setCleaning(true)
    try {
      const data = await api.unusedCores()
      if (!data.cores.length) {
        dispatch(showToast('Nessun core inutilizzato da eliminare.'))
        return
      }
      const names = data.cores.map((core) => core.name).join(', ')
      const count = data.cores.length === 1 ? '1 core inutilizzato' : `${data.cores.length} core inutilizzati`
      setConfirm({
        text: `Eliminare ${count} (${formatSize(data.total)})? ${names}`,
        choice: 'no',
        onYes: async () => {
          try {
            await api.deleteUnusedCores()
            await rescanLibrary()
            dispatch(showToast(`Core eliminati: ${names}`))
          } catch (error) {
            dispatch(showToast(error.message, 'error'))
          }
        },
      })
    } catch (error) {
      dispatch(showToast(error.message, 'error'))
    } finally {
      setCleaning(false)
    }
  }

  // Risposta alla finestra di conferma: `onAnswer(scelta)` se c'è, altrimenti `onYes` per Sì.
  const answer = (choice) => {
    const current = confirm
    setConfirm(null)
    if (!current) {
      return
    }
    if (current.onAnswer) {
      current.onAnswer(choice)
    } else if (choice === 'yes') {
      current.onYes()
    }
  }

  const pick = (index) => {
    const current = picker
    setPicker(null)
    const entry = current && current.items[index]
    if (entry) {
      current.onPick(entry)
    }
  }

  const handle = (event) => {
    if (event.kind === 'release') {
      return
    }
    const press = event.kind === 'press'
    if (biosFor) {
      if (biosInput.current) {
        biosInput.current(event)
      } else if (press && event.button === 'b') {
        setBiosFor(null)
      }
      return
    }
    if (configFor) {
      if (configInput.current) {
        configInput.current(event)
      } else if (press && event.button === 'b') {
        setConfigFor(null)
      }
      return
    }
    if (padSetup) {
      // I tasti del joypad li legge la configurazione (src/components/JoypadList.jsx); Esc annulla.
      if (padInput.current) {
        padInput.current(event)
      }
      return
    }
    if (comboLearning) {
      // Dal joypad si annulla tenendo premuto B (ComboLearn); qui Esc o il clic.
      if (press && event.button === 'b' && event.source !== 'pad') {
        setComboLearning(false)
      }
      return
    }
    if (confirm) {
      const choice = moveChoice(confirm.choices || YES_NO, confirm.choice, event.button, wraps(event))
      if (choice !== confirm.choice) {
        setConfirm({ ...confirm, choice })
      } else if (press && event.button === 'a') {
        answer(confirm.choice)
      } else if (press && event.button === 'b') {
        answer(confirm.cancel || 'no')
      }
      return
    }
    if (multi) {
      const visible = filterItems(multi.items, state.pickerFilter)
      const cursor = keepCursor(visible, multi.cursor)
      if (VERTICAL[event.button]) {
        setMulti({ ...multi, cursor: moveCursor(visible, cursor, VERTICAL[event.button], wraps(event)) })
      } else if (press && event.button === 'a') {
        const selected = cursor === ALL ? toggleAll(multi.selected, visible) : toggle(multi.selected, cursor)
        setMulti({ ...multi, cursor, selected })
      } else if (press && event.button === 'y') {
        setMulti({ ...multi, cursor, selected: toggleAll(multi.selected, visible) })
      } else if (press && (event.button === 'lb' || event.button === 'rb')) {
        setMulti({ ...multi, cursor: jumpGroup(visible, cursor, event.button === 'lb' ? -1 : 1, true) })
      } else if (press && event.button === 'x') {
        openFilter()
      } else if (press && event.button === 'start') {
        confirmMulti()
      } else if (press && event.button === 'b') {
        closeMulti()
      }
      return
    }
    if (picker) {
      if (VERTICAL[event.button] && picker.items.length) {
        const index = stepIndex(picker.index, VERTICAL[event.button], picker.items.length, wraps(event))
        setPicker({ ...picker, index })
      } else if (press && event.button === 'a') {
        pick(picker.index)
      } else if (press && event.button === 'b') {
        setPicker(null)
      }
      return
    }
    if (playlists.handle(event)) {
      return
    }
    if (tournament.handle(event)) {
      return
    }
    if (addonInput.current && addonInput.current(event)) {
      return
    }
    if (!ready) {
      if (settingsCommand(event, false)) {
        dispatch(closeSettings())
      }
      return
    }
    if (openSystem) {
      if (systemScope.handle(event) || !press) {
        return
      }
      if (event.button === 'b' || event.button === 'select') {
        closeSystem()
        return
      }
      const row = rows.current.get(systemScope.focused)
      if (row && event.button === 'x') {
        removeCore(row.system, row.core)
      }
      return
    }
    if (scope.handle(event) || !press) {
      return
    }
    if (event.button === 'lb' || event.button === 'rb') {
      showTab(stepTab(tab, event.button === 'lb' ? -1 : 1, TABS))
      return
    }
    const command = settingsCommand(event, dirty)
    if (command === 'close') {
      dispatch(closeSettings())
      return
    }
    if (command === 'confirm') {
      close()
    }
  }

  useEffect(() => {
    inputRef.current = handle
  })

  useEffect(() => () => {
    inputRef.current = null
  }, [inputRef])

  if (!settings || settings.status === 'loading') {
    return <div className={styles.message}>Caricamento delle impostazioni…</div>
  }
  if (settings.status === 'error') {
    return (
      <div className={styles.message}>
        <div className={styles.messageTitle}>Impostazioni non disponibili</div>
        <div className={styles.messageText}>{settings.error}</div>
      </div>
    )
  }

  const { draft, available, coreIndex, retroarch, cpu } = settings
  const values = draft.settings
  const indexError = settings.refreshError || coreIndex.error
  const multiVisible = multi ? filterItems(multi.items, state.pickerFilter) : []
  const alerts = new Set(indexError || !retroarch.quitCombo ? ['config'] : [])
  rows.current = new Map()

  const modalSystem = openSystem ? draft.systems.find((system) => system.id === openSystem) : null
  const modalAddon = openSystem && openSystem.startsWith(ADDON_PREFIX)
    ? CONSOLE_SETTINGS.find((entry) => `${ADDON_PREFIX}${entry.addon}` === openSystem) || null
    : null
  const addonValues = modalAddon && addonDrafts[modalAddon.addon]
  const addonCtx = modalAddon && {
    change: (patch) => setAddonDrafts((current) => {
      const entry = current[modalAddon.addon]
      return { ...current, [modalAddon.addon]: { ...entry, draft: { ...entry.draft, ...patch } } }
    }),
    choose: setPicker,
    ask: ({ text, onYes }) => setConfirm({ text, choice: 'no', onYes }),
    request: api.request,
    toast: (message, variant) => dispatch(showToast(message, variant)),
  }
  if (modalSystem) {
    const listId = `sys:${modalSystem.id}`
    modalSystem.cores.forEach((core) => rows.current.set(`${listId}:item:${core}`, { system: modalSystem.id, core }))
  }

  return (
    <>
      <div className={styles.settings} ref={scope.ref}>
        <div className={styles.top}>
          <h1 className={`pix ${styles.title}`}>IMPOSTAZIONI</h1>
          {dirty && <span className={styles.dirty}>Modifiche non salvate</span>}
        </div>
        <Tabs current={tab} alerts={alerts} onSelect={showTab} />

        {tab === 'look' && (
          <Panel title="ASPETTO">
            <div className={styles.fields}>
              <TextField
                label="Tema grafico"
                value={themeLabel(values['ui.theme'])}
                note="Sfondo, colori e disegni della dashboard"
                focus={scope.item('ui:theme', chooseTheme)}
              />
              <TextField
                label="Modalità"
                value={modeLabel(values['ui.mode'])}
                note="Giorno con colori chiari, notte con colori scuri"
                focus={scope.item('ui:mode', chooseMode)}
              />
              <TextField
                label="Salvaschermo"
                value={minutesLabel(values['ui.screensaver_minutes'] ?? DEFAULT_MINUTES)}
                note="Dopo quanto tempo senza comandi parte, nella libreria, nel profilo e su «PRESS START»"
                focus={scope.item('ui:screensaver', chooseScreensaver)}
              />
              <TextField
                label="Contenuto del salvaschermo"
                value={contentLabel(values['ui.screensaver_content'] ?? DEFAULT_CONTENT)}
                note="Copertine, partite dei profili rigiocate o tutte e due (una partita ogni 2 minuti)"
                focus={scope.item('ui:screensaver_content', chooseScreensaverContent)}
              />
              <TextField
                label="Pubblicità dei tornei"
                value={(values['ui.tournament_ads'] ?? true) ? 'Sì' : 'No'}
                note="Con un torneo di oggi il salvaschermo mostra il suo manifesto · Conferma per cambiare"
                focus={scope.item('ui:tournament_ads', () => dispatch(settingsChange('ui.tournament_ads',
                  !(values['ui.tournament_ads'] ?? true))))}
              />
              <TextField
                label="Uscita dei profili"
                value={minutesLabel(values['ui.logout_minutes'] ?? DEFAULT_LOGOUT)}
                note="Dopo quanto tempo senza comandi escono tutti e torna «PRESS START», fuori dalle partite"
                focus={scope.item('ui:logout', chooseLogout)}
              />
            </div>
          </Panel>
        )}
        {tab === 'look' && (
          <Panel title="SUONI">
            <div className={styles.fields}>
              <TextField
                label="Suoni"
                value={(values['ui.sound'] ?? DEFAULT_SOUND.on) ? 'Sì' : 'No'}
                note="Effetti e musica chiptune della dashboard, mai durante le partite · Conferma per cambiare"
                focus={scope.item('ui:sound', () => dispatch(settingsChange('ui.sound', !(values['ui.sound'] ?? DEFAULT_SOUND.on))))}
              />
              <TextField
                label="Volume effetti"
                value={volumeLabel(values['ui.sound_effects'] ?? DEFAULT_SOUND.effects)}
                note="Movimenti, conferme, preferiti, avvio dei giochi"
                focus={scope.item('ui:effects', () => chooseVolume('ui.sound_effects', 'VOLUME EFFETTI'))}
              />
              <TextField
                label="Volume musica"
                value={volumeLabel(values['ui.sound_music'] ?? DEFAULT_SOUND.music)}
                note="Un brano diverso per ogni console, uno per il Wrapped"
                focus={scope.item('ui:music', () => chooseVolume('ui.sound_music', 'VOLUME MUSICA'))}
              />
            </div>
          </Panel>
        )}
        {tab === 'look' && (
          <Panel title="WRAPPED DI CASA">
            <WrappedPeriods
              account={null}
              item={scope.item}
              autofocus={false}
              empty="Ancora nessun Wrapped di casa: arriva a fine mese, dopo almeno 3 partite dei profili."
            />
          </Panel>
        )}

        {tab === 'systems' && (
          <Panel title="CONSOLE">
            {draft.systems.length === 0 && <p className={styles.empty}>Nessuna console nella cartella dei giochi.</p>}
            <div className={styles.systems}>
              {draft.systems.map((system) => {
                const summary = coreSummary(system.cores, available)
                return (
                  <button key={system.id} type="button" className={styles.systemRow} {...scope.item(`sys:${system.id}`, () => showSystem(system.id))}>
                    <span className={`pix ${styles.systemName}`}>{system.name}</span>
                    <span className={styles.count}>{system.count === 1 ? '1 gioco' : `${system.count} giochi`}</span>
                    <span className={summary.ready ? `${styles.badge} ${styles.ready}` : styles.badge}>
                      {summary.ready ? 'Pronta' : 'Non pronta'}
                    </span>
                    <span className={styles.count}>{coresLabel(summary)}</span>
                    <span className={styles.open} aria-hidden="true">▸</span>
                  </button>
                )
              })}
              {CONSOLE_SETTINGS.map((entry) => {
                const values = addonDrafts[entry.addon]
                return (
                  <button
                    key={entry.addon}
                    type="button"
                    className={styles.systemRow}
                    {...scope.item(`sys:${ADDON_PREFIX}${entry.addon}`, () => values && showSystem(`${ADDON_PREFIX}${entry.addon}`))}
                  >
                    <span className={`pix ${styles.systemName}`}>{entry.name}</span>
                    <span className={styles.count}>{values ? entry.summary(values.draft) : 'Caricamento…'}</span>
                    <span className={styles.open} aria-hidden="true">▸</span>
                  </button>
                )
              })}
            </div>
            <div className={styles.coreIndex}>
              <span className={styles.coreIndexText}>
                Core scaricati dalla dashboard e non usati da nessun gioco. I core installati da RetroArch non vengono mai toccati.
              </span>
              <button
                type="button"
                className={styles.action}
                disabled={state.run.running}
                {...scope.item('sys:unused', cleanCores)}
              >
                {cleaning ? 'Controllo…' : 'Elimina core inutilizzati'}
              </button>
            </div>
          </Panel>
        )}

        {tab === 'playlists' && <Panel title="PLAYLIST">{playlists.panel}</Panel>}

        {tab === 'tournament' && <Panel title="TORNEI">{tournament.panel}</Panel>}
        {tab === 'tournament' && tournament.history && <Panel title="CONCLUSI">{tournament.history}</Panel>}

        {addonTab && (
          <Panel title={addonTab.title || addonTab.label.toUpperCase()}>
            <addonTab.Tab
              key={addonTab.id}
              scope={scope}
              ask={setConfirm}
              choose={setPicker}
              inputRef={addonInput}
              onMode={setAddonMode}
              overlayHost={overlayHost}
            />
          </Panel>
        )}

        {tab === 'pad' && (
          <Panel title="JOYPAD">
            <div className={`${styles.fields} ${styles.comboField}`}>
              <TextField
                label="Uscita dal gioco"
                value={quitComboById(values['input.quit_combo']).label}
                note="Chiude RetroArch e torna alla libreria · Conferma per cambiarla"
                focus={scope.item('pad:quit', chooseQuit)}
              />
              <TextField
                label="Menu rapido"
                value={menuLabel(values['input.menu_combo'])}
                note="Apre il menu di RetroArch durante la partita · Conferma per cambiarla"
                focus={scope.item('pad:menu', chooseMenu)}
              />
              <TextField
                label="Combinazione salvataggi"
                value={comboLabel(values['input.save_combo'])}
                note="In partita apre i salvataggi di chi la preme · Conferma per cambiarla"
                focus={scope.item('pad:combo', () => setComboLearning('save'))}
              />
              <TextField
                label="Combinazione di emergenza"
                value={comboLabel(values['input.rescue_combo'])}
                note={`${rescueNote(values['input.quit_combo'], values['input.rescue_combo'])} · Conferma per cambiarla`}
                focus={scope.item('pad:rescue', () => setComboLearning('rescue'))}
              />
            </div>
            {comboLearning === 'save' && (
              <ComboLearn
                padButtons={state.padButtons}
                gamepad={gamepad}
                check={(combo) => (sameCombo(combo, values['input.rescue_combo']) ? 'Questa è già la combinazione di emergenza: scegline un\'altra.' : null)}
                onDone={(combo) => {
                  setComboLearning(false)
                  gamepad.lockUntilReleased()
                  dispatch(settingsChange('input.save_combo', combo))
                }}
                onCancel={() => setComboLearning(false)}
              />
            )}
            {comboLearning === 'rescue' && (
              <ComboLearn
                padButtons={state.padButtons}
                gamepad={gamepad}
                title="COMBINAZIONE DI EMERGENZA"
                prompt="Tieni premuti insieme i due tasti che, tenuti 2 secondi (1 se usano il tasto dell'uscita), chiuderanno un gioco bloccato senza salvare"
                check={(combo) => rescueComboError(combo, values['input.save_combo'])}
                onDone={(combo) => {
                  setComboLearning(false)
                  gamepad.lockUntilReleased()
                  dispatch(settingsChange('input.rescue_combo', combo))
                }}
                onCancel={() => setComboLearning(false)}
              />
            )}
          </Panel>
        )}
        {tab === 'pad' && (
          <Panel title="TASTI DEI JOYPAD">
            <JoypadList
              item={scope.item}
              gamepad={gamepad}
              padButtons={state.padButtons}
              inputRef={padInput}
              onSetup={setPadSetup}
              onSaved={(padButtons) => dispatch(padButtonsSaved(padButtons))}
              notify={(text, kind) => dispatch(showToast(text, kind))}
            />
          </Panel>
        )}

        {tab === 'config' && (
          <>
            <Panel title="PERCORSI">
              <div className={styles.fields}>
                {PATHS.map((path) => (
                  <TextField
                    key={path.key}
                    label={path.label}
                    value={values[path.key]}
                    placeholder={path.placeholder}
                    focus={scope.item(`path:${path.key}`, () =>
                      openField({ kind: 'setting', key: path.key }, values[path.key], { title: path.label, max: PATH_MAX, placeholder: path.placeholder }),
                    )}
                  />
                ))}
              </div>
            </Panel>

            <Panel title="RETROACHIEVEMENTS">
              <div className={styles.fields}>
                <TextField
                  label="Chiave Web API"
                  value={raKeyLabel(ra, raBusy)}
                  note="Da retroachievements.org → Impostazioni → Keys · Una sola per tutti i profili · Ctrl+V per incollarla"
                  focus={scope.item('ra:key', editRaKey)}
                />
              </div>
              {ra && ra.key.set && (
                <div className={styles.coreIndex}>
                  <span className={styles.coreIndexText}>
                    Ogni giocatore collega il proprio account dalla sua pagina profilo (SELECT).
                  </span>
                  <button type="button" className={styles.action} {...scope.item('ra:keyRemove', removeRaKey)}>
                    Rimuovi chiave
                  </button>
                </div>
              )}
              {ra && ra.error && (
                <div className={styles.error} role="alert">
                  Stato di RetroAchievements non disponibile.
                </div>
              )}
            </Panel>

            <Panel title="RETROARCH">
              <div className={styles.fields}>
                <TextField
                  label="Comando di avvio"
                  value={values['retroarch.command']}
                  focus={scope.item('ra:command', () =>
                    openField({ kind: 'setting', key: 'retroarch.command' }, values['retroarch.command'], {
                      title: 'Comando di RetroArch',
                      max: COMMAND_MAX,
                    }),
                  )}
                />
                <TextField
                  label="Finestra di prova del core (secondi)"
                  value={values['probe.window_seconds']}
                  note="Da 3 a 60"
                  focus={scope.item('ra:window', () =>
                    openField({ kind: 'setting', key: 'probe.window_seconds', number: true }, values['probe.window_seconds'], {
                      title: 'Finestra di prova (secondi)',
                      max: 2,
                    }),
                  )}
                />
              </div>
              <div className={styles.coreIndex}>
                <span className={styles.coreIndexText}>
                  {coreIndex.fetchedAt
                    ? `Elenco dei core scaricabili: ${coreIndex.count}, aggiornato il ${formatDate(coreIndex.fetchedAt)}`
                    : 'Elenco dei core scaricabili non ancora scaricato: sono disponibili solo i core installati.'}
                </span>
                <button
                  type="button"
                  className={styles.action}
                  {...scope.item('ra:cores', () => {
                    if (!settings.refreshing) {
                      refreshCores()
                    }
                  })}
                >
                  {settings.refreshing ? 'Aggiornamento…' : 'Aggiorna elenco core'}
                </button>
              </div>
              {indexError && (
                <div className={styles.error} role="alert">
                  {indexError}
                </div>
              )}
              {retroarch.quitCombo ? (
                <div className={styles.ok}>Uscita dal gioco col joypad: supportata</div>
              ) : (
                <div className={styles.error} role="alert">
                  La tua versione di RetroArch non supporta la combinazione d’uscita: dal gioco non si torna col joypad e
                  i giochi non si avviano. Controlla la «Cartella dei core di RetroArch» nei Percorsi qui sopra: il retroarch.cfg sta nella cartella che la contiene.
                </div>
              )}
            </Panel>

            <Panel title="PRESTAZIONI">
              <div className={styles.fields}>
                <TextField
                  label="Processore al massimo durante le partite"
                  value={values['play.cpu_boost'] ? 'Sì' : 'No'}
                  note={cpuNote(cpu)}
                  focus={scope.item('cpu:boost', () => dispatch(settingsChange('play.cpu_boost', !values['play.cpu_boost'])))}
                />
              </div>
            </Panel>
          </>
        )}

        <div className={styles.footer}>
          {settings.saveError && (
            <div className={styles.error} role="alert">
              {settings.saveError}
            </div>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.action} {...scope.item('act:rescan', rescan)}>
              {busy ? 'Aggiornamento…' : 'Aggiorna libreria'}
            </button>
            <span className={styles.spacer} />
            <button type="button" className={styles.action} {...scope.item('act:cancel', close)}>
              Annulla
            </button>
            <button type="button" className={`${styles.action} ${styles.primary}`} {...scope.item('act:save', save)}>
              {settings.saving ? 'Salvataggio…' : 'Salva'}
            </button>
          </div>
        </div>

        {multi && (
          <MultiPickerMenu
            title={multi.title}
            rows={groupRows(multiVisible)}
            cursor={keepCursor(multiVisible, multi.cursor)}
            selected={multi.selected}
            filter={state.pickerFilter}
            count={multiVisible.length}
            allChecked={allSelected(multi.selected, multiVisible)}
            empty={multi.items.length ? 'Nessuna voce contiene il testo cercato.' : multi.empty}
            keyboard={Boolean(state.osk)}
            onHover={(cursor) => setMulti({ ...multi, cursor })}
            onToggle={(id) => setMulti({ ...multi, cursor: id, selected: toggle(multi.selected, id) })}
            onToggleAll={() => setMulti({ ...multi, cursor: ALL, selected: toggleAll(multi.selected, multiVisible) })}
            onFilter={openFilter}
            onConfirm={confirmMulti}
            onClose={() => {
              if (!state.osk) {
                closeMulti()
              }
            }}
          />
        )}
        {picker && (
          <PickerMenu
            title={picker.title}
            items={picker.items}
            index={picker.index}
            empty={picker.empty}
            onHover={(index) => setPicker({ ...picker, index })}
            onPick={pick}
            onClose={() => setPicker(null)}
          />
        )}
        {confirm && (
          <ConfirmDialog
            text={confirm.text}
            choices={confirm.choices}
            choice={confirm.choice}
            cancel={confirm.cancel}
            onHover={(choice) => setConfirm({ ...confirm, choice })}
            onChoose={answer}
          />
        )}
      </div>
      {playlists.overlay}
      {tournament.overlay}
      <div ref={setOverlayHost} />
      {modalSystem && (
        <SystemDialog
          system={modalSystem}
          available={available}
          scopeRef={systemScope.ref}
          item={systemScope.item}
          onTypes={() => openMulti(modalSystem, 'types')}
          onCores={() => openMulti(modalSystem, 'cores')}
          onCoreActions={(core) => coreActions(modalSystem, core)}
          onRemove={(core) => removeCore(modalSystem.id, core)}
          onExtensions={() =>
            openField({ kind: 'extensions', system: modalSystem.id }, modalSystem.extensions, {
              title: `Estensioni · ${modalSystem.name}`,
              max: EXTENSIONS_MAX,
              placeholder: suggestedExtensions(modalSystem, available),
            })}
          onConfig={() => setConfigFor(modalSystem.id)}
          onBios={() => setBiosFor(modalSystem.id)}
          biosState={biosState}
          onClose={closeSystem}
        />
      )}
      {modalAddon && addonValues && (
        <AddonConsoleDialog
          entry={modalAddon}
          values={addonValues.draft}
          ctx={addonCtx}
          scopeRef={systemScope.ref}
          item={systemScope.item}
          onClose={closeSystem}
        />
      )}
      {modalSystem && configFor === modalSystem.id && (
        <ConfigModal
          target={{ system: modalSystem.id, id: null, title: modalSystem.name }}
          inputRef={configInput}
          onContext={setConfigContext}
          onClose={closeConfig}
        />
      )}
      {modalSystem && biosFor === modalSystem.id && (
        <BiosModal
          system={modalSystem.id}
          title={modalSystem.name}
          inputRef={biosInput}
          onContext={setBiosContext}
          onClose={closeBios}
        />
      )}
    </>
  )
}
