"""Classifica di casa e sfida della settimana (README «Classifica di casa»).

La sfida è un gioco estratto a caso, il lunedì, tra quelli già giocati da
almeno un profilo; resta lo stesso fino a domenica (ora locale) anche se nel
frattempo si giocano giochi nuovi. Vince chi ci gioca più tempo nella
settimana; i minuti giocati sul gioco della sfida valgono il doppio degli XP
(``progression.session_parts``).
"""
import datetime
import math
import random

from .profiles import game_key
from .repositories.cores import now_iso

# Profili in classifica, posti della sfida e giochi più giocati di casa.
LEADERS_MAX = 5
CHALLENGE_MAX = 3
TOP_GAMES_MAX = 3
WEEK = datetime.timedelta(days=7)


def utc_iso(moment):
    """Data ISO in UTC al secondo, come ``sessions.ended_at``."""
    return moment.astimezone(datetime.timezone.utc).isoformat(timespec='seconds')


class LeaderboardService:
    """Classifica dei profili, sfida della settimana e giochi più giocati.

    ``repo`` è il repository delle sfide, ``sessions`` quello delle partite,
    ``profiles`` il ``ProfileService``. ``tz`` è il fuso della settimana
    (``None`` = quello del sistema); ``clock`` (data con fuso) e ``now``
    (data ISO) sono sostituibili nei test.
    """

    def __init__(self, repo, sessions, profiles, tz=None, clock=None, now=now_iso):
        self.repo = repo
        self.sessions = sessions
        self.profiles = profiles
        self.tz = tz
        self.clock = clock or self.local_now
        self.now = now

    def local_now(self):
        return datetime.datetime.now(self.tz) if self.tz else datetime.datetime.now().astimezone()

    def localize(self, naive):
        return naive.replace(tzinfo=self.tz) if self.tz else naive.astimezone()

    def week(self, moment=None, back=0):
        """Settimana di ``moment`` (``back`` settimane prima): ``{week, start, end, endsAt}``.

        ``week`` è la data del lunedì; ``start`` ed ``end`` sono i confini in
        UTC (fine esclusa), ``endsAt`` la fine in ora locale (data con fuso).
        """
        moment = moment or self.clock()
        monday = moment.date() - datetime.timedelta(days=moment.weekday()) - back * WEEK
        start = self.localize(datetime.datetime.combine(monday, datetime.time()))
        end = self.localize(datetime.datetime.combine(monday + WEEK, datetime.time()))
        return {'week': monday.isoformat(), 'start': utc_iso(start), 'end': utc_iso(end), 'endsAt': end}

    def candidates(self):
        """Giochi già giocati da un profilo e ancora presenti nella libreria."""
        return [item for item in self.sessions.played_by_anyone() if self.profiles.find_game(*item) is not None]

    def challenge_game(self, week, pick=True):
        """Gioco della sfida della settimana ``week`` come ``(system_id, game_id)``, oppure ``None``.

        Se non è ancora stato estratto e ``pick`` è vero lo estrae (sempre lo
        stesso a parità di giochi candidati) e lo registra; senza giochi
        giocati non c'è sfida.
        """
        found = self.repo.get(week)
        if found is not None or not pick:
            return found
        pool = self.candidates()
        if not pool:
            return None
        system_id, game_id = random.Random(week).choice(pool)
        return self.repo.add(week, system_id, game_id, self.now())

    def is_challenge(self, system_id, game_id):
        """Vero se il gioco è quello della sfida di questa settimana."""
        return self.challenge_game(self.week()['week']) == (system_id, game_id)

    def ranking(self, game, week):
        return self.sessions.game_time(game[0], game[1], week['start'], week['end'])

    def person(self, account_id, cache):
        if account_id not in cache:
            account = self.profiles.repo.get(account_id)
            cache[account_id] = {'id': account_id, 'name': account['name'], 'color': account['color']} \
                if account else None
        return cache[account_id]

    def board(self):
        """Dati della classifica di «Chi gioca?».

        Restituisce ``{leaders, challenge, lastWinner, topGames, games}``:
        ``leaders`` i primi profili per XP (poi ore) con il gioco più giocato;
        ``challenge`` la sfida della settimana con i primi per tempo, oppure
        ``None`` se nessuno ha ancora giocato; ``lastWinner`` chi ha giocato
        di più alla sfida della settimana prima; ``topGames`` i giochi con più
        tempo di tutti i profili; ``games`` i riepiloghi dei giochi citati.
        """
        keys = []
        leaders = []
        accounts = sorted(self.profiles.list_public(), key=lambda item: (-item['xp'], -item['hours'], item['id']))
        for account in accounts[:LEADERS_MAX]:
            top = self.sessions.top_games(account['id'], 1)
            favorite = {'game': game_key(top[0]['system'], top[0]['game']), 'seconds': top[0]['seconds']} \
                if top and top[0]['seconds'] else None
            if favorite:
                keys.append(favorite['game'])
            leaders.append({name: account[name] for name in
                            ('id', 'name', 'color', 'avatar', 'raUser', 'level', 'title', 'xp', 'hours', 'played')})
            leaders[-1]['top'] = favorite

        moment = self.clock()
        names = {}
        current = self.week(moment)
        challenge = None
        game = self.challenge_game(current['week'])
        if game is not None:
            key = game_key(*game)
            keys.append(key)
            ranking = []
            for item in self.ranking(game, current)[:CHALLENGE_MAX]:
                person = self.person(item['account'], names)
                if person:
                    ranking.append(dict(person, seconds=item['seconds']))
            left = (current['endsAt'] - moment).total_seconds() / 86400.0
            challenge = {'game': key, 'week': current['week'], 'endsAt': current['endsAt'].isoformat(timespec='seconds'),
                         'daysLeft': max(1, int(math.ceil(left))), 'ranking': ranking}

        last_winner = None
        previous = self.week(moment, back=1)
        game = self.challenge_game(previous['week'], pick=False)
        if game is not None:
            for item in self.ranking(game, previous):
                person = self.person(item['account'], names)
                if person:
                    key = game_key(*game)
                    keys.append(key)
                    last_winner = dict(person, game=key, week=previous['week'], seconds=item['seconds'])
                    break

        top_games = []
        for item in self.sessions.house_top_games(TOP_GAMES_MAX):
            key = game_key(item['system'], item['game'])
            keys.append(key)
            top_games.append({'game': key, 'seconds': item['seconds'], 'players': item['players']})
        return {'leaders': leaders, 'challenge': challenge, 'lastWinner': last_winner, 'topGames': top_games,
                'games': self.profiles.games_for(keys)}
