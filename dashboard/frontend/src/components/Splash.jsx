import { LOGO_SIZE, logoPixels } from '../lib/logo.js'
import { pixelDelay } from '../lib/splash.js'
import styles from './Splash.module.css'

const PIXELS = logoPixels().map((pixel) => ({ ...pixel, delay: pixelDelay(pixel, LOGO_SIZE) }))
const TITLE = 'PIXEL ARCADE'
// Le lettere del titolo entrano dopo i pixel del logo, una ogni 70 ms (vedi INTRO_MS).
const TITLE_START_MS = 1100
const LETTER_MS = 70

/**
 * Schermata iniziale a tutto schermo: i pixel del logo cadono e si
 * compongono, poi entrano le lettere di «PIXEL ARCADE». Finché `ready` è
 * falso mostra «Caricamento», poi «PRESS START» lampeggiante; da lì un clic
 * chiama `onStart` (START e tastiera passano da App). `extras` sono gli
 * elementi delle estensioni, disegnati sopra la schermata.
 */
export default function Splash({ ready, onStart, extras = null }) {
  return (
    <div
      className={ready ? `${styles.splash} ${styles.ready}` : styles.splash}
      role="dialog"
      aria-label="Pixel Arcade"
      onClick={ready ? onStart : undefined}
    >
      <div className={styles.logoWrap}>
        <svg className={styles.logo} viewBox={`0 0 ${LOGO_SIZE} ${LOGO_SIZE}`} shapeRendering="crispEdges" aria-hidden="true">
          {PIXELS.map((pixel) => (
            <rect
              key={`${pixel.x},${pixel.y}`}
              className={styles.pixel}
              x={pixel.x}
              y={pixel.y}
              width="1"
              height="1"
              fill={pixel.fill}
              style={{ '--delay': `${pixel.delay}ms` }}
            />
          ))}
        </svg>
      </div>
      <h1 className={`pix ${styles.title}`} aria-label={TITLE}>
        {[...TITLE].map((char, index) => (
          <span
            key={index}
            className={styles.letter}
            style={{ '--delay': `${TITLE_START_MS + index * LETTER_MS}ms` }}
            aria-hidden="true"
          >
            {char === ' ' ? ' ' : char}
          </span>
        ))}
      </h1>
      <div className={`pix ${styles.status}`} aria-live="polite">
        {ready ? (
          <span className={styles.start}>PRESS START</span>
        ) : (
          <span className={styles.loading}>
            Caricamento
            <span className={styles.dots} aria-hidden="true">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </span>
        )}
      </div>
      {extras}
    </div>
  )
}
