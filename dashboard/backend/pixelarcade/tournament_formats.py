"""Formati dei tornei (README «Torneo»): opzioni, numero di incontri e tabellone.

Solo funzioni pure: niente database né file. Gli incontri sono dizionari con
le colonne di ``tournament_matches`` (``player_a``, ``from_a``, ``play_order``…);
al posto di ``id`` hanno una chiave locale ``key``, e ``from_a``/``from_b``
puntano a quella (``winner:<key>`` o ``loser:<key>``). Chi salva gli incontri
traduce le chiavi negli id del database.

Formati: ``single`` (eliminazione diretta), ``double`` (doppia
eliminazione), ``round_robin`` (girone all'italiana), ``swiss`` (svizzero),
``two_stage`` (due fasi). Per ora sono pronti ``single``, ``double`` e
``round_robin`` (``READY``, ``STARTABLE``).

Eliminazione diretta:

- **Tabellone.** Le teste di serie occupano le posizioni standard (1-16,
  8-9, 5-12, 4-13…), così 1 e 2 si possono incontrare solo in finale.
  ``player_a`` è sempre la testa di serie migliore dell'incontro.
- **Bye.** Se gli iscritti non sono una potenza di 2, le teste di serie
  migliori passano il primo turno senza giocare: l'incontro ha ``bye=1``, è
  già concluso e il vincitore è già nel turno dopo. Con 3 iscritti il 1° va
  direttamente in finale.
- **Ordine di gioco.** Si finisce un turno prima del successivo; dentro il
  turno vale l'ordine del tabellone. L'incontro per il 3° posto si gioca
  prima della finale, e c'è solo se si giocano due semifinali. I bye hanno
  ``play_order`` 0.
- **Serie.** Turni = ``round_series``, semifinale = ``semi_series`` (o come
  i turni), finale = ``final_series``, 3° posto come la semifinale.
- **Lati.** Alternati: nella partita 1 ``player_a`` sta nel lato
  svantaggiato (con nessun lato vantaggiato, in P1), poi i lati si
  scambiano. Sorteggiati: a caso. Liberi: li scelgono i giocatori.
- **Teste di serie.** ``seed_order``: a caso, per XP, per tempo giocato al
  gioco del torneo o misto (XP e tempo, ciascuno diviso per il massimo tra
  gli iscritti, con il peso degli XP in percentuale). Pareggi e valori a 0
  in ordine casuale.
- **Tavolino e ritiri.** Un incontro chiuso a tavolino ha ``walkover=1``.
  Il giocatore ritirato perde a tavolino l'incontro in cui si trova; se
  l'avversario non è ancora noto, l'incontro si chiude da solo appena lo
  diventa (``ready_matches`` con ``withdrawn``).
- **Annulla il risultato.** Solo se gli incontri dopo non sono iniziati;
  quelli chiusi da soli contro un ritirato si riaprono a catena
  (``undo_problem``, ``revert_winner``, ``undo_state``).
- **Piazzamenti.** 1° e 2° dalla finale; 3° e 4° dall'incontro per il 3°
  posto, oppure, senza, i due perdenti delle semifinali entrambi 3°. Gli
  altri a pari merito per turno: 5°, 9°, 17°, 33°.

Doppia eliminazione (``layout_double``):

- **Vincenti** (``bracket='winners'``, chiavi ``wr<turno>s<slot>``): come
  l'eliminazione diretta, senza semifinale speciale né 3° posto; la finale
  dei vincenti ha ``final_series``.
- **Perdenti** (``bracket='losers'``, chiavi ``lr<colonna>s<slot>``), con
  2(R−1) colonne per R turni dei vincenti: la colonna 1 mette a coppie i
  perdenti del 1° turno dei vincenti; la colonna pari 2j mette il vincitore
  della colonna prima contro un perdente del turno j+1 dei vincenti; la
  colonna dispari mette a coppie i vincitori della colonna prima. L'ultima
  colonna è la finale dei perdenti (``final_series``).
- **Incroci** (``standard_crossings``): ordine in cui i perdenti dei
  vincenti entrano nei perdenti, come Challonge. Colonna 1 in ordine;
  colonne pari a turni alterni con l'ordine invertito (la prima) e con le
  due metà scambiate (la seconda), così chi ha già giocato contro non si
  ritrova subito.
- **Bye nascosti.** Il perdente di un bye dei vincenti non esiste: lo slot
  resta vuoto (``from_*`` ``None``). Un incontro dei perdenti con uno slot
  vuoto ha ``bye=1`` e aspetta l'altro giocatore, poi si chiude da solo e
  lui avanza (``ready_matches``); con entrambi vuoti ha ``bye=1``, è già
  concluso senza vincitore e lascia vuoto lo slot dopo. Non si disegnano.
- **Gran finale** (``bracket='grand'``, ``g1``): vincitore dei vincenti
  (sempre ``player_a``) contro vincitore dei perdenti, serie
  ``grand_series`` o come le finali. Con ``reset`` c'è anche la rivincita
  ``g2`` (turno 2). Con ``none`` non c'è. Chi viene dai vincenti conta
  come testa di serie migliore (lato svantaggiato con i lati alternati),
  anche nella rivincita: lì è ``player_a`` perché ``from_a`` è il perdente
  della gran finale. ``order_players`` non si applica alla gran finale.
- **Rivincita.** Si gioca solo se vince la gran finale chi arriva dai
  perdenti; altrimenti diventa ``status='skipped'`` («non giocata»), senza
  giocatori né vincitore, e non conta tra gli incontri (``close_match``).
  Annullare la gran finale la riporta a ``waiting``.
- **Ordine di gioco** a colonne alterne: 1° turno dei vincenti, 1ª colonna
  dei perdenti, 2° turno dei vincenti, 2ª colonna dei perdenti… poi le
  colonne dei perdenti rimaste e la gran finale; dentro la colonna l'ordine
  del tabellone.
- **Incontri:** 2n−2, più la rivincita con ``reset`` (``match_count`` dà
  ``{min, max}``); 2n−3 senza gran finale. A torneo in corso
  ``played_count`` dà ``{min, max}`` finché la rivincita è da decidere.
- **Fine.** Il torneo finisce quando tutti gli incontri sono ``done`` o
  ``skipped`` (``all_closed``).
- **Piazzamenti** (``placements_double``): 1° e 2° dall'ultimo incontro
  della gran finale giocato; senza gran finale 1° il vincitore dei vincenti
  e 2° quello dei perdenti. Poi chi perde nei perdenti, dalla finale
  indietro, a pari merito per colonna: posto = 1 + giocatori piazzati sopra
  (16 iscritti: 3°, 4°, 5°–6°, 7°–8°, 9°–12°, 13°–16°). Un ritirato ha il
  posto della colonna in cui perde, anche a tavolino automatico.

Girone all'italiana (``layout_round_robin``, ``league_standings``):

- **Opzioni.** ``legs`` ``single``/``double`` (andata e ritorno),
  ``draws`` (pareggi ammessi), ``points`` (vittoria, pareggio, sconfitta;
  predefiniti 3/1/0), ``score`` (si registra il punteggio di ogni partita),
  ``walkoverScore`` (punteggio dell'incontro vinto a tavolino, predefinito
  1–0). Serie degli incontri = ``round_series``: «al meglio di» 1/3/5,
  oppure, con i pareggi, un numero fisso di partite 1/2/3
  (``series_choices``, ``fit_series``).
- **Calendario.** Metodo a rotazione (``circle_rounds``): ognuno incontra
  tutti; con un numero dispari di iscritti si riposa a turno. Chiavi
  ``rr<giornata>s<slot>``, ``bracket='league'``, ``round`` = giornata.
  ``player_a`` è la testa di serie migliore; al ritorno è la peggiore, così i
  lati si invertono. Tutti gli incontri sono pronti dall'avvio.
- **Incontri:** n(n−1)/2, il doppio con il ritorno (spareggi esclusi).
- **Classifica** (``league_standings``, mai salvata): punti (senza pareggi
  incontri vinti) → scontro diretto → differenza partite → partite vinte;
  con il punteggio differenza punteggio → punteggio fatto. Chi resta pari
  ha ``tied``.
- **Spareggi** (``playoff_state``, ``layout_playoff``): a girone finito,
  per ogni gruppo di non ritirati ancora pari che tocca il podio
  (``podium_ties``). Due pari: un incontro (``bracket='playoff'``) con la
  serie del girone e sempre un vincitore (serie fissa → «al meglio di»
  dispari, ``playoff_series``). Tre o più: mini-girone di sola andata con le
  regole del girone. ``group_no`` = gruppo dello spareggio. Gli spareggi
  dividono i pari solo a gruppo concluso e non entrano nei numeri della
  classifica; chi resta pari sul podio si sorteggia (``lots``). Con uno
  spareggio iniziato i risultati del girone non si annullano
  (``PLAYOFF_FIRST``).
- **Piazzamenti** (``placements_league``): non ritirati nell'ordine della
  classifica, i pari a pari merito; poi i ritirati, fuori dal podio.
"""

import random

from .errors import TournamentError

FORMATS = ('single', 'double', 'round_robin', 'swiss', 'two_stage')
# Formati che si scelgono nelle Impostazioni e formati che si avviano.
READY = ('single', 'double', 'round_robin')
STARTABLE = ('single', 'double', 'round_robin')
SERIES = (1, 3, 5)
# Serie fisse (numero di partite) del girone con i pareggi ammessi.
FIXED_SERIES = (1, 2, 3)
POINTS_MAX = 10
WALKOVER_SCORE_MAX = 99
# Opzioni proprie di ogni formato con i valori predefiniti; gli altri formati le avranno nei loro passi.
DEFAULTS = {
    'single': {'semiSeries': None},
    'double': {'grandFinal': 'reset', 'grandSeries': None},
    'round_robin': {'legs': 'single', 'draws': False, 'points': [3, 1, 0], 'score': False,
                    'walkoverScore': [1, 0]},
    'swiss': {},
    'two_stage': {},
}
# Valori ammessi per ogni opzione (le liste di numeri hanno un controllo a parte in ``valid_value``).
CHOICES = {
    'semiSeries': (None,) + SERIES,
    'grandFinal': ('reset', 'single', 'none'),
    'grandSeries': (None,) + SERIES,
    'legs': ('single', 'double'),
    'draws': (True, False),
    'score': (True, False),
}


def check_format(fmt):
    if fmt not in FORMATS:
        raise TournamentError('Formato non valido.')
    return fmt


def default_options(fmt):
    """Opzioni predefinite del formato ``fmt`` (copia: le liste non sono condivise)."""
    return {key: list(value) if isinstance(value, list) else value
            for key, value in DEFAULTS[check_format(fmt)].items()}


def whole(value, low, high):
    return isinstance(value, int) and not isinstance(value, bool) and low <= value <= high


def valid_value(key, value):
    if key == 'points':
        # Vittoria, pareggio, sconfitta: la vittoria vale più del pareggio, il pareggio almeno quanto la sconfitta.
        return isinstance(value, list) and len(value) == 3 and all(whole(item, 0, POINTS_MAX) for item in value) \
            and value[0] > value[1] >= value[2]
    if key == 'walkoverScore':
        # Vincitore, perdente: chi vince a tavolino ha più punti.
        return isinstance(value, list) and len(value) == 2 and \
            all(whole(item, 0, WALKOVER_SCORE_MAX) for item in value) and value[0] > value[1]
    if key in ('draws', 'score'):
        return isinstance(value, bool)
    if isinstance(value, bool):
        return False
    return value in CHOICES[key]


def series_choices(fmt, options):
    """Serie ammesse per gli incontri: nel girone con i pareggi un numero fisso di partite (1, 2, 3)."""
    if fmt == 'round_robin' and (options or {}).get('draws'):
        return FIXED_SERIES
    return SERIES


def fit_series(value, choices):
    """Serie ``value`` portata tra ``choices``: uguale se c'è, altrimenti la più vicina (a pari distanza la più
    lunga): accendendo i pareggi 5 diventa 3, spegnendoli 2 diventa 3."""
    if value in choices:
        return value
    return min(choices, key=lambda item: (abs(item - value), -item))


def check_options(fmt, options):
    """Opzioni normalizzate del formato (le mancanti prendono il predefinito), altrimenti ``TournamentError``."""
    defaults = default_options(fmt)
    if options is None:
        options = {}
    if not isinstance(options, dict):
        raise TournamentError('Opzioni del formato non valide.')
    result = dict(defaults)
    for key, value in options.items():
        if key not in defaults:
            raise TournamentError('Opzione sconosciuta per questo formato: %s.' % key)
        if not valid_value(key, value):
            raise TournamentError('Valore non valido per l\'opzione %s.' % key)
        result[key] = list(value) if isinstance(value, list) else value
    return result


def merge_options(old_fmt, old_options, new_fmt):
    """Opzioni del nuovo formato: tiene i valori compatibili di quelle vecchie, il resto prende i predefiniti."""
    result = default_options(new_fmt)
    for key, value in (old_options or {}).items():
        if key in result and valid_value(key, value):
            result[key] = list(value) if isinstance(value, list) else value
    return result


SEEDINGS = ('random', 'xp', 'time', 'mix')


def seed_order(players, method, weight=50, rng=None):
    """Teste di serie: ``players`` è ``[{account, xp, seconds}]``; restituisce ``[{account, value}]`` in ordine.

    ``value`` è il valore usato: XP, secondi, punteggio del misto (0–100, una
    cifra decimale) oppure ``None`` a caso. Pareggi e valori a 0 vanno in
    ordine casuale con ``rng``.
    """
    if method not in SEEDINGS:
        raise TournamentError('Teste di serie non valide.')
    rng = rng or random
    items = [dict(player) for player in players]
    rng.shuffle(items)
    if method == 'random':
        return [{'account': item['account'], 'value': None} for item in items]
    if method == 'mix':
        max_xp = max([item['xp'] for item in items] + [0])
        max_seconds = max([item['seconds'] for item in items] + [0])
        share = weight / 100

        def value_of(item):
            xp = item['xp'] / max_xp if max_xp else 0
            seconds = item['seconds'] / max_seconds if max_seconds else 0
            return round((share * xp + (1 - share) * seconds) * 100, 1)
    else:
        field = 'xp' if method == 'xp' else 'seconds'

        def value_of(item):
            return item[field]
    result = [{'account': item['account'], 'value': value_of(item)} for item in items]
    # Ordinamento stabile dopo il rimescolamento: a parità resta l'ordine casuale.
    result.sort(key=lambda item: -item['value'])
    return result


def first_round_slots(seeds):
    """Caselle del primo turno per gli id ``seeds`` in ordine di testa di serie (``None`` = vuota, bye)."""
    seeds = list(seeds)
    return [seeds[seed - 1] if seed <= len(seeds) else None for seed in seed_positions(bracket_size(len(seeds)))]


# --- Tabellone dell'eliminazione diretta ----------------------------------------------


def bracket_size(n):
    """Potenza di 2 più piccola che contiene ``n`` giocatori (almeno 2)."""
    size = 2
    while size < n:
        size *= 2
    return size


def seed_positions(size):
    """Teste di serie (da 1) nelle posizioni del tabellone, a coppie per il primo turno.

    Con 16: 1, 16, 9, 8, 5, 12, 13, 4, 3, 14, 11, 6, 7, 10, 15, 2: le coppie
    sono 1-16, 8-9, 5-12, 4-13…, e 1 e 2 stanno in metà opposte.
    """
    order = [1]
    while len(order) < size:
        total = len(order) * 2 + 1
        result = []
        for index, seed in enumerate(order):
            pair = [seed, total - seed]
            result.extend(pair if index % 2 == 0 else pair[::-1])
        order = result
    return order


def rounds_of(size):
    count = 0
    while size > 1:
        size //= 2
        count += 1
    return count


def match_key(round_no, slot):
    return 'r%ds%d' % (round_no, slot)


def build_single(seeds, round_series, semi_series, final_series, third_place):
    """Incontri dell'eliminazione diretta; ``seeds`` sono gli id in ordine di testa di serie."""
    seeds = list(seeds)
    return layout_from_slots(first_round_slots(seeds), round_series, semi_series, final_series, third_place, seeds)


def check_first_round(slots):
    """Caselle del primo turno valide (potenza di 2, almeno due giocatori diversi), altrimenti ``TournamentError``."""
    slots = list(slots)
    size = len(slots)
    if size < 2 or size != bracket_size(size):
        raise TournamentError('Tabellone non valido.')
    players = [player for player in slots if player is not None]
    if len(players) < 2 or len(set(players)) != len(players):
        raise TournamentError('Tabellone non valido.')
    return slots


def new_match(key, bracket, round_no, slot, series):
    return {'key': key, 'stage': 1, 'group_no': None, 'bracket': bracket, 'round': round_no, 'slot': slot,
            'play_order': 0, 'player_a': None, 'player_b': None, 'from_a': None, 'from_b': None,
            'series': series, 'status': 'waiting', 'winner_id': None, 'walkover': 0, 'bye': 0}


def elimination_rounds(slots, series_of, bracket, prefix=''):
    """Turni di un tabellone a eliminazione dalle caselle del primo turno: ``(incontri, bye)``.

    Chiavi ``<prefix>r<turno>s<slot>``; ``series_of(turno)`` dà la serie. I
    bye del primo turno hanno ``bye=1`` e il giocatore in ``player_a``, ma
    non sono ancora chiusi.
    """
    size = len(slots)
    total = rounds_of(size)
    matches = []
    for round_no in range(1, total + 1):
        for slot in range(size >> round_no):
            match = new_match(prefix + match_key(round_no, slot), bracket, round_no, slot, series_of(round_no))
            if round_no == 1:
                first, second = slots[slot * 2], slots[slot * 2 + 1]
                if first is None and second is None:
                    raise TournamentError('Un incontro del primo turno è senza giocatori.')
                match['player_a'], match['player_b'] = first, second
            else:
                match['from_a'] = 'winner:' + prefix + match_key(round_no - 1, slot * 2)
                match['from_b'] = 'winner:' + prefix + match_key(round_no - 1, slot * 2 + 1)
            matches.append(match)
    byes = [match for match in matches if match['round'] == 1 and None in (match['player_a'], match['player_b'])]
    for match in byes:
        match['bye'] = 1
        if match['player_a'] is None:
            match['player_a'], match['player_b'] = match['player_b'], None
    return matches, byes


def number_and_close(matches, byes, sort_key, rank):
    """Numeri d'ordine (``sort_key``) per gli incontri senza bye, poi chiude i bye del primo turno."""
    for match in matches:
        if match['round'] == 1 and match['bracket'] in ('main', 'winners') and not match['bye']:
            order_players(match, rank)
    number = 0
    for match in sorted(matches, key=sort_key):
        if not match['bye']:
            number += 1
            match['play_order'] = number
    for match in byes:
        match['status'] = 'done'
        match['winner_id'] = match['player_a']
        place_result(matches, match['key'], match['player_a'], None, rank)
    ready_matches(matches)
    return matches


def layout_from_slots(slots, round_series, semi_series, final_series, third_place, seeds=None):
    """Come ``build_single``, con le posizioni del primo turno già decise.

    ``slots`` ha una casella per posizione (lunghezza potenza di 2; ``None`` =
    vuota: l'avversario ha il bye). ``seeds`` (id in ordine di testa di serie)
    serve a mettere in ``player_a`` la testa di serie migliore; senza, l'ordine
    è quello delle caselle.
    """
    slots = check_first_round(slots)
    rank = seed_rank(seeds)
    total = rounds_of(len(slots))
    semi_series = semi_series or round_series

    def series_of(round_no):
        if round_no == total:
            return final_series
        if round_no == total - 1:
            return semi_series
        return round_series

    matches, byes = elimination_rounds(slots, series_of, 'main')
    semis = [match for match in matches if match['round'] == total - 1]
    if third_place and len(semis) == 2 and not any(match['bye'] for match in semis):
        third = new_match('third', 'third', total, 0, semi_series)
        third['from_a'], third['from_b'] = 'loser:' + semis[0]['key'], 'loser:' + semis[1]['key']
        matches.append(third)
    # Ordine di gioco: turno per turno, il 3° posto prima della finale.
    return number_and_close(matches, byes, lambda item: (item['round'], item['bracket'] != 'third', item['slot']),
                            rank)


# --- Doppia eliminazione --------------------------------------------------------------


def winners_key(round_no, slot):
    return 'w' + match_key(round_no, slot)


def losers_key(column, slot):
    return 'l' + match_key(column, slot)


def losers_columns(size):
    """Colonne dei perdenti per un tabellone dei vincenti di ``size`` posti."""
    return 2 * (rounds_of(size) - 1)


def losers_column_size(size, column):
    """Incontri della colonna ``column`` (da 1) dei perdenti."""
    return size >> ((column + 1) // 2 + 1)


def standard_crossings(size):
    """Incroci standard ``{colonna dei perdenti: [chiavi degli incontri dei vincenti]}`` (vedi il modulo).

    Colonna 1: i perdenti del 1° turno dei vincenti a coppie, nell'ordine
    della lista. Colonna pari 2j: lo slot k riceve il perdente dell'incontro
    in posizione k della lista (turno j+1 dei vincenti).
    """
    total = rounds_of(size)
    result = {1: [winners_key(1, slot) for slot in range(size // 2)]}
    for drop in range(1, total):
        keys = [winners_key(drop + 1, slot) for slot in range(size >> (drop + 1))]
        half = len(keys) // 2
        result[2 * drop] = keys[::-1] if drop % 2 == 1 else keys[half:] + keys[:half]
    return result


def check_crossings(crossings, size):
    """Incroci validi per ``size`` posti: ``{colonna: [chiavi]}`` con colonne intere, altrimenti ``TournamentError``.

    Ogni colonna degli incroci standard deve esserci con una permutazione
    delle sue chiavi: si scambiano solo ingressi della stessa colonna.
    """
    standard = standard_crossings(size)
    if not isinstance(crossings, dict):
        raise TournamentError('Incroci dei perdenti non validi.')
    result = {}
    for key, value in crossings.items():
        try:
            column = int(key)
        except (TypeError, ValueError):
            raise TournamentError('Incroci dei perdenti non validi.')
        if column not in standard or column in result or not isinstance(value, list) \
                or any(not isinstance(item, str) for item in value) \
                or sorted(value) != sorted(standard[column]):
            raise TournamentError('Incroci dei perdenti non validi.')
        result[column] = list(value)
    if set(result) != set(standard):
        raise TournamentError('Incroci dei perdenti non validi.')
    return result


def crossing_list(crossings, column):
    value = crossings.get(column)
    if value is None:
        value = crossings.get(str(column))
    if value is None:
        raise TournamentError('Incroci dei perdenti non validi.')
    return list(value)


def layout_double(slots, round_series, final_series, grand_final='reset', grand_series=None, seeds=None,
                  crossings=None):
    """Incontri della doppia eliminazione dalle caselle del primo turno dei vincenti (vedi il modulo).

    ``slots`` e ``seeds`` come ``layout_from_slots``; ``grand_final`` è
    ``reset``, ``single`` o ``none``; ``grand_series`` ``None`` = come le
    finali. ``crossings`` come ``standard_crossings`` (predefinito).
    """
    slots = check_first_round(slots)
    if grand_final not in CHOICES['grandFinal']:
        raise TournamentError('Gran finale non valida.')
    rank = seed_rank(seeds)
    size = len(slots)
    total = rounds_of(size)
    columns = losers_columns(size)
    matches, byes = elimination_rounds(slots, lambda round_no: final_series if round_no == total else round_series,
                                       'winners', 'w')
    crossings = standard_crossings(size) if crossings is None else check_crossings(crossings, size)
    # Sorgenti che non porteranno mai un giocatore (perdente di un bye, vincitore di un incontro vuoto).
    empty = {'loser:' + match['key'] for match in byes}
    for column in range(1, columns + 1):
        count = losers_column_size(size, column)
        entries = crossing_list(crossings, column) if column == 1 or column % 2 == 0 else None
        for slot in range(count):
            match = new_match(losers_key(column, slot), 'losers', column, slot,
                              final_series if column == columns else round_series)
            if column == 1:
                sources = ('loser:' + entries[slot * 2], 'loser:' + entries[slot * 2 + 1])
            elif column % 2 == 0:
                sources = ('winner:' + losers_key(column - 1, slot), 'loser:' + entries[slot])
            else:
                sources = ('winner:' + losers_key(column - 1, slot * 2),
                           'winner:' + losers_key(column - 1, slot * 2 + 1))
            sources = [source for source in sources if source not in empty]
            if len(sources) < 2:
                match['bye'] = 1
                if not sources:
                    match['status'] = 'done'
                    empty.add('winner:' + match['key'])
            match['from_a'] = sources[0] if sources else None
            match['from_b'] = sources[1] if len(sources) > 1 else None
            matches.append(match)
    if grand_final != 'none':
        series = grand_series or final_series
        grand = new_match('g1', 'grand', 1, 0, series)
        grand['from_a'] = 'winner:' + winners_key(total, 0)
        grand['from_b'] = 'winner:' + losers_key(columns, 0)
        matches.append(grand)
        if grand_final == 'reset':
            reset = new_match('g2', 'grand', 2, 0, series)
            reset['from_a'], reset['from_b'] = 'loser:g1', 'winner:g1'
            matches.append(reset)
    return number_and_close(matches, byes, lambda item: (double_column(item, total), item['slot']), rank)


def double_column(match, total):
    """Colonna del disegno della doppia per l'ordine di gioco (vedi il modulo)."""
    if match['bracket'] == 'winners':
        return 2 * (match['round'] - 1)
    if match['bracket'] == 'losers':
        column = match['round']
        return 2 * column - 1 if column <= total else total + column - 1
    return 10 ** 6 + match['round']


def hidden_bye(match):
    """Vero per un incontro dei perdenti con un solo slot che porta un giocatore (si chiude da solo)."""
    return bool(match['bye']) and (match['from_a'] is not None or match['from_b'] is not None)


def seed_rank(seeds):
    return {player: index for index, player in enumerate(seeds or [])}


def order_players(match, rank):
    """Mette in ``player_a`` la testa di serie migliore (scambiando anche ``from_a``/``from_b``)."""
    first, second = match['player_a'], match['player_b']
    if first is None or second is None or not rank:
        return
    if rank.get(second, len(rank)) < rank.get(first, len(rank)):
        match['player_a'], match['player_b'] = second, first
        match['from_a'], match['from_b'] = match['from_b'], match['from_a']


def place_result(matches, key, winner, loser, rank):
    for match in matches:
        for side in ('a', 'b'):
            source = match['from_' + side]
            if source == 'winner:' + key:
                match['player_' + side] = winner
            elif source == 'loser:' + key:
                match['player_' + side] = loser
        # Nella gran finale chi viene dai vincenti resta in ``player_a``.
        if match['bracket'] != 'grand' and (match['from_a'] in ('winner:' + key, 'loser:' + key) or
                                            match['from_b'] in ('winner:' + key, 'loser:' + key)):
            order_players(match, rank)


def match_count(fmt, n, options=None, third_place=False):
    """Incontri da giocare (senza i bye) con ``n`` iscritti; ``None`` per i formati non ancora pronti.

    Per la doppia ``{min, max}``: la rivincita della gran finale si gioca solo
    se vince chi arriva dai perdenti. Per il girone gli incontri del
    calendario, senza gli eventuali spareggi.
    """
    check_format(fmt)
    if fmt == 'double':
        grand = dict(DEFAULTS['double'], **(options or {})).get('grandFinal')
        if n < 2:
            return {'min': 0, 'max': 0}
        least = 2 * n - 3 if grand == 'none' else 2 * n - 2
        return {'min': least, 'max': least + (1 if grand == 'reset' else 0)}
    if fmt == 'round_robin':
        legs = 2 if dict(DEFAULTS['round_robin'], **(options or {})).get('legs') == 'double' else 1
        return legs * n * (n - 1) // 2
    if fmt != 'single':
        return None
    if n < 2:
        return 0
    return n - 1 + (1 if third_place and n >= 4 else 0)


def local_match(match):
    """Incontro salvato (chiavi del repository) nella forma di questo modulo (``key`` = id in testo)."""
    return {'key': str(match['id']), 'id': match['id'], 'bracket': match['bracket'], 'round': match['round'],
            'slot': match['slot'], 'play_order': match['playOrder'], 'player_a': match['playerA'],
            'player_b': match['playerB'], 'from_a': match['fromA'], 'from_b': match['fromB'],
            'status': match['status'], 'winner_id': match['winnerId'], 'walkover': int(bool(match['walkover'])),
            'bye': match['bye'], 'series': match['series'], 'group_no': match.get('groupNo')}


def find(matches, key):
    for match in matches:
        if match['key'] == key:
            return match
    raise TournamentError('Incontro non trovato.')


def loser_of(match):
    """Perdente dell'incontro concluso ``match`` (``None`` senza vincitore o con il bye)."""
    if match['winner_id'] is None or match['bye']:
        return None
    return match['player_b'] if match['winner_id'] == match['player_a'] else match['player_a']


def ready_matches(matches, withdrawn=None, rank=None):
    """Aggiorna ``waiting`` → ``ready`` quando i due giocatori sono noti; restituisce il prossimo da giocare.

    Con ``withdrawn`` (giocatori ritirati) un incontro pronto con un ritirato
    si chiude da solo a tavolino per l'altro, e il vincitore avanza (anche più
    volte di fila). ``rank`` è quello di ``seed_rank``. Il prossimo è il primo
    per ``play_order`` tra quelli pronti o in gioco; ``None`` se non ce n'è.
    """
    withdrawn = set(withdrawn or ())
    changed = True
    while changed:
        changed = False
        for match in matches:
            if match['status'] == 'waiting' and match['bye']:
                # Bye nascosto dei perdenti: arrivato il giocatore, passa da solo.
                known = [player for player in (match['player_a'], match['player_b']) if player is not None]
                if known:
                    match['player_a'], match['player_b'] = known[0], None
                    close_match(matches, match, known[0], False, rank or {})
                    changed = True
                continue
            if match['status'] == 'waiting' and match['player_a'] is not None and match['player_b'] is not None:
                match['status'] = 'ready'
            if match['status'] == 'ready' and withdrawn & {match['player_a'], match['player_b']}:
                winner = match['player_b'] if match['player_a'] in withdrawn and \
                    match['player_b'] not in withdrawn else match['player_a']
                close_match(matches, match, winner, True, rank or {})
                changed = True
    pending = [match for match in matches if match['status'] in ('ready', 'playing')]
    return min(pending, key=lambda item: item['play_order']) if pending else None


def close_match(matches, match, winner, walkover, rank):
    match['winner_id'] = winner
    match['status'] = 'done'
    match['walkover'] = 1 if walkover else 0
    place_result(matches, match['key'], winner, loser_of(match), rank)
    if match['bracket'] == 'grand' and match['round'] == 1 and winner == match['player_a']:
        # Ha vinto chi arriva dai vincenti: la rivincita non si gioca.
        for item in dependents(matches, match['key']):
            if item['bracket'] == 'grand':
                item['player_a'] = item['player_b'] = None
                item['winner_id'] = None
                item['status'] = 'skipped'


CLOSED = ('done', 'skipped')


def all_closed(matches):
    """Vero se non resta nessun incontro da giocare (tutti ``done`` o ``skipped``)."""
    return bool(matches) and all(match['status'] in CLOSED for match in matches)


def played_count(matches):
    """Incontri del torneo senza bye e rivincite non giocate: intero, oppure ``{min, max}`` finché la rivincita
    della doppia è da decidere."""
    real = [match for match in matches if not match['bye'] and match['status'] != 'skipped']
    open_reset = any(match['bracket'] == 'grand' and match['round'] > 1 and match['status'] == 'waiting'
                     for match in real)
    return {'min': len(real) - 1, 'max': len(real)} if open_reset else len(real)


def apply_winner(matches, key, winner, seeds=None, withdrawn=None, walkover=False, draw=False):
    """Chiude l'incontro ``key`` con il vincitore ``winner`` e sposta vincitore e perdente negli incontri dopo.

    ``walkover`` vero = vittoria a tavolino. Con ``draw`` l'incontro del
    girone finisce pari (``winner`` ``None``). Con ``withdrawn`` gli incontri
    che diventano pronti con un ritirato si chiudono da soli (``ready_matches``).
    """
    match = find(matches, key)
    if match['status'] == 'done':
        raise TournamentError('L\'incontro è già concluso.')
    if match['player_a'] is None or match['player_b'] is None:
        raise TournamentError('L\'incontro non ha ancora i due giocatori.')
    if draw:
        if match['bracket'] not in ('league', 'playoff') or winner is not None or walkover:
            raise TournamentError('Solo un incontro del girone può finire pari.')
    elif winner not in (match['player_a'], match['player_b']):
        raise TournamentError('Il vincitore non gioca questo incontro.')
    rank = seed_rank(seeds)
    close_match(matches, match, winner, walkover, rank)
    return ready_matches(matches, withdrawn, rank)


def dependents(matches, key):
    return [match for match in matches
            if match['from_a'] in ('winner:' + key, 'loser:' + key)
            or match['from_b'] in ('winner:' + key, 'loser:' + key)]


def automatic(match, withdrawn):
    """Vero se ``match`` è chiuso a tavolino contro un ritirato (si può riaprire insieme a quello prima)."""
    return match['status'] == 'done' and bool(match['walkover']) and loser_of(match) in set(withdrawn or ())


def match_code(matches, match):
    """Codice dell'incontro della doppia come nell'interfaccia (``V2-1``, ``P3-2``, ``GF``, ``GF2``), ``None`` negli
    altri formati."""
    if match['bracket'] == 'grand':
        return 'GF2' if match['round'] > 1 else 'GF'
    if match['bracket'] not in ('winners', 'losers'):
        return None
    letter = 'V' if match['bracket'] == 'winners' else 'P'
    column = sorted((item for item in matches if item['bracket'] == match['bracket'] and
                     item['round'] == match['round'] and not item['bye']), key=lambda item: item['slot'])
    return '%s%d-%d' % (letter, match['round'], column.index(match) + 1)


def started_text(matches, match):
    code = match_code(matches, match)
    return '%s è già iniziato.' % code if code else 'L\'incontro successivo è già iniziato.'


def undo_problem(matches, key, withdrawn=None):
    """Perché il risultato dell'incontro concluso ``key`` non si può annullare, oppure ``None``.

    Gli incontri dopo non devono essere iniziati; quelli chiusi a tavolino
    contro un ritirato si riaprono con lui, se a loro volta si possono riaprire.
    Nella doppia il motivo cita il codice dell'incontro dopo («P2-1 è già
    iniziato»): i due incontri del vincitore e del perdente, la rivincita per
    la gran finale.
    """
    for item in dependents(matches, key):
        if item['status'] == 'playing':
            return started_text(matches, item)
        if item['status'] == 'done':
            if automatic(item, withdrawn) or hidden_bye(item):
                problem = undo_problem(matches, item['key'], withdrawn)
                if problem is None:
                    continue
                return problem
            return started_text(matches, item)
    return None


def revert_winner(matches, key, withdrawn=None):
    """Annulla il risultato dell'incontro ``key``, se gli incontri che ne dipendono non sono iniziati.

    L'incontro torna ``ready`` senza vincitore né tavolino; vincitore e
    perdente escono dagli incontri dopo. Gli incontri dopo chiusi a tavolino
    contro un ritirato (``withdrawn``) si riaprono anche loro, a catena.
    """
    match = find(matches, key)
    if match['status'] != 'done' or match['bye']:
        raise TournamentError('L\'incontro non ha un risultato da annullare.')
    problem = undo_problem(matches, key, withdrawn)
    if problem:
        raise TournamentError(problem)
    reopen_match(matches, match)
    return ready_matches(matches)


def reopen_match(matches, match):
    """Toglie il risultato di ``match`` e, a catena, quello degli incontri dopo già chiusi (senza controlli)."""
    key = match['key']
    following = dependents(matches, key)
    for item in following:
        if item['status'] == 'done':
            reopen_match(matches, item)
    for item in following:
        for side in ('a', 'b'):
            if item['from_' + side] in ('winner:' + key, 'loser:' + key):
                item['player_' + side] = None
        item['status'] = 'waiting'
    match['winner_id'] = None
    match['walkover'] = 0
    match['status'] = 'waiting' if match['bye'] else 'ready'


def undo_state(matches, key, withdrawn=None, games=0):
    """Cosa annulla «Annulla il risultato» sull'incontro ``key``: ``(tipo, problema)``.

    ``tipo``: ``result`` (risultato di un incontro concluso), ``walkover``
    (tavolino), ``withdrawal`` (tavolino o attesa di un ritirato: annulla anche
    il ritiro), ``game`` (ultima partita di un incontro non concluso) oppure
    ``None`` (niente da annullare). ``problema`` è il motivo per cui non si può
    (voce grigia), altrimenti ``None``. ``games`` = partite dichiarate.
    """
    match = find(matches, key)
    withdrawn = set(withdrawn or ())
    if match['bye']:
        return None, None
    if match['status'] == 'done':
        kind = 'result'
        if match['walkover']:
            kind = 'withdrawal' if loser_of(match) in withdrawn else 'walkover'
        if match['bracket'] == 'league' and playoff_started(matches):
            return kind, PLAYOFF_FIRST
        return kind, undo_problem(matches, key, withdrawn)
    if games:
        return 'game', None
    if withdrawn & {match['player_a'], match['player_b']}:
        return 'withdrawal', None
    return None, None


PLAYOFF_FIRST = 'Prima va annullato lo spareggio.'


def playoff_started(matches):
    """Vero se uno spareggio del girone è iniziato o concluso (allora i risultati del girone non si annullano)."""
    return any(match['bracket'] == 'playoff' and match['status'] in ('playing', 'done') for match in matches)


def playoff_keys(matches):
    """Chiavi degli incontri di spareggio (si cancellano annullando un risultato del girone, se non iniziati)."""
    return [match['key'] for match in matches if match['bracket'] == 'playoff']


def game_sides(game_no, sides, advantaged_side='none', rng=None):
    """Lato (``p1``/``p2``) di ``player_a`` nella partita ``game_no`` (da 1); ``None`` con i lati liberi."""
    if sides == 'free':
        return None
    if sides == 'random':
        return (rng or random).choice(('p1', 'p2'))
    if sides != 'alternate':
        raise TournamentError('Scelta dei lati non valida.')
    first = 'p2' if advantaged_side == 'p1' else 'p1'
    other = 'p1' if first == 'p2' else 'p2'
    return first if game_no % 2 == 1 else other


def placements_single(matches):
    """Piazzamenti noti ``{giocatore: posto}`` (vedi il modulo)."""
    main = [match for match in matches if match['bracket'] == 'main']
    if not main:
        return {}
    total = max(match['round'] for match in main)
    places = {}
    for match in main:
        if match['status'] != 'done' or match['bye'] or match['winner_id'] is None:
            continue
        loser = match['player_b'] if match['winner_id'] == match['player_a'] else match['player_a']
        if match['round'] == total:
            places[match['winner_id']] = 1
            places[loser] = 2
        else:
            places[loser] = 2 ** (total - match['round']) + 1
    third = [match for match in matches if match['bracket'] == 'third']
    if third:
        for match in third:
            for player in (match['player_a'], match['player_b']):
                places.pop(player, None)
            if match['status'] == 'done' and match['winner_id'] is not None:
                loser = match['player_b'] if match['winner_id'] == match['player_a'] else match['player_a']
                places[match['winner_id']] = 3
                places[loser] = 4
    return {player: place for player, place in places.items() if player is not None}


def placements_double(matches):
    """Piazzamenti noti ``{giocatore: posto}`` della doppia eliminazione (vedi il modulo)."""
    places = {}
    grand = [match for match in matches if match['bracket'] == 'grand']
    played = [match for match in grand if match['status'] == 'done' and match['winner_id'] is not None]
    if played:
        last = max(played, key=lambda item: item['round'])
        places[last['winner_id']] = 1
        places[loser_of(last)] = 2
    elif not grand:
        for bracket, place in (('winners', 1), ('losers', 2)):
            column = [match for match in matches if match['bracket'] == bracket]
            if not column:
                continue
            total = max(match['round'] for match in column)
            for match in column:
                if match['round'] == total and match['status'] == 'done' and match['winner_id'] is not None:
                    places[match['winner_id']] = place
    losers = [match for match in matches if match['bracket'] == 'losers']
    above = 2
    for column in range(max([match['round'] for match in losers] + [0]), 0, -1):
        real = [match for match in losers if match['round'] == column and not match['bye']]
        for match in real:
            if match['status'] == 'done' and match['winner_id'] is not None:
                places[loser_of(match)] = above + 1
        above += len(real)
    return {player: place for player, place in places.items() if player is not None}


def placements(fmt, matches):
    """Piazzamenti noti del formato ``fmt`` (``placements_single`` o ``placements_double``)."""
    return placements_double(matches) if fmt == 'double' else placements_single(matches)


# --- Girone all'italiana ------------------------------------------------------------------------


def wins_needed(series):
    """Vittorie che chiudono una serie «al meglio di» ``series``."""
    return series // 2 + 1


def game_rules(fmt, bracket, options, mini=False):
    """Regole della dichiarazione di una partita: ``{draws, score, fixed}``.

    Solo nel girone (``bracket`` ``league`` o ``playoff``): ``draws`` = il
    pareggio si può dichiarare, ``score`` = si registra il punteggio,
    ``fixed`` = la serie è un numero fisso di partite (con i pareggi ammessi).
    Lo spareggio a due (``playoff`` senza ``mini``) ha sempre un vincitore:
    niente pareggi e serie «al meglio di»; il mini-girone ha le regole del
    girone. Negli altri formati tutto falso.
    """
    if fmt != 'round_robin' or bracket not in ('league', 'playoff'):
        return {'draws': False, 'score': False, 'fixed': False}
    options = dict(DEFAULTS['round_robin'], **(options or {}))
    draws = bool(options['draws']) and (bracket == 'league' or mini)
    return {'draws': draws, 'score': bool(options['score']), 'fixed': draws}


def whole_score(value):
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= WALKOVER_SCORE_MAX


def check_game_result(rules, player_a, player_b, winner, draw=False, score=None):
    """Partita dichiarata controllata: ``(esito, punteggio_a, punteggio_b)``, altrimenti ``TournamentError``.

    ``esito`` è ``'replay'`` («rigioca»: la partita non conta), ``'draw'`` o
    l'id del vincitore. ``score`` è ``[punti di player_a, punti di player_b]``,
    obbligatorio con ``rules['score']`` (tranne per «rigioca») e vietato senza;
    deve essere coerente: chi vince ha più punti, con il pari sono uguali.
    """
    if draw:
        if winner is not None:
            raise TournamentError('Una partita pari non ha un vincitore.')
        if not rules['draws']:
            raise TournamentError('Il pareggio non è ammesso in questo torneo.')
    elif winner is not None and (isinstance(winner, bool) or winner not in (player_a, player_b)):
        raise TournamentError('Il vincitore non gioca questo incontro.')
    outcome = 'draw' if draw else 'replay' if winner is None else winner
    if outcome == 'replay' or not rules['score']:
        if score is not None:
            raise TournamentError('Questo torneo non registra il punteggio.' if not rules['score']
                                  else 'Una partita da rigiocare non ha punteggio.')
        return outcome, None, None
    if not isinstance(score, (list, tuple)) or len(score) != 2 or not all(whole_score(item) for item in score):
        raise TournamentError('Indica il punteggio dei due giocatori (da 0 a %d).' % WALKOVER_SCORE_MAX)
    score_a, score_b = score
    if outcome == 'draw' and score_a != score_b:
        raise TournamentError('In una partita pari il punteggio è uguale.')
    if outcome != 'draw':
        made, conceded = (score_a, score_b) if outcome == player_a else (score_b, score_a)
        if made <= conceded:
            raise TournamentError('Chi vince la partita deve avere più punti.')
    return outcome, score_a, score_b


def series_result(series, fixed, player_a, player_b, winners):
    """Esito della serie dopo le partite ``winners`` (id del vincitore, ``None`` = pari): ``(chiusa, vincitore)``.

    Con ``fixed`` la serie è di ``series`` partite: chiusa all'ultima, vince
    chi ne ha vinte di più, altrimenti è pari (vincitore ``None``). Senza,
    «al meglio di» ``series``: chiusa alle vittorie necessarie.
    """
    won_a = sum(1 for winner in winners if winner == player_a)
    won_b = sum(1 for winner in winners if winner == player_b)
    if fixed:
        if len(winners) < series:
            return False, None
        return True, player_a if won_a > won_b else player_b if won_b > won_a else None
    needed = wins_needed(series)
    if won_a >= needed:
        return True, player_a
    if won_b >= needed:
        return True, player_b
    return False, None


def league_key(round_no, slot):
    return 'rr%ds%d' % (round_no, slot)


def circle_rounds(order, seeds=None):
    """Giornate di sola andata col metodo a rotazione: ``[[(a, b)…]…]``, ``a`` testa di serie migliore.

    ``order`` sono le posizioni nel calendario, ``seeds`` le teste di serie
    (senza, le stesse posizioni). Il primo resta fermo e gli altri girano; con un numero dispari di iscritti
    c'è un posto vuoto (``None``) e chi gli capita contro riposa (la coppia
    non c'è). Dentro la giornata le coppie partono da un punto diverso a ogni
    giornata, così la testa di serie 1 non gioca sempre per prima.
    """
    rank = {player: position for position, player in enumerate(seeds or order)}
    ring = list(order) + ([None] if len(order) % 2 else [])
    size = len(ring)
    rounds = []
    for index in range(size - 1):
        pairs = []
        for slot in range(size // 2):
            first, second = ring[slot], ring[size - 1 - slot]
            if first is None or second is None:
                continue
            pairs.append((first, second) if rank[first] < rank[second] else (second, first))
        shift = index % len(pairs) if pairs else 0
        rounds.append(pairs[shift:] + pairs[:shift])
        ring = [ring[0], ring[-1]] + ring[1:-1]
    return rounds


def clash(before, after):
    return 1 if before is not None and set(before) & set(after) else 0


def spread_rounds(rounds):
    """Giornate riordinate dentro di sé perché chi chiude una giornata non apra la successiva.

    Per ogni giornata si scelgono il primo e l'ultimo incontro (gli altri
    restano nell'ordine dato) con il minimo di incontri di fila in tutto il
    calendario (programmazione dinamica sull'ultimo incontro di ogni
    giornata). Restituisce ``(giornate, incontri di fila)``.
    """
    # best: {indice dell'ultimo incontro della giornata: incontri di fila}; back: da dove si arriva.
    best, back = {None: 0}, []
    previous_pairs = None
    for pairs in rounds:
        # Per ogni primo incontro il costo migliore arrivando dalla giornata prima.
        entry = []
        for first in range(len(pairs)):
            options = [(cost + clash(previous_pairs[before] if before is not None else None, pairs[first]), before)
                       for before, cost in best.items()]
            entry.append(min(options, key=lambda item: item[0]))
        following, links = {}, {}
        for last in range(len(pairs)):
            for first in range(len(pairs)):
                if first == last and len(pairs) > 1:
                    continue
                if last not in following or entry[first][0] < following[last]:
                    following[last], links[last] = entry[first][0], (first, entry[first][1])
        if pairs:
            best, previous_pairs = following, pairs
            back.append(links)
        else:
            back.append(None)
    last = min(best, key=lambda key: best[key])
    total = best[last]
    picks = []
    for links in reversed(back):
        if links is None:
            picks.append(None)
            continue
        first, before = links[last]
        picks.append((first, last))
        last = before
    picks.reverse()
    result = []
    for pairs, pick in zip(rounds, picks):
        if pick is None:
            result.append(pairs)
            continue
        first, last = pick
        middle = [pair for index, pair in enumerate(pairs) if index not in (first, last)]
        result.append([pairs[first]] + middle + ([pairs[last]] if last != first else []))
    return result, total


def layout_round_robin(order, series, legs='single', seeds=None):
    """Incontri del girone con le posizioni nel calendario ``order`` (chiavi ``rr<giornata>s<slot>``,
    ``bracket='league'``).

    ``seeds`` sono le teste di serie (senza, le stesse di ``order``): decidono
    solo ``player_a`` e quindi i lati. Scambiando due posizioni in ``order``
    (all'«Avvia») cambia il calendario, non le teste di serie.

    Tutti gli incontri sono pronti dall'inizio: ``round`` è la giornata,
    ``play_order`` l'ordine di gioco (giornata dopo giornata). Con ``legs``
    ``double`` le giornate del ritorno seguono quelle dell'andata con le stesse
    coppie (le giornate possono partire da un'altra) e i lati invertiti: ``player_a`` è la testa di serie peggiore, così
    parte lei nel lato svantaggiato. Chi chiude una giornata, quando si può,
    non apre la successiva (con 3 o 4 iscritti non si può).
    """
    rounds, _ = spread_rounds(circle_rounds(order, seeds))
    if legs == 'double':
        back = [[(b, a) for a, b in pairs] for pairs in rounds]
        # Le giornate del ritorno partono da quella che dà meno incontri di fila (a parità dalla prima).
        best = None
        for shift in range(len(back)):
            option = spread_rounds(rounds + back[shift:] + back[:shift])
            if best is None or option[1] < best[1]:
                best = option
            if best[1] == 0:
                break
        rounds = best[0]
    matches = []
    for round_no, pairs in enumerate(rounds, start=1):
        for slot, (first, second) in enumerate(pairs, start=1):
            match = new_match(league_key(round_no, slot), 'league', round_no, slot, series)
            match.update(player_a=first, player_b=second, status='ready', play_order=len(matches) + 1)
            matches.append(match)
    return matches


def league_rounds(n, legs='single'):
    """Giornate del girone con ``n`` iscritti (con il ritorno, il doppio)."""
    per_leg = n - 1 if n % 2 == 0 else n
    return per_leg * (2 if legs == 'double' else 1)


def playoff_mini(matches, match):
    """Vero se ``match`` è un incontro di spareggio di un mini-girone (gruppo di tre o più pari)."""
    return match['bracket'] == 'playoff' and sum(
        1 for item in matches if item['bracket'] == 'playoff' and item.get('group_no') == match.get('group_no')) > 1


def league_results(matches, games, options, bracket='league'):
    """Risultati degli incontri conclusi del girone: ``[(a, b, esito_a, partite_a, partite_b, punti_a, punti_b)]``.

    ``esito_a`` è 1 (vince ``a``), 0 (pari) o -1. ``games`` è ``{chiave: [partite]}``
    con ``winnerId``, ``scoreA``, ``scoreB`` (punteggio di ``player_a``). A
    tavolino le partite sono le vittorie necessarie a zero (con la serie fissa
    tutte) e il punteggio quello di ``walkoverScore``. ``bracket`` ``playoff``
    dà i risultati degli spareggi.
    """
    options = dict(DEFAULTS['round_robin'], **(options or {}))
    result = []
    for match in matches:
        if match['bracket'] != bracket or match['status'] != 'done':
            continue
        a, b, winner = match['player_a'], match['player_b'], match['winner_id']
        outcome = 0 if winner is None else (1 if winner == a else -1)
        if match['walkover'] and winner is not None:
            series = match.get('series') or 1
            fixed = options['draws'] and (bracket == 'league' or playoff_mini(matches, match))
            needed = series if fixed else wins_needed(series)
            high, low = options['walkoverScore']
            if outcome > 0:
                result.append((a, b, outcome, needed, 0, high, low))
            else:
                result.append((a, b, outcome, 0, needed, low, high))
            continue
        played = games.get(match['key'], [])
        won_a = sum(1 for game in played if game.get('winnerId') == a)
        won_b = sum(1 for game in played if game.get('winnerId') == b)
        score_a = sum(game.get('scoreA') or 0 for game in played)
        score_b = sum(game.get('scoreB') or 0 for game in played)
        result.append((a, b, outcome, won_a, won_b, score_a, score_b))
    return result


def table_rows(players, results, points):
    """Righe della classifica di ``players`` contando solo i ``results`` tra loro."""
    win, draw, loss = points
    rows = {player: {'id': player, 'played': 0, 'won': 0, 'drawn': 0, 'lost': 0, 'gamesFor': 0,
                     'gamesAgainst': 0, 'scoreFor': 0, 'scoreAgainst': 0, 'points': 0} for player in players}
    for a, b, outcome, games_a, games_b, score_a, score_b in results:
        if a not in rows or b not in rows:
            continue
        for player, sign, gf, ga, sf, sa in ((a, outcome, games_a, games_b, score_a, score_b),
                                             (b, -outcome, games_b, games_a, score_b, score_a)):
            row = rows[player]
            row['played'] += 1
            row['won' if sign > 0 else 'drawn' if sign == 0 else 'lost'] += 1
            row['points'] += win if sign > 0 else draw if sign == 0 else loss
            row['gamesFor'] += gf
            row['gamesAgainst'] += ga
            row['scoreFor'] += sf
            row['scoreAgainst'] += sa
    return rows


def split_by(group, value):
    """Gruppi di ``group`` con lo stesso ``value(player)``, dal valore più alto."""
    values = {player: value(player) for player in group}
    return [[player for player in group if values[player] == level]
            for level in sorted(set(values.values()), reverse=True)]


def partition(players, results, options, rank):
    """``players`` divisi in gruppi in ordine di classifica con i criteri del girone sui soli ``results``.

    Punti (senza pareggi ammessi incontri vinti), scontro diretto, differenza
    partite e partite vinte, oppure, con ``score``, differenza punteggio e
    punteggio fatto. Dentro un gruppo pari l'ordine è quello di ``rank``.
    """
    rows = table_rows(players, results, options['points'])
    if options['score']:
        diff = lambda player: rows[player]['scoreFor'] - rows[player]['scoreAgainst']
        made = lambda player: rows[player]['scoreFor']
    else:
        diff = lambda player: rows[player]['gamesFor'] - rows[player]['gamesAgainst']
        made = lambda player: rows[player]['gamesFor']

    # Senza pareggi conta chi ha vinto più incontri (la colonna dei punti non si mostra).
    first = 'points' if options['draws'] else 'won'

    def head_to_head(group):
        mini = table_rows(group, results, options['points'])
        return lambda player: mini[player][first]

    criteria = [lambda group: (lambda player: rows[player][first]), head_to_head,
                lambda group: diff, lambda group: made]

    def resolve(group, level):
        if len(group) == 1 or level == len(criteria):
            return [sorted(group, key=lambda player: rank[player])]
        result = []
        for part in split_by(group, criteria[level](group)):
            result.extend(resolve(part, level + 1))
        return result

    return resolve(list(players), 0)


def split_by_playoff(groups, matches, games, options, rank):
    """Gruppi pari divisi dagli spareggi conclusi: i giocatori di uno spareggio finito si ordinano con i criteri del
    girone sui soli incontri di spareggio; gli altri del gruppo (ritirati) restano dopo."""
    playoff = [match for match in matches if match['bracket'] == 'playoff']
    if not playoff:
        return groups
    results = league_results(matches, games, options, 'playoff')
    split = []
    for group in groups:
        inside = [match for match in playoff if match['player_a'] in group and match['player_b'] in group]
        if len(group) < 2 or not inside or any(match['status'] != 'done' for match in inside):
            split.append(group)
            continue
        members = [player for player in group if any(player in (match['player_a'], match['player_b'])
                                                     for match in inside)]
        rest = [player for player in group if player not in members]
        split.extend(partition(members, results, options, rank))
        if rest:
            split.append(rest)
    return split


def split_by_lots(group, lots):
    """Gruppo pari diviso dal sorteggio (o dai piazzamenti salvati) ``lots`` ``{giocatore: ordine}``; chi non ce
    l'ha resta dopo."""
    if len(group) < 2:
        return [group]
    return split_by(group, lambda player: -lots.get(player, float('inf')))


def league_standings(order, matches, games, options, withdrawn=None, playoff=True, lots=None):
    """Classifica del girone: righe in ordine con ``rank`` (pari merito = stesso numero) e ``tied``.

    ``order`` sono gli iscritti in ordine di testa di serie. Criteri di
    ``partition`` sugli incontri del girone; con ``playoff`` i pari si
    dividono poi con gli spareggi conclusi (``split_by_playoff``) e con
    ``lots`` (``{giocatore: ordine}``: sorteggio, o i piazzamenti a torneo
    concluso). Chi resta pari ha ``tied`` vero (spareggio o pari merito). I
    numeri delle righe contano solo il girone. Ogni riga ha anche
    ``withdrawn``. Calcolata, mai salvata.
    """
    options = dict(DEFAULTS['round_robin'], **(options or {}))
    results = league_results(matches, games, options)
    rows = table_rows(order, results, options['points'])
    rank = {player: position for position, player in enumerate(order)}
    groups = partition(order, results, options, rank)
    if playoff:
        groups = split_by_playoff(groups, matches, games, options, rank)
    if lots:
        groups = [part for group in groups for part in split_by_lots(group, lots)]
    withdrawn = set(withdrawn or ())
    standings = []
    for group in groups:
        position = len(standings) + 1
        for player in group:
            row = dict(rows[player], rank=position, tied=len(group) > 1, withdrawn=player in withdrawn)
            standings.append(row)
    return standings


# --- Spareggi e piazzamenti del girone ---------------------------------------------------------

PODIUM = 3


def active_groups(standings):
    """Gruppi di pari (stesso ``rank``) dei soli non ritirati, in ordine: ``[(posto, [giocatori])]``."""
    groups, ahead = [], 0
    for row in standings:
        if row['withdrawn']:
            continue
        if groups and groups[-1][2] == row['rank']:
            groups[-1][1].append(row['id'])
        else:
            groups.append((ahead + 1, [row['id']], row['rank']))
        ahead += 1
    return [(place, players) for place, players, _ in groups]


def podium_ties(standings):
    """Gruppi di non ritirati ancora pari che toccano il podio: ``[{players, place}]`` (``place`` = primo posto)."""
    return [{'players': players, 'place': place} for place, players in active_groups(standings)
            if len(players) > 1 and place <= PODIUM]


def playoff_series(series, draws):
    """Serie dello spareggio a due: con i pareggi la serie fissa diventa «al meglio di» dispari (2 → 3)."""
    return series + 1 if draws and series % 2 == 0 else series


def playoff_key(group, round_no, slot):
    return 'po%dr%ds%d' % (group, round_no, slot)


def layout_playoff(groups, series, draws, seeds, start=0):
    """Incontri di spareggio dei gruppi ``groups`` (``podium_ties``): ``bracket='playoff'``, ``group_no`` = gruppo
    (da 1), ``round`` = giornata del mini-girone.

    Due pari: un incontro con ``playoff_series``. Tre o più: mini-girone di
    sola andata a rotazione con la serie del girone. Ordine di gioco dopo
    ``start``: la giornata 1 di tutti i gruppi, poi la 2…; ``player_a`` è la
    testa di serie migliore (``seeds``).
    """
    rank = seed_rank(seeds)
    plans = []
    for number, group in enumerate(groups, start=1):
        players = sorted(group['players'], key=lambda player: rank.get(player, len(rank)))
        if len(players) == 2:
            plans.append((number, [[(players[0], players[1])]], playoff_series(series, draws)))
        else:
            plans.append((number, circle_rounds(players), series))
    matches = []
    for index in range(max([len(rounds) for _, rounds, _ in plans] + [0])):
        for number, rounds, group_series in plans:
            if index >= len(rounds):
                continue
            for slot, (first, second) in enumerate(rounds[index], start=1):
                match = new_match(playoff_key(number, index + 1, slot), 'playoff', index + 1, slot, group_series)
                match.update(player_a=first, player_b=second, status='ready', group_no=number,
                             play_order=start + len(matches) + 1)
                matches.append(match)
    return matches


def league_closed(matches):
    league = [match for match in matches if match['bracket'] == 'league']
    return bool(league) and all(match['status'] == 'done' for match in league)


def playoff_state(order, matches, games, options, withdrawn=None):
    """Stato degli spareggi del girone: ``{status, groups}``.

    ``status``: ``league`` (girone non finito), ``create`` (servono spareggi
    non ancora creati: ``groups`` sono i ``podium_ties``), ``playing``
    (spareggi in corso: ``groups`` con ``players``, ``place`` e ``matches``,
    le chiavi), ``draw`` (spareggi finiti ma ancora pari sul podio:
    ``groups`` da sorteggiare) o ``over`` (si può concludere; ``groups`` gli
    spareggi giocati).
    """
    if not league_closed(matches):
        return {'status': 'league', 'groups': []}
    base = league_standings(order, matches, games, options, withdrawn, playoff=False)
    playoff = [match for match in matches if match['bracket'] == 'playoff']
    if not playoff:
        needed = podium_ties(base)
        return {'status': 'create' if needed else 'over', 'groups': needed}
    place_of = {}
    for place, players in active_groups(base):
        for player in players:
            place_of[player] = place
    played = []
    for number in sorted({match['group_no'] for match in playoff}):
        inside = [match for match in playoff if match['group_no'] == number]
        players = [row['id'] for row in base if any(row['id'] in (match['player_a'], match['player_b'])
                                                    for match in inside)]
        places = [place_of[player] for player in players if player in place_of]
        played.append({'players': players, 'place': min(places) if places else None,
                       'matches': [match['key'] for match in inside]})
    if any(match['status'] not in CLOSED for match in playoff):
        return {'status': 'playing', 'groups': played}
    left = podium_ties(league_standings(order, matches, games, options, withdrawn))
    return {'status': 'draw', 'groups': left} if left else {'status': 'over', 'groups': played}


def placements_league(standings):
    """Piazzamenti ``{giocatore: posto}`` dalla classifica finale del girone: i non ritirati in ordine (i pari a pari
    merito), poi i ritirati, che non vanno sul podio."""
    places = {}
    active = 0
    for place, players in active_groups(standings):
        for player in players:
            places[player] = place
        active += len(players)
    ahead, last_rank, last_place = 0, None, None
    for row in standings:
        if not row['withdrawn']:
            continue
        if row['rank'] != last_rank:
            last_rank, last_place = row['rank'], active + ahead + 1
        places[row['id']] = last_place
        ahead += 1
    return places
