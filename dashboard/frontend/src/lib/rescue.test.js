import { describe, expect, it } from 'vitest'
import { FINAL, PREVIOUS, agoLabel, notBlockedChoice, rescueItems } from './rescue.js'

const NOW = Date.parse('2026-10-18T12:10:00Z')

describe('soccorso', () => {
  it('quanto tempo fa', () => {
    expect(agoLabel('2026-10-18T12:09:40Z', NOW)).toBe('Meno di un minuto fa')
    expect(agoLabel('2026-10-18T12:09:00Z', NOW)).toBe('1 minuto fa')
    expect(agoLabel('2026-10-18T11:58:00Z', NOW)).toBe('12 minuti fa')
    expect(agoLabel('2026-10-18T10:00:00Z', NOW)).toContain('·')
    expect(agoLabel('', NOW)).toBe('')
  })

  it('voci della scelta', () => {
    const items = rescueItems({
      items: [
        { id: 'r0', at: '2026-10-18T12:09:00Z', thumb: true, run: true },
        { id: 's0', at: '2026-10-17T19:50:00Z', thumb: false, run: false },
        { id: 's1', at: '2026-10-17T19:49:00Z', thumb: false, run: false, tried: true },
      ],
    }, NOW)
    expect(items.map((item) => item.id)).toEqual(['r0', 's0', 's1', PREVIOUS])
    expect(items[0]).toEqual({ id: 'r0', label: '1 minuto fa', note: 'Questa partita', thumb: true })
    expect(items[1].note).toBe('Partita precedente')
    expect(items[1].label).toContain('·')
    expect(items[2].note).toBe('Partita precedente · già provato')
    expect(items[3].thumb).toBe(false)
    expect(rescueItems(null).map((item) => item.id)).toEqual([PREVIOUS])
  })

  it('non era bloccato', () => {
    expect(notBlockedChoice({ final: true })).toBe(FINAL)
    expect(notBlockedChoice({ final: false })).toBe(PREVIOUS)
  })
})
