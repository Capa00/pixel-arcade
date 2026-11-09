import sys
import unittest

from pixelarcade import launcher
from pixelarcade.launcher import RetroArchProcess, retroarch_args


def fake(script):
    """Comando che esegue ``script`` con Python e ignora gli argomenti di RetroArch."""
    return [sys.executable, '-c', script]


class LauncherTest(unittest.TestCase):
    def test_argomenti(self):
        self.assertEqual(retroarch_args(['snap', 'run', 'retroarch'], '/c/fbneo_libretro.so', '/g/a.zip', '/x.cfg'),
                         ['snap', 'run', 'retroarch', '--verbose', '--fullscreen', '-L', '/c/fbneo_libretro.so',
                          '--appendconfig', '/x.cfg', '/g/a.zip'])
        self.assertEqual(retroarch_args(['retroarch'], 'c.so', None, ''),
                         ['retroarch', '--verbose', '--fullscreen', '-L', 'c.so'])
        self.assertEqual(retroarch_args(['retroarch'], 'c.so', '/g/a.zip', '/x.cfg', '/s/xbr.glslp'),
                         ['retroarch', '--verbose', '--fullscreen', '-L', 'c.so', '--appendconfig', '/x.cfg',
                          '--set-shader', '/s/xbr.glslp', '/g/a.zip'])

    def test_legge_le_righe(self):
        lines = []
        process = RetroArchProcess(fake('print("uno"); print("due", flush=True)'), 'c.so', 'g.zip', 'a.cfg')
        process.add_listener(lines.append)
        process.start()
        self.assertEqual(process.wait(10), 0)
        self.assertEqual(lines[:2], ['uno', 'due'])
        self.assertIn('uno\ndue\n', process.log)
        self.assertFalse(process.running())
        self.assertEqual(process.returncode, 0)

    def test_codice_di_uscita(self):
        process = RetroArchProcess(fake('import sys; sys.exit(3)'), 'c.so', 'g.zip', 'a.cfg').start()
        self.assertEqual(process.wait(10), 3)

    def test_terminazione(self):
        process = RetroArchProcess(fake('import time\nprint("pronto", flush=True)\ntime.sleep(60)'),
                                   'c.so', 'g.zip', 'a.cfg').start()
        self.assertIsNone(process.wait(0.2))
        self.assertTrue(process.running())
        self.assertIsNotNone(process.terminate())
        self.assertFalse(process.running())

    def test_kill_se_ignora_terminate(self):
        script = ('import signal, time\nsignal.signal(signal.SIGTERM, signal.SIG_IGN)\n'
                  'print("pronto", flush=True)\ntime.sleep(60)')
        lines = []
        process = RetroArchProcess(fake(script), 'c.so', 'g.zip', 'a.cfg')
        process.add_listener(lines.append)
        process.start()
        while not lines:
            process.wait(0.05)
        original = launcher.TERMINATE_GRACE
        launcher.TERMINATE_GRACE = 0.3
        try:
            code = process.terminate()
        finally:
            launcher.TERMINATE_GRACE = original
        self.assertEqual(code, -9)

    def test_log_troncato(self):
        process = RetroArchProcess(fake('for i in range(3000): print("riga %05d" % i)'), 'c.so', 'g.zip', 'a.cfg')
        process.start()
        process.wait(10)
        self.assertEqual(len(process.log), launcher.MAX_LOG)
        self.assertTrue(process.log.endswith('riga 02999\n'))

    def test_ascoltatore_con_errore(self):
        def broken(line):
            raise RuntimeError('guasto')
        lines = []
        process = RetroArchProcess(fake('print("a"); print("b")'), 'c.so', 'g.zip', 'a.cfg')
        process.add_listener(broken)
        process.add_listener(lines.append)
        with self.assertLogs('pixelarcade.launcher', 'ERROR'):
            process.start()
            process.wait(10)
        self.assertEqual(lines[:2], ['a', 'b'])


if __name__ == '__main__':
    unittest.main()
