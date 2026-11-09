import GameCover from './GameCover.jsx'
import { CUP } from './TrophyMark.jsx'
import styles from './Leaderboard.module.css'

/** Coppa a pixel del podio: `tone` è `gold`, `silver` o `bronze`. */
export function Cup({ tone, className = '' }) {
  const label = { gold: 'Primo posto', silver: 'Secondo posto', bronze: 'Terzo posto' }[tone]
  return (
    <svg className={`${styles.cup} ${styles[tone]} ${className}`} viewBox="-1 -1 12 12" role="img" aria-label={label}>
      <title>{label}</title>
      <path d={CUP} fill="currentColor" shapeRendering="crispEdges" />
    </svg>
  )
}

/**
 * Card di un gioco: copertina 3:4 e sotto titolo e `detail`. È una voce
 * della navigazione (`focus` = props di `item`); `row` e `col` dicono la fila
 * di card e la posizione, per ← → tra le card (src/components/Leaderboard.jsx).
 * `badge` è un'etichetta sulla copertina (durata, data, console); `big` la
 * allarga (gioco della sfida).
 */
export function GameCard({ summary, systems, detail, badge, focus, row, col, big = false }) {
  const system = systems.find((entry) => entry.id === summary.system) || null
  return (
    <button
      type="button"
      className={big ? `${styles.card} ${styles.bigCard}` : styles.card}
      data-row={row}
      data-col={col}
      {...focus}
    >
      <GameCover
        key={`${summary.system}/${summary.id}`}
        system={system || { id: summary.system }}
        game={summary}
        lazy
        className={styles.cardCover}
        overlay={badge ? <span className={styles.cardBadge}>{badge}</span> : null}
      />
      <span className={styles.cardTitle}>{summary.title}</span>
      {detail && <span className={styles.cardDetail}>{detail}</span>}
    </button>
  )
}
