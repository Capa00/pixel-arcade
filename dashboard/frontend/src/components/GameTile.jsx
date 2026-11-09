import { forwardRef } from 'react'
import GameCover from './GameCover.jsx'
import Heart from './Heart.jsx'
import TrophyMark from './TrophyMark.jsx'
import styles from './GameTile.module.css'

/**
 * Un gioco della griglia: copertina e titolo, nient'altro (anno, genere e
 * compatibilità completa stanno nella sezione in alto). Quello selezionato ha
 * l'anello ed è sollevato. `dots` sono i giocatori che lo hanno tra i
 * preferiti: un piccolo cuore del loro colore in alto a destra. La copertina
 * vera, se c'è, si carica solo quando la tessera è visibile. In alto a sinistra la coppa compare solo se il gioco è compatibile
 * con RetroAchievements (`game.achievements`): quella barrata resta nella
 * sezione in alto, così la griglia non si riempie di segni.
 */
const GameTile = forwardRef(function GameTile({ system, game, selected, dots = [], onPointerEnter, onClick }, ref) {
  const overlay = (
    <>
      {game.achievements === true && (
        <span className={styles.trophy}>
          <TrophyMark value={game.achievements} />
        </span>
      )}
      {dots.length > 0 && (
        <span className={styles.dots}>
          {dots.map((dot) => (
            <span key={dot.slot} className={styles.dot} title={`Preferito ${dot.tag}`}>
              <Heart className={styles.heart} fill={dot.color} />
            </span>
          ))}
        </span>
      )}
      {game.coreStatus === 'incompatible' && (
        <span className={styles.badge} title="Nessun core compatibile" aria-label="Nessun core compatibile">
          ⊘
        </span>
      )}
    </>
  )
  return (
    <button
      ref={ref}
      type="button"
      className={selected ? `${styles.tile} ${styles.selected}` : styles.tile}
      aria-label={game.title}
      aria-current={selected ? 'true' : undefined}
      onPointerEnter={onPointerEnter}
      onClick={onClick}
    >
      <GameCover key={game.metaId || ''} system={system} game={game} lazy className={styles.cover} overlay={overlay}>
        <span className={styles.coverTitle}>{game.title}</span>
      </GameCover>
      <span className={styles.title}>{game.title}</span>
    </button>
  )
})

export default GameTile
