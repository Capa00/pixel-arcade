import styles from './CrtOverlay.module.css'

/** Righe di scansione su tutta la dashboard (livello 40), attive se P1 ha il «Filtro CRT». */
export default function CrtOverlay() {
  return <div className={styles.scan} aria-hidden="true" />
}
