import { useEffect, useRef } from 'react'
import * as api from '../api/client.js'

export const POLL_MS = 1000

/**
 * Finché `running` è vero legge `GET /api/run` ogni secondo e passa lo stato
 * a `onRun(run)`. Un errore di rete non ferma il polling: il servizio può
 * essere momentaneamente occupato.
 */
export function useRunPolling(running, onRun) {
  const callback = useRef(onRun)

  useEffect(() => {
    callback.current = onRun
  })

  useEffect(() => {
    if (!running) {
      return undefined
    }
    let active = true
    let timer = 0
    const tick = async () => {
      try {
        const run = await api.run()
        if (active) {
          callback.current(run)
        }
      } catch {
        // Nuovo tentativo al prossimo giro.
      }
      if (active) {
        timer = window.setTimeout(tick, POLL_MS)
      }
    }
    timer = window.setTimeout(tick, POLL_MS)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [running])
}
