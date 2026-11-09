import os
import tempfile
import unittest

from pixelarcade.consoles import ConsoleRowService
from pixelarcade.db import Database
from pixelarcade.errors import ConfigError, ProfileError
from pixelarcade.repositories.consoles import ConsolesRepository
from pixelarcade.repositories.profiles import ProfilesRepository

NOW = '2026-11-09T10:00:00+00:00'


class ConsoleRowServiceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        self.profiles = ProfilesRepository(self.db)
        self.sara = self.profiles.create('SARA', '#3ccfc4', NOW)
        self.luca = self.profiles.create('LUCA', '#f5c542', NOW)
        self.service = ConsoleRowService(ConsolesRepository(self.db), self.profiles)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def test_vuoto(self):
        self.assertEqual(self.service.data(), {'off': [], 'profiles': {}})

    def test_spente_per_tutti(self):
        self.assertEqual(self.service.set_off(['snes', 'nes', 'snes'])['off'], ['nes', 'snes'])
        self.assertEqual(self.service.set_off([])['off'], [])
        for value in (None, 'nes', [3], [''], ['x' * 65], ['a\0b']):
            with self.assertRaises(ConfigError):
                self.service.set_off(value)

    def test_scelte_del_profilo(self):
        self.service.set_off(['snes'])
        self.service.set_row(self.sara, 'snes', True)
        data = self.service.set_row(self.sara, 'nes', False)
        self.assertEqual(data['profiles'], {str(self.sara): {'add': ['snes'], 'remove': ['nes']}})
        # Ripetere la stessa scelta non cambia niente.
        self.assertEqual(self.service.set_row(self.sara, 'nes', False), data)

    def test_le_scelte_restano_se_cambiano_le_impostazioni(self):
        # LUCA accende GB, che è già accesa: la scelta resta anche quando le Impostazioni la spengono.
        self.service.set_row(self.luca, 'gb', True)
        data = self.service.set_off(['gb'])
        self.assertEqual(data['profiles'], {str(self.luca): {'add': ['gb'], 'remove': []}})
        # E resta anche se torna uguale alle Impostazioni.
        self.service.set_off([])
        data = self.service.set_row(self.luca, 'gb', False)
        self.assertEqual(data['profiles'], {str(self.luca): {'add': [], 'remove': ['gb']}})

    def test_profilo_eliminato(self):
        # Nel database le scelte se ne vanno col profilo (ON DELETE CASCADE).
        self.service.set_row(self.sara, 'nes', False)
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM accounts WHERE id = ?', (self.sara,))
        self.assertEqual(self.service.data()['profiles'], {})

    def test_valori_non_validi(self):
        for account in (None, True, '1', 999):
            with self.assertRaises(ProfileError):
                self.service.set_row(account, 'nes', True)
        for system in (None, '', 3, 'x' * 65):
            with self.assertRaises(ConfigError):
                self.service.set_row(self.sara, system, True)
        for on in (None, 1, 'true'):
            with self.assertRaises(ConfigError):
                self.service.set_row(self.sara, 'nes', on)


if __name__ == '__main__':
    unittest.main()
