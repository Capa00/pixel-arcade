"""Playlist condivise: filtri salvati e giochi aggiunti a mano (API.md, «Playlist»).

Un gioco fa parte di una playlist se è stato aggiunto a mano oppure se
rispetta i suoi filtri (quando ne ha). I filtri si applicano nell'interfaccia;
qui si controllano soltanto e si salvano in JSON.
"""
import json
import re

from .errors import PlaylistError, ProfileError
from .profiles import game_key, split_key, valid_id
from .repositories.cores import now_iso

NAME_MAX = 32
# Campi a più valori: tra i valori dello stesso campo vale «o», tra campi diversi «e».
LIST_FIELDS = ('genre', 'region', 'language', 'year', 'developer', 'publisher', 'kind', 'achievements')
# Giocatori: almeno N, oppure «Non indicato».
PLAYERS = ('2', '3', '4', '__none__')
# Stato del gioco per il profilo del P1: mai giocato o già giocato.
PLAYED = ('never', 'played')
TITLE_MAX = 40
VALUES_MAX = 500
VALUE_MAX = 200
GAMES_MAX = 1000


def normalize_name(name):
    """Nome senza spazi in eccesso, da 1 a ``NAME_MAX`` caratteri; altrimenti ``PlaylistError``."""
    if not isinstance(name, str):
        raise PlaylistError('Indica il nome della playlist.')
    value = re.sub(r'\s+', ' ', name).strip()
    if not value:
        raise PlaylistError('Indica il nome della playlist.')
    if len(value) > NAME_MAX:
        raise PlaylistError('Il nome della playlist può avere al massimo %d caratteri.' % NAME_MAX)
    return value


def normalize_filters(filters):
    """Filtri validi con i soli campi attivi (``{}`` = nessun filtro); altrimenti ``PlaylistError``.

    Campi: ``title`` (testo), quelli di ``LIST_FIELDS`` (liste di testi),
    ``players`` (uno di ``PLAYERS`` o ``null``), ``played`` (uno di
    ``PLAYED`` o ``null``) ed ``exclude`` (campi di ``LIST_FIELDS`` in cui i
    valori scelti escludono invece di includere; restano solo quelli attivi).
    """
    if filters is None:
        return {}
    if not isinstance(filters, dict):
        raise PlaylistError('Filtri non validi.')
    unknown = sorted(set(filters) - set(LIST_FIELDS) - {'title', 'players', 'played', 'exclude'})
    if unknown:
        raise PlaylistError('Filtro sconosciuto: %s.' % ', '.join(unknown))
    result = {}
    title = filters.get('title')
    if title is not None:
        if not isinstance(title, str) or len(title) > TITLE_MAX:
            raise PlaylistError('Titolo del filtro non valido.')
        if title.strip():
            result['title'] = title.strip()
    for field in LIST_FIELDS:
        values = filters.get(field)
        if values is None:
            continue
        if (not isinstance(values, list) or len(values) > VALUES_MAX
                or any(not isinstance(value, str) or not value or len(value) > VALUE_MAX for value in values)):
            raise PlaylistError('Valori del filtro non validi.')
        if values:
            result[field] = list(dict.fromkeys(values))
    for field, allowed in (('players', PLAYERS), ('played', PLAYED)):
        value = filters.get(field)
        if value is None:
            continue
        if value not in allowed:
            raise PlaylistError('Valore del filtro non valido.')
        result[field] = value
    exclude = filters.get('exclude')
    if exclude is not None:
        if not isinstance(exclude, list) or any(field not in LIST_FIELDS for field in exclude):
            raise PlaylistError('Valore del filtro non valido.')
        active = [field for field in dict.fromkeys(exclude) if field in result]
        if active:
            result['exclude'] = active
    return result


def read_filters(text):
    """Filtri salvati in JSON; un testo non leggibile vale «nessun filtro»."""
    try:
        return normalize_filters(json.loads(text))
    except (ValueError, PlaylistError):
        return {}


class PlaylistService:
    """Playlist nel formato dell'API. ``profiles`` (ProfileService) cerca i giochi e ne dà i riepiloghi."""

    def __init__(self, repo, profiles, now=now_iso):
        self.repo = repo
        self.profiles = profiles
        self.now = now

    def data(self):
        """``{playlists: [{id, name, filters, games}], games}``: ``games`` nelle playlist sono chiavi
        ``<system>/<id>``, in ``games`` ci sono i loro riepiloghi."""
        playlists = []
        keys = []
        for row in self.repo.list():
            games = [game_key(system_id, game_id) for system_id, game_id in row['games']]
            keys.extend(games)
            playlists.append({'id': row['id'], 'name': row['name'], 'filters': read_filters(row['filters']),
                              'games': games})
        return {'playlists': playlists, 'games': self.profiles.games_for(keys)}

    def check(self, playlist_id):
        if not valid_id(playlist_id) or not self.repo.exists(playlist_id):
            raise PlaylistError('Playlist non trovata.')

    def game(self, key):
        """``(system_id, game_id)`` di un gioco presente nella libreria; altrimenti ``PlaylistError``."""
        try:
            system_id, game_id = split_key(key)
        except ProfileError:
            raise PlaylistError('Gioco non valido.')
        if self.profiles.find_game(system_id, game_id) is None:
            raise PlaylistError('Gioco non trovato.')
        return system_id, game_id

    def create(self, name, filters=None, games=None):
        """Crea la playlist con filtri e giochi (facoltativi). 409 se il nome è già usato."""
        value = normalize_name(name)
        clean = normalize_filters(filters)
        if games is None:
            games = []
        if not isinstance(games, list) or len(games) > GAMES_MAX:
            raise PlaylistError('Giochi non validi.')
        pairs = [self.game(key) for key in games]
        self.repo.create(value, json.dumps(clean, ensure_ascii=False), self.now(), pairs)
        return self.data()

    def update(self, playlist_id, patch):
        """Cambia ``name`` e/o ``filters`` (``{}`` li toglie tutti)."""
        self.check(playlist_id)
        if not isinstance(patch, dict) or not patch or set(patch) - {'name', 'filters'}:
            raise PlaylistError('Modifiche non valide.')
        name = normalize_name(patch['name']) if 'name' in patch else None
        filters = json.dumps(normalize_filters(patch['filters']), ensure_ascii=False) if 'filters' in patch else None
        self.repo.update(playlist_id, name, filters)
        return self.data()

    def delete(self, playlist_id):
        self.check(playlist_id)
        self.repo.delete(playlist_id)
        return self.data()

    def set_game(self, playlist_id, key, on):
        """Aggiunge (``on``) o toglie un gioco. Per aggiungerlo deve esistere nella libreria; toglierlo è sempre possibile."""
        self.check(playlist_id)
        if not isinstance(on, bool):
            raise PlaylistError('Indica se aggiungere o togliere il gioco.')
        if on:
            system_id, game_id = self.game(key)
        else:
            try:
                system_id, game_id = split_key(key)
            except ProfileError:
                raise PlaylistError('Gioco non valido.')
        self.repo.set_game(playlist_id, system_id, game_id, on, self.now())
        return self.data()
