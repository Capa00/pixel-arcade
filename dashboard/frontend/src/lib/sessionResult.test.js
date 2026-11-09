import { describe, expect, it } from 'vitest'
import {
  BURST_MS,
  COUNT_MS,
  DELAY_MS,
  FILL_MS,
  animationMs,
  barSegments,
  finalFrame,
  frameAt,
  partLines,
  xpLine,
  sessionCards,
  trophyGroups,
} from './sessionResult.js'

const LUCA = { id: 1, name: 'LUCA_8BIT', color: '#ff5d73' }
const SARA = { id: 2, name: 'SARA.EXE', color: '#3ccfc4' }

const UP = { slot: 'p1', xpGained: 65, levelBefore: 1, levelAfter: 2, percentBefore: 50, percentAfter: 20, title: 'Recluta', titleBefore: 'Recluta' }
const SAME = { slot: 'p2', xpGained: 30, levelBefore: 3, levelAfter: 3, percentBefore: 10, percentAfter: 40, title: 'Apprendista', titleBefore: 'Apprendista' }

describe('modale fine partita', () => {
  it('schede in ordine P1, P2, solo per chi ha guadagnato XP', () => {
    const result = { players: { 2: { ...SAME, slot: 'p1' }, 1: { ...UP, slot: 'p2' }, 9: { ...SAME, xpGained: 0 } } }
    const cards = sessionCards(result, [LUCA, SARA])
    expect(cards.map((card) => [card.id, card.slot, card.name, card.color])).toEqual([
      [2, 'p1', 'SARA.EXE', '#3ccfc4'],
      [1, 'p2', 'LUCA_8BIT', '#ff5d73'],
    ])
    expect(sessionCards({ players: { 7: SAME } }, [])[0].name).toBe('Profilo 7')
    expect(sessionCards({ players: {} }, [])).toEqual([])
    expect(sessionCards(null, [])).toEqual([])
  })

  it('voci degli XP senza quelle a zero', () => {
    expect(partLines({ minutes: 12, session: 5, newGame: 0 })).toEqual([
      { id: 'minutes', label: 'Tempo di gioco', xp: 12 },
      { id: 'session', label: 'Partita giocata', xp: 5 },
    ])
    expect(partLines(undefined)).toEqual([])
    expect(partLines({ minutes: 12, session: 5, newGame: 0, challenge: 12 })[2]).toEqual(
      { id: 'challenge', label: 'Sfida della settimana ×2', xp: 12 },
    )
  })

  it('tratti della barra per ogni livello attraversato', () => {
    expect(barSegments(SAME)).toEqual([{ level: 3, from: 10, to: 40 }])
    expect(barSegments({ ...UP, levelAfter: 3 })).toEqual([
      { level: 1, from: 50, to: 100 },
      { level: 2, from: 0, to: 100 },
      { level: 3, from: 0, to: 20 },
    ])
  })

  it('animazione senza cambio di livello', () => {
    expect(frameAt(SAME, 0)).toEqual({ xp: 0, level: 3, percent: 10, ups: 0, burst: false, done: false })
    expect(frameAt(SAME, COUNT_MS).xp).toBe(30)
    const half = frameAt(SAME, DELAY_MS + (FILL_MS * 30) / 200)
    expect(half.percent).toBeCloseTo(25)
    expect(finalFrame(SAME)).toEqual({ xp: 30, level: 3, percent: 40, ups: 0, burst: false, done: true })
  })

  it('animazione con LVL UP!', () => {
    const full = DELAY_MS + FILL_MS / 2
    expect(frameAt(UP, full - 1)).toMatchObject({ level: 1, ups: 0, burst: false })
    expect(frameAt(UP, full + 10)).toMatchObject({ level: 2, percent: 100, ups: 1, burst: true })
    expect(frameAt(UP, full + BURST_MS + 1)).toMatchObject({ level: 2, ups: 1, burst: false })
    expect(frameAt(UP, full + BURST_MS + 1).percent).toBeLessThan(1)
    expect(frameAt(UP, animationMs(UP))).toMatchObject({ level: 2, percent: 20, ups: 1, done: true })
    expect(finalFrame({ ...UP, levelAfter: 4 })).toMatchObject({ level: 4, ups: 3, done: true })
  })

  it('trofei in basso: P1 col suo account, gli altri in coppia', () => {
    const cards = sessionCards({ players: { 1: UP, 2: SAME } }, [LUCA, SARA])
    const unlocks = [{ id: 41, title: 'Primo livello', at: '2026-10-01T18:00:00+00:00' }]
    const groups = trophyGroups({ achievements: { unlocks, earner: 1 } }, cards)
    expect(groups.map((group) => [group.id, group.title, group.unlocks.length])).toEqual([
      [1, 'RetroAchievements sbloccati', 1],
      [2, 'Trofei in coppia sbloccati', 1],
    ])
    expect(trophyGroups({ achievements: { unlocks: [], earner: 1 } }, cards)).toEqual([])
    expect(trophyGroups({}, cards)).toEqual([])
  })
})

describe('xpLine', () => {
  it('XP della partita e livello nuovo', () => {
    expect(xpLine({ xpGained: 8, levelBefore: 4, levelAfter: 4 })).toBe('+8 XP')
    expect(xpLine({ xpGained: 30, levelBefore: 4, levelAfter: 5 })).toBe('+30 XP · ▲ Livello 5')
    expect(xpLine({ xpGained: 0 })).toBe('')
    expect(xpLine(undefined)).toBe('')
  })
})
