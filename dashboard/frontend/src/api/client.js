/**
 * Client dell'API del backend (workspace/dashboard/API.md). Il token di
 * sessione arriva da `bootstrap()` e viene inviato in `X-Pixel-Token` con
 * ogni POST.
 */

let token = null

/**
 * Errore dell'API con status HTTP (0 se il servizio non risponde), messaggio
 * in italiano e gli altri campi della risposta in `data` (per esempio
 * `{incompatible, tried}` di `POST /api/launch`).
 */
export class ApiError extends Error {
  constructor(status, message, data = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

/**
 * Richiesta all'API: `GET` o `POST` (con token e corpo JSON). Restituisce i
 * dati della risposta o lancia `ApiError`. Usata anche dalle estensioni.
 */
export async function request(method, path, body) {
  const options = { method, headers: {} }
  if (method === 'POST') {
    options.headers['Content-Type'] = 'application/json'
    options.headers['X-Pixel-Token'] = token || ''
    options.body = JSON.stringify(body || {})
  }
  let response
  try {
    response = await fetch(path, options)
  } catch {
    throw new ApiError(0, 'Servizio non raggiungibile.')
  }
  let data = null
  try {
    data = await response.json()
  } catch {
    throw new ApiError(response.status, 'Risposta non valida dal servizio.')
  }
  if (!response.ok) {
    throw new ApiError(response.status, (data && data.error) || 'Errore del servizio.', data || {})
  }
  return data
}

/** Dati iniziali: sistemi, tasti, stato della partita e token di sessione. */
export async function bootstrap() {
  const data = await request('GET', '/api/bootstrap')
  token = data.token
  return data
}

/** Giochi di un sistema, ordinati per titolo. */
export function games(system) {
  return request('GET', '/api/games?system=' + encodeURIComponent(system))
}

/** Svuota la cache della libreria e restituisce i sistemi aggiornati. */
export function rescan() {
  return request('POST', '/api/library/rescan', {})
}

/** Impostazioni, console con i loro core, tipologie e core disponibili. */
export function settings() {
  return request('GET', '/api/settings')
}

/** Salva impostazioni e console (`{settings, systems}`); restituisce i dati come `settings()`. */
export function saveSettings(payload) {
  return request('POST', '/api/settings', payload)
}

/** Riscarica l'elenco dei core dal buildbot; restituisce i dati come `settings()`. */
export function refreshCores() {
  return request('POST', '/api/cores/refresh', {})
}

/** Stato della partita: `{running, phase, game, core, attempt, download, question, lastResult, …}`. */
export function run() {
  return request('GET', '/api/run')
}

/**
 * Avvia un gioco; restituisce lo stato della partita. 409 con `data.incompatible` se nessun core funziona.
 * `players`: id dei profili di P1 e P2 (`null` per ospiti e slot vuoti); `pads`: loro joypad, che
 * diventano i giocatori 1 e 2 di RetroArch. `resume` (`{account, slot}` oppure `null`): il gioco parte
 * da quello slot del profilo. `padModels` (`launchPadModels`): modelli dei joypad, per ritrovarli in RetroArch.
 * `shared` (id di un salvataggio condiviso di `gameSaves`, oppure `null`): il gioco parte con quel salvataggio.
 */
export function launch(system, id, players = [null, null], pads = [null, null], resume = null, padModels = null,
  shared = null) {
  return request('POST', '/api/launch', { system, id, players, pads, resume, padModels, shared })
}

/**
 * Menu dei salvataggi in partita (Sprint 04 dei salvataggi): pausa del gioco
 * e finestra della modale del giocatore `slot` (`p1`/`p2`). Restituisce lo
 * stato della partita, con `menu: {open, kind, slot, account, other, undo, busy, shot}`
 * (`kind`: `saves` o `controls`, la finestra «Comandi» al primo avvio).
 */
export function ingameOpen(slot) {
  return request('POST', '/api/ingame/open', { slot })
}

/** Salva il momento attuale nello slot 1–9 del giocatore del menu; restituisce `{menu, slots}`. */
export function ingameSave(slot) {
  return request('POST', '/api/ingame/save', { slot })
}

/** Carica lo slot 1–9 del giocatore del menu: il menu si chiude e il gioco riprende. */
export function ingameLoad(slot) {
  return request('POST', '/api/ingame/load', { slot })
}

/** Annulla l'ultimo caricamento del giocatore del menu: il menu si chiude e il gioco riprende da prima del caricamento. */
export function ingameUndo() {
  return request('POST', '/api/ingame/undo', {})
}

/**
 * «Salva» nella finestra «Comandi» in partita: `map` (`{p1: {azione: tasto}}`)
 * e `labels`. Se le assegnazioni cambiano il gioco si riavvia, altrimenti riprende.
 */
export function ingameControls(map, labels) {
  return request('POST', '/api/ingame/controls', { map, labels })
}

/** Chiude il menu in partita (salvataggi o «Comandi»): il gioco riprende. */
export function ingameClose() {
  return request('POST', '/api/ingame/close', {})
}

/** «Esci» dal menu in partita (incontri con i salvataggi bloccati): chiude il gioco. */
export function ingameQuit() {
  return request('POST', '/api/ingame/quit', {})
}

/** Slot del giocatore del menu aperto (negli incontri, quelli temporanei): `{slots}`. */
export function ingameSlots() {
  return request('GET', '/api/ingame/slots')
}

/** Indirizzo della miniatura di uno slot del giocatore del menu aperto (anche negli incontri). */
export function ingameThumbUrl(slot, version = '') {
  return `/api/ingame/thumb?slot=${encodeURIComponent(slot)}&v=${encodeURIComponent(version || '')}`
}

/** Indirizzo della cattura del gioco in pausa (sfondo della modale in partita); `version` è `menu.shot`. */
export function ingameShotUrl(version) {
  return '/api/ingame/shot?v=' + encodeURIComponent(version)
}

/** Interrompe la ricerca del core o la partita. */
export function stop() {
  return request('POST', '/api/stop', {})
}

/** Risposta a «Il gioco ha funzionato?». */
export function verdict(system, id, worked) {
  return request('POST', '/api/game/core/verdict', { system, id, worked })
}

/** Combinazione di emergenza: chiude il gioco senza salvare il «Riprendi»; a fine partita si sceglie da dove riprendere. */
export function runRescue() {
  return request('POST', '/api/run/rescue', {})
}

/** Risposta al soccorso: `choice` è l'id di uno stato, `final` (lo stato all'uscita) o `previous` (il «Riprendi» di prima). */
export function rescueAnswer(choice) {
  return request('POST', '/api/run/rescue/answer', { choice })
}

/** Indirizzo della miniatura di una voce del soccorso; `version` evita la copia vecchia in cache. */
export function rescueThumbUrl(item, version = '') {
  return `/api/run/rescue/thumb?item=${encodeURIComponent(item)}&v=${encodeURIComponent(version)}`
}

/** Risposta alla domanda sul download di un core oltre i 50 MB. */
export function answerDownload(core, accept) {
  return request('POST', '/api/download/answer', { core, accept })
}

/** Core compatibili con il gioco per il menu «Core ▸»: `{cores: [{name, installed, downloadable}]}`. */
export function gameCores(system, id) {
  return request('GET', `/api/game/cores?system=${encodeURIComponent(system)}&id=${encodeURIComponent(id)}`)
}

/**
 * Comandi del gioco: `{controls: {core, descriptors, labels, map, confirmed, editable, fixed}}`
 * (src/lib/controls.js). Senza nomi dei tasti (gioco mai avviato) `descriptors` è vuoto.
 */
export function gameControls(system, id) {
  return request('GET', `/api/game/controls?system=${encodeURIComponent(system)}&id=${encodeURIComponent(id)}`)
}

/** Salva i comandi del gioco (valgono dalla prossima partita); restituisce `{controls}`. */
export function saveGameControls(system, id, map, labels) {
  return request('POST', '/api/game/controls', { system, id, map, labels })
}

/**
 * Controller emulato del gioco: `{controller: {auto, choice, value, choices}}`, `controller` `null`
 * se la console non lo sceglie (oggi solo la PS1: `dualshock` o `digital`).
 */
export function gameController(system, id) {
  return request('GET', `/api/game/controller?system=${encodeURIComponent(system)}&id=${encodeURIComponent(id)}`)
}

/** Sceglie a mano il controller del gioco (`null` = automatico); restituisce `{controller}`. */
export function saveGameController(system, id, choice) {
  return request('POST', '/api/game/controller', { system, id, choice })
}

/**
 * Pagina «Configurazione» della console (`id` vuoto) o del gioco, con le opzioni di `core` per la console;
 * restituisce `{config}` (src/lib/gameConfig.js).
 */
export function gameConfig(system, id, core) {
  const query = [`system=${encodeURIComponent(system)}`]
  if (id) {
    query.push(`id=${encodeURIComponent(id)}`)
  }
  if (core) {
    query.push(`core=${encodeURIComponent(core)}`)
  }
  return request('GET', `/api/config?${query.join('&')}`)
}

/**
 * Cambia un'opzione (`value` `null` = torna all'origine); vale dalla prossima partita.
 * Restituisce `{config}`, oppure `{confirm}` se sostituirebbe una Personalizzata e `confirm` è falso.
 */
export function saveConfigOption({ system, id, core, source, key, value, confirm = false }) {
  return request('POST', '/api/config/option', { system, id: id || null, core, source, key, value, confirm })
}

/** Livello della Grafica (`custom` = la Personalizzata, `null` per un gioco = come la console); restituisce `{config}`. */
export function saveConfigLevel({ system, id, core, level }) {
  return request('POST', '/api/config/level', { system, id: id || null, core, level })
}

/** La Personalizzata del gioco vale per tutta la console; restituisce `{config}` oppure `{confirm}`. */
export function promoteConfig({ system, id, confirm = false }) {
  return request('POST', '/api/config/promote', { system, id, confirm })
}

/** BIOS dei core della console; restituisce `{bios}` (src/lib/bios.js). */
export function bios(system) {
  return request('GET', `/api/bios?system=${encodeURIComponent(system)}`)
}

/** BIOS obbligatori che mancano al core del gioco; restituisce `{core, missing}`. */
export function biosCheck(system, id) {
  return request('GET', `/api/bios/check?system=${encodeURIComponent(system)}&id=${encodeURIComponent(id)}`)
}

/**
 * Copia il file `source` come BIOS `target` (id di una riga, oppure `manual` con `folder` e `name`);
 * restituisce `{bios, saved: {path, warning}}` oppure `{confirm}` se il file c'è già.
 */
export function importBios({ system, core, target, source, folder = null, name = null, confirm = false }) {
  return request('POST', '/api/bios/import', { system, core, target, source, folder, name, confirm })
}

/** Toglie un BIOS copiato dalla dashboard; restituisce `{bios}`. */
export function removeBios({ system, core, path }) {
  return request('POST', '/api/bios/remove', { system, core, path })
}

/** Cartella per il selettore dei file (sola lettura); senza `path` la prima delle `roots`. */
export function files(path, hidden = false) {
  const query = []
  if (path) {
    query.push(`path=${encodeURIComponent(path)}`)
  }
  if (hidden) {
    query.push('hidden=1')
  }
  return request('GET', `/api/files${query.length ? `?${query.join('&')}` : ''}`)
}

/** Scelta manuale del core; restituisce `{game}`. */
export function setGameCore(system, id, core) {
  return request('POST', '/api/game/core', { system, id, core })
}

/** Ricerca automatica al prossimo avvio (associazione e tentativi azzerati); restituisce `{game}`. */
export function resetGameCore(system, id) {
  return request('POST', '/api/game/core/reset', { system, id })
}

/** Core scaricati dalla dashboard e non usati: `{cores: [{name, size}], total}`. */
export function unusedCores() {
  return request('GET', '/api/cores/unused')
}

/** Cancella i core inutilizzati; restituisce l'elenco aggiornato. */
export function deleteUnusedCores() {
  return request('POST', '/api/cores/unused/delete', {})
}

/** Profili: `{accounts, games}`. */
export function profiles() {
  return request('GET', '/api/profiles')
}

/**
 * Statistiche del profilo `id`: `{systems, top, history, more, games}` (API.md, «Statistiche del profilo»).
 * `before` = id dell'ultima partita già ricevuta, per la pagina successiva dello storico.
 */
export function profileStats(id, before = null) {
  let path = '/api/profiles/stats?id=' + encodeURIComponent(id)
  if (before != null) {
    path += '&before=' + encodeURIComponent(before)
  }
  return request('GET', path)
}

/**
 * Classifica di «Chi gioca?»: `{leaders, challenge, lastWinner, topGames, games}`
 * (API.md, «Classifica di casa»).
 */
export function leaderboard() {
  return request('GET', '/api/leaderboard')
}

// Profilo del Wrapped nelle API: l'id, oppure `house` per quello di casa (`account` nullo).
function wrappedAccount(account) {
  return account === null || account === undefined ? 'house' : String(account)
}

/** Periodi con il Wrapped del profilo `account` (`null` = casa): `{periods: [{period, kind, label, seen}], pending}`. */
export function wrappedList(account) {
  return request('GET', '/api/wrapped/list?account=' + encodeURIComponent(wrappedAccount(account)))
}

/** Dati del Wrapped del profilo `account` (`null` = casa) per `period` (`AAAA-MM` o `AAAA`), API.md «Wrapped». */
export function wrapped(account, period) {
  return request('GET', '/api/wrapped?account=' + encodeURIComponent(wrappedAccount(account)) +
    '&period=' + encodeURIComponent(period))
}

/** Segna come visto il Wrapped del profilo `account` (`null` = casa); restituisce la risposta di `wrappedList`. */
export function wrappedSeen(account, period) {
  return request('POST', '/api/wrapped/seen', { account: account ?? null, period })
}

/** Sfide trofeo del profilo: `{open, mine, ended, linked}` (API.md «Sfida trofeo»). */
export function challenges(account) {
  return request('GET', '/api/challenges?account=' + encodeURIComponent(account))
}

/** Avvisi delle sfide all'ingresso del P1: `{challenges, finals, linked}`. */
export function challengeNotices(account) {
  return request('GET', '/api/challenges/notices?account=' + encodeURIComponent(account))
}

/** Segna come visto l'avviso `kind` (`notice` o `final`) della sfida `id` per il profilo `account`. */
export function challengeSeen(account, id, kind) {
  return request('POST', '/api/challenges/seen', { account, id, kind })
}

/** Lancia le sfide dei trofei `achievements` (id) della partita appena finita: `{created}`. */
export function challengeCreate(account, achievements) {
  return request('POST', '/api/challenges', { account, achievements })
}

/** Nessuna sfida dalla partita appena finita: i punti di sfida si cancellano. */
export function challengeDiscard() {
  return request('POST', '/api/challenges/discard', {})
}

/** Gioca la sfida `id` con i giocatori e i joypad di `launch`; restituisce lo stato della partita. */
export function challengeStart(id, players = [null, null], pads = [null, null], padModels = null) {
  return request('POST', '/api/challenges/start', { id, players, pads, padModels })
}

/** Indirizzo della miniatura dello stato della sfida `id`. */
export function challengeThumbUrl(id) {
  return '/api/challenges/thumb?id=' + encodeURIComponent(id)
}

/** Tornei non conclusi, conclusi di recente, archivio e serie: `{tournaments, recent, history, series, rewardXp}` (API.md «Torneo»). */
export function tournament() {
  return request('GET', '/api/tournament')
}

/** Nuova serie del P1 `account` con la 1ª edizione in bozza: `{tournament}`. */
export function tournamentCreate(account) {
  return request('POST', '/api/tournament', { account })
}

/**
 * Modifica il torneo `id` (`changes`, vedi API.md): `{tournament}`. `combo` è
 * la combinazione dell'admin (`null` se il torneo non ce l'ha); con un
 * profilo diverso dal creatore o la combinazione sbagliata l'errore ha `data.locked`.
 */
export function tournamentUpdate(id, account, combo, changes) {
  return request('POST', '/api/tournament/update', { id, account, combo, changes })
}

/** Controlla profilo e combinazione prima di «Gestisci»: `{ok}`. */
export function tournamentUnlock(id, account, combo) {
  return request('POST', '/api/tournament/unlock', { id, account, combo })
}

/**
 * Registra lo stato di partenza giocando, col creatore come P1. `source` è
 * `{kind: 'zero' | 'mine' | 'slot', slot}`; all'uscita stato e salvataggio
 * interno vanno al torneo. Restituisce lo stato della partita, come `launch`.
 */
export function tournamentRecord(id, account, combo, source, players = [null, null], pads = [null, null], padModels = null) {
  return request('POST', '/api/tournament/record', { id, account, combo, source, players, pads, padModels })
}

/** Nome (`name`) e descrizione (`description`) della serie `series`: `{series}`. */
export function tournamentSeriesUpdate(series, account, combo, changes) {
  return request('POST', '/api/tournament/series/update', { series, account, combo, changes })
}

/** Nuova edizione in bozza della serie `series`, copia della più recente: `{tournament}`. */
export function tournamentSeriesEdition(series, account, combo) {
  return request('POST', '/api/tournament/series/edition', { series, account, combo })
}

/** Elimina la serie `series` con tutte le edizioni (i premi restano): `{series: null}`. */
export function tournamentSeriesDelete(series, account, combo) {
  return request('POST', '/api/tournament/series/delete', { series, account, combo })
}

/** Pubblica la bozza (iscrizioni aperte): `{tournament}`. */
export function tournamentPublish(id, account, combo) {
  return request('POST', '/api/tournament/publish', { id, account, combo })
}

/**
 * Elimina la bozza (senza combinazione) o un torneo dell'archivio (concluso o annullato, con la combinazione
 * `combo` se il torneo ce l'ha; i premi restano): `{tournament: null}`.
 */
export function tournamentDelete(id, account, combo = null) {
  return request('POST', '/api/tournament/delete', { id, account, combo })
}

/** Il profilo `account` si iscrive al torneo `id`: `{tournament}`. */
export function tournamentJoin(id, account) {
  return request('POST', '/api/tournament/join', { id, account })
}

/** Il profilo `account` si ritira dal torneo `id`: `{tournament}`. */
export function tournamentLeave(id, account) {
  return request('POST', '/api/tournament/leave', { id, account })
}

/** L'admin `account` iscrive il profilo `player`: `{tournament}`. */
export function tournamentPlayerAdd(id, account, combo, player) {
  return request('POST', '/api/tournament/players/add', { id, account, combo, player })
}

/** L'admin `account` toglie il profilo `player` dagli iscritti: `{tournament}`. */
export function tournamentPlayerRemove(id, account, combo, player) {
  return request('POST', '/api/tournament/players/remove', { id, account, combo, player })
}

/** L'admin `account` chiude (`closed` vero) o riapre le iscrizioni: `{tournament}`. */
export function tournamentRegistration(id, account, combo, closed) {
  return request('POST', '/api/tournament/registration', { id, account, combo, closed })
}

/**
 * Controlli prima della schermata «Avvia» (almeno 3 iscritti, nessun altro torneo in corso):
 * `{players, settings, counts}` (API.md «Torneo»).
 */
export function tournamentStartCheck(id, account, combo) {
  return request('POST', '/api/tournament/start/check', { id, account, combo })
}

/**
 * Anteprima dell'avvio, senza salvare: teste di serie e tabellone con le impostazioni `settings`.
 * Senza `order` le teste di serie si ricalcolano; senza `slots` il tabellone è quello standard.
 * Nella doppia `crossings` sono gli incroci dei perdenti (senza, quelli standard).
 * Risponde `{settings, seeds, order, slots, crossings, matches, count}`.
 */
export function tournamentStartPreview(id, account, combo, settings, order = null, slots = null, crossings = null) {
  return request('POST', '/api/tournament/start/preview', { id, account, combo, settings, order, slots, crossings })
}

/** Salva la bozza della schermata «Avvia» (`{step, settings, order, slots, crossings}`; `null` la cancella): `{ok}`. */
export function tournamentStartDraft(id, account, combo, draft) {
  return request('POST', '/api/tournament/start/draft', { id, account, combo, draft })
}

/** Avvia il torneo con le impostazioni, le teste di serie `order`, le caselle `slots` e gli incroci `crossings`: `{tournament}`. */
export function tournamentStart(id, account, combo, settings, order, slots, crossings = null) {
  return request('POST', '/api/tournament/start', { id, account, combo, settings, order, slots, crossings })
}

/**
 * Schermata «Incontro» del prossimo incontro `match` del torneo `id`: `{players, gameNo, series, status, wins,
 * sides, sideA, drawn, savesLocked, played}` (API.md «Torneo»).
 */
export function tournamentMatchScreen(id, match) {
  return request('POST', '/api/tournament/match/screen', { id, match })
}

/**
 * Gioca una partita dell'incontro: `account` è chi avvia, `sideA` il lato della testa di serie migliore
 * (solo con i lati liberi), `pads` i joypad dei lati P1 e P2. Risponde come `launch`.
 */
export function tournamentMatchPlay(id, match, account, sideA, pads = [null, null], padModels = null) {
  return request('POST', '/api/tournament/match/play', { id, match, account, sideA, pads, padModels })
}

/**
 * Risultato della partita finita dell'incontro: `account` è il creatore (P1 prima dell'incontro) con la `combo`,
 * `winner` uno dei due giocatori o `null` (rigioca); `draw` vero = partita pari (girone con i pareggi), `score`
 * `[punti di playerA, punti di playerB]` se il torneo registra il punteggio. Risponde `{tournament, match, done,
 * winner, draw, gameNo, wins, drawCount, scores, nextMatch, finished}`.
 */
export function tournamentMatchDeclare(id, match, account, combo, winner, draw = false, score = null) {
  return request('POST', '/api/tournament/match/declare', { id, match, account, combo, winner, draw, score })
}

/** Vittoria a tavolino di `winner` nell'incontro (admin, con la combinazione se c'è): `{tournament}`. */
export function tournamentMatchWalkover(id, match, account, combo, winner) {
  return request('POST', '/api/tournament/match/walkover', { id, match, account, combo, winner })
}

/** Ritira il giocatore `player` dal torneo in corso (admin): `{tournament}`. */
export function tournamentWithdraw(id, account, combo, player) {
  return request('POST', '/api/tournament/withdraw', { id, account, combo, player })
}

/** «Annulla il risultato» sull'incontro, un passo alla volta (admin): `{tournament, undone}`. */
export function tournamentMatchUndo(id, match, account, combo) {
  return request('POST', '/api/tournament/match/undo', { id, match, account, combo })
}

/** Sorteggio del girone tra chi è ancora pari sul podio dopo gli spareggi (admin): `{tournament, draw}`. */
export function tournamentDraw(id, account, combo) {
  return request('POST', '/api/tournament/draw', { id, account, combo })
}

/** Sospende l'incontro in gioco: `{tournament}`. */
export function tournamentMatchSuspend(id, match, account) {
  return request('POST', '/api/tournament/match/suspend', { id, match, account })
}

/** Annulla il torneo pubblicato: `{tournament: null}`. */
export function tournamentCancel(id, account, combo) {
  return request('POST', '/api/tournament/cancel', { id, account, combo })
}

/** Indirizzo della miniatura dello stato di partenza del torneo `id`; `version` evita la copia in cache. */
export function tournamentThumbUrl(id, version = '') {
  return '/api/tournament/thumb?id=' + encodeURIComponent(id) + '&v=' + encodeURIComponent(version)
}

/** Spezzone da mostrare nel salvaschermo: `{replay}` (`null` se non ce n'è). */
export function replayNext() {
  return request('GET', '/api/replays/next')
}

/** Rigioca lo spezzone `id` in RetroArch: `{playing, reason, showing}`. */
export function replayPlay(id) {
  return request('POST', '/api/replays/play', { id })
}

/** Stato dello spezzone: `{playing, reason, showing}`; `reason` è `ended`, `stopped` o `closed`. */
export function replayStatus() {
  return request('GET', '/api/replays/status')
}

/** Chiude lo spezzone in corso. */
export function replayStop() {
  return request('POST', '/api/replays/stop', {})
}

/** Crea un profilo (`{name, color, favConsole}`); restituisce l'account. 409 se il nome è già in uso. */
export function createProfile(profile) {
  return request('POST', '/api/profiles', profile)
}

/** Modifica le preferenze del profilo `id` (`{favConsole, genres, difficulty, opts, color}`); restituisce l'account. */
export function updateProfile(id, patch) {
  return request('POST', '/api/profiles/update', { id, patch })
}

/** Aggiunge (`on`) o toglie il gioco `game` (`<system>/<id>`) dai preferiti del profilo; restituisce `{favorites, games}`. */
export function setFavorite(account, game, on) {
  return request('POST', '/api/favorites', { account, game, on })
}

/** Giochi già giocati dal profilo `id`: `{played: ['<system>/<id>', …]}`. */
export function played(id) {
  return request('GET', '/api/profiles/played?id=' + encodeURIComponent(id))
}

/**
 * Console accese (`on`) e spente (`off`) per tutti nelle Impostazioni (liste di id; le altre seguono il
 * predefinito); restituisce `{consoles: {on, off, profiles}}` (API.md, «Console della riga»).
 */
export function saveConsoleSettings(on, off) {
  return request('POST', '/api/consoles/settings', { on, off })
}

/** Accende (`on`) o spegne la console `id` nella riga del profilo `account`; restituisce `{consoles}` come sopra. */
export function toggleConsoleRow(account, id, on) {
  return request('POST', '/api/consoles/row', { account, id, on })
}

/** Playlist condivise: `{playlists: [{id, name, filters, games}], games: {key: summary}}` (API.md, «Playlist»). */
export function playlists() {
  return request('GET', '/api/playlists')
}

/** Crea una playlist (`{name, filters, games}`); restituisce le playlist come `playlists()`. 409 se il nome è già usato. */
export function createPlaylist(playlist) {
  return request('POST', '/api/playlists', playlist)
}

/** Rinomina la playlist `id` o ne cambia i filtri (`{name, filters}`); restituisce le playlist. */
export function updatePlaylist(id, patch) {
  return request('POST', '/api/playlists/update', { id, patch })
}

/** Elimina la playlist `id`; restituisce le playlist. */
export function deletePlaylist(id) {
  return request('POST', '/api/playlists/delete', { id })
}

/** Aggiunge (`on`) o toglie il gioco `game` (`<system>/<id>`) dalla playlist `id`; restituisce le playlist. */
export function setPlaylistGame(id, game, on) {
  return request('POST', '/api/playlists/game', { id, game, on })
}

/**
 * Giochi con salvataggi del profilo, dal più recente: `{games: [{system, id, title, systemName, missing,
 * slots, resumeAt, updatedAt, thumb}]}` (`resumeAt` = data del «Riprendi», `thumb` = ha la miniatura).
 */
export function saves(account) {
  return request('GET', '/api/saves?account=' + encodeURIComponent(account))
}

/**
 * Salvataggi del gioco per i profili `accounts` (id): `{accounts: [{id, slots: [{slot, core, name,
 * protected, updatedAt, thumb, loadable, shared}]}], shared}`. `loadable` è falso per uno stato creato
 * con un altro core; `shared` dello slot è `{id, title}` del salvataggio condiviso da cui è nato
 * (oppure `null`); `shared` della risposta sono i salvataggi condivisi del gioco, `[{id, title, description}]`.
 */
export function gameSaves(system, game, accounts) {
  const query = [
    ['system', system],
    ['game', game],
    ['accounts', accounts.join(',')],
  ].map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
  return request('GET', '/api/saves/game?' + query.join('&'))
}

/**
 * Operazioni su uno slot (Sprint 05 dei salvataggi). `key` è `{account,
 * system, game}`, più `scope: 'profile'` se l'operazione parte dal
 * Profilo; ognuna restituisce `{slots}` del profilo (per la copia, di
 * quello di destinazione), come `gameSaves`.
 */
export function renameSave(key, slot, name) {
  return request('POST', '/api/saves/rename', { ...key, slot, name })
}

/** Protegge lo slot 1–9 (`on` vero) o toglie la protezione. */
export function protectSave(key, slot, on) {
  return request('POST', '/api/saves/protect', { ...key, slot, protected: on })
}

/** Elimina lo slot; uno slot protetto non si elimina. */
export function deleteSave(key, slot) {
  return request('POST', '/api/saves/delete', { ...key, slot })
}

/** Copia lo slot nello slot `toSlot` del profilo `to` (stato e core, non nome e protezione). */
export function copySave(key, slot, to, toSlot) {
  return request('POST', '/api/saves/copy', { ...key, slot, to, toSlot })
}

/**
 * Dal Profilo, elimina gli slot non protetti del gioco, «Riprendi» compreso (`key` come sopra).
 * Restituisce `{remaining, slots}`: quanti slot restano e quali.
 */
export function deleteGameSaves(key) {
  return request('POST', '/api/saves/delete-game', key)
}

/** Indirizzo della miniatura PNG di uno slot; `version` (per esempio `updatedAt`) evita la copia vecchia in cache. */
export function saveThumbUrl(account, system, game, slot = 0, version = '') {
  const query = [
    ['account', account],
    ['system', system],
    ['game', game],
    ['slot', slot],
    ['v', version],
  ].map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
  return '/api/saves/thumb?' + query.join('&')
}

/** Attività delle estensioni ancora in corso: `{busy: [frasi]}`. */
export function exitCheck() {
  return request('GET', '/api/exit/check')
}

/**
 * Chiude Chrome e il server. Con `keepRunning` e attività in corso chiude
 * solo Chrome: il server resta in background finché non sono finite.
 */
export function exitDashboard({ keepRunning = false } = {}) {
  return request('POST', '/api/exit', { keepRunning })
}

/** Joypad visti da RetroArch: `{driver, supported, error, devices: [{name, vendor, product, controller, configured, binds}]}`. */
export function joypads() {
  return request('GET', '/api/joypads')
}

/** Inizia a leggere i tasti del joypad `vendor`/`product` come li legge RetroArch. */
export function joypadLearn(vendor, product) {
  return request('POST', '/api/joypads/learn', { vendor, product })
}

/** Tasti premuti dopo la pressione `after`: `{active, seq, presses: [{seq, input}], error}`. */
export function joypadLearnState(after) {
  return request('GET', `/api/joypads/learn?after=${encodeURIComponent(after)}`)
}

/** Smette di leggere i tasti. */
export function joypadLearnStop() {
  return request('POST', '/api/joypads/learn/stop')
}

/** Scrive l'autoconfig di RetroArch del joypad con i tasti `binds` (`{tasto: token}`). */
export function joypadSave(vendor, product, binds) {
  return request('POST', '/api/joypads/save', { vendor, product, binds })
}

/** Salva i tasti della dashboard del joypad `id` (Gamepad API): `{padButtons}` di tutti i joypad. */
export function joypadButtons(id, buttons) {
  return request('POST', '/api/joypads/buttons', { id, buttons })
}

/** Riporta agli autoconfig i tasti joypad del `retroarch.cfg`: `{changed, backup}`. */
export function joypadRepair() {
  return request('POST', '/api/joypads/repair')
}

/** RetroAchievements: `{key: {set, last4}, accounts: {id: username}}`, mai la chiave né i token. */
export function raStatus() {
  return request('GET', '/api/ra')
}

/** Controlla e salva la chiave Web API unica della dashboard. */
export function raSetKey(key) {
  return request('POST', '/api/ra/key', { key })
}

/** Toglie la chiave Web API. */
export function raRemoveKey() {
  return request('POST', '/api/ra/key/delete', {})
}

/** Collega il profilo all'account RetroAchievements; la password serve solo a ottenere il token. */
export function raLink(account, username, password) {
  return request('POST', '/api/ra/link', { account, username, password })
}

/** Scollega il profilo da RetroAchievements. */
export function raUnlink(account) {
  return request('POST', '/api/ra/unlink', { account })
}

/** Trofei del gioco, con quelli sbloccati dal profilo `account` (se collegato). */
export function raGame(system, game, account = null) {
  let path = '/api/ra/game?system=' + encodeURIComponent(system) + '&game=' + encodeURIComponent(game)
  if (account != null) {
    path += '&account=' + encodeURIComponent(account)
  }
  return request('GET', path)
}

/** Trofei del profilo: dal sito (punti, rank, ultimi) e quelli delle partite. */
export function raProfile(account) {
  return request('GET', '/api/ra/profile?account=' + encodeURIComponent(account))
}

/** Giochi in cui l'account del profilo ha preso trofei, 30 per volta da `offset`: `{user, status, message, games, total, offset, more}`. */
export function raProfileGames(account, offset = 0) {
  return request('GET', '/api/ra/profile/games?account=' + encodeURIComponent(account) + '&offset=' + encodeURIComponent(offset))
}

/** Tutti i trofei del gioco RetroAchievements `id`, con quelli presi dall'account del profilo (come `raGame`). */
export function raProfileGame(account, id) {
  return request('GET', '/api/ra/profile/game?account=' + encodeURIComponent(account) + '&id=' + encodeURIComponent(id))
}

/** URL dell'icona di un gioco RetroAchievements (`icon` di `raProfileGames`). */
export function raIconUrl(name) {
  return '/api/ra/icon?name=' + encodeURIComponent(name)
}

/** URL del badge di un trofeo (`locked` per quello ancora da sbloccare). */
export function raBadgeUrl(name, locked = false) {
  return '/api/ra/badge?name=' + encodeURIComponent(name) + (locked ? '&locked=1' : '')
}
