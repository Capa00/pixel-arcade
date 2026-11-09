import { stepIndex } from '../input/wrap.js'

/**
 * Torneo (README «Torneo»): testi, controlli e combinazione dell'admin per
 * la scheda «Torneo» delle Impostazioni (src/views/SettingsTournament.jsx),
 * per la scheda TOURNAMENT tra le console (src/views/TournamentView.jsx) e
 * per l'avviso all'ingresso dei giocatori (src/views/TournamentNoticeLayer.jsx).
 * Solo funzioni pure.
 */

export const TITLE_MAX = 40
export const DESCRIPTION_MAX = 300
export const PLAYERS_MIN = 3
// Valori proposti per i partecipanti massimi (il backend accetta fino a 64).
export const PLAYERS_CHOICES = [null, ...Array.from({ length: 30 }, (_, index) => index + PLAYERS_MIN)]
export const SERIES = [1, 3, 5]
// Serie fisse (numero di partite) del girone con i pareggi ammessi.
export const FIXED_SERIES = [1, 2, 3]
export const POINTS_MAX = 10
export const WALKOVER_SCORE_MAX = 99
export const SIDES = [
  { id: 'alternate', label: 'Alternati', note: 'P1 e P2 si scambiano a ogni partita della serie' },
  { id: 'random', label: 'Sorteggiati', note: 'A ogni partita si sorteggia chi è P1' },
  { id: 'free', label: 'Liberi', note: 'Decidono i giocatori' },
]
// Formati del torneo (README «Torneo»): `ready` = si sceglie nelle Impostazioni, `startable` = si avvia.
export const FORMATS = [
  { id: 'single', label: 'Eliminazione diretta', ready: true, startable: true },
  { id: 'double', label: 'Doppia eliminazione', ready: true, startable: true },
  { id: 'round_robin', label: 'Girone all’italiana', ready: true, startable: true },
  { id: 'swiss', label: 'Svizzero', ready: false, startable: false },
  { id: 'two_stage', label: 'Due fasi', ready: false, startable: false },
]
// Andata e ritorno del girone.
export const LEGS = [
  { id: 'single', label: 'Solo andata' },
  { id: 'double', label: 'Andata e ritorno', note: 'Al ritorno i lati si invertono' },
]
export const SEEDINGS = [
  { id: 'random', label: 'A caso', note: 'Sorteggio all’avvio' },
  { id: 'xp', label: 'Per XP', note: 'Prima chi ha più XP' },
  { id: 'time', label: 'Per tempo giocato', note: 'Prima chi ha giocato di più a questo gioco' },
  { id: 'mix', label: 'Misto', note: 'XP e tempo giocato, con i pesi scelti' },
]
export const SEEDING_STEP = 10
export const ADVANTAGED_SIDES = [
  { id: 'none', label: 'Nessuno' },
  { id: 'p1', label: 'P1' },
  { id: 'p2', label: 'P2' },
]
// Serie della semifinale dell'eliminazione diretta: `null` = come i turni.
export const SEMI_SERIES = [null, 1, 3, 5]
// Gran finale della doppia eliminazione.
export const GRAND_FINALS = [
  { id: 'reset', label: 'Con rivincita', note: 'Se vince chi arriva dai perdenti si gioca di nuovo' },
  { id: 'single', label: 'Incontro unico', note: 'Un solo incontro decide il torneo' },
  { id: 'none', label: 'Nessuna', note: 'Il torneo finisce con le finali dei due tabelloni' },
]
// Serie della gran finale (e della rivincita): `null` = come le finali.
export const GRAND_SERIES = [null, 1, 3, 5]
// Opzioni proprie di ogni formato con i valori predefiniti (come il backend).
const FORMAT_OPTIONS = {
  single: { semiSeries: null },
  double: { grandFinal: 'reset', grandSeries: null },
  round_robin: { legs: 'single', draws: false, points: [3, 1, 0], score: false, walkoverScore: [1, 0] },
}
// Tasti della combinazione: START conferma e SELECT ricomincia (src/input/mapping.js per i nomi).
export const COMBO_BUTTONS = new Set(['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt'])
// Passi del campo data e ora, da sinistra a destra.
export const DATE_PARTS = ['day', 'month', 'year', 'hour', 'minute']
export const MINUTE_STEP = 5

const STATUS_LABELS = {
  draft: 'Bozza',
  open: 'Iscrizioni aperte',
  running: 'In corso',
  done: 'Concluso',
  cancelled: 'Annullato',
}

const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

function pad2(value) {
  return String(value).padStart(2, '0')
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || status
}

/** «Partita secca» o «Al meglio di 3». */
export function seriesLabel(games) {
  return games === 1 ? 'Partita secca' : `Al meglio di ${games}`
}

/** Nome del formato: «Eliminazione diretta». */
export function formatLabel(id) {
  const entry = FORMATS.find((item) => item.id === id)
  return entry ? entry.label : id
}

/** Vero se il formato si può già scegliere. */
export function formatReady(id) {
  return FORMATS.some((item) => item.id === id && item.ready)
}

/** Vero se il formato si può già avviare (schermata «Avvia»). */
export function formatStartable(id) {
  return FORMATS.some((item) => item.id === id && item.startable)
}

/** Teste di serie in breve: «a caso», «per XP», «per tempo giocato», «misto 60% XP». */
export function seedingLabel(tournament) {
  if (tournament.seeding === 'mix') {
    const weight = tournament.seedingWeight === undefined ? 50 : tournament.seedingWeight
    return `misto ${weight}% XP`
  }
  const entry = SEEDINGS.find((item) => item.id === tournament.seeding)
  return entry ? entry.label.charAt(0).toLowerCase() + entry.label.slice(1) : 'a caso'
}

/** «60% XP · 40% tempo» per il cursore dei pesi. */
export function weightLabel(weight) {
  return `${weight}% XP · ${100 - weight}% tempo`
}

/** Peso spostato di un passo `dir` (-1, 1), tra 0 e 100. */
export function stepWeight(weight, dir) {
  return Math.max(0, Math.min(100, weight + dir * SEEDING_STEP))
}

export function advantagedLabel(id) {
  const entry = ADVANTAGED_SIDES.find((item) => item.id === id)
  return entry ? entry.label : 'Nessuno'
}

/** Vero se il lato vantaggiato conta: lati alternati o sorteggiati. */
export function hasAdvantagedSide(sides) {
  return sides === 'alternate' || sides === 'random'
}

/** Serie della semifinale: «Come i turni» o come `seriesLabel`. */
export function semiLabel(games) {
  return games === null || games === undefined ? 'Come i turni' : seriesLabel(games)
}

function semiSeries(tournament) {
  const value = tournament.options ? tournament.options.semiSeries : null
  return value === undefined ? null : value
}

/** Opzioni predefinite del formato `format` (copia, liste comprese). */
export function defaultOptions(format) {
  const result = {}
  Object.entries(FORMAT_OPTIONS[format] || {}).forEach(([key, value]) => {
    result[key] = Array.isArray(value) ? [...value] : value
  })
  return result
}

// --- Girone all'italiana -------------------------------------------------------------------

/** Opzioni del girone del torneo (o del valore della modale), con i predefiniti per le mancanti. */
export function leagueOptions(tournament) {
  return { ...defaultOptions('round_robin'), ...((tournament && tournament.options) || {}) }
}

/** Serie ammesse: nel girone con i pareggi un numero fisso di partite (1, 2, 3), altrimenti 1/3/5. */
export function seriesChoices(format, options) {
  return format === 'round_robin' && options && options.draws ? FIXED_SERIES : SERIES
}

/**
 * Serie `value` portata tra `choices`: uguale se c'è, altrimenti la più
 * vicina (a pari distanza la più lunga). Accendendo i pareggi 5 diventa 3,
 * spegnendoli 2 diventa 3 (come il backend).
 */
export function fitSeries(value, choices) {
  if (choices.includes(value)) {
    return value
  }
  return [...choices].sort((a, b) => Math.abs(a - value) - Math.abs(b - value) || b - a)[0]
}

/** Serie fissa: «Partita secca», «2 partite», «3 partite». */
export function fixedSeriesLabel(games) {
  return games === 1 ? 'Partita secca' : `${games} partite`
}

/** Serie degli incontri di un torneo o di un valore della modale: fissa con i pareggi del girone. */
export function matchSeriesLabel(tournament, games) {
  const fixed = tournament.format === 'round_robin' && leagueOptions(tournament).draws
  return fixed ? fixedSeriesLabel(games) : seriesLabel(games)
}

export function legsLabel(id) {
  const entry = LEGS.find((item) => item.id === id)
  return entry ? entry.label : LEGS[0].label
}

/** «3/1/0» per i punti di vittoria, pareggio e sconfitta. */
export function pointsLabel(points) {
  return points.join('/')
}

/** «1–0» per il punteggio a tavolino. */
export function walkoverScoreLabel(score) {
  return `${score[0]}–${score[1]}`
}

function range(low, high) {
  return Array.from({ length: Math.max(0, high - low + 1) }, (_, index) => low + index)
}

/**
 * Valori ammessi per la voce `index` (0 vittoria, 1 pareggio, 2 sconfitta)
 * dei punti `points`, con le altre due ferme: vittoria > pareggio ≥ sconfitta.
 */
export function pointChoices(points, index) {
  const [win, draw, loss] = points
  if (index === 0) {
    return range(draw + 1, POINTS_MAX)
  }
  if (index === 1) {
    return range(loss, win - 1)
  }
  return range(0, draw)
}

/** Valori ammessi per la voce `index` (0 vincitore, 1 perdente) del punteggio a tavolino: vincitore > perdente. */
export function walkoverChoices(score, index) {
  return index === 0 ? range(score[1] + 1, WALKOVER_SCORE_MAX) : range(0, score[0] - 1)
}

/** Riga del riepilogo del girone: «andata e ritorno, partita secca, pareggi 3/1/0, punteggio (tavolino 1–0)». */
function leagueLine(tournament) {
  const options = leagueOptions(tournament)
  const lower = (text) => text.charAt(0).toLowerCase() + text.slice(1)
  const parts = [lower(legsLabel(options.legs)), lower(matchSeriesLabel(tournament, tournament.roundSeries))]
  parts.push(options.draws ? `pareggi ${pointsLabel(options.points)}` : 'senza pareggi')
  if (options.score) {
    parts.push(`punteggio (tavolino ${walkoverScoreLabel(options.walkoverScore)})`)
  }
  return parts.join(', ')
}

/** Opzione `key` della doppia, col predefinito se manca. */
function doubleOption(tournament, key) {
  const value = tournament.options ? tournament.options[key] : undefined
  return value === undefined ? FORMAT_OPTIONS.double[key] : value
}

/** Gran finale della doppia: `reset`, `single` o `none`. */
export function grandFinalOf(tournament) {
  return doubleOption(tournament, 'grandFinal')
}

/** Serie della gran finale: `null` = come le finali. */
export function grandSeriesOf(tournament) {
  return doubleOption(tournament, 'grandSeries')
}

export function grandFinalLabel(id) {
  const entry = GRAND_FINALS.find((item) => item.id === id)
  return entry ? entry.label : GRAND_FINALS[0].label
}

/** Serie della gran finale: «Come le finali» o come `seriesLabel`. */
export function grandSeriesLabel(games) {
  return games === null || games === undefined ? 'Come le finali' : seriesLabel(games)
}

// Gran finale nella riga di riepilogo: «gran finale con rivincita 5», «gran finale unica», «senza gran finale».
function grandLine(tournament) {
  const grand = grandFinalOf(tournament)
  if (grand === 'none') {
    return 'senza gran finale'
  }
  const series = grandSeriesOf(tournament)
  const text = grand === 'reset' ? 'gran finale con rivincita' : 'gran finale unica'
  return series === null ? text : `${text} ${series}`
}

/**
 * Riga di riepilogo del formato nel modulo:
 * «Eliminazione diretta · teste di serie a caso · turni 1, semifinale come i turni, finale 3, 3° posto».
 */
export function formatLine(tournament, { seeding = true } = {}) {
  const fmt = tournament.format || 'single'
  const parts = seeding ? [formatLabel(fmt), `teste di serie ${seedingLabel(tournament)}`] : [formatLabel(fmt)]
  if (fmt === 'single') {
    const semi = semiSeries(tournament)
    const series = [
      `turni ${tournament.roundSeries}`,
      `semifinale ${semi === null ? 'come i turni' : semi}`,
      `finale ${tournament.finalSeries}`,
    ]
    if (tournament.thirdPlace) {
      series.push('3° posto')
    }
    parts.push(series.join(', '))
  } else if (fmt === 'double') {
    parts.push([`turni ${tournament.roundSeries}`, `finali ${tournament.finalSeries}`, grandLine(tournament)].join(', '))
  } else if (fmt === 'round_robin') {
    parts.push(leagueLine(tournament))
  }
  return parts.join(' · ')
}

/**
 * Incontri da giocare con `count` iscritti (senza i bye); `null` per i
 * formati non ancora pronti. Per la doppia `{min, max}`: la rivincita della
 * gran finale si gioca solo se vince chi arriva dai perdenti; `options` sono
 * le opzioni del formato. Per il girone gli incontri del calendario,
 * senza gli eventuali spareggi.
 */
export function matchCount(format, count, thirdPlace, options) {
  if (format === 'round_robin') {
    const legs = { ...FORMAT_OPTIONS.round_robin, ...(options || {}) }.legs === 'double' ? 2 : 1
    return legs * count * (count - 1) / 2
  }
  if (format === 'double') {
    if (count < 2) {
      return { min: 0, max: 0 }
    }
    const grand = grandFinalOf({ options })
    const least = grand === 'none' ? 2 * count - 3 : 2 * count - 2
    return { min: least, max: least + (grand === 'reset' ? 1 : 0) }
  }
  if (format !== 'single') {
    return null
  }
  if (count < 2) {
    return 0
  }
  return count - 1 + (thirdPlace && count >= 4 ? 1 : 0)
}

/** «Con 5 iscritti: 4 incontri (eliminazione diretta).» per la chiusura delle iscrizioni. */
export function matchesText(count, matches, format) {
  const enrolled = count === 1 ? '1 iscritto' : `${count} iscritti`
  const name = formatLabel(format).toLowerCase()
  if (matches === null || matches === undefined) {
    return `Con ${enrolled}: numero di incontri non ancora disponibile (${name}).`
  }
  return `Con ${enrolled}: ${countLabel(matches, format)} (${name}).`
}

export function sidesLabel(id) {
  const entry = SIDES.find((item) => item.id === id)
  return entry ? entry.label : id
}

/** «Nessun limite» o «8 partecipanti». */
export function playersLabel(max) {
  return max === null || max === undefined ? 'Nessun limite' : `${max} partecipanti`
}

/** «sab 1 nov 2026 · 21:30» nell'ora locale; vuoto senza data. */
export function formatStart(iso) {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()} · ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** Valore di una parte del campo data e ora, come si mostra: «01», «nov», «2026», «21», «30». */
export function datePartLabel(date, part) {
  switch (part) {
    case 'day':
      return pad2(date.getDate())
    case 'month':
      return MONTHS[date.getMonth()]
    case 'year':
      return String(date.getFullYear())
    case 'hour':
      return pad2(date.getHours())
    default:
      return pad2(date.getMinutes())
  }
}

/** Data proposta: la mezz'ora successiva a `now` (ora locale), al minuto. */
export function defaultStart(now) {
  const date = new Date(now.getTime())
  date.setSeconds(0, 0)
  date.setMinutes(date.getMinutes() < 30 ? 30 : 60)
  return date
}

/**
 * Data spostata di un passo `dir` (-1, 1) nella parte `part`: giorno, mese,
 * anno, ora o `MINUTE_STEP` minuti. Il giorno e i minuti passano al mese e
 * all'ora successivi; il mese non cambia il giorno oltre la fine del mese.
 */
export function stepDate(date, part, dir) {
  const next = new Date(date.getTime())
  if (part === 'day') {
    next.setDate(next.getDate() + dir)
  } else if (part === 'month' || part === 'year') {
    const day = next.getDate()
    next.setDate(1)
    if (part === 'month') {
      next.setMonth(next.getMonth() + dir)
    } else {
      next.setFullYear(next.getFullYear() + dir)
    }
    const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
    next.setDate(Math.min(day, last))
  } else if (part === 'hour') {
    next.setHours(next.getHours() + dir)
  } else {
    const minutes = Math.floor(next.getMinutes() / MINUTE_STEP) * MINUTE_STEP
    next.setMinutes(minutes + dir * MINUTE_STEP)
  }
  return next
}

/** Parte a un passo `dir` da `part`, sempre circolare. */
export function stepPart(part, dir) {
  const index = Math.max(0, DATE_PARTS.indexOf(part))
  return DATE_PARTS[(index + dir + DATE_PARTS.length) % DATE_PARTS.length]
}

/** Tasto della combinazione per l'evento (`null` se non conta): solo le pressioni dei tasti ammessi. */
export function comboButton(event) {
  return event && event.kind === 'press' && COMBO_BUTTONS.has(event.button) ? event.button : null
}

export function sameCombo(a, b) {
  return a.length === b.length && a.every((button, index) => button === b[index])
}

/** «Nessuna, azioni libere» oppure «Impostata»: la lunghezza non si mostra. */
export function comboLabel(tournament) {
  return tournament && tournament.combo ? 'Impostata' : 'Nessuna, azioni libere'
}

/** Vero se il profilo `account` ha creato il torneo. */
export function isCreator(tournament, account) {
  return Boolean(tournament && account !== null && account !== undefined && tournament.creatorId === account)
}

/** Cosa manca per pubblicare la bozza (frase), oppure `null`. `now` è la data attuale. */
export function publishProblem(tournament, now) {
  if (!tournament) {
    return 'Nessun torneo.'
  }
  if (!tournament.series || !tournament.series.name) {
    return 'Scrivi il nome della serie.'
  }
  if (!tournament.system || !tournament.game) {
    return 'Scegli il gioco del torneo.'
  }
  if (tournament.startsAt && new Date(tournament.startsAt).getTime() <= now.getTime()) {
    return 'La data d’inizio è già passata: cambiala o toglila.'
  }
  return null
}

/** Campi modificabili nello stato del torneo: tutti in bozza e con le iscrizioni aperte, poi solo i testi. */
export function editable(tournament, field) {
  if (!tournament || tournament.status === 'done' || tournament.status === 'cancelled') {
    return false
  }
  return tournament.status !== 'running' || field === 'title' || field === 'description'
}

/** Nome dello slot di un salvataggio: «Riprendi» per lo 0, «Slot N · nome» per gli altri. */
export function slotLabel(slot) {
  if (slot.slot === 0) {
    return 'Riprendi'
  }
  return slot.name ? `Slot ${slot.slot} · ${slot.name}` : `Slot ${slot.slot}`
}

/** Giochi che contengono il testo `text` nel titolo (senza distinguere maiuscole e accenti). */
export function filterGames(games, text) {
  const wanted = fold(text)
  if (!wanted) {
    return games
  }
  return games.filter((game) => fold(game.title).includes(wanted))
}

function fold(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Voci intorno all'indice `index` da mostrare in un elenco lungo: `{start, end}` (fine esclusa). */
export function listWindow(count, index, size) {
  if (count <= size) {
    return { start: 0, end: count }
  }
  const start = Math.max(0, Math.min(count - size, index - Math.floor(size / 2)))
  return { start, end: start + size }
}

// --- Scheda TOURNAMENT tra le console --------------------------------------------------

// Scheda in coda alle console: `id` diverso dalle cartelle di `games/` (che non hanno «@»).
export const TOURNAMENT_CONSOLE = { id: '@tournament', name: 'TOURNAMENT', accent: '#f5c542' }

function startTime(tournament) {
  const time = tournament.startsAt ? new Date(tournament.startsAt).getTime() : NaN
  return Number.isNaN(time) ? Infinity : time
}

const TAB_ORDER = { running: 0, open: 1, done: 2 }

function finishTime(tournament) {
  const time = tournament.finishedAt ? new Date(tournament.finishedAt).getTime() : NaN
  return Number.isNaN(time) ? 0 : time
}

/**
 * Tornei della scheda TOURNAMENT: quello in corso, poi quelli con le iscrizioni
 * aperte dal più vicino (senza data in fondo), a parità dal più vecchio, poi i
 * conclusi di recente (`recent` di `GET /api/tournament`) dal più recente. Le bozze no.
 */
export function tabTournaments(list) {
  return (list || [])
    .filter((item) => item.status in TAB_ORDER)
    .sort((a, b) => TAB_ORDER[a.status] - TAB_ORDER[b.status] ||
      (a.status === 'done' ? finishTime(b) - finishTime(a) : startTime(a) - startTime(b)) || a.id - b.id)
}

function sameDay(iso, now) {
  if (!iso) {
    return false
  }
  const day = new Date(iso)
  return day.getFullYear() === now.getFullYear() && day.getMonth() === now.getMonth() && day.getDate() === now.getDate()
}

/**
 * Tornei da pubblicizzare nel salvaschermo (README «Salvaschermo»): in corso,
 * con le iscrizioni aperte e l'inizio oggi (ora locale), conclusi oggi; nello
 * stesso ordine della scheda TOURNAMENT.
 */
export function adTournaments(list, now) {
  return tabTournaments(list).filter((item) => item.status === 'running' ||
    (item.status === 'open' && sameDay(item.startsAt, now)) || (item.status === 'done' && sameDay(item.finishedAt, now)))
}

/** Vero se il torneo ha un tabellone da aprire: in corso o concluso (in sola lettura). */
export function hasBoard(tournament) {
  return Boolean(tournament) && (tournament.status === 'running' || tournament.status === 'done')
}

/** Vero se c'è un torneo in corso (pallino rosso sulla scheda). */
export function hasRunning(list) {
  return (list || []).some((item) => item.status === 'running')
}

/**
 * Quando inizia, rispetto a `now`: «Inizia tra 2 g 4 h», «Inizia tra 3 h 10 min»,
 * «Inizia tra 5 min»; passata l'ora «In attesa dell’avvio»; senza data «Data da decidere».
 */
export function countdown(iso, now) {
  if (!iso) {
    return 'Data da decidere'
  }
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) {
    return 'Data da decidere'
  }
  const minutes = Math.ceil((time - now.getTime()) / 60000)
  if (minutes <= 0) {
    return 'In attesa dell’avvio'
  }
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) {
    return hours ? `Inizia tra ${days} g ${hours} h` : `Inizia tra ${days} g`
  }
  const rest = minutes % 60
  if (hours > 0) {
    return rest ? `Inizia tra ${hours} h ${rest} min` : `Inizia tra ${hours} h`
  }
  return `Inizia tra ${minutes} min`
}

/**
 * Conto alla rovescia a riquadri: `{days, hours, minutes}` (minuti arrotondati
 * per eccesso), oppure `null` senza data o con l'ora già passata.
 */
export function countdownParts(iso, now) {
  const time = iso ? new Date(iso).getTime() : NaN
  if (Number.isNaN(time)) {
    return null
  }
  const minutes = Math.ceil((time - now.getTime()) / 60000)
  if (minutes <= 0) {
    return null
  }
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60 }
}

/** Voci del formato per le etichette: «Turni · Partita secca», «Finale · Al meglio di 3», «3° posto»… */
export function formatChips(tournament) {
  const chips = [{ id: 'format', label: formatLabel(tournament.format || 'single'), value: null }]
  if (tournament.format === 'round_robin') {
    const options = leagueOptions(tournament)
    chips.push({ id: 'legs', label: legsLabel(options.legs), value: null })
    chips.push({ id: 'rounds', label: 'Incontri', value: matchSeriesLabel(tournament, tournament.roundSeries) })
    chips.push(options.draws
      ? { id: 'draws', label: 'Pareggi', value: `punti ${pointsLabel(options.points)}` }
      : { id: 'draws', label: 'Senza pareggi', value: null })
    if (options.score) {
      chips.push({ id: 'score', label: 'Punteggio', value: `tavolino ${walkoverScoreLabel(options.walkoverScore)}` })
    }
    chips.push({ id: 'sides', label: 'Lati', value: sidesLabel(tournament.sides) })
    if (tournament.savesLocked) {
      chips.push({ id: 'saves', label: 'Salvataggi bloccati', value: null })
    }
    return chips
  }
  const double = tournament.format === 'double'
  chips.push({ id: 'rounds', label: 'Turni', value: seriesLabel(tournament.roundSeries) })
  if (semiSeries(tournament) !== null && !double) {
    chips.push({ id: 'semi', label: 'Semifinale', value: seriesLabel(semiSeries(tournament)) })
  }
  chips.push({ id: 'final', label: double ? 'Finali' : 'Finale', value: seriesLabel(tournament.finalSeries) })
  if (double) {
    const grand = grandFinalOf(tournament)
    const series = grandSeriesOf(tournament)
    chips.push({
      id: 'grand',
      label: grand === 'none' ? 'Senza gran finale' : grand === 'reset' ? 'Gran finale con rivincita' : 'Gran finale',
      value: grand === 'none' ? null : seriesLabel(series === null ? tournament.finalSeries : series),
    })
  }
  chips.push({ id: 'sides', label: 'Lati', value: sidesLabel(tournament.sides) })
  if (tournament.thirdPlace && !double) {
    chips.push({ id: 'third', label: '3° posto', value: null })
  }
  if (tournament.savesLocked) {
    chips.push({ id: 'saves', label: 'Salvataggi bloccati', value: null })
  }
  return chips
}

/** Stato per l'etichetta colorata: `{tone: 'live' | 'done' | 'closed' | 'open', label}`. */
export function statusBadge(tournament) {
  if (tournament.status === 'running') {
    return { tone: 'live', label: 'IN CORSO' }
  }
  if (tournament.status === 'done') {
    return { tone: 'done', label: 'CONCLUSO' }
  }
  if (tournament.registrationClosed) {
    return { tone: 'closed', label: 'ISCRIZIONI CHIUSE' }
  }
  return { tone: 'open', label: 'ISCRIZIONI APERTE' }
}

/**
 * Formato in breve: «Eliminazione diretta · Turni: partita secca · Finale: al meglio di 3 · 3° posto ·
 * Salvataggi bloccati».
 */
export function formatSummary(tournament) {
  const lower = (text) => text.charAt(0).toLowerCase() + text.slice(1)
  if (tournament.format === 'round_robin') {
    const options = leagueOptions(tournament)
    const parts = [formatLabel('round_robin'), legsLabel(options.legs),
      `Incontri: ${lower(matchSeriesLabel(tournament, tournament.roundSeries))}`,
      options.draws ? `Pareggi ammessi: punti ${pointsLabel(options.points)}` : 'Senza pareggi']
    if (options.score) {
      parts.push(`Punteggio registrato, tavolino ${walkoverScoreLabel(options.walkoverScore)}`)
    }
    if (tournament.savesLocked) {
      parts.push('Salvataggi bloccati')
    }
    return parts.join(' · ')
  }
  const double = tournament.format === 'double'
  const parts = [formatLabel(tournament.format || 'single'), `Turni: ${lower(seriesLabel(tournament.roundSeries))}`]
  if (semiSeries(tournament) !== null && !double) {
    parts.push(`Semifinale: ${lower(seriesLabel(semiSeries(tournament)))}`)
  }
  parts.push(`${double ? 'Finali' : 'Finale'}: ${lower(seriesLabel(tournament.finalSeries))}`)
  if (double) {
    const grand = grandFinalOf(tournament)
    const series = grandSeriesOf(tournament)
    parts.push(grand === 'none' ? 'Senza gran finale'
      : `${grand === 'reset' ? 'Gran finale con rivincita' : 'Gran finale'}: ` +
        lower(seriesLabel(series === null ? tournament.finalSeries : series)))
  }
  if (tournament.thirdPlace && !double) {
    parts.push('3° posto')
  }
  if (tournament.savesLocked) {
    parts.push('Salvataggi bloccati')
  }
  return parts.join(' · ')
}

function enrolledCount(tournament) {
  return (tournament.players || []).length
}

/** Posti liberi, oppure `null` senza limite. */
export function freeSeats(tournament) {
  if (tournament.maxPlayers === null || tournament.maxPlayers === undefined) {
    return null
  }
  return Math.max(0, tournament.maxPlayers - enrolledCount(tournament))
}

/** «5 iscritti · 3 posti liberi», «1 iscritto · 1 posto libero», «Nessun iscritto», «… · al completo». */
export function seatsLabel(tournament) {
  const count = enrolledCount(tournament)
  const enrolled = count === 0 ? 'Nessun iscritto' : count === 1 ? '1 iscritto' : `${count} iscritti`
  const free = freeSeats(tournament)
  if (free === null) {
    return enrolled
  }
  if (free === 0) {
    return `${enrolled} · al completo`
  }
  return `${enrolled} · ${free === 1 ? '1 posto libero' : `${free} posti liberi`}`
}

/** Vero se il profilo `account` è iscritto. */
export function isEnrolled(tournament, account) {
  return (tournament.players || []).some((player) => player.id === account)
}

/** Vero se ci si può iscrivere o ritirare da soli: iscrizioni aperte e non chiuse dall'admin. */
export function registrationOpen(tournament) {
  return tournament.status === 'open' && !tournament.registrationClosed
}

/** Vero se non ci sono più posti. */
export function isFull(tournament) {
  return freeSeats(tournament) === 0
}

/** Stato in breve per la scheda: «In corso», «Concluso», «Iscrizioni chiuse» o il conto alla rovescia. */
export function tabStatus(tournament, now) {
  if (tournament.status === 'running') {
    return 'In corso'
  }
  if (tournament.status === 'done') {
    return 'Concluso'
  }
  if (tournament.registrationClosed) {
    return `Iscrizioni chiuse · ${countdown(tournament.startsAt, now)}`
  }
  return countdown(tournament.startsAt, now)
}

/**
 * Voci del menu del torneo per il giocatore `slot` con l'utente `user`
 * (`{id, guest}` o `null`): prima le sue (Iscriviti / Ritirati, «Crea un
 * profilo» per l'ospite), poi quelle dell'admin, solo per il creatore come P1
 * con le iscrizioni aperte (in fondo «Avvia il torneo…»). Ogni voce è `{id, label, admin, disabled}`.
 */
export function menuItems(tournament, slot, user) {
  const items = []
  // «Allenati»: porta al gioco del torneo nella libreria, per chiunque e in ogni stato.
  if (tournament.system && tournament.game) {
    const title = tournament.gameInfo ? tournament.gameInfo.title : tournament.game
    items.push({ id: 'practice', label: `Allenati a ${title}`, admin: false, disabled: false })
  }
  if (!user) {
    return items
  }
  if (tournament.status === 'open') {
    if (user.guest) {
      items.push({ id: 'create', label: 'Crea un profilo per iscriverti', admin: false, disabled: false })
    } else if (tournament.registrationClosed) {
      items.push({ id: 'closed', label: 'Iscrizioni chiuse', admin: false, disabled: true })
    } else if (isEnrolled(tournament, user.id)) {
      items.push({ id: 'leave', label: 'Ritirati', admin: false, disabled: false })
    } else if (isFull(tournament)) {
      items.push({ id: 'full', label: 'Iscrizioni al completo', admin: false, disabled: true })
    } else {
      items.push({ id: 'join', label: 'Iscriviti', admin: false, disabled: false })
    }
  }
  if (slot === 'p1' && !user.guest && isCreator(tournament, user.id) && tournament.status === 'open') {
    items.push(
      { id: 'add', label: 'Iscrivi un profilo…', admin: true, disabled: isFull(tournament) },
      { id: 'remove', label: 'Togli un iscritto…', admin: true, disabled: enrolledCount(tournament) === 0 },
      tournament.registrationClosed
        ? { id: 'reopen', label: 'Riapri le iscrizioni', admin: true, disabled: false }
        : { id: 'close', label: 'Chiudi le iscrizioni', admin: true, disabled: false },
      { id: 'start', label: 'Avvia il torneo…', admin: true, disabled: false },
    )
  }
  return items
}

/**
 * Tornei da proporre a chi entra: iscrizioni aperte (non chiuse), con posti
 * liberi e, per un profilo, senza la sua iscrizione. `user` è `{id, guest}`.
 */
export function noticeTournaments(list, user) {
  if (!user) {
    return []
  }
  return tabTournaments(list).filter((item) => registrationOpen(item) && !isFull(item) &&
    (user.guest || !isEnrolled(item, user.id)))
}

/** Testo dell'avviso per i tornei `targets` (almeno uno): `{title, text, question}`. */
export function noticeText(targets, guest, now) {
  const question = guest ? 'Crea un profilo se vuoi partecipare.' : null
  if (targets.length === 1) {
    const [item] = targets
    const game = item.gameInfo ? ` (${item.gameInfo.title})` : ''
    const when = item.startsAt ? `, ${countdown(item.startsAt, now).toLowerCase()}` : ''
    return {
      title: 'C’è un torneo',
      text: `«${item.fullTitle}»${game}${when}.`,
      question: question || 'Ti vuoi iscrivere?',
    }
  }
  return {
    title: 'Tornei aperti',
    text: `Ci sono ${targets.length} tornei con le iscrizioni aperte.`,
    question: question || 'Vuoi vederli?',
  }
}

// --- Avvio e tabellone -------------------------------------------------------------------

// Nomi dei turni contati dalla finale: 0 = finale, 1 = semifinale…
const ROUND_NAMES = [
  { name: 'Finale', short: 'F' },
  { name: 'Semifinale', short: 'S' },
  { name: 'Quarti', short: 'Q' },
  { name: 'Ottavi', short: 'O' },
  { name: 'Sedicesimi', short: 'SD' },
]

/** Turni del tabellone principale (`bracket` `main`) negli incontri `matches`. */
export function roundsOf(matches) {
  return (matches || []).reduce((max, match) => (match.bracket === 'main' ? Math.max(max, match.round) : max), 0)
}

/** «Finale», «Semifinale», «Quarti», «Ottavi», «Sedicesimi», poi «Turno 1», «Turno 2»… */
export function roundName(round, rounds) {
  const entry = ROUND_NAMES[rounds - round]
  return entry ? entry.name : `Turno ${round}`
}

/** Sigla dell'incontro: «F», «S1», «Q2», «O3», «SD4», «T1.5» per i primi turni, «3°» per il 3° posto. */
export function matchLabel(match, rounds) {
  if (match.bracket === 'third') {
    return '3°'
  }
  const entry = ROUND_NAMES[rounds - match.round]
  if (!entry) {
    return `T${match.round}.${match.slot + 1}`
  }
  return entry.short === 'F' ? 'F' : `${entry.short}${match.slot + 1}`
}

/** Vero per gli incontri della doppia eliminazione (tabelloni `winners`, `losers`, `grand`). */
export function isDouble(matches) {
  return (matches || []).some((match) => match.bracket === 'winners')
}

/** Vero per gli incontri di un girone all'italiana. */
export function isLeague(matches) {
  return (matches || []).some((match) => match.bracket === 'league')
}

/** Vero per un incontro del girone o di un suo spareggio (`bracket` `league` o `playoff`). */
export function isLeagueMatch(match) {
  return Boolean(match) && (match.bracket === 'league' || match.bracket === 'playoff')
}

/** «2°» per il posto `place`. */
function ordinal(place) {
  return `${place}°`
}

/** «il 2° posto», «il 1° e il 3° posto» per i gruppi `groups` (`[{place}]`). */
function placesText(groups) {
  const places = (groups || []).map((group) => group.place).filter((place) => place)
  if (!places.length) {
    return 'il podio'
  }
  const parts = places.map((place) => `il ${ordinal(place)}`)
  const last = parts.pop()
  return `${parts.length ? `${parts.join(', ')} e ` : ''}${last} posto`
}

/**
 * Avviso degli spareggi del girone dal `tournament.playoff` del backend:
 * «Serve uno spareggio per il 2° posto», «Servono spareggi per il 1° e il
 * 3° posto», «Sorteggio per il 2° posto: tocca all’admin»; vuoto se non ce
 * ne sono o se il torneo è concluso.
 */
export function playoffNotice(tournament) {
  const playoff = tournament && tournament.playoff
  if (!playoff || tournament.status !== 'running') {
    return ''
  }
  if (playoff.status === 'playing') {
    const several = playoff.groups.length > 1
    return `${several ? 'Servono spareggi' : 'Serve uno spareggio'} per ${placesText(playoff.groups)}`
  }
  if (playoff.status === 'draw') {
    return `Sorteggio per ${placesText(playoff.groups)}: tocca all’admin`
  }
  return ''
}

/** Testo della conferma del sorteggio: «Sorteggiare il 2° posto tra Anna e Luca? Il torneo si conclude.». */
export function lotsText(tournament, people) {
  const groups = ((tournament && tournament.playoff) || {}).groups || []
  const parts = groups.map((group) => {
    const names = group.players.map((id) => personName(people, id))
    const last = names.pop()
    return `il ${ordinal(group.place)} posto tra ${names.join(', ')} e ${last}`
  })
  return `Sorteggiare ${parts.join('; ')}? Il torneo si conclude.`
}

/**
 * Risultato del sorteggio per l'elenco: `[{id, label, note, color}]`, una
 * riga per giocatore nell'ordine estratto («2° · Anna»).
 */
export function lotsRows(draw, people) {
  return (draw || []).flatMap((group) => group.players.map((id, index) => {
    const person = people.get(id)
    return {
      id: `${group.place}-${id}`,
      label: `${ordinal(group.place + index)} · ${person ? person.name : '?'}`,
      note: index === 0 ? 'estratto per primo' : null,
      color: person ? person.color : null,
    }
  }))
}

// Coppia di giocatori dell'incontro, nello stesso ordine per andata e ritorno.
function pairKey(match) {
  return [match.playerA, match.playerB].sort((a, b) => a - b).join('-')
}

/** Vero se l'incontro del girone è del ritorno: la stessa coppia ha già un incontro in una giornata prima. */
export function isReturnLeg(match, matches) {
  const key = pairKey(match)
  return (matches || []).some((other) => other.bracket === 'league' && other.round < match.round &&
    pairKey(other) === key)
}

/** «Giornata 3», «Giornata 7 · Ritorno» o, per uno spareggio, «Spareggio». */
export function leagueRoundName(match, matches) {
  if (match.bracket === 'playoff') {
    return 'Spareggio'
  }
  return `Giornata ${match.round}${isReturnLeg(match, matches) ? ' · Ritorno' : ''}`
}

/**
 * Giornate del girone: `[{round, name, matches, resting}]` in ordine, con gli
 * incontri per `slot` e `resting` = id dei giocatori di `players` (lista di
 * id) che in quella giornata non giocano. In fondo una giornata «Spareggio»
 * per ogni gruppo di spareggio (`round` = `po<gruppo>`, incontri in ordine di
 * gioco, nessun riposo); con `playoff` (`tournament.playoff`) il nome dice il
 * posto in palio, «Spareggio · 2° posto».
 */
export function leagueDays(matches, players, playoff = null) {
  const league = (matches || []).filter((match) => match.bracket === 'league')
  const rounds = sortedSet(league.map((match) => match.round))
  const days = rounds.map((round) => {
    const inside = league.filter((match) => match.round === round).sort((a, b) => a.slot - b.slot)
    const busy = new Set(inside.flatMap((match) => [match.playerA, match.playerB]))
    return {
      round,
      name: leagueRoundName(inside[0], league),
      matches: inside,
      resting: (players || []).filter((id) => !busy.has(id)),
    }
  })
  const extra = (matches || []).filter((match) => match.bracket === 'playoff')
  for (const group of sortedSet(extra.map((match) => match.groupNo))) {
    const inside = extra.filter((match) => match.groupNo === group).sort((a, b) => a.playOrder - b.playOrder)
    const found = ((playoff && playoff.groups) || []).find((item) =>
      (item.matches || []).includes(inside[0].key))
    days.push({
      round: `po${group}`,
      name: found && found.place ? `Spareggio · ${ordinal(found.place)} posto` : 'Spareggio',
      matches: inside,
      resting: [],
    })
  }
  return days
}

/** «Giornata 3 di 7» per l'incontro `match` del girone, «Spareggio» per uno spareggio. */
export function leagueDayLabel(match, matches) {
  if (match.bracket === 'playoff') {
    return 'Spareggio'
  }
  const total = sortedSet((matches || []).filter((item) => item.bracket === 'league').map((item) => item.round))
    .length
  return `Giornata ${match.round} di ${total}`
}

/**
 * Chiave del primo incontro della giornata prima (`dir` -1) o dopo (1) di
 * quella dell'incontro `cursor`. Oltre l'ultima giornata, con `wrap` si
 * riparte dall'altro capo, altrimenti il cursore resta dov'è.
 */
export function leagueDayStep(matches, cursor, dir, wrap) {
  const days = leagueDays(matches, [])
  if (!days.length) {
    return cursor
  }
  const at = Math.max(0, days.findIndex((day) => day.matches.some((match) => match.key === cursor)))
  const to = stepIndex(at, dir, days.length, wrap)
  return to === at ? cursor : days[to].matches[0].key
}

// Partite vinte da `player` nell'incontro.
function gamesWon(match, player) {
  return (match.games || []).filter((game) => game.winnerId === player).length
}

// Punteggio totale di `player` nelle partite dell'incontro (`scoreA` è di `playerA`).
function pointsOf(match, player) {
  const key = player === match.playerA ? 'scoreA' : 'scoreB'
  return (match.games || []).reduce((sum, game) => sum + (game[key] || 0), 0)
}

/**
 * Risultato dell'incontro concluso visto da `player` (senza, da `playerA`):
 * le partite vinte, «2–1», oppure, se `options` (opzioni del girone) ha
 * `score`, il punteggio totale, «7–5»; «–» se non è ancora concluso. A
 * tavolino come lo conta la classifica: le vittorie necessarie a zero (con
 * i pareggi la serie fissa intera), oppure il «Punteggio a tavolino».
 */
export function leagueResult(match, player = match.playerA, options = null) {
  if (match.status !== 'done') {
    return '–'
  }
  const rules = { ...defaultOptions('round_robin'), ...(options || {}) }
  const other = player === match.playerA ? match.playerB : match.playerA
  if (match.walkover && match.winnerId !== null && match.winnerId !== undefined) {
    const series = match.series || 1
    const [high, low] = rules.score ? rules.walkoverScore : [rules.draws ? series : Math.floor(series / 2) + 1, 0]
    return match.winnerId === player ? `${high}–${low}` : `${low}–${high}`
  }
  const count = rules.score ? pointsOf : gamesWon
  return `${count(match, player)}–${count(match, other)}`
}

/**
 * Colonne della classifica del girone, `[{id, label, help}]`: G, V, (P), S,
 * DP, (+/− e PF con il punteggio registrato), (Pt). P e Pt solo con i
 * pareggi ammessi: senza conta chi vince più incontri.
 */
export function standingsColumns(tournament) {
  const options = leagueOptions(tournament)
  const columns = [
    { id: 'played', label: 'G', help: 'giocati' },
    { id: 'won', label: 'V', help: 'vinti' },
  ]
  if (options.draws) {
    columns.push({ id: 'drawn', label: 'P', help: 'pareggiati' })
  }
  columns.push({ id: 'lost', label: 'S', help: 'persi' })
  columns.push({ id: 'gameDiff', label: 'DP', help: 'differenza partite' })
  if (options.score) {
    columns.push({ id: 'scoreDiff', label: '+/−', help: 'differenza punteggio' })
    columns.push({ id: 'scoreFor', label: 'PF', help: 'punteggio fatto' })
  }
  if (options.draws) {
    columns.push({ id: 'points', label: 'Pt', help: 'punti' })
  }
  return columns
}

// Differenza con il segno: «+4», «0», «−2».
function signed(value) {
  if (value > 0) {
    return `+${value}`
  }
  return value < 0 ? `−${-value}` : '0'
}

/** Valore da mostrare della colonna `id` (vedi `standingsColumns`) per la riga `row` della classifica. */
export function standingValue(row, id) {
  if (id === 'gameDiff') {
    return signed((row.gamesFor || 0) - (row.gamesAgainst || 0))
  }
  if (id === 'scoreDiff') {
    return signed((row.scoreFor || 0) - (row.scoreAgainst || 0))
  }
  return String(row[id] || 0)
}

/**
 * Classifica del girone da mostrare, dalle righe `standings` del backend:
 * `[{...riga, player, mark, medal, playoff}]`. `mark` è la posizione («2», o
 * «2=» se è ancora pari dopo tutti i criteri). `medal` (`gold`, `silver`,
 * `bronze` o `null`) va ai primi tre senza i ritirati, che restano al loro
 * posto ma non prendono la medaglia (scala chi sta sotto), e solo da quando
 * c'è un incontro concluso. `playoff` segna chi è pari per una posizione del
 * podio a girone finito: lì serve lo spareggio; `lots` chi è ancora pari dopo
 * gli spareggi e va sorteggiato.
 */
export function leagueTable(tournament) {
  const rows = (tournament && tournament.standings) || []
  const matches = ((tournament && tournament.matches) || []).filter((match) => match.bracket === 'league')
  const started = matches.some((match) => match.status === 'done')
  const over = matches.length > 0 && matches.every((match) => match.status === 'done')
  const drawing = Boolean(tournament && tournament.playoff && tournament.playoff.status === 'draw')
  const people = new Map(((tournament && tournament.players) || []).map((player) => [player.id, player]))
  // Posto sul podio di ogni gruppo di pari (stesso `rank`), contando solo chi non è ritirato.
  const places = new Map()
  const active = new Map()
  let ahead = 0
  for (const row of rows) {
    if (row.withdrawn) {
      continue
    }
    if (!places.has(row.rank)) {
      places.set(row.rank, ahead + 1)
    }
    active.set(row.rank, (active.get(row.rank) || 0) + 1)
    ahead += 1
  }
  const medals = ['gold', 'silver', 'bronze']
  return rows.map((row) => {
    const place = row.withdrawn ? null : places.get(row.rank)
    return {
      ...row,
      player: people.get(row.id) || { id: row.id, name: '?', color: null },
      mark: `${row.rank}${row.tied ? '=' : ''}`,
      medal: started && place && place <= 3 ? medals[place - 1] : null,
      playoff: over && Boolean(place) && place <= 3 && active.get(row.rank) > 1,
      lots: over && Boolean(place) && place <= 3 && active.get(row.rank) > 1 && drawing,
    }
  })
}

/**
 * Glossario delle sigle sotto la classifica: solo le colonne mostrate, e
 * «= pari dopo gli spareggi» se qualcuno lo è.
 */
export function standingsGlossary(columns, rows) {
  const parts = columns.map((column) => `${column.label} ${column.help}`)
  if ((rows || []).some((row) => row.tied)) {
    parts.push('= pari dopo gli spareggi')
  }
  return parts.join(' · ')
}

/**
 * Incontri del girone di `player` per l'elenco della classifica, nell'ordine
 * del calendario: `[{id: chiave, label, note, color}]`. `label` è «Giornata 2
 * · contro Luca», `note` il risultato visto da lui («Vinto 2–0», «Perso
 * 1–2», «Pari 1–1») oppure «In gioco», «Prossimo», «Da giocare»; un tavolino
 * aggiunge «· tavolino».
 */
export function playerMatches(tournament, player) {
  const options = leagueOptions(tournament)
  const matches = ((tournament && tournament.matches) || []).filter(isLeagueMatch)
  const people = new Map(((tournament && tournament.players) || []).map((item) => [item.id, item]))
  const next = nextMatch(matches)
  return leagueDays(matches, []).flatMap((day) => day.matches)
    .filter((match) => match.playerA === player || match.playerB === player)
    .map((match) => {
      const other = people.get(match.playerA === player ? match.playerB : match.playerA)
      let note
      if (match.status === 'done') {
        const won = match.winnerId === player
        const draw = match.winnerId === null || match.winnerId === undefined
        note = `${draw ? 'Pari' : won ? 'Vinto' : 'Perso'} ${leagueResult(match, player, options)}`
      } else if (match.status === 'playing') {
        note = 'In gioco'
      } else {
        note = next && next.key === match.key ? 'Prossimo' : 'Da giocare'
      }
      if (match.walkover) {
        note += ' · tavolino'
      }
      return {
        id: match.key,
        label: `${leagueRoundName(match, matches)} · contro ${other ? other.name : '?'}`,
        note,
        color: other ? other.color : null,
      }
    })
}

// Disegno del girone: una sola colonna con gli incontri in ordine di gioco, per il cursore (▲ ▼).
function leagueLayout(matches) {
  const list = (matches || []).filter(isLeagueMatch)
    .sort((a, b) => a.playOrder - b.playOrder || a.round - b.round || a.slot - b.slot)
  const keys = list.map((match) => match.key)
  return {
    sections: [{ id: 'league', title: null, reach: 0,
      columns: [{ x: 0, round: null, name: 'Calendario', series: null, matches: list, keys, links: {} }] }],
    cells: list.map((match, index) => ({ key: match.key, section: 'league', x: 0, y: (index + 0.5) / list.length })),
  }
}

/** Vero per un incontro del primo turno del tabellone principale o dei vincenti (giocatori da scambiare). */
export function isFirstRound(match) {
  return match.round === 1 && (match.bracket === 'main' || match.bracket === 'winners')
}

// Ultimo turno del tabellone `bracket`.
function lastRound(matches, bracket) {
  return (matches || []).reduce((max, match) => (match.bracket === bracket ? Math.max(max, match.round) : max), 0)
}

/**
 * Bye nascosto dei perdenti nella doppia: l'avversario non esisterà mai,
 * e il giocatore passa da solo. Non si disegna.
 */
export function isHiddenBye(match) {
  return match.bracket === 'losers' && Boolean(match.bye)
}

/**
 * Sigla dell'incontro: nella doppia «V2-3» (vincenti, turno 2, terzo
 * incontro), «P1-2» (perdenti), «GF» e «GF2» (gran finale e rivincita),
 * contando gli incontri della colonna senza i bye; nella diretta come
 * `matchLabel`.
 */
export function matchCode(match, matches) {
  if (match.bracket === 'grand') {
    return match.round > 1 ? 'GF2' : 'GF'
  }
  if (match.bracket !== 'winners' && match.bracket !== 'losers') {
    return matchLabel(match, roundsOf(matches))
  }
  const letter = match.bracket === 'winners' ? 'V' : 'P'
  if (match.bye) {
    return `${letter}${match.round}`
  }
  const column = (matches || [])
    .filter((item) => item.bracket === match.bracket && item.round === match.round && !item.bye)
    .sort((a, b) => a.slot - b.slot)
  return `${letter}${match.round}-${column.findIndex((item) => item.key === match.key) + 1}`
}

/**
 * Nome della colonna di un incontro della doppia: «Turno 2», «Finale
 * vincenti», «Finale perdenti», «Gran finale», «Rivincita».
 */
export function doubleColumnName(match, matches) {
  if (match.bracket === 'grand') {
    return match.round > 1 ? 'Rivincita' : 'Gran finale'
  }
  if (match.round === lastRound(matches, match.bracket)) {
    return match.bracket === 'winners' ? 'Finale vincenti' : 'Finale perdenti'
  }
  return `Turno ${match.round}`
}

/**
 * Turno dell'incontro per i testi: «Quarti», «Finale per il 3° posto»;
 * nella doppia «Vincenti · Turno 2», «Perdenti · Turno 1», «Finale
 * vincenti», «Gran finale». Con `comma` «Perdenti, turno 2».
 */
export function matchRound(match, matches, comma = false) {
  if (isLeagueMatch(match)) {
    return leagueRoundName(match, matches)
  }
  if (match.bracket === 'third') {
    return 'Finale per il 3° posto'
  }
  if (match.bracket === 'main') {
    return roundName(match.round, roundsOf(matches))
  }
  const name = doubleColumnName(match, matches)
  if (!name.startsWith('Turno')) {
    return name
  }
  const side = match.bracket === 'winners' ? 'Vincenti' : 'Perdenti'
  return comma ? `${side}, ${name.toLowerCase()}` : `${side} · ${name}`
}

// Incontro e tipo (`winner`/`loser`) da cui arriva davvero `source`, attraverso i bye nascosti; `null` se nessuno.
function realSource(source, matches) {
  if (!source) {
    return null
  }
  const [kind, key] = source.split(':')
  const from = (matches || []).find((match) => match.key === key)
  if (!from) {
    return null
  }
  if (isHiddenBye(from) && kind === 'winner') {
    return realSource(from.fromA || from.fromB, matches)
  }
  return { kind, match: from }
}

/**
 * «Vincitore di Q2» o «Perdente di S1» per una casella ancora vuota
 * (`source` = `winner:<key>`); nella doppia «Vincitore di V2-3», «Perdente
 * di V2-3», «Vincitore dei vincenti», «Vincitore dei perdenti» (i bye
 * nascosti si saltano).
 */
export function sourceLabel(source, matches, rounds) {
  const found = realSource(source, matches)
  if (!found) {
    return ''
  }
  const { kind, match: from } = found
  if (kind === 'winner' && (from.bracket === 'winners' || from.bracket === 'losers') &&
    from.round === lastRound(matches, from.bracket)) {
    return from.bracket === 'winners' ? 'Vincitore dei vincenti' : 'Vincitore dei perdenti'
  }
  const code = from.bracket === 'main' || from.bracket === 'third' ? matchLabel(from, rounds === undefined
    ? roundsOf(matches) : rounds) : matchCode(from, matches)
  return `${kind === 'loser' ? 'Perdente' : 'Vincitore'} di ${code}`
}

/**
 * Nota della rivincita ancora da giocare: «Rivincita · solo se vince Anna»
 * con Anna arrivata dai perdenti in gran finale, altrimenti «Rivincita ·
 * solo se vince chi arriva dai perdenti»; «Rivincita · non giocata» se ha
 * vinto chi arrivava dai vincenti (`skipped`); `null` per gli altri incontri.
 */
export function resetNote(match, matches, people) {
  if (match.bracket !== 'grand' || match.round < 2) {
    return null
  }
  if (match.status === 'skipped') {
    return 'Rivincita · non giocata'
  }
  if (match.status !== 'waiting') {
    return null
  }
  const grand = (matches || []).find((item) => item.bracket === 'grand' && item.round === 1)
  const person = grand && grand.playerB !== null && grand.playerB !== undefined ? people.get(grand.playerB) : null
  return `Rivincita · solo se vince ${person ? person.name : 'chi arriva dai perdenti'}`
}

/** Primo incontro da giocare: il pronto con il numero d'ordine più basso (i bye no), oppure `null`. */
export function firstMatch(matches) {
  return (matches || [])
    .filter((match) => !match.bye && (match.status === 'ready' || match.status === 'playing'))
    .reduce((best, match) => (!best || match.playOrder < best.playOrder ? match : best), null)
}

/** Prossimo incontro del torneo in corso: come `firstMatch`, il pronto o in gioco col numero d'ordine più basso. */
export function nextMatch(matches) {
  return firstMatch(matches)
}

/** Vero per la rivincita della doppia ancora da decidere (si gioca solo se vince chi arriva dai perdenti). */
function openReset(match) {
  return match.bracket === 'grand' && match.round > 1 && match.status === 'waiting'
}

/**
 * Avanzamento: `{current, total}` con `total` = incontri senza i bye né le
 * rivincite non giocate e `current` = numero d'ordine del prossimo (o di
 * quello in gioco); a torneo finito `current` = `total`. Finché la rivincita
 * della doppia è da decidere c'è anche `max` (`total` senza, `max` con).
 * `null` senza incontri.
 */
export function progress(matches) {
  const real = (matches || []).filter((match) => !match.bye && match.status !== 'skipped')
  if (!real.length) {
    return null
  }
  const next = nextMatch(matches)
  const done = real.filter((match) => match.status === 'done').length
  const open = real.some(openReset)
  const total = open ? real.length - 1 : real.length
  const value = { current: next ? next.playOrder : Math.min(done, total), total }
  if (open) {
    value.max = real.length
  }
  return value
}

/**
 * «Incontro 4 di 11», «Incontro 4 di 18–19» con la rivincita da decidere,
 * vuoto senza incontri. Durante gli spareggi del girone «Spareggio · Incontro
 * 1 di 3», contando solo gli spareggi.
 */
export function progressLabel(matches) {
  const value = progress(matches)
  if (!value) {
    return ''
  }
  const next = nextMatch(matches)
  if (next && next.bracket === 'playoff') {
    const extra = (matches || []).filter((match) => match.bracket === 'playoff')
      .sort((a, b) => a.playOrder - b.playOrder)
    return `Spareggio · Incontro ${extra.findIndex((match) => match.key === next.key) + 1} di ${extra.length}`
  }
  return `Incontro ${value.current} di ${value.max ? `${value.total}–${value.max}` : value.total}`
}

// Parte del disegno occupata dalle sezioni sotto il tabellone principale (3° posto): `y` resta tra 0 e 1.
const LOWER_SHARE = 0.1

/**
 * Disegno del tabellone a sezioni: `{sections, cells}`. Ogni sezione è
 * `{id, title, columns, reach}`: nell'eliminazione diretta `main` (una
 * colonna per turno) e, se c'è, `third` (una sola colonna sotto la finale).
 * Ogni colonna è `{x, round, name, series, matches, keys}`: `x` è la
 * posizione orizzontale nell'intero disegno, `matches` gli incontri per
 * casella (bye compresi), `keys` quelli su cui si ferma il cursore (i bye
 * no). `cells` sono `[{key, section, x, y}]`, con `y` (0–1) il centro della
 * scheda nell'intero disegno. `reach` è la distanza massima in `x` da cui
 * ▲▼ entrano nella sezione da quella sopra o sotto (0 = solo alla stessa `x`).
 */
export function bracketLayout(matches) {
  if (isDouble(matches)) {
    return doubleLayout(matches)
  }
  if (isLeague(matches)) {
    return leagueLayout(matches)
  }
  const rounds = roundsOf(matches)
  const main = (matches || []).filter((match) => match.bracket === 'main')
  const third = (matches || []).find((match) => match.bracket === 'third') || null
  const share = third ? 1 - LOWER_SHARE : 1
  const cells = []
  const columns = Array.from({ length: rounds }, (_, at) => {
    const round = at + 1
    const list = main.filter((match) => match.round === round).sort((a, b) => a.slot - b.slot)
    list.forEach((match, index) => {
      if (!match.bye) {
        cells.push({ key: match.key, section: 'main', x: at, y: ((index + 0.5) / list.length) * share })
      }
    })
    return {
      x: at,
      round,
      name: roundName(round, rounds),
      series: list.length ? list[0].series : null,
      matches: list,
      keys: list.filter((match) => !match.bye).map((match) => match.key),
      links: { in: round > 1, out: round < rounds ? 'pair' : null, skipIn: 0, skipOut: 0 },
    }
  })
  const sections = [{ id: 'main', title: 'Tabellone', columns, reach: 0 }]
  if (third && rounds) {
    const x = rounds - 1
    cells.push({ key: third.key, section: 'third', x, y: share + LOWER_SHARE / 2 })
    sections.push({
      id: 'third',
      title: '3° posto',
      columns: [{ x, round: 1, name: '3° posto', series: third.series, matches: [third], keys: [third.key] }],
      reach: 0,
    })
  }
  return { sections, cells }
}

// Parte del disegno della doppia occupata dai vincenti (sopra); il resto è dei perdenti.
const WINNERS_SHARE = 2 / 3

/**
 * Disegno della doppia (vedi `bracketLayout`): sezioni `winners` (sopra),
 * `losers` (sotto) e `grand` (in fondo a destra, a metà tra le due). Le
 * colonne seguono l'ordine di gioco: il turno k dei vincenti sta a `x =
 * 2(k−1)`, la colonna k dei perdenti a `x = 2k−1` finché ci sono turni dei
 * vincenti, poi le colonne dei perdenti rimaste di fila; gran finale e
 * rivincita all'ultima `x` + 1. I bye nascosti dei perdenti restano nelle
 * colonne (per l'allineamento) ma non hanno cella. `links` di ogni colonna
 * dice quali linee disegnare: `in` (da sinistra), `out` (`pair` = due
 * schede in una, `straight` = una in una) e quante colonne saltano
 * (`skipIn`, `skipOut`). ▲▼ passano tra vincenti e perdenti alla `x` più
 * vicina (`reach` illimitato), la gran finale si raggiunge con ◀▶ dalle
 * ultime colonne (`exit`) o con L1/R1, e da lì ▲▼ restano tra gran finale e
 * rivincita (`isolated`).
 */
function doubleLayout(matches) {
  const list = matches || []
  const winners = list.filter((match) => match.bracket === 'winners')
  const losers = list.filter((match) => match.bracket === 'losers')
  const grand = list.filter((match) => match.bracket === 'grand').sort((a, b) => a.round - b.round)
  const total = lastRound(list, 'winners')
  const columnsCount = lastRound(list, 'losers')
  const winnersX = (round) => 2 * (round - 1)
  const losersX = (column) => (column <= total ? 2 * column - 1 : total + column - 1)
  const cells = []
  const build = (section, source, count, xOf, top, share, outOf) => Array.from({ length: count }, (_, at) => {
    const round = at + 1
    const column = source.filter((match) => match.round === round).sort((a, b) => a.slot - b.slot)
    const x = xOf(round)
    column.forEach((match, index) => {
      if (!isHiddenBye(match) && !(section === 'winners' && match.bye)) {
        cells.push({ key: match.key, section, x, y: top + ((index + 0.5) / column.length) * share })
      }
    })
    return {
      x,
      round,
      name: column.length ? doubleColumnName(column[0], list) : `Turno ${round}`,
      series: column.length ? column[0].series : null,
      matches: column,
      keys: column.filter((match) => !match.bye).map((match) => match.key),
      links: {
        in: round > 1,
        out: round < count ? outOf(round) : null,
        skipIn: round > 1 ? x - xOf(round - 1) - 1 : 0,
        skipOut: round < count ? xOf(round + 1) - x - 1 : 0,
      },
    }
  })
  const sections = [
    {
      id: 'winners',
      title: 'Vincenti',
      columns: build('winners', winners, total, winnersX, 0, WINNERS_SHARE, () => 'pair'),
      reach: Infinity,
      exit: 'grand',
    },
    {
      id: 'losers',
      title: 'Perdenti',
      columns: build('losers', losers, columnsCount, losersX, WINNERS_SHARE, 1 - WINNERS_SHARE,
        (column) => (column % 2 ? 'straight' : 'pair')),
      reach: Infinity,
      exit: 'grand',
    },
  ]
  if (grand.length) {
    const x = Math.max(columnsCount ? losersX(columnsCount) : 0, total ? winnersX(total) : 0) + 1
    grand.forEach((match, index) => {
      cells.push({ key: match.key, section: 'grand', x, y: WINNERS_SHARE + index * 0.01 })
    })
    sections.push({
      id: 'grand',
      title: 'Gran finale',
      columns: [{
        x,
        round: 1,
        name: 'Gran finale',
        series: grand[0].series,
        matches: grand,
        keys: grand.map((match) => match.key),
        links: { in: false, out: null, skipIn: 0, skipOut: 0 },
      }],
      reach: 0,
      isolated: true,
    })
  }
  return { sections, cells }
}

/**
 * Colonne del tabellone principale, una per turno: `[{round, name, series,
 * matches, third, keys}]`, ricavate da `bracketLayout`. `third` è l'incontro
 * per il 3° posto, agganciato alla colonna della finale, e i `keys` della
 * finale finiscono col 3° posto.
 */
export function bracketColumns(matches) {
  const layout = bracketLayout(matches)
  const lower = layout.sections.find((section) => section.id === 'third')
  const third = lower ? lower.columns[0].matches[0] : null
  const columns = layout.sections[0].columns
  return columns.map((column, at) => {
    const last = at === columns.length - 1
    return {
      round: column.round,
      name: column.name,
      series: column.series,
      matches: column.matches,
      third: last ? third : null,
      keys: last && third ? [...column.keys, third.key] : column.keys,
    }
  })
}

// Valori distinti e ordinati.
function sortedSet(values) {
  return [...new Set(values)].sort((a, b) => a - b)
}

// La cella di `list` con la `y` più vicina a `y` (a parità la prima).
function nearestY(list, y) {
  return list.reduce((best, cell) => (Math.abs(cell.y - y) < Math.abs(best.y - y) ? cell : best), list[0])
}

// Colonna verticale del cursore: le celle alla sua `x` nella sua sezione e, attraverso le sezioni sopra e sotto, quelle alla `x` più vicina entro il loro `reach`.
function verticalStack(layout, cell) {
  const order = layout.sections.map((section) => section.id)
  const own = order.indexOf(cell.section)
  const columnOf = (id) => {
    const section = layout.sections.find((entry) => entry.id === id)
    const list = layout.cells.filter((entry) => entry.section === id)
    if (id === cell.section) {
      return list.filter((entry) => entry.x === cell.x)
    }
    if (section.isolated) {
      return []
    }
    const xs = sortedSet(list.map((entry) => entry.x)).filter((x) => Math.abs(x - cell.x) <= section.reach)
    if (!xs.length) {
      return []
    }
    // A pari distanza: scendendo la colonna a destra (giocata dopo), salendo quella a sinistra.
    const below = order.indexOf(id) > own
    const closer = (value, best) => {
      const gap = Math.abs(value - cell.x) - Math.abs(best - cell.x)
      return gap < 0 || (gap === 0 && (below ? value > best : value < best))
    }
    const x = xs.reduce((best, value) => (closer(value, best) ? value : best), xs[0])
    return list.filter((entry) => entry.x === x)
  }
  const ownSection = layout.sections[own]
  if (ownSection && ownSection.isolated) {
    return columnOf(cell.section).sort((a, b) => a.y - b.y)
  }
  const stack = []
  order.forEach((id, at) => {
    if (at === own || layout.cells.some((entry) => entry.section === id)) {
      stack.push(...columnOf(id).sort((a, b) => a.y - b.y))
    }
  })
  return stack
}

// Cella di arrivo con ◀ (`step` −1) o ▶ (+1): vedi `moveCursor`.
function horizontalTarget(layout, cell, step, wrap) {
  const own = layout.cells.filter((entry) => entry.section === cell.section)
  let xs = sortedSet(own.map((entry) => entry.x))
  const section = layout.sections.find((entry) => entry.id === cell.section)
  if (step > 0 && section && section.exit && xs[xs.length - 1] === cell.x) {
    // Dall'ultima colonna dei vincenti o dei perdenti si va alla gran finale.
    const exit = layout.cells.filter((entry) => entry.section === section.exit && entry.x > cell.x)
    if (exit.length) {
      return exit.sort((a, b) => a.y - b.y)[0]
    }
  }
  if (xs.length === 1) {
    xs = sortedSet(layout.cells.map((entry) => entry.x))
  }
  const at = xs.indexOf(cell.x)
  let x = xs[at + step]
  if (x === undefined) {
    // Oltre l'ultima colonna della sezione: la colonna più vicina di un'altra sezione, se c'è più in là.
    const beyond = sortedSet(layout.cells.map((entry) => entry.x).filter((value) => (step > 0 ? value > cell.x : value < cell.x)))
    if (beyond.length) {
      x = beyond[step > 0 ? 0 : beyond.length - 1]
    } else if (wrap) {
      x = xs[step > 0 ? 0 : xs.length - 1]
    } else {
      return cell
    }
  }
  const same = own.filter((entry) => entry.x === x)
  const list = same.length ? same : layout.cells.filter((entry) => entry.x === x)
  return list.length ? nearestY(list, cell.y) : cell
}

/**
 * Cursore del tabellone (chiave dell'incontro) spostato nella direzione
 * `dir` (`up`, `down`, `left`, `right`) tra le celle di `bracketLayout`.
 * ▲▼ scorrono gli incontri della colonna e passano alla sezione sopra o
 * sotto, alla `x` più vicina entro il suo `reach`. ◀▶ passano alla colonna
 * accanto della stessa sezione, sull'incontro con la `y` più vicina; una
 * sezione di una sola colonna (il 3° posto) si muove tra le colonne di tutto
 * il disegno, e dall'ultima colonna di una sezione si va alla più vicina di
 * un'altra sezione che sta più in là. Oltre il bordo si riparte dall'altro
 * capo solo con `wrap` (pressione singola); col tasto tenuto ci si ferma. Un
 * cursore sconosciuto va sul primo incontro.
 */
export function moveCursor(layout, cursor, dir, wrap) {
  const cells = (layout && layout.cells) || []
  if (!cells.length) {
    return cursor
  }
  const cell = cells.find((entry) => entry.key === cursor)
  if (!cell) {
    return cells[0].key
  }
  if (dir === 'up' || dir === 'down') {
    const stack = verticalStack(layout, cell)
    const at = stack.indexOf(cell)
    return stack[stepIndex(at, dir === 'down' ? 1 : -1, stack.length, wrap)].key
  }
  if (dir !== 'left' && dir !== 'right') {
    return cursor
  }
  return horizontalTarget(layout, cell, dir === 'right' ? 1 : -1, wrap).key
}

/** Sezioni del disegno in cui il cursore può fermarsi. */
export function cursorSections(layout) {
  return ((layout && layout.sections) || []).filter((section) =>
    section.columns.some((column) => column.keys.length))
}

/**
 * L1 (`dir` −1) / R1 (+1): il cursore salta alla sezione precedente o
 * successiva del disegno, in modo circolare. Arriva sull'ultimo incontro
 * visitato in quella sezione (`memory`: id sezione → chiave), altrimenti sul
 * prossimo incontro (`next`) se sta lì, altrimenti sul primo non concluso
 * (o sul primo). Con una sola sezione il cursore resta dov'è.
 */
export function jumpSection(layout, cursor, dir, memory = {}, next = null) {
  const sections = cursorSections(layout)
  if (sections.length < 2) {
    return cursor
  }
  const cell = layout.cells.find((entry) => entry.key === cursor)
  const at = cell ? sections.findIndex((section) => section.id === cell.section) : -1
  const target = sections[stepIndex(Math.max(at, 0), dir > 0 ? 1 : -1, sections.length, true)]
  const keys = target.columns.flatMap((column) => column.keys)
  const remembered = memory[target.id]
  if (remembered && keys.includes(remembered)) {
    return remembered
  }
  if (next && keys.includes(next)) {
    return next
  }
  const open = target.columns.flatMap((column) => column.matches)
    .find((match) => !match.bye && match.status !== 'done')
  return open ? open.key : keys[0]
}

/** Sezione della cella `key` nel disegno, o `null`. */
export function sectionOf(layout, key) {
  const cell = ((layout && layout.cells) || []).find((entry) => entry.key === key)
  return cell ? cell.section : null
}

/**
 * Testo di una casella dell'incontro (`side` `a` o `b`): il nome del
 * giocatore, oppure da dove arriverà («Vincitore di Q2»), «passa il turno»
 * per il posto vuoto di un bye, «Da decidere» negli altri casi. `people` è
 * una `Map` id → giocatore.
 */
export function slotText(match, side, people, matches) {
  const id = side === 'a' ? match.playerA : match.playerB
  const person = id === null || id === undefined ? null : people.get(id)
  if (person) {
    return person.name
  }
  if (match.bye) {
    return 'passa il turno'
  }
  if (match.status === 'skipped') {
    return '—'
  }
  return sourceLabel(side === 'a' ? match.fromA : match.fromB, matches) || 'Da decidere'
}

/**
 * Titolo del menu dell'incontro: «Q2 · Anna contro Bruno»; nella doppia la
 * sigla e il turno, «P2-1 · Perdenti, turno 2».
 */
export function matchTitle(match, people, matches) {
  if (match.bracket === 'playoff') {
    return `Spareggio · ${slotText(match, 'a', people, matches)} contro ${slotText(match, 'b', people, matches)}`
  }
  if (match.bracket === 'winners' || match.bracket === 'losers' || match.bracket === 'grand') {
    return `${matchCode(match, matches)} · ${matchRound(match, matches, true)}`
  }
  return `${matchLabel(match, roundsOf(matches))} · ${slotText(match, 'a', people, matches)} contro ` +
    `${slotText(match, 'b', people, matches)}`
}

/**
 * Partite giocate di un incontro, per l'elenco «Partite»: `[{id, label, note}]`
 * con «Partita 1 · vince Anna» (o «pari») e i lati, «Anna P1 · Bruno P2».
 */
export function gameRows(match, people) {
  const nameOf = (id) => (people.get(id) || { name: '?' }).name
  return (match.games || []).map((game) => {
    const winner = game.winnerId === null || game.winnerId === undefined ? 'pari' : `vince ${nameOf(game.winnerId)}`
    const sideB = game.sideA === 'p1' ? 'p2' : 'p1'
    // Punteggio registrato: «3–1» dalla parte di chi vince (con il pari quello di playerA per primo).
    let points = ''
    if (game.scoreA !== null && game.scoreA !== undefined && game.scoreB !== null && game.scoreB !== undefined) {
      const flip = game.winnerId !== null && game.winnerId !== undefined && game.winnerId === match.playerB
      points = flip ? ` · ${game.scoreB}–${game.scoreA}` : ` · ${game.scoreA}–${game.scoreB}`
    }
    return {
      id: game.gameNo,
      label: `Partita ${game.gameNo} · ${winner}${points}`,
      note: `${nameOf(match.playerA)} ${game.sideA.toUpperCase()} · ${nameOf(match.playerB)} ${sideB.toUpperCase()}`,
    }
  })
}

/**
 * Turno in cui il profilo `account` è uscito dal torneo in corso, oppure
 * `null` se è ancora in gioco (o non ha perso). Conta la sconfitta nel
 * tabellone principale, a tavolino compresa; chi aspetta ancora un incontro
 * (per esempio quello per il 3° posto) non è uscito.
 */
export function eliminatedRound(tournament, account) {
  const matches = (tournament && tournament.matches) || []
  const plays = (match) => match.playerA === account || match.playerB === account
  const lost = matches.find((match) => match.bracket === 'main' && match.status === 'done' && !match.bye &&
    plays(match) && match.winnerId !== null && match.winnerId !== undefined && match.winnerId !== account)
  if (!lost) {
    return null
  }
  const waiting = matches.some((match) => match.status !== 'done' &&
    (plays(match) || match.fromA === `loser:${lost.key}` || match.fromB === `loser:${lost.key}`))
  return waiting ? null : lost.round
}

// Preposizione davanti al nome del turno: «ai Quarti», «in Semifinale», «al Turno 1».
const ROUND_PREPOSITIONS = { Finale: 'in', Semifinale: 'in', Quarti: 'ai', Ottavi: 'agli', Sedicesimi: 'ai' }

/** «Eliminato ai Quarti», «Eliminato in Semifinale», «Eliminato al Turno 1». */
export function eliminatedLabel(round, rounds) {
  const name = roundName(round, rounds)
  return `Eliminato ${ROUND_PREPOSITIONS[name] || 'al'} ${name}`
}

/** Caselle con gli id `a` e `b` scambiati (copia). */
export function swapSlots(slots, a, b) {
  return slots.map((item) => (item === a ? b : item === b ? a : item))
}

/**
 * Incroci dei perdenti della doppia `{colonna: [chiavi dei vincenti]}` con
 * gli ingressi `a` e `b` scambiati (copia), oppure `null` se sono lo stesso
 * o non stanno nella stessa colonna.
 */
export function swapCrossing(crossings, a, b) {
  if (!crossings || a === b) {
    return null
  }
  const column = Object.keys(crossings).find((key) => crossings[key].includes(a))
  if (column === undefined || !crossings[column].includes(b)) {
    return null
  }
  return { ...crossings, [column]: crossings[column].map((item) => (item === a ? b : item === b ? a : item)) }
}

/**
 * Ingresso degli incroci nello slot `side` (`a`/`b`) di un incontro dei
 * perdenti ancora vuoto: la chiave dell'incontro dei vincenti di cui arriva
 * il perdente (anche attraverso i bye nascosti), `null` se lo slot non è un
 * «Perdente di V…».
 */
export function crossingSlot(match, side, matches) {
  if (!match || match.bracket !== 'losers') {
    return null
  }
  const player = side === 'a' ? match.playerA : match.playerB
  if (player !== null && player !== undefined) {
    return null
  }
  const found = realSource(side === 'a' ? match.fromA : match.fromB, matches)
  return found && found.kind === 'loser' && found.match.bracket === 'winners' ? found.match.key : null
}

/** Ordine delle teste di serie con la voce in posizione `from` spostata in `to` (copia). */
export function moveSeed(order, from, to) {
  const result = [...order]
  const [item] = result.splice(from, 1)
  result.splice(to, 0, item)
  return result
}

/** Durata in breve: «3 h 20 min», «45 min», «meno di 1 min», «mai giocato». */
export function playedLabel(seconds) {
  if (!seconds) {
    return 'mai giocato'
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 1) {
    return 'meno di 1 min'
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) {
    return `${minutes} min`
  }
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/** Valore della testa di serie da mostrare accanto al nome, secondo il metodo `seeding`. */
export function seedValueLabel(seeding, seed) {
  if (seeding === 'xp') {
    return `${seed.xp} XP`
  }
  if (seeding === 'time') {
    return playedLabel(seed.seconds)
  }
  if (seeding === 'mix') {
    const score = String(seed.value === null || seed.value === undefined ? 0 : seed.value).replace('.', ',')
    return `${score} punti · ${seed.xp} XP · ${playedLabel(seed.seconds)}`
  }
  return ''
}

/** Numero di incontri: «11», o «18–19» per `{min, max}` diversi. */
export function countText(count) {
  if (count && typeof count === 'object') {
    return count.min === count.max ? String(count.min) : `${count.min}–${count.max}`
  }
  return String(count)
}

/**
 * «4 incontri», «1 incontro», «18–19 incontri» o «in arrivo» per un formato
 * non pronto; nel girone (`format` `round_robin`) «45 incontri + eventuali spareggi».
 */
export function countLabel(count, format) {
  if (count === null || count === undefined) {
    return 'in arrivo'
  }
  const text = countText(count)
  const label = text === '1' ? '1 incontro' : `${text} incontri`
  return format === 'round_robin' ? `${label} + eventuali spareggi` : label
}

// --- Incontro ------------------------------------------------------------------------------

/**
 * Vero se chi ha premuto (`user` nello slot `slot`) può giocare l'incontro
 * `match`: solo il prossimo (`next`), con i due giocatori noti, da uno dei due
 * (P1 o P2) o dal creatore come P1. Gli ospiti no.
 */
export function canPlayMatch(tournament, match, next, slot, user) {
  if (!tournament || tournament.status !== 'running' || !match || !next || match.key !== next.key || !user ||
      user.guest) {
    return false
  }
  if (match.playerA === null || match.playerB === null || !['ready', 'playing'].includes(match.status)) {
    return false
  }
  return user.id === match.playerA || user.id === match.playerB || (slot === 'p1' && isCreator(tournament, user.id))
}

// --- Azioni dell'admin a torneo in corso --------------------------------------------------

/** Vero se il giocatore `account` è ritirato dal torneo. */
export function isWithdrawn(tournament, account) {
  return ((tournament && tournament.players) || []).some((player) => player.id === account && player.withdrawn)
}

/**
 * Giocatori dell'incontro `match` che l'admin può ritirare: noti, non
 * ritirati e ancora in gara (con un incontro non concluso, bye esclusi).
 */
export function withdrawCandidates(tournament, match) {
  const matches = (tournament && tournament.matches) || []
  return [match.playerA, match.playerB].filter((id) => id !== null && id !== undefined &&
    !isWithdrawn(tournament, id) &&
    matches.some((item) => item.status !== 'done' && !item.bye && (item.playerA === id || item.playerB === id)))
}

/**
 * Voci dell'admin nel menu dell'incontro `match`, solo per il creatore come
 * P1 (`slot`, `user`): «Vittoria a tavolino…», «Ritira un giocatore…»,
 * «Annulla il risultato» (se c'è qualcosa da annullare) e «Annulla il
 * torneo…». Ogni voce è `{id, label, admin: true, disabled, note}`: una voce
 * grigia ha in `note` il motivo. A torneo concluso nessuna.
 */
export function adminMatchItems(tournament, match, slot, user) {
  if (!tournament || tournament.status !== 'running' || !match || slot !== 'p1' || !user || user.guest ||
      !isCreator(tournament, user.id)) {
    return []
  }
  const items = []
  if (tournament.playoff && tournament.playoff.status === 'draw') {
    // Spareggi finiti ma ancora pari sul podio: il sorteggio conclude il torneo.
    items.push({ id: 'lots', label: `Sorteggia ${placesText(tournament.playoff.groups)}…`, admin: true,
      disabled: false, note: null })
  }
  if (!match.bye) {
    let reason = null
    if (match.status === 'done') {
      reason = 'incontro concluso'
    } else if (match.playerA === null || match.playerB === null) {
      reason = 'mancano i due giocatori'
    }
    items.push({ id: 'walkover', label: 'Vittoria a tavolino…', admin: true, disabled: Boolean(reason), note: reason })
    const candidates = withdrawCandidates(tournament, match)
    items.push({
      id: 'withdraw',
      label: 'Ritira un giocatore…',
      admin: true,
      disabled: !candidates.length,
      note: candidates.length ? null : 'nessun giocatore in gara',
    })
    if (match.undoKind) {
      const problem = match.canUndo ? null : (match.undoProblem || 'non si può annullare').replace(/\.$/, '')
      items.push({
        id: 'undo',
        label: 'Annulla il risultato',
        admin: true,
        disabled: Boolean(problem),
        note: problem ? problem.charAt(0).toLowerCase() + problem.slice(1) : null,
      })
    }
  }
  items.push({ id: 'cancel', label: 'Annulla il torneo…', admin: true, disabled: false, note: null })
  return items
}

/** Nome del giocatore `id` tra gli iscritti `people` (Map), «?» se non c'è. */
function personName(people, id) {
  const person = people.get(id)
  return person ? person.name : '?'
}

/** Ritirato dell'incontro (il perdente a tavolino, o chi aspetta l'avversario), oppure `null`. */
export function withdrawnOf(tournament, match) {
  if (match.status === 'done') {
    const loser = match.winnerId === match.playerA ? match.playerB : match.playerA
    return isWithdrawn(tournament, loser) ? loser : null
  }
  return [match.playerA, match.playerB].find((id) => id !== null && isWithdrawn(tournament, id)) ?? null
}

/** Testo della conferma di «Annulla il risultato» secondo `match.undoKind`. */
export function undoText(tournament, match, people, matches) {
  const title = matchTitle(match, people, matches)
  switch (match.undoKind) {
    case 'game':
      return `Annullare l’ultima partita di ${title}?`
    case 'walkover':
      return `Annullare il tavolino di ${title}? L’incontro torna da giocare.`
    case 'result':
      if (isLeagueMatch(match) && (match.games || []).length <= 1) {
        return `Annullare il risultato di ${title}? L’incontro torna da giocare.`
      }
      if (match.bracket === 'grand' && match.round === 1 &&
        (matches || []).some((item) => item.bracket === 'grand' && item.round > 1)) {
        return 'Annullare la gran finale? La rivincita torna in attesa.'
      }
      return `Annullare il risultato di ${title}? L’incontro torna in gioco con una partita in meno.`
    case 'withdrawal': {
      const account = withdrawnOf(tournament, match)
      const name = personName(people, account)
      if (isLeagueMatch(match)) {
        const count = leagueWithdrawalWalkovers(tournament, account)
        const what = count === 1 ? 'Il suo tavolino automatico torna da giocare.'
          : `I suoi ${count} tavolini automatici tornano da giocare.`
        return `Annullare il ritiro di ${name}? ${what}`
      }
      return `Annullare il ritiro di ${name}? Torna in gara.`
    }
    default:
      return `Annullare il risultato di ${title}? L’incontro torna in gioco con una partita in meno.`
  }
}

// Incontri del girone di `account` ancora da giocare.
function leagueLeft(tournament, account) {
  return ((tournament && tournament.matches) || []).filter((match) => isLeagueMatch(match) &&
    match.status !== 'done' && (match.playerA === account || match.playerB === account)).length
}

// Tavolini automatici del ritiro di `account` nel girone: persi a tavolino dal momento del ritiro in poi.
function leagueWithdrawalWalkovers(tournament, account) {
  const player = ((tournament && tournament.players) || []).find((item) => item.id === account)
  const since = player ? player.withdrawnAt || '' : ''
  return ((tournament && tournament.matches) || []).filter((match) => isLeagueMatch(match) &&
    match.status === 'done' && match.walkover && (match.playerA === account || match.playerB === account) &&
    match.winnerId !== account && (match.finishedAt || '') >= since).length
}

/**
 * Testo della conferma del ritiro di `account` dall'incontro `match`; nel
 * girone (con `tournament`) conta gli incontri che gli restano.
 */
export function withdrawText(match, account, people, tournament = null) {
  const other = match.playerA === account ? match.playerB : match.playerA
  const name = personName(people, account)
  if (isLeagueMatch(match)) {
    const left = leagueLeft(tournament, account)
    const what = left === 1 ? 'Il suo incontro da giocare diventa una vittoria a tavolino per l’avversario.'
      : `I suoi ${left} incontri da giocare diventano vittorie a tavolino per gli avversari.`
    return `Ritirare ${name} dal torneo? ${what} I risultati giocati restano.`
  }
  if (other === null || other === undefined || match.status === 'done') {
    return `Ritirare ${name} dal torneo? Perderà a tavolino il prossimo incontro, appena l’avversario sarà noto.`
  }
  if (['winners', 'losers', 'grand'].includes(match.bracket)) {
    return `Ritirare ${name} dal torneo? ${name} perde a tavolino questo incontro ed esce dal torneo.`
  }
  return `Ritirare ${name} dal torneo? ${personName(people, other)} vince a tavolino.`
}

/** Messaggio dopo «Annulla il risultato»: `undone` è il tipo annullato. */
export function undoneMessage(undone) {
  switch (undone) {
    case 'game':
      return 'Ultima partita annullata.'
    case 'walkover':
      return 'Tavolino annullato.'
    case 'withdrawal':
      return 'Ritiro annullato.'
    default:
      return 'Risultato annullato.'
  }
}

/**
 * Posti a pari merito di chi esce nella colonna `column` dei perdenti:
 * `{from, to}` con `from` = 1 + giocatori piazzati sopra (i due della gran
 * finale e chi esce nelle colonne dopo), come il backend.
 */
export function losersPlaces(matches, column) {
  const losers = (matches || []).filter((match) => match.bracket === 'losers' && !match.bye)
  const columns = lastRound(matches, 'losers')
  let above = 2
  for (let at = columns; at > column; at -= 1) {
    above += losers.filter((match) => match.round === at).length
  }
  const count = losers.filter((match) => match.round === column).length
  return { from: above + 1, to: above + Math.max(count, 1) }
}

/** «7°–8°» o «3°» per i posti `{from, to}`. */
export function placesLabel(places) {
  return places.from === places.to ? placeLabel(places.from) : `${placeLabel(places.from)}–${placeLabel(places.to)}`
}

// Ordine dei gruppi di «Info torneo» nella doppia: gran finale, vincenti, perdenti, eliminati.
const STANDING_GROUPS = { grand: 0, winners: 1, losers: 2 }

/**
 * Stato dell'iscritto `account` nella doppia in corso: `{note, out, group,
 * place}`. `note` è «Vincenti · imbattuto», «Perdenti · 1 sconfitta», «Gran
 * finale · imbattuto», «Rivincita · 1 sconfitta», «Eliminato · Perdenti,
 * turno 3 · 7°–8°» o «Ritirato»; `out` è vero per eliminati e ritirati;
 * `group` (0 gran finale, 1 vincenti, 2 perdenti, 3 fuori) e `place` (posto
 * di chi è uscito) servono all'ordinamento.
 */
export function doubleStanding(tournament, account) {
  const matches = (tournament && tournament.matches) || []
  const plays = (match) => match.playerA === account || match.playerB === account
  const lost = matches.filter((match) => match.status === 'done' && !match.bye && plays(match) &&
    match.winnerId !== null && match.winnerId !== undefined && match.winnerId !== account)
  const out = lost.find((match) => match.bracket === 'losers')
  const withdrawn = isWithdrawn(tournament, account)
  // Il ritirato si legge dove si è ritirato: il primo incontro perso a tavolino, o quello in cui aspetta.
  const quit = withdrawn
    ? lost.filter((match) => match.walkover).sort((a, b) => a.playOrder - b.playOrder)[0] || out
    : out
  if (out) {
    const places = losersPlaces(matches, out.round)
    return {
      note: `${withdrawn ? 'Ritirato' : 'Eliminato'} · ${matchRound(quit, matches, true)} · ${placesLabel(places)}`,
      out: true,
      group: 3,
      place: places.from,
    }
  }
  const current = matches
    .filter((match) => match.status !== 'done' && match.status !== 'skipped' && plays(match))
    .reduce((best, match) => (!best || match.playOrder < best.playOrder ? match : best), null)
  if (withdrawn) {
    const where = quit || current
    return { note: where ? `Ritirato · ${matchRound(where, matches, true)}` : 'Ritirato', out: true, group: 3, place: Infinity }
  }
  if (!current) {
    return { note: null, out: false, group: 3, place: Infinity }
  }
  let where = current.bracket === 'winners' ? 'Vincenti' : 'Perdenti'
  if (current.bracket === 'grand') {
    where = current.round > 1 ? 'Rivincita' : 'Gran finale'
  }
  const losses = lost.length === 0 ? 'imbattuto' : lost.length === 1 ? '1 sconfitta' : `${lost.length} sconfitte`
  return { note: `${where} · ${losses}`, out: false, group: STANDING_GROUPS[current.bracket] ?? 2, place: Infinity }
}

/**
 * Nota dell'iscritto nell'«Info torneo»: «Ritirato», «Eliminato ai Quarti» oppure `null`; nella doppia
 * quella di `doubleStanding`; a torneo concluso il piazzamento, «3° posto» o «Ritirato · 5° posto».
 */
export function rosterNote(tournament, account, rounds) {
  return rosterEntry(tournament, account, rounds).note
}

/**
 * Nota dell'iscritto (`rosterNote`) e `out`, vero se va attenuato perché è
 * uscito dal torneo in corso (eliminato o ritirato).
 */
export function rosterEntry(tournament, account, rounds) {
  const player = tournament.status === 'done'
    ? (tournament.players || []).find((item) => item.id === account) : null
  if (player && player.place) {
    const place = `${placeLabel(player.place)} posto`
    return { note: player.withdrawn ? `Ritirato · ${place}` : place, out: false }
  }
  if (isDouble(tournament.matches)) {
    const standing = doubleStanding(tournament, account)
    return { note: standing.note, out: standing.out }
  }
  if (isWithdrawn(tournament, account)) {
    return { note: 'Ritirato', out: true }
  }
  const out = eliminatedRound(tournament, account)
  return out ? { note: eliminatedLabel(out, rounds), out: true } : { note: null, out: false }
}

/**
 * Iscritti di «Info torneo» col tabellone: in ordine di testa di serie;
 * nella doppia in corso prima chi è in gioco (gran finale, vincenti,
 * perdenti) e poi chi è uscito dal piazzamento migliore; a doppia conclusa
 * per piazzamento.
 */
export function rosterOrder(tournament) {
  const bySeed = (a, b) => (a.seed || Infinity) - (b.seed || Infinity)
  const list = [...(tournament.players || [])]
  if (!isDouble(tournament.matches)) {
    return list.sort(bySeed)
  }
  if (tournament.status === 'done') {
    return list.sort((a, b) => (a.place || Infinity) - (b.place || Infinity) || bySeed(a, b))
  }
  const standing = new Map(list.map((player) => [player.id, doubleStanding(tournament, player.id)]))
  return list.sort((a, b) => {
    const first = standing.get(a.id)
    const second = standing.get(b.id)
    return first.group - second.group || first.place - second.place || bySeed(a, b)
  })
}

/** Giocatori `[a, b]` dell'incontro nell'ordine dei lati: `[lato P1, lato P2]` con `sideA` lato di `a`. */
export function sideOrder(players, sideA) {
  return sideA === 'p2' ? [players[1], players[0]] : [players[0], players[1]]
}

/**
 * «Partita 2 · al meglio di 3», oppure «Partita secca». Con la serie fissa
 * (`fixed`, girone con i pareggi) «Partita 2 di 3».
 */
export function gameLine(gameNo, series, fixed = false) {
  if (series === 1) {
    return 'Partita secca'
  }
  return fixed ? `Partita ${gameNo} di ${series}` : `Partita ${gameNo} · al meglio di ${series}`
}

/** «1 vinta», «2 vinte», con le partite pari «1 vinta · 1 pari». */
export function tallyText(wins, draws = 0) {
  const won = `${wins} ${wins === 1 ? 'vinta' : 'vinte'}`
  return draws ? `${won} · ${draws} pari` : won
}

// Punteggio massimo di una partita (come il «Punteggio a tavolino» nel backend).
export const SCORE_MAX = WALKOVER_SCORE_MAX

/**
 * Punteggio di partenza dopo la scelta `outcome` (id del vincitore o
 * `draw`) con i giocatori in `order`: `{values, at}`, con `values` nello
 * stesso ordine e `at` il numero selezionato. Chi vince parte da 1–0 ed è
 * selezionato; con il pari 0–0 e il primo selezionato.
 */
export function startScore(order, outcome) {
  const at = order.findIndex((player) => player.id === outcome)
  if (at < 0) {
    return { values: [0, 0], at: 0 }
  }
  return { values: at === 0 ? [1, 0] : [0, 1], at }
}

/** Punteggio `value` spostato di `dir` tra 0 e `SCORE_MAX`: oltre il bordo con `wrap` riparte dall'altro capo. */
export function stepScore(value, dir, wrap) {
  return stepIndex(value, dir, SCORE_MAX + 1, wrap)
}

/**
 * Problema del punteggio `values` (nell'ordine di `order`) per la scelta
 * `outcome`, oppure `null` se è coerente: chi vince ha più punti, con il
 * pari sono uguali.
 */
export function scoreProblem(order, outcome, values) {
  if (outcome === 'draw') {
    return values[0] === values[1] ? null : 'In una partita pari il punteggio è uguale.'
  }
  const at = order.findIndex((player) => player.id === outcome)
  return values[at] > values[1 - at] ? null : 'Chi vince la partita deve avere più punti.'
}

/**
 * Corpo della dichiarazione per il backend: `{winner, draw, score}` dalla
 * scelta `outcome` (id, `draw` o `replay`) e dal punteggio `values`
 * nell'ordine di `order` (`null` senza), con `score` riportato all'ordine di
 * `players` (`[playerA, playerB]`).
 */
export function declareBody(players, order, outcome, values) {
  const draw = outcome === 'draw'
  const winner = draw || outcome === 'replay' ? null : outcome
  let score = null
  if (values) {
    const of = (id) => values[order.findIndex((player) => player.id === id)]
    score = [of(players[0].id), of(players[1].id)]
  }
  return { winner, draw, score }
}

/** Lato di `a` dopo «sinistra/destra» con i lati liberi. */
export function swapSide(sideA) {
  return sideA === 'p2' ? 'p1' : 'p2'
}

/**
 * Joypad dei lati P1 e P2 dell'incontro: quelli di P1 e P2 della dashboard;
 * a uno slot senza joypad va il primo joypad collegato non usato
 * (`connected`, indici in ordine). `null` se non ce n'è.
 */
export function matchPads(players, connected) {
  const pads = ['p1', 'p2'].map((key) => (players[key].joined && players[key].pad !== null ? players[key].pad : null))
  const free = (connected || []).filter((index) => !pads.includes(index))
  return pads.map((pad) => (pad !== null ? pad : free.length ? free.shift() : null))
}

// --- Assegnazione dei joypad nell'incontro ---------------------------------
//
// Passo `p1`: START da un joypad lo assegna al lato P1. Passo `p2`: START da
// un altro joypad lo assegna a P2, SELECT (da qualsiasi joypad) torna a
// `p1`. Passo `test`: ogni lato prova i tasti; START accende o spegne il suo
// PRONTO, SELECT il suo ANNULLA (uno esclude l'altro). Due PRONTO: si parte;
// due ANNULLA: si torna a `p1`. Tastiera e mouse (`pad` nullo) non contano.

const NO_SIDES = { p1: false, p2: false }

function hasPadIndex(pad) {
  return pad !== null && pad !== undefined
}

/** Assegnazione da capo (passo `p1`). */
export function padAssignStart() {
  return { step: 'p1', pads: { p1: null, p2: null }, ready: NO_SIDES, cancel: NO_SIDES }
}

/** Assegnazione già fatta, al passo `test`, con i joypad `pads` (`{p1, p2}`). */
export function padAssignTest(pads) {
  return { step: 'test', pads: { p1: pads.p1, p2: pads.p2 }, ready: NO_SIDES, cancel: NO_SIDES }
}

/** Lato (`p1`/`p2`) del joypad `pad` nell'assegnazione, `null` se non è assegnato. */
export function padSide(assign, pad) {
  if (!hasPadIndex(pad)) {
    return null
  }
  return assign.pads.p1 === pad ? 'p1' : assign.pads.p2 === pad ? 'p2' : null
}

/**
 * Pressione di `button` col joypad `pad` durante l'assegnazione: `{assign,
 * sound, go}`. `sound` è `confirm`, `back` o `null` (pressione ignorata);
 * `go` è vero quando tutti e due i lati sono PRONTO.
 */
export function padAssignPress(assign, pad, button) {
  const none = { assign, sound: null, go: false }
  if (!hasPadIndex(pad)) {
    return none
  }
  if (assign.step === 'p1') {
    if (button !== 'start') {
      return none
    }
    return { assign: { ...padAssignStart(), step: 'p2', pads: { p1: pad, p2: null } }, sound: 'confirm', go: false }
  }
  if (assign.step === 'p2') {
    if (button === 'select') {
      return { assign: padAssignStart(), sound: 'back', go: false }
    }
    if (button !== 'start' || pad === assign.pads.p1) {
      return none
    }
    return { assign: padAssignTest({ p1: assign.pads.p1, p2: pad }), sound: 'confirm', go: false }
  }
  const side = padSide(assign, pad)
  if (!side || (button !== 'start' && button !== 'select')) {
    return none
  }
  if (button === 'start') {
    const ready = { ...assign.ready, [side]: !assign.ready[side] }
    const next = { ...assign, ready, cancel: { ...assign.cancel, [side]: false } }
    return { assign: next, sound: ready[side] ? 'confirm' : 'back', go: ready.p1 && ready.p2 }
  }
  const cancel = { ...assign.cancel, [side]: !assign.cancel[side] }
  if (cancel.p1 && cancel.p2) {
    return { assign: padAssignStart(), sound: 'back', go: false }
  }
  const next = { ...assign, cancel, ready: { ...assign.ready, [side]: false } }
  return { assign: next, sound: cancel[side] ? 'back' : 'confirm', go: false }
}

/** Joypad di ogni giocatore (`{id: joypad}`) dall'assegnazione `pads` coi giocatori `order` (P1, P2). */
export function padsByPlayer(pads, order) {
  return { [order[0].id]: pads.p1, [order[1].id]: pads.p2 }
}

/**
 * Joypad dei lati (`{p1, p2}`) per i giocatori `order` (P1, P2) dalla mappa
 * `byPlayer` dell'incontro: nelle partite dopo i joypad seguono i giocatori
 * anche coi lati scambiati. `null` se manca uno dei due.
 */
export function padsForOrder(byPlayer, order) {
  if (!byPlayer || !order) {
    return null
  }
  const p1 = byPlayer[order[0].id]
  const p2 = byPlayer[order[1].id]
  return hasPadIndex(p1) && hasPadIndex(p2) && p1 !== p2 ? { p1, p2 } : null
}

/** Partite da vincere per chiudere un incontro al meglio di `series`. */
export function winsNeeded(series) {
  return Math.floor(series / 2) + 1
}

/** Vittorie `[a, b]` nelle partite `games` dell'incontro `match` (`{playerA, playerB}`). */
export function seriesScore(games, match) {
  const list = games || []
  return [match.playerA, match.playerB].map((id) => list.filter((game) => game.winnerId === id).length)
}

/**
 * Vero se la pressione col joypad `pad` vale per l'admin durante l'incontro:
 * il joypad del P1 della dashboard prima dell'incontro (`saved`, giocatori
 * salvati), oppure tastiera e mouse (`pad` assente).
 */
export function adminPress(saved, pad) {
  if (pad === null || pad === undefined) {
    return true
  }
  const p1 = saved && saved.p1
  return Boolean(p1 && p1.joined && p1.pad === pad)
}

/** Profilo P1 della dashboard prima dell'incontro (`saved`), oppure `null` (nessuno o ospite). */
export function savedAdmin(saved) {
  const user = saved && saved.p1 && saved.p1.joined ? saved.p1.user : null
  return user && !user.guest ? user : null
}

/** Scelte della dichiarazione con i giocatori `order` (lato P1, lato P2): i due vincitori e «rigioca». */
export function declareChoices(order) {
  return [...order.map((player) => ({ id: player.id, label: player.name })), { id: 'replay', label: 'Nessuno dei due: rigioca' }]
}

/**
 * Scelta della dichiarazione dopo la direzione `button` partendo da `current`
 * (id di un giocatore, `draw` o `replay`): ◀ ▶ tra i due giocatori e, con
 * `draws`, il pareggio in mezzo (circolare con `wrap`), ▼ a «rigioca», ▲
 * torna al primo giocatore.
 */
export function moveDeclare(order, current, button, wrap, draws = false) {
  const ids = order.map((player) => player.id)
  if (draws) {
    ids.splice(1, 0, 'draw')
  }
  if (button === 'down') {
    return current === 'replay' && wrap ? ids[0] : 'replay'
  }
  if (button === 'up') {
    return current === 'replay' ? ids[0] : wrap ? 'replay' : current
  }
  if (button === 'left' || button === 'right') {
    if (current === 'replay') {
      return ids[button === 'left' ? 0 : ids.length - 1]
    }
    const at = ids.indexOf(current)
    const next = at + (button === 'right' ? 1 : -1)
    if (next < 0 || next >= ids.length) {
      return wrap ? ids[(next + ids.length) % ids.length] : current
    }
    return ids[next]
  }
  return current
}

// --- Fine del torneo: podio, archivio e profilo ------------------------------------------

/** «1°», «5°». */
export function placeLabel(place) {
  return `${place}°`
}

/**
 * Gradini del podio nell'ordine a schermo: 2° a sinistra, 1° al centro, 3° a
 * destra (`[{place, players}]`, con due giocatori se a pari merito). Senza
 * giocatori per un posto il gradino non c'è.
 */
export function podiumSteps(podium) {
  return [2, 1, 3]
    .map((place) => ({ place, players: (podium || []).filter((entry) => entry.place === place) }))
    .filter((step) => step.players.length)
}

/** Vero se qualcuno sul podio ha avuto XP di premio. */
export function podiumHasXp(podium) {
  return (podium || []).some((entry) => entry.xp > 0)
}

/** Riga del piazzamento nella cronologia del profilo: «Coppa: 2° · +50 XP», «Coppa: 5°». */
export function rewardLine(entry) {
  const text = `${entry.title}: ${placeLabel(entry.place)}`
  return entry.xp ? `${text} · +${entry.xp} XP` : text
}

/**
 * Riga dei tornei del profilo: «Tornei: 1 giocato · 1 vinto · miglior
 * piazzamento 1°»; `null` senza tornei giocati (`stats` = `{played, won, best}`).
 */
export function tournamentsLine(stats) {
  if (!stats || !stats.played) {
    return null
  }
  const played = stats.played === 1 ? '1 giocato' : `${stats.played} giocati`
  const won = stats.won === 1 ? '1 vinto' : `${stats.won} vinti`
  return `Tornei: ${played} · ${won} · miglior piazzamento ${placeLabel(stats.best)}`
}

/** Riga dell'archivio: «Street Fighter II · 2 nov · Concluso» (`day` formatta la data). */
export function archiveNote(tournament, day) {
  return [tournament.gameInfo ? tournament.gameInfo.title : '', day(tournament.finishedAt || tournament.updatedAt),
    statusLabel(tournament.status)].filter(Boolean).join(' · ')
}

/**
 * Sezioni delle estensioni nelle impostazioni del torneo: una per ogni
 * estensione che, nei dati iniziali (`addons.<id>.tournament`), conosce il
 * gioco del torneo. Ognuna è `{id, title, enabled, mode, modes}`: `mode` è
 * il tipo di conteggio scelto (`{id, label, text}`, il primo se non è
 * salvato) e `enabled` è vero se non è stata spenta (predefinito acceso).
 */
export function tournamentAddons(addons, tournament) {
  if (!tournament || !tournament.system || !tournament.game) {
    return []
  }
  const result = []
  for (const [id, data] of Object.entries(addons || {})) {
    const info = data && data.tournament
    const game = info && (info.games || []).find((entry) => entry.system === tournament.system &&
      entry.game === tournament.game)
    if (!game || !game.modes || !game.modes.length) {
      continue
    }
    const saved = (tournament.addons && tournament.addons[id]) || {}
    const mode = game.modes.find((entry) => entry.id === saved.mode) || game.modes[0]
    result.push({ id, title: info.title || id, enabled: saved.enabled !== false, mode, modes: game.modes })
  }
  return result.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Dichiarazione automatica di un'estensione per l'incontro `matchId` nell'esito
 * della partita `lastResult` (`match.declared`), oppure `null`.
 */
export function autoDeclared(lastResult, matchId) {
  const match = lastResult && lastResult.kind === 'match' ? lastResult.match : null
  if (!match || match.match !== matchId || !match.declared) {
    return null
  }
  return match.declared
}

/**
 * Avviso della partita `gameNo` dichiarata in automatico (`declared`, incontro
 * non ancora chiuso): «Partita 1: vince ADA», «Partita 2 pari» o
 * «Partita 2 pari: si rigioca». `players` sono i due giocatori dell'incontro.
 */
export function autoDeclaredText(declared, players, gameNo) {
  const label = `Partita ${gameNo}`
  if (declared.replay) {
    return `${label} pari: si rigioca`
  }
  if (declared.gameDraw) {
    return `${label} pari`
  }
  const winner = (players || []).find((player) => player.id === declared.gameWinner)
  return winner ? `${label}: vince ${winner.name}` : `${label} registrata`
}
