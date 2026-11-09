import styles from './TrophyMark.module.css'

// Coppa a pixel (10×10): corpo, manici, stelo e base.
export const CUP = 'M2 0h6v5H2zM3 5h4v1H3zM0 1h2v1H0zM0 2h1v2H0zM1 4h1v1H1zM8 1h2v1H8zM9 2h1v2H9zM8 4h1v1H8zM4 6h2v2H4zM2 8h6v2H2z'

/**
 * Compatibilità del gioco con RetroAchievements: coppa dorata se `value` è
 * vero, coppa spenta e barrata se è falso, niente se non si sa (`null` o
 * assente).
 */
export default function TrophyMark({ value, className = '' }) {
  if (value !== true && value !== false) {
    return null
  }
  const label = value ? 'Compatibile con RetroAchievements' : 'Non compatibile con RetroAchievements'
  return (
    <svg
      className={`${styles.mark} ${value ? styles.yes : styles.no} ${className}`}
      viewBox="-1 -1 12 12"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <path className={styles.cup} d={CUP} shapeRendering="crispEdges" />
      {!value && (
        <>
          <line className={styles.strikeBack} x1="-0.5" y1="10.5" x2="10.5" y2="-0.5" />
          <line className={styles.strike} x1="-0.5" y1="10.5" x2="10.5" y2="-0.5" />
        </>
      )}
    </svg>
  )
}
