import styles from './PadTester.module.css'

// Croce direzionale: un braccio per direzione attorno al centro (12 unità di lato).
const DPAD = {
  up: { x: 44, y: 46, width: 12, height: 16 },
  down: { x: 44, y: 74, width: 12, height: 16 },
  left: { x: 26, y: 62, width: 16, height: 12 },
  right: { x: 58, y: 62, width: 16, height: 12 },
}

// Quattro tasti frontali per posizione nel rombo, indipendenti dalla marca (src/components/FaceButton.jsx).
const FACE = {
  y: { cx: 150, cy: 50 },
  b: { cx: 166, cy: 66 },
  a: { cx: 150, cy: 82 },
  x: { cx: 134, cy: 66 },
}

// Spalle: grilletti dietro (più alti), dorsali davanti.
const SHOULDERS = {
  lt: { x: 30, y: 2, width: 36, height: 10 },
  rt: { x: 134, y: 2, width: 36, height: 10 },
  lb: { x: 26, y: 16, width: 44, height: 9 },
  rb: { x: 130, y: 16, width: 44, height: 9 },
}

const MIDDLE = {
  select: { x: 80, y: 60, width: 16, height: 7 },
  start: { x: 104, y: 60, width: 16, height: 7 },
}

/**
 * Joypad generico per la prova dei tasti nella schermata «Incontro»: croce,
 * quattro tasti frontali, dorsali, grilletti, SELECT e START, accesi quelli
 * in `pressed` (tasti logici: `up`, `a`, `lb`, `start`…) nel colore `--side`
 * di chi lo usa.
 */
export default function PadTester({ pressed }) {
  const on = (name) => (pressed.includes(name) ? styles.on : styles.off)
  return (
    <svg className={styles.pad} viewBox="0 0 200 124" aria-hidden="true">
      {Object.entries(SHOULDERS).map(([name, key]) => (
        <rect key={name} x={key.x} y={key.y} width={key.width} height={key.height} rx="4" className={on(name)} />
      ))}
      <path
        className={styles.body}
        d="M44 26 H156 C182 26 196 48 196 76 C196 104 184 120 170 120 C156 120 148 104 136 96 H64 C52 104 44 120 30 120 C16 120 4 104 4 76 C4 48 18 26 44 26 Z"
      />
      {Object.entries(DPAD).map(([name, key]) => (
        <rect key={name} x={key.x} y={key.y} width={key.width} height={key.height} rx="2" className={on(name)} />
      ))}
      <rect x="44" y="62" width="12" height="12" className={styles.hub} />
      {Object.entries(MIDDLE).map(([name, key]) => (
        <rect key={name} x={key.x} y={key.y} width={key.width} height={key.height} rx="3.5" className={on(name)} />
      ))}
      {Object.entries(FACE).map(([name, dot]) => (
        <circle key={name} cx={dot.cx} cy={dot.cy} r="9" className={on(name)} />
      ))}
    </svg>
  )
}
