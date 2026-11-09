"""Handler delle rotte ``/api/*``."""
from .. import __version__, addons, bios
from ..errors import ConfigError, ConflictError
from ..saves import MANUAL_SLOTS, associated_core
from ..systems import describe
from ..thumbnails import FALLBACK, KINDS
from .router import ApiError, RawResponse


def health(ctx, request):
    """``GET /api/health``: stato del servizio e versione del database."""
    return {'ok': True, 'version': __version__, 'db': {'version': ctx['db'].version()}}


def bootstrap(ctx, request):
    """``GET /api/bootstrap``: dati iniziali dell'interfaccia e token di sessione."""
    library = ctx['library']
    settings = ctx['config'].get()
    return {
        'token': ctx['token'],
        'version': __version__,
        'systems': library.systems(),
        'padButtons': ctx['config'].pad_buttons(),
        'saveCombo': settings['input.save_combo'],
        'rescueCombo': settings['input.rescue_combo'],
        'quitCombo': settings['input.quit_combo'],
        'theme': settings['ui.theme'],
        'mode': settings['ui.mode'],
        'screensaver': settings['ui.screensaver_minutes'],
        'screensaverContent': settings['ui.screensaver_content'],
        'tournamentAds': settings['ui.tournament_ads'],
        'logout': settings['ui.logout_minutes'],
        'sound': sound_data(settings),
        'run': run_data(ctx),
        'warnings': library.warnings(),
        'addons': addons.bootstrap_data(ctx.get('addons', []), ctx),
    }


def sound_data(settings):
    """Suoni della dashboard: ``{on, effects, music}`` (volumi 0–100)."""
    return {'on': settings['ui.sound'], 'effects': settings['ui.sound_effects'], 'music': settings['ui.sound_music']}


def games(ctx, request):
    """``GET /api/games?system=``: giochi di un sistema, ordinati per titolo.

    ``pending`` è il numero di file di cui si stanno ancora calcolando i
    checksum per i metadati (prima quelli di questo sistema): finché è più di
    zero il frontend ripete la richiesta.

    ``achievements`` (compatibile con RetroAchievements) viene dai metadati; se
    RetroAchievements ha già riconosciuto il file, o detto di non conoscerlo,
    vale il suo responso. Con la chiave Web API i file non ancora giudicati si
    controllano in background e si contano anche loro in ``pending``.
    """
    system = request.query.get('system')
    if not system:
        raise ApiError(400, 'Indica la console.')
    result, pending = ctx['library'].games_status(system, first=True)
    ra = ctx.get('ra')
    if ra is not None:
        pending += ra.check(system, result)
    known = ra.known(system) if ra is not None else {}
    if known:
        result = [dict(game, achievements=known[game['id']]) if game['id'] in known else game for game in result]
    return {'system': system, 'games': result, 'pending': pending}


def image(ctx, request):
    """``GET /api/image?system=&game=&kind=cover|title|snap[&fallback=1]``: immagine PNG del gioco ``game`` dei metadati.

    ``game`` è il ``metaId`` del gioco nella libreria. Si scarica da
    libretro-thumbnails la prima volta e poi si legge dalla cache; 404 se il
    gioco non ha quell'immagine. Con ``fallback=1`` e ``kind=cover``, se la
    copertina manca arriva il titolo e, se manca anche quello, la schermata.
    """
    system = request.query.get('system')
    game_id = request.query.get('game')
    kind = request.query.get('kind')
    if not system or not game_id or kind not in KINDS:
        raise ApiError(400, 'Richiesta non valida.')
    if system not in ctx['library'].folders():
        raise ApiError(404, 'Console non trovata.')
    info = describe(system)
    entry = ctx['gameinfo'].entry(info['preset'], game_id)
    # ``thumbnailSystem`` vale per i giochi di un'altra cartella libretro (per esempio i 32X nel Mega Drive).
    kinds = FALLBACK if kind == 'cover' and request.query.get('fallback') == '1' else (kind,)
    data = None
    if entry:
        data = ctx['thumbnails'].first(entry, kinds, entry.get('thumbnailSystem') or info['thumbnails'])[1]
    if data is None:
        raise ApiError(404, 'Immagine non disponibile.')
    return RawResponse(data, 'image/png', 'private, max-age=86400')


def rescan(ctx, request):
    """``POST /api/library/rescan``: svuota la cache e rilegge i sistemi."""
    library = ctx['library']
    library.invalidate()
    return {'systems': library.systems()}


def settings_data(ctx):
    """Impostazioni come in ``GET /api/settings``.

    ``systems`` elenca le cartelle presenti in games/, con i valori salvati
    (``extensions``, ``cores`` nell'ordine automatico, ``coresDefault`` se la
    lista è quella predefinita) e i campi calcolati ``name``, ``count``,
    ``defaultExtensions`` (mostrate come suggerimento), ``compatibleCores``
    (core compatibili con RetroAchievements, in testa all'ordine). ``coreTypes`` e
    ``availableCores`` (con ``biosMissing``, vero se manca un BIOS obbligatorio) alimentano i menu «Aggiungi da tipologia…» e
    «Aggiungi core…». ``cpu`` è ``{ready, governor}`` di ``cpu.CpuBoost.info``.
    """
    config = ctx['config']
    library = ctx['library']
    stored = config.systems_settings()
    available = config.available_cores()
    missing = bios_missing(ctx, available)
    systems = []
    for folder in library.folders():
        info = describe(folder)
        saved = stored.get(folder, {})
        cores = config.system_cores(folder, saved, available)
        systems.append({
            'id': folder,
            'name': info['name'],
            'count': len(library.games(folder)),
            'extensions': saved.get('extensions', ''),
            'defaultExtensions': ' '.join(info['extensions']),
            'cores': cores,
            'coresDefault': saved.get('cores') is None,
            'compatibleCores': info['cores'],
        })
    cores = sorted((dict(core, biosMissing=core['name'] in missing) for core in available.values()),
                   key=lambda core: (core['name'].casefold(), core['name']))
    return {
        'settings': config.get(),
        'systems': systems,
        'coreTypes': config.core_types(available),
        'availableCores': cores,
        'coreIndex': config.core_index(),
        # Vero se il retroarch.cfg ha la combinazione d'uscita col joypad (``input.quit_combo``).
        'retroarch': {'quitCombo': ctx['play'].quit_combo_supported()},
        'cpu': cpu_info(ctx),
    }


def cpu_info(ctx):
    """Stato del «Processore al massimo»: ``{ready, governor}``; senza il servizio, non pronto."""
    boost = ctx.get('boost')
    return boost.info() if boost is not None else {'ready': False, 'governor': None}


def bios_missing(ctx, available):
    """Nomi dei core disponibili a cui manca un BIOS obbligatorio del loro ``.info``."""
    service = ctx.get('bios')
    if service is None:
        return set()
    try:
        return {name for name in available if service.missing_required(name)}
    except Exception:
        return set()


def get_settings(ctx, request):
    """``GET /api/settings``: impostazioni, console con i loro core, tipologie e core disponibili."""
    return settings_data(ctx)


def save_settings(ctx, request):
    """``POST /api/settings``: valida e salva tutto insieme, poi rilegge la libreria.

    I campi calcolati della GET vengono ignorati; se un valore non è valido
    risponde 400 e non salva nulla. Durante una partita risponde 409.
    """
    if ctx['play'].busy():
        raise ConflictError('Impostazioni non modificabili durante una partita.')
    ctx['config'].update_all(request.body)
    ctx['library'].invalidate()
    return settings_data(ctx)


def refresh_cores(ctx, request):
    """``POST /api/cores/refresh``: riscarica l'elenco dei core dal buildbot e rilegge la libreria.

    Se il buildbot non risponde, 502 con un messaggio leggibile e l'elenco
    precedente resta.
    """
    try:
        ctx['config'].refresh_core_index()
    except ConfigError as error:
        raise ApiError(502, str(error))
    ctx['library'].invalidate()
    return settings_data(ctx)


def text_field(body, name, label):
    """Campo di testo obbligatorio del corpo JSON, altrimenti 400."""
    value = body.get(name)
    if not isinstance(value, str) or not value:
        raise ApiError(400, 'Indica %s.' % label)
    return value


def game_key(body):
    """``(system, id)`` dal corpo JSON."""
    return text_field(body, 'system', 'la console'), text_field(body, 'id', 'il gioco')


def run_data(ctx):
    """Stato della partita con ``menu``, il menu dei salvataggi in partita (``IngameService.state``)."""
    ingame = ctx.get('ingame')
    return dict(ctx['play'].state(), menu=ingame.state() if ingame is not None else None)


def run_state(ctx, request):
    """``GET /api/run``: stato della partita in corso (README §E) e del menu dei salvataggi in partita."""
    return run_data(ctx)


def ingame_open(ctx, request):
    """``POST /api/ingame/open`` ``{slot: 'p1'|'p2'}``: pausa e modale dei salvataggi di quel giocatore.

    Ignorata (risponde con lo stato) se non c'è una partita in corso o il
    menu è già aperto. 502 se RetroArch non va in pausa.
    """
    slot = request.body.get('slot')
    if slot not in ('p1', 'p2'):
        raise ApiError(400, 'Giocatore non valido.')
    ctx['ingame'].open(slot)
    return run_data(ctx)


def run_rescue(ctx, request):
    """``POST /api/run/rescue``: combinazione di emergenza, chiude il gioco senza salvare il «Riprendi». 409 senza partita."""
    ctx['play'].request_rescue()
    return run_data(ctx)


def rescue_answer(ctx, request):
    """``POST /api/run/rescue/answer`` ``{choice}``: stato da cui riprendere (id, ``final`` o ``previous``)."""
    choice = request.body.get('choice')
    if not isinstance(choice, str) or not choice:
        raise ApiError(400, 'Scegli da dove riprendere.')
    ctx['play'].answer_rescue(choice)
    return run_data(ctx)


def rescue_thumb(ctx, request):
    """``GET /api/run/rescue/thumb?item=``: miniatura PNG di una voce del soccorso aperto; 404 se manca."""
    rescue = ctx.get('rescue')
    path = rescue.thumb(request.query.get('item') or '') if rescue is not None else None
    try:
        with open(path or '', 'rb') as stream:
            data = stream.read()
    except OSError:
        raise ApiError(404, 'Miniatura non disponibile.')
    return RawResponse(data, 'image/png', 'no-store')


def ingame_shot(ctx, request):
    """``GET /api/ingame/shot``: cattura PNG del gioco in pausa, sfondo della modale in partita; 404 se manca."""
    path = ctx['ingame'].shot_file()
    try:
        with open(path or '', 'rb') as stream:
            data = stream.read()
    except OSError:
        raise ApiError(404, 'Cattura non disponibile.')
    return RawResponse(data, 'image/png', 'no-store')


def body_slot(body):
    """``slot`` del corpo: intero da 1 a 9, altrimenti 400."""
    slot = body.get('slot')
    if isinstance(slot, bool) or not isinstance(slot, int) or not 1 <= slot <= 9:
        raise ApiError(400, 'Slot non valido.')
    return slot


def ingame_save(ctx, request):
    """``POST /api/ingame/save`` ``{slot}``: salva nello slot 1–9 del giocatore del menu; ``{menu, slots}``."""
    return ctx['ingame'].save(body_slot(request.body))


def ingame_load(ctx, request):
    """``POST /api/ingame/load`` ``{slot}``: carica lo slot, chiude il menu e il gioco riprende."""
    ctx['ingame'].load(body_slot(request.body))
    return run_data(ctx)


def ingame_undo(ctx, request):
    """``POST /api/ingame/undo``: annulla l'ultimo caricamento del giocatore del menu, chiude il menu e il gioco riprende.

    409 se non c'è un caricamento da annullare.
    """
    ctx['ingame'].undo()
    return run_data(ctx)


def ingame_controls(ctx, request):
    """``POST /api/ingame/controls`` ``{map, labels}``: «Salva» nella finestra dei comandi in partita.

    Se le assegnazioni cambiano il gioco si riavvia, altrimenti riprende.
    409 se la finestra dei comandi non è aperta.
    """
    ctx['ingame'].save_controls(request.body.get('map'), request.body.get('labels'))
    return run_data(ctx)


def ingame_quit(ctx, request):
    """``POST /api/ingame/quit``: «Esci» dal menu in partita, chiude il gioco."""
    ctx['ingame'].quit()
    return run_data(ctx)


def ingame_slots(ctx, request):
    """``GET /api/ingame/slots``: slot del giocatore del menu aperto, ``{slots}`` (in un incontro, quelli temporanei)."""
    return ctx['ingame'].menu_slots()


def ingame_thumb(ctx, request):
    """``GET /api/ingame/thumb?slot=``: miniatura PNG di uno slot del giocatore del menu aperto; 404 se manca."""
    path = ctx['ingame'].menu_thumb(query_int(request, 'slot'))
    try:
        with open(path or '', 'rb') as stream:
            data = stream.read()
    except OSError:
        raise ApiError(404, 'Miniatura non disponibile.')
    return RawResponse(data, 'image/png', 'no-store')


def ingame_close(ctx, request):
    """``POST /api/ingame/close``: chiude il menu dei salvataggi e il gioco riprende."""
    ctx['ingame'].close()
    return run_data(ctx)


# Indice massimo di un joypad della Gamepad API.
MAX_PAD = 15


def launch_pads(body):
    """``pads`` del corpo: ``[joypad P1 | None, joypad P2 | None]``, indici distinti tra 0 e 15; altrimenti 400."""
    pads = body.get('pads')
    if pads is None:
        return None
    if not isinstance(pads, list) or len(pads) > 2:
        raise ApiError(400, 'Joypad dei giocatori non validi.')
    for pad in pads:
        if pad is not None and (isinstance(pad, bool) or not isinstance(pad, int) or not 0 <= pad <= MAX_PAD):
            raise ApiError(400, 'Joypad dei giocatori non validi.')
    present = [pad for pad in pads if pad is not None]
    if len(set(present)) != len(present):
        raise ApiError(400, 'I due giocatori non possono usare lo stesso joypad.')
    return pads


def launch_pad_models(body):
    """``padModels`` del corpo: ``[{vendor, product, rank} | None, …]`` (al più 2), oppure ``None``; altrimenti 400."""
    models = body.get('padModels')
    if models is None:
        return None
    if not isinstance(models, list) or len(models) > 2:
        raise ApiError(400, 'Modelli dei joypad non validi.')
    for model in models:
        if model is None:
            continue
        if not isinstance(model, dict):
            raise ApiError(400, 'Modelli dei joypad non validi.')
        for key, top in (('vendor', 0xFFFF), ('product', 0xFFFF), ('rank', MAX_PAD)):
            value = model.get(key)
            if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= top:
                raise ApiError(400, 'Modelli dei joypad non validi.')
    return [None if model is None else {key: model[key] for key in ('vendor', 'product', 'rank')} for model in models]


def player_pads(ctx, body):
    """Joypad di P1 e P2 per RetroArch: ``pads`` (indici di Chrome) convertiti con ``padModels``."""
    pads = launch_pads(body)
    models = launch_pad_models(body)
    joypads = ctx.get('joypads')
    return joypads.retroarch_pads(pads, models) if joypads is not None else pads


def launch_resume(body):
    """``resume`` del corpo: ``{account, slot}`` con slot tra 0 e 9, oppure ``None``; altrimenti 400."""
    resume = body.get('resume')
    if resume is None:
        return None
    if not isinstance(resume, dict):
        raise ApiError(400, 'Salvataggio non valido.')
    account_id, slot = resume.get('account'), resume.get('slot')
    for value in (account_id, slot):
        if isinstance(value, bool) or not isinstance(value, int):
            raise ApiError(400, 'Salvataggio non valido.')
    if not 0 <= slot <= 9:
        raise ApiError(400, 'Salvataggio non valido.')
    return {'account': account_id, 'slot': slot}


def launch(ctx, request):
    """``POST /api/launch``: avvia un gioco. 409 se c'è già una partita o nessun core è compatibile.

    ``pads`` (facoltativo) assegna i joypad di P1 e P2 ai giocatori 1 e 2 di RetroArch;
    ``padModels`` (facoltativo) ne dà i modelli, per trovarli tra quelli di RetroArch (``player_pads``).
    ``resume`` (facoltativo, ``{account, slot}``) fa partire il gioco da quello slot del profilo.
    ``shared`` (facoltativo, id di ``GET /api/saves/game``) lo fa partire con quel salvataggio condiviso.
    """
    system, game_id = game_key(request.body)
    players = request.body.get('players')
    pads = player_pads(ctx, request.body)
    return ctx['play'].start(system, game_id, players if isinstance(players, list) else None, pads,
                             launch_resume(request.body), shared=launch_shared(request.body))


def launch_shared(body):
    """``shared`` del corpo: nome di un salvataggio condiviso, oppure ``None``; altrimenti 400."""
    shared = body.get('shared')
    if shared is None:
        return None
    if not isinstance(shared, str) or not shared.strip():
        raise ApiError(400, 'Salvataggio condiviso non valido.')
    if body.get('resume') is not None:
        raise ApiError(400, 'Scegli uno slot oppure un salvataggio condiviso.')
    return shared


def stop(ctx, request):
    """``POST /api/stop``: interrompe la ricerca o la partita."""
    return ctx['play'].stop()


def reset_game_core(ctx, request):
    """``POST /api/game/core/reset``: ricerca automatica al prossimo avvio (tentativi azzerati)."""
    system, game_id = game_key(request.body)
    return {'game': ctx['play'].reset_core(system, game_id)}


def set_game_core(ctx, request):
    """``POST /api/game/core``: scelta manuale del core, salvata come confermata."""
    system, game_id = game_key(request.body)
    core = text_field(request.body, 'core', 'il core')
    return {'game': ctx['play'].set_core(system, game_id, core)}


def game_cores(ctx, request):
    """``GET /api/game/cores?system=&id=``: core compatibili con il gioco per il menu «Core ▸»."""
    system, game_id = game_key(request.query)
    return {'cores': ctx['play'].game_cores(system, game_id)}


def game_controls(ctx, request):
    """``GET /api/game/controls?system=&id=``: comandi del gioco (``ControlsService.describe``)."""
    system, game_id = game_key(request.query)
    return {'controls': ctx['controls'].describe(system, ctx['play'].check_game(system, game_id))}


def save_game_controls(ctx, request):
    """``POST /api/game/controls`` ``{system, id, map, labels}``: salva i comandi; valgono dalla prossima partita."""
    system, game_id = game_key(request.body)
    game = ctx['play'].check_game(system, game_id)
    ctx['controls'].save(system, game, request.body.get('map'), request.body.get('labels'))
    return {'controls': ctx['controls'].describe(system, game)}


def game_controller(ctx, request):
    """``GET /api/game/controller?system=&id=``: controller emulato del gioco (``GameConfigService.controller``).

    ``{controller: {auto, choice, value, choices}}``, ``controller`` ``None`` se la console non lo sceglie.
    """
    system, game_id = game_key(request.query)
    return {'controller': ctx['gameconfig'].controller(system, ctx['play'].check_game(system, game_id))}


def save_game_controller(ctx, request):
    """``POST /api/game/controller`` ``{system, id, choice}``: controller scelto a mano (``null`` = automatico)."""
    system, game_id = game_key(request.body)
    game = ctx['play'].check_game(system, game_id)
    return {'controller': ctx['gameconfig'].set_controller(system, game, optional_text(request.body, 'choice'))}


def config_scope(ctx, values):
    """``(system, id)`` della pagina «Configurazione»: ``id`` vuoto o assente = la console."""
    system = text_field(values, 'system', 'la console')
    game_id = values.get('id') or None
    if game_id is not None and not isinstance(game_id, str):
        raise ApiError(400, 'Gioco non valido.')
    if system not in ctx['library'].folders():
        raise ApiError(404, 'Console non trovata.')
    if game_id:
        ctx['play'].check_game(system, game_id)
    return system, game_id


def config_page(ctx, system, game_id, core=None):
    """Pagina «Configurazione» con ``bios``, il riassunto della riga «BIOS» per il core della pagina."""
    page = ctx['gameconfig'].page(system, game_id, core)
    service = ctx.get('bios')
    return {'config': dict(page, bios=service.summary(system, page['core']) if service else None)}


def config_reply(ctx, system, game_id, core, result):
    """Pagina aggiornata, oppure ``{confirm}`` se la modifica aspetta una conferma."""
    if 'confirm' in result:
        return {'confirm': result['confirm']}
    return config_page(ctx, system, game_id, core)


def optional_text(body, name):
    value = body.get(name)
    if value is not None and not isinstance(value, str):
        raise ApiError(400, 'Valore non valido: %s.' % name)
    return value


def game_config(ctx, request):
    """``GET /api/config?system=&id=&core=``: pagina «Configurazione» della console (senza ``id``) o del gioco."""
    system, game_id = config_scope(ctx, request.query)
    return config_page(ctx, system, game_id, request.query.get('core') or None)


def save_config_option(ctx, request):
    """``POST /api/config/option`` ``{system, id, core, source, key, value, confirm}``: cambia un'opzione.

    ``value = null`` la riporta all'origine (console o predefinito; nella
    Grafica, il livello di partenza). Vale dalla prossima partita.
    """
    body = request.body
    system, game_id = config_scope(ctx, body)
    core = optional_text(body, 'core')
    result = ctx['gameconfig'].set_option(system, game_id, core, text_field(body, 'source', 'l\'origine'),
                                          text_field(body, 'key', 'l\'opzione'), optional_text(body, 'value'),
                                          body.get('confirm') is True)
    return config_reply(ctx, system, game_id, core, result)


def save_config_level(ctx, request):
    """``POST /api/config/level`` ``{system, id, core, level}``: livello della Grafica (``null`` = come la console)."""
    body = request.body
    system, game_id = config_scope(ctx, body)
    ctx['gameconfig'].set_level(system, game_id, optional_text(body, 'level'))
    return config_page(ctx, system, game_id, optional_text(body, 'core'))


def promote_config(ctx, request):
    """``POST /api/config/promote`` ``{system, id, confirm}``: la Personalizzata del gioco vale per tutta la console."""
    body = request.body
    system, game_id = config_scope(ctx, body)
    if not game_id:
        raise ApiError(400, 'Indica il gioco.')
    return config_reply(ctx, system, game_id, None,
                        ctx['gameconfig'].promote(system, game_id, body.get('confirm') is True))


def bios_scope(ctx, values):
    """Console della pagina «BIOS»: deve esistere, altrimenti 404."""
    system = text_field(values, 'system', 'la console')
    if system not in ctx['library'].folders():
        raise ApiError(404, 'Console non trovata.')
    return system


def bios_page(ctx, system):
    return {'bios': ctx['bios'].page(system)}


def get_bios(ctx, request):
    """``GET /api/bios?system=``: BIOS dei core della console (``BiosService.page``)."""
    return bios_page(ctx, bios_scope(ctx, request.query))


def check_bios(ctx, request):
    """``GET /api/bios/check?system=&id=``: ``{core, missing, different}`` del core del gioco.

    ``missing`` sono i BIOS obbligatori che mancano, ``different`` quelli
    presenti ma con un checksum diverso da quello del ``.info``.
    """
    system, game_id = config_scope(ctx, request.query)
    if not game_id:
        raise ApiError(400, 'Indica il gioco.')
    core = ctx['gameconfig'].game_core(system, game_id)
    service = ctx['bios']
    return {'core': core, 'missing': service.missing_required(core) if core else [],
            'different': service.different_files(core) if core else []}


def import_bios(ctx, request):
    """``POST /api/bios/import`` ``{system, core, target, source, folder, name, confirm}``: copia un BIOS.

    ``target`` è l'``id`` di una riga (``info:…``, ``option:…``) oppure
    ``manual`` con ``folder`` e ``name`` facoltativi. Risponde ``{confirm}``
    se il file c'è già, altrimenti ``{bios, saved: {path, warning}}``.
    """
    body = request.body
    system = bios_scope(ctx, body)
    result = ctx['bios'].import_file(system, optional_text(body, 'core'), text_field(body, 'target', 'il file'),
                                     text_field(body, 'source', 'il file da copiare'), optional_text(body, 'folder'),
                                     optional_text(body, 'name'), body.get('confirm') is True)
    if 'confirm' in result:
        return {'confirm': result['confirm']}
    return dict(bios_page(ctx, system), saved={'path': result['path'], 'warning': result['warning']})


def remove_bios(ctx, request):
    """``POST /api/bios/remove`` ``{system, core, path}``: toglie un BIOS copiato dalla dashboard."""
    body = request.body
    system = bios_scope(ctx, body)
    ctx['bios'].remove(system, optional_text(body, 'core'), text_field(body, 'path', 'il file'))
    return bios_page(ctx, system)


def files(ctx, request):
    """``GET /api/files?path=&hidden=1``: cartella per il selettore dei file, in sola lettura.

    Senza ``path`` la prima delle ``roots`` (cartella personale, dischi
    esterni, giochi, tutto il disco).
    """
    roots = bios.roots(ctx['config'].resolve_path('paths.roms'))
    path = request.query.get('path') or (roots[0]['path'] if roots else '/')
    try:
        listing = bios.browse(path, request.query.get('hidden') == '1')
    except ConfigError as error:
        raise ApiError(404, str(error))
    return dict(listing, roots=roots)


def verdict(ctx, request):
    """``POST /api/game/core/verdict``: risposta a «Il gioco ha funzionato?». 409 senza domanda aperta."""
    system, game_id = game_key(request.body)
    worked = request.body.get('worked')
    if not isinstance(worked, bool):
        raise ApiError(400, 'Rispondi sì o no.')
    return ctx['play'].verdict(system, game_id, worked)


def download_answer(ctx, request):
    """``POST /api/download/answer``: risposta alla domanda sul download oltre i 50 MB."""
    core = text_field(request.body, 'core', 'il core')
    accept = request.body.get('accept')
    if not isinstance(accept, bool):
        raise ApiError(400, 'Rispondi sì o no.')
    return ctx['play'].answer_download(core, accept)


def unused_data(ctx):
    cores = ctx['downloader'].unused()
    return {'cores': cores, 'total': sum(core['size'] for core in cores)}


def unused_cores(ctx, request):
    """``GET /api/cores/unused``: core scaricati dalla dashboard e non usati da nessun gioco."""
    return unused_data(ctx)


def delete_unused_cores(ctx, request):
    """``POST /api/cores/unused/delete``: li cancella. 409 durante una partita."""
    if ctx['play'].busy():
        raise ConflictError('Non si possono eliminare core durante una partita.')
    ctx['downloader'].delete_unused()
    ctx['library'].invalidate()
    return unused_data(ctx)


def profiles(ctx, request):
    """``GET /api/profiles``: profili pubblici e riepilogo dei giochi citati nei preferiti e nei recenti."""
    service = ctx['profiles']
    accounts = service.list_public()
    return {'accounts': accounts, 'games': service.games_of(accounts)}


def create_profile(ctx, request):
    """``POST /api/profiles`` ``{name, color, favConsole}``: crea il profilo. 409 se il nome è già in uso."""
    body = request.body
    return ctx['profiles'].create(body.get('name'), body.get('color'), body.get('favConsole'))


def update_profile(ctx, request):
    """``POST /api/profiles/update`` ``{id, patch}``: modifica le preferenze e restituisce l'account."""
    return ctx['profiles'].update(request.body.get('id'), request.body.get('patch'))


def profile_stats(ctx, request):
    """``GET /api/profiles/stats?id=[&before=]``: tempo per console, giochi più giocati e storico delle partite.

    ``before`` è l'id dell'ultima partita già ricevuta: arrivano le 30 precedenti.
    """
    account_id = query_int(request, 'id')
    if account_id is None:
        raise ApiError(400, 'Indica il profilo.')
    return ctx['profiles'].stats(account_id, query_int(request, 'before'))


def profile_avatar(ctx, request):
    """``GET /api/profiles/avatar?id=``: immagine Gravatar del profilo (in cache); 404 se non c'è o non si scarica."""
    account_id = query_int(request, 'id')
    if account_id is None:
        raise ApiError(400, 'Indica il profilo.')
    digest = ctx['profiles'].account(account_id).get('gravatar')
    image = ctx['avatars'].get(digest) if digest else None
    if image is None:
        raise ApiError(404, 'Avatar non disponibile.')
    data, content_type = image
    return RawResponse(data, content_type, 'no-cache')


def set_favorite(ctx, request):
    """``POST /api/favorites`` ``{account, game, on}``: aggiunge o toglie un preferito.

    Risponde ``{favorites, games}``: chiavi dei preferiti del profilo e loro riepiloghi.
    """
    body = request.body
    service = ctx['profiles']
    favorites = service.set_favorite(body.get('account'), body.get('game'), body.get('on'))
    return {'favorites': favorites, 'games': service.games_for(favorites)}


def leaderboard(ctx, request):
    """``GET /api/leaderboard``: classifica di «Chi gioca?», sfida della settimana e giochi più giocati."""
    return ctx['leaderboard'].board()


def wrapped_account(request, value):
    """Profilo del Wrapped: ``house`` (o assente) = casa, altrimenti l'id del profilo. 400 se non è valido."""
    if value in (None, '', 'house'):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ApiError(400, 'Indica il profilo.')


def wrapped_list(ctx, request):
    """``GET /api/wrapped/list?account=<id>|house``: periodi con il Wrapped e periodo da proporre con l'avviso.

    Risponde ``{periods: [{period, kind, label, seen}], pending}``.
    """
    return ctx['wrapped'].overview(wrapped_account(request, request.query.get('account')))


def wrapped(ctx, request):
    """``GET /api/wrapped?account=<id>|house&period=AAAA-MM|AAAA``: dati del Wrapped (README «Wrapped»)."""
    period = request.query.get('period')
    if not period:
        raise ApiError(400, 'Indica il periodo.')
    return ctx['wrapped'].data(wrapped_account(request, request.query.get('account')), period)


def wrapped_seen(ctx, request):
    """``POST /api/wrapped/seen`` ``{account, period}``: segna il Wrapped come visto (``account`` nullo = casa)."""
    body = request.body
    account = body.get('account')
    if account is not None and (not isinstance(account, int) or isinstance(account, bool)):
        raise ApiError(400, 'Indica il profilo.')
    return ctx['wrapped'].mark_seen(account, body.get('period'))


def body_int(body, name, message):
    """Intero ``name`` del corpo: 400 con ``message`` se manca o non è un intero."""
    value = body.get(name)
    if isinstance(value, bool) or not isinstance(value, int):
        raise ApiError(400, message)
    return value


def challenges(ctx, request):
    """``GET /api/challenges?account=``: Sfide trofeo del profilo, ``{open, mine, ended, linked}`` (API.md)."""
    account_id = query_int(request, 'account')
    if account_id is None:
        raise ApiError(400, 'Indica il profilo.')
    return ctx['challenges'].overview(account_id)


def challenge_notices(ctx, request):
    """``GET /api/challenges/notices?account=``: avvisi all'ingresso del P1, ``{challenges, finals, linked}``."""
    account_id = query_int(request, 'account')
    if account_id is None:
        raise ApiError(400, 'Indica il profilo.')
    return ctx['challenges'].notices(account_id)


def challenge_seen(ctx, request):
    """``POST /api/challenges/seen`` ``{account, id, kind}``: avviso visto (``notice`` o ``final``)."""
    body = request.body
    return ctx['challenges'].mark_seen(body_int(body, 'account', 'Indica il profilo.'),
                                       body_int(body, 'id', 'Indica la sfida.'), body.get('kind'))


def challenge_candidates(ctx, request):
    """``GET /api/challenges/candidates``: trofei della partita appena finita da cui lanciare una sfida."""
    return {'candidates': ctx['challenges'].candidates()}


def challenge_create(ctx, request):
    """``POST /api/challenges`` ``{account, achievements}``: lancia le sfide dei trofei scelti, ``{created}``."""
    body = request.body
    return ctx['challenges'].create(body_int(body, 'account', 'Indica il profilo.'), body.get('achievements'))


def challenge_discard(ctx, request):
    """``POST /api/challenges/discard``: nessuna sfida, i punti di sfida della partita si cancellano."""
    return ctx['challenges'].discard()


def challenge_start(ctx, request):
    """``POST /api/challenges/start`` ``{id, players, pads}``: gioca la sfida (come ``/api/launch``)."""
    players = request.body.get('players')
    players = players if isinstance(players, list) else None
    launch_data = ctx['challenges'].launch(body_int(request.body, 'id', 'Indica la sfida.'), players)
    return ctx['play'].start(launch_data['system'], launch_data['game'], players, player_pads(ctx, request.body),
                             challenge=launch_data['challenge'])


def challenge_thumb(ctx, request):
    """``GET /api/challenges/thumb?id=``: miniatura PNG dello stato della sfida; 404 se manca."""
    path = ctx['challenges'].thumb(query_int(request, 'id'))
    try:
        with open(path or '', 'rb') as stream:
            data = stream.read()
    except OSError:
        raise ApiError(404, 'Miniatura non disponibile.')
    return RawResponse(data, 'image/png', 'private, max-age=3600')


def tournament(ctx, request):
    """``GET /api/tournament``: tornei non conclusi, conclusi di recente e storico,
    ``{tournaments, recent, history, series, rewardXp}`` (API.md)."""
    return ctx['tournaments'].overview()


def tournament_create(ctx, request):
    """``POST /api/tournament`` ``{account}``: nuova bozza del P1, ``{tournament}``."""
    return ctx['tournaments'].create(body_int(request.body, 'account', 'Indica il profilo.'))


def tournament_combo(body):
    combo = body.get('combo')
    return combo if isinstance(combo, list) else None


def tournament_target(body):
    """``(id, account, combo)`` del corpo di un'operazione su un torneo."""
    return (body_int(body, 'id', 'Indica il torneo.'), body_int(body, 'account', 'Indica il profilo.'),
            tournament_combo(body))


def tournament_update(ctx, request):
    """``POST /api/tournament/update`` ``{id, account, combo, changes}``: modifica il torneo, ``{tournament}``."""
    return ctx['tournaments'].update(*tournament_target(request.body), request.body.get('changes'))


def series_target(body):
    """``(series, account, combo)`` del corpo di un'operazione su una serie."""
    return (body_int(body, 'series', 'Indica la serie.'), body_int(body, 'account', 'Indica il profilo.'),
            tournament_combo(body))


def tournament_series_update(ctx, request):
    """``POST /api/tournament/series/update`` ``{series, account, combo, changes}``: nome e descrizione della
    serie, ``{series}``."""
    return ctx['tournaments'].update_series(*series_target(request.body), request.body.get('changes'))


def tournament_series_edition(ctx, request):
    """``POST /api/tournament/series/edition`` ``{series, account, combo}``: nuova edizione, ``{tournament}``."""
    return ctx['tournaments'].new_edition(*series_target(request.body))


def tournament_series_delete(ctx, request):
    """``POST /api/tournament/series/delete`` ``{series, account, combo}``: elimina la serie, ``{series: null}``."""
    return ctx['tournaments'].delete_series(*series_target(request.body))


def tournament_unlock(ctx, request):
    """``POST /api/tournament/unlock`` ``{id, account, combo}``: controlla creatore e combinazione, ``{ok}``."""
    return ctx['tournaments'].unlock(*tournament_target(request.body))


def tournament_record(ctx, request):
    """``POST /api/tournament/record`` ``{id, account, combo, source, players, pads, padModels}``: registra lo stato.

    Il creatore gioca come P1, dall'inizio o da un suo slot (``source``); all'uscita stato e salvataggio interno
    vanno al torneo. Risponde come ``/api/launch``.
    """
    body = request.body
    players = body.get('players')
    players = players if isinstance(players, list) else None
    launch_data = ctx['tournaments'].record(*tournament_target(body), players, body.get('source'))
    return ctx['play'].start(launch_data['system'], launch_data['game'], players, player_pads(ctx, body),
                             resume=launch_data['resume'],
                             tournament={'id': launch_data['id'], 'sram': launch_data['sram']})


def tournament_publish(ctx, request):
    """``POST /api/tournament/publish`` ``{id, account, combo}``: apre le iscrizioni, ``{tournament}``."""
    return ctx['tournaments'].publish(*tournament_target(request.body))


def tournament_delete(ctx, request):
    """``POST /api/tournament/delete`` ``{id, account, combo?}``: elimina la bozza (senza combinazione) o un torneo
    dell'archivio (conclusi e annullati, con la combinazione), ``{tournament: null}``."""
    body = request.body
    return ctx['tournaments'].delete(body_int(body, 'id', 'Indica il torneo.'),
                                     body_int(body, 'account', 'Indica il profilo.'), tournament_combo(body))


def tournament_cancel(ctx, request):
    """``POST /api/tournament/cancel`` ``{id, account, combo}``: annulla il torneo pubblicato."""
    return ctx['tournaments'].cancel(*tournament_target(request.body))


def tournament_join(ctx, request):
    """``POST /api/tournament/join`` ``{id, account}``: il profilo si iscrive, ``{tournament}``."""
    body = request.body
    return ctx['tournaments'].join(body_int(body, 'id', 'Indica il torneo.'),
                                   body_int(body, 'account', 'Indica il profilo.'))


def tournament_leave(ctx, request):
    """``POST /api/tournament/leave`` ``{id, account}``: il profilo si ritira, ``{tournament}``."""
    body = request.body
    return ctx['tournaments'].leave(body_int(body, 'id', 'Indica il torneo.'),
                                    body_int(body, 'account', 'Indica il profilo.'))


def tournament_player_add(ctx, request):
    """``POST /api/tournament/players/add`` ``{id, account, combo, player}``: l'admin iscrive, ``{tournament}``."""
    return ctx['tournaments'].add_player(*tournament_target(request.body),
                                         body_int(request.body, 'player', 'Indica il profilo da iscrivere.'))


def tournament_player_remove(ctx, request):
    """``POST /api/tournament/players/remove`` ``{id, account, combo, player}``: l'admin toglie, ``{tournament}``."""
    return ctx['tournaments'].remove_player(*tournament_target(request.body),
                                            body_int(request.body, 'player', 'Indica il profilo da togliere.'))


def tournament_registration(ctx, request):
    """``POST /api/tournament/registration`` ``{id, account, combo, closed}``: chiude o riapre, ``{tournament}``."""
    return ctx['tournaments'].set_registration(*tournament_target(request.body), request.body.get('closed'))


def tournament_start_args(body):
    """``(id, account, combo, settings, order, slots, crossings)`` del corpo di una richiesta d'avvio."""
    settings = body.get('settings')
    order = body.get('order')
    slots = body.get('slots')
    crossings = body.get('crossings')
    return tournament_target(body) + (settings if isinstance(settings, dict) else None,
                                      order if isinstance(order, list) else None,
                                      slots if isinstance(slots, list) else None,
                                      crossings if isinstance(crossings, dict) else None)


def tournament_start_check(ctx, request):
    """``POST /api/tournament/start/check`` ``{id, account, combo}``: controlli prima dell'avvio.

    Risponde ``{players, settings, counts}`` (API.md).
    """
    return ctx['tournamentRun'].start_check(*tournament_target(request.body))


def tournament_start_preview(ctx, request):
    """``POST /api/tournament/start/preview`` ``{id, account, combo, settings, order?, slots?, crossings?}``: anteprima.

    Non salva niente; risponde ``{settings, seeds, order, slots, crossings, matches, count}`` (API.md).
    """
    return ctx['tournamentRun'].start_preview(*tournament_start_args(request.body))


def tournament_start(ctx, request):
    """``POST /api/tournament/start`` ``{id, account, combo, settings, order, slots, crossings?}``: avvia, ``{tournament}``."""
    return ctx['tournamentRun'].start(*tournament_start_args(request.body))


def tournament_start_draft(ctx, request):
    """``POST /api/tournament/start/draft`` ``{id, account, combo, draft}``: bozza della schermata «Avvia», ``{ok}``.

    ``draft`` è ``{step, settings, order?, slots?, crossings?}``; ``null`` la cancella (API.md).
    """
    draft = request.body.get('draft')
    return ctx['tournamentRun'].save_draft(*tournament_target(request.body), draft)


def tournament_match_target(body):
    """``(id, match)`` del corpo di una richiesta su un incontro."""
    return body_int(body, 'id', 'Indica il torneo.'), body_int(body, 'match', 'Indica l\'incontro.')


def tournament_match_screen(ctx, request):
    """``POST /api/tournament/match/screen`` ``{id, match}``: dati della schermata «Incontro» (API.md)."""
    return ctx['tournamentRun'].match_screen(*tournament_match_target(request.body))


def tournament_match_play(ctx, request):
    """``POST /api/tournament/match/play`` ``{id, match, account, sideA, pads, padModels}``: gioca una partita.

    ``account`` è chi avvia (uno dei due giocatori o il creatore); ``sideA``
    (``p1``/``p2``, lato della testa di serie migliore) conta solo con i lati
    liberi. Risponde come ``/api/launch``.
    """
    body = request.body
    side = body.get('sideA')
    launch_data = ctx['tournamentRun'].play_match(*tournament_match_target(body),
                                                  body_int(body, 'account', 'Indica il profilo.'),
                                                  side if isinstance(side, str) else None)
    result = ctx['play'].start(launch_data['system'], launch_data['game'], launch_data['players'],
                               player_pads(ctx, body), match=launch_data['match'])
    ctx['tournamentRun'].match_started(launch_data['match'])
    return result


def tournament_match_declare(ctx, request):
    """``POST /api/tournament/match/declare`` ``{id, match, account, combo, winner, draw, score}``: risultato della
    partita.

    ``account`` è il creatore (P1 prima dell'incontro) con ``combo`` se il
    torneo ce l'ha; ``winner`` è uno dei due giocatori o ``null`` («rigioca»).
    ``draw`` vero = partita pari (``winner`` ``null``, solo nel girone con i
    pareggi); ``score`` = ``[punti di playerA, punti di playerB]`` se il
    torneo registra il punteggio.
    Risponde ``{tournament, match, done, winner, draw, gameNo, wins, drawCount, scores, nextMatch, finished}``.
    """
    body = request.body
    winner = body.get('winner')
    if winner is not None and (isinstance(winner, bool) or not isinstance(winner, int)):
        raise ApiError(400, 'Vincitore non valido.')
    draw = body.get('draw', False)
    if not isinstance(draw, bool):
        raise ApiError(400, 'Pareggio non valido.')
    score = body.get('score')
    if score is not None and not isinstance(score, list):
        raise ApiError(400, 'Punteggio non valido.')
    return ctx['tournamentRun'].declare(*tournament_match_target(body), body_int(body, 'account', 'Indica il profilo.'),
                                        tournament_combo(body), winner, draw, score)


def tournament_match_suspend(ctx, request):
    """``POST /api/tournament/match/suspend`` ``{id, match, account}``: sospende l'incontro, ``{tournament}``."""
    body = request.body
    return ctx['tournamentRun'].suspend(*tournament_match_target(body),
                                        body_int(body, 'account', 'Indica il profilo.'))


def tournament_match_walkover(ctx, request):
    """``POST /api/tournament/match/walkover`` ``{id, match, account, combo, winner}``: vittoria a tavolino.

    ``account`` è il creatore con ``combo`` se il torneo ce l'ha; ``winner``
    è uno dei due giocatori. Risponde ``{tournament}``.
    """
    body = request.body
    return ctx['tournamentRun'].walkover(*tournament_match_target(body),
                                         body_int(body, 'account', 'Indica il profilo.'), tournament_combo(body),
                                         body_int(body, 'winner', 'Indica il vincitore.'))


def tournament_withdraw(ctx, request):
    """``POST /api/tournament/withdraw`` ``{id, account, combo, player}``: ritira un giocatore, ``{tournament}``."""
    body = request.body
    return ctx['tournamentRun'].withdraw(body_int(body, 'id', 'Indica il torneo.'),
                                         body_int(body, 'player', 'Indica il giocatore.'),
                                         body_int(body, 'account', 'Indica il profilo.'), tournament_combo(body))


def tournament_match_undo(ctx, request):
    """``POST /api/tournament/match/undo`` ``{id, match, account, combo}``: «Annulla il risultato», un passo.

    Risponde ``{tournament, undone}`` (``undone``: ``game``, ``result``,
    ``walkover`` o ``withdrawal``).
    """
    body = request.body
    return ctx['tournamentRun'].undo(*tournament_match_target(body), body_int(body, 'account', 'Indica il profilo.'),
                                     tournament_combo(body))


def tournament_draw(ctx, request):
    """``POST /api/tournament/draw`` ``{id, account, combo}``: sorteggio del girone tra chi è ancora pari sul podio
    dopo gli spareggi; conclude il torneo. Risponde ``{tournament, draw}`` (``draw`` = ``[{place, players}]``)."""
    body = request.body
    return ctx['tournamentRun'].draw_lots(body_int(body, 'id', 'Indica il torneo.'),
                                          body_int(body, 'account', 'Indica il profilo.'), tournament_combo(body))


def tournament_thumb(ctx, request):
    """``GET /api/tournament/thumb?id=``: miniatura PNG dello stato di partenza; 404 se manca."""
    path = ctx['tournaments'].thumb(query_int(request, 'id'))
    try:
        with open(path or '', 'rb') as stream:
            data = stream.read()
    except OSError:
        raise ApiError(404, 'Miniatura non disponibile.')
    return RawResponse(data, 'image/png', 'no-store')


def replay_next(ctx, request):
    """``GET /api/replays/next``: spezzone da mostrare nel salvaschermo, ``{replay}`` (``null`` se non ce n'è)."""
    return {'replay': ctx['replays'].next()}


def replay_play(ctx, request):
    """``POST /api/replays/play`` ``{id}``: rigioca lo spezzone; 409 con una partita in corso."""
    return ctx['replays'].start(body_int(request.body, 'id', 'Indica lo spezzone.'))


def replay_status(ctx, request):
    """``GET /api/replays/status``: ``{playing, reason, showing}`` dello spezzone."""
    return ctx['replays'].status()


def replay_stop(ctx, request):
    """``POST /api/replays/stop``: chiude lo spezzone in corso."""
    return ctx['replays'].stop()


def profile_played(ctx, request):
    """``GET /api/profiles/played?id=``: chiavi ``<system>/<id>`` dei giochi già giocati dal profilo, ``{played}``."""
    account_id = query_int(request, 'id')
    if account_id is None:
        raise ApiError(400, 'Indica il profilo.')
    return {'played': ctx['profiles'].played_keys(account_id)}


# --- Playlist -----------------------------------------------------------------


def playlists(ctx, request):
    """``GET /api/playlists``: ``{playlists: [{id, name, filters, games}], games}`` (riepiloghi dei giochi aggiunti)."""
    return ctx['playlists'].data()


def create_playlist(ctx, request):
    """``POST /api/playlists`` ``{name, filters?, games?}``: crea la playlist. 409 se il nome è già usato."""
    body = request.body
    return ctx['playlists'].create(body.get('name'), body.get('filters'), body.get('games'))


def update_playlist(ctx, request):
    """``POST /api/playlists/update`` ``{id, patch: {name?, filters?}}``: rinomina o cambia i filtri."""
    return ctx['playlists'].update(request.body.get('id'), request.body.get('patch'))


def delete_playlist(ctx, request):
    """``POST /api/playlists/delete`` ``{id}``: elimina la playlist."""
    return ctx['playlists'].delete(request.body.get('id'))


def playlist_game(ctx, request):
    """``POST /api/playlists/game`` ``{id, game, on}``: aggiunge o toglie un gioco (``<system>/<id>``)."""
    body = request.body
    return ctx['playlists'].set_game(body.get('id'), body.get('game'), body.get('on'))


# --- RetroAchievements --------------------------------------------------------


def ra_status(ctx, request):
    """``GET /api/ra``: ``{key: {set, last4}, accounts: {id profilo: nome utente}}``. Mai la chiave né i token."""
    service = ctx['ra']
    return {'key': service.key_status(), 'accounts': service.usernames()}


def ra_set_key(ctx, request):
    """``POST /api/ra/key`` ``{key}``: controlla la chiave Web API con RetroAchievements e la salva."""
    return {'key': ctx['ra'].set_key(request.body.get('key'))}


def ra_remove_key(ctx, request):
    """``POST /api/ra/key/delete``: toglie la chiave Web API."""
    return {'key': ctx['ra'].remove_key()}


def ra_link(ctx, request):
    """``POST /api/ra/link`` ``{account, username, password}``: collega il profilo; la password non si salva."""
    body = request.body
    return ctx['ra'].link(body.get('account'), body.get('username'), body.get('password'))


def ra_unlink(ctx, request):
    """``POST /api/ra/unlink`` ``{account}``: scollega il profilo e ne cancella il token."""
    return ctx['ra'].unlink(request.body.get('account'))


def ra_game(ctx, request):
    """``GET /api/ra/game?system=&game=[&account=]``: trofei del gioco, sbloccati dal profilo ``account``."""
    system = request.query.get('system')
    game_id = request.query.get('game')
    if not system or not game_id:
        raise ApiError(400, 'Richiesta non valida.')
    if ctx['library'].find(system, game_id) is None:
        raise ApiError(404, 'Gioco non trovato.')
    return ctx['ra'].game_info(system, game_id, query_int(request, 'account'))


def ra_profile(ctx, request):
    """``GET /api/ra/profile?account=``: trofei del profilo dal sito e quelli delle partite."""
    return ctx['ra'].profile_info(query_int(request, 'account'))


def ra_profile_games(ctx, request):
    """``GET /api/ra/profile/games?account=[&offset=]``: giochi in cui l'account ha preso trofei, 30 per volta."""
    return ctx['ra'].profile_games(query_int(request, 'account'), query_int(request, 'offset') or 0)


def ra_profile_game(ctx, request):
    """``GET /api/ra/profile/game?account=&id=``: tutti i trofei del gioco RetroAchievements ``id``."""
    return ctx['ra'].profile_game(query_int(request, 'account'), query_int(request, 'id'))


def ra_icon(ctx, request):
    """``GET /api/ra/icon?name=``: immagine PNG dell'icona di un gioco (in cache)."""
    data = ctx['ra'].icon(request.query.get('name'))
    return RawResponse(data, 'image/png', 'private, max-age=86400')


def ra_badge(ctx, request):
    """``GET /api/ra/badge?name=[&locked=1]``: immagine PNG del badge di un trofeo (in cache)."""
    data = ctx['ra'].badge(request.query.get('name'), request.query.get('locked') == '1')
    return RawResponse(data, 'image/png', 'private, max-age=86400')


def query_int(request, name):
    """Parametro intero della query, oppure ``None``."""
    value = request.query.get(name)
    try:
        return int(value) if value is not None else None
    except ValueError:
        return None


def query_account(ctx, request):
    """Id del profilo dal parametro ``account``: 400 se manca o non è valido o se il profilo non esiste."""
    value = request.query.get('account')
    try:
        account_id = int(value)
    except (TypeError, ValueError):
        raise ApiError(400, 'Indica il profilo.')
    ctx['profiles'].account(account_id)
    return account_id


def saves(ctx, request):
    """``GET /api/saves?account=``: giochi con salvataggi del profilo, dal più recente.

    Ogni gioco ha i campi del riepilogo dei profili (``system``, ``id``,
    ``title``, ``systemName``, ``metaId``, ``missing``…) più ``slots``
    (numero di slot, «Riprendi» compreso), ``resumeAt`` (data del
    «Riprendi», ``null`` se manca), ``updatedAt`` e ``thumb`` (vero se il
    «Riprendi» ha la miniatura).
    """
    account_id = query_account(ctx, request)
    store = ctx['saves']
    result = []
    for item in store.repo.games_for_account(account_id):
        summary = ctx['profiles'].game_summary('%s/%s' % (item['system'], item['game']))
        thumb = item['resumeAt'] is not None and store.thumb_file(account_id, item['system'], item['game'], 0)
        result.append(dict(summary, slots=item['slots'], resumeAt=item['resumeAt'], updatedAt=item['updatedAt'],
                           thumb=bool(thumb)))
    return {'games': result}


def save_thumb(ctx, request):
    """``GET /api/saves/thumb?account=&system=&game=&slot=``: miniatura PNG di uno slot; 404 se manca."""
    account_id = query_account(ctx, request)
    system, game_id = request.query.get('system'), request.query.get('game')
    slot = request.query.get('slot', '0')
    if not system or not game_id or slot not in [str(number) for number in range(10)]:
        raise ApiError(400, 'Richiesta non valida.')
    path = ctx['saves'].thumb_file(account_id, system, game_id, int(slot))
    try:
        with open(path or '', 'rb') as stream:
            data = stream.read()
    except OSError:
        raise ApiError(404, 'Miniatura non disponibile.')
    return RawResponse(data, 'image/png', 'no-store')


def body_account(ctx, body, name='account'):
    """Id di un profilo esistente dal campo ``name`` del corpo, altrimenti 400."""
    value = body.get(name)
    if isinstance(value, bool) or not isinstance(value, int) or ctx['profiles'].repo.get(value) is None:
        raise ApiError(400, 'Profilo non valido.')
    return value


def body_save(ctx, body, slots=range(10)):
    """``(account, system, game, slot)`` dal corpo JSON; 400 se manca qualcosa o lo slot non è tra ``slots``."""
    account_id = body_account(ctx, body)
    system = text_field(body, 'system', 'la console')
    game_id = text_field(body, 'game', 'il gioco')
    slot = body.get('slot')
    if isinstance(slot, bool) or not isinstance(slot, int) or slot not in slots:
        raise ApiError(400, 'Slot non valido.')
    return account_id, system, game_id, slot


def game_players(ctx):
    """Profili dei giocatori della partita in corso, oppure ``None`` se non si gioca."""
    play = ctx['play']
    if not play.playing():
        return None
    return play.profile_ids(play.ingame_info()['players'])


def check_players(ctx, *accounts):
    """Durante una partita si toccano solo i salvataggi dei profili che giocano: altrimenti 409."""
    players = game_players(ctx)
    if players is not None and any(account_id not in players for account_id in accounts):
        raise ConflictError('Durante la partita si modificano solo i salvataggi dei giocatori.')


def from_profile(body):
    """Vero se l'operazione arriva dal Profilo (``scope: 'profile'``) e non dalla modale in partita."""
    return body.get('scope') == 'profile'


def check_game_idle(ctx, system, game_id):
    """Dal Profilo i salvataggi di un gioco non si toccano mentre quel gioco è in corso: 409, come per il core."""
    state = ctx['play'].state()
    game = state['game']
    if state['running'] and game and game['system'] == system and game['id'] == game_id:
        raise ConflictError('Il gioco è in corso.')


def check_access(ctx, body, system, game_id, *accounts):
    """Regole d'accesso di un'operazione sugli slot.

    Dal Profilo vale il profilo indicato e, per la copia, qualunque altro
    profilo, salvo durante una partita dello stesso gioco. Dalla modale in
    partita valgono solo i giocatori della partita (``check_players``).
    """
    if from_profile(body):
        check_game_idle(ctx, system, game_id)
    else:
        check_players(ctx, *accounts)


def saves_operation(ctx, operation):
    """Esegue ``operation()`` una alla volta con le operazioni del menu in partita (409 se ce n'è una in corso)."""
    ingame = ctx.get('ingame')
    if ingame is None:
        return operation()
    with ingame.exclusive():
        return operation()


def save_slots(ctx, account_id, system, game_id):
    """Risposta delle operazioni sugli slot: ``{slots}`` del profilo per il gioco, come ``/api/saves/game``."""
    core = associated_core(ctx['cores'].game_core(system, game_id))
    return {'slots': ctx['saves'].game_slots(account_id, system, game_id, core)}


def rename_save(ctx, request):
    """``POST /api/saves/rename`` ``{account, system, game, slot, name}``: nome dello slot 1–9 (vuoto lo toglie).

    Il nome si ripulisce e si taglia a 20 caratteri. Risponde ``{slots}``.
    """
    account_id, system, game_id, slot = body_save(ctx, request.body, MANUAL_SLOTS)
    name = request.body.get('name')
    if name is not None and not isinstance(name, str):
        raise ApiError(400, 'Nome non valido.')
    check_access(ctx, request.body, system, game_id, account_id)
    saves_operation(ctx, lambda: ctx['saves'].rename(account_id, system, game_id, slot, name))
    return save_slots(ctx, account_id, system, game_id)


def protect_save(ctx, request):
    """``POST /api/saves/protect`` ``{account, system, game, slot, protected}``: protegge lo slot 1–9 o toglie la protezione."""
    account_id, system, game_id, slot = body_save(ctx, request.body, MANUAL_SLOTS)
    protected = request.body.get('protected')
    if not isinstance(protected, bool):
        raise ApiError(400, 'Indica se proteggere lo slot.')
    check_access(ctx, request.body, system, game_id, account_id)
    saves_operation(ctx, lambda: ctx['saves'].set_protected(account_id, system, game_id, slot, protected))
    return save_slots(ctx, account_id, system, game_id)


def delete_save(ctx, request):
    """``POST /api/saves/delete`` ``{account, system, game, slot}``: elimina lo slot (0–9). 409 se è protetto."""
    account_id, system, game_id, slot = body_save(ctx, request.body)
    check_access(ctx, request.body, system, game_id, account_id)
    saves_operation(ctx, lambda: ctx['saves'].delete(account_id, system, game_id, slot))
    return save_slots(ctx, account_id, system, game_id)


def copy_save(ctx, request):
    """``POST /api/saves/copy`` ``{account, system, game, slot, to, toSlot}``: copia lo slot in quello di un altro profilo.

    Si copiano stato, miniatura e core, non nome e protezione. In partita
    la destinazione può essere solo l'altro giocatore; dal Profilo
    (``scope: 'profile'``) qualunque altro profilo. 409 se lo slot di
    destinazione è protetto. Risponde ``{slots}`` del profilo di destinazione.
    """
    account_id, system, game_id, slot = body_save(ctx, request.body, MANUAL_SLOTS)
    target = body_account(ctx, request.body, 'to')
    to_slot = request.body.get('toSlot')
    if isinstance(to_slot, bool) or not isinstance(to_slot, int) or to_slot not in MANUAL_SLOTS:
        raise ApiError(400, 'Slot di destinazione non valido.')
    if target == account_id:
        raise ApiError(400, 'Scegli un altro profilo.')
    check_access(ctx, request.body, system, game_id, account_id, target)
    saves_operation(ctx, lambda: ctx['saves'].copy(account_id, target, system, game_id, slot, to_slot))
    return save_slots(ctx, target, system, game_id)


def delete_game_saves(ctx, request):
    """``POST /api/saves/delete-game`` ``{account, system, game}``: dal Profilo, elimina gli slot non protetti.

    Si eliminano anche «Riprendi»; il salvataggio interno resta. 409 durante
    una partita dello stesso gioco. Risponde ``{remaining, slots}``:
    quanti slot restano (i protetti) e quali.
    """
    body = request.body
    account_id = body_account(ctx, body)
    system = text_field(body, 'system', 'la console')
    game_id = text_field(body, 'game', 'il gioco')
    check_game_idle(ctx, system, game_id)
    remaining = saves_operation(ctx, lambda: ctx['saves'].delete_game(account_id, system, game_id))
    return dict(save_slots(ctx, account_id, system, game_id), remaining=remaining)


def game_saves(ctx, request):
    """``GET /api/saves/game?system=&game=&accounts=<id,id>``: salvataggi del gioco per ogni profilo.

    ``{accounts: [{id, slots: [{slot, core, name, protected, updatedAt, thumb, loadable, shared}]}], shared}``
    nell'ordine richiesto, senza doppioni e senza i profili che non esistono.
    ``loadable`` è falso se lo stato è stato creato con un core diverso da
    quello associato al gioco; ``shared`` dello slot è ``{id, title}`` del
    salvataggio condiviso da cui è nato (oppure ``None``). ``shared`` della
    risposta sono i salvataggi condivisi del gioco, ``[{id, title, description}]``.
    """
    system, game_id = request.query.get('system'), request.query.get('game')
    if not system or not game_id:
        raise ApiError(400, 'Richiesta non valida.')
    ids = []
    for value in (request.query.get('accounts') or '').split(','):
        if not value:
            continue
        try:
            account_id = int(value)
        except ValueError:
            raise ApiError(400, 'Profili non validi.')
        if account_id not in ids:
            ids.append(account_id)
    store = ctx['saves']
    core = associated_core(ctx['cores'].game_core(system, game_id))
    accounts = []
    for account_id in ids:
        if ctx['profiles'].repo.get(account_id) is None:
            continue
        accounts.append({'id': account_id, 'slots': store.game_slots(account_id, system, game_id, core)})
    return {'accounts': accounts, 'shared': store.shared_list(system, game_id)}


def exit_check(ctx, request):
    """``GET /api/exit/check``: attività delle estensioni ancora in corso, ``{busy: [frasi]}``."""
    return {'busy': addons.busy_all(ctx.get('addons', []), ctx)}


def exit_dashboard(ctx, request):
    """``POST /api/exit``: chiude Chrome e il server dopo la risposta.

    Con ``{keepRunning: true}`` e attività in corso chiude solo Chrome: il
    server resta in background finché le attività non finiscono. 409 durante
    una partita o se Chrome non è stato avviato da Pixel Arcade.
    """
    if ctx['play'].playing():
        raise ConflictError('Chiudi prima il gioco in corso.')
    close = ctx.get('exit')
    if close is None:
        raise ConflictError('Chrome non è stato avviato da Pixel Arcade: chiudilo a mano.')
    body = request.body if isinstance(request.body, dict) else {}
    close(body.get('keepRunning') is True)
    return {'message': 'Pixel Arcade si sta chiudendo.'}


def show(ctx, request):
    """``POST /api/show``: riapre la dashboard se il servizio è in background, ``{shown}``.

    Accettata solo da un processo locale, senza token (``server.LOCAL_ROUTES``).
    409 se il servizio si sta fermando.
    """
    reopen = ctx.get('show')
    return {'shown': bool(reopen and reopen())}


def joypad_ids(body):
    """``(vendor, product)`` USB dal corpo JSON (interi da 0 a 65535)."""
    ids = []
    for field in ('vendor', 'product'):
        value = body.get(field) if isinstance(body, dict) else None
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 0xFFFF:
            raise ApiError(400, 'Joypad non valido.')
        ids.append(value)
    return tuple(ids)


def joypads(ctx, request):
    """``GET /api/joypads``: joypad visti da RetroArch (SDL2) con lo stato del loro autoconfig."""
    return ctx['joypads'].overview()


def joypad_learn(ctx, request):
    """``POST /api/joypads/learn`` ``{vendor, product}``: inizia a leggere i tasti di quel joypad."""
    vendor, product = joypad_ids(request.body)
    return ctx['joypads'].start_learn(vendor, product)


def joypad_learn_state(ctx, request):
    """``GET /api/joypads/learn?after=N``: tasti premuti dopo la pressione ``N``."""
    try:
        after = int(request.query.get('after', '0'))
    except ValueError:
        raise ApiError(400, 'Parametro after non valido.')
    return ctx['joypads'].learn_state(after)


def joypad_learn_stop(ctx, request):
    """``POST /api/joypads/learn/stop``: smette di leggere i tasti."""
    return ctx['joypads'].stop_learn()


def joypad_save(ctx, request):
    """``POST /api/joypads/save`` ``{vendor, product, binds}``: scrive l'autoconfig del joypad."""
    vendor, product = joypad_ids(request.body)
    return ctx['joypads'].save(vendor, product, request.body.get('binds'))


def joypad_buttons(ctx, request):
    """``POST /api/joypads/buttons`` ``{id, buttons}``: tasti della dashboard del joypad ``id`` (Gamepad API)."""
    body = request.body if isinstance(request.body, dict) else {}
    return {'padButtons': ctx['config'].set_pad_buttons(body.get('id'), body.get('buttons'))}


def joypad_repair(ctx, request):
    """``POST /api/joypads/repair``: tasti joypad del ``retroarch.cfg`` riportati agli autoconfig."""
    return ctx['joypads'].repair()


def register(router):
    """Registra le rotte dell'API sul router."""
    router.add('GET', '/api/health', health)
    router.add('GET', '/api/bootstrap', bootstrap)
    router.add('GET', '/api/games', games)
    router.add('GET', '/api/image', image)
    router.add('POST', '/api/library/rescan', rescan)
    router.add('GET', '/api/settings', get_settings)
    router.add('POST', '/api/settings', save_settings)
    router.add('POST', '/api/cores/refresh', refresh_cores)
    router.add('GET', '/api/run', run_state)
    router.add('POST', '/api/run/rescue', run_rescue)
    router.add('POST', '/api/run/rescue/answer', rescue_answer)
    router.add('GET', '/api/run/rescue/thumb', rescue_thumb)
    router.add('POST', '/api/ingame/open', ingame_open)
    router.add('POST', '/api/ingame/save', ingame_save)
    router.add('POST', '/api/ingame/load', ingame_load)
    router.add('POST', '/api/ingame/undo', ingame_undo)
    router.add('POST', '/api/ingame/controls', ingame_controls)
    router.add('POST', '/api/ingame/close', ingame_close)
    router.add('POST', '/api/ingame/quit', ingame_quit)
    router.add('GET', '/api/ingame/slots', ingame_slots)
    router.add('GET', '/api/ingame/thumb', ingame_thumb)
    router.add('GET', '/api/ingame/shot', ingame_shot)
    router.add('POST', '/api/launch', launch)
    router.add('GET', '/api/joypads', joypads)
    router.add('POST', '/api/joypads/learn', joypad_learn)
    router.add('GET', '/api/joypads/learn', joypad_learn_state)
    router.add('POST', '/api/joypads/learn/stop', joypad_learn_stop)
    router.add('POST', '/api/joypads/save', joypad_save)
    router.add('POST', '/api/joypads/buttons', joypad_buttons)
    router.add('POST', '/api/joypads/repair', joypad_repair)
    router.add('POST', '/api/stop', stop)
    router.add('POST', '/api/game/core/reset', reset_game_core)
    router.add('POST', '/api/game/core', set_game_core)
    router.add('GET', '/api/game/cores', game_cores)
    router.add('GET', '/api/game/controls', game_controls)
    router.add('POST', '/api/game/controls', save_game_controls)
    router.add('GET', '/api/game/controller', game_controller)
    router.add('POST', '/api/game/controller', save_game_controller)
    router.add('GET', '/api/config', game_config)
    router.add('POST', '/api/config/option', save_config_option)
    router.add('POST', '/api/config/level', save_config_level)
    router.add('POST', '/api/config/promote', promote_config)
    router.add('GET', '/api/bios', get_bios)
    router.add('GET', '/api/bios/check', check_bios)
    router.add('POST', '/api/bios/import', import_bios)
    router.add('POST', '/api/bios/remove', remove_bios)
    router.add('GET', '/api/files', files)
    router.add('POST', '/api/game/core/verdict', verdict)
    router.add('POST', '/api/download/answer', download_answer)
    router.add('GET', '/api/cores/unused', unused_cores)
    router.add('POST', '/api/cores/unused/delete', delete_unused_cores)
    router.add('GET', '/api/profiles', profiles)
    router.add('POST', '/api/profiles', create_profile)
    router.add('POST', '/api/profiles/update', update_profile)
    router.add('GET', '/api/profiles/stats', profile_stats)
    router.add('GET', '/api/profiles/avatar', profile_avatar)
    router.add('GET', '/api/profiles/played', profile_played)
    router.add('GET', '/api/leaderboard', leaderboard)
    router.add('GET', '/api/wrapped/list', wrapped_list)
    router.add('GET', '/api/wrapped', wrapped)
    router.add('POST', '/api/wrapped/seen', wrapped_seen)
    router.add('GET', '/api/challenges', challenges)
    router.add('GET', '/api/challenges/notices', challenge_notices)
    router.add('POST', '/api/challenges/seen', challenge_seen)
    router.add('GET', '/api/challenges/candidates', challenge_candidates)
    router.add('POST', '/api/challenges', challenge_create)
    router.add('POST', '/api/challenges/discard', challenge_discard)
    router.add('POST', '/api/challenges/start', challenge_start)
    router.add('GET', '/api/challenges/thumb', challenge_thumb)
    router.add('GET', '/api/tournament', tournament)
    router.add('POST', '/api/tournament', tournament_create)
    router.add('POST', '/api/tournament/update', tournament_update)
    router.add('POST', '/api/tournament/series/update', tournament_series_update)
    router.add('POST', '/api/tournament/series/edition', tournament_series_edition)
    router.add('POST', '/api/tournament/series/delete', tournament_series_delete)
    router.add('POST', '/api/tournament/unlock', tournament_unlock)
    router.add('POST', '/api/tournament/record', tournament_record)
    router.add('POST', '/api/tournament/publish', tournament_publish)
    router.add('POST', '/api/tournament/delete', tournament_delete)
    router.add('POST', '/api/tournament/cancel', tournament_cancel)
    router.add('POST', '/api/tournament/join', tournament_join)
    router.add('POST', '/api/tournament/leave', tournament_leave)
    router.add('POST', '/api/tournament/players/add', tournament_player_add)
    router.add('POST', '/api/tournament/players/remove', tournament_player_remove)
    router.add('POST', '/api/tournament/registration', tournament_registration)
    router.add('POST', '/api/tournament/start/check', tournament_start_check)
    router.add('POST', '/api/tournament/start/preview', tournament_start_preview)
    router.add('POST', '/api/tournament/start', tournament_start)
    router.add('POST', '/api/tournament/start/draft', tournament_start_draft)
    router.add('GET', '/api/tournament/thumb', tournament_thumb)
    router.add('POST', '/api/tournament/match/screen', tournament_match_screen)
    router.add('POST', '/api/tournament/match/play', tournament_match_play)
    router.add('POST', '/api/tournament/match/declare', tournament_match_declare)
    router.add('POST', '/api/tournament/match/suspend', tournament_match_suspend)
    router.add('POST', '/api/tournament/match/walkover', tournament_match_walkover)
    router.add('POST', '/api/tournament/withdraw', tournament_withdraw)
    router.add('POST', '/api/tournament/match/undo', tournament_match_undo)
    router.add('POST', '/api/tournament/draw', tournament_draw)
    router.add('GET', '/api/replays/next', replay_next)
    router.add('POST', '/api/replays/play', replay_play)
    router.add('GET', '/api/replays/status', replay_status)
    router.add('POST', '/api/replays/stop', replay_stop)
    router.add('POST', '/api/favorites', set_favorite)
    router.add('GET', '/api/playlists', playlists)
    router.add('POST', '/api/playlists', create_playlist)
    router.add('POST', '/api/playlists/update', update_playlist)
    router.add('POST', '/api/playlists/delete', delete_playlist)
    router.add('POST', '/api/playlists/game', playlist_game)
    router.add('GET', '/api/ra', ra_status)
    router.add('POST', '/api/ra/key', ra_set_key)
    router.add('POST', '/api/ra/key/delete', ra_remove_key)
    router.add('POST', '/api/ra/link', ra_link)
    router.add('POST', '/api/ra/unlink', ra_unlink)
    router.add('GET', '/api/ra/game', ra_game)
    router.add('GET', '/api/ra/profile', ra_profile)
    router.add('GET', '/api/ra/profile/games', ra_profile_games)
    router.add('GET', '/api/ra/profile/game', ra_profile_game)
    router.add('GET', '/api/ra/icon', ra_icon)
    router.add('GET', '/api/ra/badge', ra_badge)
    router.add('GET', '/api/saves', saves)
    router.add('GET', '/api/saves/thumb', save_thumb)
    router.add('GET', '/api/saves/game', game_saves)
    router.add('POST', '/api/saves/rename', rename_save)
    router.add('POST', '/api/saves/protect', protect_save)
    router.add('POST', '/api/saves/delete', delete_save)
    router.add('POST', '/api/saves/copy', copy_save)
    router.add('POST', '/api/saves/delete-game', delete_game_saves)
    router.add('GET', '/api/exit/check', exit_check)
    router.add('POST', '/api/exit', exit_dashboard)
    router.add('POST', '/api/show', show)
