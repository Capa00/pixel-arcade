import { useEffect } from 'react'
import { INSERT_MS, sceneFor } from '../lib/insert.js'
import { play } from '../lib/sound.js'
import GameCover from './GameCover.jsx'
import PixelCover from './PixelCover.jsx'
import styles from './InsertAnimation.module.css'

/** Copertina sull'etichetta: l'immagine del gioco della libreria se c'è, altrimenti la pixel art. */
function Label({ system, game, className }) {
  if (!system) {
    return <span className={className} />
  }
  if (game && game.metaId) {
    return <GameCover key={`${game.id}-${game.metaId}`} system={system} game={game} className={className} />
  }
  return <PixelCover system={system} gameId={(game && game.id) || ''} className={className} />
}

/** Supporto del gioco: cartuccia (forma `piece`), disco, UMD o gettone. */
function Piece({ piece, system, game, title }) {
  if (piece === 'coin') {
    return <span className={`pix ${styles.coin}`}>¢</span>
  }
  if (piece === 'disc' || piece === 'umd') {
    return (
      <div className={styles.disc} data-piece={piece}>
        <span className={styles.discFace}>
          <Label system={system} game={game} className={styles.discArt} />
          <span className={styles.hole} />
        </span>
      </div>
    )
  }
  return (
    <div className={styles.cart} data-piece={piece}>
      <span className={styles.grip} />
      <span className={styles.label}>
        <Label system={system} game={game} className={styles.labelArt} />
        <span className={styles.labelTitle}>{title}</span>
      </span>
    </div>
  )
}

/** Schermo delle portatili: si accende e il titolo scende al centro, come all'accensione. */
function Screen({ title }) {
  return (
    <span className={styles.screen}>
      <span className={styles.glass}>
        <span className={`pix ${styles.screenText}`}>{title}</span>
      </span>
    </span>
  )
}

/** Console della scena, con le parti del movimento `motion`. */
function Console({ motion, title }) {
  switch (motion) {
    case 'front':
      return (
        <div className={styles.console}>
          <span className={styles.mouth} />
          <span className={styles.door} />
          <span className={styles.buttons} />
          <span className={styles.led} />
        </div>
      )
    case 'portrait':
    case 'landscape':
      return (
        <div className={styles.console}>
          <Screen title={title} />
          <span className={styles.dpad} />
          <span className={styles.keys} />
          <span className={styles.led} />
        </div>
      )
    case 'clam':
      return (
        <>
          <div className={styles.upper}>
            <Screen title={title} />
          </div>
          <div className={styles.console}>
            <span className={styles.screen}>
              <span className={styles.glass} />
            </span>
            <span className={styles.dpad} />
            <span className={styles.keys} />
            <span className={styles.led} />
          </div>
        </>
      )
    case 'lid':
      return (
        <>
          <div className={styles.lid} />
          <div className={styles.console}>
            <span className={styles.led} />
          </div>
        </>
      )
    case 'tray':
      return (
        <>
          <div className={styles.tray} />
          <div className={styles.console}>
            <span className={styles.traySlot} />
            <span className={styles.led} />
          </div>
        </>
      )
    case 'coin':
      return (
        <div className={styles.console}>
          <span className={styles.coinSlot} />
          <span className={`pix ${styles.credit}`}>CREDIT 1</span>
        </div>
      )
    default:
      return (
        <div className={styles.console}>
          <span className={styles.slot} />
          <span className={styles.power} />
          <span className={styles.led} />
        </div>
      )
  }
}

/**
 * Inserimento del gioco all'avvio (schermata di avvio, src/views/LaunchOverlay.jsx):
 * ogni console ha la sua scena e il suo movimento (src/lib/insert.js). La
 * cartuccia entra dal davanti o dall'alto, nelle portatili da dietro e lo
 * schermo si accende, il disco passa dal coperchio o dal cassetto, il gettone
 * scende nella fessura, con il suono dell'inserimento. Dura `INSERT_MS`, il
 * tempo minimo della schermata di avvio. `system` è la console, `game` il
 * gioco della libreria (per la copertina), se c'è.
 */
export default function InsertAnimation({ system, game, title }) {
  const { motion, body, piece, sound } = sceneFor(system)
  useEffect(() => {
    play(sound)
  }, [sound])
  return (
    <div
      className={styles.insert}
      style={{ '--accent': system ? system.accent : 'var(--text-1)', '--insert-ms': `${INSERT_MS}ms` }}
      aria-hidden="true"
    >
      <div className={styles.scene} data-motion={motion} data-body={body}>
        <div className={styles.track}>
          <div className={styles.piece}>
            <Piece piece={piece} system={system} game={game} title={title} />
          </div>
        </div>
        <Console motion={motion} title={title} />
      </div>
    </div>
  )
}
