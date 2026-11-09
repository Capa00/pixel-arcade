import styles from './FaceButton.module.css'

// Posizione nel rombo dei quattro tasti frontali, indipendente dalla marca del joypad.
const DOTS = {
  north: { cx: 12, cy: 5 },
  east: { cx: 19, cy: 12 },
  south: { cx: 12, cy: 19 },
  west: { cx: 5, cy: 12 },
}

/**
 * Tasto frontale del joypad come rombo di quattro pallini, con pieno quello
 * in posizione `position` (`north`, `east`, `south`, `west`).
 */
export default function FaceButton({ position }) {
  return (
    <svg className={styles.glyph} viewBox="0 0 24 24" aria-hidden="true">
      {Object.entries(DOTS).map(([name, dot]) => (
        <circle
          key={name}
          cx={dot.cx}
          cy={dot.cy}
          r="3.2"
          className={name === position ? styles.on : styles.off}
        />
      ))}
    </svg>
  )
}
