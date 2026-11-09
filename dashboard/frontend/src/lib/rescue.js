/**
 * Soccorso dopo un blocco (src/components/RescueModal.jsx): voci della scelta
 * e testi. Solo funzioni pure.
 *
 * In fase `rescue`, `run.question` è `{reason, final, items, system, id,
 * core}`: `reason` è `combo` (combinazione di emergenza) o `suspect`
 * (indizi di blocco all'uscita); `items` sono gli stati periodici di questa
 * partita e quelli conservati dalle partite prima, dal più recente
 * (`{id, at, thumb, run, tried}`, `tried` se già scelto in un soccorso);
 * `final` è vero se c'è lo stato all'uscita. Scegliere uno stato fa
 * ripartire la partita da lì.
 */
import { dayTime } from './format.js'

export const SUSPECT = 'suspect'
export const FINAL = 'final'
export const PREVIOUS = 'previous'

/** Scelte della domanda «Il gioco era bloccato?». */
export const BLOCKED_CHOICES = [
  { id: 'yes', label: 'Sì, scelgo da dove riprendere', tone: 'ok' },
  { id: 'no', label: 'No, salva come sempre' },
]

/** Testo della domanda all'uscita normale con gli indizi di blocco. */
export const BLOCKED_TEXT = 'Lo schermo era nero o fermo da qualche minuto. Il gioco si era bloccato?'

/** Quanto tempo fa, per gli stati di questa partita: «1 minuto fa», «12 minuti fa»; oltre l'ora giorno e ora. */
export function agoLabel(at, now = Date.now()) {
  const epoch = Date.parse(at || '')
  if (Number.isNaN(epoch)) {
    return ''
  }
  const minutes = Math.round((now - epoch) / 60000)
  if (minutes < 1) {
    return 'Meno di un minuto fa'
  }
  if (minutes < 60) {
    return minutes === 1 ? '1 minuto fa' : `${minutes} minuti fa`
  }
  return dayTime(epoch, now)
}

/**
 * Voci della modale: gli stati (`{id, label, note, thumb}`) e in fondo
 * «Riprendi di prima», che lascia il «Riprendi» com'era.
 */
export function rescueItems(question, now = Date.now()) {
  const items = ((question && question.items) || []).map((item) => {
    const epoch = Date.parse(item.at || '')
    return {
      id: item.id,
      label: item.run ? agoLabel(item.at, now) : (Number.isNaN(epoch) ? '' : dayTime(epoch, now)),
      note: `${item.run ? 'Questa partita' : 'Partita precedente'}${item.tried ? ' · già provato' : ''}`,
      thumb: Boolean(item.thumb),
    }
  })
  items.push({ id: PREVIOUS, label: 'Riprendi di prima', note: 'Il «Riprendi» resta com\'era prima di questa partita', thumb: false })
  return items
}

/** Risposta a «No, non era bloccato»: lo stato all'uscita se c'è, altrimenti il «Riprendi» resta com'era. */
export function notBlockedChoice(question) {
  return question && question.final ? FINAL : PREVIOUS
}
