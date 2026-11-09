import { useEffect } from 'react'
import * as api from '../api/client.js'
import { useFocusScope } from '../input/useFocusScope.js'
import { coverStyle } from '../lib/covers.js'
import { PREVIOUS, rescueItems } from '../lib/rescue.js'
import { hideBrokenImage } from '../lib/saves.js'
import { PLAYER_INFO } from '../state/players.js'
import styles from './SavesModal.module.css'

/**
 * Modale «Da dove riprendere» del soccorso dopo un blocco (fase `rescue`,
 * src/lib/rescue.js), con le schede della modale dei salvataggi: gli stati
 * periodici di questa partita e quelli delle partite prima, dal più recente,
 * con la miniatura; in fondo «Riprendi di prima». `version` cambia la cache
 * delle miniature a ogni soccorso. A o il clic su una voce chiama
 * `onPick(id)`, B, Esc o il clic fuori `onPick('previous')`: il «Riprendi»
 * resta com'era. `inputRef` riceve la funzione che gestisce gli eventi.
 */
export default function RescueModal({ question, game, version, inputRef, onPick }) {
  const items = rescueItems(question)
  const scope = useFocusScope('rescue')
  const cover = coverStyle(game.system, game.id)

  const handle = (event) => {
    if (event.kind === 'release' || scope.handle(event) || event.kind !== 'press') {
      return true
    }
    if (event.button === 'b') {
      onPick(PREVIOUS)
    }
    return true
  }

  useEffect(() => {
    inputRef.current = handle
  })

  useEffect(() => () => {
    inputRef.current = null
  }, [inputRef])

  return (
    <div
      className={styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onPick(PREVIOUS)
        }
      }}
    >
      <section
        className={styles.panel}
        role="dialog"
        aria-label={`Da dove riprendere · ${game.title}`}
        style={{ '--player': PLAYER_INFO.p1.color }}
      >
        <div className={styles.strip} />
        <header className={styles.head}>
          <div className={styles.headText}>
            <span className={`pix ${styles.kicker}`}>DA DOVE RIPRENDERE?</span>
            <h2 className={styles.title}>{game.title}</h2>
          </div>
        </header>
        <div className={styles.grid} ref={scope.ref}>
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={item.id === PREVIOUS ? `${styles.card} ${styles.fresh}` : styles.card}
              data-autofocus={index === 0 || undefined}
              {...scope.item(item.id, () => onPick(item.id))}
            >
              <span className={styles.thumb} style={item.id === PREVIOUS ? undefined : { background: cover.bg }}>
                {item.thumb && (
                  <img
                    className={styles.image}
                    src={api.rescueThumbUrl(item.id, version)}
                    alt=""
                    loading="lazy"
                    onError={hideBrokenImage}
                  />
                )}
                {item.id === PREVIOUS && <span className={`pix ${styles.plus}`}>↶</span>}
              </span>
              <span className={styles.text}>
                <span className={styles.label}>{item.label}</span>
                <span className={styles.note}>{item.note}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
