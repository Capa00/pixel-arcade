import { coverStyle } from '../lib/covers.js'
import styles from './PixelCover.module.css'

/**
 * Copertina pixel art della demo (sole, montagne, suolo) nel colore del
 * gioco. I testi sovrapposti arrivano come `children` e usano `--ink`.
 */
export default function PixelCover({ system, gameId, className, children }) {
  const cover = coverStyle(system, gameId)
  return (
    <span
      className={className ? `${styles.cover} ${className}` : styles.cover}
      style={{
        '--cover-bg': cover.bg,
        '--ink': cover.ink,
        '--flip': cover.flip,
        '--glow': cover.glow,
      }}
    >
      <svg
        className={styles.art}
        viewBox="0 0 20 20"
        preserveAspectRatio="xMidYMax slice"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <g fill="currentColor" opacity="0.32">
          <rect x="13" y="3" width="3" height="1" />
          <rect x="12" y="4" width="5" height="3" />
          <rect x="13" y="7" width="3" height="1" />
        </g>
        <g fill="currentColor" opacity="0.16">
          <rect x="0" y="13" width="6" height="7" />
          <rect x="2" y="11" width="3" height="2" />
          <rect x="6" y="15" width="5" height="5" />
          <rect x="10" y="12" width="4" height="8" />
          <rect x="11" y="10" width="2" height="2" />
          <rect x="14" y="14" width="6" height="6" />
        </g>
        <rect x="0" y="17" width="20" height="3" fill="currentColor" opacity="0.26" />
      </svg>
      {children}
    </span>
  )
}
