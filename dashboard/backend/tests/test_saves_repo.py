import os
import sqlite3
import tempfile
import unittest

from pixelarcade.db import Database
from pixelarcade.repositories.profiles import ProfilesRepository
from pixelarcade.repositories.saves import SavesRepository

AT = '2026-10-01T10:00:00+00:00'
LATER = '2026-10-01T11:00:00+00:00'


class SavesRepositoryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        self.repo = SavesRepository(self.db)
        profiles = ProfilesRepository(self.db)
        self.luca = profiles.create('LUCA', '#ff5d73', AT)
        self.sara = profiles.create('SARA', '#3ccfc4', AT)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def test_upsert_crea_e_aggiorna(self):
        self.assertTrue(self.repo.upsert(self.luca, 'snes', 'zelda/zelda.sfc', 0, 'bsnes', AT))
        self.assertEqual(self.repo.get(self.luca, 'snes', 'zelda/zelda.sfc', 0), {
            'account': self.luca, 'system': 'snes', 'game': 'zelda/zelda.sfc', 'slot': 0, 'core': 'bsnes',
            'name': None, 'protected': False, 'createdAt': AT, 'updatedAt': AT, 'shared': None,
        })
        self.assertTrue(self.repo.upsert(self.luca, 'snes', 'zelda/zelda.sfc', 0, 'snes9x', LATER, 'Tutto'))
        save = self.repo.get(self.luca, 'snes', 'zelda/zelda.sfc', 0)
        self.assertEqual((save['core'], save['createdAt'], save['updatedAt'], save['shared']),
                         ('snes9x', AT, LATER, 'Tutto'))
        # Una partita senza salvataggio condiviso lo toglie.
        self.repo.upsert(self.luca, 'snes', 'zelda/zelda.sfc', 0, 'snes9x', LATER)
        self.assertIsNone(self.repo.get(self.luca, 'snes', 'zelda/zelda.sfc', 0)['shared'])
        self.assertIsNone(self.repo.get(self.sara, 'snes', 'zelda/zelda.sfc', 0))

    def test_profilo_inesistente_ignorato(self):
        self.assertFalse(self.repo.upsert(999, 'nes', 'mario.nes', 0, 'fceumm', AT))
        self.assertEqual(self.db.query('SELECT COUNT(*) FROM saves'), [(0,)])

    def test_slot_fuori_intervallo(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.repo.upsert(self.luca, 'nes', 'mario.nes', 10, 'fceumm', AT)

    def test_elenchi_e_eliminazione(self):
        self.repo.upsert(self.luca, 'nes', 'mario.nes', 3, 'fceumm', AT)
        self.repo.upsert(self.luca, 'nes', 'mario.nes', 0, 'fceumm', AT)
        self.repo.upsert(self.luca, 'snes', 'zelda.sfc', 2, 'bsnes', LATER)
        self.repo.upsert(self.sara, 'nes', 'mario.nes', 0, 'fceumm', LATER)
        self.assertEqual([save['slot'] for save in self.repo.list_for_game(self.luca, 'nes', 'mario.nes')], [0, 3])
        self.assertEqual(self.repo.games_for_account(self.luca), [
            {'system': 'snes', 'game': 'zelda.sfc', 'slots': 1, 'updatedAt': LATER, 'resumeAt': None},
            {'system': 'nes', 'game': 'mario.nes', 'slots': 2, 'updatedAt': AT, 'resumeAt': AT},
        ])
        self.assertTrue(self.repo.delete(self.luca, 'nes', 'mario.nes', 3))
        self.assertFalse(self.repo.delete(self.luca, 'nes', 'mario.nes', 3))
        self.assertEqual(len(self.repo.list_for_game(self.luca, 'nes', 'mario.nes')), 1)

    def test_eliminazione_del_profilo(self):
        self.repo.upsert(self.luca, 'nes', 'mario.nes', 0, 'fceumm', AT)
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM accounts WHERE id = ?', (self.luca,))
        self.assertEqual(self.repo.games_for_account(self.luca), [])

    def test_nome_e_protezione(self):
        self.repo.upsert(self.luca, 'nes', 'mario.nes', 2, 'fceumm', AT)
        self.assertTrue(self.repo.rename(self.luca, 'nes', 'mario.nes', 2, 'Prima del boss'))
        self.assertTrue(self.repo.set_protected(self.luca, 'nes', 'mario.nes', 2, True))
        save = self.repo.get(self.luca, 'nes', 'mario.nes', 2)
        self.assertEqual((save['name'], save['protected']), ('Prima del boss', True))
        # Un nuovo salvataggio nello slot non cambia nome e protezione.
        self.repo.upsert(self.luca, 'nes', 'mario.nes', 2, 'fceumm', LATER)
        save = self.repo.get(self.luca, 'nes', 'mario.nes', 2)
        self.assertEqual((save['name'], save['protected'], save['updatedAt']), ('Prima del boss', True, LATER))
        self.assertTrue(self.repo.rename(self.luca, 'nes', 'mario.nes', 2, None))
        self.assertTrue(self.repo.set_protected(self.luca, 'nes', 'mario.nes', 2, False))
        save = self.repo.get(self.luca, 'nes', 'mario.nes', 2)
        self.assertEqual((save['name'], save['protected']), (None, False))
        self.assertFalse(self.repo.rename(self.luca, 'nes', 'mario.nes', 3, 'x'))
        self.assertFalse(self.repo.set_protected(self.sara, 'nes', 'mario.nes', 2, True))


if __name__ == '__main__':
    unittest.main()
