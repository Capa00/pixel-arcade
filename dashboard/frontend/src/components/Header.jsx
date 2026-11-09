import { useEffect, useRef } from 'react'
import Logo from './Logo.jsx'
import styles from './Header.module.css'

/**
 * Intestazione: logo, schede console (`tabs`), elementi delle estensioni
 * (`extras`, per esempio un pulsante fisso) e slot dei giocatori P1/P2 (`slots`).
 * La rotellina del mouse sulle schede le fa scorrere in orizzontale.
 */
export default function Header({ tabs, extras, slots }) {
  const tabsRef = useRef(null)
  const hasExtras = Array.isArray(extras) ? extras.some(Boolean) : Boolean(extras)
  useEffect(() => {
    const nav = tabsRef.current
    if (!nav) {
      return undefined
    }
    // Ascoltatore non passivo: serve preventDefault per non passare la rotellina alla pagina.
    const handleWheel = (event) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (!delta || nav.scrollWidth <= nav.clientWidth) {
        return
      }
      event.preventDefault()
      nav.scrollLeft += event.deltaMode === 1 ? delta * 16 : delta
    }
    nav.addEventListener('wheel', handleWheel, { passive: false })
    return () => nav.removeEventListener('wheel', handleWheel)
  }, [])

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <Logo className={styles.logo} />
        <div className={`pix ${styles.title}`}>PIXEL ARCADE</div>
      </div>
      <nav ref={tabsRef} className={styles.tabs} aria-label="Console">
        {tabs}
      </nav>
      {hasExtras && <div className={styles.extras}>{extras}</div>}
      <div className={styles.slots}>{slots}</div>
    </header>
  )
}
