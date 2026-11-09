import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import { pointerActive } from '../input/pointer.js'
import { stepIndex, wraps } from '../input/wrap.js'
import { hiddenCount, rootOf, stepRoot, toggleAllFiles, toggleFile, visibleEntries } from '../lib/bios.js'
import { formatSize } from '../lib/format.js'
import { openKeyboard, setPickerFilter, showToast } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import styles from './FileBrowser.module.css'

const FILTER_MAX = 40
const VERTICAL = { up: -1, down: 1 }
// Ultima cartella aperta: la volta dopo il selettore riparte da lì.
let lastPath = null

/**
 * Selettore di file del disco (livello 50), in sola lettura
 * (`GET /api/files`). Croce su e giù sceglie la voce, A apre una cartella o
 * sceglie il file (`onPick([entry])`), B sale di una cartella (dalla radice
 * chiude, `onClose`), LB/RB passano da un punto di partenza all'altro
 * (cartella personale, dischi esterni, giochi, tutto il disco), X cerca per
 * nome con la tastiera a schermo (`purpose: 'filter'`; la ricerca di chi lo
 * apre torna alla chiusura), SELECT mostra anche i file nascosti e quelli
 * oltre 64 MB.
 *
 * Con `multi` A spunta i file (anche in cartelle diverse), Y spunta tutti
 * quelli della cartella e START li sceglie (`onPick(entries)`; senza spunte,
 * il file evidenziato). `inputRef` riceve la funzione che gestisce gli eventi.
 */
export default function FileBrowser({ title, multi = false, inputRef, onPick, onClose }) {
  const { state, dispatch } = useApp()
  const [listing, setListing] = useState(null)
  const [index, setIndex] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState(false)
  // File spuntati: percorso → voce.
  const [checked, setChecked] = useState(() => new Map())
  const listRef = useRef(null)
  const hostFilter = useRef(state.pickerFilter)
  const filter = state.pickerFilter
  const entries = visibleEntries(listing, showAll, filter)
  const current = Math.min(index, Math.max(0, entries.length - 1))

  useEffect(() => {
    const saved = hostFilter.current
    dispatch(setPickerFilter(''))
    return () => dispatch(setPickerFilter(saved))
  }, [dispatch])

  // Apre `path` (senza, il primo punto di partenza) ed evidenzia la voce `select`, se c'è.
  const load = useCallback(async (path, all, select = null) => {
    setBusy(true)
    try {
      let data
      try {
        data = await api.files(path, all)
      } catch (error) {
        if (!path || path !== lastPath) {
          throw error
        }
        data = await api.files(null, all)
      }
      lastPath = data.path
      dispatch(setPickerFilter(''))
      setListing(data)
      const shown = visibleEntries(data, all, '')
      setIndex(Math.max(0, shown.findIndex((entry) => entry.path === select)))
    } catch (error) {
      dispatch(showToast(error.message, 'error'))
    } finally {
      setBusy(false)
    }
  }, [dispatch])

  useEffect(() => {
    load(lastPath, false)
  }, [load])

  useEffect(() => {
    const active = listRef.current && listRef.current.children[current]
    if (active) {
      active.scrollIntoView({ block: 'nearest' })
    }
  }, [current, listing])

  const choose = (entry) => {
    if (!entry || busy) {
      return
    }
    if (entry.dir) {
      load(entry.path, showAll)
    } else if (multi) {
      setChecked(toggleFile(checked, entry))
    } else {
      onPick([entry])
    }
  }

  const finish = () => {
    if (busy) {
      return
    }
    if (checked.size) {
      onPick([...checked.values()])
    } else if (entries[current] && !entries[current].dir) {
      onPick([entries[current]])
    }
  }

  const goUp = () => {
    if (filter.trim()) {
      dispatch(setPickerFilter(''))
    } else if (listing && listing.parent) {
      load(listing.parent, showAll, listing.path)
    } else {
      onClose()
    }
  }

  const changeRoot = (dir) => {
    if (listing) {
      const root = stepRoot(listing.roots, rootOf(listing.roots, listing.path), dir)
      if (root) {
        load(root.path, showAll)
      }
    }
  }

  const toggleAll = () => {
    if (listing) {
      setShowAll(!showAll)
      load(listing.path, !showAll)
    }
  }

  const search = () => {
    if (!state.osk) {
      dispatch(openKeyboard('filter', {
        value: filter,
        max: FILTER_MAX,
        position: 'left',
        title: 'Cerca in questa cartella',
        placeholder: 'Nome del file',
      }))
    }
  }

  const handle = (event) => {
    if (event.kind === 'release' || event.kind === 'text') {
      return true
    }
    const press = event.kind === 'press'
    const step = VERTICAL[event.button]
    if (step && entries.length && (press || event.kind === 'repeat')) {
      setIndex(stepIndex(current, step, entries.length, wraps(event)))
    } else if (!press || busy) {
      return true
    } else if (event.button === 'a') {
      choose(entries[current])
    } else if (event.button === 'b') {
      goUp()
    } else if (event.button === 'lb' || event.button === 'rb') {
      changeRoot(event.button === 'lb' ? -1 : 1)
    } else if (event.button === 'select') {
      toggleAll()
    } else if (event.button === 'x') {
      search()
    } else if (multi && event.button === 'y') {
      setChecked(toggleAllFiles(checked, entries))
    } else if (multi && event.button === 'start') {
      finish()
    }
    return true
  }

  useEffect(() => {
    inputRef.current = handle
  })

  useEffect(() => () => {
    inputRef.current = null
  }, [inputRef])

  const root = listing ? rootOf(listing.roots, listing.path) : null
  const left = hiddenCount(listing, showAll)
  return (
    <div
      className={styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget && !state.osk) {
          onClose()
        }
      }}
    >
      <section className={styles.panel} role="dialog" aria-label={title}>
        <div className={`pix ${styles.title}`}>{title}</div>
        {listing && (
          <div className={styles.roots}>
            {listing.roots.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={root && root.id === entry.id ? `${styles.root} ${styles.rootActive}` : styles.root}
                onClick={() => load(entry.path, showAll)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        )}
        <p className={styles.path}>{listing ? listing.path : 'Apro la cartella…'}</p>
        {multi && (
          <p className={styles.counter}>
            {checked.size
              ? `${checked.size === 1 ? '1 file spuntato' : `${checked.size} file spuntati`} · START per copiarli`
              : 'A spunta i file, Y tutti quelli della cartella, START li copia'}
          </p>
        )}
        {filter.trim() && (
          <p className={styles.filter}>
            Cerca: «{filter.trim()}» · {entries.length === 1 ? '1 voce' : `${entries.length} voci`}
          </p>
        )}
        {entries.length ? (
          <ul className={styles.list} ref={listRef} role="listbox">
            {entries.map((entry, at) => (
              <li key={entry.path} role="option" aria-selected={at === current}>
                <button
                  type="button"
                  className={at === current ? `${styles.item} ${styles.active}` : styles.item}
                  onPointerEnter={(event) => {
                    if (pointerActive(event)) {
                      setIndex(at)
                    }
                  }}
                  onClick={() => {
                    setIndex(at)
                    choose(entry)
                  }}
                >
                  {multi && !entry.dir ? (
                    <span className={checked.has(entry.path) ? `${styles.check} ${styles.checked}` : styles.check}>
                      {checked.has(entry.path) ? '✓' : ''}
                    </span>
                  ) : (
                    <span className={entry.dir ? `${styles.icon} ${styles.folder}` : styles.icon}>{entry.dir ? '▸' : '·'}</span>
                  )}
                  <span className={styles.name}>{entry.name}</span>
                  <span className={styles.size}>{entry.dir ? 'Cartella' : formatSize(entry.size)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>
            {listing && filter.trim() ? 'Nessuna voce contiene il testo cercato.' : listing ? 'Cartella vuota.' : ''}
          </p>
        )}
        <p className={styles.hint}>
          {showAll ? 'Tutti i file, anche nascosti e grandi' : left ? `${left === 1 ? '1 file nascosto' : `${left} file nascosti`} (col punto o oltre 64 MB)` : 'Il file scelto si copia: l\'originale resta dov\'è'}
          {listing && listing.truncated ? ' · Troppi file: cerca per nome' : ''}
        </p>
      </section>
    </div>
  )
}
