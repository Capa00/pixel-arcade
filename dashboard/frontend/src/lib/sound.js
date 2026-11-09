/**
 * Suoni della dashboard: effetti chiptune e musica di sottofondo, sintetizzati
 * con la Web Audio API (nessun file audio).
 *
 * Le parti pure (composizione dei brani, tasto → effetto, volumi) si provano
 * nei test; il motore (`play`, `setMusic`, `setLevels`) non fa nulla dove la
 * Web Audio API manca, per esempio nei test.
 *
 * Chrome sblocca l'audio solo dopo un clic o un tasto della tastiera: la
 * dashboard lo avvia con `--autoplay-policy=no-user-gesture-required`
 * (backend `app.BROWSER_FLAGS`); senza, `unlock` riprova al primo gesto.
 */

/** Volumi di effetti e musica in percentuale, come `config.VOLUMES` del backend; 0 = spento. */
export const VOLUMES = [0, 25, 50, 75, 100]
export const DEFAULT_SOUND = { on: true, effects: 75, music: 50 }

/** Testo di un volume: «Spento» o «75%». */
export function volumeLabel(volume) {
  return volume ? `${volume}%` : 'Spento'
}

/**
 * Suoni in uso: `{on, effects, music}`. Nelle Impostazioni vale la bozza,
 * così le modifiche si sentono prima di «Salva» (come il tema grafico).
 */
export function soundLevels(state) {
  const saved = state.sound || DEFAULT_SOUND
  const draft = state.view === 'settings' && state.settings && state.settings.draft
    ? state.settings.draft.settings
    : null
  if (!draft) {
    return saved
  }
  return {
    on: draft['ui.sound'] ?? saved.on,
    effects: draft['ui.sound_effects'] ?? saved.effects,
    music: draft['ui.sound_music'] ?? saved.music,
  }
}

const MOVES = new Set(['up', 'down', 'left', 'right', 'lt', 'rt'])

/**
 * Effetto di un comando della dashboard (evento di src/input/), oppure
 * `null`: direzioni e LT/RT = `move` (anche tenuti), A = `confirm`, B =
 * `back`, LB/RB = `tab`, X = `confirm`. Y (preferito) suona dal cambio del preferito;
 * START e SELECT suonano solo con la schermata che aprono.
 */
export function inputSound(event) {
  if (event.kind !== 'press' && event.kind !== 'repeat') {
    return null
  }
  if (MOVES.has(event.button)) {
    return 'move'
  }
  if (event.kind !== 'press') {
    return null
  }
  return { a: 'confirm', b: 'back', x: 'confirm', lb: 'tab', rb: 'tab' }[event.button] || null
}

// --- Composizione ------------------------------------------------------------

/** Generatore pseudocasuale da un testo: stesso testo, stessa sequenza (0 ≤ n < 1). */
export function seeded(text) {
  let hash = 2166136261
  for (const char of String(text)) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  }
  let value = hash >>> 0
  return () => {
    value = (value + 0x6d2b79f5) >>> 0
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickFrom(random, list) {
  return list[Math.floor(random() * list.length)]
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const MINOR = [0, 2, 3, 5, 7, 8, 10]
// Giri di accordi come gradi della scala (0 = primo grado).
const PROGRESSIONS = {
  major: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 4, 2, 5], [0, 3, 1, 4], [0, 3, 4, 4]],
  minor: [[0, 5, 2, 6], [0, 3, 6, 2], [0, 6, 5, 6], [0, 3, 4, 0], [0, 5, 3, 4]],
}
// Tonica del brano (MIDI, ottava della melodia).
const ROOTS = [60, 62, 64, 65, 67, 57, 59]
// Basso: 1 = fondamentale, 5 = quinta, 8 = ottava, su 16 sedicesimi.
const BASS = [
  [1, 0, 0, 0, 8, 0, 0, 0, 1, 0, 0, 0, 8, 0, 0, 0],
  [1, 0, 1, 0, 5, 0, 1, 0, 1, 0, 1, 0, 5, 0, 8, 0],
  [1, 0, 0, 1, 0, 0, 5, 0, 1, 0, 0, 1, 0, 0, 8, 0],
  [1, 0, 8, 0, 1, 0, 8, 0, 1, 0, 8, 0, 5, 0, 8, 0],
]
// Batteria: k = cassa, s = rullante, h = charleston.
const DRUMS = [
  'k.h.s.h.k.h.s.h.',
  'k.hhs.h.kkh.s.hh',
  'k...s..hk.k.s...',
  'k.h.s.hkk.h.s.h.',
]
// Ritmi della melodia: x = nota, - = prolunga la precedente, . = pausa.
const RHYTHMS = [
  'x-x-x---x-x-x---',
  'x--x--x-x-x-x---',
  'x-.xx-.xx---x-x-',
  'x---x-x-x---x-.x',
  'x-xxx-x-x-x---..',
]

function scaleNote(root, scale, degree) {
  const octave = Math.floor(degree / scale.length)
  const index = ((degree % scale.length) + scale.length) % scale.length
  return root + 12 * octave + scale[index]
}

function chordDegrees(degree) {
  return [degree, degree + 2, degree + 4]
}

/**
 * Brano chiptune di 8 battute da un seme (per esempio l'id della console):
 * `{bpm, root, steps, notes: [{step, len, midi, voice}], drums: [{step, kind}]}` (`root` è la tonica, MIDI).
 * Un passo è un sedicesimo; `voice` è `lead`, `bass` o `arp`.
 * `options.mode` (`major`/`minor`) e `options.bpm` forzano modo e tempo.
 * La melodia ha forma A A' (le ultime battute ripetono le prime e chiudono sulla tonica).
 */
export function compose(seed, options = {}) {
  const random = seeded(seed)
  const mode = options.mode || (random() < 0.5 ? 'major' : 'minor')
  const scale = mode === 'major' ? MAJOR : MINOR
  const root = pickFrom(random, ROOTS)
  const bpm = options.bpm || 100 + Math.floor(random() * 9) * 5
  const progression = pickFrom(random, PROGRESSIONS[mode])
  const bass = pickFrom(random, BASS)
  const drums = pickFrom(random, DRUMS)
  const arpUp = random() < 0.5
  const notes = []
  const beats = []
  const bars = 8
  // Melodia delle prime quattro battute, ripetuta nelle ultime quattro.
  const melody = []
  let degree = 7
  for (let bar = 0; bar < 4; bar += 1) {
    const chord = chordDegrees(progression[bar])
    const rhythm = pickFrom(random, RHYTHMS)
    for (let step = 0; step < 16; step += 1) {
      if (rhythm[step] !== 'x') {
        continue
      }
      let len = 1
      while (step + len < 16 && rhythm[step + len] === '-') {
        len += 1
      }
      if (step % 4 === 0) {
        // Sui tempi forti una nota dell'accordo, la più vicina alla precedente.
        const targets = chord.flatMap((value) => [value + 7, value + 14]).filter((value) => value >= 4 && value <= 16)
        degree = targets.reduce((best, value) => (Math.abs(value - degree) < Math.abs(best - degree) ? value : best), targets[0])
      } else {
        degree = Math.max(4, Math.min(16, degree + pickFrom(random, [-2, -1, -1, 1, 1, 2])))
      }
      melody.push({ bar, step, len, degree })
    }
  }
  for (let bar = 0; bar < bars; bar += 1) {
    const chordRoot = progression[bar % 4]
    const base = 16 * bar
    const bassRoot = scaleNote(root - 24, scale, chordRoot)
    bass.forEach((kind, step) => {
      if (kind) {
        const midi = kind === 1 ? bassRoot : kind === 5 ? scaleNote(root - 24, scale, chordRoot + 4) : bassRoot + 12
        notes.push({ step: base + step, len: 2, midi, voice: 'bass' })
      }
    })
    const chord = chordDegrees(chordRoot).map((value) => scaleNote(root, scale, value))
    const arp = arpUp ? [...chord, chord[0] + 12] : [chord[0] + 12, ...chord.slice().reverse()]
    for (let step = 0; step < 16; step += 2) {
      notes.push({ step: base + step, len: 1, midi: arp[(step / 2) % arp.length], voice: 'arp' })
    }
    for (let step = 0; step < 16; step += 1) {
      const kind = { k: 'kick', s: 'snare', h: 'hat' }[drums[step]]
      if (kind) {
        beats.push({ step: base + step, kind })
      }
    }
  }
  const last = melody.length - 1
  melody.forEach((note, index) => {
    notes.push({ step: 16 * note.bar + note.step, len: note.len, midi: scaleNote(root, scale, note.degree), voice: 'lead' })
    // Ripresa: uguale, salvo l'ultima nota che torna alla tonica.
    const degree = index === last ? 7 : note.degree
    notes.push({ step: 16 * (note.bar + 4) + note.step, len: note.len, midi: scaleNote(root, scale, degree), voice: 'lead' })
  })
  notes.sort((a, b) => a.step - b.step)
  return { bpm, root, steps: 16 * bars, notes, drums: beats }
}

/** Brano di un sottofondo: `title` (schermata iniziale), `wrapped` o `system:<id>` (console). */
export function trackSong(id) {
  if (id === 'wrapped') {
    return compose('wrapped-party', { mode: 'major', bpm: 138 })
  }
  if (id === 'title') {
    return compose('pixel-arcade', { mode: 'major', bpm: 112 })
  }
  return compose(id)
}

// --- Motore ------------------------------------------------------------------

// Volume massimo di effetti e musica (il volume scelto lo riduce).
const EFFECTS_GAIN = 0.32
const MUSIC_GAIN = 0.22
// Dissolvenza tra un brano e l'altro (s) e anticipo della programmazione delle note.
const FADE_S = 0.6
const LOOKAHEAD_S = 0.15
const TICK_MS = 40
// Intervallo minimo tra due «move» (ms): una direzione tenuta non diventa un ronzio.
const MOVE_GAP_MS = 45

let engine = null
let levels = DEFAULT_SOUND
let wantedTrack = null
let current = null
let lastMove = 0

function createEngine() {
  const Context = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null
  if (!Context) {
    return null
  }
  try {
    const ctx = new Context()
    const effects = ctx.createGain()
    const music = ctx.createGain()
    effects.connect(ctx.destination)
    music.connect(ctx.destination)
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const samples = noise.getChannelData(0)
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.random() * 2 - 1
    }
    return { ctx, effects, music, noise, waves: {} }
  } catch {
    return null
  }
}

function getEngine() {
  if (!engine) {
    engine = createEngine()
    applyLevels()
  }
  return engine
}

// Onda quadra con duty cycle `duty` (0.5 = quadra), come i canali pulse del NES.
function pulseWave(duty) {
  const key = `pulse${duty}`
  if (!engine.waves[key]) {
    const size = 32
    const real = new Float32Array(size)
    const imag = new Float32Array(size)
    for (let n = 1; n < size; n += 1) {
      imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty)
    }
    engine.waves[key] = engine.ctx.createPeriodicWave(real, imag)
  }
  return engine.waves[key]
}

function midiHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12)
}

/**
 * Nota sintetizzata: `wave` è `triangle`, `sine` o un duty (`0.125`, `0.25`, `0.5`).
 * `slide` è la frequenza d'arrivo; `decay` vero fa sfumare la nota fino alla fine.
 */
function tone(out, at, { hz, dur, wave = 0.5, gain = 0.3, slide = null, decay = true }) {
  const { ctx } = engine
  const osc = ctx.createOscillator()
  if (typeof wave === 'number') {
    osc.setPeriodicWave(pulseWave(wave))
  } else {
    osc.type = wave
  }
  osc.frequency.setValueAtTime(hz, at)
  if (slide) {
    osc.frequency.exponentialRampToValueAtTime(slide, at + dur)
  }
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0, at)
  amp.gain.linearRampToValueAtTime(gain, at + 0.004)
  if (decay) {
    amp.gain.exponentialRampToValueAtTime(0.001, at + dur)
  } else {
    amp.gain.setValueAtTime(gain, at + Math.max(0.005, dur - 0.02))
    amp.gain.linearRampToValueAtTime(0, at + dur)
  }
  osc.connect(amp)
  amp.connect(out)
  osc.start(at)
  osc.stop(at + dur + 0.02)
}

function noise(out, at, { dur, gain = 0.2, filter = 'highpass', hz = 6000, sweep = null }) {
  const { ctx } = engine
  const source = ctx.createBufferSource()
  source.buffer = engine.noise
  const band = ctx.createBiquadFilter()
  band.type = filter
  band.frequency.setValueAtTime(hz, at)
  if (sweep) {
    band.frequency.exponentialRampToValueAtTime(sweep, at + dur)
  }
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(gain, at)
  amp.gain.exponentialRampToValueAtTime(0.001, at + dur)
  source.connect(band)
  band.connect(amp)
  amp.connect(out)
  source.start(at, Math.random() * 0.5)
  source.stop(at + dur + 0.02)
}

// Note in fila: `[hz, durata]` una dopo l'altra, dal momento `at`.
function run(out, at, steps, options = {}) {
  let time = at
  for (const [hz, dur] of steps) {
    tone(out, time, { hz, dur: dur * (options.hold || 1), ...options })
    time += dur
  }
}

const N = (midi) => midiHz(midi)

/** Effetti disponibili: nome → funzione che li suona dal momento `at`. */
const EFFECTS = {
  move: (out, at) => tone(out, at, { hz: 1320, dur: 0.03, wave: 0.25, gain: 0.12 }),
  confirm: (out, at) => run(out, at, [[N(76), 0.05], [N(83), 0.08]], { wave: 0.25, gain: 0.18 }),
  back: (out, at) => tone(out, at, { hz: N(72), slide: N(60), dur: 0.11, wave: 0.5, gain: 0.14 }),
  tab: (out, at) => {
    tone(out, at, { hz: N(64), slide: N(76), dur: 0.09, wave: 'triangle', gain: 0.35 })
    tone(out, at + 0.05, { hz: N(88), dur: 0.05, wave: 0.125, gain: 0.08 })
  },
  favOn: (out, at) => run(out, at, [[N(79), 0.045], [N(83), 0.045], [N(86), 0.045], [N(91), 0.12]], { wave: 0.25, gain: 0.16 }),
  favOff: (out, at) => run(out, at, [[N(79), 0.06], [N(72), 0.12]], { wave: 0.25, gain: 0.14 }),
  start: (out, at) => {
    tone(out, at, { hz: N(83), dur: 0.08, wave: 0.5, gain: 0.16, decay: false })
    tone(out, at + 0.08, { hz: N(88), dur: 0.45, wave: 0.5, gain: 0.16 })
  },
  // Inserimento all'avvio (src/components/InsertAnimation.jsx), in sincrono con l'animazione.
  insertCart: (out, at) => {
    noise(out, at, { dur: 0.4, gain: 0.06, filter: 'bandpass', hz: 2500, sweep: 600 })
    tone(out, at + 0.8, { hz: 2200, dur: 0.025, wave: 0.5, gain: 0.14 })
    noise(out, at + 0.8, { dur: 0.06, gain: 0.16, filter: 'highpass', hz: 3000 })
    run(out, at + 1.4, [72, 79, 84, 91].map((midi) => [N(midi), 0.06]), { wave: 0.25, gain: 0.13 })
  },
  insertDisc: (out, at) => {
    tone(out, at, { hz: 90, slide: 130, dur: 0.35, wave: 'triangle', gain: 0.25, decay: false })
    tone(out, at + 0.6, { hz: 180, slide: 1400, dur: 0.8, wave: 'sine', gain: 0.05 })
    tone(out, at + 1.45, { hz: 100, slide: 70, dur: 0.3, wave: 'triangle', gain: 0.25, decay: false })
    noise(out, at + 1.72, { dur: 0.05, gain: 0.14, filter: 'highpass', hz: 2500 })
  },
  insertCoin: (out, at) => {
    noise(out, at + 0.65, { dur: 0.05, gain: 0.12, filter: 'highpass', hz: 5000 })
    tone(out, at + 0.7, { hz: N(83), dur: 0.08, wave: 0.5, gain: 0.16, decay: false })
    tone(out, at + 0.78, { hz: N(88), dur: 0.5, wave: 0.5, gain: 0.16 })
  },
  error: (out, at) => run(out, at, [[150, 0.09], [110, 0.16]], { wave: 0.5, gain: 0.14, decay: false }),
  notice: (out, at) => {
    for (const [index, midi] of [84, 88, 91, 96].entries()) {
      tone(out, at + index * 0.07, { hz: N(midi), dur: 0.6, wave: 'triangle', gain: 0.3 })
    }
  },
  tick: (out, at) => tone(out, at, { hz: 1760, dur: 0.018, wave: 0.125, gain: 0.08 }),
  ding: (out, at) => run(out, at, [[N(88), 0.07], [N(93), 0.3]], { wave: 0.25, gain: 0.16 }),
  slide: (out, at) => {
    noise(out, at, { dur: 0.18, gain: 0.07, filter: 'bandpass', hz: 1200, sweep: 5000 })
    tone(out, at + 0.04, { hz: N(84), slide: N(91), dur: 0.08, wave: 0.125, gain: 0.08 })
  },
  reveal: (out, at) => {
    run(out, at, [84, 91, 88, 96, 93, 100].map((midi) => [N(midi), 0.05]), { wave: 0.125, gain: 0.1 })
    tone(out, at + 0.3, { hz: N(72), dur: 0.5, wave: 'triangle', gain: 0.3 })
  },
  levelUp: (out, at) => {
    run(out, at, [[N(72), 0.1], [N(76), 0.1], [N(79), 0.1], [N(84), 0.38]], { wave: 0.5, gain: 0.14 })
    run(out, at, [[N(64), 0.1], [N(67), 0.1], [N(72), 0.1], [N(76), 0.38]], { wave: 0.25, gain: 0.08 })
  },
  trophy: (out, at) => {
    run(out, at, [[N(79), 0.08], [N(84), 0.08], [N(88), 0.08], [N(91), 0.5]], { wave: 0.25, gain: 0.15 })
    tone(out, at + 0.24, { hz: N(67), dur: 0.5, wave: 'triangle', gain: 0.3 })
  },
}

/** Nomi degli effetti (per i test e per chi li chiama). */
export const EFFECT_NAMES = Object.keys(EFFECTS)

function applyLevels() {
  if (!engine) {
    return
  }
  const now = engine.ctx.currentTime
  const effects = levels.on ? EFFECTS_GAIN * (levels.effects / 100) : 0
  const music = levels.on ? MUSIC_GAIN * (levels.music / 100) : 0
  engine.effects.gain.setTargetAtTime(effects, now, 0.05)
  engine.music.gain.setTargetAtTime(music, now, 0.05)
}

/** Riprende l'audio sospeso da Chrome (senza il flag di avvio serve un gesto). */
export function unlock() {
  if (engine && engine.ctx.state === 'suspended') {
    engine.ctx.resume().catch(() => {})
  }
}

/** Nuovi volumi `{on, effects, music}`: valgono subito per effetti e musica. */
export function setLevels(next) {
  levels = { ...DEFAULT_SOUND, ...next }
  applyLevels()
  syncMusic()
}

/** Suona l'effetto `name` (vedi `EFFECT_NAMES`), se i suoni sono accesi. */
export function play(name) {
  if (!levels.on || !levels.effects || !EFFECTS[name]) {
    return
  }
  if (name === 'move') {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (now - lastMove < MOVE_GAP_MS) {
      return
    }
    lastMove = now
  }
  const audio = getEngine()
  if (!audio) {
    return
  }
  unlock()
  try {
    EFFECTS[name](audio.effects, audio.ctx.currentTime + 0.005)
  } catch {
    // Audio non disponibile: nessun suono.
  }
}

function scheduleDrum(out, at, kind) {
  if (kind === 'kick') {
    tone(out, at, { hz: 150, slide: 45, dur: 0.12, wave: 'sine', gain: 0.6 })
  } else if (kind === 'snare') {
    noise(out, at, { dur: 0.12, gain: 0.22, filter: 'highpass', hz: 1500 })
    tone(out, at, { hz: 220, slide: 120, dur: 0.06, wave: 'triangle', gain: 0.25 })
  } else {
    noise(out, at, { dur: 0.035, gain: 0.08, filter: 'highpass', hz: 8000 })
  }
}

const VOICES = {
  lead: { wave: 0.25, gain: 0.16 },
  arp: { wave: 0.125, gain: 0.06 },
  bass: { wave: 'triangle', gain: 0.45 },
}

// Brano in riproduzione: programma le note poco prima che suonino, in ciclo.
function startSong(id) {
  const audio = getEngine()
  if (!audio) {
    return null
  }
  const song = trackSong(id)
  const out = audio.ctx.createGain()
  out.connect(audio.music)
  const now = audio.ctx.currentTime
  out.gain.setValueAtTime(0, now)
  out.gain.linearRampToValueAtTime(1, now + FADE_S)
  const stepS = 60 / song.bpm / 4
  const byStep = new Map()
  for (const note of song.notes) {
    byStep.set(note.step, [...(byStep.get(note.step) || []), note])
  }
  const drumsByStep = new Map(song.drums.map((beat) => [beat.step, beat.kind]))
  const player = { id, out, step: 0, next: now + 0.1, timer: null }
  const tick = () => {
    const limit = audio.ctx.currentTime + LOOKAHEAD_S
    while (player.next < limit) {
      const position = player.step % song.steps
      for (const note of byStep.get(position) || []) {
        const voice = VOICES[note.voice]
        tone(out, player.next, { hz: midiHz(note.midi), dur: note.len * stepS * 0.92, wave: voice.wave, gain: voice.gain, decay: note.voice !== 'bass' })
      }
      if (drumsByStep.has(position)) {
        scheduleDrum(out, player.next, drumsByStep.get(position))
      }
      player.step += 1
      player.next += stepS
    }
  }
  tick()
  player.timer = window.setInterval(tick, TICK_MS)
  return player
}

function stopSong(player) {
  if (!player) {
    return
  }
  window.clearInterval(player.timer)
  const { ctx } = engine
  const now = ctx.currentTime
  player.out.gain.cancelScheduledValues(now)
  player.out.gain.setValueAtTime(player.out.gain.value, now)
  player.out.gain.linearRampToValueAtTime(0, now + FADE_S)
  window.setTimeout(() => player.out.disconnect(), (FADE_S + LOOKAHEAD_S) * 1000 + 100)
}

// Allinea il brano in riproduzione a quello voluto e ai volumi.
function syncMusic() {
  const target = levels.on && levels.music ? wantedTrack : null
  if ((current ? current.id : null) === target) {
    return
  }
  if (!target && !current) {
    return
  }
  if (!getEngine()) {
    return
  }
  stopSong(current)
  current = null
  if (target) {
    unlock()
    try {
      current = startSong(target)
    } catch {
      current = null
    }
  }
}

/** Sottofondo da suonare: `title`, `wrapped`, `system:<id>`, oppure `null` per il silenzio (sfuma). */
export function setMusic(id) {
  wantedTrack = id || null
  syncMusic()
}
