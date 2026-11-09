import contextlib
import io
import json
import os
import tempfile
import threading
import types
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

from pixelarcade import app
from pixelarcade.addons import Addon
from pixelarcade.app import (OverlayWindow, Window, overlay_args, browser_args, main, reopen_running, stale_browser_pid, start_core_index_refresh,
                             watch_browser)
from pixelarcade.errors import ConfigError, ConflictError, RetroArchError


class FakeConfig:
    def __init__(self, fetched_at, fail=False):
        self.fetched_at = fetched_at
        self.fail = fail
        self.calls = 0

    def core_index(self):
        return {'count': 0, 'fetchedAt': self.fetched_at, 'error': None}

    def refresh_core_index(self):
        self.calls += 1
        if self.fail:
            raise ConfigError('rete assente')


class FakeLibrary:
    def __init__(self):
        self.invalidated = 0

    def invalidate(self):
        self.invalidated += 1


class CoreIndexRefreshTest(unittest.TestCase):
    def run_refresh(self, config):
        services = {'config': config, 'library': FakeLibrary()}
        thread = start_core_index_refresh(services)
        if thread is not None:
            thread.join(5)
        return services['library']

    def test_primo_avvio_scarica_in_background(self):
        config = FakeConfig(None)
        library = self.run_refresh(config)
        self.assertEqual((config.calls, library.invalidated), (1, 1))

    def test_elenco_gia_scaricato(self):
        config = FakeConfig('2026-09-23T10:00:00+00:00')
        self.run_refresh(config)
        self.assertEqual(config.calls, 0)

    def test_senza_rete_l_avvio_continua(self):
        config = FakeConfig(None, fail=True)
        library = self.run_refresh(config)
        self.assertEqual((config.calls, library.invalidated), (1, 0))


class BrowserArgsTest(unittest.TestCase):
    def setUp(self):
        self.args = browser_args('/usr/bin/google-chrome', 'http://127.0.0.1:8765', '/dati/chrome-profile')

    def test_finestra_app_a_schermo_intero(self):
        self.assertEqual(self.args[0], '/usr/bin/google-chrome')
        self.assertIn('--start-fullscreen', self.args)
        self.assertEqual(self.args[-1], '--app=http://127.0.0.1:8765')

    def test_audio_senza_clic(self):
        self.assertIn('--autoplay-policy=no-user-gesture-required', self.args)

    def test_niente_kiosk_per_il_menu_contestuale(self):
        self.assertNotIn('--kiosk', self.args)

    def test_profilo_dedicato_e_niente_benvenuto(self):
        self.assertIn('--user-data-dir=/dati/chrome-profile', self.args)
        self.assertIn('--no-first-run', self.args)
        self.assertIn('--no-default-browser-check', self.args)


if __name__ == '__main__':
    unittest.main()


class FakeBrowser:
    """Processo di Chrome finto: ``wait`` termina quando si chiama ``close`` (o ``terminate``)."""

    def __init__(self):
        self.closed = threading.Event()

    def wait(self, timeout=None):
        self.closed.wait(5)

    def poll(self):
        return 0 if self.closed.is_set() else None

    def close(self):
        self.closed.set()

    terminate = close


class FakeServer:
    def __init__(self):
        self.stopped = threading.Event()

    def shutdown(self):
        self.stopped.set()


class WatchBrowserTest(unittest.TestCase):
    def test_chiusura_di_chrome_ferma_il_servizio(self):
        browser, server = FakeBrowser(), FakeServer()
        thread = watch_browser(browser, server)
        self.assertFalse(server.stopped.wait(0.05))
        with self.assertLogs('pixelarcade', level='INFO'):
            browser.close()
            thread.join(5)
        self.assertTrue(server.stopped.is_set())

    def test_senza_chrome(self):
        self.assertIsNone(watch_browser(None, FakeServer()))

    def test_chrome_chiuso_in_background(self):
        browser, server = FakeBrowser(), FakeServer()
        thread = watch_browser(browser, server, keep=lambda closed: closed is browser)
        browser.close()
        thread.join(5)
        self.assertFalse(server.stopped.is_set())


class StaleBrowserTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.profile = self.tmp.name

    def lock(self, target):
        os.symlink(target, os.path.join(self.profile, 'SingletonLock'))

    def cmdline(self, pid):
        return {4321: ['chrome', '--user-data-dir=' + self.profile, '--app=http://127.0.0.1:8765']}.get(pid)

    def find(self):
        return stale_browser_pid(self.profile, hostname='console', cmdline=self.cmdline)

    def test_nessun_blocco(self):
        self.assertIsNone(self.find())

    def test_chrome_aperto_con_il_profilo(self):
        self.lock('console-4321')
        self.assertEqual(self.find(), 4321)

    def test_nome_host_con_trattini(self):
        self.lock('console-4321')
        found = stale_browser_pid(self.profile, hostname='console', cmdline=self.cmdline)
        self.assertEqual(found, 4321)
        os.remove(os.path.join(self.profile, 'SingletonLock'))
        self.lock('my-console-4321')
        found = stale_browser_pid(self.profile, hostname='my-console', cmdline=self.cmdline)
        self.assertEqual(found, 4321)

    def test_altro_computer(self):
        self.lock('altro-4321')
        self.assertIsNone(self.find())

    def test_processo_terminato_o_di_altro_profilo(self):
        self.lock('console-999')
        self.assertIsNone(self.find())
        os.remove(os.path.join(self.profile, 'SingletonLock'))
        self.lock('console-4321')
        other = stale_browser_pid(self.profile, hostname='console',
                                  cmdline=lambda pid: ['chrome', '--user-data-dir=/altro'])
        self.assertIsNone(other)


class OverlayWindowTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.profile = os.path.join(self.tmp.name, 'chrome-overlay')
        self.started = []
        self.closed = threading.Event()

    def popen(self, args, **kwargs):
        browser = FakeBrowser()
        self.started.append((args, browser))
        return browser

    def window(self, browser=lambda: '/usr/bin/google-chrome'):
        return OverlayWindow('http://127.0.0.1:8765/?overlay=1', self.profile, self.closed.set, browser, self.popen)

    def test_argomenti(self):
        args = overlay_args('/usr/bin/google-chrome', 'http://127.0.0.1:8765/?overlay=1', '/dati/chrome-overlay')
        self.assertEqual(args[-1], '--app=http://127.0.0.1:8765/?overlay=1')
        self.assertIn('--user-data-dir=/dati/chrome-overlay', args)
        self.assertIn('--window-size=900,600', args)
        self.assertNotIn('--start-fullscreen', args)

    def test_apertura_e_chiusura(self):
        window = self.window()
        first = window.open()
        self.assertIs(window.open(), first)
        self.assertEqual(len(self.started), 1)
        self.assertTrue(os.path.isdir(self.profile))
        window.close()
        self.assertIsNotNone(first.poll())
        # Chiusa dal servizio: niente avviso di chiusura esterna.
        self.assertFalse(self.closed.wait(0.1))
        window.close()

    def test_chiusa_dall_esterno(self):
        window = self.window()
        window.open().close()
        self.assertTrue(self.closed.wait(5))
        self.assertIsNone(window.process)

    def test_senza_chrome(self):
        with self.assertRaises(RetroArchError):
            self.window(lambda: None).open()


class WindowTest(unittest.TestCase):
    """Chiusura con attività in corso, modalità background e riapertura (Chrome finto)."""

    def setUp(self):
        self.busy = []
        module = types.SimpleNamespace(busy=lambda services: ' e '.join(self.busy) or None)
        self.server = FakeServer()
        self.server.services = {'addons': [Addon('fake', module)]}
        self.browsers = []
        self.window = Window(self.server, 'http://127.0.0.1:8765', '/dati', launch=self.launch, interval=0.02)
        self.addCleanup(self.close_all)

    def launch(self, url, data_dir):
        browser = FakeBrowser()
        self.browsers.append(browser)
        return browser

    def close_all(self):
        for browser in self.browsers:
            browser.close()

    def test_chiusura_senza_attivita(self):
        self.window.open()
        self.busy.append('1 operazione in corso')
        self.window.close(keep_running=False)
        self.assertTrue(self.browsers[0].closed.is_set())
        self.assertTrue(self.server.stopped.is_set())

    def test_continua_senza_attivita_chiude_tutto(self):
        self.window.open()
        self.window.close(keep_running=True)
        self.assertTrue(self.server.stopped.is_set())
        with self.assertRaises(ConflictError):
            self.window.show()

    def test_background_fino_alla_fine_delle_attivita(self):
        self.window.open()
        self.busy.append('1 operazione in corso')
        with self.assertLogs('pixelarcade', level='INFO'):
            self.window.close(keep_running=True)
            self.assertTrue(self.browsers[0].closed.is_set())
            # La chiusura di Chrome non ferma il server.
            self.assertFalse(self.server.stopped.wait(0.2))
            self.busy.clear()
            self.assertTrue(self.server.stopped.wait(2))

    def test_riapertura_dal_background(self):
        self.assertFalse(self.window.show())
        self.window.open()
        self.busy.append('1 operazione in corso')
        self.window.close(keep_running=True)
        self.assertTrue(self.window.show())
        self.assertEqual(len(self.browsers), 2)
        self.assertFalse(self.window.show())
        # Finite le attività, il server resta acceso: la dashboard è di nuovo aperta.
        self.busy.clear()
        self.assertFalse(self.server.stopped.wait(0.2))
        # Il nuovo Chrome, chiuso, ferma il servizio come sempre.
        self.browsers[1].close()
        self.assertTrue(self.server.stopped.wait(2))

    def test_chrome_chiuso_da_fuori_con_attivita(self):
        # Alt+F4 o ✕ della finestra: nessuna conferma, il servizio continua in background.
        self.window.open()
        self.busy.append('1 operazione in corso')
        with self.assertLogs('pixelarcade', level='INFO'):
            self.browsers[0].close()
            self.assertFalse(self.server.stopped.wait(0.2))
            self.assertTrue(self.window.background)
            self.assertTrue(self.window.show())
            self.assertEqual(len(self.browsers), 2)
            self.browsers[1].close()
            self.assertFalse(self.server.stopped.wait(0.2))
            self.busy.clear()
            self.assertTrue(self.server.stopped.wait(2))

    def test_chrome_chiuso_da_fuori_senza_attivita(self):
        self.window.open()
        with self.assertLogs('pixelarcade', level='INFO'):
            self.browsers[0].close()
            self.assertTrue(self.server.stopped.wait(2))
        self.assertFalse(self.window.background)

    def test_exit_dopo_il_ritardo(self):
        self.window.open()
        with mock.patch.object(app, 'EXIT_DELAY', 0.01), self.assertLogs('pixelarcade', level='INFO'):
            self.window.exit(True)
            self.assertTrue(self.server.stopped.wait(2))


def fake_service(name, shown=True, show_status=200):
    """Servizio HTTP finto su una porta libera: ``name`` nell'header ``Server``, ``POST /api/show`` registrato."""
    calls = []

    class Handler(BaseHTTPRequestHandler):
        server_version = name
        sys_version = ''

        def log_message(self, fmt, *args):
            pass

        def reply(self, status, data):
            body = json.dumps(data).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            self.reply(200, {'ok': True, 'version': '0', 'db': {'version': 1}})

        def do_POST(self):
            length = int(self.headers.get('Content-Length', '0'))
            calls.append((self.path, self.rfile.read(length), self.headers.get('Origin'),
                          self.headers.get('X-Pixel-Token')))
            self.reply(show_status, {'shown': shown} if show_status == 200 else {'error': 'In chiusura.'})

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, calls


class ReopenRunningTest(unittest.TestCase):
    def start(self, *args, **kwargs):
        server, calls = fake_service(*args, **kwargs)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return server.server_port, calls

    def test_riapre_la_dashboard(self):
        port, calls = self.start('PixelArcade')
        self.assertEqual(reopen_running(port), 'shown')
        self.assertEqual(calls, [('/api/show', b'{}', None, None)])

    def test_dashboard_gia_aperta(self):
        port, calls = self.start('PixelArcade', shown=False)
        self.assertEqual(reopen_running(port), 'open')

    def test_servizio_in_chiusura(self):
        port, calls = self.start('PixelArcade', show_status=409)
        self.assertEqual(reopen_running(port), 'stopping')

    def test_altro_servizio(self):
        port, calls = self.start('Altro/1.0')
        self.assertIsNone(reopen_running(port))
        self.assertEqual(calls, [])

    def test_porta_libera(self):
        server, _ = fake_service('PixelArcade')
        port = server.server_port
        server.shutdown()
        server.server_close()
        self.assertIsNone(reopen_running(port))


class MainWithBusyPortTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dist = os.path.join(self.tmp.name, 'dist')
        os.makedirs(self.dist)
        with open(os.path.join(self.dist, 'index.html'), 'w') as stream:
            stream.write('<!doctype html>')
        self.data_dir = os.path.join(self.tmp.name, 'dati')
        # main configura il log della console: nei test resta quello di unittest.
        patcher = mock.patch('logging.basicConfig')
        patcher.start()
        self.addCleanup(patcher.stop)

    def run_main(self, port):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err), \
                mock.patch.object(app, 'start_core_index_refresh'), \
                self.assertLogs('pixelarcade', level='INFO'):
            code = main(['--port', str(port), '--dist', self.dist, '--data-dir', self.data_dir])
        return code, out.getvalue(), err.getvalue()

    def test_pixel_arcade_gia_acceso(self):
        server, calls = fake_service('PixelArcade')
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = main(['--port', str(server.server_port), '--dist', self.dist, '--data-dir', self.data_dir])
        self.assertEqual(code, 0)
        self.assertEqual([call[0] for call in calls], ['/api/show'])
        self.assertIn('Pixel Arcade è già in esecuzione: riapro la dashboard.', out.getvalue())
        self.assertFalse(os.path.exists(os.path.join(self.data_dir, 'pixel-arcade.db')))

    def test_porta_occupata_da_altro(self):
        server, calls = fake_service('Altro/1.0')
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        code, out, err = self.run_main(server.server_port)
        self.assertEqual(code, 1)
        self.assertIn('Se la porta è occupata, usa --port 8766.', err)
        self.assertEqual(calls, [])
