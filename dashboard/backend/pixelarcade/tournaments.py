"""Torneo (README «Torneo»): creazione e gestione dalle Impostazioni.

- **Più tornei.** Bozze (``draft``) e tornei con le iscrizioni aperte
  (``open``) possono essere quanti si vuole; in corso (``running``) ce ne
  sarà uno solo alla volta (lo controllerà l'avvio). Conclusi (``done``) e
  annullati (``cancelled``) restano nello storico. Ogni operazione indica
  il torneo con ``id``.
- **Creatore.** Lo crea il P1 con il suo profilo. Tutti lo vedono, ma lo
  modifica solo il creatore: ogni operazione indica il profilo
  (``account``) e, se il torneo ha una combinazione, la combinazione
  (``combo``, sequenza di tasti logici). Senza combinazione basta il profilo.
  Solo l'eliminazione di una bozza non chiede la combinazione.
- **Combinazione.** Sequenza di tasti di qualsiasi lunghezza, anche vuota (=
  nessuna). Nel database c'è solo l'impronta PBKDF2 con il sale.
- **Stato di partenza.** Si registra giocando (``record``), con il creatore
  come P1, in tre modi (``source``): ``zero`` (dall'inizio, senza
  salvataggio interno), ``mine`` (dall'inizio con il salvataggio interno
  del creatore, per esempio i personaggi sbloccati) o ``slot`` (dallo stato
  di uno slot del creatore, con il suo salvataggio interno). All'uscita lo
  stato automatico di RetroArch va in ``<saves>/tournaments/<id>.state``
  (con la miniatura), il core resta quello della partita e il salvataggio
  interno della sessione diventa quello del torneo (``<id>-sram/``,
  ``recorded``). «Riprendi» e salvataggio interno del profilo non cambiano:
  il torneo ha la sua copia. Senza stato si parte dall'inizio del gioco.
- **Modifiche.** In bozza e con le iscrizioni aperte si cambia tutto; a
  torneo in corso solo titolo e descrizione. I partecipanti massimi non
  scendono sotto il numero degli iscritti.
- **Iscritti.** Con le iscrizioni aperte (``open``, non chiuse dall'admin)
  ogni profilo si iscrive (``join``) e si ritira (``leave``) da solo, nei
  limiti dei posti; si può essere iscritti a più tornei. L'admin (creatore
  e combinazione) iscrive altri profili (``add_player``, anche con le
  iscrizioni chiuse), li toglie (``remove_player``) e chiude o riapre le
  iscrizioni (``set_registration``): il torneo resta visibile. Alla
  chiusura la risposta dice quanti incontri si giocheranno con gli iscritti
  di quel momento (``matches``, ``None`` se il formato non sa ancora
  contarli).
- **Formato.** ``format`` (vedi ``tournament_formats``; per ora si sceglie
  solo l'eliminazione diretta) con le sue ``options``, le teste di serie
  (``seeding``: ``random``, ``xp``, ``time`` o ``mix``, con
  ``seedingWeight`` = peso degli XP nel misto, 0–100 a passi di 10) e il
  lato vantaggiato (``advantagedSide``: ``none``, ``p1``, ``p2``). Cambiando
  formato senza indicare le opzioni restano quelle compatibili. Le serie
  dei turni e della finale e il 3° posto dell'eliminazione restano nei
  loro campi; la semifinale è ``options.semiSeries`` (``None`` = come i
  turni).
- **Serie ed edizioni.** Ogni torneo è un'edizione di una serie (``create``
  fa la serie con la 1ª edizione). La serie ha nome, descrizione e
  combinazione, comuni alle edizioni; l'edizione ha un titolo facoltativo
  e la sua descrizione. ``new_edition`` copia l'edizione più recente non
  annullata (tranne titolo, data e iscritti, stato di partenza compreso)
  quando nessuna edizione della serie è in bozza, in iscrizione o in
  corso. Il numero si dà alla creazione (il più alto tra le non
  annullate + 1); annullare toglie il numero, eliminare lascia il buco.
  Eliminare l'ultima edizione elimina anche la serie. Classifiche e albo
  d'oro: ``series_rankings``.
"""

import datetime
import hashlib
import hmac
import logging
import os
import secrets
import shutil

from .errors import ProfileError, TournamentError, TournamentLockedError
from .fsutil import atomic_copy, png_complete
from .repositories.cores import now_iso
from .saves import keep_sram_files
from .series_rankings import rankings
from .tournament_formats import (FORMATS, READY, check_options, fit_series, league_standings, local_match,
                                 playoff_state,
                                 match_count, merge_options, played_count, series_choices,
                                 undo_state)

log = logging.getLogger(__name__)

TITLE_MAX = 40
DESCRIPTION_MAX = 300
# Partecipanti massimi (``None`` = nessun limite).
PLAYERS_MIN = 3
PLAYERS_MAX = 64
SERIES = (1, 3, 5)
SIDES = ('alternate', 'random', 'free')
# Tasti della combinazione: START conferma e SELECT ricomincia, quindi non ne fanno parte.
COMBO_BUTTONS = frozenset(('up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt'))
COMBO_MAX = 64
HASH_ITERATIONS = 100000
# XP del premio per piazzamento (1°, 2°, 3°).
REWARD_XP = (100, 50, 25)
# Giorni in cui un torneo concluso resta sulla scheda TOURNAMENT (da ``finished_at``).
DONE_VISIBLE_DAYS = 3
STATE_DIR = 'tournaments'
MONTHS = ('gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre',
          'ottobre', 'novembre', 'dicembre')
# Campi modificabili a torneo in corso.
RUNNING_FIELDS = ('title', 'description', 'name', 'seriesDescription')
# Campi copiati nella nuova edizione (lo stato di partenza si copia a parte).
EDITION_FIELDS = ('description', 'system', 'game', 'maxPlayers', 'roundSeries', 'finalSeries', 'thirdPlace',
                  'savesLocked', 'sides', 'rewards', 'format', 'options', 'seeding', 'seedingWeight',
                  'advantagedSide', 'addons')
# Partenze della registrazione dello stato (``record``).
SOURCES = ('zero', 'mine', 'slot')
# Teste di serie e lato vantaggiato.
SEEDINGS = ('random', 'xp', 'time', 'mix')
ADVANTAGED_SIDES = ('none', 'p1', 'p2')


def addons_off_only(value):
    """Vero se ``value`` (``addons`` di ``update``) spegne soltanto delle estensioni."""
    return isinstance(value, dict) and bool(value) and all(
        isinstance(item, dict) and item == {'enabled': False} for item in value.values())


def default_title(today=None):
    """«Torneo di novembre»: mese della data locale."""
    today = today or datetime.date.today()
    return 'Torneo di %s' % MONTHS[today.month - 1]


def full_title(tournament):
    """«GameNight Tournament · 2ª edizione — Japan version» (numero e titolo solo se ci sono)."""
    text = tournament.get('seriesName') or ''
    if tournament.get('edition'):
        text += ' · %dª edizione' % tournament['edition']
    if tournament.get('title'):
        text += ' — ' + tournament['title']
    return text


def check_combo(combo):
    """Sequenza valida di tasti logici (lista, anche vuota), altrimenti ``TournamentError``."""
    if combo is None:
        return []
    if not isinstance(combo, list) or len(combo) > COMBO_MAX or \
            any(not isinstance(button, str) or button not in COMBO_BUTTONS for button in combo):
        raise TournamentError('Combinazione non valida.')
    return combo


def hash_combo(combo, salt=None, iterations=HASH_ITERATIONS):
    """Impronta ``pbkdf2$<iterazioni>$<sale>$<impronta>`` della sequenza; vuota se la sequenza è vuota."""
    if not combo:
        return ''
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', ' '.join(combo).encode('ascii'), salt.encode('ascii'), iterations)
    return 'pbkdf2$%d$%s$%s' % (iterations, salt, digest.hex())


def combo_matches(stored, combo):
    """Vero se ``combo`` corrisponde all'impronta ``stored`` (impronta vuota: nessuna combinazione, sempre vero)."""
    if not stored:
        return True
    try:
        _, iterations, salt, _ = stored.split('$')
        iterations = int(iterations)
    except ValueError:
        return False
    if not isinstance(combo, list) or not combo:
        return False
    return hmac.compare_digest(hash_combo(combo, salt, iterations), stored)


def parse_start(value, now):
    """Data d'inizio ISO (anche con la ``Z`` finale) in UTC, al minuto; ``None`` se vuota.

    ``TournamentError`` se non è valida o non è nel futuro rispetto a ``now`` (ISO).
    """
    if value is None or value == '':
        return None
    if not isinstance(value, str):
        raise TournamentError('Data d\'inizio non valida.')
    try:
        moment = datetime.datetime.fromisoformat(value[:-1] + '+00:00' if value.endswith('Z') else value)
    except ValueError:
        raise TournamentError('Data d\'inizio non valida.')
    if moment.tzinfo is None:
        raise TournamentError('Data d\'inizio non valida.')
    moment = moment.astimezone(datetime.timezone.utc).replace(second=0, microsecond=0)
    if moment <= datetime.datetime.fromisoformat(now):
        raise TournamentError('La data d\'inizio è già passata.')
    return moment.isoformat(timespec='seconds')


def text_value(value, limit, label):
    if not isinstance(value, str):
        raise TournamentError('%s non valido.' % label)
    value = ' '.join(value.split())
    if len(value) > limit:
        raise TournamentError('%s troppo lungo: al massimo %d caratteri.' % (label, limit))
    return value


def flag(value, label):
    if not isinstance(value, bool):
        raise TournamentError('%s non valido.' % label)
    return value


def series(value, label, choices=SERIES):
    if isinstance(value, bool) or value not in choices:
        raise TournamentError('%s non valida.' % label)
    return value


# Serie dei turni accettate dal campo: le «al meglio di» e quelle fisse del girone con i pareggi.
ROUND_SERIES = (1, 2, 3, 5)


def round_series_for(fmt, options, value, given):
    """Serie dei turni per il formato e le opzioni: se ``given`` (scelta ora) deve essere ammessa, altrimenti
    si porta alla più vicina (accendendo i pareggi del girone 5 diventa 3, spegnendoli 2 diventa 3)."""
    choices = series_choices(fmt, options)
    if given:
        return series(value, 'Serie dei turni', choices)
    return fit_series(value, choices)


# Impostazioni del formato che l'admin può ritoccare all'avvio (le stesse della modale del formato).
FORMAT_SETTINGS = ('format', 'options', 'seeding', 'seedingWeight', 'advantagedSide', 'roundSeries', 'finalSeries',
                   'thirdPlace')


def format_settings(tournament, settings):
    """Impostazioni del formato normalizzate: quelle di ``tournament`` cambiate da ``settings``.

    ``settings`` ha solo chiavi di ``FORMAT_SETTINGS`` (le mancanti restano
    quelle del torneo); ``TournamentError`` se un valore non è valido o il
    formato non è pronto. Cambiando formato senza opzioni restano quelle compatibili.
    """
    if settings is None:
        settings = {}
    if not isinstance(settings, dict):
        raise TournamentError('Impostazioni del formato non valide.')
    unknown = [key for key in settings if key not in FORMAT_SETTINGS]
    if unknown:
        raise TournamentError('Campo sconosciuto: %s.' % unknown[0])
    result = {key: tournament[key] for key in FORMAT_SETTINGS}
    result.update(settings)
    if result['format'] not in FORMATS:
        raise TournamentError('Formato non valido.')
    if result['format'] not in READY:
        raise TournamentError('Questo formato non è ancora disponibile.')
    if 'options' in settings:
        result['options'] = check_options(result['format'], settings['options'])
    elif result['format'] != tournament['format']:
        result['options'] = merge_options(tournament['format'], tournament['options'], result['format'])
    else:
        result['options'] = check_options(result['format'], result['options'])
    if result['seeding'] not in SEEDINGS:
        raise TournamentError('Teste di serie non valide.')
    weight = result['seedingWeight']
    if isinstance(weight, bool) or not isinstance(weight, int) or not 0 <= weight <= 100 or weight % 10:
        raise TournamentError('Pesi delle teste di serie non validi.')
    if result['advantagedSide'] not in ADVANTAGED_SIDES:
        raise TournamentError('Lato vantaggiato non valido.')
    result['roundSeries'] = round_series_for(result['format'], result['options'],
                                             series(result['roundSeries'], 'Serie dei turni', ROUND_SERIES),
                                             'roundSeries' in settings)
    result['finalSeries'] = series(result['finalSeries'], 'Serie della finale')
    result['thirdPlace'] = flag(result['thirdPlace'], 'Valore')
    return result


def public_matches(matches, games=None, withdrawn=None):
    """Incontri salvati per l'interfaccia: ``key`` = id in testo, ``fromA``/``fromB`` puntano a quelle chiavi.

    ``games`` è ``{match_id: [partite]}`` (vedi ``TournamentMatchesRepository.games_of``).
    Con ``withdrawn`` (ritirati) ogni incontro ha anche ``undoKind``,
    ``canUndo`` e ``undoProblem`` di «Annulla il risultato» (vedi
    ``tournament_formats.undo_state``).
    """
    games = games or {}
    result = []
    for match in matches:
        item = {key: value for key, value in match.items() if key != 'tournamentId'}
        item['key'] = str(match['id'])
        item['games'] = games.get(match['id'], [])
        result.append(item)
    if withdrawn is not None:
        local = [local_match(match) for match in matches]
        for item in result:
            kind, problem = undo_state(local, item['key'], withdrawn, len(item['games']))
            item['undoKind'] = kind
            item['canUndo'] = kind is not None and problem is None
            item['undoProblem'] = problem
    return result


class TournamentService:
    """Tornei non conclusi e storico (vedi il modulo).

    ``repo`` è il ``TournamentsRepository``, ``profiles`` il
    ``ProfileService`` (profili, riepiloghi dei giochi), ``saves`` lo
    ``SaveStore`` (slot del creatore per la registrazione), ``library``
    serve a controllare che il gioco esista. ``now`` (ISO in UTC) e ``today`` (data locale) sono
    sostituibili nei test.
    """

    def __init__(self, repo, profiles, saves, library, data_dir, now=now_iso, today=None):
        self.repo = repo
        self.profiles = profiles
        self.saves = saves
        self.library = library
        self.root = os.path.join(data_dir, 'saves', STATE_DIR)
        self.now = now
        self.today = today
        # ``TournamentMatchesRepository``, assegnato in ``create_services``: incontri dei tornei in corso.
        self.matches_repo = None
        # ``PlayService``, assegnato in ``create_services``: partita aperta (vedi ``match_in_play``).
        self.play = None
        # ``TournamentRewardsRepository``, assegnato in ``create_services``: premi dei tornei conclusi.
        self.rewards_repo = None
        # Impostazioni delle estensioni per il torneo: ``{id dell'estensione: check(tournament, value)}``, dove
        # ``check`` restituisce il valore da salvare (un dizionario) o solleva ``TournamentError``. Le registrano le
        # estensioni in ``register``; un valore con ``enabled`` falso spegne l'estensione nel torneo.
        self.addon_settings = {}

    # --- Lettura ---------------------------------------------------------------------

    def state_path(self, tournament, ext='state'):
        return os.path.join(self.root, '%d.%s' % (tournament['id'], ext))

    def sram_dir(self, tournament_id):
        """Cartella del salvataggio interno del torneo."""
        return os.path.join(self.root, '%d-sram' % tournament_id)

    def public(self, tournament):
        """Torneo per l'interfaccia: senza l'impronta, con creatore, gioco e miniatura."""
        if tournament is None:
            return None
        item = {key: value for key, value in tournament.items() if key not in ('comboHash', 'state', 'startDraft')}
        item['combo'] = bool(tournament['comboHash'])
        item['fullTitle'] = full_title(tournament)
        item['series'] = {'id': tournament['seriesId'], 'name': tournament['seriesName'],
                          'description': tournament['seriesDescription']}
        item['hasState'] = bool(tournament['state'])
        item['thumb'] = bool(tournament['state']) and png_complete(self.state_path(tournament, 'png'))
        creator = self.profiles.repo.get(tournament['creatorId'])
        item['creator'] = {'id': tournament['creatorId'], 'name': creator['name'] if creator else '?',
                           'color': creator.get('color') if creator else None}
        item['players'] = self.repo.players(tournament['id'])
        item['formats'] = [{'id': fmt, 'ready': fmt in READY} for fmt in FORMATS]
        status = tournament['status']
        if status in ('running', 'done', 'cancelled') and self.matches_repo is not None:
            # Annulla il risultato solo a torneo in corso: per conclusi e annullati niente ``undoKind``.
            withdrawn = {player['id'] for player in item['players'] if player['withdrawn']} \
                if status == 'running' else None
            stored = self.matches_repo.list(tournament['id'])
            item['matches'] = public_matches(stored, self.matches_repo.games_of(tournament['id']), withdrawn)
            # Incontri senza bye né rivincite non giocate; ``{min, max}`` finché la rivincita è da decidere.
            item['count'] = played_count([local_match(match) for match in stored])
            if tournament['format'] == 'round_robin':
                item['standings'] = self.standings(tournament, item['players'], stored)
                item['playoff'] = self.playoff(tournament, item['players'], stored)
        if status == 'done':
            item['podium'] = self.podium(tournament, item['players'])
        if tournament['system'] and tournament['game']:
            item['gameInfo'] = self.profiles.game_summary('%s/%s' % (tournament['system'], tournament['game']))
        else:
            item['gameInfo'] = None
        return item

    def league_data(self, tournament, players):
        """``(teste di serie, partite {chiave: [partite]}, ritirati)`` del girone."""
        order = [player['id'] for player in sorted(players, key=lambda item: (item.get('seed') is None,
                                                                               item.get('seed') or 0, item['id']))]
        games = {str(match_id): items for match_id, items in self.matches_repo.games_of(tournament['id']).items()}
        withdrawn = {player['id'] for player in players if player.get('withdrawn')}
        return order, games, withdrawn

    def standings(self, tournament, players, stored):
        """Classifica del girone (``tournament_formats.league_standings``) con gli iscritti in ordine di testa di
        serie; a torneo concluso i pari rimasti si dividono con i piazzamenti salvati (sorteggio compreso)."""
        order, games, withdrawn = self.league_data(tournament, players)
        lots = {player['id']: player['place'] for player in players if player.get('place') is not None} \
            if tournament['status'] == 'done' else None
        return league_standings(order, [local_match(match) for match in stored], games, tournament['options'],
                                withdrawn, lots=lots)

    def playoff(self, tournament, players, stored):
        """Spareggi del girone (``tournament_formats.playoff_state``): ``{status, groups}``, con ``status`` ``none``
        se non ne servono e ``groups[].matches`` = chiavi degli incontri."""
        order, games, withdrawn = self.league_data(tournament, players)
        local = [local_match(match) for match in stored]
        state = playoff_state(order, local, games, tournament['options'], withdrawn)
        if state['status'] in ('league', 'create'):
            return {'status': 'none', 'groups': []}
        if state['status'] == 'over' and not state['groups']:
            return {'status': 'none', 'groups': []}
        return state

    def podium(self, tournament, players=None):
        """Podio del torneo concluso: ``[{id, name, color, place, xp}]`` per i piazzamenti fino al 3°.

        ``xp`` è il premio dato (0 con i premi spenti). Due 3° a pari merito
        senza incontro per il 3° posto.
        """
        players = players if players is not None else self.repo.players(tournament['id'])
        xp = {}
        if self.rewards_repo is not None:
            xp = {item['account']: item['xp'] for item in self.rewards_repo.of_tournament(tournament['id'])}
        placed = [player for player in players if player.get('place') is not None and player['place'] <= 3]
        placed.sort(key=lambda player: (player['place'], player.get('seed') or 0, player['id']))
        return [{'id': player['id'], 'name': player['name'], 'color': player['color'], 'place': player['place'],
                 'xp': xp.get(player['id'], 0)} for player in placed]

    def recently_done(self, tournament):
        """Vero se il torneo è concluso da meno di ``DONE_VISIBLE_DAYS`` giorni (resta sulla scheda)."""
        if tournament['status'] != 'done' or not tournament['finishedAt']:
            return False
        try:
            finished = datetime.datetime.fromisoformat(tournament['finishedAt'])
            now = datetime.datetime.fromisoformat(self.now())
        except ValueError:
            return False
        return now - finished < datetime.timedelta(days=DONE_VISIBLE_DAYS)

    def overview(self):
        """``{tournaments, recent, history, rewardXp}``.

        ``tournaments``: non conclusi, dal più recente; ``recent``: conclusi da
        meno di ``DONE_VISIBLE_DAYS`` giorni, per la scheda TOURNAMENT;
        ``history``: conclusi e annullati (l'archivio), dal più recente.
        """
        history = [self.public(item) for item in self.repo.history()]
        return {'tournaments': [self.public(item) for item in self.repo.active()],
                'recent': [item for item in history if self.recently_done(item)],
                'history': history,
                'series': [self.series_detail(item) for item in self.repo.all_series()],
                'rewardXp': list(REWARD_XP)}

    def series_detail(self, series):
        """Serie per l'interfaccia: ``{id, name, description, combo, creator, editions, canAdd, rankings,
        honours}``.

        ``editions`` (dalla più recente) sono ``{id, edition, title, fullTitle, status, startsAt, finishedAt}``;
        ``canAdd`` è vero se nessuna edizione è in bozza, in iscrizione o in corso; ``honours`` è l'albo d'oro,
        ``[{id, edition, fullTitle, finishedAt, winners: [{id, name, color}]}]`` dalla più recente.
        """
        editions = self.repo.editions(series['id'])
        done = []
        honours = []
        for item in editions:
            if item['status'] != 'done':
                continue
            players = self.repo.players(item['id'])
            matches = self.matches_repo.list(item['id']) if self.matches_repo is not None else []
            done.append({'players': players, 'matches': matches})
            honours.append({'id': item['id'], 'edition': item['edition'], 'fullTitle': full_title(item),
                            'finishedAt': item['finishedAt'],
                            'winners': [{'id': p['id'], 'name': p['name'], 'color': p['color']}
                                        for p in players if p.get('place') == 1]})
        creator = self.profiles.repo.get(series['creatorId'])
        return {'id': series['id'], 'name': series['name'], 'description': series['description'],
                'combo': bool(series['comboHash']),
                'creator': {'id': series['creatorId'], 'name': creator['name'] if creator else '?',
                            'color': creator.get('color') if creator else None},
                'editions': [{'id': item['id'], 'edition': item['edition'], 'title': item['title'],
                              'fullTitle': full_title(item), 'status': item['status'],
                              'startsAt': item['startsAt'], 'finishedAt': item['finishedAt']}
                             for item in editions],
                'canAdd': not any(item['status'] in ('draft', 'open', 'running') for item in editions),
                'rankings': rankings(done), 'honours': honours}

    def thumb(self, tournament_id):
        """Percorso della miniatura dello stato di partenza, oppure ``None``."""
        tournament = self.repo.get(tournament_id) if isinstance(tournament_id, int) else None
        if tournament is None or not tournament['state']:
            return None
        path = self.state_path(tournament, 'png')
        return path if png_complete(path) else None

    # --- Permessi --------------------------------------------------------------------

    def current(self, tournament_id):
        """Torneo non concluso ``tournament_id``, altrimenti ``TournamentError``."""
        tournament = self.repo.get(tournament_id) if isinstance(tournament_id, int) else None
        if tournament is not None and tournament['status'] == 'done':
            raise TournamentError('Il torneo è concluso.')
        if tournament is None or tournament['status'] == 'cancelled':
            raise TournamentError('Torneo non trovato.')
        return tournament

    def series_of(self, series_id):
        series = self.repo.series(series_id) if isinstance(series_id, int) else None
        if series is None:
            raise TournamentError('Serie non trovata.')
        return series

    def check_creator(self, tournament, account_id):
        if account_id != tournament['creatorId']:
            raise TournamentLockedError('Solo chi ha creato il torneo può modificarlo.')

    def check_access(self, tournament, account_id, combo):
        """Creatore e, se il torneo ce l'ha, combinazione giusta; altrimenti ``TournamentLockedError``."""
        self.check_creator(tournament, account_id)
        if not combo_matches(tournament['comboHash'], combo):
            raise TournamentLockedError('Combinazione sbagliata.')

    def unlock(self, tournament_id, account_id, combo):
        """Controlla profilo e combinazione prima di «Gestisci»: ``{ok: true}``."""
        self.check_access(self.current(tournament_id), account_id, combo)
        return {'ok': True}

    # --- Operazioni ------------------------------------------------------------------

    def create(self, account_id):
        """Nuova serie del P1 ``account_id`` con la 1ª edizione in bozza: ``{tournament}``."""
        self.profiles.account(account_id)
        tournament_id = self.repo.create(account_id, default_title(self.today() if self.today else None),
                                         self.now())
        log.info('Torneo %d creato dal profilo %s.', tournament_id, account_id)
        return {'tournament': self.public(self.repo.get(tournament_id))}

    def update(self, tournament_id, account_id, combo, changes):
        """Modifica i campi ``changes`` del torneo ``tournament_id``: ``{tournament}``.

        Chiavi: ``title``, ``description``, ``startsAt`` (ISO o ``None``),
        ``game`` (``{system, id}`` o ``None``), ``clearState`` (``True``:
        niente stato, si parte dall'inizio), ``maxPlayers`` (``None`` o 3–64),
        ``roundSeries``, ``finalSeries`` (1, 3, 5), ``thirdPlace``,
        ``savesLocked``, ``rewards`` (booleani), ``sides``, ``newCombo``
        (sequenza, vuota = nessuna), ``format``, ``options``, ``seeding``,
        ``seedingWeight``, ``advantagedSide`` (vedi il modulo), ``addons``
        (``{id dell'estensione: valore}``, controllato da
        ``addon_settings``). Cambiando gioco si tolgono lo stato e il
        salvataggio interno del torneo. A torneo in corso, oltre a titolo e
        descrizione, si può solo spegnere un'estensione (``addons`` con
        ``{id: {enabled: False}}``), mai riaccenderla.
        """
        tournament = self.current(tournament_id)
        self.check_access(tournament, account_id, combo)
        if not isinstance(changes, dict) or not changes:
            raise TournamentError('Nessuna modifica.')
        if tournament['status'] == 'running' and any(key not in RUNNING_FIELDS and not
                                                     (key == 'addons' and addons_off_only(value))
                                                     for key, value in changes.items()):
            raise TournamentError('A torneo in corso si cambiano solo titolo e descrizione.')
        values = {}
        series_values = {}
        clear_state = False
        for key, value in changes.items():
            if key == 'title':
                values['title'] = text_value(value, TITLE_MAX, 'Titolo dell\'edizione')
            elif key == 'name':
                series_values['name'] = text_value(value, TITLE_MAX, 'Nome della serie')
                if not series_values['name']:
                    raise TournamentError('Scrivi il nome della serie.')
            elif key == 'seriesDescription':
                series_values['description'] = text_value(value, DESCRIPTION_MAX, 'Testo della descrizione')
            elif key == 'description':
                values['description'] = text_value(value, DESCRIPTION_MAX, 'Testo della descrizione')
            elif key == 'startsAt':
                values['startsAt'] = parse_start(value, self.now())
            elif key == 'game':
                values.update(self.game_values(value))
                clear_state = True
            elif key == 'maxPlayers':
                if value is not None and (isinstance(value, bool) or not isinstance(value, int) or
                                          not PLAYERS_MIN <= value <= PLAYERS_MAX):
                    raise TournamentError('Numero di partecipanti non valido.')
                if value is not None and value < len(self.repo.players(tournament['id'])):
                    raise TournamentError('Ci sono già più iscritti: togline qualcuno prima di ridurre i posti.')
                values['maxPlayers'] = value
            elif key == 'roundSeries':
                values['roundSeries'] = series(value, 'Serie dei turni', ROUND_SERIES)
            elif key == 'finalSeries':
                values['finalSeries'] = series(value, 'Serie della finale')
            elif key in ('thirdPlace', 'savesLocked', 'rewards'):
                values[key] = flag(value, 'Valore')
            elif key == 'sides':
                if value not in SIDES:
                    raise TournamentError('Scelta dei lati non valida.')
                values['sides'] = value
            elif key == 'format':
                if value not in FORMATS:
                    raise TournamentError('Formato non valido.')
                if value not in READY:
                    raise TournamentError('Questo formato non è ancora disponibile.')
                values['format'] = value
            elif key == 'options':
                if not isinstance(value, dict):
                    raise TournamentError('Opzioni del formato non valide.')
                values['options'] = value
            elif key == 'seeding':
                if value not in SEEDINGS:
                    raise TournamentError('Teste di serie non valide.')
                values['seeding'] = value
            elif key == 'seedingWeight':
                if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 100 or value % 10:
                    raise TournamentError('Pesi delle teste di serie non validi.')
                values['seedingWeight'] = value
            elif key == 'advantagedSide':
                if value not in ADVANTAGED_SIDES:
                    raise TournamentError('Lato vantaggiato non valido.')
                values['advantagedSide'] = value
            elif key == 'addons':
                values['addons'] = self.addon_values(tournament, value)
            elif key == 'newCombo':
                series_values['comboHash'] = hash_combo(check_combo(value))
            elif key == 'clearState':
                if value is not True:
                    raise TournamentError('Valore non valido.')
                clear_state = True
            else:
                raise TournamentError('Campo sconosciuto: %s.' % key)
        fmt = values.get('format', tournament['format'])
        # Cambiando il formato nelle Impostazioni la bozza dell'avvio non vale più: conta l'ultima scelta.
        if any(key in values and values[key] != tournament[key] for key in FORMAT_SETTINGS):
            values['startDraft'] = None
        if 'options' in values:
            values['options'] = check_options(fmt, values['options'])
        elif fmt != tournament['format']:
            values['options'] = merge_options(tournament['format'], tournament['options'], fmt)
        current = values.get('roundSeries', tournament['roundSeries'])
        fitted = round_series_for(fmt, values.get('options', tournament['options']), current, 'roundSeries' in values)
        if fitted != tournament['roundSeries'] or 'roundSeries' in values:
            values['roundSeries'] = fitted
        if clear_state:
            self.remove_state(tournament)
            values.update(state='', core=None)
        if series_values:
            self.repo.update_series(tournament['seriesId'], series_values, self.now())
        self.repo.update(tournament['id'], values, self.now())
        return {'tournament': self.public(self.repo.get(tournament['id']))}

    def addon_values(self, tournament, changes):
        """Impostazioni delle estensioni con le modifiche ``changes`` (``{id: valore}``) controllate."""
        if not isinstance(changes, dict) or not changes:
            raise TournamentError('Impostazioni delle estensioni non valide.')
        values = dict(tournament.get('addons') or {})
        for addon_id, value in changes.items():
            check = self.addon_settings.get(addon_id)
            if check is None:
                raise TournamentError('Estensione non installata: %s.' % addon_id)
            if tournament['status'] == 'running':
                values[addon_id] = dict(values.get(addon_id) or {}, enabled=False)
                continue
            values[addon_id] = check(tournament, value)
        return values

    # --- Serie -----------------------------------------------------------------------

    def check_series_access(self, series, account_id, combo):
        if account_id != series['creatorId']:
            raise TournamentLockedError('Solo chi ha creato il torneo può modificarlo.')
        if not combo_matches(series['comboHash'], combo):
            raise TournamentLockedError('Combinazione sbagliata.')

    def update_series(self, series_id, account_id, combo, changes):
        """Nome (``name``) e descrizione (``description``) della serie: ``{series}``."""
        series = self.series_of(series_id)
        self.check_series_access(series, account_id, combo)
        if not isinstance(changes, dict) or not changes:
            raise TournamentError('Nessuna modifica.')
        values = {}
        for key, value in changes.items():
            if key == 'name':
                values['name'] = text_value(value, TITLE_MAX, 'Nome della serie')
                if not values['name']:
                    raise TournamentError('Scrivi il nome della serie.')
            elif key == 'description':
                values['description'] = text_value(value, DESCRIPTION_MAX, 'Testo della descrizione')
            else:
                raise TournamentError('Campo sconosciuto: %s.' % key)
        self.repo.update_series(series['id'], values, self.now())
        return {'series': self.series_detail(self.repo.series(series['id']))}

    def new_edition(self, series_id, account_id, combo):
        """Nuova edizione in bozza, copia della più recente non annullata: ``{tournament}``."""
        series = self.series_of(series_id)
        self.check_series_access(series, account_id, combo)
        editions = self.repo.editions(series['id'])
        if any(item['status'] in ('draft', 'open', 'running') for item in editions):
            raise TournamentError('C’è già un’edizione da concludere: finiscila o annullala prima.')
        source = next((item for item in editions if item['status'] != 'cancelled'), None) or \
            (editions[0] if editions else None)
        values = {key: source[key] for key in EDITION_FIELDS} if source else {}
        if source and (not source['system'] or self.library.find(source['system'], source['game']) is None):
            values.update(system=None, game=None)
        tournament_id = self.repo.create_edition(series['id'], series['creatorId'], values, self.now())
        tournament = self.repo.get(tournament_id)
        if source and source['state'] and values.get('game') and os.path.exists(self.state_path(source)):
            os.makedirs(self.root, mode=0o700, exist_ok=True)
            atomic_copy(self.state_path(source), self.state_path(tournament))
            if png_complete(self.state_path(source, 'png')):
                atomic_copy(self.state_path(source, 'png'), self.state_path(tournament, 'png'))
            if os.path.isdir(self.sram_dir(source['id'])):
                shutil.copytree(self.sram_dir(source['id']), self.sram_dir(tournament_id))
            self.repo.update(tournament_id, {'state': os.path.basename(self.state_path(tournament)),
                                             'core': source['core']}, self.now())
        log.info('Edizione %s della serie %d creata (torneo %d).', tournament['edition'], series['id'], tournament_id)
        return {'tournament': self.public(self.repo.get(tournament_id))}

    def delete_series(self, series_id, account_id, combo):
        """Elimina la serie con tutte le edizioni (non con un'edizione in corso): ``{series: null}``.

        I premi già dati restano.
        """
        series = self.series_of(series_id)
        self.check_series_access(series, account_id, combo)
        editions = self.repo.editions(series['id'])
        if any(item['status'] == 'running' for item in editions):
            raise TournamentError('C’è un’edizione in corso: annullala prima di eliminare la serie.')
        for item in editions:
            self.remove_state(item)
        self.repo.delete_series(series['id'])
        log.info('Serie %d eliminata con %d edizioni.', series['id'], len(editions))
        return {'series': None}

    def game_values(self, value):
        if value is None:
            return {'system': None, 'game': None}
        if not isinstance(value, dict) or not isinstance(value.get('system'), str) or \
                not isinstance(value.get('id'), str):
            raise TournamentError('Gioco non valido.')
        if self.library.find(value['system'], value['id']) is None:
            raise TournamentError('Gioco non trovato.')
        return {'system': value['system'], 'game': value['id']}

    def record(self, tournament_id, account_id, combo, players, source):
        """Registrazione dello stato di partenza, da avviare con ``PlayService.start``.

        ``source`` è ``{kind, slot}`` (vedi il modulo; ``slot`` solo con
        ``slot``). La gioca il creatore come P1. Restituisce ``{id, system,
        game, sram, resume}``: ``sram`` è ``profile`` (salvataggio interno del
        creatore) o ``none``; ``resume`` è ``{account, slot}`` oppure ``None``.
        """
        tournament = self.current(tournament_id)
        self.check_access(tournament, account_id, combo)
        if tournament['status'] == 'running':
            raise TournamentError('A torneo in corso lo stato di partenza non si cambia.')
        if not tournament['system'] or not tournament['game']:
            raise TournamentError('Scegli prima il gioco del torneo.')
        if self.library.find(tournament['system'], tournament['game']) is None:
            raise TournamentError('Il gioco del torneo non è più nella libreria.')
        first = list(players or [None])[0]
        if first != account_id:
            raise TournamentError('Lo stato di partenza lo registra il creatore, come P1.')
        kind = source.get('kind') if isinstance(source, dict) else None
        if kind not in SOURCES:
            raise TournamentError('Scegli da dove partire.')
        resume = None
        if kind == 'slot':
            slot = source.get('slot')
            if isinstance(slot, bool) or not isinstance(slot, int) or not 0 <= slot <= 9:
                raise TournamentError('Salvataggio non valido.')
            if self.saves.state_file(account_id, tournament['system'], tournament['game'], slot) is None:
                raise TournamentError('Salvataggio non trovato.')
            resume = {'account': account_id, 'slot': slot}
        return {'id': tournament['id'], 'system': tournament['system'], 'game': tournament['game'],
                'sram': 'none' if kind == 'zero' else 'profile', 'resume': resume}

    def recorded(self, tournament_id, system_id, game_id, core, state_path, src_dir, basename):
        """Fine della registrazione: stato (se c'è) e salvataggio interno passano al torneo.

        ``state_path`` è lo stato automatico lasciato da RetroArch, oppure
        ``None`` (core che non salva gli stati). Restituisce ``{recorded}``:
        vero se il torneo ha il nuovo stato. Se nel frattempo il torneo è
        finito o ha cambiato gioco non si conserva niente. Il salvataggio
        interno del torneo diventa quello della sessione (il vecchio si toglie).
        """
        tournament = self.repo.get(tournament_id)
        if (tournament is None or tournament['status'] not in ('draft', 'open')
                or tournament['system'] != system_id or tournament['game'] != game_id):
            log.info('Registrazione dello stato del torneo %s ignorata: torneo cambiato.', tournament_id)
            return {'recorded': False}
        shutil.rmtree(self.sram_dir(tournament_id), ignore_errors=True)
        keep_sram_files(self.sram_dir(tournament_id), src_dir, basename)
        if state_path is None:
            return {'recorded': False}
        os.makedirs(self.root, mode=0o700, exist_ok=True)
        atomic_copy(state_path, self.state_path(tournament))
        png = state_path + '.png'
        if png_complete(png):
            atomic_copy(png, self.state_path(tournament, 'png'))
        elif os.path.exists(self.state_path(tournament, 'png')):
            os.unlink(self.state_path(tournament, 'png'))
        self.repo.update(tournament_id, {'state': os.path.basename(self.state_path(tournament)), 'core': core},
                         self.now())
        log.info('Stato di partenza del torneo %d registrato con %s.', tournament_id, core)
        return {'recorded': True}

    def remove_state(self, tournament):
        """Toglie stato, miniatura e salvataggio interno del torneo."""
        for ext in ('state', 'png'):
            try:
                os.unlink(self.state_path(tournament, ext))
            except FileNotFoundError:
                pass
        shutil.rmtree(self.sram_dir(tournament['id']), ignore_errors=True)

    def publish(self, tournament_id, account_id, combo):
        """Bozza → iscrizioni aperte: servono titolo e gioco; la data, se c'è, deve essere futura."""
        tournament = self.current(tournament_id)
        self.check_access(tournament, account_id, combo)
        if tournament['status'] != 'draft':
            raise TournamentError('Il torneo è già pubblicato.')
        if not tournament['seriesName']:
            raise TournamentError('Scrivi il nome della serie.')
        if not tournament['system'] or not tournament['game']:
            raise TournamentError('Scegli il gioco del torneo.')
        if tournament['startsAt'] and tournament['startsAt'] <= self.now():
            raise TournamentError('La data d\'inizio è già passata: cambiala o toglila.')
        at = self.now()
        self.repo.update(tournament['id'], {'status': 'open', 'publishedAt': at}, at)
        log.info('Torneo %d pubblicato.', tournament['id'])
        return {'tournament': self.public(self.repo.get(tournament['id']))}

    def delete(self, tournament_id, account_id, combo=None):
        """Elimina la bozza (senza combinazione) o un torneo dell'archivio: ``{tournament: null}``.

        Conclusi e annullati si eliminano con creatore e combinazione; i premi
        già dati restano (``tournament_rewards`` non ha chiave esterna sul torneo).
        """
        tournament = self.repo.get(tournament_id) if isinstance(tournament_id, int) else None
        if tournament is None:
            raise TournamentError('Torneo non trovato.')
        if tournament['status'] in ('done', 'cancelled'):
            self.check_access(tournament, account_id, combo)
            what = 'dall\'archivio'
        else:
            self.check_creator(tournament, account_id)
            if tournament['status'] != 'draft':
                raise TournamentError('Il torneo è pubblicato: si può solo annullare.')
            what = '(bozza)'
        self.remove_state(tournament)
        self.repo.delete(tournament['id'])
        log.info('Torneo %d eliminato %s.', tournament['id'], what)
        return {'tournament': None}

    def match_in_play(self, tournament_id):
        """Vero se una partita di un incontro del torneo è aperta sulla console (incontro sospeso tra due
        partite: no). ``play`` è il ``PlayService``, assegnato dopo la creazione."""
        current = self.play.playing_match() if self.play is not None else None
        return bool(current) and current.get('tournament') == tournament_id

    def cancel(self, tournament_id, account_id, combo):
        """Annulla un torneo pubblicato: va nello storico come annullato; stato e salvataggio interno si cancellano."""
        tournament = self.current(tournament_id)
        self.check_access(tournament, account_id, combo)
        if tournament['status'] == 'draft':
            raise TournamentError('Il torneo non è pubblicato: elimina la bozza.')
        if tournament['status'] == 'running' and self.match_in_play(tournament['id']):
            raise TournamentError('C’è un incontro in gioco: va finito prima di annullare il torneo.')
        self.remove_state(tournament)
        self.repo.update(tournament['id'], {'status': 'cancelled', 'state': '', 'startDraft': None, 'edition': None},
                         self.now())
        log.info('Torneo %d annullato.', tournament['id'])
        return {'tournament': None}

    # --- Iscritti --------------------------------------------------------------------

    def registering(self, tournament_id):
        """Torneo con le iscrizioni aperte (pubblicato e non avviato), altrimenti ``TournamentError``."""
        tournament = self.current(tournament_id)
        if tournament['status'] == 'draft':
            raise TournamentError('Il torneo non è ancora pubblicato.')
        if tournament['status'] != 'open':
            raise TournamentError('Il torneo è già iniziato.')
        return tournament

    def enroll(self, tournament, player_id, added_by):
        try:
            self.profiles.account(player_id)
        except ProfileError:
            raise TournamentError('Profilo non trovato.')
        if any(item['id'] == player_id for item in self.repo.players(tournament['id'])):
            raise TournamentError('Il profilo è già iscritto.')
        if not self.repo.add_player(tournament['id'], player_id, self.now(), added_by, tournament['maxPlayers']):
            raise TournamentError('Iscrizioni al completo.')
        log.info('Profilo %s iscritto al torneo %d.', player_id, tournament['id'])
        return {'tournament': self.public(self.repo.get(tournament['id']))}

    def withdraw(self, tournament, player_id):
        if not self.repo.remove_player(tournament['id'], player_id):
            raise TournamentError('Il profilo non è iscritto.')
        log.info('Profilo %s tolto dal torneo %d.', player_id, tournament['id'])
        return {'tournament': self.public(self.repo.get(tournament['id']))}

    def join(self, tournament_id, account_id):
        """Il profilo ``account_id`` si iscrive da solo: ``{tournament}``."""
        tournament = self.registering(tournament_id)
        if tournament['registrationClosed']:
            raise TournamentError('Le iscrizioni sono chiuse.')
        return self.enroll(tournament, account_id, None)

    def leave(self, tournament_id, account_id):
        """Il profilo ``account_id`` si ritira: ``{tournament}``."""
        tournament = self.registering(tournament_id)
        if tournament['registrationClosed']:
            raise TournamentError('Le iscrizioni sono chiuse: chiedi all\'admin di toglierti.')
        return self.withdraw(tournament, account_id)

    def add_player(self, tournament_id, account_id, combo, player_id):
        """L'admin iscrive il profilo ``player_id``: ``{tournament}``."""
        tournament = self.registering(tournament_id)
        self.check_access(tournament, account_id, combo)
        return self.enroll(tournament, player_id, account_id)

    def remove_player(self, tournament_id, account_id, combo, player_id):
        """L'admin toglie il profilo ``player_id`` dagli iscritti: ``{tournament}``."""
        tournament = self.registering(tournament_id)
        self.check_access(tournament, account_id, combo)
        return self.withdraw(tournament, player_id)

    def matches(self, tournament):
        """Incontri da giocare con gli iscritti attuali, nel formato del torneo (``None`` se non si sa)."""
        return match_count(tournament['format'], len(self.repo.players(tournament['id'])), tournament['options'],
                           tournament['thirdPlace'])

    def set_registration(self, tournament_id, account_id, combo, closed):
        """L'admin chiude (``closed`` vero) o riapre le iscrizioni: ``{tournament}``.

        Alla chiusura c'è anche ``matches``: gli incontri con gli iscritti di quel momento.
        """
        tournament = self.registering(tournament_id)
        self.check_access(tournament, account_id, combo)
        closed = flag(closed, 'Valore')
        self.repo.update(tournament['id'], {'registrationClosed': closed}, self.now())
        log.info('Iscrizioni del torneo %d %s.', tournament['id'], 'chiuse' if closed else 'riaperte')
        result = {'tournament': self.public(self.repo.get(tournament['id']))}
        if closed:
            result['matches'] = self.matches(self.repo.get(tournament['id']))
        return result
