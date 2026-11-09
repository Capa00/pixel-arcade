import { useCallback, useEffect, useRef } from 'react'
import { setFocus } from '../state/actions.js'
import { useApp } from '../state/AppContext.jsx'
import { nextFocus } from './spatialNav.js'
import { pointerActive } from './pointer.js'
import { wraps } from './wrap.js'

const DIRECTIONS = new Set(['up', 'down', 'left', 'right'])

function focusables(container) {
  return container ? Array.from(container.querySelectorAll('[data-focus-id]')) : []
}

// Focus salvato se l'elemento esiste ancora, altrimenti `[data-autofocus]` o il primo.
function resolve(elements, stored) {
  if (elements.some((element) => element.dataset.focusId === stored)) {
    return stored
  }
  const auto = elements.find((element) => element.hasAttribute('data-autofocus'))
  const first = auto || elements[0]
  return first ? first.dataset.focusId : null
}

/**
 * Navigazione spaziale nelle viste a pannelli (sprint 04–08).
 *
 * Gli elementi selezionabili dentro il contenitore `ref` ricevono le props di
 * `item(id, onActivate)` (`data-focus-id`, passaggio del mouse, clic). Il
 * focus sta in `state.focus[scopeName]`; l'elemento col focus ha la classe
 * `focused` e viene portato in vista. `handle(event)` applica un evento
 * logico: le direzioni spostano il focus (src/input/spatialNav.js; una
 * pressione oltre il bordo riparte dall'altro capo), A chiama
 * lo stesso `onActivate` del clic. Restituisce vero se l'evento è stato usato.
 */
export function useFocusScope(scopeName) {
  const { state, dispatch } = useApp()
  const ref = useRef(null)
  const callbacks = useRef(new Map())
  const shown = useRef(null)
  const stored = state.focus[scopeName]

  const currentId = useCallback(() => resolve(focusables(ref.current), stored), [stored])

  useEffect(() => {
    const elements = focusables(ref.current)
    const id = resolve(elements, stored)
    for (const element of elements) {
      element.classList.toggle('focused', element.dataset.focusId === id)
    }
    if (id !== shown.current) {
      shown.current = id
      const element = elements.find((candidate) => candidate.dataset.focusId === id)
      if (element) {
        element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
    }
    if (id !== null && id !== stored) {
      dispatch(setFocus(scopeName, id))
    }
  })

  const focus = useCallback((id) => dispatch(setFocus(scopeName, id)), [dispatch, scopeName])

  const move = useCallback((direction, wrap = false) => {
    const rects = focusables(ref.current).map((element) => {
      const rect = element.getBoundingClientRect()
      return { id: element.dataset.focusId, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
    })
    const from = currentId()
    const to = nextFocus(rects, from, direction, wrap)
    if (to !== null && to !== from) {
      focus(to)
    }
  }, [currentId, focus])

  const activate = useCallback(() => {
    const callback = callbacks.current.get(currentId())
    if (callback) {
      callback()
    }
  }, [currentId])

  const handle = useCallback((event) => {
    if (event.kind === 'release') {
      return false
    }
    if (DIRECTIONS.has(event.button)) {
      move(event.button, wraps(event))
      return true
    }
    if (event.kind === 'press' && event.button === 'a') {
      activate()
      return true
    }
    return false
  }, [move, activate])

  const item = (id, onActivate) => {
    callbacks.current.set(id, onActivate)
    return {
      'data-focus-id': id,
      onPointerEnter: (event) => {
        if (pointerActive(event)) {
          focus(id)
        }
      },
      onClick: () => {
        focus(id)
        if (onActivate) {
          onActivate()
        }
      },
    }
  }

  return { ref, focused: stored, item, move, activate, handle }
}
