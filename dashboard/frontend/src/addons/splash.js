/**
 * Ritorno a «PRESS START» per le estensioni (src/addons/registry.js).
 *
 * `returnToSplash(addons)` chiama prima l'`onSplash()` facoltativo di ogni
 * estensione (azioni in più, per esempio fermare qualcosa), poi avvisa chi si
 * è iscritto con `subscribeSplash(listener)`: gli store esterni delle
 * estensioni lo usano per tornare chiusi. Dopo, App ricrea i livelli delle
 * finestre, che ripartono chiusi. Un errore di un'estensione non ferma le altre.
 */

const listeners = new Set()

/** Iscrive `listener` al ritorno a «PRESS START»; restituisce la funzione che lo toglie. */
export function subscribeSplash(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function safely(run, what) {
  try {
    run()
  } catch (error) {
    console.error(`Ritorno a PRESS START: ${what} non riuscito.`, error)
  }
}

/** `onSplash()` delle estensioni, poi gli iscritti di `subscribeSplash`. */
export function returnToSplash(addons) {
  for (const addon of addons) {
    if (typeof addon.onSplash === 'function') {
      safely(() => addon.onSplash(), `onSplash di ${addon.id}`)
    }
  }
  for (const listener of [...listeners]) {
    safely(listener, 'chiusura di uno store')
  }
}
