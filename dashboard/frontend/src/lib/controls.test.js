import { describe, expect, it } from 'vitest'
import {
  PAD_TO_RETROPAD,
  assignButton,
  changedMap,
  controlPlayers,
  controlRows,
  controlsDraft,
  draftChanged,
  mapChanged,
  presentPlayers,
  rowTitle,
  setLabel,
} from './controls.js'

const EDITABLE = ['b', 'a', 'y', 'x', 'l', 'r', 'l2', 'r2']
const FIXED = ['select', 'start', 'l3', 'r3']
const identity = () => Object.fromEntries(EDITABLE.map((button) => [button, button]))

// Come `GET /api/game/controls` per Tekken 3 con PCSX ReARMed.
function tekken(map = {}) {
  return {
    core: 'pcsx_rearmed',
    descriptors: {
      p1: { b: 'Cross', a: 'Circle', y: 'Square', x: 'Triangle', l: 'L1', r: 'R1', start: 'Start', select: 'Select' },
      p2: { b: 'Cross' },
    },
    labels: { p1: { b: 'Calcio basso' } },
    map: { p1: { ...identity(), ...map }, p2: identity() },
    confirmed: false,
    editable: EDITABLE,
    fixed: FIXED,
  }
}

describe('controls', () => {
  it('giocatori con dei nomi', () => {
    expect(controlPlayers(tekken())).toEqual(['p1', 'p2'])
    expect(controlPlayers({ descriptors: { p1: {} } })).toEqual([])
    expect(controlPlayers(null)).toEqual([])
    // P2 non presente: niente scheda anche se il core dà i nomi della porta 2.
    expect(controlPlayers(tekken(), ['p1'])).toEqual(['p1'])
  })

  it('giocatori presenti nella libreria', () => {
    expect(presentPlayers({ p1: { user: null }, p2: { user: null } })).toEqual(['p1'])
    expect(presentPlayers({ p1: { user: { id: 1 } }, p2: { user: null } })).toEqual(['p1'])
    expect(presentPlayers({ p1: { user: { id: 1 } }, p2: { user: { guest: true } } })).toEqual(['p1', 'p2'])
  })

  it('righe: prima le azioni riassegnabili, poi quelle fisse', () => {
    const controls = tekken({ b: 'a', a: 'b' })
    const rows = controlRows(controls, controlsDraft(controls), 'p1')
    expect(rows.map((row) => row.action)).toEqual(['b', 'a', 'y', 'x', 'l', 'r', 'select', 'start'])
    expect(rows[0]).toEqual({ action: 'b', name: 'Cross', label: 'Calcio basso', button: 'a', editable: true })
    expect(rows[1].button).toBe('b')
    expect(rows[6]).toEqual({ action: 'select', name: 'Select', label: '', button: 'select', editable: false })
    expect(rowTitle(rows[0])).toBe('Calcio basso')
    expect(rowTitle(rows[1])).toBe('Circle')
  })

  it('assegnare un tasto scambia le due azioni', () => {
    const controls = tekken()
    const draft = assignButton(controlsDraft(controls), 'p1', 'b', 'l2')
    expect(draft.map.p1.b).toBe('l2')
    expect(draft.map.p1.l2).toBe('b')
    expect(draft.map.p2).toEqual(identity())
    // Lo stesso tasto o un tasto non riassegnabile non cambiano nulla.
    expect(assignButton(draft, 'p1', 'b', 'l2')).toBe(draft)
    expect(assignButton(draft, 'p1', 'b', 'start')).toBe(draft)
    // Tornare al tasto di partenza ripristina entrambe.
    const back = assignButton(draft, 'p1', 'b', 'b')
    expect(back.map.p1).toEqual(identity())
    expect(changedMap(draft)).toEqual({ p1: { b: 'l2', l2: 'b' } })
    expect(changedMap(back)).toEqual({})
  })

  it('tasti della dashboard verso il RetroPad', () => {
    expect(PAD_TO_RETROPAD.a).toBe('b')
    expect(PAD_TO_RETROPAD.y).toBe('x')
    expect(PAD_TO_RETROPAD.rt).toBe('r2')
    expect(PAD_TO_RETROPAD.start).toBeUndefined()
  })

  it('nomi scritti a mano', () => {
    const controls = tekken()
    let draft = setLabel(controlsDraft(controls), 'p1', 'a', '  Pugno   alto ')
    expect(draft.labels.p1).toEqual({ b: 'Calcio basso', a: 'Pugno alto' })
    draft = setLabel(draft, 'p1', 'b', '')
    expect(draft.labels.p1).toEqual({ a: 'Pugno alto' })
    expect(setLabel(draft, 'p2', 'b', 'x'.repeat(40)).labels.p2.b).toHaveLength(24)
  })

  it('modifiche rispetto al salvato', () => {
    const controls = tekken({ l: 'r', r: 'l' })
    const draft = controlsDraft(controls)
    expect(mapChanged(controls, draft)).toBe(false)
    expect(draftChanged(controls, draft)).toBe(false)
    const named = setLabel(draft, 'p2', 'b', 'Salta')
    expect(mapChanged(controls, named)).toBe(false)
    expect(draftChanged(controls, named)).toBe(true)
    const swapped = assignButton(draft, 'p1', 'l', 'l')
    expect(mapChanged(controls, swapped)).toBe(true)
  })
})
