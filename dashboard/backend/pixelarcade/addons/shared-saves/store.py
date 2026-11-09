"""Cartella dei salvataggi condivisi: lettura, aggiunta, modifica ed eliminazione.

Struttura su disco (README «Salvataggi condivisi»)::

    <cartella>/<console>/<id del gioco>/<nome>/info.json    titolo e descrizione (facoltativo)
    <cartella>/<console>/<id del gioco>/<nome>/<file>       file del salvataggio interno

``<id del gioco>`` è il percorso del file del gioco dentro ``games/<console>/``
(per esempio ``Tekken 5 (USA).iso``). Dei file conta solo l'estensione:
``salvataggio.srm`` diventa ``<gioco>.srm`` nella cartella di sessione. Le
memory card PS2 si chiamano ``Mcd001.ps2`` (e ``Mcd002.ps2``). Le
sottocartelle si copiano così come sono.
"""
import json
import logging
import os
import shutil
import unicodedata

from pixelarcade.fsutil import atomic_copy

log = logging.getLogger(__name__)

INFO = 'info.json'
TITLE_MAX = 40
DESCRIPTION_MAX = 300
NAME_MAX = 60
# Caratteri che non vanno nel nome di una cartella.
UNSAFE = '/\\:*?"<>|'


class StoreError(Exception):
    """Errore con un messaggio in italiano per l'utente."""


def clean_text(value, limit):
    """Testo senza caratteri di controllo né spazi doppi, al massimo ``limit`` caratteri (vuoto se non è testo)."""
    if not isinstance(value, str):
        return ''
    text = ''.join(' ' if unicodedata.category(char).startswith('C') else char for char in value)
    return ' '.join(text.split())[:limit].rstrip()


def folder_name(title):
    """Nome di cartella sicuro ricavato dal titolo (``Salvataggio`` se non resta niente)."""
    text = ''.join('-' if char in UNSAFE else char for char in clean_text(title, NAME_MAX))
    text = text.strip(' .-')
    return text or 'Salvataggio'


def safe_part(value):
    """Vero se ``value`` è un nome valido dentro la cartella: niente percorsi, niente nomi nascosti."""
    return (isinstance(value, str) and value and value == value.strip() and not value.startswith('.')
            and '/' not in value and '\\' not in value and '\0' not in value)


def safe_game(game_id):
    """Vero se l'id del gioco è un percorso relativo senza ``..`` né parti nascoste."""
    if not isinstance(game_id, str) or not game_id or game_id.startswith('/') or '\0' in game_id:
        return False
    return all(safe_part(part) for part in game_id.split('/'))


def read_info(path):
    """``{title, description}`` di ``info.json``, con i valori vuoti se manca o non si legge."""
    try:
        with open(os.path.join(path, INFO), encoding='utf-8') as stream:
            data = json.load(stream)
    except FileNotFoundError:
        data = {}
    except (OSError, ValueError) as error:
        log.warning('%s non leggibile: %s', os.path.join(path, INFO), error)
        data = {}
    if not isinstance(data, dict):
        data = {}
    return {'title': clean_text(data.get('title'), TITLE_MAX),
            'description': clean_text(data.get('description'), DESCRIPTION_MAX)}


def write_info(path, title, description):
    data = json.dumps({'title': title, 'description': description}, ensure_ascii=False, indent=2) + '\n'
    temp = os.path.join(path, '.' + INFO + '.tmp')
    with open(temp, 'w', encoding='utf-8') as stream:
        stream.write(data)
    os.replace(temp, os.path.join(path, INFO))


def save_files(path):
    """File e cartelle del salvataggio (senza ``info.json`` e senza i nascosti), in ordine."""
    try:
        names = os.listdir(path)
    except OSError:
        return []
    return sorted(name for name in names if name != INFO and not name.startswith('.')
                  and not os.path.islink(os.path.join(path, name)))


class SharedStore:
    """Salvataggi condivisi sotto la cartella ``root()`` (funzione: la cartella si cambia dalle Impostazioni)."""

    def __init__(self, root):
        self.root = root

    def game_dir(self, system_id, game_id):
        if not safe_part(system_id) or not safe_game(game_id):
            raise StoreError('Gioco non valido.')
        return os.path.join(self.root(), system_id, *game_id.split('/'))

    def save_dir(self, system_id, game_id, name):
        if not safe_part(name):
            raise StoreError('Salvataggio non valido.')
        return os.path.join(self.game_dir(system_id, game_id), name)

    # --- Fornitore per ``SaveStore.shared`` ----------------------------------

    def folder(self, system_id, game_id, name):
        """Cartella del salvataggio ``name``, oppure ``None`` se non c'è o è vuota."""
        try:
            path = self.save_dir(system_id, game_id, name)
        except StoreError:
            return None
        if os.path.islink(path) or not os.path.isdir(path) or not save_files(path):
            return None
        return path

    def title(self, system_id, game_id, name):
        """Titolo del salvataggio ``name`` (il nome della cartella se ``info.json`` non lo dà), oppure ``None``."""
        path = self.folder(system_id, game_id, name)
        if path is None:
            return None
        return read_info(path)['title'] or name

    def list(self, system_id, game_id):
        """Salvataggi del gioco con almeno un file, ``[{id, title, description, files}]`` in ordine di titolo."""
        try:
            base = self.game_dir(system_id, game_id)
        except StoreError:
            return []
        try:
            entries = sorted(os.scandir(base), key=lambda entry: entry.name)
        except OSError:
            return []
        result = []
        for entry in entries:
            if entry.name.startswith('.') or not entry.is_dir(follow_symlinks=False):
                continue
            files = save_files(entry.path)
            if not files:
                continue
            info = read_info(entry.path)
            result.append({'id': entry.name, 'title': info['title'] or entry.name,
                           'description': info['description'], 'files': files})
        result.sort(key=lambda item: (item['title'].casefold(), item['id']))
        return result

    # --- Modifiche -----------------------------------------------------------

    def unique_name(self, system_id, game_id, title):
        base = folder_name(title)
        name = base
        number = 2
        while os.path.lexists(self.save_dir(system_id, game_id, name)):
            name = '%s (%d)' % (base, number)
            number += 1
        return name

    def create(self, system_id, game_id, title, description, files):
        """Nuovo salvataggio con i file ``files`` (``{nome nella cartella: percorso da copiare}``); restituisce il nome."""
        title = clean_text(title, TITLE_MAX)
        if not title:
            raise StoreError('Scrivi il titolo del salvataggio.')
        if not files:
            raise StoreError('Nessun file da salvare.')
        name = self.unique_name(system_id, game_id, title)
        path = self.save_dir(system_id, game_id, name)
        os.makedirs(path)
        try:
            for target, source in files.items():
                if not safe_part(target) or target == INFO:
                    raise StoreError('Nome di file non valido.')
                atomic_copy(source, os.path.join(path, target))
            write_info(path, title, clean_text(description, DESCRIPTION_MAX))
        except BaseException:
            shutil.rmtree(path, ignore_errors=True)
            raise
        log.info('Salvataggio condiviso %s di %s/%s aggiunto.', name, system_id, game_id)
        return name

    def update(self, system_id, game_id, name, title, description):
        """Cambia titolo e descrizione (il nome della cartella resta, così gli slot nati da qui lo ritrovano)."""
        path = self.folder(system_id, game_id, name)
        if path is None:
            raise StoreError('Salvataggio condiviso non trovato.')
        title = clean_text(title, TITLE_MAX)
        if not title:
            raise StoreError('Scrivi il titolo del salvataggio.')
        write_info(path, title, clean_text(description, DESCRIPTION_MAX))

    def delete(self, system_id, game_id, name):
        """Elimina la cartella del salvataggio e, se resta vuota, quella del gioco."""
        path = self.save_dir(system_id, game_id, name)
        if os.path.islink(path) or not os.path.isdir(path):
            raise StoreError('Salvataggio condiviso non trovato.')
        shutil.rmtree(path)
        game_dir = self.game_dir(system_id, game_id)
        root = os.path.join(self.root(), system_id)
        while game_dir != root and os.path.commonpath([root, game_dir]) == root:
            try:
                os.rmdir(game_dir)
            except OSError:
                break
            game_dir = os.path.dirname(game_dir)
        log.info('Salvataggio condiviso %s di %s/%s eliminato.', name, system_id, game_id)
