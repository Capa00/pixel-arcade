/**
 * Funzioni della scheda «Salvataggi» (src/addons/shared-saves/index.jsx):
 * ricerca dei giochi e testi delle righe.
 */
export const PREFIX = '/api/addons/shared-saves/'
// Giochi al massimo nel menu della ricerca.
export const MAX_GAMES = 80

function fold(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/**
 * Giochi di `games` che contengono tutte le parole di `text` nel titolo (o
 * nel nome del file), senza badare a maiuscole e accenti: `{items, more}`,
 * al massimo `MAX_GAMES`; `more` è vero se ce n'erano altri.
 */
export function matchingGames(games, text) {
  const words = fold(text).split(/\s+/).filter(Boolean)
  const found = (games || []).filter((game) => {
    const haystack = `${fold(game.title)} ${fold(game.id)}`
    return words.every((word) => haystack.includes(word))
  })
  return { items: found.slice(0, MAX_GAMES), more: found.length > MAX_GAMES }
}

/** Testo a destra di una riga: «Gioco · Console · descrizione». */
export function saveLabel(entry) {
  return [entry.gameTitle, entry.systemName, entry.description].filter(Boolean).join(' · ')
}
