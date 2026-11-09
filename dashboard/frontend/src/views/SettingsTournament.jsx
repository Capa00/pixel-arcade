import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import Bracket from '../components/Bracket.jsx'
import FaceButton from '../components/FaceButton.jsx'
import FormatDialog from '../components/FormatDialog.jsx'
import GameCover from '../components/GameCover.jsx'
import Podium from '../components/Podium.jsx'
import SeriesRankings, { stepRanking } from '../components/SeriesRankings.jsx'
import ShoulderButton from '../components/ShoulderButton.jsx'
import TextField from '../components/TextField.jsx'
import { stepIndex, wraps } from '../input/wrap.js'
import {
  ADVANTAGED_SIDES,
  DATE_PARTS,
  DESCRIPTION_MAX,
  PLAYERS_CHOICES,
  SEEDINGS,
  SIDES,
  TITLE_MAX,
  advantagedLabel,
  comboButton,
  comboLabel,
  datePartLabel,
  defaultStart,
  editable,
  filterGames,
  formatLine,
  formatStart,
  formatSummary,
  hasAdvantagedSide,
  isCreator,
  listWindow,
  playersLabel,
  publishProblem,
  sameCombo,
  sidesLabel,
  slotLabel,
  statusLabel,
  stepDate,
  stepPart,
  tournamentAddons,
  weightLabel,
} from '../lib/tournament.js'
import { openKeyboard, requestTournamentRecord, setFocus, setPickerFilter, showToast } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import settingsStyles from './Settings.module.css'
import styles from './SettingsTournament.module.css'

// Testi chiesti con la tastiera a schermo.
const TEXT_TARGET = 'tournament'
// Giochi mostrati insieme nell'elenco della scelta del gioco (gli altri si raggiungono scorrendo).
const GAME_WINDOW = 40
// Salto con ◀ ▶ nell'elenco dei giochi.
const GAME_PAGE = 10
const SEARCH_MAX = 40
const VERTICAL = { up: -1, down: 1 }
const HORIZONTAL = { left: -1, right: 1 }
const NOT_CREATOR = 'Solo chi ha creato il torneo può modificarlo.'
const NOT_P1 = 'Per modificare il torneo entra come P1 col profilo che l’ha creato.'
const RUNNING_ONLY = 'A torneo in corso si cambiano solo titolo e descrizione.'
// Tasti frontali nelle icone della combinazione, indipendenti dalla marca del joypad.
const FACE_POSITIONS = ['south', 'east', 'west', 'north']
// Nome dei tasti nei pallini della combinazione: non si mostra mai quale tasto è.
const DOT = '●'

/** «● ● ●» per una sequenza di `count` tasti, oppure il suggerimento se è vuota. */
/** «2ª edizione — Japan version»; «Annullata» al posto del numero per le edizioni annullate. */
function editionLabel(entry) {
  const number = entry.edition ? `${entry.edition}ª edizione` : 'Annullata'
  return entry.title ? `${number} — ${entry.title}` : number
}

function editionsLabel(count) {
  return count === 1 ? '1 edizione' : `${count} edizioni`
}

function dots(count, empty) {
  return count ? Array.from({ length: count }, () => DOT).join(' ') : empty
}

function formatDay(iso) {
  return iso ? new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
}

/**
 * Finestra della combinazione dell'admin: registrazione (due volte) o
 * inserimento. A schermo solo i pallini. START conferma, SELECT ricomincia
 * (con la sequenza vuota esce); i tasti li passa `handle` della scheda.
 */
export function ComboDialog({ combo, onConfirm, onClear, onCancel }) {
  const record = combo.kind === 'record'
  let prompt = 'Inserisci la combinazione dell’admin, poi premi START.'
  if (record) {
    prompt = combo.step === 'first'
      ? 'Premi i tasti della nuova combinazione, poi START. Con START subito il torneo resta senza combinazione.'
      : 'Ripeti la stessa combinazione, poi START.'
  }
  return (
    <div className={settingsStyles.modalOverlay}>
      <section className={`${settingsStyles.modal} ${styles.small}`} role="dialog" aria-label="Combinazione dell'admin">
        <div className={settingsStyles.systemHead}>
          <span className={`pix ${settingsStyles.systemName}`}>
            {record ? 'NUOVA COMBINAZIONE' : 'COMBINAZIONE DELL’ADMIN'}
          </span>
          <button type="button" className={settingsStyles.modalClose} onClick={onCancel}>
            Annulla
          </button>
        </div>
        <p className={styles.prompt}>{prompt}</p>
        <div className={styles.dots} aria-live="polite">
          {dots(combo.sequence.length, 'Nessun tasto')}
        </div>
        {combo.message && <p className={combo.error ? styles.problem : styles.hint}>{combo.message}</p>}
        <p className={`${styles.hint} ${styles.comboKeys}`}>
          <span>Valgono la croce,</span>
          <span className={styles.comboIcons} aria-label="i quattro tasti frontali">
            {FACE_POSITIONS.map((position) => (
              <FaceButton key={position} position={position} />
            ))}
          </span>
          <span className={styles.comboIcons} aria-label="dorsali e grilletti">
            <ShoulderButton pressed={['lb', 'rb']} />
            <ShoulderButton pressed={['lt', 'rt']} />
          </span>
        </p>
        <p className={styles.hint}>SELECT ricomincia; con la sequenza vuota esce.</p>
        <div className={settingsStyles.actions}>
          <button type="button" className={settingsStyles.action} onClick={onClear}>
            Ricomincia
          </button>
          <span className={settingsStyles.spacer} />
          <button type="button" className={`${settingsStyles.action} ${settingsStyles.primary}`} onClick={onConfirm}>
            Conferma
          </button>
        </div>
      </section>
    </div>
  )
}

/** Finestra della data e ora d'inizio: ◀ ▶ scelgono la parte, ▲ ▼ cambiano il valore. */
function DateDialog({ edit, onPart, onStep, onConfirm, onClear, onCancel }) {
  return (
    <div className={settingsStyles.modalOverlay}>
      <section className={`${settingsStyles.modal} ${styles.small}`} role="dialog" aria-label="Data e ora d'inizio">
        <div className={settingsStyles.systemHead}>
          <span className={`pix ${settingsStyles.systemName}`}>DATA E ORA D’INIZIO</span>
          <button type="button" className={settingsStyles.modalClose} onClick={onCancel}>
            Annulla
          </button>
        </div>
        <div className={styles.clock}>
          {DATE_PARTS.map((part, index) => (
            <span key={part} className={styles.clockGroup}>
              {index === 3 && <span className={styles.clockSep}>·</span>}
              {index === 4 && <span className={styles.clockSep}>:</span>}
              <span className={part === edit.part ? `${styles.clockPart} ${styles.clockActive}` : styles.clockPart}>
                <button type="button" className={styles.clockArrow} aria-label="Aumenta" onClick={() => onStep(part, 1)}>
                  ▲
                </button>
                <button type="button" className={styles.clockValue} onClick={() => onPart(part)}>
                  {datePartLabel(edit.date, part)}
                </button>
                <button type="button" className={styles.clockArrow} aria-label="Diminuisci" onClick={() => onStep(part, -1)}>
                  ▼
                </button>
              </span>
            </span>
          ))}
        </div>
        <p className={styles.hint}>{formatStart(edit.date.toISOString())}</p>
        {edit.message && <p className={styles.problem}>{edit.message}</p>}
        <div className={settingsStyles.actions}>
          <button type="button" className={`${settingsStyles.action} ${settingsStyles.danger}`} onClick={onClear}>
            Nessuna data
          </button>
          <span className={settingsStyles.spacer} />
          <button type="button" className={`${settingsStyles.action} ${settingsStyles.primary}`} onClick={onConfirm}>
            Conferma
          </button>
        </div>
      </section>
    </div>
  )
}

/** Scelta del gioco: schede delle console con L1/R1, ricerca, elenco che scorre col cursore. */
function GameDialog({ picker, systems, filter, keyboard, onHover, onPick, onSystem, onSearch, onCancel }) {
  const system = systems[picker.system]
  const visible = picker.games ? filterGames(picker.games, filter) : []
  const index = Math.min(picker.index, Math.max(0, visible.length - 1))
  const { start, end } = listWindow(visible.length, index, GAME_WINDOW)
  const listRef = useRef(null)

  useEffect(() => {
    const active = listRef.current && listRef.current.querySelector('[data-active="true"]')
    if (active) {
      active.scrollIntoView({ block: 'nearest' })
    }
  }, [index, start, picker.system])

  const current = visible[index]
  return (
    <div className={keyboard ? `${settingsStyles.modalOverlay} ${styles.besideKeyboard}` : settingsStyles.modalOverlay}>
      <section className={`${settingsStyles.modal} ${styles.gameModal}`} role="dialog" aria-label="Gioco del torneo">
        <div className={settingsStyles.systemHead}>
          <span className={`pix ${settingsStyles.systemName}`}>GIOCO DEL TORNEO</span>
          <span className={settingsStyles.count}>
            {picker.games ? (visible.length === 1 ? '1 gioco' : `${visible.length} giochi`) : 'Caricamento…'}
          </span>
          <button type="button" className={settingsStyles.modalClose} onClick={onCancel}>
            Chiudi
          </button>
        </div>
        <div className={styles.systemTabs}>
          <button type="button" className={styles.systemStep} onClick={() => onSystem(-1)} aria-label="Console precedente">
            ◀
          </button>
          <span className={styles.systemTab} style={{ '--accent': system ? system.accent : 'var(--text-1)' }}>
            {system ? system.name : '—'}
          </span>
          <button type="button" className={styles.systemStep} onClick={() => onSystem(1)} aria-label="Console successiva">
            ▶
          </button>
          <button type="button" className={styles.search} onClick={onSearch}>
            {filter ? `Cerca: «${filter}»` : 'Cerca nel titolo'}
          </button>
        </div>
        <div className={styles.gameBody}>
          <ul className={styles.gameList} ref={listRef}>
            {picker.games && !visible.length && (
              <li className={settingsStyles.empty}>{filter ? 'Nessun gioco contiene il testo cercato.' : 'Nessun gioco.'}</li>
            )}
            {visible.slice(start, end).map((game, offset) => {
              const at = start + offset
              return (
                <li key={game.id}>
                  <button
                    type="button"
                    data-active={at === index}
                    className={at === index ? `${styles.gameItem} ${styles.gameActive}` : styles.gameItem}
                    onMouseEnter={() => onHover(at)}
                    onClick={() => onPick(game)}
                  >
                    <span className={styles.gameTitle}>{game.title}</span>
                    {game.players && <span className={styles.gameNote}>{game.players} giocatori</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className={styles.gamePreview}>
            {current && system && (
              <GameCover key={`${system.id}:${current.id}`} system={system} game={current} className={styles.preview} />
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

/**
 * Scheda «Torneo» delle Impostazioni (README «Torneo»). Le modifiche si
 * salvano subito (non con «Salva»).
 *
 * La scheda elenca i tornei non conclusi (bozze, iscrizioni aperte, in
 * corso) con «＋ Nuovo torneo»; A ne apre uno, B torna all'elenco. Tutti
 * vedono i tornei; ognuno lo modifica solo il suo creatore, entrato come P1.
 * Se il torneo ha la combinazione dell'admin, alla prima modifica (o con
 * «Gestisci») si chiede la combinazione; poi quel torneo resta sbloccato
 * finché la vista è aperta e il P1 non cambia.
 *
 * «Salvataggio di partenza» registra lo stato giocando (src/views/RunLayer.jsx):
 * da zero, con il salvataggio interno del creatore o da un suo slot;
 * all'uscita lo stato va al torneo e la scheda si rilegge.
 *
 * `scope` è l'ambito di navigazione della vista (di nome `scopeName`); `ask(confirm)` e
 * `choose(picker)` aprono la conferma e il menu delle Impostazioni;
 * `active` è vero con la scheda aperta (i dati si leggono allora).
 * Restituisce `{panel, history, overlay, mode, handle}` come la scheda Playlist
 * (`history` è l'archivio «Conclusi», solo con l'elenco). Un torneo
 * dell'archivio si apre in sola lettura (dati, podio e tabellone) e il
 * creatore come P1 lo elimina con la conferma e la combinazione; i premi restano.
 */
export function useTournamentSettings({ scope, scopeName, ask, choose, active }) {
  const { state, dispatch, loadAllGames } = useApp()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  // Torneo aperto (id), oppure `null` con l'elenco; torneo dell'archivio aperto in sola lettura.
  const [openId, setOpenId] = useState(null)
  const [archiveId, setArchiveId] = useState(null)
  // Serie aperta (id), con la classifica mostrata a destra.
  const [seriesId, setSeriesId] = useState(null)
  const [rankTab, setRankTab] = useState('medals')
  // Combinazioni inserite, per id del torneo (`null` = torneo senza combinazione). Il riferimento serve alle
  // azioni chieste prima dello sblocco, che partono subito dopo con la combinazione nuova.
  const [unlocked, setUnlockedState] = useState({})
  const unlockedRef = useRef({})
  const unlock = useCallback((id, combo) => {
    unlockedRef.current = id === null ? {} : { ...unlockedRef.current, [id]: combo }
    setUnlockedState(unlockedRef.current)
  }, [])
  const [combo, setCombo] = useState(null)
  const [dateEdit, setDateEdit] = useState(null)
  const [gamePicker, setGamePicker] = useState(null)
  // Modale del formato aperta, con la sua legenda e la funzione dei tasti (src/components/FormatDialog.jsx).
  const [formatEdit, setFormatEdit] = useState(false)
  const [formatContext, setFormatContext] = useState('tournamentFormat')
  const formatInput = useRef(null)
  // Campo di testo aperto nella tastiera a schermo: `title` o `description`.
  const [naming, setNaming] = useState(null)
  const p1 = state.players.p1.user
  const account = p1 && !p1.guest && Number.isInteger(p1.id) ? p1.id : null
  const tournaments = data ? data.tournaments : []
  const tournament = openId === null ? null : tournaments.find((entry) => entry.id === openId) || null
  const archived = archiveId === null || !data ? null : data.history.find((entry) => entry.id === archiveId) || null
  const seriesList = data ? data.series || [] : []
  const series = seriesId === null ? null : seriesList.find((entry) => entry.id === seriesId) || null
  const creator = isCreator(tournament, account)
  const canEdit = creator && (!tournament.combo || tournament.id in unlocked)
  const tournamentId = tournament ? tournament.id : null
  // Combinazione da inviare con le modifiche del torneo aperto (`null` se non è stata inserita).
  const currentAuth = useCallback(() => {
    const value = unlockedRef.current[tournamentId]
    return value === undefined ? null : value
  }, [tournamentId])

  const reload = useCallback(() => api.tournament().then(setData).catch((error) => {
    dispatch(showToast(error.message, 'error'))
  }), [dispatch])

  useEffect(() => {
    if (active) {
      reload()
    }
  }, [active, reload])

  // Primo caricamento con la scheda aperta: il cursore va sulla prima voce (non resta sui pulsanti in fondo).
  const loaded = Boolean(data)
  useEffect(() => {
    if (active && loaded) {
      dispatch(setFocus(scopeName, null))
    }
  }, [active, loaded, dispatch, scopeName])

  // Torneo aperto sparito (eliminato o annullato): si torna all'elenco.
  useEffect(() => {
    if (openId !== null && data && !tournament) {
      setOpenId(null)
      dispatch(setFocus(scopeName, null))
    }
  }, [openId, data, tournament, dispatch, scopeName])
  useEffect(() => {
    if (archiveId !== null && data && !archived) {
      setArchiveId(null)
      dispatch(setFocus(scopeName, null))
    }
  }, [archiveId, data, archived, dispatch, scopeName])
  useEffect(() => {
    if (seriesId !== null && data && !series) {
      setSeriesId(null)
      dispatch(setFocus(scopeName, null))
    }
  }, [seriesId, data, series, dispatch, scopeName])

  // Fine della registrazione dello stato di partenza: la scheda si rilegge (l'avviso lo dà il livello di gioco).
  const lastResult = state.run.lastResult
  const lastSeq = lastResult && lastResult.tournament ? lastResult.seq : null
  useEffect(() => {
    if (lastSeq !== null) {
      reload()
    }
  }, [lastSeq, reload])

  // Cambia il P1: gli sblocchi non valgono più.
  useEffect(() => {
    unlock(null)
  }, [account, unlock])

  const replace = useCallback((item) => setData((current) => current && {
    ...current,
    tournaments: current.tournaments.map((entry) => (entry.id === item.id ? item : entry)),
  }), [])

  const call = useCallback(async (request, { full = false } = {}) => {
    setBusy(true)
    try {
      const result = await request()
      if (full) {
        await reload()
      } else if (result && result.tournament) {
        replace(result.tournament)
      }
      return result
    } catch (error) {
      if (error.data && error.data.locked) {
        unlock(null)
      }
      dispatch(showToast(error.message, 'error'))
      return null
    } finally {
      setBusy(false)
    }
  }, [dispatch, reload, replace, unlock])

  const update = useCallback((changes) => call(() => api.tournamentUpdate(tournamentId, account, currentAuth(), changes)),
    [call, tournamentId, account, currentAuth])

  // Nome e descrizione della serie aperta, con la combinazione inserita (vedi `seriesGuard`).
  const seriesUpdate = useCallback((changes) => {
    const code = unlockedRef.current[`s${seriesId}`]
    return call(() => api.tournamentSeriesUpdate(seriesId, account, code === undefined ? null : code, changes),
      { full: true })
  }, [call, seriesId, account])

  // Testo confermato nella tastiera a schermo: si salva subito.
  const keyboardText = state.keyboardText
  const keyboardOpen = Boolean(state.osk)
  useEffect(() => {
    if (!naming || keyboardOpen) {
      return
    }
    const field = naming
    setNaming(null)
    if (!keyboardText || !keyboardText.target || keyboardText.target.kind !== `${TEXT_TARGET}:${field}`) {
      return
    }
    if (field === 'name' || field === 'seriesDescription') {
      seriesUpdate({ [field === 'name' ? 'name' : 'description']: keyboardText.value })
    } else {
      update({ [field]: keyboardText.value })
    }
  }, [naming, keyboardOpen, keyboardText, update, seriesUpdate])

  const open = (id) => {
    setOpenId(id)
    dispatch(setFocus(scopeName, 'tr:title'))
  }

  const close = () => {
    const id = openId
    setOpenId(null)
    dispatch(setFocus(scopeName, `tr:edition:${id}`))
  }

  const openSeries = (id) => {
    setSeriesId(id)
    dispatch(setFocus(scopeName, 'tr:sback'))
  }

  const closeSeries = () => {
    const id = seriesId
    setSeriesId(null)
    dispatch(setFocus(scopeName, `tr:series:${id}`))
  }

  const openArchive = (id) => {
    setArchiveId(id)
    dispatch(setFocus(scopeName, 'tr:back'))
  }

  const closeArchive = () => {
    const id = archiveId
    setArchiveId(null)
    dispatch(setFocus(scopeName, `tr:edition:${id}`))
  }

  const deleteArchived = async (id, code) => {
    setBusy(true)
    try {
      await api.tournamentDelete(id, account, code)
      setCombo(null)
      setArchiveId(null)
      dispatch(setFocus(scopeName, null))
      await reload()
      dispatch(showToast('Torneo eliminato dall’archivio. I premi restano.'))
    } catch (error) {
      if (error.data && error.data.locked && code) {
        setCombo((current) => current && { ...current, sequence: [], message: error.message, error: true })
      } else {
        setCombo(null)
        dispatch(showToast(error.message, 'error'))
      }
    } finally {
      setBusy(false)
    }
  }

  // «Elimina dall'archivio»: conferma, poi la combinazione del creatore se il torneo ce l'ha.
  const removeArchived = () => {
    if (busy || !archived) {
      return
    }
    if (account === null) {
      dispatch(showToast(NOT_P1))
      return
    }
    if (!isCreator(archived, account)) {
      dispatch(showToast(NOT_CREATOR))
      return
    }
    const target = archived
    ask({
      text: `Eliminare «${target.fullTitle}» dall’archivio? I premi restano.`,
      choice: 'no',
      onYes: () => {
        if (target.combo) {
          setCombo({ kind: 'archive', id: target.id, sequence: [], message: '', error: false })
        } else {
          deleteArchived(target.id, null)
        }
      },
    })
  }

  /**
   * Esegue `action` se il P1 può modificare il campo `field`; altrimenti lo
   * spiega. Con la combinazione non ancora inserita la chiede, poi esegue.
   */
  const guard = (field, action) => {
    if (busy || !tournament) {
      return
    }
    if (account === null) {
      dispatch(showToast(NOT_P1))
      return
    }
    if (!creator) {
      dispatch(showToast(NOT_CREATOR))
      return
    }
    if (field && !editable(tournament, field)) {
      dispatch(showToast(RUNNING_ONLY))
      return
    }
    if (!canEdit) {
      setCombo({ kind: 'unlock', sequence: [], message: '', error: false, then: action })
      return
    }
    action()
  }

  const create = async () => {
    if (busy) {
      return
    }
    if (account === null) {
      dispatch(showToast('Per creare un torneo entra come P1 col tuo profilo.'))
      return
    }
    const result = await call(() => api.tournamentCreate(account), { full: true })
    if (result) {
      unlock(result.tournament.id, null)
      setSeriesId(result.tournament.series.id)
      open(result.tournament.id)
      dispatch(showToast('Serie creata con la 1ª edizione in bozza: si salva a ogni modifica.'))
    }
  }

  /**
   * Esegue `action(combinazione)` se il P1 è il creatore della serie aperta;
   * se la serie ha la combinazione e non è stata inserita la chiede prima.
   */
  const seriesGuard = (action) => {
    if (busy || !series) {
      return
    }
    if (account === null) {
      dispatch(showToast(NOT_P1))
      return
    }
    if (account !== series.creator.id) {
      dispatch(showToast(NOT_CREATOR))
      return
    }
    const key = `s${series.id}`
    if (series.combo && !(key in unlockedRef.current)) {
      setCombo({ kind: 'series', key, sequence: [], message: '', error: false, then: action })
      return
    }
    action(series.combo ? unlockedRef.current[key] : null)
  }

  const askSeriesText = (field) => seriesGuard(() => {
    if (state.osk) {
      return
    }
    setNaming(field)
    const name = field === 'name'
    dispatch(openKeyboard('text', {
      value: (name ? series.name : series.description) || '',
      max: name ? TITLE_MAX : DESCRIPTION_MAX,
      title: name ? 'Nome della serie' : 'Descrizione della serie',
      placeholder: name ? 'Per esempio: GameNight Tournament' : 'Per esempio: Ogni primo venerdì del mese',
      target: { kind: `${TEXT_TARGET}:${field}` },
    }))
  })

  const newEdition = () => {
    if (series && !series.canAdd) {
      dispatch(showToast('C’è già un’edizione da concludere: finiscila o annullala prima.'))
      return
    }
    seriesGuard(async (code) => {
      const result = await call(() => api.tournamentSeriesEdition(series.id, account, code), { full: true })
      if (result) {
        unlock(result.tournament.id, code)
        open(result.tournament.id)
        dispatch(showToast('Nuova edizione in bozza, copia della precedente: modificala e pubblicala.'))
      }
    })
  }

  const deleteSeries = () => {
    if (!series) {
      return
    }
    const target = series
    ask({
      text: `Eliminare la serie «${target.name}» con tutte le sue edizioni? I premi restano.`,
      choice: 'no',
      onYes: () => seriesGuard(async (code) => {
        const result = await call(() => api.tournamentSeriesDelete(target.id, account, code), { full: true })
        if (result) {
          setSeriesId(null)
          dispatch(setFocus(scopeName, null))
          dispatch(showToast('Serie eliminata. I premi restano.'))
        }
      }),
    })
  }

  const askText = (field) => guard(field, () => {
    if (state.osk) {
      return
    }
    setNaming(field)
    const title = field === 'title'
    dispatch(openKeyboard('text', {
      value: tournament[field] || '',
      max: title ? TITLE_MAX : DESCRIPTION_MAX,
      title: title ? 'Titolo dell’edizione' : 'Descrizione dell’edizione',
      placeholder: title ? 'Facoltativo, per esempio: Japan version' : 'Per esempio: Start alle 21:30',
      target: { kind: `${TEXT_TARGET}:${field}` },
    }))
  })

  const openDate = () => guard('startsAt', () => {
    const now = new Date()
    const current = tournament.startsAt ? new Date(tournament.startsAt) : null
    setDateEdit({ date: current && current > now ? current : defaultStart(now), part: 'hour', message: '' })
  })

  const confirmDate = async () => {
    if (dateEdit.date.getTime() <= Date.now()) {
      setDateEdit({ ...dateEdit, message: 'Questa data è già passata: scegline una futura.' })
      return
    }
    const date = dateEdit.date
    setDateEdit(null)
    await update({ startsAt: date.toISOString() })
  }

  const clearDate = async () => {
    setDateEdit(null)
    if (tournament.startsAt) {
      await update({ startsAt: null })
    }
  }

  const loadSystem = (index) => {
    const system = state.systems[index]
    if (!system) {
      return
    }
    loadAllGames([system], state.games).then((games) => {
      setGamePicker((current) => current && current.system === index
        ? { ...current, games: games[system.id] || [] }
        : current)
    })
  }

  const openGame = () => guard('game', () => {
    if (!state.systems.length) {
      dispatch(showToast('Nessuna console con giochi.'))
      return
    }
    let system = state.systems.findIndex((entry) => entry.id === (tournament.system || state.systemId))
    system = Math.max(0, system)
    const known = state.games[state.systems[system].id]
    const index = known && tournament.game ? Math.max(0, known.findIndex((game) => game.id === tournament.game)) : 0
    dispatch(setPickerFilter(''))
    setGamePicker({ system, index, games: known || null })
    if (!known) {
      loadSystem(system)
    }
  })

  const closeGame = () => {
    setGamePicker(null)
    dispatch(setPickerFilter(''))
  }

  const stepSystem = (dir) => {
    const count = state.systems.length
    const system = (gamePicker.system + dir + count) % count
    const known = state.games[state.systems[system].id]
    setGamePicker({ system, index: 0, games: known || null })
    if (!known) {
      loadSystem(system)
    }
  }

  const searchGame = () => {
    if (!state.osk) {
      dispatch(openKeyboard('filter', {
        value: state.pickerFilter,
        max: SEARCH_MAX,
        position: 'left',
        title: 'Cerca nel titolo',
        placeholder: 'Una parte del titolo',
      }))
    }
  }

  const pickGame = async (game) => {
    const system = state.systems[gamePicker.system]
    closeGame()
    if (!game || !system || (tournament.system === system.id && tournament.game === game.id)) {
      return
    }
    const hadState = tournament.hasState
    const result = await update({ game: { system: system.id, id: game.id } })
    if (result && hadState) {
      dispatch(showToast('Gioco cambiato: registra di nuovo il salvataggio di partenza.'))
    }
  }

  // Registrazione dello stato di partenza: la avvia il livello di gioco con il creatore come P1.
  const record = (source) => {
    const info = tournament.gameInfo || {}
    const known = (state.games[tournament.system] || []).find((game) => game.id === tournament.game)
    const game = known || { id: tournament.game, title: info.title || tournament.game, metaId: info.metaId,
      cover: info.cover }
    dispatch(requestTournamentRecord(tournament.system, game,
      { id: tournament.id, account, combo: currentAuth(), source }))
  }

  // «Da un mio slot»: gli stati del creatore per il gioco; quelli di un altro core non si possono usare.
  const chooseSlot = async () => {
    let slots = []
    try {
      const result = await api.gameSaves(tournament.system, tournament.game, [account])
      const own = result.accounts.find((entry) => entry.id === account)
      slots = own ? own.slots : []
    } catch (error) {
      dispatch(showToast(error.message, 'error'))
      return
    }
    if (!slots.length) {
      dispatch(showToast('Nessun tuo salvataggio per questo gioco.'))
      return
    }
    choose({
      title: 'DA UN MIO SLOT',
      items: slots.map((slot) => ({
        id: String(slot.slot),
        label: slotLabel(slot),
        note: slot.loadable ? `${formatDay(slot.updatedAt)} · ${slot.core}` : `core ${slot.core}, diverso da quello del gioco`,
        disabled: !slot.loadable,
      })),
      index: 0,
      empty: '',
      onPick: (entry) => {
        if (entry.disabled) {
          dispatch(showToast('Questo stato è di un altro core: non si carica col core del gioco.'))
          return
        }
        record({ kind: 'slot', slot: Number(entry.id) })
      },
    })
  }

  const openSave = () => guard('state', () => {
    if (!tournament.game) {
      dispatch(showToast('Scegli prima il gioco del torneo.'))
      return
    }
    const items = [
      { id: 'zero', label: 'Registra giocando, da zero', note: 'Dall’inizio, senza salvataggi' },
      { id: 'mine', label: 'Registra giocando con i miei dati', note: 'Dall’inizio, col tuo salvataggio interno' },
      { id: 'slot', label: 'Registra giocando da un mio slot', note: 'Riparte da un tuo stato' },
      { id: 'none', label: 'Nessuno, dall’inizio', note: tournament.hasState ? 'Toglie lo stato registrato' : '' },
    ]
    choose({
      title: 'SALVATAGGIO DI PARTENZA',
      items,
      index: 0,
      empty: '',
      onPick: (entry) => {
        if (entry.id === 'none') {
          if (tournament.hasState) {
            update({ clearState: true })
          }
        } else if (entry.id === 'slot') {
          chooseSlot()
        } else {
          record({ kind: entry.id })
        }
      },
    })
  })

  const chooseValue = (field, title, items, current, toValue) => guard(field, () => {
    choose({
      title,
      items,
      index: Math.max(0, items.findIndex((item) => item.id === String(current))),
      empty: '',
      onPick: (entry) => {
        const value = toValue(entry.id)
        if (value !== current) {
          update({ [field]: value })
        }
      },
    })
  })

  const chooseMaxPlayers = () => chooseValue(
    'maxPlayers',
    'PARTECIPANTI MASSIMI',
    PLAYERS_CHOICES.map((value) => ({ id: String(value), label: playersLabel(value) })),
    tournament.maxPlayers,
    (id) => (id === 'null' ? null : Number(id)),
  )

  const openFormat = () => guard('format', () => setFormatEdit(true))

  // START nella modale del formato: si salva un solo aggiornamento con i campi cambiati.
  const confirmFormat = async (value) => {
    setFormatEdit(false)
    const changes = {}
    for (const field of ['format', 'seeding', 'seedingWeight', 'advantagedSide', 'roundSeries', 'finalSeries', 'thirdPlace']) {
      if (value[field] !== tournament[field]) {
        changes[field] = value[field]
      }
    }
    if (JSON.stringify(value.options || {}) !== JSON.stringify(tournament.options || {})) {
      changes.options = value.options
    }
    if (Object.keys(changes).length) {
      const result = await update(changes)
      if (result) {
        dispatch(showToast('Formato salvato.'))
      }
    }
  }

  const chooseSeeding = () => chooseValue(
    'seeding',
    'TESTE DI SERIE',
    SEEDINGS.map((entry) => ({ id: entry.id, label: entry.label, note: entry.note })),
    tournament.seeding,
    (id) => id,
  )

  const chooseWeight = () => chooseValue(
    'seedingWeight',
    'PESI DELLE TESTE DI SERIE',
    Array.from({ length: 11 }, (_, index) => ({ id: String(index * 10), label: weightLabel(index * 10) })),
    tournament.seedingWeight,
    (id) => Number(id),
  )

  const chooseAdvantaged = () => {
    if (tournament && !hasAdvantagedSide(tournament.sides)) {
      dispatch(showToast('Con i lati liberi decidono i giocatori: il lato vantaggiato non si usa.'))
      return
    }
    chooseValue(
      'advantagedSide',
      'LATO VANTAGGIATO',
      ADVANTAGED_SIDES.map((entry) => ({ id: entry.id, label: entry.label })),
      tournament.advantagedSide,
      (id) => id,
    )
  }

  const chooseSides = () => chooseValue(
    'sides',
    'LATI P1 / P2',
    SIDES.map((entry) => ({ id: entry.id, label: entry.label, note: entry.note })),
    tournament.sides,
    (id) => id,
  )

  const toggle = (field) => guard(field, () => update({ [field]: !tournament[field] }))

  // Estensioni del torneo (`tournamentAddons`): prima dell'avvio si accendono, si spengono e si sceglie il tipo
  // di conteggio; a torneo in corso si possono solo spegnere, con una conferma.
  const toggleAddon = (entry) => guard(tournament.status === 'running' ? null : 'addons', () => {
    if (tournament.status !== 'running') {
      update({ addons: { [entry.id]: { enabled: !entry.enabled } } })
      return
    }
    if (!entry.enabled) {
      dispatch(showToast('A torneo in corso si può solo spegnere: non si riaccende.'))
      return
    }
    ask({
      text: `Spegnere «${entry.title}»? A torneo in corso non si potrà riaccendere: il vincitore di ogni partita lo dichiarerà l’admin.`,
      choice: 'no',
      onYes: () => update({ addons: { [entry.id]: { enabled: false } } }),
    })
  })

  const chooseAddonMode = (entry) => guard('addons', () => {
    if (entry.modes.length < 2) {
      dispatch(showToast('Per questo gioco c’è un solo tipo di conteggio.'))
      return
    }
    choose({
      title: 'TIPO DI CONTEGGIO',
      items: entry.modes.map((mode) => ({ id: mode.id, label: mode.label })),
      index: Math.max(0, entry.modes.findIndex((mode) => mode.id === entry.mode.id)),
      empty: '',
      onPick: (picked) => {
        if (picked.id !== entry.mode.id) {
          update({ addons: { [entry.id]: { mode: picked.id } } })
        }
      },
    })
  })

  const saveCombo = async (sequence) => {
    const id = tournament.id
    const result = await update({ newCombo: sequence })
    if (result) {
      unlock(id, sequence.length ? sequence : null)
      dispatch(showToast(sequence.length ? 'Combinazione dell’admin salvata.' : 'Combinazione tolta: azioni libere per il creatore.'))
    }
  }

  const chooseCombo = () => guard('combo', () => {
    const items = [{ id: 'new', label: 'Registra una nuova combinazione' }]
    if (tournament.combo) {
      items.push({ id: 'none', label: 'Nessuna combinazione (azioni libere)' })
    }
    choose({
      title: 'COMBINAZIONE DELL’ADMIN',
      items,
      index: 0,
      empty: '',
      onPick: (entry) => {
        if (entry.id === 'new') {
          setCombo({ kind: 'record', step: 'first', first: [], sequence: [], message: '', error: false })
        } else {
          saveCombo([])
        }
      },
    })
  })

  const comboConfirm = async () => {
    const current = combo
    if (current.kind === 'record') {
      if (current.step === 'first') {
        if (!current.sequence.length) {
          setCombo(null)
          if (tournament.combo) {
            saveCombo([])
          }
          return
        }
        setCombo({ ...current, step: 'repeat', first: current.sequence, sequence: [], message: '', error: false })
        return
      }
      if (!sameCombo(current.first, current.sequence)) {
        setCombo({ ...current, step: 'first', first: [], sequence: [], error: true,
          message: 'Le due combinazioni sono diverse: ricomincia.' })
        return
      }
      setCombo(null)
      saveCombo(current.sequence)
      return
    }
    if (!current.sequence.length) {
      setCombo({ ...current, message: 'Premi i tasti della combinazione prima di START.', error: true })
      return
    }
    if (current.kind === 'archive') {
      deleteArchived(current.id, current.sequence)
      return
    }
    if (current.kind === 'series') {
      // La combinazione la controlla il server con l'azione: se è sbagliata l'azione lo dice e si richiede.
      unlock(current.key, current.sequence)
      setCombo(null)
      current.then(current.sequence)
      return
    }
    setBusy(true)
    try {
      await api.tournamentUnlock(tournament.id, account, current.sequence)
      unlock(tournament.id, current.sequence)
      setCombo(null)
      if (current.then) {
        // L'azione chiesta prima dello sblocco: legge la combinazione da `unlockedRef`.
        current.then()
      }
    } catch (error) {
      setCombo({ ...current, sequence: [], message: error.message, error: true })
    } finally {
      setBusy(false)
    }
  }

  const comboClear = () => {
    if (!combo.sequence.length) {
      setCombo(null)
      return
    }
    setCombo({ ...combo, sequence: [], message: '', error: false })
  }

  const publish = () => guard(null, () => {
    const problem = publishProblem(tournament, new Date())
    if (problem) {
      dispatch(showToast(problem))
      return
    }
    const id = tournament.id
    const when = tournament.startsAt ? ` · ${formatStart(tournament.startsAt)}` : ''
    ask({
      text: `Pubblicare «${tournament.fullTitle}»? ${tournament.gameInfo ? tournament.gameInfo.title : ''}${when}. ` +
        'Si aprono le iscrizioni e tutti vedono il torneo.',
      choice: 'no',
      onYes: async () => {
        const result = await call(() => api.tournamentPublish(id, account, currentAuth()))
        if (result) {
          dispatch(showToast('Torneo pubblicato: iscrizioni aperte.'))
        }
      },
    })
  })

  const removeDraft = () => {
    if (busy || !tournament) {
      return
    }
    if (!creator) {
      dispatch(showToast(account === null ? NOT_P1 : NOT_CREATOR))
      return
    }
    const id = tournament.id
    ask({
      text: `Eliminare la bozza «${tournament.fullTitle}»?`,
      choice: 'no',
      onYes: async () => {
        const result = await call(() => api.tournamentDelete(id, account), { full: true })
        if (result) {
          dispatch(showToast('Bozza eliminata.'))
        }
      },
    })
  }

  const cancelTournament = () => guard(null, () => {
    const id = tournament.id
    ask({
      text: tournament.status === 'running'
        ? `Il torneo è in corso: annullare «${tournament.fullTitle}»? I risultati restano nello storico.`
        : `Annullare «${tournament.fullTitle}»? L’edizione resta nello storico come annullata, senza numero.`,
      choice: 'no',
      onYes: async () => {
        const result = await call(() => api.tournamentCancel(id, account, currentAuth()), { full: true })
        if (result) {
          dispatch(showToast('Torneo annullato.'))
        }
      },
    })
  })

  const manage = () => guard(null, () => dispatch(showToast('Torneo sbloccato: ora puoi modificarlo.')))

  const handle = (event) => {
    if (event.kind === 'release') {
      return Boolean(combo || dateEdit || gamePicker || formatEdit)
    }
    if (formatEdit) {
      if (formatInput.current) {
        formatInput.current(event)
      } else if (event.kind === 'press' && event.button === 'b') {
        setFormatEdit(false)
      }
      return true
    }
    const press = event.kind === 'press'
    if (combo) {
      const button = comboButton(event)
      if (button) {
        setCombo({ ...combo, sequence: [...combo.sequence, button], message: '', error: false })
      } else if (press && event.button === 'start') {
        comboConfirm()
      } else if (press && event.button === 'select') {
        comboClear()
      }
      return true
    }
    if (dateEdit) {
      if (VERTICAL[event.button]) {
        setDateEdit({ ...dateEdit, date: stepDate(dateEdit.date, dateEdit.part, -VERTICAL[event.button]), message: '' })
      } else if (press && HORIZONTAL[event.button]) {
        setDateEdit({ ...dateEdit, part: stepPart(dateEdit.part, HORIZONTAL[event.button]) })
      } else if (press && event.button === 'a') {
        confirmDate()
      } else if (press && event.button === 'x') {
        clearDate()
      } else if (press && event.button === 'b') {
        setDateEdit(null)
      }
      return true
    }
    if (gamePicker) {
      const visible = gamePicker.games ? filterGames(gamePicker.games, state.pickerFilter) : []
      const index = Math.min(gamePicker.index, Math.max(0, visible.length - 1))
      if (VERTICAL[event.button]) {
        setGamePicker({ ...gamePicker, index: stepIndex(index, VERTICAL[event.button], visible.length, wraps(event)) })
      } else if (HORIZONTAL[event.button] && visible.length) {
        const next = Math.max(0, Math.min(visible.length - 1, index + HORIZONTAL[event.button] * GAME_PAGE))
        setGamePicker({ ...gamePicker, index: next })
      } else if (press && (event.button === 'lb' || event.button === 'rb')) {
        stepSystem(event.button === 'lb' ? -1 : 1)
      } else if (press && event.button === 'x') {
        searchGame()
      } else if (press && event.button === 'a' && visible[index]) {
        pickGame(visible[index])
      } else if (press && event.button === 'b') {
        closeGame()
      }
      return true
    }
    // Torneo aperto: B torna all'elenco (non chiude le Impostazioni).
    if (tournament && press && event.button === 'b') {
      close()
      return true
    }
    if (archived && press && event.button === 'b') {
      closeArchive()
      return true
    }
    if (series && !tournament && !archived && press) {
      if (event.button === 'b') {
        closeSeries()
        return true
      }
      if (event.button === 'lb' || event.button === 'rb') {
        setRankTab((current) => stepRanking(current, event.button === 'rb' ? 1 : -1))
        return true
      }
    }
    return false
  }

  let mode = null
  if (combo) {
    mode = 'tournamentCombo'
  } else if (dateEdit) {
    mode = 'tournamentDate'
  } else if (gamePicker) {
    mode = 'tournamentGame'
  } else if (formatEdit) {
    mode = formatContext
  } else if (tournament || archived) {
    mode = 'tournament'
  } else if (series) {
    mode = 'tournamentSeries'
  }

  const item = scope.item
  let panel
  if (!data) {
    panel = <p className={settingsStyles.empty}>Caricamento dei tornei…</p>
  } else if (archived) {
    panel = (
      <>
        <div className={settingsStyles.actions}>
          <button type="button" className={settingsStyles.action} {...item('tr:back', closeArchive)}>
            ◂ {archived.series.name}
          </button>
        </div>
        <ArchivedTournament tournament={archived} item={item} onDelete={removeArchived} />
      </>
    )
  } else if (!tournament && !series) {
    panel = (
      <>
        <div className={settingsStyles.coreIndex}>
          <span className={settingsStyles.coreIndexText}>
            {account === null
              ? 'Per creare una serie di tornei entra come P1 col tuo profilo. Tutti vedono i tornei, ognuno lo modifica solo chi l’ha creato.'
              : 'Ogni serie ha le sue edizioni: chi la crea ne è l’admin, tutti la vedono, solo lui la modifica.'}
          </span>
          <button type="button" className={`${settingsStyles.action} ${settingsStyles.primary}`} {...item('tr:new', create)}>
            ＋ Nuova serie
          </button>
        </div>
        {seriesList.length === 0 && <p className={settingsStyles.empty}>Nessuna serie.</p>}
        <div className={settingsStyles.systems}>
          {seriesList.map((entry) => {
            const last = entry.editions[0]
            return (
              <button key={entry.id} type="button" className={settingsStyles.systemRow}
                {...item(`tr:series:${entry.id}`, () => openSeries(entry.id))}>
                <span className={settingsStyles.systemName}>{entry.name}</span>
                <span className={settingsStyles.count}>
                  {[editionsLabel(entry.editions.length), last ? `ultima: ${editionLabel(last)} · ${statusLabel(last.status)}` : '',
                    `admin ${entry.creator.name}`].filter(Boolean).join(' · ')}
                </span>
                <span className={settingsStyles.open} aria-hidden="true">▸</span>
              </button>
            )
          })}
        </div>
      </>
    )
  } else if (!tournament) {
    panel = (
      <>
        <div className={settingsStyles.actions}>
          <button type="button" className={settingsStyles.action} {...item('tr:sback', closeSeries)}>
            ◂ Tutte le serie
          </button>
          <span className={settingsStyles.spacer} />
          <button type="button" className={`${settingsStyles.action} ${settingsStyles.primary}`} {...item('tr:snew', newEdition)}>
            ＋ Nuova edizione
          </button>
        </div>
        <div className={styles.seriesWindow}>
          <div className={styles.form}>
            <div className={settingsStyles.fields}>
              <TextField label="Nome della serie" value={series.name} focus={item('tr:sname', () => askSeriesText('name'))} />
              <TextField
                label="Descrizione della serie"
                value={series.description}
                placeholder="Facoltativa"
                focus={item('tr:sdesc', () => askSeriesText('seriesDescription'))}
              />
            </div>
            <h3 className={`pix ${styles.section}`}>EDIZIONI</h3>
            <div className={settingsStyles.systems}>
              {series.editions.map((entry) => (
                <button key={entry.id} type="button" className={settingsStyles.systemRow}
                  {...item(`tr:edition:${entry.id}`, () => (['done', 'cancelled'].includes(entry.status)
                    ? openArchive(entry.id) : open(entry.id)))}>
                  <span className={settingsStyles.systemName}>{editionLabel(entry)}</span>
                  <span className={settingsStyles.count}>
                    {[statusLabel(entry.status), formatDay(entry.finishedAt || entry.startsAt)].filter(Boolean).join(' · ')}
                  </span>
                  <span className={settingsStyles.open} aria-hidden="true">▸</span>
                </button>
              ))}
            </div>
            <div className={settingsStyles.actions}>
              <button type="button" className={`${settingsStyles.action} ${settingsStyles.danger}`} {...item('tr:sdelete', deleteSeries)}>
                Elimina serie
              </button>
            </div>
          </div>
          <div className={styles.form}>
            <h3 className={`pix ${styles.section}`}>CLASSIFICHE</h3>
            <SeriesRankings series={series} tab={rankTab} />
          </div>
        </div>
      </>
    )
  } else {
    panel = (
      <>
        <div className={settingsStyles.actions}>
          <button type="button" className={settingsStyles.action} {...item('tr:back', close)}>
            ◂ {tournament.series.name}
          </button>
        </div>
        <TournamentForm
          tournament={tournament}
          rewardXp={data.rewardXp}
          creator={creator}
          canEdit={canEdit}
          busy={busy}
          systems={state.systems}
          addons={tournamentAddons(state.addons, tournament)}
          item={item}
          on={{
            manage,
            title: () => askText('title'),
            description: () => askText('description'),
            date: openDate,
            game: openGame,
            save: openSave,
            maxPlayers: chooseMaxPlayers,
            format: openFormat,
            seeding: chooseSeeding,
            weight: chooseWeight,
            advantaged: chooseAdvantaged,
            savesLocked: () => toggle('savesLocked'),
            sides: chooseSides,
            rewards: () => toggle('rewards'),
            combo: chooseCombo,
            addonToggle: toggleAddon,
            addonMode: chooseAddonMode,
            publish,
            removeDraft,
            cancel: cancelTournament,
          }}
        />
      </>
    )
  }

  // L'archivio sta nella finestra di ogni serie.
  const history = null

  let overlay = null
  if (combo) {
    overlay = <ComboDialog combo={combo} onConfirm={comboConfirm} onClear={comboClear} onCancel={() => setCombo(null)} />
  } else if (dateEdit) {
    overlay = (
      <DateDialog
        edit={dateEdit}
        onPart={(part) => setDateEdit({ ...dateEdit, part })}
        onStep={(part, dir) => setDateEdit({ ...dateEdit, part, date: stepDate(dateEdit.date, part, dir), message: '' })}
        onConfirm={confirmDate}
        onClear={clearDate}
        onCancel={() => setDateEdit(null)}
      />
    )
  } else if (gamePicker) {
    overlay = (
      <GameDialog
        picker={gamePicker}
        systems={state.systems}
        filter={state.pickerFilter}
        keyboard={Boolean(state.osk)}
        onHover={(index) => setGamePicker({ ...gamePicker, index })}
        onPick={pickGame}
        onSystem={stepSystem}
        onSearch={searchGame}
        onCancel={() => {
          if (!state.osk) {
            closeGame()
          }
        }}
      />
    )
  } else if (formatEdit && tournament) {
    overlay = (
      <FormatDialog
        value={{
          format: tournament.format,
          options: tournament.options,
          seeding: tournament.seeding,
          seedingWeight: tournament.seedingWeight,
          advantagedSide: tournament.advantagedSide,
          roundSeries: tournament.roundSeries,
          finalSeries: tournament.finalSeries,
          thirdPlace: tournament.thirdPlace,
        }}
        sides={tournament.sides}
        general={false}
        inputRef={formatInput}
        onConfirm={confirmFormat}
        onCancel={() => setFormatEdit(false)}
        onContext={setFormatContext}
      />
    )
  }

  return { panel, history, overlay, mode, handle }
}

/**
 * Torneo dell'archivio in sola lettura: stato, admin, gioco, formato, iscritti
 * e date, il podio (non per gli annullati) e il tabellone, se c'è; in fondo
 * «Elimina dall'archivio».
 */
function ArchivedTournament({ tournament, item, onDelete }) {
  const matches = tournament.matches || []
  const done = tournament.status === 'done'
  const when = done ? tournament.finishedAt : tournament.updatedAt
  return (
    <div className={styles.form}>
      <div className={styles.head}>
        <span className={styles.status}>{statusLabel(tournament.status)}</span>
        <span className={styles.creator}>
          <span className={styles.swatch} style={{ background: tournament.creator.color || 'var(--text-3)' }} />
          Admin: {tournament.creator.name}
        </span>
      </div>
      <p className={`pix ${styles.archiveTitle}`}>{tournament.fullTitle}</p>
      <p className={styles.hint}>
        {[tournament.gameInfo ? tournament.gameInfo.title : 'Senza gioco',
          `${(tournament.players || []).length} iscritti`,
          when ? `${done ? 'concluso il' : 'annullato il'} ${formatDay(when)}` : ''].filter(Boolean).join(' · ')}
      </p>
      <p className={styles.hint}>{formatSummary(tournament)}</p>
      {tournament.description && <p className={styles.hint}>{tournament.description}</p>}
      {done && (
        <>
          <span className={styles.section}>PODIO</span>
          <Podium tournament={tournament} />
        </>
      )}
      {matches.length > 0 && (
        <>
          <span className={styles.section}>TABELLONE</span>
          <div className={styles.archiveBracket}>
            <Bracket matches={matches} players={tournament.players} next={null} focus={null} />
          </div>
        </>
      )}
      <div className={settingsStyles.actions}>
        <button type="button" className={`${settingsStyles.action} ${settingsStyles.danger}`}
          {...item('tr:archiveDelete', onDelete)}>
          Elimina dall’archivio
        </button>
      </div>
    </div>
  )
}

/** Campi del torneo, in sola lettura per chi non è il creatore (la scheda spiega perché). */
function TournamentForm({ tournament, rewardXp, creator, canEdit, busy, systems, addons, item, on }) {
  const game = tournament.gameInfo
  const system = game ? systems.find((entry) => entry.id === game.system) || { id: game.system } : null
  const draft = tournament.status === 'draft'
  let lock = null
  if (!creator) {
    lock = `Creato da ${tournament.creator.name}: solo lui può modificarlo.`
  } else if (!canEdit) {
    lock = 'Il torneo ha la combinazione dell’admin: inseriscila con «Gestisci» per modificarlo.'
  }
  const problem = draft ? publishProblem(tournament, new Date()) : null
  const [first, second, third] = rewardXp || []
  return (
    <div className={styles.form}>
      <div className={styles.head}>
        <span className={styles.status}>{statusLabel(tournament.status)}</span>
        <span className={styles.creator}>
          <span className={styles.swatch} style={{ background: tournament.creator.color || 'var(--text-3)' }} />
          Admin: {tournament.creator.name}
        </span>
        {creator && !canEdit && (
          <button type="button" className={`${settingsStyles.action} ${settingsStyles.primary}`} {...item('tr:manage', on.manage)}>
            Gestisci
          </button>
        )}
      </div>
      <p className={`pix ${styles.archiveTitle}`}>{tournament.fullTitle}</p>
      {lock && <p className={styles.hint}>{lock}</p>}
      {tournament.status === 'open' && (
        <p className={styles.hint}>
          Iscrizioni aperte. La scheda TOURNAMENT tra le console, con le iscrizioni, arriva con il prossimo passo.
        </p>
      )}

      <h3 className={`pix ${styles.section}`}>EDIZIONE</h3>
      <div className={settingsStyles.fields}>
        <TextField
          label="Titolo dell’edizione"
          value={tournament.title}
          placeholder="Facoltativo"
          note="Si aggiunge al nome della serie, per esempio «Japan version»"
          focus={item('tr:title', on.title)}
        />
        <TextField
          label="Descrizione dell’edizione"
          value={tournament.description}
          placeholder="Per esempio: Start alle 21:30"
          focus={item('tr:description', on.description)}
        />
        <TextField
          label="Data e ora d’inizio"
          value={formatStart(tournament.startsAt)}
          placeholder="Nessuna"
          note="Facoltative. All’ora fissata il torneo lo avvia comunque l’admin"
          focus={item('tr:date', on.date)}
        />
      </div>

      <h3 className={`pix ${styles.section}`}>GIOCO</h3>
      <div className={game ? styles.gameRow : undefined}>
        <div className={settingsStyles.fields}>
          <TextField
            label="Gioco"
            value={game ? `${game.title} · ${game.systemName}` : ''}
            placeholder="Scegli il gioco"
            note={game && game.missing ? 'Il gioco non è più nella libreria' : 'Di qualsiasi console'}
            focus={item('tr:game', on.game)}
          />
          <TextField
            label="Salvataggio di partenza"
            value={tournament.hasState ? `Registrato · core ${tournament.core}` : (game ? 'Nessuno, dall’inizio' : '')}
            placeholder="Scegli prima il gioco"
            note="Registra giocando: arrivi al punto giusto (per esempio la scelta dei personaggi) ed esci"
            focus={item('tr:save', on.save)}
          />
        </div>
        {game && (
          <div className={styles.thumbs}>
            <GameCover key={`${game.system}:${game.id}`} system={system} game={game} className={styles.cover} />
            {tournament.thumb && (
              <img
                className={styles.stateThumb}
                src={api.tournamentThumbUrl(tournament.id, tournament.updatedAt)}
                alt="Stato di partenza"
                draggable="false"
              />
            )}
          </div>
        )}
      </div>

      <h3 className={`pix ${styles.section}`}>FORMATO</h3>
      <div className={settingsStyles.fields}>
        <TextField
          label="Partecipanti massimi"
          value={playersLabel(tournament.maxPlayers)}
          note="Il tabellone si crea all’avvio, sugli iscritti"
          focus={item('tr:max', on.maxPlayers)}
        />
        <TextField
          label="Formato"
          value={formatLine(tournament, { seeding: false })}
          note="Formato e sue opzioni, come le serie delle partite · Conferma per cambiare"
          focus={item('tr:format', on.format)}
        />
        <TextField
          label="Teste di serie"
          value={(SEEDINGS.find((entry) => entry.id === tournament.seeding) || SEEDINGS[0]).label}
          note="Decidono il tabellone all’avvio · nella schermata «Avvia» si possono ancora cambiare"
          focus={item('tr:seeding', on.seeding)}
        />
        {tournament.seeding === 'mix' && (
          <TextField label="Pesi delle teste di serie" value={weightLabel(tournament.seedingWeight)}
            focus={item('tr:weight', on.weight)} />
        )}
      </div>

      <h3 className={`pix ${styles.section}`}>REGOLE</h3>
      <div className={settingsStyles.fields}>
        <TextField
          label="Menu dei salvataggi bloccato"
          value={tournament.savesLocked ? 'Sì' : 'No'}
          note="Durante gli incontri non si salva e non si carica · Conferma per cambiare"
          focus={item('tr:saves', on.savesLocked)}
        />
        <TextField label="Lati P1 / P2" value={sidesLabel(tournament.sides)} focus={item('tr:sides', on.sides)} />
        <TextField
          label="Lato vantaggiato"
          value={hasAdvantagedSide(tournament.sides) ? advantagedLabel(tournament.advantagedSide) : 'Non si usa con i lati liberi'}
          note="La testa di serie migliore parte nell’altro lato"
          focus={item('tr:advantaged', on.advantaged)}
        />
      </div>

      {addons.map((entry) => (
        <div key={entry.id}>
          <h3 className={`pix ${styles.section}`}>{entry.title.toUpperCase()}</h3>
          <div className={settingsStyles.fields}>
            <TextField
              label="Attiva"
              value={entry.enabled ? 'Sì' : 'No'}
              note={tournament.status === 'running'
                ? (entry.enabled ? 'A torneo in corso si può solo spegnere · Conferma per spegnere' : 'Spenta: non si riaccende')
                : 'Conferma per cambiare'}
              focus={item(`tr:addon:${entry.id}`, () => on.addonToggle(entry))}
            />
            <TextField
              label="Tipo di conteggio"
              value={entry.mode.label}
              note={entry.modes.length > 1 ? 'Conferma per cambiare' : 'L’unico per questo gioco'}
              focus={item(`tr:addon:${entry.id}:mode`, () => on.addonMode(entry))}
            />
          </div>
          <p className={styles.hint}>
            {entry.enabled ? entry.mode.text : 'Spenta: il vincitore di ogni partita lo dichiara l’admin.'}
          </p>
        </div>
      ))}

      <h3 className={`pix ${styles.section}`}>PREMI</h3>
      <div className={settingsStyles.fields}>
        <TextField
          label="XP e titolo sul profilo"
          value={tournament.rewards ? 'Sì' : 'No'}
          note={`${first} XP al 1°, ${second} al 2°, ${third} al 3° · Conferma per cambiare`}
          focus={item('tr:rewards', on.rewards)}
        />
      </div>

      <h3 className={`pix ${styles.section}`}>ADMIN</h3>
      <div className={settingsStyles.fields}>
        <TextField
          label="Combinazione dell’admin"
          value={comboLabel(tournament)}
          note="Vale per tutte le edizioni della serie. Senza, il creatore modifica senza sbloccare"
          focus={item('tr:combo', on.combo)}
        />
      </div>

      {problem && <p className={styles.hint}>Per pubblicare: {problem.charAt(0).toLowerCase() + problem.slice(1)}</p>}
      <div className={settingsStyles.actions}>
        {draft ? (
          <>
            <button type="button" className={`${settingsStyles.action} ${settingsStyles.danger}`} {...item('tr:delete', on.removeDraft)}>
              Elimina bozza
            </button>
            <span className={settingsStyles.spacer} />
            <button
              type="button"
              className={`${settingsStyles.action} ${settingsStyles.primary}`}
              disabled={Boolean(problem) || busy}
              {...item('tr:publish', on.publish)}
            >
              Pubblica
            </button>
          </>
        ) : (
          <button type="button" className={`${settingsStyles.action} ${settingsStyles.danger}`} {...item('tr:cancel', on.cancel)}>
            Annulla torneo
          </button>
        )}
      </div>
    </div>
  )
}
