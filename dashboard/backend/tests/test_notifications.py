import os
import subprocess
import tempfile
import unittest

from pixelarcade.notifications import Notifications


class NotificationsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = os.path.join(self.tmp.name, 'notifications-banners')
        self.banners = 'true'
        self.code = 0
        self.calls = []
        self.installed = True
        self.notifications = Notifications(self.state, self.fake_run, self.fake_which)

    def tearDown(self):
        self.tmp.cleanup()

    def fake_which(self, name):
        return '/usr/bin/' + name if self.installed else None

    def fake_run(self, args, **kwargs):
        self.calls.append(args[1:])
        if self.code != 0:
            return subprocess.CompletedProcess(args, self.code, b'', b'No such schema')
        if args[1] == 'set':
            self.banners = args[4]
            return subprocess.CompletedProcess(args, 0, b'', b'')
        return subprocess.CompletedProcess(args, 0, (self.banners + '\n').encode(), b'')

    def test_spente_con_la_dashboard_e_poi_riaccese(self):
        self.notifications.mute()
        self.assertEqual(self.banners, 'false')
        self.assertTrue(os.path.exists(self.state))
        self.notifications.restore()
        self.assertEqual(self.banners, 'true')
        self.assertFalse(os.path.exists(self.state))
        # Una seconda chiusura non fa nulla.
        count = len(self.calls)
        self.notifications.restore()
        self.assertEqual(len(self.calls), count)

    def test_non_disturbare_gia_attivo_resta_com_era(self):
        self.banners = 'false'
        self.notifications.mute()
        self.assertFalse(os.path.exists(self.state))
        self.notifications.restore()
        self.assertEqual(self.banners, 'false')

    def test_dopo_una_chiusura_non_ordinata(self):
        self.notifications.mute()
        # La dashboard si è chiusa male: al nuovo avvio le notifiche sono ancora spente da noi.
        again = Notifications(self.state, self.fake_run, self.fake_which)
        again.mute()
        self.assertTrue(os.path.exists(self.state))
        again.restore()
        self.assertEqual(self.banners, 'true')

    def test_senza_gnome_non_fa_nulla(self):
        self.installed = False
        self.notifications.mute()
        self.notifications.restore()
        self.assertEqual(self.calls, [])
        self.installed = True
        self.code = 1
        self.notifications.mute()
        self.assertFalse(os.path.exists(self.state))


if __name__ == '__main__':
    unittest.main()
