import { describe, expect, it } from 'vitest'
import { initialPlayers } from '../state/players.js'
import {
  DELETE_ALL,
  NAME_MAX,
  SHARED,
  UNDO,
  cleanName,
  confirmText,
  copyTargets,
  firstEnabled,
  focusScope,
  ingameConfirmText,
  ingameProgress,
  ingameTab,
  itemLabel,
  itemNote,
  launchResume,
  playReason,
  profileTab,
  saveDate,
  saveItems,
  saveTabs,
  slotActions,
  stepTab,
} from './saves.js'

const AT = new Date(2026, 9, 1, 14, 5).toISOString()

function save(slot, extra = {}) {
  return { slot, core: 'bsnes', name: null, protected: false, updatedAt: AT, thumb: true, loadable: true, ...extra }
}

function withUsers(p1, p2) {
  return {
    p1: { ...initialPlayers.p1, joined: Boolean(p1), user: p1 },
    p2: { ...initialPlayers.p2, joined: Boolean(p2), user: p2 },
  }
}

const LUCA = { id: 1, name: 'LUCA', color: '#f5c542', guest: false }
const SARA = { id: 2, name: 'SARA', color: '#a48bff', guest: false }
const GUEST = { id: null, name: 'Ospite 1', color: '#d8d5e3', guest: true }

describe('saves', () => {
  it('schede solo per i profili con salvataggi, nell\'ordine P1, P2', () => {
    const accounts = [{ id: 2, slots: [save(0)] }, { id: 1, slots: [save(3)] }]
    const tabs = saveTabs(withUsers(LUCA, SARA), accounts)
    expect(tabs.map((tab) => [tab.tag, tab.account.name, tab.slots.length])).toEqual([['P1', 'LUCA', 1], ['P2', 'SARA', 1]])
    expect(tabs[0]).toMatchObject({ key: 'p1', playerColor: '#ff5d73', account: { id: 1, color: '#f5c542' } })
    expect(saveTabs(withUsers(LUCA, SARA), [{ id: 1, slots: [] }, { id: 2, slots: [save(0)] }]).map((tab) => tab.key))
      .toEqual(['p2'])
    expect(saveTabs(withUsers(GUEST, null), [{ id: null, slots: [save(0)] }])).toEqual([])
    expect(saveTabs(withUsers(null, null), [])).toEqual([])
    expect(focusScope(tabs[1])).toBe('saves-2')
  })

  it('schede circolari', () => {
    expect(stepTab(0, 1, 2)).toBe(1)
    expect(stepTab(1, 1, 2)).toBe(0)
    expect(stepTab(0, -1, 2)).toBe(1)
    expect(stepTab(0, 1, 1)).toBe(0)
  })

  it('voci all\'avvio: Riprendi, slot occupati, Nuova partita', () => {
    const items = saveItems([save(4), save(0), save(2, { loadable: false, core: 'snes9x' })], 'start')
    expect(items.map((item) => item.id)).toEqual(['slot-0', 'slot-2', 'slot-4', 'new'])
    expect(items.map((item) => item.disabled)).toEqual([false, true, false, false])
    expect(itemNote(items[1])).toBe('Creato con snes9x')
    expect(itemNote(items[0])).toBe('')
    expect(saveItems([save(5)]).map((item) => item.id)).toEqual(['slot-5', 'new'])
    expect(firstEnabled(saveItems([save(1, { loadable: false })]))).toBe('new')
  })

  it('voci in partita: tutti gli slot 1–9, senza Riprendi', () => {
    const items = saveItems([save(0), save(3)], 'game')
    expect(items.map((item) => item.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(items[2].save.slot).toBe(3)
    expect(items[0].save).toBeNull()
    expect(itemNote(items[0])).toBe('Vuoto')
  })

  it('in partita uno stato di un altro core si sceglie per sovrascriverlo', () => {
    const items = saveItems([save(2, { loadable: false, core: 'snes9x' })], 'game')
    expect(items[1].disabled).toBe(false)
    expect(itemNote(items[1])).toBe('Creato con snes9x')
    expect(slotActions(items[1]).map((entry) => entry.id)).toEqual(['save', 'rename', 'protect', 'delete'])
    expect(slotActions(items[0])).toEqual([{ id: 'save', label: 'Salva qui', note: '', disabled: false, reason: '' }])
    const loadable = saveItems([save(3)], 'game')[2]
    expect(slotActions(loadable).map((entry) => entry.id)).toEqual(['save', 'load', 'rename', 'protect', 'delete'])
    expect(slotActions(loadable)[0].note).toBe('Sovrascrive')
  })

  it('menu dello slot: protezione e copia all\'altro giocatore', () => {
    const named = saveItems([save(2, { name: 'Boss' })], 'game')[1]
    const actions = slotActions(named, { other: { id: 2, name: 'SARA' } })
    expect(actions.map((entry) => entry.label)).toEqual(['Salva qui', 'Carica', 'Rinomina', 'Proteggi', 'Elimina', 'Copia a SARA'])
    expect(actions[2].note).toBe('Boss')
    expect(actions.every((entry) => !entry.disabled)).toBe(true)
    const locked = saveItems([save(2, { protected: true })], 'game')[1]
    const lockedActions = slotActions(locked, { other: null })
    expect(lockedActions.map((entry) => entry.id)).toEqual(['save', 'load', 'rename', 'unprotect', 'delete'])
    expect(lockedActions.filter((entry) => entry.disabled).map((entry) => entry.id)).toEqual(['save', 'delete'])
    expect(lockedActions[0]).toMatchObject({ note: 'Protetto', reason: 'Slot protetto: togli la protezione per sovrascriverlo' })
    expect(lockedActions[4].reason).toBe('Slot protetto: togli la protezione per eliminarlo')
    expect(lockedActions[3].label).toBe('Togli protezione')
  })

  it('«Annulla ultimo caricamento» in cima, senza focus all\'apertura', () => {
    const items = saveItems([save(1)], 'game', { undo: true })
    expect(items.map((item) => item.id).slice(0, 2)).toEqual([UNDO, 'slot-1'])
    expect(items).toHaveLength(10)
    expect(itemLabel(items[0])).toBe('Annulla ultimo caricamento')
    expect(itemNote(items[0])).toBe('Torna a prima del caricamento')
    expect(firstEnabled(items)).toBe('slot-1')
    expect(saveItems([save(1)], 'game', { undo: false })).toHaveLength(9)
    expect(saveItems([save(1)], 'start', { undo: true }).map((item) => item.id)).toEqual(['slot-1', 'new'])
  })

  it('destinazione della copia: gli slot protetti non si scelgono', () => {
    const items = saveItems([save(5, { protected: true }), save(6)], 'copy', { undo: true })
    expect(items.map((item) => item.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(items.filter((item) => item.disabled).map((item) => item.slot)).toEqual([5])
    expect(itemNote(items[4])).toBe('Protetto')
    expect(itemNote(items[5])).toBe('')
    expect(firstEnabled(items)).toBe('slot-1')
  })

  it('conferme in partita', () => {
    const [empty, , full] = saveItems([save(3)], 'game')
    expect(ingameConfirmText('save', empty)).toBe('Salvare nello slot 1?')
    expect(ingameConfirmText('save', full)).toMatch(/^Sovrascrivere lo slot 3 del \d{2}\/\d{2}\/\d{4} alle \d{2}:\d{2}\?$/)
    expect(ingameConfirmText('load', full)).toMatch(/^Caricare lo slot 3 del .+\?$/)
    const undated = saveItems([save(4, { updatedAt: 'x' })], 'game')[3]
    expect(ingameConfirmText('save', undated)).toBe('Sovrascrivere lo slot 4?')
  })

  it('conferme delle altre operazioni', () => {
    const [, plain, named] = saveItems([save(2), save(3, { name: 'Boss' })], 'game')
    const date = '01/10/2026 alle 14:05'
    expect(ingameConfirmText('delete', plain)).toBe(`Eliminare lo slot 2 del ${date}?`)
    expect(ingameConfirmText('delete', named)).toBe(`Eliminare lo slot 3 «Boss» del ${date}?`)
    expect(ingameConfirmText('rename', plain, { name: 'Prima del boss' })).toBe('Chiamare lo slot 2 «Prima del boss»?')
    expect(ingameConfirmText('rename', named, { name: '' })).toBe('Togliere il nome allo slot 3?')
    expect(ingameConfirmText('protect', named)).toBe('Proteggere lo slot 3 «Boss»?')
    expect(ingameConfirmText('unprotect', plain)).toBe('Togliere la protezione allo slot 2?')
    expect(ingameConfirmText(UNDO, { kind: UNDO })).toBe('Annullare l\'ultimo caricamento e tornare a prima di esso?')
    const other = { id: 2, name: 'SARA' }
    const [empty, , full] = saveItems([save(3)], 'copy')
    expect(ingameConfirmText('copy', named, { other, target: empty })).toBe('Copiare lo slot 3 «Boss» nello slot 1 di SARA?')
    expect(ingameConfirmText('copy', plain, { other, target: full }))
      .toBe(`Sovrascrivere lo slot 3 di SARA del ${date} con lo slot 2?`)
  })

  it('testi di avanzamento', () => {
    const [, plain] = saveItems([save(2)], 'game')
    expect(ingameProgress('save', plain)).toEqual(['Salvataggio nello slot 2…', 'Salvato nello slot 2'])
    expect(ingameProgress('delete', plain)[1]).toBe('Slot 2 eliminato')
    expect(ingameProgress('rename', plain, { name: '' })[1]).toBe('Nome dello slot 2 tolto')
    expect(ingameProgress('copy', plain, { other: { name: 'SARA' }, target: { slot: 5 } })[1])
      .toBe('Copiato nello slot 5 di SARA')
    expect(ingameProgress(UNDO, { kind: UNDO })[1]).toBe('Ritorno al gioco…')
  })

  it('nome dello slot ripulito come nel servizio', () => {
    expect(cleanName('  Prima   del\tboss \n')).toBe('Prima del boss')
    expect(cleanName('Livello\u00007')).toBe('Livello 7')
    expect(cleanName('A'.repeat(25))).toBe('A'.repeat(NAME_MAX))
    expect(cleanName('Diciannove letteree  yz')).toBe('Diciannove letteree')
    expect(cleanName(null)).toBe('')
  })

  it('scheda in partita', () => {
    const tab = ingameTab('p2', { id: 7, name: 'ANNA', color: '#3ccfc4', level: 3 }, [save(1)])
    expect(tab).toEqual({
      key: 'p2',
      tag: 'P2',
      playerColor: '#3ccfc4',
      account: { id: 7, name: 'ANNA', color: '#3ccfc4' },
      slots: [save(1)],
    })
    expect(focusScope(tab)).toBe('saves-7')
    expect(ingameTab('p1', { id: 1, name: 'LUCA', color: '#fff' }, null).slots).toEqual([])
  })

  it('titoli delle voci', () => {
    const [resume, named, plain, fresh] = saveItems([save(0), save(1, { name: 'Boss finale' }), save(2)])
    expect([resume, named, plain, fresh].map(itemLabel)).toEqual(['Riprendi', 'Boss finale', 'Slot 2', 'Nuova partita'])
  })

  it('testi di conferma', () => {
    const [resume, named, plain, fresh] = saveItems([save(0), save(1, { name: 'Boss finale' }), save(2)])
    expect(saveDate(AT)).toBe('01/10/2026 alle 14:05')
    expect(saveDate('x')).toBe('')
    expect(confirmText(resume)).toBe('Riprendere la partita del 01/10/2026 alle 14:05?')
    expect(confirmText(named)).toBe('Caricare lo slot 1 «Boss finale» del 01/10/2026 alle 14:05?')
    expect(confirmText(plain)).toBe('Caricare lo slot 2 del 01/10/2026 alle 14:05?')
    expect(confirmText(fresh)).toBe('Iniziare una nuova partita?')
    expect(confirmText({ ...resume, save: { ...resume.save, updatedAt: null } })).toBe('Riprendere la partita?')
  })

  it('stato da caricare all\'avvio', () => {
    const [tab] = saveTabs(withUsers(LUCA, null), [{ id: 1, slots: [save(0)] }])
    const [resume, fresh] = saveItems(tab.slots)
    expect(launchResume(tab, resume)).toEqual({ account: 1, slot: 0 })
    expect(launchResume(tab, fresh)).toBeNull()
    expect(launchResume(null, resume)).toBeNull()
  })

  it('voci nel Profilo: Riprendi e slot occupati, anche di un altro core', () => {
    const items = saveItems([save(3, { loadable: false }), save(0), save(1, { protected: true })], 'profile')
    expect(items.map((item) => item.id)).toEqual(['slot-0', 'slot-1', 'slot-3'])
    expect(items.some((item) => item.disabled)).toBe(false)
    expect(itemNote(items[2])).toBe('Creato con bsnes')
  })

  it('menu dello slot nel Profilo', () => {
    const [resume, locked, other] = saveItems([save(0), save(1, { protected: true, name: 'Boss' }), save(2, { loadable: false })], 'profile')
    const ids = (actions) => actions.map((entry) => entry.id)
    expect(ids(slotActions(resume, { mode: 'profile' }))).toEqual(['play', 'delete'])
    const lockedActions = slotActions(locked, { mode: 'profile' })
    expect(ids(lockedActions)).toEqual(['play', 'rename', 'unprotect', 'delete', 'copy'])
    expect(lockedActions[0].disabled).toBe(false)
    expect(lockedActions[1].note).toBe('Boss')
    expect(lockedActions[3]).toMatchObject({ disabled: true, reason: 'Slot protetto: togli la protezione per eliminarlo' })
    expect(lockedActions[4].label).toBe('Copia a…')
    const otherActions = slotActions(other, { mode: 'profile', copy: 'Nessun altro profilo' })
    expect(ids(otherActions)).toEqual(['play', 'rename', 'protect', 'delete', 'copy'])
    expect(otherActions[0]).toMatchObject({ disabled: true, reason: playReason(other.save) })
    expect(otherActions[4]).toMatchObject({ disabled: true, reason: 'Nessun altro profilo' })
    const missing = slotActions(resume, { mode: 'profile', play: 'Gioco non più presente nella libreria.' })
    expect(missing[0]).toMatchObject({ disabled: true, reason: 'Gioco non più presente nella libreria.' })
    expect(playReason(save(1))).toBe('')
  })

  it('conferme e testi nel Profilo', () => {
    const [resume, named] = saveItems([save(0), save(1, { name: 'Boss' })], 'profile')
    expect(ingameConfirmText('play', resume)).toBe('Avviare il gioco da «Riprendi» del 01/10/2026 alle 14:05?')
    expect(ingameConfirmText('play', named)).toBe('Avviare il gioco dallo slot 1 «Boss» del 01/10/2026 alle 14:05?')
    expect(ingameConfirmText('delete', resume)).toBe('Eliminare «Riprendi» del 01/10/2026 alle 14:05?')
    expect(ingameConfirmText(DELETE_ALL, null, { title: 'Zelda', step: 1 })).toBe('Eliminare tutti i salvataggi di Zelda?')
    expect(ingameConfirmText(DELETE_ALL, null, { title: 'Zelda', step: 2 })).toBe('Confermi l\'eliminazione? Non si può annullare. Gli slot protetti restano.')
    expect(ingameProgress('delete', resume)[1]).toBe('«Riprendi» eliminato')
    expect(ingameProgress(DELETE_ALL, {}, { remaining: 2 })[1]).toBe('Salvataggi eliminati, restano gli slot protetti')
    expect(ingameProgress(DELETE_ALL, {}, { remaining: 0 })[1]).toBe('Salvataggi eliminati')
  })

  it('salvataggi condivisi all\'avvio', () => {
    const shared = [{ id: 'Tutto', title: 'Tutto sbloccato', description: 'Ottanta cuori' }]
    // Senza slot ma con salvataggi condivisi: una scheda per il primo giocatore, anche ospite.
    expect(saveTabs(withUsers(GUEST, LUCA), [{ id: 1, slots: [] }], shared)).toEqual([
      { key: 'p1', tag: 'P1', playerColor: '#ff5d73', account: { id: null, name: 'Ospite 1', color: '#ff5d73' }, slots: [] },
    ])
    expect(saveTabs(withUsers(null, LUCA), [{ id: 1, slots: [] }], shared)[0]).toMatchObject({ key: 'p2', account: { id: 1 } })
    expect(saveTabs(withUsers(LUCA, null), [{ id: 1, slots: [] }], [])).toEqual([])
    const items = saveItems([save(0, { shared: { id: 'Tutto', title: 'Tutto sbloccato' } })], 'start', { shared })
    expect(items.map((item) => item.kind)).toEqual(['slot', 'new', SHARED])
    expect(itemLabel(items[2])).toBe('Tutto sbloccato')
    expect(itemNote(items[2])).toBe('Ottanta cuori')
    expect(itemNote(items[0])).toBe('Da «Tutto sbloccato»')
    expect(itemNote(saveItems([save(1, { shared: { id: 'Via', title: null } })], 'start')[0])).toBe('Da un salvataggio condiviso eliminato')
    expect(confirmText(items[2])).toBe('Giocare con il salvataggio condiviso «Tutto sbloccato»? Il tuo salvataggio resta com\'è.')
    expect(launchResume({ account: { id: 1 } }, items[2])).toEqual({ shared: 'Tutto' })
    expect(launchResume({ account: { id: 1 } }, items[0])).toEqual({ account: 1, slot: 0 })
    // Solo all'avvio: né in partita né nel Profilo.
    expect(saveItems([], 'game', { shared }).some((item) => item.kind === SHARED)).toBe(false)
    expect(saveItems([], 'profile', { shared })).toEqual([])
  })

  it('scheda del profilo e destinazioni della copia', () => {
    const anna = { id: 2, name: 'ANNA', color: '#3ccfc4' }
    expect(profileTab(anna, null)).toEqual({ key: 'profile-2', tag: '', playerColor: '#3ccfc4', account: anna, slots: [] })
    const accounts = [{ id: 1, name: 'LUCA', color: '#fff' }, anna]
    expect(copyTargets(accounts, 1)).toEqual([{ id: 2, label: 'ANNA', color: '#3ccfc4', note: '', disabled: false }])
    expect(copyTargets(null, 1)).toEqual([])
  })
})
