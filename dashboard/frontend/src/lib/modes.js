import { useEffect, useState } from 'react'

/**
 * Modalità dei colori (impostazione `ui.mode`, backend: `MODES` in
 * config.py): `system` segue la preferenza chiaro/scuro del sistema,
 * `day` e `night` la fissano. I colori di ciascuna sono in
 * src/styles/tokens.css, scelti con `data-mode` su <html>; i temi grafici
 * (src/lib/themes.js) valgono in entrambe.
 */

export const SYSTEM = 'system'

export const MODES = [
  { id: SYSTEM, label: 'Come il sistema', note: 'Chiara o scura secondo la preferenza del sistema' },
  { id: 'day', label: 'Giorno', note: 'Colori chiari' },
  { id: 'night', label: 'Notte', note: 'Colori scuri' },
]

export const MODE_IDS = MODES.map((mode) => mode.id)

// Ultima modalità salvata, per colorare la pagina prima delle impostazioni.
const STORAGE_KEY = 'pixelarcade.mode'
const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Modalità con quell'id, oppure `null`. */
export function modeById(id) {
  return MODES.find((mode) => mode.id === id) || null
}

/**
 * Modalità da mostrare: quella scelta nelle Impostazioni (anche non ancora
 * salvata, per vederla subito) o salvata; `system` se sconosciuta.
 */
export function chosenMode(state) {
  const draft = state.view === 'settings' && state.settings && state.settings.draft
    ? state.settings.draft.settings['ui.mode']
    : null
  const id = draft || state.mode || SYSTEM
  return modeById(id) ? id : SYSTEM
}

/** `day` o `night`: con `system` decide `prefersDark`. */
export function resolveMode(id, prefersDark) {
  if (id === 'day' || id === 'night') {
    return id
  }
  return prefersDark ? 'night' : 'day'
}

/** Il sistema preferisce i colori scuri? Senza preferenza dichiarata: no. */
export function systemPrefersDark() {
  try {
    return window.matchMedia(DARK_QUERY).matches
  } catch {
    return false
  }
}

/** Colori della pagina: `day` o `night` su <html>. */
export function applyMode(mode) {
  document.documentElement.dataset.mode = mode
}

/** Modalità salvata l'ultima volta in questo browser, oppure `system`. */
export function storedMode() {
  try {
    const id = window.localStorage.getItem(STORAGE_KEY)
    return modeById(id) ? id : SYSTEM
  } catch {
    return SYSTEM
  }
}

function rememberMode(id) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Senza memoria del browser la pagina parte come il sistema.
  }
}

/**
 * Applica la modalità `id` alla pagina e la ricorda per il prossimo avvio
 * (`saved`: la modalità salvata, non quella in prova nelle Impostazioni).
 * Con `system` segue i cambi di preferenza anche a pagina aperta.
 */
export function useColorMode(id, saved) {
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark)

  useEffect(() => {
    let query
    try {
      query = window.matchMedia(DARK_QUERY)
    } catch {
      return undefined
    }
    const update = () => setPrefersDark(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    applyMode(resolveMode(id, prefersDark))
  }, [id, prefersDark])

  useEffect(() => {
    if (saved) {
      rememberMode(saved)
    }
  }, [saved])
}
