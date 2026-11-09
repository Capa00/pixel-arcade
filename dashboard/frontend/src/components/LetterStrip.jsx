import { LETTERS } from '../lib/search.js'
import styles from './LetterStrip.module.css'

/**
 * Striscia `# A–Z`: evidenzia l'iniziale del gioco selezionato (`current`)
 * con l'accento della console; le iniziali senza giochi (non in `present`)
 * sono in grigio. Col mouse, il clic su una lettera presente salta lì.
 */
export default function LetterStrip({ current, present, onJump }) {
  return (
    <div className={`pix ${styles.strip}`} aria-label="Iniziali">
      {LETTERS.map((letter) => {
        const has = present.has(letter)
        const classes = [styles.letter]
        if (!has) {
          classes.push(styles.missing)
        }
        if (letter === current) {
          classes.push(styles.current)
        }
        return (
          <button
            key={letter}
            type="button"
            className={classes.join(' ')}
            disabled={!has}
            aria-current={letter === current ? 'true' : undefined}
            onClick={() => onJump(letter)}
          >
            {letter}
          </button>
        )
      })}
    </div>
  )
}
