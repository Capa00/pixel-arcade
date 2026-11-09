import { useId } from 'react'
import { PIXEL_SPRITES, TEXT_SPRITES, pixelRuns, pixelSize } from '../lib/themes.js'
import styles from './Sprite.module.css'

function PixelSprite({ rows, colors, className }) {
  const { width, height } = pixelSize(rows)
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} shapeRendering="crispEdges" aria-hidden="true">
      {pixelRuns(rows).map((run) => (
        <rect
          key={`${run.x}-${run.y}`}
          x={run.x}
          y={run.y}
          width={run.width}
          height={1}
          fill={colors[run.color] || colors[colors.length - 1]}
        />
      ))}
    </svg>
  )
}

// Punti di una stella a 5 punte con raggi `outer` e `inner` centrata in (12, 12).
function starPoints(outer, inner) {
  const points = []
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 ? inner : outer
    const angle = (Math.PI / 5) * i - Math.PI / 2
    points.push([12 + radius * Math.cos(angle), 12 + radius * Math.sin(angle)])
  }
  return points
}

function VectorSprite({ name, colors, className }) {
  // Gli id di useId contengono «:», che non vanno bene dentro url(#…).
  const id = useId().replace(/:/g, '')
  const [first, second = first, third = second, fourth = third] = colors
  const line = { fill: 'none', stroke: first, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  let content = null
  switch (name) {
    case 'triangle':
      content = <polygon points="12,3.5 21,19.5 3,19.5" {...line} />
      break
    case 'circle':
      content = <circle cx="12" cy="12" r="8.5" {...line} />
      break
    case 'cross':
      content = <path d="M5 5l14 14M19 5L5 19" {...line} />
      break
    case 'square':
      content = <rect x="4" y="4" width="16" height="16" {...line} />
      break
    case 'disc':
      content = (
        <>
          <defs>
            <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={second} />
              <stop offset="0.5" stopColor={third} />
              <stop offset="1" stopColor={fourth} />
            </linearGradient>
          </defs>
          <circle cx="12" cy="12" r="11" fill={first} />
          <circle cx="12" cy="12" r="9" fill={`url(#${id}-shine)`} opacity="0.7" />
          <circle cx="12" cy="12" r="3.2" fill={first} />
          <circle cx="12" cy="12" r="1.6" style={{ fill: 'var(--bg)' }} />
        </>
      )
      break
    case 'cube':
      content = (
        <g className={styles.spin}>
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z M4 7.5l8 4.5 8-4.5 M12 12v9" {...line} strokeWidth="1.4" />
          <path d="M12 3v9" {...line} strokeWidth="0.8" strokeDasharray="1.5 1.5" />
          <circle cx="12" cy="3" r="1.2" fill={second} />
          <circle cx="20" cy="16.5" r="1.2" fill={second} />
          <circle cx="4" cy="16.5" r="1.2" fill={second} />
        </g>
      )
      break
    case 'polyStar': {
      const points = starPoints(11, 4.6)
      content = (
        <>
          <polygon points={points.map((point) => point.join(',')).join(' ')} fill={first} />
          {points.filter((_, index) => index % 2 === 1).map(([x, y]) => (
            <path key={`${x}-${y}`} d={`M12 12L${x} ${y}`} stroke={second} strokeWidth="0.8" />
          ))}
        </>
      )
      break
    }
    case 'swirl':
      content = <path d="M12 12m0-1a1 1 0 1 1-1 1 2.5 2.5 0 0 1 2.5-2.5 4 4 0 0 1 4 4 5.5 5.5 0 0 1-5.5 5.5 7 7 0 0 1-7-7 8.5 8.5 0 0 1 8.5-8.5" {...line} />
      break
    case 'bubble':
      content = (
        <>
          <circle cx="12" cy="12" r="9" fill="none" stroke={first} strokeWidth="1.4" />
          <path d="M7.5 9a5 5 0 0 1 3-3" fill="none" stroke={first} strokeWidth="1.6" strokeLinecap="round" />
        </>
      )
      break
    case 'orb':
      content = (
        <>
          <defs>
            <radialGradient id={`${id}-orb`} cx="0.35" cy="0.3" r="0.75">
              <stop offset="0" stopColor={second} />
              <stop offset="0.35" stopColor={first} />
              <stop offset="1" stopColor={first} stopOpacity="0.2" />
            </radialGradient>
          </defs>
          <circle cx="12" cy="12" r="10" fill={`url(#${id}-orb)`} />
        </>
      )
      break
    default:
      return null
  }
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {content}
    </svg>
  )
}

function TextSprite({ sprite, colors, className }) {
  return (
    <span className={`pix ${styles.text} ${className || ''}`} style={{ color: colors[0], '--chars': sprite.text.length }}>
      {sprite.text}
      {sprite.cursor && <span className={styles.cursor} style={{ background: colors[0] }} />}
    </span>
  )
}

/**
 * Uno sprite dei temi (src/lib/themes.js) nei colori `colors`, largo quanto
 * il contenitore: pixel art, forma vettoriale o testo in Silkscreen.
 */
export default function Sprite({ name, colors, className }) {
  if (PIXEL_SPRITES[name]) {
    return <PixelSprite rows={PIXEL_SPRITES[name]} colors={colors} className={className} />
  }
  if (TEXT_SPRITES[name]) {
    return <TextSprite sprite={TEXT_SPRITES[name]} colors={colors} className={className} />
  }
  return <VectorSprite name={name} colors={colors} className={className} />
}
