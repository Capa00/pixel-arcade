/**
 * Stato della vista Impostazioni: originale letto dal backend e bozza
 * modificata. Solo funzioni pure, usate dal reducer (src/state/reducer.js)
 * e dalla vista.
 *
 * `state.settings` vale `null` fuori dalla vista, altrimenti
 * `{status, error, original, draft, available, coreTypes, coreIndex, retroarch, cpu, saving,
 * saveError, refreshing, refreshError}` con `status` pari a `loading`,
 * `ready` o `error`. `original` e `draft` sono
 * `{settings: {chiave: valore}, systems: [{id, name, count, extensions, defaultExtensions, cores, coresDefault,
 * compatibleCores}]}`. La configurazione dei giochi della console si salva a parte (src/lib/gameConfig.js).
 * `available` sono i core disponibili per nome (`availableCores` di
 * `GET /api/settings`); `cores` sono nomi brevi nell'ordine automatico.
 */
import { stepId } from '../input/wrap.js'
import * as A from './actions.js'

/** Schede della vista, nell'ordine in cui LB/RB le fanno girare. */
export const SETTINGS_TABS = [
  { id: 'look', label: 'Aspetto' },
  { id: 'systems', label: 'Console' },
  { id: 'playlists', label: 'Playlist' },
  { id: 'pad', label: 'Joypad' },
  { id: 'config', label: 'Configurazioni' },
  { id: 'tournament', label: 'Torneo' },
]

/**
 * Scheda dopo un passo nella direzione `dir` (-1, 1) da `id`: sempre circolare.
 * `tabs` sono le schede visibili (con quelle delle estensioni in coda).
 */
export function stepTab(id, dir, tabs = SETTINGS_TABS) {
  return stepId(tabs, id, dir)
}

/** Core disponibili per nome, da `availableCores` di `GET /api/settings`. */
export function availableMap(list) {
  const result = {}
  for (const core of list || []) {
    result[core.name] = core
  }
  return result
}

/** Stato di un core: `installed`, `downloadable` o `missing` (né installato né scaricabile). */
export function coreStatus(name, available) {
  const core = available[name]
  if (core && core.installed) {
    return 'installed'
  }
  return core && core.downloadable ? 'downloadable' : 'missing'
}

const RANK = { installed: 1, downloadable: 2, missing: 3 }

function compareNames(a, b) {
  const left = a.toLowerCase()
  const right = b.toLowerCase()
  if (left !== right) {
    return left < right ? -1 : 1
  }
  return a < b ? -1 : a > b ? 1 : 0
}

/** Posizione nell'ordine automatico: `[gruppo, posizione tra i compatibili]`. */
function coreRank(name, available, compatible) {
  const status = coreStatus(name, available)
  const index = compatible.indexOf(name)
  return status !== 'missing' && index >= 0 ? [0, index] : [RANK[status], 0]
}

/**
 * Ordine automatico dei core (README §I), uguale a `config.core_order` del
 * backend: prima i core `compatible` (compatibili con RetroAchievements)
 * installati o scaricabili, nell'ordine dato; poi gli altri installati, gli
 * altri scaricabili e infine quelli non disponibili, ciascun gruppo in ordine
 * alfabetico. Restituisce una nuova lista senza doppioni.
 */
export function sortCores(names, available, compatible = []) {
  return [...new Set(names)].sort((a, b) => {
    const left = coreRank(a, available, compatible)
    const right = coreRank(b, available, compatible)
    return left[0] - right[0] || left[1] - right[1] || compareNames(a, b)
  })
}

/** Lista dei core con in più `names`, senza doppioni e nell'ordine automatico. */
export function addCores(cores, names, available, compatible = []) {
  return sortCores([...cores, ...names], available, compatible)
}

/** Riepilogo di una lista: numero di core, installati e prontezza (almeno uno installato o scaricabile). */
export function coreSummary(cores, available) {
  const installed = cores.filter((name) => coreStatus(name, available) === 'installed').length
  const ready = cores.some((name) => coreStatus(name, available) !== 'missing')
  return { total: cores.length, installed, ready }
}

/**
 * Estensioni suggerite per il campo vuoto: quelle predefinite del sistema,
 * oppure (cartelle non riconosciute) l'unione di quelle dei core della lista.
 */
export function suggestedExtensions(system, available) {
  if (system.defaultExtensions) {
    return system.defaultExtensions
  }
  const result = []
  for (const name of system.cores) {
    for (const ext of (available[name] && available[name].extensions) || []) {
      if (!result.includes(ext)) {
        result.push(ext)
      }
    }
  }
  return result.join(' ')
}

function copyData(data) {
  return {
    settings: { ...data.settings },
    systems: (data.systems || []).map((system) => ({
      ...system,
      cores: [...system.cores],
      coresDefault: Boolean(system.coresDefault),
      compatibleCores: [...(system.compatibleCores || [])],
    })),
  }
}

/** Stato della vista pronto con i dati di `GET /api/settings`. */
export function settingsFrom(data) {
  return {
    status: 'ready',
    error: null,
    original: copyData(data),
    draft: copyData(data),
    available: availableMap(data.availableCores),
    coreTypes: data.coreTypes || [],
    coreIndex: data.coreIndex || { count: 0, fetchedAt: null, error: null },
    // `quitCombo`: vero se RetroArch ha la combinazione d'uscita col joypad (`input.quit_combo`).
    retroarch: data.retroarch || { quitCombo: null },
    // «Processore al massimo»: `ready` se lo script di sistema si può lanciare, `governor` in uso.
    cpu: data.cpu || { ready: false, governor: null },
    saving: false,
    saveError: null,
    refreshing: false,
    refreshError: null,
  }
}

// Una lista predefinita si salva come `null`: segue i core disponibili del momento.
function savedCores(system) {
  return system.coresDefault ? null : system.cores
}

function systemKey(system) {
  return JSON.stringify([system.extensions, savedCores(system)])
}

/** Console della bozza diverse dall'originale (solo i campi salvabili). */
export function changedSystems(settings) {
  const original = new Map(settings.original.systems.map((system) => [system.id, systemKey(system)]))
  return settings.draft.systems
    .filter((system) => original.get(system.id) !== systemKey(system))
    .map((system) => ({ id: system.id, extensions: system.extensions, cores: savedCores(system) }))
}

/** Vero se la bozza ha modifiche non salvate. */
export function isDirty(settings) {
  if (!settings || settings.status !== 'ready') {
    return false
  }
  return JSON.stringify(settings.draft.settings) !== JSON.stringify(settings.original.settings) || changedSystems(settings).length > 0
}

/** Corpo di `POST /api/settings`: tutte le impostazioni generali e solo le console cambiate. */
export function settingsPayload(settings) {
  return { settings: settings.draft.settings, systems: changedSystems(settings) }
}

/**
 * Dati ricaricati mantenendo la bozza: impostazioni generali e console già
 * presenti restano come modificate; nomi, conteggi, console nuove o
 * sparite e le liste ancora predefinite vengono dal backend.
 */
function mergeDraft(previous, data) {
  const next = settingsFrom(data)
  const drafts = new Map(previous.draft.systems.map((system) => [system.id, system]))
  next.draft.settings = { ...previous.draft.settings }
  next.draft.systems = next.draft.systems.map((system) => {
    const draft = drafts.get(system.id)
    if (!draft) {
      return system
    }
    const cores = draft.coresDefault ? system.cores : sortCores(draft.cores, next.available, system.compatibleCores)
    return { ...system, extensions: draft.extensions, cores, coresDefault: draft.coresDefault }
  })
  return next
}

/** Valore digitato in un campo: numero intero se richiesto e valido, altrimenti il testo (il backend lo segnala). */
function fieldValue(target, text) {
  const value = text.trim()
  return target.number && /^\d+$/.test(value) ? Number(value) : value
}

function withDraft(settings, draft) {
  return { ...settings, draft, saveError: null }
}

function changeSetting(settings, key, value) {
  return withDraft(settings, { ...settings.draft, settings: { ...settings.draft.settings, [key]: value } })
}

function changeSystem(settings, id, patch) {
  const systems = settings.draft.systems.map((system) => (system.id === id ? { ...system, ...patch } : system))
  return withDraft(settings, { ...settings.draft, systems })
}

function systemCores(settings, id) {
  const system = settings.draft.systems.find((entry) => entry.id === id)
  return system ? system.cores : []
}

function systemCompatible(settings, id) {
  const system = settings.draft.systems.find((entry) => entry.id === id)
  return system ? system.compatibleCores : []
}

/** Applica il testo confermato nella tastiera a schermo al campo `target` della bozza. */
export function applyField(settings, target, text) {
  if (!settings || settings.status !== 'ready' || !target) {
    return settings
  }
  if (target.kind === 'setting') {
    return changeSetting(settings, target.key, fieldValue(target, text))
  }
  if (target.kind === 'extensions') {
    return changeSystem(settings, target.system, { extensions: text.trim() })
  }
  return settings
}

/** Reducer della vista Impostazioni (`state.settings`); ignora le azioni se la vista è chiusa. */
export function settingsReducer(settings, action) {
  const ready = Boolean(settings && settings.status === 'ready')
  switch (action.type) {
    case A.SETTINGS_LOADED:
      if (!settings) {
        return settings
      }
      return action.keepDraft && ready ? mergeDraft(settings, action.data) : settingsFrom(action.data)
    case A.SETTINGS_FAILED:
      return settings ? { ...settings, status: 'error', error: action.message } : settings
    case A.SETTINGS_CHANGE:
      return ready ? changeSetting(settings, action.key, action.value) : settings
    case A.SYSTEM_CHANGE:
      return ready ? changeSystem(settings, action.system, action.patch) : settings
    case A.CORES_ADD:
      if (!ready || !action.cores.length) {
        return settings
      }
      return changeSystem(settings, action.system, {
        cores: addCores(systemCores(settings, action.system), action.cores, settings.available,
          systemCompatible(settings, action.system)),
        coresDefault: false,
      })
    case A.CORE_REMOVE:
      return ready
        ? changeSystem(settings, action.system, {
          cores: systemCores(settings, action.system).filter((name) => name !== action.core),
          coresDefault: false,
        })
        : settings
    case A.SETTINGS_SAVING:
      return settings ? { ...settings, saving: true, saveError: null } : settings
    case A.SETTINGS_SAVED:
      return settings ? settingsFrom(action.data) : settings
    case A.SETTINGS_SAVE_FAILED:
      return settings ? { ...settings, saving: false, saveError: action.message } : settings
    case A.CORES_REFRESHING:
      return ready ? { ...settings, refreshing: true, refreshError: null } : settings
    case A.CORES_REFRESHED:
      return ready ? mergeDraft(settings, action.data) : settings
    case A.CORES_REFRESH_FAILED:
      return ready ? { ...settings, refreshing: false, refreshError: action.message } : settings
    default:
      return settings
  }
}

/** Nota della riga «Processore al massimo durante le partite». */
export function cpuNote(cpu) {
  if (!cpu.ready) {
    return 'Non attivo su questa console: manca lo script di sistema (README, «Processore al massimo»)'
  }
  const now = cpu.governor ? ` · Ora: ${cpu.governor}` : ''
  return `Governor performance mentre giochi, poi torna com’era${now} · Conferma per cambiare`
}
