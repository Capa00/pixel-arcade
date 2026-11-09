import ShoulderButton from './ShoulderButton.jsx'
import styles from './SeriesRankings.module.css'

// Classifiche della serie (README «Torneo»), nell'ordine in cui le spalle le scorrono.
export const RANKINGS = [
  { id: 'medals', label: 'Medagliere' },
  { id: 'points', label: 'Punti' },
  { id: 'matches', label: 'Incontri' },
]

/** Classifica successiva (`dir` 1) o precedente (-1), in giro. */
export function stepRanking(current, dir) {
  const at = Math.max(0, RANKINGS.findIndex((entry) => entry.id === current))
  return RANKINGS[(at + dir + RANKINGS.length) % RANKINGS.length].id
}

function wins(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',')
}

// Colonne di ogni classifica: `[intestazione, valore]`.
const COLUMNS = {
  medals: [['1°', (row) => row.gold], ['2°', (row) => row.silver], ['3°', (row) => row.bronze]],
  points: [['Punti', (row) => row.points], ['1°', (row) => row.gold], ['Ed.', (row) => row.editions]],
  matches: [['Vinti', (row) => wins(row.wins)], ['Giocati', (row) => row.played], ['%', (row) => `${row.pct}%`]],
}

/**
 * Classifiche e albo d'oro di una serie (`series` di `GET /api/tournament`):
 * la classifica `tab` con le spalle per cambiarla e, sotto, i vincitori di
 * ogni edizione conclusa.
 */
export default function SeriesRankings({ series, tab }) {
  const rows = (series.rankings && series.rankings[tab]) || []
  const columns = COLUMNS[tab] || COLUMNS.medals
  return (
    <div className={styles.rankings}>
      <div className={styles.tabs}>
        <ShoulderButton pressed={['lb']} />
        {RANKINGS.map((entry) => (
          <span key={entry.id} className={entry.id === tab ? `${styles.tab} ${styles.on}` : styles.tab}>
            {entry.label}
          </span>
        ))}
        <ShoulderButton pressed={['rb']} />
      </div>
      {rows.length === 0 ? (
        <p className={styles.empty}>La classifica parte con la prima edizione conclusa.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.position}>#</th>
              <th className={styles.name}>Profilo</th>
              {columns.map(([label]) => <th key={label} className={styles.value}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td className={styles.position}>
                  {index > 0 && rows[index - 1].position === row.position ? '' : `${row.position}°`}
                </td>
                <td className={styles.name}>
                  <span className={styles.swatch} style={{ background: row.color || 'var(--text-4)' }} />
                  {row.name}
                </td>
                {columns.map(([label, value]) => <td key={label} className={styles.value}>{value(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {series.honours && series.honours.length > 0 && (
        <>
          <span className={`pix ${styles.section}`}>ALBO D’ORO</span>
          <ul className={styles.honours}>
            {series.honours.map((entry) => (
              <li key={entry.id} className={styles.honour}>
                <span className={styles.edition}>{entry.edition ? `${entry.edition}ª` : '–'}</span>
                <span className={styles.winners}>
                  {entry.winners.length ? entry.winners.map((winner) => (
                    <span key={winner.id} className={styles.winner}>
                      <span className={styles.swatch} style={{ background: winner.color || 'var(--text-4)' }} />
                      {winner.name}
                    </span>
                  )) : 'Nessun vincitore'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
