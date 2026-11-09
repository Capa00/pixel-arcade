/**
 * Navigazione spaziale tra elementi posizionati liberamente (viste a
 * pannelli). Solo funzioni pure su rettangoli `{id, left, top, right, bottom}`.
 */

// Tolleranza, in pixel, per bordi che si toccano o si sovrappongono appena.
const EDGE_TOLERANCE = 1

const AXES = {
  left: { sign: -1, main: ['left', 'right'], cross: ['top', 'bottom'] },
  right: { sign: 1, main: ['left', 'right'], cross: ['top', 'bottom'] },
  up: { sign: -1, main: ['top', 'bottom'], cross: ['left', 'right'] },
  down: { sign: 1, main: ['top', 'bottom'], cross: ['left', 'right'] },
}

function center(rect, [start, end]) {
  return (rect[start] + rect[end]) / 2
}

// Distanza tra due intervalli sullo stesso asse (0 se si sovrappongono).
function gap(a, b, [start, end]) {
  return Math.max(0, a[start] - b[end], b[start] - a[end])
}

// Migliore tra i candidati: punteggio più basso, a parità il centro più allineato.
function better(best, id, score, align) {
  return !best || score < best.score || (score === best.score && align < best.align) ? { id, score, align } : best
}

/**
 * Elemento dall'altro capo per la navigazione circolare: il più lontano nel
 * verso opposto a `direction` (per `up` il più in basso), con la stessa
 * penalità per la distanza trasversale di `nextFocus`.
 */
function wrapFocus(rects, current, axis) {
  const [start, end] = axis.main
  const others = rects.filter((rect) => rect !== current)
  if (!others.length) {
    return null
  }
  const edge = axis.sign > 0
    ? Math.min(...others.map((rect) => rect[start]))
    : Math.max(...others.map((rect) => rect[end]))
  let best = null
  for (const rect of others) {
    const primary = axis.sign > 0 ? rect[start] - edge : edge - rect[end]
    const align = Math.abs(center(rect, axis.cross) - center(current, axis.cross))
    best = better(best, rect.id, primary + 2 * gap(rect, current, axis.cross), align)
  }
  return best.id
}

/**
 * Id dell'elemento da raggiungere partendo da `currentId` nella direzione
 * `direction`. Sono candidati solo gli elementi che stanno interamente oltre
 * il bordo dell'elemento corrente in quella direzione; vince il punteggio più
 * basso = distanza primaria + 2 × distanza trasversale (a parità, il centro
 * più allineato). Senza candidati, con `wrap` (pressione singola) si riparte
 * dall'altro capo, altrimenti resta `currentId`. Se `currentId` non c'è,
 * restituisce il primo elemento.
 */
export function nextFocus(rects, currentId, direction, wrap = false) {
  const current = rects.find((rect) => rect.id === currentId)
  if (!current) {
    return rects.length ? rects[0].id : currentId
  }
  const axis = AXES[direction]
  if (!axis) {
    return currentId
  }
  const [start, end] = axis.main
  let best = null
  for (const rect of rects) {
    if (rect === current) {
      continue
    }
    const primary = axis.sign > 0 ? rect[start] - current[end] : current[start] - rect[end]
    if (primary < -EDGE_TOLERANCE) {
      continue
    }
    const score = Math.max(0, primary) + 2 * gap(rect, current, axis.cross)
    const align = Math.abs(center(rect, axis.cross) - center(current, axis.cross))
    best = better(best, rect.id, score, align)
  }
  if (best) {
    return best.id
  }
  return (wrap && wrapFocus(rects, current, axis)) || currentId
}
