import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  bracketLayout,
  crossingSlot,
  isFirstRound,
  isHiddenBye,
  matchCode,
  resetNote,
  roundsOf,
  seriesLabel,
  sourceLabel,
} from '../lib/tournament.js'
import Avatar from './Avatar.jsx'
import styles from './Bracket.module.css'

// Oltre questo numero di posti del primo turno le schede diventano compatte.
const COMPACT_FROM = 32

/**
 * Scorrimento del contenitore `box` che porta in vista l'elemento `target`
 * lasciandogli attorno un margine di circa una scheda in orizzontale e
 * mezza in verticale, sotto le intestazioni fisse (`inset`). Se il margine
 * non ci sta, l'elemento va al centro. Restituisce `{left, top}`.
 */
function scrollFor(box, target, inset) {
  const view = box.getBoundingClientRect()
  const rect = target.getBoundingClientRect()
  const left = rect.left - view.left + box.scrollLeft
  const top = rect.top - view.top + box.scrollTop
  const axis = (start, size, current, room, margin, before) => {
    if (size + 2 * margin > room - before) {
      return start + size / 2 - (room + before) / 2
    }
    if (start - margin < current + before) {
      return start - margin - before
    }
    if (start + size + margin > current + room) {
      return start + size + margin - room
    }
    return current
  }
  return {
    left: Math.max(0, axis(left, rect.width, box.scrollLeft, box.clientWidth, rect.width, 0)),
    top: Math.max(0, axis(top, rect.height, box.scrollTop, box.clientHeight, rect.height / 2, inset)),
  }
}

/** Vittorie di `player` nelle partite dell'incontro. */
function winsOf(match, player) {
  return (match.games || []).filter((game) => game.winnerId === player).length
}

/**
 * Riga di un giocatore nella scheda dell'incontro: avatar, nome e testa di
 * serie; se la casella è ancora vuota, da dove arriverà il giocatore («Vincitore
 * di Q2»), oppure «passa il turno» per l'avversario mancante di un bye.
 */
function PlayerRow({ match, side, people, matches, rounds, cursor, marked, onPick, crossCursor, crossMarked,
  onCross }) {
  const id = side === 'a' ? match.playerA : match.playerB
  const person = id === null || id === undefined ? null : people.get(id)
  const first = isFirstRound(match)
  if (!person) {
    const text = match.bye ? 'passa il turno'
      : match.status === 'skipped' ? '—' : sourceLabel(side === 'a' ? match.fromA : match.fromB, matches, rounds)
    const entry = crossCursor !== undefined ? crossingSlot(match, side, matches) : null
    const classes = [styles.row, styles.empty]
    if (crossCursor && crossCursor.key === match.key && crossCursor.side === side) {
      classes.push(styles.cursor)
    }
    if (entry && crossMarked === entry) {
      classes.push(styles.marked)
    }
    return (
      <div className={classes.join(' ')} onClick={onCross && entry ? () => onCross(match.key, side) : undefined}>
        <span className={`${styles.avatar} ${styles.ghost}`} />
        <span className={styles.pending}>{text || 'Da decidere'}</span>
      </div>
    )
  }
  const classes = [styles.row]
  if (match.status === 'done' && match.winnerId !== null && match.winnerId !== undefined && !match.bye) {
    classes.push(match.winnerId === id ? styles.winner : styles.loser)
  }
  if (cursor === id && first) {
    classes.push(styles.cursor)
  }
  if (marked === id && first) {
    classes.push(styles.marked)
  }
  const isCursor = cursor === id && first
  const showWins = !match.bye && ((match.games || []).length > 0 || match.status === 'done')
  return (
    <div
      className={classes.join(' ')}
      style={{ '--player': person.color || 'var(--text-4)' }}
      data-cursor={isCursor || undefined}
      onClick={onPick && first ? () => onPick(id) : undefined}
    >
      <Avatar id={person.id} name={person.name} className={styles.avatar} style={{ background: person.color }} />
      <span className={styles.name}>{person.name}</span>
      {person.seed ? <span className={`pix ${styles.seed}`}>{person.seed}</span> : null}
      {showWins && <span className={`pix ${styles.wins}`}>{winsOf(match, id)}</span>}
    </div>
  )
}

/**
 * Scheda di un incontro: sigla, stato e numero d'ordine, poi le due righe dei
 * giocatori. La rivincita ancora da decidere è attenuata, con «solo se vince…»; quella non giocata
 * (`skipped`) anche, con «non giocata».
 */
function MatchCard({ match, next, focus, ...rest }) {
  const classes = [styles.match]
  const isNext = Boolean(next && next === match.key)
  const playing = match.status === 'playing'
  const note = resetNote(match, rest.matches, rest.people)
  if (match.bye) {
    classes.push(styles.bye)
  }
  if (note) {
    classes.push(styles.conditional)
  }
  if (isNext) {
    classes.push(styles.next)
  }
  if (playing) {
    classes.push(styles.playing)
  }
  if (focus === match.key) {
    classes.push(styles.focus)
  }
  return (
    <div className={classes.join(' ')} data-card data-key={match.key} data-cursor={focus === match.key || undefined}>
      <div className={styles.matchHead}>
        <span className={`pix ${styles.code}`}>{matchCode(match, rest.matches)}</span>
        {playing && (
          <span className={`pix ${styles.tag} ${styles.liveTag}`}>
            <span className={styles.liveDot} aria-hidden="true" />
            IN GIOCO
          </span>
        )}
        {isNext && !playing && <span className={`pix ${styles.tag} ${styles.nextTag}`}>PROSSIMO</span>}
        {match.walkover && <span className={`pix ${styles.tag}`}>TAVOLINO</span>}
        {match.playOrder > 0 && <span className={`pix ${styles.order}`}>#{match.playOrder}</span>}
      </div>
      {note && <span className={styles.note}>{note}</span>}
      <PlayerRow match={match} side="a" {...rest} />
      <PlayerRow match={match} side="b" {...rest} />
    </div>
  )
}

// Classe della linea in uscita: due schede in una (su o giù secondo la casella) oppure una in una.
function linkOutClass(kind, slot) {
  if (kind === 'straight') {
    return `${styles.linkOut} ${styles.linkStraight}`
  }
  return slot % 2 ? `${styles.linkOut} ${styles.linkUp}` : styles.linkOut
}

/**
 * Colonne di una sezione (tabellone principale, vincenti o perdenti): nome
 * del turno, serie e schede unite da linee. Le colonne stanno alla loro `x`
 * del disegno (`--skip` colonne vuote prima); i bye nascosti dei perdenti
 * tengono il posto senza scheda, e una colonna fatta solo di quelli resta
 * vuota anche nella testata.
 */
function MainSection({ section, shared, pick }) {
  let previous = -1
  return (
    <div className={styles.section}>
      {section.columns.map((column) => {
        const skip = column.x - previous - 1
        previous = column.x
        const hidden = column.matches.length > 0 && column.matches.every(isHiddenBye)
        const style = { '--skip': skip, '--skip-in': column.links.skipIn, '--skip-out': column.links.skipOut }
        return (
          <section key={column.x} className={hidden ? `${styles.column} ${styles.hiddenColumn}` : styles.column}
            style={style}>
            <header className={styles.columnHead} data-sticky>
              <span className={`pix ${styles.roundName}`}>{column.name.toUpperCase()}</span>
              {column.series && <span className={styles.series}>{seriesLabel(column.series)}</span>}
            </header>
            <div className={styles.cells}>
              {column.matches.map((match) => (isHiddenBye(match)
                ? <div key={match.key} className={styles.cell} aria-hidden="true" />
                : (
                  <div key={match.key} className={styles.cell} onClick={pick(match.key)}>
                    {column.links.in && <span className={styles.linkIn} aria-hidden="true" />}
                    {column.links.out && <span className={linkOutClass(column.links.out, match.slot)} aria-hidden="true" />}
                    <MatchCard match={match} {...shared} />
                  </div>
                )))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/**
 * Doppia eliminazione: vincenti sopra e perdenti sotto, ciascuno con la sua
 * riga-etichetta; gran finale e rivincita in fondo a destra, centrate sul
 * confine tra le due sezioni. Le linee dalla finale dei vincenti e da quella
 * dei perdenti alla gran finale si disegnano sopra, misurando le schede.
 */
function DoubleDrawing({ layout, shared, pick }) {
  const boxRef = useRef(null)
  const [paths, setPaths] = useState([])
  const winners = layout.sections.find((section) => section.id === 'winners')
  const losers = layout.sections.find((section) => section.id === 'losers')
  const grand = layout.sections.find((section) => section.id === 'grand')
  const lastKey = (section) => {
    const column = section && section.columns[section.columns.length - 1]
    return column && column.matches.length ? column.matches[0].key : null
  }
  const winnersEnd = lastKey(winners)
  const losersEnd = lastKey(losers)
  const target = grand ? grand.columns[0].matches[0].key : null
  const { matches } = shared

  useLayoutEffect(() => {
    const box = boxRef.current
    const clear = () => setPaths((current) => (current.length ? [] : current))
    if (!box || !target) {
      clear()
      return undefined
    }
    const measure = () => {
      const origin = box.getBoundingClientRect()
      const rectOf = (key) => {
        const found = box.querySelector(`[data-key="${key}"]`)
        return found ? found.getBoundingClientRect() : null
      }
      const to = rectOf(target)
      if (!to) {
        clear()
        return
      }
      const endX = to.left - origin.left
      const endY = to.top - origin.top + to.height / 2
      const turnX = endX - 14
      const next = [winnersEnd, losersEnd].map((key) => rectOf(key)).filter(Boolean).map((from) => {
        const startX = from.right - origin.left
        const startY = from.top - origin.top + from.height / 2
        return `M ${startX} ${startY} H ${turnX} V ${endY} H ${endX}`
      })
      setPaths((current) => (current.join('|') === next.join('|') ? current : next))
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (observer) {
      observer.observe(box)
    }
    return () => {
      if (observer) {
        observer.disconnect()
      }
    }
  }, [target, winnersEnd, losersEnd, matches])

  return (
    <div className={styles.double} ref={boxRef}>
      <span className={`pix ${styles.bracketLabel}`}>VINCENTI</span>
      {winners && <MainSection section={winners} shared={shared} pick={pick} />}
      <span className={`pix ${styles.bracketLabel} ${styles.losersLabel}`}>PERDENTI</span>
      {losers && <MainSection section={losers} shared={shared} pick={pick} />}
      {grand && (
        <div className={styles.grand}>
          {grand.columns[0].matches.map((match) => (
            <div key={match.key} className={styles.grandCell} onClick={pick(match.key)}>
              <span className={`pix ${styles.grandHead}`}>{match.round > 1 ? 'RIVINCITA' : 'GRAN FINALE'}</span>
              <span className={styles.series}>{seriesLabel(match.series)}</span>
              <MatchCard match={match} {...shared} cursor={null} marked={null} />
            </div>
          ))}
        </div>
      )}
      <svg className={styles.grandLinks} aria-hidden="true">
        {paths.map((path) => <path key={path} d={path} />)}
      </svg>
    </div>
  )
}

/** Sezione del 3° posto: una sola scheda, alla stessa `x` della finale. */
function ThirdSection({ section, shared, pick }) {
  const column = section.columns[0]
  const match = column.matches[0]
  return (
    <div className={`${styles.section} ${styles.lower}`} style={{ '--x': column.x }}>
      <div className={styles.third} onClick={pick(match.key)}>
        <span className={`pix ${styles.thirdHead}`}>3° POSTO</span>
        <span className={styles.series}>{seriesLabel(match.series)} · si gioca prima della finale</span>
        <MatchCard match={match} {...shared} cursor={null} marked={null} />
      </div>
    </div>
  )
}

/**
 * Tabellone (README «Torneo»), disegnato a sezioni da `bracketLayout`:
 * nella doppia eliminazione vincenti, perdenti e gran finale (`DoubleDrawing`);
 * nell'eliminazione diretta il tabellone principale, una colonna per turno
 * con il nome del turno e la serie e le schede allineate a metà tra i due
 * incontri da cui arrivano i giocatori, unite da linee; sotto, alla stessa
 * `x` della finale, l'incontro per il 3° posto («si gioca prima della
 * finale»). Le schede restano a grandezza leggibile (compatte solo oltre 32
 * posti nel primo turno) e il disegno scorre in orizzontale e in verticale
 * seguendo il cursore, con un margine attorno alla scheda selezionata.
 *
 * `matches` sono gli incontri (`key`, `round`, `slot`, `bracket`,
 * `playerA`, `playerB`, `fromA`, `fromB`, `bye`, `playOrder`, `series`,
 * `status`, `winnerId`, `walkover`, `games`), `players` i giocatori `[{id,
 * name, color, seed}]`. Nell'anteprima dell'avvio `cursor` e `marked` sono
 * gli id del giocatore evidenziato e di quello scelto per lo scambio (solo
 * nel primo turno) e `onPick(id)` arriva col clic. `next` è la chiave
 * dell'incontro da evidenziare come prossimo; `focus` quella dell'incontro
 * col cursore, nel tabellone del torneo in corso, e `onFocus(key)` arriva
 * col clic su una scheda. Nell'anteprima della doppia `crossCursor`
 * (`{key, side}` o `null`) è lo slot dei perdenti col cursore, `crossMarked`
 * l'ingresso degli incroci scelto per lo scambio e `onCross(key, side)` arriva
 * col clic su uno slot «Perdente di V…».
 */
export default function Bracket({ matches, players, cursor = null, marked = null, next = null, focus = null, onPick,
  onFocus, crossCursor, crossMarked = null, onCross }) {
  const boxRef = useRef(null)
  const placed = useRef(false)
  const people = new Map((players || []).map((player) => [player.id, player]))
  const rounds = roundsOf(matches)
  const layout = bracketLayout(matches)
  const main = layout.sections[0]
  const double = Boolean(main && main.id === 'winners')
  const firstCount = main && main.columns.length ? main.columns[0].matches.length : 0
  const compact = firstCount * 2 > COMPACT_FROM

  useEffect(() => {
    const box = boxRef.current
    const found = box && box.querySelector('[data-cursor]')
    if (!found) {
      return
    }
    const target = found.closest('[data-card]') || found
    const head = box.querySelector('[data-sticky]')
    const to = scrollFor(box, target, head ? head.offsetHeight : 0)
    // La prima volta si salta subito al cursore, poi la vista scorre.
    box.scrollTo({ ...to, behavior: placed.current ? 'smooth' : 'auto' })
    placed.current = true
  }, [cursor, focus])

  const shared = { people, matches, rounds, cursor, marked, onPick, next, focus, crossCursor, crossMarked, onCross }
  const pick = (key) => (onFocus ? () => onFocus(key) : undefined)
  return (
    <div className={compact ? `${styles.bracket} ${styles.compact}` : styles.bracket} ref={boxRef}>
      {double
        ? <DoubleDrawing layout={layout} shared={shared} pick={pick} />
        : (
          <div className={styles.drawing}>
            {layout.sections.map((section) => (section.id === 'third'
              ? <ThirdSection key={section.id} section={section} shared={shared} pick={pick} />
              : <MainSection key={section.id} section={section} shared={shared} pick={pick} />))}
          </div>
        )}
    </div>
  )
}
