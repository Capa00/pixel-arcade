import { describe, expect, it } from 'vitest'
import {
  bigTime,
  countUp,
  introTitle,
  noticeText,
  partPhrase,
  periodPhrase,
  plural,
  rivalVerdict,
  SESSIONS,
  slidesFor,
  systemShares,
} from './wrapped.js'

function profileData(patch = {}) {
  return {
    scope: 'profile',
    kind: 'month',
    label: 'Settembre 2026',
    profile: { id: 1, name: 'ADA', color: '#ff5d73' },
    totals: { seconds: 7200, sessions: 4, games: 3, days: 4, newGames: 1, trophies: 0, xp: 300 },
    topGames: [{ game: 'nes/zelda.nes', seconds: 3600, sessions: 1 }, { game: 'arcade/pang.zip', seconds: 3000, sessions: 2 }],
    systems: [{ system: 'nes', name: 'NES', seconds: 3600, sessions: 1 }],
    trophies: { count: 0, recent: [], topGame: null },
    rival: null,
    persona: { id: 'loyal', name: 'Il Fedele', text: '' },
    ...patch,
  }
}

describe('schermate', () => {
  it('salta trofei e rivale senza dati', () => {
    expect(slidesFor(profileData())).toEqual(['intro', 'time', 'top', 'top5', 'system', 'habits', 'persona', 'summary'])
    expect(slidesFor(null)).toEqual([])
  })

  it('aggiunge trofei e rivale quando ci sono', () => {
    const data = profileData({ trophies: { count: 2, recent: [], topGame: null }, rival: { person: {} } })
    expect(slidesFor(data)).toEqual(['intro', 'time', 'top', 'top5', 'system', 'trophies', 'habits', 'rival', 'persona', 'summary'])
  })

  it('il Wrapped di casa ha classifica, coppia e personaggi', () => {
    const data = profileData({ scope: 'house', players: [{ id: 1 }], duo: { players: [] } })
    expect(slidesFor(data)).toEqual(['intro', 'time', 'top', 'top5', 'system', 'habits', 'players', 'duo', 'personas', 'summary'])
    expect(slidesFor({ ...data, duo: null, topGames: [data.topGames[0]] })).toEqual(
      ['intro', 'time', 'top', 'system', 'habits', 'players', 'personas', 'summary'],
    )
  })
})

describe('testi', () => {
  it('titolo d’apertura', () => {
    expect(introTitle(profileData())).toBe('IL TUO SETTEMBRE')
    expect(introTitle(profileData({ kind: 'year', label: '2026' }))).toBe('IL TUO 2026')
    expect(introTitle(profileData({ scope: 'house' }))).toBe('LA CASA A SETTEMBRE')
    expect(introTitle(profileData({ scope: 'house', kind: 'year', label: '2026' }))).toBe('LA CASA NEL 2026')
  })

  it('periodo e avviso', () => {
    expect(periodPhrase('month', 'Settembre 2026')).toBe('di settembre 2026')
    expect(periodPhrase('year', '2026')).toBe('del 2026')
    const mine = noticeText({ account: 1, name: 'ADA', kind: 'month', label: 'Settembre 2026' })
    expect(mine.title).toBe('È PRONTO IL TUO WRAPPED')
    expect(mine.subtitle).toBe('ADA, il tuo riepilogo di settembre 2026')
    const house = noticeText({ account: null, name: '', kind: 'year', label: '2026' })
    expect(house.title).toBe('È PRONTO IL WRAPPED DI CASA')
    expect(house.question).toBe('Lo guardiamo?')
  })

  it('tempo grande, conteggi e fasce', () => {
    expect(bigTime(1800)).toEqual({ value: 30, decimals: 0, unit: 'minuti' })
    expect(bigTime(3600)).toEqual({ value: 1, decimals: 0, unit: 'ora' })
    expect(bigTime(9000)).toEqual({ value: 2.5, decimals: 1, unit: 'ore' })
    expect(plural(1, SESSIONS)).toBe('1 partita')
    expect(plural(12000, SESSIONS)).toBe('12.000 partite')
    expect(partPhrase('sera')).toBe('di sera')
    expect(partPhrase('mattina')).toBe('al mattino')
  })

  it('contatore che frena alla fine', () => {
    expect(countUp(100, 0)).toBe(0)
    expect(countUp(100, 1)).toBe(100)
    expect(countUp(100, 0.5)).toBeGreaterThan(50)
    expect(countUp(100, 2)).toBe(100)
  })

  it('quote delle console', () => {
    expect(systemShares([{ system: 'nes', seconds: 300 }, { system: 'snes', seconds: 100 }]).map((item) => item.percent)).toEqual([75, 25])
    expect(systemShares([{ system: 'nes', seconds: 0 }])[0].percent).toBe(0)
  })

  it('esito del rivale', () => {
    const rival = (me, them) => ({ person: { name: 'BEA' }, me: { xp: me }, them: { xp: them } })
    expect(rivalVerdict(rival(10, 5)).winner).toBe('me')
    expect(rivalVerdict(rival(5, 10)).winner).toBe('them')
    expect(rivalVerdict(rival(5, 5)).winner).toBe('tie')
  })
})
