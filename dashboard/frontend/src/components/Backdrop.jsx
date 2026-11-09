import { useId } from 'react'
import Sprite from './Sprite.jsx'
import styles from './Backdrop.module.css'

// Scene: disegni sfumati in fondo allo schermo, dietro la griglia (viewBox 160×40, stirati in larghezza).
const W = 160
const H = 40

function checkerTiles() {
  const vanish = { x: W / 2, y: -12 }
  const rows = [0, 0.05, 0.12, 0.22, 0.36, 0.55, 0.78, 1].map((t) => t * H)
  const xAt = (base, y) => vanish.x + (base - vanish.x) * ((y - vanish.y) / (H - vanish.y))
  const tiles = []
  for (let row = 0; row < rows.length - 1; row += 1) {
    for (let col = -12; col < 12; col += 1) {
      const left = W / 2 + col * 14
      const right = left + 14
      const top = rows[row]
      const bottom = rows[row + 1]
      tiles.push({
        key: `${row}:${col}`,
        points: `${xAt(left, top)},${top} ${xAt(right, top)},${top} ${xAt(right, bottom)},${bottom} ${xAt(left, bottom)},${bottom}`,
        dark: (row + col) % 2 === 0,
      })
    }
  }
  return tiles
}

const CHECKER = checkerTiles()

function Scene({ name, colors }) {
  const id = useId().replace(/:/g, '')
  const [a, b, c, d = c] = colors
  switch (name) {
    case 'checker':
      return (
        <svg className={styles.scene} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {CHECKER.map((tile) => (
            <polygon key={tile.key} points={tile.points} fill={tile.dark ? b : a} />
          ))}
        </svg>
      )
    case 'hills':
      return (
        <svg className={styles.scene} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden="true">
          <polygon points="0,40 0,22 12,22 12,16 26,16 26,10 40,10 40,16 52,16 52,22 70,22 70,14 84,14 84,8 98,8 98,14 112,14 112,20 130,20 130,12 146,12 146,18 160,18 160,40" fill={b} />
          <polygon points="0,40 0,30 18,30 18,26 36,26 36,30 60,30 60,24 78,24 78,30 104,30 104,26 124,26 124,30 160,30 160,40" fill={c} />
        </svg>
      )
    case 'poly': {
      const palette = [a, b, c, d]
      const triangles = []
      for (let i = 0; i < 12; i += 1) {
        const x = i * 14
        triangles.push({ key: `u${i}`, points: `${x},40 ${x + 7},${16 + (i % 3) * 7} ${x + 14},40`, fill: palette[i % 4] })
        triangles.push({ key: `d${i}`, points: `${x + 7},${16 + (i % 3) * 7} ${x + 14},40 ${x + 21},${20 + ((i + 1) % 3) * 6}`, fill: palette[(i + 2) % 4] })
      }
      return (
        <svg className={styles.scene} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {triangles.map((triangle) => (
            <polygon key={triangle.key} points={triangle.points} fill={triangle.fill} />
          ))}
        </svg>
      )
    }
    case 'fog':
      return (
        <svg className={styles.scene} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-fog`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={c} stopOpacity="0" />
              <stop offset="1" stopColor={c} />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width={W} height={H} fill={`url(#${id}-fog)`} />
        </svg>
      )
    case 'horizon': {
      const lines = [2, 5, 9, 14, 21, 30, 40]
      const verticals = []
      for (let i = -10; i <= 10; i += 1) {
        verticals.push(W / 2 + i * 16)
      }
      return (
        <svg className={styles.scene} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={`M${W / 2 - 22} 0a22 22 0 0 1 44 0z`} fill={b} />
          {lines.map((y) => (
            <path key={`h${y}`} d={`M0 ${y}H${W}`} stroke={a} strokeWidth="0.6" />
          ))}
          {verticals.map((x) => (
            <path key={`v${x}`} d={`M${W / 2} 0L${x + (x - W / 2) * 2} ${H}`} stroke={a} strokeWidth="0.6" />
          ))}
        </svg>
      )
    }
    default:
      return null
  }
}

/**
 * Sfondo del tema (src/lib/themes.js), dietro a tutto il contenuto: luce
 * colorata, scena sfumata in basso e sprite che galleggiano piano nei
 * margini. Non intercetta mouse né focus.
 */
export default function Backdrop({ theme }) {
  return (
    <div
      className={styles.backdrop}
      aria-hidden="true"
      style={{ '--glow-a': theme.glow[0], '--glow-b': theme.glow[1], '--glow-c': `${theme.stripe[1]}26` }}
    >
      <div className={styles.glow} />
      {theme.scene && (
        <div className={styles.sceneBox}>
          <Scene name={theme.scene} colors={theme.stripe} />
        </div>
      )}
      <div className={styles.sprites}>
        {theme.sprites.map((sprite, index) => (
          <div
            key={sprite.key}
            className={styles.sprite}
            style={{
              left: `${sprite.x}%`,
              top: `${sprite.y}%`,
              '--w': `calc(${sprite.size}px * var(--u))`,
              animationDuration: `${sprite.duration}s`,
              animationDelay: `-${(index * 7) % sprite.duration}s`,
            }}
          >
            <Sprite name={sprite.sprite} colors={sprite.colors} className={styles.art} />
          </div>
        ))}
      </div>
    </div>
  )
}
