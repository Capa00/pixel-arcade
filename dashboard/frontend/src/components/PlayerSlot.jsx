import Avatar from './Avatar.jsx'
import { PLAYER_INFO } from '../state/players.js'
import styles from './PlayerSlot.module.css'

function padLabel(slot) {
  return slot.pad === null ? 'Nessun joypad' : `Joypad ${slot.pad + 1}`
}

/**
 * Slot P1/P2 nell'intestazione (come nella demo). Vuoto: bordo tratteggiato,
 * «Premi START» (o «Sceglie il profilo…» con la finestra aperta) e il joypad;
 * occupato: avatar (Gravatar o iniziale sul colore del profilo), pallino del colore
 * del giocatore e nome; col joypad scollegato l'avatar è opaco.
 * `onClick` riapre la finestra dello slot o fa entrare senza joypad.
 */
export default function PlayerSlot({ slotKey, slot, onClick }) {
  const info = PLAYER_INFO[slotKey]
  const style = { '--player': info.color }
  if (slot.user) {
    const user = slot.user
    return (
      <button
        type="button"
        className={styles.slot}
        style={{ ...style, '--user': user.color }}
        aria-label={`Profilo ${info.label}: ${user.name}`}
        onClick={onClick}
      >
        <Avatar
          id={user.guest ? null : user.id}
          name={user.name}
          className={styles.avatar}
        >
          <span className={styles.dot} />
        </Avatar>
        <span className={styles.text}>
          <span className={`pix ${styles.tag}`}>{info.tag}</span>
          <span className={styles.name}>{user.name}</span>
        </span>
      </button>
    )
  }
  return (
    <button type="button" className={`${styles.slot} ${styles.empty}`} style={style} onClick={onClick}>
      <span className={`pix ${styles.badge}`}>{info.tag}</span>
      <span className={styles.text}>
        <span className={`pulse ${styles.wait}`}>{slot.joined ? 'Sceglie il profilo…' : 'Premi START'}</span>
        <span className={styles.pad}>{slot.joined ? padLabel(slot) : 'Nessun joypad'}</span>
      </span>
    </button>
  )
}
