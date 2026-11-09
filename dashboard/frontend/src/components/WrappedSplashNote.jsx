import { useEffect, useState } from 'react'
import * as api from '../api/client.js'
import { periodPhrase } from '../lib/wrapped.js'
import styles from './WrappedSplashNote.module.css'

/**
 * Riga discreta sulla schermata «PRESS START»: «È pronto il Wrapped di casa
 * di settembre 2026», finché quello di casa più recente non è stato visto.
 * Si legge a ogni apertura della schermata (`ready` vero).
 */
export default function WrappedSplashNote({ ready }) {
  const [found, setFound] = useState(null)
  useEffect(() => {
    if (!ready) {
      return undefined
    }
    let alive = true
    api.wrappedList(null)
      .then((list) => {
        if (alive) {
          setFound((list.pending && list.periods.find((item) => item.period === list.pending)) || null)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [ready])

  if (!ready || !found) {
    return null
  }
  return (
    <div className={styles.note}>
      <span className={`pix ${styles.tag}`}>WRAPPED</span>
      È pronto il Wrapped di casa {periodPhrase(found.kind, found.label)}: entrate in due per guardarlo
    </div>
  )
}
