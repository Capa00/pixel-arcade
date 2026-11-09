/**
 * Navigazione circolare (README §G): una pressione oltre il bordo di un
 * elenco riparte dall'altro capo; una direzione tenuta premuta (`repeat`)
 * si ferma al bordo. Solo funzioni pure.
 */

/** Vero se l'evento può ripartire dall'altro capo: solo la pressione singola. */
export function wraps(event) {
  return event.kind === 'press'
}

/**
 * Indice spostato di `dir` in un elenco di `count` voci. Oltre il bordo, con
 * `wrap` si va all'altro capo, altrimenti si resta sul bordo.
 */
export function stepIndex(index, dir, count, wrap) {
  if (count <= 0) {
    return index
  }
  const next = index + dir
  if (next >= 0 && next < count) {
    return next
  }
  if (wrap) {
    return next < 0 ? count - 1 : 0
  }
  return Math.max(0, Math.min(count - 1, index))
}

/**
 * Id della voce a un passo nella direzione `dir` (-1, 1) da `id` in `items`
 * (`[{id}]`): sempre circolare, come le schede con LB/RB. Un id sconosciuto
 * parte dalla prima voce.
 */
export function stepId(items, id, dir) {
  const index = Math.max(0, items.findIndex((item) => item.id === id))
  return items[stepIndex(index, dir, items.length, true)].id
}
