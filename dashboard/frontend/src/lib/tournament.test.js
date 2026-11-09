import { describe, expect, it } from 'vitest'
import {
  archiveNote,
  hasBoard,
  placeLabel,
  podiumHasXp,
  podiumSteps,
  rewardLine,
  tournamentsLine,
  tabStatus,
  adminMatchItems,
  isWithdrawn,
  rosterNote,
  rosterEntry,
  rosterOrder,
  doubleStanding,
  losersPlaces,
  placesLabel,
  undoText,
  undoneMessage,
  withdrawCandidates,
  withdrawText,
  adminPress,
  moveDeclare,
  declareBody,
  scoreProblem,
  startScore,
  stepScore,
  tallyText,
  SCORE_MAX,
  savedAdmin,
  seriesScore,
  winsNeeded,
  canPlayMatch,
  gameLine,
  matchPads,
  padAssignPress,
  padAssignStart,
  padAssignTest,
  padsByPlayer,
  padsForOrder,
  padSide,
  sideOrder,
  swapSide,
  advantagedLabel,
  formatLine,
  formatReady,
  hasAdvantagedSide,
  matchCount,
  matchesText,
  seedingLabel,
  semiLabel,
  stepWeight,
  weightLabel,
  comboButton,
  countdown,
  countdownParts,
  formatChips,
  statusBadge,
  formatSummary,
  hasRunning,
  menuItems,
  countLabel,
  firstMatch,
  bracketColumns,
  bracketLayout,
  cursorSections,
  jumpSection,
  sectionOf,
  eliminatedLabel,
  eliminatedRound,
  gameRows,
  matchTitle,
  moveCursor,
  nextMatch,
  progress,
  progressLabel,
  slotText,
  matchLabel,
  moveSeed,
  playedLabel,
  roundName,
  roundsOf,
  seedValueLabel,
  sourceLabel,
  swapSlots,
  swapCrossing,
  crossingSlot,
  noticeText,
  adTournaments,
  noticeTournaments,
  seatsLabel,
  tabTournaments,
  defaultStart,
  editable,
  filterGames,
  formatStart,
  isCreator,
  listWindow,
  playersLabel,
  publishProblem,
  sameCombo,
  seriesLabel,
  slotLabel,
  stepDate,
  stepPart,
  countText,
  defaultOptions,
  isDouble,
  matchCode,
  matchRound,
  resetNote,
  fitSeries,
  fixedSeriesLabel,
  formatStartable,
  leagueOptions,
  matchSeriesLabel,
  pointChoices,
  seriesChoices,
  walkoverChoices,
  isLeague,
  isReturnLeg,
  leagueDays,
  leagueDayLabel,
  leagueDayStep,
  leagueResult,
  leagueTable,
  playerMatches,
  standingValue,
  standingsColumns,
  standingsGlossary,
} from './tournament.js'

const NOW = new Date(2026, 10, 1, 18, 10)

describe('tournament', () => {
  it('testi dei campi', () => {
    expect(seriesLabel(1)).toBe('Partita secca')
    expect(seriesLabel(3)).toBe('Al meglio di 3')
    expect(playersLabel(null)).toBe('Nessun limite')
    expect(playersLabel(8)).toBe('8 partecipanti')
    expect(slotLabel({ slot: 0 })).toBe('Riprendi')
    expect(slotLabel({ slot: 2, name: '' })).toBe('Slot 2')
    expect(slotLabel({ slot: 2, name: 'Scelta personaggi' })).toBe('Slot 2 · Scelta personaggi')
  })

  it('data e ora', () => {
    expect(formatStart(new Date(2026, 10, 1, 21, 30).toISOString())).toBe('dom 1 nov 2026 · 21:30')
    expect(formatStart(null)).toBe('')
    expect(defaultStart(NOW)).toEqual(new Date(2026, 10, 1, 18, 30))
    expect(defaultStart(new Date(2026, 10, 1, 18, 45))).toEqual(new Date(2026, 10, 1, 19, 0))
    expect(stepDate(new Date(2026, 10, 30, 21, 30), 'day', 1)).toEqual(new Date(2026, 11, 1, 21, 30))
    // Dal 31 gennaio a febbraio: ultimo giorno del mese.
    expect(stepDate(new Date(2027, 0, 31, 21, 0), 'month', 1)).toEqual(new Date(2027, 1, 28, 21, 0))
    expect(stepDate(new Date(2026, 10, 1, 21, 0), 'year', -1)).toEqual(new Date(2025, 10, 1, 21, 0))
    expect(stepDate(new Date(2026, 10, 1, 23, 0), 'hour', 1)).toEqual(new Date(2026, 10, 2, 0, 0))
    expect(stepDate(new Date(2026, 10, 1, 21, 57), 'minute', 1)).toEqual(new Date(2026, 10, 1, 22, 0))
    expect(stepDate(new Date(2026, 10, 1, 21, 0), 'minute', -1)).toEqual(new Date(2026, 10, 1, 20, 55))
    expect(stepPart('day', -1)).toBe('minute')
    expect(stepPart('minute', 1)).toBe('day')
  })

  it('tasti della combinazione', () => {
    expect(comboButton({ kind: 'press', button: 'up' })).toBe('up')
    expect(comboButton({ kind: 'press', button: 'lt' })).toBe('lt')
    expect(comboButton({ kind: 'repeat', button: 'up' })).toBeNull()
    expect(comboButton({ kind: 'press', button: 'start' })).toBeNull()
    expect(comboButton({ kind: 'press', button: 'select' })).toBeNull()
    expect(sameCombo(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameCombo(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(sameCombo([], [])).toBe(true)
  })

  it('creatore, pubblicazione e campi modificabili', () => {
    const draft = { creatorId: 4, status: 'draft', title: '', series: { name: 'Torneo' }, system: 'md', game: 'sf2.md',
      startsAt: null }
    expect(isCreator(draft, 4)).toBe(true)
    expect(isCreator(draft, 5)).toBe(false)
    expect(isCreator(draft, null)).toBe(false)
    expect(publishProblem(draft, NOW)).toBeNull()
    expect(publishProblem({ ...draft, game: null }, NOW)).toBe('Scegli il gioco del torneo.')
    expect(publishProblem({ ...draft, series: { name: '' } }, NOW)).toBe('Scrivi il nome della serie.')
    expect(publishProblem({ ...draft, startsAt: new Date(2026, 10, 1, 18, 0).toISOString() }, NOW)).toMatch(/passata/)
    expect(editable(draft, 'game')).toBe(true)
    expect(editable({ ...draft, status: 'open' }, 'game')).toBe(true)
    expect(editable({ ...draft, status: 'running' }, 'game')).toBe(false)
    expect(editable({ ...draft, status: 'running' }, 'title')).toBe(true)
    expect(editable({ ...draft, status: 'cancelled' }, 'title')).toBe(false)
  })

  it('ricerca e finestra dei giochi', () => {
    const games = [{ title: 'Street Fighter II' }, { title: 'Pokémon Stadium' }, { title: 'Bomberman' }]
    expect(filterGames(games, 'pokemon').map((game) => game.title)).toEqual(['Pokémon Stadium'])
    expect(filterGames(games, ' ')).toBe(games)
    expect(listWindow(5, 2, 10)).toEqual({ start: 0, end: 5 })
    expect(listWindow(100, 50, 10)).toEqual({ start: 45, end: 55 })
    expect(listWindow(100, 2, 10)).toEqual({ start: 0, end: 10 })
    expect(listWindow(100, 99, 10)).toEqual({ start: 90, end: 100 })
  })

  describe('scheda TOURNAMENT', () => {
    const base = {
      status: 'open', registrationClosed: false, maxPlayers: null, players: [], creatorId: 1, startsAt: null,
      roundSeries: 1, finalSeries: 3, thirdPlace: true, savesLocked: true, title: 'Coppa', fullTitle: 'Coppa', gameInfo: { title: 'Tekken 3' },
    }
    const t = (patch) => ({ ...base, ...patch })
    const ADA = { id: 1, guest: false }
    const BEA = { id: 2, guest: false }
    const GUEST = { id: null, guest: true }

    it('tornei della scheda in ordine', () => {
      const list = [
        t({ id: 1, status: 'draft' }),
        t({ id: 2 }),
        t({ id: 3, startsAt: '2026-11-05T20:00:00Z' }),
        t({ id: 4, status: 'running' }),
        t({ id: 5, startsAt: '2026-11-03T20:00:00Z' }),
        t({ id: 6, status: 'done', finishedAt: '2026-11-01T20:00:00Z' }),
        t({ id: 7, status: 'done', finishedAt: '2026-11-02T10:00:00Z' }),
        t({ id: 8, status: 'cancelled' }),
      ]
      // I conclusi (di recente: li manda il backend) in fondo, dal più recente.
      expect(tabTournaments(list).map((item) => item.id)).toEqual([4, 5, 3, 2, 7, 6])
      expect(hasRunning(list)).toBe(true)
      expect(hasRunning([t({ id: 2 })])).toBe(false)
      expect(tabTournaments(null)).toEqual([])
    })

    it('conto alla rovescia', () => {
      const at = (minutes) => new Date(NOW.getTime() + minutes * 60000).toISOString()
      expect(countdown(null, NOW)).toBe('Data da decidere')
      expect(countdown(at(-5), NOW)).toBe('In attesa dell’avvio')
      expect(countdown(at(5), NOW)).toBe('Inizia tra 5 min')
      expect(countdown(at(190), NOW)).toBe('Inizia tra 3 h 10 min')
      expect(countdown(at(120), NOW)).toBe('Inizia tra 2 h')
      expect(countdown(at(2 * 1440 + 4 * 60), NOW)).toBe('Inizia tra 2 g 4 h')
      expect(countdown(at(1440), NOW)).toBe('Inizia tra 1 g')
    })

    it('riquadri, etichette e stato', () => {
      const at = (minutes) => new Date(NOW.getTime() + minutes * 60000).toISOString()
      expect(countdownParts(null, NOW)).toBeNull()
      expect(countdownParts(at(-1), NOW)).toBeNull()
      expect(countdownParts(at(2 * 1440 + 4 * 60 + 10), NOW)).toEqual({ days: 2, hours: 4, minutes: 10 })
      expect(formatChips(t({ sides: 'free', thirdPlace: false })).map((chip) => chip.id))
        .toEqual(['format', 'rounds', 'final', 'sides', 'saves'])
      expect(formatChips(t({ options: { semiSeries: 3 } })).map((chip) => chip.id))
        .toEqual(['format', 'rounds', 'semi', 'final', 'sides', 'third', 'saves'])
      expect(formatChips(t({}))[0].label).toBe('Eliminazione diretta')
      expect(statusBadge(t({ status: 'running' })).tone).toBe('live')
      expect(statusBadge(t({ registrationClosed: true })).tone).toBe('closed')
      expect(statusBadge(t({})).label).toBe('ISCRIZIONI APERTE')
    })

    it('formato e posti', () => {
      expect(formatSummary(t({})))
        .toBe('Eliminazione diretta · Turni: partita secca · Finale: al meglio di 3 · 3° posto · Salvataggi bloccati')
      expect(formatSummary(t({ thirdPlace: false, savesLocked: false, roundSeries: 3, options: { semiSeries: 5 } })))
        .toBe('Eliminazione diretta · Turni: al meglio di 3 · Semifinale: al meglio di 5 · Finale: al meglio di 3')
      expect(seatsLabel(t({}))).toBe('Nessun iscritto')
      expect(seatsLabel(t({ players: [{ id: 1 }] }))).toBe('1 iscritto')
      expect(seatsLabel(t({ players: [{ id: 1 }, { id: 2 }], maxPlayers: 3 }))).toBe('2 iscritti · 1 posto libero')
      expect(seatsLabel(t({ players: [{ id: 1 }], maxPlayers: 4 }))).toBe('1 iscritto · 3 posti liberi')
      expect(seatsLabel(t({ players: [{ id: 1 }, { id: 2 }, { id: 3 }], maxPlayers: 3 }))).toBe('3 iscritti · al completo')
    })

    it('voci del menu', () => {
      const ids = (items) => items.map((item) => item.id + (item.disabled ? '!' : ''))
      expect(ids(menuItems(t({}), 'p2', BEA))).toEqual(['join'])
      expect(ids(menuItems(t({ players: [{ id: 2 }] }), 'p2', BEA))).toEqual(['leave'])
      expect(ids(menuItems(t({ players: [{ id: 1 }], maxPlayers: 1 }), 'p2', BEA))).toEqual(['full!'])
      expect(ids(menuItems(t({ registrationClosed: true }), 'p2', BEA))).toEqual(['closed!'])
      expect(ids(menuItems(t({}), 'p1', GUEST))).toEqual(['create'])
      expect(ids(menuItems(t({}), 'p1', null))).toEqual([])
      expect(ids(menuItems(t({ status: 'running' }), 'p1', ADA))).toEqual([])
      // L'admin solo come P1.
      expect(ids(menuItems(t({}), 'p1', ADA))).toEqual(['join', 'add', 'remove!', 'close', 'start'])
      expect(ids(menuItems(t({}), 'p2', ADA))).toEqual(['join'])
      expect(ids(menuItems(t({ system: 'arcade', game: 'x.zip', status: 'running' }), 'p2', null))).toEqual(['practice'])
      expect(menuItems(t({ system: 'arcade', game: 'x.zip' }), 'p2', BEA)[0].label).toBe('Allenati a Tekken 3')
      expect(ids(menuItems(t({ registrationClosed: true, players: [{ id: 2 }] }), 'p1', ADA)))
        .toEqual(['closed!', 'add', 'remove', 'reopen', 'start'])
    })

    it('riga del formato', () => {
      const single = t({ format: 'single', options: { semiSeries: null }, seeding: 'random', seedingWeight: 50 })
      expect(formatLine(single))
        .toBe('Eliminazione diretta · teste di serie a caso · turni 1, semifinale come i turni, finale 3, 3° posto')
      const doubleBase = { format: 'double', seeding: 'random', roundSeries: 1, finalSeries: 3, thirdPlace: true }
      expect(formatLine({ ...doubleBase, options: {} }))
        .toBe('Doppia eliminazione · teste di serie a caso · turni 1, finali 3, gran finale con rivincita')
      expect(formatLine({ ...doubleBase, options: { grandFinal: 'single', grandSeries: 5 } }))
        .toBe('Doppia eliminazione · teste di serie a caso · turni 1, finali 3, gran finale unica 5')
      expect(formatLine({ ...doubleBase, options: { grandFinal: 'none', grandSeries: 5 } }))
        .toBe('Doppia eliminazione · teste di serie a caso · turni 1, finali 3, senza gran finale')
      expect(formatReady('double')).toBe(true)
      expect(defaultOptions('double')).toEqual({ grandFinal: 'reset', grandSeries: null })
      expect(defaultOptions('single')).toEqual({ semiSeries: null })
      expect(formatLine({ ...single, seeding: 'mix', seedingWeight: 60, thirdPlace: false, options: { semiSeries: 5 } }))
        .toBe('Eliminazione diretta · teste di serie misto 60% XP · turni 1, semifinale 5, finale 3')
      expect(seedingLabel({ seeding: 'xp' })).toBe('per XP')
      expect(seedingLabel({ seeding: 'time' })).toBe('per tempo giocato')
      expect(formatReady('single')).toBe(true)
      expect(formatReady('swiss')).toBe(false)
      expect(semiLabel(null)).toBe('Come i turni')
      expect(semiLabel(3)).toBe('Al meglio di 3')
      expect(advantagedLabel('p2')).toBe('P2')
      expect(hasAdvantagedSide('alternate')).toBe(true)
      expect(hasAdvantagedSide('random')).toBe(true)
      expect(hasAdvantagedSide('free')).toBe(false)
      expect(weightLabel(60)).toBe('60% XP · 40% tempo')
      expect(stepWeight(50, 1)).toBe(60)
      expect(stepWeight(100, 1)).toBe(100)
      expect(stepWeight(0, -1)).toBe(0)
    })

    it('girone all’italiana: opzioni, serie e testi', () => {
      expect(formatReady('round_robin')).toBe(true)
      expect(formatStartable('round_robin')).toBe(true)
      expect(formatStartable('swiss')).toBe(false)
      expect(formatStartable('double')).toBe(true)
      const defaults = { legs: 'single', draws: false, points: [3, 1, 0], score: false, walkoverScore: [1, 0] }
      expect(defaultOptions('round_robin')).toEqual(defaults)
      // Le liste non sono condivise.
      defaultOptions('round_robin').points[0] = 9
      expect(defaultOptions('round_robin').points).toEqual([3, 1, 0])
      expect(leagueOptions({ options: { draws: true } })).toEqual({ ...defaults, draws: true })
      expect(seriesChoices('round_robin', { draws: true })).toEqual([1, 2, 3])
      expect(seriesChoices('round_robin', { draws: false })).toEqual([1, 3, 5])
      expect(seriesChoices('single', { draws: true })).toEqual([1, 3, 5])
      expect([1, 3, 5].map((value) => fitSeries(value, [1, 2, 3]))).toEqual([1, 3, 3])
      expect([1, 2, 3].map((value) => fitSeries(value, [1, 3, 5]))).toEqual([1, 3, 3])
      expect(fixedSeriesLabel(1)).toBe('Partita secca')
      expect(fixedSeriesLabel(2)).toBe('2 partite')
      expect(matchSeriesLabel({ format: 'round_robin', options: { draws: true } }, 3)).toBe('3 partite')
      expect(matchSeriesLabel({ format: 'round_robin', options: {} }, 3)).toBe('Al meglio di 3')
      expect(pointChoices([3, 1, 0], 0)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
      expect(pointChoices([3, 1, 0], 1)).toEqual([0, 1, 2])
      expect(pointChoices([3, 1, 1], 2)).toEqual([0, 1])
      expect(walkoverChoices([1, 0], 1)).toEqual([0])
      expect(walkoverChoices([3, 1], 0)[0]).toBe(2)
      const base = { format: 'round_robin', seeding: 'random', roundSeries: 1, finalSeries: 3, thirdPlace: true,
        sides: 'alternate' }
      expect(formatLine({ ...base, options: {} }))
        .toBe('Girone all’italiana · teste di serie a caso · solo andata, partita secca, senza pareggi')
      expect(formatLine({ ...base, roundSeries: 2,
        options: { legs: 'double', draws: true, points: [2, 1, 0], score: true, walkoverScore: [3, 0] } }))
        .toBe('Girone all’italiana · teste di serie a caso · andata e ritorno, 2 partite, pareggi 2/1/0, ' +
          'punteggio (tavolino 3–0)')
      expect(formatSummary({ ...base, options: {} }))
        .toBe('Girone all’italiana · Solo andata · Incontri: partita secca · Senza pareggi')
      expect(formatChips({ ...base, options: { draws: true, score: true } }).map((chip) => chip.id))
        .toEqual(['format', 'legs', 'rounds', 'draws', 'score', 'sides'])
      // Ognuno incontra tutti: n(n − 1)/2, il doppio con il ritorno; gli spareggi a parte.
      expect(matchCount('round_robin', 10, true, {})).toBe(45)
      expect(matchCount('round_robin', 5, false, { legs: 'double' })).toBe(20)
      expect(countLabel(45, 'round_robin')).toBe('45 incontri + eventuali spareggi')
      expect(matchesText(10, 45, 'round_robin'))
        .toBe('Con 10 iscritti: 45 incontri + eventuali spareggi (girone all’italiana).')
    })

    it('girone all’italiana: giornate, ritorno e cursore', () => {
      const m = (key, round, slot, a, b, order) => ({ key, bracket: 'league', round, slot, playerA: a, playerB: b,
        playOrder: order, status: 'ready', bye: false, games: [] })
      // 3 iscritti, andata e ritorno: ogni giornata un incontro, uno riposa.
      const matches = [m('rr1s1', 1, 1, 1, 2, 1), m('rr2s1', 2, 1, 1, 3, 2), m('rr3s1', 3, 1, 2, 3, 3),
        m('rr4s1', 4, 1, 2, 1, 4), m('rr5s1', 5, 1, 3, 1, 5), m('rr6s1', 6, 1, 3, 2, 6)]
      expect(isLeague(matches)).toBe(true)
      expect(isLeague([{ bracket: 'main' }])).toBe(false)
      expect(isReturnLeg(matches[3], matches)).toBe(true)
      expect(isReturnLeg(matches[0], matches)).toBe(false)
      const days = leagueDays(matches, [1, 2, 3])
      expect(days.map((day) => day.name)).toEqual(['Giornata 1', 'Giornata 2', 'Giornata 3', 'Giornata 4 · Ritorno',
        'Giornata 5 · Ritorno', 'Giornata 6 · Ritorno'])
      expect(days[0].resting).toEqual([3])
      expect(matchRound(matches[4], matches)).toBe('Giornata 5 · Ritorno')
      expect(leagueDayLabel(matches[2], matches)).toBe('Giornata 3 di 6')
      const layout = bracketLayout(matches)
      expect(layout.cells.map((cell) => cell.key)).toEqual(matches.map((match) => match.key))
      expect(moveCursor(layout, 'rr1s1', 'down', true)).toBe('rr2s1')
      expect(moveCursor(layout, 'rr1s1', 'up', true)).toBe('rr6s1')
    })

    it('girone all’italiana: giornate con ◀ ▶', () => {
      const m = (key, round, slot) => ({ key, bracket: 'league', round, slot, playerA: 1, playerB: 2,
        playOrder: round * 10 + slot, status: 'ready', games: [] })
      const matches = [m('rr1s1', 1, 1), m('rr1s2', 1, 2), m('rr2s1', 2, 1), m('rr2s2', 2, 2), m('rr3s1', 3, 1)]
      expect(leagueDayStep(matches, 'rr1s2', 1, true)).toBe('rr2s1')
      expect(leagueDayStep(matches, 'rr2s2', -1, true)).toBe('rr1s1')
      // Oltre il bordo: circolare con la pressione singola, fermo col tasto tenuto.
      expect(leagueDayStep(matches, 'rr3s1', 1, true)).toBe('rr1s1')
      expect(leagueDayStep(matches, 'rr3s1', 1, false)).toBe('rr3s1')
      expect(leagueDayStep(matches, 'rr1s2', -1, true)).toBe('rr3s1')
    })

    it('girone all’italiana: classifica e incontri del giocatore', () => {
      const game = (winnerId) => ({ winnerId })
      const players = [1, 2, 3, 4].map((id) => ({ id, name: `G${id}`, color: `#${id}${id}${id}` }))
      const matches = [
        { key: 'rr1s1', bracket: 'league', round: 1, slot: 1, playerA: 1, playerB: 2, status: 'done', winnerId: 1,
          games: [game(1), game(2), game(1)], playOrder: 1 },
        { key: 'rr1s2', bracket: 'league', round: 1, slot: 2, playerA: 3, playerB: 4, status: 'ready', games: [],
          playOrder: 2 },
        { key: 'rr2s1', bracket: 'league', round: 2, slot: 1, playerA: 2, playerB: 1, status: 'ready', games: [],
          playOrder: 3, walkover: false },
      ]
      expect(leagueResult(matches[0])).toBe('2–1')
      expect(leagueResult(matches[0], 2)).toBe('1–2')
      expect(leagueResult(matches[1])).toBe('–')
      const row = (id, rank, extra = {}) => ({ id, rank, tied: false, withdrawn: false, played: 0, won: 0, drawn: 0,
        lost: 0, gamesFor: 0, gamesAgainst: 0, scoreFor: 0, scoreAgainst: 0, points: 0, ...extra })
      const standings = [row(1, 1, { played: 1, won: 1, gamesFor: 2, gamesAgainst: 1 }),
        row(3, 2, { withdrawn: true }), row(4, 2), row(2, 4, { played: 1, lost: 1, gamesFor: 1, gamesAgainst: 2 })]
      standings[1].tied = true
      standings[2].tied = true
      const tournament = { options: {}, players, matches, standings }
      // Senza pareggi né punteggio: niente P, Pt, +/− e PF.
      const columns = standingsColumns(tournament)
      expect(columns.map((column) => column.label)).toEqual(['G', 'V', 'S', 'DP'])
      expect(standingsColumns({ options: { draws: true, score: true } }).map((column) => column.label))
        .toEqual(['G', 'V', 'P', 'S', 'DP', '+/−', 'PF', 'Pt'])
      const rows = leagueTable(tournament)
      expect(rows.map((item) => item.mark)).toEqual(['1', '2=', '2=', '4'])
      // Il ritirato resta al suo posto senza medaglia: scala chi sta sotto.
      expect(rows.map((item) => item.medal)).toEqual(['gold', null, 'silver', 'bronze'])
      // Girone non finito: niente spareggio.
      expect(rows.some((item) => item.playoff)).toBe(false)
      expect(standingValue(rows[0], 'gameDiff')).toBe('+1')
      expect(standingValue(rows[3], 'gameDiff')).toBe('−1')
      expect(standingValue(rows[2], 'gameDiff')).toBe('0')
      expect(standingsGlossary(columns, rows))
        .toBe('G giocati · V vinti · S persi · DP differenza partite · = pari dopo gli spareggi')
      // Nessun incontro concluso: niente medaglie.
      expect(leagueTable({ ...tournament, matches: matches.slice(1) }).every((item) => !item.medal)).toBe(true)
      // Girone finito con due pari sul podio (non ritirati): spareggio.
      const over = matches.map((match) => ({ ...match, status: 'done' }))
      const tiedRows = [row(1, 1), row(4, 2, { tied: true }), row(2, 2, { tied: true }), row(3, 4)]
      expect(leagueTable({ ...tournament, matches: over, standings: tiedRows }).map((item) => item.playoff))
        .toEqual([false, true, true, false])
      expect(playerMatches(tournament, 1)).toEqual([
        { id: 'rr1s1', label: 'Giornata 1 · contro G2', note: 'Vinto 2–1', color: '#222' },
        { id: 'rr2s1', label: 'Giornata 2 · Ritorno · contro G2', note: 'Da giocare', color: '#222' },
      ])
      expect(playerMatches(tournament, 3).map((item) => item.note)).toEqual(['Prossimo'])
    })

    it('numero di incontri', () => {
      // Stessi casi del backend (tests/test_tournament_formats.py): n − 1, più il 3° posto da 4 iscritti.
      const cases = [[3, 2, 2], [4, 3, 4], [5, 4, 5], [7, 6, 7], [8, 7, 8], [9, 8, 9], [13, 12, 13], [16, 15, 16],
        [33, 32, 33], [64, 63, 64]]
      for (const [count, without, withThird] of cases) {
        expect(matchCount('single', count, false)).toBe(without)
        expect(matchCount('single', count, true)).toBe(withThird)
      }
      expect(matchCount('swiss', 5, true)).toBeNull()
      // Doppia: 2n − 2, più la rivincita; 2n − 3 senza gran finale (il 3° posto non conta).
      expect(matchCount('double', 10, true, { grandFinal: 'reset' })).toEqual({ min: 18, max: 19 })
      expect(matchCount('double', 10, false, {})).toEqual({ min: 18, max: 19 })
      expect(matchCount('double', 10, true, { grandFinal: 'single' })).toEqual({ min: 18, max: 18 })
      expect(matchCount('double', 10, true, { grandFinal: 'none' })).toEqual({ min: 17, max: 17 })
      expect(matchesText(10, { min: 18, max: 19 }, 'double')).toBe('Con 10 iscritti: 18–19 incontri (doppia eliminazione).')
      expect(matchesText(10, { min: 17, max: 17 }, 'double')).toBe('Con 10 iscritti: 17 incontri (doppia eliminazione).')
      expect(countLabel({ min: 18, max: 19 })).toBe('18–19 incontri')
      expect(countText({ min: 18, max: 18 })).toBe('18')
      expect(countText(11)).toBe('11')
      expect(matchesText(5, 4, 'single')).toBe('Con 5 iscritti: 4 incontri (eliminazione diretta).')
      expect(matchesText(2, 1, 'single')).toBe('Con 2 iscritti: 1 incontro (eliminazione diretta).')
      expect(matchesText(5, null, 'swiss')).toBe('Con 5 iscritti: numero di incontri non ancora disponibile (svizzero).')
    })

    it('avviso all’ingresso', () => {
      const list = [
        t({ id: 1, players: [{ id: 2 }] }),
        t({ id: 2, maxPlayers: 1, players: [{ id: 1 }] }),
        t({ id: 3, registrationClosed: true }),
        t({ id: 4, status: 'running' }),
        t({ id: 5 }),
      ]
      expect(noticeTournaments(list, BEA).map((item) => item.id)).toEqual([5])
      expect(noticeTournaments(list, GUEST).map((item) => item.id)).toEqual([1, 5])
      expect(noticeTournaments(list, null)).toEqual([])
      const one = noticeText([t({ startsAt: new Date(NOW.getTime() + 125 * 60000).toISOString() })], false, NOW)
      expect(one).toEqual({ title: 'C’è un torneo', text: '«Coppa» (Tekken 3), inizia tra 2 h 5 min.', question: 'Ti vuoi iscrivere?' })
      expect(noticeText([t({}), t({})], true, NOW)).toEqual({
        title: 'Tornei aperti',
        text: 'Ci sono 2 tornei con le iscrizioni aperte.',
        question: 'Crea un profilo se vuoi partecipare.',
      })
    })
  })
  describe('avvio e tabellone', () => {
    const matches = [
      { key: 'r1s0', bracket: 'main', round: 1, slot: 0, bye: true, status: 'done', playOrder: 0 },
      { key: 'r1s1', bracket: 'main', round: 1, slot: 1, bye: false, status: 'ready', playOrder: 2 },
      { key: 'r1s2', bracket: 'main', round: 1, slot: 2, bye: false, status: 'ready', playOrder: 1 },
      { key: 'r1s3', bracket: 'main', round: 1, slot: 3, bye: true, status: 'done', playOrder: 0 },
      { key: 'r2s0', bracket: 'main', round: 2, slot: 0, bye: false, status: 'waiting', playOrder: 3 },
      { key: 'r2s1', bracket: 'main', round: 2, slot: 1, bye: false, status: 'waiting', playOrder: 4 },
      { key: 'r3s0', bracket: 'main', round: 3, slot: 0, bye: false, status: 'waiting', playOrder: 6 },
      { key: 'third', bracket: 'third', round: 3, slot: 0, bye: false, status: 'waiting', playOrder: 5 },
    ]

    it('nomi dei turni e sigle', () => {
      expect(roundsOf(matches)).toBe(3)
      expect(roundName(3, 3)).toBe('Finale')
      expect(roundName(2, 3)).toBe('Semifinale')
      expect(roundName(1, 3)).toBe('Quarti')
      expect(roundName(2, 6)).toBe('Sedicesimi')
      expect(roundName(1, 6)).toBe('Turno 1')
      expect(matchLabel(matches[2], 3)).toBe('Q3')
      expect(matchLabel(matches[5], 3)).toBe('S2')
      expect(matchLabel(matches[6], 3)).toBe('F')
      expect(matchLabel(matches[7], 3)).toBe('3°')
      expect(matchLabel({ bracket: 'main', round: 1, slot: 4 }, 6)).toBe('T1.5')
      expect(sourceLabel('winner:r1s1', matches, 3)).toBe('Vincitore di Q2')
      expect(sourceLabel('loser:r2s0', matches, 3)).toBe('Perdente di S1')
      expect(sourceLabel(null, matches, 3)).toBe('')
      expect(sourceLabel('winner:manca', matches, 3)).toBe('')
    })

    it('primo incontro', () => {
      expect(firstMatch(matches).key).toBe('r1s2')
      expect(firstMatch([])).toBe(null)
    })

    it('tabellone: colonne, prossimo e avanzamento', () => {
      const columns = bracketColumns(matches)
      expect(columns.map((column) => column.name)).toEqual(['Quarti', 'Semifinale', 'Finale'])
      expect(columns[0].keys).toEqual(['r1s1', 'r1s2'])
      expect(columns[2].keys).toEqual(['r3s0', 'third'])
      expect(columns[2].third.key).toBe('third')
      expect(columns[0].third).toBe(null)
      expect(nextMatch(matches).key).toBe('r1s2')
      expect(progress(matches)).toEqual({ current: 1, total: 6 })
      expect(progressLabel(matches)).toBe('Incontro 1 di 6')
      expect(progressLabel([])).toBe('')
      const finished = matches.map((match) => ({ ...match, status: 'done' }))
      expect(progress(finished)).toEqual({ current: 6, total: 6 })
    })

    it('tabellone: cursore circolare', () => {
      const columns = bracketLayout(matches)
      expect(moveCursor(columns, 'r1s1', 'down', true)).toBe('r1s2')
      expect(moveCursor(columns, 'r1s2', 'down', true)).toBe('r1s1')
      expect(moveCursor(columns, 'r1s2', 'down', false)).toBe('r1s2')
      expect(moveCursor(columns, 'r1s1', 'up', true)).toBe('r1s2')
      expect(moveCursor(columns, 'r1s1', 'right', true)).toBe('r2s0')
      expect(moveCursor(columns, 'r1s2', 'right', true)).toBe('r2s1')
      expect(moveCursor(columns, 'r2s1', 'right', true)).toBe('r3s0')
      expect(moveCursor(columns, 'third', 'left', true)).toBe('r2s1')
      expect(moveCursor(columns, 'r3s0', 'right', true)).toBe('r1s1')
      expect(moveCursor(columns, 'r3s0', 'right', false)).toBe('r3s0')
      expect(moveCursor(columns, 'r1s1', 'left', true)).toBe('r3s0')
      expect(moveCursor(columns, 'r1s1', 'left', false)).toBe('r1s1')
      expect(moveCursor(columns, 'manca', 'down', true)).toBe('r1s1')
    })

    it('tabellone a sezioni: principale e 3° posto', () => {
      const layout = bracketLayout(matches)
      expect(layout.sections.map((section) => section.id)).toEqual(['main', 'third'])
      expect(layout.sections[0].columns.map((column) => column.x)).toEqual([0, 1, 2])
      expect(layout.sections[1].columns[0].x).toBe(2)
      expect(layout.cells.map((cell) => cell.key)).toEqual(['r1s1', 'r1s2', 'r2s0', 'r2s1', 'r3s0', 'third'])
      expect(layout.cells.every((cell) => cell.y > 0 && cell.y < 1)).toBe(true)
      expect(sectionOf(layout, 'third')).toBe('third')
      expect(sectionOf(layout, 'manca')).toBe(null)
      // ▼ dalla semifinale non scende al 3° posto: c'entra solo dalla finale.
      expect(moveCursor(layout, 'r2s1', 'down', true)).toBe('r2s0')
      expect(moveCursor(layout, 'r3s0', 'down', true)).toBe('third')
      expect(moveCursor(layout, 'r3s0', 'up', true)).toBe('third')
      expect(moveCursor(layout, 'third', 'down', true)).toBe('r3s0')
      expect(moveCursor(layout, 'third', 'down', false)).toBe('third')
      expect(moveCursor(layout, 'third', 'right', true)).toBe('r1s2')
      expect(moveCursor(layout, 'third', 'right', false)).toBe('third')
      expect(moveCursor(layout, 'r1s2', 'left', true)).toBe('r3s0')
    })

    it('tabellone a sezioni: L1/R1 con memoria', () => {
      const layout = bracketLayout(matches)
      expect(cursorSections(layout).map((section) => section.id)).toEqual(['main', 'third'])
      expect(jumpSection(layout, 'r1s1', 1)).toBe('third')
      expect(jumpSection(layout, 'r1s1', -1)).toBe('third')
      expect(jumpSection(layout, 'third', -1, { main: 'r2s1' }, 'r1s2')).toBe('r2s1')
      expect(jumpSection(layout, 'third', 1, {}, 'r1s2')).toBe('r1s2')
      expect(jumpSection(layout, 'third', 1, { main: 'sparito' })).toBe('r1s1')
      const played = matches.map((match) => (match.round === 1 ? { ...match, status: 'done' } : match))
      expect(jumpSection(bracketLayout(played), 'third', 1)).toBe('r2s0')
      // Senza 3° posto L1/R1 non fanno nulla.
      const plain = bracketLayout(matches.filter((match) => match.bracket !== 'third'))
      expect(cursorSections(plain)).toHaveLength(1)
      expect(jumpSection(plain, 'r1s1', 1)).toBe('r1s1')
    })

    // Tabellone della diretta con `n` iscritti: bye ai primi posti del 1° turno.
    function single(n, third) {
      let size = 2
      while (size < n) {
        size *= 2
      }
      const list = []
      for (let round = 1; size >> round >= 1; round += 1) {
        for (let slot = 0; slot < size >> round; slot += 1) {
          const bye = round === 1 && slot < size - n
          list.push({ key: `r${round}s${slot}`, bracket: 'main', round, slot, bye, status: bye ? 'done' : 'waiting' })
        }
      }
      if (third && n > 3) {
        list.push({ key: 'third', bracket: 'third', round: 1, slot: 0, bye: false, status: 'waiting' })
      }
      return list
    }

    it.each([[3, false], [8, true], [10, true], [10, false], [33, true]])(
      'tabellone a sezioni: %i iscritti, 3° posto %s, ogni incontro raggiungibile', (n, third) => {
        const list = single(n, third)
        const layout = bracketLayout(list)
        const keys = list.filter((match) => !match.bye).map((match) => match.key)
        expect(layout.cells.map((cell) => cell.key).sort()).toEqual([...keys].sort())
        expect(cursorSections(layout)).toHaveLength(third && n > 3 ? 2 : 1)
        // Da ogni incontro le quattro direzioni portano a un incontro esistente e il giro circolare torna al punto di partenza.
        const reached = new Set([layout.cells[0].key])
        const queue = [layout.cells[0].key]
        while (queue.length) {
          const key = queue.shift()
          for (const dir of ['up', 'down', 'left', 'right']) {
            const to = moveCursor(layout, key, dir, true)
            expect(keys).toContain(to)
            if (!reached.has(to)) {
              reached.add(to)
              queue.push(to)
            }
          }
        }
        expect(reached.size).toBe(keys.length)
        const final = layout.sections[0].columns.length - 1
        for (const column of layout.sections[0].columns.filter((entry) => entry.keys.length)) {
          // Sotto la finale c'è anche il 3° posto.
          const lower = column.x === final && third && n > 3
          const stack = lower ? [...column.keys, 'third'] : column.keys
          let key = stack[0]
          for (let step = 0; step < stack.length; step += 1) {
            key = moveCursor(layout, key, 'down', true)
          }
          expect(key).toBe(stack[0])
          // Col tasto tenuto ci si ferma in fondo.
          expect(moveCursor(layout, stack[stack.length - 1], 'down', false)).toBe(stack[stack.length - 1])
        }
      })

    it('tabellone: caselle, partite ed eliminati', () => {
      const people = new Map([[1, { id: 1, name: 'Anna' }], [2, { id: 2, name: 'Bruno' }], [3, { id: 3, name: 'Carla' }]])
      const played = [
        { key: '10', bracket: 'main', round: 1, slot: 0, bye: false, status: 'done', playerA: 1, playerB: 2,
          winnerId: 1, games: [{ gameNo: 1, winnerId: 1, sideA: 'p2' }, { gameNo: 2, winnerId: null, sideA: 'p1' }] },
        { key: '11', bracket: 'main', round: 1, slot: 1, bye: true, status: 'done', playerA: 3, playerB: null, winnerId: 3 },
        { key: '12', bracket: 'main', round: 2, slot: 0, bye: false, status: 'ready', playerA: 1, playerB: 3,
          fromA: 'winner:10', fromB: 'winner:11' },
      ]
      expect(slotText(played[1], 'b', people, played)).toBe('passa il turno')
      expect(slotText({ ...played[2], playerB: null }, 'b', people, played)).toBe('Vincitore di S2')
      expect(slotText({ ...played[2], playerB: null, fromB: null }, 'b', people, played)).toBe('Da decidere')
      expect(matchTitle(played[0], people, played)).toBe('S1 · Anna contro Bruno')
      expect(gameRows(played[0], people)).toEqual([
        { id: 1, label: 'Partita 1 · vince Anna', note: 'Anna P2 · Bruno P1' },
        { id: 2, label: 'Partita 2 · pari', note: 'Anna P1 · Bruno P2' },
      ])
      expect(gameRows(played[2], people)).toEqual([])
      expect(eliminatedRound({ matches: played }, 2)).toBe(1)
      expect(eliminatedRound({ matches: played }, 1)).toBe(null)
      expect(eliminatedRound({ matches: played }, 3)).toBe(null)
      // Chi perde la semifinale aspetta il 3° posto: non è ancora uscito.
      const semis = [{ ...played[0], key: '20', round: 2 },
        { key: '21', bracket: 'third', round: 2, slot: 0, status: 'waiting', fromA: 'loser:20' }]
      expect(eliminatedRound({ matches: semis }, 2)).toBe(null)
      expect(eliminatedLabel(1, 3)).toBe('Eliminato ai Quarti')
      expect(eliminatedLabel(2, 3)).toBe('Eliminato in Semifinale')
      expect(eliminatedLabel(2, 5)).toBe('Eliminato agli Ottavi')
      expect(eliminatedLabel(1, 6)).toBe('Eliminato al Turno 1')
    })

    // Doppia eliminazione con `n` iscritti, come il backend (tournament_formats.layout_double): bye ai primi posti.
    function double(n, grand = 'reset') {
      let size = 2
      while (size < n) {
        size *= 2
      }
      const total = Math.log2(size)
      const list = []
      const add = (match) => list.push({ status: 'waiting', bye: false, fromA: null, fromB: null, ...match })
      const empty = new Set()
      for (let round = 1; round <= total; round += 1) {
        for (let slot = 0; slot < size >> round; slot += 1) {
          const bye = round === 1 && slot < size - n
          if (bye) {
            empty.add(`loser:wr1s${slot}`)
          }
          add({ key: `wr${round}s${slot}`, bracket: 'winners', round, slot, bye, status: bye ? 'done' : 'waiting',
            fromA: round > 1 ? `winner:wr${round - 1}s${slot * 2}` : null,
            fromB: round > 1 ? `winner:wr${round - 1}s${slot * 2 + 1}` : null })
        }
      }
      const columns = 2 * (total - 1)
      for (let column = 1; column <= columns; column += 1) {
        const count = size >> (Math.floor((column + 1) / 2) + 1)
        for (let slot = 0; slot < count; slot += 1) {
          let sources
          if (column === 1) {
            sources = [`loser:wr1s${slot * 2}`, `loser:wr1s${slot * 2 + 1}`]
          } else if (column % 2 === 0) {
            sources = [`winner:lr${column - 1}s${slot}`, `loser:wr${column / 2 + 1}s${count - 1 - slot}`]
          } else {
            sources = [`winner:lr${column - 1}s${slot * 2}`, `winner:lr${column - 1}s${slot * 2 + 1}`]
          }
          sources = sources.filter((source) => !empty.has(source))
          const key = `lr${column}s${slot}`
          if (!sources.length) {
            empty.add(`winner:${key}`)
          }
          add({ key, bracket: 'losers', round: column, slot, bye: sources.length < 2,
            status: sources.length ? 'waiting' : 'done', fromA: sources[0] || null, fromB: sources[1] || null })
        }
      }
      if (grand !== 'none') {
        add({ key: 'g1', bracket: 'grand', round: 1, slot: 0, fromA: `winner:wr${total}s0`,
          fromB: `winner:lr${columns}s0` })
        if (grand === 'reset') {
          add({ key: 'g2', bracket: 'grand', round: 2, slot: 0, fromA: 'loser:g1', fromB: 'winner:g1' })
        }
      }
      return list
    }

    // Gioca `list` (di `double`) fino alla chiave `stop` esclusa: vince il giocatore con l'id minore, il
    // vincitore e il perdente passano dove indicano `fromA`/`fromB`, i bye nascosti si chiudono da soli.
    function playDouble(list, seeds, stop, grandWinner = 'a') {
      const byKey = new Map(list.map((match) => [match.key, match]))
      const place = (match) => {
        const loser = match.winnerId === match.playerA ? match.playerB : match.playerA
        for (const item of list) {
          for (const side of ['A', 'B']) {
            if (item[`from${side}`] === `winner:${match.key}`) item[`player${side}`] = match.winnerId
            if (item[`from${side}`] === `loser:${match.key}` && !match.bye) item[`player${side}`] = loser
          }
        }
        if (match.key === 'g1' && match.winnerId === match.playerA && byKey.get('g2')) {
          Object.assign(byKey.get('g2'), { status: 'skipped', playerA: null, playerB: null })
        }
      }
      const slots = [1, 4, 2, 3].map((seed) => seeds[seed - 1])
      list.filter((match) => match.round === 1 && match.bracket === 'winners').forEach((match) => {
        match.playerA = slots[match.slot * 2]
        match.playerB = slots[match.slot * 2 + 1]
      })
      // Ordine di gioco a colonne alterne, come il backend (tournament_formats.double_column).
      const total = Math.max(...list.filter((match) => match.bracket === 'winners').map((match) => match.round))
      const column = (match) => {
        if (match.bracket === 'winners') return 2 * (match.round - 1)
        if (match.bracket === 'losers') return match.round <= total ? 2 * match.round - 1 : total + match.round - 1
        return 1000 + match.round
      }
      let order = 0
      for (const match of [...list].sort((a, b) => column(a) - column(b) || a.slot - b.slot)) {
        if (!match.bye) {
          order += 1
          match.playOrder = order
        }
      }
      for (;;) {
        for (const match of list) {
          if (match.status === 'waiting' && match.playerA != null && match.playerB != null) match.status = 'ready'
        }
        const next = list.filter((match) => match.status === 'ready').sort((a, b) => a.playOrder - b.playOrder)[0]
        if (!next || next.key === stop) {
          return list
        }
        next.winnerId = next.key === 'g1' ? next[`player${grandWinner.toUpperCase()}`]
          : Math.min(next.playerA, next.playerB)
        next.status = 'done'
        place(next)
      }
    }

    it('doppia: rivincita, avanzamento e Info torneo', () => {
      const seeds = [101, 102, 103, 104]
      const people = new Map(seeds.map((id) => [id, { id, name: `p${id}` }]))
      const players = seeds.map((id, at) => ({ id, name: `p${id}`, seed: at + 1 }))
      // 4 iscritti, fino alla gran finale: 7 incontri con la rivincita, 6 senza.
      const list = playDouble(double(4), seeds, 'g1')
      expect(progress(list)).toEqual({ current: 6, total: 6, max: 7 })
      expect(progressLabel(list)).toBe('Incontro 6 di 6–7')
      const g2 = list.find((match) => match.key === 'g2')
      expect(resetNote(g2, list, people)).toBe('Rivincita · solo se vince p102')
      const tournament = { status: 'running', matches: list, players }
      expect(doubleStanding(tournament, 101).note).toBe('Gran finale · imbattuto')
      expect(doubleStanding(tournament, 102).note).toBe('Gran finale · 1 sconfitta')
      expect(rosterNote(tournament, 103, 0)).toBe('Eliminato · Finale perdenti · 3°')
      expect(rosterNote(tournament, 104, 0)).toBe('Eliminato · Perdenti, turno 1 · 4°')
      expect(rosterEntry(tournament, 104, 0).out).toBe(true)
      expect(rosterEntry(tournament, 101, 0).out).toBe(false)
      expect(rosterOrder(tournament).map((player) => player.id)).toEqual([101, 102, 103, 104])
      // Vince chi arriva dai vincenti: la rivincita non si gioca e non conta.
      const won = playDouble(double(4), seeds, null, 'a')
      const skipped = won.find((match) => match.key === 'g2')
      expect(skipped.status).toBe('skipped')
      expect(resetNote(skipped, won, people)).toBe('Rivincita · non giocata')
      expect(slotText(skipped, 'a', people, won)).toBe('—')
      expect(progress(won)).toEqual({ current: 6, total: 6 })
      expect(progressLabel(won)).toBe('Incontro 6 di 6')
      // Vince chi arriva dai perdenti: si gioca la rivincita, 7 incontri.
      const reset = playDouble(double(4), seeds, null, 'b')
      expect(progressLabel(reset)).toBe('Incontro 7 di 7')
      const open = playDouble(double(4), seeds, 'g2', 'b')
      expect(progressLabel(open)).toBe('Incontro 7 di 7')
      const running = { status: 'running', matches: open, players }
      expect(doubleStanding(running, 101).note).toBe('Rivincita · 1 sconfitta')
      expect(doubleStanding(running, 102).note).toBe('Rivincita · 1 sconfitta')
    })

    it('doppia: Info torneo nei vincenti e nei perdenti, piazzamenti per colonna', () => {
      const seeds = [101, 102, 103, 104]
      const players = seeds.map((id, at) => ({ id, name: `p${id}`, seed: at + 1 }))
      // Dopo il primo turno dei vincenti: 101 e 102 imbattuti, 103 e 104 nei perdenti.
      const list = playDouble(double(4), seeds, 'lr1s0')
      const tournament = { status: 'running', matches: list, players }
      expect(rosterNote(tournament, 101, 0)).toBe('Vincenti · imbattuto')
      expect(rosterNote(tournament, 104, 0)).toBe('Perdenti · 1 sconfitta')
      expect(rosterOrder(tournament).map((player) => player.id)).toEqual([101, 102, 103, 104])
      expect(rosterNote({ ...tournament, players: players.map((player) => ({ ...player, withdrawn: player.id === 103 })) },
        103, 0)).toBe('Ritirato · Perdenti, turno 1')
      // Ritirato nei vincenti: si legge dove si è ritirato, il piazzamento è quello della colonna dei perdenti.
      const quit = playDouble(double(4), seeds, 'g1').map((match) => (match.key === 'lr2s0'
        ? { ...match, walkover: 1 } : match))
      const lostIn = quit.find((match) => match.key === 'lr2s0')
      const loser = lostIn.winnerId === lostIn.playerA ? lostIn.playerB : lostIn.playerA
      expect(rosterNote({ status: 'running', matches: quit,
        players: players.map((player) => ({ ...player, withdrawn: player.id === loser })) }, loser, 0))
        .toBe('Ritirato · Finale perdenti · 3°')
      // 16 iscritti: 3°, 4°, 5°–6°, 7°–8°, 9°–12°, 13°–16°.
      const sixteen = double(16)
      expect([6, 5, 4, 3, 2, 1].map((column) => placesLabel(losersPlaces(sixteen, column))))
        .toEqual(['3°', '4°', '5°–6°', '7°–8°', '9°–12°', '13°–16°'])
      // A doppia conclusa: per piazzamento.
      const done = { status: 'done', matches: list,
        players: players.map((player) => ({ ...player, place: { 101: 2, 102: 1, 103: 4, 104: 3 }[player.id] })) }
      expect(rosterOrder(done).map((player) => player.id)).toEqual([102, 101, 104, 103])
      expect(rosterNote(done, 104, 0)).toBe('3° posto')
    })

    it.each([3, 5, 8, 10, 16])('doppia a sezioni: %i iscritti, ogni incontro raggiungibile', (n) => {
      const list = double(n)
      expect(isDouble(list)).toBe(true)
      const layout = bracketLayout(list)
      const keys = list.filter((match) => !match.bye).map((match) => match.key)
      expect(layout.sections.map((section) => section.id)).toEqual(['winners', 'losers', 'grand'])
      // I bye (anche quelli nascosti dei perdenti) non hanno cella.
      expect(layout.cells.map((cell) => cell.key).sort()).toEqual([...keys].sort())
      const [winners, losers, grand] = layout.sections
      const total = winners.columns.length
      expect(winners.columns.map((column) => column.x)).toEqual(winners.columns.map((_, at) => 2 * at))
      expect(losers.columns).toHaveLength(2 * (total - 1))
      expect(losers.columns.map((column) => column.x)).toEqual(losers.columns.map((_, at) =>
        (at + 1 <= total ? 2 * at + 1 : total + at)))
      expect(grand.columns[0].x).toBe(losers.columns[losers.columns.length - 1].x + 1)
      expect(winners.columns[total - 1].name).toBe('Finale vincenti')
      expect(losers.columns[losers.columns.length - 1].name).toBe('Finale perdenti')
      expect(winners.columns[0].name).toBe('Turno 1')
      // Linee: nei vincenti saltano la colonna dei perdenti; nei perdenti dispari → pari una a una.
      expect(winners.columns[0].links).toEqual({ in: false, out: 'pair', skipIn: 0, skipOut: 1 })
      expect(losers.columns[0].links.out).toBe('straight')
      if (losers.columns.length > 2) {
        expect(losers.columns[1].links.out).toBe('pair')
      }
      const reached = new Set([layout.cells[0].key])
      const queue = [layout.cells[0].key]
      while (queue.length) {
        const key = queue.shift()
        for (const dir of ['up', 'down', 'left', 'right']) {
          const to = moveCursor(layout, key, dir, true)
          expect(keys).toContain(to)
          if (!reached.has(to)) {
            reached.add(to)
            queue.push(to)
          }
        }
      }
      expect(reached.size).toBe(keys.length)
      // ▼ dall'ultimo incontro di una colonna dei vincenti scende nei perdenti, nella colonna subito a destra.
      for (const column of winners.columns.filter((entry) => entry.keys.length)) {
        const below = moveCursor(layout, column.keys[column.keys.length - 1], 'down', true)
        const cell = layout.cells.find((entry) => entry.key === below)
        expect(cell.section).toBe('losers')
        if (layout.cells.some((entry) => entry.section === 'losers' && entry.x === column.x + 1)) {
          expect(cell.x).toBe(column.x + 1)
        }
        // Col tasto tenuto si arriva in fondo ai perdenti e ci si ferma.
        const bottom = layout.cells.filter((entry) => entry.section === 'losers' && entry.x === cell.x)
          .sort((a, b) => a.y - b.y).pop()
        expect(moveCursor(layout, bottom.key, 'down', false)).toBe(bottom.key)
      }
      // ▶ dalla finale dei vincenti e da quella dei perdenti si va alla gran finale; lì ▲▼ restano tra GF e rivincita.
      expect(moveCursor(layout, `wr${total}s0`, 'right', true)).toBe('g1')
      expect(moveCursor(layout, `lr${2 * (total - 1)}s0`, 'right', true)).toBe('g1')
      expect(moveCursor(layout, 'g1', 'down', true)).toBe('g2')
      expect(moveCursor(layout, 'g2', 'down', true)).toBe('g1')
      expect(moveCursor(layout, 'g1', 'left', true)).toBe(`lr${2 * (total - 1)}s0`)
      // L1/R1 tra vincenti, perdenti e gran finale, circolare.
      expect(cursorSections(layout).map((section) => section.id)).toEqual(['winners', 'losers', 'grand'])
      const start = winners.columns[0].keys[0]
      const inLosers = jumpSection(layout, start, 1)
      expect(layout.cells.find((cell) => cell.key === inLosers).section).toBe('losers')
      expect(jumpSection(layout, inLosers, 1)).toBe('g1')
      expect(jumpSection(layout, 'g1', 1, { winners: start })).toBe(start)
      expect(jumpSection(layout, start, -1)).toBe('g1')
    })

    it('doppia senza gran finale', () => {
      const layout = bracketLayout(double(8, 'none'))
      expect(layout.sections.map((section) => section.id)).toEqual(['winners', 'losers'])
      // Senza gran finale ▶ dalla finale dei vincenti va alla colonna dei perdenti dopo.
      expect(layout.cells.find((cell) => cell.key === moveCursor(layout, 'wr3s0', 'right', true)).section)
        .toBe('losers')
    })

    it('doppia: sigle, caselle e rivincita', () => {
      const people = new Map([[1, { id: 1, name: 'Anna' }], [2, { id: 2, name: 'Bruno' }]])
      const list = double(5)
      const byKey = (key) => list.find((match) => match.key === key)
      // 5 iscritti: tre bye nel 1° turno dei vincenti; il primo incontro giocato è V1-1.
      expect(matchCode(byKey('wr1s3'), list)).toBe('V1-1')
      expect(matchCode(byKey('wr2s1'), list)).toBe('V2-2')
      // Con i bye ai primi posti P2 ha un solo incontro vero (lr2s0 è un bye nascosto).
      expect(byKey('lr2s0').bye).toBe(true)
      expect(matchCode(byKey('lr2s1'), list)).toBe('P2-1')
      expect(matchCode(byKey('lr4s0'), list)).toBe('P4-1')
      expect(matchCode(byKey('g1'), list)).toBe('GF')
      expect(matchCode(byKey('g2'), list)).toBe('GF2')
      expect(matchRound(byKey('lr2s1'), list)).toBe('Perdenti · Turno 2')
      expect(matchRound(byKey('wr1s3'), list)).toBe('Vincenti · Turno 1')
      expect(matchRound(byKey('wr3s0'), list)).toBe('Finale vincenti')
      expect(matchRound(byKey('lr4s0'), list)).toBe('Finale perdenti')
      expect(matchRound(byKey('g2'), list)).toBe('Rivincita')
      expect(matchTitle(byKey('lr2s1'), people, list)).toBe('P2-1 · Perdenti, turno 2')
      expect(matchTitle(byKey('g1'), people, list)).toBe('GF · Gran finale')
      // Caselle vuote: i bye nascosti si saltano fino all'incontro vero.
      const lr3 = byKey('lr3s0')
      expect(slotText(lr3, 'a', people, list)).toBe('Perdente di V2-2')
      expect(slotText(lr3, 'b', people, list)).toBe('Vincitore di P2-1')
      expect(slotText(byKey('lr2s1'), 'a', people, list)).toBe('Perdente di V1-1')
      expect(slotText(byKey('lr4s0'), 'b', people, list)).toBe('Perdente di V3-1')
      expect(slotText(byKey('g1'), 'a', people, list)).toBe('Vincitore dei vincenti')
      expect(slotText(byKey('g1'), 'b', people, list)).toBe('Vincitore dei perdenti')
      expect(sourceLabel('winner:lr1s0', list)).toBe('')
      // Rivincita condizionata.
      expect(resetNote(byKey('g2'), list, people)).toBe('Rivincita · solo se vince chi arriva dai perdenti')
      const known = list.map((match) => (match.key === 'g1' ? { ...match, playerA: 1, playerB: 2 } : match))
      expect(resetNote(known.find((match) => match.key === 'g2'), known, people)).toBe('Rivincita · solo se vince Bruno')
      expect(resetNote(byKey('g1'), list, people)).toBe(null)
      expect(resetNote({ ...byKey('g2'), status: 'ready' }, list, people)).toBe(null)
    })

    it('slot degli incroci dei perdenti', () => {
      const drawn = [
        { key: 'wr1s0', bracket: 'winners', round: 1, slot: 0, playerA: 2, playerB: 3 },
        { key: 'wr2s0', bracket: 'winners', round: 2, slot: 0, playerA: 1, playerB: null, fromB: 'winner:wr1s0' },
        { key: 'lr1s0', bracket: 'losers', round: 1, slot: 0, bye: 1, fromA: 'loser:wr1s0', fromB: null },
        { key: 'lr2s0', bracket: 'losers', round: 2, slot: 0, bye: 0, fromA: 'winner:lr1s0', fromB: 'loser:wr2s0' },
        { key: 'g1', bracket: 'grand', round: 1, slot: 0, bye: 0, fromA: 'winner:wr2s0', fromB: 'winner:lr2s0' },
      ]
      const at = (key) => drawn.find((match) => match.key === key)
      // Attraverso il bye nascosto lo slot è il perdente del 1° turno.
      expect(crossingSlot(at('lr2s0'), 'a', drawn)).toBe('wr1s0')
      expect(crossingSlot(at('lr2s0'), 'b', drawn)).toBe('wr2s0')
      expect(crossingSlot({ ...at('lr2s0'), playerB: 4 }, 'b', drawn)).toBe(null)
      expect(crossingSlot(at('g1'), 'a', drawn)).toBe(null)
      expect(crossingSlot(at('wr2s0'), 'b', drawn)).toBe(null)
    })

    it('scambi e spostamenti', () => {
      expect(swapSlots([1, null, 4, 5], 1, 5)).toEqual([5, null, 4, 1])
      const crossings = { 1: ['wr1s0', 'wr1s1', 'wr1s2', 'wr1s3'], 2: ['wr2s1', 'wr2s0'], 4: ['wr3s0'] }
      expect(swapCrossing(crossings, 'wr2s1', 'wr2s0')).toEqual({ ...crossings, 2: ['wr2s0', 'wr2s1'] })
      expect(crossings[2]).toEqual(['wr2s1', 'wr2s0'])
      expect(swapCrossing(crossings, 'wr1s0', 'wr2s0')).toBe(null)
      expect(swapCrossing(crossings, 'wr2s0', 'wr2s0')).toBe(null)
      expect(swapCrossing(crossings, 'wr9s9', 'wr2s0')).toBe(null)
      expect(swapCrossing(null, 'wr2s1', 'wr2s0')).toBe(null)
      expect(moveSeed([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4])
      expect(moveSeed([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3])
    })

    it('valori delle teste di serie', () => {
      expect(playedLabel(0)).toBe('mai giocato')
      expect(playedLabel(30)).toBe('meno di 1 min')
      expect(playedLabel(45 * 60)).toBe('45 min')
      expect(playedLabel(3 * 3600 + 20 * 60)).toBe('3 h 20 min')
      expect(playedLabel(7200)).toBe('2 h')
      const seed = { xp: 1200, seconds: 3600, value: 53.3 }
      expect(seedValueLabel('xp', seed)).toBe('1200 XP')
      expect(seedValueLabel('time', seed)).toBe('1 h')
      expect(seedValueLabel('mix', seed)).toBe('53,3 punti · 1200 XP · 1 h')
      expect(seedValueLabel('random', seed)).toBe('')
      expect(countLabel(4)).toBe('4 incontri')
      expect(countLabel(1)).toBe('1 incontro')
      expect(countLabel(null)).toBe('in arrivo')
    })
  })
})

describe('incontro', () => {
  const tournament = { creatorId: 9, status: 'running' }
  const match = { key: '5', playerA: 1, playerB: 2, status: 'ready' }
  const user = (id, guest = false) => ({ id, guest })

  it('solo il prossimo incontro, dai due giocatori o dal creatore come P1', () => {
    expect(canPlayMatch(tournament, match, match, 'p2', user(1))).toBe(true)
    expect(canPlayMatch(tournament, match, match, 'p1', user(2))).toBe(true)
    expect(canPlayMatch(tournament, match, match, 'p1', user(9))).toBe(true)
    expect(canPlayMatch(tournament, match, match, 'p2', user(9))).toBe(false)
    expect(canPlayMatch(tournament, match, match, 'p1', user(3))).toBe(false)
    expect(canPlayMatch(tournament, match, match, 'p1', user(null, true))).toBe(false)
    expect(canPlayMatch(tournament, match, { key: '6' }, 'p1', user(1))).toBe(false)
    expect(canPlayMatch(tournament, { ...match, status: 'playing' }, { key: '5' }, 'p1', user(1))).toBe(true)
    expect(canPlayMatch(tournament, { ...match, status: 'done' }, match, 'p1', user(1))).toBe(false)
    expect(canPlayMatch(tournament, { ...match, playerB: null }, match, 'p1', user(1))).toBe(false)
    expect(canPlayMatch({ ...tournament, status: 'done' }, match, match, 'p1', user(1))).toBe(false)
  })

  it('lati, testi e joypad', () => {
    expect(sideOrder(['a', 'b'], 'p1')).toEqual(['a', 'b'])
    expect(sideOrder(['a', 'b'], 'p2')).toEqual(['b', 'a'])
    expect(swapSide('p1')).toBe('p2')
    expect(swapSide('p2')).toBe('p1')
    expect(gameLine(1, 1)).toBe('Partita secca')
    expect(gameLine(2, 3)).toBe('Partita 2 · al meglio di 3')
    const players = { p1: { joined: true, pad: 1 }, p2: { joined: false, pad: null } }
    expect(matchPads(players, [0, 1, 2])).toEqual([1, 0])
    expect(matchPads(players, [1])).toEqual([1, null])
    expect(matchPads({ p1: { joined: true, pad: 0 }, p2: { joined: true, pad: 3 } }, [0, 1, 3])).toEqual([0, 3])
  })

  it('assegnazione dei joypad: P1, P2 e prova dei tasti', () => {
    let step = padAssignPress(padAssignStart(), null, 'start')
    expect(step.sound).toBeNull()
    step = padAssignPress(padAssignStart(), 2, 'a')
    expect(step.assign.step).toBe('p1')
    step = padAssignPress(padAssignStart(), 2, 'start')
    expect(step.assign).toMatchObject({ step: 'p2', pads: { p1: 2, p2: null } })
    expect(padAssignPress(step.assign, 2, 'start').sound).toBeNull()
    expect(padAssignPress(step.assign, 0, 'select').assign).toEqual(padAssignStart())
    step = padAssignPress(step.assign, 0, 'start')
    expect(step.assign).toMatchObject({ step: 'test', pads: { p1: 2, p2: 0 } })
    expect(padSide(step.assign, 0)).toBe('p2')
    expect(padSide(step.assign, 5)).toBeNull()
    expect(padAssignPress(step.assign, 5, 'start').sound).toBeNull()
    const first = padAssignPress(step.assign, 2, 'start')
    expect(first).toMatchObject({ go: false, assign: { ready: { p1: true, p2: false } } })
    expect(padAssignPress(first.assign, 2, 'start').assign.ready.p1).toBe(false)
    const cancel = padAssignPress(first.assign, 2, 'select')
    expect(cancel.assign).toMatchObject({ ready: { p1: false }, cancel: { p1: true } })
    expect(padAssignPress(cancel.assign, 2, 'start').assign).toMatchObject({ ready: { p1: true }, cancel: { p1: false } })
    expect(padAssignPress(cancel.assign, 0, 'select').assign).toEqual(padAssignStart())
    expect(padAssignPress(first.assign, 0, 'start').go).toBe(true)
  })

  it('joypad che seguono i giocatori nelle partite dopo', () => {
    const order = [{ id: 7 }, { id: 9 }]
    const byPlayer = padsByPlayer({ p1: 1, p2: 0 }, order)
    expect(byPlayer).toEqual({ 7: 1, 9: 0 })
    expect(padsForOrder(byPlayer, [order[1], order[0]])).toEqual({ p1: 0, p2: 1 })
    expect(padsForOrder(byPlayer, [{ id: 3 }, order[0]])).toBeNull()
    expect(padsForOrder(null, order)).toBeNull()
    expect(padAssignTest({ p1: 0, p2: 1 })).toMatchObject({ step: 'test', ready: { p1: false, p2: false } })
  })
})

describe('risultato dell\'incontro', () => {
  it('vittorie necessarie e punteggio della serie', () => {
    expect([1, 3, 5].map(winsNeeded)).toEqual([1, 2, 3])
    const match = { playerA: 1, playerB: 2 }
    expect(seriesScore([{ winnerId: 1 }, { winnerId: 2 }, { winnerId: 1 }], match)).toEqual([2, 1])
    expect(seriesScore(undefined, match)).toEqual([0, 0])
  })

  it('admin dell\'incontro: joypad del P1 di prima o tastiera', () => {
    const saved = { p1: { joined: true, pad: 2, user: { id: 7 } }, p2: { joined: false, pad: null, user: null } }
    expect(adminPress(saved, 2)).toBe(true)
    expect(adminPress(saved, 0)).toBe(false)
    expect(adminPress(saved, null)).toBe(true)
    expect(adminPress(null, 1)).toBe(false)
    expect(savedAdmin(saved)).toEqual({ id: 7 })
    expect(savedAdmin({ p1: { joined: true, user: { id: 3, guest: true } } })).toBeNull()
    expect(savedAdmin(null)).toBeNull()
  })

  it('scelta del vincitore con la croce', () => {
    const order = [{ id: 4 }, { id: 9 }]
    expect(moveDeclare(order, 4, 'right', true)).toBe(9)
    expect(moveDeclare(order, 9, 'right', false)).toBe(9)
    expect(moveDeclare(order, 9, 'right', true)).toBe(4)
    expect(moveDeclare(order, 4, 'left', true)).toBe(9)
    expect(moveDeclare(order, 4, 'down', false)).toBe('replay')
    expect(moveDeclare(order, 'replay', 'up', false)).toBe(4)
    expect(moveDeclare(order, 'replay', 'right', false)).toBe(9)
    expect(moveDeclare(order, 'replay', 'down', true)).toBe(4)
    expect(moveDeclare(order, 4, 'up', true)).toBe('replay')
    expect(moveDeclare(order, 4, 'a', true)).toBe(4)
  })

  it('dichiarazione del girone: pareggio, punteggio e serie fissa', () => {
    const order = [{ id: 4 }, { id: 9 }]
    // Con i pareggi PAREGGIO sta in mezzo ai due giocatori.
    expect(moveDeclare(order, 4, 'right', true, true)).toBe('draw')
    expect(moveDeclare(order, 'draw', 'right', true, true)).toBe(9)
    expect(moveDeclare(order, 9, 'right', true, true)).toBe(4)
    expect(moveDeclare(order, 9, 'right', false, true)).toBe(9)
    expect(moveDeclare(order, 'draw', 'down', false, true)).toBe('replay')
    expect(moveDeclare(order, 'replay', 'right', false, true)).toBe(9)
    expect(gameLine(2, 2, true)).toBe('Partita 2 di 2')
    expect(gameLine(1, 1, true)).toBe('Partita secca')
    expect(tallyText(1)).toBe('1 vinta')
    expect(tallyText(2, 1)).toBe('2 vinte · 1 pari')
    expect(startScore(order, 9)).toEqual({ values: [0, 1], at: 1 })
    expect(startScore(order, 'draw')).toEqual({ values: [0, 0], at: 0 })
    expect(stepScore(0, -1, true)).toBe(SCORE_MAX)
    expect(stepScore(0, -1, false)).toBe(0)
    expect(stepScore(SCORE_MAX, 1, true)).toBe(0)
    expect(scoreProblem(order, 4, [3, 1])).toBeNull()
    expect(scoreProblem(order, 4, [1, 1])).toBe('Chi vince la partita deve avere più punti.')
    expect(scoreProblem(order, 9, [3, 1])).toBe('Chi vince la partita deve avere più punti.')
    expect(scoreProblem(order, 'draw', [2, 2])).toBeNull()
    expect(scoreProblem(order, 'draw', [2, 1])).toBe('In una partita pari il punteggio è uguale.')
    // Lati invertiti: il punteggio torna nell'ordine [playerA, playerB].
    const players = [{ id: 9 }, { id: 4 }]
    expect(declareBody(players, order, 4, [3, 1])).toEqual({ winner: 4, draw: false, score: [1, 3] })
    expect(declareBody(players, order, 'draw', [2, 2])).toEqual({ winner: null, draw: true, score: [2, 2] })
    expect(declareBody(players, order, 'replay', null)).toEqual({ winner: null, draw: false, score: null })
    // Calendario col punteggio totale e partite con il punteggio.
    const match = { key: 'rr1s1', bracket: 'league', round: 1, slot: 1, playerA: 4, playerB: 9, status: 'done',
      winnerId: 9, games: [{ gameNo: 1, winnerId: 9, sideA: 'p1', scoreA: 2, scoreB: 5 },
        { gameNo: 2, winnerId: null, sideA: 'p2', scoreA: 1, scoreB: 1 }] }
    expect(leagueResult(match)).toBe('0–1')
    expect(leagueResult(match, 4, { score: true })).toBe('3–6')
    expect(leagueResult(match, 9, { score: true })).toBe('6–3')
    const people = new Map([[4, { name: 'Anna' }], [9, { name: 'Luca' }]])
    expect(gameRows(match, people).map((row) => row.label)).toEqual(['Partita 1 · vince Luca · 5–2',
      'Partita 2 · pari · 1–1'])
  })

  it('voci dell\'admin nel menu dell\'incontro', () => {
    const semi = { key: '1', bracket: 'main', round: 1, playerA: 1, playerB: 2, status: 'ready', undoKind: null }
    const other = { key: '2', bracket: 'main', round: 1, playerA: 3, playerB: 4, status: 'done', winnerId: 3,
      undoKind: 'result', canUndo: false, undoProblem: 'L\'incontro successivo è già iniziato.' }
    const final = { key: '3', bracket: 'main', round: 2, playerA: null, playerB: 3, status: 'waiting',
      fromA: 'winner:1', fromB: 'winner:2', undoKind: null }
    const tournament = { creatorId: 1, status: 'running',
      players: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4, withdrawn: false }], matches: [semi, other, final] }
    const admin = { id: 1 }
    expect(adminMatchItems(tournament, semi, 'p2', admin)).toEqual([])
    expect(adminMatchItems({ ...tournament, status: 'done' }, semi, 'p1', admin)).toEqual([])
    expect(adminMatchItems(tournament, semi, 'p1', { id: 2 })).toEqual([])
    expect(adminMatchItems(tournament, semi, 'p1', { id: 1, guest: true })).toEqual([])
    expect(adminMatchItems(tournament, semi, 'p1', admin).map((item) => [item.id, item.disabled]))
      .toEqual([['walkover', false], ['withdraw', false], ['cancel', false]])
    const done = adminMatchItems(tournament, other, 'p1', admin)
    expect(done.map((item) => [item.id, item.disabled, item.note])).toEqual([
      ['walkover', true, 'incontro concluso'],
      ['withdraw', false, null],
      ['undo', true, 'l\'incontro successivo è già iniziato'],
      ['cancel', false, null],
    ])
    expect(adminMatchItems(tournament, final, 'p1', admin)[0]).toMatchObject({ disabled: true, note: 'mancano i due giocatori' })
    // Il perdente è fuori; chi ha vinto è ancora in gara nella finale.
    expect(withdrawCandidates(tournament, other)).toEqual([3])
    expect(withdrawCandidates({ ...tournament, players: [{ id: 3, withdrawn: true }] }, other)).toEqual([])
    expect(adminMatchItems(tournament, { key: '9', bye: true, playerA: 1, playerB: null, status: 'done' }, 'p1', admin)
      .map((item) => item.id)).toEqual(['cancel'])
  })

  it('girone: tavolino, ritiro e annullamento', () => {
    const people = new Map([[1, { name: 'Ada' }], [2, { name: 'Bea' }], [3, { name: 'Cleo' }]])
    const m = (key, a, b, extra = {}) => ({ key, bracket: 'league', round: 1, slot: 1, playerA: a, playerB: b,
      series: 3, status: 'ready', games: [], ...extra })
    const walkover = m('1', 1, 2, { status: 'done', walkover: true, winnerId: 2, finishedAt: '2026-11-02T19:00' })
    // A tavolino: vittorie necessarie a zero, con i pareggi la serie intera, col punteggio quello delle opzioni.
    expect(leagueResult(walkover)).toBe('0–2')
    expect(leagueResult(walkover, 2, { draws: true })).toBe('3–0')
    expect(leagueResult(walkover, 2, { score: true, walkoverScore: [5, 1] })).toBe('5–1')
    const before = m('2', 1, 3, { status: 'done', walkover: true, winnerId: 3, finishedAt: '2026-11-02T18:00' })
    const open = m('3', 3, 1)
    const tournament = { players: [{ id: 1, withdrawn: true, withdrawnAt: '2026-11-02T19:00' }],
      matches: [walkover, before, open] }
    expect(withdrawText(open, 3, people, { players: [], matches: [open, m('4', 3, 2)] }))
      .toBe('Ritirare Cleo dal torneo? I suoi 2 incontri da giocare diventano vittorie a tavolino per gli ' +
        'avversari. I risultati giocati restano.')
    expect(withdrawText(open, 1, people, { players: [], matches: [open] }))
      .toBe('Ritirare Ada dal torneo? Il suo incontro da giocare diventa una vittoria a tavolino per l’avversario. ' +
        'I risultati giocati restano.')
    // Annullare il ritiro: contano solo i tavolini dal ritiro in poi (non quello dato prima dall'admin).
    expect(undoText(tournament, { ...walkover, undoKind: 'withdrawal' }, people, tournament.matches))
      .toBe('Annullare il ritiro di Ada? Il suo tavolino automatico torna da giocare.')
    const done = m('5', 2, 3, { status: 'done', winnerId: 2, undoKind: 'result', games: [{ winnerId: 2 }] })
    expect(undoText(tournament, done, people, [done])).toMatch(/L’incontro torna da giocare\.$/)
  })

  it('testi di ritiro e annullamento', () => {
    const people = new Map([[1, { name: 'Ada' }], [2, { name: 'Bea' }]])
    const match = { key: '1', bracket: 'main', round: 1, playerA: 1, playerB: 2, status: 'ready' }
    expect(withdrawText(match, 2, people)).toBe('Ritirare Bea dal torneo? Ada vince a tavolino.')
    expect(withdrawText({ ...match, playerB: null }, 1, people)).toMatch(/appena l’avversario sarà noto/)
    expect(withdrawText({ ...match, bracket: 'winners' }, 2, people))
      .toBe('Ritirare Bea dal torneo? Bea perde a tavolino questo incontro ed esce dal torneo.')
    const grand = { ...match, bracket: 'grand', status: 'done', winnerId: 2, undoKind: 'result' }
    const reset = { ...grand, key: '2', round: 2, status: 'waiting' }
    expect(undoText({ players: [] }, grand, people, [grand, reset]))
      .toBe('Annullare la gran finale? La rivincita torna in attesa.')
    const tournament = { players: [{ id: 1 }, { id: 2, withdrawn: true }] }
    expect(isWithdrawn(tournament, 2)).toBe(true)
    expect(isWithdrawn(tournament, 1)).toBe(false)
    const lost = { ...match, status: 'done', winnerId: 1, walkover: true, undoKind: 'withdrawal' }
    expect(undoText(tournament, lost, people, [lost])).toBe('Annullare il ritiro di Bea? Torna in gara.')
    expect(undoText(tournament, { ...match, undoKind: 'game' }, people, [match])).toMatch(/^Annullare l’ultima partita/)
    expect(undoneMessage('walkover')).toBe('Tavolino annullato.')
    expect(undoneMessage('result')).toBe('Risultato annullato.')
    expect(rosterNote(tournament, 2, 1)).toBe('Ritirato')
    expect(rosterNote(tournament, 1, 1)).toBeNull()
  })
})

describe('fine del torneo', () => {
  const podium = [
    { id: 1, place: 1, xp: 100 },
    { id: 2, place: 2, xp: 50 },
    { id: 3, place: 3, xp: 25 },
    { id: 4, place: 3, xp: 25 },
  ]

  it('gradini del podio: 2° a sinistra, 1° al centro, 3° a destra', () => {
    expect(podiumSteps(podium).map((step) => [step.place, step.players.map((player) => player.id)]))
      .toEqual([[2, [2]], [1, [1]], [3, [3, 4]]])
    expect(podiumSteps([{ id: 1, place: 1, xp: 0 }]).map((step) => step.place)).toEqual([1])
    expect(podiumSteps(null)).toEqual([])
    expect(podiumHasXp(podium)).toBe(true)
    expect(podiumHasXp([{ id: 1, place: 1, xp: 0 }])).toBe(false)
  })

  it('stato e tabellone del torneo concluso', () => {
    const done = { status: 'done', registrationClosed: true }
    expect(statusBadge(done)).toEqual({ tone: 'done', label: 'CONCLUSO' })
    expect(tabStatus(done, new Date())).toBe('Concluso')
    expect(hasBoard(done)).toBe(true)
    expect(hasBoard({ status: 'running' })).toBe(true)
    expect(hasBoard({ status: 'open' })).toBe(false)
    expect(hasBoard(null)).toBe(false)
    const finished = { status: 'done', players: [{ id: 1, place: 1 }, { id: 2, place: 5, withdrawn: true }] }
    expect(rosterNote(finished, 1, 3)).toBe('1° posto')
    expect(rosterNote(finished, 2, 3)).toBe('Ritirato · 5° posto')
  })

  it('righe del profilo e dell\'archivio', () => {
    expect(placeLabel(3)).toBe('3°')
    expect(rewardLine({ title: 'Coppa', place: 2, xp: 50 })).toBe('Coppa: 2° · +50 XP')
    expect(rewardLine({ title: 'Coppa', place: 5, xp: 0 })).toBe('Coppa: 5°')
    expect(tournamentsLine({ played: 1, won: 1, best: 1 })).toBe('Tornei: 1 giocato · 1 vinto · miglior piazzamento 1°')
    expect(tournamentsLine({ played: 3, won: 0, best: 5 })).toBe('Tornei: 3 giocati · 0 vinti · miglior piazzamento 5°')
    expect(tournamentsLine({ played: 0, won: 0, best: null })).toBeNull()
    expect(tournamentsLine(undefined)).toBeNull()
    const day = (iso) => iso.slice(0, 10)
    expect(archiveNote({ status: 'done', finishedAt: '2026-11-02T10:00:00Z', updatedAt: 'x',
      gameInfo: { title: 'Pang' } }, day)).toBe('Pang · 2026-11-02 · Concluso')
    expect(archiveNote({ status: 'cancelled', finishedAt: null, updatedAt: '2026-11-01T10:00:00Z', gameInfo: null },
      day)).toBe('2026-11-01 · Annullato')
  })
})

describe('adTournaments', () => {
  it('in corso, iscrizioni aperte con inizio oggi, conclusi oggi', () => {
    const now = new Date(2026, 10, 5, 15, 0)
    const at = (hour, day = 5) => new Date(2026, 10, day, hour, 0).toISOString()
    const list = [
      { id: 1, status: 'open', startsAt: at(21) },
      { id: 2, status: 'open', startsAt: at(21, 6) },
      { id: 3, status: 'open', startsAt: null },
      { id: 4, status: 'running', startsAt: at(10, 4) },
      { id: 5, status: 'done', finishedAt: at(12) },
      { id: 6, status: 'done', finishedAt: at(12, 4) },
      { id: 7, status: 'draft', startsAt: at(21) },
    ]
    expect(adTournaments(list, now).map((item) => item.id).sort()).toEqual([1, 4, 5])
  })
})
