/**
 * Layout responsive: sceglie la disposizione in base alla finestra.
 *
 * `unit` è il fattore che moltiplica le misure della demo (pensate per 1600×900):
 * le misure CSS sono scritte come `calc(N * var(--u) * 1px)`.
 * `columns` è il numero di colonne della griglia dei giochi.
 */

export const LAYOUTS = {
  // Telefono o finestra stretta: una colonna, testi leggibili.
  compact: { columns: 3, baseWidth: 480 },
  // Schermo verticale ampio (tablet in verticale).
  portrait: { columns: 4, baseWidth: 900 },
  // Da 1:1 a 16:10 circa, compreso il 4:3.
  standard: { columns: 6, baseWidth: 1280, baseHeight: 900 },
  // 16:9 e più largo, come la demo.
  wide: { columns: 8, baseWidth: 1600, baseHeight: 900 },
}

export const COMPACT_MAX_WIDTH = 720
export const WIDE_MIN_RATIO = 1.55
export const MIN_UNIT = 0.6

function layoutName(width, height) {
  if (width < COMPACT_MAX_WIDTH) {
    return 'compact'
  }
  const ratio = width / height
  if (ratio < 1) {
    return 'portrait'
  }
  return ratio >= WIDE_MIN_RATIO ? 'wide' : 'standard'
}

/** Restituisce `{ name, columns, unit }` per una finestra di `width`×`height` pixel. */
export function layoutFor(width, height) {
  if (!(width > 0) || !(height > 0)) {
    return { name: 'wide', columns: LAYOUTS.wide.columns, unit: 1 }
  }
  const name = layoutName(width, height)
  const { columns, baseWidth, baseHeight } = LAYOUTS[name]
  let unit = width / baseWidth
  if (baseHeight) {
    unit = Math.min(unit, height / baseHeight)
  }
  if (name === 'compact') {
    unit = Math.min(unit, 1)
  }
  return { name, columns, unit: Math.max(unit, MIN_UNIT) }
}
