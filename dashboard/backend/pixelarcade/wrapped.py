"""Wrapped: riepilogo del mese e dell'anno, per profilo e di casa (README «Wrapped»).

Un periodo è un mese (``AAAA-MM``) o un anno (``AAAA``) in ora locale ed è
disponibile quando è finito e ha almeno ``MIN_SESSIONS`` partite. L'avviso
propone solo il Wrapped più recente non ancora visto: il mese appena chiuso
oppure, a gennaio, l'anno appena chiuso.
"""
import collections
import datetime

from .errors import WrappedError
from .leaderboard import utc_iso
from .profiles import game_key
from .repositories.cores import now_iso
from .systems import describe

# Partite minime perché un periodo abbia il suo Wrapped.
MIN_SESSIONS = 3
# Giochi della classifica e trofei recenti mostrati.
TOP_MAX = 5
TROPHIES_MAX = 3
# Profilo del Wrapped di casa nella tabella dei Wrapped visti.
HOUSE = 0

MONTHS = ('gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre',
          'ottobre', 'novembre', 'dicembre')
WEEKDAYS = ('lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica')
# Fasce del giorno per ora d'inizio: (prima ora esclusa, nome).
DAY_PARTS = ((6, 'notte'), (12, 'mattina'), (18, 'pomeriggio'), (24, 'sera'))

# Personaggi, nell'ordine in cui vincono a parità di punteggio.
PERSONAS = (
    ('marathon', 'Il Maratoneta', 'Partite lunghe e niente fretta: quando ti siedi, ci resti.'),
    ('collector', 'Il Collezionista di trofei', 'Nessun trofeo ti sfugge: la bacheca si riempie.'),
    ('quick', 'Mordi e fuggi', 'Tante partite brevi e intense: una veloce e via.'),
    ('loyal', 'Il Fedele', 'Hai un gioco del cuore e non lo molli.'),
    ('explorer', 'L\'Esploratore', 'Sempre a caccia di qualcosa di nuovo da provare.'),
)


def parse_iso(text):
    """Data ISO con fuso (``sessions.ended_at``) come ``datetime``, oppure ``None``."""
    try:
        return datetime.datetime.fromisoformat(text)
    except (TypeError, ValueError):
        return None


def period_kind(period):
    """``month`` per ``AAAA-MM``, ``year`` per ``AAAA``, altrimenti ``None``."""
    if not isinstance(period, str):
        return None
    if len(period) == 4 and period.isdigit():
        return 'year'
    if len(period) == 7 and period[4] == '-' and period[:4].isdigit() and period[5:].isdigit() \
            and 1 <= int(period[5:]) <= 12:
        return 'month'
    return None


def period_label(period):
    """Nome del periodo: «Ottobre 2026» o «2026»."""
    if period_kind(period) == 'month':
        return '%s %s' % (MONTHS[int(period[5:]) - 1].capitalize(), period[:4])
    return period


def day_part(hour):
    """Fascia del giorno dell'ora ``hour`` (0–23)."""
    for limit, name in DAY_PARTS:
        if hour < limit:
            return name
    return DAY_PARTS[-1][1]


def longest_streak(dates):
    """Giorni consecutivi più lunghi tra le date ``dates`` (``date``)."""
    best = 0
    run = 0
    previous = None
    for day in sorted(set(dates)):
        run = run + 1 if previous is not None and (day - previous).days == 1 else 1
        best = max(best, run)
        previous = day
    return best


def persona(stats):
    """Personaggio dalle statistiche del periodo: ``{id, name, text}``.

    Ogni personaggio ha un punteggio (1 = soglia raggiunta); vince il più alto.
    ``stats`` ha ``seconds``, ``sessions``, ``games``, ``newGames``,
    ``trophies``, ``longest`` (secondi) e ``topShare`` (quota del gioco più giocato, 0–1).
    """
    sessions = max(stats['sessions'], 1)
    average = stats['seconds'] / sessions
    scores = {
        'marathon': max(average / 2700.0, stats['longest'] / 7200.0),
        'collector': stats['trophies'] / 10.0,
        'quick': 900.0 / max(average, 1.0) if stats['sessions'] >= 5 else 0.0,
        'loyal': stats['topShare'] / 0.5,
        'explorer': max(stats['games'] / 8.0, stats['newGames'] / 5.0),
    }
    best = max(PERSONAS, key=lambda item: scores[item[0]])
    return {'id': best[0], 'name': best[1], 'text': best[2]}


class WrappedService:
    """Calcola i Wrapped e ricorda quelli visti.

    ``repo`` è il ``WrappedRepository``, ``profiles`` il ``ProfileService``.
    ``tz`` è il fuso dei periodi (``None`` = quello del sistema); ``clock``
    (data con fuso) e ``now`` (data ISO) sono sostituibili nei test.
    """

    def __init__(self, repo, profiles, tz=None, clock=None, now=now_iso):
        self.repo = repo
        self.profiles = profiles
        self.tz = tz
        self.clock = clock or self.local_now
        self.now = now

    def local_now(self):
        return datetime.datetime.now(self.tz) if self.tz else datetime.datetime.now().astimezone()

    def local(self, moment):
        return moment.astimezone(self.tz) if self.tz else moment.astimezone()

    def localize(self, naive):
        return naive.replace(tzinfo=self.tz) if self.tz else naive.astimezone()

    # --- Periodi -------------------------------------------------------------

    def bounds(self, period):
        """Confini in UTC del periodo (fine esclusa): ``(start, end)``."""
        year = int(period[:4])
        if period_kind(period) == 'month':
            month = int(period[5:])
            first = datetime.date(year, month, 1)
            last = datetime.date(year + month // 12, month % 12 + 1, 1)
        else:
            first = datetime.date(year, 1, 1)
            last = datetime.date(year + 1, 1, 1)
        start = self.localize(datetime.datetime.combine(first, datetime.time()))
        end = self.localize(datetime.datetime.combine(last, datetime.time()))
        return utc_iso(start), utc_iso(end)

    def closed(self, period, today):
        """Vero se il periodo è finito prima di ``today`` (data locale)."""
        if period_kind(period) == 'year':
            return int(period) < today.year
        return (int(period[:4]), int(period[5:])) < (today.year, today.month)

    def counts(self, account_id):
        """Partite per periodo (mesi e anni, in ora locale) del profilo o della casa (``None``)."""
        result = collections.Counter()
        for text in self.repo.ended_dates(account_id):
            moment = parse_iso(text)
            if moment is None:
                continue
            day = self.local(moment)
            result['%04d-%02d' % (day.year, day.month)] += 1
            result['%04d' % day.year] += 1
        return result

    def periods(self, account_id):
        """Periodi chiusi con il Wrapped, dal più recente (a pari data prima l'anno)."""
        today = self.clock().date()
        counts = self.counts(account_id)
        found = [period for period, count in counts.items()
                 if count >= MIN_SESSIONS and self.closed(period, today)]
        return sorted(found, key=lambda period: (period[:4], period[5:] or '99'), reverse=True)

    def owner(self, account_id):
        """Chiave dei Wrapped visti: l'id del profilo (che deve esistere) o ``HOUSE``."""
        if account_id is None:
            return HOUSE
        return self.profiles.account(account_id)['id']

    def latest(self, available, today):
        """Periodo proposto dall'avviso: a gennaio l'anno appena chiuso, altrimenti il mese appena chiuso."""
        first = today.replace(day=1)
        previous = first - datetime.timedelta(days=1)
        month = '%04d-%02d' % (previous.year, previous.month)
        if today.month == 1 and '%04d' % previous.year in available:
            return '%04d' % previous.year
        return month if month in available else None

    def overview(self, account_id):
        """Wrapped del profilo (``None`` = casa): ``{periods: [{period, kind, label, seen}], pending}``.

        ``pending`` è il periodo da proporre con l'avviso, oppure ``None`` se
        non c'è o è già stato visto.
        """
        owner = self.owner(account_id)
        available = self.periods(account_id)
        seen = self.repo.seen(owner)
        latest = self.latest(set(available), self.clock().date())
        return {
            'periods': [{'period': period, 'kind': period_kind(period), 'label': period_label(period),
                         'seen': period in seen} for period in available],
            'pending': latest if latest is not None and latest not in seen else None,
        }

    def mark_seen(self, account_id, period):
        """Segna il Wrapped come visto. ``WrappedError`` se il periodo non ha un Wrapped."""
        owner = self.owner(account_id)
        if period not in self.periods(account_id):
            raise WrappedError('Wrapped non disponibile per questo periodo.')
        self.repo.mark_seen(owner, period, self.now())
        return self.overview(account_id)

    # --- Calcolo -------------------------------------------------------------

    def person(self, account_id, cache):
        if account_id not in cache:
            account = self.profiles.repo.get(account_id)
            cache[account_id] = {'id': account_id, 'name': account['name'], 'color': account['color'],
                                 'avatar': bool(account.get('gravatar'))} if account else None
        return cache[account_id]

    def summary(self, sessions, unlocks, first_seen, start):
        """Statistiche comuni di un elenco di partite ``[{session, system, game, startedAt, seconds, ...}]``.

        ``first_seen`` dà la prima partita di ogni gioco (``(system, game)`` → data ISO) per i giochi nuovi.
        """
        games = collections.OrderedDict()
        systems = collections.OrderedDict()
        weekdays = collections.Counter()
        parts = collections.Counter()
        hours = collections.Counter()
        days = []
        longest = None
        total = 0
        for item in sessions:
            seconds = item['seconds'] or 0
            total += seconds
            key = (item['system'], item['game'])
            game = games.setdefault(key, {'seconds': 0, 'sessions': 0})
            game['seconds'] += seconds
            game['sessions'] += 1
            system = systems.setdefault(item['system'], {'seconds': 0, 'sessions': 0})
            system['seconds'] += seconds
            system['sessions'] += 1
            moment = parse_iso(item['startedAt'])
            if moment is not None:
                local = self.local(moment)
                days.append(local.date())
                weekdays[local.weekday()] += seconds or 1
                parts[day_part(local.hour)] += seconds or 1
                hours[local.hour] += seconds or 1
            if longest is None or seconds > longest['seconds']:
                longest = {'game': game_key(*key), 'seconds': seconds, 'at': item['startedAt']}
        top = sorted(games.items(), key=lambda pair: (-pair[1]['seconds'], -pair[1]['sessions']))
        by_system = sorted(systems.items(), key=lambda pair: (-pair[1]['seconds'], -pair[1]['sessions']))
        new_games = [key for key in games if first_seen.get(key, '') >= start]
        trophy_games = collections.Counter(game_key(item['system'], item['game']) for item in unlocks)
        weekday = max(range(7), key=lambda day: (weekdays[day], -day)) if weekdays else None
        part = max((name for _, name in DAY_PARTS), key=lambda name: parts[name]) if parts else None
        return {
            'totals': {'seconds': total, 'sessions': len(sessions), 'games': len(games),
                       'days': len(set(days)), 'newGames': len(new_games), 'trophies': len(unlocks)},
            'topGames': [{'game': game_key(*key), 'seconds': value['seconds'], 'sessions': value['sessions']}
                         for key, value in top[:TOP_MAX]],
            'systems': [{'system': system_id, 'name': describe(system_id)['name'], 'seconds': value['seconds'],
                         'sessions': value['sessions']} for system_id, value in by_system],
            'longest': longest,
            'habits': {
                'weekday': weekday,
                'weekdayName': WEEKDAYS[weekday] if weekday is not None else None,
                'part': part,
                'hour': max(range(24), key=lambda hour: (hours[hour], -hour)) if hours else None,
            },
            'streak': longest_streak(days),
            'trophies': {
                'count': len(unlocks),
                'recent': [{'title': item['title'], 'game': game_key(item['system'], item['game'])}
                           for item in unlocks[-TROPHIES_MAX:][::-1]],
                'topGame': ({'game': trophy_games.most_common(1)[0][0], 'count': trophy_games.most_common(1)[0][1]}
                            if trophy_games else None),
            },
            'persona': persona({
                'seconds': total,
                'sessions': len(sessions),
                'games': len(games),
                'newGames': len(new_games),
                'trophies': len(unlocks),
                'longest': longest['seconds'] if longest else 0,
                'topShare': (top[0][1]['seconds'] / float(total)) if top and total else 0.0,
            }),
        }

    def data(self, account_id, period):
        """Wrapped del profilo ``account_id`` (``None`` = casa) per ``period``.

        Solleva ``WrappedError`` se il periodo non ha un Wrapped e
        ``ProfileError`` se il profilo non esiste. ``games`` contiene i
        riepiloghi dei giochi citati.
        """
        owner = self.owner(account_id)
        if period_kind(period) is None or period not in self.periods(account_id):
            raise WrappedError('Wrapped non disponibile per questo periodo.')
        start, end = self.bounds(period)
        rows = self.repo.players(start, end)
        unlocks = self.repo.unlocks(start, end)
        first_plays = self.repo.first_plays()
        names = {}
        if account_id is None:
            result = self.house(rows, unlocks, first_plays, start, names)
        else:
            result = self.profile(owner, rows, unlocks, first_plays, start, names)
        keys = [item['game'] for item in result['topGames']]
        keys += [item['game'] for item in result['trophies']['recent']]
        if result['longest']:
            keys.append(result['longest']['game'])
        if result['trophies']['topGame']:
            keys.append(result['trophies']['topGame']['game'])
        result.update({'period': period, 'kind': period_kind(period), 'label': period_label(period),
                       'games': self.profiles.games_for(keys)})
        return result

    def profile(self, account_id, rows, unlocks, first_plays, start, names):
        """Wrapped di un profilo (vedi ``data``), con ``profile``, ``xp`` e ``rival``."""
        mine = [item for item in rows if item['account'] == account_id]
        first_seen = {(system, game): at for owner, system, game, at in first_plays if owner == account_id}
        result = self.summary(mine, [item for item in unlocks if item['account'] == account_id], first_seen, start)
        result['scope'] = 'profile'
        result['profile'] = self.person(account_id, names)
        result['totals']['xp'] = sum(item['xp'] for item in mine)
        result['rival'] = self.rival(account_id, rows, names)
        return result

    def rival(self, account_id, rows, names):
        """Profilo con cui si è giocato più spesso nel periodo, oppure quello con gli XP più vicini.

        ``{person, together: {sessions, seconds}, me: {xp, seconds}, them: {xp, seconds}}``, oppure ``None``.
        """
        totals = collections.defaultdict(lambda: {'xp': 0, 'seconds': 0})
        for item in rows:
            totals[item['account']]['xp'] += item['xp']
            totals[item['account']]['seconds'] += item['seconds'] or 0
        my_sessions = {item['session']: item for item in rows if item['account'] == account_id}
        together = collections.defaultdict(lambda: {'sessions': 0, 'seconds': 0})
        for item in rows:
            if item['account'] != account_id and item['session'] in my_sessions:
                together[item['account']]['sessions'] += 1
                together[item['account']]['seconds'] += item['seconds'] or 0
        others = [other for other in totals if other != account_id and self.person(other, names)]
        if not others:
            return None
        mine = totals[account_id]
        if together:
            choice = max((other for other in together if other in others),
                         key=lambda other: (together[other]['sessions'], together[other]['seconds'], -other),
                         default=None)
        else:
            choice = None
        if choice is None:
            choice = min(others, key=lambda other: (abs(totals[other]['xp'] - mine['xp']), other))
        shared = together.get(choice, {'sessions': 0, 'seconds': 0})
        return {'person': self.person(choice, names), 'together': dict(shared),
                'me': dict(mine), 'them': dict(totals[choice])}

    def house(self, rows, unlocks, first_plays, start, names):
        """Wrapped di casa (vedi ``data``), con ``players`` e ``duo``."""
        sessions = list(collections.OrderedDict((item['session'], item) for item in rows).values())
        first_seen = {}
        for _, system, game, at in first_plays:
            key = (system, game)
            first_seen[key] = min(first_seen.get(key, at), at)
        # I trofei di una partita in due contano una volta sola.
        unique = list(collections.OrderedDict(((item['session'], item['title']), item) for item in unlocks).values())
        result = self.summary(sessions, unique, first_seen, start)
        result['scope'] = 'house'
        players = []
        for account_id in sorted({item['account'] for item in rows}):
            person = self.person(account_id, names)
            if not person:
                continue
            own = [item for item in rows if item['account'] == account_id]
            seen = {(system, game): at for owner, system, game, at in first_plays if owner == account_id}
            stats = self.summary(own, [item for item in unlocks if item['account'] == account_id], seen, start)
            players.append(dict(person, seconds=stats['totals']['seconds'], sessions=stats['totals']['sessions'],
                                xp=sum(item['xp'] for item in own), trophies=stats['totals']['trophies'],
                                persona=stats['persona']))
        players.sort(key=lambda item: (-item['xp'], -item['seconds'], item['id']))
        result['players'] = players
        result['totals']['players'] = len(players)
        result['duo'] = self.duo(rows, names)
        return result

    def duo(self, rows, names):
        """Coppia che ha giocato più partite insieme: ``{players: [a, b], sessions, seconds}``, oppure ``None``."""
        by_session = collections.defaultdict(list)
        for item in rows:
            by_session[item['session']].append(item)
        pairs = collections.defaultdict(lambda: {'sessions': 0, 'seconds': 0})
        for items in by_session.values():
            ids = sorted({item['account'] for item in items})
            if len(ids) == 2:
                pairs[tuple(ids)]['sessions'] += 1
                pairs[tuple(ids)]['seconds'] += items[0]['seconds'] or 0
        found = [pair for pair in pairs if all(self.person(account_id, names) for account_id in pair)]
        if not found:
            return None
        best = max(found, key=lambda pair: (pairs[pair]['sessions'], pairs[pair]['seconds'], tuple(-x for x in pair)))
        return {'players': [self.person(account_id, names) for account_id in best],
                'sessions': pairs[best]['sessions'], 'seconds': pairs[best]['seconds']}
