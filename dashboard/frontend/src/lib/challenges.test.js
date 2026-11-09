import { describe, expect, it } from 'vitest'
import { attempts, clock, daysLeft, finalText, noticeText, outcomeText, pickerItems } from './challenges.js'

const CHALLENGE = {
  id: 3,
  title: 'Tetris Worlds',
  achievementTitle: 'Single Pringle',
  creator: { id: 1, name: 'ADA' },
  seconds: 310,
  record: { account: 2, name: 'BEA', seconds: 250 },
  daysLeft: 15,
}

describe('sfida trofeo', () => {
  it('scrive i tempi come m:ss', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(310)).toBe('5:10')
    expect(clock(3725)).toBe('1:02:05')
    expect(clock(null)).toBe('–')
    expect(clock(-1)).toBe('–')
  })

  it('scrive giorni e tentativi', () => {
    expect(daysLeft(15)).toBe('ancora 15 giorni')
    expect(daysLeft(1)).toBe('ancora 1 giorno')
    expect(daysLeft(0)).toBe('scade oggi')
    expect(attempts(1)).toBe('1 tentativo')
    expect(attempts(3)).toBe('3 tentativi')
  })

  it('prepara le voci della scelta a fine partita', () => {
    const candidates = [{ achievementId: 7, title: 'A' }, { achievementId: 8, title: 'B' }]
    let items = pickerItems(candidates, new Set())
    expect(items.map((item) => item.kind)).toEqual(['trophy', 'trophy', 'launch', 'skip'])
    expect(items[2]).toMatchObject({ disabled: true, label: 'Scegli almeno un trofeo' })
    items = pickerItems(candidates, new Set([8]))
    expect(items[2]).toMatchObject({ disabled: false, label: 'Lancia la sfida' })
    items = pickerItems(candidates, new Set([7, 8]))
    expect(items[2].label).toBe('Lancia le sfide (2)')
  })

  it('racconta l\'esito della partita di sfida', () => {
    expect(outcomeText(null)).toBeNull()
    expect(outcomeText({ won: false, achievementTitle: 'X', attempts: 2 })).toMatchObject({ tone: 'failed' })
    expect(outcomeText({
      won: true, seconds: 240, achievementTitle: 'X', beatRecord: true,
      previousRecord: { name: 'BEA', seconds: 250 }, record: { name: 'ADA', seconds: 240 },
    })).toEqual({ tone: 'record', title: 'Nuovo record!', text: 'X in 4:00: battuto BEA (4:10).' })
    expect(outcomeText({
      won: true, seconds: 300, achievementTitle: 'X', personalBest: true, record: { name: 'BEA', seconds: 250 },
    })).toMatchObject({ tone: 'won', title: 'Ce l\'hai fatta, tuo miglior tempo' })
    expect(outcomeText({
      won: true, seconds: 200, achievementTitle: 'X', personalBest: true, record: { name: 'ADA', seconds: 200 },
    })).toMatchObject({ tone: 'record', title: 'Record migliorato!' })
  })

  it('scrive gli avvisi', () => {
    expect(noticeText(CHALLENGE)).toEqual({
      title: 'ADA ti sfida!',
      text: 'Single Pringle · Tetris Worlds',
      detail: 'Tempo da battere 4:10 (BEA) · ancora 15 giorni',
    })
    expect(finalText(CHALLENGE, 2).title).toBe('Hai vinto la sfida!')
    expect(finalText(CHALLENGE, 1).title).toBe('BEA ha vinto la tua sfida')
    expect(finalText(CHALLENGE, 3).title).toBe('Sfida conclusa')
  })
})
