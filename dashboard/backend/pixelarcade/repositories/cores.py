"""Repository dei core: lista per console, elenco del buildbot, core scaricati, core per gioco e tentativi."""
import datetime
import json

# Riga interna di ``settings``: non fa parte delle impostazioni modificabili.
INDEX_FETCHED_AT = 'cores.index_fetched_at'

MAX_LOG_TAIL = 4000


def now_iso():
    """Data e ora attuali (UTC) in formato ISO, al secondo."""
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')


class CoresRepository:
    """Legge e scrive estensioni e lista dei core di ogni console, più l'elenco dei core scaricabili."""

    def __init__(self, db):
        self.db = db

    def system_settings(self):
        """Restituisce ``{system_id: {'extensions': testo, 'cores': [core, …] | None}}``.

        ``cores`` è ``None`` se la lista non è mai stata salvata (lista
        predefinita); altrimenti i nomi brevi in ordine alfabetico.
        """
        result = {}
        for system_id, extensions, cores_set in self.db.query(
                'SELECT id, extensions, cores_set FROM systems ORDER BY id'):
            result[system_id] = {'extensions': extensions, 'cores': [] if cores_set else None}
        for system_id, core in self.db.query('SELECT system_id, core FROM system_cores ORDER BY system_id, core'):
            if result[system_id]['cores'] is not None:
                result[system_id]['cores'].append(core)
        return result

    def replace_system(self, system_id, extensions, cores):
        """Salva estensioni e lista dei core di una console, sostituendo quella precedente.

        ``cores = None`` torna alla lista predefinita. I doppioni vengono
        ignorati. La scrittura avviene in una transazione: se fallisce a
        metà, resta la lista precedente.
        """
        unique = None if cores is None else list(dict.fromkeys(cores))
        with self.db.transaction() as conn:
            conn.execute(
                'INSERT INTO systems (id, extensions, cores_set) VALUES (?, ?, ?) '
                'ON CONFLICT (id) DO UPDATE SET extensions = excluded.extensions, cores_set = excluded.cores_set',
                (system_id, extensions, 0 if unique is None else 1),
            )
            conn.execute('DELETE FROM system_cores WHERE system_id = ?', (system_id,))
            for core in unique or []:
                conn.execute('INSERT INTO system_cores (system_id, core) VALUES (?, ?)', (system_id, core))

    def delete_system(self, system_id):
        """Cancella la console e, a cascata, la sua lista di core."""
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM systems WHERE id = ?', (system_id,))

    def buildbot_index(self):
        """Core scaricabili: ``{core: {'crc': …, 'date': …}}``."""
        return {core: {'crc': crc, 'date': date}
                for core, crc, date in self.db.query('SELECT core, crc, date FROM buildbot_cores')}

    def index_fetched_at(self):
        """Data (ISO) dell'ultimo elenco scaricato, oppure ``None``."""
        rows = self.db.query('SELECT value FROM settings WHERE key = ?', (INDEX_FETCHED_AT,))
        return json.loads(rows[0][0]) if rows else None

    def replace_buildbot_index(self, entries, fetched_at):
        """Sostituisce l'elenco dei core scaricabili e la sua data, in una transazione."""
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM buildbot_cores')
            for core in sorted(entries):
                entry = entries[core]
                conn.execute('INSERT INTO buildbot_cores (core, crc, date) VALUES (?, ?, ?)',
                             (core, entry['crc'], entry['date']))
            conn.execute(
                'INSERT INTO settings (key, value) VALUES (?, ?) '
                'ON CONFLICT (key) DO UPDATE SET value = excluded.value',
                (INDEX_FETCHED_AT, json.dumps(fetched_at)),
            )

    def add_downloaded(self, core, size, at=None):
        """Registra un core scaricato dalla dashboard (sostituisce una registrazione precedente)."""
        with self.db.transaction() as conn:
            conn.execute(
                'INSERT INTO downloaded_cores (core, size, downloaded_at) VALUES (?, ?, ?) '
                'ON CONFLICT (core) DO UPDATE SET size = excluded.size, downloaded_at = excluded.downloaded_at',
                (core, size, at or now_iso()),
            )

    def downloaded(self):
        """Core scaricati dalla dashboard: ``{core: size}``."""
        return {core: size for core, size in self.db.query('SELECT core, size FROM downloaded_cores ORDER BY core')}

    def remove_downloaded(self, core):
        """Toglie un core dall'elenco dei core scaricati."""
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM downloaded_cores WHERE core = ?', (core,))

    def unused_downloaded(self):
        """Core scaricati che nessun gioco usa con stato ``ok`` o ``trial``: ``{core: size}``."""
        rows = self.db.query(
            'SELECT core, size FROM downloaded_cores WHERE core NOT IN '
            "(SELECT core FROM game_cores WHERE core IS NOT NULL AND status IN ('ok', 'trial')) ORDER BY core")
        return {core: size for core, size in rows}

    def game_core(self, system_id, game_id):
        """Associazione di un gioco: ``{core, status, confirmedBy}`` oppure ``None``."""
        rows = self.db.query('SELECT core, status, confirmed_by FROM game_cores WHERE system_id = ? AND game_id = ?',
                             (system_id, game_id))
        if not rows:
            return None
        core, status, confirmed_by = rows[0]
        return {'core': core, 'status': status, 'confirmedBy': confirmed_by}

    def set_game_core(self, system_id, game_id, core, status, confirmed_by=None, at=None):
        """Salva l'associazione gioco-core, sostituendo quella precedente."""
        with self.db.transaction() as conn:
            conn.execute(
                'INSERT INTO game_cores (system_id, game_id, core, status, confirmed_by, updated_at) '
                'VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (system_id, game_id) DO UPDATE SET core = excluded.core, '
                'status = excluded.status, confirmed_by = excluded.confirmed_by, updated_at = excluded.updated_at',
                (system_id, game_id, core, status, confirmed_by, at or now_iso()),
            )

    def reset_game_core(self, system_id, game_id):
        """Cancella l'associazione del gioco (i tentativi restano)."""
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM game_cores WHERE system_id = ? AND game_id = ?', (system_id, game_id))

    def game_cores_for(self, system_id):
        """Associazioni dei giochi di una console: ``{game_id: (core, status)}``."""
        rows = self.db.query('SELECT game_id, core, status FROM game_cores WHERE system_id = ?', (system_id,))
        return {game_id: (core, status) for game_id, core, status in rows}

    def add_attempt(self, system_id, game_id, core, result, reason=None, log_tail='', at=None):
        """Registra un core provato; del log si tengono gli ultimi 4000 caratteri."""
        with self.db.transaction() as conn:
            conn.execute(
                'INSERT INTO core_attempts (system_id, game_id, core, result, reason, log_tail, at) '
                'VALUES (?, ?, ?, ?, ?, ?, ?)',
                (system_id, game_id, core, result, reason, (log_tail or '')[-MAX_LOG_TAIL:], at or now_iso()),
            )

    def attempts(self, system_id, game_id):
        """Tentativi del gioco in ordine di registrazione: ``[{core, result, reason}]``."""
        rows = self.db.query('SELECT core, result, reason FROM core_attempts WHERE system_id = ? AND game_id = ? '
                             'ORDER BY id', (system_id, game_id))
        return [{'core': core, 'result': result, 'reason': reason} for core, result, reason in rows]

    def tried_cores(self, system_id, game_id):
        """Core già scartati per il gioco: almeno un tentativo fallito con motivo diverso da ``stopped``.

        Una ricerca interrotta dall'utente non giudica il core in prova.
        """
        rows = self.db.query(
            "SELECT DISTINCT core FROM core_attempts WHERE system_id = ? AND game_id = ? AND result = 'failed' "
            "AND (reason IS NULL OR reason != 'stopped')", (system_id, game_id))
        return {row[0] for row in rows}

    def clear_attempts(self, system_id, game_id):
        """Azzera i tentativi del gioco («Riprova la ricerca», «Ricerca automatica al prossimo avvio»)."""
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM core_attempts WHERE system_id = ? AND game_id = ?', (system_id, game_id))
