import { useEffect } from 'react'
import { pointerActive } from '../input/pointer.js'
import { keyCenter, keyChar, layout } from './oskLayout.js'
import styles from './OnScreenKeyboard.module.css'

const TITLES = {
  search: 'Cerca',
}

const PLACEHOLDERS = {
  search: 'Titolo o nome del file',
}

// Colonna CSS di partenza e ampiezza del tasto, in mezze unità (righe centrate).
function gridColumn(rows, row, col) {
  const width = rows[row][col].width
  const start = (keyCenter(row, col, rows) - width / 2) * 2 + 1
  return `${start} / span ${width * 2}`
}

function keyLabel(key, upper) {
  return key.type === 'char' ? keyChar(key, upper) : key.label
}

/** Testo incollato senza a capo né tabulazioni. */
function cleanPaste(text) {
  return (text || '').replace(/[\r\n\t]+/g, '')
}

/** Vero se Chrome permette di leggere gli appunti (pagina sicura, come 127.0.0.1). */
function canReadClipboard() {
  return Boolean(navigator.clipboard && navigator.clipboard.readText)
}

/** Testo mostrato: pallini al posto dei caratteri di una password non rivelata. */
function shown(osk, text) {
  return osk.secret && !osk.reveal ? '•'.repeat([...text].length) : text
}

/**
 * Tastiera a schermo (livello 50). Non usa un `<input>`: joypad, clic sui
 * tasti e tastiera fisica passano tutti dal reducer (`state.osk`).
 * `onPress(row, col)` preme un tasto col clic, `onHover(row, col)` lo
 * evidenzia al passaggio del mouse, `onPaste(testo)` scrive il testo
 * incollato con Ctrl+V dalla tastiera fisica o con il pulsante «Incolla»
 * (solo mouse: legge gli appunti, e la prima volta Chrome chiede il
 * permesso); `onPasteError(messaggio)` segnala appunti vuoti o permesso
 * negato. `position`: `center`, `left` o `right`.
 * `osk.title` e `osk.placeholder`, se presenti, sostituiscono quelli del
 * `purpose`. Con un testo lungo resta visibile la parte vicina al cursore.
 * Il tasto `#+=` passa ai simboli, `ABC` torna alle lettere.
 */
export default function OnScreenKeyboard({ osk, onPress, onHover, onPaste, onPasteError }) {
  useEffect(() => {
    if (!onPaste) {
      return undefined
    }
    const paste = (event) => {
      const clean = cleanPaste(event.clipboardData ? event.clipboardData.getData('text') : '')
      if (clean) {
        event.preventDefault()
        onPaste(clean)
      }
    }
    window.addEventListener('paste', paste)
    return () => window.removeEventListener('paste', paste)
  }, [onPaste])
  const pasteClipboard = async () => {
    let text = ''
    try {
      text = cleanPaste(await navigator.clipboard.readText())
    } catch {
      if (onPasteError) {
        onPasteError('Chrome non ha dato il permesso di leggere gli appunti.')
      }
      return
    }
    if (text) {
      onPaste(text)
    } else if (onPasteError) {
      onPasteError('Negli appunti non c’è testo da incollare.')
    }
  }
  const rows = layout(osk)
  const before = shown(osk, osk.value.slice(0, osk.caret))
  const after = shown(osk, osk.value.slice(osk.caret))
  const title = osk.title || TITLES[osk.purpose] || 'Scrivi'
  const placeholder = osk.placeholder || PLACEHOLDERS[osk.purpose] || ''
  return (
    <div className={`${styles.overlay} ${styles[osk.position] || styles.center}`}>
      <section className={styles.panel} role="dialog" aria-label={title}>
        <div className={styles.top}>
          <span className={`pix ${styles.title}`}>{title}</span>
          <span className={styles.tools}>
            {onPaste && canReadClipboard() && (
              <button type="button" className={styles.paste} onClick={pasteClipboard}>
                Incolla
              </button>
            )}
            <span className={styles.counter}>
              {osk.value.length}/{osk.max}
            </span>
          </span>
        </div>
        <div className={styles.field}>
          <span className={styles.before}>
            <span className={styles.text}>{before}</span>
          </span>
          <span className={styles.caret} />
          <span className={styles.after}>{after}</span>
          {!osk.value && <span className={styles.placeholder}>{placeholder}</span>}
        </div>
        <div className={styles.keys}>
          {rows.map((keys, row) =>
            keys.map((key, col) => {
              const active = row === osk.row && col === osk.col
              const on = (key.type === 'shift' && osk.upper) || (key.type === 'reveal' && osk.reveal)
              const classes = [styles.key, styles[key.type]]
              if (active) {
                classes.push(styles.active)
              }
              if (on) {
                classes.push(styles.on)
              }
              return (
                <button
                  key={`${row}-${col}`}
                  type="button"
                  className={classes.join(' ')}
                  style={{ gridRow: row + 1, gridColumn: gridColumn(rows, row, col) }}
                  aria-pressed={key.type === 'shift' ? osk.upper : key.type === 'reveal' ? osk.reveal : undefined}
                  onPointerEnter={(event) => {
                    if (pointerActive(event)) {
                      onHover(row, col)
                    }
                  }}
                  onClick={() => onPress(row, col)}
                >
                  {keyLabel(key, osk.upper)}
                </button>
              )
            }),
          )}
        </div>
      </section>
    </div>
  )
}
