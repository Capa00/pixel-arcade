import styles from './ExitOverlay.module.css'

const RADIUS = 44
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Chiusura della dashboard con START+SELECT tenuti (livello 50): anello di
 * avanzamento `progress` (0–1). Con `tapping` si è ancora nella fascia del
 * colpo breve: rilasciando, i giocatori escono e torna «PRESS START». Con
 * `closing` la richiesta è partita; con `background` il servizio resta acceso
 * per finire le attività in corso.
 */
function closingText(background) {
  return background
    ? 'Chrome si sta chiudendo. Il servizio resta acceso finché le attività in corso non sono finite.'
    : 'Chrome e il servizio si stanno chiudendo.'
}

function label(closing, tapping) {
  if (closing) {
    return 'CHIUSURA IN CORSO'
  }
  return tapping ? 'SCOLLEGA I GIOCATORI' : 'CHIUDI PIXEL ARCADE'
}

function hint(tapping) {
  return tapping
    ? 'Rilascia ora per tornare a PRESS START. Tieni premuto per chiudere.'
    : 'Tieni premuti START+SELECT per chiudere. Rilascia per annullare.'
}

export default function ExitOverlay({ progress, tapping = false, closing, background = false }) {
  const offset = CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, progress)))
  return (
    <div className={styles.overlay} role="status">
      <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden="true">
        <circle className={styles.track} cx="50" cy="50" r={RADIUS} />
        <circle
          className={styles.value}
          cx="50"
          cy="50"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <div className={`pix ${styles.label}`}>{label(closing, tapping)}</div>
      <div className={styles.text}>{closing ? closingText(background) : hint(tapping)}</div>
    </div>
  )
}
