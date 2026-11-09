"""Console nella riga delle schede (API.md, «Console della riga»).

Le Impostazioni decidono quali console sono accese per tutti. Ogni profilo
accende o spegne le console della propria riga: la scelta resta salvata
così com'è, anche se poi cambiano le Impostazioni. Le console che il
profilo non ha mai toccato seguono le Impostazioni. Gli id restano anche se
la console sparisce dalla libreria, perché la scelta valga di nuovo quando
ritorna.
"""
from .errors import ConfigError, ProfileError
from .profiles import SYSTEM_MAX, valid_id

# Massimo di console spente per tutti in una richiesta.
OFF_MAX = 500


def check_system_id(value):
    """``value`` se è un id di console valido; altrimenti ``ConfigError``."""
    if not isinstance(value, str) or not value or len(value) > SYSTEM_MAX or '\0' in value:
        raise ConfigError('Console non valida.')
    return value


class ConsoleRowService:
    """Console spente per tutti e scelte dei profili nel formato dell'API.

    ``profiles_repo`` (ProfilesRepository) serve a controllare che il profilo esista.
    """

    def __init__(self, repo, profiles_repo):
        self.repo = repo
        self.profiles_repo = profiles_repo

    def data(self):
        """``{off: [id], profiles: {"<account>": {add: [id], remove: [id]}}}``."""
        profiles = {}
        for account_id, system_id, shown in self.repo.choices():
            entry = profiles.setdefault(str(account_id), {'add': [], 'remove': []})
            entry['add' if shown else 'remove'].append(system_id)
        return {'off': self.repo.off(), 'profiles': profiles}

    def set_off(self, off):
        """Sostituisce le console spente per tutti (lista di id) e restituisce ``data()``.

        Le scelte dei profili restano e continuano a valere per loro.
        """
        if not isinstance(off, list) or len(off) > OFF_MAX:
            raise ConfigError('Elenco delle console non valido.')
        self.repo.set_off([check_system_id(value) for value in off])
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
