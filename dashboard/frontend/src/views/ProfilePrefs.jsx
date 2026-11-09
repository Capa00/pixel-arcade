import { useCallback, useEffect, useState } from 'react'
import * as api from '../api/client.js'
import Segmented from '../components/Segmented.jsx'
import Toggle from '../components/Toggle.jsx'
import { bumpAvatar } from '../lib/avatar.js'
import { openKeyboard, showToast } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import { NAME_MAX, SWATCHES, normalizeName } from '../state/players.js'
import { DIFFICULTIES, GENRES, OPTIONS } from '../state/profiles.js'
import styles from './Profile.module.css'

// Destinazione del testo della tastiera a schermo per l'email Gravatar.
const EMAIL_TARGET = 'gravatarEmail'
const EMAIL_MAX = 254
// Destinazione del testo della tastiera a schermo per il nuovo nome del profilo.
const NAME_TARGET = 'profileRename'

/**
 * Nome e colore del profilo registrato: il nome si scrive con la tastiera a
 * schermo (fisica o del joypad `pad`), il colore si sceglie tra i campioni
 * della creazione. Le modifiche passano da `patch(value)`: se il nome è già
 * di un altro profilo il backend le rifiuta e torna il nome di prima.
 */
function IdentityGroup({ profile, pad, item, patch }) {
  const { state, dispatch } = useApp()
  const [asking, setAsking] = useState(false)

  // Tastiera chiusa: con un nome confermato e diverso da quello attuale si salva.
  const keyboardText = state.keyboardText
  const keyboardOpen = Boolean(state.osk)
  useEffect(() => {
    if (!asking || keyboardOpen) {
      return
    }
    setAsking(false)
    const target = keyboardText && keyboardText.target
    const value = keyboardText ? normalizeName(keyboardText.value) : ''
    if (target && target.kind === NAME_TARGET && value && value !== profile.name) {
      patch({ name: value })
    }
  }, [asking, keyboardOpen, keyboardText, patch, profile.name])

  const rename = () => {
    if (state.osk) {
      return
    }
    setAsking(true)
    dispatch(openKeyboard('text', {
      owner: pad,
      value: profile.name,
      max: NAME_MAX,
      title: 'Nome del profilo',
      placeholder: 'es. PLAYER_ONE',
      target: { kind: NAME_TARGET },
      upper: true,
    }))
  }

  return (
    <div className={styles.prefsRow}>
      <div className={styles.group}>
        <div className={styles.groupLabel}>NOME</div>
        <div className={styles.chips}>
          <button type="button" className={styles.ghost} {...item('identity-name', rename)}>
            {profile.name}
          </button>
        </div>
        <span className={styles.emptyText}>Si scrive con la tastiera a schermo, al massimo {NAME_MAX} caratteri.</span>
      </div>
      <div className={styles.group}>
        <div className={styles.groupLabel}>COLORE</div>
        <div className={styles.swatches}>
          {SWATCHES.map((color) => {
            const on = color === profile.color
            return (
              <button
                key={color}
                type="button"
                className={on ? `${styles.swatch} ${styles.swatchOn}` : styles.swatch}
                style={{ background: color }}
                aria-label={`Colore ${color}`}
                aria-pressed={on}
                {...item(`identity-color-${color}`, () => {
                  if (!on) {
                    patch({ color })
                  }
                })}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Avatar Gravatar del profilo registrato `accountId`: l'email si scrive con
 * la tastiera a schermo (fisica o del joypad `pad`) e il backend ne salva
 * solo l'hash, quindi qui non si rivede. Dopo ogni modifica si ricaricano i profili.
 */
function GravatarGroup({ accountId, linked, pad, item }) {
  const { state, dispatch, loadProfiles } = useApp()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)

  const save = useCallback((email, message) => {
    setBusy(true)
    api
      .updateProfile(accountId, { email })
      .then(() => {
        bumpAvatar(accountId)
        dispatch(showToast(message))
        return loadProfiles()
      })
      .catch((error) => dispatch(showToast(error.message, 'error')))
      .finally(() => setBusy(false))
  }, [accountId, dispatch, loadProfiles])

  // Tastiera chiusa: con un testo confermato si collega l'email.
  const keyboardText = state.keyboardText
  const keyboardOpen = Boolean(state.osk)
  useEffect(() => {
    if (!asking || keyboardOpen) {
      return
    }
    setAsking(false)
    const target = keyboardText && keyboardText.target
    const value = keyboardText ? keyboardText.value.trim() : ''
    if (target && target.kind === EMAIL_TARGET && value) {
      save(value, 'Gravatar collegato.')
    }
  }, [asking, keyboardOpen, keyboardText, save])

  const ask = () => {
    if (busy || state.osk) {
      return
    }
    setAsking(true)
    dispatch(openKeyboard('text', {
      owner: pad,
      max: EMAIL_MAX,
      title: 'Email Gravatar',
      placeholder: 'Email del tuo account gravatar.com',
      target: { kind: EMAIL_TARGET },
    }))
  }

  const unlink = () => {
    if (!busy) {
      save(null, 'Gravatar scollegato.')
    }
  }

  return (
    <div className={styles.group}>
      <div className={styles.groupLabel}>AVATAR GRAVATAR</div>
      <span className={styles.emptyText}>
        {linked
          ? 'Gravatar collegato. Se compare ancora l\'iniziale, quell\'email non ha un\'immagine su gravatar.com o manca la rete.'
          : 'Usa come avatar l\'immagine del tuo account gravatar.com. L\'email serve solo a trovarla e non viene conservata.'}
      </span>
      <div className={styles.chips}>
        <button type="button" className={styles.ghost} {...item('gravatar-set', ask)}>
          {busy ? 'Attendi…' : linked ? 'Cambia email' : 'Collega email'}
        </button>
        {linked && (
          <button type="button" className={`${styles.ghost} ${styles.leave}`} {...item('gravatar-unlink', unlink)}>
            Scollega
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Scheda «Preferenze» della pagina profilo: per un profilo registrato
 * (`accountId` non `null`) nome e colore, poi console preferita, generi,
 * difficoltà, opzioni e, sempre per un profilo registrato, l'avatar Gravatar. `item(id, onActivate)` sono le voci navigabili della
 * pagina; `patch(value)` modifica il profilo; `pad` è il joypad del giocatore.
 */
export default function ProfilePrefs({ profile, accountId, pad, item, patch }) {
  const { state } = useApp()
  const genres = profile.genres || []
  const opts = profile.opts || {}
  const hasConsole = state.systems.some((system) => system.id === profile.favConsole)

  return (
    <div className={styles.prefs}>
      {accountId !== null && <IdentityGroup profile={profile} pad={pad} item={item} patch={patch} />}
      <div className={styles.group}>
        <div className={styles.groupLabel}>CONSOLE PREFERITA</div>
        <div className={styles.chips}>
          {state.systems.map((system, position) => {
            const on = system.id === profile.favConsole
            return (
              <button
                key={system.id}
                type="button"
                aria-pressed={on}
                className={on ? `${styles.chip} ${styles.consoleOn}` : styles.chip}
                data-autofocus={on || (!hasConsole && position === 0) || undefined}
                {...item(`console-${system.id}`, () => patch({ favConsole: system.id }))}
              >
                {system.name}
              </button>
            )
          })}
        </div>
      </div>
      <div className={styles.group}>
        <div className={styles.groupLabel}>GENERI PREFERITI</div>
        <div className={styles.chips}>
          {GENRES.map((genre) => {
            const on = genres.includes(genre)
            const next = on ? genres.filter((entry) => entry !== genre) : [...genres, genre]
            return (
              <button
                key={genre}
                type="button"
                aria-pressed={on}
                className={on ? `${styles.chip} ${styles.genreOn}` : styles.chip}
                {...item(`genre-${genre}`, () => patch({ genres: GENRES.filter((entry) => next.includes(entry)) }))}
              >
                {genre}
              </button>
            )
          })}
        </div>
      </div>
      <div className={styles.prefsRow}>
        <div className={styles.group}>
          <div className={styles.groupLabel}>DIFFICOLTÀ</div>
          <Segmented
            options={DIFFICULTIES}
            value={profile.difficulty}
            label="Difficoltà"
            item={(value) => item(`difficulty-${value}`, () => patch({ difficulty: value }))}
          />
        </div>
        <div className={styles.group}>
          <div className={styles.groupLabel}>OPZIONI</div>
          <div className={styles.toggles}>
            {OPTIONS.map((option) => (
              <Toggle
                key={option.id}
                label={option.label}
                on={Boolean(opts[option.id])}
                focusProps={item(`opt-${option.id}`, () => patch({ opts: { [option.id]: !opts[option.id] } }))}
              />
            ))}
          </div>
        </div>
      </div>
      {accountId !== null && (
        <GravatarGroup accountId={accountId} linked={Boolean(profile.avatar)} pad={pad} item={item} />
      )}
    </div>
  )
}
