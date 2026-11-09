"""Repository della configurazione dei giochi per console e per gioco (tabella ``game_config``)."""
import json

# ``game_id`` delle righe di console.
CONSOLE = ''


def load_custom(text):
    """Personalizzata salvata, oppure ``None`` se manca o non si legge."""
    try:
        value = json.loads(text) if text else None
    except ValueError:
        return None
    if not isinstance(value, dict) or not isinstance(value.get('base'), str):
        return None
    retroarch = value.get('retroarch') if isinstance(value.get('retroarch'), dict) else {}
    cores = value.get('cores') if isinstance(value.get('cores'), dict) else {}
    return {'base': value['base'], 'retroarch': dict(retroarch),
            'cores': {core: dict(values) for core, values in cores.items() if isinstance(values, dict)}}


def load_options(text):
    """Opzioni scelte ``{retroarch, cores}`` (più ``dashboard``, se ce ne sono), vuote se non si leggono."""
    try:
        value = json.loads(text or '{}')
    except ValueError:
        value = {}
    if not isinstance(value, dict):
        value = {}
    retroarch = value.get('retroarch') if isinstance(value.get('retroarch'), dict) else {}
    cores = value.get('cores') if isinstance(value.get('cores'), dict) else {}
    result = {'retroarch': dict(retroarch),
              'cores': {core: dict(values) for core, values in cores.items() if isinstance(values, dict)}}
    if isinstance(value.get('dashboard'), dict) and value['dashboard']:
        result['dashboard'] = dict(value['dashboard'])
    return result


def empty(options):
    return not options['retroarch'] and not any(options['cores'].values()) and not options.get('dashboard')


class GameConfigRepository:
    """Livello della Grafica, Personalizzata e opzioni scelte di console e giochi."""

    def __init__(self, db):
        self.db = db

    def get(self, system_id, game_id):
        """``{mode, custom, options}`` della riga, oppure ``None`` se non c'è."""
        rows = self.db.query('SELECT mode, custom, options FROM game_config WHERE system_id = ? AND game_id = ?',
                             (system_id, game_id))
        if not rows:
            return None
        mode, custom, options = rows[0]
        return {'mode': mode, 'custom': load_custom(custom), 'options': load_options(options)}

    def save(self, conn, system_id, game_id, mode, custom, options, at):
        """Scrive la riga; una riga di gioco senza scelte si cancella."""
        if game_id != CONSOLE and mode is None and custom is None and empty(options):
            conn.execute('DELETE FROM game_config WHERE system_id = ? AND game_id = ?', (system_id, game_id))
            return
        conn.execute(
            'INSERT INTO game_config (system_id, game_id, mode, custom, options, updated_at) VALUES (?, ?, ?, ?, ?, ?) '
            'ON CONFLICT (system_id, game_id) DO UPDATE SET mode = excluded.mode, custom = excluded.custom, '
            'options = excluded.options, updated_at = excluded.updated_at',
            (system_id, game_id, mode, json.dumps(custom, sort_keys=True) if custom is not None else None,
             json.dumps(options, sort_keys=True), at))

    def set_graphics(self, system_id, game_id, mode, custom, at):
        """Salva livello e Personalizzata (``None`` la cancella); le altre opzioni restano."""
        with self.db.transaction() as conn:
            row = self.get(system_id, game_id)
            options = row['options'] if row else load_options(None)
            self.save(conn, system_id, game_id, mode, custom, options, at)

    def set_options(self, system_id, game_id, options, at):
        """Salva le opzioni scelte ``{retroarch, cores}``; livello e Personalizzata restano."""
        with self.db.transaction() as conn:
            row = self.get(system_id, game_id)
            mode, custom = (row['mode'], row['custom']) if row else (None, None)
            self.save(conn, system_id, game_id, mode, custom, load_options(json.dumps(options)), at)
