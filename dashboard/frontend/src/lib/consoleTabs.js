/**
 * Console nella riga delle schede.
 *
 * Le Impostazioni decidono quali console sono accese per tutti (`on`, `off`);
 * una console che non hanno mai toccato è accesa se ha giochi. Dalla scheda TUTTE ogni profilo accende o spegne le proprie:
 * `profiles[account] = {add, remove}`. Una scelta del profilo resta anche
 * quando cambiano le Impostazioni; le console mai toccate le seguono. La
 * console preferita del profilo è sempre nella sua riga.
 * Le scelte arrivano da `GET /api/bootstrap` (`consoles`) e si salvano con
 * `POST /api/consoles/off` e `POST /api/consoles/row` (API.md, «Console della riga»).
 */

import { stepId } from '../input/wrap.js'

/** Scheda TUTTE: in fondo alla riga, prima di TOURNAMENT. */
export const ALL_CONSOLE = { id: '@all', name: 'TUTTE', accent: '#c9d1d9' }

export const EMPTY_PREFS = { on: [], off: [], profiles: {} }

/** Ambiti di navigazione della scheda TUTTE (`state.focus`): marche, console della marca aperta, marca aperta. */
export const ALL_SCOPES = { brands: 'allBrands', consoles: 'allConsoles', open: 'allBrand' }

/**
 * Marche delle console, nell'ordine della riga, dei gruppi di TUTTE e delle
 * Impostazioni: alfabetico, con ALTRO (console miste) per ultimo. La marca di
 * ogni console e la sua posizione nella marca (ordine di uscita) le manda il
 * backend (`brand`, `order` di `GET /api/bootstrap`, `BRANDS` in systems.py).
 */
export const BRANDS = [
  { id: 'arcade', name: 'ARCADE' },
  { id: 'atari', name: 'ATARI' },
  { id: 'bandai', name: 'BANDAI' },
  { id: 'computer', name: 'COMPUTER' },
  { id: 'nec', name: 'NEC' },
  { id: 'nintendo', name: 'NINTENDO' },
  { id: 'sega', name: 'SEGA' },
  { id: 'snk', name: 'SNK' },
  { id: 'sony', name: 'SONY' },
  { id: 'other', name: 'ALTRO' },
]

const BRAND_IDS = new Set(BRANDS.map((brand) => brand.id))

/** Marca della console (`other`, o `arcade` per gli arcade, se il backend non la indica) e posizione nella marca. */
export function brandOf(system) {
  const brand = BRAND_IDS.has(system.brand) ? system.brand : system.arcade ? 'arcade' : 'other'
  return { brand, index: Number.isInteger(system.order) ? system.order : Infinity }
}

/** Console divise per marca: `[{brand, name, systems}]`, solo i gruppi non vuoti, nell'ordine di `BRANDS`. */
export function groupSystems(systems) {
  return BRANDS.map((brand) => ({
    brand: brand.id,
    name: brand.name,
    systems: systems
      .filter((system) => brandOf(system).brand === brand.id)
      .sort((a, b) => brandOf(a).index - brandOf(b).index || (a.name || '').localeCompare(b.name || '')),
  })).filter((group) => group.systems.length)
}

function idList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

/** Preferenze lette da un valore qualsiasi (risposta dell'API), con i campi mancanti o sbagliati scartati. */
export function normalizePrefs(value) {
  if (!value || typeof value !== 'object') {
    return EMPTY_PREFS
  }
  const profiles = {}
  if (value.profiles && typeof value.profiles === 'object') {
    for (const [account, entry] of Object.entries(value.profiles)) {
      const add = idList(entry && entry.add)
      const remove = idList(entry && entry.remove)
      if (add.length || remove.length) {
        profiles[account] = { add, remove }
      }
    }
  }
  return { on: idList(value.on), off: idList(value.off), profiles }
}

/** Vero se la console `system` è accesa per tutti: come dicono le Impostazioni, altrimenti se ha giochi. */
export function onForAll(prefs, system) {
  if ((prefs.off || []).includes(system.id)) {
    return false
  }
  return (prefs.on || []).includes(system.id) || (system.count || 0) > 0
}

/**
 * Vero se la console `system` è nella riga del profilo `account` (`null` =
 * nessun profilo). `favorite` è la console preferita del profilo: c'è sempre.
 */
export function inRow(prefs, account, system, favorite = null) {
  const id = system.id
  if (favorite !== null && id === favorite) {
    return true
  }
  const entry = account !== null && account !== undefined ? prefs.profiles[account] : null
  if (entry && entry.add.includes(id)) {
    return true
  }
  if (entry && entry.remove.includes(id)) {
    return false
  }
  return onForAll(prefs, system)
}

/** Accende (`on`) o spegne la console `id` nella riga del profilo `account`; la scelta resta anche se uguale alle Impostazioni. */
export function setForProfile(prefs, account, id, on) {
  const entry = prefs.profiles[account] || { add: [], remove: [] }
  const add = entry.add.filter((item) => item !== id)
  const remove = entry.remove.filter((item) => item !== id)
  if (on) {
    add.push(id)
  } else {
    remove.push(id)
  }
  return { ...prefs, profiles: { ...prefs.profiles, [account]: { add, remove } } }
}

/** Preferenze con le console accese (`on`) e spente (`off`) per tutti nelle Impostazioni. */
export function withSettings(prefs, on, off) {
  return { ...prefs, on: [...new Set(on)], off: [...new Set(off)] }
}

/** Stato delle Impostazioni `{on, off}` con la console `id` accesa (`value` vero) o spenta per tutti. */
export function setForAll(settings, id, value) {
  const on = settings.on.filter((item) => item !== id)
  const off = settings.off.filter((item) => item !== id)
  if (value) {
    on.push(id)
  } else {
    off.push(id)
  }
  return { on, off }
}

/** Console di `systems` nella riga del profilo `account` (con la preferita `favorite`), per marca come in TUTTE. */
export function rowSystems(systems, prefs, account, favorite = null) {
  const shown = systems.filter((system) => inRow(prefs, account, system, favorite))
  return groupSystems(shown).flatMap((group) => group.systems)
}

/**
 * Marca a un passo nella direzione `dir` (-1, 1) da `brand` tra i gruppi di
 * `groupSystems` (LT/RT in TUTTE): sempre circolare, perché LT e RT non si
 * ripetono tenendoli premuti. Una marca sconosciuta parte dalla prima.
 */
export function stepBrand(groups, brand, dir) {
  if (!groups.length) {
    return null
  }
  return stepId(groups.map((group) => ({ id: group.brand })), brand, dir)
}

/**
 * Posizione di TUTTE su una console: `[[ambito, valore]]` da passare a
 * `setFocus` per aprire la sua marca con la console selezionata.
 * Vuoto se la console non c'è.
 */
export function allFocus(systems, id) {
  const system = systems.find((entry) => entry.id === id)
  if (!system) {
    return []
  }
  const { brand } = brandOf(system)
  return [[ALL_SCOPES.consoles, `sys:${id}`], [ALL_SCOPES.brands, `brand:${brand}`], [ALL_SCOPES.open, brand]]
}
