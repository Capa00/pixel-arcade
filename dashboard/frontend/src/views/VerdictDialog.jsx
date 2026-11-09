import FaceButton from '../components/FaceButton.jsx'
import PixelCover from '../components/PixelCover.jsx'
import { verdictNote } from '../lib/run.js'
import styles from './VerdictDialog.module.css'

/**
 * «Il gioco ha funzionato con <core>?» (livello 50), all'uscita da un core in
 * prova. Risponde qualsiasi joypad: A Sì, B No (li gestisce il livello di
 * gioco); col mouse i due pulsanti. Nessun timeout.
 */
export default function VerdictDialog({ question, game, system, busy, onAnswer }) {
  return (
    <div className={styles.overlay} style={{ '--accent': system ? system.accent : 'var(--text-1)' }}>
      <section className={styles.panel} role="alertdialog" aria-label="Il gioco ha funzionato?">
        {system && <PixelCover system={system} gameId={question.id} className={styles.cover} />}
        <div className={styles.body}>
          <div className={styles.title}>{game ? game.title : question.id}</div>
          <p className={styles.question}>
            Il gioco ha funzionato con <span className={styles.core}>{question.core}_libretro</span>?
          </p>
          <p className={styles.note}>{verdictNote(question)}</p>
          <div className={styles.choices}>
            <button type="button" className={`${styles.choice} ${styles.yes}`} disabled={busy} onClick={() => onAnswer(true)}>
              <FaceButton position="south" />
              Sì
            </button>
            <button type="button" className={styles.choice} disabled={busy} onClick={() => onAnswer(false)}>
              <FaceButton position="east" />
              No
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
