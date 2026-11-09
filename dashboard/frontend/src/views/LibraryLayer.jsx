import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import ConfigModal from '../components/ConfigModal.jsx'
import ControlsModal from '../components/ControlsModal.jsx'
import FilterEditor from '../components/FilterEditor.jsx'
import PickerMenu from '../components/PickerMenu.jsx'
import { SEARCH_MAX } from '../input/controller.js'
import { stepIndex, wraps } from '../input/wrap.js'
import { changedMap, controlPlayers, presentPlayers } from '../lib/controls.js'
import { ANY, filterOptions, isExcluded, playerOptions, shownFields, withExcluded } from '../lib/filters.js'
import { filterGames } from '../lib/search.js'
import {
  closeConfigMenu,
  closeControlsMenu,
  closeFilters,
  closeMoreMenu,
  closePlaylistMenu,
  openConfigMenu,
  openControlsMenu,
  openKeyboard,
  openPlaylistMenu,
  resetFilters,
  setFilter,
  setQuery,
  showGame,
  showToast,
} from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import {
  META_FIELDS,
  fieldSummary,
  filterLibrary,
  filtersForPlaylist,
  inPlaylist,
  playedOptions,
  playlistOptions,
} from '../state/libraryFilters.js'
import { gameKey } from '../state/profiles.js'
import { currentGames, currentSystem, filtered, filtersActive, playedKeys } from '../state/reducer.js'

// Lunghezza massima del nome di una playlist (come nel backend).
export const PLAYLIST_NAME_MAX = 32
const VERTICAL = { up: -1, down: 1 }

/** Elemento a caso di `list`, evitando `avoid` quando ce ne sono altri. */
function pick(list, avoid) {
  const pool = list.length > 1 && avoid ? list.filter((item) => item !== avoid) : list
  return pool[Math.floor(Math.random() * pool.length)]
}

/** Tastiera a schermo per il nome di una nuova playlist; il testo torna in `state.keyboardText`. */
function nameKeyboard(pad, target) {
  return openKeyboard('text', {
    owner: pad === undefined ? null : pad,
    max: PLAYLIST_NAME_MAX,
    title: 'Nome della nuova playlist',
    placeholder: 'Per esempio: Picchiaduro a 2',
    target,
  })
}

/** Righe del pannello «Filtri» della libreria. */
function filterRows(state, played, busy) {
  const { filters, query, playlists } = state
  const system = currentSystem(state)
  const any = Boolean(query.trim()) || filtersActive(state)
  return [
    { id: 'title', label: 'Titolo', kind: 'text', value: query.trim() ? `«${query.trim()}»` : 'Tutti', active: Boolean(query.trim()) },
    ...shownFields(META_FIELDS, currentGames(state)).map((field) => {
      const value = fieldSummary(filters, field.id, played, playlists)
      return { id: field.id, label: field.label, kind: field.kind, value, active: value !== 'Tutti' }
    }),
    {
      id: 'played',
      label: 'Stato',
      kind: 'single',
      value: fieldSummary(filters, 'played', played, playlists),
      active: Boolean(filters.played),
      disabled: !played,
    },
    {
      id: 'playlist',
      label: 'Playlist',
      kind: 'multi',
      value: playlists.length ? fieldSummary(filters, 'playlist', played, playlists) : 'Nessuna',
      active: filters.playlist.length > 0,
      disabled: !playlists.length,
    },
    { id: 'surprise', label: 'Sorprendimi', kind: 'action', value: system ? system.name : '', section: 'AZIONI' },
    { id: 'surpriseAll', label: 'Sorprendimi da tutte le console', kind: 'action', value: busy ? 'Caricamento…' : '' },
    { id: 'save', label: 'Salva come playlist', kind: 'action', disabled: !any },
    { id: 'reset', label: 'Azzera filtri', kind: 'action', disabled: !any },
  ]
}

// Spiegazioni per le righe non disponibili.
const DISABLED_MESSAGES = {
  played: 'Lo Stato vale per il profilo del P1: entra con START e scegli un profilo.',
  playlist: 'Nessuna playlist: creane una da Impostazioni → Playlist o con «＋ Playlist» nella scheda di un gioco.',
  save: 'Scegli prima qualche filtro da salvare.',
  reset: 'Nessun filtro attivo.',
}

/** Voci del menu «Playlist» del gioco `key` della console `system`. */
function playlistMenuItems(playlists, system, game, key, played) {
  return [
    { id: 'new', label: '＋ Nuova playlist…' },
    ...playlists.map((playlist) => {
      let note = ''
      if (playlist.games.includes(key)) {
        note = 'Aggiunto ✓'
      } else if (game && inPlaylist(playlist, system, game, played)) {
        note = 'Dai filtri'
      }
      return { id: String(playlist.id), label: playlist.name, note }
    }),
  ]
}

const CONTROLLER_LABELS = { dualshock: 'DualShock', digital: 'Digitale' }

/** Nota della voce «Controller»: quello che parte e se è automatico o scelto a mano. */
function controllerNote(info) {
  const value = CONTROLLER_LABELS[info.value] || info.value
  if (!info.choice) {
    return `${value} · automatico`
  }
  return `${value} · scelto a mano (automatico: ${CONTROLLER_LABELS[info.auto] || info.auto})`
}

/**
 * Voci del menu «Altro» (il core sta sotto «Gioca», src/components/GameActions.jsx). «Controller»
 * c'è solo per le console che lo scelgono (`controller` da `api.gameController`, PS1).
 */
function moreMenuItems(controller) {
  return [
    { id: 'controls', label: 'Comandi', note: 'Nomi e tasti delle azioni del gioco' },
    ...(controller ? [{ id: 'controller', label: 'Controller', note: controllerNote(controller) }] : []),
    { id: 'config', label: 'Configura', note: 'Grafica, audio, emulazione, uscita dal gioco' },
    { id: 'playlist', label: 'Playlist', note: 'Aggiungi o togli il gioco da una playlist' },
  ]
}

/**
 * Livello della libreria per il pannello «Filtri» (X), per il menu «Altro»
 * e per il menu «＋ Playlist» del gioco selezionato. Finché uno dei due è aperto riceve gli
 * eventi da App (`inputRef.current(event, target)`; solo quelli del joypad che
 * comanda la libreria, della tastiera e del mouse hanno effetto) e indica la
 * legenda con `onContext`.
 *
 * Nel pannello: Titolo (o X) apre la tastiera a schermo della ricerca;
 * Genere, Regione, Lingua, Anno, Sviluppatore, Editore, Tipo, Trofei e
 * Playlist aprono un menu a scelta multipla (quelli dei metadati con la riga
 * «Modo»: Mostra solo / Nascondi), Giocatori e Stato uno a scelta singola.
 * Tipo e Trofei compaiono solo se un gioco della console ha il dato. Le azioni:
 * «Sorprendimi» seleziona un gioco a caso tra quelli filtrati della console,
 * «Sorprendimi da tutte le console» tra quelli filtrati di tutte le console
 * (caricandole se serve); «Salva come playlist» chiede il nome e salva
 * filtri e ricerca come nuova playlist; «Azzera filtri» toglie filtri e ricerca.
 *
 * Nel menu «Altro»: A su «Comandi» apre la
 * finestra dei comandi, su «Controller» (giochi PS1) passa dal DualShock al
 * pad digitale e viceversa (vale dalla prossima partita; uguale a quello dei
 * metadati torna automatico) e il menu resta aperto, su «Configura» la pagina
 * «Configurazione», su «Playlist» il menu «＋ Playlist»; B chiude.
 *
 * Nel menu «＋ Playlist»: A su una playlist aggiunge o toglie il gioco
 * (aggiunto a mano), A su «Nuova playlist…» chiede il nome e la crea con il
 * gioco; B chiude.
 *
 * La pagina «Configurazione» del gioco (src/components/ConfigModal.jsx)
 * riceve gli eventi finché è aperta; B la chiude.
 */
export default function LibraryLayer({ inputRef, onContext }) {
  const { state, dispatch, loadAllGames, playlistCall } = useApp()
  const editorInput = useRef(null)
  const stateRef = useRef(state)
  const [busy, setBusy] = useState(false)
  const [menuIndex, setMenuIndex] = useState(0)
  const [moreIndex, setMoreIndex] = useState(0)
  // Controller emulato del gioco del menu «Altro»: `{key, data}` quando arriva (`data` `null` se la console non lo sceglie).
  const [controller, setController] = useState(null)
  // Nome di una nuova playlist chiesto con la tastiera a schermo: `{kind, filters | game}`.
  const [naming, setNaming] = useState(null)
  const [editorContext, setEditorContext] = useState(null)
  // Comandi del gioco della finestra «Comandi»: `{key, data}` quando arrivano.
  const [controls, setControls] = useState(null)
  const [controlsContext, setControlsContext] = useState('controls')
  const [controlsBusy, setControlsBusy] = useState(false)
  const controlsInput = useRef(null)
  const [configContext, setConfigContext] = useState('config')
  const configInput = useRef(null)
  useEffect(() => {
    stateRef.current = state
  })

  const controlsMenu = state.view === 'library' ? state.controlsMenu : null
  const configMenu = state.view === 'library' ? state.configMenu : null
  const moreMenu = state.view === 'library' ? state.moreMenu : null
  const open = state.view === 'library' &&
    (state.filtersOpen || Boolean(state.playlistMenu) || Boolean(controlsMenu) || Boolean(configMenu) || Boolean(moreMenu))
  let context = null
  if (controlsMenu) {
    context = controls ? controlsContext : 'picker'
  } else if (configMenu) {
    context = configContext
  } else if (state.view === 'library' && state.playlistMenu) {
    context = 'playlistMenu'
  } else if (moreMenu) {
    context = 'picker'
  } else if (state.view === 'library' && state.filtersOpen) {
    context = editorContext || 'filters'
  }
  useEffect(() => {
    onContext(context)
  }, [context, onContext])
  useEffect(() => () => onContext(null), [onContext])

  // Finestra «Comandi»: si caricano i comandi del gioco; senza nomi dei tasti si spiega e si chiude.
  const controlsKey = controlsMenu ? `${controlsMenu.system}/${controlsMenu.id}` : null
  useEffect(() => {
    setControls(null)
    setControlsContext('controls')
    const menu = stateRef.current.controlsMenu
    if (!controlsKey || !menu) {
      return undefined
    }
    let active = true
    api.gameControls(menu.system, menu.id)
      .then((data) => {
        if (!active) {
          return
        }
        if (!controlPlayers(data.controls).length) {
          dispatch(showToast('Avvia il gioco una volta: i nomi dei comandi li dà il core all\'avvio.'))
          dispatch(closeControlsMenu())
          return
        }
        setControls({ key: controlsKey, data: data.controls })
      })
      .catch((error) => {
        if (active) {
          dispatch(showToast(error.message, 'error'))
          dispatch(closeControlsMenu())
        }
      })
    return () => {
      active = false
    }
  }, [controlsKey, dispatch])

  const closeConfig = useCallback(() => dispatch(closeConfigMenu()), [dispatch])

  const saveControls = async (draft) => {
    if (!controlsMenu || controlsBusy) {
      return
    }
    setControlsBusy(true)
    try {
      await api.saveGameControls(controlsMenu.system, controlsMenu.id, changedMap(draft), draft.labels)
      dispatch(showToast('Comandi salvati: valgono dalla prossima partita.'))
      dispatch(closeControlsMenu())
    } catch (error) {
      dispatch(showToast(error.message, 'error'))
    } finally {
      setControlsBusy(false)
    }
  }

  // Il menu «Altro» si apre sempre sulla prima voce.
  const moreKey = moreMenu ? `${moreMenu.system}/${moreMenu.id}` : null
  useEffect(() => {
    setMoreIndex(0)
  }, [moreKey])

  // Controller del gioco del menu «Altro»: finché non arriva la voce non c'è.
  useEffect(() => {
    setController(null)
    const target = stateRef.current.moreMenu
    if (!moreKey || !target) {
      return undefined
    }
    let active = true
    api.gameController(target.system, target.id)
      .then((data) => {
        if (active) {
          setController({ key: moreKey, data: data.controller })
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [moreKey])
  const moreController = controller && controller.key === moreKey ? controller.data : null
  const moreItems = moreMenuItems(moreController)

  // Ogni volta che si apre il menu «＋ Playlist» il cursore parte da «Nuova playlist…».
  const menuKey = state.playlistMenu ? `${state.playlistMenu.system}/${state.playlistMenu.id}` : null
  useEffect(() => {
    setMenuIndex(0)
  }, [menuKey])

  // Tastiera chiusa: con la conferma si crea la playlist col nome scritto.
  const keyboardText = state.keyboardText
  const keyboardOpen = Boolean(state.osk)
  useEffect(() => {
    if (!naming || keyboardOpen) {
      return
    }
    const request = naming
    setNaming(null)
    if (!keyboardText || !keyboardText.target || keyboardText.target.kind !== request.kind) {
      return
    }
    const name = keyboardText.value.trim()
    if (!name) {
      return
    }
    const body = request.kind === 'playlistFromFilters'
      ? { name, filters: request.filters }
      : { name, games: [request.game] }
    playlistCall(() => api.createPlaylist(body)).then((data) => {
      if (data) {
        dispatch(showToast(request.kind === 'playlistFromFilters' ? `Playlist «${name}» creata.` : `Aggiunto alla nuova playlist «${name}».`))
      }
    })
  }, [naming, keyboardOpen, keyboardText, playlistCall, dispatch])

  const askName = (pad, request) => {
    setNaming(request)
    dispatch(nameKeyboard(pad, { kind: request.kind }))
  }

  const search = (pad) => {
    dispatch(openKeyboard('search', {
      owner: pad === undefined ? null : pad,
      value: stateRef.current.query,
      max: SEARCH_MAX,
      position: 'left',
    }))
  }

  const surprise = () => {
    const current = stateRef.current
    const games = filtered(current) || []
    if (!games.length) {
      dispatch(showToast('Nessun gioco rispetta i filtri in questa console.'))
      return
    }
    const game = pick(games, games[current.index])
    dispatch(showGame(current.systemId, game.id))
  }

  const surpriseAll = async () => {
    if (busy) {
      return
    }
    setBusy(true)
    try {
      const current = stateRef.current
      const all = await loadAllGames(current.systems, current.games)
      const played = playedKeys(current)
      const candidates = []
      for (const system of current.systems) {
        const games = all[system.id]
        if (!games) {
          continue
        }
        const list = filterLibrary(filterGames(games, current.query), system.id, current.filters, played, current.playlists)
        for (const game of list) {
          candidates.push({ system: system.id, id: game.id })
        }
      }
      if (!candidates.length) {
        dispatch(showToast('Nessun gioco rispetta i filtri in nessuna console.'))
        return
      }
      const choice = candidates[Math.floor(Math.random() * candidates.length)]
      dispatch(showGame(choice.system, choice.id))
    } finally {
      setBusy(false)
    }
  }

  const action = (id, pad) => {
    const current = stateRef.current
    if (id === 'surprise') {
      surprise()
    } else if (id === 'surpriseAll') {
      surpriseAll()
    } else if (id === 'save') {
      askName(pad, { kind: 'playlistFromFilters', filters: filtersForPlaylist(current.filters, current.query) })
    } else if (id === 'reset') {
      dispatch(resetFilters())
    }
  }

  const games = currentGames(state) || []
  const played = playedKeys(state)
  const system = currentSystem(state)

  const menuFor = (id) => {
    const field = META_FIELDS.find((entry) => entry.id === id)
    const title = (field ? field.label : { played: 'Stato', playlist: 'Playlist' }[id] || id).toUpperCase()
    if (id === 'players') {
      return { title, items: playerOptions(games), current: state.filters.players || ANY }
    }
    if (id === 'played') {
      return { title, items: playedOptions(games, state.systemId, played), current: state.filters.played || ANY }
    }
    if (id === 'playlist') {
      return { title, items: playlistOptions(state.playlists, games, state.systemId, played), selected: state.filters.playlist }
    }
    return {
      title,
      items: filterOptions(games, id, state.filters[id]),
      selected: state.filters[id],
      excluded: isExcluded(state.filters, id),
    }
  }

  // Valori scelti nel menu del campo `id`; per i campi dei metadati anche il modo «Nascondi» (`hide`).
  const applyFilter = (id, value, hide) => {
    dispatch(setFilter(id, value === ANY ? null : value))
    if (META_FIELDS.some((field) => field.id === id && field.kind === 'multi')) {
      dispatch(setFilter('exclude', withExcluded(state.filters, id, hide && value.length > 0)))
    }
  }

  const clearFilter = (id) => {
    if (id === 'title') {
      dispatch(setQuery(''))
      return
    }
    dispatch(setFilter(id, null))
    if (isExcluded(state.filters, id)) {
      dispatch(setFilter('exclude', withExcluded(state.filters, id, false)))
    }
  }

  // Menu «＋ Playlist».
  const menu = state.view === 'library' ? state.playlistMenu : null
  const menuGame = menu && state.games[menu.system] ? state.games[menu.system].find((game) => game.id === menu.id) : null
  const menuKeyValue = menu ? gameKey(menu.system, menu.id) : null
  const menuItems = menu ? playlistMenuItems(state.playlists, menu.system, menuGame, menuKeyValue, played) : []

  const moreGame = moreMenu && state.games[moreMenu.system]
    ? state.games[moreMenu.system].find((game) => game.id === moreMenu.id)
    : null

  // «Controller»: passa all'altro controller (DualShock ↔ digitale); il menu resta aperto.
  const switchController = (target, info) => {
    const next = info.value === 'dualshock' ? 'digital' : 'dualshock'
    const key = `${target.system}/${target.id}`
    api.saveGameController(target.system, target.id, next === info.auto ? null : next)
      .then((data) => {
        setController({ key, data: data.controller })
        const label = CONTROLLER_LABELS[data.controller.value] || data.controller.value
        dispatch(showToast(`Controller ${label}: vale dalla prossima partita.`))
      })
      .catch((error) => dispatch(showToast(error.message, 'error')))
  }

  // Voce del menu «Altro»: lo chiude e apre la finestra scelta («Controller» lo lascia aperto).
  const chooseMore = (position) => {
    const current = stateRef.current
    const target = current.moreMenu
    const item = moreItems[position]
    if (target && item && item.id === 'controller' && moreController) {
      switchController(target, moreController)
      return
    }
    dispatch(closeMoreMenu())
    if (!target || !item) {
      return
    }
    if (item.id === 'controls') {
      dispatch(openControlsMenu())
    } else if (item.id === 'config') {
      dispatch(openConfigMenu())
    } else if (item.id === 'playlist') {
      dispatch(openPlaylistMenu())
    }
  }

  const choosePlaylist = (position, pad) => {
    const current = stateRef.current
    const target = current.playlistMenu
    if (!target) {
      return
    }
    const key = gameKey(target.system, target.id)
    const items = playlistMenuItems(current.playlists, target.system, null, key, null)
    const item = items[position]
    if (!item) {
      return
    }
    if (item.id === 'new') {
      askName(pad, { kind: 'playlistWithGame', game: key })
      return
    }
    const playlist = current.playlists.find((entry) => String(entry.id) === item.id)
    if (!playlist) {
      return
    }
    const on = !playlist.games.includes(key)
    playlistCall(() => api.setPlaylistGame(playlist.id, key, on)).then((data) => {
      if (data) {
        dispatch(showToast(on ? `Aggiunto a «${playlist.name}».` : `Tolto da «${playlist.name}».`))
      }
    })
  }

  useEffect(() => {
    inputRef.current = (event, target) => {
      const current = stateRef.current
      if (current.view !== 'library' || current.osk ||
        (!current.filtersOpen && !current.playlistMenu && !current.controlsMenu && !current.configMenu && !current.moreMenu)) {
        return false
      }
      if (target && target.to !== 'app' && target.to !== 'start') {
        return true
      }
      if (current.controlsMenu) {
        if (controlsInput.current) {
          controlsInput.current(event)
        } else if (event.kind === 'press' && event.button === 'b') {
          dispatch(closeControlsMenu())
        }
        return true
      }
      if (current.configMenu) {
        if (configInput.current) {
          configInput.current(event)
        } else if (event.kind === 'press' && event.button === 'b') {
          dispatch(closeConfigMenu())
        }
        return true
      }
      if (current.moreMenu) {
        const count = moreItems.length
        const press = event.kind === 'press'
        const step = VERTICAL[event.button]
        if (step && (press || event.kind === 'repeat')) {
          setMoreIndex(stepIndex(Math.min(moreIndex, count - 1), step, count, wraps(event)))
        } else if (press && event.button === 'a') {
          chooseMore(Math.min(moreIndex, count - 1))
        } else if (press && event.button === 'b') {
          dispatch(closeMoreMenu())
        }
        return true
      }
      if (current.playlistMenu) {
        const count = playlistMenuItems(current.playlists, current.playlistMenu.system, null, '', null).length
        const press = event.kind === 'press'
        const step = VERTICAL[event.button]
        const index = Math.min(menuIndex, count - 1)
        if (step && (press || event.kind === 'repeat')) {
          setMenuIndex(stepIndex(index, step, count, wraps(event)))
        } else if (press && event.button === 'a') {
          choosePlaylist(index, event.pad)
        } else if (press && event.button === 'b') {
          dispatch(closePlaylistMenu())
        }
        return true
      }
      if (editorInput.current) {
        editorInput.current(event)
      }
      return true
    }
  })

  useEffect(() => () => {
    inputRef.current = null
  }, [inputRef])

  if (!open) {
    return null
  }
  const shown = filtered(state)
  if (configMenu) {
    return (
      <ConfigModal
        key={`${configMenu.system}/${configMenu.id}`}
        target={configMenu}
        inputRef={configInput}
        onContext={setConfigContext}
        onClose={closeConfig}
      />
    )
  }
  if (controlsMenu) {
    return controls && controls.key === controlsKey ? (
      <ControlsModal
        key={controls.key}
        title={controlsMenu.title}
        controls={controls.data}
        present={presentPlayers(state.players)}
        busy={controlsBusy}
        inputRef={controlsInput}
        onContext={setControlsContext}
        onSave={saveControls}
        onClose={() => dispatch(closeControlsMenu())}
      />
    ) : null
  }
  return (
    <>
      {state.filtersOpen && !menu && (
        <FilterEditor
          title="FILTRI"
          accent={system ? system.accent : null}
          count={shown ? `${shown.length} di ${games.length} giochi` : ''}
          rows={filterRows(state, played, busy)}
          menuFor={menuFor}
          inputRef={editorInput}
          onContext={setEditorContext}
          onApply={applyFilter}
          onClear={clearFilter}
          onText={(id, pad) => search(pad)}
          onSearch={search}
          onAction={action}
          onDisabled={(row) => DISABLED_MESSAGES[row.id] && dispatch(showToast(DISABLED_MESSAGES[row.id]))}
          onClose={() => dispatch(closeFilters())}
        />
      )}
      {moreMenu && !menu && (
        <PickerMenu
          title={moreGame ? moreGame.title.toUpperCase() : 'ALTRO'}
          items={moreItems}
          index={moreIndex}
          empty=""
          onHover={setMoreIndex}
          onPick={(position) => {
            if (!state.osk) {
              chooseMore(position)
            }
          }}
          onClose={() => {
            if (!state.osk) {
              dispatch(closeMoreMenu())
            }
          }}
        />
      )}
      {menu && (
        <PickerMenu
          title={menuGame ? `PLAYLIST · ${menuGame.title}` : 'PLAYLIST'}
          items={menuItems}
          index={Math.min(menuIndex, menuItems.length - 1)}
          empty=""
          onHover={setMenuIndex}
          onPick={(position) => {
            if (!state.osk) {
              setMenuIndex(position)
              choosePlaylist(position, null)
            }
          }}
          onClose={() => {
            if (!state.osk) {
              dispatch(closePlaylistMenu())
            }
          }}
        />
      )}
    </>
  )
}
