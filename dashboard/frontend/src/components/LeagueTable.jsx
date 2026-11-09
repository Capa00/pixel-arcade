import { useEffect, useRef } from 'react'
import { leagueTable, standingValue, standingsColumns, standingsGlossary } from '../lib/tournament.js'
import Avatar from './Avatar.jsx'
import styles from './LeagueTable.module.css'

/**
 * Classifica del girone (README «Torneo»): una riga per giocatore con la
 * posizione (medaglia ai primi tre, «=» per chi è ancora pari dopo tutti i
 * criteri), il nome e le colonne di `standingsColumns`; sotto, il glossario
 * delle sigle mostrate. Il ritirato resta al suo posto, attenuato.
 *
 * `tournament` è il torneo con `standings` dal backend, `focus` l'indice
 * della riga col cursore (`null` = nessuna; la vista la segue), `onFocus(i)`
 * al clic. Con `dim` il cursore è nel calendario (segno attenuato).
 */
export default function LeagueTable({ tournament, focus, onFocus, dim = false }) {
  const listRef = useRef(null)
  const rows = leagueTable(tournament)
  const columns = standingsColumns(tournament)
  const template = `calc(44px * var(--u)) minmax(0, 1fr) repeat(${columns.length}, calc(38px * var(--u)))`

  useEffect(() => {
    const row = focus === null || focus === undefined ? null : listRef.current && listRef.current.children[focus]
    if (row) {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [focus])

  return (
    <div className={styles.table}>
      <div className={`pix ${styles.head}`} style={{ '--cols': template }}>
        <span className={styles.rank}>#</span>
        <span>GIOCATORE</span>
        {columns.map((column) => (
          <span key={column.id} className={styles.number}>{column.label}</span>
        ))}
      </div>
      <ul className={styles.rows} ref={listRef}>
        {rows.map((row, at) => {
          const classes = [styles.row]
          if (row.withdrawn) {
            classes.push(styles.withdrawn)
          }
          if (at === focus) {
            classes.push(dim ? styles.focusDim : styles.focus)
          }
          return (
            <li key={row.id}>
              <button
                type="button"
                className={classes.join(' ')}
                style={{ '--cols': template, '--player': row.player.color || 'var(--text-4)' }}
                onClick={onFocus ? () => onFocus(at) : undefined}
              >
                <span className={styles.rank}>
                  {row.medal ? (
                    <span className={`pix ${styles.medal} ${styles[row.medal]}`}>{row.mark}</span>
                  ) : (
                    <span className="pix">{row.mark}</span>
                  )}
                </span>
                <span className={styles.player}>
                  <Avatar id={row.player.id} name={row.player.name} className={styles.avatar}
                    style={{ background: row.player.color || undefined }} />
                  <span className={styles.name}>{row.player.name}</span>
                  {row.withdrawn && <span className={`pix ${styles.tag}`}>RITIRATO</span>}
                  {row.playoff && (
                    <span className={`pix ${styles.tag} ${styles.playoffTag}`}>{row.lots ? 'SORTEGGIO' : 'SPAREGGIO'}</span>
                  )}
                </span>
                {columns.map((column) => (
                  <span key={column.id}
                    className={column.id === 'points' ? `${styles.number} ${styles.points}` : styles.number}>
                    {standingValue(row, column.id)}
                  </span>
                ))}
              </button>
            </li>
          )
        })}
      </ul>
      <p className={styles.glossary}>{standingsGlossary(columns, rows)}</p>
    </div>
  )
}
