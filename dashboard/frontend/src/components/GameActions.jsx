import { pointerActive } from '../input/pointer.js'
import { hasText } from '../lib/gameInfo.js'
import styles from './GameActions.module.css'

// Scritte del pulsante del testo per ogni vista: sovrapposte, così il pulsante è largo quanto la più lunga.
const TEXT_LABELS = [
  { panel: 'info', text: 'Descrizione' },
  { panel: 'text', text: 'Scheda' },
]
const TROPHY_LABELS = [
  { panel: 'info', text: 'Trofei' },
  { panel: 'trophies', text: 'Scheda' },
]

// Scritte sovrapposte di un pulsante che cambia vista: si vede quella del pannello attuale.
function swapLabels(labels, panel, shown) {
  return labels.map((label) => {
    const visible = label.panel === shown
    return (
      <span key={label.panel} className={visible ? undefined : styles.hidden} aria-hidden={!visible}>
        {label.text}
      </span>
    )
  })
}

/** Testo del pulsante del core secondo `coreStatus` del gioco. */
export function coreButtonLabel(game) {
  if (game.coreStatus === 'incompatible') {
    return 'Incompatibile'
  }
  if (!game.core) {
    return 'Core: automatico'
  }
  return game.coreStatus === 'trial' ? `Core: ${game.core} (in prova)` : `Core: ${game.core}`
}

/**
 * Azioni del gioco nella sezione in alto: «Gioca» con sotto, in piccolo, il
 * core (apre il menu dei core; con nessun core compatibile lo segnala in
 * rosso), se il gioco ha una descrizione o una trama «Descrizione» (o
 * «Scheda» quando `panel` è `text`), «Trofei» (o «Scheda» quando `panel` è
 * `trophies`), sempre della stessa larghezza, e «Altro», che apre il menu con
 * comandi, configurazione e playlist (src/views/LibraryLayer.jsx). `focus` è
 * l'azione evidenziata (`play`, `core`, `text`, `trophies`, `more`) dopo A su
 * un gioco della griglia; `onFocus(id)` al passaggio del mouse, `onActivate(id)` al clic.
 */
export default function GameActions({ game, focus, panel = 'info', onFocus, onActivate }) {
  const button = (id, className, children, label) => (
    <button
      type="button"
      className={focus === id ? `${className} ${styles.focused}` : className}
      aria-label={label}
      onPointerEnter={(event) => {
        if (pointerActive(event)) {
          onFocus(id)
        }
      }}
      onClick={() => onActivate(id)}
    >
      {children}
    </button>
  )
  const incompatible = game.coreStatus === 'incompatible'
  return (
    <div className={styles.actions}>
      <div className={styles.playColumn}>
        {button('play', styles.play, (
          <>
            <svg className={styles.playIcon} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
            Gioca
          </>
        ))}
        {button('core', incompatible ? `${styles.coreLink} ${styles.incompatible}` : styles.coreLink, (
          <>
            {incompatible && <span aria-hidden="true">⊘</span>}
            <span className={styles.coreName}>{incompatible ? 'Nessun core compatibile' : coreButtonLabel(game)}</span>
          </>
        ), 'Scegli il core')}
      </div>
      {hasText(game) && button('text', styles.core, (
        <>
          <span aria-hidden="true">≡</span>
          <span className={styles.swap}>{swapLabels(TEXT_LABELS, panel, panel === 'text' ? 'text' : 'info')}</span>
        </>
      ))}
      {button('trophies', styles.core, (
        <>
          <span aria-hidden="true">★</span>
          <span className={styles.swap}>{swapLabels(TROPHY_LABELS, panel, panel === 'trophies' ? 'trophies' : 'info')}</span>
        </>
      ))}
      {button('more', styles.core, (
        <>
          <span className={styles.dots} aria-hidden="true">•••</span>
          Altro
        </>
      ), 'Altro: comandi, configurazione, playlist')}
    </div>
  )
}
