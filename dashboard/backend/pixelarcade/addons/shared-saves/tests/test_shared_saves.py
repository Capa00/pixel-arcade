import json
import os
import tempfile
import unittest

from pixelarcade import addons
from pixelarcade.db import Database
from pixelarcade.web.router import ApiError, Request, Router

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
addon = addons.load_package(HERE)
store_module = __import__(addons.module_name('shared-saves') + '.store', fromlist=['store'])
convert = __import__(addons.module_name('shared-saves') + '.convert', fromlist=['convert'])
SharedStore = store_module.SharedStore
StoreError = store_module.StoreError


def write(path, data=b'x'):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as stream:
        stream.write(data)


class FakeConfig:
    def __init__(self, base):
        self.base = base

    def resolve_value(self, value):
        path = os.path.expanduser(value)
        return os.path.normpath(path if os.path.isabs(path) else os.path.join(self.base, path))


class FakeLibrary:
    GAMES = {'snes': [{'id': 'Zelda.sfc', 'title': 'Zelda'}], 'ps2': [{'id': 'Tekken 5 (USA).iso', 'title': 'Tekken 5'}]}

    def systems(self):
        return [{'id': 'snes', 'name': 'Super Nintendo'}, {'id': 'ps2', 'name': 'PlayStation 2'}]

    def games(self, system_id):
        return self.GAMES.get(system_id, [])

    def find(self, system_id, game_id):
        return next((game for game in self.games(system_id) if game['id'] == game_id), None)


class FakeSaves:
    shared = None


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = os.path.join(self.tmp.name, 'condivisi')
        self.store = SharedStore(lambda: self.root)
        self.source = os.path.join(self.tmp.name, 'file.srm')
        write(self.source, b'batteria')

    def tearDown(self):
        self.tmp.cleanup()

    def test_aggiunta_elenco_modifica_ed_eliminazione(self):
        self.assertEqual(self.store.list('snes', 'Zelda.sfc'), [])
        name = self.store.create('snes', 'Zelda.sfc', ' Tutto  sbloccato ', 'Ottanta cuori', {'salvataggio.srm': self.source})
        self.assertEqual(name, 'Tutto sbloccato')
        # Lo stesso titolo dà una cartella nuova.
        other = self.store.create('snes', 'Zelda.sfc', 'Tutto sbloccato', '', {'salvataggio.srm': self.source})
        self.assertEqual(other, 'Tutto sbloccato (2)')
        items = self.store.list('snes', 'Zelda.sfc')
        self.assertEqual([item['id'] for item in items], ['Tutto sbloccato', 'Tutto sbloccato (2)'])
        self.assertEqual(items[0]['description'], 'Ottanta cuori')
        self.assertEqual(items[0]['files'], ['salvataggio.srm'])
        folder = self.store.folder('snes', 'Zelda.sfc', name)
        with open(os.path.join(folder, 'salvataggio.srm'), 'rb') as stream:
            self.assertEqual(stream.read(), b'batteria')
        # Il titolo cambia, la cartella resta.
        self.store.update('snes', 'Zelda.sfc', name, 'Fine gioco', 'Con la spada')
        self.assertEqual(self.store.title('snes', 'Zelda.sfc', name), 'Fine gioco')
        self.store.delete('snes', 'Zelda.sfc', name)
        self.store.delete('snes', 'Zelda.sfc', other)
        self.assertIsNone(self.store.folder('snes', 'Zelda.sfc', name))
        # Con l'ultimo salvataggio se ne va anche la cartella del gioco.
        self.assertFalse(os.path.exists(os.path.join(self.root, 'snes', 'Zelda.sfc')))
        self.assertTrue(os.path.isdir(os.path.join(self.root, 'snes')))

    def test_cartella_fatta_a_mano(self):
        folder = os.path.join(self.root, 'snes', 'Zelda.sfc', 'Mio')
        write(os.path.join(folder, 'Zelda.srm'))
        os.makedirs(os.path.join(self.root, 'snes', 'Zelda.sfc', 'Vuoto'))
        write(os.path.join(self.root, 'snes', 'Zelda.sfc', '.nascosto', 'a.srm'))
        items = self.store.list('snes', 'Zelda.sfc')
        # Senza info.json il titolo è il nome della cartella; le cartelle vuote e nascoste non contano.
        self.assertEqual(items, [{'id': 'Mio', 'title': 'Mio', 'description': '', 'files': ['Zelda.srm']}])
        write(os.path.join(folder, 'info.json'), json.dumps({'title': 'Il mio', 'description': 7}).encode())
        self.assertEqual(self.store.list('snes', 'Zelda.sfc')[0]['title'], 'Il mio')
        self.assertEqual(self.store.list('snes', 'Zelda.sfc')[0]['description'], '')
        write(os.path.join(folder, 'info.json'), b'non json')
        self.assertEqual(self.store.title('snes', 'Zelda.sfc', 'Mio'), 'Mio')

    def test_percorsi_non_validi(self):
        for system, game, name in (('..', 'Zelda.sfc', 'a'), ('snes', '../x', 'a'), ('snes', 'Zelda.sfc', '..'),
                                   ('snes', 'Zelda.sfc', 'a/b'), ('snes', '/etc', 'a'), ('snes', 'Zelda.sfc', '.a')):
            self.assertIsNone(self.store.folder(system, game, name))
            with self.assertRaises(StoreError):
                self.store.delete(system, game, name)
        with self.assertRaises(StoreError):
            self.store.create('snes', 'Zelda.sfc', '   ', '', {'salvataggio.srm': self.source})
        with self.assertRaises(StoreError):
            self.store.create('snes', 'Zelda.sfc', 'Ok', '', {'../fuori': self.source})
        self.assertEqual(self.store.list('snes', 'Zelda.sfc'), [])
        # Un titolo con caratteri vietati diventa un nome di cartella sicuro.
        self.assertEqual(store_module.folder_name('a/b: c?'), 'a-b- c')
        self.assertEqual(store_module.folder_name('...'), 'Salvataggio')


class ConvertTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.source = os.path.join(self.tmp.name, 'upload')
        write(self.source)

    def tearDown(self):
        self.tmp.cleanup()

    def test_console_con_salvataggio_interno(self):
        for name in ('Zelda.srm', 'Zelda.SAV', 'card.mcr', 'card.mcd', 'card.mc'):
            self.assertEqual(convert.prepare('snes', self.source, name, self.tmp.name, None),
                             ({'salvataggio.srm': self.source}, None))
        self.assertEqual(convert.prepare('n64', self.source, 'Mario.eep', self.tmp.name, None),
                         ({'salvataggio.eep': self.source}, None))
        for name in ('senza', 'tekken.max', 'card.ps2', 'strano.e$t'):
            with self.assertRaises(StoreError):
                convert.prepare('snes', self.source, name, self.tmp.name, None)

    def test_ps2(self):
        self.assertEqual(convert.prepare('ps2', self.source, 'Carta.PS2', self.tmp.name, None),
                         ({'Mcd001.ps2': self.source}, None))
        # Senza mymcplus i salvataggi esportati non si importano.
        with self.assertRaises(StoreError):
            convert.prepare('ps2', self.source, 'tekken.max', self.tmp.name, None)
        with self.assertRaises(StoreError):
            convert.prepare('ps2', self.source, 'tekken.srm', self.tmp.name, None)

    def test_ps2_con_mymcplus(self):
        # mymcplus finto: «format» crea la card, «import» la riempie e risponde come quello vero.
        script = os.path.join(self.tmp.name, 'mymcplus')
        with open(script, 'w') as stream:
            stream.write('#!/bin/sh\nif [ "$2" = format ]; then printf vuota > "$1"; exit 0; fi\n'
                         'cat "$3" >> "$1"; echo "Importing $3 to BASLUS-21059"\n')
        os.chmod(script, 0o755)
        work = os.path.join(self.tmp.name, 'lavoro')
        os.makedirs(work)
        files, note = convert.prepare('ps2', self.source, 'tekken.max', work, script)
        self.assertEqual(note, 'BASLUS-21059')
        with open(files['Mcd001.ps2'], 'rb') as stream:
            self.assertEqual(stream.read(), b'vuotax')
        failing = os.path.join(self.tmp.name, 'rotto')
        with open(failing, 'w') as stream:
            stream.write('#!/bin/sh\necho "file non valido" >&2\nexit 1\n')
        os.chmod(failing, 0o755)
        with self.assertRaises(StoreError) as caught:
            convert.prepare('ps2', self.source, 'tekken.max', work, failing)
        self.assertIn('file non valido', str(caught.exception))


class RoutesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        self.router = Router()
        self.services = {'db': self.db, 'config': FakeConfig(self.tmp.name), 'library': FakeLibrary(),
                         'saves': FakeSaves(), 'data_dir': os.path.join(self.tmp.name, 'dati')}
        addon.register(self.router, self.services)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def call(self, method, name, body=None):
        status, data = self.router.dispatch(self.services, Request(method, addon.PREFIX + name, {}, body or {}))
        return status, data

    def test_impostazioni_e_salvataggi(self):
        status, data = self.call('GET', 'settings')
        self.assertEqual(status, 200)
        self.assertEqual(data['value'], '')
        self.assertEqual(data['root'], os.path.join(self.tmp.name, 'dati', 'shared-saves'))
        self.assertEqual(data['saves'], [])
        # Il fornitore va al SaveStore.
        self.assertIsNotNone(self.services['saves'].shared)
        source = os.path.join(self.tmp.name, 'Scaricati', 'zelda.sav')
        write(source, b'batteria zelda')
        status, data = self.call('POST', 'create', {'path': source, 'system': 'snes', 'game': 'Zelda.sfc',
                                                    'title': 'Tutto', 'description': 'Fine'})
        self.assertEqual(status, 200, data)
        self.assertEqual(data['id'], 'Tutto')
        self.assertEqual(data['saves'], [{'id': 'Tutto', 'title': 'Tutto', 'description': 'Fine',
                                          'files': ['salvataggio.srm'], 'system': 'snes',
                                          'systemName': 'Super Nintendo', 'game': 'Zelda.sfc', 'gameTitle': 'Zelda'}])
        # Il file scelto resta dov'è; la copia nella cartella del salvataggio prende il nome del formato.
        self.assertTrue(os.path.isfile(source))
        with open(os.path.join(data['root'], 'snes', 'Zelda.sfc', 'Tutto', 'salvataggio.srm'), 'rb') as stream:
            self.assertEqual(stream.read(), b'batteria zelda')
        status, data = self.call('POST', 'update', {'system': 'snes', 'game': 'Zelda.sfc', 'id': 'Tutto',
                                                    'title': 'Finale', 'description': ''})
        self.assertEqual(data['saves'][0]['title'], 'Finale')
        self.assertEqual(self.services['saves'].shared.title('snes', 'Zelda.sfc', 'Tutto'), 'Finale')
        status, data = self.call('POST', 'delete', {'system': 'snes', 'game': 'Zelda.sfc', 'id': 'Tutto'})
        self.assertEqual(data['saves'], [])

    def test_cartella_dalle_impostazioni(self):
        status, data = self.call('POST', 'settings', {'root': 'miei'})
        self.assertEqual(data['root'], os.path.join(self.tmp.name, 'miei'))
        write(os.path.join(self.tmp.name, 'miei', 'snes', 'Zelda.sfc', 'Mano', 'a.srm'))
        self.assertEqual([item['id'] for item in self.call('GET', 'settings')[1]['saves']], ['Mano'])
        write(os.path.join(self.tmp.name, 'un-file'))
        self.assertEqual(self.call('POST', 'settings', {'root': 'un-file'})[0], 400)
        status, data = self.call('POST', 'settings', {'root': ''})
        self.assertEqual(data['root'], os.path.join(self.tmp.name, 'dati', 'shared-saves'))

    def test_richieste_non_valide(self):
        source = os.path.join(self.tmp.name, 'a.srm')
        write(source)
        base = {'system': 'snes', 'game': 'Zelda.sfc', 'title': 'x'}
        self.assertEqual(self.call('POST', 'create', dict(base, path=source, game='Manca.sfc'))[0], 404)
        for path in ('a.srm', os.path.join(self.tmp.name, 'manca.srm'), self.tmp.name):
            self.assertEqual(self.call('POST', 'create', dict(base, path=path))[0], 400)
        empty = os.path.join(self.tmp.name, 'vuoto.srm')
        write(empty, b'')
        self.assertEqual(self.call('POST', 'create', dict(base, path=empty))[0], 400)
        link = os.path.join(self.tmp.name, 'link.srm')
        os.symlink(source, link)
        self.assertEqual(self.call('POST', 'create', dict(base, path=link))[0], 400)
        self.assertEqual(self.call('POST', 'delete', {'system': 'snes', 'game': 'Zelda.sfc', 'id': 'Manca'})[0], 400)


if __name__ == '__main__':
    unittest.main()
