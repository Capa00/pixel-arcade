import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addonConsoles,
  addonSettingsTabs,
  availableItems,
  collect,
  commandButton,
  commandId,
  commandKeys,
  holdCommands,
  mergeLegends,
} from './registry.js'

const BASE = {
  library: [{ id: 'a', label: 'Seleziona' }],
  players: [{ id: 'a', label: 'Seleziona' }],
  login: [{ id: 'b', label: 'Annulla' }],
}

const run = () => {}

const FAKE = {
  id: 'fake',
  commands: (state) => (state.on ? [{ id: 'fake.open', hold: { button: 'x', ms: 1000 }, key: 'G', run }] : []),
  legends: {
    library: [{ id: 'fake', label: 'Apri', command: 'cmd:fake.open' }],
    contexts: { fakeModal: [{ id: 'b', label: 'Chiudi' }], login: [{ id: 'z', label: 'Altro' }] },
  },
}

describe('collect', () => {
  afterEach(() => vi.restoreAllMocks())

  it('registro vuoto', () => {
    expect(collect({})).toEqual([])
    expect(collect(undefined)).toEqual([])
  })

  it('ordina per id e scarta i moduli senza id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const other = { id: 'alpha' }
    const result = collect({ './fake/index.jsx': FAKE, './broken/index.jsx': {}, './alpha/index.jsx': other })
    expect(result).toEqual([other, FAKE])
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('holdCommands', () => {
  it('comandi solo quando l\'estensione li offre, con l\'addon di provenienza', () => {
    expect(holdCommands([], { on: true })).toEqual([])
    expect(holdCommands([FAKE, { id: 'plain' }], { on: false })).toEqual([])
    const [command] = holdCommands([FAKE], { on: true })
    expect(command).toMatchObject({ id: 'fake.open', addon: 'fake', run })
  })
})

describe('addonConsoles', () => {
  it('console delle estensioni con l\'addon di provenienza, senza quelle senza id', () => {
    expect(addonConsoles([FAKE])).toEqual([])
    const withConsole = { id: 'box', consoles: [{ id: 'cube', name: 'CUBE', accent: '#123456' }, { name: 'X' }] }
    expect(addonConsoles([FAKE, withConsole])).toEqual([{ id: 'cube', name: 'CUBE', accent: '#123456', addon: 'box' }])
  })
})

describe('addonSettingsTabs', () => {
  it('schede delle Impostazioni con l\'addon di provenienza, solo se complete', () => {
    const Tab = () => null
    const withTab = { id: 'box', settingsTab: { id: 'box-tab', label: 'Box', Tab } }
    const broken = { id: 'rotto', settingsTab: { id: 'x', label: 'X' } }
    expect(addonSettingsTabs([FAKE, withTab, broken])).toEqual([{ id: 'box-tab', label: 'Box', Tab, addon: 'box' }])
  })
})

describe('mergeLegends', () => {
  it('senza estensioni restituisce le stesse legende', () => {
    expect(mergeLegends(BASE, [])).toEqual(BASE)
  })

  it('aggiunge contesti e voci della libreria senza duplicati', () => {
    const merged = mergeLegends(BASE, [FAKE, FAKE])
    expect(merged.library.map((item) => item.id)).toEqual(['a', 'fake'])
    expect(merged.players.map((item) => item.id)).toEqual(['a', 'fake'])
    expect(merged.fakeModal).toEqual(FAKE.legends.contexts.fakeModal)
    // Un contesto esistente non viene sostituito.
    expect(merged.login).toBe(BASE.login)
    expect(BASE.library).toHaveLength(1)
  })
})

describe('comandi', () => {
  it('tasto logico e id', () => {
    expect(commandButton('fake.open')).toBe('cmd:fake.open')
    expect(commandId('cmd:fake.open')).toBe('fake.open')
    expect(commandId('x')).toBeNull()
    expect(commandId(undefined)).toBeNull()
  })

  it('tasti della tastiera in minuscolo', () => {
    expect(commandKeys(holdCommands([FAKE], { on: true }))).toEqual({ g: 'cmd:fake.open' })
    expect(commandKeys([])).toEqual({})
  })

  it('voci della legenda solo per i comandi disponibili', () => {
    const items = mergeLegends(BASE, [FAKE]).library
    expect(availableItems(items, []).map((item) => item.id)).toEqual(['a'])
    const commands = holdCommands([FAKE], { on: true })
    expect(availableItems(items, commands).map((item) => item.id)).toEqual(['a', 'fake'])
  })
})
