"""Archivio dei salvataggi per profilo: stati di RetroArch e salvataggi interni dei giochi.

Struttura su disco (sotto ``<data_dir>/saves/``)::

    <account_id>/<chiave>/slotN.state      stato dello slot N (0 = «Riprendi»)
    <account_id>/<chiave>/slotN.png        sua miniatura
    <account_id|ospiti>/<chiave>/sram/     salvataggio interno del P1 (batteria, memory card)
    <account_id|ospiti>/<chiave>/sram/<cartella>/   cartelle dei core (per esempio ``mame2000/``
                                                    con record e nvram), copiate così come sono
    <account_id|ospiti>/system/<core>/<file>   salvataggi che il core tiene nella cartella di
                                               sistema di RetroArch (``SYSTEM_SAVES``: le
                                               memory card di pcsx2), uno per profilo e core

``<chiave>`` è lo SHA-1 di ``<system_id>/<game_id>``: gli id possono contenere ``/``.

Nomi dei file di RetroArch 1.22.2 nella cartella di sessione (Sprint 01 dei
salvataggi): ``<nome>.state``, ``<nome>.stateN``, ``<nome>.state.auto``, le
miniature ``<file stato>.png`` e il salvataggio interno ``<nome>.srm``
(memory card PS1 compresa), dove ``<nome>`` è il nome del file del gioco senza
estensione. Alcuni core (MAME 2000) scrivono invece in una propria
sottocartella della cartella di sessione: anche quella fa parte del
salvataggio interno.

Salvataggi condivisi: ``SaveStore.shared`` è il fornitore dell'estensione
``shared-saves`` (oppure ``None``), con ``folder(system, game, name)`` (cartella
del salvataggio, oppure ``None``), ``title(system, game, name)`` e
``list(system, game)`` (``[{id, title, description}]``). Uno slot nato da una
partita con un salvataggio condiviso ne ricorda il nome (``shared``).
"""
import hashlib
import logging
import os
import shutil
import unicodedata

from .errors import ConflictError, SaveError
from .fsutil import atomic_copy, png_complete
from .repositories.cores import now_iso

log = logging.getLogger(__name__)

GUESTS = 'ospiti'
SRAM_DIR = 'sram'
AUTO_SUFFIX = '.state.auto'
# Slot manuali di ogni profilo (lo 0 è il «Riprendi»).
MANUAL_SLOTS = tuple(range(1, 10))
# Lunghezza massima del nome di uno slot.
NAME_MAX = 20
# Permessi dei file copiati nella cartella di sessione, che RetroArch (snap) legge e riscrive.
SESSION_MODE = 0o644
# Cartella dei salvataggi della cartella di sistema, sotto quella del profilo.
SYSTEM_DIR = 'system'
# Core che salvano nella cartella di sistema di RetroArch e non in quella di sessione:
# ``{core: (cartella relativa alla cartella di sistema, (nomi dei file))}``. pcsx2 (LRPS2) tiene lì le due
# memory card e, se mancano, all'avvio ne crea di nuove già formattate.
SYSTEM_SAVES = {
    'pcsx2': (os.path.join('pcsx2', 'memcards'), ('Mcd001.ps2', 'Mcd002.ps2')),
}


def game_key(system_id, game_id):
    """Nome della cartella di un gioco: SHA-1 di ``<system_id>/<game_id>``."""
    return hashlib.sha1(('%s/%s' % (system_id, game_id)).encode('utf-8')).hexdigest()


def content_basename(file_name):
    """Nome che RetroArch dà ai salvataggi: il file del gioco senza cartelle e senza estensione."""
    return os.path.splitext(os.path.basename(file_name))[0]


def sram_suffix(name, basename):
    """Parte del nome dopo ``<basename>.`` se il file è un salvataggio interno, altrimenti ``None``.

    Esclusi stati (``.state``, ``.stateN``, ``.state.auto``) e miniature (``.png``).
    """
    prefix = basename + '.'
    if not name.startswith(prefix):
        return None
    suffix = name[len(prefix):]
    if not suffix or suffix.startswith('state') or suffix.endswith('png'):
        return None
    return suffix


def auto_state(directory, basename):
    """Stato automatico lasciato da RetroArch nella cartella di sessione: ``(percorso, nome)`` oppure ``None``.

    Prima si cerca ``<basename>.state.auto``. Se manca e nella cartella c'è
    un solo stato automatico con un altro nome (per esempio un gioco dentro
    un archivio), si usa quello: la cartella si svuota a ogni avvio.
    """
    path = os.path.join(directory, basename + AUTO_SUFFIX)
    if os.path.isfile(path):
        return path, basename
    try:
        names = [name for name in os.listdir(directory) if name.endswith(AUTO_SUFFIX)]
    except OSError:
        return None
    if len(names) != 1:
        return None
    name = names[0]
    log.info('Stato automatico con un nome diverso dal gioco: %s', name)
    return os.path.join(directory, name), name[:-len(AUTO_SUFFIX)]


def clean_name(value):
    """Nome di uno slot: senza caratteri di controllo, spazi ridotti, al massimo ``NAME_MAX`` caratteri.

    Un nome vuoto diventa ``None``.
    """
    if not isinstance(value, str):
        return None
    text = ''.join(' ' if unicodedata.category(char).startswith('C') else char for char in value)
    text = ' '.join(text.split())[:NAME_MAX].rstrip()
    return text or None


def loadable(save_core, game_core):
    """Vero se uno stato creato con ``save_core`` si può caricare nel gioco.

    ``game_core`` è il core associato al gioco (stato ``ok`` o ``trial``),
    oppure ``None`` se non ce n'è ancora uno: in quel caso il caricamento si
    tenta comunque.
    """
    return game_core is None or save_core == game_core


def associated_core(association):
    """Core associato al gioco se è ``ok`` o ``trial``, altrimenti ``None`` (``cores_repo.game_core``)."""
    if association and association['status'] in ('ok', 'trial') and association['core']:
        return association['core']
    return None


def tree_files(root):
    """Percorsi relativi dei file normali sotto ``root``, in ordine (i collegamenti si ignorano)."""
    found = []
    for current, dirs, files in os.walk(root):
        dirs[:] = sorted(name for name in dirs if not os.path.islink(os.path.join(current, name)))
        for name in sorted(files):
            path = os.path.join(current, name)
            if os.path.isfile(path) and not os.path.islink(path):
                found.append(os.path.relpath(path, root))
    return found


def clear_dir(path):
    """Crea la cartella ``path`` se manca e ne cancella tutto il contenuto."""
    os.makedirs(path, exist_ok=True)
    for entry in os.scandir(path):
        if entry.is_dir(follow_symlinks=False):
            shutil.rmtree(entry.path)
        else:
            os.unlink(entry.path)


def system_save_names(core):
    """Nomi dei file che ``core`` salva nella cartella di sistema (``SYSTEM_SAVES``), oppure ``()``."""
    return SYSTEM_SAVES.get(core, (None, ()))[1]


def place_system_saves(source, core, system_dir):
    """Mette nella cartella di sistema i salvataggi di ``core`` conservati nella cartella ``source``.

    Un file che manca in ``source`` (o ``source`` ``None``) si toglie anche
    dalla cartella di sistema: il core ne crea uno nuovo. Restituisce i nomi
    copiati. Senza ``SYSTEM_SAVES`` per il core non fa niente.
    """
    if core not in SYSTEM_SAVES or not system_dir:
        return []
    folder, names = SYSTEM_SAVES[core]
    target = os.path.join(system_dir, folder)
    os.makedirs(target, exist_ok=True)
    copied = []
    for name in names:
        path = os.path.join(source, name) if source else None
        destination = os.path.join(target, name)
        if path and os.path.isfile(path) and not os.path.islink(path):
            atomic_copy(path, destination, SESSION_MODE)
            copied.append(name)
        elif os.path.lexists(destination):
            os.unlink(destination)
    return copied


def keep_system_saves(target, core, system_dir):
    """Conserva nella cartella ``target`` i salvataggi di ``core`` della cartella di sistema; restituisce i nomi."""
    if core not in SYSTEM_SAVES or not system_dir:
        return []
    folder, names = SYSTEM_SAVES[core]
    found = [name for name in names if os.path.isfile(os.path.join(system_dir, folder, name))
             and not os.path.islink(os.path.join(system_dir, folder, name))]
    if not found:
        return []
    os.makedirs(target, mode=0o700, exist_ok=True)
    for name in found:
        atomic_copy(os.path.join(system_dir, folder, name), os.path.join(target, name))
    return found


def restore_sram_files(source, dest_dir, basename):
    """Copia in ``dest_dir`` il salvataggio interno conservato nella cartella ``source``.

    I file diventano ``<basename>.<suffisso>``; le cartelle dei core
    tornano con il loro nome e il loro contenuto. Restituisce i percorsi
    copiati, relativi a ``dest_dir``.
    """
    if not os.path.isdir(source):
        return []
    copied = []
    for name in sorted(os.listdir(source)):
        path = os.path.join(source, name)
        if os.path.islink(path):
            continue
        if os.path.isfile(path):
            target = '%s.%s' % (basename, name)
            atomic_copy(path, os.path.join(dest_dir, target), SESSION_MODE)
            copied.append(target)
        elif os.path.isdir(path):
            for relative in tree_files(path):
                target = os.path.join(dest_dir, name, relative)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                atomic_copy(os.path.join(path, relative), target, SESSION_MODE)
                copied.append(os.path.join(name, relative))
    return copied


def shared_suffix(name):
    """Suffisso di un file di un salvataggio condiviso: l'estensione (``Tekken.srm`` → ``srm``), o tutto il nome."""
    return name.rsplit('.', 1)[1] if '.' in name.strip('.') else name


def restore_shared_files(source, dest_dir, basename, skip=()):
    """Copia in ``dest_dir`` i file del salvataggio condiviso nella cartella ``source``.

    Come ``restore_sram_files``, ma il nome dei file è libero: conta solo
    l'estensione (``salvataggio.srm`` diventa ``<basename>.srm``). I file e
    le cartelle di nome ``skip`` e quelli nascosti restano fuori.
    """
    if not os.path.isdir(source):
        return []
    copied = []
    for name in sorted(os.listdir(source)):
        path = os.path.join(source, name)
        if os.path.islink(path) or name in skip or name.startswith('.'):
            continue
        if os.path.isfile(path):
            target = '%s.%s' % (basename, shared_suffix(name))
            atomic_copy(path, os.path.join(dest_dir, target), SESSION_MODE)
            copied.append(target)
        elif os.path.isdir(path):
            for relative in tree_files(path):
                target = os.path.join(dest_dir, name, relative)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                atomic_copy(os.path.join(path, relative), target, SESSION_MODE)
                copied.append(os.path.join(name, relative))
    return copied


def keep_sram_files(target, src_dir, basename):
    """Conserva nella cartella ``target`` i file del salvataggio interno trovati in ``src_dir``.

    Si copiano i file ``<basename>.<suffisso>`` che non sono stati né
    miniature, e i file delle sottocartelle dei core (record, nvram…);
    quelli già conservati e non più presenti restano. Restituisce i
    suffissi e i percorsi relativi copiati.
    """
    if not os.path.isdir(src_dir):
        return []
    found = []
    for entry in sorted(os.scandir(src_dir), key=lambda item: item.name):
        if entry.is_dir(follow_symlinks=False):
            found.extend((os.path.join(entry.name, relative), os.path.join(entry.path, relative))
                         for relative in tree_files(entry.path))
            continue
        suffix = sram_suffix(entry.name, basename)
        if suffix is not None and entry.is_file(follow_symlinks=False):
            found.append((suffix, entry.path))
    if not found:
        return []
    os.makedirs(target, mode=0o700, exist_ok=True)
    for name, path in found:
        destination = os.path.join(target, name)
        os.makedirs(os.path.dirname(destination), mode=0o700, exist_ok=True)
        atomic_copy(path, destination)
    return [name for name, _ in found]


class SaveStore:
    """File dei salvataggi per profilo, gioco e slot, con i dati nel repository ``saves``.

    ``now`` (data ISO) è sostituibile nei test.
    """

    def __init__(self, data_dir, repo, now=now_iso):
        self.root = os.path.join(data_dir, 'saves')
        self.repo = repo
        self.now = now
        # Fornitore dei salvataggi condivisi (estensione ``shared-saves``), vedi la descrizione del modulo.
        self.shared = None

    def game_dir(self, owner, system_id, game_id):
        """Cartella di un gioco per ``owner`` (id del profilo, oppure ``None`` per gli ospiti)."""
        return os.path.join(self.root, GUESTS if owner is None else str(int(owner)), game_key(system_id, game_id))

    def slot_path(self, account_id, system_id, game_id, slot, ext):
        return os.path.join(self.game_dir(account_id, system_id, game_id), 'slot%d.%s' % (slot, ext))

    # --- Stati ---------------------------------------------------------------

    def store_state(self, account_id, system_id, game_id, slot, core, state_path, png_path=None, shared=None):
        """Copia lo stato (e la miniatura, se c'è) nello slot del profilo e lo registra.

        ``shared`` è il salvataggio condiviso della partita (``None`` se usava
        quello del profilo). Restituisce ``False`` se il profilo non esiste più: lo slot si ignora.
        ``ConflictError`` se lo slot è protetto.
        """
        self.check_unprotected(account_id, system_id, game_id, slot,
                               'Slot %d protetto: togli la protezione per sovrascriverlo.' % slot)
        state = self.slot_path(account_id, system_id, game_id, slot, 'state')
        thumb = self.slot_path(account_id, system_id, game_id, slot, 'png')
        os.makedirs(os.path.dirname(state), mode=0o700, exist_ok=True)
        atomic_copy(state_path, state)
        if png_path and png_complete(png_path):
            atomic_copy(png_path, thumb)
        elif os.path.exists(thumb):
            # Una miniatura vecchia non deve restare accanto a uno stato nuovo.
            os.unlink(thumb)
        if self.repo.upsert(account_id, system_id, game_id, slot, core, self.now(), shared):
            return True
        log.info('Profilo %s non più presente: slot %d di %s/%s ignorato.', account_id, slot, system_id, game_id)
        shutil.rmtree(os.path.dirname(state), ignore_errors=True)
        return False

    def check_unprotected(self, account_id, system_id, game_id, slot, message):
        """``ConflictError`` con ``message`` se lo slot esiste ed è protetto."""
        save = self.repo.get(account_id, system_id, game_id, slot)
        if save is not None and save['protected']:
            raise ConflictError(message)

    def existing(self, account_id, system_id, game_id, slot):
        """Riga dello slot con lo stato su disco; ``SaveError`` se manca."""
        save = self.repo.get(account_id, system_id, game_id, slot)
        if save is None or not os.path.isfile(self.slot_path(account_id, system_id, game_id, slot, 'state')):
            raise SaveError('Salvataggio non trovato.')
        return save

    @staticmethod
    def check_manual(slot):
        """Solo gli slot 1–9 si rinominano, si proteggono e si copiano (non il «Riprendi»)."""
        if slot not in MANUAL_SLOTS:
            raise SaveError('Operazione non disponibile per questo slot.')

    def rename(self, account_id, system_id, game_id, slot, name):
        """Dà allo slot il nome ``name`` (ripulito con ``clean_name``; vuoto lo toglie) e lo restituisce."""
        self.check_manual(slot)
        self.existing(account_id, system_id, game_id, slot)
        name = clean_name(name)
        self.repo.rename(account_id, system_id, game_id, slot, name)
        log.info('Slot %d di %s/%s del profilo %s rinominato.', slot, system_id, game_id, account_id)
        return name

    def set_protected(self, account_id, system_id, game_id, slot, protected):
        """Protegge lo slot (non si sovrascrive né si elimina) o toglie la protezione."""
        self.check_manual(slot)
        self.existing(account_id, system_id, game_id, slot)
        self.repo.set_protected(account_id, system_id, game_id, slot, bool(protected))
        log.info('Slot %d di %s/%s del profilo %s %s.', slot, system_id, game_id, account_id,
                 'protetto' if protected else 'senza protezione')

    def delete(self, account_id, system_id, game_id, slot):
        """Elimina lo slot (stato, miniatura e riga); ``ConflictError`` se è protetto."""
        save = self.repo.get(account_id, system_id, game_id, slot)
        if save is None:
            raise SaveError('Salvataggio non trovato.')
        if save['protected']:
            raise ConflictError('Slot %d protetto: togli la protezione per eliminarlo.' % slot)
        for ext in ('state', 'png'):
            try:
                os.unlink(self.slot_path(account_id, system_id, game_id, slot, ext))
            except FileNotFoundError:
                pass
        self.repo.delete(account_id, system_id, game_id, slot)
        log.info('Slot %d di %s/%s del profilo %s eliminato.', slot, system_id, game_id, account_id)

    def delete_game(self, account_id, system_id, game_id):
        """Elimina gli slot non protetti del gioco, «Riprendi» compreso; restituisce quanti ne restano.

        Il salvataggio interno del gioco resta.
        """
        remaining = 0
        for save in self.repo.list_for_game(account_id, system_id, game_id):
            if save['protected']:
                remaining += 1
            else:
                self.delete(account_id, system_id, game_id, save['slot'])
        return remaining

    def copy(self, from_account, to_account, system_id, game_id, from_slot, to_slot):
        """Copia stato, miniatura e core di uno slot in uno slot di un altro profilo.

        Nome e protezione non si copiano: la destinazione resta senza nome.
        ``ConflictError`` se la destinazione è protetta, ``SaveError`` se lo
        slot di partenza manca o se il profilo di destinazione non esiste.
        """
        self.check_manual(from_slot)
        self.check_manual(to_slot)
        save = self.existing(from_account, system_id, game_id, from_slot)
        self.check_unprotected(to_account, system_id, game_id, to_slot,
                               'Slot %d di destinazione protetto: non si può sovrascrivere.' % to_slot)
        thumb = self.slot_path(from_account, system_id, game_id, from_slot, 'png')
        state = self.slot_path(from_account, system_id, game_id, from_slot, 'state')
        if not self.store_state(to_account, system_id, game_id, to_slot, save['core'], state,
                                thumb if png_complete(thumb) else None, save.get('shared')):
            raise SaveError('Profilo di destinazione non trovato.')
        self.repo.rename(to_account, system_id, game_id, to_slot, None)
        log.info('Slot %d di %s/%s copiato dal profilo %s allo slot %d del profilo %s.', from_slot, system_id,
                 game_id, from_account, to_slot, to_account)

    def state_file(self, account_id, system_id, game_id, slot):
        """Percorso dello stato dello slot, oppure ``None`` se lo slot non c'è."""
        path = self.slot_path(account_id, system_id, game_id, slot, 'state')
        if self.repo.get(account_id, system_id, game_id, slot) is None or not os.path.isfile(path):
            return None
        return path

    def game_slots(self, account_id, system_id, game_id, game_core):
        """Slot del profilo per il gioco, con lo stato su disco, in ordine di numero.

        ``[{slot, core, name, protected, updatedAt, thumb, loadable, shared}]``;
        ``game_core`` è il core associato al gioco (vedi ``loadable``).
        ``shared`` è ``None`` oppure ``{id, title}`` del salvataggio condiviso
        da cui è nato lo slot (``title`` ``None`` se non c'è più).
        """
        result = []
        for save in self.repo.list_for_game(account_id, system_id, game_id):
            slot = save['slot']
            if not os.path.isfile(self.slot_path(account_id, system_id, game_id, slot, 'state')):
                continue
            result.append({
                'slot': slot,
                'core': save['core'],
                'name': save['name'],
                'protected': save['protected'],
                'updatedAt': save['updatedAt'],
                'thumb': png_complete(self.slot_path(account_id, system_id, game_id, slot, 'png')),
                'loadable': loadable(save['core'], game_core),
                'shared': self.shared_info(system_id, game_id, save.get('shared')),
            })
        return result

    def shared_info(self, system_id, game_id, name):
        """``{id, title}`` del salvataggio condiviso ``name`` (``title`` ``None`` se non c'è più), oppure ``None``."""
        if not name:
            return None
        title = None
        if self.shared is not None:
            try:
                title = self.shared.title(system_id, game_id, name)
            except Exception:
                log.exception('Titolo del salvataggio condiviso %s non letto', name)
        return {'id': name, 'title': title}

    def shared_folder(self, system_id, game_id, name):
        """Cartella del salvataggio condiviso ``name`` del gioco, oppure ``None`` se non c'è."""
        if not name or self.shared is None:
            return None
        try:
            return self.shared.folder(system_id, game_id, name)
        except Exception:
            log.exception('Salvataggio condiviso %s non trovato', name)
            return None

    def shared_list(self, system_id, game_id):
        """Salvataggi condivisi del gioco, ``[{id, title, description}]`` (vuota senza l'estensione)."""
        if self.shared is None:
            return []
        try:
            return list(self.shared.list(system_id, game_id))
        except Exception:
            log.exception('Salvataggi condivisi di %s/%s non letti', system_id, game_id)
            return []

    def copy_to_session(self, account_id, system_id, game_id, slot, dest_dir, basename, suffix=AUTO_SUFFIX):
        """Copia lo stato dello slot in ``dest_dir`` come ``<basename>.state.auto``.

        RetroArch lo carica all'avvio (``savestate_auto_load``). Con ``suffix``
        ``.state`` va invece nello slot di lavoro, da caricare con ``LOAD_STATE``.
        Restituisce il percorso copiato, oppure ``None`` se lo slot non c'è.
        """
        source = self.state_file(account_id, system_id, game_id, slot)
        if source is None:
            return None
        target = os.path.join(dest_dir, basename + suffix)
        atomic_copy(source, target, SESSION_MODE)
        return target

    def thumb_file(self, account_id, system_id, game_id, slot):
        """Percorso della miniatura dello slot, oppure ``None`` se manca."""
        path = self.slot_path(account_id, system_id, game_id, slot, 'png')
        if self.repo.get(account_id, system_id, game_id, slot) is None or not png_complete(path):
            return None
        return path

    # --- Salvataggio interno -------------------------------------------------

    def sram_dir(self, owner, system_id, game_id):
        return os.path.join(self.game_dir(owner, system_id, game_id), SRAM_DIR)

    def restore_sram(self, owner, system_id, game_id, dest_dir, basename):
        """Copia il salvataggio interno di ``owner`` in ``dest_dir`` (vedi ``restore_sram_files``)."""
        return restore_sram_files(self.sram_dir(owner, system_id, game_id), dest_dir, basename)

    def keep_sram(self, owner, system_id, game_id, src_dir, basename):
        """Conserva per ``owner`` il salvataggio interno trovato in ``src_dir`` (vedi ``keep_sram_files``)."""
        return keep_sram_files(self.sram_dir(owner, system_id, game_id), src_dir, basename)

    # --- Salvataggi nella cartella di sistema (``SYSTEM_SAVES``) ---------------

    def system_saves_dir(self, owner, core):
        """Cartella dei salvataggi di sistema di ``core`` per ``owner`` (``None`` = ospiti)."""
        return os.path.join(self.root, GUESTS if owner is None else str(int(owner)), SYSTEM_DIR, core)

    def restore_system(self, owner, core, system_dir):
        """Mette nella cartella di sistema i salvataggi di ``core`` di ``owner`` (vedi ``place_system_saves``)."""
        return place_system_saves(self.system_saves_dir(owner, core), core, system_dir)

    def keep_system(self, owner, core, system_dir):
        """Conserva per ``owner`` i salvataggi di ``core`` della cartella di sistema (vedi ``keep_system_saves``)."""
        return keep_system_saves(self.system_saves_dir(owner, core), core, system_dir)


class MemorySavesRepository:
    """Repository degli slot in memoria, come ``SavesRepository``, per gli slot temporanei di un incontro di torneo.

    Gli slot non sono dei profili e spariscono con l'oggetto; ``upsert`` non controlla i profili.
    """

    def __init__(self):
        self.rows = {}

    def upsert(self, account_id, system_id, game_id, slot, core, at, shared=None):
        key = (account_id, system_id, game_id, slot)
        current = self.rows.get(key)
        if current is None:
            self.rows[key] = {'account': account_id, 'system': system_id, 'game': game_id, 'slot': slot,
                              'core': core, 'name': None, 'protected': False, 'createdAt': at, 'updatedAt': at,
                              'shared': shared}
        else:
            current.update(core=core, updatedAt=at, shared=shared)
        return True

    def get(self, account_id, system_id, game_id, slot):
        row = self.rows.get((account_id, system_id, game_id, slot))
        return dict(row) if row is not None else None

    def list_for_game(self, account_id, system_id, game_id):
        return [dict(row) for key, row in sorted(self.rows.items(), key=lambda item: item[0][3])
                if key[:3] == (account_id, system_id, game_id)]

    def rename(self, account_id, system_id, game_id, slot, name):
        row = self.rows.get((account_id, system_id, game_id, slot))
        if row is not None:
            row['name'] = name
        return row is not None

    def set_protected(self, account_id, system_id, game_id, slot, protected):
        row = self.rows.get((account_id, system_id, game_id, slot))
        if row is not None:
            row['protected'] = bool(protected)
        return row is not None

    def delete(self, account_id, system_id, game_id, slot):
        return self.rows.pop((account_id, system_id, game_id, slot), None) is not None
