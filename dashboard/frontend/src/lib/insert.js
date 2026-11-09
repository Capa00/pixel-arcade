/**
 * Animazione di inserimento all'avvio di un gioco (src/components/InsertAnimation.jsx):
 * scena, movimento e supporto per console, dal sistema riconosciuto
 * (`preset` di `GET /api/bootstrap`). Solo funzioni pure.
 */

// Scena per sistema: `motion` è il movimento, `body` l'aspetto della console,
// `piece` il supporto (forma della cartuccia, `disc`, `umd` o `coin`).
const SCENES = {
  nes: { motion: 'front', body: 'nes', piece: 'nes' },
  fds: { motion: 'front', body: 'fds', piece: 'floppy' },
  pce: { motion: 'front', body: 'pce', piece: 'card' },
  snes: { motion: 'top', body: 'snes', piece: 'snes' },
  md: { motion: 'top', body: 'md', piece: 'md' },
  sega32x: { motion: 'top', body: 'md', piece: 'md' },
  sms: { motion: 'top', body: 'sms', piece: 'md' },
  sg1000: { motion: 'top', body: 'sms', piece: 'md' },
  jaguar: { motion: 'top', body: 'jaguar', piece: 'md' },
  n64: { motion: 'top', body: 'n64', piece: 'n64' },
  atari2600: { motion: 'top', body: 'atari', piece: 'atari' },
  atari7800: { motion: 'top', body: 'atari', piece: 'atari' },
  colecovision: { motion: 'top', body: 'retro', piece: 'atari' },
  intellivision: { motion: 'top', body: 'retro', piece: 'atari' },
  odyssey2: { motion: 'top', body: 'retro', piece: 'atari' },
  channelf: { motion: 'top', body: 'retro', piece: 'atari' },
  vc4000: { motion: 'top', body: 'retro', piece: 'atari' },
  arcadia2001: { motion: 'top', body: 'retro', piece: 'atari' },
  elektor: { motion: 'top', body: 'retro', piece: 'atari' },
  vectrex: { motion: 'top', body: 'retro', piece: 'atari' },
  msx: { motion: 'top', body: 'computer', piece: 'generic' },
  cpc: { motion: 'top', body: 'computer', piece: 'generic' },
  pc88: { motion: 'top', body: 'computer', piece: 'generic' },
  vb: { motion: 'top', body: 'vb', piece: 'gb' },
  gb: { motion: 'portrait', body: 'gb', piece: 'gb' },
  gbc: { motion: 'portrait', body: 'gbc', piece: 'gb' },
  megaduck: { motion: 'portrait', body: 'gb', piece: 'gb' },
  pokemini: { motion: 'portrait', body: 'pokemini', piece: 'mini' },
  arduboy: { motion: 'portrait', body: 'gb', piece: 'mini' },
  gba: { motion: 'landscape', body: 'gba', piece: 'gba' },
  gg: { motion: 'landscape', body: 'gg', piece: 'gb' },
  lynx: { motion: 'landscape', body: 'lynx', piece: 'card' },
  ngp: { motion: 'landscape', body: 'ngp', piece: 'gb' },
  wonderswan: { motion: 'landscape', body: 'ws', piece: 'gb' },
  supervision: { motion: 'landscape', body: 'ws', piece: 'gb' },
  psp: { motion: 'landscape', body: 'psp', piece: 'umd' },
  nds: { motion: 'clam', body: 'nds', piece: 'mini' },
  psx: { motion: 'lid', body: 'psx', piece: 'disc' },
  saturn: { motion: 'lid', body: 'saturn', piece: 'disc' },
  dreamcast: { motion: 'lid', body: 'dreamcast', piece: 'disc' },
  pcecd: { motion: 'lid', body: 'pcecd', piece: 'disc' },
  pcfx: { motion: 'lid', body: 'pcecd', piece: 'disc' },
  neogeocd: { motion: 'lid', body: 'neogeocd', piece: 'disc' },
  ps2: { motion: 'tray', body: 'ps2', piece: 'disc' },
  segacd: { motion: 'tray', body: 'segacd', piece: 'disc' },
  '3do': { motion: 'tray', body: '3do', piece: 'disc' },
}

const COIN = { motion: 'coin', body: 'cab', piece: 'coin' }
const GENERIC = { motion: 'top', body: 'generic', piece: 'generic' }

const SOUNDS = { disc: 'insertDisc', umd: 'insertDisc', coin: 'insertCoin' }

/**
 * Durata dell'animazione (ms). È anche il tempo minimo della schermata di
 * avvio: la richiesta di avvio parte dopo (src/views/RunLayer.jsx).
 */
export const INSERT_MS = 2000

/**
 * Scena di avvio per la console `system` (`{preset, arcade}`):
 * `{motion, body, piece, sound}`. `motion` è il movimento (`front` dal
 * davanti, `top` dall'alto, `portrait` e `landscape` nelle portatili,
 * `clam` nella portatile a conchiglia, `lid` col coperchio, `tray` col
 * cassetto, `coin` nella gettoniera); `body` l'aspetto della console;
 * `piece` il supporto; `sound` l'effetto di src/lib/sound.js. Le console non
 * riconosciute hanno una cartuccia generica dall'alto.
 */
export function sceneFor(system) {
  const preset = system ? system.preset : null
  let scene = SCENES[preset] || GENERIC
  if ((system && system.arcade) || preset === 'arcade') {
    scene = COIN
  }
  return { ...scene, sound: SOUNDS[scene.piece] || 'insertCart' }
}
