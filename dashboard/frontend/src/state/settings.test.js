import { describe, expect, it } from 'vitest'
import {
  bootstrapLoaded,
  closeSettings,
  coreRemove,
  coresAdd,
  coresRefreshed,
  coresRefreshFailed,
  coresRefreshing,
  openKeyboard,
  openSettings,
  oskCancel,
  oskConfirm,
  oskType,
  setPickerFilter,
  settingsChange,
  settingsLoaded,
  settingsSaved,
  settingsSaveFailed,
  systemChange,
  systemsLoaded,
  gamesLoaded,
} from './actions.js'
import { initialState, reducer } from './reducer.js'
import {
  SETTINGS_TABS,
  addCores,
  availableMap,
  coreStatus,
  coreSummary,
  cpuNote,
  isDirty,
  settingsPayload,
  sortCores,
  stepTab,
  suggestedExtensions,
} from './settings.js'

const buttons = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, select: 8, start: 9 }

function data(overrides = {}) {
  return {
    settings: { 'paths.roms': 'games', 'probe.window_seconds': 10, buttons },
    systems: [
      { id: 'arcade', name: 'ARCADE', count: 2, extensions: '', defaultExtensions: 'zip 7z', cores: ['mame', 'fbneo'], coresDefault: true },
      { id: 'nes', name: 'NES', count: 1, extensions: '', defaultExtensions: 'nes', cores: [], coresDefault: false },
    ],
    coreTypes: [{ name: 'Arcade', group: 'Arcade', cores: ['fbneo', 'mame'] }],
    availableCores: [
      { name: 'fbneo', label: 'Arcade (FinalBurn Neo)', types: ['Arcade'], extensions: ['zip'], installed: false, downloadable: true },
      { name: 'mame', label: 'Arcade (MAME)', types: ['Arcade'], extensions: ['zip', '7z'], installed: true, downloadable: true },
      { name: 'nestopia', label: 'NES (Nestopia)', types: ['NES'], extensions: ['nes', 'fds'], installed: false, downloadable: true },
    ],
    coreIndex: { count: 240, fetchedAt: '2026-09-23T10:00:00+00:00', error: null },
    retroarch: { quitCombo: null },
    ...overrides,
  }
}

function opened() {
  let state = reducer(initialState, bootstrapLoaded({ systems: [{ id: 'arcade', name: 'ARCADE', covers: [] }], warnings: [] }))
  state = reducer(state, openSettings())
  return reducer(state, settingsLoaded(data()))
}

describe('stato delle Impostazioni', () => {
  it('bozza, modifiche e corpo del salvataggio', () => {
    let state = opened()
    expect(state.settings.status).toBe('ready')
    expect(isDirty(state.settings)).toBe(false)
    state = reducer(state, coresAdd('nes', ['nestopia', 'mame', 'nestopia']))
    expect(state.settings.draft.systems[1].cores).toEqual(['mame', 'nestopia'])
    expect(isDirty(state.settings)).toBe(true)
    expect(settingsPayload(state.settings)).toEqual({
      settings: data().settings,
      systems: [{ id: 'nes', extensions: '', cores: ['mame', 'nestopia'] }],
    })
    // Tornando alla lista originale non ci sono più modifiche.
    state = reducer(state, coreRemove('nes', 'mame'))
    state = reducer(state, coreRemove('nes', 'nestopia'))
    expect(isDirty(state.settings)).toBe(false)
  })

  it('lista predefinita: si salva come null finché non si modifica', () => {
    let state = opened()
    expect(state.settings.draft.systems[0].coresDefault).toBe(true)
    state = reducer(state, systemChange('arcade', { extensions: 'zip' }))
    expect(settingsPayload(state.settings).systems).toEqual([{ id: 'arcade', extensions: 'zip', cores: null }])
    state = reducer(state, coreRemove('arcade', 'fbneo'))
    expect(state.settings.draft.systems[0]).toMatchObject({ cores: ['mame'], coresDefault: false })
    expect(settingsPayload(state.settings).systems).toEqual([{ id: 'arcade', extensions: 'zip', cores: ['mame'] }])
    // Nessun core da aggiungere: nessuna modifica.
    expect(reducer(opened(), coresAdd('arcade', [])).settings.draft.systems[0].coresDefault).toBe(true)
  })

  it('la tastiera a schermo scrive nel campo della bozza', () => {
    let state = opened()
    state = reducer(state, openKeyboard('field', { value: 'games', max: 200, target: { kind: 'setting', key: 'paths.roms' } }))
    state = reducer(state, oskType('2'))
    state = reducer(state, oskConfirm())
    expect(state.osk).toBeNull()
    expect(state.settings.draft.settings['paths.roms']).toBe('games2')
    state = reducer(state, openKeyboard('field', { value: '10', target: { kind: 'setting', key: 'probe.window_seconds', number: true } }))
    state = reducer(state, oskType('5'))
    state = reducer(state, oskConfirm())
    expect(state.settings.draft.settings['probe.window_seconds']).toBe(105)
    state = reducer(state, openKeyboard('field', { value: '', target: { kind: 'extensions', system: 'nes' } }))
    state = reducer(state, oskType(' nes fds '))
    state = reducer(state, oskConfirm())
    expect(state.settings.draft.systems[1].extensions).toBe('nes fds')
  })

  it('un numero non valido resta testo (lo segnala il backend)', () => {
    let state = opened()
    state = reducer(state, openKeyboard('field', { value: '', target: { kind: 'setting', key: 'probe.window_seconds', number: true } }))
    state = reducer(state, oskType('1a'))
    state = reducer(state, oskConfirm())
    expect(state.settings.draft.settings['probe.window_seconds']).toBe('1a')
  })

  it('ricarica mantenendo la bozza', () => {
    let state = opened()
    state = reducer(state, settingsChange('paths.roms', 'altro'))
    state = reducer(state, coresAdd('nes', ['nestopia']))
    const fresh = data({
      systems: [
        { ...data().systems[0], cores: ['mame', 'fbneo', 'mame2003_plus'] },
        data().systems[1],
        { id: 'snes', name: 'SNES', count: 3, extensions: '', defaultExtensions: 'sfc', cores: [], coresDefault: true },
      ],
    })
    state = reducer(state, settingsLoaded(fresh, true))
    expect(state.settings.draft.settings['paths.roms']).toBe('altro')
    // La lista predefinita segue il backend, quella modificata resta.
    expect(state.settings.draft.systems.map((system) => [system.id, system.cores])).toEqual([
      ['arcade', ['mame', 'fbneo', 'mame2003_plus']],
      ['nes', ['nestopia']],
      ['snes', []],
    ])
    expect(isDirty(state.settings)).toBe(true)
  })

  it('aggiornamento dell’elenco dei core: bozza mantenuta, errore leggibile', () => {
    let state = reducer(opened(), coresAdd('nes', ['nestopia']))
    state = reducer(state, coresRefreshing())
    expect(state.settings.refreshing).toBe(true)
    state = reducer(state, coresRefreshFailed('Elenco dei core non scaricato dal buildbot libretro: rete assente.'))
    expect(state.settings.refreshing).toBe(false)
    expect(state.settings.refreshError).toMatch(/rete assente/)
    state = reducer(state, coresRefreshing())
    state = reducer(state, coresRefreshed(data({ coreIndex: { count: 241, fetchedAt: '2026-09-24T10:00:00+00:00', error: null } })))
    expect(state.settings.refreshing).toBe(false)
    expect(state.settings.refreshError).toBeNull()
    expect(state.settings.coreIndex.count).toBe(241)
    expect(state.settings.draft.systems[1].cores).toEqual(['nestopia'])
  })

  it('ricerca nei menu con la tastiera a schermo', () => {
    let state = opened()
    state = reducer(state, setPickerFilter(''))
    state = reducer(state, openKeyboard('filter', { value: '', max: 40 }))
    state = reducer(state, oskType('ge'))
    expect(state.pickerFilter).toBe('ge')
    state = reducer(state, oskConfirm())
    expect(state.pickerFilter).toBe('ge')
    state = reducer(state, openKeyboard('filter', { value: 'ge', max: 40 }))
    state = reducer(state, oskType('ar'))
    expect(state.pickerFilter).toBe('gear')
    state = reducer(state, oskCancel())
    expect(state.pickerFilter).toBe('ge')
    expect(reducer(state, closeSettings()).pickerFilter).toBe('')
  })

  it('salvataggio: nuovo originale e combinazione aggiornata', () => {
    let state = opened()
    state = reducer(state, settingsSaveFailed('La cartella dei giochi non esiste: /x.'))
    expect(state.settings.saveError).toMatch(/non esiste/)
    const saved = data({ settings: { ...data().settings, 'input.save_combo': ['select', 'rt'] } })
    state = reducer(state, settingsSaved(saved))
    expect(state.settings.saveError).toBeNull()
    expect(state.saveCombo).toEqual(['select', 'rt'])
    expect(isDirty(state.settings)).toBe(false)
  })

  it('chiusura: bozza scartata e ritorno alla libreria', () => {
    let state = reducer(opened(), settingsChange('paths.roms', 'altro'))
    state = reducer(state, closeSettings())
    expect(state.view).toBe('library')
    expect(state.settings).toBeNull()
    // I dati arrivati dopo la chiusura sono ignorati.
    expect(reducer(state, settingsLoaded(data())).settings).toBeNull()
  })

  it('sistemi riletti: giochi da ricaricare', () => {
    let state = reducer(opened(), gamesLoaded('arcade', [{ id: 'a.zip', title: 'a' }]))
    state = reducer(state, systemsLoaded([{ id: 'arcade', name: 'ARCADE', covers: [] }, { id: 'nes', name: 'NES', covers: [] }]))
    expect(state.games).toEqual({})
    expect(state.systemId).toBe('arcade')
    expect(state.systems).toHaveLength(2)
  })

  it('ordine automatico, stato e prontezza dei core', () => {
    const available = availableMap(data().availableCores)
    expect(coreStatus('mame', available)).toBe('installed')
    expect(coreStatus('fbneo', available)).toBe('downloadable')
    expect(coreStatus('sparito', available)).toBe('missing')
    expect(sortCores(['sparito', 'nestopia', 'fbneo', 'mame', 'Atari'], available)).toEqual(['mame', 'fbneo', 'nestopia', 'Atari', 'sparito'])
    expect(addCores(['mame'], ['fbneo', 'mame'], available)).toEqual(['mame', 'fbneo'])
    // Compatibili con RetroAchievements in testa nel loro ordine, se installati o scaricabili.
    expect(sortCores(['sparito', 'nestopia', 'fbneo', 'mame'], available, ['sparito', 'fbneo'])).toEqual(['fbneo', 'mame', 'nestopia', 'sparito'])
    expect(sortCores(['mame', 'fbneo'], available, ['fbneo', 'mame'])).toEqual(['fbneo', 'mame'])
    expect(addCores(['mame'], ['fbneo'], available, ['fbneo'])).toEqual(['fbneo', 'mame'])
    expect(coreSummary(['mame', 'fbneo', 'sparito'], available)).toEqual({ total: 3, installed: 1, ready: true })
    expect(coreSummary(['fbneo'], available)).toEqual({ total: 1, installed: 0, ready: true })
    expect(coreSummary(['sparito'], available)).toEqual({ total: 1, installed: 0, ready: false })
    expect(coreSummary([], available).ready).toBe(false)
  })

  it('estensioni suggerite', () => {
    const available = availableMap(data().availableCores)
    expect(suggestedExtensions({ defaultExtensions: 'nes', cores: ['mame'] }, available)).toBe('nes')
    expect(suggestedExtensions({ defaultExtensions: '', cores: ['nestopia', 'mame', 'fbneo'] }, available)).toBe('nes fds zip 7z')
    expect(suggestedExtensions({ defaultExtensions: '', cores: ['sparito'] }, available)).toBe('')
  })
})

describe('schede delle Impostazioni', () => {
  it('sono nell\'ordine Aspetto, Console, Playlist, Joypad, Configurazioni, Torneo', () => {
    expect(SETTINGS_TABS.map((tab) => tab.id)).toEqual(['look', 'systems', 'playlists', 'pad', 'config', 'tournament'])
  })

  it('LB e RB girano in cerchio', () => {
    expect(stepTab('look', 1)).toBe('systems')
    expect(stepTab('config', 1)).toBe('tournament')
    expect(stepTab('tournament', 1)).toBe('look')
    expect(stepTab('look', -1)).toBe('tournament')
    expect(stepTab('pad', -1)).toBe('playlists')
  })

  it('una scheda sconosciuta parte dalla prima', () => {
    expect(stepTab('sparita', 1)).toBe('systems')
    // Con le schede delle estensioni in coda.
    const tabs = [{ id: 'look' }, { id: 'tournament' }, { id: 'shared-saves' }]
    expect(stepTab('tournament', 1, tabs)).toBe('shared-saves')
    expect(stepTab('shared-saves', 1, tabs)).toBe('look')
  })
})

describe('processore al massimo', () => {
  it('nota con lo stato dello script e il governor', () => {
    expect(cpuNote({ ready: false, governor: 'schedutil' })).toContain('manca lo script di sistema')
    expect(cpuNote({ ready: true, governor: 'schedutil' })).toContain('Ora: schedutil')
    expect(cpuNote({ ready: true, governor: null })).not.toContain('Ora:')
  })
})
