/**
 * Classifica di casa nelle finestre «Chi gioca?» (src/components/Leaderboard.jsx).
 * Solo funzioni pure.
 */

// Coppe dei primi tre posti; dal quarto in giù solo il numero.
const PODIUM = ['gold', 'silver', 'bronze']

/**
 * Lato dello schermo della classifica: quello libero quando è aperta una
 * sola finestra «Chi gioca?» (`open` = slot con la finestra aperta). P1 ha
 * la finestra a sinistra, quindi la classifica va a destra, e viceversa.
 * Con due finestre (o nessuna) non c'è posto: `null`.
 */
export function boardSide(open) {
  if (!open || open.length !== 1) {
    return null
  }
  return open[0] === 'p1' ? 'right' : 'left'
}

/** Direzione che porta il joypad dello slot dalla sua finestra alla classifica: → per P1, ← per P2. */
export function enterDirection(slot) {
  return slot === 'p1' ? 'right' : 'left'
}

/** XP necessari per arrivare al livello `level`: `50·L·(L−1)`, come nel backend (progression.py). */
function levelFloor(level) {
  return 50 * level * (level - 1)
}

/** Avanzamento nel livello `level` con `xp` totali: `{done, needed}` («340 / 500 XP»). */
export function levelProgress(xp, level) {
  const start = levelFloor(level)
  return { done: Math.max(0, xp - start), needed: levelFloor(level + 1) - start }
}

/**
 * Parti della barra delle console: le prime `max` per tempo e il resto
 * insieme (`other`), ciascuna con la quota da 0 a 100.
 */
export function consoleShares(systems, max = 4) {
  const total = systems.reduce((sum, entry) => sum + entry.seconds, 0)
  if (!total) {
    return []
  }
  const parts = systems.slice(0, max).map((entry) => ({ ...entry, share: (entry.seconds / total) * 100 }))
  const rest = systems.slice(max).reduce((sum, entry) => sum + entry.seconds, 0)
  if (rest) {
    parts.push({ system: 'other', name: 'Altre', seconds: rest, share: (rest / total) * 100 })
  }
  return parts
}

/** Coppa del posto `position` (da 0): `gold`, `silver`, `bronze`, oppure `null`. */
export function podium(position) {
  return PODIUM[position] || null
}

/** «Ultimo giorno», «Ancora 2 giorni». */
export function daysLeftLabel(days) {
  const value = Math.max(1, Number(days) || 1)
  return value === 1 ? 'Ultimo giorno' : `Ancora ${value} giorni`
}

/** Punti RetroAchievements con il separatore delle migliaia: «12.480». */
export function points(value) {
  return Number(value || 0).toLocaleString('it-IT')
}
