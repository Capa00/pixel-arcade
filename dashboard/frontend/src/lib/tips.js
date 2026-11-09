/**
 * Consigli a rotazione della schermata di avvio (src/views/LaunchOverlay.jsx),
 * scritti con le combinazioni impostate. Solo funzioni pure.
 */
import { BUTTON_TITLES } from '../components/buttonLearn.js'
import { quitComboById } from '../input/quitCombo.js'
import { RESCUE_SHARED_MS, rescueHoldMs } from '../input/rescueCombo.js'

/** Tempo di ogni consiglio (ms). */
export const TIP_MS = 4000

const SHOULDERS = new Set(['lb', 'rb', 'lt', 'rt'])

function keysLabel(combo) {
  return combo.map((name) => BUTTON_TITLES[name] || name).join(' + ')
}

/**
 * Consigli per la partita: `[{id, text, shoulder}]`, con `shoulder` i tasti
 * delle spalle da disegnare (src/components/ShoulderButton.jsx), vuoto se
 * non ce ne sono. `quitCombo` è l'id dell'uscita (`input.quit_combo`),
 * `saveCombo` e `rescueCombo` le combinazioni dei salvataggi e di emergenza.
 */
export function launchTips({ quitCombo, saveCombo, rescueCombo }) {
  const quit = quitComboById(quitCombo)
  const tips = [
    {
      id: 'quit',
      text: quit.hold
        ? `Tieni premuto ${quit.hold.toUpperCase()} per 2 secondi per tornare alla dashboard`
        : 'Premi START+SELECT per tornare alla dashboard',
      shoulder: [],
    },
  ]
  if (Array.isArray(saveCombo) && saveCombo.length) {
    tips.push({
      id: 'save',
      text: `Premi ${keysLabel(saveCombo)} durante la partita per aprire i salvataggi`,
      shoulder: saveCombo.filter((name) => SHOULDERS.has(name)),
    })
  }
  if (Array.isArray(rescueCombo) && rescueCombo.length) {
    tips.push({
      id: 'rescue',
      text: `Gioco bloccato? Tieni premuti ${keysLabel(rescueCombo)} per ${rescueHoldMs(quitCombo, rescueCombo) === RESCUE_SHARED_MS ? '1 secondo' : '2 secondi'}: si chiude senza salvare e scegli da dove riprendere`,
      shoulder: rescueCombo.filter((name) => SHOULDERS.has(name)),
    })
  }
  tips.push({
    id: 'resume',
    text: 'Quando torni alla dashboard la partita resta in «Riprendi», se il core salva lo stato',
    shoulder: [],
  })
  return tips
}

/** Indice del consiglio dopo `index` su `count`, in cerchio. */
export function nextTip(index, count) {
  return count ? (index + 1) % count : 0
}
