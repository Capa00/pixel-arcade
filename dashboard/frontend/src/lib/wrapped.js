/**
 * Wrapped (README «Wrapped»): schermate e testi del riepilogo del mese o
 * dell'anno, per profilo e di casa, dai dati di `GET /api/wrapped`.
 * Solo funzioni pure, usate da src/views/WrappedLayer.jsx.
 */
/** Schermate del Wrapped, nell'ordine; quelle senza dati si saltano. */
export function slidesFor(data) {
  if (!data) {
    return []
  }
  const house = data.scope === 'house'
  const slides = ['intro', 'time']
  if (data.topGames.length) {
    slides.push('top')
  }
  if (data.topGames.length > 1) {
    slides.push('top5')
  }
  if (data.systems.length) {
    slides.push('system')
  }
  if (data.trophies.count) {
    slides.push('trophies')
  }
  slides.push('habits')
  if (house) {
    if (data.players.length) {
      slides.push('players')
    }
    if (data.duo) {
      slides.push('duo')
    }
    if (data.players.length) {
      slides.push('personas')
    }
  } else {
    if (data.rival) {
      slides.push('rival')
    }
    slides.push('persona')
  }
  slides.push('summary')
  return slides
}

/** Titolo d'apertura: «IL TUO SETTEMBRE», «IL TUO 2026», «LA CASA A SETTEMBRE», «LA CASA NEL 2026». */
export function introTitle(data) {
  const month = data.kind === 'month' ? data.label.split(' ')[0].toUpperCase() : null
  if (data.scope === 'house') {
    return month ? `LA CASA A ${month}` : `LA CASA NEL ${data.label}`
  }
  return month ? `IL TUO ${month}` : `IL TUO ${data.label}`
}

/** Periodo in una frase: «di settembre 2026» o «del 2026». */
export function periodPhrase(kind, label) {
  return kind === 'year' ? `del ${label}` : `di ${label.toLowerCase()}`
}

/** Testo dell'avviso: `{title, question}` per il Wrapped del profilo o di casa (`house`). */
export function noticeText(notice) {
  const phrase = periodPhrase(notice.kind, notice.label)
  if (notice.account === null) {
    return { title: 'È PRONTO IL WRAPPED DI CASA', subtitle: `Il riepilogo ${phrase} di tutti i giocatori`, question: 'Lo guardiamo?' }
  }
  return { title: 'È PRONTO IL TUO WRAPPED', subtitle: `${notice.name}, il tuo riepilogo ${phrase}`, question: 'Lo vuoi vedere?' }
}

/** Tempo grande del contatore: `{value, unit}` in ore (con un decimale) o, sotto l'ora, in minuti. */
export function bigTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0)
  if (total < 3600) {
    const minutes = Math.round(total / 60)
    return { value: minutes, decimals: 0, unit: minutes === 1 ? 'minuto' : 'minuti' }
  }
  const hours = Math.round(total / 360) / 10
  return { value: hours, decimals: hours % 1 ? 1 : 0, unit: hours === 1 ? 'ora' : 'ore' }
}

/** Numero con la virgola italiana e `decimals` cifre decimali. */
export function formatNumber(value, decimals = 0) {
  return Number(value).toLocaleString('it-IT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** Valore del contatore che sale da 0 a `target` dopo la frazione `progress` (0–1), con frenata finale. */
export function countUp(target, progress) {
  const clamped = Math.max(0, Math.min(1, progress))
  return target * (1 - (1 - clamped) ** 3)
}

/** «1 partita», «3 partite»: `word` = `[singolare, plurale]`. */
export function plural(count, word) {
  return `${formatNumber(count)} ${count === 1 ? word[0] : word[1]}`
}

export const SESSIONS = ['partita', 'partite']
export const GAMES = ['gioco', 'giochi']
export const DAYS = ['giorno', 'giorni']
export const TROPHIES = ['trofeo', 'trofei']
export const PLAYERS = ['giocatore', 'giocatori']

/** Quota di ogni console sul tempo totale, in percentuale intera: `[{system, name, seconds, percent}]`. */
export function systemShares(systems) {
  const total = systems.reduce((sum, item) => sum + item.seconds, 0)
  return systems.map((item) => ({ ...item, percent: total ? Math.round((item.seconds / total) * 100) : 0 }))
}

const PARTS = { notte: 'di notte', mattina: 'al mattino', pomeriggio: 'di pomeriggio', sera: 'di sera' }

/** Fascia del giorno in una frase: «di sera». */
export function partPhrase(part) {
  return PARTS[part] || ''
}

const DAY_FORMAT = { weekday: 'long', day: 'numeric', month: 'long' }

/** Data di una partita come «sabato 12 settembre». */
export function dayLabel(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('it-IT', DAY_FORMAT)
}

/**
 * Esito del confronto col rivale sugli XP del periodo: `{winner, text}` con
 * `winner` pari a `me`, `them` o `tie`.
 */
export function rivalVerdict(rival) {
  const name = rival.person.name
  if (rival.me.xp > rival.them.xp) {
    return { winner: 'me', text: `Questa volta hai battuto ${name}!` }
  }
  if (rival.me.xp < rival.them.xp) {
    return { winner: 'them', text: `${name} ti ha superato: rivincita?` }
  }
  return { winner: 'tie', text: `Pari e patta con ${name}.` }
}
