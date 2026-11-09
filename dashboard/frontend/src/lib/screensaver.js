/**
 * Salvaschermo della dashboard (src/components/Screensaver.jsx). Solo
 * funzioni pure; `random` (0 ≤ x < 1) è sostituibile nei test.
 */

// Attese possibili in minuti (come `SCREENSAVER_MINUTES` del backend); 0 = mai, 10 / 60, 0.25 e 0.5 sono 10, 15 e 30 secondi.
export const SCREENSAVER_MINUTES = [0, 10 / 60, 0.25, 0.5, 1, 2, 5, 10]
export const DEFAULT_MINUTES = 2
// Durata di ogni scena, immagini per scena (a caso tra il minimo e il massimo) e numero massimo di immagini per giro.
export const SLIDE_MS = 8000
export const SCENE_MIN = 2
export const SCENE_MAX = 4
export const SLIDES_MAX = 60
// Rapporto larghezza/altezza delle copertine e delle miniature dei «Riprendi».
export const COVER_ASPECT = 3 / 4
export const THUMB_ASPECT = 4 / 3
// Spazio della didascalia sotto l'immagine, in frazione della sua altezza.
export const CAPTION_SHARE = 0.24
// Contesti della barra comandi (App.jsx) in cui può partire: libreria, sezione in alto e profilo.
const IDLE_CONTEXTS = new Set([
  'library', 'players', 'hero', 'heroPlay', 'heroCore', 'heroCover', 'heroText', 'profile', 'profileTab',
])

/** «Mai», «15 secondi», «1 minuto», «5 minuti». */
export function minutesLabel(minutes) {
  if (!minutes) {
    return 'Mai'
  }
  if (minutes < 1) {
    return `${Math.round(minutes * 60)} secondi`
  }
  return minutes === 1 ? '1 minuto' : `${minutes} minuti`
}

// Cosa mostra (come `SCREENSAVER_CONTENT` del backend): copertine con una partita ogni tanto, solo copertine, solo partite.
export const SCREENSAVER_CONTENT = [
  { id: 'mixed', label: 'Misto' },
  { id: 'covers', label: 'Copertine' },
  { id: 'games', label: 'Partite' },
]
export const DEFAULT_CONTENT = 'mixed'
// Copertine tra una partita e l'altra (misto, o partite quando non ce n'è nessuna da mostrare).
export const CLIP_EVERY_MS = 120000
// Durante una partita rigiocata: lettura dello stato e dei joypad (Chrome non ha il focus).
export const STATUS_POLL_MS = 1000
export const PAD_POLL_MS = 100
// Inclinazione di una levetta che conta come pressione.
const AXIS_PRESS = 0.6

/** «Misto», «Copertine», «Partite». */
export function contentLabel(content) {
  return (SCREENSAVER_CONTENT.find((item) => item.id === content) || SCREENSAVER_CONTENT[0]).label
}

/**
 * Pressioni nuove sui joypad (`navigator.getGamepads()`): `held` è l'insieme
 * dei tasti e delle levette tenuti alla lettura precedente (`<pad>:b<n>`,
 * `<pad>:a<n>`). Restituisce `{held, pressed}`: `pressed` è vero se qualcosa
 * è stato premuto adesso; un tasto già tenuto non conta.
 */
export function padPresses(held, gamepads) {
  const now = new Set()
  for (const pad of gamepads || []) {
    if (!pad) {
      continue
    }
    pad.buttons.forEach((button, index) => {
      if (button.pressed) {
        now.add(`${pad.index}:b${index}`)
      }
    })
    pad.axes.forEach((value, index) => {
      if (Math.abs(value) >= AXIS_PRESS) {
        now.add(`${pad.index}:a${index}`)
      }
    })
  }
  const pressed = [...now].some((key) => !held.has(key))
  return { held: now, pressed }
}

/** Vero se nel contesto `context` della barra comandi il salvaschermo può partire. */
export function idleContext(context) {
  return IDLE_CONTEXTS.has(context)
}

/** Vero se dopo `idleMs` millisecondi senza comandi deve partire, con l'attesa `minutes` (0 = mai). */
export function shouldStart(idleMs, minutes) {
  return minutes > 0 && idleMs >= minutes * 60000
}

function shuffle(list, random) {
  const result = [...list]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Immagini del salvaschermo, alternate: una copertina a caso della
 * libreria, un preferito di un profilo, un «Riprendi» di un profilo, e così
 * via; quando un gruppo finisce si continua con gli altri.
 *
 * - `covers`: `[{system, game}]` giochi della libreria;
 * - `favorites`: `[{system, game, owner: {name, color}}]`;
 * - `resumes`: `[{system, game, owner, account, at}]` con la miniatura.
 *
 * Restituisce al massimo `max` voci `{kind: 'cover'|'favorite'|'resume', ...}`
 * con una `key` unica.
 */
export function buildSlides({ covers = [], favorites = [], resumes = [] }, random = Math.random, max = SLIDES_MAX) {
  const groups = [
    shuffle(covers, random).map((item) => ({ ...item, kind: 'cover' })),
    shuffle(favorites, random).map((item) => ({ ...item, kind: 'favorite' })),
    shuffle(resumes, random).map((item) => ({ ...item, kind: 'resume' })),
  ]
  const result = []
  let round = 0
  while (result.length < max && groups.some((group) => round < group.length)) {
    for (const group of groups) {
      if (round < group.length && result.length < max) {
        const item = group[round]
        result.push({ ...item, key: `${item.kind}:${item.system.id}/${item.game.id}:${result.length}` })
      }
    }
    round += 1
  }
  return result
}

/**
 * Scene del salvaschermo: le immagini a gruppi mostrati insieme, ognuno di
 * `SCENE_MIN`–`max` immagini a caso (l'ultimo può averne meno).
 */
export function scenes(slides, random = Math.random, max = SCENE_MAX) {
  const result = []
  let start = 0
  while (start < slides.length) {
    const size = max <= SCENE_MIN ? max : SCENE_MIN + Math.floor(random() * (max - SCENE_MIN + 1))
    result.push(slides.slice(start, start + size))
    start += size
  }
  return result
}

// Grandezza di partenza delle immagini rispetto allo schermo, per numero di immagini nella scena.
const SCENE_SCALE = [1, 0.9, 0.8, 0.7]
// Tentativi per immagine prima di rimpicciolirla, e rimpicciolimenti prima di rinunciare.
const TRIES = 40
const SHRINKS = 12
// Disposizioni a caso provate per ogni scena: vince quella che copre più schermo.
const LAYOUTS = 24
// Passo con cui ogni immagine cresce, finché non tocca un'altra o il margine.
const GROW_STEP = 1.04
// Ampiezza del movimento di ogni immagine, in frazione dello spazio tra le immagini (due vicine, sommate, non lo superano).
const DRIFT_MIN = 0.3
const DRIFT_MAX = 0.5

/** Vero se i riquadri `a` e `b` (`{left, top, width, height}`) distano meno di `gap`. */
function touches(a, b, gap) {
  return a.left < b.left + b.width + gap && b.left < a.left + a.width + gap &&
    a.top < b.top + b.height + gap && b.top < a.top + a.height + gap
}

/** Una disposizione a caso: riquadri (immagine più didascalia) o `null` per un'immagine senza posto. */
function tryLayout(aspects, room, random) {
  const { margin, gap, width, height, biggest } = room
  const inside = (box) => box.left >= margin && box.top >= margin &&
    box.left + box.width <= margin + width && box.top + box.height <= margin + height
  const blocks = []
  for (const aspect of aspects) {
    let size = biggest * (0.6 + 0.4 * random())
    let place = null
    for (let shrink = 0; shrink < SHRINKS && !place; shrink += 1) {
      const block = { width: size * aspect, height: size * (1 + CAPTION_SHARE) }
      for (let attempt = 0; attempt < TRIES && !place; attempt += 1) {
        const candidate = {
          ...block,
          left: margin + random() * Math.max(0, width - block.width),
          top: margin + random() * Math.max(0, height - block.height),
        }
        if (!blocks.some((other) => other && touches(candidate, other, gap))) {
          place = candidate
        }
      }
      size *= 0.88
    }
    blocks.push(place)
  }
  // Ogni immagine cresce attorno al suo centro (spostandosi dentro il margine) finché ha spazio.
  let grew = true
  while (grew) {
    grew = false
    blocks.forEach((block, index) => {
      if (!block) {
        return
      }
      const bigger = { width: block.width * GROW_STEP, height: block.height * GROW_STEP }
      bigger.left = Math.min(Math.max(margin, block.left - (bigger.width - block.width) / 2), margin + width - bigger.width)
      bigger.top = Math.min(Math.max(margin, block.top - (bigger.height - block.height) / 2), margin + height - bigger.height)
      if (inside(bigger) && !blocks.some((other, at) => other && at !== index && touches(bigger, other, gap))) {
        blocks[index] = bigger
        grew = true
      }
    })
  }
  return blocks
}

/**
 * Posti delle immagini di una scena in uno schermo `width` × `height`
 * (pixel): `aspects` sono i rapporti larghezza/altezza delle immagini.
 *
 * Ogni immagine parte da una grandezza a caso e da un punto a caso dello
 * schermo, dentro il margine e didascalia compresa; un posto che tocca
 * un'immagine già messa si scarta e se ne pesca un altro (dopo troppi
 * tentativi l'immagine si rimpicciolisce). Poi ogni immagine cresce finché
 * non tocca un'altra o il margine. Si provano `LAYOUTS` disposizioni e vince
 * quella che copre più schermo, senza mai sovrapposizioni.
 *
 * Ogni immagine si muove piano in una direzione a caso, con un'ampiezza a
 * caso (e quindi una velocità diversa) entro metà dello spazio tra le
 * immagini: da `-dx, -dy` a `dx, dy` rispetto al suo posto, senza toccare le
 * altre né uscire dallo schermo. Restituisce
 * `[{left, top, width, height, dx, dy}]` dell'immagine, in pixel;
 * un'immagine che non trova posto resta `null`.
 */
export function sceneLayout(aspects, width, height, random = Math.random) {
  const count = aspects.length
  if (!count) {
    return []
  }
  const margin = Math.min(width, height) * 0.06
  const room = {
    margin,
    gap: margin * 0.8,
    width: width - 2 * margin,
    height: height - 2 * margin,
  }
  room.biggest = Math.min(room.height / (1 + CAPTION_SHARE), room.width / Math.max(...aspects)) *
    SCENE_SCALE[Math.min(count, SCENE_SCALE.length) - 1]
  let best = null
  let bestScore = -1
  for (let round = 0; round < LAYOUTS; round += 1) {
    const blocks = tryLayout(aspects, room, random)
    // Prima conta quante immagini hanno posto, poi quanto schermo coprono.
    const score = blocks.filter(Boolean).length * width * height +
      blocks.reduce((sum, block) => sum + (block ? block.width * block.height : 0), 0)
    if (score > bestScore) {
      best = blocks
      bestScore = score
    }
  }
  return best.map((block) => {
    if (!block) {
      return null
    }
    const angle = random() * 2 * Math.PI
    const reach = room.gap * (DRIFT_MIN + (DRIFT_MAX - DRIFT_MIN) * random())
    return {
      left: block.left,
      top: block.top,
      width: block.width,
      height: block.height / (1 + CAPTION_SHARE),
      dx: Math.cos(angle) * reach,
      dy: Math.sin(angle) * reach,
    }
  })
}
