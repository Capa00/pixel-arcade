/**
 * Disegno del logo pixel su una griglia 10×10: rettangoli nell'ordine in cui
 * si dipingono (quelli dopo coprono quelli prima). Usato dal logo
 * dell'intestazione e, pixel per pixel, dalla schermata iniziale.
 */
export const LOGO_SIZE = 10

export const LOGO_RECTS = [
  { x: 0, y: 3, width: 10, height: 5, fill: '#f3f1f8' },
  { x: 1, y: 2, width: 8, height: 7, fill: '#f3f1f8' },
  { x: 2, y: 4, width: 1, height: 3, fill: '#0d0c12' },
  { x: 1, y: 5, width: 3, height: 1, fill: '#0d0c12' },
  { x: 6, y: 4, width: 1, height: 1, fill: '#ff5d73' },
  { x: 7, y: 5, width: 1, height: 1, fill: '#3ccfc4' },
]

/** Pixel del logo `{x, y, fill}` risultanti dai rettangoli, per righe dall'alto. */
export function logoPixels(rects = LOGO_RECTS) {
  const grid = new Map()
  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        grid.set(`${x},${y}`, { x, y, fill: rect.fill })
      }
    }
  }
  return [...grid.values()].sort((a, b) => a.y - b.y || a.x - b.x)
}
