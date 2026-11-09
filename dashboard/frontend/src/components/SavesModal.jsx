import { useEffect } from 'react'
import * as api from '../api/client.js'
import { useFocusScope } from '../input/useFocusScope.js'
import { coverStyle } from '../lib/covers.js'
import { dayTime } from '../lib/format.js'
import {
  SHARED, UNDO, firstEnabled, focusScope, hideBrokenImage, itemLabel, itemNote, saveItems, stepTab,
} from '../lib/saves.js'
import Avatar from './Avatar.jsx'
import GameCover from './GameCover.jsx'
import styles from './SavesModal.module.css'

function itemDate(item, now) {
  if (item.kind === 'new') {
    return 'Dall\'inizio'
  }
  if (item.kind === UNDO || item.kind === SHARED) {
    return ''
  }
  const at = Date.parse((item.save && item.save.updatedAt) || '')
  return Number.isNaN(at) ? '' : dayTime(at, now)
}

// Lucchetto a pixel degli slot protetti.
function Lock({ className }) {
  return (
    <svg className={className} viewBox="0 0 8 10" role="img" aria-label="Protetto" shapeRendering="crispEdges">
      <path fill="currentColor" fillRule="evenodd" d="M2 0h4v1h1v3h1v6H0V4h1V1h1zM2 1v3h4V1zM3 6v2h2V6z" />
    </svg>
  )
}

/**
 * Modale «Salvataggi» (livello 45, sotto la conferma) per il gioco `game`
 * della console `system`. `tabs` sono le schede dei giocatori
 * (src/lib/saves.js, `saveTabs`) e `tab` l'indice di quella attiva: LB/RB,
 * `[` `]` o il clic sulla scheda la cambiano con `onTab(indice)`, in modo
 * circolare. `mode` è `start` all'avvio (Riprendi, slot occupati, Nuova
 * partita) o `game` in partita (Sprint 04: tutti gli slot 1–9 in una
 * griglia 3×3 che riempie la finestra, con il numero dello slot). Con
 * `undo` vero, in partita sopra la griglia c'è «Annulla ultimo
 * caricamento». `copy` mostra gli slot 1–9 dell'altro giocatore come
 * destinazione di una copia, con `kicker` come titolo piccolo; gli slot
 * protetti non si scelgono. `profile` è la gestione dal Profilo (Sprint 06):
 * «Riprendi» e gli slot occupati con il loro numero, tutti selezionabili, e
 * con `onDeleteAll` il pulsante «Elimina tutti i salvataggi» in fondo. Uno
 * slot protetto ha il lucchetto. Le schede senza `tag` (Profilo, copia
 * verso un profilo) mostrano solo nome e colore del profilo. All'avvio i
 * salvataggi condivisi del gioco (`shared`) stanno in una riga a parte,
 * sotto le altre voci, a tutta larghezza: copertina a sinistra, titolo e
 * descrizione completa a destra. `coverGame` è il gioco completo della
 * libreria, per l'immagine della copertina (src/components/GameCover.jsx).
 *
 * Si naviga con `useFocusScope`, un focus per profilo; A o il clic su una
 * voce chiama `onPick(voce)`, B, Esc o il clic fuori chiamano `onClose`. Gli
 * stati creati con un altro core si vedono ma non si scelgono. `inputRef`
 * riceve la funzione che gestisce gli eventi (la usa RunLayer).
 */
export default function SavesModal({
  game,
  system,
  tabs,
  tab,
  mode = 'start',
  undo = false,
  kicker = 'SALVATAGGI',
  inputRef,
  onTab,
  onPick,
  onClose,
  onDeleteAll = null,
  thumbUrl = null,
  shared = [],
  coverGame = null,
}) {
  const current = tabs[Math.min(tab, tabs.length - 1)]
  const items = saveItems(current.slots, mode, { undo, shared })
  const firstShared = items.findIndex((item) => item.kind === SHARED)
  const first = firstEnabled(items)
  const scope = useFocusScope(focusScope(current))
  const cover = coverStyle(system, game.id)
  const now = Date.now()
  const inGame = mode === 'game' || mode === 'copy'
  const numbered = inGame || mode === 'profile'
  const withUndo = items.length > 0 && items[0].kind === UNDO

  const handle = (event) => {
    if (event.kind === 'release' || scope.handle(event) || event.kind !== 'press') {
      return true
    }
    if (event.button === 'lb' || event.button === 'rb') {
      onTab(stepTab(tab, event.button === 'lb' ? -1 : 1, tabs.length))
    } else if (event.button === 'b') {
      onClose()
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
      className={inGame ? `${styles.overlay} ${styles.game}` : styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        className={styles.panel}
        role="dialog"
        aria-label={`Salvataggi · ${game.title}`}
        style={{ '--player': current.playerColor, '--profile': current.account.color }}
      >
        <div className={styles.strip} />
        <header className={styles.head}>
          <div className={styles.headText}>
            <span className={`pix ${styles.kicker}`}>{kicker}</span>
            <h2 className={styles.title}>{game.title}</h2>
          </div>
          <div className={styles.player}>
            {current.tag && <span className={`pix ${styles.tag}`}>{current.tag}</span>}
            <Avatar id={current.account.id} name={current.account.name} className={styles.avatar} />
            <span className={styles.name}>{current.account.name}</span>
          </div>
        </header>

        {tabs.length > 1 && (
          <div className={styles.tabs} role="tablist">
            {tabs.map((entry, at) => (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={at === tab}
                className={at === tab ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                style={{ '--tab': entry.playerColor }}
                onClick={() => onTab(at)}
              >
                <span className={`pix ${styles.tabTag}`}>{entry.tag}</span>
                {entry.account.name}
              </button>
            ))}
          </div>
        )}

        <div className={withUndo ? `${styles.grid} ${styles.withUndo}` : styles.grid} ref={scope.ref}>
          {items.map((item, at) => {
            const note = itemNote(item)
            if (item.kind === SHARED) {
              return [
                at === firstShared && (
                  <div key="shared-head" className={`pix ${styles.sharedHead}`}>
                    SALVATAGGI CONDIVISI
                  </div>
                ),
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.card} ${styles.shared}`}
                  data-autofocus={item.id === first || undefined}
                  {...scope.item(item.id, () => onPick(item))}
                >
                  {system && coverGame ? (
                    <GameCover key={`${system.id}:${coverGame.id}`} system={system} game={coverGame} className={styles.sharedCover} />
                  ) : (
                    <span className={styles.sharedCover} style={{ background: cover.bg }} />
                  )}
                  <span className={styles.text}>
                    <span className={styles.label}>{itemLabel(item)}</span>
                    {note && <span className={styles.description}>{note}</span>}
                  </span>
                </button>,
              ]
            }
            if (item.kind === UNDO) {
              return (
                <button key={item.id} type="button" className={styles.undo} {...scope.item(item.id, () => onPick(item))}>
                  <span className={styles.undoIcon}>↶</span>
                  <span className={styles.label}>{itemLabel(item)}</span>
                  <span className={styles.note}>{note}</span>
                </button>
              )
            }
            const vacant = inGame && !item.save
            const classes = [
              styles.card,
              item.kind === 'new' && styles.fresh,
              vacant && styles.vacant,
              item.disabled && styles.disabled,
            ]
            return (
              <button
                key={item.id}
                type="button"
                className={classes.filter(Boolean).join(' ')}
                disabled={item.disabled}
                data-autofocus={item.id === first || undefined}
                {...(item.disabled ? {} : scope.item(item.id, () => onPick(item)))}
              >
                {numbered && item.slot > 0 && <span className={`pix ${styles.badge}`}>{item.slot}</span>}
                {item.save && item.save.protected && <Lock className={styles.lock} />}
                <span className={styles.thumb} style={item.kind === 'new' || vacant ? undefined : { background: cover.bg }}>
                  {item.save && item.save.thumb && (
                    <img
                      className={styles.image}
                      src={thumbUrl ? thumbUrl(item)
                        : api.saveThumbUrl(current.account.id, game.system, game.id, item.slot, item.save.updatedAt)}
                      alt=""
                      loading="lazy"
                      onError={hideBrokenImage}
                    />
                  )}
                  {(item.kind === 'new' || vacant) && <span className={`pix ${styles.plus}`}>+</span>}
                </span>
                <span className={styles.text}>
                  <span className={styles.label}>{itemLabel(item)}</span>
                  <span className={styles.date}>{itemDate(item, now)}</span>
                  {note && <span className={styles.note}>{note}</span>}
                </span>
              </button>
            )
          })}
          {onDeleteAll && (
            <button type="button" className={styles.deleteAll} {...scope.item('delete-all', onDeleteAll)}>
              Elimina tutti i salvataggi
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
