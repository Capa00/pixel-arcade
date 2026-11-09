import { useEffect, useState } from 'react'
import { layoutFor } from '../lib/layout.js'
import styles from './Stage.module.css'

function currentLayout() {
  return layoutFor(window.innerWidth, window.innerHeight)
}

/** Layout della finestra (`{name, columns, unit}`), aggiornato al ridimensionamento. */
export function useWindowLayout() {
  const [layout, setLayout] = useState(currentLayout)

  useEffect(() => {
    const update = () => setLayout(currentLayout())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return layout
}

/**
 * Contenitore a tutto schermo. Espone la scala delle misure (`--u`), il numero
 * di colonne (`--columns`) e il nome del layout (`data-layout`).
 */
export default function Stage({ layout, children }) {
  return (
    <div
      className={styles.stage}
      data-layout={layout.name}
      style={{ '--u': layout.unit, '--columns': layout.columns }}
    >
      {children}
    </div>
  )
}
