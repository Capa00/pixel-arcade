import os
import tempfile
import unittest

from pixelarcade.db import Database
from pixelarcade.repositories.cores import CoresRepository


class CoresRepositoryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        self.repo = CoresRepository(self.db)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def test_vuoto(self):
        self.assertEqual(self.repo.system_settings(), {})
        self.assertEqual(self.repo.buildbot_index(), {})
        self.assertIsNone(self.repo.index_fetched_at())

    def test_lista_in_ordine_alfabetico_e_predefinita(self):
        self.repo.replace_system('arcade', 'zip', ['mame', 'fbneo', 'mame2003_plus'])
        self.repo.replace_system('nes', '', [])
        self.repo.replace_system('snes', 'sfc', None)
        self.assertEqual(self.repo.system_settings(), {
            'arcade': {'extensions': 'zip', 'cores': ['fbneo', 'mame', 'mame2003_plus']},
            'nes': {'extensions': '', 'cores': []},
            'snes': {'extensions': 'sfc', 'cores': None},
        })

    def test_sostituzione_e_ritorno_alla_predefinita(self):
        self.repo.replace_system('arcade', 'zip', ['a', 'b'])
        self.repo.replace_system('arcade', '', ['b', 'c'])
        self.assertEqual(self.repo.system_settings()['arcade'], {'extensions': '', 'cores': ['b', 'c']})
        self.repo.replace_system('arcade', '', None)
        self.assertEqual(self.repo.system_settings()['arcade'], {'extensions': '', 'cores': None})
        self.assertEqual(self.db.query('SELECT COUNT(*) FROM system_cores')[0][0], 0)

    def test_sostituzione_atomica(self):
        self.repo.replace_system('arcade', 'zip', ['a'])
        with self.assertRaises(Exception):
            self.repo.replace_system('arcade', '7z', ['b', object()])
        self.assertEqual(self.repo.system_settings()['arcade'], {'extensions': 'zip', 'cores': ['a']})

    def test_doppioni_ignorati(self):
        self.repo.replace_system('arcade', '', ['b', 'a', 'b'])
        self.assertEqual(self.repo.system_settings()['arcade']['cores'], ['a', 'b'])

    def test_cancellazione_a_cascata(self):
        self.repo.replace_system('arcade', '', ['a', 'b'])
        self.repo.delete_system('arcade')
        self.assertEqual(self.repo.system_settings(), {})
        self.assertEqual(self.db.query('SELECT COUNT(*) FROM system_cores')[0][0], 0)

    def test_indice_del_buildbot(self):
        self.repo.replace_buildbot_index({'fbneo': {'crc': 'aa', 'date': '2026-09-22'}}, '2026-09-23T10:00:00+00:00')
        self.repo.replace_buildbot_index({'mame': {'crc': 'bb', 'date': '2026-09-23'},
                                          'nestopia': {'crc': 'cc', 'date': '2026-09-23'}},
                                         '2026-09-24T10:00:00+00:00')
        self.assertEqual(self.repo.buildbot_index(), {'mame': {'crc': 'bb', 'date': '2026-09-23'},
                                                      'nestopia': {'crc': 'cc', 'date': '2026-09-23'}})
        self.assertEqual(self.repo.index_fetched_at(), '2026-09-24T10:00:00+00:00')

    def test_indice_sostituzione_atomica(self):
        self.repo.replace_buildbot_index({'fbneo': {'crc': 'aa', 'date': '2026-09-22'}}, 'prima')
        with self.assertRaises(Exception):
            self.repo.replace_buildbot_index({'mame': {'crc': 'bb'}}, 'dopo')
        self.assertEqual(list(self.repo.buildbot_index()), ['fbneo'])
        self.assertEqual(self.repo.index_fetched_at(), 'prima')

    def test_core_scaricati_e_inutilizzati(self):
        self.repo.add_downloaded('fbneo', 100)
        self.repo.add_downloaded('mame', 200)
        self.repo.add_downloaded('nestopia', 50)
        self.repo.add_downloaded('mame', 300)
        self.assertEqual(self.repo.downloaded(), {'fbneo': 100, 'mame': 300, 'nestopia': 50})
        self.repo.set_game_core('arcade', 'a.zip', 'fbneo', 'ok', 'user')
        self.repo.set_game_core('arcade', 'b.zip', 'mame', 'trial')
        self.repo.set_game_core('nes', 'c.nes', None, 'incompatible')
        self.assertEqual(self.repo.unused_downloaded(), {'nestopia': 50})
        self.repo.remove_downloaded('nestopia')
        self.assertEqual(self.repo.unused_downloaded(), {})

    def test_associazione_gioco_core(self):
        self.assertIsNone(self.repo.game_core('arcade', 'a.zip'))
        self.repo.set_game_core('arcade', 'a.zip', 'fbneo', 'trial')
        self.repo.set_game_core('arcade', 'a.zip', 'fbneo', 'ok', 'auto')
        self.assertEqual(self.repo.game_core('arcade', 'a.zip'), {'core': 'fbneo', 'status': 'ok', 'confirmedBy': 'auto'})
        self.repo.set_game_core('arcade', 'b.zip', None, 'incompatible')
        self.assertEqual(self.repo.game_cores_for('arcade'), {'a.zip': ('fbneo', 'ok'), 'b.zip': (None, 'incompatible')})
        self.assertEqual(self.repo.game_cores_for('nes'), {})
        self.repo.reset_game_core('arcade', 'a.zip')
        self.assertIsNone(self.repo.game_core('arcade', 'a.zip'))

    def test_stato_non_valido(self):
        with self.assertRaises(Exception):
            self.repo.set_game_core('arcade', 'a.zip', 'fbneo', 'forse')
        self.assertIsNone(self.repo.game_core('arcade', 'a.zip'))

    def test_tentativi(self):
        self.repo.add_attempt('arcade', 'a.zip', 'fbneo', 'failed', 'exited', 'x' * 5000)
        self.repo.add_attempt('arcade', 'a.zip', 'mame', 'failed', 'stopped')
        self.repo.add_attempt('arcade', 'a.zip', 'mame2003', 'failed', 'download_declined')
        self.repo.add_attempt('arcade', 'a.zip', 'mame2010', 'ok')
        self.repo.add_attempt('arcade', 'b.zip', 'mame2000', 'failed', 'marker')
        # Una ricerca interrotta dall'utente non giudica il core.
        self.assertEqual(self.repo.tried_cores('arcade', 'a.zip'), {'fbneo', 'mame2003'})
        self.assertEqual([attempt['core'] for attempt in self.repo.attempts('arcade', 'a.zip')],
                         ['fbneo', 'mame', 'mame2003', 'mame2010'])
        tail = self.db.query("SELECT log_tail FROM core_attempts WHERE core = 'fbneo'")[0][0]
        self.assertEqual(len(tail), 4000)
        self.repo.clear_attempts('arcade', 'a.zip')
        self.assertEqual(self.repo.tried_cores('arcade', 'a.zip'), set())
        self.assertEqual(self.repo.tried_cores('arcade', 'b.zip'), {'mame2000'})


if __name__ == '__main__':
    unittest.main()
