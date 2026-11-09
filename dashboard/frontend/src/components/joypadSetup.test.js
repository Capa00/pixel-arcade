import { describe, expect, it } from 'vitest'
import {
  LINK_MS,
  PAD_STEPS,
  SETUP_STEPS,
  chromeButtons,
  chromePadOf,
  dashboardButtons,
  dashboardError,
  findDevice,
  initialLink,
  initialSetup,
  linkForget,
  linkPress,
  linkToken,
  currentBinds,
  replaceBind,
  replaceDashboard,
  padIds,
  retropadKey,
  setupBack,
  setupDone,
  setupPress,
  tokenLabel,
} from './joypadSetup.js'

function pressAll(tokens) {
  return tokens.reduce((setup, token) => setupPress(setup, token), initialSetup())
}

describe('setupPress', () => {
  it('impara i tasti in ordine', () => {
    const setup = pressAll(['b2', 'b1'])
    expect(setup.step).toBe(2)
    expect(setup.binds).toEqual({ b: 'b2', a: 'b1' })
  })

  it('rifiuta i doppioni', () => {
    const setup = pressAll(['b2', 'b1', 'b1'])
    expect(setup.step).toBe(2)
    expect(setup.message).toBe('Tasto già usato per Tasto a destra.')
  })

  it('salta i facoltativi con il tasto in basso, non gli obbligatori', () => {
    let setup = pressAll(['b2', 'b1', 'b2'])
    expect(setup.step).toBe(3)
    expect(setup.binds.y).toBeUndefined()
    expect(setup.message).toMatch(/saltato/)
    setup = pressAll(['b2', 'b1', 'b3', 'b0', 'b4', 'b5', 'b6', 'b7', 'b2', 'b2'])
    expect(SETUP_STEPS[setup.step].key).toBe('select')
    setup = setupPress(setup, 'b2')
    expect(SETUP_STEPS[setup.step].key).toBe('select')
    expect(setup.message).toMatch(/obbligatorio/)
  })

  it('arriva alla fine e accetta assi e cappelli', () => {
    let setup = pressAll(['b0', 'b1', 'b2', 'b3', '+4', '+5', 'b9', 'b10', 'b4', 'b6',
      'h0up', 'h0down', '-0', '+0'])
    expect(SETUP_STEPS[setup.step].key).toBe('l3')
    setup = ['b0', 'b11', '-1', '+1', '-0'].reduce((current, token) => setupPress(current, token), setup)
    expect(setup.message).toMatch(/già usato/)
    setup = ['-2', '+2', '-3', '+3'].reduce((current, token) => setupPress(current, token), setup)
    expect(setup.binds).toMatchObject({ r3: 'b11', l_y_minus: '-1', l_y_plus: '+1', l_x_minus: '-2', l_x_plus: '+2' })
    setup = setupPress(setup, 'b6')
    expect(setupDone(setup)).toBe(true)
    expect(setup.binds.l).toBe('+4')
    expect(setup.binds.up).toBe('h0up')
    expect(setup.binds.l3).toBeUndefined()
    expect(setup.binds.r_x_plus).toBeUndefined()
    expect(setupPress(setup, 'b20')).toBe(setup)
  })

  it('tra le levette START finisce, prima no', () => {
    let setup = pressAll(['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9'])
    expect(setupPress(setup, 'b9').message).toMatch(/già usato/)
    setup = ['b12', 'b13', 'b14', 'b15'].reduce((current, token) => setupPress(current, token), setup)
    expect(SETUP_STEPS[setup.step].stick).toBe(true)
    setup = setupPress(setup, 'b9')
    expect(setupDone(setup)).toBe(true)
    expect(setup.message).toBe('Levette saltate.')
  })

  it('torna indietro', () => {
    const setup = setupBack(pressAll(['b2', 'b1']))
    expect(setup.step).toBe(1)
    expect(setup.binds).toEqual({ b: 'b2' })
    expect(setupBack(initialSetup())).toEqual(initialSetup())
  })
})

describe('joypad', () => {
  it('legge gli id USB dal nome di Chrome', () => {
    expect(padIds('Microntek USB Joystick (Vendor: 0078 Product: 0006)')).toEqual({ vendor: 120, product: 6 })
    expect(padIds('Xbox (STANDARD GAMEPAD Vendor: 045e Product: 028e)')).toEqual({ vendor: 0x45e, product: 0x28e })
    expect(padIds('Joypad senza id')).toBeNull()
    expect(padIds(undefined)).toBeNull()
  })

  it('trova il joypad di RetroArch', () => {
    const devices = [{ vendor: 120, product: 6, name: 'A' }, { vendor: 121, product: 6, name: 'B' }]
    expect(findDevice(devices, { vendor: 121, product: 6 }).name).toBe('B')
    expect(findDevice(devices, { vendor: 1, product: 6 })).toBeNull()
    expect(findDevice(devices, null)).toBeNull()
  })

  it('traduce un token nel tasto del RetroPad', () => {
    expect(retropadKey({ b: 'b2', a: 'b1' }, 'b1')).toBe('a')
    expect(retropadKey({ up: ['-1'], l: ['+4'] }, '+4')).toBe('l')
    expect(retropadKey({ b: 'b2' }, 'b9')).toBeNull()
  })

  it('descrive i token', () => {
    expect(tokenLabel('b3')).toBe('tasto 3')
    expect(tokenLabel('-1')).toBe('asse 1 −')
    expect(tokenLabel('h0left')).toBe('cappello 0 sinistra')
    expect(tokenLabel(null)).toBe('—')
  })
})

describe('tasti della dashboard', () => {
  it('abbina il tasto visto dal browser a quello imparato da RetroArch, in qualunque ordine', () => {
    let link = linkToken(linkPress(initialLink(), 0, 100), 'b', 150)
    link = linkPress(linkToken(link, 'a', 2000), 1, 2050)
    expect(link.chrome).toEqual({ b: 0, a: 1 })
    expect(dashboardButtons(link.chrome)).toEqual({ a: 0, b: 1 })
  })

  it('dimentica le pressioni vecchie, saltate o già abbinate', () => {
    let link = linkToken(linkPress(initialLink(), 3, 0), 'y', LINK_MS + 1)
    expect(link.chrome).toEqual({})
    link = linkToken(linkPress(initialLink(), 3, 0), null, 10)
    expect(linkToken(link, 'x', 20).chrome).toEqual({})
    link = linkPress(linkToken(linkPress(initialLink(), 0, 0), 'b', 10), 0, 20)
    expect(link.last).toBeNull()
    expect(linkToken(link, 'up', 30).chrome).toEqual({ b: 0 })
    expect(linkForget(link, 'b').chrome).toEqual({})
  })

  it('senza RetroArch chiede solo i tasti della dashboard', () => {
    expect(PAD_STEPS.map((step) => step.key)).toEqual(['b', 'a', 'y', 'x', 'l', 'r', 'l2', 'r2', 'select', 'start',
      'up', 'down', 'left', 'right', 'l_y_minus', 'l_y_plus', 'l_x_minus', 'l_x_plus'])
    const setup = ['b0', 'b1', 'b0', 'b0', 'b0', 'b0', '+5', 'b0', 'b8', 'b9', 'b12', 'b13', 'b14', 'b15', '-1', 'b9']
      .reduce((current, token) => setupPress(current, token, PAD_STEPS), initialSetup())
    expect(setupDone(setup, PAD_STEPS)).toBe(true)
    expect(chromeButtons(setup.binds)).toEqual({ a: 0, b: 1, lt: '+5', select: 8, start: 9, up: 12, down: 13,
      left: 14, right: 15, ls_up: '-1' })
  })

  it('segnala i tasti obbligatori mancanti', () => {
    expect(dashboardError({ a: 0, b: 1, select: 8, start: 9 })).toBeNull()
    expect(dashboardError({ a: 0, b: 1, select: 8 })).toMatch(/START/)
  })

  it('trova il joypad del browser con gli stessi id USB', () => {
    const gamepads = [null, { index: 1, id: 'Pad (STANDARD GAMEPAD Vendor: 0079 Product: 0006)' }]
    expect(chromePadOf(gamepads, { vendor: 0x79, product: 6 })).toEqual(gamepads[1])
    expect(chromePadOf(gamepads, { vendor: 1, product: 6 })).toBeNull()
  })
})

describe('un solo tasto', () => {
  it('cambia il tasto scelto, rifiuta quelli di altri tasti', () => {
    const binds = currentBinds({ b: ['b0'], a: ['b1', '+3'], start: ['b9'] })
    expect(binds).toEqual({ b: 'b0', a: 'b1', start: 'b9' })
    expect(replaceBind(binds, 'a', 'b2').binds).toEqual({ b: 'b0', a: 'b2', start: 'b9' })
    expect(replaceBind(binds, 'a', 'b1')).toEqual({ same: true })
    expect(replaceBind(binds, 'a', 'b9').error).toMatch(/START/)
  })

  it('tasti della dashboard: il nuovo tasto passa al tasto scelto', () => {
    const buttons = { a: 0, b: 1, select: 8, start: 9 }
    expect(replaceDashboard(buttons, 'a', 2)).toEqual({ a: 0, b: 2, select: 8, start: 9 })
    expect(replaceDashboard(buttons, 'up', '-1')).toEqual({ ...buttons, up: '-1' })
    expect(replaceDashboard(buttons, 'x', 1)).toEqual({ a: 0, y: 1, select: 8, start: 9 })
    expect(replaceDashboard(buttons, 'l3', 4)).toBe(buttons)
  })
})
