/**
 * Testi della partita (README §E, `run`): etichetta della schermata di
 * avvio, notifica di fine partita e nota della domanda «Ha funzionato?».
 * Solo funzioni pure.
 */
import { quitComboById } from '../input/quitCombo.js'
import { formatDuration, formatSize, percent } from './format.js'

/** Fasi in cui la schermata di avvio/gioco è aperta. */
export const OVERLAY_PHASES = new Set(['probing', 'downloading', 'download_confirm', 'running'])

/** Vero se la schermata di avvio/gioco va mostrata. */
export function overlayOpen(run) {
  return Boolean(run && run.running && OVERLAY_PHASES.has(run.phase))
}

/** Fasi con una domanda all'uscita: «Ha funzionato?» e il soccorso dopo un blocco. */
export const QUESTION_PHASES = new Set(['verdict', 'rescue'])

/** Vero se RetroArch o la ricerca sono in corso (le domande all'uscita escluse). */
export function playing(run) {
  return Boolean(run && run.running && !QUESTION_PHASES.has(run.phase))
}

function counter(attempt) {
  return attempt ? ` ${attempt.index} DI ${attempt.total}` : ''
}

/**
 * Riga principale della schermata di avvio, per esempio
 * «PROVO IL CORE 2 DI 3 · fbneo_libretro» o «SCARICO IL CORE 2 DI 5 · fbneo · 40%».
 * In partita ricorda l'uscita dal gioco `quitCombo` (`input.quit_combo`).
 */
export function phaseLabel(run, quitCombo) {
  const attempt = run.attempt || null
  switch (run.phase) {
    case 'downloading': {
      const download = run.download || {}
      const core = download.core || (attempt && attempt.core) || ''
      const done = percent(download.bytes, download.total)
      const size = download.total ? ` · ${formatSize(download.total)}` : ''
      return `SCARICO IL CORE${counter(attempt)} · ${core}${done === null ? size : ` · ${done}%`}`
    }
    case 'download_confirm':
      return `CORE DA SCARICARE${counter(attempt)}`
    case 'running':
      return `IN GIOCO · ${quitComboById(quitCombo).hint}`
    case 'probing':
      return attempt ? `PROVO IL CORE${counter(attempt)} · ${attempt.core}_libretro` : 'AVVIO IN CORSO'
    default:
      return 'AVVIO IN CORSO'
  }
}

/** Avanzamento del download (0–100), oppure `null` (barra animata). */
export function downloadPercent(run) {
  if (run.phase !== 'downloading' || !run.download) {
    return null
  }
  return percent(run.download.bytes, run.download.total)
}

/** Testo della domanda sul download oltre i 50 MB. */
export function downloadQuestion(question) {
  return `Scaricare ${question.core} (${formatSize(question.size)})?`
}

/** Nota sotto «Il gioco ha funzionato?»: cosa succede con No. */
export function verdictNote(question) {
  if (question.index && question.total && question.index < question.total) {
    return `Con No provo il core successivo (${question.index + 1} di ${question.total}).`
  }
  return 'Con No il gioco risulta senza core compatibile.'
}

/**
 * Notifica per l'esito di una partita (`run.lastResult`): `{message, variant}`,
 * oppure `null` se non c'è niente da dire.
 */
/**
 * Avviso dopo una partita senza «Riprendi»: il core non ha lasciato lo stato
 * (`noState`, per esempio MAME 2000, che non salva gli stati). `null` se non serve.
 */
export function noStateToast(result) {
  if (!result || !result.noState || result.tournament) {
    return null
  }
  const core = result.core ? `Il core ${result.core}` : 'Il core'
  return `${core} non salva la partita: niente «Riprendi» per questo gioco`
}

/** Esito della registrazione dello stato di partenza di un torneo (`result.tournament`), oppure `null`. */
export function tournamentToast(result) {
  if (!result || !result.tournament) {
    return null
  }
  if (result.tournament.recorded) {
    return 'Stato di partenza del torneo registrato.'
  }
  if (result.noState) {
    const core = result.core ? `Il core ${result.core}` : 'Il core'
    return `${core} non salva la partita: il torneo partirà dall’inizio del gioco`
  }
  return 'Stato di partenza non registrato: nel frattempo il torneo è cambiato.'
}

export function resultToast(result) {
  if (!result) {
    return null
  }
  if (result.error) {
    return { message: result.message || 'Avvio non riuscito.', variant: 'error' }
  }
  if (result.incompatible) {
    const tried = (result.tried || []).join(', ')
    return { message: tried ? `Nessun core compatibile: provati ${tried}` : 'Nessun core compatibile', variant: 'error' }
  }
  if (result.stopped) {
    return { message: result.message || 'Ricerca interrotta', variant: 'info' }
  }
  if (result.seconds === undefined || result.seconds === null) {
    return result.confirmed ? { message: `Core memorizzato: ${result.core}`, variant: 'info' } : null
  }
  let message = `Partita terminata · ${formatDuration(result.seconds)}`
  if (result.confirmed) {
    message += ` · Core memorizzato: ${result.core}`
  }
  return { message, variant: 'info' }
}
