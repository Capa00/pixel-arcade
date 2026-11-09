import { describe, expect, it } from 'vitest'
import { DEFAULT_SOUND, EFFECT_NAMES, compose, inputSound, play, seeded, setLevels, setMusic, soundLevels, trackSong, volumeLabel } from './sound.js'

describe('volumi', () => {
  it('scrive spento o la percentuale', () => {
    expect(volumeLabel(0)).toBe('Spento')
    expect(volumeLabel(75)).toBe('75%')
  })

  it('usa la bozza solo nelle Impostazioni', () => {
    const sound = { on: true, effects: 50, music: 25 }
    const settings = { draft: { settings: { 'ui.sound': false, 'ui.sound_effects': 100, 'ui.sound_music': 0 } } }
    expect(soundLevels({ sound, view: 'library', settings })).toEqual(sound)
    expect(soundLevels({ sound, view: 'settings', settings })).toEqual({ on: false, effects: 100, music: 0 })
    expect(soundLevels({ view: 'library', settings: null })).toEqual(DEFAULT_SOUND)
  })
})

describe('tasti', () => {
  it('associa i comandi agli effetti', () => {
    expect(inputSound({ kind: 'press', button: 'up' })).toBe('move')
    expect(inputSound({ kind: 'repeat', button: 'left' })).toBe('move')
    expect(inputSound({ kind: 'press', button: 'rt' })).toBe('move')
    expect(inputSound({ kind: 'press', button: 'a' })).toBe('confirm')
    expect(inputSound({ kind: 'press', button: 'b' })).toBe('back')
    expect(inputSound({ kind: 'press', button: 'lb' })).toBe('tab')
    expect(inputSound({ kind: 'repeat', button: 'a' })).toBeNull()
    expect(inputSound({ kind: 'release', button: 'a' })).toBeNull()
    expect(inputSound({ kind: 'press', button: 'y' })).toBeNull()
    expect(inputSound({ kind: 'press', button: 'start' })).toBeNull()
    expect(inputSound({ kind: 'text', button: 'a' })).toBeNull()
  })
})

describe('composizione', () => {
  it('stesso seme, stessa sequenza', () => {
    const a = seeded('nes')
    const b = seeded('nes')
    const c = seeded('snes')
    const first = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(first)
    expect([c(), c(), c()]).not.toEqual(first)
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true)
  })

  it('compone 8 battute con melodia, basso, arpeggio e batteria', () => {
    const song = compose('system:nes')
    expect(song.steps).toBe(128)
    expect(song.bpm).toBeGreaterThanOrEqual(100)
    expect(song.bpm).toBeLessThanOrEqual(140)
    for (const voice of ['lead', 'bass', 'arp']) {
      expect(song.notes.some((note) => note.voice === voice)).toBe(true)
    }
    expect(song.drums.length).toBeGreaterThan(0)
    expect(song.notes.every((note) => note.step >= 0 && note.step < 128 && note.len >= 1)).toBe(true)
    expect(song.notes.every((note) => note.midi >= 24 && note.midi <= 100)).toBe(true)
    expect(compose('system:nes')).toEqual(song)
  })

  it('la ripresa ripete la melodia e chiude sulla tonica', () => {
    const song = compose('system:megadrive')
    const lead = song.notes.filter((note) => note.voice === 'lead')
    const first = lead.filter((note) => note.step < 64)
    const second = lead.filter((note) => note.step >= 64)
    expect(second.length).toBe(first.length)
    expect(second.slice(0, -1).map((note) => note.midi)).toEqual(first.slice(0, -1).map((note) => note.midi))
    expect(second.at(-1).midi % 12).toBe(song.root % 12)
  })

  it('forza modo e tempo dei sottofondi speciali', () => {
    expect(trackSong('wrapped').bpm).toBe(138)
    expect(trackSong('title').bpm).toBe(112)
    expect(trackSong('system:nes')).toEqual(compose('system:nes'))
  })
})

describe('motore senza Web Audio', () => {
  it('non fa nulla e non lancia errori', () => {
    setLevels({ on: true, effects: 100, music: 100 })
    for (const name of EFFECT_NAMES) {
      expect(() => play(name)).not.toThrow()
    }
    expect(() => play('sconosciuto')).not.toThrow()
    expect(() => setMusic('title')).not.toThrow()
    expect(() => setMusic(null)).not.toThrow()
  })
})
