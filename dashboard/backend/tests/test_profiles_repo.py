import os
import tempfile
import unittest

from pixelarcade.db import Database
from pixelarcade.errors import DuplicateNameError, ProfileError
from pixelarcade.repositories.profiles import ProfilesRepository

NOW = '2026-09-23T10:00:00+00:00'


class ProfilesRepositoryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, 'test.db')
        self.db = Database(self.path)
        self.db.migrate()
        self.repo = ProfilesRepository(self.db)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def test_creazione_e_persistenza(self):
        first = self.repo.create('LUCA_8BIT', '#ff5d73', NOW, 'snes', genres=['Platform', 'Corse', 'Platform'])
        second = self.repo.create('SARA.EXE', '#3ccfc4', NOW)
        self.db.close()
        self.db = Database(self.path)
        self.repo = ProfilesRepository(self.db)
        self.assertEqual([account['id'] for account in self.repo.list()], [first, second])
        self.assertEqual(self.repo.get(first), {
            'id': first, 'name': 'LUCA_8BIT', 'color': '#ff5d73', 'created_at': NOW, 'fav_system': 'snes',
            'difficulty': 'Normale', 'opt_crt': 0, 'opt_vib': 1, 'opt_save': 1, 'gravatar': None, 'genres': ['Corse', 'Platform'],
        })
        self.assertEqual(self.repo.get(second)['genres'], [])
        self.assertIsNone(self.repo.get(999))

    def test_nome_duplicato_senza_maiuscole(self):
        self.repo.create('PROVA_1', '#ff5d73', NOW)
        with self.assertRaises(DuplicateNameError) as caught:
            self.repo.create('prova_1', '#3ccfc4', NOW)
        self.assertIsInstance(caught.exception, ProfileError)
        self.assertEqual(str(caught.exception), 'Nome già in uso')
        self.assertEqual(caught.exception.status, 409)
        self.assertEqual(len(self.repo.list()), 1)

    def test_generi_cancellati_col_profilo(self):
        account = self.repo.create('A', '#ff5d73', NOW, genres=['Puzzle'])
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM accounts WHERE id = ?', (account,))
        self.assertEqual(self.db.query('SELECT COUNT(*) FROM account_genres')[0][0], 0)

    def test_aggiornamento_e_generi(self):
        account = self.repo.create('A', '#ff5d73', NOW, genres=['Puzzle'])
        self.repo.update(account, {'difficulty': 'Facile', 'opt_crt': 1, 'fav_system': 'nes'}, ['Corse', 'GDR'])
        row = self.repo.get(account)
        self.assertEqual((row['difficulty'], row['opt_crt'], row['fav_system'], row['genres']),
                         ('Facile', 1, 'nes', ['Corse', 'GDR']))
        self.repo.update(account, {})
        self.assertEqual(self.repo.get(account)['genres'], ['Corse', 'GDR'])
        with self.assertRaises(ValueError):
            self.repo.update(account, {'name': 'B'})

    def test_preferiti(self):
        account = self.repo.create('A', '#ff5d73', NOW)
        self.repo.set_favorite(account, 'arcade', 'pang.zip', True, NOW)
        self.repo.set_favorite(account, 'arcade', 'pang.zip', True, '2026-09-24T10:00:00+00:00')
        self.repo.set_favorite(account, 'nes', 'Zelda.nes', True, NOW)
        self.assertEqual(self.repo.favorites(account), [('nes', 'Zelda.nes'), ('arcade', 'pang.zip')])
        self.repo.set_favorite(account, 'arcade', 'pang.zip', False, NOW)
        self.repo.set_favorite(account, 'arcade', 'pang.zip', False, NOW)
        self.assertEqual(self.repo.favorites(account), [('nes', 'Zelda.nes')])
        with self.db.transaction() as conn:
            conn.execute('DELETE FROM accounts WHERE id = ?', (account,))
        self.assertEqual(self.db.query('SELECT COUNT(*) FROM favorites')[0][0], 0)


if __name__ == '__main__':
    unittest.main()
