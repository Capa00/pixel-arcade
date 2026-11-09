/**
 * Temi grafici dello sfondo: luce colorata, scena sfumata in basso e
 * sprite che galleggiano piano nei margini (src/components/Backdrop.jsx).
 * All'avvio, con `ui.theme = random`, se ne sceglie uno a caso; nelle
 * Impostazioni se ne può fissare uno (backend: `THEMES` in config.py).
 *
 * Gli sprite pixel sono righe di caratteri: `.` è trasparente, `a`–`d` sono
 * i colori `colors[0]`–`colors[3]` del posizionamento. Tutti i disegni sono
 * originali, in stile 8/16 bit, senza loghi né marchi.
 */

export const RANDOM = 'random'

/** Sprite pixel condivisi dai temi. */
export const PIXEL_SPRITES = {
  sparkle: [
    '...a...',
    '...a...',
    '..aba..',
    'aabbbaa',
    '..aba..',
    '...a...',
    '...a...',
  ],
  heart: [
    '.aa.aa.',
    'abbabba',
    'abbbbba',
    '.abbba.',
    '..aba..',
    '...a...',
  ],
  cartridge: [
    'aaaaaaaaaaaaaa',
    'abbbbbbbbbbbba',
    'abccccccccccba',
    'abcddddddddcba',
    'abccccccccccba',
    'abcddddcccccba',
    'abccccccccccba',
    'abbbbbbbbbbbba',
    'aaaaaaaaaaaaaa',
    'a.a.a.a.a.a.a.',
    'aaaaaaaaaaaaaa',
  ],
  padRect: [
    'aaaaaaaaaaaaaaaa',
    'abbbbbbbbbbbbbba',
    'abbcbbbbbbbbbbba',
    'abcccbbaabbdbdba',
    'abbcbbbbbbbbbbba',
    'abbbbbbbbbbbbbba',
    'aaaaaaaaaaaaaaaa',
  ],
  tv: [
    '...a......a...',
    '....a....a....',
    '.....a..a.....',
    'bbbbbbbbbbbbbb',
    'bccccccccccbbb',
    'bcdcdcdcdccbdb',
    'bccccccccccbbb',
    'bcdcdcdcdccbdb',
    'bccccccccccbbb',
    'bbbbbbbbbbbbbb',
    '.b..........b.',
  ],
  puff: [
    '..aa.....',
    '.aaaa.aa.',
    'aaaaaaaaa',
    '.aaaaaaa.',
    '..a..a...',
  ],
  handheld: [
    'aaaaaaaaaa',
    'abbbbbbbba',
    'abccccccba',
    'abcdccccba',
    'abccccdcba',
    'abccccccba',
    'abbbbbbbba',
    'aaaaaaaaaa',
    'aabaaaaaaa',
    'abbbaaadaa',
    'aabaaadaaa',
    'aaaaaaaaaa',
    'aaaabbaaaa',
    'aaaaaaaaaa',
  ],
  hero: [
    '.aaa.',
    '.aba.',
    '.aaa.',
    'aaaaa',
    '.aaa.',
    '.a.a.',
    '.a.a.',
    'aa.aa',
  ],
  led: [
    '.aa.',
    'abba',
    'abba',
    '.aa.',
  ],
  ring: [
    '..aaaa..',
    '.abbbba.',
    'ab....ba',
    'ab....ba',
    'ab....ba',
    'ab....ba',
    '.abbbba.',
    '..aaaa..',
  ],
  gem: [
    '..aaa..',
    '.abbba.',
    'abbcbba',
    'abbbbba',
    '.abbba.',
    '..aba..',
    '...a...',
  ],
  speed: [
    'aaaaaa....aaaa',
    '..............',
    '...aaaaaaaa...',
    '..............',
    'aaaa..aaaaaaa.',
  ],
  memoryCard: [
    'aaaaaa..',
    'abbbbba.',
    'abbbbbba',
    'abccccba',
    'abccccba',
    'abbbbbba',
    'abbbbbba',
    'abddddba',
    'abbbbbba',
    'aaaaaaaa',
  ],
  stick: [
    '...aaa...',
    '..abbba..',
    '..abbba..',
    '...aaa...',
    '....c....',
    '....c....',
    '...ccc...',
    '.ccccccc.',
    'ccccccccc',
    '.ccccccc.',
  ],
  floppy: [
    'aaaaaaaaaaa.',
    'aabbbbbcbaaa',
    'aabbbbbcbaaa',
    'aabbbbbbbaaa',
    'aaaaaaaaaaaa',
    'aaaaaaaaaaaa',
    'acccccccccca',
    'acdddddddcca',
    'acccccccccca',
    'acddddddccca',
    'acccccccccca',
    'aaaaaaaaaaaa',
  ],
  pointer: [
    'a......',
    'aa.....',
    'aba....',
    'abba...',
    'abbba..',
    'abbbba.',
    'abbbbba',
    'abbaaa.',
    'aa.ba..',
    '...ba..',
    '....a..',
  ],
  joystick: [
    '...aaa...',
    '..aaaaa..',
    '..aabaa..',
    '...aaa...',
    '....c....',
    '....c....',
    '....c....',
    '..ddddd..',
    '.ddddddd.',
    'ddddddddd',
  ],
  buttons: [
    '.aa..bb..cc.',
    'aaaabbbbcccc',
    'aaaabbbbcccc',
    '.aa..bb..cc.',
  ],
  coin: [
    '..aaaa..',
    '.abbbba.',
    'abbcbbba',
    'abbcbbba',
    'abbcbbba',
    'abbcbbba',
    '.abbbba.',
    '..aaaa..',
  ],
  vmu: [
    'aaaaaaaaaa',
    'abbbbbbbba',
    'abccccccba',
    'abcddcccba',
    'abccccccba',
    'abbbbbbbba',
    'abbdbbbbba',
    'abdddbbcba',
    'abbdbbcbba',
    'abbbbbbbba',
    '.aaaaaaaa.',
  ],
}

/** Sprite vettoriali (src/components/Sprite.jsx): proporzioni larghezza/altezza. */
export const VECTOR_SPRITES = {
  triangle: 1,
  circle: 1,
  cross: 1,
  square: 1,
  disc: 1,
  cube: 1,
  polyStar: 1,
  swirl: 1,
  bubble: 1,
  orb: 1,
}

/** Sprite di testo (carattere Silkscreen): `text` e cursore facoltativo. */
export const TEXT_SPRITES = {
  ready: { text: 'READY.', cursor: true },
  insertCoin: { text: 'INSERT COIN', cursor: false },
}

/*
 * Posizioni nei margini liberi del layout 16:9 (percentuali dello schermo):
 * a destra della sezione del gioco, sotto l'intestazione, tra la sezione in
 * alto e la griglia. `size` è la larghezza in unità della demo.
 */
const SPOTS = [
  { x: 86, y: 16, size: 76 },
  { x: 93, y: 36, size: 48 },
  { x: 82, y: 44, size: 58 },
  { x: 63, y: 11.5, size: 36 },
  { x: 1, y: 55, size: 30 },
  { x: 96, y: 60, size: 26 },
]

function place(entries) {
  return entries.map((entry, index) => ({ ...SPOTS[index], ...entry, key: `${entry.sprite}-${index}` }))
}

/**
 * I temi. `glow` sono i due colori della luce di sfondo (con trasparenza),
 * `stripe` la tavolozza del tema (scena in basso, alone centrale), `icon` lo sprite dei
 * piccoli richiami (titolo della griglia, stati vuoti), `scene` il disegno
 * sfumato in basso, `sprites` i disegni nei margini.
 */
export const THEMES = [
  {
    id: 'nes',
    name: 'Salotto 8 bit',
    note: 'Cartucce, controller rettangolare, televisore a tubo',
    glow: ['#c8323d5c', '#9a9aa84d'],
    stripe: ['#c8323d', '#e8e6ea', '#5a5a66', '#1e1d28'],
    icon: { sprite: 'cartridge', colors: ['#9a9aa8', '#5a5a66', '#e8e6ea', '#c8323d'] },
    scene: null,
    sprites: place([
      { sprite: 'cartridge', colors: ['#9a9aa8', '#5a5a66', '#e8e6ea', '#c8323d'], duration: 34 },
      { sprite: 'padRect', colors: ['#c9c7cf', '#6b6a76', '#1e1d28', '#c8323d'], duration: 28 },
      { sprite: 'tv', colors: ['#9a9aa8', '#5a5a66', '#2d2c3a', '#8fd0ff'], duration: 38 },
      { sprite: 'puff', colors: ['#e8e6ea'], duration: 24 },
      { sprite: 'sparkle', colors: ['#c8323d', '#ffffff'], duration: 30 },
      { sprite: 'heart', colors: ['#c8323d', '#ff8a8a'], duration: 26 },
    ]),
  },
  {
    id: 'gameboy',
    name: 'Portatile verde',
    note: 'Le quattro tonalità di verde, colline e un omino',
    glow: ['#8bac0f5c', '#3062304d'],
    stripe: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
    icon: { sprite: 'handheld', colors: ['#8bac0f', '#306230', '#9bbc0f', '#0f380f'] },
    scene: 'hills',
    sprites: place([
      { sprite: 'handheld', colors: ['#8bac0f', '#306230', '#9bbc0f', '#0f380f'], duration: 36 },
      { sprite: 'hero', colors: ['#9bbc0f', '#306230'], duration: 26 },
      { sprite: 'heart', colors: ['#306230', '#8bac0f'], duration: 30 },
      { sprite: 'led', colors: ['#7a1c1c', '#ff4a4a'], duration: 22 },
      { sprite: 'sparkle', colors: ['#9bbc0f', '#ffffff'], duration: 32 },
      { sprite: 'coin', colors: ['#306230', '#8bac0f', '#0f380f'], duration: 28 },
    ]),
  },
  {
    id: '16bit',
    name: '16 bit',
    note: 'Anelli, gemme, pavimento a scacchi in prospettiva',
    glow: ['#8a6cff5c', '#2f5bff4d'],
    stripe: ['#b9a8ff', '#8a6cff', '#2f5bff', '#f5c542'],
    icon: { sprite: 'gem', colors: ['#2f5bff', '#8a6cff', '#e4ddff'] },
    scene: 'checker',
    sprites: place([
      { sprite: 'ring', colors: ['#f5c542', '#fff1a8'], duration: 30 },
      { sprite: 'gem', colors: ['#2f5bff', '#8a6cff', '#e4ddff'], duration: 34 },
      { sprite: 'speed', colors: ['#b9a8ff'], duration: 24 },
      { sprite: 'ring', colors: ['#f5c542', '#fff1a8'], duration: 28 },
      { sprite: 'sparkle', colors: ['#b9a8ff', '#ffffff'], duration: 26 },
      { sprite: 'gem', colors: ['#c43cff', '#e27bff', '#ffe6ff'], duration: 32 },
    ]),
  },
  {
    id: 'psx',
    name: 'Era 32 bit',
    note: 'Poligoni sfaccettati, forme geometriche, CD iridescente',
    glow: ['#5b6bd05c', '#c9c6d64d'],
    stripe: ['#3fb6a8', '#e0545e', '#6e7bd6', '#d88bc4'],
    icon: { sprite: 'disc', colors: ['#c9c6d6', '#6e7bd6', '#3fb6a8'] },
    scene: 'poly',
    sprites: place([
      { sprite: 'disc', colors: ['#c9c6d6', '#6e7bd6', '#3fb6a8', '#d88bc4'], duration: 40 },
      { sprite: 'triangle', colors: ['#3fb6a8'], duration: 30 },
      { sprite: 'circle', colors: ['#e0545e'], duration: 34 },
      { sprite: 'cross', colors: ['#6e7bd6'], duration: 28 },
      { sprite: 'square', colors: ['#d88bc4'], duration: 32 },
      { sprite: 'memoryCard', colors: ['#9a9aa8', '#5a5a66', '#c9c6d6', '#e0545e'], duration: 26 },
    ]),
  },
  {
    id: 'n64',
    name: 'Primi 3D',
    note: 'Cubo in fil di ferro, stella a poligoni, nebbia',
    glow: ['#2f8a4a5c', '#c4262e4d'],
    stripe: ['#c4262e', '#f0b21a', '#2f8a4a', '#2c53b8'],
    icon: { sprite: 'polyStar', colors: ['#f0b21a', '#b8860b'] },
    scene: 'fog',
    sprites: place([
      { sprite: 'cube', colors: ['#2c53b8', '#f0b21a'], duration: 40 },
      { sprite: 'polyStar', colors: ['#f0b21a', '#b8860b'], duration: 32 },
      { sprite: 'stick', colors: ['#9a9aa8', '#c9c7cf', '#5a5a66'], duration: 28 },
      { sprite: 'sparkle', colors: ['#2f8a4a', '#ffffff'], duration: 26 },
      { sprite: 'coin', colors: ['#c4262e', '#f0b21a', '#fff1a8'], duration: 30 },
      { sprite: 'heart', colors: ['#c4262e', '#ff8a8a'], duration: 24 },
    ]),
  },
  {
    id: 'computer',
    name: 'Home computer',
    note: 'READY., cursore, dischetto e puntatore',
    glow: ['#4a5ad85c', '#f5a6234d'],
    stripe: ['#352879', '#6c5eb5', '#9aa6ff', '#f5a623'],
    icon: { sprite: 'floppy', colors: ['#6c5eb5', '#352879', '#e8e6ea', '#9aa6ff'] },
    scene: null,
    sprites: place([
      { sprite: 'floppy', colors: ['#6c5eb5', '#352879', '#e8e6ea', '#9aa6ff'], duration: 36 },
      { sprite: 'pointer', colors: ['#e8e6ea', '#9aa6ff'], duration: 28 },
      { sprite: 'ready', colors: ['#9aa6ff'], duration: 40 },
      { sprite: 'sparkle', colors: ['#f5a623', '#ffffff'], duration: 26 },
      { sprite: 'heart', colors: ['#6c5eb5', '#9aa6ff'], duration: 30 },
      { sprite: 'coin', colors: ['#f5a623', '#ffd08a', '#8a5a00'], duration: 24 },
    ]),
  },
  {
    id: 'arcade',
    name: 'Sala giochi anni ’80',
    note: 'Insegna al neon, joystick, gettoni, orizzonte a griglia',
    glow: ['#ff3cac5c', '#ff8a3c4d'],
    stripe: ['#ff3cac', '#ff8a3c', '#ffd23c', '#784bff'],
    icon: { sprite: 'joystick', colors: ['#ff3cac', '#ff8ad0', '#9a9aa8', '#2d2c3a'] },
    scene: 'horizon',
    sprites: place([
      { sprite: 'insertCoin', colors: ['#ff3cac'], duration: 40 },
      { sprite: 'joystick', colors: ['#ff3cac', '#ff8ad0', '#9a9aa8', '#2d2c3a'], duration: 30 },
      { sprite: 'buttons', colors: ['#ff3cac', '#ffd23c', '#3cc8ff'], duration: 34 },
      { sprite: 'coin', colors: ['#ff8a3c', '#ffd23c', '#8a4a00'], duration: 26 },
      { sprite: 'sparkle', colors: ['#784bff', '#ffffff'], duration: 28 },
      { sprite: 'coin', colors: ['#ff8a3c', '#ffd23c', '#8a4a00'], duration: 22 },
    ]),
  },
  {
    id: 'y2k',
    name: 'Anni 2000',
    note: 'Spirale, riflessi lucidi, bolle e schede di memoria',
    glow: ['#ff8a3c5c', '#3c8aff4d'],
    stripe: ['#f3f1f8', '#ff8a3c', '#3c8aff', '#b8c4d8'],
    icon: { sprite: 'swirl', colors: ['#ff8a3c'] },
    scene: null,
    sprites: place([
      { sprite: 'swirl', colors: ['#ff8a3c'], duration: 40 },
      { sprite: 'orb', colors: ['#3c8aff', '#e8f0ff'], duration: 32 },
      { sprite: 'vmu', colors: ['#d8dde8', '#8a93a6', '#3c8aff', '#ff8a3c'], duration: 28 },
      { sprite: 'bubble', colors: ['#b8c4d8'], duration: 26 },
      { sprite: 'bubble', colors: ['#3c8aff'], duration: 34 },
      { sprite: 'sparkle', colors: ['#ff8a3c', '#ffffff'], duration: 24 },
    ]),
  },
]

export const THEME_IDS = THEMES.map((theme) => theme.id)

/** Tema con quell'id, oppure `null`. */
export function themeById(id) {
  return THEMES.find((theme) => theme.id === id) || null
}

/** Id di un tema a caso; `random` è una funzione che restituisce un numero in [0, 1). */
export function randomThemeId(random = Math.random) {
  const index = Math.min(THEMES.length - 1, Math.floor(random() * THEMES.length))
  return THEMES[index].id
}

/**
 * Tema da mostrare: quello scelto nelle Impostazioni (anche non ancora
 * salvato, per vederlo subito) o salvato; con `random` quello estratto
 * all'avvio (`state.randomTheme`).
 */
export function activeTheme(state) {
  const draft = state.view === 'settings' && state.settings && state.settings.draft
    ? state.settings.draft.settings['ui.theme']
    : null
  const id = draft || state.theme || RANDOM
  return themeById(id === RANDOM ? state.randomTheme : id) || THEMES[0]
}

/** Larghezza e altezza di uno sprite pixel (tutte le righe hanno la stessa lunghezza). */
export function pixelSize(rows) {
  return { width: rows.reduce((max, row) => Math.max(max, row.length), 0), height: rows.length }
}

const COLOR_INDEX = { a: 0, b: 1, c: 2, d: 3 }

/**
 * Rettangoli di uno sprite pixel: i pixel consecutivi dello stesso colore
 * sulla stessa riga diventano un solo rettangolo `{x, y, width, color}`
 * (`color` = indice nei colori del posizionamento).
 */
export function pixelRuns(rows) {
  const runs = []
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const char = row[x]
      if (!(char in COLOR_INDEX)) {
        x += 1
        continue
      }
      let end = x + 1
      while (end < row.length && row[end] === char) {
        end += 1
      }
      runs.push({ x, y, width: end - x, color: COLOR_INDEX[char] })
      x = end
    }
  })
  return runs
}
