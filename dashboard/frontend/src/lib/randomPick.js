/**
 * «Cosa gioco?» (src/views/RandomPickLayer.jsx): un gioco a caso tra quelli
 * visibili nella griglia, con una sequenza di copertine da far scorrere come
 * in una slot machine. Solo funzioni pure; `random` (0 ≤ x < 1) è
 * sostituibile nei test.
 */

// Copertine mostrate prima di quella scelta e durata dell'animazione.
export const REEL_LENGTH = 18
export const SPIN_MS = 2400

/** Giochi che si possono pescare: tutti quelli della griglia tranne i ⊘ senza core compatibile. */
export function randomPool(games) {
  return (games || []).filter((game) => game.coreStatus !== 'incompatible')
}

/** Gioco a caso di `pool`, diverso da `avoid` (stesso `id`) quando ce ne sono altri; `null` se è vuoto. */
export function pickGame(pool, avoid = null, random = Math.random) {
  const list = pool.length > 1 && avoid ? pool.filter((game) => game.id !== avoid.id) : pool
  if (!list.length) {
    return null
  }
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))]
}

/**
 * Copertine da far scorrere: `length` giochi a caso di `pool` e in fondo
 * `chosen`. Due copertine vicine sono diverse quando il gruppo lo permette.
 */
export function reel(pool, chosen, length = REEL_LENGTH, random = Math.random) {
  const result = []
  for (let i = 0; i < length && pool.length > 1; i += 1) {
    const previous = result.length ? result[result.length - 1] : null
    result.push(pickGame(pool, previous, random))
  }
  if (result.length && result[result.length - 1].id === chosen.id && pool.length > 1) {
    result[result.length - 1] = pickGame(pool, chosen, random)
  }
  result.push(chosen)
  return result
}

/**
 * Istanti (ms dall'inizio) in cui passare alla copertina successiva: prima
 * veloci, poi sempre più lenti fino a fermarsi dopo `total` ms su quella
 * scelta. Restituisce `steps` istanti crescenti, l'ultimo uguale a `total`.
 */
export function reelTimes(steps, total = SPIN_MS) {
  const result = []
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps
    // Rallenta come un rullo che si ferma: la posizione cresce come 1 − (1 − t)³.
    result.push(Math.round(total * (1 - Math.cbrt(1 - t))))
  }
  return result
}
