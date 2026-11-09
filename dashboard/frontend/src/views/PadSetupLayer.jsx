import { useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import JoypadSetup from '../components/JoypadSetup.jsx'
import { findDevice, padIds } from '../components/joypadSetup.js'
import { buttonsFor } from '../input/mapping.js'
import { padButtonsSaved, showToast } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import styles from './PadSetupLayer.module.css'

function padKey(pad) {
  return `${pad.index}|${pad.id}`
}

/**
 * Configurazione obbligatoria dei joypad nuovi: appena il browser vede un
 * joypad (`pads`, `[{index, id}]` di useInput) senza tasti salvati, si apre
 * la procedura di src/components/JoypadSetup.jsx, che salva insieme
 * l'autoconfig di RetroArch e i tasti della dashboard. Finché non è
 * configurato il joypad non comanda la dashboard (src/input/gamepad.js).
 * Si annulla con Esc, col clic su «Annulla» o scollegando il joypad: il
 * joypad resta escluso finché non viene ricollegato. Aspetta `canSetup`
 * (niente partita in corso o salvaschermo); compare anche sopra la
 * schermata iniziale, che senza tasti il joypad non potrebbe chiudere.
 *
 * Finché è aperta riceve tutti gli eventi da `inputRef.current(event)` e
 * indica la legenda con `onContext` (`padSetup`).
 */
export default function PadSetupLayer({ pads, gamepad, inputRef, onContext, canSetup }) {
  const { state, dispatch } = useApp()
  // Joypad per cui si è annullata la configurazione (`indice|id`), finché restano collegati.
  const [skipped, setSkipped] = useState(() => new Set())
  // Joypad di RetroArch abbinato a quello in configurazione: `{key, device}` (`device` nullo se RetroArch non lo legge).
  const [found, setFound] = useState(null)
  // Joypad in configurazione (`indice|id`): resta aperto anche dopo il salvataggio, per la prova dei tasti.
  const [activeKey, setActiveKey] = useState(null)
  const cancelRef = useRef(null)

  const visibleKey = pads.map(padKey).join('\n')
  useEffect(() => {
    const visible = new Set(visibleKey ? visibleKey.split('\n') : [])
    setSkipped((current) => {
      const next = new Set([...current].filter((key) => visible.has(key)))
      return next.size === current.size ? current : next
    })
  }, [visibleKey])

  const active = pads.find((pad) => padKey(pad) === activeKey) || null
  const pending = canSetup ? pads.find((pad) => !buttonsFor(state.padButtons, pad) && !skipped.has(padKey(pad))) || null : null
  const target = active || pending
  const targetKey = target ? padKey(target) : null
  const targetId = target ? target.id : null

  useEffect(() => {
    if (targetKey !== activeKey) {
      setActiveKey(targetKey)
    }
  }, [targetKey, activeKey])

  useEffect(() => {
    if (!targetKey) {
      setFound(null)
      return undefined
    }
    let alive = true
    const done = (device) => alive && setFound({ key: targetKey, device })
    api.joypads()
      .then((data) => done(data.supported ? findDevice(data.devices, padIds(targetId)) : null))
      .catch(() => done(null))
    return () => {
      alive = false
    }
  }, [targetKey, targetId])

  const ready = target && found && found.key === targetKey

  cancelRef.current = () => {
    if (!target) {
      return
    }
    setSkipped((current) => new Set(current).add(targetKey))
    setActiveKey(null)
    dispatch(showToast('Joypad non configurato: non comanda la dashboard. Scollegalo e ricollegalo per riprovare.'))
  }

  const finish = () => {
    setActiveKey(null)
    gamepad.lockUntilReleased()
    dispatch(showToast('Joypad configurato.'))
  }

  useEffect(() => {
    onContext(target ? 'padSetup' : null)
  }, [target, onContext])
  useEffect(() => () => onContext(null), [onContext])

  const open = Boolean(target)
  useEffect(() => {
    inputRef.current = open
      ? (event) => {
          // I tasti del joypad li legge la procedura; Esc (o il clic sulla legenda) annulla.
          if (event.kind === 'press' && event.button === 'b' && event.pad === null) {
            cancelRef.current()
          }
          return true
        }
      : null
    return () => {
      inputRef.current = null
    }
  }, [inputRef, open])

  if (!target) {
    return null
  }
  return (
    <div className={styles.layer}>
      <div className={styles.backdrop} />
      <section className={styles.panel} role="dialog" aria-label="Configura il joypad">
        <div className={styles.heading}>Nuovo joypad</div>
        <div className={styles.sub}>
          Prima di usarlo, premi i tasti che ti vengono chiesti. Per annullare premi Esc sulla tastiera o scollega il joypad.
        </div>
        {ready ? (
          <JoypadSetup
            key={targetKey}
            device={found.device}
            pad={target}
            gamepad={gamepad}
            who={`Joypad ${target.index + 1}`}
            onSaved={(padButtons) => dispatch(padButtonsSaved(padButtons))}
            onDone={finish}
            onCancel={() => cancelRef.current()}
          />
        ) : (
          <div className={styles.sub}>Lettura del joypad…</div>
        )}
      </section>
    </div>
  )
}
