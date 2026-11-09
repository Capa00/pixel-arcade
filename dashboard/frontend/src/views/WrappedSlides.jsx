import { useEffect, useState } from 'react'
import Avatar from '../components/Avatar.jsx'
import GameCover from '../components/GameCover.jsx'
import { CUP } from '../components/TrophyMark.jsx'
import { formatDuration } from '../lib/format.js'
import {
  DAYS,
  GAMES,
  PLAYERS,
  SESSIONS,
  TROPHIES,
  bigTime,
  countUp,
  dayLabel,
  formatNumber,
  introTitle,
  partPhrase,
  plural,
  rivalVerdict,
  systemShares,
} from '../lib/wrapped.js'
import styles from './WrappedLayer.module.css'

// Durata del contatore che sale (ms).
const COUNT_MS = 1400

function reducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

/** Numero che sale da 0 a `value` all'apertura della schermata. */
function Counter({ value, decimals = 0 }) {
  const [progress, setProgress] = useState(() => (reducedMotion() ? 1 : 0))
  useEffect(() => {
    if (progress >= 1) {
      return undefined
    }
    const start = performance.now()
    let frame = 0
    const tick = (now) => {
      const next = Math.min(1, (now - start) / COUNT_MS)
      setProgress(next)
      if (next < 1) {
        frame = requestAnimationFrame(tick)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // Parte una volta sola, all'apertura della schermata.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <>{formatNumber(countUp(value, progress), decimals)}</>
}

/** Copertina di un gioco citato (`key` in `data.games`). */
function Cover({ data, gameKey, systems, className }) {
  const summary = data.games[gameKey]
  if (!summary) {
    return null
  }
  const system = systems.find((entry) => entry.id === summary.system) || null
  return (
    <GameCover
      key={`${gameKey}-${summary.metaId}`}
      system={system}
      game={system ? summary : { ...summary, cover: false }}
      className={className}
    />
  )
}

function gameTitle(data, key) {
  return (data.games[key] && data.games[key].title) || key
}

function systemName(data, key) {
  return (data.games[key] && data.games[key].systemName) || ''
}

function Face({ person, className, style }) {
  return <Avatar id={person.id} name={person.name} className={className} style={{ ...style, background: person.color }} />
}

function Intro({ data }) {
  const house = data.scope === 'house'
  return (
    <div className={styles.center}>
      <span className={`pix ${styles.brand}`}>PIXEL ARCADE · WRAPPED</span>
      <h2 className={`pix ${styles.hero}`}>{introTitle(data)}</h2>
      {house ? (
        <div className={styles.faces}>
          {data.players.map((person, index) => (
            <Face key={person.id} person={person} className={`${styles.face} ${styles.pop}`} style={{ '--i': index }} />
          ))}
        </div>
      ) : (
        <Face person={data.profile} className={`${styles.bigFace} ${styles.pop}`} />
      )}
      <p className={styles.lead}>
        {house ? 'Cosa è successo davanti a questo schermo?' : `${data.profile.name}, ecco com’è andata.`}
      </p>
      <span className={styles.hint}>Premi A per iniziare</span>
    </div>
  )
}

function Time({ data }) {
  const time = bigTime(data.totals.seconds)
  const house = data.scope === 'house'
  return (
    <div className={styles.center}>
      <span className={styles.kicker}>{house ? 'Tutti insieme avete giocato' : 'Hai giocato'}</span>
      <div className={styles.counter}>
        <span className={`pix ${styles.number}`}>
          <Counter value={time.value} decimals={time.decimals} />
        </span>
        <span className={styles.unit}>{time.unit}</span>
      </div>
      <div className={styles.chips}>
        <span className={styles.chip}>{plural(data.totals.sessions, SESSIONS)}</span>
        <span className={styles.chip}>{plural(data.totals.games, GAMES)}</span>
        <span className={styles.chip}>{plural(data.totals.days, DAYS)} di gioco</span>
        {house && <span className={styles.chip}>{plural(data.totals.players, PLAYERS)}</span>}
      </div>
      {data.totals.newGames > 0 && (
        <p className={styles.note}>
          {data.totals.newGames === 1 ? 'E un gioco mai provato prima.' : `E ${formatNumber(data.totals.newGames)} giochi mai provati prima.`}
        </p>
      )}
    </div>
  )
}

function Top({ data, systems }) {
  const top = data.topGames[0]
  return (
    <div className={styles.split}>
      <div className={`${styles.coverWrap} ${styles.spin}`}>
        <Cover data={data} gameKey={top.game} systems={systems} className={styles.bigCover} />
      </div>
      <div className={styles.side}>
        <span className={styles.kicker}>{data.scope === 'house' ? 'Il gioco di casa' : 'Il tuo gioco'}</span>
        <h2 className={styles.gameTitle}>{gameTitle(data, top.game)}</h2>
        <span className={`pix ${styles.system}`}>{systemName(data, top.game)}</span>
        <div className={styles.chips}>
          <span className={styles.chip}>{formatDuration(top.seconds)}</span>
          <span className={styles.chip}>{plural(top.sessions, SESSIONS)}</span>
        </div>
      </div>
    </div>
  )
}

function Top5({ data, systems }) {
  return (
    <div className={styles.column}>
      <span className={styles.kicker}>La classifica</span>
      <ol className={styles.ranking}>
        {data.topGames.map((item, index) => (
          <li key={item.game} className={styles.rankRow} style={{ '--i': index }}>
            <span className={`pix ${styles.rank}`}>{index + 1}</span>
            <Cover data={data} gameKey={item.game} systems={systems} className={styles.thumb} />
            <span className={styles.rankText}>
              <span className={styles.rankTitle}>{gameTitle(data, item.game)}</span>
              <span className={styles.rankMeta}>{systemName(data, item.game)}</span>
            </span>
            <span className={styles.rankTime}>{formatDuration(item.seconds)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function SystemSlide({ data, systems }) {
  const shares = systemShares(data.systems)
  const first = shares[0]
  const accent = (systems.find((entry) => entry.id === first.system) || {}).accent
  return (
    <div className={styles.column} style={accent ? { '--accent': accent } : undefined}>
      <span className={styles.kicker}>{data.scope === 'house' ? 'La console di casa' : 'La tua console'}</span>
      <h2 className={`pix ${styles.hero} ${styles.accent}`}>{first.name}</h2>
      <p className={styles.lead}>{first.percent}% del tempo · {plural(first.sessions, SESSIONS)}</p>
      <div className={styles.bars}>
        {shares.slice(0, 5).map((item, index) => (
          <div key={item.system} className={styles.barRow}>
            <span className={styles.barName}>{item.name}</span>
            <span className={styles.barTrack}>
              <span className={styles.barFill} style={{ '--w': `${Math.max(item.percent, 2)}%`, '--i': index }} />
            </span>
            <span className={styles.barValue}>{item.percent}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Trophies({ data }) {
  const { trophies } = data
  return (
    <div className={styles.center}>
      <span className={styles.kicker}>Trofei RetroAchievements</span>
      <div className={styles.counter}>
        <span className={`pix ${styles.number} ${styles.gold}`}>
          <Counter value={trophies.count} />
        </span>
        <span className={styles.unit}>{trophies.count === 1 ? 'trofeo' : 'trofei'}</span>
      </div>
      {trophies.topGame && (
        <p className={styles.lead}>
          Il più generoso: <strong>{gameTitle(data, trophies.topGame.game)}</strong>, {plural(trophies.topGame.count, TROPHIES)}
        </p>
      )}
      <ul className={styles.trophyList}>
        {trophies.recent.map((item, index) => (
          <li key={`${item.title}-${index}`} className={styles.trophy} style={{ '--i': index }}>
            <svg className={styles.cup} viewBox="-1 -1 12 12" aria-hidden="true">
              <path d={CUP} shapeRendering="crispEdges" />
            </svg>
            <span className={styles.trophyTitle}>{item.title}</span>
            <span className={styles.trophyGame}>{gameTitle(data, item.game)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Habits({ data }) {
  const { habits, longest } = data
  return (
    <div className={styles.column}>
      <span className={styles.kicker}>{data.scope === 'house' ? 'Le abitudini di casa' : 'Le tue abitudini'}</span>
      <div className={styles.tiles}>
        {habits.weekdayName && (
          <div className={styles.tile} style={{ '--i': 0 }}>
            <span className={styles.tileLabel}>Il giorno preferito</span>
            <span className={`pix ${styles.tileValue}`}>{habits.weekdayName.toUpperCase()}</span>
            <span className={styles.tileNote}>soprattutto {partPhrase(habits.part)}</span>
          </div>
        )}
        <div className={styles.tile} style={{ '--i': 1 }}>
          <span className={styles.tileLabel}>Giorni di fila</span>
          <span className={`pix ${styles.tileValue}`}>{formatNumber(data.streak)}</span>
          <span className={styles.tileNote}>la serie più lunga</span>
        </div>
        {longest && (
          <div className={`${styles.tile} ${styles.wideTile}`} style={{ '--i': 2 }}>
            <span className={styles.tileLabel}>La partita più lunga</span>
            <span className={`pix ${styles.tileValue}`}>{formatDuration(longest.seconds)}</span>
            <span className={styles.tileNote}>
              {gameTitle(data, longest.game)} · {dayLabel(longest.at)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function Rival({ data }) {
  const { rival, profile } = data
  const verdict = rivalVerdict(rival)
  const side = (person, numbers, win) => (
    <div className={win ? `${styles.fighter} ${styles.winner}` : styles.fighter}>
      <Face person={person} className={styles.bigFace} />
      <span className={styles.fighterName}>{person.name}</span>
      <span className={`pix ${styles.fighterXp}`}>{formatNumber(numbers.xp)} XP</span>
      <span className={styles.fighterTime}>{formatDuration(numbers.seconds)}</span>
    </div>
  )
  return (
    <div className={styles.column}>
      <span className={styles.kicker}>Il tuo rivale</span>
      <div className={styles.versus}>
        {side(profile, rival.me, verdict.winner === 'me')}
        <span className={`pix ${styles.vs}`}>VS</span>
        {side(rival.person, rival.them, verdict.winner === 'them')}
      </div>
      <p className={styles.lead}>{verdict.text}</p>
      {rival.together.sessions > 0 && (
        <p className={styles.note}>
          Insieme: {plural(rival.together.sessions, SESSIONS)}, {formatDuration(rival.together.seconds)}
        </p>
      )}
    </div>
  )
}

function Persona({ persona, person }) {
  return (
    <div className={styles.center}>
      <span className={styles.kicker}>{person ? `${person.name}, quest’anno sei…` : 'E il tuo personaggio è…'}</span>
      <div className={styles.reveal}>
        <span className={styles.burst} aria-hidden="true" />
        <h2 className={`pix ${styles.persona}`}>{persona.name.toUpperCase()}</h2>
      </div>
      <p className={styles.lead}>{persona.text}</p>
    </div>
  )
}

function Players({ data }) {
  return (
    <div className={styles.column}>
      <span className={styles.kicker}>La classifica dei giocatori</span>
      <ol className={styles.ranking}>
        {data.players.map((person, index) => (
          <li key={person.id} className={index === 0 ? `${styles.rankRow} ${styles.mvp}` : styles.rankRow} style={{ '--i': index }}>
            <span className={`pix ${styles.rank}`}>{index === 0 ? 'MVP' : index + 1}</span>
            <Face person={person} className={styles.face} />
            <span className={styles.rankText}>
              <span className={styles.rankTitle}>{person.name}</span>
              <span className={styles.rankMeta}>
                {plural(person.sessions, SESSIONS)}
                {person.trophies > 0 ? ` · ${plural(person.trophies, TROPHIES)}` : ''}
              </span>
            </span>
            <span className={styles.rankTime}>
              {formatNumber(person.xp)} XP · {formatDuration(person.seconds)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Duo({ data }) {
  const [first, second] = data.duo.players
  return (
    <div className={styles.center}>
      <span className={styles.kicker}>La coppia inseparabile</span>
      <div className={styles.duo}>
        <Face person={first} className={`${styles.bigFace} ${styles.pop}`} />
        <span className={`pix ${styles.heart}`}>♥</span>
        <Face person={second} className={`${styles.bigFace} ${styles.pop}`} />
      </div>
      <h2 className={styles.gameTitle}>
        {first.name} e {second.name}
      </h2>
      <p className={styles.lead}>
        {plural(data.duo.sessions, SESSIONS)} insieme, {formatDuration(data.duo.seconds)}
      </p>
    </div>
  )
}

function Personas({ data }) {
  return (
    <div className={styles.column}>
      <span className={styles.kicker}>E i personaggi di casa sono…</span>
      <div className={styles.cast}>
        {data.players.map((person, index) => (
          <div key={person.id} className={styles.castCard} style={{ '--i': index, '--profile': person.color }}>
            <Face person={person} className={styles.face} />
            <span className={styles.castName}>{person.name}</span>
            <span className={`pix ${styles.castRole}`}>{person.persona.name.toUpperCase()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Summary({ data, systems }) {
  const house = data.scope === 'house'
  const top = data.topGames[0]
  const time = bigTime(data.totals.seconds)
  return (
    <div className={styles.summary}>
      <div className={styles.summaryHead}>
        {house ? (
          <span className={`pix ${styles.summaryTitle}`}>LA CASA · {data.label.toUpperCase()}</span>
        ) : (
          <>
            <Face person={data.profile} className={styles.face} />
            <span className={`pix ${styles.summaryTitle}`}>
              {data.profile.name} · {data.label.toUpperCase()}
            </span>
          </>
        )}
      </div>
      <div className={styles.summaryGrid}>
        {top && (
          <div className={styles.summaryCover}>
            <Cover data={data} gameKey={top.game} systems={systems} className={styles.bigCover} />
          </div>
        )}
        <dl className={styles.facts}>
          <div>
            <dt>Tempo</dt>
            <dd>
              {formatNumber(time.value, time.decimals)} {time.unit}
            </dd>
          </div>
          <div>
            <dt>Partite</dt>
            <dd>{formatNumber(data.totals.sessions)}</dd>
          </div>
          {top && (
            <div>
              <dt>Gioco</dt>
              <dd>{gameTitle(data, top.game)}</dd>
            </div>
          )}
          {data.systems[0] && (
            <div>
              <dt>Console</dt>
              <dd>{data.systems[0].name}</dd>
            </div>
          )}
          {!house && (
            <div>
              <dt>XP guadagnati</dt>
              <dd>{formatNumber(data.totals.xp)}</dd>
            </div>
          )}
          {data.totals.trophies > 0 && (
            <div>
              <dt>Trofei</dt>
              <dd>{formatNumber(data.totals.trophies)}</dd>
            </div>
          )}
          {house ? (
            data.players[0] && (
              <div>
                <dt>MVP</dt>
                <dd>{data.players[0].name}</dd>
              </div>
            )
          ) : (
            <div>
              <dt>Personaggio</dt>
              <dd>{data.persona.name}</dd>
            </div>
          )}
        </dl>
      </div>
      <span className={styles.hint}>Premi A per chiudere</span>
    </div>
  )
}

/** Schermata `id` del Wrapped `data` (vedi `slidesFor` in src/lib/wrapped.js). */
export default function WrappedSlide({ id, data, systems }) {
  switch (id) {
    case 'intro':
      return <Intro data={data} />
    case 'time':
      return <Time data={data} />
    case 'top':
      return <Top data={data} systems={systems} />
    case 'top5':
      return <Top5 data={data} systems={systems} />
    case 'system':
      return <SystemSlide data={data} systems={systems} />
    case 'trophies':
      return <Trophies data={data} />
    case 'habits':
      return <Habits data={data} />
    case 'rival':
      return <Rival data={data} />
    case 'persona':
      return <Persona persona={data.persona} person={data.kind === 'year' ? data.profile : null} />
    case 'players':
      return <Players data={data} />
    case 'duo':
      return <Duo data={data} />
    case 'personas':
      return <Personas data={data} />
    default:
      return <Summary data={data} systems={systems} />
  }
}
