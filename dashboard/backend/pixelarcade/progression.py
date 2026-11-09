"""Progressione dei profili: XP per partita, livelli e titoli (README §H).

Solo funzioni pure: livello e XP non si salvano, si ricalcolano dalla somma
di ``session_players.xp_gained``.
"""

# Una partita conta solo da questa durata in su.
MIN_SECONDS = 20
# 1 XP al minuto, al massimo 180 per partita.
MAX_MINUTES = 180
SESSION_BONUS = 5
NEW_GAME_BONUS = 25
# Sul gioco della sfida della settimana (``leaderboard``) i minuti valgono il doppio.
CHALLENGE_FACTOR = 2

# (livello minimo, titolo), in ordine crescente.
TITLES = (
    (1, 'Recluta'),
    (3, 'Apprendista'),
    (6, 'Giocatore'),
    (10, 'Veterano'),
    (16, 'Campione'),
    (25, 'Maestro'),
    (35, 'Leggenda'),
)


def session_parts(seconds, is_new_game, challenge=False):
    """Voci degli XP di una partita: ``{minutes, session, newGame, challenge}``.

    Sotto i 20 s la partita non conta (tutte 0). Altrimenti 1 XP per minuto
    intero (al massimo 180), +5 per la partita e +25 se il gioco è nuovo per il profilo.
    Con ``challenge`` (gioco della sfida della settimana) ``challenge`` ripete i
    minuti, che così valgono il doppio; altrimenti è 0.
    """
    seconds = int(seconds or 0)
    if seconds < MIN_SECONDS:
        return {'minutes': 0, 'session': 0, 'newGame': 0, 'challenge': 0}
    minutes = min(seconds // 60, MAX_MINUTES)
    return {
        'minutes': minutes,
        'session': SESSION_BONUS,
        'newGame': NEW_GAME_BONUS if is_new_game else 0,
        'challenge': minutes * (CHALLENGE_FACTOR - 1) if challenge else 0,
    }


def session_xp(seconds, is_new_game, challenge=False):
    """XP guadagnati con una partita di ``seconds`` secondi: somma di :func:`session_parts`."""
    return sum(session_parts(seconds, is_new_game, challenge).values())


def level_floor(level):
    """XP necessari per raggiungere il livello ``level``: ``50·L·(L−1)``."""
    return 50 * level * (level - 1)


def level_for(xp):
    """Livello più alto con ``xp ≥ 50·L·(L−1)`` (almeno 1)."""
    level = 1
    while xp >= level_floor(level + 1):
        level += 1
    return level


def xp_percent(xp):
    """Avanzamento intero (0–99) dal livello attuale al successivo."""
    level = level_for(xp)
    start = level_floor(level)
    return (xp - start) * 100 // (level_floor(level + 1) - start)


def title_for(level):
    """Titolo del livello: Recluta, Apprendista, Giocatore, Veterano, Campione, Maestro, Leggenda."""
    result = TITLES[0][1]
    for minimum, title in TITLES:
        if level >= minimum:
            result = title
    return result
