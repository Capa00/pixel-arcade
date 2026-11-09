import { useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import { useFocusScope } from '../input/useFocusScope.js'
import { stepIndex, wraps } from '../input/wrap.js'
import {
  KEEP_NAME,
  MANUAL,
  NEW_FOLDER,
  RENAME,
  biosRows,
  canPickMany,
  cleanName,
  coreNote,
  destinationItems,
  firstFocus,
  focusedRow,
  importTarget,
  nameItems,
  rowNote,
  statusLabel,
} from '../lib/bios.js'
import { openKeyboard, setFocus, showToast } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import { moveChoice } from './confirmChoices.js'
import FileBrowser from './FileBrowser.jsx'
import PickerMenu from './PickerMenu.jsx'
import styles from './ConfigModal.module.css'
import own from './BiosModal.module.css'

const SCOPE = 'bios'
const VERTICAL = { up: -1, down: 1 }
const NAME_MAX = 64
const FOLDER_TARGET = 'biosFolder'
const NAME_TARGET = 'biosName'
const REPLACE_CHOICES = [
  { id: 'yes', label: 'Sostituisci', tone: 'danger' },
  { id: 'no', label: 'Annulla' },
]
const REMOVE_CHOICES = [
  { id: 'yes', label: 'Togli', tone: 'danger' },
  { id: 'no', label: 'Annulla' },
]
const STATUS_CLASSES = {
  ok: own.ok,
  present: own.ok,
  different: own.warn,
}

/**
 * Pagina «BIOS» di una console (livello 45): per ogni core i file di
 * sistema che dichiara (`.info`), quelli indicati dalle sue opzioni e quelli
 * aggiunti a mano, con lo stato (presente, versione diversa, mancante).
 *
 * A su un file apre il selettore (src/components/FileBrowser.jsx): il file
 * scelto si copia nella cartella dei BIOS con il nome atteso, con una
 * conferma se c'è già. Per una cartella dichiarata (`pcsx2/bios`) e per
 * «Aggiungi un BIOS…» si possono spuntare più file, copiati con il loro nome. «＋ Aggiungi un BIOS…» vale per ogni core, anche
 * quelli che non ne dichiarano: dopo il file si sceglie la cartella (quella
 * dei BIOS, una sua sottocartella o una nuova) e il nome. X toglie un file
 * copiato dalla dashboard, B chiude (`onClose(page)`, con lo stato aggiornato
 * dei BIOS). `core` è il core da evidenziare all'apertura; `inputRef` riceve la funzione che gestisce gli eventi,
 * `onContext` la legenda (`bios`, `biosRemove`, `files`, `picker`, `confirm`).
 */
export default function BiosModal({ system, title, core = null, inputRef, onContext, onClose }) {
  const { state, dispatch } = useApp()
  const [page, setPage] = useState(null)
  const [busy, setBusy] = useState(false)
  // Selettore aperto per `{core, row}` (`row` nulla = «Aggiungi un BIOS…»).
  const [browser, setBrowser] = useState(null)
  // Menu della cartella o del nome: `{kind, title, items, index}`.
  const [menu, setMenu] = useState(null)
  // File scelto per un BIOS aggiunto a mano: `{core, source, name, folder}`.
  const [pending, setPending] = useState(null)
  const [naming, setNaming] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const scope = useFocusScope(SCOPE)
  const browserInput = useRef(null)
  const started = useRef(false)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  const close = () => onClose(page)

  useEffect(() => {
    let active = true
    api.bios(system)
      .then((data) => active && setPage(data.bios))
      .catch((error) => {
        if (active) {
          dispatch(showToast(error.message, 'error'))
          closeRef.current(null)
        }
      })
    return () => {
      active = false
    }
  }, [system, dispatch])

  const rows = biosRows(page)
  const focused = focusedRow(rows, scope.focused)

  // All'apertura il focus va sul core chiesto.
  useEffect(() => {
    if (page && !started.current) {
      started.current = true
      const first = firstFocus(biosRows(page), core)
      if (first) {
        dispatch(setFocus(SCOPE, first))
      }
    }
  }, [page, core, dispatch])

  let context = 'bios'
  if (confirm) {
    context = 'confirm'
  } else if (browser) {
    context = browser.multi ? 'filesMulti' : 'files'
  } else if (menu) {
    context = 'picker'
  } else if (focused && focused.row && focused.row.removable) {
    context = 'biosRemove'
  }
  useEffect(() => {
    onContext(context)
  }, [context, onContext])

  // Copia i file uno dopo l'altro; quelli che ci sono già si sostituiscono tutti insieme dopo una sola conferma.
  const copyAll = async (requests, confirmed = false) => {
    setBusy(true)
    const copied = []
    const problems = []
    const asks = []
    let last = null
    try {
      for (const request of requests) {
        try {
          const data = await api.importBios({ system, ...request, confirm: confirmed })
          if (data.confirm) {
            asks.push({ request, text: data.confirm })
            continue
          }
          last = data.bios
          copied.push(data.saved.path)
          if (data.saved.warning) {
            problems.push(data.saved.warning)
          }
        } catch (error) {
          problems.push(requests.length > 1 ? `${request.source.split('/').pop()}: ${error.message}` : error.message)
        }
      }
    } finally {
      setBusy(false)
    }
    if (last) {
      setPage(last)
    }
    if (problems.length) {
      dispatch(showToast(problems.join(' · '), 'error'))
    } else if (copied.length) {
      dispatch(showToast(copied.length === 1 ? `BIOS copiato: ${copied[0]}` : `Copiati ${copied.length} file nella cartella dei BIOS`))
    }
    if (asks.length) {
      setConfirm({
        text: asks.length === 1 ? asks[0].text : `${asks.length} file ci sono già nella cartella dei BIOS. Sostituirli?`,
        choices: REPLACE_CHOICES,
        choice: 'no',
        onYes: () => copyAll(asks.map((ask) => ask.request), true),
      })
    }
  }

  const copy = (request) => copyAll([request])

  const remove = (row, owner) => {
    setConfirm({
      text: `Togliere ${row.path} dalla cartella dei BIOS?`,
      choices: REMOVE_CHOICES,
      choice: 'no',
      onYes: async () => {
        setBusy(true)
        try {
          const data = await api.removeBios({ system, core: owner, path: row.path })
          setPage(data.bios)
          dispatch(showToast(`BIOS tolto: ${row.path}`))
        } catch (error) {
          dispatch(showToast(error.message, 'error'))
        } finally {
          setBusy(false)
        }
      },
    })
  }

  const answer = (choice) => {
    const current = confirm
    setConfirm(null)
    if (current && choice === 'yes') {
      current.onYes()
    }
  }

  const askName = (next) => {
    setPending(next)
    setMenu({ kind: 'name', title: 'NOME DEL FILE', items: nameItems(next.name), index: 0 })
  }

  const picked = (entries) => {
    const open = browser
    setBrowser(null)
    if (open.row) {
      copyAll(entries.map((entry) => ({ core: open.core, source: entry.path, ...importTarget(open.row) })))
      return
    }
    setPending({ core: open.core, sources: entries, source: entries[0].path, name: entries[0].name, folder: '' })
    setMenu({
      kind: 'folder',
      title: entries.length > 1 ? `DOVE METTERE ${entries.length} FILE?` : 'DOVE METTERLO?',
      items: destinationItems(page.folders, open.core),
      index: 0,
    })
  }

  // Dopo la cartella: un file solo chiede il nome, più file tengono il loro.
  const placed = (next) => {
    if (next.sources.length > 1) {
      copyAll(next.sources.map((entry) => ({
        core: next.core, source: entry.path, target: MANUAL, folder: next.folder, name: entry.name,
      })))
    } else {
      askName(next)
    }
  }

  const typeText = (kind, value, placeholder) => {
    if (state.osk) {
      return
    }
    setNaming(kind)
    dispatch(openKeyboard('text', {
      value,
      max: NAME_MAX,
      title: kind === FOLDER_TARGET ? 'Nuova sottocartella' : 'Nome del file',
      placeholder,
      target: { kind },
    }))
  }

  const pickMenu = (position) => {
    const open = menu
    const entry = open.items[position]
    setMenu(null)
    if (!entry || !pending) {
      return
    }
    if (open.kind === 'folder') {
      if (entry.id === NEW_FOLDER) {
        typeText(FOLDER_TARGET, pending.core, 'Nome della sottocartella')
      } else {
        placed({ ...pending, folder: entry.id })
      }
    } else if (entry.id === RENAME) {
      typeText(NAME_TARGET, pending.name, 'Nome richiesto dal core')
    } else if (entry.id === KEEP_NAME) {
      copy({ core: pending.core, source: pending.source, target: MANUAL, folder: pending.folder, name: pending.name })
    }
  }

  // Funzioni di questo render, per l'effetto della tastiera (cambiano a ogni render).
  const latest = useRef(null)
  useEffect(() => {
    latest.current = { copy, placed }
  })

  // Tastiera chiusa: con la conferma il testo diventa la sottocartella o il nome.
  const keyboardText = state.keyboardText
  const keyboardOpen = Boolean(state.osk)
  useEffect(() => {
    if (!naming || keyboardOpen) {
      return
    }
    setNaming(null)
    if (!keyboardText || !keyboardText.target || keyboardText.target.kind !== naming || !pending) {
      return
    }
    const value = cleanName(keyboardText.value)
    if (!value) {
      dispatch(showToast('Nome non valido: senza / e non vuoto.', 'error'))
      return
    }
    if (naming === FOLDER_TARGET) {
      latest.current.placed({ ...pending, folder: value })
    } else {
      latest.current.copy({ core: pending.core, source: pending.source, target: MANUAL, folder: pending.folder, name: value })
    }
  }, [naming, keyboardOpen, keyboardText, pending, dispatch])

  const activate = (row) => {
    if (busy) {
      return
    }
    if (row.kind === 'add') {
      setBrowser({ core: row.core, row: null, multi: true })
    } else if (row.kind === 'file') {
      setBrowser({ core: row.core, row: row.row, multi: canPickMany(row.row) })
    }
  }

  const handle = (event) => {
    if (event.kind === 'release' || event.kind === 'text' || !page) {
      return true
    }
    const press = event.kind === 'press'
    if (confirm) {
      const choice = moveChoice(confirm.choices, confirm.choice, event.button, wraps(event))
      if (choice !== confirm.choice) {
        setConfirm({ ...confirm, choice })
      } else if (press && event.button === 'a') {
        answer(confirm.choice)
      } else if (press && event.button === 'b') {
        answer('no')
      }
      return true
    }
    if (browser) {
      if (browserInput.current) {
        browserInput.current(event)
      }
      return true
    }
    if (busy || naming) {
      return true
    }
    if (menu) {
      const step = VERTICAL[event.button]
      if (step && (press || event.kind === 'repeat')) {
        setMenu({ ...menu, index: stepIndex(menu.index, step, menu.items.length, wraps(event)) })
      } else if (press && event.button === 'a') {
        pickMenu(menu.index)
      } else if (press && event.button === 'b') {
        setMenu(null)
      }
      return true
    }
    if (scope.handle(event) || !press) {
      return true
    }
    if (event.button === 'x' && focused && focused.row && focused.row.removable) {
      remove(focused.row, focused.core)
    } else if (event.button === 'b') {
      close()
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
  return (
    <div
      className={styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy && !browser && !menu && !confirm) {
          close()
        }
      }}
    >
      <section
        className={styles.panel}
        role="dialog"
        aria-label={`BIOS · ${title}`}
        style={{ '--accent': info && info.accent ? info.accent : 'var(--p1)' }}
        ref={scope.ref}
      >
        <div className={styles.strip} />
        <header className={styles.head}>
          <span className={`pix ${styles.kicker}`}>BIOS · CONSOLE</span>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.sub}>
            Scegli il file dove si trova: la dashboard lo copia nella cartella dei BIOS con il nome giusto
          </p>
        </header>

        <div className={styles.list}>
          {!page.cores.length && <p className={styles.empty}>Nessun core di questa console ha un file .info.</p>}
          {rows.map((row) => {
            if (row.kind === 'heading') {
              const note = coreNote(row.entry)
              return (
                <div key={`h:${row.core}`} className={own.heading}>
                  <span className={`pix ${styles.group}`}>
                    {row.core.toUpperCase()}
                    {row.entry.label !== row.core ? ` · ${row.entry.label.toUpperCase()}` : ''}
                  </span>
                  {note && <span className={own.coreNote}>{note}</span>}
                </div>
              )
            }
            if (row.kind === 'add') {
              return (
                <button key={row.focus} type="button" className={`${styles.row} ${styles.fixedRow}`} {...scope.item(row.focus, () => activate(row))}>
                  <span className={styles.text}>
                    <span className={styles.name}>＋ Aggiungi un BIOS…</span>
                    <span className={styles.note}>Un file che la guida del core chiede e che qui non compare</span>
                  </span>
                </button>
              )
            }
            const file = row.row
            const tone = file.status === 'missing' ? (file.required ? own.bad : '') : STATUS_CLASSES[file.status]
            return (
              <button key={row.focus} type="button" className={styles.row} {...scope.item(row.focus, () => activate(row))}>
                <span className={styles.text}>
                  <span className={styles.name}>{file.folder ? `${file.path}/` : file.name}</span>
                  <span className={styles.note}>{rowNote(file)}</span>
                </span>
                {file.removable && <span className={own.added}>Copiato qui</span>}
                <span className={`pix ${own.status} ${tone}`}>{statusLabel(file).toUpperCase()}</span>
              </button>
            )
          })}
        </div>
        <p className={own.dir}>Cartella dei BIOS: {page.systemDir}</p>
      </section>

      {browser && (
        <FileBrowser
          title={browser.row ? `SCEGLI ${browser.row.folder ? `UN FILE PER ${browser.row.path}` : browser.row.name}` : `BIOS PER ${browser.core}`}
          multi={browser.multi}
          inputRef={browserInput}
          onPick={picked}
          onClose={() => setBrowser(null)}
        />
      )}
      {menu && (
        <PickerMenu
          title={menu.title}
          items={menu.items}
          index={menu.index}
          empty=""
          onHover={(index) => setMenu({ ...menu, index })}
          onPick={pickMenu}
          onClose={() => setMenu(null)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          text={confirm.text}
          choices={confirm.choices}
          choice={confirm.choice}
          onHover={(choice) => setConfirm({ ...confirm, choice })}
          onChoose={answer}
        />
      )}
    </div>
  )
}
