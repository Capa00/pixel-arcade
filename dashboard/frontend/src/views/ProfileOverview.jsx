import GameCover from '../components/GameCover.jsx'
import Heart from '../components/Heart.jsx'
import RecentRow from '../components/RecentRow.jsx'
import Sprite from '../components/Sprite.jsx'
import { hours } from '../lib/format.js'
import { activeTheme } from '../lib/themes.js'
import { useApp } from '../state/AppContext.jsx'
import { gameSummary } from '../state/profiles.js'
import styles from './Profile.module.css'

function Tile({ value, label }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.tileLabel}>{label}</span>
    </div>
  )
}

/**
 * Scheda «Panoramica» della pagina profilo: quattro tessere (ore, partite,
 * giochi provati, preferiti), i preferiti e gli ultimi 5 giochi.
 *
 * `item(id, onActivate)` sono le voci navigabili della pagina; `color` è il
 * colore del giocatore (cuore dei preferiti); `goTo(summary)` porta al gioco,
 * `remove(key)` toglie un preferito.
 */
export default function ProfileOverview({ profile, color, item, goTo, remove }) {
  const { state } = useApp()
  const favorites = profile.favorites || []
  const systemOf = (id) => state.systems.find((entry) => entry.id === id) || null
  const now = Date.now()
  const { icon } = activeTheme(state)

  return (
    <>
      <div className={styles.tiles}>
        <Tile value={hours(profile.hours)} label="ore di gioco" />
        <Tile value={profile.sessions || 0} label="partite" />
        <Tile value={profile.played || 0} label="giochi provati" />
        <Tile value={favorites.length} label="preferiti" />
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Preferiti</h2>
          <span className={styles.sectionCount}>{favorites.length === 1 ? '1 gioco' : `${favorites.length} giochi`}</span>
        </div>
        {favorites.length ? (
          <div className={styles.favorites}>
            {favorites.map((key, position) => {
              const summary = gameSummary(state, key)
              const system = systemOf(summary.system)
              return (
                <div key={key} className={summary.missing ? `${styles.favorite} ${styles.missing}` : styles.favorite}>
                  <button
                    type="button"
                    className={styles.favoriteCover}
                    aria-label={summary.title}
                    data-autofocus={position === 0 || undefined}
                    {...item(`fav-${key}`, () => goTo(summary))}
                  >
                    <GameCover
                      key={`${key}-${summary.metaId}`}
                      system={system}
                      game={system ? summary : { ...summary, cover: false }}
                      lazy
                      className={styles.cover}
                    />
                  </button>
                  <button
                    type="button"
                    className={styles.unfavorite}
                    aria-label={`Rimuovi ${summary.title} dai preferiti`}
                    {...item(`unfav-${key}`, () => remove(key))}
                  >
                    <Heart className={styles.unfavoriteHeart} fill={color} />
                  </button>
                  <span className={styles.favoriteText}>
                    <span className={styles.favoriteTitle}>{summary.title}</span>
                    <span className={styles.favoriteSystem}>{summary.missing ? 'Non più presente' : summary.systemName}</span>
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className={styles.emptyFavorites}>
            <span className={styles.emptyIcon}>
              <Sprite name={icon.sprite} colors={icon.colors} className={styles.emptyArt} />
            </span>
            <div className={styles.emptyTitle}>Ancora nessun preferito</div>
            <div className={styles.emptyText}>Dalla libreria, premi Y su un gioco per salvarlo qui.</div>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Giocati di recente</h2>
        {profile.recent && profile.recent.length ? (
          <div className={styles.recent}>
            {profile.recent.slice(0, 5).map((entry, position) => {
              const summary = gameSummary(state, entry.game)
              return (
                <RecentRow
                  key={entry.game}
                  entry={entry}
                  summary={summary}
                  system={systemOf(summary.system)}
                  now={now}
                  focusProps={{
                    ...item(`recent-${entry.game}`, () => goTo(summary)),
                    'data-autofocus': (!favorites.length && position === 0) || undefined,
                  }}
                />
              )
            })}
          </div>
        ) : (
          <div className={styles.emptyRecent}>
            <span className={styles.coin}>
              <Sprite name="coin" colors={['#f5c542', '#fff1a8', '#8a6a00']} className={styles.emptyArt} />
            </span>
            <span className={styles.emptyText}>Nessuna partita finora. Insert coin!</span>
          </div>
        )}
      </section>
    </>
  )
}
