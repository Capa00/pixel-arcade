import { useState } from 'react'
import { avatarSrc } from '../lib/avatar.js'
import { useApp } from '../state/AppContext.jsx'
import styles from './Avatar.module.css'

/**
 * Avatar di un profilo: l'immagine Gravatar se il profilo `id` ne ha una
 * collegata, altrimenti (o se l'immagine non arriva, per esempio senza rete)
 * l'iniziale di `name`. Dimensioni, colore e forma vengono da `className` e
 * `style` di chi lo usa; con l'immagine lo sfondo diventa trasparente, perché
 * il colore del profilo non si veda dalle parti trasparenti di un PNG.
 * `children` si aggiungono sopra (il pallino del giocatore).
 */
export default function Avatar({ id, name, className, style, children }) {
  const { state } = useApp()
  const src = avatarSrc(state.accounts, id)
  // Indirizzo dell'ultima immagine non caricata: si torna all'iniziale.
  const [failed, setFailed] = useState(null)
  const image = src && src !== failed
  let classes = `${styles.avatar} ${className || ''}`
  let look = style
  if (image) {
    classes = `${classes} ${styles.withImage}`
    if (style && 'background' in style) {
      look = { ...style }
      delete look.background
    }
  }
  return (
    <span className={classes} style={look}>
      {image ? <img className={styles.image} src={src} alt="" onError={() => setFailed(src)} /> : (name || '?')[0]}
      {children}
    </span>
  )
}
