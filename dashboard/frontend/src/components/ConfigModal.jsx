import { useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import { useFocusScope } from '../input/useFocusScope.js'
import { stepIndex, wraps } from '../input/wrap.js'
import {
  canReset,
  fixedRows,
  levelIndex,
  levelItems,
  levelOf,
  modeLabel,
  optionFocus,
  originLabel,
  stepCore,
  stepSection,
  valueItems,
  valueLabel,
  visibleOptions,
} from '../lib/gameConfig.js'
import { openKeyboard, setPickerFilter, showToast } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import BiosModal from './BiosModal.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import { moveChoice } from './confirmChoices.js'
import PickerMenu from './PickerMenu.jsx'
import styles from './ConfigModal.module.css'

const FILTER_MAX = 40
const VERTICAL = { up: -1, down: 1 }
const SIDEWAYS = { left: -1, right: 1 }
const CONFIRM_CHOICES = [
  { id: 'yes', label: 'Sostituisci', tone: 'danger' },
  { id: 'no', label: 'Annulla' },
]

/**
 * Pagina «Configurazione» (livello 45) di una console (`target.id` vuoto) o
 * di un gioco: `target` è `{system, id, title}`. Quattro sezioni (LB/RB o
 * clic): Grafica, Latenza, Audio, Emulazione (src/lib/gameConfig.js). Ogni
 * riga mostra il valore in uso e da dove viene.
 *
 * Nella Grafica la riga «Livello» sceglie un livello; cambiare un'opzione
 * crea la Personalizzata (con una conferma se ne sostituisce una già
 * salvata), che sparisce se torna uguale a un livello. Nella pagina della
 * console la riga «Core» (sinistra/destra o clic) sceglie il core di cui
 * vedere le opzioni; nel gioco vale il suo core. «Usa per tutta la console»
 * porta la Personalizzata del gioco sulla console.
 *
 * Nell'Emulazione la riga «BIOS» apre la pagina dei BIOS della console
 * (src/components/BiosModal.jsx), con il core della pagina in evidenza.
 *
 * A su un'opzione apre il menu dei valori, X la riporta all'origine, Y cerca
 * per nome con la tastiera a schermo (anche nel menu dei valori), B chiude.
 * Le modifiche si salvano subito e valgono dalla prossima partita.
 * `inputRef` riceve la funzione che gestisce gli eventi, `onContext` la
 * legenda (`config`, `configCore`, `configPicker`, `confirm` e quelle della pagina «BIOS»).
 */
export default function ConfigModal({ target, inputRef, onContext, onClose }) {
  const { state, dispatch } = useApp()
  const [page, setPage] = useState(null)
  const [core, setCore] = useState(null)
  const [section, setSection] = useState(0)
  const [busy, setBusy] = useState(false)
  // Menu dei valori o del livello: `{kind, title, option, items}` con l'indice in `pickerIndex`.
  const [picker, setPicker] = useState(null)
  const [pickerIndex, setPickerIndex] = useState(0)
  // Ricerca delle righe messa da parte mentre il menu dei valori ha la sua.
  const rowFilter = useRef('')
  const [confirm, setConfirm] = useState(null)
  // Pagina «BIOS» aperta dalla riga dell'Emulazione; alla chiusura la pagina si rilegge.
  const [biosOpen, setBiosOpen] = useState(false)
  const [biosContext, setBiosContext] = useState('bios')
  const [reload, setReload] = useState(0)
  const biosInput = useRef(null)
  const scope = useFocusScope(`config-${section}`)
  const { system, id } = target
  // `onClose` può cambiare a ogni render: il caricamento non deve ripartire per questo.
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    let active = true
    api.gameConfig(system, id, core)
      .then((data) => active && setPage(data.config))
      .catch((error) => {
        if (active) {
          dispatch(showToast(error.message, 'error'))
          closeRef.current()
        }
      })
    return () => {
      active = false
    }
  }, [system, id, core, reload, dispatch])

  useEffect(() => () => dispatch(setPickerFilter('')), [dispatch])

  const filter = state.pickerFilter
  const current = page ? page.sections[section] : null
  const fixed = page ? fixedRows(page, current.id) : []
  const options = current ? visibleOptions(current, picker ? rowFilter.current : filter) : []
  const pickerItems = picker ? (picker.option ? valueItems(picker.option, filter) : picker.items) : []
  const focusedOption = options.find((option) => optionFocus(option) === scope.focused) || null

  let context = 'config'
  if (biosOpen) {
    context = biosContext
  } else if (confirm) {
    context = 'confirm'
  } else if (picker) {
    context = 'configPicker'
  } else if (scope.focused === 'core') {
    context = 'configCore'
  }
  useEffect(() => {
    onContext(context)
  }, [context, onContext])

  // Chiamata al backend: con `{confirm}` chiede di sostituire la Personalizzata e la ripete confermata.
  const send = async (call) => {
    setBusy(true)
    try {
      const data = await call(false)
      if (data.confirm) {
        setConfirm({ text: data.confirm, choice: 'no', call })
      } else {
        setPage(data.config)
      }
    } catch (error) {
      dispatch(showToast(error.message, 'error'))
    } finally {
      setBusy(false)
    }
  }

  const answer = async (choice) => {
    const pending = confirm
    setConfirm(null)
    if (!pending || choice !== 'yes') {
      return
    }
    setBusy(true)
    try {
      const data = await pending.call(true)
      setPage(data.config)
    } catch (error) {
      dispatch(showToast(error.message, 'error'))
    } finally {
      setBusy(false)
    }
  }

  const setOption = (option, value) => send((confirmed) => api.saveConfigOption({
    system, id, core: page.core, source: option.source, key: option.key, value, confirm: confirmed,
  }))

  const openPicker = (next, index) => {
    rowFilter.current = filter
    dispatch(setPickerFilter(''))
    setPicker(next)
    setPickerIndex(index)
  }

  const closePicker = () => {
    setPicker(null)
    dispatch(setPickerFilter(rowFilter.current))
  }

  const chooseValue = (option) => {
    if (busy) {
      return
    }
    const items = valueItems(option)
    openPicker({ kind: 'value', title: option.label.toUpperCase(), option },
      Math.max(0, items.findIndex((item) => item.id === option.value)))
  }

  const chooseLevel = () => {
    if (busy) {
      return
    }
    const items = levelItems(page)
    openPicker({ kind: 'level', title: `LIVELLO · ${target.title}`, items }, levelIndex(page, items))
  }

  const pick = (position) => {
    const entry = pickerItems[position]
    const open = picker
    closePicker()
    if (!entry) {
      return
    }
    if (open.kind === 'level') {
      send(() => api.saveConfigLevel({ system, id, core: page.core, level: levelOf(entry) }))
    } else if (entry.id !== open.option.value) {
      setOption(open.option, entry.id)
    }
  }

  const promote = () => {
    if (!busy) {
      send((confirmed) => api.promoteConfig({ system, id, confirm: confirmed }))
    }
  }

  const changeCore = (dir) => {
    if (!busy && page) {
      setCore(stepCore(page, dir))
    }
  }

  const showSection = (index) => {
    setSection(index)
  }

  const search = () => {
    if (!state.osk) {
      dispatch(openKeyboard('filter', {
        value: filter,
        max: FILTER_MAX,
        position: 'left',
        title: picker ? `Cerca in ${picker.title.toLowerCase()}` : 'Cerca un\'opzione',
        placeholder: picker ? 'Nome del valore' : 'Nome dell\'opzione',
      }))
    }
  }

  const closeBios = () => {
    setBiosOpen(false)
    setReload((count) => count + 1)
  }

  const handle = (event) => {
    if (biosOpen) {
      if (biosInput.current) {
        biosInput.current(event)
      }
      return true
    }
    if (event.kind === 'release' || event.kind === 'text' || !page) {
      return true
    }
    const press = event.kind === 'press'
    if (confirm) {
      const choice = moveChoice(CONFIRM_CHOICES, confirm.choice, event.button, wraps(event))
      if (choice !== confirm.choice) {
        setConfirm({ ...confirm, choice })
      } else if (press && event.button === 'a') {
        answer(confirm.choice)
      } else if (press && event.button === 'b') {
        answer('no')
      }
      return true
    }
    if (busy) {
      return true
    }
    if (picker) {
      const step = VERTICAL[event.button]
      if (step && pickerItems.length && (press || event.kind === 'repeat')) {
        setPickerIndex(stepIndex(Math.min(pickerIndex, pickerItems.length - 1), step, pickerItems.length, wraps(event)))
      } else if (press && event.button === 'a') {
        pick(Math.min(pickerIndex, pickerItems.length - 1))
      } else if (press && event.button === 'y') {
        search()
      } else if (press && event.button === 'b') {
        closePicker()
      }
      return true
    }
    if (scope.focused === 'core' && SIDEWAYS[event.button] && press) {
      changeCore(SIDEWAYS[event.button])
      return true
    }
    if (scope.handle(event) || !press) {
      return true
    }
    if (event.button === 'lb' || event.button === 'rb') {
      showSection(stepSection(page, section, event.button === 'lb' ? -1 : 1))
    } else if (event.button === 'x' && focusedOption && canReset(page, focusedOption)) {
      setOption(focusedOption, null)
    } else if (event.button === 'y') {
      search()
    } else if (event.button === 'b') {
      onClose()
    }
    return true
  }

  useEffect(() => {
    inputRef.current = handle
  })

  useEffect(() => () => {
    inputRef.current = null
  }, [inputRef])

  if (!page) {
    return null
  }
  const info = state.systems.find((entry) => entry.id === system)
  const shownFilter = picker ? rowFilter.current : filter
  let lastGroup = null
  return (
    <div
      className={styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy && !picker && !confirm) {
          onClose()
        }
      }}
    >
      <section
        className={styles.panel}
        role="dialog"
        aria-label={`Configurazione · ${target.title}`}
        style={{ '--accent': info && info.accent ? info.accent : 'var(--p1)' }}
        ref={scope.ref}
      >
        <div className={styles.strip} />
        <header className={styles.head}>
          <span className={`pix ${styles.kicker}`}>{id ? 'CONFIGURAZIONE · GIOCO' : 'CONFIGURAZIONE · CONSOLE'}</span>
          <h2 className={styles.title}>{target.title}</h2>
          <p className={styles.sub}>
            {id ? `Core ${page.core || 'non scelto'} · ` : 'Per tutti i giochi · ogni gioco può avere la sua · '}
            Si salva subito, vale dalla prossima partita
          </p>
        </header>

        <div className={styles.tabs} role="tablist">
          {page.sections.map((entry, at) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={at === section}
              className={at === section ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => showSection(at)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {shownFilter.trim() && (
          <p className={styles.filter}>
            Cerca: «{shownFilter.trim()}» · {options.length === 1 ? '1 opzione' : `${options.length} opzioni`}
          </p>
        )}

        <div className={styles.list}>
          {fixed.includes('level') && (
            <button type="button" className={`${styles.row} ${styles.fixedRow}`} data-autofocus {...scope.item('level', chooseLevel)}>
              <span className={styles.text}>
                <span className={styles.name}>Livello</span>
                <span className={styles.note}>
                  {page.mode === 'custom' ? 'Livello con le opzioni cambiate da te' : 'Cambia un\'opzione per creare la Personalizzata'}
                </span>
              </span>
              <span className={styles.value}>{modeLabel(page)}</span>
            </button>
          )}
          {fixed.includes('core') && (
            <button
              type="button"
              className={`${styles.row} ${styles.fixedRow}`}
              data-autofocus={!fixed.includes('level') || undefined}
              {...scope.item('core', () => changeCore(1))}
            >
              <span className={styles.text}>
                <span className={styles.name}>Core</span>
                <span className={styles.note}>Le opzioni del core valgono per questo core in tutta la console</span>
              </span>
              <span className={styles.value}>◀ {page.core} ▶</span>
            </button>
          )}
          {fixed.includes('promote') && (
            <button type="button" className={`${styles.row} ${styles.fixedRow}`} {...scope.item('promote', promote)}>
              <span className={styles.text}>
                <span className={styles.name}>Usa per tutta la console</span>
                <span className={styles.note}>La Personalizzata di questo gioco diventa quella della console</span>
              </span>
            </button>
          )}
          {fixed.includes('bios') && (
            <button
              type="button"
              className={`${styles.row} ${styles.fixedRow}`}
              data-autofocus={!fixed.includes('core') || undefined}
              {...scope.item('bios', () => {
                if (!busy) {
                  setBiosOpen(true)
                }
              })}
            >
              <span className={styles.text}>
                <span className={styles.name}>BIOS</span>
                <span className={styles.note}>File di sistema di {page.core}: scegli dove si trovano, la dashboard li copia</span>
              </span>
              <span className={page.bios.status === 'missing' ? `${styles.value} ${styles.missing}` : styles.value}>
                {page.bios.label}
              </span>
            </button>
          )}
          {!page.coreOptions && (
            <p className={styles.empty}>
              {page.core ? `Opzioni di ${page.core} non disponibili: il core non le ha date.` : 'Nessun core installato.'}
            </p>
          )}
          {options.map((option, index) => {
            const heading = option.group !== lastGroup ? option.group : null
            lastGroup = option.group
            const changed = option.origin === 'custom' || option.origin === (id ? 'game' : 'console')
            return (
              <div key={optionFocus(option)} className={styles.entry}>
                {heading && <div className={`pix ${styles.group}`}>{heading.toUpperCase()}</div>}
                <button
                  type="button"
                  className={styles.row}
                  data-autofocus={(!fixed.length && index === 0) || undefined}
                  {...scope.item(optionFocus(option), () => chooseValue(option))}
                >
                  <span className={styles.text}>
                    <span className={styles.name}>{option.label}</span>
                    {option.info && <span className={styles.note}>{option.info}</span>}
                  </span>
                  <span className={styles.value}>{valueLabel(option)}</span>
                  <span className={changed ? `pix ${styles.origin} ${styles.changed}` : `pix ${styles.origin}`}>
                    {originLabel(option.origin).toUpperCase()}
                  </span>
                </button>
              </div>
            )
          })}
          {!options.length && shownFilter.trim() && <p className={styles.empty}>Nessuna opzione contiene il testo cercato.</p>}
        </div>
      </section>

      {picker && (
        <PickerMenu
          title={filter.trim() ? `${picker.title} · «${filter.trim()}»` : picker.title}
          items={pickerItems}
          index={Math.min(pickerIndex, Math.max(0, pickerItems.length - 1))}
          empty="Nessun valore contiene il testo cercato."
          onHover={setPickerIndex}
          onPick={(position) => {
            if (!state.osk) {
              pick(position)
            }
          }}
          onClose={() => {
            if (!state.osk) {
              closePicker()
            }
          }}
        />
      )}
      {biosOpen && (
        <BiosModal
          system={system}
          title={info && info.name ? info.name : target.title}
          core={page.core}
          inputRef={biosInput}
          onContext={setBiosContext}
          onClose={closeBios}
        />
      )}
      {confirm && (
        <ConfirmDialog
          text={confirm.text}
          choices={CONFIRM_CHOICES}
          choice={confirm.choice}
          onHover={(choice) => setConfirm({ ...confirm, choice })}
          onChoose={answer}
        />
      )}
    </div>
  )
}
