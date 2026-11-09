import threading
import unittest

from pixelarcade.core_probe import LogVerifier, SearchStopped, find_core, find_marker, probe_one
from pixelarcade.launcher import MENU_TERMINATE_GRACE

from tests.fakes import FakeClock, FakeFactory


class ProbeTest(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.stop = threading.Event()

    def probe(self, factory, core):
        return probe_one(factory, core, 10, self.stop, self.clock, self.clock.wait)

    def test_marcatori(self):
        self.assertTrue(find_marker('[libretro ERROR] [FBNeo] ROM at index 0 ... is required', ('is required',)))
        self.assertTrue(find_marker('[ERROR] [Content] Impossibile caricare il contenuto.',
                                    ('impossibile caricare il contenuto',)))
        verifier = LogVerifier()
        verifier.feed('[INFO] [Core] Nessun contenuto, avvio dummy core.')
        self.assertEqual(verifier.observe(None), 'unknown')
        self.assertIn('dummy core', verifier.close_line())
        verifier.feed('ERROR: required files are missing, the game cannot be run.')
        self.assertEqual(verifier.observe(None), 'failed')

    def test_core_ok(self):
        factory = FakeFactory(self.clock, {'fbneo': {'lines': ['[INFO] ok']}})
        result = self.probe(factory, 'fbneo')
        self.assertEqual(result.result, 'trial')
        self.assertTrue(result.process.running())
        self.assertGreaterEqual(self.clock.now - 1000, 10)

    def test_uscita_entro_la_finestra(self):
        factory = FakeFactory(self.clock, {'mame2010': {'exit_after': 1.4, 'code': 139}})
        result = self.probe(factory, 'mame2010')
        self.assertEqual((result.result, result.reason, result.detail), ('failed', 'exited', 139))

    def test_uscita_dell_utente_lascia_il_core_in_prova(self):
        factory = FakeFactory(self.clock, {'fbneo': {'exit_after': 4, 'code': 0}})
        result = self.probe(factory, 'fbneo')
        self.assertEqual((result.result, result.reason), ('trial', 'user_exit'))
        self.assertFalse(result.process.running())

    def test_marcatore_con_processo_vivo(self):
        lines = ['[libretro ERROR] [FBNeo] ROM at index 0 with name bme01.12d and CRC 0x55fd447e is required']
        factory = FakeFactory(self.clock, {'fbneo': {'lines': lines}})
        result = self.probe(factory, 'fbneo')
        self.assertEqual((result.result, result.reason), ('failed', 'marker'))
        self.assertIn('is required', result.detail)
        self.assertTrue(factory.created[0].terminated)
        self.assertIn('bme01', result.log_tail)

    def test_marcatore_e_uscita(self):
        lines = ['ERROR: required files are missing, the game cannot be run.']
        factory = FakeFactory(self.clock, {'mame2000': {'lines': lines, 'exit_after': 0, 'code': 1}})
        result = self.probe(factory, 'mame2000')
        self.assertEqual(result.reason, 'marker')

    def test_ritorno_al_menu_entro_la_finestra(self):
        factory = FakeFactory(self.clock, {'fbneo': {'lines': ['[INFO] [Core] Nessun contenuto, avvio dummy core.']}})
        result = self.probe(factory, 'fbneo')
        self.assertEqual((result.result, result.reason), ('failed', 'closed'))
        self.assertIn('dummy core', result.detail)
        self.assertTrue(factory.created[0].terminated)
        self.assertEqual(factory.created[0].grace, MENU_TERMINATE_GRACE)
        self.assertLess(self.clock.now - 1000, 10)

    def test_interruzione(self):
        factory = FakeFactory(self.clock, {})
        self.stop.set()
        result = self.probe(factory, 'fbneo')
        self.assertEqual((result.result, result.reason), ('failed', 'stopped'))
        self.assertTrue(factory.created[0].terminated)


class FindCoreTest(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.stop = threading.Event()
        self.attempts = []
        self.failed = []

    def search(self, scripts, candidates, tried=(), prepare=None):
        factory = FakeFactory(self.clock, scripts)
        result = find_core(
            candidates, set(tried), prepare or (lambda core: True),
            lambda core: probe_one(factory, core, 10, self.stop, self.clock, self.clock.wait),
            lambda index, total, core: self.attempts.append((index, total, core)),
            lambda core, result: self.failed.append((core, result.reason)),
            self.stop.is_set)
        return result, factory

    def test_primo_ok(self):
        result, _ = self.search({}, ['fbneo', 'mame'])
        self.assertEqual((result['status'], result['core'], result['index'], result['total']), ('found', 'fbneo', 1, 2))
        self.assertEqual(self.attempts, [(1, 2, 'fbneo')])

    def test_primo_fallisce_secondo_ok(self):
        result, _ = self.search({'fbneo': {'exit_after': 0.5, 'code': 1}}, ['fbneo', 'mame'])
        self.assertEqual((result['status'], result['core']), ('found', 'mame'))
        self.assertEqual(self.attempts, [(1, 2, 'fbneo'), (2, 2, 'mame')])
        self.assertEqual(self.failed, [('fbneo', 'exited')])

    def test_ritorno_al_menu_passa_al_successivo(self):
        result, factory = self.search({'fbneo': {'lines': ['[INFO] [Core] Nessun contenuto, avvio dummy core.']}},
                                      ['fbneo', 'mame'])
        self.assertEqual((result['status'], result['core']), ('found', 'mame'))
        self.assertEqual(self.failed, [('fbneo', 'closed')])
        self.assertTrue(factory.created[0].terminated)

    def test_tutti_falliscono(self):
        scripts = {'fbneo': {'lines': ['x is required']}, 'mame': {'exit_after': 1, 'code': 139}}
        result, factory = self.search(scripts, ['fbneo', 'mame'])
        self.assertEqual(result, {'status': 'none', 'total': 2})
        self.assertEqual(self.failed, [('fbneo', 'marker'), ('mame', 'exited')])
        self.assertTrue(factory.created[0].terminated)

    def test_ripresa_dai_non_provati(self):
        result, _ = self.search({}, ['fbneo', 'mame', 'mame2003'], tried={'fbneo', 'mame', 'altro'})
        self.assertEqual((result['core'], result['index'], result['total']), ('mame2003', 3, 3))
        self.assertEqual(self.attempts, [(3, 3, 'mame2003')])

    def test_download_saltato(self):
        result, _ = self.search({}, ['fbneo', 'mame'], prepare=lambda core: core != 'fbneo')
        self.assertEqual((result['core'], result['index']), ('mame', 2))
        self.assertEqual(self.attempts, [(1, 2, 'fbneo'), (2, 2, 'mame')])

    def test_interruzione_durante_download(self):
        def prepare(core):
            raise SearchStopped()
        result, factory = self.search({}, ['fbneo'], prepare=prepare)
        self.assertEqual(result['status'], 'stopped')
        self.assertEqual(factory.created, [])

    def test_interruzione_durante_la_prova(self):
        self.stop.set()
        result, _ = self.search({}, ['fbneo', 'mame'])
        self.assertEqual(result['status'], 'stopped')


if __name__ == '__main__':
    unittest.main()
