import { useEffect, useState } from 'react'
import { useFocusScope } from '../input/useFocusScope.js'
import {
  BUTTON_ICONS,
  BUTTON_TITLES,
  LABEL_MAX,
  PAD_TO_RETROPAD,
  assignButton,
  controlPlayers,
  controlRows,
  controlsDraft,
  rowTitle,
  setLabel,
} from '../lib/controls.js'
import { openKeyboard } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import { PLAYER_INFO } from '../state/players.js'
import FaceButton from './FaceButton.jsx'
import ShoulderButton from './ShoulderButton.jsx'
import styles from './ControlsModal.module.css'

const LABEL_TARGET = 'controlLabel'
const DIRECTIONS = new Set(['up', 'down', 'left', 'right'])

/** Icona del tasto fisico: rombo dei frontali, spalle o testo. */
function ButtonIcon({ button }) {
  const icon = BUTTON_ICONS[button] || { text: button.toUpperCase() }
  if (icon.face) {
    return <FaceButton position={icon.face} />
  }
  if (icon.shoulder) {
    return <ShoulderButton pressed={[icon.shoulder]} />
  }
  return <span className={`pix ${styles.pill}`}>{icon.text}</span>
}

/**
 * Finestra «Comandi» di un gioco (livello 45). `controls` è la risposta di
 * `GET /api/game/controls` (src/lib/controls.js). Una scheda per giocatore
 * con dei nomi dei tasti (LB/RB, `[` `]` o clic), una riga per azione: il
 * nome dato dal core, quello scritto a mano e il tasto del joypad che la
 * attiva. A o il clic su una riga aspetta il nuovo tasto (frontali, dorsali
 * o grilletti; se è già usato le due azioni si scambiano; la croce
 * annulla), Y scrive il nome con la tastiera a schermo, X torna al tasto
 * predefinito. START, SELECT, L3 e R3 si vedono ma non si cambiano.
 *
 * In fondo «Salva» (`onSave(bozza)`) e `closeLabel` (`onClose`, anche con
 * B). `present` sono i giocatori presenti (`['p1']`, `['p1', 'p2']`): solo
 * loro hanno una scheda. `mode` è `library` nella libreria o `game` nella finestra sopra il
 * gioco. `busy` blocca i comandi durante il salvataggio; `onContext`
 * riceve `controls`, `controlsGame` o `controlsLearn` per la legenda. `inputRef` riceve
 * la funzione che gestisce gli eventi.
 */
export default function ControlsModal({
  title,
  controls,
  mode = 'library',
  closeLabel = 'Annulla',
  present,
  busy = false,
  inputRef,
  onContext,
  onSave,
  onClose,
}) {
  const { state, dispatch } = useApp()
  const players = controlPlayers(controls, present)
  const [draft, setDraft] = useState(() => controlsDraft(controls))
  const [tab, setTab] = useState(0)
  const [learning, setLearning] = useState(null)
  // Azione di cui si sta scrivendo il nome: `{player, action}`.
  const [naming, setNaming] = useState(null)
  const player = players[Math.min(tab, players.length - 1)]
  const rows = controlRows(controls, draft, player)
  const scope = useFocusScope(`controls-${player}`)
  const inGame = mode === 'game'

  useEffect(() => {
    if (onContext) {
      onContext(learning ? 'controlsLearn' : inGame ? 'controlsGame' : 'controls')
    }
  }, [learning, inGame, onContext])

  // Tastiera chiusa: con la conferma il testo diventa il nome dell'azione.
  const keyboardText = state.keyboardText
  const keyboardOpen = Boolean(state.osk)
  useEffect(() => {
    if (!naming || keyboardOpen) {
      return
    }
    setNaming(null)
    const target = keyboardText && keyboardText.target
    if (target && target.kind === LABEL_TARGET && target.player === naming.player && target.action === naming.action) {
      setDraft((current) => setLabel(current, naming.player, naming.action, keyboardText.value))
    }
  }, [naming, keyboardOpen, keyboardText])

  const learn = (row) => {
    if (!busy && row.editable) {
      setLearning(row.action)
    }
  }

  const name = (row) => {
    if (busy) {
      return
    }
    setNaming({ player, action: row.action })
    dispatch(openKeyboard('text', {
      value: row.label,
      max: LABEL_MAX,
      title: `Nome di «${row.name}»`,
      placeholder: row.name,
      target: { kind: LABEL_TARGET, player, action: row.action },
    }))
  }

  const focusedRow = () => rows.find((row) => `row-${row.action}` === scope.focused) || null

  const handle = (event) => {
    if (event.kind === 'release' || event.kind === 'text') {
      return true
    }
    if (learning) {
      if (event.kind !== 'press') {
        return true
      }
      const button = PAD_TO_RETROPAD[event.button]
      if (button) {
        setDraft((current) => assignButton(current, player, learning, button))
        setLearning(null)
      } else if (DIRECTIONS.has(event.button)) {
        setLearning(null)
      }
      return true
    }
    if (busy || scope.handle(event) || event.kind !== 'press') {
      return true
    }
    const row = focusedRow()
    if ((event.button === 'lb' || event.button === 'rb') && players.length > 1) {
      setTab((current) => (current + (event.button === 'lb' ? players.length - 1 : 1)) % players.length)
    } else if (event.button === 'y' && row) {
      name(row)
    } else if (event.button === 'x' && row && row.editable) {
      setDraft((current) => assignButton(current, player, row.action, row.action))
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

  const color = PLAYER_INFO[player] ? PLAYER_INFO[player].color : PLAYER_INFO.p1.color
  return (
    <div
      className={inGame ? `${styles.overlay} ${styles.game}` : styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose()
        }
      }}
    >
      <section
        className={styles.panel}
        role="dialog"
        aria-label={`Comandi · ${title}`}
        style={{ '--player': color }}
        ref={scope.ref}
      >
        <div className={styles.strip} />
        <header className={styles.head}>
          <span className={`pix ${styles.kicker}`}>{inGame ? `COMANDI · ${PLAYER_INFO[player].tag}` : 'COMANDI'}</span>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.core}>Nomi dati dal core {controls.core}</p>
        </header>

        {players.length > 1 && (
          <div className={styles.tabs} role="tablist">
            {players.map((entry, at) => (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={entry === player}
                className={entry === player ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                style={{ '--tab': PLAYER_INFO[entry].color }}
                onClick={() => {
                  setLearning(null)
                  setTab(at)
                }}
              >
                <span className={`pix ${styles.tabTag}`}>{PLAYER_INFO[entry].tag}</span>
                {PLAYER_INFO[entry].label}
              </button>
            ))}
          </div>
        )}

        <div className={styles.list}>
          {rows.map((row, index) => {
            const waiting = learning === row.action
            const classes = [styles.row, !row.editable && styles.fixed, waiting && styles.waiting]
            const props = row.editable ? scope.item(`row-${row.action}`, () => learn(row)) : {}
            return (
              <button
                key={row.action}
                type="button"
                className={classes.filter(Boolean).join(' ')}
                data-autofocus={index === 0 || undefined}
                {...props}
              >
                <span className={styles.icon} title={BUTTON_TITLES[row.button]}>
                  <ButtonIcon button={row.button} />
                </span>
                <span className={styles.text}>
                  <span className={styles.name}>{rowTitle(row)}</span>
                  <span className={styles.note}>
                    {waiting ? 'Premi il nuovo tasto · croce per annullare' : row.label ? row.name : BUTTON_TITLES[row.button]}
                  </span>
                </span>
                {!row.editable && <span className={`pix ${styles.lock}`}>FISSO</span>}
                {row.editable && row.button !== row.action && !waiting && (
                  <span className={`pix ${styles.moved}`}>CAMBIATO</span>
                )}
              </button>
            )
          })}
        </div>

        <footer className={styles.actions}>
          <button
            type="button"
            className={`${styles.action} ${styles.primary}`}
            disabled={busy}
            {...scope.item('save', () => onSave(draft))}
          >
            {inGame ? 'Salva' : 'Salva comandi'}
          </button>
          <button type="button" className={styles.action} disabled={busy} {...scope.item('close', onClose)}>
            {closeLabel}
          </button>
        </footer>
      </section>
    </div>
  )
}
