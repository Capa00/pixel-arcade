import { describe, expect, it } from 'vitest'
import { dayTime, duration, formatDuration, formatSize, hours, percent, relativeDay } from './format.js'

describe('format', () => {
  it('durate', () => {
    expect(formatDuration(0)).toBe('0 s')
    expect(formatDuration(45)).toBe('45 s')
    expect(formatDuration(120)).toBe('2 min')
    expect(formatDuration(200)).toBe('3 min 20 s')
    expect(formatDuration(3900)).toBe('1 h 05 min')
    expect(formatDuration(null)).toBe('0 s')
  })

  it('giorno e ora', () => {
    const now = new Date(2026, 9, 1, 18, 0).getTime()
    expect(dayTime(new Date(2026, 9, 1, 14, 5).getTime(), now)).toBe('Oggi · 14:05')
    expect(dayTime(new Date(2026, 8, 28, 9, 30).getTime(), now)).toBe('3 giorni fa · 09:30')
  })

  it('dimensioni', () => {
    expect(formatSize(12400000)).toBe('12,4 MB')
    expect(formatSize(128000000)).toBe('128 MB')
    expect(formatSize(850000)).toBe('850 kB')
    expect(formatSize(1500000000)).toBe('1,5 GB')
    expect(formatSize(12)).toBe('12 byte')
  })

  it('percentuale', () => {
    expect(percent(40, 100)).toBe(40)
    expect(percent(5, 0)).toBeNull()
    expect(percent(150, 100)).toBe(100)
  })

  it('giorno relativo', () => {
    const now = new Date(2026, 8, 23, 10, 0).getTime()
    expect(relativeDay(new Date(2026, 8, 23, 0, 5).getTime(), now)).toBe('Oggi')
    expect(relativeDay(new Date(2026, 8, 23, 23, 0).getTime(), now)).toBe('Oggi')
    expect(relativeDay(new Date(2026, 8, 22, 23, 59).getTime(), now)).toBe('Ieri')
    expect(relativeDay(new Date(2026, 8, 20, 12, 0).getTime(), now)).toBe('3 giorni fa')
    expect(relativeDay(new Date(2026, 8, 17, 12, 0).getTime(), now)).toBe('6 giorni fa')
    expect(relativeDay(new Date(2026, 8, 16, 12, 0).getTime(), now)).toBe('Settimana scorsa')
    expect(relativeDay(new Date(2026, 8, 10, 12, 0).getTime(), now)).toBe('Settimana scorsa')
    expect(relativeDay(new Date(2026, 8, 9, 12, 0).getTime(), now)).toBe('2 settimane fa')
    expect(relativeDay(new Date(2026, 8, 1, 12, 0).getTime(), now)).toBe('3 settimane fa')
    expect(relativeDay(new Date(2026, 7, 12, 12, 0).getTime(), now)).toBe('12/08/2026')
  })

  it('durata compatta e ore', () => {
    expect(duration(0)).toBe('0m')
    expect(duration(20)).toBe('1m')
    expect(duration(12 * 60 + 10)).toBe('12m')
    expect(duration(45 * 60)).toBe('45m')
    expect(duration(80 * 60)).toBe('1h 20m')
    expect(duration(125 * 60)).toBe('2h 05m')
    expect(hours(3.4)).toBe('3,4')
    expect(hours(12)).toBe('12')
    expect(hours(0)).toBe('0')
    expect(hours(1204)).toBe('1204')
  })
})
