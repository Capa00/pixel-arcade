import { describe, expect, it } from 'vitest'
import { autoDeclared, autoDeclaredText, tournamentAddons } from './tournament.js'

const MODES = [
  { id: 'match', label: 'Vittoria della partita', text: 'Spiegazione' },
  { id: 'lines', label: 'Righe', text: 'Altro' },
]
const ADDONS = {
  autoresult: { tournament: { title: 'Fine partita automatica', games: [{ system: 'arcade', game: 'wj', modes: MODES }] } },
  other: { systems: ['arcade'] },
}

describe('tournamentAddons', () => {
  it('mostra la sezione solo per i giochi conosciuti, accesa e col primo tipo di conteggio', () => {
    const [entry] = tournamentAddons(ADDONS, { system: 'arcade', game: 'wj', addons: {} })
    expect(entry).toMatchObject({ id: 'autoresult', title: 'Fine partita automatica', enabled: true })
    expect(entry.mode.id).toBe('match')
    expect(tournamentAddons(ADDONS, { system: 'arcade', game: 'altro', addons: {} })).toEqual([])
    expect(tournamentAddons(ADDONS, { system: null, game: null })).toEqual([])
  })

  it('usa le impostazioni salvate nel torneo', () => {
    const tournament = { system: 'arcade', game: 'wj', addons: { autoresult: { enabled: false, mode: 'lines' } } }
    const [entry] = tournamentAddons(ADDONS, tournament)
    expect(entry.enabled).toBe(false)
    expect(entry.mode.id).toBe('lines')
  })
})

describe('autoDeclared', () => {
  const declared = { done: false, gameWinner: 2, gameDraw: false, replay: false }
  const last = { kind: 'match', match: { match: 7, gameNo: 1, declared } }

  it('trova la dichiarazione automatica dell incontro', () => {
    expect(autoDeclared(last, 7)).toBe(declared)
    expect(autoDeclared(last, 8)).toBe(null)
    expect(autoDeclared({ kind: 'match', match: { match: 7, declared: null } }, 7)).toBe(null)
    expect(autoDeclared(null, 7)).toBe(null)
  })

  it('scrive l avviso della partita', () => {
    const players = [{ id: 1, name: 'ADA' }, { id: 2, name: 'BEA' }]
    expect(autoDeclaredText(declared, players, 1)).toBe('Partita 1: vince BEA')
    expect(autoDeclaredText({ ...declared, gameWinner: null, gameDraw: true }, players, 2)).toBe('Partita 2 pari')
    expect(autoDeclaredText({ ...declared, gameWinner: null, replay: true }, players, 2)).toBe('Partita 2 pari: si rigioca')
  })
})
