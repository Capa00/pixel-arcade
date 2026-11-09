import json
import os
import subprocess
import tempfile
import unittest

from pixelarcade.core_options import (AUDIO, EMULATION, GRAPHICS, CoreOptionsCatalog, clean, option_section, probe,
                                      sectioned)


def option(key, label=None, category=None, values=('enabled', 'disabled'), default=None):
    return {'key': key, 'label': label, 'info': None, 'category': category,
            'values': [{'value': value, 'label': None} for value in values], 'default': default}


class Completed:
    def __init__(self, returncode=0, stdout=b'', stderr=b''):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


class ProbeTest(unittest.TestCase):
    def test_risultato_del_processo(self):
        calls = []

        def run(args, **kwargs):
            calls.append((args, kwargs))
            return Completed(stdout=json.dumps({'version': 2, 'categories': [{'key': 'video', 'label': 'Video'}],
                                                'options': [option('a_filter', default='disabled')]}).encode())

        data = probe('/cores/a_libretro.so', '/giochi/x.zip', run=run)
        self.assertEqual(data['options'][0]['default'], 'disabled')
        self.assertEqual(data['categories'], [{'key': 'video', 'label': 'Video'}])
        args, kwargs = calls[0]
        self.assertEqual(args[-2:], ['/cores/a_libretro.so', '/giochi/x.zip'])
        self.assertTrue(os.path.isabs(kwargs['cwd']))

    def test_errori_del_processo(self):
        self.assertIsNone(probe('/c.so', run=lambda args, **kwargs: Completed(returncode=-11, stderr=b'crash')))
        self.assertIsNone(probe('/c.so', run=lambda args, **kwargs: Completed(stdout=b'non json')))

        def timeout(args, **kwargs):
            raise subprocess.TimeoutExpired(args, 30)

        self.assertIsNone(probe('/c.so', run=timeout))

    def test_clean(self):
        data = clean({'options': [option('a', default='altro'), option('a'), option('b', values=()), {'key': None}],
                      'needsGame': 1})
        # Predefinito sconosciuto = il primo valore; doppioni e opzioni senza valori tolti.
        self.assertEqual([(item['key'], item['default'], item['label']) for item in data['options']],
                         [('a', 'enabled', 'a')])
        self.assertTrue(data['needsGame'])


class SectionsTest(unittest.TestCase):
    def test_categoria_prima_di_tutto(self):
        categories = {'video': {'key': 'video', 'label': 'Video'}, 'audio': {'key': 'audio', 'label': 'Audio'},
                      'av': {'key': 'av', 'label': 'Advanced Audio/Video Settings'}}
        self.assertEqual(option_section(option('x_region', category='video'), categories), GRAPHICS)
        self.assertEqual(option_section(option('x_lcd', category='audio'), categories), AUDIO)
        # Categoria mista: decide l'opzione.
        self.assertEqual(option_section(option('snes9x_layer_1', 'Show Layer 1', 'av'), categories), GRAPHICS)
        self.assertEqual(option_section(option('snes9x_sndchan_volume_1', category='av'), categories), AUDIO)

    def test_chiave_e_nome(self):
        self.assertEqual(option_section(option('fceumm_ntsc_filter'), {}), GRAPHICS)
        self.assertEqual(option_section(option('fceumm_sndquality', 'Qualità Suono'), {}), AUDIO)
        self.assertEqual(option_section(option('beetle_psx_hw_cpu_freq_scale', 'Frequenza CPU'), {}), EMULATION)
        self.assertEqual(option_section(option('beetle_psx_hw_gpu_overclock'), {}), EMULATION)
        self.assertEqual(option_section(option('mupen64plus-pak1', 'Player 1 Pak'), {}), EMULATION)
        self.assertEqual(option_section(option('snes9x_region'), {}), EMULATION)

    def test_senza_dip_switch(self):
        data = {'categories': [{'key': 'video', 'label': 'Video'}],
                'options': [option('fbneo-dipswitch-005-Lives'), option('x', category='video')]}
        self.assertEqual([(item['key'], item['section'], item['group']) for item in sectioned(data)],
                         [('x', GRAPHICS, 'Video')])


class CatalogTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cores = os.path.join(self.tmp.name, 'cores')
        os.makedirs(self.cores)
        self.calls = []
        self.results = {}

    def tearDown(self):
        self.tmp.cleanup()

    def core(self, name, data):
        with open(os.path.join(self.cores, name + '_libretro.so'), 'w') as stream:
            stream.write('core')
        self.results[name] = data

    def probe(self, path, game_path=None):
        self.calls.append((os.path.basename(path), game_path))
        data = self.results[os.path.basename(path)[:-len('_libretro.so')]]
        return data(game_path) if callable(data) else data

    def catalog(self):
        return CoreOptionsCatalog(os.path.join(self.tmp.name, 'cache'), lambda: self.cores, self.probe)

    def test_cache_finche_il_core_non_cambia(self):
        self.core('snes9x', clean({'options': [option('snes9x_blargg', 'Blargg NTSC Filter')]}))
        self.assertEqual(self.catalog().read('snes9x')['options'][0]['section'], GRAPHICS)
        # Un nuovo catalogo legge la cache su file.
        self.assertEqual(self.catalog().read('snes9x')['options'][0]['key'], 'snes9x_blargg')
        self.assertEqual(len(self.calls), 1)
        with open(os.path.join(self.cores, 'snes9x_libretro.so'), 'w') as stream:
            stream.write('core aggiornato')
        self.catalog().read('snes9x')
        self.assertEqual(len(self.calls), 2)

    def test_core_che_vuole_un_gioco(self):
        def fceumm(game_path):
            if not game_path:
                return clean({'options': [], 'needsGame': True})
            return clean({'options': [option('fceumm_palette')]})

        self.core('fceumm', fceumm)
        catalog = self.catalog()
        self.assertIsNone(catalog.read('fceumm'))
        self.assertEqual(catalog.read('fceumm', '/giochi/a.nes')['options'][0]['key'], 'fceumm_palette')
        # Una sola lettura con un gioco vale per tutti i giochi del core.
        catalog.read('fceumm', '/giochi/b.nes')
        self.assertEqual(self.calls, [('fceumm_libretro.so', None), ('fceumm_libretro.so', '/giochi/a.nes')])

    def test_core_mancante_o_illeggibile(self):
        self.assertIsNone(self.catalog().read('manca'))
        self.core('rotto', None)
        catalog = self.catalog()
        self.assertIsNone(catalog.read('rotto'))
        self.assertIsNone(catalog.read('rotto'))
        # La lettura fallita si ricorda.
        self.assertEqual(len(self.calls), 1)


if __name__ == '__main__':
    unittest.main()
