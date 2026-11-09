/**
 * Metadati dei giochi della libreria (`GET /api/games`): testi della griglia
 * e della sezione in alto, immagini da `GET /api/image`. Solo funzioni pure.
 */

const LANGUAGES = {
  en: 'inglese',
  fr: 'francese',
  de: 'tedesco',
  es: 'spagnolo',
  it: 'italiano',
  ja: 'giapponese',
  pt: 'portoghese',
  nl: 'olandese',
  sv: 'svedese',
  da: 'danese',
  fi: 'finlandese',
  no: 'norvegese',
  zh: 'cinese',
  ko: 'coreano',
  ru: 'russo',
  pl: 'polacco',
  ne: 'nepalese',
}

// Immagini del gioco, nell'ordine in cui ← → le fanno girare sulla copertina.
export const IMAGE_KINDS = ['cover', 'title', 'snap']

export const IMAGE_LABELS = { cover: 'Copertina', title: 'Titolo', snap: 'Schermata' }

function present(value) {
  if (Array.isArray(value)) {
    return value.length > 0
  }
  return value !== null && value !== undefined && value !== ''
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Nome in italiano della lingua `code`, con l'iniziale maiuscola («Italiano»), oppure il codice se non è noto. */
export function languageName(code) {
  return capitalize(LANGUAGES[code] || code)
}

/** Lingue `codes` in italiano, con l'iniziale maiuscola: «Inglese, francese». */
export function languageList(codes) {
  return capitalize((codes || []).map((code) => LANGUAGES[code] || code).join(', '))
}

/** Giocatori: «1 giocatore» per `'1'` (o `1`), altrimenti «1–2 giocatori»; `null` se non noto. */
export function playersLabel(players) {
  if (!present(players)) {
    return null
  }
  const text = String(players)
  return text === '1' ? '1 giocatore' : `${text} giocatori`
}

/** Generi del gioco come lista (anche se il backend ne dà uno solo come testo). */
export function genres(game) {
  if (Array.isArray(game.genre)) {
    return game.genre.filter(Boolean)
  }
  return game.genre ? [game.genre] : []
}

/** Riga sopra il titolo nella sezione in alto: «NES · 1986 · EUROPA», solo le parti note. */
export function heroLabel(system, game) {
  return [system.name, game.year, game.region].filter(present).join(' · ').toUpperCase()
}

/**
 * Campi della scheda nella sezione in alto `[{id, label, value}]`, solo quelli
 * con un valore, nell'ordine della scheda a due colonne.
 */
export function infoRows(game) {
  const rows = [
    { id: 'developer', label: 'Sviluppatore', value: game.developer },
    { id: 'genre', label: 'Genere', value: genres(game).join(' · ') },
    { id: 'publisher', label: 'Editore', value: game.publisher },
    { id: 'players', label: 'Giocatori', value: playersLabel(game.players) },
    { id: 'languages', label: 'Lingue', value: present(game.languages) ? languageList(game.languages) : null },
    { id: 'serial', label: 'Seriale', value: game.serial },
  ]
  return rows.filter((row) => present(row.value))
}

/** Vero se il gioco ha immagini da chiedere al backend (copertina, titolo, schermata). */
export function hasImages(game) {
  return Boolean(game && game.metaId && game.cover)
}

/** Vero se il gioco ha una descrizione o una trama. */
export function hasText(game) {
  return Boolean(game && (present(game.description) || present(game.plot)))
}

/**
 * URL dell'immagine `kind` del gioco `game` della console `system` (stessa
 * origine, ammessa dalla CSP). Per la copertina il backend, se manca, dà il
 * titolo e poi la schermata (`fallback=1`), con una sola richiesta.
 */
export function imageUrl(system, game, kind) {
  return '/api/image?system=' + encodeURIComponent(system) + '&game=' + encodeURIComponent(game.metaId) +
    '&kind=' + encodeURIComponent(kind) + (kind === 'cover' ? '&fallback=1' : '')
}

/** Immagine dopo un passo nella direzione `dir` (-1, 1): sempre circolare. */
export function stepImage(kind, dir) {
  const index = Math.max(0, IMAGE_KINDS.indexOf(kind))
  return IMAGE_KINDS[(index + dir + IMAGE_KINDS.length) % IMAGE_KINDS.length]
}
