import styles from './Toggle.module.css'

/**
 * Interruttore della demo: etichetta a sinistra, levetta verde se attivo.
 * `focusProps` sono le props di navigazione (`useFocusScope().item`): il clic
 * o A cambiano lo stato.
 */
export default function Toggle({ label, on, focusProps }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={on ? `${styles.toggle} ${styles.on}` : styles.toggle} {...focusProps}>
      <span className={styles.label}>{label}</span>
      <span className={styles.track}>
        <span className={styles.knob} />
      </span>
    </button>
  )
}
