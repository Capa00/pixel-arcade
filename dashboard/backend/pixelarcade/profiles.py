"""Profili dei giocatori: creazione, preferenze, preferiti, progressi e dati pubblici (README §D, §E, §H)."""
import logging
import os
import re

from . import progression
from .gravatar import email_hash
from .errors import ProfileError
from .library import clean_title
from .repositories.cores import now_iso
from .systems import describe

log = logging.getLogger(__name__)

NAME_MAX = 25
# Gli 8 colori della demo, nell'ordine dei campioni.
COLORS = ('#ff5d73', '#3ccfc4', '#f5c542', '#8fd46a', '#a48bff', '#ff9a52', '#5b93ff', '#f3f1f8')
NAME_CHARS = re.compile(r'[^A-Z0-9_.-]')
SYSTEM_MAX = 64
GENRES = ('Platform', 'Avventura', 'Azione', 'GDR', 'Picchiaduro', 'Corse', 'Puzzle', 'Shooter', 'Run & Gun',
          'Horror', 'Sport')
DIFFICULTIES = ('Facile', 'Normale', 'Difficile')
# Opzioni dell'API → colonne di ``accounts``. La colonna ``opt_save`` resta nel database ma non si usa più:
# lo stato automatico è sempre attivo e finisce nei salvataggi del profilo.
OPTION_COLUMNS = {'crt': 'opt_crt', 'vib': 'opt_vib'}
# Opzioni non più usate: se arrivano dall'interfaccia si ignorano.
IGNORED_OPTIONS = ('save',)
# Preferenze di un ospite o di una partita senza profilo P1 (come alla creazione di un profilo).
DEFAULT_OPTS = {'crt': False, 'vib': True}
SLOTS = ('p1', 'p2')
RECENT_MAX = 5
# Statistiche della pagina profilo: giochi più giocati, partite per pagina dello storico
# e durata minima di una partita per comparire nello storico (le più brevi contano solo nelle ore).
TOP_MAX = 10
HISTORY_PAGE = 30
HISTORY_MIN_SECONDS = 30


def normalize_name(name):
    """Nome come nell'interfaccia: maiuscolo, spazi → ``_``, solo ``A-Z 0-9 _ . -``, al massimo ``NAME_MAX`` (25) caratteri.

    Solleva ``ProfileError`` se il risultato è vuoto.
    """
    if not isinstance(name, str):
        raise ProfileError('Indica il nome del profilo.')
    value = NAME_CHARS.sub('', re.sub(r'\s', '_', name.strip().upper()))[:NAME_MAX]
    if not value:
        raise ProfileError('Indica il nome del profilo.')
    return value


def game_key(system_id, game_id):
    """Chiave di un gioco nelle API: ``<system_id>/<game_id>``."""
    return '%s/%s' % (system_id, game_id)


def split_key(key):
    """``<system_id>/<game_id>`` → ``(system_id, game_id)``. Solleva ``ProfileError`` se non è valida."""
    if not isinstance(key, str) or '/' not in key:
        raise ProfileError('Gioco non valido.')
    system_id, game_id = key.split('/', 1)
    if not system_id or not game_id:
        raise ProfileError('Gioco non valido.')
    return system_id, game_id


def valid_id(value):
    """Vero se ``value`` può essere l'id di un profilo (intero, non booleano)."""
    return isinstance(value, int) and not isinstance(value, bool)


class ProfileService:
    """Profili nel formato pubblico dell'API, con preferenze, preferiti e progressi.

    ``sessions`` (repository delle partite) e ``library`` servono a
    statistiche, preferiti e riepiloghi dei giochi; ``now`` (data ISO) è
    sostituibile nei test.
    """

    def __init__(self, repo, sessions=None, library=None, now=now_iso, ra=None):
        self.repo = repo
        self.sessions = sessions
        self.library = library
        self.now = now
        # Repository RetroAchievements: nome utente collegato al profilo (facoltativo).
        self.ra = ra
        # ``challenge(system_id, game_id)``: vero per il gioco della sfida della settimana
        # (``LeaderboardService.is_challenge``, assegnato in ``app``); i suoi minuti valgono il doppio.
        self.challenge = None
        # ``TournamentRewardsRepository`` (assegnato in ``app``): piazzamenti e premi dei tornei conclusi.
        self.rewards = None

    def account(self, account_id):
        """Profilo grezzo, oppure ``ProfileError`` se non esiste."""
        account = self.repo.get(account_id) if valid_id(account_id) else None
        if account is None:
            raise ProfileError('Profilo non trovato.')
        return account

    def create(self, name, color, fav_console=None):
        """Crea il profilo con i valori predefiniti e lo restituisce in formato pubblico.

        Solleva ``ProfileError`` se il nome è vuoto o già in uso o se il
        colore non è uno degli 8 della demo.
        """
        value = normalize_name(name)
        if color not in COLORS:
            raise ProfileError('Colore non valido.')
        if fav_console is not None and (not isinstance(fav_console, str) or len(fav_console) > SYSTEM_MAX):
            raise ProfileError('Console preferita non valida.')
        account_id = self.repo.create(value, color, self.now(), fav_console or None)
        return self.public(self.repo.get(account_id))

    # --- Preferenze ----------------------------------------------------------

    def update(self, account_id, patch):
        """Modifica le preferenze del profilo e lo restituisce in formato pubblico.

        Campi ammessi: ``favConsole`` (id o ``null``), ``genres`` (sottoinsieme
        di ``GENRES``), ``difficulty`` (``Facile|Normale|Difficile``), ``opts``
        (``{crt, vib}`` booleani, anche solo alcuni; ``save`` si ignora),
        ``name`` (normalizzato come alla creazione; già in uso: 409), ``color``,
        ``email`` (indirizzo Gravatar, oppure ``null`` o vuoto per scollegarlo:
        si salva solo l'hash). Un campo non valido solleva ``ProfileError`` e
        non salva nulla.
        """
        self.account(account_id)
        if not isinstance(patch, dict):
            raise ProfileError('Modifiche non valide.')
        unknown = sorted(set(patch) - {'name', 'favConsole', 'genres', 'difficulty', 'opts', 'color', 'email'})
        if unknown:
            raise ProfileError('Campo non modificabile: %s.' % ', '.join(unknown))
        fields = {}
        genres = None
        if 'favConsole' in patch:
            value = patch['favConsole']
            if value is not None and (not isinstance(value, str) or len(value) > SYSTEM_MAX):
                raise ProfileError('Console preferita non valida.')
            fields['fav_system'] = value or None
        if 'genres' in patch:
            value = patch['genres']
            if not isinstance(value, list) or any(genre not in GENRES for genre in value):
                raise ProfileError('Generi non validi.')
            genres = [genre for genre in GENRES if genre in value]
        if 'difficulty' in patch:
            if patch['difficulty'] not in DIFFICULTIES:
                raise ProfileError('Difficoltà non valida.')
            fields['difficulty'] = patch['difficulty']
        if 'opts' in patch:
            opts = patch['opts']
            if isinstance(opts, dict):
                opts = {name: value for name, value in opts.items() if name not in IGNORED_OPTIONS}
            if (not isinstance(opts, dict) or set(opts) - set(OPTION_COLUMNS)
                    or any(not isinstance(value, bool) for value in opts.values())):
                raise ProfileError('Opzioni non valide.')
            for name, value in opts.items():
                fields[OPTION_COLUMNS[name]] = int(value)
        if 'name' in patch:
            fields['name'] = normalize_name(patch['name'])
        if 'color' in patch:
            if patch['color'] not in COLORS:
                raise ProfileError('Colore non valido.')
            fields['color'] = patch['color']
        if 'email' in patch:
            fields['gravatar'] = email_hash(patch['email']) if patch['email'] else None
        self.repo.update(account_id, fields, genres)
        return self.public(self.repo.get(account_id))

    def retroarch_opts(self, account_id):
        """Preferenze per RetroArch del profilo P1 (``{crt, vib}``); per un ospite quelle predefinite."""
        account = self.repo.get(account_id) if valid_id(account_id) else None
        if account is None:
            return dict(DEFAULT_OPTS)
        return {name: bool(account[column]) for name, column in OPTION_COLUMNS.items()}

    # --- Preferiti -----------------------------------------------------------

    def set_favorite(self, account_id, key, on):
        """Aggiunge o toglie un preferito (``key`` = ``<system>/<id>``); restituisce le chiavi dei preferiti.

        Per aggiungerlo il gioco deve esistere nella libreria; toglierlo è
        sempre possibile, anche se il file non c'è più.
        """
        self.account(account_id)
        system_id, game_id = split_key(key)
        if not isinstance(on, bool):
            raise ProfileError('Indica se aggiungere o togliere il preferito.')
        if on and self.find_game(system_id, game_id) is None:
            raise ProfileError('Gioco non trovato.')
        self.repo.set_favorite(account_id, system_id, game_id, on, self.now())
        return self.favorite_keys(account_id)

    def favorite_keys(self, account_id):
        return [game_key(system_id, game_id) for system_id, game_id in self.repo.favorites(account_id)]

    # --- Partite -------------------------------------------------------------

    def record_session(self, session_id, players, seconds):
        """Registra i profili di una partita terminata e restituisce gli XP guadagnati.

        ``players`` = ``[id P1 | None, id P2 | None]``. Le partite sotto i 20 s
        non contano; id sconosciuti o ripetuti vengono ignorati. Il bonus del
        gioco nuovo vale se il profilo non lo aveva mai giocato; sul gioco della
        sfida della settimana i minuti valgono il doppio. Restituisce
        ``{id: {slot, xpGained, levelBefore, levelAfter, title, titleBefore,
        percentBefore, percentAfter, parts}}``: ``slot`` è ``p1`` o ``p2``, ``percent*`` è l'avanzamento
        (0–99) verso il livello successivo, ``parts`` le voci degli XP
        (``{minutes, session, newGame, challenge}``).

        Le partite dei tornei contano come le altre.
        """
        if self.sessions is None or int(seconds or 0) < progression.MIN_SECONDS:
            return {}
        session = self.sessions.get(session_id)
        if session is None:
            return {}
        challenge = self.in_challenge(session['system'], session['game'])
        rows = []
        result = {}
        for slot, account_id in zip(SLOTS, list(players or [])[:2]):
            if not valid_id(account_id) or account_id in result or self.repo.get(account_id) is None:
                continue
            is_new = not self.sessions.has_played(account_id, session['system'], session['game'])
            xp_before = self.sessions.stats(account_id)['xp']
            parts = progression.session_parts(seconds, is_new, challenge)
            gained = sum(parts.values())
            xp_after = xp_before + gained
            level_before = progression.level_for(xp_before)
            level_after = progression.level_for(xp_after)
            rows.append((account_id, slot, gained))
            result[account_id] = {
                'slot': slot,
                'xpGained': gained,
                'levelBefore': level_before,
                'levelAfter': level_after,
                'title': progression.title_for(level_after),
                'titleBefore': progression.title_for(level_before),
                'percentBefore': progression.xp_percent(xp_before),
                'percentAfter': progression.xp_percent(xp_after),
                'parts': parts,
            }
        if rows:
            self.sessions.add_players(session_id, rows)
        return result

    def in_challenge(self, system_id, game_id):
        """Vero se il gioco è quello della sfida della settimana; un errore resta nel log e vale falso."""
        if self.challenge is None:
            return False
        try:
            return bool(self.challenge(system_id, game_id))
        except Exception:
            log.exception('Sfida della settimana non controllata per %s/%s', system_id, game_id)
            return False

    # --- Dati pubblici -------------------------------------------------------

    def public(self, account):
        """Profilo pubblico (README §E) con livello, titolo, statistiche, preferiti e partite recenti.

        ``raUser`` è il nome utente RetroAchievements collegato (mai il token);
        ``avatar`` è vero se il profilo ha un Gravatar collegato (mai l'email né l'hash).

        ``favorites`` è l'elenco delle chiavi ``<system>/<id>`` (dal più
        recente); ``recent`` l'ultima partita di ogni gioco
        ``[{game, at, seconds}]`` (al massimo 5).
        """
        stats = self.sessions.stats(account['id']) if self.sessions is not None else \
            {'seconds': 0, 'sessions': 0, 'xp': 0, 'played': 0}
        recent = self.sessions.recent(account['id'], RECENT_MAX) if self.sessions is not None else []
        level = progression.level_for(stats['xp'])
        return {
            'id': account['id'],
            'name': account['name'],
            'color': account['color'],
            'createdAt': account['created_at'],
            'favConsole': account['fav_system'],
            'difficulty': account['difficulty'],
            'opts': {name: bool(account[column]) for name, column in OPTION_COLUMNS.items()},
            'genres': list(account['genres']),
            'level': level,
            'xp': stats['xp'],
            'xpPercent': progression.xp_percent(stats['xp']),
            'title': progression.title_for(level),
            'hours': round((stats['seconds'] or 0) / 3600.0, 1),
            'played': stats['played'],
            'sessions': stats['sessions'],
            'favorites': self.favorite_keys(account['id']),
            'recent': [{'game': game_key(item['system'], item['game']), 'at': item['endedAt'],
                        'seconds': item['seconds'] or 0} for item in recent],
            'raUser': self.ra_user(account['id']),
            'avatar': bool(account.get('gravatar')),
        }

    def stats(self, account_id, before=None):
        """Statistiche e storico del profilo per la scheda «Statistiche».

        Restituisce ``{systems, top, history, more, games, tournaments}``:
        ``systems`` il tempo per console ``[{system, name, seconds, sessions}]``,
        ``top`` i giochi più giocati ``[{game, seconds, sessions, lastAt}]``,
        ``history`` le partite di almeno ``HISTORY_MIN_SECONDS`` secondi dalla
        più recente (``HISTORY_PAGE`` per volta, prima della partita
        ``before``) e ``more`` vero se ce ne sono altre. ``games`` sono i
        riepiloghi dei giochi citati, ``tournaments`` ``{played, won, best}``
        (vedi ``tournament_stats``). Ogni voce di ``history`` ha ``kind``:
        ``session`` (partita) o ``reward`` (piazzamento in un torneo concluso,
        ``{id, kind, title, place, xp, at}``), in ordine di data; i
        piazzamenti stanno nella pagina delle partite dello stesso periodo.
        Solleva ``ProfileError`` se il profilo non esiste.
        """
        self.account(account_id)
        if self.sessions is None:
            return {'systems': [], 'top': [], 'history': [], 'more': False, 'games': {},
                    'tournaments': self.tournament_stats(account_id)}
        systems = [dict(item, name=describe(item['system'])['name'])
                   for item in self.sessions.by_system(account_id)]
        top = [{'game': game_key(item['system'], item['game']), 'seconds': item['seconds'],
                'sessions': item['sessions'], 'lastAt': item['lastAt']}
               for item in self.sessions.top_games(account_id, TOP_MAX)]
        rows = self.sessions.history(account_id, HISTORY_PAGE + 1, before, HISTORY_MIN_SECONDS)
        names = {}
        history = []
        for item in rows[:HISTORY_PAGE]:
            partners = []
            for partner_id in item['partners']:
                if partner_id not in names:
                    partner = self.repo.get(partner_id)
                    names[partner_id] = {'id': partner_id, 'name': partner['name'], 'color': partner['color']} \
                        if partner else None
                if names[partner_id]:
                    partners.append(names[partner_id])
            history.append({
                'id': item['id'],
                'game': game_key(item['system'], item['game']),
                'startedAt': item['startedAt'],
                'endedAt': item['endedAt'],
                'seconds': item['seconds'] or 0,
                'xp': item['xp'],
                'slot': item['slot'],
                'partners': partners,
                'trophies': item['trophies'],
                'tournament': item.get('tournament'),
                'kind': 'session',
            })
        more = len(rows) > HISTORY_PAGE
        keys = [item['game'] for item in top] + [item['game'] for item in history]
        history = self.with_rewards(account_id, history, before, more)
        return {'systems': systems, 'top': top, 'history': history, 'more': more,
                'games': self.games_for(keys), 'tournaments': self.tournament_stats(account_id)}

    def tournament_stats(self, account_id):
        """Tornei del profilo: ``{played, won, best}`` (``best`` = miglior piazzamento, ``None`` senza tornei).

        Contano i tornei conclusi, anche se poi eliminati dall'archivio: i
        piazzamenti stanno in ``tournament_rewards``.
        """
        rows = self.rewards.of_account(account_id) if self.rewards is not None else []
        places = [row['place'] for row in rows]
        return {'played': len(places), 'won': places.count(1), 'best': min(places) if places else None}

    def with_rewards(self, account_id, history, before, more):
        """Partite della pagina con i piazzamenti dello stesso periodo, dalla voce più recente.

        Il periodo va dalla partita ``before`` (esclusa; nessun limite nella
        prima pagina) all'ultima partita della pagina (nessun limite
        nell'ultima pagina), così ogni piazzamento compare una volta sola.
        """
        if self.rewards is None:
            return history

        def moment(item):
            return item.get('endedAt') or item.get('startedAt') or ''

        upper = None
        if before is not None:
            session = self.sessions.get(before)
            upper = moment(session) if session else None
        lower = moment(history[-1]) if more and history else None
        rewards = []
        for row in self.rewards.of_account(account_id):
            if (upper is None or row['at'] < upper) and (lower is None or row['at'] >= lower):
                rewards.append({'id': 'reward-%s-%s' % (row['tournament'], row['at']), 'kind': 'reward',
                                'title': row['title'], 'place': row['place'], 'xp': row['xp'], 'at': row['at']})
        if not rewards:
            return history
        merged = history + rewards
        merged.sort(key=lambda item: item['at'] if item['kind'] == 'reward' else moment(item), reverse=True)
        return merged

    def played_keys(self, account_id):
        """Chiavi ``<system>/<id>`` dei giochi che il profilo ha già giocato. ``ProfileError`` se non esiste."""
        self.account(account_id)
        if self.sessions is None:
            return []
        return [game_key(system_id, game_id) for system_id, game_id in self.sessions.played_games(account_id)]

    def ra_user(self, account_id):
        """Nome utente RetroAchievements collegato al profilo, oppure ``None``."""
        if self.ra is None:
            return None
        linked = self.ra.account(account_id)
        return linked['username'] if linked else None

    def list_public(self):
        """Tutti i profili in formato pubblico, in ordine di creazione."""
        return [self.public(account) for account in self.repo.list()]

    def find_game(self, system_id, game_id):
        """Gioco della libreria, oppure ``None`` (anche se la console non esiste più)."""
        if self.library is None:
            return None
        try:
            return self.library.find(system_id, game_id)
        except Exception as error:
            log.info('Gioco %s/%s non leggibile: %s', system_id, game_id, error)
            return None

    def game_summary(self, key):
        """Riepilogo di un gioco per la pagina profilo: ``{system, id, title, systemName, systemFull, metaId, cover, missing}``.

        Un gioco non più presente ha ``missing`` vero e il titolo ricavato dal nome del file.
        """
        system_id, game_id = split_key(key)
        system = describe(system_id)
        game = self.find_game(system_id, game_id)
        if game is None:
            title = clean_title(os.path.basename(game_id), system['arcade'])
        else:
            title = game['title']
        return {
            'system': system_id,
            'id': game_id,
            'title': title,
            'systemName': system['name'],
            'systemFull': system['name'],
            'metaId': game.get('metaId') if game else None,
            'cover': bool(game and game.get('cover')),
            'missing': game is None,
        }

    def games_for(self, keys):
        """Riepiloghi ``{key: summary}`` per le chiavi indicate (senza doppioni)."""
        result = {}
        for key in keys:
            if key not in result:
                result[key] = self.game_summary(key)
        return result

    def games_of(self, accounts):
        """Riepiloghi dei preferiti e dei recenti di tutti i profili pubblici ``accounts``."""
        keys = []
        for account in accounts:
            keys.extend(account['favorites'])
            keys.extend(item['game'] for item in account['recent'])
        return self.games_for(keys)
