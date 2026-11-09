import { useEffect, useRef } from 'react'
import { pointerActive } from '../input/pointer.js'
import styles from './PickerMenu.module.css'

/**
 * Menu a comparsa (livello 50) con un elenco di voci `{id, label, note, disabled}`.
 * Una voce con `color` (per esempio un profilo) ha accanto un quadratino di quel colore.
 * Una voce `disabled` si vede sbiadita ma si può evidenziare e scegliere: la
 * vista spiega perché non è disponibile.
 * La voce evidenziata è `index`: croce e frecce la spostano (le gestisce la
 * vista), A o Invio sceglie, B o Esc chiude. Col mouse il passaggio
 * evidenzia (`onHover(i)`), il clic sceglie (`onPick(i)`) e il clic fuori dal
 * pannello chiude (`onClose`). Senza voci mostra `empty`.
 */
export default function PickerMenu({ title, items, index, empty, onHover, onPick, onClose }) {
  const listRef = useRef(null)

  useEffect(() => {
    const active = listRef.current && listRef.current.children[index]
    if (active) {
      active.scrollIntoView({ block: 'nearest' })
    }
  }, [index])

  return (
    <div
      className={styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section className={styles.panel} role="dialog" aria-label={title}>
        <div className={`pix ${styles.title}`}>{title}</div>
        {items.length ? (
          <ul className={styles.list} ref={listRef} role="listbox">
            {items.map((entry, at) => (
              <li key={entry.id} role="option" aria-selected={at === index} aria-disabled={entry.disabled || undefined}>
                <button
                  type="button"
                  className={[styles.item, at === index && styles.active, entry.disabled && styles.off].filter(Boolean).join(' ')}
                  onPointerEnter={(event) => {
                    if (pointerActive(event)) {
                      onHover(at)
                    }
                  }}
                  onClick={() => onPick(at)}
                >
                  <span className={styles.label}>
                    {entry.color && <span className={styles.swatch} style={{ background: entry.color }} />}
                    {entry.label}
                  </span>
                  {entry.note && <span className={styles.note}>{entry.note}</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>{empty}</p>
        )}
      </section>
    </div>
  )
}
