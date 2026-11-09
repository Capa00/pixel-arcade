import { useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import FilterEditor from '../components/FilterEditor.jsx'
import ItemList from '../components/ItemList.jsx'
import TextField from '../components/TextField.jsx'
import { useFocusScope } from '../input/useFocusScope.js'
import { ANY, filterOptions, isExcluded, playerOptions, withExcluded } from '../lib/filters.js'
import { openKeyboard, setFocus, showToast } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import {
  EMPTY_PLAYLIST_FILTERS,
  META_FIELDS,
  PLAYED_LABELS,
  fieldSummary,
  inPlaylist,
  playedOptions,
  playlistFilterNames,
  playlistFilters,
  playlistHasFilters,
  savedFilters,
} from '../state/libraryFilters.js'
import { splitKey } from '../state/profiles.js'
import { playedKeys } from '../state/reducer.js'
import { PLAYLIST_NAME_MAX } from './LibraryLayer.jsx'
import styles from './Settings.module.css'

// Finestra di una playlist (nome, filtri, giochi aggiunti a mano).
const SCOPE = 'settingsPlaylist'
const TITLE_MAX = 40

/** «3 giochi aggiunti · filtri: Genere, Giocatori», oppure «Vuota». */
function playlistLabel(playlist) {
  const parts = []
  if (playlist.games.length) {
    parts.push(playlist.games.length === 1 ? '1 gioco aggiunto' : `${playlist.games.length} giochi aggiunti`)
  }
  const names = playlistFilterNames(playlist.filters)
  if (names) {
    parts.push(`filtri: ${names}`)
  }
  return parts.length ? parts.join(' · ') : 'Vuota'
}

/** Righe del pannello dei filtri di una playlist: titolo, metadati, Stato e «Azzera filtri». */
function editorRows(filters) {
  const active = playlistHasFilters(filters)
  return [
    {
      id: 'title',
      label: 'Titolo',
      kind: 'text',
      value: filters.title.trim() ? `«${filters.title.trim()}»` : 'Tutti',
      active: Boolean(filters.title.trim()),
    },
    ...META_FIELDS.map((field) => {
      const value = fieldSummary(filters, field.id, null, [])
      return { id: field.id, label: field.label, kind: field.kind, value, active: value !== 'Tutti' }
    }),
    {
      id: 'played',
      label: 'Stato',
      kind: 'single',
      value: filters.played ? `${PLAYED_LABELS[filters.played]} (dal P1)` : 'Tutti',
      active: Boolean(filters.played),
    },
    { id: 'reset', label: 'Azzera filtri', kind: 'action', disabled: !active, section: 'AZIONI' },
  ]
}

/**
 * Finestra di una playlist (livello 40): nome, filtri e giochi aggiunti a
 * mano (X o ✕ li tolgono), «Elimina playlist». Ha un proprio ambito di
 * navigazione (`item`, contenitore `scopeRef`).
 */
function PlaylistDialog({ playlist, summaries, scopeRef, item, onRename, onFilters, onGame, onRemove, onDelete, onClose }) {
  const listId = `pl:${playlist.id}`
  return (
    <div
      className={styles.modalOverlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section className={`${styles.modal} ${styles.playlistModal}`} role="dialog" aria-label={playlist.name} ref={scopeRef}>
        <div className={styles.systemHead}>
          <span className={`pix ${styles.systemName}`}>{playlist.name}</span>
          <span className={styles.count}>{playlistLabel(playlist)}</span>
          <button type="button" className={styles.modalClose} onClick={onClose}>
            Chiudi
          </button>
        </div>
        <div className={styles.playlistBody}>
          <div className={styles.fields}>
            <TextField label="Nome" value={playlist.name} focus={item(`${listId}:name`, onRename)} />
            <TextField
              label="Filtri"
              value={playlistFilterNames(playlist.filters)}
              placeholder="Nessun filtro"
              note="Un gioco è nella playlist se rispetta i filtri oppure se è aggiunto a mano"
              focus={item(`${listId}:filters`, onFilters)}
            />
          </div>
          <div className={styles.cores}>
            <div className={styles.caption}>
              Giochi aggiunti a mano: si aggiungono con «＋ Playlist» nella scheda di un gioco della libreria
            </div>
            {playlist.games.length === 0 && <p className={styles.empty}>Nessun gioco aggiunto a mano.</p>}
            <ItemList
              id={listId}
              items={playlist.games}
              item={item}
              muted={(key) => Boolean(summaries[key] && summaries[key].missing)}
              renderItem={(key) => {
                const summary = summaries[key]
                const title = summary ? summary.title : splitKey(key).id
                return (
                  <span className={styles.core}>
                    <span className={styles.coreName}>{title}</span>
                    <span className={styles.coreLabel}>{summary ? summary.systemName : splitKey(key).system}</span>
                    {summary && summary.missing && <span className={`${styles.tag} ${styles.missing}`}>non più presente</span>}
                  </span>
                )
              }}
              actions={[]}
              onActivateItem={onGame}
              onRemove={onRemove}
            />
          </div>
          <div className={styles.coreIndex}>
            <span className={styles.coreIndexText}>Le playlist sono condivise da tutti i giocatori.</span>
            <button type="button" className={`${styles.action} ${styles.danger}`} {...item(`${listId}:delete`, onDelete)}>
              Elimina playlist
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

/**
 * Scheda «Playlist» delle Impostazioni. Le modifiche si salvano subito (non
 * con «Salva»): elenco delle playlist con «＋ Nuova playlist», finestra di
 * una playlist e, sopra, il pannello dei suoi filtri (src/components/FilterEditor.jsx)
 * con i valori di tutte le console.
 *
 * `scope` è l'ambito di navigazione della vista (di nome `scopeName`); `ask(confirm)` e
 * `choose(picker)` aprono la conferma e il menu delle Impostazioni.
 * Restituisce `{panel, overlay, mode, handle}`: `panel` va nella scheda,
 * `overlay` sopra la vista, `mode` è la legenda (`null` se niente è aperto),
 * `handle(event)` gestisce l'evento e restituisce vero se finestra o filtri
 * sono aperti.
 */
export function usePlaylistSettings({ scope, scopeName, ask, choose }) {
  const { state, dispatch, loadAllGames, playlistCall } = useApp()
  const dialogScope = useFocusScope(SCOPE)
  const editorInput = useRef(null)
  const [openId, setOpenId] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editorContext, setEditorContext] = useState('filters')
  const [allGames, setAllGames] = useState(null)
  // Testo chiesto con la tastiera a schermo: `{kind: 'new' | 'rename' | 'title', id}`.
  const [naming, setNaming] = useState(null)
  const { playlists, playlistGames } = state
  const playlist = openId === null ? null : playlists.find((entry) => entry.id === openId) || null

  // Playlist eliminata altrove (o qui): la finestra si chiude.
  useEffect(() => {
    if (openId !== null && !playlist) {
      setOpenId(null)
      setEditing(false)
    }
  }, [openId, playlist])

  const keyboardText = state.keyboardText
  const keyboardOpen = Boolean(state.osk)
  useEffect(() => {
    if (!naming || keyboardOpen) {
      return
    }
    const request = naming
    setNaming(null)
    if (!keyboardText || !keyboardText.target || keyboardText.target.kind !== `playlist:${request.kind}`) {
      return
    }
    const value = keyboardText.value.trim()
    if (request.kind === 'title') {
      const current = state.playlists.find((entry) => entry.id === request.id)
      if (current) {
        const filters = savedFilters({ ...playlistFilters(current.filters), title: value })
        playlistCall(() => api.updatePlaylist(request.id, { filters }))
      }
      return
    }
    if (!value) {
      return
    }
    if (request.kind === 'rename') {
      playlistCall(() => api.updatePlaylist(request.id, { name: value }))
      return
    }
    playlistCall(() => api.createPlaylist({ name: value })).then((data) => {
      const created = data && data.playlists.find((entry) => entry.name.toLowerCase() === value.replace(/\s+/g, ' ').toLowerCase())
      if (created) {
        dispatch(showToast(`Playlist «${created.name}» creata.`))
        dispatch(setFocus(SCOPE, null))
        setOpenId(created.id)
      }
    })
  }, [naming, keyboardOpen, keyboardText, playlistCall, dispatch, state.playlists])

  const askText = (request, options) => {
    if (state.osk) {
      return
    }
    setNaming(request)
    dispatch(openKeyboard('text', { ...options, target: { kind: `playlist:${request.kind}` } }))
  }

  const create = () => askText({ kind: 'new' }, {
    max: PLAYLIST_NAME_MAX,
    title: 'Nome della nuova playlist',
    placeholder: 'Per esempio: Picchiaduro a 2',
  })

  const show = (id) => {
    dispatch(setFocus(SCOPE, null))
    setOpenId(id)
  }

  const close = () => {
    const id = openId
    setOpenId(null)
    setEditing(false)
    dispatch(setFocus(scopeName, `pl:${id}`))
  }

  const removeGame = (key) => {
    if (!playlist) {
      return
    }
    const at = playlist.games.indexOf(key)
    const next = playlist.games[at + 1] || playlist.games[at - 1]
    playlistCall(() => api.setPlaylistGame(playlist.id, key, false))
    dispatch(setFocus(SCOPE, next ? `pl:${playlist.id}:item:${next}` : `pl:${playlist.id}:filters`))
  }

  const gameActions = (key) => {
    const summary = playlistGames[key]
    choose({
      title: (summary ? summary.title : splitKey(key).id).toUpperCase(),
      items: [{ id: 'remove', label: 'Togli dalla playlist' }],
      index: 0,
      empty: '',
      onPick: () => removeGame(key),
    })
  }

  const remove = () => {
    if (!playlist) {
      return
    }
    const target = playlist
    ask({
      text: `Eliminare la playlist «${target.name}»? I giochi restano nella libreria.`,
      choice: 'no',
      onYes: async () => {
        const data = await playlistCall(() => api.deletePlaylist(target.id))
        if (data) {
          dispatch(showToast(`Playlist «${target.name}» eliminata.`))
        }
      },
    })
  }

  const openFilters = () => {
    setEditing(true)
    setAllGames(null)
    loadAllGames(state.systems, state.games).then(setAllGames)
  }

  const updateFilters = (patch) => {
    if (!playlist) {
      return
    }
    const filters = savedFilters({ ...playlistFilters(playlist.filters), ...patch })
    playlistCall(() => api.updatePlaylist(playlist.id, { filters }))
  }

  const handle = (event) => {
    if (editing && playlist) {
      if (editorInput.current) {
        editorInput.current(event)
      }
      return true
    }
    if (!playlist) {
      return false
    }
    if (dialogScope.handle(event) || event.kind !== 'press') {
      return true
    }
    if (event.button === 'b' || event.button === 'select') {
      close()
      return true
    }
    const prefix = `pl:${playlist.id}:item:`
    if (event.button === 'x' && dialogScope.focused && dialogScope.focused.startsWith(prefix)) {
      removeGame(dialogScope.focused.slice(prefix.length))
    }
    return true
  }

  let mode = null
  if (playlist && editing) {
    mode = editorContext
  } else if (playlist) {
    mode = 'playlist'
  }

  const panel = (
    <>
      <p className={styles.coreIndexText}>
        Condivise da tutti i giocatori: si usano dal pannello «Filtri» della libreria (X). Le modifiche si salvano subito.
      </p>
      {playlists.length === 0 && <p className={styles.empty}>Nessuna playlist.</p>}
      <div className={styles.systems}>
        {playlists.map((entry) => (
          <button key={entry.id} type="button" className={styles.systemRow} {...scope.item(`pl:${entry.id}`, () => show(entry.id))}>
            <span className={styles.systemName}>{entry.name}</span>
            <span className={styles.count}>{playlistLabel(entry)}</span>
            <span className={styles.open} aria-hidden="true">▸</span>
          </button>
        ))}
      </div>
      <div className={styles.coreIndex}>
        <span className={styles.coreIndexText}>
          Una playlist raccoglie i giochi aggiunti a mano e quelli che rispettano i suoi filtri, di tutte le console.
        </span>
        <button type="button" className={styles.action} {...scope.item('pl:new', create)}>
          ＋ Nuova playlist
        </button>
      </div>
    </>
  )

  let overlay = null
  if (playlist) {
    const filters = playlistFilters(playlist.filters)
    const flat = []
    if (allGames) {
      for (const system of state.systems) {
        for (const game of allGames[system.id] || []) {
          flat.push({ system: system.id, game })
        }
      }
    }
    const games = flat.map((entry) => entry.game)
    const played = playedKeys(state)
    const matching = flat.filter((entry) => inPlaylist(playlist, entry.system, entry.game, played)).length
    // Vero per i campi `multi` dei metadati, che hanno il modo «Nascondi».
    const hideable = (id) => META_FIELDS.some((entry) => entry.id === id && entry.kind === 'multi')
    const menuFor = (id) => {
      const field = META_FIELDS.find((entry) => entry.id === id)
      const title = (field ? field.label : 'Stato').toUpperCase()
      if (id === 'players') {
        return { title, items: playerOptions(games), current: filters.players || ANY }
      }
      if (id === 'played') {
        return { title, items: playedOptions(games, null, null), current: filters.played || ANY }
      }
      return {
        title,
        items: filterOptions(games, id, filters[id]),
        selected: filters[id],
        excluded: isExcluded(filters, id),
      }
    }
    overlay = (
      <>
        <PlaylistDialog
          playlist={playlist}
          summaries={playlistGames}
          scopeRef={dialogScope.ref}
          item={dialogScope.item}
          onRename={() => askText({ kind: 'rename', id: playlist.id }, {
            value: playlist.name,
            max: PLAYLIST_NAME_MAX,
            title: 'Nome della playlist',
          })}
          onFilters={openFilters}
          onGame={gameActions}
          onRemove={removeGame}
          onDelete={remove}
          onClose={close}
        />
        {editing && (
          <FilterEditor
            title={`FILTRI · ${playlist.name.toUpperCase()}`}
            count={allGames ? `${matching} giochi nella playlist` : 'Caricamento dei giochi…'}
            rows={editorRows(filters)}
            menuFor={menuFor}
            inputRef={editorInput}
            onContext={setEditorContext}
            onApply={(id, value, hide) => updateFilters({
              [id]: value === ANY ? null : value,
              ...(hideable(id) ? { exclude: withExcluded(filters, id, hide && value.length > 0) } : {}),
            })}
            onClear={(id) => updateFilters({
              [id]: EMPTY_PLAYLIST_FILTERS[id],
              ...(hideable(id) ? { exclude: withExcluded(filters, id, false) } : {}),
            })}
            onText={() => askText({ kind: 'title', id: playlist.id }, {
              value: filters.title,
              max: TITLE_MAX,
              title: 'Parole nel titolo',
              placeholder: 'Una parte del titolo',
            })}
            onSearch={() => askText({ kind: 'title', id: playlist.id }, {
              value: filters.title,
              max: TITLE_MAX,
              title: 'Parole nel titolo',
              placeholder: 'Una parte del titolo',
            })}
            onAction={(id) => id === 'reset' && updateFilters(EMPTY_PLAYLIST_FILTERS)}
            onDisabled={() => dispatch(showToast('Nessun filtro da togliere.'))}
            onClose={() => setEditing(false)}
          />
        )}
      </>
    )
  }

  return { panel, overlay, mode, handle }
}
