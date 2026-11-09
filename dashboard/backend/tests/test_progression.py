import unittest

from pixelarcade import progression


class ProgressionTest(unittest.TestCase):
    def test_soglie_dei_livelli(self):
        cases = {0: 1, 99: 1, 100: 2, 299: 2, 300: 3, 599: 3, 600: 4}
        for xp, level in cases.items():
            self.assertEqual(progression.level_for(xp), level, xp)
        self.assertEqual([progression.level_floor(level) for level in (1, 2, 3, 4)], [0, 100, 300, 600])

    def test_percentuale(self):
        self.assertEqual(progression.xp_percent(0), 0)
        self.assertEqual(progression.xp_percent(50), 50)
        self.assertEqual(progression.xp_percent(99), 99)
        self.assertEqual(progression.xp_percent(100), 0)
        self.assertEqual(progression.xp_percent(200), 50)

    def test_xp_per_partita(self):
        self.assertEqual(progression.session_xp(19, True), 0)
        self.assertEqual(progression.session_xp(None, True), 0)
        self.assertEqual(progression.session_xp(20, False), 5)
        self.assertEqual(progression.session_xp(20, True), 30)
        self.assertEqual(progression.session_xp(12 * 60 + 59, False), 17)
        self.assertEqual(progression.session_xp(180 * 60, False), 185)
        self.assertEqual(progression.session_xp(500 * 60, True), 210)

    def test_voci_degli_xp(self):
        self.assertEqual(progression.session_parts(19, True), {'minutes': 0, 'session': 0, 'newGame': 0, 'challenge': 0})
        self.assertEqual(progression.session_parts(12 * 60 + 59, False), {'minutes': 12, 'session': 5, 'newGame': 0, 'challenge': 0})
        self.assertEqual(progression.session_parts(500 * 60, True), {'minutes': 180, 'session': 5, 'newGame': 25, 'challenge': 0})

    def test_minuti_doppi_nella_sfida(self):
        self.assertEqual(progression.session_parts(12 * 60 + 59, False, True),
                         {'minutes': 12, 'session': 5, 'newGame': 0, 'challenge': 12})
        self.assertEqual(progression.session_parts(500 * 60, True, True),
                         {'minutes': 180, 'session': 5, 'newGame': 25, 'challenge': 180})
        self.assertEqual(progression.session_parts(19, True, True), {'minutes': 0, 'session': 0, 'newGame': 0, 'challenge': 0})
        self.assertEqual(progression.session_xp(180 * 60, False, True), 365)

    def test_titoli_ai_confini(self):
        cases = {1: 'Recluta', 2: 'Recluta', 3: 'Apprendista', 5: 'Apprendista', 6: 'Giocatore', 9: 'Giocatore',
                 10: 'Veterano', 16: 'Campione', 24: 'Campione', 25: 'Maestro', 34: 'Maestro', 35: 'Leggenda',
                 99: 'Leggenda'}
        for level, title in cases.items():
            self.assertEqual(progression.title_for(level), title, level)


if __name__ == '__main__':
    unittest.main()
