/**
 * Tornei per la scheda TOURNAMENT e per l'avviso all'ingresso dei giocatori
 * (README «Torneo»): store esterno letto con `useTournaments`.
 *
 * - `list`: tornei non conclusi e conclusi da meno di 3 giorni (`tournaments` e
 *   `recent` di `GET /api/tournament`; `null` prima della prima lettura). App
 *   lo rilegge a intervalli e al ritorno nella libreria; le azioni della scheda
 *   lo aggiornano con il torneo della risposta (`replace`).
 * - `rewardXp`: XP del premio per 1°, 2° e 3° posto.
 * - `series`: serie con classifiche e albo d'oro (`series` di `GET /api/tournament`).
 * - `focus`: richiesta di aprire la scheda su un torneo, `{id, slot, menu, seq}`
 *   (`id` nullo = elenco), fatta dall'avviso; la scheda la consuma con `clearFocus`.
 * - `starting`: vero mentre l'admin ha aperta la schermata «Avvia»; App ferma
 *   intanto l'uscita automatica dei profili.
 * - `creating`: giocatori (`p1`, `p2`) ospiti mandati a creare un profilo per
 *   iscriversi; quando il profilo arriva l'avviso apre la scheda (src/views/TournamentNoticeLayer.jsx).
 */
import { useSyncExternalStore } from 'react'
import * as api from '../api/client.js'

let snapshot = { list: null, focus: null, rewardXp: [], series: [], starting: false }
let focusSeq = 0
const listeners = new Set()
export const creating = new Set()

function set(patch) {
  snapshot = { ...snapshot, ...patch }
  listeners.forEach((listener) => listener())
}

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot() {
  return snapshot
}

export function useTournaments() {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/** Rilegge i tornei; se il servizio non risponde resta l'elenco di prima. */
export async function refresh() {
  try {
    const data = await api.tournament()
    set({ list: [...(data.tournaments || []), ...(data.recent || [])], rewardXp: data.rewardXp || [],
      series: data.series || [] })
  } catch {
    // Si riprova alla prossima lettura.
  }
}

/** Sostituisce nell'elenco il torneo `tournament` (risposta di un'azione). */
export function replace(tournament) {
  if (!tournament || !snapshot.list) {
    return
  }
  set({ list: snapshot.list.map((item) => (item.id === tournament.id ? tournament : item)) })
}

/** Chiede alla scheda di aprire il torneo `id` (o l'elenco) per il giocatore `slot`, col menu se `menu`. */
export function requestFocus(id, slot, menu) {
  focusSeq += 1
  set({ focus: { id, slot, menu: Boolean(menu), seq: focusSeq } })
}

export function clearFocus() {
  if (snapshot.focus) {
    set({ focus: null })
  }
}

/** Segna se la schermata «Avvia» è aperta (`on`). */
export function setStarting(on) {
  if (snapshot.starting !== Boolean(on)) {
    set({ starting: Boolean(on) })
  }
}
