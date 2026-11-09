"""Regole dei giochi (``rules/<gioco>.json``) e rilevatori della fine della partita.

Un file per gioco::

    {"title": "...", "system": "<id della console>", "hashes": ["<hash RetroAchievements>"],
     "modes": [{"id": "...", "label": "...", "text": "...", "detect": {...}}]}

Il gioco si riconosce dall'hash RetroAchievements del file (tabella
``ra_games``). Ogni voce di ``modes`` è un tipo di conteggio che l'admin può
scegliere nel torneo; ``text`` lo spiega nelle Impostazioni. ``detect``
descrive come leggere la fine della partita dalla RAM del gioco (indirizzi
come in RetroAchievements, letti con ``READ_CORE_RAM``).

Tipi di ``detect``:

- ``sets``: ``p1`` e ``p2`` sono gli indirizzi (un byte) dei set vinti da
  ciascun giocatore, ``active`` (``{address, equals}``) la condizione che dice
  che si sta giocando una partita a due (fuori, per esempio nella demo, non si
  legge niente). La partita è vinta da chi ha almeno ``target`` set e più
  dell'altro; con i set pari a ``draw`` è finita pari. Il punteggio è quello
  dei set.
"""
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rules')
KINDS = ('sets',)


class RuleError(ValueError):
    """File di regole non valido."""


def address(value):
    """Indirizzo da ``0x…`` (testo) o da un intero."""
    if isinstance(value, bool):
        raise RuleError('indirizzo non valido')
    if isinstance(value, int):
        number = value
    elif isinstance(value, str):
        try:
            number = int(value, 16) if value.lower().startswith('0x') else int(value)
        except ValueError:
            raise RuleError('indirizzo non valido: %s' % value)
    else:
        raise RuleError('indirizzo non valido')
    if number < 0:
        raise RuleError('indirizzo negativo')
    return number


def whole(value, name, low=0):
    if isinstance(value, bool) or not isinstance(value, int) or value < low:
        raise RuleError('%s non valido' % name)
    return value


def check_detect(detect):
    if not isinstance(detect, dict) or detect.get('kind') not in KINDS:
        raise RuleError('tipo di rilevamento sconosciuto')
    active = detect.get('active')
    if not isinstance(active, dict):
        raise RuleError('manca la condizione «active»')
    result = {'kind': 'sets', 'active': (address(active.get('address')), whole(active.get('equals'), 'equals')),
              'p1': address(detect.get('p1')), 'p2': address(detect.get('p2')),
              'target': whole(detect.get('target'), 'target', 1)}
    draw = detect.get('draw')
    result['draw'] = whole(draw, 'draw', 1) if draw is not None else None
    return result


def check_game(data):
    """Regole di un gioco controllate: ``{title, system, hashes, modes}``."""
    if not isinstance(data, dict):
        raise RuleError('il file non è un oggetto')
    title, system = data.get('title'), data.get('system')
    hashes = data.get('hashes')
    if not isinstance(title, str) or not title or not isinstance(system, str) or not system:
        raise RuleError('mancano titolo o console')
    if not isinstance(hashes, list) or not hashes or not all(isinstance(item, str) and item for item in hashes):
        raise RuleError('mancano gli hash')
    modes = data.get('modes')
    if not isinstance(modes, list) or not modes:
        raise RuleError('mancano i tipi di conteggio')
    checked = []
    for mode in modes:
        if not isinstance(mode, dict) or not all(isinstance(mode.get(key), str) and mode.get(key)
                                                 for key in ('id', 'label', 'text')):
            raise RuleError('tipo di conteggio senza id, nome o spiegazione')
        if any(item['id'] == mode['id'] for item in checked):
            raise RuleError('tipo di conteggio ripetuto: %s' % mode['id'])
        checked.append({'id': mode['id'], 'label': mode['label'], 'text': mode['text'],
                        'detect': check_detect(mode.get('detect'))})
    return {'title': title, 'system': system, 'hashes': [item.lower() for item in hashes], 'modes': checked}


def load(root=ROOT, warn=None):
    """Regole di tutti i giochi della cartella ``root``; un file non valido si salta (``warn(nome, errore)``)."""
    games = []
    try:
        names = sorted(os.listdir(root))
    except OSError:
        return games
    for name in names:
        if not name.endswith('.json'):
            continue
        try:
            with open(os.path.join(root, name), encoding='utf-8') as handle:
                games.append(check_game(json.load(handle)))
        except (OSError, ValueError) as error:
            if warn is not None:
                warn(name, error)
    return games


def find(games, system, hash_value):
    """Regole del gioco con ``hash_value`` sulla console ``system``, oppure ``None``."""
    if not hash_value:
        return None
    hash_value = hash_value.lower()
    for game in games:
        if game['system'] == system and hash_value in game['hashes']:
            return game
    return None


def mode_of(game, mode_id):
    """Tipo di conteggio ``mode_id`` del gioco (il primo se ``mode_id`` non c'è)."""
    for mode in game['modes']:
        if mode['id'] == mode_id:
            return mode
    return game['modes'][0]


def addresses(detect):
    """Indirizzi da leggere a ogni giro."""
    return [detect['active'][0], detect['p1'], detect['p2']]


class Detector:
    """Fine della partita da letture successive della RAM (``feed``).

    Si arma solo dopo aver visto una partita a due ancora aperta, così un
    valore vecchio rimasto in memoria (per esempio dallo stato di partenza)
    non chiude il gioco appena parte. Un esito vale solo se due letture di
    fila lo confermano.
    """

    def __init__(self, detect):
        self.detect = detect
        self.armed = False
        self.pending = None

    def outcome(self, values):
        """Esito delle letture ``values`` (``{indirizzo: byte}``): ``'open'``, ``None`` o ``{winner, score}``."""
        active_at, active_value = self.detect['active']
        if values.get(active_at) != active_value:
            return None
        p1, p2 = values.get(self.detect['p1']), values.get(self.detect['p2'])
        if p1 is None or p2 is None:
            return None
        draw = self.detect['draw']
        if draw is not None and p1 == p2 and p1 >= draw:
            return {'winner': None, 'score': [p1, p2]}
        target = self.detect['target']
        if max(p1, p2) >= target and p1 != p2:
            return {'winner': 'p1' if p1 > p2 else 'p2', 'score': [p1, p2]}
        return 'open'

    def feed(self, values):
        """Nuove letture: l'esito confermato della partita, oppure ``None`` se non è ancora finita."""
        found = self.outcome(values)
        if found == 'open':
            self.armed = True
            self.pending = None
            return None
        if found is None or not self.armed:
            self.pending = None
            return None
        if self.pending == found:
            return found
        self.pending = found
        return None
