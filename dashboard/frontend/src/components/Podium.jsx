import { hasImages, imageUrl } from '../lib/gameInfo.js'
import { placeLabel, podiumHasXp, podiumSteps } from '../lib/tournament.js'
import Avatar from './Avatar.jsx'
import styles from './Podium.module.css'

const STEP_CLASS = { 1: 'first', 2: 'second', 3: 'third' }

/**
 * Podio di un torneo concluso (README «Torneo»): tre gradini, 2° a sinistra,
 * 1° al centro più alto, 3° a destra (con due giocatori se a pari merito),
 * con avatar, nome e «+XP» del premio se ce ne sono.
 *
 * Con `full` è la schermata dopo la finale: copertina del gioco sfocata
 * dietro e titolo del torneo sopra. Senza, è il riquadro dell'anteprima e
 * dell'archivio, più piccolo.
 */
export default function Podium({ tournament, full }) {
  const podium = tournament.podium || []
  const xp = podiumHasXp(podium)
  const game = tournament.gameInfo
  const cover = full && hasImages(game) ? { backgroundImage: `url("${imageUrl(game.system, game, 'cover')}")` } : undefined
  return (
    <div className={full ? `${styles.podium} ${styles.full}` : styles.podium}>
      {full && (
        <span className={styles.backdrop} aria-hidden="true">
          <span className={styles.image} style={cover} />
          <span className={styles.shade} />
        </span>
      )}
      {full && (
        <header className={styles.head}>
          <span className={`pix ${styles.kicker}`}>PODIO</span>
          <h2 className={`pix ${styles.title}`}>{tournament.title}</h2>
          {game && <p className={styles.game}>{game.title}</p>}
        </header>
      )}
      <ol className={styles.steps}>
        {podiumSteps(podium).map((step) => (
          <li key={step.place} className={`${styles.step} ${styles[STEP_CLASS[step.place]]}`}>
            <div className={styles.people}>
              {step.players.map((player) => (
                <span key={player.id} className={styles.person} style={{ '--player': player.color || 'var(--text-4)' }}>
                  <Avatar id={player.id} name={player.name} className={styles.avatar}
                    style={{ background: player.color }} />
                  <span className={styles.name}>{player.name}</span>
                  {xp && <span className={`pix ${styles.xp}`}>{player.xp ? `+${player.xp} XP` : ''}</span>}
                </span>
              ))}
            </div>
            <span className={styles.block}>
              <span className={`pix ${styles.place}`}>{placeLabel(step.place)}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
