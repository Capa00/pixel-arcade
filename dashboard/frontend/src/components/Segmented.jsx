import styles from './Segmented.module.css'

/**
 * Scelta tra poche voci affiancate (difficoltà della demo). `item(value)`
 * restituisce le props di navigazione di ogni voce (`useFocusScope().item`).
 */
export default function Segmented({ options, value, label, item }) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label} style={{ '--count': options.length }}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === value}
          className={option === value ? `${styles.option} ${styles.on}` : styles.option}
          {...item(option)}
        >
          {option}
        </button>
      ))}
    </div>
  )
}
