/**
 * Modale «Fine partita» (README §H): schede dei giocatori dall'esito della
 * partita (`run.lastResult`) e fotogrammi dell'animazione di XP e livelli.
 * Solo funzioni pure.
 */

// Contatore «+N XP».
export const COUNT_MS = 900
// Attesa prima che la barra si muova.
export const DELAY_MS = 500
// Barra da 0 a 100%.
export const FILL_MS = 1400
// Tratto più breve della barra.
export const MIN_FILL_MS = 300
// Pausa con «LVL UP!» a barra piena.
export const BURST_MS = 1200

const SLOT_ORDER = ['p1', 'p2']

/**
 * Schede della modale, in ordine P1, P2: una per ogni profilo che ha
 * guadagnato XP. `accounts` dà nome e colore; `[]` se non c'è niente da mostrare.
 */
export function sessionCards(result, accounts) {
  const players = (result && result.players) || {}
  return Object.entries(players)
    .filter(([, entry]) => entry && entry.xpGained > 0)
    .map(([id, entry]) => {
      const account = (accounts || []).find((item) => item.id === Number(id)) || null
      return {
        ...entry,
        id: Number(id),
        slot: entry.slot || 'p1',
        name: account ? account.name : `Profilo ${id}`,
        color: account ? account.color : null,
      }
    })
    .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
}

/**
 * Riga sobria degli XP di una partita (per la schermata «Incontro»): «+8 XP»,
 * con «· ▲ Livello N» se il profilo è salito di livello; vuota senza XP.
 */
export function xpLine(entry) {
  if (!entry || !(entry.xpGained > 0)) {
    return ''
  }
  const up = entry.levelAfter > entry.levelBefore ? ` · ▲ Livello ${entry.levelAfter}` : ''
  return `+${entry.xpGained} XP${up}`
}

/** Voci degli XP da mostrare sotto il contatore, senza quelle a zero. */
export function partLines(parts) {
  const value = parts || {}
  return [
    { id: 'minutes', label: 'Tempo di gioco', xp: value.minutes || 0 },
    { id: 'session', label: 'Partita giocata', xp: value.session || 0 },
    { id: 'newGame', label: 'Gioco nuovo', xp: value.newGame || 0 },
    { id: 'challenge', label: 'Sfida della settimana ×2', xp: value.challenge || 0 },
  ].filter((line) => line.xp > 0)
}

/**
 * Tratti della barra: uno per livello attraversato. Per esempio dal livello
 * 1 al 42% al livello 2 al 3%: `[{level: 1, from: 42, to: 100}, {level: 2, from: 0, to: 3}]`.
 */
export function barSegments(card) {
  const segments = []
  let level = card.levelBefore
  let from = card.percentBefore || 0
  while (level < card.levelAfter) {
    segments.push({ level, from, to: 100 })
    level += 1
    from = 0
  }
  segments.push({ level, from, to: card.percentAfter || 0 })
  return segments
}

function fillMs(segment) {
  return Math.max(MIN_FILL_MS, (FILL_MS * (segment.to - segment.from)) / 100)
}

/** Durata dell'animazione di una scheda, in millisecondi. */
export function animationMs(card) {
  const segments = barSegments(card)
  const bar = DELAY_MS + segments.reduce((sum, segment) => sum + fillMs(segment), 0) + BURST_MS * (segments.length - 1)
  return Math.max(COUNT_MS, bar)
}

/**
 * Stato della scheda dopo `elapsed` ms: `xp` del contatore, `level`, `percent`
 * della barra, `ups` (livelli superati finora), `burst` (vero durante la pausa
 * di «LVL UP!») e `done`.
 */
export function frameAt(card, elapsed) {
  const segments = barSegments(card)
  const xp = Math.round(card.xpGained * Math.min(1, Math.max(0, elapsed) / COUNT_MS))
  let time = elapsed - DELAY_MS
  let frame = { level: segments[0].level, percent: segments[0].from, ups: 0, burst: false }
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if (time <= 0) {
      break
    }
    const length = fillMs(segment)
    const progress = Math.min(1, time / length)
    frame = { level: segment.level, percent: segment.from + (segment.to - segment.from) * progress, ups: index, burst: false }
    time -= length
    if (time < 0 || index === segments.length - 1) {
      break
    }
    // Barra piena: il livello sale subito, poi la pausa con «LVL UP!».
    frame = { level: segment.level + 1, percent: 100, ups: index + 1, burst: time < BURST_MS }
    time -= BURST_MS
    if (time < 0) {
      break
    }
  }
  return { ...frame, xp, done: elapsed >= animationMs(card) }
}

/** Stato finale della scheda, senza animazione. */
export function finalFrame(card) {
  return frameAt(card, Infinity)
}

/**
 * Trofei della partita per scheda, in basso: il P1 che li ha presi col suo
 * account («RetroAchievements sbloccati»), gli altri insieme a lui («Trofei
 * in coppia sbloccati»). `[]` senza trofei.
 */
export function trophyGroups(result, cards) {
  const achievements = (result && result.achievements) || {}
  const unlocks = achievements.unlocks || []
  if (!unlocks.length) {
    return []
  }
  return cards.map((card) => ({
    id: card.id,
    slot: card.slot,
    name: card.name,
    title: card.id === achievements.earner ? 'RetroAchievements sbloccati' : 'Trofei in coppia sbloccati',
    unlocks,
  }))
}
