import { describe, expect, it } from 'vitest'
import {
  adminMatchItems,
  leagueDays,
  leagueTable,
  lotsRows,
  lotsText,
  matchRound,
  playoffNotice,
  progressLabel,
} from './tournament.js'

const players = [
  { id: 1, name: 'Anna', color: '#f00' },
  { id: 2, name: 'Luca', color: '#0f0' },
  { id: 3, name: 'Sara', color: '#00f' },
]

function match(key, bracket, round, playOrder, a, b, extra = {}) {
  return { key, id: Number(key), bracket, round, slot: 1, playOrder, playerA: a, playerB: b, status: 'done',
    winnerId: a, walkover: false, bye: false, games: [], groupNo: null, ...extra }
}

const league = [
  match('1', 'league', 1, 1, 1, 2, { winnerId: 1 }),
  match('2', 'league', 2, 2, 2, 3, { winnerId: 2 }),
  match('3', 'league', 3, 3, 1, 3, { winnerId: 3 }),
]

describe('spareggi del girone', () => {
  const playoff = [
    match('4', 'playoff', 1, 4, 1, 2, { groupNo: 1, status: 'ready', winnerId: null }),
    match('5', 'playoff', 2, 5, 2, 3, { groupNo: 1, status: 'ready', winnerId: null }),
    match('6', 'playoff', 3, 6, 1, 3, { groupNo: 1, status: 'ready', winnerId: null }),
  ]
  const tournament = {
    status: 'running',
    players,
    matches: [...league, ...playoff],
    playoff: { status: 'playing', groups: [{ players: [1, 2, 3], place: 1, matches: ['4', '5', '6'] }] },
    standings: [1, 2, 3].map((id) => ({ id, rank: 1, tied: true, withdrawn: false })),
  }

  it('mette la giornata dello spareggio in fondo al calendario', () => {
    const days = leagueDays(tournament.matches, [1, 2, 3], tournament.playoff)
    expect(days.map((day) => day.name)).toEqual(['Giornata 1', 'Giornata 2', 'Giornata 3', 'Spareggio · 1° posto'])
    expect(days[3].matches.map((item) => item.key)).toEqual(['4', '5', '6'])
    expect(days[3].resting).toEqual([])
    expect(matchRound(playoff[0], tournament.matches)).toBe('Spareggio')
  })

  it('conta gli incontri dello spareggio a parte', () => {
    expect(progressLabel(tournament.matches)).toBe('Spareggio · Incontro 1 di 3')
  })

  it('avvisa dello spareggio e poi del sorteggio', () => {
    expect(playoffNotice(tournament)).toBe('Serve uno spareggio per il 1° posto')
    const two = { ...tournament, playoff: { status: 'playing', groups: [{ place: 1 }, { place: 3 }] } }
    expect(playoffNotice(two)).toBe('Servono spareggi per il 1° e il 3° posto')
    const draw = { ...tournament, playoff: { status: 'draw', groups: [{ players: [2, 3], place: 2 }] } }
    expect(playoffNotice(draw)).toBe('Sorteggio per il 2° posto: tocca all’admin')
    expect(playoffNotice({ ...draw, status: 'done' })).toBe('')
    const people = new Map(players.map((item) => [item.id, item]))
    expect(lotsText(draw, people)).toBe('Sorteggiare il 2° posto tra Luca e Sara? Il torneo si conclude.')
  })

  it('segna chi va sorteggiato e offre il sorteggio all’admin', () => {
    const draw = {
      ...tournament,
      creatorId: 1,
      matches: [...league, ...playoff.map((item) => ({ ...item, status: 'done', winnerId: item.playerA }))],
      playoff: { status: 'draw', groups: [{ players: [1, 2, 3], place: 1 }] },
    }
    expect(leagueTable(draw).map((row) => [row.playoff, row.lots])).toEqual([[true, true], [true, true], [true, true]])
    expect(leagueTable(tournament).map((row) => row.lots)).toEqual([false, false, false])
    const items = adminMatchItems(draw, draw.matches[0], 'p1', { id: 1, name: 'Anna' })
    expect(items[0]).toMatchObject({ id: 'lots', label: 'Sorteggia il 1° posto…', disabled: false })
    expect(adminMatchItems(tournament, tournament.matches[0], 'p1', { id: 1 })
      .some((item) => item.id === 'lots')).toBe(false)
  })

  it('elenca l’ordine estratto', () => {
    const people = new Map(players.map((item) => [item.id, item]))
    expect(lotsRows([{ place: 2, players: [3, 1] }], people).map((row) => row.label)).toEqual(['2° · Sara', '3° · Anna'])
  })
})
