import { useEffect } from 'react'

export const POINTER_IDLE_MS = 3000

/**
 * Il passaggio del mouse sposta la selezione solo se il mouse è davvero in uso
 * (cursore visibile) o col tocco: così un cursore fermo e nascosto non ruba la
 * selezione quando questa cambia col joypad.
 */
export function pointerActive(event) {
  return event.pointerType !== 'mouse' || document.documentElement.hasAttribute('data-pointer')
}

/**
 * Mostra il cursore del mouse solo mentre viene usato: compare al movimento e
 * sparisce dopo `POINTER_IDLE_MS` di inattività. Senza mouse resta nascosto.
 * Lo stato è l'attributo `data-pointer="visible"` su `<html>`.
 */
export function usePointerVisibility() {
  useEffect(() => {
    const root = document.documentElement
    let timer = 0
    const hide = () => root.removeAttribute('data-pointer')
    const show = (event) => {
      if (event.pointerType !== 'mouse') {
        return
      }
      root.setAttribute('data-pointer', 'visible')
      window.clearTimeout(timer)
      timer = window.setTimeout(hide, POINTER_IDLE_MS)
    }
    window.addEventListener('pointermove', show)
    window.addEventListener('pointerdown', show)
    return () => {
      window.removeEventListener('pointermove', show)
      window.removeEventListener('pointerdown', show)
      window.clearTimeout(timer)
      hide()
    }
  }, [])
}
