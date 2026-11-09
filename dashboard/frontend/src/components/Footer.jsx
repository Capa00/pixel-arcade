import FaceButton from './FaceButton.jsx'
import ShoulderButton from './ShoulderButton.jsx'
import styles from './Footer.module.css'

/*
 * Legende per contesto. `face`: posizione del tasto nel rombo; `shoulder`:
 * tasti delle spalle pieni nell'icona (`lb`, `rb`, `lt`, `rt`); `pad` e `key`:
 * tasti scritti per joypad e tastiera (senza uno dei due la voce compare solo
 * per l'altro dispositivo). `command`: tasto logico inviato col clic sulla
 * voce, anche `cmd:<id>` per un comando delle estensioni. `off`: comando non
 * ancora attivo (voce attenuata). Con `face` e `pad` insieme, per il joypad
 * compaiono il tasto frontale e poi le scritte (per esempio «tenuto»).
 */
export const LEGENDS = {
  // Libreria senza giocatori: Y premuto non fa nulla e non compare; tenuto apre «Cosa gioco?». B cancella la ricerca: lo dice l'intestazione della griglia.
  library: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Apri' },
    { id: 'x', face: 'west', key: ['/'], label: 'Filtri', command: 'x' },
    { id: 'random', face: 'north', pad: ['tenuto'], key: ['R'], label: 'Cosa gioco?', command: 'cmd:random-pick' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Console' },
    { id: 'ltrt', shoulder: ['lt', 'rt'], key: ['PagSu', 'PagGiù'], label: 'Lettera' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Giocatori', command: 'start' },
    { id: 'select', pad: ['SELECT'], key: ['F3'], label: 'Impostazioni', command: 'select' },
  ],
  // Libreria con almeno un giocatore: Y salva nei preferiti, SELECT apre il profilo.
  players: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Apri' },
    { id: 'x', face: 'west', key: ['/'], label: 'Filtri', command: 'x' },
    { id: 'y', face: 'north', key: ['P'], label: 'Preferito', command: 'y' },
    { id: 'random', face: 'north', pad: ['tenuto'], key: ['R'], label: 'Cosa gioco?', command: 'cmd:random-pick' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Console' },
    { id: 'ltrt', shoulder: ['lt', 'rt'], key: ['PagSu', 'PagGiù'], label: 'Lettera' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Giocatori', command: 'start' },
    { id: 'select', pad: ['SELECT'], key: ['F3'], label: 'Profilo', command: 'select' },
  ],
  profile: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Seleziona' },
    { id: 'y', face: 'north', key: ['P'], label: 'Togli dai preferiti', command: 'y' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Scheda' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Libreria', command: 'b' },
    { id: 'select', pad: ['SELECT'], key: ['F3'], label: 'Libreria', command: 'select' },
  ],
  // Pagina profilo fuori dalla Panoramica: niente preferiti da togliere.
  profileTab: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Seleziona' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Scheda' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Libreria', command: 'b' },
    { id: 'select', pad: ['SELECT'], key: ['F3'], label: 'Libreria', command: 'select' },
  ],
  // Finestra con tutti i trofei di un gioco nella pagina profilo.
  raGame: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Scorri' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  login: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Conferma' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Annulla', command: 'b' },
  ],
  // «Chi gioca?» con un gioco prenotato dalla classifica: X lo toglie.
  loginReserved: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Conferma' },
    { id: 'x', face: 'west', key: ['/'], label: 'Togli il gioco', command: 'x' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Annulla', command: 'b' },
  ],
  // Classifica accanto a «Chi gioca?»: A apre la persona o prenota il gioco.
  loginBoard: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Scegli' },
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Giochi' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Apri' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Torna alla finestra', command: 'b' },
  ],
  // Scheda di una persona della classifica: ◀ ▶ scorrono le file di card.
  loginPlayer: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Scorri' },
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Giochi' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Scegli' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Classifica', command: 'b' },
  ],
  settings: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Seleziona' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Scheda' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  system: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Seleziona' },
    { id: 'x', face: 'west', key: ['Canc'], label: 'Togli core', command: 'x' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // Finestra di una console delle estensioni nelle Impostazioni.
  consoleSettings: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Seleziona' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // Finestra di una playlist nelle Impostazioni.
  playlist: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Seleziona' },
    { id: 'x', face: 'west', key: ['Canc'], label: 'Togli gioco', command: 'x' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  multipicker: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Seleziona' },
    { id: 'y', face: 'north', key: ['P'], label: 'Tutte', command: 'y' },
    { id: 'x', face: 'west', key: ['/'], label: 'Cerca', command: 'x' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Gruppo' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Aggiungi', command: 'start' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  picker: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Scegli' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // Torneo aperto nelle Impostazioni: B torna all'elenco dei tornei.
  tournament: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Seleziona' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Scheda' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  // Finestra di una serie nelle Impostazioni: le spalle cambiano classifica.
  tournamentSeries: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Seleziona' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Classifica' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Tutte le serie', command: 'b' },
  ],
  // Scheda TOURNAMENT tra le console, prima di entrare: A entra, le spalle cambiano console.
  tournamentTab: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Entra', command: 'a' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Console' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Giocatori', command: 'start' },
    { id: 'select', pad: ['SELECT'], key: ['F3'], label: 'Profilo', command: 'select' },
  ],
  // Dentro la scheda TOURNAMENT con più tornei: ▲ ▼ scelgono il torneo, A apre le azioni di chi preme.
  tournamentList: [
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Torneo' },
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Scorri' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Azioni', command: 'a' },
    { id: 'y', face: 'north', key: ['P'], label: 'Allenati', command: 'y' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  // Elenco dei tornei col torneo in corso selezionato: A apre il tabellone.
  tournamentListRunning: [
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Torneo' },
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Scorri' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Tabellone', command: 'a' },
    { id: 'y', face: 'north', key: ['P'], label: 'Allenati', command: 'y' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  // Tabellone del torneo in corso: la croce sposta il cursore, A apre il menu dell'incontro, Y le informazioni.
  tournamentBracket: [
    { id: 'dpad', pad: ['◀ ▶ ▲ ▼'], key: ['← → ↑ ↓'], label: 'Incontro' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Menu', command: 'a' },
    { id: 'y', face: 'north', key: ['P'], label: 'Info torneo', command: 'y' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  // Tabellone con più sezioni (nella diretta il 3° posto): L1/R1 saltano dall'una all'altra.
  tournamentBracketSections: [
    { id: 'dpad', pad: ['◀ ▶ ▲ ▼'], key: ['← → ↑ ↓'], label: 'Incontro' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Sezione' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Menu', command: 'a' },
    { id: 'y', face: 'north', key: ['P'], label: 'Info torneo', command: 'y' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  // Girone, cursore nel calendario: ▲ ▼ incontri, ◀ ▶ giornate, L1/R1 alla classifica.
  tournamentLeagueCalendar: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Incontro' },
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Giornata' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Classifica' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Menu', command: 'a' },
    { id: 'y', face: 'north', key: ['P'], label: 'Info torneo', command: 'y' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  // Girone, cursore nella classifica: ▲ ▼ giocatori, A i loro incontri, L1/R1 al calendario.
  tournamentLeagueTable: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Giocatore' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Calendario' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Incontri', command: 'a' },
    { id: 'y', face: 'north', key: ['P'], label: 'Info torneo', command: 'y' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  // Incontri del giocatore della classifica: A porta al calendario su quell'incontro.
  tournamentPlayerMatches: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Incontro' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Nel calendario', command: 'a' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Classifica', command: 'b' },
  ],
  // Menu dell'incontro nel tabellone.
  tournamentMatchMenu: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Voce' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Scegli', command: 'a' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // Schermata «Incontro», assegnazione del joypad di P1: START dal joypad che lo prende, B torna al tabellone.
  matchPick: [
    { id: 'start', pad: ['START'], label: 'Joypad di P1' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Tabellone', command: 'b' },
  ],
  // Con i lati liberi ◀ ▶ scambiano i lati prima dell'assegnazione.
  matchPickFree: [
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Scambia i lati' },
    { id: 'start', pad: ['START'], label: 'Joypad di P1' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Tabellone', command: 'b' },
  ],
  // A incontro iniziato B chiede se sospendere.
  matchPickSuspend: [
    { id: 'start', pad: ['START'], label: 'Joypad di P1' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Sospendi', command: 'b' },
  ],
  matchPickFreeSuspend: [
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Scambia i lati' },
    { id: 'start', pad: ['START'], label: 'Joypad di P1' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Sospendi', command: 'b' },
  ],
  // Assegnazione del joypad di P2: SELECT torna a P1.
  matchPick2: [
    { id: 'start', pad: ['START'], label: 'Joypad di P2' },
    { id: 'select', pad: ['SELECT'], label: 'Torna a P1' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Tabellone', command: 'b' },
  ],
  matchPick2Suspend: [
    { id: 'start', pad: ['START'], label: 'Joypad di P2' },
    { id: 'select', pad: ['SELECT'], label: 'Torna a P1' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Sospendi', command: 'b' },
  ],
  // Prova dei tasti: ○ del joypad si accende soltanto, il tabellone resta a Esc.
  matchTest: [
    { id: 'start', pad: ['START'], label: 'Pronto' },
    { id: 'select', pad: ['SELECT'], label: 'Annulla' },
    { id: 'b', key: ['Esc'], label: 'Tabellone', command: 'b' },
  ],
  matchTestSuspend: [
    { id: 'start', pad: ['START'], label: 'Pronto' },
    { id: 'select', pad: ['SELECT'], label: 'Annulla' },
    { id: 'b', key: ['Esc'], label: 'Sospendi', command: 'b' },
  ],
  // «Chi ha vinto la partita N?»: la croce sceglie, A dichiara (l'admin), B chiede se sospendere.
  matchDeclare: [
    { id: 'dir', pad: ['◀ ▶ ▼'], key: ['← → ↓'], label: 'Scegli' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Dichiara', command: 'a' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Sospendi', command: 'b' },
  ],
  // Dichiarazione nel girone con i pareggi: ◀ ▶ anche sul pareggio in mezzo.
  matchDeclareDraw: [
    { id: 'dir', pad: ['◀ ▶ ▼'], key: ['← → ↓'], label: 'Vincitore o pareggio' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Dichiara', command: 'a' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Sospendi', command: 'b' },
  ],
  // Punteggio della partita: ▲ ▼ cambiano il numero, ◀ ▶ passano all'altro giocatore.
  matchScore: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Punteggio' },
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Giocatore' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Conferma', command: 'a' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  // «<Nome> vince l'incontro»: A torna al tabellone.
  matchWon: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Tabellone', command: 'a' },
  ],
  // Finale vinta: A apre il podio.
  matchWonFinal: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Podio', command: 'a' },
  ],
  // Podio del torneo concluso: A chiude e torna alla scheda TOURNAMENT.
  matchPodium: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Chiudi', command: 'a' },
  ],
  // Partite di un incontro: solo da guardare.
  tournamentGames: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Partita' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  // Esito del sorteggio del girone: ▲ ▼ scorrono, A apre il podio.
  tournamentLots: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Scorri' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Podio', command: 'a' },
  ],
  // «Info torneo» aperta dal tabellone: ▲ ▼ scorrono, B torna al tabellone.
  tournamentInfo: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Scorri' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Tabellone', command: 'b' },
  ],
  // Dentro la scheda TOURNAMENT con un solo torneo.
  tournamentDetail: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Scorri' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Azioni', command: 'a' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Classifica' },
    { id: 'y', face: 'north', key: ['P'], label: 'Allenati', command: 'y' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  // Avviso dei tornei all'ingresso di un giocatore: ◀ ▶ scelgono, B vale «No».
  tournamentNotice: [
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Scegli' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Conferma', command: 'a' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'No', command: 'b' },
  ],
  // Combinazione dell'admin del torneo: i tasti fanno parte della sequenza, START conferma, SELECT ricomincia.
  tournamentCombo: [
    { id: 'keys', pad: ['Tasti'], key: ['Tasti'], label: 'Sequenza' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Conferma', command: 'start' },
    { id: 'select', pad: ['SELECT'], key: ['F3'], label: 'Ricomincia', command: 'select' },
  ],
  // Data e ora d'inizio del torneo: ◀ ▶ scelgono la parte, ▲ ▼ cambiano il valore, X toglie la data.
  tournamentDate: [
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Parte' },
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Valore' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Conferma' },
    { id: 'x', face: 'west', key: ['/'], label: 'Nessuna data', command: 'x' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Annulla', command: 'b' },
  ],
  // Scelta del gioco del torneo: LB/RB cambiano console, ◀ ▶ saltano di 10, X cerca nel titolo.
  tournamentGame: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Scegli' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Console' },
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: '10 giochi' },
    { id: 'x', face: 'west', key: ['/'], label: 'Cerca', command: 'x' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // Modale del formato del torneo, sull'elenco dei formati: ▶ o A passano alle opzioni, START conferma.
  tournamentFormat: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Formato' },
    { id: 'a', face: 'south', pad: ['▶'], key: ['Invio', '→'], label: 'Opzioni', command: 'a' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Conferma', command: 'start' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Annulla', command: 'b' },
  ],
  // Modale del formato, sulle opzioni: ◀ ▶ cambiano il valore, B torna all'elenco dei formati.
  tournamentFormatOptions: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Opzione' },
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Valore' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Conferma', command: 'start' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Formati', command: 'b' },
  ],
  // Schermata «Avvia» del torneo, passo 1: ▲ ▼ scelgono il formato, Y apre le opzioni, A o START vanno avanti.
  tournamentStart1: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Formato' },
    { id: 'y', face: 'north', key: ['P'], label: 'Opzioni', command: 'y' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Avanti', command: 'a' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // Passo 1 con una bozza salvata: X ricomincia da capo.
  tournamentStart1Draft: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Formato' },
    { id: 'y', face: 'north', key: ['P'], label: 'Opzioni', command: 'y' },
    { id: 'x', face: 'west', key: ['/'], label: 'Ricomincia', command: 'x' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Avanti', command: 'a' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // Passo 2: A prende il giocatore, X rimescola, START passa all'anteprima.
  tournamentStart2: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Giocatore' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Prendi', command: 'a' },
    { id: 'x', face: 'west', key: ['/'], label: 'Rimescola', command: 'x' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Avanti', command: 'start' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  // Passo 2 con un giocatore preso: ▲ ▼ lo spostano, A lo lascia.
  tournamentStart2Move: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Sposta' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Lascia', command: 'a' },
  ],
  // Passo 3: A segna un giocatore e, su un altro, li scambia; START avvia.
  tournamentStart3: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Giocatore' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Scambia', command: 'a' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Avvia', command: 'start' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  // Passo 3 del girone, sulle posizioni nel calendario: L1/R1 passano all'anteprima del calendario.
  tournamentStart3League: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Giocatore' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Scambia', command: 'a' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Calendario' },
    { id: 'x', face: 'west', key: ['/'], label: 'Ripristina', command: 'x' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Avvia', command: 'start' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  // Passo 3 del girone, nell'anteprima del calendario: ▲ ▼ scorrono gli incontri.
  tournamentStart3LeagueCalendar: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Incontro' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Giocatori' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Avvia', command: 'start' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Giocatori', command: 'b' },
  ],
  // Anteprima con caselle da scambiare in più sezioni: L1/R1 saltano dall'una all'altra.
  tournamentStart3Sections: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Giocatore' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Sezione' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Scambia', command: 'a' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Avvia', command: 'start' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  // Passo 3 della doppia, sui giocatori del 1° turno dei vincenti: ◀ ▶ e L1/R1 portano nel resto del disegno.
  tournamentStart3Double: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Giocatore' },
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Tabellone' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Vincenti/perdenti' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Scambia', command: 'a' },
    { id: 'x', face: 'west', key: ['/'], label: 'Ripristina', command: 'x' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Avvia', command: 'start' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  // Passo 3 della doppia, sul resto del disegno: ✕ scambia gli slot «Perdente di V…» della stessa colonna;
  // tornando al 1° turno dei vincenti si scambiano di nuovo i giocatori. □ ripristina gli incroci standard.
  tournamentStart3Board: [
    { id: 'dpad', pad: ['◀ ▶ ▲ ▼'], key: ['← → ↑ ↓'], label: 'Incontro' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Vincenti/perdenti' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Scambia', command: 'a' },
    { id: 'x', face: 'west', key: ['/'], label: 'Ripristina', command: 'x' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Avvia', command: 'start' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  // «Cosa gioco?»: durante il giro A lo ferma; poi ◀ ▶ scelgono il pulsante e A lo preme; X ripesca.
  randomPickSpin: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Ferma', command: 'a' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  randomPick: [
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Scegli' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Conferma', command: 'a' },
    { id: 'x', face: 'west', key: ['/'], label: 'Ancora', command: 'x' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // Avviso «È pronto il tuo Wrapped»: ◀ ▶ scelgono tra «Guarda» e «Più tardi».
  wrappedNotice: [
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Scegli' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Conferma', command: 'a' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Più tardi', command: 'b' },
  ],
  // Avviso di una Sfida trofeo all'ingresso del P1 (con «Gioca» e «Più tardi»).
  challengeNotice: [
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Scegli' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Conferma', command: 'a' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Più tardi', command: 'b' },
  ],
  // Avviso con il solo «Ok»: sfida senza account RetroAchievements o sfida conclusa.
  challengeInfo: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Ok', command: 'a' },
  ],
  // Schermate del Wrapped.
  wrapped: [
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Scorri' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Avanti', command: 'a' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // Pannello «Filtri» della libreria e delle playlist: X cerca per titolo, Y toglie il filtro della riga.
  filters: [
    { id: 'updown', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Filtro' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Scegli', command: 'a' },
    { id: 'x', face: 'west', key: ['/'], label: 'Cerca titolo', command: 'x' },
    { id: 'y', face: 'north', key: ['P'], label: 'Togli filtro', command: 'y' },
    { id: 'b', face: 'east', pad: ['SELECT'], key: ['Esc', 'F3'], label: 'Chiudi', command: 'b' },
  ],
  // Menu a scelta multipla dei valori di un filtro.
  filterMenu: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Seleziona' },
    { id: 'y', face: 'north', key: ['P'], label: 'Tutte', command: 'y' },
    { id: 'x', face: 'west', key: ['/'], label: 'Cerca', command: 'x' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Gruppo' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Applica', command: 'start' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // Menu «＋ Playlist» del gioco selezionato.
  playlistMenu: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Aggiungi o togli' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // Pagina «Configurazione» di una console o di un gioco: X torna al valore ereditato, Y cerca un'opzione.
  config: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Cambia' },
    { id: 'x', face: 'west', key: ['Canc'], label: 'Predefinito', command: 'x' },
    { id: 'y', face: 'north', key: ['P'], label: 'Cerca', command: 'y' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Sezione' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // Riga «Core» della pagina della console: sinistra e destra cambiano il core.
  configCore: [
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Core' },
    { id: 'y', face: 'north', key: ['P'], label: 'Cerca', command: 'y' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Sezione' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // Menu dei valori di un'opzione della pagina «Configurazione».
  configPicker: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Scegli' },
    { id: 'y', face: 'north', key: ['P'], label: 'Cerca', command: 'y' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // Pagina «BIOS» di una console: A sceglie il file da copiare.
  bios: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Scegli il file' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // Su un file copiato dalla dashboard X lo toglie.
  biosRemove: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Sostituisci' },
    { id: 'x', face: 'west', key: ['Canc'], label: 'Togli', command: 'x' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // Selettore dei file: B sale di una cartella, LB/RB cambiano il punto di partenza, SELECT mostra tutto.
  files: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Apri o scegli' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Su', command: 'b' },
    { id: 'x', face: 'west', key: ['/'], label: 'Cerca', command: 'x' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Posizione' },
    { id: 'select', pad: ['SELECT'], key: ['F3'], label: 'Mostra tutti', command: 'select' },
  ],
  // Selettore con la scelta di più file: A spunta, Y spunta tutta la cartella, START copia.
  filesMulti: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Apri o spunta' },
    { id: 'y', face: 'north', key: ['P'], label: 'Tutti', command: 'y' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Copia', command: 'start' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Su', command: 'b' },
    { id: 'x', face: 'west', key: ['/'], label: 'Cerca', command: 'x' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Posizione' },
    { id: 'select', pad: ['SELECT'], key: ['F3'], label: 'Mostra tutti', command: 'select' },
  ],
  // Finestra «Comandi» di un gioco: A aspetta il nuovo tasto, Y scrive il nome, X torna al tasto predefinito.
  controls: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Cambia tasto' },
    { id: 'y', face: 'north', key: ['P'], label: 'Nome', command: 'y' },
    { id: 'x', face: 'west', key: ['/'], label: 'Predefinito', command: 'x' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Giocatore' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // La stessa finestra sopra il gioco, al primo avvio: B rimanda a una prossima partita.
  controlsGame: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Cambia tasto' },
    { id: 'y', face: 'north', key: ['P'], label: 'Nome', command: 'y' },
    { id: 'x', face: 'west', key: ['/'], label: 'Predefinito', command: 'x' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Giocatore' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Più tardi', command: 'b' },
  ],
  // In attesa del nuovo tasto di un'azione.
  controlsLearn: [
    { id: 'press', pad: ['Tasto'], key: ['Tasto'], label: 'Assegna' },
    { id: 'dpad', pad: ['✛'], key: ['↑ ↓'], label: 'Annulla' },
  ],
  // Modale «Salvataggi» con più giocatori (LB/RB cambiano scheda) o con uno solo.
  saves: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Scegli' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Giocatore' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  savesOne: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Scegli' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // Soccorso dopo un blocco: stato da cui riprendere; B lascia il «Riprendi» com'era.
  rescue: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Riprendi da qui' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Lascia com\'era', command: 'b' },
  ],
  // Modale dei salvataggi in partita (finestra sopra il gioco).
  savesGame: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Scegli' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Torna al gioco', command: 'b' },
  ],
  // Scelta dello slot di destinazione di una copia, in partita.
  savesCopy: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Copia qui' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  // Tastiera a schermo in partita: START del joypad non si usa, si conferma col tasto OK.
  savesKeyboard: [
    { id: 'type', key: ['A–Z'], label: 'Scrivi' },
    { id: 'a', face: 'south', label: 'Digita' },
    { id: 'x', face: 'west', key: ['⌫'], label: 'Cancella', command: 'x' },
    { id: 'y', face: 'north', label: 'Spazio', command: 'y' },
    { id: 'ok', pad: ['OK'], key: ['Invio'], label: 'Conferma' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Annulla', command: 'b' },
  ],
  confirm: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Conferma' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'No', command: 'b' },
  ],
  // Uscita dalle Impostazioni con modifiche: Annulla, Scarta modifiche, Salva modifiche.
  exitSettings: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Conferma' },
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Scegli' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Annulla', command: 'b' },
  ],
  hero: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Conferma' },
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Azioni' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Griglia', command: 'b' },
  ],
  // «Gioca» selezionato: ↓ porta al core, sotto.
  heroPlay: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Gioca' },
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Azioni' },
    { id: 'ud', pad: ['▼'], key: ['↓'], label: 'Core' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Griglia', command: 'b' },
  ],
  // Core selezionato sotto «Gioca»: A apre il menu dei core, ↑ torna a «Gioca».
  heroCore: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Scegli il core' },
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Azioni' },
    { id: 'ud', pad: ['▲'], key: ['↑'], label: 'Gioca' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Griglia', command: 'b' },
  ],
  // Copertina selezionata nella sezione in alto: ← → cambiano immagine, ↑↓ tornano alle azioni.
  heroCover: [
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Copertina / titolo / schermata' },
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Azioni' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Griglia', command: 'b' },
  ],
  // «Scheda» selezionato con la descrizione aperta: ↑↓ la scorrono.
  heroText: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Scheda' },
    { id: 'lr', pad: ['◀ ▶'], key: ['← →'], label: 'Azioni' },
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Scorri' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Griglia', command: 'b' },
  ],
  run: [
    { id: 'b', face: 'east', key: ['Esc'], label: 'Interrompi (due volte)', command: 'b' },
  ],
  verdict: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Sì, funziona', command: 'a' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'No, prova il successivo', command: 'b' },
  ],
  // Modale «Fine partita»: durante l'animazione A e B la saltano, poi chiudono.
  sessionResultAnim: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Salta', command: 'a' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Salta', command: 'b' },
  ],
  sessionResult: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Continua', command: 'a' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Chiudi', command: 'b' },
  ],
  // Scelta dei trofei da sfidare a fine partita.
  challengePicker: [
    { id: 'ud', pad: ['▲ ▼'], key: ['↑ ↓'], label: 'Scegli' },
    { id: 'a', face: 'south', key: ['Invio'], label: 'Spunta / conferma', command: 'a' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Non sfidare', command: 'b' },
  ],
  // Configurazione di un joypad nuovo (src/views/PadSetupLayer.jsx): i tasti li chiede la procedura.
  padSetup: [
    { id: 'esc', key: ['Esc'], label: 'Annulla', command: 'b' },
  ],
  learn: [
    { id: 'hold', face: 'east', label: 'Tieni premuto per annullare', command: 'b' },
    { id: 'esc', key: ['Esc'], label: 'Annulla', command: 'b' },
  ],
  keyboard: [
    { id: 'type', key: ['A–Z'], label: 'Scrivi' },
    { id: 'a', face: 'south', label: 'Digita' },
    { id: 'x', face: 'west', key: ['⌫'], label: 'Cancella', command: 'x' },
    { id: 'y', face: 'north', label: 'Spazio', command: 'y' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], label: 'Cursore ◀ ▶' },
    { id: 'homeend', key: ['Home', 'Fine'], label: 'Inizio/Fine' },
    { id: 'start', pad: ['START'], key: ['Invio'], label: 'Conferma', command: 'start' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Annulla', command: 'b' },
  ],
  // Scheda TUTTE, livello delle marche (`Home` senza giocatori: SELECT apre le Impostazioni).
  allBrands: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Entra' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Console' },
    { id: 'ltrt', shoulder: ['lt', 'rt'], key: ['PagSu', 'PagGiù'], label: 'Marca' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Giocatori', command: 'start' },
    { id: 'select', pad: ['SELECT'], key: ['F3'], label: 'Profilo', command: 'select' },
  ],
  allBrandsHome: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Entra' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Console' },
    { id: 'ltrt', shoulder: ['lt', 'rt'], key: ['PagSu', 'PagGiù'], label: 'Marca' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Giocatori', command: 'start' },
    { id: 'select', pad: ['SELECT'], key: ['F3'], label: 'Impostazioni', command: 'select' },
  ],
  // Scheda TUTTE, console di una marca (solo con un profilo): il tasto ovest accende o spegne la casella
  // della riga, il tasto nord sceglie la console preferita.
  allConsoles: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Apri' },
    { id: 'x', face: 'west', key: ['/'], label: 'Nella riga', command: 'x' },
    { id: 'y', face: 'north', key: ['P'], label: 'Preferita', command: 'y' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Marche', command: 'b' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Console' },
    { id: 'ltrt', shoulder: ['lt', 'rt'], key: ['PagSu', 'PagGiù'], label: 'Marca' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Giocatori', command: 'start' },
    { id: 'select', pad: ['SELECT'], key: ['F3'], label: 'Profilo', command: 'select' },
  ],
  allConsolesGuest: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Apri' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Marche', command: 'b' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Console' },
    { id: 'ltrt', shoulder: ['lt', 'rt'], key: ['PagSu', 'PagGiù'], label: 'Marca' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Giocatori', command: 'start' },
    { id: 'select', pad: ['SELECT'], key: ['F3'], label: 'Profilo', command: 'select' },
  ],
  allConsolesGuestHome: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Apri' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Marche', command: 'b' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Console' },
    { id: 'ltrt', shoulder: ['lt', 'rt'], key: ['PagSu', 'PagGiù'], label: 'Marca' },
    { id: 'start', pad: ['START'], key: ['F2'], label: 'Giocatori', command: 'start' },
    { id: 'select', pad: ['SELECT'], key: ['F3'], label: 'Impostazioni', command: 'select' },
  ],
  // Scheda «Console» delle Impostazioni: prima le marche, poi le console della marca (il tasto ovest le accende o spegne per tutti).
  settingsConsoles: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Entra' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Scheda' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Indietro', command: 'b' },
  ],
  settingsConsolesIn: [
    { id: 'a', face: 'south', key: ['Invio'], label: 'Seleziona' },
    { id: 'x', face: 'west', key: ['/'], label: 'Accendi/spegni', command: 'x' },
    { id: 'b', face: 'east', key: ['Esc'], label: 'Marche', command: 'b' },
    { id: 'lbrb', shoulder: ['lb', 'rb'], key: ['[', ']'], label: 'Scheda' },
  ],
}

// Griglia di una console aperta da TUTTE: come la libreria, con BACK per tornarci.
const BACK_TO_ALL = { id: 'b', face: 'east', key: ['Esc'], label: 'Tutte', command: 'b' }
for (const name of ['library', 'players']) {
  const items = LEGENDS[name]
  const at = items.findIndex((item) => item.id === 'start')
  LEGENDS[`${name}All`] = [...items.slice(0, at), BACK_TO_ALL, ...items.slice(at)]
}

function Keys({ item, keyboard }) {
  if (!keyboard && item.face) {
    return (
      <>
        <FaceButton position={item.face} />
        {(item.pad || []).map((name) => (
          <span key={name} className={styles.pill}>
            {name}
          </span>
        ))}
      </>
    )
  }
  if (!keyboard && item.shoulder) {
    return <ShoulderButton pressed={item.shoulder} />
  }
  return (keyboard ? item.key : item.pad).map((name) => (
    <span key={name} className={styles.pill}>
      {name}
    </span>
  ))
}

/**
 * Barra comandi: legenda del contesto (`context`: `library` senza giocatori, `players` con almeno un
 * giocatore, `profile` nella pagina profilo (`profileTab` fuori dalla Panoramica, `raGame` nella finestra dei trofei di un gioco), `keyboard` per la
 * tastiera a schermo, `login` per le finestre «Chi gioca?» (`loginReserved` con un gioco prenotato, `loginBoard` e `loginPlayer` nella classifica accanto), `settings`, `system` (finestra di una console), `picker`, `multipicker`,
 * `confirm`, `exitSettings` o `learn` nelle Impostazioni, `filters`, `filterMenu` e `playlistMenu` per i filtri e le playlist, `randomPick` e `randomPickSpin` per «Cosa gioco?», `config`, `configCore` e `configPicker` per la pagina «Configurazione», `bios` e `biosRemove` per la pagina «BIOS», `files` e `filesMulti` per il selettore dei file, `controls`, `controlsGame` e `controlsLearn` per la finestra «Comandi», `hero`, `heroCover` e `heroText` nella sezione in alto, `saves` e `savesOne` nella modale dei salvataggi, `rescue` nella scelta del soccorso dopo un blocco, `savesGame` in quella in partita, `savesCopy` e `savesKeyboard` per la copia e il nome di uno slot in partita, `run` e `verdict` durante una partita) con i tasti del dispositivo usato per ultimo
 * (`source`: joypad o tastiera). Per il joypad i tasti frontali e quelli
 * delle spalle sono indicati dalla posizione, non dalla sigla della marca.
 * Le voci con un comando sono cliccabili e inviano quel tasto con
 * `onCommand(button)`. Finché Chrome non vede un joypad (`pads`), invita a
 * premerne un tasto. `legends` sostituisce le legende predefinite (per
 * esempio con quelle delle estensioni, src/addons/registry.js).
 */
export default function Footer({ source, pads, context = 'library', onCommand, legends = LEGENDS }) {
  const keyboard = source === 'keyboard'
  const items = (legends[context] || legends.library).filter((item) =>
    keyboard ? Boolean(item.key) : Boolean(item.face || item.shoulder || item.pad),
  )
  return (
    <footer className={styles.footer}>
      {items.map((item) => {
        const classes = item.off ? `${styles.item} ${styles.off}` : styles.item
        const content = (
          <>
            <Keys item={item} keyboard={keyboard} />
            {item.label}
          </>
        )
        if (item.command && onCommand) {
          return (
            <button key={item.id} type="button" className={`${classes} ${styles.command}`} onClick={() => onCommand(item.command)}>
              {content}
            </button>
          )
        }
        return (
          <span key={item.id} className={classes}>
            {content}
          </span>
        )
      })}
      {!pads && <span className={`${styles.hint} pulse`}>Premi un tasto del joypad</span>}
    </footer>
  )
}
