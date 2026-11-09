import os
import sys
import tempfile
import textwrap
import unittest

from pixelarcade import addons
from pixelarcade.web import api
from pixelarcade.web.router import Request, Router

FAKE_INIT = '''
from . import helper

stopped = []


def ping(ctx, request):
    return {'pong': helper.VALUE}


def register(router, services):
    router.add('GET', '/api/addons/fake-addon/ping', ping)


def bootstrap(services):
    return {'ok': True}


def stop():
    stopped.append(True)
'''


class AddonsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        self.addCleanup(self.tmp.cleanup)
        self.addCleanup(self.forget_modules)

    def forget_modules(self):
        for name in list(sys.modules):
            if name.startswith('pixelarcade_addon_'):
                del sys.modules[name]

    def write(self, relative, content):
        path = os.path.join(self.root, relative)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w') as stream:
            stream.write(textwrap.dedent(content))

    def test_empty_root(self):
        loaded = addons.load({}, self.root)
        self.assertEqual(loaded, [])
        self.assertEqual(addons.bootstrap_data(loaded, {}), {})
        router, plain = Router(), Router()
        api.register(router)
        api.register(plain)
        addons.register_routes(loaded, router, {})
        self.assertEqual(set(router.routes), set(plain.routes))

    def test_fake_addon(self):
        self.write('fake-addon/__init__.py', FAKE_INIT)
        self.write('fake-addon/helper.py', 'VALUE = 42\n')
        loaded = addons.load({}, self.root)
        self.assertEqual([addon.id for addon in loaded], ['fake-addon'])
        self.assertEqual(loaded[0].module.__name__, 'pixelarcade_addon_fake_addon')
        router = Router()
        addons.register_routes(loaded, router, {})
        status, data = router.dispatch({}, Request('GET', '/api/addons/fake-addon/ping'))
        self.assertEqual((status, data), (200, {'pong': 42}))
        self.assertEqual(addons.bootstrap_data(loaded, {}), {'fake-addon': {'ok': True}})

    def test_broken_addon_is_skipped(self):
        self.write('broken/__init__.py', 'raise RuntimeError("rotto")\n')
        self.write('good/__init__.py', 'def register(router, services):\n    pass\n')
        with self.assertLogs('pixelarcade.addons', level='WARNING') as logs:
            loaded = addons.load({}, self.root)
        self.assertEqual([addon.id for addon in loaded], ['good'])
        self.assertIn('Estensione broken non caricata: rotto', '\n'.join(logs.output))
        self.assertNotIn('pixelarcade_addon_broken', sys.modules)

    def test_missing_register_is_skipped(self):
        self.write('noreg/__init__.py', 'VALUE = 1\n')
        with self.assertLogs('pixelarcade.addons', level='WARNING'):
            self.assertEqual(addons.load({}, self.root), [])

    def test_hidden_and_private_folders_are_ignored(self):
        body = 'def register(router, services):\n    pass\n'
        self.write('.hidden/__init__.py', body)
        self.write('_tmp/__init__.py', body)
        os.makedirs(os.path.join(self.root, 'empty'))
        self.assertEqual(addons.load({}, self.root), [])

    def test_bootstrap_error_omits_field(self):
        self.write('bad-boot/__init__.py', '''
            def register(router, services):
                pass

            def bootstrap(services):
                raise ValueError('niente')
            ''')
        loaded = addons.load({}, self.root)
        with self.assertLogs('pixelarcade.addons', level='WARNING'):
            self.assertEqual(addons.bootstrap_data(loaded, {}), {})

    def test_stop_all(self):
        self.write('fake-addon/__init__.py', FAKE_INIT)
        self.write('fake-addon/helper.py', 'VALUE = 42\n')
        self.write('failing/__init__.py', '''
            def register(router, services):
                pass

            def stop():
                raise RuntimeError('chiusura fallita')
            ''')
        loaded = addons.load({}, self.root)
        with self.assertLogs('pixelarcade.addons', level='WARNING') as logs:
            addons.stop_all(loaded)
        fake = [addon for addon in loaded if addon.id == 'fake-addon'][0]
        self.assertEqual(fake.module.stopped, [True])
        self.assertIn('failing', '\n'.join(logs.output))

    def test_busy_all(self):
        body = 'def register(router, services):\n    pass\n'
        self.write('a-none/__init__.py', body + 'def busy(services):\n    return None\n')
        self.write('b-phrase/__init__.py', body + 'def busy(services):\n    return services["phrase"]\n')
        self.write('c-plain/__init__.py', body)
        self.write('d-broken/__init__.py', body + 'def busy(services):\n    raise RuntimeError("guasto")\n')
        self.write('e-other/__init__.py', body + 'def busy(services):\n    return "1 attività in corso"\n')
        loaded = addons.load({}, self.root)
        with self.assertLogs('pixelarcade.addons', level='WARNING') as logs:
            phrases = addons.busy_all(loaded, {'phrase': '2 operazioni in corso'})
        self.assertEqual(phrases, ['2 operazioni in corso', '1 attività in corso'])
        self.assertIn('d-broken', '\n'.join(logs.output))
        self.assertEqual(addons.busy_all([], {}), [])

    def test_load_package(self):
        self.write('pkg-x/__init__.py', 'from .helper import VALUE\n')
        self.write('pkg-x/helper.py', 'VALUE = 7\n')
        module = addons.load_package(os.path.join(self.root, 'pkg-x'))
        self.assertEqual(module.VALUE, 7)
        self.assertIs(sys.modules['pixelarcade_addon_pkg_x'], module)


if __name__ == '__main__':
    unittest.main()
