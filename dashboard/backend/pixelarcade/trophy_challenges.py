"""Sfida trofeo (README «Sfida trofeo»): un trofeo RetroAchievements da sbloccare partendo da uno stato.

- **Punti di sfida.** In una partita normale, a ogni trofeo sbloccato dal P1
  (profilo con l'account RetroAchievements collegato) si copia subito lo stato
  periodico (``rescue.PeriodicSaver``) più vicino a ``LEAD`` secondi di gioco
  prima dello sblocco: degli stati periodici restano solo gli ultimi, quello
  giusto sparirebbe. Il tempo del creatore è il tempo di gioco dallo stato
  al trofeo.
- **Fine partita.** I punti di sfida diventano ``challengeCandidates`` del
  risultato; il P1 ne sceglie quanti vuole (``create``), gli altri si
  cancellano. Senza scelta (``discard``, oppure una nuova partita) si
  cancellano tutti.
- **Sfide.** Aperte a tutti i profili per ``DAYS`` giorni, creatore compreso.
  Si giocano dallo stato, sempre con il core dello stato e con la modalità
  Encore di RetroArch: anche chi ha già il trofeo lo vede scattare di nuovo,
  quindi si può riprovare per migliorare il tempo. Il tempo parte quando lo
  stato è caricato (``PLAYING``) e conta il tempo di gioco, senza le pause.
  Alla scadenza il file dello stato si cancella; la sfida resta tra le concluse.
"""

import datetime
import logging
import os
import shutil
import threading
import time
import uuid

from . import retroarch_net
from .errors import ChallengeError, ConflictError, LaunchError
from .fsutil import atomic_copy, png_complete
from .repositories.cores import now_iso
from .retroachievements import WARNING_ID_MIN

log = logging.getLogger(__name__)

# Lo stato della sfida è il periodico più vicino a tanti secondi di gioco prima del trofeo.
LEAD = 300
# Giorni in cui la sfida resta aperta.
DAYS = 15
RUN_DIR = '_run'
# Attesa massima di ``PLAYING`` dopo l'avvio di una sfida, e intervallo dei controlli (secondi).
READY_TIMEOUT = 90
READY_POLL = 0.25
NOT_LINKED = 'Per giocare la sfida il P1 deve collegare il suo account RetroAchievements (profilo → Trofei).'


def parse_time(value):
    return datetime.datetime.fromisoformat(value)


def pick_state(items, played, lead=LEAD):
    """Stato periodico più vicino a ``lead`` secondi di gioco prima di ``played``; ``None`` se non ce n'è uno prima.

    ``items`` = ``PeriodicSaver.items()``; a pari distanza vince il più vecchio (sfida più lunga).
    """
    before = [item for item in items if item.get('played') is not None and item['played'] < played]
    if not before:
        return None
    target = played - lead
    return min(before, key=lambda item: (abs(item['played'] - target), item['played']))


def ranking(runs, names):
    """Classifica di una sfida: per profilo miglior tempo e tentativi, prima chi ha un tempo (il più basso).

    ``[{account, name, color, best, attempts}]``; ``best`` è ``None`` per chi non ce l'ha mai fatta.
    """
    people = {}
    for run in runs:
        entry = people.setdefault(run['account'], {'account': run['account'], 'best': None, 'attempts': 0,
                                                   'first': run['at']})
        entry['attempts'] += 1
        if run['won'] and run['seconds'] is not None and (entry['best'] is None or run['seconds'] < entry['best']):
            entry['best'] = run['seconds']
    rows = []
    for entry in people.values():
        person = names.get(entry['account']) or {'name': '?', 'color': None}
        rows.append({'account': entry['account'], 'name': person['name'], 'color': person['color'],
                     'best': entry['best'], 'attempts': entry['attempts'], 'first': entry['first']})
    rows.sort(key=lambda row: (row['best'] is None, row['best'] or 0, row['first']))
    for row in rows:
        del row['first']
    return rows


class TrophyChallengeService:
    """Punti di sfida delle partite e sfide aperte (vedi il modulo).

    ``rescue`` è il ``RescueService`` (stati periodici e tempo di gioco),
    ``ra_repo`` il ``RARepository`` (account collegati), ``profiles_repo``
    il ``ProfilesRepository`` (nomi e colori), ``library`` serve al titolo
    dei giochi. ``net_factory`` (client dei comandi di rete) e ``spawn``
    servono ad aspettare lo stato caricato all'avvio di una sfida.
    """

    def __init__(self, repo, rescue, ra_repo, profiles_repo, library, data_dir, net_factory=None, spawn=None,
                 clock=time.monotonic, now=now_iso):
        self.repo = repo
        self.rescue = rescue
        self.ra = ra_repo
        self.profiles = profiles_repo
        self.library = library
        self.root = os.path.join(data_dir, 'saves', 'challenges')
        self.net_factory = net_factory
        self.spawn = spawn or self.spawn_thread
        self.clock = clock
        self.now = now
        self.lock = threading.Lock()
        # Partita in corso: ``{system, game, core, creator, challenge, offset, won, items, started, paused}``.
        self.run = None
        # Punti di sfida della partita finita, in attesa della scelta del P1.
        self.pending = None
        # Avvio di una sfida chiesto da ``start``, letto da ``PlayService.prepare_start``.
        self.play = None

    @staticmethod
    def spawn_thread(target):
        thread = threading.Thread(target=target, name='challenge-ready', daemon=True)
        thread.start()

    def run_dir(self):
        return os.path.join(self.root, RUN_DIR)

    def linked(self, account_id):
        return isinstance(account_id, int) and self.ra.account(account_id) is not None

    # --- Partita ---------------------------------------------------------------------

    def started(self, game, core, players, challenge=None, paused=None, pending=None):
        """Inizio di RetroArch per ``game`` (``{system, id, title}``) con ``core``.

        ``challenge`` è l'id della sfida giocata (o ``None``); ``paused()`` dà
        i secondi di pausa della partita, per il tempo di gioco senza stati
        periodici; ``pending()`` è vero finché lo stato non è caricato.
        """
        self.discard()
        first = list(players or [None])[0]
        creator = first if self.linked(first) else None
        run = {'system': game['system'], 'game': game['id'], 'title': game.get('title') or game['id'], 'core': core,
               'creator': creator, 'challenge': challenge, 'offset': None, 'won': None, 'items': [],
               'started': self.clock(), 'paused': paused or (lambda: 0.0)}
        with self.lock:
            self.run = run
        if challenge is not None:
            self.spawn(lambda: self.wait_ready(run, pending or (lambda: False)))

    def played(self, run):
        """Secondi di gioco della partita: quelli degli stati periodici, altrimenti il tempo meno le pause."""
        value = self.rescue.played() if self.rescue is not None else None
        if value is not None:
            return value
        return max(0.0, self.clock() - run['started'] - run['paused']())

    def wait_ready(self, run, pending):
        """Sfida: il tempo parte quando RetroArch gioca con lo stato caricato (al massimo dopo ``READY_TIMEOUT``)."""
        deadline = self.clock() + READY_TIMEOUT
        net = self.net_factory() if self.net_factory is not None else None
        while self.clock() < deadline:
            try:
                ready = (net is None or net.status() == retroarch_net.PLAYING) and not pending()
            except Exception:
                ready = False
            if ready:
                break
            time.sleep(READY_POLL)
        with self.lock:
            if self.run is run and run['offset'] is None:
                run['offset'] = self.played(run)
        log.info('Sfida %s: tempo dallo stato caricato (%.1f s di gioco).', run['challenge'], run['offset'])

    def awarded(self, item):
        """Trofeo appena sbloccato (``SessionTracker``): tempo della sfida, oppure nuovo punto di sfida."""
        with self.lock:
            run = self.run
        if run is None or run['creator'] is None or item['id'] >= WARNING_ID_MIN:
            return
        played = self.played(run)
        if run['challenge'] is not None:
            challenge = self.repo.get(run['challenge'])
            if challenge is not None and challenge['achievementId'] == item['id']:
                with self.lock:
                    offset = run['offset'] if run['offset'] is not None else 0.0
                    if run['won'] is None:
                        run['won'] = max(0, int(round(played - offset)))
            return
        items = self.rescue.run_items() if self.rescue is not None else []
        entry = pick_state(items, played)
        if entry is None:
            log.info('Trofeo %s senza stati periodici prima: niente punto di sfida.', item['id'])
            return
        os.makedirs(self.run_dir(), mode=0o700, exist_ok=True)
        target = os.path.join(self.run_dir(), '%d.state' % item['id'])
        try:
            atomic_copy(entry['state'], target)
            png = entry.get('png')
            if png and png_complete(png):
                atomic_copy(png, target[:-len('.state')] + '.png')
        except OSError:
            log.exception('Punto di sfida del trofeo %s non copiato', item['id'])
            return
        with self.lock:
            run['items'].append({'achievementId': item['id'], 'title': item['title'], 'state': target,
                                 'core': entry.get('core') or run['core'],
                                 'seconds': max(1, int(round(played - entry['played'])))})

    def finished(self, players, achievements, ra_game_id=None):
        """Fine partita: esito della sfida giocata e punti di sfida da proporre.

        Restituisce i campi da aggiungere al risultato: ``challenge``
        (``outcome``) e ``challengeCandidates`` (``[{achievementId, title, seconds}]``).
        """
        with self.lock:
            run, self.run = self.run, None
        if run is None:
            return {}
        first = list(players or [None])[0]
        if run['challenge'] is not None:
            return {'challenge': self.record_run(run, first)}
        earned = {item['id'] for item in (achievements or {}).get('unlocks', [])}
        items = [item for item in run['items'] if item['achievementId'] in earned]
        if run['creator'] is None or first != run['creator'] or not items:
            shutil.rmtree(self.run_dir(), ignore_errors=True)
            return {}
        with self.lock:
            self.pending = dict(run, items=items, raGameId=ra_game_id)
        return {'challengeCandidates': [{'achievementId': item['achievementId'], 'title': item['title'],
                                         'seconds': item['seconds']} for item in items]}

    def record_run(self, run, account_id):
        """Tentativo di una sfida: registrato per il P1, con l'esito da mostrare nel risultato."""
        challenge = self.repo.get(run['challenge'])
        if challenge is None or not isinstance(account_id, int):
            return None
        before = self.summary(challenge, self.repo.runs(), self.names(), account_id)
        won = run['won'] is not None
        self.repo.add_run(challenge['id'], account_id, won, run['won'], self.now())
        after = self.summary(challenge, self.repo.runs(), self.names(), account_id)
        record_before = before['record']
        return {
            'id': challenge['id'], 'achievementTitle': challenge['achievementTitle'], 'won': won,
            'seconds': run['won'], 'attempts': after['myAttempts'],
            'personalBest': won and (before['myBest'] is None or run['won'] < before['myBest']),
            'record': after['record'],
            'beatRecord': won and record_before is not None and run['won'] < record_before['seconds']
            and record_before['account'] != account_id,
            'previousRecord': record_before,
        }

    # --- Scelta a fine partita ----------------------------------------------------------

    def candidates(self):
        with self.lock:
            pending = self.pending
        if pending is None:
            return []
        return [{'achievementId': item['achievementId'], 'title': item['title'], 'seconds': item['seconds']}
                for item in pending['items']]

    def create(self, account_id, achievement_ids):
        """Crea le sfide dei trofei scelti dal P1 della partita appena finita; gli altri punti si cancellano.

        Restituisce le sfide create. 409 se non ci sono punti di sfida o il profilo non è il P1.
        """
        if not isinstance(achievement_ids, list) or not achievement_ids or not all(
                isinstance(value, int) and not isinstance(value, bool) for value in achievement_ids):
            raise ChallengeError('Scegli almeno un trofeo.')
        with self.lock:
            pending = self.pending
        if pending is None:
            raise ConflictError('Nessun trofeo da sfidare: la partita è già stata chiusa.')
        if account_id != pending['creator']:
            raise ConflictError('Solo chi ha giocato la partita può lanciare le sfide.')
        chosen = [item for item in pending['items'] if item['achievementId'] in set(achievement_ids)]
        if not chosen:
            raise ChallengeError('Trofeo non valido.')
        os.makedirs(self.root, mode=0o700, exist_ok=True)
        created = []
        at = self.now()
        expires = (parse_time(at) + datetime.timedelta(days=DAYS)).isoformat(timespec='seconds')
        for item in chosen:
            name = uuid.uuid4().hex
            target = os.path.join(self.root, name + '.state')
            os.replace(item['state'], target)
            png = item['state'][:-len('.state')] + '.png'
            if os.path.exists(png):
                os.replace(png, target[:-len('.state')] + '.png')
            challenge_id = self.repo.create({
                'creatorId': account_id, 'system': pending['system'], 'game': pending['game'],
                'title': pending['title'], 'core': item['core'], 'achievementId': item['achievementId'],
                'achievementTitle': item['title'], 'raGameId': pending.get('raGameId'), 'seconds': item['seconds'],
                'state': name, 'createdAt': at, 'expiresAt': expires}, at)
            self.repo.mark_seen(challenge_id, account_id, 'notice', at)
            created.append(challenge_id)
            log.info('Sfida trofeo %d: %s/%s, trofeo %d in %d s.', challenge_id, pending['system'],
                     pending['game'], item['achievementId'], item['seconds'])
        self.discard()
        return {'created': created}

    def discard(self):
        """Cancella i punti di sfida della partita finita (nessuna scelta, o una nuova partita)."""
        with self.lock:
            self.pending = None
        shutil.rmtree(self.run_dir(), ignore_errors=True)
        return {'candidates': []}

    # --- Sfide ---------------------------------------------------------------------------

    def names(self):
        return {row['id']: {'name': row['name'], 'color': row.get('color')} for row in self.profiles.list()}

    def is_open(self, challenge, now=None):
        return bool(challenge['state']) and parse_time(challenge['expiresAt']) > parse_time(now or self.now())

    def purge(self):
        """Sfide scadute: il file dello stato si cancella (la sfida resta tra le concluse)."""
        now = self.now()
        for challenge in self.repo.all():
            if challenge['state'] and not self.is_open(challenge, now):
                for suffix in ('.state', '.png'):
                    try:
                        os.unlink(os.path.join(self.root, challenge['state'] + suffix))
                    except OSError:
                        pass
                self.repo.clear_state(challenge['id'])

    def summary(self, challenge, runs, names, account_id):
        """Sfida per il profilo ``account_id``, con classifica, record e giorni rimasti."""
        mine = [run for run in runs if run['challenge'] == challenge['id']]
        board = ranking(mine, names)
        mine_row = next((row for row in board if row['account'] == account_id), None)
        record = board[0] if board and board[0]['best'] is not None else None
        creator = names.get(challenge['creatorId']) or {'name': '?', 'color': None}
        now = parse_time(self.now())
        left = parse_time(challenge['expiresAt']) - now
        return {
            'id': challenge['id'], 'system': challenge['system'], 'game': challenge['game'],
            'title': challenge['title'], 'achievementId': challenge['achievementId'],
            'achievementTitle': challenge['achievementTitle'], 'raGameId': challenge['raGameId'],
            'creator': {'id': challenge['creatorId'], 'name': creator['name'], 'color': creator['color']},
            'seconds': challenge['seconds'], 'createdAt': challenge['createdAt'],
            'expiresAt': challenge['expiresAt'], 'open': self.is_open(challenge),
            'daysLeft': max(0, left.days + (1 if left.seconds > 0 else 0)) if left.total_seconds() > 0 else 0,
            'thumb': bool(challenge['state']) and os.path.exists(os.path.join(self.root, challenge['state'] + '.png')),
            'ranking': board,
            'record': {'account': record['account'], 'name': record['name'], 'seconds': record['best']}
            if record else None,
            'myBest': mine_row['best'] if mine_row else None,
            'myAttempts': mine_row['attempts'] if mine_row else 0,
        }

    def overview(self, account_id):
        """Sfide del profilo: ``{open, mine, ended, linked}`` (README «Sfida trofeo»)."""
        self.check_account(account_id)
        self.purge()
        runs = self.repo.runs()
        names = self.names()
        result = {'open': [], 'mine': [], 'ended': [], 'linked': self.linked(account_id)}
        for challenge in self.repo.all():
            item = self.summary(challenge, runs, names, account_id)
            if challenge['creatorId'] == account_id:
                result['mine'].append(item)
            elif item['open']:
                result['open'].append(item)
            elif item['myAttempts']:
                result['ended'].append(item)
        return result

    def notices(self, account_id):
        """Avvisi da mostrare all'ingresso del P1: ``{challenges, finals, linked}``.

        ``challenges`` sono le sfide aperte di altri non ancora viste;
        ``finals`` le sfide scadute a cui il profilo ha partecipato, col riepilogo non ancora visto.
        """
        self.check_account(account_id)
        self.purge()
        runs = self.repo.runs()
        names = self.names()
        seen = self.repo.seen(account_id)
        challenges, finals = [], []
        for challenge in self.repo.all():
            item = self.summary(challenge, runs, names, account_id)
            if item['open'] and challenge['creatorId'] != account_id and (challenge['id'], 'notice') not in seen:
                challenges.append(item)
            elif not item['open'] and item['myAttempts'] and (challenge['id'], 'final') not in seen:
                finals.append(item)
        return {'challenges': challenges, 'finals': finals, 'linked': self.linked(account_id)}

    def mark_seen(self, account_id, challenge_id, kind):
        self.check_account(account_id)
        if kind not in ('notice', 'final'):
            raise ChallengeError('Avviso non valido.')
        if self.repo.get(challenge_id) is None:
            raise ChallengeError('Sfida inesistente.')
        self.repo.mark_seen(challenge_id, account_id, kind, self.now())
        return self.notices(account_id)

    def check_account(self, account_id):
        if not isinstance(account_id, int) or isinstance(account_id, bool) or self.profiles.get(account_id) is None:
            raise ChallengeError('Profilo inesistente.')

    def launch(self, challenge_id, players):
        """Dati per avviare la sfida col P1 di ``players``: ``{system, game, challenge}`` per ``PlayService.start``."""
        challenge = self.repo.get(challenge_id) if isinstance(challenge_id, int) else None
        if challenge is None:
            raise ChallengeError('Sfida inesistente.')
        if not self.is_open(challenge):
            raise LaunchError('La sfida è scaduta.')
        first = list(players or [None])[0]
        if not self.linked(first):
            raise LaunchError(NOT_LINKED)
        state = os.path.join(self.root, challenge['state'] + '.state')
        if not os.path.exists(state):
            raise LaunchError('Lo stato della sfida non c\'è più.')
        return {'system': challenge['system'], 'game': challenge['game'],
                'challenge': {'id': challenge['id'], 'core': challenge['core'], 'state': state}}

    def thumb(self, challenge_id):
        """Percorso della miniatura dello stato della sfida, oppure ``None``."""
        challenge = self.repo.get(challenge_id) if isinstance(challenge_id, int) else None
        if challenge is None or not challenge['state']:
            return None
        path = os.path.join(self.root, challenge['state'] + '.png')
        return path if os.path.exists(path) else None
