/**
 * Schermata iniziale: logo animato durante il caricamento, poi «PRESS START».
 * Funzioni pure, usate da App e da src/components/Splash.jsx.
 */
import { currentGames, currentSystem } from '../state/reducer.js'

// Durata dell'animazione d'ingresso (pixel del logo e lettere del titolo), come nel CSS.
export const INTRO_MS = 2200
// Se i giochi della prima console non arrivano (errore già mostrato in una
// notifica), dopo questo tempo dai dati di avvio la schermata si sblocca comunque.
export const GAMES_WAIT_MS = 10000
// Attese possibili in minuti prima che escano i profili e torni la schermata
// (come `LOGOUT_MINUTES` del backend); 0 = mai, 0.5 sono 30 secondi.
export const LOGOUT_MINUTES = [0, 0.5, 1, 2, 5, 10]
export const DEFAULT_LOGOUT = 1

/** Vero se dopo `idleMs` millisecondi senza comandi devono uscire i profili, con l'attesa `minutes` (0 = mai). */
export function shouldLogout(idleMs, minutes) {
  return minutes > 0 && idleMs >= minutes * 60000
}

/**
 * Vero quando il caricamento iniziale è concluso: dati di avvio arrivati (o in
 * errore) e giochi della console selezionata caricati, se c'è una console.
 * `gamesTimedOut` sblocca l'attesa dei giochi.
 */
export function initialLoadDone(state, gamesTimedOut = false) {
  if (state.status === 'error') {
    return true
  }
  if (state.status === 'loading') {
    return false
  }
  return !currentSystem(state) || currentGames(state) !== null || gamesTimedOut
}

/**
 * Vero se `event` fa entrare dalla schermata iniziale: START (anche F2) o,
 * dalla tastiera, Invio e spazio (tasto logico A).
 */
export function isSplashStart(event) {
  if (!event || event.kind !== 'press') {
    return false
  }
  return event.button === 'start' || (event.source === 'keyboard' && event.button === 'a')
}

/**
 * Ritardo d'ingresso (ms) del pixel `{x, y}`: i pixel cadono in ordine
 * sparso, riga per riga dal basso, e finiscono entro 1,2 s.
 */
export function pixelDelay({ x, y }, size = 10) {
  const row = size - 1 - y
  return row * 70 + ((x * 7 + y * 3) % 5) * 45
}
