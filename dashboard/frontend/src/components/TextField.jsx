import styles from './TextField.module.css'

/**
 * Campo di testo delle Impostazioni: etichetta e valore, oppure il
 * suggerimento `placeholder` se vuoto. Non si scrive qui: `focus` sono le
 * props di `useFocusScope().item(id, onActivate)`, e A, Invio o il clic
 * aprono la tastiera a schermo (`purpose: 'field'`) tramite `onActivate`.
 */
export default function TextField({ label, value, placeholder, note, focus, autoFocus = false }) {
  const empty = value === '' || value === null || value === undefined
  return (
    <button type="button" className={styles.field} data-autofocus={autoFocus || undefined} {...focus}>
      <span className={styles.label}>{label}</span>
      <span className={empty ? `${styles.value} ${styles.placeholder}` : styles.value}>
        {empty ? placeholder || '—' : String(value)}
      </span>
      {note && <span className={styles.note}>{note}</span>}
    </button>
  )
}
