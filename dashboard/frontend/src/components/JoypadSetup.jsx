import { useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import FaceButton from './FaceButton.jsx'
import ShoulderButton from './ShoulderButton.jsx'
import {
  PAD_STEPS,
  SETUP_STEPS,
  chromeButtons,
  dashboardButtons,
  dashboardError,
  initialLink,
  initialSetup,
  inputToken,
  linkForget,
  linkPress,
  linkToken,
  retropadKey,
  setupBack,
  setupDone,
  setupPress,
  tokenLabel,
} from './joypadSetup.js'
import styles from './JoypadSetup.module.css'

const POLL_MS = 100
const ARROWS = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  l_y_minus: 'L ↑',
  l_y_plus: 'L ↓',
  l_x_minus: 'L ←',
  l_x_plus: 'L →',
  r_y_minus: 'R ↑',
  r_y_plus: 'R ↓',
  r_x_minus: 'R ←',
  r_x_plus: 'R →',
}

/** Nome del joypad nella Gamepad API senza gli id USB (Chrome: `Nome (STANDARD GAMEPAD Vendor: … Product: …)`). */
function padName(pad) {
  const id = pad ? String(pad.id) : ''
  return id.replace(/\s*\(.*\)\s*$/, '') || 'Joypad'
}

/** Icona del tasto del RetroPad: rombo, spalle, freccia o testo. */
export function StepIcon({ step }) {
  if (step.face) {
    return <FaceButton position={step.face} />
  }
  if (step.shoulder) {
    return <ShoulderButton pressed={[step.shoulder]} />
  }
  return <span className={styles.pill}>{ARROWS[step.key] || step.key.toUpperCase()}</span>
}

/**
 * Configurazione di un joypad per i giochi e per la dashboard: chiede un
 * tasto alla volta, legge le pressioni dal backend (`POST/GET
 * /api/joypads/learn`, con la libreria SDL2 di RetroArch), salva
 * l'autoconfig e poi mostra la prova dei tasti finché non si preme START.
 * `device` = joypad di `GET /api/joypads`, oppure `null` se RetroArch non
 * legge i joypad: allora si chiedono solo i tasti della dashboard, letti col
 * browser. `pad` = lo stesso joypad nella Gamepad API (`{index, id}`) e
 * `gamepad.onRaw` i suoi tasti grezzi: abbinati a quelli di RetroArch
 * diventano i tasti della dashboard, salvati con `POST /api/joypads/buttons`
 * (`onSaved(padButtons)`). Senza `pad` si salva solo l'autoconfig. Gli
 * eventi della dashboard vanno ignorati da chi ospita il componente.
 * `who` = chi sta configurando; `onDone()` dopo la prova (START o «Fine»),
 * `onCancel()` da «Annulla».
 */
export default function JoypadSetup({ device, pad = null, gamepad = null, who, onSaved, onDone, onCancel }) {
  const [setup, setSetup] = useState(initialSetup)
  const [phase, setPhase] = useState('learn')
  const [error, setError] = useState('')
  const [lit, setLit] = useState(null)
  const setupRef = useRef(setup)
  const phaseRef = useRef(phase)
  const linkRef = useRef(initialLink())
  const done = useRef(onDone)
  const saved = useRef(onSaved)

  useEffect(() => {
    done.current = onDone
    saved.current = onSaved
  })

  const steps = device ? SETUP_STEPS : PAD_STEPS

  const update = (next) => {
    setupRef.current = next
    setSetup(next)
  }

  const back = () => {
    const current = setupRef.current
    if (current.step > 0) {
      linkRef.current = linkForget(linkRef.current, steps[current.step - 1].key)
    }
    update(setupBack(current, steps))
  }

  const changePhase = (next) => {
    phaseRef.current = next
    setPhase(next)
  }

  const vendor = device ? device.vendor : null
  const product = device ? device.product : null
  const padIndex = pad ? pad.index : null
  const padId = pad ? pad.id : null

  useEffect(() => {
    const sdl = vendor !== null
    const order = sdl ? SETUP_STEPS : PAD_STEPS
    let alive = true
    let after = 0
    let timer = 0

    const save = (binds) => {
      const buttons = sdl ? dashboardButtons(linkRef.current.chrome) : chromeButtons(binds)
      const problem = padId !== null ? dashboardError(buttons) : null
      if (problem) {
        setError(problem)
        return
      }
      changePhase('saving')
      const retroarch = sdl ? api.joypadSave(vendor, product, binds) : Promise.resolve()
      retroarch
        .then(() => (padId !== null ? api.joypadButtons(padId, buttons) : null))
        .then((result) => {
          if (!alive) {
            return
          }
          if (result && saved.current) {
            saved.current(result.padButtons)
          }
          changePhase('test')
        })
        .catch((failure) => alive && setError(failure.message))
    }

    const press = (token) => {
      if (phaseRef.current === 'learn') {
        const previous = setupRef.current
        const next = setupPress(previous, token, order)
        const key = order[previous.step] ? order[previous.step].key : null
        const learned = key && next.binds[key] !== undefined && previous.binds[key] === undefined
        if (sdl) {
          linkRef.current = linkToken(linkRef.current, learned ? key : null, performance.now())
        }
        update(next)
        if (setupDone(next, order)) {
          save(next.binds)
        }
      } else if (phaseRef.current === 'test') {
        const key = retropadKey(setupRef.current.binds, token)
        setLit({ key, token })
        if (key === 'start') {
          changePhase('finished')
          done.current()
        }
      }
    }

    // Tasti grezzi del browser: abbinati a quelli di RetroArch, oppure (senza RetroArch) i tasti stessi.
    let offRaw = () => {}
    if (gamepad && padIndex !== null) {
      let before = null
      offRaw = gamepad.onRaw(({ pad: index, pressed, axes }) => {
        if (index !== padIndex) {
          return
        }
        const inputs = [...pressed, ...(axes || [])]
        // La prima lettura riporta i tasti già premuti (quello che ha aperto la procedura) e gli assi a riposo: non contano.
        const fresh = before === null ? [] : inputs.filter((input) => !before.includes(input))
        before = inputs
        for (const input of fresh) {
          if (sdl) {
            linkRef.current = linkPress(linkRef.current, input, performance.now())
          } else {
            press(inputToken(input))
          }
        }
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
        for (const item of data.presses) {
          press(item.input)
        }
        if (!data.active) {
          setError(data.error || 'Lettura dei tasti interrotta.')
          return
        }
      } catch (failure) {
        if (alive) {
          setError(failure.message)
        }
        return
      }
      timer = window.setTimeout(poll, POLL_MS)
    }

    if (sdl) {
      api.joypadLearn(vendor, product)
        .then(() => poll())
        .catch((failure) => alive && setError(failure.message))
    }
    return () => {
      alive = false
      window.clearTimeout(timer)
      offRaw()
      if (sdl) {
        api.joypadLearnStop().catch(() => {})
      }
    }
  }, [vendor, product, padIndex, padId, gamepad])

  const current = steps[setup.step]
  const learning = phase === 'learn'
  let prompt = null
  if (error) {
    prompt = <div className={styles.error}>{error}</div>
  } else if (learning && current) {
    prompt = (
      <div className={styles.prompt}>
        Premi
        <span className={styles.target}>
          <StepIcon step={current} />
          {current.title}
        </span>
        {current.note && <span className={styles.note}>{current.note}</span>}
        {current.stick && setup.binds.start && (
          <span className={styles.skip}>
            Il joypad non ha le levette? Premi
            <span className={styles.pill}>START</span>
            per finire.
          </span>
        )}
        {current.optional && setup.binds.b && (
          <span className={styles.skip}>
            Non ce l&apos;hai, o premendolo non succede niente? Premi
            <FaceButton position="south" />
            (il tasto in basso) per saltarlo.
          </span>
        )}
      </div>
    )
  } else if (phase === 'saving') {
    prompt = <div className={styles.prompt}>Salvataggio…</div>
  } else if (phase === 'test') {
    prompt = (
      <div className={styles.prompt}>
        Prova i tasti, poi premi
        <span className={styles.target}>
          <span className={styles.pill}>START</span>
          per finire
        </span>
      </div>
    )
  }

  return (
    <div className={styles.setup}>
      <div className={`pix ${styles.title}`}>
        {learning ? `CONFIGURA JOYPAD · ${Math.min(setup.step + 1, steps.length)}/${steps.length}` : 'PROVA DEI TASTI'}
      </div>
      <div className={styles.who}>
        {who} · {device ? device.name : padName(pad)}
      </div>
      {prompt}
      <div className={styles.message} role="status">
        {learning ? setup.message : lit && (lit.key ? `Hai premuto: ${SETUP_STEPS.find((step) => step.key === lit.key).title}` : `${tokenLabel(lit.token)}: non assegnato`)}
      </div>
      <ul className={styles.map}>
        {steps.map((step, index) => {
          const classes = [styles.entry]
          if (learning && index === setup.step) {
            classes.push(styles.current)
          }
          if (!learning && lit && lit.key === step.key) {
            classes.push(styles.lit)
          }
          return (
            <li key={step.key} className={classes.join(' ')}>
              <StepIcon step={step} />
              <span className={styles.name}>{step.title}</span>
              <span className={styles.token}>
                {setup.binds[step.key] ? tokenLabel(setup.binds[step.key]) : index < setup.step ? 'saltato' : '—'}
              </span>
            </li>
          )
        })}
      </ul>
      <div className={styles.actions}>
        {learning && setup.step > 0 && (
          <button type="button" className={styles.button} onClick={back}>
            Indietro
          </button>
        )}
        {phase === 'test' ? (
          <button type="button" className={styles.button} onClick={() => done.current()}>
            Fine
          </button>
        ) : (
          <button type="button" className={styles.button} onClick={onCancel}>
            Annulla
          </button>
        )}
      </div>
    </div>
  )
}
