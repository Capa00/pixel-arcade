/**
 * Console nella riga delle schede.
 *
 * Le Impostazioni decidono quali console sono accese per tutti (`off`: le
 * spente). Dalla scheda TUTTE ogni profilo accende o spegne le proprie:
 * `profiles[account] = {add, remove}`. Una scelta del profilo resta anche
 * quando cambiano le Impostazioni; le console mai toccate le seguono. La
 * console preferita del profilo è sempre nella sua riga.
 * Le scelte arrivano da `GET /api/bootstrap` (`consoles`) e si salvano con
 * `POST /api/consoles/off` e `POST /api/consoles/row` (API.md, «Console della riga»).
 */

import { stepId } from '../input/wrap.js'

/** Scheda TUTTE: in fondo alla riga, prima di TOURNAMENT. */
export const ALL_CONSOLE = { id: '@all', name: 'TUTTE', accent: '#c9d1d9' }

export const EMPTY_PREFS = { off: [], profiles: {} }

/** Ambiti di navigazione della scheda TUTTE (`state.focus`): marche, console della marca aperta, marca aperta. */
export const ALL_SCOPES = { brands: 'allBrands', consoles: 'allConsoles', open: 'allBrand' }

/**
 * Marche delle console, nell'ordine della riga, dei gruppi di TUTTE e delle
 * Impostazioni: alfabetico, con ALTRO (console miste) per ultimo.
 * `presets` sono i sistemi riconosciuti dal backend (`preset`), nell'ordine
 * di uscita in cui stanno nel gruppo; computer e arcade fanno gruppo a parte.
 */
export const BRANDS = [
  { id: 'arcade', name: 'ARCADE', presets: ['arcade'] },
  { id: 'atari', name: 'ATARI', presets: ['atari2600', 'atari5200', 'atari7800', 'jaguar', 'lynx'] },
  { id: 'bandai', name: 'BANDAI', presets: ['wonderswan', 'wonderswancolor'] },
  { id: 'computer', name: 'COMPUTER', presets: ['c64', 'zxspectrum', 'cpc', 'msx', 'msx2', 'pc88', 'atarist', 'amiga', 'dos'] },
  { id: 'nec', name: 'NEC', presets: ['pce', 'pcecd', 'supergrafx', 'pcfx'] },
  { id: 'nintendo', name: 'NINTENDO', presets: ['nes', 'fds', 'snes', 'n64', 'gamecube', 'wii', 'gb', 'gbc', 'gba', 'vb', 'pokemini', 'nds', '3ds'] },
  { id: 'sega', name: 'SEGA', presets: ['sg1000', 'sms', 'md', 'segacd', 'sega32x', 'saturn', 'dreamcast', 'gg'] },
  { id: 'snk', name: 'SNK', presets: ['neogeocd', 'ngp'] },
  { id: 'sony', name: 'SONY', presets: ['psx', 'ps2', 'psp'] },
  {
    id: 'other',
    name: 'ALTRO',
    presets: ['channelf', 'odyssey2', 'intellivision', 'colecovision', 'vectrex', '3do', 'arcadia2001', 'vc4000', 'elektor',
      'supervision', 'megaduck', 'arduboy', 'uzebox', 'wasm4', 'pico8'],
  },
]

const BRAND_OF = {}
for (const brand of BRANDS) {
  brand.presets.forEach((preset, index) => {
    BRAND_OF[preset] = { brand: brand.id, index }
  })
}

/** Marca della console (`other` se il sistema non è riconosciuto) e posizione nel suo gruppo. */
export function brandOf(system) {
  const known = BRAND_OF[system.preset] || BRAND_OF[system.id]
  if (known) {
    return known
  }
  return { brand: system.arcade ? 'arcade' : 'other', index: Infinity }
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
  return { off: idList(value.off), profiles }
}

/** Vero se la console `id` è accesa per tutti (Impostazioni). */
export function onForAll(prefs, id) {
  return !prefs.off.includes(id)
}

/**
 * Vero se la console `id` è nella riga del profilo `account` (`null` = nessun
 * profilo). `favorite` è la console preferita del profilo: c'è sempre.
 */
export function inRow(prefs, account, id, favorite = null) {
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
  return onForAll(prefs, id)
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

/** Preferenze con le console spente per tutti `off` (lista di id). */
export function withOff(prefs, off) {
  return { ...prefs, off: [...new Set(off)] }
}

/** Console di `systems` nella riga del profilo `account` (con la preferita `favorite`), per marca come in TUTTE. */
export function rowSystems(systems, prefs, account, favorite = null) {
  const shown = systems.filter((system) => inRow(prefs, account, system.id, favorite))
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
