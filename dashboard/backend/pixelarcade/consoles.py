"""Console nella riga delle schede (API.md, «Console della riga»).

Le Impostazioni decidono quali console sono accese per tutti; una console
che le Impostazioni non hanno mai toccato è accesa se ha giochi (lo decide
l'interfaccia, che conosce il numero di giochi). Ogni profilo
accende o spegne le console della propria riga: la scelta resta salvata
così com'è, anche se poi cambiano le Impostazioni. Le console che il
profilo non ha mai toccato seguono le Impostazioni. Gli id restano anche se
la console sparisce dalla libreria, perché la scelta valga di nuovo quando
ritorna.
"""
from .errors import ConfigError, ProfileError
from .profiles import SYSTEM_MAX, valid_id

# Massimo di console accese e spente per tutti in una richiesta.
SETTINGS_MAX = 500


def check_system_id(value):
    """``value`` se è un id di console valido; altrimenti ``ConfigError``."""
    if not isinstance(value, str) or not value or len(value) > SYSTEM_MAX or '\0' in value:
        raise ConfigError('Console non valida.')
    return value


class ConsoleRowService:
    """Stato delle console nelle Impostazioni e scelte dei profili nel formato dell'API.

    ``profiles_repo`` (ProfilesRepository) serve a controllare che il profilo esista.
    """

    def __init__(self, repo, profiles_repo):
        self.repo = repo
        self.profiles_repo = profiles_repo

    def data(self):
        """``{on: [id], off: [id], profiles: {"<account>": {add: [id], remove: [id]}}}``."""
        profiles = {}
        for account_id, system_id, shown in self.repo.choices():
            entry = profiles.setdefault(str(account_id), {'add': [], 'remove': []})
            entry['add' if shown else 'remove'].append(system_id)
        on, off = self.repo.settings()
        return {'on': on, 'off': off, 'profiles': profiles}

    def set_settings(self, on, off):
        """Sostituisce le console accese e spente per tutti (liste di id) e restituisce ``data()``.

        Le console in nessuna delle due liste tornano al predefinito. Le
        scelte dei profili restano e continuano a valere per loro.
        """
        for values in (on, off):
            if not isinstance(values, list) or len(values) > SETTINGS_MAX:
                raise ConfigError('Elenco delle console non valido.')
        on = [check_system_id(value) for value in on]
        off = [check_system_id(value) for value in off]
        if set(on) & set(off):
            raise ConfigError('Una console non può essere accesa e spenta insieme.')
        self.repo.set_settings(on, off)
        return self.data()

    def set_row(self, account_id, system_id, on):
        """Accende (``on`` vero) o spegne ``system_id`` nella riga del profilo e restituisce ``data()``.

        La scelta resta salvata anche quando coincide con le Impostazioni.
        """
        if not valid_id(account_id) or self.profiles_repo.get(account_id) is None:
            raise ProfileError('Profilo non trovato.')
        check_system_id(system_id)
        if not isinstance(on, bool):
            raise ConfigError('Indica se accendere o spegnere la console.')
        self.repo.set_choice(account_id, system_id, on)
        return self.data()
