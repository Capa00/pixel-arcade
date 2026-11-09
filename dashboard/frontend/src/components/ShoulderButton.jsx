import styles from './ShoulderButton.module.css'

// Tasti delle spalle: dorsali (LB/RB) davanti, grilletti (LT/RT) dietro, sopra i dorsali.
const KEYS = {
  lt: { x: 2, y: 2, height: 6 },
  rt: { x: 22, y: 2, height: 6 },
  lb: { x: 2, y: 10, height: 4 },
  rb: { x: 22, y: 10, height: 4 },
}

/**
 * Tasti delle spalle del joypad, indipendenti dalla marca (LB/RB e LT/RT
 * su Xbox, L1/R1 e L2/R2 su PlayStation, L/R e ZL/ZR su Nintendo): la parte
 * alta del joypad con i quattro tasti, pieni quelli in `pressed`
 * (`lb`, `rb`, `lt`, `rt`).
 */
export default function ShoulderButton({ pressed }) {
  return (
    <svg className={styles.glyph} viewBox="0 0 32 22" aria-hidden="true">
      {Object.entries(KEYS).map(([name, key]) => (
        <rect
          key={name}
          x={key.x}
          y={key.y}
          width="8"
          height={key.height}
          rx="2"
          className={pressed.includes(name) ? styles.on : styles.off}
        />
      ))}
      <path className={styles.body} d="M3 17 Q16 23 29 17" />
    </svg>
  )
}
