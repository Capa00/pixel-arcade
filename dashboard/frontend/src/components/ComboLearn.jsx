import { useEffect, useRef, useState } from 'react'
import { BUTTON_TITLES, CANCEL_HOLD_MS } from './buttonLearn.js'
import { buttonsFor } from '../input/mapping.js'
import { learnCombo } from '../input/saveCombo.js'
import styles from './ComboLearn.module.css'

/** Nome mostrato della combinazione, per esempio «SELECT + Grilletto sinistro». */
export function comboLabel(combo) {
  return Array.isArray(combo) ? combo.map((name) => BUTTON_TITLES[name] || name).join(' + ') : '—'
}

/**
 * Apprendimento di una combinazione in partita (Sprint 04 dei salvataggi),
 * si tengono premuti due tasti insieme sullo
 * stesso joypad. I tasti si leggono grezzi con `gamepad.onRaw` e diventano
 * tasti logici con i tasti di quel joypad (`padButtons`, `{id: {a: 0, …}}`;
 * i joypad non configurati non contano); START+SELECT, la croce e tasti
 * uguali sono rifiutati, e con `check(combinazione)` anche quelle per cui
 * restituisce un motivo. `title` e `prompt` sono i testi (predefiniti quelli
 * della combinazione dei salvataggi). Tenere premuto da solo per 1,5 s il
 * tasto «indietro» del joypad, Esc o il clic su «Annulla» chiamano
 * `onCancel`; alla fine `onDone(combinazione)`.
 */
export default function ComboLearn({
  padButtons,
  gamepad,
  onDone,
  onCancel,
  title = 'COMBINAZIONE SALVATAGGI',
  prompt = 'Tieni premuti insieme i due tasti che apriranno i salvataggi durante la partita',
  check = null,
}) {
  const [message, setMessage] = useState('')
  const done = useRef(onDone)
  const cancel = useRef(onCancel)
  const extra = useRef(check)

  useEffect(() => {
    done.current = onDone
    cancel.current = onCancel
    extra.current = check
  })

  useEffect(() => {
    const previous = new Map()
    const armed = new Set()
    let finished = false
    let timer = 0
    setMessage('')

    const off = gamepad.onRaw(({ pad, id, pressed }) => {
      const buttons = buttonsFor(padButtons, { id })
      if (!buttons) {
        return
      }
      const cancelIndex = buttons.b
      const before = previous.get(pad) || []
      previous.set(pad, pressed)
      // Si parte solo dopo che il joypad ha rilasciato tutto (il tasto usato per iniziare).
      if (!armed.has(pad)) {
        if (!pressed.length) {
          armed.add(pad)
        }
        return
      }
      if (finished) {
        return
      }
      const fresh = pressed.some((index) => !before.includes(index))
      const alone = pressed.length === 1 && pressed[0] === cancelIndex
      if (!alone) {
        window.clearTimeout(timer)
        timer = 0
      } else if (fresh) {
        // Il tasto B attuale tenuto da solo annulla; insieme a un altro vale per la combinazione.
        timer = window.setTimeout(() => {
          finished = true
          cancel.current()
        }, CANCEL_HOLD_MS)
      }
      if (pressed.length > 2) {
        setMessage('Solo due tasti insieme.')
      } else if (pressed.length === 2 && fresh) {
        const result = learnCombo(buttons, pressed)
        const error = result.error || (extra.current && extra.current(result.combo))
        if (error) {
          setMessage(error)
        } else {
          finished = true
          done.current(result.combo)
        }
      }
    })
    return () => {
      off()
      window.clearTimeout(timer)
    }
  }, [gamepad, padButtons])

  return (
    <div className={styles.overlay}>
      <section className={styles.panel} role="dialog" aria-label={title}>
        <div className={`pix ${styles.title}`}>{title}</div>
        <div className={styles.prompt}>{prompt}</div>
        <div className={styles.message} role="status">
          {message}
        </div>
        <p className={styles.help}>
          START+SELECT non si può usare: è il reset di molti giochi. Tieni premuto per 1,5 secondi il tasto Indietro attuale, oppure
          premi Esc, per annullare senza modifiche.
        </p>
        <button type="button" className={styles.cancel} onClick={() => cancel.current()}>
          Annulla
        </button>
      </section>
    </div>
  )
}
