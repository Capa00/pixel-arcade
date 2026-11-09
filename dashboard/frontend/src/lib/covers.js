/**
 * Colori della copertina pixel art di un gioco (README §F): il colore di
 * sfondo viene da `system.covers[hash(id) % 4]`, il testo è scuro sugli
 * sfondi chiari e il disegno è specchiato se l'hash è dispari.
 */

export const DARK_INK = '#15131c'
export const LIGHT_INK = '#ffffff'
const FALLBACK_COVERS = ['#3a3948', '#6f6c80', '#2a2936', '#a3a0b3']

/** Hash FNV-1a a 32 bit dei caratteri di `text`. */
export function fnv1a(text) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Luminanza percepita di un colore `#rrggbb`, da 0 a 1. */
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/** `{bg, ink, flip, glow}` per il gioco `gameId` del sistema `system`. */
export function coverStyle(system, gameId) {
  const covers = system && system.covers && system.covers.length ? system.covers : FALLBACK_COVERS
  const hash = fnv1a(String(gameId))
  const bg = covers[hash % covers.length]
  return {
    bg,
    ink: luminance(bg) > 0.6 ? DARK_INK : LIGHT_INK,
    flip: hash % 2 ? -1 : 1,
    glow: bg + '66',
  }
}
