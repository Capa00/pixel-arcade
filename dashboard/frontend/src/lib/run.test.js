import { describe, expect, it } from 'vitest'
import { downloadPercent, downloadQuestion, noStateToast, overlayOpen, phaseLabel, playing, resultToast, tournamentToast, verdictNote } from './run.js'

describe('run', () => {
  it('schermata aperta solo durante avvio e partita', () => {
    expect(overlayOpen({ running: true, phase: 'probing' })).toBe(true)
    expect(overlayOpen({ running: true, phase: 'verdict' })).toBe(false)
    expect(overlayOpen({ running: false, phase: 'idle' })).toBe(false)
    expect(playing({ running: true, phase: 'running' })).toBe(true)
    expect(playing({ running: true, phase: 'verdict' })).toBe(false)
    expect(playing({ running: true, phase: 'rescue' })).toBe(false)
  })

  it('etichette delle fasi', () => {
    expect(phaseLabel({ phase: 'probing', attempt: null })).toBe('AVVIO IN CORSO')
    expect(phaseLabel({ phase: 'probing', attempt: { index: 2, total: 3, core: 'fbneo' } })).toBe('PROVO IL CORE 2 DI 3 · fbneo_libretro')
    const downloading = { phase: 'downloading', attempt: { index: 2, total: 5, core: 'fbneo' }, download: { core: 'fbneo', bytes: 40, total: 100 } }
    expect(phaseLabel(downloading)).toBe('SCARICO IL CORE 2 DI 5 · fbneo · 40%')
    expect(downloadPercent(downloading)).toBe(40)
    expect(phaseLabel({ phase: 'downloading', attempt: null, download: { core: 'mame', bytes: 5, total: null } })).toBe('SCARICO IL CORE · mame')
    expect(phaseLabel({ phase: 'running' })).toBe('IN GIOCO · TIENI START PER TORNARE')
    expect(phaseLabel({ phase: 'running' }, 'hold_select')).toBe('IN GIOCO · TIENI SELECT PER TORNARE')
    expect(phaseLabel({ phase: 'running' }, 'start_select')).toBe('IN GIOCO · START+SELECT PER TORNARE')
  })

  it('domande', () => {
    expect(downloadQuestion({ core: 'mame', size: 128000000 })).toBe('Scaricare mame (128 MB)?')
    expect(verdictNote({ index: 2, total: 3 })).toBe('Con No provo il core successivo (3 di 3).')
    expect(verdictNote({ index: 3, total: 3 })).toContain('senza core compatibile')
  })

  it('avviso del core che non salva la partita', () => {
    expect(noStateToast(null)).toBeNull()
    expect(noStateToast({ seconds: 30, core: 'mame2000', noState: false })).toBeNull()
    expect(noStateToast({ seconds: 30, core: 'mame2000', noState: true }))
      .toBe('Il core mame2000 non salva la partita: niente «Riprendi» per questo gioco')
    // Registrazione dello stato di un torneo: lo dice l'avviso del torneo.
    expect(noStateToast({ core: 'mame2000', noState: true, tournament: { recorded: false } })).toBeNull()
  })

  it('avviso della registrazione dello stato di un torneo', () => {
    expect(tournamentToast({ seconds: 30 })).toBeNull()
    expect(tournamentToast({ tournament: { recorded: true } })).toBe('Stato di partenza del torneo registrato.')
    expect(tournamentToast({ core: 'mame2000', noState: true, tournament: { recorded: false } }))
      .toBe('Il core mame2000 non salva la partita: il torneo partirà dall’inizio del gioco')
    expect(tournamentToast({ noState: false, tournament: { recorded: false } })).toMatch(/cambiato/)
  })

  it('notifiche di fine partita', () => {
    expect(resultToast(null)).toBeNull()
    expect(resultToast({ seconds: 200, core: 'mame', probed: false })).toEqual({ message: 'Partita terminata · 3 min 20 s', variant: 'info' })
    expect(resultToast({ seconds: 130, core: 'fbneo', probed: true, confirmed: true }).message)
      .toBe('Partita terminata · 2 min 10 s · Core memorizzato: fbneo')
    expect(resultToast({ incompatible: true, tried: ['mame', 'fbneo'] })).toEqual({ message: 'Nessun core compatibile: provati mame, fbneo', variant: 'error' })
    expect(resultToast({ error: true, message: 'Core mame non disponibile' }).variant).toBe('error')
    expect(resultToast({ stopped: true, message: 'Ricerca interrotta' }).message).toBe('Ricerca interrotta')
    expect(resultToast({ confirmed: true, core: 'mame', seconds: null }).message).toBe('Core memorizzato: mame')
  })
})
