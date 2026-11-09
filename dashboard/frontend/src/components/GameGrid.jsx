import { useEffect, useRef, useState } from 'react'
import FaceButton from './FaceButton.jsx'
import GameTile from './GameTile.jsx'
import LetterStrip from './LetterStrip.jsx'
import Sprite from './Sprite.jsx'
import { pointerActive } from '../input/pointer.js'
import { hasImages, imageUrl } from '../lib/gameInfo.js'
import styles from './GameGrid.module.css'

// Rotellina: spostamento minimo accumulato e intervallo minimo tra due righe.
const WHEEL_STEP = 50
const WHEEL_INTERVAL_MS = 120

function countLabel(count) {
  return count === 1 ? '1 gioco' : `${count} giochi`
}

// Filtri attivi accanto al titolo: «Genere: Picchiaduro».
function Chips({ filters }) {
  if (!filters.length) {
    return null
  }
  return (
    <span className={styles.chips}>
      {filters.map((item) => (
        <span key={item.id} className={styles.chip}>
          <span className={styles.chipLabel}>{item.label}:</span> {item.value}
        </span>
      ))}
    </span>
  )
}

function Heading({ query, filters, count, letter, present, onJumpLetter, icon }) {
  if ((query || filters.length) && !count) {
    return (
      <div className={styles.heading}>
        <h2 className={styles.name}>
          {filters.length ? 'Nessun gioco rispetta i filtri' : 'Nessun gioco trovato'} ·{' '}
          <span className={styles.hint}>
            <FaceButton position={filters.length ? 'west' : 'east'} />
            {filters.length ? 'per cambiarli' : 'per cancellare'}
          </span>
        </h2>
        <Chips filters={filters} />
      </div>
    )
  }
  return (
    <div className={styles.heading}>
      {icon && !query && (
        <span className={styles.icon}>
          <Sprite name={icon.sprite} colors={icon.colors} className={styles.iconArt} />
        </span>
      )}
      <h2 className={styles.name}>{query ? `Risultati per “${query.trim()}”` : 'Giochi'}</h2>
      <span className={styles.count}>{query ? `· ${countLabel(count)}` : countLabel(count)}</span>
      {query && (
        <span className={`${styles.hint} ${styles.count}`}>
          <FaceButton position="east" />
          per cancellare
        </span>
      )}
      <Chips filters={filters} />
      <div className={styles.letters}>
        <LetterStrip current={letter} present={present} onJump={onJumpLetter} />
      </div>
    </div>
  )
}

/**
 * Griglia dei giochi a `--columns` colonne: mostra solo la riga del gioco
 * selezionato, con una transizione verticale quando la riga cambia.
 * L'intestazione dice solo quanti giochi ci sono, i filtri attivi e l'iniziale.
 * `games` è già filtrato dalla ricerca `query` e dai filtri, il cui
 * riepilogo `filters` (`[{id, label, value}]`) compare accanto al titolo; nell'intestazione la striscia
 * `# A–Z` indica l'iniziale `letter` e quelle presenti (`present`).
 * `dotsFor(game)` restituisce i pallini dei preferiti di un gioco; `icon` è
 * il piccolo simbolo del tema accanto al titolo.
 */
export default function GameGrid({
  system,
  games,
  index,
  columns,
  query,
  filters = [],
  letter,
  present,
  onSelect,
  onWheelMove,
  onJumpLetter,
  dotsFor = () => [],
  icon = null,
}) {
  const row = Math.floor(index / columns)
  const start = row * columns
  const visible = games.slice(start, start + columns)
  const [shown, setShown] = useState({ row, direction: 'none' })
  const selectedRef = useRef(null)
  const wheel = useRef({ delta: 0, at: 0 })

  if (shown.row !== row) {
    setShown({ row, direction: row > shown.row ? 'down' : 'up' })
  }

  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [index])

  // Copertine della riga sopra e di quella sotto chieste in anticipo: al cambio di riga sono già pronte.
  useEffect(() => {
    const around = [...games.slice(Math.max(0, start - columns), start), ...games.slice(start + columns, start + 2 * columns)]
    const images = around.filter(hasImages).map((game) => {
      const image = new Image()
      image.src = imageUrl(system.id, game, 'cover')
      return image
    })
    return () => {
      for (const image of images) {
        image.src = ''
      }
    }
  }, [games, start, columns, system.id])

  const handleWheel = (event) => {
    const state = wheel.current
    state.delta += event.deltaY
    if (Math.abs(state.delta) < WHEEL_STEP || event.timeStamp - state.at < WHEEL_INTERVAL_MS) {
      return
    }
    onWheelMove(state.delta > 0 ? 'down' : 'up')
    state.delta = 0
    state.at = event.timeStamp
  }

  return (
    <section className={styles.grid} aria-label="Giochi" style={{ '--accent': system.accent }} onWheel={handleWheel}>
      <Heading
        query={query}
        filters={filters}
        count={games.length}
        letter={letter}
        present={present}
        onJumpLetter={onJumpLetter}
        icon={icon}
      />
      <div key={row} className={`${styles.row} ${styles[shown.direction] || ''}`}>
        {visible.map((game, offset) => {
          const gameIndex = start + offset
          const selected = gameIndex === index
          return (
            <GameTile
              key={game.id}
              ref={selected ? selectedRef : null}
              system={system}
              game={game}
              selected={selected}
              dots={dotsFor(game)}
              onPointerEnter={(event) => {
                if (pointerActive(event)) {
                  onSelect(gameIndex)
                }
              }}
              onClick={() => onSelect(gameIndex)}
            />
          )
        })}
      </div>
    </section>
  )
}
