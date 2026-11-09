import { coverStyle } from '../lib/covers.js'
import { duration, relativeDay } from '../lib/format.js'
import styles from './RecentRow.module.css'

/**
 * Riga di «Giocati di recente»: quadrato col colore della copertina, titolo,
 * console, giorno relativo e durata dell'ultima partita (`entry` =
 * `{game, at, seconds}`, `summary` = riepilogo del gioco). `focusProps`
 * rendono la riga selezionabile (A porta al gioco nella libreria).
 */
export default function RecentRow({ entry, summary, system, now, focusProps }) {
  const at = Date.parse(entry.at)
  return (
    <button type="button" className={summary.missing ? `${styles.row} ${styles.missing}` : styles.row} {...focusProps}>
      <span className={styles.swatch} style={{ background: coverStyle(system, summary.id).bg }} />
      <span className={styles.title}>{summary.title}</span>
      <span className={styles.system}>{summary.systemFull}</span>
      <span className={styles.when}>{Number.isNaN(at) ? '' : relativeDay(at, now)}</span>
      <span className={styles.time}>{duration(entry.seconds)}</span>
    </button>
  )
}
