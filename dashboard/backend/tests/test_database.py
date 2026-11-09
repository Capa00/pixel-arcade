import os
import tempfile
import unittest

from pixelarcade.db import Database
from pixelarcade.db.database import MIGRATIONS_DIR, split_statements
from pixelarcade.errors import DatabaseError


class DatabaseTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, 'test.db')

    def tearDown(self):
        self.tmp.cleanup()

    def make_migrations(self, files):
        directory = os.path.join(self.tmp.name, 'migrations')
        os.makedirs(directory, exist_ok=True)
        for name, text in files.items():
            with open(os.path.join(directory, name), 'w', encoding='utf-8') as stream:
                stream.write(text)
        return directory

    def test_database_nuovo_arriva_all_ultima_versione(self):
        db = Database(self.path)
        self.assertEqual(db.version(), 0)
        self.assertEqual(db.migrate(), 27)
        self.assertEqual(db.version(), 27)
        tables = [row[0] for row in db.query("SELECT name FROM sqlite_master WHERE type = 'table'")]
        for table in ('settings', 'systems', 'system_cores', 'buildbot_cores', 'downloaded_cores', 'game_cores',
                      'core_attempts', 'sessions', 'accounts', 'account_genres', 'session_players', 'favorites',
                      'saves', 'weekly_challenges', 'tournaments', 'tournament_players', 'tournament_matches',
                      'tournament_games', 'tournament_rewards'):
            self.assertIn(table, tables)
        self.assertNotIn('system_cores_new', tables)
        db.close()

    def test_tornei_esistenti_a_eliminazione_diretta(self):
        # Tornei creati prima del formato: diventano a eliminazione diretta con i valori predefiniti.
        files = {}
        for name in sorted(os.listdir(MIGRATIONS_DIR)):
            if name.endswith('.sql') and name < '0022':
                with open(os.path.join(MIGRATIONS_DIR, name), encoding='utf-8') as stream:
                    files[name] = stream.read()
        db = Database(self.path, migrations_dir=self.make_migrations(files))
        self.assertEqual(db.migrate(), 21)
        with db.transaction() as conn:
            conn.execute("INSERT INTO accounts (id, name, color, created_at) VALUES (1, 'ADA', '#ff5d73', 'a')")
            conn.execute("INSERT INTO tournaments (creator_id, status, title, created_at, updated_at) "
                         "VALUES (1, 'open', 'Torneo', 'a', 'a')")
            conn.execute("INSERT INTO tournament_players (tournament_id, account_id, joined_at) VALUES (1, 1, 'a')")
        db.close()
        db = Database(self.path)
        self.assertEqual(db.migrate(), 27)
        self.assertEqual(db.query('SELECT format, options, seeding, seeding_weight, advantaged_side, started_at '
                                  'FROM tournaments'), [('single', '{}', 'random', 50, 'none', None)])
        self.assertEqual(db.query('SELECT seed, group_no, withdrawn_at, place FROM tournament_players'),
                         [(None, None, None, None)])
        # Gli incontri spariscono con il torneo, i premi restano.
        with db.transaction() as conn:
            conn.execute("INSERT INTO tournament_matches (tournament_id, bracket, round, slot, play_order, "
                         "player_a, series, status) VALUES (1, 'main', 1, 0, 1, 1, 1, 'ready')")
            conn.execute("INSERT INTO tournament_games (match_id, game_no, winner_id, side_a, declared_at) "
                         "VALUES (1, 1, 1, 'p1', 'a')")
            conn.execute("INSERT INTO tournament_rewards (account_id, tournament_id, title, place, xp, awarded_at) "
                         "VALUES (1, 1, 'Torneo', 1, 100, 'a')")
            conn.execute('DELETE FROM tournaments WHERE id = 1')
        self.assertEqual(db.query('SELECT COUNT(*) FROM tournament_matches'), [(0,)])
        self.assertEqual(db.query('SELECT COUNT(*) FROM tournament_games'), [(0,)])
        self.assertEqual(db.query('SELECT title, xp FROM tournament_rewards'), [('Torneo', 100)])
        db.close()

    def test_migrazione_da_sprint_04(self):
        # Database dello sprint 04: liste ordinate con i nomi dei file dei core.
        files = {}
        for name in ('0001_settings.sql', '0002_systems_cores.sql'):
            with open(os.path.join(MIGRATIONS_DIR, name), encoding='utf-8') as stream:
                files[name] = stream.read()
        directory = self.make_migrations(files)
        db = Database(self.path, migrations_dir=directory)
        db.migrate()
        with db.transaction() as conn:
            conn.execute("INSERT INTO systems (id, extensions) VALUES ('arcade', 'zip'), ('nes', '')")
            conn.execute("INSERT INTO system_cores (system_id, core, position) VALUES "
                         "('arcade', 'mame_libretro.so', 0), ('arcade', 'fbneo_libretro.so', 1)")
        db.close()
        db = Database(self.path)
        self.assertEqual(db.migrate(), 27)
        self.assertEqual(db.query('SELECT id, extensions, cores_set FROM systems ORDER BY id'),
                         [('arcade', 'zip', 1), ('nes', '', 0)])
        self.assertEqual(db.query('SELECT system_id, core FROM system_cores ORDER BY core'),
                         [('arcade', 'fbneo'), ('arcade', 'mame')])
        with db.transaction() as conn:
            conn.execute("DELETE FROM systems WHERE id = 'arcade'")
        self.assertEqual(db.query('SELECT COUNT(*) FROM system_cores'), [(0,)])
        db.close()

    def test_migrazione_della_grafica(self):
        # Grafica dello sprint precedente: il dettaglio 3D migliorato vince sul livello dell'immagine.
        files = {}
        for name in sorted(os.listdir(MIGRATIONS_DIR)):
            if name.endswith('.sql') and name < '0013':
                with open(os.path.join(MIGRATIONS_DIR, name), encoding='utf-8') as stream:
                    files[name] = stream.read()
        db = Database(self.path, migrations_dir=self.make_migrations(files))
        self.assertEqual(db.migrate(), 12)
        with db.transaction() as conn:
            conn.execute("INSERT INTO graphics (system_id, game_id, image, detail, extras, updated_at) VALUES "
                         "('ps1', '', 'soft', 'max', '{}', 'a'), ('arcade', '', 'smooth', 'original', '{}', 'b')")
        db.close()
        db = Database(self.path)
        self.assertEqual(db.migrate(), 27)
        self.assertEqual(db.query('SELECT system_id, game_id, mode, custom, options FROM game_config ORDER BY system_id'),
                         [('arcade', '', 'smooth', None, '{"retroarch": {}, "cores": {}}'),
                          ('ps1', '', 'max', None, '{"retroarch": {}, "cores": {}}')])
        tables = [row[0] for row in db.query("SELECT name FROM sqlite_master WHERE type = 'table'")]
        self.assertNotIn('graphics', tables)
        db.close()

    def test_migrazione_idempotente(self):
        db = Database(self.path)
        db.migrate()
        with db.transaction() as conn:
            conn.execute("INSERT INTO settings (key, value) VALUES ('a', '1')")
        db.close()
        db = Database(self.path)
        self.assertEqual(db.migrate(), 27)
        self.assertEqual(db.query('SELECT key, value FROM settings'), [('a', '1')])
        db.close()

    def test_migrazione_errata_fa_rollback(self):
        with open(os.path.join(MIGRATIONS_DIR, '0001_settings.sql'), encoding='utf-8') as stream:
            first = stream.read()
        directory = self.make_migrations({
            '0001_settings.sql': first,
            '0002_rotta.sql': 'CREATE TABLE prova (id INTEGER);\nINSERT INTO tabella_inesistente VALUES (1);\n',
        })
        db = Database(self.path, migrations_dir=directory)
        with self.assertRaises(DatabaseError):
            db.migrate()
        self.assertEqual(db.version(), 1)
        tables = [row[0] for row in db.query("SELECT name FROM sqlite_master WHERE type = 'table'")]
        self.assertNotIn('prova', tables)
        db.close()

    def test_pragma(self):
        db = Database(self.path)
        self.assertEqual(db.query('PRAGMA foreign_keys')[0][0], 1)
        self.assertEqual(db.query('PRAGMA journal_mode')[0][0], 'wal')
        db.close()

    def test_integrita(self):
        db = Database(self.path)
        db.migrate()
        self.assertTrue(db.integrity_ok())
        db.close()

    def test_transazione_annullata_su_errore(self):
        db = Database(self.path)
        db.migrate()
        with self.assertRaises(RuntimeError):
            with db.transaction() as conn:
                conn.execute("INSERT INTO settings (key, value) VALUES ('a', '1')")
                raise RuntimeError('interrotta')
        self.assertEqual(db.query('SELECT COUNT(*) FROM settings')[0][0], 0)
        db.close()

    def test_transazioni_annidate(self):
        db = Database(self.path)
        db.migrate()
        with db.transaction() as conn:
            conn.execute("INSERT INTO settings (key, value) VALUES ('a', '1')")
            with db.transaction() as inner:
                inner.execute("INSERT INTO settings (key, value) VALUES ('b', '2')")
        self.assertEqual(db.query('SELECT COUNT(*) FROM settings')[0][0], 2)
        with self.assertRaises(RuntimeError):
            with db.transaction() as conn:
                conn.execute("INSERT INTO settings (key, value) VALUES ('c', '3')")
                with db.transaction() as inner:
                    inner.execute("INSERT INTO settings (key, value) VALUES ('d', '4')")
                    raise RuntimeError('interrotta')
        self.assertEqual(db.query('SELECT COUNT(*) FROM settings')[0][0], 2)
        self.assertEqual(db.depth, 0)
        db.close()

    def test_divisione_istruzioni(self):
        script = '-- commento\nCREATE TABLE a (\n  x TEXT\n);\n\nINSERT INTO a VALUES (\'1;2\');\n'
        self.assertEqual(split_statements(script), ['CREATE TABLE a (\n  x TEXT\n);', "INSERT INTO a VALUES ('1;2');"])


if __name__ == '__main__':
    unittest.main()
