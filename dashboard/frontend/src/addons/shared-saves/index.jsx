import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as api from '../../api/client.js'
import FileBrowser from '../../components/FileBrowser.jsx'
import TextField from '../../components/TextField.jsx'
import { useFocusScope } from '../../input/useFocusScope.js'
import { formatSize } from '../../lib/format.js'
import { openKeyboard, setFocus, showToast } from '../../state/actions.js'
import { useApp } from '../../state/AppContext.jsx'
import styles from '../../views/Settings.module.css'
import { PREFIX, matchingGames, saveLabel } from './shared.js'

/**
 * Estensione «Salvataggi condivisi» (backend: pixelarcade/addons/shared-saves).
 * Scheda «Salvataggi» delle Impostazioni: cartella dei salvataggi condivisi,
 * aggiunta di un salvataggio (console, gioco, file, titolo e descrizione),
 * modifica ed eliminazione. Le modifiche si salvano subito, non con «Salva».
 * Nella modale dei salvataggi all'avvio di un gioco i salvataggi condivisi li
 * mostra il codice generico (src/components/SavesModal.jsx).
 */
export const id = 'shared-saves'

const SCOPE = 'settingsShared'
const LEGEND = 'sharedSave'
const KIND = 'shared-saves:'
const NEW = { kind: 'new', system: null, game: null, file: null, title: '', description: '' }

export const legends = {
  contexts: {
    [LEGEND]: [
      { id: 'a', face: 'south', key: ['Invio'], label: 'Seleziona' },
      { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
    ],
  },
}

/** Finestra di un salvataggio: nuovo (console, gioco, file) o già presente; titolo, descrizione e azioni. */
function SaveDialog({ draft, data, busy, systemName, scopeRef, item, onField, onSave, onDelete, onClose }) {
  const isNew = draft.kind === 'new'
  const ps2 = isNew && draft.system === 'ps2'
  let fileNote = 'Il salvataggio interno del core, per esempio .srm o .sav (.mcr per la PS1)'
  if (ps2) {
    fileNote = data.mymcplus
      ? 'Memory card .ps2 oppure salvataggio .max, .psu, .cbs, .xps, .sps, .npo'
      : 'Memory card .ps2 (per .max, .psu e simili serve mymcplus)'
  }
  return (
    <div
      className={styles.modalOverlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section className={`${styles.modal} ${styles.playlistModal}`} role="dialog" aria-label="Salvataggio condiviso" ref={scopeRef}>
        <div className={styles.systemHead}>
          <span className={`pix ${styles.systemName}`}>{isNew ? 'NUOVO SALVATAGGIO' : draft.item.title}</span>
          <span className={styles.count}>{isNew ? 'Uguale per tutti i profili' : `${draft.item.gameTitle} · ${draft.item.systemName}`}</span>
          <button type="button" className={styles.modalClose} onClick={onClose}>
            Chiudi
          </button>
        </div>
        <div className={styles.playlistBody}>
          <div className={styles.fields}>
            {isNew && (
              <>
                <TextField label="Console" value={draft.system ? systemName(draft.system) : ''} placeholder="Scegli la console" focus={item('ss:system', () => onField('system'))} autoFocus />
                <TextField
                  label="Gioco"
                  value={draft.game ? draft.game.title : ''}
                  placeholder={draft.system ? 'Cerca il gioco' : 'Prima scegli la console'}
                  focus={item('ss:game', () => onField('game'))}
                />
                <TextField
                  label="File"
                  value={draft.file ? `${draft.file.name} · ${formatSize(draft.file.size)}` : ''}
                  placeholder="Scegli il file"
                  note={fileNote}
                  focus={item('ss:file', () => onField('file'))}
                />
              </>
            )}
            <TextField label="Titolo" value={draft.title} placeholder="Per esempio: Tutto sbloccato" focus={item('ss:title', () => onField('title'))} autoFocus={!isNew} />
            <TextField label="Descrizione" value={draft.description} placeholder="Facoltativa" focus={item('ss:description', () => onField('description'))} />
          </div>
          <div className={styles.coreIndex}>
            <span className={styles.coreIndexText}>
              {isNew ? 'Si gioca dall’inizio con una copia: il salvataggio condiviso non cambia mai.' : `Cartella: ${draft.item.id}`}
            </span>
            {!isNew && (
              <button type="button" className={`${styles.action} ${styles.danger}`} {...item('ss:delete', onDelete)}>
                Elimina
              </button>
            )}
            <button type="button" className={`${styles.action} ${styles.primary}`} {...item('ss:save', onSave)}>
              {busy || 'Salva'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

/**
 * Contenuto della scheda (src/addons/registry.js, `settingsTab`). `scope` è
 * l'ambito di navigazione delle Impostazioni; `ask(confirm)` e
 * `choose(picker)` aprono la conferma e il menu delle Impostazioni;
 * `inputRef` riceve la gestione degli eventi della finestra, `onMode` la
 * legenda; `overlayHost` è dove va la finestra.
 */
function Tab({ scope, ask, choose, inputRef, onMode, overlayHost }) {
  const { state, dispatch } = useApp()
  const dialogScope = useFocusScope(SCOPE)
  // Selettore dei file col joypad (src/components/FileBrowser.jsx), aperto sopra la finestra.
  const [browsing, setBrowsing] = useState(false)
  const browserInput = useRef(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState('')
  // Testo chiesto con la tastiera a schermo: nome del campo.
  const [naming, setNaming] = useState(null)

  const call = useCallback(async (method, name, body) => {
    try {
      const result = await api.request(method, PREFIX + name, body)
      setData(result)
      setError('')
      return result
    } catch (failure) {
      dispatch(showToast(failure.message, 'error'))
      if (method === 'GET') {
        setError(failure.message)
      }
      return null
    }
  }, [dispatch])

  useEffect(() => {
    call('GET', 'settings')
  }, [call])

  const systemName = (systemId) => {
    const found = state.systems.find((entry) => entry.id === systemId)
    return found ? found.name : systemId
  }

  const close = () => {
    const wasNew = draft && draft.kind === 'new'
    setDraft(null)
    dispatch(setFocus('settings', wasNew ? 'ss:new' : null))
  }

  const askText = (field, options) => {
    if (state.osk) {
      return
    }
    setNaming(field)
    dispatch(openKeyboard('text', { ...options, target: { kind: KIND + field } }))
  }

  const pickGame = async (text, current) => {
    let games = state.games[current.system]
    if (!games) {
      try {
        games = (await api.games(current.system)).games
      } catch (failure) {
        dispatch(showToast(failure.message, 'error'))
        return
      }
    }
    const found = matchingGames(games, text)
    choose({
      title: `GIOCHI · ${text.toUpperCase() || 'TUTTI'}`,
      items: found.items.map((game) => ({ id: game.id, label: game.title, note: game.id })),
      index: 0,
      empty: 'Nessun gioco contiene il testo cercato.',
      onPick: (entry) => {
        const game = found.items.find((candidate) => candidate.id === entry.id)
        if (game) {
          setDraft((value) => value && { ...value, game: { id: game.id, title: game.title } })
        }
      },
    })
    if (found.more) {
      dispatch(showToast(`Mostro i primi ${found.items.length} giochi: scrivi qualche lettera in più.`))
    }
  }

  const keyboardText = state.keyboardText
  const keyboardOpen = Boolean(state.osk)
  useEffect(() => {
    if (!naming || keyboardOpen) {
      return
    }
    const field = naming
    setNaming(null)
    if (!keyboardText || !keyboardText.target || keyboardText.target.kind !== KIND + field) {
      return
    }
    const value = keyboardText.value.trim()
    if (field === 'root') {
      call('POST', 'settings', { root: value }).then((result) => result && dispatch(showToast('Cartella dei salvataggi condivisi aggiornata.')))
      return
    }
    if (field === 'game') {
      if (draft) {
        pickGame(value, draft)
      }
      return
    }
    setDraft((current) => current && { ...current, [field]: value })
    // `pickGame` e `call` non cambiano il significato tra un rendering e l'altro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naming, keyboardOpen, keyboardText])

  const onField = (field) => {
    if (field === 'file') {
      setBrowsing(true)
      return
    }
    if (field === 'system') {
      const systems = state.systems.filter((entry) => entry.count > 0)
      choose({
        title: 'CONSOLE',
        items: systems.map((entry) => ({ id: entry.id, label: entry.name })),
        index: Math.max(0, systems.findIndex((entry) => entry.id === draft.system)),
        empty: 'Nessuna console con giochi.',
        onPick: (entry) => {
          const picked = systems.find((candidate) => candidate.id === entry.id)
          if (picked) {
            setDraft((value) => value && { ...value, system: picked.id, game: value.system === picked.id ? value.game : null })
          }
        },
      })
      return
    }
    if (field === 'game') {
      if (!draft.system) {
        dispatch(showToast('Prima scegli la console.'))
        return
      }
      askText('game', { max: 40, title: 'Cerca il gioco', placeholder: 'Una parte del titolo (vuoto: tutti)' })
      return
    }
    if (field === 'title') {
      askText('title', { value: draft.title, max: data.titleMax, title: 'Titolo del salvataggio', placeholder: 'Per esempio: Tutto sbloccato' })
      return
    }
    askText('description', { value: draft.description, max: data.descriptionMax, title: 'Descrizione', placeholder: 'Cosa contiene' })
  }

  const saveNew = async () => {
    if (!draft.system || !draft.game) {
      dispatch(showToast('Scegli la console e il gioco.'))
      return
    }
    if (!draft.file) {
      dispatch(showToast('Scegli il file del salvataggio.'))
      return
    }
    if (!draft.title.trim()) {
      dispatch(showToast('Scrivi il titolo del salvataggio.'))
      return
    }
    const current = draft
    try {
      setBusy('Salvataggio…')
      const result = await api.request('POST', PREFIX + 'create', {
        path: current.file.path,
        system: current.system,
        game: current.game.id,
        title: current.title,
        description: current.description,
      })
      setData(result)
      setDraft(null)
      dispatch(setFocus('settings', `ss:item:${current.system}/${current.game.id}/${result.id}`))
      dispatch(showToast(result.note ? `Salvataggio aggiunto (${result.note}).` : 'Salvataggio aggiunto.'))
    } catch (failure) {
      dispatch(showToast(failure.message, 'error'))
    } finally {
      setBusy('')
    }
  }

  const saveEdit = async () => {
    const current = draft
    if (!current.title.trim()) {
      dispatch(showToast('Scrivi il titolo del salvataggio.'))
      return
    }
    const result = await call('POST', 'update', {
      system: current.item.system,
      game: current.item.game,
      id: current.item.id,
      title: current.title,
      description: current.description,
    })
    if (result) {
      setDraft(null)
      dispatch(showToast('Salvataggio aggiornato.'))
    }
  }

  const remove = () => {
    const target = draft.item
    ask({
      text: `Eliminare il salvataggio condiviso «${target.title}» di ${target.gameTitle}? Gli slot nati da qui restano, ma ripartono senza.`,
      choice: 'no',
      onYes: async () => {
        const result = await call('POST', 'delete', { system: target.system, game: target.game, id: target.id })
        if (result) {
          setDraft(null)
          dispatch(setFocus('settings', 'ss:new'))
          dispatch(showToast('Salvataggio eliminato.'))
        }
      },
    })
  }

  const pickFile = (entries) => {
    const file = entries[0]
    setBrowsing(false)
    if (file) {
      setDraft((value) => value && { ...value, file, title: value.title || file.name.replace(/\.[^.]+$/, '') })
    }
  }

  const handle = (event) => {
    if (browsing) {
      if (browserInput.current) {
        browserInput.current(event)
      }
      return true
    }
    if (!draft) {
      return false
    }
    if (dialogScope.handle(event) || event.kind !== 'press') {
      return true
    }
    if ((event.button === 'b' || event.button === 'select') && !busy) {
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

  useEffect(() => {
    let mode = null
    if (browsing) {
      mode = 'files'
    } else if (draft) {
      mode = LEGEND
    }
    onMode(mode)
  }, [browsing, draft, onMode])

  useEffect(() => () => onMode(null), [onMode])

  if (!data) {
    return <p className={styles.empty}>{error || 'Caricamento…'}</p>
  }

  const open = (entry) => {
    dispatch(setFocus(SCOPE, null))
    setDraft({ kind: 'edit', item: entry, title: entry.title, description: entry.description })
  }

  return (
    <>
      <p className={styles.coreIndexText}>
        Salvataggi uguali per tutti i profili: all’avvio del gioco compaiono sotto «Nuova partita». Si gioca con una copia, che a fine partita si butta; «Riprendi» e slot si salvano come sempre.
      </p>
      <div className={styles.fields}>
        <TextField
          label="Cartella"
          value={data.value}
          placeholder={data.default}
          note={data.value ? `In uso: ${data.root}` : 'Predefinita. Ogni salvataggio è una cartella <console>/<file del gioco>/<nome>/'}
          focus={scope.item('ss:root', () => askText('root', { value: data.value, max: 200, title: 'Cartella dei salvataggi condivisi', placeholder: 'Vuoto: quella predefinita' }))}
        />
      </div>
      {data.saves.length === 0 && <p className={styles.empty}>Nessun salvataggio condiviso.</p>}
      <div className={styles.systems}>
        {data.saves.map((entry) => (
          <button
            key={`${entry.system}/${entry.game}/${entry.id}`}
            type="button"
            className={styles.systemRow}
            {...scope.item(`ss:item:${entry.system}/${entry.game}/${entry.id}`, () => open(entry))}
          >
            <span className={styles.systemName}>{entry.title}</span>
            <span className={styles.count}>{saveLabel(entry)}</span>
            <span className={styles.open} aria-hidden="true">▸</span>
          </button>
        ))}
      </div>
      <div className={styles.coreIndex}>
        <span className={styles.coreIndexText}>
          {data.mymcplus ? 'PS2: si importano anche i salvataggi .max, .psu, .cbs e simili.' : 'PS2: senza mymcplus si caricano solo memory card .ps2.'}
        </span>
        <button type="button" className={styles.action} {...scope.item('ss:reload', () => call('GET', 'settings').then((result) => result && dispatch(showToast('Cartella riletta.'))))}>
          Rileggi la cartella
        </button>
        <button
          type="button"
          className={styles.action}
          {...scope.item('ss:new', () => {
            dispatch(setFocus(SCOPE, null))
            setDraft({ ...NEW })
          })}
        >
          ＋ Aggiungi salvataggio
        </button>
      </div>
      {draft && overlayHost && createPortal(
        <SaveDialog
          draft={draft}
          data={data}
          busy={busy}
          systemName={systemName}
          scopeRef={dialogScope.ref}
          item={dialogScope.item}
          onField={onField}
          onSave={() => !busy && (draft.kind === 'new' ? saveNew() : saveEdit())}
          onDelete={remove}
          onClose={() => !busy && close()}
        />,
        overlayHost,
      )}
      {draft && browsing && overlayHost && createPortal(
        <FileBrowser title="FILE DEL SALVATAGGIO" inputRef={browserInput} onPick={pickFile} onClose={() => setBrowsing(false)} />,
        overlayHost,
      )}
    </>
  )
}

export const settingsTab = { id: 'shared-saves', label: 'Salvataggi', title: 'SALVATAGGI CONDIVISI', Tab }
