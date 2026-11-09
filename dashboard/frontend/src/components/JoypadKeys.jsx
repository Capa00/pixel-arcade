import { useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import { StepIcon } from './JoypadSetup.jsx'
import {
  DASHBOARD_KEYS,
  LINK_MS,
  SETUP_STEPS,
  currentBinds,
  initialLink,
  linkPress,
  linkToken,
  replaceBind,
  replaceDashboard,
  tokenLabel,
} from './joypadSetup.js'
import styles from './JoypadList.module.css'

const POLL_MS = 100

/**
 * «Impara tasti» di un joypad nelle Impostazioni: tutti i tasti con quello
 * assegnato; scelto un tasto si preme quello nuovo e cambia solo lui, per i
 * giochi (autoconfig di RetroArch, `POST /api/joypads/save`) e, se il browser
 * vede il joypad (`pad`), per la dashboard (`POST /api/joypads/buttons`).
 * Ripremere il tasto che c'era già lo lascia com'è. «Rifai tutto»
 * (`onRedo`) ripete la procedura completa, «Indietro» (`onBack`) torna
 * all'elenco. `cancelRef.current()` annulla l'attesa del tasto (Esc dalle
 * Impostazioni); `onLearning(attiva)` avvisa che si aspetta un tasto;
 * `onSaved(padButtons)`, `onChanged()` e `notify(testo, tipo)` come in JoypadList.
 */
export default function JoypadKeys({
  device,
  pad,
  padButtons,
  gamepad,
  item,
  cancelRef,
  onLearning,
  onSaved,
  onChanged,
  onRedo,
  onBack,
  notify,
}) {
  const [learning, setLearning] = useState(null)
  const [message, setMessage] = useState('')
  const live = useRef({})

  useEffect(() => {
    live.current = { padButtons, onSaved, onChanged, onLearning, notify }
  })

  const binds = currentBinds(device.binds)
  const bindsKey = JSON.stringify(binds)
  const { vendor, product } = device
  const padIndex = pad ? pad.index : null
  const padId = pad ? pad.id : null

  const stop = (text, kind) => {
    setLearning(null)
    setMessage('')
    live.current.onLearning(false)
    gamepad.lockUntilReleased()
    if (text) {
      live.current.notify(text, kind)
    }
  }

  cancelRef.current = learning ? () => stop('') : null

  const start = (key) => {
    setMessage('')
    setLearning(key)
    live.current.onLearning(true)
  }

  useEffect(() => {
    if (!learning) {
      return undefined
    }
    const key = learning
    const known = JSON.parse(bindsKey)
    const dashboard = padId !== null && DASHBOARD_KEYS[key]
    let alive = true
    let after = 0
    let timer = 0
    let wait = 0
    let link = initialLink()
    let pending = null
    let saving = false

    const save = (next, input) => {
      saving = true
      const current = live.current.padButtons[padId]
      api.joypadSave(vendor, product, next)
        .then(() => (dashboard && current ? api.joypadButtons(padId, replaceDashboard(current, key, input)) : null))
        .then((result) => {
          if (!alive) {
            return
          }
          if (result) {
            live.current.onSaved(result.padButtons)
          }
          live.current.onChanged()
          const step = SETUP_STEPS.find((entry) => entry.key === key)
          stop(`${step.title}: tasto cambiato.`)
        })
        .catch((failure) => {
          saving = false
          if (alive) {
            setMessage(failure.message)
          }
        })
    }

    // Salva quando c'è il tasto di RetroArch e, per la dashboard, anche quello del browser.
    const check = () => {
      if (!pending || saving) {
        return
      }
      if (!dashboard) {
        save(pending, null)
        return
      }
      if (link.chrome[key] !== undefined) {
        window.clearTimeout(wait)
        save(pending, link.chrome[key])
      }
    }

    const press = (token) => {
      if (saving) {
        return
      }
      const result = replaceBind(known, key, token)
      if (result.same) {
        stop('Tasto invariato.')
        return
      }
      if (result.error) {
        setMessage(result.error)
        link = linkToken(link, null, performance.now())
        return
      }
      pending = result.binds
      link = linkToken(link, key, performance.now())
      if (dashboard) {
        window.clearTimeout(wait)
        wait = window.setTimeout(() => {
          if (alive && !saving && link.chrome[key] === undefined) {
            pending = null
            link = initialLink()
            setMessage('La dashboard non ha visto il tasto: premilo di nuovo.')
          }
        }, LINK_MS + POLL_MS)
      }
      check()
    }

    let offRaw = () => {}
    if (dashboard && padIndex !== null) {
      let before = null
      offRaw = gamepad.onRaw(({ pad: index, pressed, axes }) => {
        if (index !== padIndex) {
          return
        }
        const inputs = [...pressed, ...(axes || [])]
        const fresh = before === null ? [] : inputs.filter((input) => !before.includes(input))
        before = inputs
        for (const input of fresh) {
          link = linkPress(link, input, performance.now())
        }
        check()
      })
    }

    const poll = async () => {
      if (!alive) {
        return
      }
      try {
        const data = await api.joypadLearnState(after)
        if (!alive) {
          return
        }
        after = data.seq
        for (const entry of data.presses) {
          press(entry.input)
        }
        if (!data.active) {
          setMessage(data.error || 'Lettura dei tasti interrotta.')
          return
        }
      } catch (failure) {
        if (alive) {
          setMessage(failure.message)
        }
        return
      }
      timer = window.setTimeout(poll, POLL_MS)
    }

    api.joypadLearn(vendor, product)
      .then(() => poll())
      .catch((failure) => alive && setMessage(failure.message))
    return () => {
      alive = false
      window.clearTimeout(timer)
      window.clearTimeout(wait)
      offRaw()
      api.joypadLearnStop().catch(() => {})
    }
    // `stop` cambia a ogni disegno ma usa solo stato e `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learning, bindsKey, vendor, product, padIndex, padId, gamepad])

  const waiting = learning ? SETUP_STEPS.find((step) => step.key === learning) : null
  return (
    <div className={styles.list}>
      <div className={styles.row}>
        <span className={styles.text}>
          <span className={styles.name}>{device.name}</span>
          <span className={styles.sub}>
            {device.configured ? 'Scegli un tasto e premi quello nuovo' : 'Non configurato: usa «Rifai tutto»'}
            {pad ? '' : ' · La dashboard non vede ancora questo joypad: cambia solo nei giochi'}
          </span>
        </span>
        <button type="button" className={styles.button} {...item('pad:keys:redo', onRedo)}>
          Rifai tutto
        </button>
        <button type="button" className={styles.button} {...item('pad:keys:back', onBack)}>
          Indietro
        </button>
      </div>
      {waiting && (
        <div className={styles.waiting} role="status">
          <span className={styles.name}>Premi il nuovo tasto per «{waiting.title}»</span>
          <span className={styles.sub}>
            {message || 'Ripremi quello attuale per lasciarlo com\'è · Esc per annullare'}
          </span>
          <button type="button" className={styles.button} onClick={() => stop('')}>
            Annulla
          </button>
        </div>
      )}
      {!waiting && message && <div className={styles.note}>{message}</div>}
      <div className={styles.keys}>
        {SETUP_STEPS.map((step) => {
          const focus = device.configured && !learning ? item(`pad:key:${step.key}`, () => start(step.key)) : {}
          return (
            <button
              key={step.key}
              type="button"
              className={learning === step.key ? `${styles.key} ${styles.current}` : styles.key}
              disabled={!device.configured || Boolean(learning)}
              {...focus}
            >
              <StepIcon step={step} />
              <span className={styles.keyName}>{step.title}</span>
              <span className={styles.token}>{binds[step.key] ? tokenLabel(binds[step.key]) : '—'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
