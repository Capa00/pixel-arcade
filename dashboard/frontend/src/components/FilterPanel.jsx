import { useEffect, useRef } from 'react'
import { pointerActive } from '../input/pointer.js'
import styles from './FilterPanel.module.css'

/**
 * Pannello laterale dei filtri (livello 45, sotto i menu dei valori e la
 * tastiera a schermo; lascia visibile la barra comandi). Una riga per voce
 * `{id, label, value, active, kind, disabled, section}`: i filtri mostrano il
 * loro valore (`active` = filtro attivo, nel colore della console), le
 * azioni (`kind: 'action'`) solo l'etichetta. Una voce con `section` apre un
 * nuovo gruppo con quel titolo. `index` è la riga evidenziata; `count` il
 * testo accanto al titolo (per esempio «37 di 120 giochi»); `accent` il colore.
 * Joypad e tastiera li gestisce chi lo usa; col mouse il passaggio evidenzia
 * (`onHover(i)`), il clic sceglie (`onPick(i)`) e il clic fuori dal pannello
 * o sul pulsante ✕ chiude (`onClose`).
 */
export default function FilterPanel({ title, accent, rows, index, count, onHover, onPick, onClose }) {
  const listRef = useRef(null)

  useEffect(() => {
    const active = listRef.current && listRef.current.querySelector(`[data-row="${index}"]`)
    if (active) {
      active.scrollIntoView({ block: 'nearest' })
    }
  }, [index])

  const hover = (at) => (event) => {
    if (pointerActive(event)) {
      onHover(at)
    }
  }

  return (
    <div
      className={styles.overlay}
      style={accent ? { '--accent': accent } : undefined}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section className={styles.panel} role="dialog" aria-label={title}>
        <div className={styles.head}>
          <span className={`pix ${styles.title}`}>{title}</span>
          {count && <span className={styles.count}>{count}</span>}
          <button type="button" className={styles.close} aria-label="Chiudi" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <ul className={styles.rows} ref={listRef} role="listbox">
          {rows.map((row, at) => {
            const classes = [
              styles.row,
              at === index && styles.current,
              row.kind === 'action' && styles.action,
              row.disabled && styles.disabled,
            ].filter(Boolean)
            return (
              <li key={row.id} role="option" aria-selected={at === index} aria-disabled={row.disabled || undefined}>
                {row.section && <div className={`pix ${styles.section}`}>{row.section}</div>}
                <button
                  type="button"
                  data-row={at}
                  className={classes.join(' ')}
                  onPointerEnter={hover(at)}
                  onClick={() => onPick(at)}
                >
                  <span className={styles.label}>{row.label}</span>
                  {row.value && (
                    <span className={row.active ? `${styles.value} ${styles.on}` : styles.value}>{row.value}</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
