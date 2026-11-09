import { useEffect, useRef } from 'react'
import GameActions from './GameActions.jsx'
import GameCover from './GameCover.jsx'
import HeroTrophies from './HeroTrophies.jsx'
import Heart from './Heart.jsx'
import TrophyMark from './TrophyMark.jsx'
import { pointerActive } from '../input/pointer.js'
import { IMAGE_LABELS, hasImages, heroLabel, infoRows, stepImage } from '../lib/gameInfo.js'
import styles from './GameHero.module.css'

// Parte del riquadro della descrizione spostata a ogni pressione di ↑↓.
const SCROLL_FRACTION = 1 / 3

/**
 * Sezione in alto: copertina grande, dati e azioni del gioco selezionato.
 *
 * La copertina mostra l'immagine `view.image` (copertina, titolo o
 * schermata) se il gioco ne ha, altrimenti la pixel art; è selezionabile
 * come le azioni (`heroFocus` `cover`) e, con il mouse, le freccette sotto
 * cambiano immagine (`onImage(kind)`). Accanto, secondo `view.panel`, la
 * scheda (`info`: sviluppatore, editore, lingue, genere, giocatori, seriale),
 * descrizione e trama (`text`) oppure i trofei RetroAchievements
 * (`trophies`, sbloccati dal profilo `account` del P1), che scorrono con la
 * rotellina o, con il loro pulsante selezionato, con ↑↓ (`scroll`: `{dir, seq}`). Scheda e testo
 * stanno nella stessa area ad altezza fissa, tra il titolo e le azioni, così
 * il passaggio dall'una all'altro non sposta il resto.
 * `heroFocus` è l'elemento evidenziato, `onFocus` e `onActivate` servono al mouse.
 * `favoredBy` sono i giocatori che hanno il gioco tra i preferiti
 * (`[{slot, tag, color}]`): sopra la copertina, in alto a destra, compare una
 * pastiglia col cuore e P1/P2, solo come indicazione (i preferiti si cambiano con Y).
 * Accanto alla riga sopra il titolo la coppa dice se il gioco è compatibile
 * con RetroAchievements (dorata) o no (barrata).
 */
export default function GameHero({
  system,
  game,
  heroFocus,
  view = { image: 'cover', panel: 'info' },
  scroll = null,
  favoredBy = [],
  account = null,
  onFocus,
  onActivate,
  onImage,
}) {
  const images = hasImages(game)
  const image = images ? view.image : 'cover'
  const rows = infoRows(game)
  const textRef = useRef(null)
  const lastScroll = useRef(scroll ? scroll.seq : 0)

  useEffect(() => {
    if (!scroll || scroll.seq === lastScroll.current) {
      return
    }
    lastScroll.current = scroll.seq
    const box = textRef.current
    if (box) {
      const step = Math.max(1, Math.round(box.clientHeight * SCROLL_FRACTION))
      box.scrollBy({ top: scroll.dir * step, behavior: 'smooth' })
    }
  }, [scroll])

  const coverClasses = heroFocus === 'cover' ? `${styles.coverBox} ${styles.coverFocused}` : styles.coverBox
  return (
    <section className={styles.hero} aria-label="Gioco selezionato" style={{ '--accent': system.accent }}>
      <div
        className={coverClasses}
        onPointerEnter={(event) => {
          if (images && pointerActive(event)) {
            onFocus('cover')
          }
        }}
      >
        <GameCover key={`${game.metaId || game.id}/${image}`} system={system} game={game} kind={image} className={styles.cover}>
          <span className={`pix ${styles.coverLabel}`}>{system.name}</span>
          <span className={styles.coverTitle}>{game.title}</span>
        </GameCover>
        {favoredBy.length > 0 && (
          <div className={styles.favorites} aria-label="Nei preferiti di">
            {favoredBy.map((entry) => (
              <span key={entry.slot} className={styles.favorite} style={{ '--player': entry.color }}>
                <Heart className={styles.favHeart} fill={entry.color} />
                <span className="pix">{entry.tag}</span>
              </span>
            ))}
          </div>
        )}
        {images && (
          <div className={styles.imageNav}>
            <button type="button" className={styles.arrow} aria-label="Immagine precedente" onClick={() => onImage(stepImage(image, -1))}>
              ◂
            </button>
            <span className={`pix ${styles.imageName}`}>{IMAGE_LABELS[image]}</span>
            <button type="button" className={styles.arrow} aria-label="Immagine successiva" onClick={() => onImage(stepImage(image, 1))}>
              ▸
            </button>
          </div>
        )}
      </div>

      <div className={styles.details}>
        <div className={styles.labelRow}>
          <span className={`pix ${styles.label}`}>{heroLabel(system, game)}</span>
          <TrophyMark value={game.achievements} className={styles.trophy} />
        </div>
        <h1 className={styles.title}>{game.title}</h1>
        <div className={styles.panel}>
          {view.panel === 'trophies' && (
            <HeroTrophies key={game.id} ref={textRef} system={system.id} game={game.id} account={account} />
          )}
          {view.panel === 'text' && (
            <div key={game.id} ref={textRef} className={styles.text}>
              {game.description && (
                <>
                  <h2 className={styles.heading}>Descrizione</h2>
                  <p className={styles.paragraph}>{game.description}</p>
                </>
              )}
              {game.plot && (
                <>
                  <h2 className={styles.heading}>Trama</h2>
                  <p className={styles.paragraph}>{game.plot}</p>
                </>
              )}
            </div>
          )}
          {view.panel === 'info' && (
            rows.length > 0 && (
              <dl className={styles.info}>
                {rows.map((row) => (
                  <div key={row.id} className={styles.row}>
                    <dt className={`pix ${styles.rowLabel}`}>{row.label}</dt>
                    <dd className={styles.rowValue} title={row.value}>
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )
          )}
          {view.panel === 'info' && !game.metaId && (
            <div className={styles.quote}>
              <span className={styles.quoteText}>“{system.quote}”</span>
              <span>— {system.source}</span>
            </div>
          )}
        </div>
        <div className={styles.actionsRow}>
          <GameActions game={game} focus={heroFocus} panel={view.panel} onFocus={onFocus} onActivate={onActivate} />
        </div>
      </div>
    </section>
  )
}
