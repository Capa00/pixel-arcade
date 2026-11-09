import { useEffect, useMemo, useRef, useState } from 'react'
import * as api from '../api/client.js'
import { relativeDay } from '../lib/format.js'
import { hasImages } from '../lib/gameInfo.js'
import {
  CLIP_EVERY_MS, COVER_ASPECT, PAD_POLL_MS, SLIDE_MS, STATUS_POLL_MS, THUMB_ASPECT, buildSlides, padPresses,
  sceneLayout, scenes,
} from '../lib/screensaver.js'
import { adTournaments } from '../lib/tournament.js'
import { useApp } from '../state/AppContext.jsx'
import * as tournamentStore from '../state/tournamentStore.js'
import { splitKey } from '../state/profiles.js'
import GameCover from './GameCover.jsx'
import Logo from './Logo.jsx'
import TournamentPoster from './TournamentPoster.jsx'
import styles from './Screensaver.module.css'

// Copertine della libreria pescate a ogni apertura.
const COVERS_MAX = 40

function sample(list, count) {
  const copy = [...list]
  const result = []
  while (copy.length && result.length < count) {
    result.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0])
  }
  return result
}

/** Copertine (con immagine, se ce ne sono) e preferiti dei profili, dai giochi già caricati. */
function librarySources(state) {
  const all = []
  for (const system of state.systems) {
    for (const game of state.games[system.id] || []) {
      all.push({ system, game })
    }
  }
  const pictured = all.filter((item) => hasImages(item.game))
  const covers = sample(pictured.length ? pictured : all, COVERS_MAX)
  const favorites = []
  for (const account of state.accounts) {
    for (const key of account.favorites || []) {
      const { system: systemId, id } = splitKey(key)
      const system = state.systems.find((entry) => entry.id === systemId)
      const game = system && (state.games[systemId] || []).find((entry) => entry.id === id)
      if (game) {
        favorites.push({ system, game, owner: { name: account.name, color: account.color } })
      }
    }
  }
  return { covers, favorites }
}

/**
 * Spezzoni delle partite (README «Salvaschermo»): con `content` pari a
 * `mixed` ne parte uno ogni `CLIP_EVERY_MS` di copertine, con `games` uno
 * dopo l'altro (copertine solo quando non ce n'è nessuno), con `covers` mai.
 * Restituisce lo spezzone in corso (`{name, color, title, date, …}`) o `null`.
 *
 * Mentre RetroArch lo rigioca Chrome non ha il focus: i joypad si leggono
 * con un timer e una pressione nuova chiude il salvaschermo (il tasto resta
 * bloccato fino al rilascio); se RetroArch viene chiuso (per esempio con
 * Esc) o fermato da fuori, il salvaschermo si chiude. Alla chiusura lo
 * spezzone si ferma.
 */
function useReplays(content, onClose, gamepad) {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  const [clip, setClip] = useState(null)
  const [plan, setPlan] = useState(() => ({ delay: content === 'games' ? 0 : CLIP_EVERY_MS }))

  // Prossimo spezzone, dopo l'attesa del piano.
  useEffect(() => {
    if (content === 'covers' || clip) {
      return undefined
    }
    let alive = true
    const later = () => {
      if (alive) {
        setPlan({ delay: CLIP_EVERY_MS })
      }
    }
    const timer = window.setTimeout(() => {
      api.replayNext()
        .then((data) => (data.replay ? api.replayPlay(data.replay.id) : null))
        .then((status) => {
          if (!status) {
            later()
          } else if (!alive) {
            api.replayStop().catch(() => {})
          } else {
            setClip(status.showing)
          }
        })
        .catch(later)
    }, plan.delay)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [content, clip, plan])

  // Spezzone in corso: joypad e stato di RetroArch.
  useEffect(() => {
    if (!clip) {
      return undefined
    }
    let alive = true
    let held = null
    const pads = window.setInterval(() => {
      const gamepads = navigator.getGamepads ? Array.from(navigator.getGamepads() || []) : []
      const step = padPresses(held || new Set(), gamepads)
      const fired = held !== null && step.pressed
      held = step.held
      if (fired && alive) {
        alive = false
        if (gamepad) {
          gamepad.lockUntilReleased()
        }
        closeRef.current()
      }
    }, PAD_POLL_MS)
    const status = window.setInterval(() => {
      api.replayStatus()
        .then((data) => {
          if (!alive || data.playing) {
            return
          }
          if (data.reason === 'ended') {
            setClip(null)
            setPlan({ delay: content === 'games' ? 0 : CLIP_EVERY_MS })
          } else {
            alive = false
            closeRef.current()
          }
        })
        .catch(() => {})
    }, STATUS_POLL_MS)
    return () => {
      alive = false
      window.clearInterval(pads)
      window.clearInterval(status)
      api.replayStop().catch(() => {})
    }
  }, [clip, content, gamepad])

  return clip
}

/**
 * Salvaschermo: dopo l'attesa scelta in Impostazioni → Aspetto (App.jsx)
 * mostra a turno, sopra il tema grafico, copertine a caso della libreria,
 * preferiti dei profili e miniature dei «Riprendi» (src/lib/screensaver.js),
 * da due a quattro alla volta (due sugli schermi più alti che larghi), in
 * punti e grandezze a caso che non si sovrappongono; ogni immagine si muove
 * piano in una sua direzione e a una sua velocità, per non segnare lo schermo. Un clic o un tocco lo chiudono con `onClose` (sul clic, così il
 * rilascio non arriva a ciò che sta sotto); tasti, joypad e mouse mosso li
 * gestisce App, che non li fa arrivare alla dashboard.
 *
 * Con il contenuto «Misto» o «Partite» (Impostazioni → Aspetto) rigioca in
 * RetroArch gli spezzoni delle partite dei profili (`useReplays`).
 */
export default function Screensaver({ onClose, gamepad, onAd }) {
  const { state } = useApp()
  const { list } = tournamentStore.useTournaments()
  const ads = state.tournamentAds === false ? [] : adTournaments(list, new Date())
  // Libreria e profili all'apertura: il giro non cambia se si aggiornano mentre è aperto. Con un torneo di oggi
  // (e la pubblicità accesa) il salvaschermo è solo il suo manifesto, senza spezzoni.
  const opening = useRef(null)
  if (opening.current === null) {
    opening.current = { state, sources: librarySources(state), ads: ads.length > 0 }
  }
  const clip = useReplays(opening.current.ads ? 'covers' : opening.current.state.screensaverContent, onClose, gamepad)
  const [slides, setSlides] = useState(() => buildSlides(opening.current.sources))
  const [index, setIndex] = useState(0)

  // «Riprendi» dei profili: arrivano dopo, si aggiungono al giro.
  useEffect(() => {
    let alive = true
    const { state: start, sources } = opening.current
    Promise.all(start.accounts.map((account) =>
      api.saves(account.id)
        .then((data) => (data.games || [])
          .filter((game) => game.thumb && game.resumeAt && !game.missing)
          .map((game) => {
            const system = start.systems.find((entry) => entry.id === game.system)
            return system ? { system, game, account: account.id, at: game.resumeAt, owner: { name: account.name, color: account.color } } : null
          })
          .filter(Boolean))
        .catch(() => []),
    )).then((lists) => {
      const resumes = lists.flat()
      if (alive && resumes.length) {
        setSlides(buildSlides({ ...sources, resumes }))
        setIndex(0)
      }
    })
    return () => {
      alive = false
    }
  }, [])

  // Grandezza del salvaschermo, per i posti delle immagini.
  const box = useRef(null)
  const [size, setSize] = useState(null)
  useEffect(() => {
    const element = box.current
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const wide = !size || size.width > size.height
  const groups = useMemo(() => scenes(slides, Math.random, wide ? undefined : 2), [slides, wide])
  useEffect(() => {
    if (groups.length < 2) {
      return undefined
    }
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % groups.length), SLIDE_MS)
    return () => window.clearInterval(timer)
  }, [groups])

  const scene = groups[index % Math.max(1, groups.length)]
  const places = useMemo(() => (scene && size
    ? sceneLayout(scene.map((slide) => (slide.kind === 'resume' ? THUMB_ASPECT : COVER_ASPECT)), size.width, size.height)
    : []), [scene, size])
  const now = Date.now()
  return (
    <div className={styles.saver} onClick={onClose} role="presentation" ref={box}>
      {opening.current.ads && ads.length ? (
        <TournamentPoster tournaments={ads} systems={state.systems} onShown={onAd} />
      ) : clip ? (
        <div className={`${styles.scene} ${styles.center}`}>
          <p className={styles.clip}>
            <span className={styles.owner} style={{ '--owner': clip.color }}>{clip.name}</span>
            {` · ${clip.title} · ${clip.date}`}
          </p>
        </div>
      ) : scene && places.length ? (
        <div key={`${index}:${scene[0].key}`} className={styles.scene}>
          {scene.map((slide, position) => places[position] && (
            <figure
              key={slide.key}
              className={styles.slide}
              style={{
                left: places[position].left,
                top: places[position].top,
                '--w': `${places[position].width}px`,
                '--h': `${places[position].height}px`,
                '--dx': `${places[position].dx}px`,
                '--dy': `${places[position].dy}px`,
              }}
            >
              {slide.kind === 'resume' ? (
                <img
                  className={styles.thumb}
                  src={api.saveThumbUrl(slide.account, slide.system.id, slide.game.id, 0, slide.at)}
                  alt=""
                  draggable="false"
                />
              ) : (
                <GameCover system={slide.system} game={slide.game} className={styles.cover} />
              )}
              <figcaption className={styles.caption}>
                <span className={styles.title}>{slide.game.title}</span>
                <span className={styles.meta}>
                  {slide.system.name}
                  {slide.owner && (
                    <>
                      {' · '}
                      <span className={styles.owner} style={{ '--owner': slide.owner.color }}>
                        {slide.kind === 'resume' ? 'Riprendi di ' : 'Preferito di '}
                        {slide.owner.name}
                      </span>
                      {slide.kind === 'resume' && ` · ${relativeDay(Date.parse(slide.at), now)}`}
                    </>
                  )}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : !scene ? (
        <div className={`${styles.scene} ${styles.center}`}>
          <Logo className={styles.logo} />
        </div>
      ) : null}
    </div>
  )
}
