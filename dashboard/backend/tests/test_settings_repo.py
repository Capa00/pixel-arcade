import os
import tempfile
import unittest

from pixelarcade.db import Database
from pixelarcade.repositories.settings import SettingsRepository


class SettingsRepositoryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        self.repo = SettingsRepository(self.db)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def test_vuoto(self):
        self.assertEqual(self.repo.get_all(), {})

    def test_salva_e_rilegge_valori_json(self):
        values = {
            'paths.roms': 'games',
            'probe.window_seconds': 10,
            'buttons': {'a': 0, 'b': 1},
        }
        self.repo.set_many(values)
        self.assertEqual(self.repo.get_all(), values)

    def test_upsert(self):
        self.repo.set_many({'paths.roms': 'games', 'paths.cores': '~/cores'})
        self.repo.set_many({'paths.roms': 'altri'})
        self.assertEqual(self.repo.get_all(), {'paths.roms': 'altri', 'paths.cores': '~/cores'})

    def test_errore_annulla_tutto(self):
        with self.assertRaises(TypeError):
            self.repo.set_many({'a': 1, 'b': object()})
        self.assertEqual(self.repo.get_all(), {})


if __name__ == '__main__':
    unittest.main()
