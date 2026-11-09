import { useEffect, useRef } from 'react'
import styles from './ConsoleTabs.module.css'

/**
 * Una scheda per console; la riga colorata sotto indica quella attiva, tenuta sempre in vista.
 * Una scheda con `live` (la scheda TOURNAMENT con un torneo in corso) ha accanto un pallino rosso.
 * Una scheda con `logo` (console di un'estensione) mostra l'immagine al posto del nome.
 */
export default function ConsoleTabs({ systems, current, onSelect }) {
  const activeRef = useRef(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [current])

  return systems.map((system) => {
    const active = system.id === current
    return (
      <button
        key={system.id}
        ref={active ? activeRef : undefined}
        type="button"
        className={active ? `${styles.tab} ${styles.active}` : styles.tab}
        aria-current={active ? 'page' : undefined}
        style={{ '--accent': system.accent }}
        onClick={() => onSelect(system.id)}
      >
        {system.logo ? <img className={styles.logo} src={system.logo} alt={system.name} /> : system.name}
        {system.live && <span className={styles.live} aria-label="in corso" />}
        <span className={styles.line} />
      </button>
    )
  })
}
