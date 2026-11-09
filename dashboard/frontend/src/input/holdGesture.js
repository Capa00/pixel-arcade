/**
 * Tasto tenuto dei comandi delle estensioni (src/addons/registry.js): un
 * comando con `hold: {button, ms}` si esegue tenendo premuto `button` per `ms`
 * millisecondi. Funzioni pure, senza timer: `holdTick` va chiamata a ogni
 * fotogramma finché il tasto è tenuto.
 *
 * La pressione del tasto viene trattenuta. Al rilascio prima della soglia si
 * inoltrano pressione e rilascio, così l'azione normale del tasto avviene al
 * rilascio. Superata la soglia il comando parte e il rilascio non si inoltra.
 * Un altro tasto premuto sullo stesso dispositivo durante l'attesa annulla il
 * tenuto: si inoltrano subito la pressione trattenuta e il nuovo evento.
 * Gli eventi degli altri dispositivi passano invariati.
 */

/** Stato iniziale: nessun tasto tenuto. */
export function initialHold() {
  return { pending: null }
}

function sameDevice(a, b) {
  return (a.pad ?? null) === (b.pad ?? null) && a.source === b.source
}

/**
 * Applica l'evento `event` al tempo `now` (ms) con i comandi `commands`.
 * Restituisce `{hold, events, fire}`: il nuovo stato, gli eventi da inoltrare
 * e il comando da eseguire (oppure `null`).
 */
export function holdInput(hold, event, now, commands = []) {
  const pending = hold.pending
  if (pending && sameDevice(pending.event, event)) {
    if (event.button === pending.event.button) {
      if (event.kind !== 'release') {
        return { hold, events: [], fire: null }
      }
      if (pending.fired) {
        return { hold: initialHold(), events: [], fire: null }
      }
      if (now - pending.since >= pending.ms) {
        return { hold: initialHold(), events: [], fire: pending.command }
      }
      return { hold: initialHold(), events: [pending.event, event], fire: null }
    }
    if (event.kind === 'press' && !pending.fired) {
      return { hold: initialHold(), events: [pending.event, event], fire: null }
    }
    return { hold, events: [event], fire: null }
  }
  if (!pending && event.kind === 'press') {
    const command = commands.find((item) => item.hold && item.hold.button === event.button)
    if (command) {
      const next = { event, since: now, ms: command.hold.ms, command, fired: false }
      return { hold: { pending: next }, events: [], fire: null }
    }
  }
  return { hold, events: [event], fire: null }
}

/**
 * Controllo al tempo `now`: superata la soglia restituisce il comando in
 * `fire` (una sola volta) e segna il tenuto come consumato.
 */
export function holdTick(hold, now) {
  const pending = hold.pending
  if (!pending || pending.fired || now - pending.since < pending.ms) {
    return { hold, fire: null }
  }
  return { hold: { pending: { ...pending, fired: true } }, fire: pending.command }
}

/** Avanzamento del tenuto (da 0 a 1) al tempo `now`, oppure `null` se non è in corso. */
export function holdProgress(hold, now) {
  const pending = hold.pending
  if (!pending || pending.fired) {
    return null
  }
  return Math.max(0, Math.min(1, (now - pending.since) / pending.ms))
}
