import { pointerActive } from '../input/pointer.js'
import { YES_NO } from './confirmChoices.js'
import styles from './ConfirmDialog.module.css'

const TONES = {
  danger: styles.danger,
  ok: styles.ok,
}

/**
 * Finestra di conferma (livello 50). `choices` sono le scelte da sinistra a
 * destra (predefinite Sì/No, src/components/confirmChoices.js), `choice` è
 * quella evidenziata: croce e frecce la cambiano, A o Invio conferma, B o Esc
 * vale `cancel` (li gestisce la vista). Col mouse: passaggio (`onHover`),
 * clic (`onChoose`); il clic fuori dal pannello vale `cancel`.
 */
export default function ConfirmDialog({ text, choices = YES_NO, choice, cancel = 'no', onHover, onChoose }) {
  const panel = choices.length > 2 ? `${styles.panel} ${styles.wide}` : styles.panel
  return (
    <div
      className={styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onChoose(cancel)
        }
      }}
    >
      <section className={panel} role="alertdialog" aria-label={text}>
        <p className={styles.text}>{text}</p>
        <div className={styles.choices}>
          {choices.map((entry) => {
            const classes = [styles.choice, TONES[entry.tone], entry.id === choice && styles.active].filter(Boolean)
            return (
              <button
                key={entry.id}
                type="button"
                className={classes.join(' ')}
                onPointerEnter={(event) => {
                  if (pointerActive(event)) {
                    onHover(entry.id)
                  }
                }}
                onClick={() => onChoose(entry.id)}
              >
                {entry.label}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
