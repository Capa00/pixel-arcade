import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react'
import * as api from '../api/client.js'
import {
  bootstrapLoaded,
  coresRefreshed,
  coresRefreshFailed,
  coresRefreshing,
  favoriteSynced,
  gamesLoaded,
  loadFailed,
  playedLoaded,
  playlistsLoaded,
  profileCreated,
  profileFailed,
  profileSaving,
  profileSynced,
  profilesLoaded,
  settingsFailed,
  settingsLoaded,
  settingsSaveFailed,
  settingsSaved,
  settingsSaving,
  showToast,
  syncFailed,
  systemsLoaded,
} from './actions.js'
import { currentSystem, initialState, reducer } from './reducer.js'
import { randomThemeId } from '../lib/themes.js'

// Metadati in arrivo (`pending` di `GET /api/games`): i giochi si rileggono dopo questo intervallo.
const PENDING_MS = 2000

// Il tema casuale si estrae una volta all'avvio della pagina.
function withRandomTheme(state) {
  return { ...state, randomTheme: randomThemeId() }
}

const AppContext = createContext(null)

/**
 * Fornisce `state`, `dispatch` e le operazioni asincrone: `loadGames`,
 * `loadAllGames`, `loadSettings`, `saveSettings(payload)`, `rescanLibrary`, `refreshCores`,
 * `loadProfiles`, `createProfile(slot, form)` e `playlistCall(chiamata)`.
 * All'avvio carica `/api/bootstrap` e i profili; quando cambia console carica i suoi giochi.
 * Finché il backend calcola i checksum per i metadati (`pending`), i giochi
 * della console selezionata si rileggono ogni `PENDING_MS`; quelli di
 * un'altra console si rileggono quando si torna su di essa.
 * Le modifiche ottimistiche a preferiti e preferenze (`state.sync`,
 * src/state/profiles.js) vengono inviate al backend appena compaiono.
 * All'avvio arrivano anche le playlist; i giochi già giocati dal P1 (filtro
 * Stato) si leggono quando entra il suo profilo e alla fine di ogni partita.
 */
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState, withRandomTheme)
  const loading = useRef(new Set())
  // Console selezionata, per il ricaricamento dei metadati, e console da rileggere quando si torna su di esse.
  const selected = useRef(null)
  const stale = useRef(new Set())

  // Restituisce i giochi letti, oppure `null` (caricamento già in corso o non riuscito).
  const loadGames = useCallback(async (system) => {
    if (loading.current.has(system)) {
      return null
    }
    loading.current.add(system)
    stale.current.delete(system)
    let pending = false
    let games = null
    try {
      const data = await api.games(system)
      games = data.games
      dispatch(gamesLoaded(system, games))
      pending = data.pending > 0
    } catch (error) {
      dispatch(showToast(error.message))
    } finally {
      loading.current.delete(system)
    }
    if (pending) {
      window.setTimeout(() => {
        if (selected.current === system) {
          loadGames(system)
        } else {
          stale.current.add(system)
        }
      }, PENDING_MS)
    }
    return games
  }, [])

  // Giochi di tutte le console (per «Sorprendimi» da tutte le console e per i filtri delle playlist):
  // `{console: giochi}`, con quelli già caricati presi da `known` e gli altri letti ora.
  const loadAllGames = useCallback(async (systems, known) => {
    const result = {}
    await Promise.all(systems.map(async (system) => {
      let games = known[system.id] || (await loadGames(system.id))
      if (!games) {
        // Caricamento già in corso altrove: si rilegge qui, così i giochi arrivano comunque nello stato.
        try {
          games = (await api.games(system.id)).games
          dispatch(gamesLoaded(system.id, games))
        } catch {
          games = null
        }
      }
      if (games) {
        result[system.id] = games
      }
    }))
    return result
  }, [loadGames])

  // Chiamata alle API delle playlist: le playlist ricevute entrano nello stato; un errore diventa una notifica.
  // Restituisce i dati ricevuti, oppure `null`.
  const playlistCall = useCallback(async (call) => {
    try {
      const data = await call()
      dispatch(playlistsLoaded(data.playlists, data.games))
      return data
    } catch (error) {
      dispatch(showToast(error.message, 'error'))
      return null
    }
  }, [])

  const loadSettings = useCallback(async () => {
    try {
      dispatch(settingsLoaded(await api.settings()))
    } catch (error) {
      dispatch(settingsFailed(error.message))
    }
  }, [])

  // Dopo il salvataggio si rileggono i sistemi della libreria (core, prontezza, estensioni).
  // Restituisce `{saved: true}` oppure `{saved: false, error}` (l'errore resta anche in fondo alle Impostazioni).
  const saveSettings = useCallback(async (payload) => {
    dispatch(settingsSaving())
    try {
      dispatch(settingsSaved(await api.saveSettings(payload)))
    } catch (error) {
      dispatch(settingsSaveFailed(error.message))
      return { saved: false, error: error.message }
    }
    dispatch(showToast('Impostazioni salvate.'))
    try {
      dispatch(systemsLoaded((await api.rescan()).systems))
    } catch (error) {
      dispatch(showToast(error.message))
    }
    return { saved: true }
  }, [])

  // Riscarica l'elenco dei core scaricabili; la bozza resta e la libreria si rilegge (prontezza delle console).
  const refreshCores = useCallback(async () => {
    dispatch(coresRefreshing())
    try {
      dispatch(coresRefreshed(await api.refreshCores()))
    } catch (error) {
      dispatch(coresRefreshFailed(error.message))
      return
    }
    dispatch(showToast('Elenco dei core aggiornato.'))
    try {
      dispatch(systemsLoaded((await api.rescan()).systems))
    } catch (error) {
      dispatch(showToast(error.message))
    }
  }, [])

  // Rilegge la libreria dal disco; le Impostazioni si aggiornano mantenendo le modifiche non salvate.
  const rescanLibrary = useCallback(async () => {
    try {
      dispatch(systemsLoaded((await api.rescan()).systems))
      dispatch(settingsLoaded(await api.settings(), true))
      dispatch(showToast('Libreria aggiornata.'))
    } catch (error) {
      dispatch(showToast(error.message))
    }
  }, [])

  const loadProfiles = useCallback(async () => {
    try {
      const data = await api.profiles()
      dispatch(profilesLoaded(data.accounts, data.games))
    } catch (error) {
      dispatch(showToast(error.message, 'error'))
    }
  }, [])

  // Nuovo profilo dallo slot `slot`: entra nell'elenco e nello slot; l'errore resta sotto il nome.
  const createProfile = useCallback(async (slot, form) => {
    dispatch(profileSaving(slot))
    try {
      const account = await api.createProfile({ name: form.name, color: form.color, favConsole: form.console })
      dispatch(profileCreated(slot, account))
    } catch (error) {
      dispatch(profileFailed(slot, error.message))
    }
  }, [])

  useEffect(() => {
    let active = true
    api.bootstrap()
      .then((data) => {
        if (active) {
          dispatch(bootstrapLoaded(data))
          loadProfiles()
          playlistCall(api.playlists)
        }
      })
      .catch((error) => {
        if (active) {
          dispatch(loadFailed(error.message))
        }
      })
    return () => {
      active = false
    }
  }, [loadProfiles, playlistCall])

  // Giochi già giocati dal profilo del P1: all'ingresso del profilo e alla fine di ogni partita.
  const p1 = state.players.p1.user
  const p1Account = p1 && !p1.guest && Number.isInteger(p1.id) ? p1.id : null
  const running = Boolean(state.run && state.run.running)
  useEffect(() => {
    if (p1Account === null || running) {
      return undefined
    }
    let active = true
    api
      .played(p1Account)
      .then((data) => active && dispatch(playedLoaded(p1Account, data.played)))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [p1Account, running])

  // Invio delle modifiche in attesa, una volta sola ciascuna (i numeri `seq` crescono sempre).
  const sent = useRef(new Set())
  const { sync } = state
  useEffect(() => {
    for (const op of sync) {
      if (sent.current.has(op.seq)) {
        continue
      }
      sent.current.add(op.seq)
      const call = op.kind === 'favorite'
        ? api.setFavorite(op.account, op.key, op.on).then((data) => favoriteSynced(op.seq, data.favorites, data.games))
        : api.updateProfile(op.account, op.patch).then((account) => profileSynced(op.seq, account))
      call
        .then((action) => dispatch(action))
        .catch((error) => dispatch(syncFailed(op.seq, error.message)))
    }
  }, [sync])

  const { systemId, games } = state
  // Le console delle estensioni non hanno giochi da caricare.
  const gameConsole = Boolean(currentSystem(state))
  useEffect(() => {
    selected.current = systemId
    if (systemId && gameConsole && (!games[systemId] || stale.current.has(systemId))) {
      loadGames(systemId)
    }
  }, [systemId, gameConsole, games, loadGames])

  const value = useMemo(
    () => ({
      state,
      dispatch,
      loadGames,
      loadAllGames,
      loadSettings,
      saveSettings,
      rescanLibrary,
      refreshCores,
      loadProfiles,
      createProfile,
      playlistCall,
    }),
    [state, loadGames, loadAllGames, loadSettings, saveSettings, rescanLibrary, refreshCores, loadProfiles, createProfile, playlistCall],
  )
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

/** Stato e azioni dell'app. */
export function useApp() {
  return useContext(AppContext)
}
