import { describe, expect, it } from 'vitest'
import { launchTips, nextTip } from './tips.js'

describe('consigli della schermata di avvio', () => {
  it('con le combinazioni predefinite', () => {
    const tips = launchTips({ quitCombo: 'hold_start', saveCombo: ['select', 'lt'], rescueCombo: ['select', 'rt'] })
    expect(tips.map((tip) => tip.id)).toEqual(['quit', 'save', 'rescue', 'resume'])
    expect(tips[0].text).toBe('Tieni premuto START per 2 secondi per tornare alla dashboard')
    expect(tips[1].text).toBe('Premi SELECT + Grilletto sinistro durante la partita per aprire i salvataggi')
    expect(tips[1].shoulder).toEqual(['lt'])
    expect(tips[2].text).toContain('SELECT + Grilletto destro per 2 secondi')
    expect(tips[2].shoulder).toEqual(['rt'])
  })

  it('seguono l\'uscita impostata', () => {
    expect(launchTips({ quitCombo: 'hold_select' })[0].text).toContain('Tieni premuto SELECT')
    expect(launchTips({ quitCombo: 'start_select' })[0].text).toBe('Premi START+SELECT per tornare alla dashboard')
    const rescue = launchTips({ quitCombo: 'hold_select', rescueCombo: ['select', 'rt'] }).find((tip) => tip.id === 'rescue')
    expect(rescue.text).toContain('per 1 secondo')
  })

  it('senza combinazioni restano uscita e «Riprendi»', () => {
    expect(launchTips({ quitCombo: null }).map((tip) => tip.id)).toEqual(['quit', 'resume'])
  })

  it('rotazione in cerchio', () => {
    expect(nextTip(0, 4)).toBe(1)
    expect(nextTip(3, 4)).toBe(0)
    expect(nextTip(0, 0)).toBe(0)
  })
})
