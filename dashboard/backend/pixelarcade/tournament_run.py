"""Avvio del torneo (README «Torneo»): dalla scheda TOURNAMENT, solo l'admin.

L'avvio passa da tre richieste, tutte con creatore e combinazione come le
altre azioni dell'admin (``TournamentService.check_access``):

- ``start_check``: controlli prima di aprire la schermata (torneo con le
  iscrizioni aperte, almeno 3 iscritti, nessun altro torneo in corso).
  Restituisce gli iscritti, le impostazioni del formato e il numero di
  incontri di ogni formato (con le opzioni del torneo per il suo formato e i
  predefiniti per gli altri; ``None`` per i formati non ancora pronti).
- ``start_preview``: teste di serie e tabellone con le impostazioni
  ritoccate; non scrive niente. Senza ``order`` calcola le teste di serie
  (a caso, «Rimescola», o per XP, tempo giocato o misto); senza ``slots``
  il tabellone è quello standard.
- ``start``: ricontrolla tutto e in una transazione salva le impostazioni
  scelte, le teste di serie e gli incontri; il torneo passa a ``running``
  con le iscrizioni chiuse.
- ``save_draft``: bozza della schermata (passo, impostazioni, teste di
  serie e caselle) salvata a ogni scelta, per riprendere da lì dopo
  un'uscita; ``None`` la cancella. ``start_check`` la restituisce già
  ricontrollata: con gli iscritti cambiati restano solo impostazioni e
  passo (al massimo il 2), con impostazioni non più valide si ignora.
  Si cancella all'avvio, all'annullamento e cambiando il formato nelle
  Impostazioni.

``order`` (id degli iscritti in ordine di testa di serie) e ``slots`` (caselle
del primo turno, ``None`` = vuota; nel girone le posizioni nel calendario a
rotazione, senza caselle vuote) devono contenere esattamente gli iscritti.
Il tempo giocato per le teste di serie non conta le partite di torneo; gli XP
sono quelli del profilo.

Incontri (a torneo in corso, senza combinazione):

- ``match_screen``: dati della schermata «Incontro» del prossimo incontro
  (o di quello in gioco): giocatori, numero della partita, serie e lato di
  ``player_a`` (la testa di serie migliore). Con i lati sorteggiati il
  sorteggio si fa qui e resta in memoria fino all'avvio di quella partita.
- ``play_match``: controlla chi avvia (uno dei due giocatori o il creatore),
  calcola P1 e P2 della partita secondo i lati e restituisce quello che
  serve a ``PlayService.start`` (``match``); ``match_started`` porta poi
  l'incontro a ``playing``.
- ``match_ended``: ricorda la partita (sessione e lati) appena finita
  dell'incontro, da dichiarare.
- ``declare``: l'admin (creatore, con la combinazione se il torneo ce l'ha)
  dichiara il vincitore della partita finita, oppure «rigioca» (``None``:
  la partita non conta). Alle vittorie necessarie l'incontro si chiude e
  vincitore e perdente passano agli incontri che ne dipendono.
- ``suspend``: l'incontro resta in gioco con le partite dichiarate (e
  l'eventuale partita ancora da dichiarare); si chiudono solo gli slot
  temporanei dell'incontro. Si riprende dal tabellone.

Azioni dell'admin a torneo in corso (creatore con la combinazione, come
``declare``; mai con una partita aperta sulla console in quell'incontro):

- ``walkover``: vittoria a tavolino in un incontro con i due giocatori noti e
  non concluso, anche in gioco (le partite dichiarate restano).
- ``withdraw``: ritira un giocatore non eliminato: perde a tavolino
  l'incontro in cui si trova, subito se l'avversario è noto, altrimenti
  appena lo diventa.
- ``undo``: «Annulla il risultato», un passo alla volta (vedi
  ``tournament_formats.undo_state``): l'ultima partita dichiarata, il
  risultato di un incontro concluso (se quelli dopo non sono iniziati), un
  tavolino; un tavolino contro un ritirato annulla anche il ritiro.

Partite giocate e da dichiarare stanno in memoria: dopo un riavvio della
dashboard la partita non dichiarata si rigioca.

Girone: a girone finito ``finish_if_over`` crea gli spareggi che servono
(``tournament_formats.playoff_state``); se dopo gli spareggi qualcuno è
ancora pari sul podio il torneo resta in corso finché l'admin non fa il
sorteggio (``draw_lots``, con la combinazione). Annullando un risultato del
girone uno spareggio non ancora iniziato si cancella; uno iniziato blocca.

Fine del torneo: quando non resta nessun incontro da giocare (tutti
``done`` o ``skipped``, dopo ``declare``, ``walkover`` o ``withdraw``) il
torneo passa a ``done`` con ``finished_at`` e i piazzamenti in
``tournament_players.place`` (``tournament_formats.placements``: un
ritirato ha il posto del turno, o della colonna dei perdenti, in cui ha
perso a tavolino). Ogni piazzato ha una riga in
``tournament_rewards`` con gli XP del premio (``REWARD_XP`` per 1°, 2° e 3°,
anche a pari merito; 0 per gli altri o con i premi spenti), così piazzamento
e XP restano anche dopo l'eliminazione del torneo. Un torneo concluso non
accetta più azioni di gioco o dell'admin.
"""

import logging
import os
import random

from .errors import TournamentError
from .repositories.cores import now_iso
from .tournament_formats import (FORMATS, STARTABLE, all_closed, apply_winner, bracket_size, check_crossings,
                                 check_game_result, default_options, first_round_slots, game_rules, game_sides,
                                 layout_double, layout_from_slots, series_result,
                                 layout_playoff, layout_round_robin, league_standings,
                                 local_match, loser_of, match_count, placements, placements_league, playoff_keys,
                                 playoff_mini, playoff_started, playoff_state, reopen_match, revert_winner,
                                 seed_order,
                                 standard_crossings, undo_state)
from .tournaments import PLAYERS_MIN, REWARD_XP, format_settings, full_title

STEPS = (1, 2, 3)
SIDES = ('p1', 'p2')

log = logging.getLogger(__name__)


def public_preview(matches):
    """Incontri di ``tournament_formats`` (chiavi locali) nella forma di quelli salvati, per l'interfaccia."""
    return [{'id': None, 'key': match['key'], 'stage': match['stage'], 'groupNo': match['group_no'],
             'bracket': match['bracket'], 'round': match['round'], 'slot': match['slot'],
             'playOrder': match['play_order'], 'playerA': match['player_a'], 'playerB': match['player_b'],
             'fromA': match['from_a'], 'fromB': match['from_b'], 'series': match['series'],
             'status': match['status'], 'winnerId': match['winner_id'], 'walkover': bool(match['walkover']),
             'bye': bool(match['bye']), 'startedAt': None, 'finishedAt': None, 'games': []}
            for match in matches]


def score_totals(games):
    """Punteggio totale ``[player_a, player_b]`` delle partite ``games`` (0 dove non è registrato)."""
    return [sum(game.get('scoreA') or 0 for game in games), sum(game.get('scoreB') or 0 for game in games)]


# Incontro salvato nella forma di ``tournament_formats`` (``key`` = id in testo, come in ``fromA``).
format_match = local_match

# Campi di ``format_match`` riscritti dopo l'avanzamento: chiave locale → chiave del repository.
ADVANCE_FIELDS = (('player_a', 'playerA'), ('player_b', 'playerB'), ('from_a', 'fromA'), ('from_b', 'fromB'),
                  ('status', 'status'), ('winner_id', 'winnerId'), ('walkover', 'walkover'))


def check_order(order, ids):
    """``order`` valido: una lista con ognuno degli iscritti ``ids`` una volta sola."""
    if not isinstance(order, list) or any(isinstance(item, bool) or not isinstance(item, int) for item in order) \
            or len(order) != len(ids) or set(order) != set(ids):
        raise TournamentError('L\'ordine delle teste di serie non corrisponde agli iscritti.')
    return list(order)


def check_ring(ring, ids):
    """Girone: ``ring`` (posizioni nel calendario) contiene ognuno degli iscritti ``ids`` una volta sola."""
    if not isinstance(ring, list) or any(isinstance(item, bool) or not isinstance(item, int) for item in ring) \
            or len(ring) != len(ids) or set(ring) != set(ids):
        raise TournamentError('Le posizioni nel calendario non corrispondono agli iscritti.')
    return list(ring)


def check_positions(fmt, slots, ids):
    """Caselle del primo turno (eliminazione) o posizioni nel calendario (girone)."""
    return check_ring(slots, ids) if fmt == 'round_robin' else check_slots(slots, ids)


def check_slots(slots, ids):
    """``slots`` valido: tutti gli iscritti una volta sola e caselle vuote fino alla potenza di 2."""
    size = bracket_size(len(ids))
    if not isinstance(slots, list) or len(slots) != size or \
            any(item is not None and (isinstance(item, bool) or not isinstance(item, int)) for item in slots):
        raise TournamentError('Il tabellone non corrisponde agli iscritti.')
    players = [item for item in slots if item is not None]
    if len(players) != len(ids) or set(players) != set(ids):
        raise TournamentError('Il tabellone non corrisponde agli iscritti.')
    return list(slots)


class TournamentRunService:
    """Avvio del torneo (vedi il modulo).

    ``tournaments`` è il ``TournamentService`` (torneo, permessi, iscritti),
    ``matches`` il ``TournamentMatchesRepository``, ``sessions`` il
    ``SessionsRepository`` (XP e tempo giocato). ``rng`` e ``now`` sono
    sostituibili nei test.
    """

    def __init__(self, tournaments, matches, sessions, rng=None, now=now_iso):
        self.tournaments = tournaments
        self.matches = matches
        self.sessions = sessions
        self.rng = rng or random.SystemRandom()
        self.now = now
        # Lati sorteggiati e non ancora giocati: ``{(incontro, partita): lato di player_a}``.
        self.drawn = {}
        # Partita in gioco di ogni incontro: ``{incontro: {gameNo, sideA}}``.
        self.started = {}
        # Partita finita e non ancora dichiarata: ``{incontro: {gameNo, sideA, sessionId}}``.
        self.ended = {}
        # ``IngameService`` (slot temporanei degli incontri), assegnato in ``app``.
        self.ingame = None
        # Osservatori delle partite degli incontri (estensioni): vedi ``add_game_listener``.
        self.game_listeners = []

    # --- Controlli -------------------------------------------------------------------

    def startable(self, tournament_id, account_id, combo):
        """Torneo da avviare con i suoi iscritti, dopo i controlli; altrimenti ``TournamentError``."""
        service = self.tournaments
        tournament = service.current(tournament_id)
        service.check_access(tournament, account_id, combo)
        if tournament['status'] == 'draft':
            raise TournamentError('Il torneo non è ancora pubblicato.')
        if tournament['status'] != 'open':
            raise TournamentError('Il torneo è già in corso.')
        players = service.repo.players(tournament['id'])
        if len(players) < PLAYERS_MIN:
            raise TournamentError('Servono almeno %d iscritti per avviare il torneo.' % PLAYERS_MIN)
        others = [item for item in service.repo.running() if item['id'] != tournament['id']]
        if others:
            raise TournamentError('C\'è già un torneo in corso: «%s». Va concluso o annullato prima.'
                                  % full_title(others[0]))
        return tournament, players

    def player_values(self, tournament, players):
        """Iscritti con XP e tempo giocato al gioco del torneo (senza le partite di torneo)."""
        ids = [player['id'] for player in players]
        seconds = self.sessions.game_seconds_by_account(tournament['system'], tournament['game'], ids)
        return [{'id': player['id'], 'name': player['name'], 'color': player['color'],
                 'xp': self.sessions.stats(player['id'])['xp'], 'seconds': seconds.get(player['id'], 0)}
                for player in players]

    def counts(self, tournament, settings, n):
        """Incontri di ogni formato con ``n`` iscritti: ``[{format, ready, matches}]``."""
        result = []
        for fmt in FORMATS:
            if fmt == settings['format']:
                options, third = settings['options'], settings['thirdPlace']
            else:
                options, third = default_options(fmt), tournament['thirdPlace']
            result.append({'format': fmt, 'ready': fmt in STARTABLE, 'matches': match_count(fmt, n, options, third)})
        return result

    # --- Richieste -------------------------------------------------------------------

    def start_check(self, tournament_id, account_id, combo):
        """Controlli prima della schermata «Avvia»: ``{players, settings, counts}``."""
        tournament, players = self.startable(tournament_id, account_id, combo)
        settings = format_settings(tournament, {})
        return {'players': self.player_values(tournament, players), 'settings': settings,
                'counts': self.counts(tournament, settings, len(players)),
                'draft': self.restored_draft(tournament, players)}

    def restored_draft(self, tournament, players):
        """Bozza salvata e ricontrollata: ``{step, settings, order, slots, crossings, playersChanged}`` o ``None``."""
        draft = tournament['startDraft']
        if not draft:
            return None
        try:
            settings = format_settings(tournament, draft.get('settings'))
        except TournamentError:
            return None
        step = draft.get('step') if draft.get('step') in STEPS else 1
        ids = [player['id'] for player in players]
        order, slots = draft.get('order'), draft.get('slots')
        changed = sorted(draft.get('players') or []) != sorted(ids)
        if not changed:
            try:
                order = check_order(order, ids) if order is not None else None
                slots = check_positions(settings['format'], slots, ids) \
                    if slots is not None and order is not None else None
            except TournamentError:
                changed = True
        if changed:
            order, slots, step = None, None, min(step, 2)
        crossings = draft.get('crossings')
        try:
            crossings = self.checked_crossings(settings, slots, len(ids), crossings)
        except TournamentError:
            crossings = None
        return {'step': step, 'settings': settings, 'order': order, 'slots': slots, 'crossings': crossings,
                'playersChanged': changed}

    @staticmethod
    def checked_crossings(settings, slots, n, crossings):
        """Incroci ``crossings`` ricontrollati (solo per la doppia), ``None`` se non dati."""
        if crossings is None:
            return None
        if settings['format'] != 'double':
            raise TournamentError('Gli incroci dei perdenti valgono solo per la doppia eliminazione.')
        return check_crossings(crossings, len(slots) if slots is not None else bracket_size(n))

    def save_draft(self, tournament_id, account_id, combo, draft):
        """Salva la bozza ``{step, settings, order?, slots?, crossings?}`` (``None`` la cancella): ``{ok}``."""
        tournament, players = self.startable(tournament_id, account_id, combo)
        if draft is None:
            value = None
        else:
            if not isinstance(draft, dict) or draft.get('step') not in STEPS:
                raise TournamentError('Bozza dell\'avvio non valida.')
            ids = [player['id'] for player in players]
            settings = format_settings(tournament, draft.get('settings'))
            order = draft.get('order')
            order = check_order(order, ids) if order is not None else None
            slots = draft.get('slots')
            slots = check_positions(settings['format'], slots, ids) \
                if slots is not None and order is not None else None
            crossings = self.checked_crossings(settings, slots, len(ids), draft.get('crossings'))
            value = {'step': draft['step'], 'settings': settings, 'order': order, 'slots': slots, 'crossings': crossings,
                     'players': sorted(ids), 'savedAt': self.now()}
        self.tournaments.repo.update(tournament['id'], {'startDraft': value}, self.now())
        return {'ok': True}

    def plan(self, tournament, players, settings, order, slots, crossings=None):
        """Impostazioni normalizzate, teste di serie e incontri (con chiavi locali)."""
        settings = format_settings(tournament, settings)
        values = self.player_values(tournament, players)
        ids = [player['id'] for player in values]
        if order is None:
            ranked = seed_order([{'account': item['id'], 'xp': item['xp'], 'seconds': item['seconds']}
                                 for item in values], settings['seeding'], settings['seedingWeight'], self.rng)
            order = [item['account'] for item in ranked]
        else:
            order = check_order(order, ids)
        options = settings['options']
        if settings['format'] == 'round_robin':
            # Nel girone le «caselle» sono le posizioni nel calendario a rotazione; le teste di serie decidono i lati.
            slots = list(order) if slots is None else check_ring(slots, ids)
            if crossings is not None:
                raise TournamentError('Gli incroci dei perdenti valgono solo per la doppia eliminazione.')
            matches = layout_round_robin(slots, settings['roundSeries'], options['legs'], order)
        else:
            slots = first_round_slots(order) if slots is None else check_slots(slots, ids)
            crossings = self.checked_crossings(settings, slots, len(ids), crossings)
            if settings['format'] == 'double':
                crossings = crossings or standard_crossings(len(slots))
                # Nella doppia il 3° posto è chi perde la finale dei perdenti: il campo non conta.
                matches = layout_double(slots, settings['roundSeries'], settings['finalSeries'],
                                        options['grandFinal'], options['grandSeries'], order, crossings)
            else:
                matches = layout_from_slots(slots, settings['roundSeries'], options.get('semiSeries'),
                                            settings['finalSeries'], settings['thirdPlace'], order)
        by_id = {item['id']: item for item in values}
        shown = self.seed_values(settings, values)
        seeds = [dict(by_id[account], seed=position + 1, value=shown[account]) for position, account in enumerate(order)]
        return settings, seeds, order, slots, crossings, matches

    def seed_values(self, settings, values):
        """Valore usato per ogni iscritto: ``{id: XP, secondi, punteggio del misto o None}``."""
        ranked = seed_order([{'account': item['id'], 'xp': item['xp'], 'seconds': item['seconds']} for item in values],
                            settings['seeding'], settings['seedingWeight'], random.Random(0))
        return {item['account']: item['value'] for item in ranked}

    def start_preview(self, tournament_id, account_id, combo, settings, order=None, slots=None, crossings=None):
        """Teste di serie e tabellone senza salvare: ``{settings, seeds, order, slots, crossings, matches, count}``.

        ``crossings`` (solo doppia, altrimenti ``None``) sono quelli dati o gli standard.
        """
        tournament, players = self.startable(tournament_id, account_id, combo)
        settings, seeds, order, slots, crossings, matches = self.plan(tournament, players, settings, order, slots,
                                                                      crossings)
        return {'settings': settings, 'seeds': seeds, 'order': order, 'slots': slots, 'crossings': crossings,
                'matches': public_preview(matches),
                'count': match_count(settings['format'], len(players), settings['options'], settings['thirdPlace'])}

    def start(self, tournament_id, account_id, combo, settings, order, slots=None, crossings=None):
        """Avvia il torneo con le impostazioni, le teste di serie ``order`` e le caselle ``slots``: ``{tournament}``."""
        if order is None:
            raise TournamentError('Indica l\'ordine delle teste di serie.')
        service = self.tournaments
        with self.matches.db.transaction():
            tournament, players = self.startable(tournament_id, account_id, combo)
            settings, _, order, _, _, matches = self.plan(tournament, players, settings, order, slots, crossings)
            at = self.now()
            values = dict(settings, status='running', registrationClosed=True, startedAt=at, startDraft=None)
            if settings['format'] in ('double', 'round_robin'):
                # Doppia: il 3° è chi perde la finale dei perdenti; girone: il podio viene dalla classifica.
                values['thirdPlace'] = False
            service.repo.update(tournament['id'], values, at)
            self.matches.set_seeds(tournament['id'], {account: position + 1 for position, account in enumerate(order)})
            self.matches.create_all(tournament['id'], matches)
        log.info('Torneo %d avviato con %d iscritti.', tournament['id'], len(players))
        return {'tournament': service.public(service.repo.get(tournament['id']))}

    # --- Incontri --------------------------------------------------------------------

    def running_match(self, tournament_id, match_id):
        """Torneo in corso e suo incontro ``match_id`` da giocare (il prossimo o quello in gioco)."""
        tournament = self.tournaments.current(tournament_id)
        if tournament['status'] != 'running':
            raise TournamentError('Il torneo non è in corso.')
        match = self.matches.get(match_id) if isinstance(match_id, int) and not isinstance(match_id, bool) else None
        if match is None or match['tournamentId'] != tournament['id']:
            raise TournamentError('Incontro non trovato.')
        if match['status'] == 'done':
            raise TournamentError('L\'incontro è già concluso.')
        if match['playerA'] is None or match['playerB'] is None:
            raise TournamentError('L\'incontro non ha ancora i due giocatori.')
        pending = [item for item in self.matches.list(tournament['id']) if item['status'] in ('ready', 'playing')]
        playing = [item for item in pending if item['status'] == 'playing']
        following = playing[0] if playing else min(pending, key=lambda item: item['playOrder']) if pending else None
        if following is None or following['id'] != match['id']:
            raise TournamentError('Si gioca solo il prossimo incontro.')
        return tournament, match

    def game_no(self, match):
        """Numero (da 1) della prossima partita dell'incontro."""
        return len(self.matches.games(match['id'])) + 1

    def side_of(self, tournament, match, game_no, draw=True):
        """Lato di ``player_a`` nella partita ``game_no``: ``(lato, sorteggiato)``; ``None`` con i lati liberi."""
        sides = tournament['sides']
        if sides == 'random':
            key = (match['id'], game_no)
            if key not in self.drawn:
                if not draw:
                    return None, True
                self.drawn[key] = game_sides(game_no, sides, rng=self.rng)
            return self.drawn[key], True
        return game_sides(game_no, sides, tournament['advantagedSide']), False

    def match_screen(self, tournament_id, match_id):
        """Schermata «Incontro»: ``{tournament, match, players, gameNo, series, wins, sides, sideA, drawn, savesLocked,
        played}``.

        ``players`` sono ``[player_a, player_b]`` (``{id, name, color, seed}``),
        ``wins`` le partite vinte da ciascuno, ``sides`` la scelta dei lati del
        torneo e ``sideA`` il lato di ``player_a`` (``None`` con i lati liberi:
        lo scelgono i giocatori). ``drawn`` è vero con i lati sorteggiati.
        ``played`` è la partita finita da dichiarare (``{gameNo, sideA}``),
        oppure ``None``: in quel caso numero e lati sono della partita dopo.
        ``rules`` sono le regole della dichiarazione (``game_rules``:
        ``{draws, score, fixed}``), ``drawCount`` le partite pari e ``scores``
        il punteggio totale di ciascuno.
        """
        tournament, match = self.running_match(tournament_id, match_id)
        game_no = self.game_no(match)
        played = self.ended.get(match['id'])
        side, drawn = self.side_of(tournament, match, game_no, draw=played is None)
        people = {player['id']: player for player in self.tournaments.repo.players(tournament['id'])}
        games = self.matches.games(match['id'])
        players = []
        for account_id in (match['playerA'], match['playerB']):
            person = people.get(account_id) or {'id': account_id, 'name': '?', 'color': None, 'seed': None}
            players.append({key: person.get(key) for key in ('id', 'name', 'color', 'seed')})
        return {'tournament': tournament['id'], 'match': match['id'], 'players': players, 'gameNo': game_no,
                'series': match['series'], 'status': match['status'],
                'wins': [sum(1 for game in games if game['winnerId'] == account_id)
                         for account_id in (match['playerA'], match['playerB'])],
                'sides': tournament['sides'], 'sideA': side, 'drawn': drawn,
                'savesLocked': bool(tournament['savesLocked']),
                'played': {'gameNo': played['gameNo'], 'sideA': played['sideA']} if played else None,
                'rules': self.rules_of(tournament, match),
                'drawCount': sum(1 for game in games if game['winnerId'] is None),
                'scores': score_totals(games)}

    def rules_of(self, tournament, match):
        """Regole della dichiarazione delle partite di ``match`` (``tournament_formats.game_rules``)."""
        mini = match['bracket'] == 'playoff' and playoff_mini(
            [format_match(item) for item in self.matches.list(tournament['id'])], format_match(match))
        return game_rules(tournament['format'], match['bracket'], tournament.get('options'), mini)

    def play_match(self, tournament_id, match_id, account_id, side=None):
        """Partita da avviare: ``{system, game, players, match}`` per ``PlayService.start``.

        ``account_id`` deve essere uno dei due giocatori o il creatore. ``side``
        (lato di ``player_a``, ``p1``/``p2``) conta solo con i lati liberi;
        altrimenti si usa quello calcolato (o sorteggiato in ``match_screen``).
        ``players`` è ``[P1, P2]`` della partita; ``match`` è ``{tournament,
        match, gameNo, sideA, savesLocked, state, core, sram}``: ``state`` è lo
        stato di partenza del torneo (``None`` senza stato) con il suo
        ``core``, ``sram`` la cartella del salvataggio interno del torneo.
        """
        tournament, match = self.running_match(tournament_id, match_id)
        if account_id not in (match['playerA'], match['playerB'], tournament['creatorId']):
            raise TournamentError('L\'incontro lo avvia uno dei due giocatori o chi ha creato il torneo.')
        game_no = self.game_no(match)
        if tournament['sides'] == 'free':
            if side is None:
                side = 'p1'
            if side not in SIDES:
                raise TournamentError('Lato non valido.')
        else:
            side, _ = self.side_of(tournament, match, game_no)
        players = [match['playerA'], match['playerB']] if side == 'p1' else [match['playerB'], match['playerA']]
        service = self.tournaments
        state = service.state_path(tournament) if tournament['state'] else None
        if state is not None and not os.path.isfile(state):
            log.warning('Stato di partenza del torneo %d mancante: si parte dall\'inizio.', tournament['id'])
            state = None
        return {'system': tournament['system'], 'game': tournament['game'], 'players': players,
                'match': {'tournament': tournament['id'], 'match': match['id'], 'gameNo': game_no, 'sideA': side,
                          'savesLocked': bool(tournament['savesLocked']), 'state': state,
                          'core': tournament['core'] or None if state else None,
                          'sram': service.sram_dir(tournament['id'])}}

    def match_started(self, match):
        """L'incontro ``match`` (di ``play_match``) è partito: passa a ``playing`` alla prima partita.

        Una partita finita e non dichiarata dello stesso incontro non conta più.
        """
        self.drawn.pop((match['match'], match['gameNo']), None)
        self.ended.pop(match['match'], None)
        self.started[match['match']] = {'gameNo': match['gameNo'], 'sideA': match['sideA']}
        current = self.matches.get(match['match'])
        if current is not None and current['status'] == 'ready':
            self.matches.update(current['id'], status='playing', startedAt=self.now())
            log.info('Incontro %d del torneo %d iniziato.', current['id'], match['tournament'])

    def match_ended(self, match_id, session_id):
        """Fine di una partita dell'incontro: ``session_id`` è la sua sessione; la partita va dichiarata."""
        played = self.started.pop(match_id, None) or {'gameNo': None, 'sideA': None}
        self.ended[match_id] = dict(played, sessionId=session_id)

    # --- Osservatori delle partite (estensioni) --------------------------------------

    def add_game_listener(self, listener):
        """Aggiunge un osservatore delle partite degli incontri (README «Estensioni dei tornei»).

        ``listener`` ha ``game_started(info)``, chiamata quando RetroArch è
        partito, e ``game_ended(info)``, chiamata quando si è chiuso, che
        restituisce l'esito della partita oppure ``None`` (si dichiara a mano).
        ``info`` è ``{tournament, match, gameNo, sideA, players, core}``:
        ``tournament`` il torneo (con ``addons``, ``system``, ``game``),
        ``players`` gli id di ``[P1, P2]`` della partita. L'esito è
        ``{addon, winner, score}``: ``winner`` è ``'p1'``, ``'p2'`` o
        ``None`` (pari), ``score`` ``[punti di P1, punti di P2]`` o ``None``.
        """
        self.game_listeners.append(listener)

    def game_info(self, match, core):
        """``info`` degli osservatori per la partita ``match`` (di ``play_match``), oppure ``None``."""
        tournament = self.tournaments.repo.get(match['tournament'])
        current = self.matches.get(match['match'])
        if tournament is None or current is None:
            return None
        side = match.get('sideA') or 'p1'
        players = [current['playerA'], current['playerB']] if side == 'p1' else [current['playerB'],
                                                                                    current['playerA']]
        return {'tournament': tournament, 'match': match['match'], 'gameNo': match['gameNo'], 'sideA': side,
                'players': players, 'core': core}

    def game_started(self, match, core):
        """RetroArch è partito per la partita ``match`` dell'incontro: avvisa gli osservatori."""
        if not self.game_listeners:
            return
        info = self.game_info(match, core)
        if info is None:
            return
        for listener in list(self.game_listeners):
            try:
                listener.game_started(info)
            except Exception:
                log.exception('Osservatore della partita non avviato')

    def game_verdict(self, match, core):
        """Primo esito degli osservatori per la partita appena chiusa, oppure ``None``."""
        if not self.game_listeners:
            return None
        info = self.game_info(match, core)
        verdict = None
        for listener in list(self.game_listeners):
            try:
                found = listener.game_ended(info) if info is not None else listener.game_ended(None)
            except Exception:
                log.exception('Esito dell\'osservatore della partita non letto')
                continue
            if verdict is None and found:
                verdict = (info, found)
        return verdict

    def auto_declare(self, match, core):
        """Dichiara da sola la partita appena chiusa con l'esito di un osservatore: risultato di ``declare``.

        Al risultato si aggiungono ``auto`` (l'estensione), ``replay`` (vero se
        la partita si rigioca), ``gameWinner`` (id del vincitore della
        partita, ``None`` se pari o da rigiocare) e ``gameDraw``.

        Senza esito, o se l'esito non si può registrare, ``None``: la partita
        resta da dichiarare a mano. Un pari nei tornei senza pareggi diventa
        «rigioca». Il punteggio si registra solo se il torneo lo chiede; se lo
        chiede e l'esito non lo ha, si dichiara a mano.
        """
        found = self.game_verdict(match, core)
        if found is None:
            return None
        info, verdict = found
        try:
            tournament, current = self.playing_match(match['tournament'], match['match'])
            if current['id'] not in self.ended:
                return None
            rules = self.rules_of(tournament, current)
            p1, p2 = info['players']
            winner_side = verdict.get('winner')
            draw = winner_side is None
            winner = None if draw else p1 if winner_side == 'p1' else p2 if winner_side == 'p2' else False
            if winner is False:
                return None
            if draw and not rules['draws']:
                draw = False
            score = None
            points = verdict.get('score')
            replay = winner is None and not draw
            if rules['score'] and not replay:
                if not isinstance(points, (list, tuple)) or len(points) != 2:
                    return None
                by_player = {p1: points[0], p2: points[1]}
                score = [by_player[current['playerA']], by_player[current['playerB']]]
            result = self.record_game(tournament, current, winner, draw, score)
        except TournamentError as error:
            log.warning('Partita dell\'incontro %s non dichiarata in automatico: %s', match['match'], error)
            return None
        log.info('Partita %s dell\'incontro %d dichiarata in automatico (%s).', match['gameNo'], match['match'],
                 verdict.get('addon'))
        return dict(result, auto=verdict.get('addon'), replay=replay, gameWinner=winner, gameDraw=draw)

    def last_session(self, match_id):
        """Sessione della partita finita e non ancora dichiarata dell'incontro, oppure ``None``."""
        return (self.ended.get(match_id) or {}).get('sessionId')

    def playing_match(self, tournament_id, match_id):
        """Torneo in corso e suo incontro ``match_id`` in gioco, altrimenti ``TournamentError``."""
        tournament = self.tournaments.current(tournament_id)
        if tournament['status'] != 'running':
            raise TournamentError('Il torneo non è in corso.')
        match = self.matches.get(match_id) if isinstance(match_id, int) and not isinstance(match_id, bool) else None
        if match is None or match['tournamentId'] != tournament['id']:
            raise TournamentError('Incontro non trovato.')
        if match['status'] != 'playing':
            raise TournamentError('L\'incontro non è in gioco.')
        return tournament, match

    def declare(self, tournament_id, match_id, account_id, combo, winner, draw=False, score=None):
        """Risultato della partita finita: ``{tournament, match, done, winner, draw, gameNo, wins, drawCount, scores,
        nextMatch, finished}``.

        ``account_id`` è il creatore (P1 prima dell'incontro), con ``combo`` se
        il torneo ha la combinazione. ``winner`` è ``player_a``, ``player_b``
        o ``None`` («rigioca»: la partita non conta e si rigioca lo stesso
        numero). ``draw`` vero = partita pari (nel girone con i pareggi
        ammessi, ``winner`` ``None``). ``score`` è ``[punti di player_a, punti
        di player_b]`` se il torneo registra il punteggio (vedi
        ``check_game_result``). Nel girone con i pareggi la serie è fissa:
        l'incontro si chiude all'ultima partita e può finire pari (``draw``
        vero e ``winner`` ``None``). ``done`` è vero quando l'incontro si chiude; ``gameNo`` è la
        partita dopo (``None`` a incontro chiuso), ``wins`` le vittorie di
        ``[player_a, player_b]``, ``nextMatch`` l'id del prossimo incontro del
        torneo (``None`` se non ce n'è). ``finished`` è vero se l'incontro era
        l'ultimo: il torneo è concluso e ``tournament.podium`` ha il podio.
        """
        tournament, match = self.playing_match(tournament_id, match_id)
        if account_id != tournament['creatorId']:
            raise TournamentError('Il risultato lo dichiara chi ha creato il torneo, entrato come P1 prima '
                                  'dell\'incontro.')
        self.tournaments.check_access(tournament, account_id, combo)
        return self.record_game(tournament, match, winner, draw, score)

    def record_game(self, tournament, match, winner, draw=False, score=None):
        """Registra la partita finita dell'incontro in gioco ``match`` (vedi ``declare``, senza i permessi)."""
        played = self.ended.get(match['id'])
        if played is None:
            raise TournamentError('Non c\'è una partita da dichiarare: prima si gioca.')
        rules = self.rules_of(tournament, match)
        outcome, score_a, score_b = check_game_result(rules, match['playerA'], match['playerB'], winner, draw, score)
        done = False
        result = None
        with self.matches.db.transaction():
            if outcome != 'replay':
                side = played['sideA']
                if side not in SIDES:
                    side, _ = self.side_of(tournament, match, self.game_no(match), draw=False)
                    side = side or 'p1'
                self.matches.add_game(match['id'], None if outcome == 'draw' else outcome, side, self.now(),
                                      score_a=score_a, score_b=score_b, session_id=played['sessionId'])
                games = self.matches.games(match['id'])
                done, result = series_result(match['series'], rules['fixed'], match['playerA'], match['playerB'],
                                             [game['winnerId'] for game in games])
                if done:
                    self.advance(tournament, match, result, draw=result is None)
            self.ended.pop(match['id'], None)
            finished = done and self.finish_if_over(tournament)
        if done:
            if result is None:
                log.info('Incontro %d del torneo %d finito pari.', match['id'], tournament['id'])
            else:
                log.info('Incontro %d del torneo %d vinto dal profilo %d.', match['id'], tournament['id'], result)
            if self.ingame is not None:
                self.ingame.drop_match(match['id'])
        games = self.matches.games(match['id'])
        pending = [item for item in self.matches.list(tournament['id']) if item['status'] in ('ready', 'playing')]
        following = min(pending, key=lambda item: (item['status'] != 'playing', item['playOrder'])) if pending else None
        service = self.tournaments
        return {'tournament': service.public(service.repo.get(tournament['id'])), 'match': match['id'], 'done': done,
                'winner': result if done else None, 'draw': done and result is None,
                'gameNo': None if done else len(games) + 1,
                'wins': [sum(1 for game in games if game['winnerId'] == account)
                         for account in (match['playerA'], match['playerB'])],
                'drawCount': sum(1 for game in games if game['winnerId'] is None), 'scores': score_totals(games),
                'nextMatch': following['id'] if following else None, 'finished': finished}

    def seeds_and_withdrawn(self, tournament):
        """Id degli iscritti in ordine di testa di serie e insieme dei ritirati."""
        players = self.tournaments.repo.players(tournament['id'])
        seeds = [player['id'] for player in sorted(players, key=lambda item: (item.get('seed') is None,
                                                                               item.get('seed') or 0))]
        return seeds, {player['id'] for player in players if player.get('withdrawn')}

    def save_local(self, stored, local):
        """Scrive gli incontri ``local`` cambiati rispetto a quelli salvati ``stored`` (``finishedAt`` compreso)."""
        before = {item['id']: item for item in stored}
        for item in local:
            old = before[item['id']]
            changes = {key: item[name] for name, key in ADVANCE_FIELDS if old[key] != item[name]}
            if 'walkover' in changes:
                changes['walkover'] = bool(changes['walkover'])
            if old['status'] != 'done' and item['status'] == 'done':
                changes['finishedAt'] = self.now()
            elif old['status'] == 'done' and item['status'] != 'done':
                changes['finishedAt'] = None
            if changes:
                self.matches.update(item['id'], **changes)

    def advance(self, tournament, match, winner, walkover=False, draw=False):
        """Chiude l'incontro ``match`` con ``winner`` e sposta vincitore e perdente negli incontri dopo.

        Con ``draw`` l'incontro del girone finisce pari. Gli incontri che
        diventano pronti con un ritirato si chiudono da soli a tavolino.
        """
        stored = self.matches.list(tournament['id'])
        local = [format_match(item) for item in stored]
        seeds, withdrawn = self.seeds_and_withdrawn(tournament)
        apply_winner(local, str(match['id']), winner, seeds, withdrawn, walkover, draw)
        self.save_local(stored, local)

    def finish_if_over(self, tournament):
        """Conclude il torneo se tutti gli incontri sono chiusi (dentro una transazione): vero se l'ha concluso.

        Scrive piazzamenti, premi, ``status='done'`` e ``finishedAt``. Nel
        girone finito crea prima gli spareggi che servono e, se dopo gli
        spareggi qualcuno è ancora pari sul podio, aspetta il sorteggio
        (``draw_lots``).
        """
        stored = self.matches.list(tournament['id'])
        local = [format_match(item) for item in stored]
        if not all_closed(local):
            return False
        if tournament['format'] == 'round_robin':
            return self.finish_league(tournament, local)
        self.conclude(tournament, placements(tournament['format'], local))
        return True

    def league_data(self, tournament, local):
        """``(teste di serie, ritirati, partite {chiave: [partite]})`` per classifica e spareggi del girone."""
        order, withdrawn = self.seeds_and_withdrawn(tournament)
        games = {str(match_id): items for match_id, items in self.matches.games_of(tournament['id']).items()}
        return order, withdrawn, games

    def finish_league(self, tournament, local):
        """Girone con tutti gli incontri chiusi: crea gli spareggi, aspetta il sorteggio o conclude."""
        order, withdrawn, games = self.league_data(tournament, local)
        options = tournament.get('options')
        state = playoff_state(order, local, games, options, withdrawn)
        if state['status'] == 'create':
            start = max([match['play_order'] or 0 for match in local] + [0])
            draws = bool(dict(default_options('round_robin'), **(options or {}))['draws'])
            matches = layout_playoff(state['groups'], tournament['roundSeries'], draws, order, start)
            self.matches.create_all(tournament['id'], matches)
            log.info('Torneo %d: %d incontri di spareggio per %s.', tournament['id'], len(matches),
                     ', '.join('il %d° posto' % group['place'] for group in state['groups']))
            return False
        if state['status'] != 'over':
            return False
        self.conclude(tournament, placements_league(league_standings(order, local, games, options, withdrawn)))
        return True

    def draw_lots(self, tournament_id, account_id, combo):
        """Sorteggio dell'admin tra chi è ancora pari sul podio dopo gli spareggi: conclude il torneo.

        Restituisce ``{tournament, draw}`` con ``draw`` = ``[{place, players}]``
        (giocatori nell'ordine estratto).
        """
        tournament = self.tournaments.current(tournament_id)
        if tournament['status'] != 'running':
            raise TournamentError('Il torneo non è in corso.')
        if account_id != tournament['creatorId']:
            raise TournamentError('Le azioni dell\'admin sono di chi ha creato il torneo, entrato come P1.')
        self.tournaments.check_access(tournament, account_id, combo)
        if tournament['format'] != 'round_robin':
            raise TournamentError('Il sorteggio c\'è solo nel girone all\'italiana.')
        with self.matches.db.transaction():
            local = [format_match(item) for item in self.matches.list(tournament['id'])]
            order, withdrawn, games = self.league_data(tournament, local)
            options = tournament.get('options')
            state = playoff_state(order, local, games, options, withdrawn) if all_closed(local) else None
            if state is None or state['status'] != 'draw':
                raise TournamentError('Non serve un sorteggio.')
            lots, draw = {}, []
            for group in state['groups']:
                players = list(group['players'])
                self.rng.shuffle(players)
                for position, player in enumerate(players):
                    lots[player] = position
                draw.append({'place': group['place'], 'players': players})
            standings = league_standings(order, local, games, options, withdrawn, lots=lots)
            self.conclude(tournament, placements_league(standings))
        log.info('Torneo %d: sorteggio %s.', tournament['id'], draw)
        return dict(self.result(tournament), draw=draw)

    def conclude(self, tournament, places):
        """Scrive piazzamenti ``places``, premi, ``status='done'`` e ``finishedAt`` (dentro una transazione)."""
        at = self.now()
        repo = self.tournaments.repo
        repo.set_places(tournament['id'], places)
        rewards = []
        for account, place in sorted(places.items(), key=lambda item: (item[1], item[0])):
            xp = REWARD_XP[place - 1] if tournament['rewards'] and place <= len(REWARD_XP) else 0
            rewards.append((account, place, xp))
        rewards_repo = self.tournaments.rewards_repo
        if rewards_repo is not None:
            rewards_repo.add_all(tournament['id'], full_title(tournament), rewards, at)
        repo.update(tournament['id'], {'status': 'done', 'finishedAt': at}, at)
        log.info('Torneo %d concluso: vince il profilo %s.', tournament['id'],
                 next((account for account, place in places.items() if place == 1), None))
        return True

    # --- Azioni dell'admin -----------------------------------------------------------

    def admin_match(self, tournament_id, match_id, account_id, combo):
        """Torneo in corso e suo incontro ``match_id``, dopo i controlli dell'admin."""
        tournament = self.tournaments.current(tournament_id)
        if tournament['status'] != 'running':
            raise TournamentError('Il torneo non è in corso.')
        if account_id != tournament['creatorId']:
            raise TournamentError('Le azioni dell\'admin sono di chi ha creato il torneo, entrato come P1.')
        self.tournaments.check_access(tournament, account_id, combo)
        match = self.matches.get(match_id) if isinstance(match_id, int) and not isinstance(match_id, bool) else None
        if match is None or match['tournamentId'] != tournament['id']:
            raise TournamentError('Incontro non trovato.')
        return tournament, match

    def check_not_live(self, match):
        """Errore se una partita dell'incontro è aperta sulla console."""
        play = self.tournaments.play
        current = play.playing_match() if play is not None else None
        if current and current.get('match') == match['id']:
            raise TournamentError('C\'è una partita dell\'incontro in gioco: va finita prima.')

    def forget(self, match_id):
        """Dimentica partite in memoria e slot temporanei dell'incontro chiuso o riaperto."""
        self.started.pop(match_id, None)
        self.ended.pop(match_id, None)
        for key in [key for key in self.drawn if key[0] == match_id]:
            self.drawn.pop(key, None)
        if self.ingame is not None:
            self.ingame.drop_match(match_id)

    def result(self, tournament):
        service = self.tournaments
        return {'tournament': service.public(service.repo.get(tournament['id']))}

    def walkover(self, tournament_id, match_id, account_id, combo, winner):
        """Vittoria a tavolino di ``winner`` nell'incontro ``match_id``: ``{tournament}``."""
        tournament, match = self.admin_match(tournament_id, match_id, account_id, combo)
        if match['status'] == 'done':
            raise TournamentError('L\'incontro è già concluso.')
        if match['playerA'] is None or match['playerB'] is None:
            raise TournamentError('L\'incontro non ha ancora i due giocatori.')
        if isinstance(winner, bool) or winner not in (match['playerA'], match['playerB']):
            raise TournamentError('Il vincitore non gioca questo incontro.')
        self.check_not_live(match)
        with self.matches.db.transaction():
            self.advance(tournament, match, winner, walkover=True)
            self.finish_if_over(tournament)
        self.forget(match['id'])
        log.info('Incontro %d del torneo %d vinto a tavolino dal profilo %d.', match['id'], tournament['id'], winner)
        return self.result(tournament)

    def withdraw(self, tournament_id, player_id, account_id, combo):
        """Ritira il giocatore ``player_id``: perde a tavolino l'incontro in cui si trova; ``{tournament}``.

        Nel girone perde a tavolino tutti gli incontri che gli restano (anche
        uno sospeso); i risultati giocati restano.
        """
        tournament = self.tournaments.current(tournament_id)
        if tournament['status'] != 'running':
            raise TournamentError('Il torneo non è in corso.')
        if account_id != tournament['creatorId']:
            raise TournamentError('Le azioni dell\'admin sono di chi ha creato il torneo, entrato come P1.')
        self.tournaments.check_access(tournament, account_id, combo)
        player = next((item for item in self.tournaments.repo.players(tournament['id'])
                       if item['id'] == player_id and not isinstance(player_id, bool)), None)
        if player is None:
            raise TournamentError('Il profilo non è iscritto al torneo.')
        if player['withdrawn']:
            raise TournamentError('Il giocatore è già ritirato.')
        active = [item for item in self.matches.list(tournament['id'])
                  if item['status'] != 'done' and not item['bye'] and player_id in (item['playerA'], item['playerB'])]
        league = tournament['format'] == 'round_robin'
        if not active:
            raise TournamentError('Ha già giocato tutti i suoi incontri.' if league else 'Il giocatore è già eliminato.')
        if league:
            return self.withdraw_league(tournament, player_id, sorted(active, key=lambda item: item['playOrder']))
        match = min(active, key=lambda item: item['playOrder'])
        self.check_not_live(match)
        with self.matches.db.transaction():
            self.tournaments.repo.set_withdrawn(tournament['id'], player_id, self.now())
            if match['playerA'] is not None and match['playerB'] is not None:
                other = match['playerB'] if match['playerA'] == player_id else match['playerA']
                self.advance(tournament, match, other, walkover=True)
                self.finish_if_over(tournament)
        if self.matches.get(match['id'])['status'] == 'done':
            self.forget(match['id'])
        log.info('Profilo %d ritirato dal torneo %d.', player_id, tournament['id'])
        return self.result(tournament)

    def withdraw_league(self, tournament, player_id, active):
        """Ritiro nel girone: tutti gli incontri ``active`` del giocatore vanno a tavolino agli avversari."""
        for match in active:
            self.check_not_live(match)
        with self.matches.db.transaction():
            self.tournaments.repo.set_withdrawn(tournament['id'], player_id, self.now())
            for match in active:
                current = self.matches.get(match['id'])
                if current['status'] == 'done':
                    continue
                other = current['playerB'] if current['playerA'] == player_id else current['playerA']
                self.advance(tournament, current, other, walkover=True)
            self.finish_if_over(tournament)
        for match in active:
            self.forget(match['id'])
        log.info('Profilo %d ritirato dal torneo %d: %d incontri a tavolino.', player_id, tournament['id'], len(active))
        return self.result(tournament)

    def can_undo(self, tournament, match):
        """``(tipo, problema)`` di «Annulla il risultato» sull'incontro salvato ``match`` (vedi ``undo_state``)."""
        local = [format_match(item) for item in self.matches.list(tournament['id'])]
        _, withdrawn = self.seeds_and_withdrawn(tournament)
        return undo_state(local, str(match['id']), withdrawn, len(self.matches.games(match['id'])))

    def undo(self, tournament_id, match_id, account_id, combo):
        """«Annulla il risultato» sull'incontro ``match_id``, un passo alla volta: ``{tournament, undone}``.

        ``undone`` è il tipo di ``undo_state`` appena annullato.
        """
        tournament, match = self.admin_match(tournament_id, match_id, account_id, combo)
        kind, problem = self.can_undo(tournament, match)
        if kind is None:
            raise TournamentError('Non c\'è un risultato da annullare.')
        if problem:
            raise TournamentError(problem)
        self.check_not_live(match)
        with self.matches.db.transaction():
            if match['status'] == 'done' and match['bracket'] == 'league':
                # Uno spareggio non ancora iniziato si cancella: si ricalcola a girone di nuovo finito.
                local = [format_match(item) for item in self.matches.list(tournament['id'])]
                if not playoff_started(local):
                    self.matches.delete_many([int(key) for key in playoff_keys(local)])
            if match['status'] != 'done':
                if kind == 'game':
                    self.matches.delete_last_game(match['id'])
                else:
                    for player in (match['playerA'], match['playerB']):
                        if player is not None:
                            self.tournaments.repo.set_withdrawn(tournament['id'], player, None)
            else:
                self.reopen(tournament, match, kind)
        if match['status'] == 'done':
            self.forget(match['id'])
        log.info('Annullato (%s) nell\'incontro %d del torneo %d.', kind, match['id'], tournament['id'])
        return dict(self.result(tournament), undone=kind)

    def reopen(self, tournament, match, kind):
        """Riapre l'incontro concluso ``match`` (dentro una transazione)."""
        stored = self.matches.list(tournament['id'])
        local = [format_match(item) for item in stored]
        _, withdrawn = self.seeds_and_withdrawn(tournament)
        loser = loser_of(format_match(match))
        revert_winner(local, str(match['id']), withdrawn)
        reopened = [match]
        if kind == 'withdrawal':
            if match['bracket'] in ('league', 'playoff'):
                reopened.extend(self.withdrawal_walkovers(tournament, stored, local, match, loser))
            self.tournaments.repo.set_withdrawn(tournament['id'], loser, None)
        elif kind == 'result':
            self.matches.delete_last_game(match['id'])
        for opened in reopened:
            games = self.matches.games(opened['id'])
            others = any(item['status'] == 'playing' for item in local if item['id'] != opened['id'])
            item = next(item for item in local if item['id'] == opened['id'])
            item['status'] = 'playing' if (games or opened['startedAt']) and not others else 'ready'
        self.save_local(stored, local)

    def withdrawal_walkovers(self, tournament, stored, local, match, player):
        """Nel girone, gli altri tavolini automatici del ritiro di ``player`` (chiusi dal ritiro in poi), riaperti in
        ``local``: restituisce gli incontri salvati riaperti. Un tavolino dato dall'admin prima del ritiro resta."""
        since = next((item['withdrawnAt'] for item in self.tournaments.repo.players(tournament['id'])
                      if item['id'] == player), None)
        result = []
        for saved in stored:
            item = next(value for value in local if value['id'] == saved['id'])
            if saved['id'] == match['id'] or item['bracket'] not in ('league', 'playoff') or \
                    item['status'] != 'done' or \
                    not item['walkover'] or loser_of(item) != player:
                continue
            if since is not None and (saved['finishedAt'] or '') < since:
                continue
            reopen_match(local, item)
            self.forget(saved['id'])
            result.append(saved)
        return result

    def suspend(self, tournament_id, match_id, account_id):
        """Sospende l'incontro in gioco (uno dei due giocatori o il creatore): ``{tournament}``.

        Le partite dichiarate e quella da dichiarare restano; si cancellano gli
        slot temporanei dell'incontro.
        """
        tournament, match = self.playing_match(tournament_id, match_id)
        if account_id not in (match['playerA'], match['playerB'], tournament['creatorId']):
            raise TournamentError('L\'incontro lo sospende uno dei due giocatori o chi ha creato il torneo.')
        if self.ingame is not None:
            self.ingame.drop_match(match['id'])
        log.info('Incontro %d del torneo %d sospeso.', match['id'], tournament['id'])
        service = self.tournaments
        return {'tournament': service.public(service.repo.get(tournament['id']))}
