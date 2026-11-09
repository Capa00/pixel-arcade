"""Menu dei salvataggi in partita (Sprint 04 dei salvataggi).

Un giocatore preme la combinazione dei salvataggi (predefinita Select+L2,
letta dalla dashboard): il gioco va in pausa con i comandi di rete di
RetroArch e sopra compare una finestra di Chrome con la modale dei
salvataggi di quel giocatore (variante A dello Sprint 01). Da lì si salva o
si carica uno degli slot 1–9 del profilo; alla chiusura RetroArch riprende.

Lo slot di lavoro di RetroArch è lo 0 (``<nome>.state`` nella cartella di
sessione), con ``SAVE_STATE`` e ``LOAD_STATE``: il file si copia da e verso
lo slot del profilo (``saves.SaveStore``).

All'apertura, con il gioco in pausa e ancora visibile, si cattura lo schermo
(``SCREENSHOT``): la cattura è lo sfondo della modale e la miniatura di
riserva se RetroArch non scrive quella dello stato.

Annullamento dell'ultimo caricamento (Sprint 05): prima di ogni caricamento
RetroArch salva il momento attuale nello slot di lavoro, con lo stesso
metodo di «Salva qui», e il file si sposta in ``<nome>.state.undo`` nella
cartella di sessione. Annullare lo rimette nello slot di lavoro e lo carica.
C'è un solo stato di riserva: vale per l'ultimo caricamento, di qualunque
giocatore, finché la partita è aperta (la cartella si svuota a ogni avvio).

Il tempo con il menu aperto è una pausa: non conta come tempo di gioco né
per gli XP. ``PlayService`` lo legge a fine partita con ``take_paused``.

Comandi (Miglioramenti, 7 ottobre 2026): al primo avvio di un gioco con un
core mai configurato la stessa finestra mostra i comandi del gioco
(``open_controls``, menu di tipo ``controls``). «Salva» scrive il remap e,
se le assegnazioni sono cambiate, riavvia RetroArch: il gioco riparte dallo
stato automatico scritto all'uscita.

Incontri di torneo (``PlayService.ingame_info`` con ``match``): con i
salvataggi bloccati non si salva né si carica (``locked`` nello stato, il menu
offre solo «Torna al gioco» ed «Esci»); senza blocco gli slot sono quelli
temporanei dell'incontro (``temp``), in ``<temp>/match-<id>/``, mai quelli
dei profili: si cancellano a fine incontro (``drop_match``) e al riavvio.
"""
import glob
import logging
import os
import shutil
import threading
import time
from contextlib import contextmanager

from .errors import ConflictError, LaunchError, RetroArchError
from .fsutil import atomic_copy, png_complete
from .retroarch_net import PAUSED, PLAYING, RetroArchNet
from .saves import MANUAL_SLOTS, SESSION_MODE, MemorySavesRepository, SaveStore, loadable

log = logging.getLogger(__name__)

PLAYER_SLOTS = ('p1', 'p2')
SAVES = 'saves'
CONTROLS = 'controls'
# Attesa del ritorno di RetroArch dopo la chiusura della finestra: riprende da solo
# quando torna in primo piano (``pause_nonactive``, misurati circa 0,14 s).
RESUME_WAIT = 1.5
STATE_SUFFIX = '.state'
UNDO_SUFFIX = '.state.undo'
LOCKED = 'In questo torneo i salvataggi sono bloccati.'
MATCH_DIR = 'match-%d'


class IngameService:
    """Apertura, salvataggio, caricamento e chiusura del menu in partita.

    ``play`` è il ``PlayService`` della partita, ``saves`` il ``SaveStore``.
    ``net_factory()`` restituisce il client dei comandi di rete
    (``RetroArchNet``); ``window`` ha ``open()`` e ``close()`` e mostra la
    finestra della modale sopra il gioco. Si può assegnare dopo la
    creazione (serve l'indirizzo del server). Le operazioni sono una alla
    volta: una seconda richiesta durante un salvataggio riceve 409.
    """

    def __init__(self, play, saves, net_factory=None, window=None, resume_wait=RESUME_WAIT, clock=time.monotonic,
                 controls=None, match_root=None):
        self.play = play
        self.saves = saves
        self.controls = controls
        self.net_factory = net_factory or self.default_net
        self.window = window
        self.resume_wait = resume_wait
        self.lock = threading.Lock()
        self.operation = threading.Lock()
        self.menu = None
        self.seq = 0
        self.busy = False
        # Giocatore (``p1``/``p2``) che può annullare l'ultimo caricamento, oppure ``None``.
        self.undo_owner = None
        self.clock = clock
        # Secondi di pausa con il menu aperto nella partita in corso e inizio della pausa attuale.
        self.paused = 0.0
        self.paused_since = None
        # Slot temporanei degli incontri di torneo senza blocco: ``{incontro: SaveStore}`` in ``match_root``.
        self.match_root = match_root
        self.match_stores = {}
        self.clean_matches()
        play.add_end_listener(self.game_ended)
        play.add_pause_source(self.take_paused)

    def default_net(self):
        return RetroArchNet(self.play.config.get()['retroarch.network_port'])

    # --- Incontri di torneo --------------------------------------------------

    def clean_matches(self):
        """Toglie gli slot temporanei rimasti da un avvio precedente (quelli in memoria non ci sono più)."""
        if not self.match_root:
            return
        for path in glob.glob(os.path.join(self.match_root, MATCH_DIR.replace('%d', '*'))):
            shutil.rmtree(path, ignore_errors=True)

    def match_store(self, match_id):
        """Slot temporanei dell'incontro ``match_id`` (creati alla prima richiesta)."""
        with self.lock:
            store = self.match_stores.get(match_id)
            if store is None:
                if not self.match_root:
                    raise LaunchError('Slot dell\'incontro non disponibili.')
                store = SaveStore(os.path.join(self.match_root, MATCH_DIR % match_id), MemorySavesRepository())
                self.match_stores[match_id] = store
            return store

    def drop_match(self, match_id):
        """Fine dell'incontro: i suoi slot temporanei si cancellano."""
        with self.lock:
            self.match_stores.pop(match_id, None)
        if self.match_root:
            shutil.rmtree(os.path.join(self.match_root, MATCH_DIR % match_id), ignore_errors=True)

    def store_for(self, info):
        """Dove salvare e caricare: gli slot dei profili, quelli dell'incontro o niente (``LaunchError``)."""
        match = info.get('match')
        if match is None:
            return self.saves
        if match.get('savesLocked'):
            raise LaunchError(LOCKED)
        return self.match_store(match['match'])

    # --- Stato ---------------------------------------------------------------

    def state(self):
        """Stato ``menu`` di ``GET /api/run``: ``{open, kind, slot, account, other, undo, busy, shot, players}``.

        ``kind`` è ``saves`` (salvataggi) o ``controls`` (comandi del gioco);
        ``players`` sono i giocatori della partita (``p1``, ``p2`` se aveva un
        profilo o un joypad all'avvio). In un incontro di torneo ``locked`` è
        vero con i salvataggi bloccati e ``temp`` con gli slot temporanei
        dell'incontro (senza copia all'altro giocatore: ``other`` è ``None``).

        ``slot`` è il giocatore che ha aperto la modale (``p1``/``p2``),
        ``account`` il suo profilo, oppure ``None`` per un ospite. ``other``
        è il profilo dell'altro giocatore della partita (destinazione della
        copia), oppure ``None``. ``undo`` è vero se quel giocatore può
        annullare l'ultimo caricamento. ``shot`` è un numero che cambia a
        ogni cattura dello schermo (``GET /api/ingame/shot``), oppure
        ``None`` se non c'è.
        """
        with self.lock:
            menu = self.menu
            if menu is None:
                return {'open': False, 'kind': None, 'slot': None, 'account': None, 'other': None, 'undo': False,
                        'busy': False, 'shot': None, 'players': [], 'locked': False, 'temp': False}
            match = menu.get('match')
            locked = bool(match and match.get('savesLocked'))
            return {'open': True, 'kind': menu['kind'], 'slot': menu['slot'], 'account': menu['account'],
                    'other': menu['other'] if match is None else None,
                    'undo': not locked and menu['account'] is not None and self.undo_owner == menu['slot'],
                    'busy': self.busy, 'shot': menu['seq'] if menu['shot'] else None,
                    'players': list(menu['players']), 'locked': locked, 'temp': bool(match) and not locked}

    def menu_open(self):
        """Vero se il menu in partita (salvataggi o comandi) è aperto."""
        with self.lock:
            return self.menu is not None

    def shot_file(self):
        """Cattura dello schermo del menu aperto, oppure ``None``."""
        with self.lock:
            menu = self.menu
        return menu['shot'] if menu is not None and menu['shot'] and png_complete(menu['shot']) else None

    def take_shot(self, net, info):
        """Cattura dello schermo del gioco in pausa; ``None`` se non riesce (si continua senza)."""
        try:
            path = net.screenshot(info['session'])
        except RetroArchError:
            path = None
        if path is None:
            log.warning('Cattura dello schermo non riuscita: modale senza sfondo.')
        return path

    def begin(self):
        """Inizio di un'operazione: ``ConflictError`` se ce n'è già una in corso."""
        if not self.operation.acquire(blocking=False):
            raise ConflictError('Operazione sui salvataggi già in corso.')
        with self.lock:
            self.busy = True

    def end(self):
        with self.lock:
            self.busy = False
        self.operation.release()

    @contextmanager
    def exclusive(self):
        """Blocco per le operazioni sui salvataggi fatte fuori dal menu (rotte ``/api/saves/…``)."""
        self.begin()
        try:
            yield
        finally:
            self.end()

    def current(self, kind=SAVES):
        """Partita e menu aperto: ``(info della partita, menu)``.

        ``ConflictError`` se il menu ``kind`` non è aperto.
        """
        info = self.play.ingame_info()
        with self.lock:
            menu = self.menu
        if menu is None or info['phase'] != 'running' or menu['kind'] != kind:
            raise ConflictError('Il menu dei comandi non è aperto.' if kind == CONTROLS
                                else 'Il menu dei salvataggi non è aperto.')
        return info, menu

    @staticmethod
    def present(info):
        """Giocatori della partita: ``p1`` sempre, ``p2`` se all'avvio aveva un profilo o un joypad."""
        players = list(info.get('players') or [])
        pads = list(info.get('pads') or [])
        second = (len(players) > 1 and players[1] is not None) or (len(pads) > 1 and pads[1] is not None)
        return list(PLAYER_SLOTS) if second else [PLAYER_SLOTS[0]]

    def account_of(self, info, slot):
        """Profilo del giocatore ``slot`` nella partita, oppure ``None`` (ospite o profilo inesistente)."""
        players = list(info['players'] or [])
        index = PLAYER_SLOTS.index(slot)
        account_id = players[index] if index < len(players) else None
        return account_id if account_id is not None and account_id in self.play.profile_ids([account_id]) else None

    # --- Operazioni ----------------------------------------------------------

    def open(self, slot):
        """Mette in pausa il gioco e apre la modale dei salvataggi del giocatore ``slot`` (``p1``/``p2``).

        Si ignora (restituisce lo stato senza fare nulla) se non c'è una
        partita in corso, se il menu è già aperto o se c'è già
        un'operazione in corso. ``RetroArchError`` se il gioco non va in
        pausa o la finestra non si apre: in quel caso il gioco riprende.
        """
        if slot not in PLAYER_SLOTS:
            raise LaunchError('Giocatore non valido.')
        return self.open_menu(slot, SAVES)

    def open_controls(self):
        """Mette in pausa il gioco e apre la finestra dei comandi (prima configurazione), come ``open``."""
        return self.open_menu(PLAYER_SLOTS[0], CONTROLS)

    def open_menu(self, slot, kind):
        try:
            self.begin()
        except ConflictError:
            return self.state()
        try:
            info = self.play.ingame_info()
            with self.lock:
                ignored = info['phase'] != 'running' or self.menu is not None
            if ignored:
                return self.state()
            account_id = self.account_of(info, slot)
            other = self.account_of(info, PLAYER_SLOTS[1 - PLAYER_SLOTS.index(slot)])
            net = self.net_factory()
            net.pause()
            with self.lock:
                self.paused_since = self.clock()
            shot = self.take_shot(net, info)
            with self.lock:
                self.seq += 1
                self.menu = {'kind': kind, 'slot': slot, 'account': account_id,
                             'other': other if other != account_id else None, 'shot': shot, 'seq': self.seq,
                             'players': self.present(info), 'match': info.get('match')}
            try:
                if self.window is None:
                    raise RetroArchError('Finestra dei salvataggi non disponibile.')
                self.window.open()
            except Exception as error:
                log.exception('Finestra dei salvataggi non aperta')
                with self.lock:
                    self.menu = None
                self.resume(net)
                self.end_pause()
                if isinstance(error, RetroArchError):
                    raise
                raise RetroArchError('Finestra dei salvataggi non aperta.')
            if kind == CONTROLS:
                log.info('Finestra dei comandi aperta.')
            else:
                log.info('Menu dei salvataggi aperto da %s (profilo %s).', slot, account_id)
        finally:
            self.end()
        return self.state()

    def check_slot(self, menu, slot):
        """Slot 1–9 del profilo del menu; ``LaunchError`` per gli ospiti o uno slot non valido."""
        if menu['account'] is None:
            raise LaunchError('Gli ospiti non hanno salvataggi: entra con un profilo per salvare.')
        if isinstance(slot, bool) or not isinstance(slot, int) or slot not in MANUAL_SLOTS:
            raise LaunchError('Slot non valido.')
        return slot

    def slots(self, info, account_id):
        """Slot del profilo per il gioco in corso (come ``SaveStore.game_slots``; in un incontro i suoi)."""
        game = info['game']
        return self.store_for(info).game_slots(account_id, game['system'], game['id'], info['core'])

    def menu_slots(self):
        """Slot del giocatore del menu aperto: ``{slots}`` (``LaunchError`` per gli ospiti o a salvataggi bloccati)."""
        info, menu = self.current()
        if menu['account'] is None:
            raise LaunchError('Gli ospiti non hanno salvataggi: entra con un profilo per salvare.')
        return {'slots': self.slots(info, menu['account'])}

    def menu_thumb(self, slot):
        """Miniatura dello slot ``slot`` del giocatore del menu aperto (anche negli incontri), oppure ``None``."""
        try:
            info, menu = self.current()
            store = self.store_for(info)
        except (ConflictError, LaunchError):
            return None
        if menu['account'] is None or isinstance(slot, bool) or not isinstance(slot, int):
            return None
        game = info['game']
        return store.thumb_file(menu['account'], game['system'], game['id'], slot)

    def work_file(self, info):
        """Stato dello slot di lavoro di RetroArch: ``<sessione>/<nome>.state``."""
        return os.path.join(info['session'], info['content'] + STATE_SUFFIX)

    def undo_file(self, info):
        """Stato di riserva per annullare l'ultimo caricamento: ``<sessione>/<nome>.state.undo``."""
        return os.path.join(info['session'], info['content'] + UNDO_SUFFIX)

    def keep_undo(self, net, info, slot):
        """Salva il momento attuale come stato di riserva prima di un caricamento del giocatore ``slot``.

        Se non riesce si carica lo stesso, senza annullamento: quello di un
        caricamento precedente non vale più.
        """
        with self.lock:
            self.undo_owner = None
        path = self.work_file(info)
        try:
            net.save_state(path, thumb_timeout=0)
            os.replace(path, self.undo_file(info))
        except (RetroArchError, OSError) as error:
            log.warning('Stato di riserva non salvato, il caricamento non si potrà annullare: %s', error)
            return
        with self.lock:
            self.undo_owner = slot

    def save(self, slot):
        """Salva il momento attuale nello slot ``slot`` del profilo; restituisce ``{menu, slots}``.

        RetroArch scrive lo stato nello slot di lavoro, poi lo stato e la
        sua miniatura si copiano nello slot del profilo. Un errore lascia il
        gioco in pausa e il menu aperto.
        """
        self.begin()
        try:
            info, menu = self.current()
            store = self.store_for(info)
            slot = self.check_slot(menu, slot)
            game = info['game']
            path = self.work_file(info)
            thumb = path + '.png' if self.net_factory().save_state(path) else None
            if thumb is None:
                thumb = menu['shot'] if menu['shot'] and png_complete(menu['shot']) else None
                log.warning('RetroArch non ha scritto la miniatura dello stato: uso %s.',
                            'la cattura dello schermo' if thumb else 'nessuna immagine')
            stored = store.store_state(menu['account'], game['system'], game['id'], slot, info['core'], path, thumb,
                                       info.get('shared'))
            if not stored:
                raise LaunchError('Profilo non più presente.')
            log.info('Slot %d del profilo %s salvato in partita.', slot, menu['account'])
            slots = self.slots(info, menu['account'])
        finally:
            self.end()
        return {'menu': self.state(), 'slots': slots}

    def load(self, slot):
        """Carica lo slot ``slot`` del profilo, chiude il menu e fa riprendere il gioco.

        Lo stato si copia nello slot di lavoro e RetroArch lo carica con
        ``LOAD_STATE``. ``LaunchError`` se lo slot non c'è o è stato creato
        con un altro core; un errore lascia il gioco in pausa e il menu aperto.
        """
        self.begin()
        try:
            info, menu = self.current()
            store = self.store_for(info)
            slot = self.check_slot(menu, slot)
            game = info['game']
            save = store.repo.get(menu['account'], game['system'], game['id'], slot)
            source = store.state_file(menu['account'], game['system'], game['id'], slot)
            if save is None or source is None:
                raise LaunchError('Salvataggio non trovato.')
            if not loadable(save['core'], info['core']):
                raise LaunchError('Salvataggio creato con %s: non si può caricare con %s.' % (save['core'], info['core']))
            net = self.net_factory()
            self.keep_undo(net, info, menu['slot'])
            atomic_copy(source, self.work_file(info), SESSION_MODE)
            net.load_state()
            log.info('Slot %d del profilo %s caricato in partita.', slot, menu['account'])
            self.close_menu(net)
        finally:
            self.end()
        return self.state()

    def undo(self):
        """Annulla l'ultimo caricamento: torna allo stato di riserva, chiude il menu e il gioco riprende.

        Solo il giocatore che ha fatto l'ultimo caricamento può annullarlo, e
        una volta sola. ``ConflictError`` se l'annullamento non è
        disponibile; un errore lascia il gioco in pausa e il menu aperto.
        """
        self.begin()
        try:
            info, menu = self.current()
            self.store_for(info)
            path = self.undo_file(info)
            with self.lock:
                owner = self.undo_owner
            if menu['account'] is None or owner != menu['slot'] or not os.path.isfile(path):
                raise ConflictError('Nessun caricamento da annullare.')
            net = self.net_factory()
            atomic_copy(path, self.work_file(info), SESSION_MODE)
            net.load_state()
            with self.lock:
                self.undo_owner = None
            try:
                os.unlink(path)
            except OSError:
                pass
            log.info('Ultimo caricamento annullato da %s.', menu['slot'])
            self.close_menu(net)
        finally:
            self.end()
        return self.state()

    def save_controls(self, mapping, labels):
        """«Salva» nella finestra dei comandi: assegnazioni e nomi del gioco in corso, configurazione confermata.

        Se le assegnazioni sono cambiate la finestra si chiude e RetroArch si
        riavvia (``QUIT``, poi ``PlayService`` lo avvia di nuovo); altrimenti
        il gioco riprende. Un errore lascia il gioco in pausa e la finestra aperta.
        """
        self.begin()
        try:
            info, _ = self.current(CONTROLS)
            game = self.play.library.find(info['game']['system'], info['game']['id'])
            if game is None or self.controls is None:
                raise LaunchError('Gioco non trovato.')
            changed = self.controls.save(info['game']['system'], game, mapping, labels, info['core'])
            net = self.net_factory()
            if not changed:
                self.close_menu(net)
                return self.state()
            self.play.request_restart()
            with self.lock:
                self.menu = None
            self.close_window()
            self.end_pause()
            try:
                net.send('QUIT')
            except RetroArchError:
                self.play.cancel_restart()
                self.resume(net)
                raise
            log.info('Comandi cambiati: riavvio di RetroArch.')
        finally:
            self.end()
        return self.state()

    def close(self):
        """Chiude il menu: la finestra si chiude e il gioco riprende. Senza menu aperto non fa nulla."""
        self.begin()
        try:
            with self.lock:
                menu = self.menu
            if menu is not None:
                self.close_menu(self.net_factory())
        finally:
            self.end()
        return self.state()

    def quit(self):
        """«Esci» dal menu: la finestra si chiude e RetroArch si chiude, come con l'uscita dal gioco.

        Se il comando di chiusura non arriva, la partita si interrompe
        (``PlayService.stop``). Senza menu aperto non fa nulla.
        """
        self.begin()
        try:
            with self.lock:
                menu, self.menu = self.menu, None
            if menu is not None:
                self.close_window()
                self.end_pause()
                try:
                    self.net_factory().send('QUIT')
                except RetroArchError as error:
                    log.warning('Comando di chiusura non inviato, interrompo la partita: %s', error)
                    self.play.stop()
                log.info('Uscita dal gioco dal menu in partita.')
        finally:
            self.end()
        return self.state()

    def close_menu(self, net):
        """Chiude la finestra e, se RetroArch non riparte da solo entro ``resume_wait``, toglie la pausa."""
        with self.lock:
            self.menu = None
        self.close_window()
        try:
            if net.wait_status(PLAYING, self.resume_wait) == PAUSED:
                self.resume(net)
        except RetroArchError:
            log.warning('RetroArch non risponde alla chiusura del menu dei salvataggi.')
        self.end_pause()
        log.info('Menu dei salvataggi chiuso.')

    def end_pause(self):
        """Fine della pausa del menu: la sua durata si aggiunge a quella della partita."""
        with self.lock:
            if self.paused_since is not None:
                self.paused += max(0.0, self.clock() - self.paused_since)
                self.paused_since = None

    def take_paused(self):
        """Secondi di pausa con il menu aperto nella partita appena finita; il conteggio riparte da zero."""
        self.end_pause()
        with self.lock:
            paused, self.paused = self.paused, 0.0
        return paused

    def resume(self, net):
        try:
            net.resume()
        except RetroArchError:
            log.warning('Pausa non tolta: RetroArch non risponde.')

    def close_window(self):
        if self.window is None:
            return
        try:
            self.window.close()
        except Exception:
            log.exception('Finestra dei salvataggi non chiusa')

    def window_closed(self):
        """La finestra della modale si è chiusa da sola (per esempio col mouse): il menu si chiude."""
        with self.lock:
            open_menu = self.menu is not None
        if open_menu:
            log.info('Finestra dei salvataggi chiusa dall\'esterno.')
            try:
                self.close()
            except ConflictError:
                pass

    def game_ended(self):
        """Fine di RetroArch: menu e finestra si chiudono senza comandi di rete."""
        with self.lock:
            menu, self.menu = self.menu, None
            self.undo_owner = None
        self.end_pause()
        if menu is not None:
            self.close_window()
            log.info('Partita terminata con il menu dei salvataggi aperto: lo chiudo.')
