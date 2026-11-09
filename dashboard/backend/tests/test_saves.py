import os
import tempfile
import unittest

from pixelarcade.db import Database
from pixelarcade.errors import ConflictError, SaveError
from pixelarcade.repositories.profiles import ProfilesRepository
from pixelarcade.repositories.saves import SavesRepository
from pixelarcade.saves import (SaveStore, associated_core, auto_state, clean_name, clear_dir, content_basename, game_key,
                               loadable, sram_suffix)

from tests.fakes import fake_png

AT = '2026-10-01T10:00:00+00:00'
PNG = fake_png()


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as stream:
        stream.write(data)


def read(path):
    with open(path, 'rb') as stream:
        return stream.read()


class FunctionsTest(unittest.TestCase):
    def test_chiave_del_gioco(self):
        key = game_key('psx', 'Ape Escape/Ape Escape.cue')
        self.assertEqual(len(key), 40)
        self.assertNotIn('/', key)
        self.assertNotEqual(key, game_key('psx', 'Ape Escape/Ape Escape.m3u'))

    def test_nome_di_retroarch(self):
        self.assertEqual(content_basename('Ape Escape/Ape Escape.cue'), 'Ape Escape')
        self.assertEqual(content_basename('Zelda (E).sfc'), 'Zelda (E)')

    def test_file_del_salvataggio_interno(self):
        self.assertEqual(sram_suffix('Zelda.srm', 'Zelda'), 'srm')
        self.assertEqual(sram_suffix('Zelda.1.mcr', 'Zelda'), '1.mcr')
        for name in ('Zelda.state', 'Zelda.state3', 'Zelda.state.auto', 'Zelda.state.auto.png', 'Zelda.png',
                     'Zelda-261001-101010.png', 'Zelda II.srm', 'Zelda.'):
            self.assertIsNone(sram_suffix(name, 'Zelda'), name)

    def test_stato_automatico(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(auto_state(tmp, 'Zelda'))
            self.assertIsNone(auto_state(os.path.join(tmp, 'manca'), 'Zelda'))
            write(os.path.join(tmp, 'Zelda (E).state.auto'), b'x')
            self.assertEqual(auto_state(tmp, 'Zelda (E)'), (os.path.join(tmp, 'Zelda (E).state.auto'), 'Zelda (E)'))
            # Un solo stato automatico con un altro nome (gioco dentro un archivio).
            self.assertEqual(auto_state(tmp, 'zelda'), (os.path.join(tmp, 'Zelda (E).state.auto'), 'Zelda (E)'))
            write(os.path.join(tmp, 'Altro.state.auto'), b'y')
            self.assertIsNone(auto_state(tmp, 'zelda'))

    def test_caricabile_con_il_core_del_gioco(self):
        self.assertTrue(loadable('bsnes', 'bsnes'))
        self.assertFalse(loadable('snes9x', 'bsnes'))
        # Senza core associato il caricamento si tenta.
        self.assertTrue(loadable('snes9x', None))
        self.assertEqual(associated_core({'core': 'bsnes', 'status': 'ok', 'confirmedBy': 'user'}), 'bsnes')
        self.assertEqual(associated_core({'core': 'bsnes', 'status': 'trial', 'confirmedBy': None}), 'bsnes')
        self.assertIsNone(associated_core({'core': None, 'status': 'incompatible', 'confirmedBy': None}))
        self.assertIsNone(associated_core(None))

    def test_nome_ripulito(self):
        self.assertEqual(clean_name('  Prima   del\tboss \n'), 'Prima del boss')
        self.assertEqual(clean_name('Livello\x007'), 'Livello 7')
        self.assertEqual(clean_name('A' * 25), 'A' * 20)
        self.assertEqual(clean_name('Diciannove lettere x'), 'Diciannove lettere x')
        self.assertEqual(clean_name('Diciannove letteree  yz'), 'Diciannove letteree')
        for empty in ('', '   ', None, 5):
            self.assertIsNone(clean_name(empty))

    def test_svuota_la_cartella(self):
        with tempfile.TemporaryDirectory() as tmp:
            session = os.path.join(tmp, 'sessione')
            clear_dir(session)
            write(os.path.join(session, 'a.state'), b'x')
            write(os.path.join(session, 'sotto', 'b'), b'y')
            clear_dir(session)
            self.assertEqual(os.listdir(session), [])


class SaveStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Database(os.path.join(self.tmp.name, 'test.db'))
        self.db.migrate()
        self.repo = SavesRepository(self.db)
        self.luca = ProfilesRepository(self.db).create('LUCA', '#ff5d73', AT)
        self.store = SaveStore(os.path.join(self.tmp.name, 'data'), self.repo, lambda: AT)
        self.session = os.path.join(self.tmp.name, 'sessione')
        os.makedirs(self.session)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def session_file(self, name, data):
        path = os.path.join(self.session, name)
        write(path, data)
        return path

    def test_stato_e_miniatura(self):
        state = self.session_file('Zelda.state.auto', b'stato')
        png = self.session_file('Zelda.state.auto.png', PNG)
        self.assertTrue(self.store.store_state(self.luca, 'snes', 'rpg/Zelda.sfc', 0, 'bsnes', state, png))
        path = self.store.state_file(self.luca, 'snes', 'rpg/Zelda.sfc', 0)
        self.assertEqual(read(path), b'stato')
        self.assertEqual(os.path.basename(path), 'slot0.state')
        self.assertEqual(read(self.store.thumb_file(self.luca, 'snes', 'rpg/Zelda.sfc', 0)), PNG)
        self.assertEqual(self.repo.get(self.luca, 'snes', 'rpg/Zelda.sfc', 0)['core'], 'bsnes')
        self.assertIsNone(self.store.state_file(self.luca, 'snes', 'rpg/Zelda.sfc', 1))
        # Stato nuovo senza miniatura: quella vecchia sparisce.
        write(state, b'nuovo')
        self.store.store_state(self.luca, 'snes', 'rpg/Zelda.sfc', 0, 'bsnes', state)
        self.assertEqual(read(path), b'nuovo')
        self.assertIsNone(self.store.thumb_file(self.luca, 'snes', 'rpg/Zelda.sfc', 0))

    def test_slot_del_gioco(self):
        state = self.session_file('Zelda.state.auto', b'stato')
        png = self.session_file('Zelda.state.auto.png', PNG)
        self.store.store_state(self.luca, 'snes', 'Zelda.sfc', 0, 'bsnes', state, png)
        self.store.store_state(self.luca, 'snes', 'Zelda.sfc', 3, 'snes9x', state)
        self.store.store_state(self.luca, 'snes', 'Zelda.sfc', 5, 'bsnes', state)
        # Slot registrato ma senza file su disco: non compare.
        os.unlink(self.store.slot_path(self.luca, 'snes', 'Zelda.sfc', 5, 'state'))
        slots = self.store.game_slots(self.luca, 'snes', 'Zelda.sfc', 'bsnes')
        self.assertEqual([(item['slot'], item['core'], item['thumb'], item['loadable']) for item in slots],
                         [(0, 'bsnes', True, True), (3, 'snes9x', False, False)])
        self.assertEqual(slots[0]['updatedAt'], AT)
        self.assertEqual((slots[0]['name'], slots[0]['protected']), (None, False))
        self.assertTrue(all(item['loadable'] for item in self.store.game_slots(self.luca, 'snes', 'Zelda.sfc', None)))
        self.assertEqual(self.store.game_slots(self.luca, 'snes', 'Altro.sfc', 'bsnes'), [])

    def test_copia_nella_cartella_di_sessione(self):
        state = self.session_file('Zelda.state.auto', b'stato')
        self.store.store_state(self.luca, 'snes', 'Zelda.sfc', 2, 'bsnes', state)
        clear_dir(self.session)
        target = self.store.copy_to_session(self.luca, 'snes', 'Zelda.sfc', 2, self.session, 'Zelda (E)')
        self.assertEqual(target, os.path.join(self.session, 'Zelda (E).state.auto'))
        self.assertEqual(read(target), b'stato')
        self.assertEqual(os.stat(target).st_mode & 0o777, 0o644)
        self.assertIsNone(self.store.copy_to_session(self.luca, 'snes', 'Zelda.sfc', 1, self.session, 'Zelda (E)'))

    def test_profilo_inesistente(self):
        state = self.session_file('Zelda.state.auto', b'stato')
        self.assertFalse(self.store.store_state(999, 'snes', 'Zelda.sfc', 0, 'bsnes', state))
        self.assertFalse(os.path.exists(self.store.game_dir(999, 'snes', 'Zelda.sfc')))
        self.assertIsNone(self.store.state_file(999, 'snes', 'Zelda.sfc', 0))

    def test_salvataggio_interno_per_proprietario(self):
        self.session_file('Ape Escape.srm', b'card')
        self.session_file('Ape Escape.1.mcr', b'card2')
        self.session_file('Ape Escape.state.auto', b'stato')
        self.session_file('Ape Escape.state.auto.png', PNG)
        self.session_file('Altro.srm', b'altro')
        self.assertEqual(self.store.keep_sram(self.luca, 'psx', 'Ape Escape.cue', self.session, 'Ape Escape'),
                         ['1.mcr', 'srm'])
        self.assertEqual(self.store.keep_sram(None, 'psx', 'Ape Escape.cue', self.session, 'Nessuno'), [])
        clear_dir(self.session)
        self.assertEqual(self.store.restore_sram(None, 'psx', 'Ape Escape.cue', self.session, 'Ape Escape'), [])
        self.assertEqual(os.listdir(self.session), [])
        copied = self.store.restore_sram(self.luca, 'psx', 'Ape Escape.cue', self.session, 'Ape Escape')
        self.assertEqual(copied, ['Ape Escape.1.mcr', 'Ape Escape.srm'])
        self.assertEqual(read(os.path.join(self.session, 'Ape Escape.srm')), b'card')
        self.assertEqual(sorted(os.listdir(self.session)), ['Ape Escape.1.mcr', 'Ape Escape.srm'])

    def test_cartelle_dei_core(self):
        # MAME 2000 scrive record e nvram in una sua sottocartella della sessione.
        self.session_file('mame2000/hi/005.hi', b'record')
        self.session_file('mame2000/nvram/005.nv', b'nvram')
        self.session_file('mame2000/cfg/default.cfg', b'cfg')
        os.makedirs(os.path.join(self.session, 'mame2000', 'snap'))
        kept = self.store.keep_sram(self.luca, 'arcade', '005.zip', self.session, '005')
        self.assertEqual(kept, [os.path.join('mame2000', 'cfg', 'default.cfg'), os.path.join('mame2000', 'hi', '005.hi'),
                                os.path.join('mame2000', 'nvram', '005.nv')])
        # Una partita successiva senza nvram: il record si aggiorna, la nvram conservata resta.
        clear_dir(self.session)
        self.session_file('mame2000/hi/005.hi', b'record nuovo')
        self.store.keep_sram(self.luca, 'arcade', '005.zip', self.session, '005')
        clear_dir(self.session)
        copied = self.store.restore_sram(self.luca, 'arcade', '005.zip', self.session, '005')
        self.assertEqual(len(copied), 3)
        self.assertEqual(read(os.path.join(self.session, 'mame2000', 'hi', '005.hi')), b'record nuovo')
        self.assertEqual(read(os.path.join(self.session, 'mame2000', 'nvram', '005.nv')), b'nvram')
        self.assertEqual(os.stat(os.path.join(self.session, 'mame2000', 'hi', '005.hi')).st_mode & 0o777, 0o644)
        # Un altro profilo non li ritrova.
        clear_dir(self.session)
        self.assertEqual(self.store.restore_sram(None, 'arcade', '005.zip', self.session, '005'), [])

    def stored(self, account_id, slot, data=b'stato', core='fceumm', png=True, system='nes', game='Zelda.nes'):
        state = self.session_file('Zelda.state', data)
        thumb = self.session_file('Zelda.state.png', PNG) if png else None
        self.assertTrue(self.store.store_state(account_id, system, game, slot, core, state, thumb))

    def test_rinomina_e_protezione(self):
        self.stored(self.luca, 1)
        self.stored(self.luca, 0)
        self.assertEqual(self.store.rename(self.luca, 'nes', 'Zelda.nes', 1, '  Prima del boss  '), 'Prima del boss')
        self.store.set_protected(self.luca, 'nes', 'Zelda.nes', 1, True)
        [_, slot] = self.store.game_slots(self.luca, 'nes', 'Zelda.nes', 'fceumm')
        self.assertEqual((slot['name'], slot['protected']), ('Prima del boss', True))
        # Protetto: non si sovrascrive né si elimina, e il file resta quello di prima.
        with self.assertRaisesRegex(ConflictError, 'protetto'):
            self.stored(self.luca, 1, b'nuovo')
        with self.assertRaisesRegex(ConflictError, 'protetto'):
            self.store.delete(self.luca, 'nes', 'Zelda.nes', 1)
        self.assertEqual(read(self.store.state_file(self.luca, 'nes', 'Zelda.nes', 1)), b'stato')
        self.store.set_protected(self.luca, 'nes', 'Zelda.nes', 1, False)
        self.stored(self.luca, 1, b'nuovo')
        self.assertEqual(read(self.store.state_file(self.luca, 'nes', 'Zelda.nes', 1)), b'nuovo')
        self.assertEqual(self.repo.get(self.luca, 'nes', 'Zelda.nes', 1)['name'], 'Prima del boss')
        self.assertIsNone(self.store.rename(self.luca, 'nes', 'Zelda.nes', 1, ' '))
        # Il «Riprendi» non si rinomina e non si protegge; uno slot vuoto nemmeno.
        for slot in (0, 2, 10):
            with self.assertRaises(SaveError):
                self.store.rename(self.luca, 'nes', 'Zelda.nes', slot, 'x')
            with self.assertRaises(SaveError):
                self.store.set_protected(self.luca, 'nes', 'Zelda.nes', slot, True)

    def test_eliminazione(self):
        self.stored(self.luca, 2)
        self.stored(self.luca, 0)
        self.store.delete(self.luca, 'nes', 'Zelda.nes', 2)
        self.assertIsNone(self.repo.get(self.luca, 'nes', 'Zelda.nes', 2))
        for ext in ('state', 'png'):
            self.assertFalse(os.path.exists(self.store.slot_path(self.luca, 'nes', 'Zelda.nes', 2, ext)))
        self.store.delete(self.luca, 'nes', 'Zelda.nes', 0)
        self.assertEqual(self.store.game_slots(self.luca, 'nes', 'Zelda.nes', None), [])
        with self.assertRaises(SaveError):
            self.store.delete(self.luca, 'nes', 'Zelda.nes', 2)

    def test_elimina_tutti_i_salvataggi_del_gioco(self):
        for slot in (0, 1, 2, 3):
            self.stored(self.luca, slot)
        self.stored(self.luca, 1, system='snes', game='Mario.sfc')
        self.store.set_protected(self.luca, 'nes', 'Zelda.nes', 2, True)
        self.assertEqual(self.store.delete_game(self.luca, 'nes', 'Zelda.nes'), 1)
        self.assertEqual([item['slot'] for item in self.store.game_slots(self.luca, 'nes', 'Zelda.nes', None)], [2])
        self.assertFalse(os.path.exists(self.store.slot_path(self.luca, 'nes', 'Zelda.nes', 0, 'state')))
        # Gli altri giochi restano; senza slot protetti non resta nulla.
        self.assertEqual(len(self.store.game_slots(self.luca, 'snes', 'Mario.sfc', None)), 1)
        self.store.set_protected(self.luca, 'nes', 'Zelda.nes', 2, False)
        self.assertEqual(self.store.delete_game(self.luca, 'nes', 'Zelda.nes'), 0)
        self.assertEqual(self.repo.games_for_account(self.luca)[0]['game'], 'Mario.sfc')
        self.assertEqual(len(self.repo.games_for_account(self.luca)), 1)

    def test_copia_a_un_altro_profilo(self):
        anna = ProfilesRepository(self.db).create('ANNA', '#3ccfc4', AT)
        self.stored(self.luca, 1, core='nestopia')
        self.store.rename(self.luca, 'nes', 'Zelda.nes', 1, 'Boss')
        self.store.set_protected(self.luca, 'nes', 'Zelda.nes', 1, True)
        self.stored(anna, 5, b'vecchio', png=False)
        self.store.rename(anna, 'nes', 'Zelda.nes', 5, 'Vecchio')
        self.store.copy(self.luca, anna, 'nes', 'Zelda.nes', 1, 5)
        [slot] = self.store.game_slots(anna, 'nes', 'Zelda.nes', 'nestopia')
        # Stato, miniatura e core sì; nome e protezione no.
        self.assertEqual((slot['slot'], slot['core'], slot['thumb'], slot['name'], slot['protected']),
                         (5, 'nestopia', True, None, False))
        self.assertEqual(read(self.store.state_file(anna, 'nes', 'Zelda.nes', 5)), b'stato')
        self.assertEqual(read(self.store.state_file(self.luca, 'nes', 'Zelda.nes', 1)), b'stato')
        self.store.set_protected(anna, 'nes', 'Zelda.nes', 5, True)
        with self.assertRaisesRegex(ConflictError, 'protetto'):
            self.store.copy(self.luca, anna, 'nes', 'Zelda.nes', 1, 5)
        for args in ((1, 0), (0, 1), (2, 6)):
            with self.assertRaises(SaveError):
                self.store.copy(self.luca, anna, 'nes', 'Zelda.nes', *args)
        with self.assertRaises(SaveError):
            self.store.copy(self.luca, 999, 'nes', 'Zelda.nes', 1, 3)
        self.assertIsNotNone(self.store.state_file(self.luca, 'nes', 'Zelda.nes', 1))

    def test_ospiti_in_cartella_comune(self):
        self.session_file('Zelda.srm', b'ospite')
        self.store.keep_sram(None, 'nes', 'Zelda.nes', self.session, 'Zelda')
        self.assertTrue(self.store.sram_dir(None, 'nes', 'Zelda.nes').startswith(
            os.path.join(self.tmp.name, 'data', 'saves', 'ospiti') + os.sep))
        clear_dir(self.session)
        self.store.restore_sram(None, 'nes', 'Zelda.nes', self.session, 'Zelda')
        self.assertEqual(read(os.path.join(self.session, 'Zelda.srm')), b'ospite')


if __name__ == '__main__':
    unittest.main()
