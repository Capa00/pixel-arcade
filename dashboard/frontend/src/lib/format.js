/** Formattazione di durate e dimensioni per l'interfaccia (in italiano). */

/** Durata in secondi come «45 s», «3 min 20 s», «1 h 05 min». */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  if (total < 60) {
    return `${total} s`
  }
  const minutes = Math.floor(total / 60)
  if (minutes < 60) {
    const rest = total % 60
    return rest ? `${minutes} min ${rest} s` : `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${String(minutes % 60).padStart(2, '0')} min`
}

const SIZE_FORMAT = { maximumFractionDigits: 1 }

/** Dimensione in byte come «12,4 MB» o «850 kB» (multipli decimali, come il buildbot). */
export function formatSize(bytes) {
  const value = Math.max(0, Number(bytes) || 0)
  if (value >= 1e9) {
    return `${(value / 1e9).toLocaleString('it-IT', SIZE_FORMAT)} GB`
  }
  if (value >= 1e6) {
    return `${(value / 1e6).toLocaleString('it-IT', SIZE_FORMAT)} MB`
  }
  if (value >= 1e3) {
    return `${Math.round(value / 1e3)} kB`
  }
  return `${value} byte`
}

/** Percentuale intera (0–100) di `done` su `total`, oppure `null` se il totale non è noto. */
export function percent(done, total) {
  if (!total) {
    return null
  }
  return Math.max(0, Math.min(100, Math.floor((done / total) * 100)))
}

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(epoch) {
  const date = new Date(epoch)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * Giorno relativo di `epoch` (millisecondi) rispetto a `now`: «Oggi», «Ieri»,
 * «N giorni fa», «Settimana scorsa», «N settimane fa», oltre le 4 settimane
 * la data (`23/09/2026`). Conta i giorni di calendario, non le 24 ore.
 */
export function relativeDay(epoch, now = Date.now()) {
  const days = Math.round((startOfDay(now) - startOfDay(epoch)) / DAY_MS)
  if (days <= 0) {
    return 'Oggi'
  }
  if (days === 1) {
    return 'Ieri'
  }
  if (days < 7) {
    return `${days} giorni fa`
  }
  if (days < 14) {
    return 'Settimana scorsa'
  }
  if (days < 28) {
    return `${Math.floor(days / 7)} settimane fa`
  }
  return new Date(epoch).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Giorno relativo e ora, come «Oggi · 14:05» o «3 giorni fa · 09:30» (vedi `relativeDay`). */
export function dayTime(epoch, now = Date.now()) {
  const time = new Date(epoch).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  return `${relativeDay(epoch, now)} · ${time}`
}

/** Durata compatta come nella demo: «45m», «1h 20m», «2h 05m» (almeno «1m» se c'è stato del tempo). */
export function duration(seconds) {
  const total = Math.max(0, Number(seconds) || 0)
  let minutes = Math.round(total / 60)
  if (!minutes && total > 0) {
    minutes = 1
  }
  if (minutes < 60) {
    return `${minutes}m`
  }
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

/** Ore di gioco con al massimo un decimale e la virgola: «3,4», «12», «0». */
export function hours(value) {
  return (Math.max(0, Number(value) || 0)).toLocaleString('it-IT', { maximumFractionDigits: 1, useGrouping: false })
}
