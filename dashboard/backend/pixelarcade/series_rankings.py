"""Classifiche di una serie di tornei (README «Torneo»): medagliere, punti e incontri, più l'albo d'oro.

Contano solo le edizioni concluse; entra chi ne ha giocata almeno una.

- **Medagliere**: ori, argenti, bronzi; a pari merito incontri vinti, poi edizioni giocate.
- **Punti**: ``POINTS`` per i piazzamenti fino al 5° (chi è a pari merito prende tutti i punti del posto),
  ``PARTICIPATION`` per gli altri, ritirati compresi; a pari merito ori, poi incontri vinti.
- **Incontri**: incontri vinti (il pareggio del girone vale mezzo), esclusi bye e vittorie a tavolino;
  a pari merito percentuale di vittorie, poi edizioni giocate.

Se anche i criteri di pari merito sono uguali la posizione è condivisa.
"""

POINTS = {1: 10, 2: 7, 3: 5, 4: 3, 5: 2}
PARTICIPATION = 1

KEYS = {
    'medals': lambda row: (row['gold'], row['silver'], row['bronze'], row['wins'], row['editions']),
    'points': lambda row: (row['points'], row['gold'], row['wins']),
    'matches': lambda row: (row['wins'], row['pct'], row['editions']),
}


def blank(player):
    return {'id': player['id'], 'name': player['name'], 'color': player['color'], 'editions': 0, 'gold': 0,
            'silver': 0, 'bronze': 0, 'points': 0, 'wins': 0, 'played': 0, 'pct': 0}


def ranked(rows, key):
    """Righe ordinate per ``key`` (decrescente) con ``position``, condivisa a parità; poi per nome."""
    ordered = sorted(rows, key=lambda row: (tuple(-value for value in key(row)), row['name'].lower(), row['id']))
    result = []
    for index, row in enumerate(ordered):
        same = result and key(result[-1]) == key(row)
        result.append(dict(row, position=result[-1]['position'] if same else index + 1))
    return result


def rankings(editions):
    """``{medals, points, matches}`` dalle edizioni concluse ``[{players, matches}]``.

    ``players`` sono gli iscritti del repository (``id``, ``name``, ``color``, ``place``); ``matches`` gli
    incontri salvati (``playerA``, ``playerB``, ``winnerId``, ``status``, ``bye``, ``walkover``).
    Ogni riga ha tutti i valori (``pct`` in percentuale intera).
    """
    rows = {}
    for edition in editions:
        for player in edition['players']:
            row = rows.setdefault(player['id'], blank(player))
            row['editions'] += 1
            place = player.get('place')
            if place in (1, 2, 3):
                row[('gold', 'silver', 'bronze')[place - 1]] += 1
            row['points'] += POINTS.get(place, PARTICIPATION) if place is not None else PARTICIPATION
        for match in edition['matches']:
            if match['status'] != 'done' or match['bye'] or match['walkover']:
                continue
            pair = [match['playerA'], match['playerB']]
            if None in pair:
                continue
            for player in pair:
                if player in rows:
                    rows[player]['played'] += 1
                    if match['winnerId'] is None:
                        rows[player]['wins'] += 0.5
                    elif match['winnerId'] == player:
                        rows[player]['wins'] += 1
    for row in rows.values():
        row['pct'] = round(100 * row['wins'] / row['played']) if row['played'] else 0
        if row['wins'] == int(row['wins']):
            row['wins'] = int(row['wins'])
    items = list(rows.values())
    return {name: ranked(items, key) for name, key in KEYS.items()}
