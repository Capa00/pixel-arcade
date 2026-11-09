import os
import subprocess
import tempfile
import unittest

from pixelarcade.config import validate
from pixelarcade.cpu import CpuBoost
from pixelarcade.errors import ConfigError


class FakeConfig:
    def __init__(self):
        self.values = {'play.cpu_boost': True}

    def get(self):
        return self.values


class CpuBoostTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = self.tmp.name
        self.helper = os.path.join(base, 'pixelarcade-cpu')
        with open(self.helper, 'w') as stream:
            stream.write('#!/bin/sh\n')
        self.governor_path = os.path.join(base, 'scaling_governor')
        self.set_governor('schedutil')
        self.state = os.path.join(base, 'cpu-governor')
        self.calls = []
        self.code = 0
        self.config = FakeConfig()
        self.boost = CpuBoost(self.config, self.state, self.sudo_run, self.helper, self.governor_path)

    def tearDown(self):
        self.tmp.cleanup()

    def set_governor(self, name):
        with open(self.governor_path, 'w') as stream:
            stream.write(name + '\n')

    def sudo_run(self, args, **kwargs):
        self.calls.append(args[2:])
        if self.code == 0 and args[2] == self.helper:
            self.set_governor(args[3])
        return subprocess.CompletedProcess(args, self.code, b'', b'')

    def test_al_massimo_durante_la_partita(self):
        self.boost.on()
        self.assertEqual(self.boost.governor(), 'performance')
        self.boost.off()
        self.assertEqual(self.boost.governor(), 'schedutil')
        self.assertEqual(self.calls, [[self.helper, 'performance'], [self.helper, 'schedutil']])
        self.assertFalse(os.path.exists(self.state))
        # Senza partita in corso ``off`` non fa nulla.
        self.boost.off()
        self.assertEqual(len(self.calls), 2)

    def test_impostazione_spenta_o_gia_al_massimo(self):
        self.config.values['play.cpu_boost'] = False
        self.boost.on()
        self.config.values['play.cpu_boost'] = True
        self.set_governor('performance')
        self.boost.on()
        self.boost.off()
        # Era già ``performance`` (messo a mano): resta così.
        self.assertEqual(self.calls, [])
        self.assertEqual(self.boost.governor(), 'performance')

    def test_senza_script_o_senza_permesso(self):
        os.remove(self.helper)
        self.boost.on()
        self.assertEqual(self.calls, [])
        self.assertFalse(self.boost.info()['ready'])
        with open(self.helper, 'w') as stream:
            stream.write('#!/bin/sh\n')
        self.code = 1
        self.boost.on()
        self.assertEqual(self.boost.governor(), 'schedutil')
        self.assertFalse(os.path.exists(self.state))
        self.assertEqual(self.boost.info(), {'ready': False, 'governor': 'schedutil'})
        self.code = 0
        self.assertEqual(self.boost.info(), {'ready': True, 'governor': 'schedutil'})
        self.assertEqual(self.calls[-1], ['-l', self.helper])

    def test_ripristino_dopo_una_chiusura_a_meta_partita(self):
        self.boost.on()
        # Il file annotato resta finché il governor non torna quello di prima.
        self.code = 1
        self.boost.off()
        self.assertTrue(os.path.exists(self.state))
        self.code = 0
        CpuBoost(self.config, self.state, self.sudo_run, self.helper, self.governor_path).off()
        self.assertEqual(self.boost.governor(), 'schedutil')
        self.assertFalse(os.path.exists(self.state))

    def test_impostazione_valida(self):
        self.assertEqual(validate({'play.cpu_boost': False}), {'play.cpu_boost': False})
        for bad in (1, 'sì', None):
            with self.assertRaises(ConfigError):
                validate({'play.cpu_boost': bad})


if __name__ == '__main__':
    unittest.main()
