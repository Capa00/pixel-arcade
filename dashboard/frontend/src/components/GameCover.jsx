import { useState } from 'react'
import PixelCover from './PixelCover.jsx'
import { IMAGE_LABELS, hasImages, imageUrl } from '../lib/gameInfo.js'
import styles from './GameCover.module.css'

/**
 * Copertina di un gioco: l'immagine `kind` (`cover`, `title`, `snap`) da
 * `GET /api/image` se il gioco ne ha, sopra la copertina pixel art. Se manca
 * la copertina il backend dà il titolo, poi la schermata (vedi `imageUrl`).
 * Finché l'immagine non è caricata, o se non arriva, resta la pixel art con i testi
 * `children`; `overlay` (per esempio i pallini dei preferiti) compare sempre.
 * `lazy` rimanda il caricamento a quando la copertina è visibile. Va montata
 * con una `key` per gioco e immagine, così lo stato riparte a ogni cambio.
 */
export default function GameCover({ system, game, kind = 'cover', lazy = false, className, overlay, children }) {
  const [status, setStatus] = useState('loading')
  const images = hasImages(game)
  const ready = images && status === 'ready'
  return (
    <PixelCover system={system} gameId={game.id} className={className}>
      {!ready && children}
      {images && status !== 'error' && (
        <img
          className={ready ? styles.picture : `${styles.picture} ${styles.hidden}`}
          src={imageUrl(system.id, game, kind)}
          alt={`${game.title}: ${IMAGE_LABELS[kind].toLowerCase()}`}
          loading={lazy ? 'lazy' : 'eager'}
          decoding="async"
          draggable="false"
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('error')}
        />
      )}
      {overlay}
    </PixelCover>
  )
}
