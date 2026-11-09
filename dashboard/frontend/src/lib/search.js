/**
 * Ricerca nella libreria e gruppi per iniziale (`#` e `A–Z`). Solo funzioni
 * pure; i risultati sono memorizzati per lista di giochi, così i selettori
 * restituiscono sempre lo stesso array finché giochi e testo non cambiano.
 */

export const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']

/** Testo senza accenti (NFD) e in minuscolo, per confronti che ignorano maiuscole e accenti. */
export function normalizeText(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Parole della ricerca, normalizzate; nessuna parola significa nessun filtro. */
export function queryWords(query) {
  return normalizeText(query).split(/\s+/).filter(Boolean)
}

/**
 * Parole della ricerca divise in `words` (da trovare) e `without` (da
 * escludere: quelle che iniziano con `-`, per esempio `-kart`). Un `-` da
 * solo o dentro una parola (`x-men`) resta testo normale.
 */
export function splitQuery(query) {
  const words = []
  const without = []
  for (const word of queryWords(query)) {
    if (word.length > 1 && word.startsWith('-')) {
      without.push(word.slice(1))
    } else {
      words.push(word)
    }
  }
  return { words, without }
}

/** Vero se `text` (già normalizzato) contiene tutte le parole `words` e nessuna di `without`. */
export function textMatches(text, { words, without }) {
  return words.every((word) => text.includes(word)) && !without.some((word) => text.includes(word))
}

const haystacks = new WeakMap()

function haystack(game) {
  let text = haystacks.get(game)
  if (text === undefined) {
    text = normalizeText(`${game.title} ${game.file || ''}`)
    haystacks.set(game, text)
  }
  return text
}

const filterCache = new WeakMap()

/**
 * Giochi che contengono tutte le parole di `query` nel titolo o nel nome del
 * file, e nessuna di quelle precedute da `-` (`splitQuery`). Senza parole
 * restituisce `games` stesso.
 */
export function filterGames(games, query) {
  const parts = splitQuery(query)
  if (!parts.words.length && !parts.without.length) {
    return games
  }
  const key = `${parts.words.join(' ')}|${parts.without.join(' ')}`
  const cached = filterCache.get(games)
  if (cached && cached.key === key) {
    return cached.result
  }
  const result = games.filter((game) => textMatches(haystack(game), parts))
  filterCache.set(games, { key, result })
  return result
}

/** Gruppo dell'iniziale del titolo: `A`–`Z`, oppure `#` per cifre e simboli. */
export function letterOf(title) {
  const first = normalizeText(title).trim().charAt(0).toUpperCase()
  return first >= 'A' && first <= 'Z' ? first : '#'
}

const letterCache = new WeakMap()

/** Mappa gruppo → indice del primo gioco di quel gruppo in `games`. */
export function letterIndex(games) {
  let map = letterCache.get(games)
  if (!map) {
    map = new Map()
    games.forEach((game, index) => {
      const letter = letterOf(game.title)
      if (!map.has(letter)) {
        map.set(letter, index)
      }
    })
    letterCache.set(games, map)
  }
  return map
}

/**
 * Indice del primo gioco del gruppo presente più vicino, nella direzione
 * `dir` (+1 successivo, -1 precedente), rispetto al gioco in `index`.
 * I gruppi senza giochi si saltano. Ai bordi, con `wrap` si riparte
 * dall'altro capo (da # a sinistra si va all'ultima lettera), altrimenti
 * restituisce `index`.
 */
export function jumpIndex(games, index, dir, wrap = false) {
  const game = games[index]
  if (!game) {
    return index
  }
  const firsts = letterIndex(games)
  const from = LETTERS.indexOf(letterOf(game.title))
  for (let step = 1; step < LETTERS.length; step += 1) {
    let at = from + dir * step
    if (at < 0 || at >= LETTERS.length) {
      if (!wrap) {
        break
      }
      at = (at + LETTERS.length) % LETTERS.length
    }
    if (firsts.has(LETTERS[at])) {
      return firsts.get(LETTERS[at])
    }
  }
  return index
}
