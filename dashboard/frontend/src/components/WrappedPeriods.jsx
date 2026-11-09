import { useEffect, useState } from 'react'
import * as api from '../api/client.js'
import { openWrapped } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import styles from './WrappedPeriods.module.css'

/**
 * Wrapped disponibili del profilo `account` (`null` = casa), dal più
 * recente: una scheda per mese o anno chiuso, con «Nuovo» se non è ancora
 * stato visto. A (o il clic) apre il Wrapped (src/views/WrappedLayer.jsx).
 * `item` è la funzione dell'ambito di navigazione di chi lo mostra; con
 * `autofocus` la prima scheda prende il focus all'apertura. L'elenco si
 * rilegge quando il Wrapped si chiude.
 */
export default function WrappedPeriods({ account, item, empty, autofocus = true }) {
  const { state, dispatch } = useApp()
  const [periods, setPeriods] = useState(null)
  const showing = Boolean(state.wrapped)
  useEffect(() => {
    if (showing) {
      return undefined
    }
    let alive = true
    api.wrappedList(account)
      .then((data) => alive && setPeriods(data.periods))
      .catch(() => alive && setPeriods([]))
    return () => {
      alive = false
    }
  }, [account, showing])

  if (!periods) {
    return <span className={styles.empty}>Caricamento…</span>
  }
  if (!periods.length) {
    return <span className={styles.empty}>{empty}</span>
  }
  return (
    <div className={styles.periods}>
      {periods.map((entry, position) => (
        <button
          key={entry.period}
          type="button"
          className={entry.kind === 'year' ? `${styles.period} ${styles.year}` : styles.period}
          data-autofocus={(autofocus && position === 0) || undefined}
          {...item(`wrapped-${entry.period}`, () => dispatch(openWrapped(account, entry.period)))}
        >
          <span className={`pix ${styles.kind}`}>{entry.kind === 'year' ? 'ANNO' : 'MESE'}</span>
          <span className={styles.label}>{entry.label}</span>
          {!entry.seen && <span className={`pix ${styles.fresh}`}>NUOVO</span>}
        </button>
      ))}
    </div>
  )
}
