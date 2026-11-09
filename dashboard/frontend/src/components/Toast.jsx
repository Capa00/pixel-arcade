import styles from './Toast.module.css'

/** Notifica in basso al centro, sopra la barra comandi; `variant` vale `info` o `error`. */
export default function Toast({ message, variant = 'info' }) {
  return (
    <div className={variant === 'error' ? `${styles.toast} ${styles.error}` : styles.toast} role="status">
      {message}
    </div>
  )
}
