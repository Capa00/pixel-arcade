# Pixel Arcade — API

Contratto tra backend (`backend/pixelarcade/web/api.py`) e frontend (`frontend/src/api/client.js`).
Aggiornato sprint per sprint: qui compaiono solo le rotte già implementate.

## Regole comuni

- Server solo su `127.0.0.1:<porta>` (predefinita 8765).
- `Host` diverso da `127.0.0.1:<porta>` o `localhost:<porta>`, oppure `Origin` estraneo → 403.
- Le POST richiedono `X-Pixel-Token` (da `/api/bootstrap`) e `Content-Type: application/json`, con corpo di al massimo 256 KiB. Fa eccezione `POST /api/show`, senza token ma accettata solo da un processo su `127.0.0.1` (niente `Origin` né `Sec-Fetch-Site`).
- Errori: status 4xx/5xx con corpo `{"error": "messaggio in italiano"}`, a volte con altri campi (per esempio `incompatible` e `tried` di `POST /api/launch`).

## Rotte

| Metodo | Rotta | Corpo / query | Risposta | Sprint |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | — | `{ok, version, db: {version}}` | 01 |
| GET | `/api/bootstrap` | — | `{token, version, systems[], buttons, saveCombo, rescueCombo, quitCombo, theme, mode, screensaver, screensaverContent, logout, sound, run, warnings[], consoles, addons}` | 02, salvataggi 04, console della riga |
| GET | `/api/games` | `?system=` | `{system, games[]}` | 02 |
| POST | `/api/library/rescan` | `{}` | `{systems[]}` | 02 |
| GET | `/api/settings` | — | `{settings, systems[], coreTypes[], availableCores[], coreIndex, retroarch: {quitCombo}, cpu: {ready, governor}}` | 04, 04b |
| POST | `/api/settings` | `{settings, systems[]}` | come la GET | 04, 04b |
| POST | `/api/cores/refresh` | `{}` | come `GET /api/settings` | 04b |
| GET | `/api/run` | — | `run` (con `menu`) | 05, salvataggi 04 |
| POST | `/api/ingame/open` | `{slot: "p1"\|"p2"}` | `run` | salvataggi 04 |
| POST | `/api/ingame/save` | `{slot: 1–9}` | `{menu, slots[]}` | salvataggi 04 |
| POST | `/api/ingame/load` | `{slot: 1–9}` | `run` | salvataggi 04 |
| POST | `/api/ingame/controls` | `{map, labels}` | `run` | comandi |
| POST | `/api/ingame/close` | `{}` | `run` | salvataggi 04 |
| GET | `/api/ingame/shot` | `?v=` | immagine PNG | salvataggi 04 |
| POST | `/api/ingame/quit` | `{}` | `run` | Torneo |
| GET | `/api/ingame/slots` | — | `{slots[]}` | Torneo |
| GET | `/api/ingame/thumb` | `?slot=&v=` | immagine PNG | Torneo |
| POST | `/api/run/rescue` | — | `run` | soccorso |
| POST | `/api/run/rescue/answer` | `{choice}` | `run` | soccorso |
| GET | `/api/run/rescue/thumb` | `?item=` | immagine PNG | soccorso |
| POST | `/api/launch` | `{system, id, players: [p1Id\|null, p2Id\|null], pads: [p1Pad\|null, p2Pad\|null], padModels}` | `run` | 05, 07 |
| POST | `/api/stop` | `{}` | `run` | 05 |
| POST | `/api/download/answer` | `{core, accept: bool}` | `run` | 05 |
| POST | `/api/game/core/verdict` | `{system, id, worked: bool}` | `run` | 05 |
| GET | `/api/game/cores` | `?system=&id=` | `{cores: [{name, installed, downloadable}]}` | 05 |
| POST | `/api/game/core` | `{system, id, core}` | `{game}` | 05 |
| POST | `/api/game/core/reset` | `{system, id}` | `{game}` | 05 |
| GET | `/api/game/controls` | `?system=&id=` | `{controls}` | comandi |
| POST | `/api/game/controls` | `{system, id, map, labels}` | `{controls}` | comandi |
| GET | `/api/config` | `?system=&id=&core=` | `{config}` | configurazione |
| POST | `/api/config/option` | `{system, id, core, source, key, value, confirm}` | `{config}` o `{confirm}` | configurazione |
| POST | `/api/config/level` | `{system, id, core, level}` | `{config}` | configurazione |
| POST | `/api/config/promote` | `{system, id, confirm}` | `{config}` o `{confirm}` | configurazione |
| GET | `/api/bios` | `?system=` | `{bios}` | BIOS |
| GET | `/api/bios/check` | `?system=&id=` | `{core, missing}` | BIOS |
| POST | `/api/bios/import` | `{system, core, target, source, folder, name, confirm}` | `{bios, saved: {path, warning}}` o `{confirm}` | BIOS |
| POST | `/api/bios/remove` | `{system, core, path}` | `{bios}` | BIOS |
| GET | `/api/files` | `?path=&hidden=1` | `{path, parent, entries, hidden, truncated, roots}` | BIOS |
| GET | `/api/cores/unused` | — | `{cores: [{name, size}], total}` | 05 |
| POST | `/api/cores/unused/delete` | `{}` | come la GET | 05 |
| GET | `/api/profiles` | — | `{accounts: [account], games: {key: gameSummary}}` | 07, 08 |
| POST | `/api/profiles` | `{name, color, favConsole}` | `account` | 07 |
| POST | `/api/profiles/update` | `{id, patch: {name, favConsole, genres, difficulty, opts, color, email}}` | `account` | 08, avatar |
| GET | `/api/profiles/stats` | `?id=[&before=]` | `profileStats` | profilo a schede |
| GET | `/api/profiles/avatar` | `?id=` | immagine PNG o JPEG | avatar |
| GET | `/api/profiles/played` | `?id=` | `{played: [key]}` | playlist |
| GET | `/api/leaderboard` | — | `{leaders, challenge, lastWinner, topGames, games}` | classifica |
| GET | `/api/wrapped/list` | `?account=<id>\|house` | `{periods[], pending}` | Wrapped |
| GET | `/api/wrapped` | `?account=<id>\|house&period=` | dati del Wrapped | Wrapped |
| POST | `/api/wrapped/seen` | `{account, period}` | come `/api/wrapped/list` | Wrapped |
| GET | `/api/challenges` | `?account=` | `{open[], mine[], ended[], linked}` | Sfida trofeo |
| GET | `/api/challenges/notices` | `?account=` | `{challenges[], finals[], linked}` | Sfida trofeo |
| POST | `/api/challenges/seen` | `{account, id, kind}` | come `/api/challenges/notices` | Sfida trofeo |
| GET | `/api/challenges/candidates` | — | `{candidates[]}` | Sfida trofeo |
| POST | `/api/challenges` | `{account, achievements: [id]}` | `{created: [id]}` | Sfida trofeo |
| POST | `/api/challenges/discard` | — | `{candidates: []}` | Sfida trofeo |
| POST | `/api/challenges/start` | `{id, players, pads, padModels}` | stato della partita | Sfida trofeo |
| GET | `/api/challenges/thumb` | `?id=` | immagine PNG | Sfida trofeo |
| GET | `/api/tournament` | — | `{tournaments, recent, history, series, rewardXp}` | Torneo |
| POST | `/api/tournament` | `{account}` | `{tournament}` | Torneo |
| POST | `/api/tournament/update` | `{id, account, combo, changes}` | `{tournament}` | Torneo |
| POST | `/api/tournament/series/update` | `{series, account, combo, changes}` | `{series}` | Torneo |
| POST | `/api/tournament/series/edition` | `{series, account, combo}` | `{tournament}` | Torneo |
| POST | `/api/tournament/series/delete` | `{series, account, combo}` | `{series: null}` | Torneo |
| POST | `/api/tournament/unlock` | `{id, account, combo}` | `{ok: true}` | Torneo |
| POST | `/api/tournament/record` | `{id, account, combo, source, players, pads, padModels}` | stato della partita | Torneo |
| POST | `/api/tournament/publish` | `{id, account, combo}` | `{tournament}` | Torneo |
| POST | `/api/tournament/delete` | `{id, account, combo?}` | `{tournament: null}` | Torneo |
| POST | `/api/tournament/cancel` | `{id, account, combo}` | `{tournament: null}` | Torneo |
| POST | `/api/tournament/join` | `{id, account}` | `{tournament}` | Torneo |
| POST | `/api/tournament/leave` | `{id, account}` | `{tournament}` | Torneo |
| POST | `/api/tournament/players/add` | `{id, account, combo, player}` | `{tournament}` | Torneo |
| POST | `/api/tournament/players/remove` | `{id, account, combo, player}` | `{tournament}` | Torneo |
| POST | `/api/tournament/registration` | `{id, account, combo, closed}` | `{tournament, matches?}` | Torneo |
| POST | `/api/tournament/start/check` | `{id, account, combo}` | `{players, settings, counts, draft}` | Torneo |
| POST | `/api/tournament/start/preview` | `{id, account, combo, settings, order?, slots?, crossings?}` | `{settings, seeds, order, slots, crossings, matches, count}` | Torneo |
| POST | `/api/tournament/start` | `{id, account, combo, settings, order, slots?}` | `{tournament}` | Torneo |
| POST | `/api/tournament/start/draft` | `{id, account, combo, draft}` | `{ok}` | Torneo |
| GET | `/api/tournament/thumb` | `?id=` | immagine PNG | Torneo |
| POST | `/api/tournament/match/screen` | `{id, match}` | `{tournament, match, players, gameNo, series, status, wins, sides, sideA, drawn, savesLocked, played}` | Torneo |
| POST | `/api/tournament/match/play` | `{id, match, account, sideA?, pads, padModels}` | come `/api/launch` | Torneo |
| POST | `/api/tournament/match/declare` | `{id, match, account, combo, winner, draw, score}` | `{tournament, match, done, winner, draw, gameNo, wins, drawCount, scores, nextMatch, finished}` | Torneo |
| POST | `/api/tournament/match/suspend` | `{id, match, account}` | `{tournament}` | Torneo |
| POST | `/api/tournament/match/walkover` | `{id, match, account, combo, winner}` | `{tournament}` | Torneo |
| POST | `/api/tournament/withdraw` | `{id, account, combo, player}` | `{tournament}` | Torneo |
| POST | `/api/tournament/match/undo` | `{id, match, account, combo}` | `{tournament, undone}` | Torneo |
| POST | `/api/tournament/draw` | `{id, account, combo}` | `{tournament, draw}` | Torneo |
| GET | `/api/replays/next` | — | `{replay}` (`null` se non ce n'è) | Salvaschermo |
| POST | `/api/replays/play` | `{id}` | `{playing, reason, showing}` | Salvaschermo |
| GET | `/api/replays/status` | — | `{playing, reason, showing}` | Salvaschermo |
| POST | `/api/replays/stop` | — | `{playing, reason, showing}` | Salvaschermo |
| POST | `/api/favorites` | `{account, game: "<system>/<id>", on: bool}` | `{favorites: [key], games: {key: gameSummary}}` | 08 |
| POST | `/api/consoles/off` | `{off: [id]}` | `{consoles}` | console della riga |
| POST | `/api/consoles/row` | `{account, id, on}` | `{consoles}` | console della riga |
| GET | `/api/playlists` | — | `playlists` | playlist |
| POST | `/api/playlists` | `{name, filters?, games?: [key]}` | `playlists` | playlist |
| POST | `/api/playlists/update` | `{id, patch: {name?, filters?}}` | `playlists` | playlist |
| POST | `/api/playlists/delete` | `{id}` | `playlists` | playlist |
| POST | `/api/playlists/game` | `{id, game: "<system>/<id>", on: bool}` | `playlists` | playlist |
| GET | `/api/ra` | — | `{key: {set, last4}, accounts: {id: username}}` | RetroAchievements |
| POST | `/api/ra/key` | `{key}` | `{key: {set, last4}}` | RetroAchievements |
| POST | `/api/ra/key/delete` | `{}` | `{key: {set, last4}}` | RetroAchievements |
| POST | `/api/ra/link` | `{account, username, password}` | `{username}` | RetroAchievements |
| POST | `/api/ra/unlink` | `{account}` | `{username: null}` | RetroAchievements |
| GET | `/api/ra/game` | `?system=&game=[&account=]` | `raGame` | RetroAchievements |
| GET | `/api/ra/profile` | `?account=` | `raProfile` | RetroAchievements |
| GET | `/api/ra/profile/games` | `?account=[&offset=]` | `raProfileGames` | RetroAchievements |
| GET | `/api/ra/profile/game` | `?account=&id=` | `raGame` | RetroAchievements |
| GET | `/api/ra/icon` | `?name=` | immagine PNG | RetroAchievements |
| GET | `/api/ra/badge` | `?name=[&locked=1]` | immagine PNG | RetroAchievements |
| GET | `/api/saves` | `?account=` | `{games: [saveGame]}` | salvataggi 02 |
| GET | `/api/saves/thumb` | `?account=&system=&game=&slot=` | immagine PNG | salvataggi 02 |
| GET | `/api/joypads` | — | `{driver, supported, error, devices: [joypad]}` | joypad |
| POST | `/api/joypads/learn` | `{vendor, product}` | `{device}` | joypad |
| GET | `/api/joypads/learn` | `?after=` | `{active, seq, presses: [{seq, input}], error}` | joypad |
| POST | `/api/joypads/learn/stop` | `{}` | `{active: false}` | joypad |
| POST | `/api/joypads/save` | `{vendor, product, binds: {tasto: token}}` | `{device, profile, backup}` | joypad |
| POST | `/api/joypads/repair` | `{}` | `{changed, backup}` | joypad |
| GET | `/api/exit/check` | — | `{busy: [frasi]}` | 05 |
| POST | `/api/exit` | `{keepRunning?: bool}` | `{message}` | 05 |
| POST | `/api/show` | `{}` | `{shown}` | 05 |

## Oggetti

**system**

| Campo | Tipo | Note |
| --- | --- | --- |
| `id` | stringa | nome della cartella in `games/` |
| `name` | stringa | nome della cartella in maiuscolo, con `_`, `-`, `.` ecc. come spazi (`mega_drive` → `MEGA DRIVE`) |
| `accent` | colore | riga sotto la scheda ed etichette; calcolato da `name` |
| `covers` | 4 colori | sfondi delle copertine pixel art; calcolati da `name` |
| `quote`, `source` | stringhe | citazione in fondo alla sezione del gioco (dal preset riconosciuto, altrimenti «Press Start.») |
| `arcade` | booleano | titoli = nomi brevi MAME |
| `count` | intero | numero di giochi |
| `cores` | lista | core della console nell'ordine automatico (compatibili con RetroAchievements disponibili nel loro ordine, poi installati, scaricabili e non disponibili, ciascun gruppo in ordine alfabetico): `[{name, installed, downloadable}]`, con `name` = nome breve (`fbneo`) |
| `ready` | booleano | vero se almeno un core della lista è installato o scaricabile |

**game**

| Campo | Tipo | Note |
| --- | --- | --- |
| `id` | stringa | percorso relativo alla cartella della console, con `/` |
| `file` | stringa | nome del file |
| `title` | stringa | dal nome del file (§ titoli sotto) |
| `year`, `genre`, `players`, `maker` | `null` | metadati dallo sprint 09 |
| `cover` | booleano | `false` fino allo sprint 09 |
| `core` | stringa o `null` | core associato al gioco (sprint 05) |
| `coreStatus` | `null`, `trial`, `ok`, `incompatible` | `trial`: in prova; `ok`: confermato; `incompatible`: nessun core ha funzionato |
| `achievements` | booleano o `null` | compatibile con RetroAchievements. Viene dai metadati se il file è abbinato per checksum, o è senza checksum perché troppo grande. Se RetroAchievements ha già riconosciuto il file, o ha risposto di non conoscerlo, vale il suo responso. `null` se non si sa |

**run** (sprint 05)

| Campo | Tipo | Note |
| --- | --- | --- |
| `running` | booleano | vero in ogni fase diversa da `idle` |
| `phase` | stringa | `idle`, `probing` (avvio o prova di un core), `downloading`, `download_confirm`, `running`, `verdict`, `rescue` |
| `game` | `{system, id, title}` o `null` | gioco in corso |
| `core` | stringa o `null` | core in prova o in uso |
| `attempt` | `{index, total, core}` o `null` | durante la ricerca: `index` = core già provati per il gioco più uno, `total` = candidati |
| `download` | `{core, bytes, total}` o `null` | durante `downloading` (`total` può essere `null`) |
| `question` | oggetto o `null` | `download_confirm`: `{core, size}`; `verdict`: `{system, id, core, index, total}`; `rescue`: `{system, id, core, reason, final, items}` |
| `startedAt` | data ISO o `null` | inizio della partita |
| `quitCombo` | testo o `null` | uscita dal gioco della partita (`hold_start`, `hold_select`, `start_select`): quella del gioco, della console o di `input.quit_combo` |
| `message` | stringa | stato leggibile |
| `log` | stringa | ultimi 2000 caratteri del log di RetroArch in corso |
| `lastResult` | oggetto o `null` | esito dell'ultima partita o ricerca: `seq` (cresce a ogni esito), `game`, `message` e, secondo il caso, `seconds`, `core`, `probed`, `confirmed`, `incompatible` con `tried`, `stopped`, `error`; dopo una partita anche `players` (sprint 08): `{"<id profilo>": {slot, xpGained, levelBefore, levelAfter, title, titleBefore, percentBefore, percentAfter, parts}}` (`slot` `p1`/`p2`; `percentBefore`/`percentAfter` avanzamento 0–99 verso il livello successivo prima e dopo la partita; `parts` = `{minutes, session, newGame, challenge}`, le voci degli XP; `challenge` ripete `minutes` sul gioco della sfida della settimana, altrimenti è 0), vuoto per ospiti, slot vuoti e partite sotto i 20 s |

**account** (sprint 07)

| Campo | Tipo | Note |
| --- | --- | --- |
| `id` | intero | |
| `name` | stringa | maiuscolo, `A-Z 0-9 _ . -`, da 1 a 25 caratteri; unico senza distinguere maiuscole e minuscole |
| `color` | colore | uno degli 8 della demo: `#ff5d73 #3ccfc4 #f5c542 #8fd46a #a48bff #ff9a52 #5b93ff #f3f1f8` |
| `createdAt` | data ISO | |
| `favConsole` | stringa o `null` | id della console preferita |
| `difficulty` | stringa | `Facile`, `Normale` (alla creazione) o `Difficile` |
| `opts` | `{crt, vib}` | booleani; alla creazione `false`, `true`. Un `save` ancora inviato si ignora |
| `genres` | lista | generi preferiti, vuota alla creazione; valori ammessi: `Platform, Avventura, Azione, GDR, Picchiaduro, Corse, Puzzle, Shooter, Run & Gun, Horror, Sport` |
| `level`, `xp`, `xpPercent`, `title` | calcolati | livello, XP totali, avanzamento (0–99) verso il livello successivo e titolo (§ progressione sotto) |
| `hours` | numero | ore di gioco con un decimale |
| `played`, `sessions` | interi | giochi diversi giocati e partite registrate |
| `favorites` | lista | chiavi `<system>/<id>` dei preferiti, dal più recente |
| `recent` | lista | ultima partita di ogni gioco, dalla più recente, al massimo 5: `[{game: key, at: data ISO di fine, seconds}]` |
| `raUser` | stringa o `null` | nome utente RetroAchievements collegato al profilo (mai il token) |
| `avatar` | booleano | vero se il profilo ha un'email Gravatar collegata; l'immagine si legge da `/api/profiles/avatar` (mai l'email né l'hash) |

Tempo, partite, XP e giochi provati si calcolano dalle partite registrate (`session_players` e `sessions`), senza contatori salvati.

**gameSummary** (sprint 08): riepilogo di un gioco citato da preferiti o recenti.

| Campo | Tipo | Note |
| --- | --- | --- |
| `system`, `id` | stringhe | console e percorso del gioco |
| `title` | stringa | dalla libreria; se il file non c'è più, ricavato dal nome del file |
| `systemName`, `systemFull` | stringhe | nome della console (per ora uguali: non c'è un nome esteso) |
| `cover` | booleano | `false` fino allo sprint 09 |
| `missing` | booleano | vero se il gioco non è più nella libreria |

**Progressione** (sprint 08, piano §H): una partita conta da 20 s; vale 1 XP al minuto (al massimo 180), +5 per la partita, +25 se il gioco è nuovo per il profilo. Tempo e XP vanno a tutti i profili registrati in partita (P1 e P2). Livello L = il più alto con `xp ≥ 50·L·(L−1)`. Titoli: 1 Recluta · 3 Apprendista · 6 Giocatore · 10 Veterano · 16 Campione · 25 Maestro · 35 Leggenda.

Titoli: per i sistemi arcade il nome del file senza estensione; per gli altri anche senza gruppi `(...)`/`[...]`, con `_` → spazio.

## Esempi

`GET /api/bootstrap`

```json
{
  "token": "…",
  "version": "0.1.0",
  "systems": [
    {
      "id": "arcade",
      "name": "ARCADE",
      "accent": "#6cf25a",
      "covers": ["#3bd926", "#1e4319", "#4eda84", "#a334b2"],
      "quote": "All your base are belong to us.",
      "source": "Zero Wing",
      "arcade": true,
      "count": 2310,
      "cores": [],
      "ready": false
    }
  ],
  "buttons": {"a": 0, "b": 1, "x": 2, "y": 3, "lb": 4, "rb": 5, "lt": 6, "rt": 7, "select": 8, "start": 9},
  "run": {"running": false, "phase": "idle", "game": null, "core": null, "attempt": null, "download": null,
          "question": null, "startedAt": null, "message": "", "log": "", "lastResult": null},
  "warnings": [],
  "addons": {}
}
```

`quitCombo` è l'uscita dal gioco col joypad (impostazione `input.quit_combo`): `"hold_start"` (predefinita, START tenuto 2 secondi), `"hold_select"` (SELECT tenuto 2 secondi) o `"start_select"`. Il servizio la scrive come `input_quit_gamepad_combo` (`"7"`, `"8"` o `"4"`) nel file `--appendconfig` di ogni partita. Un altro valore dà 400.

`input.menu_combo` è la combinazione che apre il menu rapido di RetroArch col joypad: `"l1_r1_start_select"` (predefinita), `"l2_r2"`, `"l1_r1"`, `"down_select"` (giù sulla croce + SELECT) o `"none"` (solo F1 dalla tastiera). Il servizio la scrive come `input_menu_toggle_gamepad_combo` (`"3"`, `"10"`, `"6"`, `"9"` o `"0"`) nel file `--appendconfig` di ogni partita. Un altro valore dà 400, e dà 400 anche una combinazione che si scontra con le altre: il menu non può contenere l'uscita START+SELECT, né contenere o essere contenuto nella combinazione dei salvataggi o di emergenza. Se l'uscita START+SELECT è scelta per un gioco o una console, in quella partita il menu rapido è spento (`"0"`). Lo stesso file imposta `auto_overrides_enable = "false"`: RetroArch non carica gli override di core, cartella o gioco, che verrebbero applicati dopo il file della dashboard e ne scavalcherebbero le chiavi.

`warnings` contiene per esempio «Cartella dei giochi non trovata: …».

`addons` è un oggetto `{id: dati}` con i dati iniziali delle estensioni presenti in `backend/pixelarcade/addons/` (solo quelle che definiscono `bootstrap`). Senza estensioni è vuoto. Le rotte delle estensioni usano il prefisso `/api/addons/<id>/`.

Una rotta di un'estensione può restituire, al posto dei dati JSON, un `RawResponse(body, content_type, cache='no-store')` di `pixelarcade.web.router`: il server invia `body` (byte) con status 200, il `Content-Type` e il `Cache-Control` indicati e le stesse intestazioni di sicurezza (CSP compresa) delle altre risposte. Gli errori restano in JSON (`ApiError`).

`GET /api/games?system=arcade`

```json
{
  "system": "arcade",
  "games": [
    {"id": "005.zip", "file": "005.zip", "title": "005", "year": null, "genre": null,
     "players": null, "maker": null, "cover": false, "core": "fbneo", "coreStatus": "ok"}
  ]
}
```

Console assente o non valida (`..`, nome nascosto, `/`) → 400 `{"error": "Console non trovata: snes."}`.

`POST /api/library/rescan` svuota la cache in memoria e restituisce `{"systems": [...]}` come in `bootstrap`.

`GET /api/settings`

```json
{
  "settings": {
    "paths.roms": "games",
    "paths.cores": "~/snap/retroarch/common/.config/retroarch/cores",
    "retroarch.command": "snap run retroarch",
    "probe.window_seconds": 10,
    "cores.buildbot_url": "https://buildbot.libretro.com/nightly/linux/x86_64/latest/",
    "ui.theme": "random",
    "ui.mode": "system",
    "ui.screensaver_minutes": 2,
    "ui.screensaver_content": "mixed",
    "ui.tournament_ads": true,
    "ui.logout_minutes": 1,
    "ui.sound": true,
    "ui.sound_effects": 75,
    "ui.sound_music": 50,
    "buttons": {"a": 0, "b": 1, "x": 2, "y": 3, "lb": 4, "rb": 5, "lt": 6, "rt": 7, "select": 8, "start": 9}
  },
  "systems": [
    {"id": "arcade", "name": "ARCADE", "count": 2310, "extensions": "", "defaultExtensions": "zip 7z",
     "cores": ["fbneo", "mame", "mame2003_plus"], "coresDefault": true,
     "compatibleCores": ["fbneo", "flycast"]}
  ],
  "coreTypes": [
    {"name": "Arcade", "group": "Arcade", "cores": ["fbneo", "mame", "mame2003_plus"]},
    {"name": "Sega - Master System - Mark III", "group": "Sega", "cores": ["gearsystem", "genesis_plus_gx"]},
    {"name": "DOOM", "group": "Motori di gioco", "cores": ["prboom"]}
  ],
  "availableCores": [
    {"name": "fbneo", "label": "Arcade (FinalBurn Neo)", "types": ["Arcade"],
     "extensions": ["zip", "7z", "cue", "ccd"], "installed": true, "downloadable": true}
  ],
  "coreIndex": {"count": 240, "fetchedAt": "2026-09-23T15:10:00+00:00", "error": null},
  "retroarch": {"quitCombo": true},
  "cpu": {"ready": true, "governor": "schedutil"}
}
```

- `settings` contiene tutte le chiavi (qui ne sono mostrate alcune), con i predefiniti per quelle non salvate.
- `systems` elenca le cartelle presenti in `games/`:
  - `extensions` vuoto = estensioni predefinite. Sono quelle del sistema (`defaultExtensions`) oppure, per le cartelle non riconosciute, l'unione delle estensioni dei core della lista;
  - `cores` sono i nomi brevi, nell'ordine automatico;
  - `coresDefault` è vero se la lista non è mai stata salvata: allora contiene i core disponibili delle tipologie del preset, più quelli compatibili con RetroAchievements disponibili, e segue i core installati o scaricabili del momento;
  - `compatibleCores` sono i core compatibili con RetroAchievements del preset, nell'ordine di priorità (`ra_cores.py`); vuoto per le cartelle non riconosciute. Il frontend li usa per ordinare la lista dopo le modifiche;
  - `name`, `count`, `defaultExtensions`, `coresDefault` e `compatibleCores` sono calcolati.
- `coreTypes`: tipologie ricavate dai `.info` dei core (regola di `tipologie_core.md` nel piano). Contengono solo i core disponibili. `group` vale `Arcade`, il produttore (la parte prima di « - »), `Altri` o `Motori di gioco`; l'elenco è già ordinato per gruppo e nome.
- `availableCores`: core disponibili, in ordine alfabetico. Sono i core installati e quelli scaricabili per x86_64 che hanno un `.info`. I core esclusi dalla classificazione (test, lettori, utilità) compaiono solo se installati. `label` è `display_name` del `.info`.
- `coreIndex`: elenco dei core scaricabili (`.index-extended` del buildbot). `fetchedAt` è `null` se non è mai stato scaricato; `error` riporta l'ultimo tentativo fallito, finché uno non riesce.
- `retroarch.quitCombo` è vero se il `retroarch.cfg` della console (nella cartella sopra `paths.cores`) ha `input_quit_gamepad_combo`: senza, i giochi non si avviano.
- `cpu`: «Processore al massimo» (`settings["play.cpu_boost"]`, vero o falso, predefinito vero; `cpu.CpuBoost`). `ready` è vero se `/usr/local/sbin/pixelarcade-cpu` c'è e `sudo -n -l` permette di lanciarlo; `governor` è quello in uso sul primo core, oppure `null`. Con l'impostazione attiva, per tutta la partita il governor è `performance` (README, «Processore al massimo»).

`POST /api/settings` riceve lo stesso formato, senza i campi calcolati (se presenti vengono ignorati):

- `settings`: le impostazioni da salvare (`buttons` può essere parziale);
- `systems`: solo le console da cambiare, `{id, extensions, cores}`; le altre restano invariate. La configurazione dei giochi si salva a parte (vedi «Configurazione dei giochi»).

Regole di validazione:
- la cartella dei giochi deve esistere e ogni console deve esserne una sottocartella;
- `cores` è una lista di nomi brevi (lettere, cifre, `_`, `-`, `+`, `.`; niente cartelle né `_libretro.so`), senza limite di numero e con i doppioni tolti; un core può anche non essere disponibile;
- `cores: null` torna alla lista predefinita;
- le estensioni sono lettere e cifre separate da spazi o virgole, e vengono salvate come `"zip 7z"`;
- `cores.buildbot_url` deve iniziare con `https://` e finire con `/`;
- `ui.theme` (tema grafico, `theme` in `/api/bootstrap`) vale `random` (predefinito: un tema a caso a ogni avvio della pagina) oppure `nes`, `gameboy`, `16bit`, `psx`, `n64`, `computer`, `arcade`, `y2k`;
- `ui.mode` (modalità dei colori, `mode` in `/api/bootstrap`) vale `system` (predefinito: segue la preferenza chiaro/scuro del sistema), `day` o `night`;
- `ui.screensaver_minutes` (attesa del salvaschermo, `screensaver` in `/api/bootstrap`) vale `0` (mai), `10 / 60` (10 secondi, cioè `0.16666666666666666`), `0.25` (15 secondi), `0.5` (30 secondi), `1`, `2` (predefinito), `5` o `10`;
- `ui.screensaver_content` (contenuto del salvaschermo, `screensaverContent` in `/api/bootstrap`) vale `mixed` (predefinito: copertine e una partita rigiocata ogni 2 minuti), `covers` o `games`; `ui.tournament_ads` (booleano, predefinito `true`, `tournamentAds` in `/api/bootstrap`) fa del salvaschermo il manifesto dei tornei di oggi;
- `ui.logout_minutes` (attesa prima che escano i profili e torni «PRESS START», `logout` in `/api/bootstrap`) vale `0` (mai), `0.5` (30 secondi), `1` (predefinito), `2`, `5` o `10`;
- `ui.sound` (suoni della dashboard, `sound.on` in `/api/bootstrap`) vale `true` (predefinito) o `false`; `ui.sound_effects` e `ui.sound_music` (volumi, `sound.effects` e `sound.music`) valgono `0` (spento), `25`, `50`, `75` o `100` (predefiniti 75 e 50).

Durante una partita (`run.running`) la risposta è 409.
Tutto viene validato e salvato in una sola transazione. Al primo valore non valido la risposta è 400 `{"error": "La cartella dei giochi non esiste: /…/games2."}` e nulla viene salvato. Dopo il salvataggio la cache della libreria viene svuotata; la risposta è come la GET.

`POST /api/cores/refresh` con corpo `{}` riscarica l'elenco dei core dal buildbot e risponde come `GET /api/settings`. Se il buildbot non risponde, la risposta è 502 `{"error": "Elenco dei core non scaricato dal buildbot libretro: …"}` e resta l'elenco precedente. Al primo avvio, se l'elenco non è mai stato scaricato, il servizio lo scarica da solo in un thread separato.

### Partite (sprint 05)

`POST /api/launch` avvia il gioco e risponde subito con `run`; ricerca del core e partita proseguono in un thread e si seguono con `GET /api/run` (una volta al secondo).
- 400: gioco inesistente, console senza core disponibili («Aggiungi dei core a questa console nelle Impostazioni (SELECT).»), combinazione d'uscita non supportata;
- 409: partita già in corso, oppure tutti i candidati già provati: `{"error": "Nessun core compatibile: provati mame, fbneo.", "incompatible": true, "tried": ["mame", "fbneo"]}`. Per riprovare: `POST /api/game/core/reset`, poi di nuovo `POST /api/launch`.

Scelta del core (piano, §I): `ok` e installato → avvio diretto; `trial` → prova come durante la ricerca; core associato non più installato → nuova ricerca (una scelta manuale viene invece scaricata); altrimenti ricerca tra i candidati senza un tentativo fallito. I candidati sono i core della lista della console, installati o scaricabili, che dichiarano l'estensione del file (fuori dall'arcade valgono anche `zip` e `7z`).

- `POST /api/stop`: interrompe ricerca, download o partita. Un core interrotto durante la prova non conta come fallito. Durante `verdict` chiude la domanda lasciando il core in prova.
- `POST /api/download/answer`: risposta alla domanda `download_confirm` (core oltre 50 MB); con `accept: false` si passa al candidato successivo. 409 se non c'è la domanda per quel core.
- `POST /api/game/core/verdict`: risposta a `verdict`. `worked: true` conferma il core; `false` lo scarta e prova subito il successivo (fase `probing`), oppure segna il gioco `incompatible`. 409 se non c'è una domanda per quel gioco.
- `GET /api/game/cores`: core compatibili per il menu «Core ▸». `POST /api/game/core` salva la scelta come confermata (`ok`, `manual`); 400 se il core non è compatibile. `POST /api/game/core/reset` cancella associazione e tentativi del gioco.
- `GET /api/cores/unused`: core di `downloaded_cores` ancora nella cartella dei core e non usati da nessun gioco con stato `ok` o `trial`; `size` in byte. `POST /api/cores/unused/delete` li cancella (409 durante una partita).
- `shared` (facoltativo): id di un salvataggio condiviso del gioco (`GET /api/saves/game`): la partita parte dall'inizio con una copia di quel salvataggio interno al posto di quello del P1 e a fine partita la copia si butta; «Riprendi» e slot si conservano con il suo id. 400 se c'è anche `resume` o il salvataggio non c'è. Anche un `resume` su uno slot nato da un salvataggio condiviso riparte con la sua copia (README, «Salvataggi condivisi»).
- `pads` (facoltativo, sprint 07): joypad di P1 e P2 come indici della Gamepad API (da 0 a 15, distinti). Se almeno uno è presente, il file `--appendconfig` assegna il joypad di P1 al giocatore 1 di RetroArch e quello di P2 al giocatore 2 (`input_player1_joypad_index`, `input_player2_joypad_index`, solo se la chiave esiste nel `retroarch.cfg`); un giocatore senza joypad riceve il primo indice libero. Senza joypad RetroArch usa il suo ordine. 400 se i valori non sono validi.
- `padModels` (facoltativo): modelli dei joypad di P1 e P2, `[{vendor, product, rank} | null, …]` (id USB letti dal nome del joypad in Chrome; `rank` è la posizione tra i joypad collegati dello stesso modello, in ordine di indice). Chrome e RetroArch numerano i joypad ognuno a modo suo, e dopo che un joypad è stato staccato e ricollegato i numeri possono non coincidere: con `padModels` il backend legge i joypad con SDL2 come RetroArch e assegna a ogni giocatore l'indice SDL del joypad dello stesso modello e posizione. Un joypad che non si trova tiene l'indice di Chrome; se due giocatori finissero sullo stesso joypad, o SDL non si legge, valgono gli indici di Chrome. 400 se i valori non sono validi. Indipendentemente da `pads`, il file `--appendconfig` imposta a `"nul"` i tasti del joypad di P1 e P2 (A, B, X, Y, L, R, L2, R2, Start, Select, chiavi `_btn` e `_axis`), così RetroArch usa l'autoconfig del joypad; croce, L3, R3 e levette analogiche restano al `retroarch.cfg`. Per la PS1 il file imposta anche il controller emulato di P1 e P2 a DualShock (`input_libretro_device_p1` e `_p2` = `517`, lo stesso valore in Beetle PSX HW e PCSX ReARMed; scritte anche se mancano nel `retroarch.cfg`, dove RetroArch non le salva): con il controller digitale predefinito dei core i giochi che richiedono il DualShock non rispondono. Con Beetle il passaggio digitale/analogico resta spento (`beetle_psx_hw_analog_toggle`, predefinito del core): il DualShock è sempre in analogico. Un gioco solo digitale che non lo riconosce può accenderlo nelle sue opzioni del core (poi L1+R1+SELECT cambia modalità).
- `POST /api/exit`: risponde `{"message": "Pixel Arcade si sta chiudendo."}` e dopo 300 ms chiude Chrome e il servizio. 409 durante la ricerca o la partita (non durante `verdict`) e se Chrome non è stato avviato dal servizio (`--no-browser`).
- `GET /api/exit/check`: frasi delle estensioni con un'attività in corso (hook `busy(services)`), per esempio `{"busy": ["2 operazioni in corso"]}`; lista vuota se non ce ne sono. Il frontend le mostra nella conferma di uscita.
- `POST /api/exit` con `{"keepRunning": true}`: se ci sono attività in corso chiude solo Chrome e il servizio resta in background; ogni 5 s controlla le attività e, quando sono finite, si ferma con la chiusura di sempre. Senza attività, o senza `keepRunning`, la chiusura è quella di sempre (le estensioni ricevono `stop()`).
- Chrome chiuso da fuori (Alt+F4, ✕ della finestra) con attività in corso: nessuna conferma possibile, il servizio passa in background come con `keepRunning: true`. Senza attività si ferma come sempre.
- `POST /api/show`: se il servizio è in background riapre Chrome (`{"shown": true}`); con la dashboard già aperta non fa nulla (`{"shown": false}`); 409 se il servizio si sta fermando. La usa un nuovo avvio: se la porta è occupata e `GET /api/health` risponde Pixel Arcade (header `Server: PixelArcade`), il nuovo processo chiama `POST /api/show`, stampa «Pixel Arcade è già in esecuzione: riapro la dashboard.» ed esce con codice 0 senza aprire il database. Se il servizio si sta fermando aspetta al massimo 15 s che liberi la porta e poi parte normalmente. Con `--no-browser` il controllo non si fa.

### Joypad in RetroArch

RetroArch (driver `sdl2`) legge i joypad con la libreria SDL2, che può riconoscere un joypad come *game controller* e rinumerarne i tasti con una sua mappatura. Il backend (`joypads.py`) legge quindi i joypad con la stessa libreria SDL2 di RetroArch (quella della snap, altrimenti quella di sistema) e nello stesso modo: i tasti imparati sono quelli che vedrà RetroArch.

- `GET /api/joypads`: `driver` è `input_joypad_driver` del `retroarch.cfg`; con un driver diverso da `sdl2` `supported` è falso, `error` lo spiega e `devices` è vuoto. Ogni `joypad` è `{index, name, vendor, product, controller, configured, profile, binds}`: `name` è il nome che RetroArch confronta con gli autoconfig, `controller` è vero se SDL lo apre come game controller, `configured` è vero se nella cartella degli autoconfig (`joypad_autoconfig_dir`, con `~` risolto come la home di RetroArch, oppure `autoconfig` accanto al `retroarch.cfg`) c'è un file con `input_driver = "sdl2"` e gli stessi id USB o lo stesso nome; `profile` è il nome di quel file e `binds` i suoi tasti (`{tasto: [token]}`).
- Un *token* è `b<N>` (pulsante), `+<N>` / `-<N>` (asse in una direzione) o `h<N>up|down|left|right` (cappello). I tasti del RetroPad sono `b a y x l r l2 r2 l3 r3 select start up down left right`.
- `POST /api/joypads/learn` inizia a leggere i joypad con quegli id USB in un thread: i tasti già premuti all'inizio non contano finché non vengono rilasciati; per gli assi conta lo spostamento dalla posizione iniziale. 400 se il joypad non c'è, 409 durante una partita. La lettura si ferma da sola se per 30 s nessuno chiede `GET /api/joypads/learn`.
- `GET /api/joypads/learn?after=N` restituisce le pressioni successive alla `N` (al massimo le ultime 32); `active` falso con `error` se la lettura si è fermata.
- `POST /api/joypads/save` scrive l'autoconfig `sdl2` del joypad: nel file che già lo riguarda (con una copia `<file>.bak-<data>` accanto), altrimenti in `<cartella>/<nome del joypad>.cfg`. 400 se un tasto è sconosciuto o non valido, se manca un tasto obbligatorio (`b a select start up down left right`) o se lo stesso token è usato due volte.
- `POST /api/joypads/repair` mette a `"nul"` nel `retroarch.cfg` tutti i tasti joypad (`_btn` e `_axis`) dei giocatori 1 e 2 e imposta `config_save_on_exit = "false"`, così valgono gli autoconfig; prima ne fa una copia `retroarch.cfg.bak-<data>`, che indica in `backup` (`null` se non c'era niente da cambiare). 409 durante una partita o con RetroArch aperto.

### Profili (sprint 07)

`GET /api/profiles` restituisce i profili in ordine di creazione e in `games` il riepilogo (`gameSummary`) di ogni gioco citato nei loro preferiti e nelle partite recenti.

`POST /api/profiles` crea un profilo e restituisce l'`account`:

```json
{"name": "prova 1", "color": "#f5c542", "favConsole": "snes"}
```

- il nome viene normalizzato (`PROVA_1`);
- 400: nome vuoto dopo la normalizzazione, colore non tra gli 8, `favConsole` non valida;
- 409: `{"error": "Nome già in uso"}`, anche con maiuscole diverse.

### Preferiti e preferenze (sprint 08)

`POST /api/favorites` aggiunge (`on: true`) o toglie (`on: false`) un preferito; ripetere la stessa operazione non cambia nulla. Risponde con tutti i preferiti del profilo e i loro riepiloghi:

```json
{"account": 1, "game": "arcade/pang.zip", "on": true}
```

- 400: profilo inesistente, chiave senza `/`, `on` non booleano, gioco da aggiungere non presente nella libreria (togliere un gioco non più presente è sempre possibile).

`POST /api/profiles/update` modifica le preferenze e restituisce l'`account`; si possono mandare solo i campi da cambiare, e in `opts` anche solo alcune opzioni:

```json
{"id": 1, "patch": {"difficulty": "Difficile", "opts": {"crt": true}, "genres": ["Platform", "Corse"]}}
```

- `name` si normalizza come alla creazione; 409 `{"error": "Nome già in uso"}` se è di un altro profilo, anche con maiuscole diverse.
- 400: profilo inesistente, campo non ammesso, valore non valido (anche un nome vuoto dopo la normalizzazione o un colore non tra gli 8). Se un campo non è valido non si salva nulla.

**Avatar Gravatar.** `patch.email` collega un'email Gravatar (`null` o `""` la scollega). Il backend salva solo l'hash SHA-256 dell'email normalizzata (minuscolo, senza spazi ai lati) nella colonna `accounts.gravatar`; l'email non si salva e non torna nelle risposte. 400 `Email non valida.` se non ha la forma `nome@dominio.tld` o supera 254 caratteri.

`GET /api/profiles/avatar?id=` restituisce l'immagine (`image/png` o `image/jpeg`, `Cache-Control: no-cache`) scaricata da `https://gravatar.com/avatar/<hash>?s=160&d=404` e tenuta in `<data_dir>/avatars/` per un giorno; senza rete si usa anche l'immagine scaduta.

- 400: `id` mancante o profilo inesistente.
- 404: profilo senza Gravatar, email senza immagine su Gravatar (ricordato per un giorno) o Gravatar non raggiungibile senza copia in cache. L'interfaccia mostra allora l'iniziale.

**Preferenze in RetroArch.** A ogni avvio il file `--appendconfig` riceve anche le chiavi dalle preferenze di P1 (per un ospite o senza P1, quelle predefinite: vibrazione attiva), sempre solo se presenti nel `retroarch.cfg` della console:
- `input_rumble_gain` = `100` con `opts.vib`, altrimenti `0`;
- con `opts.crt` e `paths.crt_shader` impostato lo shader non è una chiave: passa a RetroArch con `--set-shader <percorso>` e vince su quello della configurazione. `video_shader` non compare nel `retroarch.cfg` della console, quindi il file non lo scriverebbe.

### Statistiche del profilo

`GET /api/profiles/stats?id=` restituisce i dati della scheda «Statistiche» del profilo (`profileStats`):

| Campo | Tipo | Note |
| --- | --- | --- |
| `systems` | lista | tempo per console, dalla più giocata: `[{system, name, seconds, sessions}]` |
| `top` | lista | i 10 giochi con più tempo: `[{game, seconds, sessions, lastAt}]` |
| `history` | lista | partite dalla più recente, 30 per volta: `[{id, kind: 'session', game, startedAt, endedAt, seconds, xp, slot, partners: [{id, name, color}], trophies: [titolo], tournament}]`, con in mezzo i piazzamenti nei tornei `[{id, kind: 'reward', title, place, xp, at}]` |
| `more` | booleano | vero se ci sono partite più vecchie |
| `games` | oggetto | `{key: gameSummary}` dei giochi citati |
| `tournaments` | oggetto | `{played, won, best}`: tornei conclusi giocati, vinti e miglior piazzamento (`null` senza tornei) |

- Nello storico compaiono solo le partite di almeno 30 secondi; quelle più brevi contano comunque in `systems` e `top`.
- `partners` sono gli altri profili registrati nella partita; `trophies` i trofei RetroAchievements sbloccati dal profilo in quella partita.
- `tournament` è `{id, title}` per una partita di un incontro di torneo (`title` `null` se il torneo è stato eliminato), altrimenti `null`. Le partite di torneo contano come le altre (XP, `systems`, `top`); nello storico hanno `tournament` `{id, title}` con il titolo completo dell'edizione.
- I piazzamenti (`kind: 'reward'`) stanno tra le partite in ordine di data, nella pagina delle partite dello stesso periodo; `title` è quello del torneo alla fine, `xp` il premio (0 senza premio). Restano anche dopo l'eliminazione del torneo dall'archivio, come gli XP.
- Con `before=<id>` (l'`id` dell'ultima partita ricevuta, non di un piazzamento) arrivano le 30 partite precedenti.
- 400: `id` mancante o profilo inesistente.

### Wrapped

Riepilogo del mese (`AAAA-MM`) o dell'anno (`AAAA`), in ora locale, per profilo o di casa. Il profilo si indica con `account=<id>`; `account=house` (o nessun `account`) vale la casa, cioè tutte le partite dei profili. Un periodo ha il Wrapped quando è finito e ha almeno 3 partite; una partita conta nel periodo in cui è finita (`ended_at`).

`GET /api/wrapped/list?account=` risponde `{periods, pending}`: `periods` sono i periodi con il Wrapped, dal più recente (a pari anno prima l'anno), come `[{period, kind, label, seen}]` con `kind` pari a `month` o `year`, `label` per esempio «Settembre 2026» e `seen` vero se è già stato visto. `pending` è il periodo da proporre con l'avviso, oppure `null`: il mese appena chiuso o, a gennaio, l'anno appena chiuso, se ha il Wrapped e non è ancora stato visto.

`GET /api/wrapped?account=&period=` risponde con i dati del Wrapped:

| Campo | Tipo | Note |
| --- | --- | --- |
| `period`, `kind`, `label` | testo | come in `periods` |
| `scope` | testo | `profile` o `house` |
| `totals` | oggetto | `{seconds, sessions, games, days, newGames, trophies}`; per un profilo anche `xp`, per la casa `players`. `newGames` sono i giochi giocati per la prima volta nel periodo |
| `topGames` | lista | i 5 giochi con più tempo: `[{game, seconds, sessions}]` |
| `systems` | lista | tempo per console, dalla più giocata: `[{system, name, seconds, sessions}]` |
| `longest` | oggetto o `null` | partita più lunga: `{game, seconds, at}` (`at` = inizio) |
| `habits` | oggetto | `{weekday, weekdayName, part, hour}`: giorno della settimana (0 = lunedì), fascia (`notte`, `mattina`, `pomeriggio`, `sera`) e ora con più tempo di gioco, dall'inizio delle partite |
| `streak` | numero | giorni di fila con almeno una partita, la serie più lunga |
| `trophies` | oggetto | `{count, recent, topGame}`: trofei RetroAchievements delle partite del periodo, gli ultimi 3 `[{title, game}]` e il gioco con più trofei `{game, count}` (o `null`) |
| `persona` | oggetto | personaggio `{id, name, text}`: `marathon`, `collector`, `quick`, `loyal` o `explorer` |
| `profile` | oggetto | solo profilo: `{id, name, color, avatar}` |
| `rival` | oggetto o `null` | solo profilo: `{person, together: {sessions, seconds}, me: {xp, seconds}, them: {xp, seconds}}`, il profilo con più partite insieme o, senza, quello con gli XP più vicini |
| `players` | lista | solo casa: `[{id, name, color, avatar, seconds, sessions, xp, trophies, persona}]` per XP (poi tempo) |
| `duo` | oggetto o `null` | solo casa: `{players: [a, b], sessions, seconds}`, la coppia con più partite insieme |
| `games` | oggetto | `{key: gameSummary}` dei giochi citati |

- Nella casa una partita in due conta una volta per tempo, partite e trofei.
- 400: periodo mancante, non valido, non finito o con meno di 3 partite; profilo non valido o inesistente.

`POST /api/wrapped/seen` `{account, period}` (`account` nullo = casa) segna il Wrapped come visto (tabella `wrapped_seen`, `account_id` 0 per la casa) e risponde come `GET /api/wrapped/list`. 400 se il periodo non ha il Wrapped.

### Sfida trofeo

Durante una partita normale, a ogni `Awarding achievement` del P1 collegato (id sotto 101000000: gli avvisi di RetroArch come «Unsupported Game Version» non contano) il backend copia in `<dati>/saves/challenges/_run/` lo stato periodico più vicino a 300 s di gioco prima dello sblocco. A fine partita `lastResult` ha `challengeCandidates: [{achievementId, title, seconds}]` (solo i trofei con uno stato), dove `seconds` è il tempo di gioco dallo stato al trofeo.

`POST /api/challenges` `{account, achievements}` crea una sfida per ogni trofeo scelto (tabella `trophy_challenges`, stato in `<dati>/saves/challenges/<nome>.state`) e cancella gli altri stati; 409 se la partita non ha punti di sfida o `account` non è il suo P1. `POST /api/challenges/discard` li cancella tutti; succede anche all'inizio della partita successiva. `GET /api/challenges/candidates` rilegge quelli in attesa.

Una sfida (`challenge`) è `{id, system, game, title, achievementId, achievementTitle, raGameId, creator: {id, name, color}, seconds, createdAt, expiresAt, open, daysLeft, thumb, ranking: [{account, name, color, best, attempts}], record: {account, name, seconds} | null, myBest, myAttempts}`: `seconds` è il primo tempo del creatore, `ranking` il miglior tempo e i tentativi di ogni profilo (prima chi ha un tempo, dal più basso), `myBest` e `myAttempts` quelli del profilo della richiesta.

`GET /api/challenges?account=` risponde `{open, mine, ended, linked}`: sfide aperte di altri, sfide del profilo (aperte e concluse), sfide concluse di altri a cui ha partecipato; `linked` è vero se il profilo ha l'account RetroAchievements. `GET /api/challenges/notices?account=` risponde `{challenges, finals, linked}`: sfide aperte di altri non ancora viste e sfide concluse con un suo tentativo e il riepilogo non ancora visto. `POST /api/challenges/seen` `{account, id, kind}` (`kind` = `notice` o `final`) le segna come viste (tabella `trophy_challenge_seen`).

`POST /api/challenges/start` `{id, players, pads, padModels}` avvia la sfida come `/api/launch`: stato della sfida, core della sfida (409 se non è installato) e `cheevos_start_active = "true"` (Encore). 409 se la sfida è scaduta, se il suo stato non c'è più o se il P1 non ha l'account RetroAchievements. La partita non conserva «Riprendi», salvataggio interno né stati di soccorso. A fine partita il tentativo del P1 va in `trophy_challenge_runs` e `lastResult.challenge` è `{id, achievementTitle, won, seconds, attempts, personalBest, record, beatRecord, previousRecord}`: `seconds` è il tempo di gioco da quando RetroArch risponde `PLAYING` con lo stato caricato.

Le sfide durano 15 giorni; alla scadenza (controllata a ogni lettura) il file dello stato si cancella e la sfida resta tra le concluse. `GET /api/challenges/thumb?id=` dà la miniatura dello stato.

### Torneo

Tabella `tournaments`. `status` è `draft` (bozza), `open` (iscrizioni aperte), `running` (in corso), `done` (concluso) o `cancelled` (annullato). Bozze e tornei con le iscrizioni aperte possono essere più di uno; in corso ce ne sarà uno solo alla volta. `GET /api/tournament` dà `tournaments` (i tornei non conclusi, dal più recente), `recent` (i conclusi da meno di 3 giorni, per la scheda TOURNAMENT), `history` (l'archivio: conclusi e annullati, dalla fine o dall'annullamento più recente), `series` (le serie, vedi sotto) e `rewardXp` (XP del premio per 1°, 2° e 3° posto).

Un torneo è un'edizione di una serie (tabella `tournament_series`). È `{id, creatorId, creator: {id, name, color}, status, title, fullTitle, series: {id, name, description}, seriesId, edition, description, startsAt, system, game, gameInfo, core, hasState, thumb, maxPlayers, roundSeries, finalSeries, thirdPlace, savesLocked, sides, rewards, combo, createdAt, updatedAt, publishedAt}`. `gameInfo` è il riepilogo del gioco come nei profili (`null` senza gioco); `startsAt` è ISO in UTC al minuto, oppure `null`; `core` è il core dello stato di partenza (`null` senza stato); `maxPlayers` `null` = nessun limite; `roundSeries` e `finalSeries` valgono 1, 3 o 5; `sides` è `alternate`, `random` o `free`; `combo` è vero se il torneo ha una combinazione dell'admin (l'impronta non esce mai dal server).

`title` è il titolo facoltativo dell'edizione; `fullTitle` è il titolo completo, «<nome della serie> · Nª edizione — <titolo>» (numero e titolo solo se ci sono); `edition` è il numero dell'edizione, `null` se è annullata. `combo` è la combinazione della serie, comune a tutte le edizioni.

`POST /api/tournament` `{account}` crea una serie del P1 (nome «Torneo di <mese>») con la 1ª edizione in bozza, con i valori predefiniti.

**Serie.** Ogni voce di `series` è `{id, name, description, combo, creator: {id, name, color}, editions, canAdd, rankings, honours}`, dalla serie con l'edizione più recente. `editions` (dalla più recente) sono `{id, edition, title, fullTitle, status, startsAt, finishedAt}`; `canAdd` è vero se nessuna edizione è in bozza, in iscrizione o in corso. `rankings` è `{medals, points, matches}`: tre elenchi degli stessi profili (chi ha giocato almeno un'edizione conclusa), `{id, name, color, position, editions, gold, silver, bronze, points, wins, played, pct}`, ordinati per medagliere (ori, argenti, bronzi, poi incontri vinti ed edizioni), per punti (10/7/5/3/2 dal 1° al 5°, 1 agli altri; poi ori e incontri vinti) e per incontri vinti (`wins`, il pareggio vale 0,5; bye e tavolini esclusi; poi `pct`, la percentuale intera, ed edizioni). `position` è condivisa a parità. `honours` è l'albo d'oro: `{id, edition, fullTitle, finishedAt, winners: [{id, name, color}]}` delle edizioni concluse, dalla più recente.

Le operazioni sulla serie hanno `series` (l'id), `account` e `combo`, con gli stessi controlli del torneo (creatore della serie e combinazione). `POST /api/tournament/series/update` cambia `changes`: `name` (obbligatorio, al massimo 40 caratteri) e `description` (al massimo 300). `POST /api/tournament/series/edition` crea la nuova edizione in bozza (400 se un'edizione è in bozza, in iscrizione o in corso): copia la più recente non annullata, stato di partenza e salvataggio interno compresi, tranne titolo, data e iscritti; il numero è il più alto tra le non annullate più uno. `POST /api/tournament/series/delete` elimina la serie con tutte le edizioni (400 con un'edizione in corso); i premi restano.

Lo modifica solo il creatore: le altre operazioni hanno `id` (il torneo), `account` (il profilo del P1) e `combo` (la sequenza di tasti logici: `up`, `down`, `left`, `right`, `a`, `b`, `x`, `y`, `lb`, `rb`, `lt`, `rt`), che serve solo se il torneo ha una combinazione. Con un profilo diverso o la combinazione sbagliata la risposta è 400 con `locked: true`; un torneo inesistente, concluso o annullato dà 400. `POST /api/tournament/unlock` controlla solo profilo e combinazione.

`POST /api/tournament/update` `{id, account, combo, changes}` cambia i campi di `changes`: `title` (titolo dell'edizione, facoltativo, al massimo 40 caratteri), `name` e `seriesDescription` (nome e descrizione della serie, come in `series/update`), `description` (al massimo 300), `startsAt` (ISO con il fuso, futura, oppure `null`), `game` (`{system, id}`, oppure `null`), `clearState` (`true`: niente stato di partenza, si parte dall'inizio), `maxPlayers` (3–64 o `null`), `roundSeries`, `finalSeries`, `thirdPlace`, `savesLocked`, `rewards`, `sides`, `newCombo` (sequenza, vuota = nessuna combinazione; si salva sulla serie) e i campi del formato (sotto). Cambiando gioco si tolgono stato di partenza e salvataggio interno del torneo. A torneo in corso si cambiano solo `title` e `description`.

`POST /api/tournament/record` `{id, account, combo, source, players, pads, padModels}` registra lo stato di partenza giocando: avvia il gioco come `/api/launch`, col creatore come P1 (altrimenti 400). `source` è `{kind: "zero"}` (dall'inizio, senza salvataggio interno), `{kind: "mine"}` (dall'inizio con il salvataggio interno del creatore) o `{kind: "slot", slot}` (dallo stato dello slot 0–9 del creatore, con il suo salvataggio interno; lo stato deve essere del core del gioco, come in «Gioca da qui»). A fine partita lo stato automatico va in `saves/tournaments/<id>.state` della cartella dei dati, con la miniatura, il core resta quello della partita e il salvataggio interno della sessione diventa quello del torneo (`saves/tournaments/<id>-sram/`); «Riprendi» e salvataggio interno del profilo non cambiano. `lastResult.tournament` è `{recorded}` (falso se il core non ha salvato lo stato, `noState` vero). Non si registra a torneo in corso.

`POST /api/tournament/publish` porta la bozza alle iscrizioni (servono il nome della serie e il gioco; la data, se c'è, deve essere futura). `POST /api/tournament/delete` `{id, account}` elimina la bozza senza chiedere la combinazione; con `combo` elimina anche un torneo dell'archivio (concluso o annullato: creatore e combinazione come le altre operazioni), con incontri e partite, ma i premi e i piazzamenti già dati restano nei profili; un torneo pubblicato si annulla con `POST /api/tournament/cancel`, che cancella stato e salvataggio interno, toglie il numero dell'edizione e la mette nello storico; eliminare l'ultima edizione di una serie elimina anche la serie; un torneo in corso si annulla anche con gli incontri giocati (incontri e partite restano per lo storico), ma non mentre una partita di un suo incontro è aperta sulla console (errore «C’è un incontro in gioco…»; un incontro sospeso tra due partite non conta). `GET /api/tournament/thumb?id=` dà la miniatura dello stato di partenza.

Iscritti nella tabella `tournament_players`. Ogni torneo ha `players` (`[{id, name, color, joinedAt, addedBy, seed}]` in ordine d'iscrizione, `addedBy` è l'admin che l'ha iscritto o `null`, `seed` la testa di serie scritta all'avvio, prima `null`) e `registrationClosed`. Con le iscrizioni aperte (`open`, non chiuse) `POST /api/tournament/join` `{id, account}` iscrive il profilo e `POST /api/tournament/leave` lo ritira; 400 se è già iscritto (o non lo è), se i posti sono finiti, con le iscrizioni chiuse, in bozza o a torneo iniziato. L'admin (creatore e `combo`, come sopra) iscrive con `POST /api/tournament/players/add` `{id, account, combo, player}` (anche con le iscrizioni chiuse, sempre nei limiti dei posti), toglie con `POST /api/tournament/players/remove` e chiude o riapre le iscrizioni con `POST /api/tournament/registration` `{id, account, combo, closed}`. `maxPlayers` non scende sotto il numero degli iscritti. Chiudendo le iscrizioni (`closed: true`) la risposta ha anche `matches`: gli incontri da giocare con gli iscritti di quel momento nel formato del torneo (`null` se il formato non sa ancora contarli).

Formato del torneo. Ogni torneo ha `format` (`single` eliminazione diretta, `double` doppia eliminazione, `round_robin` girone all'italiana, `swiss` svizzero, `two_stage` due fasi), `options` (le opzioni proprie del formato), `seeding` (teste di serie: `random`, `xp`, `time` = tempo giocato al gioco del torneo, `mix`), `seedingWeight` (peso degli XP nel misto, 0–100 a passi di 10, predefinito 50), `advantagedSide` (`none`, `p1`, `p2`: la testa di serie migliore parte nell'altro lato; conta con `sides` `alternate` o `random`), `startedAt`, `finishedAt` e `formats` (`[{id, ready}]`: i formati e se si possono già scegliere; per ora `single`, `double` e `round_robin`). `POST /api/tournament/update` accetta questi campi in `changes`: un formato non pronto dà 400; `options` si controlla sul formato (le chiavi di altri formati danno 400, quelle mancanti prendono il predefinito); cambiando `format` senza `options` restano i valori compatibili. Opzioni dell'eliminazione diretta: `semiSeries` (1, 3, 5, oppure `null` = come i turni); le serie dei turni e della finale e il 3° posto restano `roundSeries`, `finalSeries` e `thirdPlace`. A torneo in corso il formato non si cambia. I tornei creati prima del formato sono a eliminazione diretta.

Avvio. Lo fa l'admin (creatore e `combo`) di un torneo con le iscrizioni aperte (`open`, anche chiuse dall'admin), con almeno 3 iscritti e nessun altro torneo in corso; altrimenti 400 con il motivo. `settings` sono le impostazioni del formato ritoccate nella schermata d'avvio, con le chiavi della modale del formato (`format`, `options`, `seeding`, `seedingWeight`, `advantagedSide`, `roundSeries`, `finalSeries`, `thirdPlace`): quelle mancanti restano del torneo, valori non validi o chiavi estranee danno 400. `order` sono gli id degli iscritti in ordine di testa di serie, `slots` le caselle del primo turno del tabellone (lunghezza = potenza di 2, `null` = casella vuota, cioè bye dell'avversario); devono contenere esattamente gli iscritti (400 altrimenti).

- `POST /api/tournament/start/check` controlla e restituisce `players` (`[{id, name, color, xp, seconds}]`, `seconds` = tempo giocato al gioco del torneo senza le partite di torneo), `settings` (quelle del torneo) e `counts` (`[{format, ready, matches}]`: incontri da giocare per ogni formato, con le opzioni del torneo per il suo formato e i predefiniti per gli altri; `null` per i formati non pronti).
- `POST /api/tournament/start/preview` non salva niente: senza `order` calcola le teste di serie (a caso ogni volta diverse: «Rimescola»), senza `slots` usa il tabellone standard. Risponde `settings` (normalizzate), `seeds` (`[{id, name, color, xp, seconds, seed, value}]` in ordine; `value` = valore usato: XP, secondi, punteggio del misto 0–100 o `null` a caso), `order`, `slots`, `matches` (incontri come quelli salvati, con `id: null`) e `count` (incontri da giocare).
- `POST /api/tournament/start` ricontrolla tutto e in una transazione salva `settings` nel torneo, le teste di serie in `players[].seed` e gli incontri; il torneo diventa `running` con `registrationClosed` vero e `startedAt`.
- `POST /api/tournament/start/draft` salva la bozza della schermata «Avvia» (`draft` = `{step, settings, order?, slots?}`, `step` da 1 a 3; `null` la cancella), con gli stessi controlli dell'avvio; risponde `{ok}`. La bozza non compare in `GET /api/tournament`. `start/check` la restituisce in `draft` (`null` se non c'è): `{step, settings, order, slots, playersChanged}`. Se gli iscritti sono cambiati dal salvataggio, `playersChanged` è vero, `order` e `slots` sono `null` e `step` è al massimo 2; se le impostazioni salvate non sono più valide la bozza si ignora. Si cancella all'avvio, all'annullamento e quando `POST /api/tournament/update` cambia una delle impostazioni del formato.

Un torneo in corso (`running`), concluso o annullato ha anche `matches`: `[{id, key, stage, groupNo, bracket, round, slot, playOrder, playerA, playerB, fromA, fromB, series, status, winnerId, walkover, bye, startedAt, finishedAt, games}]`. `key` è l'id in testo; `fromA`/`fromB` sono `winner:<key>` o `loser:<key>` dell'incontro da cui arriva il giocatore (`null` se assegnato all'avvio). `bracket` è `main` o `third` (3° posto); `playerA` è la testa di serie migliore; `status` è `waiting`, `ready`, `playing` o `done`; i bye hanno `bye: true`, `playOrder` 0 e sono già conclusi. `games` sono le partite dell'incontro: `[{gameNo, winnerId, sideA, scoreA, scoreB, sessionId, declaredAt}]`.

Incontri. Si gioca solo il prossimo incontro (il primo per `playOrder` tra quelli `ready`, oppure quello `playing`), senza combinazione:

- `POST /api/tournament/match/screen` `{id, match}` dà i dati della schermata «Incontro»: `players` (`[playerA, playerB]`, `{id, name, color, seed}`), `gameNo` (la prossima partita, da 1), `series`, `status`, `wins` (partite vinte da ciascuno), `sides` (del torneo), `sideA` (lato di `playerA`, `p1`/`p2`; `null` con i lati liberi), `drawn` (vero con i lati sorteggiati), `savesLocked` e `played`: la partita finita e non ancora dichiarata (`{gameNo, sideA}`), oppure `null`. Con lati alternati nella partita 1 la testa di serie migliore è nel lato svantaggiato (con `advantagedSide` `none` parte al P1), poi i lati si scambiano a ogni partita; con lati sorteggiati il sorteggio si fa alla prima richiesta e resta lo stesso fino all'avvio di quella partita.
- `POST /api/tournament/match/play` `{id, match, account, sideA?, pads, padModels}` avvia una partita: `account` deve essere uno dei due giocatori o il creatore (400 altrimenti); `sideA` conta solo con i lati liberi (predefinito `p1`). I due profili sono P1 e P2 della partita secondo i lati e `pads` sono i joypad di quei lati. Il gioco parte dallo stato di partenza del torneo con il suo core (senza stato, dall'inizio) e con una copia del salvataggio interno del torneo, che a fine partita si butta; trofei RetroAchievements spenti; niente «Riprendi», stati periodici né Sfida trofeo. La sessione ha `tournament_id` e conta come le altre: XP (con i bonus del gioco nuovo e della sfida), statistiche, tempo per gioco (anche per le teste di serie «per tempo»), giochi giocati, Wrapped e classifica della casa; l'esito (`lastResult` con `kind: 'match'`) ha `players` come le partite normali; resta nella cronologia del profilo con `tournament`. Alla prima partita l'incontro diventa `playing` con `startedAt`. `lastResult` ha `kind: "match"` e `match: {tournament, match, gameNo}`. Risponde come `/api/launch`.
- `POST /api/tournament/match/declare` `{id, match, account, combo, winner, draw, score}` dichiara il risultato della partita finita dell'incontro in gioco: `account` dev'essere il creatore (P1 prima dell'incontro), con `combo` se il torneo ha la combinazione (errore con `locked: true` se sbagliata); `winner` è `playerA`, `playerB` oppure `null` («Nessuno dei due: rigioca»: la partita non conta e si rigioca lo stesso numero). 400 senza una partita finita da dichiarare (una sola dichiarazione per partita; la partita da dichiarare sta in memoria e si perde al riavvio della dashboard). La partita si salva con il lato di `playerA` e la sessione; quando un giocatore arriva a `series // 2 + 1` vittorie l'incontro diventa `done` con `winnerId` e `finishedAt`, vincitore e perdente passano agli incontri che ne dipendono (perdenti delle semifinali nell'incontro per il 3° posto) e gli slot temporanei dell'incontro si cancellano. Nel girone all'italiana: `draw: true` (con `winner` `null`) dichiara una partita pari, solo con i pareggi ammessi; con «Registra il punteggio» `score` = `[punti di playerA, punti di playerB]` è obbligatorio (tranne per «rigioca»), da 0 a 99 e coerente (chi vince ha più punti, con il pari uguali), altrimenti è vietato. Con i pareggi ammessi la serie è fissa: l'incontro si chiude dopo `series` partite valide, vince chi ne ha vinte di più, altrimenti finisce pari (`winnerId` `null`, `draw: true` nella risposta). Risponde `{tournament, match, done, winner, draw, gameNo, wins, drawCount, scores, nextMatch, finished}`: `gameNo` è la partita dopo (`null` a incontro chiuso), `wins` le vittorie di `[playerA, playerB]`, `drawCount` le partite pari, `scores` il punteggio totale di `[playerA, playerB]`, `nextMatch` l'id del prossimo incontro (`null` se non ce n'è), `finished` vero se era l'ultimo incontro e il torneo si è concluso.
- `POST /api/tournament/match/suspend` `{id, match, account}` sospende l'incontro in gioco (`account` uno dei due giocatori o il creatore): resta `playing` con le partite dichiarate e l'eventuale partita da dichiarare, si cancellano solo gli slot temporanei. Si riprende con `/api/tournament/match/play`. Risponde `{tournament}`.

Azioni dell'admin a torneo in corso: `account` dev'essere il creatore, con `combo` se il torneo ha la combinazione (errore con `locked: true` se sbagliata); 400 con una partita di quell'incontro aperta sulla console.

- `POST /api/tournament/match/walkover` `{id, match, account, combo, winner}` dà la vittoria a tavolino a `winner` (uno dei due giocatori) in un incontro con i due giocatori noti e non concluso, anche `playing`: le partite già dichiarate restano, l'incontro diventa `done` con `walkover: true` e il vincitore avanza. Risponde `{tournament}`.
- `POST /api/tournament/withdraw` `{id, account, combo, player}` ritira l'iscritto `player` non eliminato: in `players` ha `withdrawn: true` e perde a tavolino l'incontro in cui si trova. Se l'avversario non è ancora noto, l'incontro si chiude a tavolino da solo appena lo diventa. Nel girone all'italiana perde a tavolino tutti gli incontri che gli restano, anche uno sospeso (400 «Ha già giocato tutti i suoi incontri.» se non ne ha); i risultati giocati restano e `players[].withdrawnAt` è la data del ritiro. Annullare il ritiro (`/api/tournament/match/undo` su uno di quei tavolini) riapre tutti i tavolini chiusi dal ritiro in poi, non quelli dati prima dall'admin. Risponde `{tournament}`.
- `POST /api/tournament/match/undo` `{id, match, account, combo}` è «Annulla il risultato», un passo alla volta. Su un incontro concluso riapre il risultato, se gli incontri che ne dipendono non sono `playing` o `done` (quelli chiusi da soli a tavolino contro un ritirato si riaprono a catena): vincitore e perdente escono dagli incontri dopo e l'incontro torna `playing` (`ready` se è in gioco un altro incontro o se non era mai partito). Senza tavolino toglie anche l'ultima partita; con un tavolino contro un ritirato annulla anche il ritiro. Su un incontro non concluso toglie l'ultima partita dichiarata oppure, senza partite, il ritiro di uno dei due giocatori. Risponde `{tournament, undone}`, con `undone` uguale a `undoKind` (sotto).

A torneo in corso ogni incontro di `tournament.matches` ha `undoKind` (`result`, `walkover`, `withdrawal`, `game` oppure `null` se non c'è niente da annullare), `canUndo` e `undoProblem` (motivo per cui non si può, per esempio «L'incontro successivo è già iniziato.», altrimenti `null`); ogni iscritto di `players` ha `withdrawn`.

Girone all'italiana (`format: 'round_robin'`). Opzioni: `legs` (`single` solo andata, predefinito; `double` andata e ritorno), `draws` (pareggi ammessi, predefinito `false`), `points` (punti di vittoria, pareggio e sconfitta, `[3, 1, 0]`; interi 0–10 con vittoria > pareggio ≥ sconfitta), `score` (si registra il punteggio di ogni partita, predefinito `false`) e `walkoverScore` (punteggio dell'incontro vinto a tavolino, `[vincitore, perdente]`, predefinito `[1, 0]`; interi 0–99 con vincitore > perdente). `roundSeries` è la serie degli incontri: 1, 3, 5 senza pareggi, oppure con `draws` un numero fisso di partite 1, 2, 3. Una serie non ammessa scelta nella stessa richiesta dà 400; cambiando `draws` o il formato senza `roundSeries` la serie passa alla più vicina (5 → 3 accendendo i pareggi, 2 → 3 spegnendoli). `count` = n(n−1)/2 incontri, il doppio con il ritorno, spareggi esclusi. Gli incontri hanno `bracket` `league`, `round` = giornata, e sono tutti `ready` dall'avvio; al ritorno `playerA` è la testa di serie peggiore (i lati si invertono). In `start/preview`, `start` e nella bozza di `start/draft`, `slots` sono le posizioni nel calendario a rotazione (tutti gli iscritti, senza caselle vuote; senza, l'ordine delle teste di serie): scambiandole cambia il calendario, non le teste di serie, che decidono `playerA` e quindi i lati. `crossings` dà 400. All'avvio `thirdPlace` diventa falso: il podio viene dalla classifica. Il torneo in corso o concluso ha anche `standings`: la classifica calcolata, `[{id, rank, tied, withdrawn, played, won, drawn, lost, gamesFor, gamesAgainst, scoreFor, scoreAgainst, points}]` in ordine (punti, oppure senza pareggi incontri vinti → scontro diretto → differenza partite → partite vinte; con `score` differenza punteggio → punteggio fatto); `tied` vero = ancora pari dopo tutti i criteri, con lo stesso `rank`. I numeri delle righe contano solo il girone; gli spareggi conclusi dividono i pari (e a torneo concluso anche i piazzamenti salvati, sorteggio compreso).

Spareggi del girone. Quando l'ultimo incontro del girone si chiude, ogni gruppo di non ritirati ancora pari che tocca il podio (1°–3°) riceve i suoi incontri di spareggio, creati subito e `ready`: `bracket` `playoff`, `groupNo` = gruppo, `round` = giornata del mini-girone, in fondo all'ordine di gioco (la giornata 1 di tutti i gruppi, poi la 2…). Due pari: un incontro con `roundSeries` e sempre un vincitore (niente pareggio; con i pareggi la serie fissa diventa «al meglio di» dispari: 2 → 3). Tre o più: mini-girone di sola andata con le regole del girone (pareggi e serie fissa compresi) e gli stessi criteri sui soli incontri di spareggio. Da lì `count` comprende gli spareggi. Il torneo ha `playoff` `{status, groups}`: `status` `none` (nessuno spareggio), `playing` (`groups` = `[{players, place, matches}]`, `place` = primo posto in palio, `matches` le chiavi), `draw` (spareggi finiti ma ancora pari sul podio: `groups` = `[{players, place}]` da sorteggiare; il torneo resta in corso) oppure `over` (spareggi giocati, torneo concluso). `POST /api/tournament/draw` `{id, account, combo}` è il sorteggio dell'admin (creatore con la combinazione; 400 «Non serve un sorteggio.» fuori da `draw`): estrae l'ordine di ogni gruppo e conclude il torneo; risponde `{tournament, draw}` con `draw` = `[{place, players}]` nell'ordine estratto. Piazzamenti: i non ritirati nell'ordine della classifica (i pari fuori dal podio a pari merito), poi i ritirati, fuori dal podio e senza premio. «Annulla il risultato» su un incontro del girone: con uno spareggio `playing` o `done` è bloccato («Prima va annullato lo spareggio.»), altrimenti gli spareggi non iniziati si cancellano e si ricreano a girone di nuovo finito; gli incontri di spareggio si annullano come quelli del girone.

Doppia eliminazione (`format: 'double'`). Opzioni: `roundSeries`, `finalSeries` (finali dei due tabelloni), `grandFinal` (`reset` con rivincita, predefinito; `single`; `none`) e `grandSeries` (1, 3, 5 oppure `null` = come le finali; ignorata con `none`); `thirdPlace` è sempre falso. Gli incontri hanno `bracket` `winners` (vincenti), `losers` (perdenti) o `grand` (gran finale, `round` 1; la rivincita è `round` 2 con `fromA` = perdente e `fromB` = vincitore della gran finale). Gli incontri dei perdenti con uno slot che non porterà mai nessuno hanno `bye: true` e si chiudono da soli (non si disegnano). La rivincita ha `status: 'skipped'` («non giocata», senza giocatori né vincitore) se la gran finale la vince chi arriva dai vincenti; annullando la gran finale torna `waiting`. Il torneo si conclude quando tutti gli incontri sono `done` o `skipped`. `count` (in `counts` di `start/check`, in `start/preview` e nel torneo in corso o concluso) è `{min, max}` finché la rivincita è da decidere, altrimenti un intero. `crossings` (`start/preview`, `start`, bozza di `start/draft`) è l'ordine in cui i perdenti dei vincenti entrano nei perdenti, `{<colonna>: [chiavi degli incontri dei vincenti]}` per la colonna 1 e le colonne pari; senza, si usano gli incroci standard; incroci non validi danno 400. `undoProblem` cita il codice dell'incontro dopo già iniziato (per esempio «P2-1 è già iniziato.», «GF2 è già iniziato.»): annullare un risultato richiede che non siano iniziati né l'incontro del vincitore né quello in cui è sceso il perdente. Il ritiro funziona come nell'eliminazione diretta: chi si ritira nei vincenti perde a tavolino, scende nei perdenti e lì perde a tavolino appena l'avversario è noto; in gran finale vince l'altro e, se la rivincita è aperta, va a tavolino anche quella.

**Fine del torneo.** Quando non resta nessun incontro da giocare (dopo `declare`, `walkover` o `withdraw`) il torneo passa a `done` con `finishedAt`. Ogni iscritto di `players` ha `place`: 1° e 2° dalla finale, 3° e 4° dall'incontro per il 3° posto oppure, senza, i due perdenti delle semifinali entrambi 3°; gli altri a pari merito per turno di uscita (5°, 9°, 17°, 33°), un ritirato col posto del turno in cui ha perso a tavolino. Ogni piazzato ha una riga in `tournament_rewards` (titolo copiato, piazzamento, XP, data): con `rewards` attivo 100, 50 e 25 XP a 1°, 2° e 3° (25 a ciascun 3° a pari merito), 0 agli altri e con i premi spenti. Gli XP dei premi si sommano a quelli del profilo (`xp`, livello e titolo) e restano anche dopo l'eliminazione del torneo dall'archivio. Un torneo concluso ha `podium` (`[{id, name, color, place, xp}]` fino al 3° posto, dal migliore) e `matches` senza `undoKind`; non accetta più azioni di gioco o dell'admin (400 «Il torneo è concluso.»), tranne l'eliminazione dall'archivio.

**Estensioni dei tornei.** Ogni torneo ha `addons` (`{id dell'estensione: impostazioni}`, `{}` se nessuna è stata cambiata; si copia nella nuova edizione). `POST /api/tournament/update` accetta `addons` in `changes` (`{id: valore}`): il valore lo controlla l'estensione (`TournamentService.addon_settings`), un'estensione non installata dà 400. A torneo in corso si può solo spegnere un'estensione (`{id: {enabled: false}}`), mai riaccenderla. Le estensioni osservano le partite degli incontri con `TournamentRunService.add_game_listener` (`game_started(info)` all'avvio di RetroArch, `game_ended(info)` alla chiusura, che restituisce `{addon, winner, score}` con `winner` `p1`, `p2` o `null` = pari, `score` `[P1, P2]` o `null`). Con un esito la partita si dichiara da sola, senza combinazione: `lastResult.match.declared` è il risultato di `declare` più `auto` (l'estensione), `replay` (vero se un pari senza pareggi ammessi si rigioca), `gameWinner` (id del vincitore della partita, `null` se pari o da rigiocare) e `gameDraw`; senza esito `declared` è `null` e la partita si dichiara a mano. Con «Registra il punteggio» serve anche `score`, altrimenti si dichiara a mano.

Estensione `autoresult` («Fine partita automatica»): `GET /api/bootstrap` ha `addons.autoresult.tournament` = `{title, games: [{system, game, title, modes: [{id, label, text}]}]}`, i giochi della libreria riconosciuti dalle regole (`rules/*.json`, per hash RetroAchievements). Impostazioni nel torneo: `addons.autoresult` = `{enabled, mode}` (`enabled` predefinito vero, `mode` predefinito il primo tipo di conteggio). Durante la partita legge la memoria con `READ_CORE_RAM` ogni 0,2 s; a fine partita aspetta 3,5 s e chiude RetroArch con `QUIT`. Windjammers (`detect.kind` `sets`): vince chi ha almeno 2 set e più dell'altro (anche 3–2 al sudden death), set 3–3 = pari («draw game»), si legge solo con due giocatori in partita; il punteggio sono i set.

### Salvaschermo

Nelle partite normali col P1 registrato (non nelle sfide trofeo, nelle prove dei core e sulle console PS2, PSP e arcade) RetroArch registra un solo pezzo di 45 secondi, dopo 90 secondi di gioco (comandi di rete `RECORD_REPLAY` e `HALT_REPLAY`). Non si registra se il gioco ha già uno spezzone, né con `ui.screensaver_content` a `covers` o `ui.screensaver_minutes` a 0. A fine partita, se è durata almeno 3 minuti, il pezzo va in fondo alla coda degli spezzoni di tutta la casa (tabella `replays`, file in `saves/replays/` della cartella dei dati). La coda tiene gli ultimi 5: al sesto si cancella il più vecchio.

`GET /api/replays/next` dà lo spezzone mostrato meno di recente, `{id, account, name, color, system, game, title, date, seconds, trophy}`, tra quelli con file, gioco e core presenti. `POST /api/replays/play` `{id}` lo rigioca in RetroArch (`-P`) con audio, trofei e stati automatici spenti, e la scritta «nome · gioco · data» ripetuta in basso; 409 con una partita o un altro spezzone in corso, 400 se lo spezzone non è disponibile. Alla fine del filmato la dashboard chiude RetroArch. In `GET /api/replays/status`, `reason` dice come è finito l'ultimo spezzone: `ended` (filmato finito), `stopped` (`POST /api/replays/stop` o avvio di una partita) o `closed` (RetroArch chiuso da fuori, per esempio con Esc).

### Classifica di casa

`GET /api/leaderboard` restituisce i dati della classifica di «Chi gioca?»:

| Campo | Tipo | Note |
| --- | --- | --- |
| `leaders` | lista | i primi 5 profili per XP (a parità, per ore): `[{id, name, color, avatar, raUser, level, title, xp, hours, played, top}]`; `top` = `{game, seconds}` del gioco più giocato per tempo, oppure `null` |
| `challenge` | oggetto o `null` | sfida della settimana: `{game, week, endsAt, daysLeft, ranking}`; `week` è la data del lunedì, `endsAt` la fine (lunedì dopo, ora locale), `daysLeft` i giorni rimasti (almeno 1), `ranking` i primi 3 per tempo `[{id, name, color, seconds}]`. `null` se nessun profilo ha ancora giocato |
| `lastWinner` | oggetto o `null` | chi ha giocato di più alla sfida della settimana prima: `{id, name, color, game, week, seconds}` |
| `topGames` | lista | i 3 giochi con più tempo di tutti i profili: `[{game, seconds, players}]` (`players` = profili diversi) |
| `games` | oggetto | `{key: gameSummary}` dei giochi citati |

- Il gioco della sfida si estrae alla prima richiesta della settimana (o alla prima partita finita), a caso tra quelli con una partita registrata di un profilo e ancora presenti nella libreria; poi resta in `weekly_challenges` fino a domenica.
- Contano le partite finite (`ended_at`) dentro la settimana; una partita in due conta per entrambi i profili.
- I punti RetroAchievements non sono qui: l'interfaccia li chiede con `GET /api/ra/profile` per i profili con `raUser`.

### Console della riga

Le Impostazioni decidono quali console sono accese per tutti; ogni profilo accende o spegne le console della propria riga delle schede. Una scelta del profilo resta salvata così com'è, anche quando le Impostazioni cambiano; le console che il profilo non ha mai toccato seguono le Impostazioni. La console preferita del profilo (`favConsole`) è sempre nella sua riga: lo decide l'interfaccia. Il riquadro `consoles` arriva con `GET /api/bootstrap` e con la risposta delle due rotte:

```json
{"off": ["snes"], "profiles": {"3": {"add": ["snes"], "remove": ["nes"]}}}
```

- `off`: id delle console spente per tutti, in ordine alfabetico. Una console senza giochi o non più nella libreria può restarci: la scelta vale di nuovo quando ritorna.
- `profiles`: per ogni profilo (id come testo) le console che ha acceso (`add`) e spento (`remove`). I profili senza scelte non compaiono. Un ospite non ha scelte proprie.
- `POST /api/consoles/off` sostituisce l'elenco delle console spente (al massimo 500 id); le scelte dei profili restano.
- `POST /api/consoles/row` accende (`on: true`) o spegne (`on: false`) la console nella riga del profilo; ripetere la stessa scelta non cambia nulla.
- Le scelte di un profilo si cancellano insieme al profilo.
- 400: elenco non valido, id di console vuoto, troppo lungo (oltre 64 caratteri) o non testuale, `on` non booleano, profilo inesistente.

### Giochi giocati e playlist

`GET /api/profiles/played?id=` restituisce le chiavi `<system>/<id>` dei giochi con almeno una partita registrata del profilo: servono al filtro «Stato» (mai giocati / già giocati) della libreria.

- 400: `id` mancante o profilo inesistente.

Le playlist sono condivise tra tutti i profili. Ognuna ha dei filtri salvati e dei giochi aggiunti a mano, entrambi facoltativi: un gioco ne fa parte se è stato aggiunto a mano oppure se rispetta i filtri (quando ce ne sono). I filtri li applica l'interfaccia; il backend li controlla e li salva. Tutte le rotte rispondono con l'elenco completo (`playlists`):

```json
{
  "playlists": [
    {"id": 1, "name": "Picchiaduro a 2", "filters": {"genre": ["Picchiaduro"], "players": "2"}, "games": ["arcade/sf2.zip"]}
  ],
  "games": {"arcade/sf2.zip": {"system": "arcade", "id": "sf2.zip", "title": "Street Fighter II", "...": "gameSummary"}}
}
```

| Filtro | Tipo | Note |
| --- | --- | --- |
| `title` | testo | parole cercate nel titolo, al massimo 40 caratteri; una parola che inizia con `-` esclude i titoli che la contengono |
| `genre`, `region`, `language`, `year`, `developer`, `publisher`, `kind`, `achievements` | lista di testi | valori dei metadati; `__none__` = «Non indicato»; tra i valori dello stesso campo vale «o». `kind`: `original`, `hack`, `translation`, `prototype`, `homebrew`, `unreleased`, `bootleg`, `unlicensed`, `demo`; `achievements`: `yes`, `no` |
| `exclude` | lista di testi | campi tra quelli sopra in cui i valori scelti escludono i giochi invece di includerli; restano solo i campi attivi |
| `players` | testo o `null` | almeno `2`, `3` o `4` giocatori, oppure `__none__` |
| `played` | testo o `null` | `never` (mai giocati) o `played` (già giocati) dal profilo del P1 |

Tra campi diversi vale «e». I campi vuoti si tolgono: `{}` vuol dire nessun filtro.

- `POST /api/playlists` crea una playlist; il nome (da 1 a 32 caratteri, spazi in eccesso tolti) è unico senza distinguere maiuscole e minuscole.
- `POST /api/playlists/update` cambia `name` e/o `filters` (`{}` li toglie tutti).
- `POST /api/playlists/game` aggiunge (`on: true`) o toglie (`on: false`) un gioco; ripetere la stessa operazione non cambia nulla.
- 400: nome vuoto o troppo lungo, filtro sconosciuto o valore non valido, playlist inesistente, gioco da aggiungere non presente nella libreria (togliere un gioco non più presente è sempre possibile).
- 409: `{"error": "Esiste già una playlist con questo nome."}`.

### RetroAchievements

Le risposte non contengono mai la chiave Web API, i token o le password: della chiave si vedono solo `set` e gli ultimi 4 caratteri (`last4`), dei profili solo il nome utente (`raUser` nell'`account`).

- `POST /api/ra/key`: la chiave (lettere e numeri, 16–64 caratteri, da retroachievements.org → Impostazioni → Keys) è unica per la dashboard. Prima di salvarla si prova con `API_GetConsoleIDs`. 400 se il formato è sbagliato o RetroAchievements la rifiuta; 502 senza rete. Sta nella tabella `settings` come chiave interna (`retroachievements.api_key`), che `GET /api/settings` non restituisce.
- `POST /api/ra/link`: accede a RetroAchievements con nome utente e password (`dorequest.php?r=login2`, come RetroArch) e salva nome utente e token del profilo. La password non si salva e non si scrive nel log. 400: profilo inesistente, nome utente non valido, password vuota o credenziali rifiutate; 502 senza rete.
- `POST /api/ra/unlink`: cancella nome utente e token del profilo.

**In partita.** A ogni avvio il file `--appendconfig` (ora con permessi `600`) riceve, solo se il `retroarch.cfg` le contiene:
- con il profilo P1 collegato: `cheevos_enable = "true"`, `cheevos_username`, `cheevos_token`, `cheevos_password = ""`, `cheevos_hardcore_mode_enable = "false"` (con l'hardcore gli stati, e quindi «Riprendi», non funzionano), `cheevos_start_active = "false"`, `cheevos_test_unofficial = "false"`;
- altrimenti `cheevos_enable = "false"`.

Durante la partita il backend legge dal log di RetroArch il gioco riconosciuto (`Identified game`), l'hash e i trofei sbloccati (`Awarding achievement <id>: <titolo>`). A fine partita il gioco si memorizza per quel file e i trofei vanno a tutti i profili presenti (tabella `ra_unlocks`); sul sito restano solo sull'account del P1. Il risultato della partita (`lastResult`) ha `achievements: {unlocks: [{id, title, at}], earner}`, con `earner` = id del P1 collegato oppure `null`.

**Riconoscimento dei giochi.** Il gioco RetroAchievements di un file si ricava, in ordine: da quanto memorizzato (dal log o da un hash già trovato); dall'hash calcolato come rcheevos (`ra_hash.py`: console a cartuccia e arcade, anche dentro `zip`) cercato negli elenchi dei giochi della console (`API_GetGameList` con gli hash, in cache per 3 giorni in `<data_dir>/retroachievements/`). Dischi e `7z` si riconoscono solo dopo la prima partita. Con la chiave, `GET /api/games` controlla in background i file della console che non hanno ancora un responso: un hash trovato si memorizza come `found`, uno non trovato come `unknown` con la data, e si ricontrolla quando l'elenco della console in cache è più recente. Il responso del log non si sovrascrive. I file ancora da controllare si contano in `pending`; dopo un errore di rete il controllo della console si ritenta dopo 5 minuti.

`GET /api/ra/game` (`raGame`):

```json
{"status": "ok", "message": null, "user": "Player1",
 "game": {"id": 1770, "title": "The Jungle Book", "console": "NES/Famicom", "total": 37, "earned": 1,
          "points": 375, "earnedPoints": 10},
 "achievements": [{"id": 12345, "title": "Jungle by Day", "description": "Beat level 1.", "points": 10,
                   "badge": "54321", "unlocked": true, "unlockedAt": "2026-10-01 17:00:00"}]}
```

- `status`: `ok`; `no_key` (manca la chiave); `unknown` (gioco non riconosciuto, oppure disco o `7z` non ancora giocato); `unsupported` (versione del file non supportata da RetroAchievements); `offline`. Tranne `ok`, `message` spiega il motivo e `achievements` è vuoto.
- `user` e i trofei sbloccati sono quelli del profilo `account`, se collegato; senza account si vedono solo i trofei del gioco.
- Le risposte della Web API restano in cache 5 minuti; la cache si svuota a fine partita e quando cambiano chiave o account.

`GET /api/ra/profile` (`raProfile`): `{user, status, message, summary, recent, session}`.
- `status`: `ok`, `not_linked`, `no_key`, `offline`;
- `summary`: `{points, softcorePoints, rank, totalRanked, motto}` dal sito (`API_GetUserSummary`);
- `recent`: ultimi 10 trofei del sito `[{id, title, description, points, badge, game, at}]`;
- `session`: ultimi 20 trofei sbloccati in partita salvati in locale `[{sessionId, achievementId, title, raGameId, earnerId, earnerName, at, system, game, coop}]`. `coop` è vero per i trofei vinti come P2: sul sito li ha ricevuti `earnerName`.

`GET /api/ra/profile/games` (`raProfileGames`): giochi in cui l'account collegato al profilo ha preso trofei, anche fuori da Pixel Arcade (`API_GetUserCompletionProgress`), 30 per volta: `{user, status, message, games, total, offset, more}`.
- `status` come in `raProfile`;
- `games`: `[{id, title, console, icon, earned, total, lastAt}]` nell'ordine del sito; `id` è l'id del gioco su RetroAchievements, `icon` il nome per `/api/ra/icon` (o `null`), `earned` i trofei presi su `total`;
- `offset=` salta i primi giochi (pagina successiva: `offset + games.length`); `more` è vero se ce ne sono altri.

`GET /api/ra/profile/game?account=&id=`: tutti i trofei del gioco RetroAchievements `id`, con quelli presi dall'account del profilo, nello stesso formato di `GET /api/ra/game` (`{user, status, message, game, achievements}`). 400 per un profilo o un `id` non validi.

`GET /api/ra/icon`: icona del gioco (`icon` di `raProfileGames`), scaricata da `media.retroachievements.org` e tenuta in cache in `<data_dir>/retroachievements/icons/`. 400 per un nome non valido.

`GET /api/ra/badge`: badge del trofeo (`badge` delle risposte), scaricato da `media.retroachievements.org` e tenuto in cache in `<data_dir>/retroachievements/badges/`; `locked=1` per la versione in grigio. 400 per un nome non valido.

### Salvataggi per profilo

All'uscita da un gioco ogni profilo in partita (non gli ospiti) riceve il «Riprendi» (slot 0): lo stato automatico che RetroArch scrive chiudendo, con la sua miniatura. Serve una partita di almeno 20 s; con RetroArch chiuso a forza (SIGKILL) lo stato non c'è e il «Riprendi» resta quello precedente. Il salvataggio interno del gioco (batteria, memory card) appartiene al profilo del P1; con un ospite come P1 si usa una cartella comune. Anche le memory card che un core tiene nella cartella di sistema di RetroArch (pcsx2: `pcsx2/memcards/`, `saves.SYSTEM_SAVES`) appartengono al P1, una coppia per profilo per tutti i giochi del core.

`GET /api/saves/game?system=&game=&accounts=<id,id>` dà gli slot del gioco dei profili indicati e i salvataggi condivisi del gioco: `{"accounts": [{"id", "slots": [{"slot", "core", "name", "protected", "updatedAt", "thumb", "loadable", "shared"}]}], "shared": [{"id", "title", "description"}]}`. `shared` dello slot è `{"id", "title"}` del salvataggio condiviso da cui è nato (`title` `null` se è stato eliminato), oppure `null`; `shared` della risposta è vuota senza l'estensione `shared-saves`. `accounts` può essere vuoto.

`GET /api/saves?account=<id>` elenca i giochi con salvataggi del profilo, dal più recente. Ogni `saveGame` ha i campi del `gameSummary` più:

| Campo | Tipo | Note |
| --- | --- | --- |
| `slots` | intero | slot salvati, «Riprendi» compreso |
| `resumeAt` | data ISO o `null` | data del «Riprendi» |
| `updatedAt` | data ISO | ultimo slot aggiornato |
| `thumb` | booleano | il «Riprendi» ha la miniatura |

`GET /api/saves/thumb?account=&system=&game=&slot=` restituisce la miniatura PNG dello slot (0–9); 404 se manca.

- 400: profilo assente o inesistente, slot fuori da 0–9, console o gioco mancanti.

### Salvataggi condivisi (estensione `shared-saves`)

Rotte sotto `/api/addons/shared-saves/` (README, «Salvataggi condivisi»). Le risposte di `settings`, `create`, `update` e `delete` sono come `GET settings`; gli errori sono 400 con il messaggio, 404 per un gioco che non c'è.

- `GET settings`: `{"root", "value", "default", "mymcplus", "saves", "titleMax", "descriptionMax"}`. `root` è la cartella in uso, `value` quella impostata (vuota = `default`, `<data-dir>/shared-saves`), `mymcplus` vero se i salvataggi PS2 esportati si possono importare; `saves` = `[{"system", "systemName", "game", "gameTitle", "id", "title", "description", "files"}]`, letti ogni volta dal disco.
- `POST settings` `{"root"}`: cambia la cartella (impostazione `addons.shared-saves.root`). 400 se il percorso è un file.
- `POST create` `{"path", "system", "game", "title", "description"}`: crea il salvataggio da una copia del file `path` del disco della console (percorso assoluto, scelto col selettore di `GET /api/files`; niente collegamenti, non vuoto, al massimo 16 MB). La risposta ha in più `id` (nome della cartella) e `note` (per la PS2 la cartella importata nella memory card, per esempio `BASLUS-21059`, altrimenti `null`).
- `POST update` `{"system", "game", "id", "title", "description"}`: cambia titolo e descrizione (`info.json`); la cartella resta, così gli slot nati da lì la ritrovano.
- `POST delete` `{"system", "game", "id"}`: elimina la cartella del salvataggio.

### Salvataggi in partita (salvataggi 04)

Durante la partita la dashboard legge i joypad con un timer (anche con RetroArch in primo piano). Quando un giocatore tiene premuta la combinazione `saveCombo` (impostazione `input.save_combo`, predefinita `["select", "lt"]`, due tasti logici diversi e mai START+SELECT) chiama `POST /api/ingame/open` con il suo slot. Il servizio mette in pausa RetroArch con i comandi di rete (`retroarch.network_port`, predefinita 55355) e apre una finestra di Chrome con un profilo suo (`<data-dir>/chrome-overlay`) sull'indirizzo `/?overlay=1`, che mostra solo la modale dei salvataggi di quel giocatore.

`menu` in `run` è `{open, kind, slot, account, other, undo, busy, shot, players, locked, temp}`: `kind` è `saves` (salvataggi) o `controls` (finestra «Comandi», vedi sotto), `slot` è il giocatore che l'ha aperta, `account` il suo profilo (`null` per un ospite, che non ha salvataggi), `busy` è vero durante un'operazione, `shot` cambia a ogni cattura dello schermo (`null` se non c'è).

All'apertura, con il gioco in pausa, il servizio cattura lo schermo (`SCREENSHOT`, nella cartella di sessione): `GET /api/ingame/shot` la restituisce (404 se manca) ed è lo sfondo della modale. Se RetroArch non scrive la miniatura di uno stato entro 3 s, lo slot riceve la cattura come miniatura.

- `open`: ignorata (risponde con `run`) se la fase non è `running` o il menu è già aperto; 502 se RetroArch non va in pausa o la finestra non si apre (il gioco riprende).
- `save`: RetroArch salva nello slot 0 di lavoro (`<nome>.state` nella cartella di sessione, con `SAVE_STATE`); stato e miniatura si copiano nello slot del profilo. `slots` sono gli slot del profilo come in `GET /api/saves/game`.
- `load`: lo slot del profilo si copia nello slot di lavoro, RetroArch lo carica con `LOAD_STATE`, poi il menu si chiude e il gioco riprende. Il `LOAD_STATE` parte almeno 1 s dopo lo stato di riserva: mandato entro 0,2 s da un `SAVE_STATE`, RetroArch lo scarta senza avvisi.
- `close`: la finestra si chiude; RetroArch riprende da solo tornando in primo piano, altrimenti riceve `PAUSE_TOGGLE`.
- 400: slot non valido; 409: menu non aperto, un'altra operazione in corso; 400 anche per un ospite, uno slot vuoto o uno stato creato con un altro core. Un errore lascia il gioco in pausa e il menu aperto.
- Incontri di torneo: con i salvataggi bloccati `locked` è vero e `save`, `load`, `undo` e `GET /api/ingame/slots` danno 400; il menu offre solo «Torna al gioco» (`close`) ed «Esci» (`POST /api/ingame/quit`, che chiude la finestra e manda `QUIT` a RetroArch). Senza blocco `temp` è vero: `save` e `load` usano slot temporanei dell'incontro (`<data-dir>/match-<id>/`, cancellati a fine incontro e al riavvio del servizio), mai quelli dei profili; `GET /api/ingame/slots` li elenca (`{slots}` come sopra) e `GET /api/ingame/thumb?slot=` ne dà la miniatura. Niente copia all'altro giocatore (`other` `null`).

File su disco: `<data-dir>/saves/<id profilo|ospiti>/<SHA-1 di "system/id">/` con `slotN.state`, `slotN.png` e `sram/`.

Chiavi trovate nel `retroarch.cfg` della console: da verificare sulla console (il file non è raggiungibile dal montaggio del workspace); il log di RetroArch (`--verbose`) riporta i valori caricati.

### Salvataggi di soccorso

Contro i giochi bloccati (per esempio a schermo nero), che all'uscita sovrascriverebbero il «Riprendi».

**Stati periodici.** Durante una partita normale (non di prova) `RescueService` salva uno stato ogni `periodic_save` secondi (opzione della pagina «Configurazione», sotto). Il tempo conta solo con il menu dei salvataggi chiuso e senza un «Riprendi» ancora da caricare. Lo stato si salva nello slot di lavoro con `SAVE_STATE`, come nel menu in partita, e si sposta in `<data-dir>/saves/rescue/_run/`; restano gli ultimi 5.

**Combinazione di emergenza** (`rescueCombo`, impostazione `input.rescue_combo`, predefinita `["select", "rt"]`, stesse regole di `input.save_combo`, diversa da lei, altrimenti 400). Tenuta per 2 s da un giocatore qualsiasi (1 s se usa il tasto da tenere dell'uscita della partita, così la richiesta arriva prima che RetroArch esca da solo dopo 2 s), il frontend chiama `POST /api/run/rescue`: RetroArch riceve `QUIT` e, se non esce entro qualche secondo, viene chiuso. 409 senza partita.

**Fine partita.** Se la partita è finita con la combinazione (`reason: "combo"`), lo stato automatico non diventa il «Riprendi» e la fase diventa `rescue`. Dopo un'uscita normale la fase è `rescue` con `reason: "suspect"` se la miniatura finale è quasi tutta nera (98% dei pixel sotto il livello 24), oppure se è uguale a quelle degli ultimi 2 stati periodici. Il frontend chiede allora «Il gioco era bloccato?»: «No» risponde `final`. Altrimenti il «Riprendi» si salva come sempre e gli stati periodici della partita prendono il posto di quelli conservati.

`items` sono `[{id, at, thumb, run, tried}]`, dal più recente: `r<n>` sono gli stati di questa partita (`run` vero), `s<n>` quelli conservati dalla partita precedente; `tried` è vero per uno stato già scelto in un soccorso. `final` è vero se c'è lo stato finale. `GET /api/run/rescue/thumb?item=<id|final>` dà la miniatura (404 se manca).

`POST /api/run/rescue/answer` `{choice}`:
- un id: la partita riparte subito da quello stato, con gli stessi giocatori e joypad (come `resume` in `POST /api/launch`). Il «Riprendi» non cambia. Tutte le voci restano conservate (al massimo 10, sempre con quella scelta), con la scelta segnata `tried`. Se lo stato funziona, all'uscita il «Riprendi» si salva come sempre; se è bloccato anche lui, la combinazione di emergenza riapre la scelta con tutte le voci;
- `final`: come una partita finita bene;
- `previous`: il «Riprendi» resta com'era e gli stati conservati non cambiano.

Con `final` e `previous` la risposta porta la fase a `idle`; con un id risponde come `POST /api/launch` (errori compresi). 400 per una scelta che non esiste, 409 senza soccorso aperto. `POST /api/stop` durante il soccorso vale `previous`.

File: `<data-dir>/saves/rescue/<SHA-1 di "system/id">/` con `meta.json` (`[{id, at, core, thumb, tried}]`) e gli stati `.state` e `.png`.

### Configurazione dei giochi

Pagina «Configurazione» per console (Impostazioni → Console → finestra della console → «Configurazione…») e per gioco (azione «⚙ Configura» del gioco): opzioni di RetroArch e del core in quattro sezioni, **Grafica**, **Latenza**, **Audio**, **Emulazione**. Ogni modifica si salva subito e vale dalla prossima partita. Il gioco vince sulla console, la console sul predefinito.

- **Opzioni di RetroArch** (`gameconfig.RETROARCH_OPTIONS`): si mostrano solo le chiavi presenti nel `retroarch.cfg` della console; il predefinito è il valore del `retroarch.cfg`. Nella Grafica c'è anche lo **shader**, scelto tra i preset della cartella `shaders/` del formato del driver (`shaders_glsl/*.glslp` con `gl`, `shaders_slang/*.slangp` con `glcore` e `vulkan`). Il driver video si sceglie tra `gl`, `glcore` e `vulkan` (provati il 17 ottobre 2026).
- **Opzioni del core**: tutte quelle che il core dichiara, lette dal core stesso in un processo a parte (`core_options.py`; i core che le dichiarano solo con un gioco si leggono con un gioco della console), conservate in `<data_dir>/core-options/` finché il file del core non cambia; nomi e valori in italiano se il core è tradotto. La sezione viene dalla categoria del core oppure da chiave e nome; le DIP switch di FBNeo, diverse per ogni gioco, non compaiono. Nella pagina della console si sceglie il core (riga «Core»); in quella del gioco vale il suo core (quello associato, altrimenti il primo installato).

**Grafica a livelli.** Console 3D (con un core in `gameconfig.CORE_DETAIL`: Beetle PSX HW, Beetle PSX, PCSX-ReARMed, Mupen64Plus-Next, Play!): `original`, `enhanced` (*Migliorata*), `max` (*Massima*). Altre console: `original`, `soft` (*Morbida*, `video_smooth = "true"`), `smooth` (*Smooth*, più lo shader `xbr/xbr-lv2` del formato del driver). Un livello dà il valore di ogni opzione grafica; quelle che non tocca restano al predefinito. Per l'N64 (Mupen64Plus-Next) tutti e tre i livelli usano il renderer ParaLLEl-RDP (`mupen64plus-rdp-plugin = "parallel"`, a 1x, 2x e 4x) con il driver `vulkan`: GLideN64 non disegna il riquadro dell'oggetto di Mario Kart 64 in due giocatori (6 novembre 2026).

**Personalizzata.** Cambiare un'opzione grafica crea la Personalizzata dell'ambito (console o gioco), che parte dai valori in uso. Ce n'è una per ambito: resta salvata anche scegliendo un livello, e crearne un'altra quando c'è già risponde `{confirm: testo}` finché non si ripete con `confirm: true`. Se torna uguale a un livello (per tutti i core installati della console) sparisce e resta quel livello; per un gioco, se il livello è quello della console, il gioco torna a seguire la console. `POST /api/config/promote` porta la Personalizzata del gioco sulla console (con `{confirm}` se la console ne ha una diversa) e il gioco torna a seguire la console.

**Latenza, Audio, Emulazione**: opzioni singole, senza livelli. Nell'Emulazione il gruppo «Pixel Arcade» ha `periodic_save` (*Salvataggio periodico*, `source: dashboard`). I valori sono 0 (spento), 60, 120, 180, 300 e 600 secondi; il predefinito è 300 per ps2 e n64 e 60 per le altre console. C'è anche `quit_combo` (*Uscita dal gioco*, `source: dashboard`): `hold_start`, `hold_select` o `start_select`, scritta come `input_quit_gamepad_combo` all'avvio; il predefinito è l'impostazione `input.quit_combo`.

**Margine per la TV**: nella Grafica, `tv_margin` (`source: dashboard`, gruppo «Pixel Arcade») si sceglie solo per gioco: la pagina della console non lo mostra e `POST /api/config/option` lo rifiuta senza `id` (400). Valori da 0 (nessuno) a 10, in percentuale per lato. Non fa parte dei livelli: cambiarlo non crea né tocca la Personalizzata. All'avvio, sopra lo 0, l'area dell'immagine si riduce di quella percentuale su ogni lato, nel formato scelto (4:3, 16:9, 5:4; «Dal core» e «Pixel quadrati» valgono 4:3, «Schermo intero» usa tutta l'area rimasta), e va al centro: nel file `--appendconfig` vanno `aspect_ratio_index = "23"`, `video_scale_integer = "false"`, `custom_viewport_width` e `_height`, calcolati sulla risoluzione dello schermo letta con `xrandr --current`, e `custom_viewport_x` e `_y` a 0. Dalla 1.22 RetroArch centra da sé l'area personalizzata (spazio libero × `video_viewport_bias_x`/`_y`, 0,5) e usa `_x` e `_y` come spostamento in più: con la posizione assoluta l'immagine finiva in basso a destra (provato il 6 novembre 2026 sulla console, RetroArch 1.22.2). Se la risoluzione non si legge, il margine non si applica.

`config` è `{system, id, core, cores, family, levels: [{id, label, note}], mode, custom, consoleMode, coreOptions, sections: [{id, label, options: [{source, key, label, info, group, values: [{value, label}], value, origin}]}]}`:
- `mode`: livello, `custom`, oppure (gioco) `null` = come la console; `consoleMode` è il livello o `custom` della console; `custom` vero se l'ambito ha una Personalizzata salvata;
- `cores`: core installati della console tra cui scegliere (per un gioco solo il suo); `coreOptions` falso se le opzioni del core non si leggono;
- `source`: `retroarch`, `core` o `dashboard`; `origin`: `level`, `custom` (cambiata dalla Personalizzata), `game`, `console` o `default`.

`POST /api/config/option` con `value = null` riporta l'opzione all'origine (nella Grafica al valore del livello di partenza). `POST /api/config/level` con `level = null` (solo gioco) torna a seguire la console, `custom` riprende la Personalizzata salvata. 400 per opzioni, valori o livelli non ammessi; 404 se la console non esiste.

**All'avvio** (anche per ogni core provato durante la ricerca) la dashboard scrive le chiavi di RetroArch nel file `--appendconfig` e passa lo shader con `--set-shader` (solo se il preset esiste ed è del formato del driver; lo shader CRT del profilo vince). Nel `.opt` del core, `<cartella di RetroArch>/config/<library_name>/<library_name>.opt` (e in quello del gioco se esiste già; con `global_core_options = "true"` in `core_options_path` o `retroarch-core-options.cfg`), scrive tutte le opzioni note del core con i valori della pagina: un core può servire più console, quindi nessun valore resta da una console all'altra. Le altre righe restano. La prima volta lascia accanto la copia `<file>.opt.bak-pixel-arcade`. Un errore nella configurazione non ferma l'avvio.

Tabella `game_config` (migrazione 0013, che porta i livelli della tabella `graphics` precedente: il dettaglio 3D se migliorato, altrimenti il livello dell'immagine).

`config` ha anche `bios: {status, label}`, il riassunto della riga «BIOS» dell'Emulazione per il core della pagina (`status`: `none`, `ok`, `present` o `missing` se manca un file obbligatorio).

### BIOS

Pagina «BIOS» di una console (Impostazioni → Console → finestra della console → «BIOS…», riga «BIOS» nell'Emulazione della pagina «Configurazione», avviso prima di giocare). Si sceglie un file dove si trova, con il selettore dei file; la dashboard lo **copia** (l'originale resta) nella cartella di sistema di RetroArch con il nome atteso.

**Cartella di sistema.** È `system_directory` del `retroarch.cfg` (`~` è la cartella che contiene `.config/retroarch`, per la snap `~/snap/retroarch/common`; vuoto o `default` = `<cartella di RetroArch>/system`). Con `systemfiles_in_content_dir = "true"` RetroArch dà ai core la cartella del gioco (log della console, 17 ottobre 2026): per questo il file `--appendconfig` di ogni avvio contiene `system_directory` assoluto e `systemfiles_in_content_dir = "false"`. I core arcade (FBNeo, MAME) cercano comunque i loro BIOS (per esempio `neogeo.zip`) anche accanto ai giochi.

**Quali file.** Per ogni core della console con un `.info` (`bios.BiosService.core_files`):
- `info`: i file del `.info` (`firmwareN_path`, `firmwareN_opt` = facoltativo, MD5 dalle note `(!) nome (md5): …`); un percorso senza estensione o descritto come «folder» è una cartella in cui va un file di nome qualsiasi (`pcsx2/bios`), e i suoi file compaiono come `folderFile`. Come righe `info` compaiono anche i file che un core usa ma che il suo `.info` non nomina (`bios.EXTRA_FIRMWARE`: per `ppsspp` `PPSSPP/ppge_atlas.meta`, obbligatorio, senza il quale le finestre di sistema della PSP restano senza testo);
- `option`: i valori che sono nomi di file delle opzioni del core che parlano di BIOS (solo core installati, senza checksum);
- `manual`: file aggiunti a mano per quel core, in una cartella e con un nome scelti; la dashboard non sa se servono.

`bios` è `{system, systemDir, folders, cores: [{core, label, installed, files: [{id, source, path, name, note, required, status, folder, removable}]}]}`: `id` è `<source>:<path>`, `status` è `ok` (MD5 uguale), `present` (c'è, senza MD5 da confrontare, o cartella non vuota), `different` (MD5 diverso) o `missing`; `removable` vero per i file copiati dalla dashboard; `folders` sono le sottocartelle della cartella di sistema (due livelli).

`POST /api/bios/import`: `target` è l'`id` di una riga `info` o `option` (per una cartella il file mantiene il suo nome, oppure `name`), oppure `manual` con `folder` e `name` facoltativi (relativi alla cartella di sistema, senza `..`). `source` è il percorso assoluto del file scelto (al massimo 512 MB). Se il file di destinazione c'è già risponde `{confirm}` finché non si ripete con `confirm: true`. Con un MD5 dichiarato diverso copia lo stesso e `saved.warning` lo dice. Per i file in coppia di `EXTRA_FIRMWARE` (`ppge_atlas.zim` e `ppge_atlas.meta`, della stessa versione) copia anche l'altro se è nella stessa cartella del file scelto, sostituendo senza chiedere quello presente; se non c'è, `saved.warning` dice di sceglierlo dalla sua riga, anche da un'altra cartella. Dopo la copia le opzioni lette del core si rileggono. `POST /api/bios/remove` toglie solo i file copiati dalla dashboard. Durante una partita 409.

`GET /api/bios/check`: `missing` sono i file obbligatori del `.info` che mancano al core del gioco (quello associato, altrimenti il primo installato); la dashboard lo chiede prima di giocare.

`GET /api/files`: contenuto di una cartella in sola lettura, prima le cartelle; `entries` = `[{name, path, dir, size}]` (al massimo 3000, poi `truncated`); senza `hidden=1` i nomi col punto si contano in `hidden`. `roots` sono i punti di partenza esistenti: cartella personale, `/media/<utente>`, `/run/media/<utente>`, cartella dei giochi, `/`. 404 se la cartella non si apre.

Tabella `bios_files` (migrazione 0014): i file copiati, con core, tipo, nome originale, MD5 e misura.

### Comandi dei giochi

Il core comunica a RetroArch il nome di ogni tasto del RetroPad; con `frontend_log_level = 0` e `libretro_log_level = 0` (scritti dalla dashboard nel file `--appendconfig`) RetroArch 1.22.2 li scrive nel log dopo `[Environ] SET_INPUT_DESCRIPTORS.`. Il servizio li legge per P1 e P2 e li conserva per gioco e core. I nomi vengono dal core, non dal gioco (per esempio `Button 1` con MAME 2000, `Cross` con PCSX ReARMed): a ogni azione si può dare un nome scritto a mano.

`controls` è `{core, descriptors, labels, map, confirmed, editable, fixed}`:

- `descriptors` e `labels`: `{p1: {tasto: testo}, p2: …}` con i tasti del RetroPad (`b`, `a`, `y`, `x`, `l`, `r`, `l2`, `r2`, `select`, `start`, `l3`, `r3`); `descriptors` è vuoto se il gioco non è mai stato avviato con quel core;
- `map`: `{p1: {azione: tasto fisico}, p2: …}` per i tasti di `editable` (frontali, dorsali e grilletti); quelli di `fixed` non si riassegnano;
- `confirmed`: vero dopo il primo «Salva».

Le assegnazioni stanno nel file di remap del gioco di RetroArch, `<input_remapping_directory>/<library_name del core>/<file del gioco senza estensione>.rmp`, con le righe `input_player<N>_btn_<tasto fisico> = "<id del tasto>"`; le altre righe del file restano. RetroArch lo legge all'avvio del gioco e non lo riscrive (`remap_save_on_exit = false`).

- `POST /api/game/controls`: `map` contiene solo le differenze dai tasti predefiniti e ogni tasto deve avere una sola azione (le modifiche sono scambi); vale dalla prossima partita. 400 se il gioco non ha ancora i nomi dei tasti o le assegnazioni non sono valide.
- Al primo avvio di un gioco con un core mai confermato, quando arrivano i nomi dei tasti il servizio mette in pausa il gioco e apre la finestra sopra il gioco con `menu.kind = controls`. `POST /api/ingame/controls` salva e conferma: se le assegnazioni sono cambiate RetroArch si chiude con `QUIT` e riparte con lo stesso core, dallo stato automatico appena scritto (la partita continua: una sola sessione, tempo e trofei sommati); altrimenti il gioco riprende. `POST /api/ingame/close` rimanda alla prossima partita. 409 se la finestra non è aperta.
