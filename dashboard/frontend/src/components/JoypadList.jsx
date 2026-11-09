import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api/client.js'
import JoypadKeys from './JoypadKeys.jsx'
import JoypadSetup from './JoypadSetup.jsx'
import { chromePadOf } from './joypadSetup.js'
import styles from './JoypadList.module.css'

function sameDevice(first, second) {
  return Boolean(first && second) && first.index === second.index && first.vendor === second.vendor &&
    first.product === second.product
}

/**
 * Joypad visti da RetroArch nelle Impostazioni (`GET /api/joypads`): stato
 * dell'autoconfig, «Impara tasti» per ognuno (src/components/JoypadKeys.jsx:
 * un tasto alla volta oppure «Rifai tutto») e «Ripristina tasti di
 * RetroArch» (`POST /api/joypads/repair`). I cambi valgono anche per la
 * dashboard del joypad, se il browser lo vede (`gamepad` di useInput,
 * `padButtons`, `onSaved(padButtons)`). `item(id, fn)` = `useFocusScope().item`;
 * `onSetup(attiva)` avvisa le Impostazioni quando si aspettano i tasti del
 * joypad (i tasti di Chrome vanno ignorati) e in quel momento
 * `inputRef.current(event)` riceve i loro eventi: Esc annulla.
 * `notify(testo, tipo)` mostra un avviso.
 */
export default function JoypadList({ item, gamepad, padButtons, inputRef, onSetup, onSaved, notify }) {
  const [data, setData] = useState(null)
  // Joypad aperto in «Impara tasti» e, con `full`, nella procedura completa.
  const [edit, setEdit] = useState(null)
  const [full, setFull] = useState(false)
  const [pad, setPad] = useState(null)
  const [busy, setBusy] = useState(false)
  const keysCancel = useRef(null)
  const fullCancel = useRef(null)

  const load = useCallback(() => {
    api.joypads()
      .then(setData)
      .catch((error) => setData({ devices: [], error: error.message }))
  }, [])

  useEffect(load, [load])

  useEffect(() => {
    inputRef.current = (event) => {
      if (event.kind === 'press' && event.button === 'b' && event.pad === null) {
        const cancel = fullCancel.current || keysCancel.current
        if (cancel) {
          cancel()
        }
      }
    }
    return () => {
      inputRef.current = null
    }
  }, [inputRef])

  const open = (device) => {
    const gamepads = typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()) : []
    setPad(chromePadOf(gamepads, device))
    setEdit(device)
  }

  const back = () => {
    setEdit(null)
    setPad(null)
  }

  const redo = () => {
    setFull(true)
    onSetup(true)
  }

  const closeFull = (configured) => {
    setFull(false)
    onSetup(false)
    gamepad.lockUntilReleased()
    if (configured) {
      notify(pad ? 'Joypad configurato.' : 'Joypad configurato per i giochi. Per la dashboard premi un suo tasto e riprova.')
    }
    load()
  }
  fullCancel.current = full ? () => closeFull(false) : null

  const repair = () => {
    setBusy(true)
    api.joypadRepair()
      .then((result) => notify(result.changed
        ? `retroarch.cfg sistemato: ${result.changed} valori cambiati, copia in ${result.backup}.`
        : 'retroarch.cfg era già a posto.'))
      .catch((error) => notify(error.message, 'error'))
      .finally(() => setBusy(false))
  }

  if (!data) {
    return <div className={styles.note}>Lettura dei joypad…</div>
  }
  // Dopo un salvataggio il joypad si rilegge: «Impara tasti» mostra i tasti nuovi.
  const editing = edit ? data.devices.find((device) => sameDevice(device, edit)) || null : null
  return (
    <div className={styles.list}>
      {editing ? (
        <JoypadKeys
          device={editing}
          pad={pad}
          padButtons={padButtons}
          gamepad={gamepad}
          item={item}
          cancelRef={keysCancel}
          onLearning={onSetup}
          onSaved={onSaved}
          onChanged={load}
          onRedo={redo}
          onBack={back}
          notify={notify}
        />
      ) : (
        <>
          {data.error && <div className={styles.note}>{data.error}</div>}
          {data.supported && !data.devices.length && <div className={styles.note}>Nessun joypad collegato.</div>}
          {data.devices.map((device) => (
            <div key={`${device.index}-${device.vendor}-${device.product}`} className={styles.row}>
              <span className={styles.text}>
                <span className={styles.name}>{device.name}</span>
                <span className={styles.sub}>
                  {device.configured ? `Configurato · ${device.profile}` : 'Non configurato'}
                  {device.controller ? ' · letto come game controller' : ''}
                </span>
              </span>
              <button type="button" className={styles.button} {...item(`pad:setup:${device.index}`, () => open(device))}>
                Impara tasti
              </button>
            </div>
          ))}
          {data.supported && (
            <div className={styles.actions}>
              <button type="button" className={styles.button} disabled={busy} {...item('pad:repair', repair)}>
                Ripristina tasti di RetroArch
              </button>
              <span className={styles.note}>
                Toglie dal retroarch.cfg i tasti dei giocatori 1 e 2, così valgono quelli configurati qui (con copia di riserva).
              </span>
            </div>
          )}
        </>
      )}
      {full && editing && (
        <div className={styles.overlay}>
          <section className={styles.panel} role="dialog" aria-label="Configura joypad">
            <JoypadSetup
              device={editing}
              pad={pad}
              gamepad={gamepad}
              who="Impostazioni"
              onSaved={onSaved}
              onDone={() => closeFull(true)}
              onCancel={() => closeFull(false)}
            />
          </section>
        </div>
      )}
    </div>
  )
}
