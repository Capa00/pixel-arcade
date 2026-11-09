import os
import tempfile
import time
import unittest
from unittest import mock

from pixelarcade.controls import DescriptorReader
from pixelarcade.db import Database
from pixelarcade.errors import ConflictError, IncompatibleError, LaunchError
from pixelarcade.launcher import MENU_TERMINATE_GRACE
from pixelarcade.play import LATE_STATE_DELAY, LATE_STATE_TIMEOUT, RESTART_GRACE, PlayService, compatible
from pixelarcade.profiles import ProfileService
from pixelarcade.repositories.cores import CoresRepository
from pixelarcade.repositories.profiles import ProfilesRepository
from pixelarcade.repositories.retroachievements import RARepository
from pixelarcade.repositories.saves import SavesRepository
from pixelarcade.repositories.sessions import SessionsRepository
from pixelarcade.repositories.settings import SettingsRepository
from pixelarcade.retroachievements import RAService
from pixelarcade.retroarch_net import PAUSED, PLAYING
from pixelarcade.saves import SaveStore

from tests.fakes import FakeClock, FakeFactory, fake_png

# Il giocatore esce dopo 30 s (partita breve) o dopo 200 s (oltre la conferma automatica).
SHORT = {'exit_after': 30}
LONG = {'exit_after': 200}


class FakeConfig:
    def __init__(self, base, cores):
        self.base = base
        self.cores = cores
        self.extra = {}

    def get(self):
        return dict({'probe.window_seconds': 10, 'probe.auto_confirm_seconds': 120, 'retroarch.command': 'retroarch'},
                    **self.extra)

    def resolve_path(self, key):
        return {
            'paths.roms': os.path.join(self.base, 'games'),
            'paths.cores': os.path.join(self.base, 'retroarch', 'cores'),
            'paths.appendconfig': os.path.join(self.base, 'pixel-arcade.cfg'),
        }[key]

    def candidate_cores(self, system_id):
        return [dict(core) for core in self.cores]

    def installed_cores(self):
        return [core['name'] for core in self.cores if core['installed']]

    def install(self, name):
        for core in self.cores:
            if core['name'] == name:
                core['installed'] = True


class FakeLibrary:
    def __init__(self, cores_repo, games):
        self.cores = cores_repo
        self.games = games
        self.invalidated = 0

    def find(self, system_id, game_id):
        if game_id not in self.games:
            return None
        core, status = self.cores.game_cores_for(system_id).get(game_id, (None, None))
        return {'id': game_id, 'file': game_id.split('/')[-1], 'title': self.games[game_id],
                'core': core, 'coreStatus': status}

    def invalidate(self):
        self.invalidated += 1


class FakeDownloader:
    def __init__(self, config):
        self.config = config
        self.sizes = {}
        self.failing = set()
        self.downloaded = []

    def size(self, core):
        return self.sizes.get(core, 1000)

    def download(self, core, progress, cancel):
        if core in self.failing:
            raise LaunchError('Download di %s non riuscito: rete assente.' % core)
        progress(500, 1000)
        self.config.install(core)
        self.downloaded.append(core)


class RestartControls:
    """Comandi finti: al primo avvio, dopo ``after`` secondi, chiedono il riavvio come «Salva» in partita.

    Con ``quit`` RetroArch si chiude subito (``QUIT``); con ``stop`` l'utente
    interrompe la partita durante il riavvio. ``running`` annota ``running()``
    all'inizio di ogni processo e subito dopo la richiesta.
    """

    def __init__(self, play, clock, after=50, quit=True, stop=False):
        self.play = play
        self.clock = clock
        self.after = after
        self.quit = quit
        self.stop = stop
        self.running = []
        self.ended = 0

    @staticmethod
    def reader():
        return DescriptorReader()

    @staticmethod
    def ensure_device(system_id, game, core, rom_path, controller=None):
        pass

    def game_started(self, job, core, reader, running):
        self.running.append(running())
        if len(self.running) > 1:
            return
        self.clock.now += self.after
        self.play.request_restart()
        self.running.append(running())
        if self.stop:
            self.play.stop()
        elif self.quit:
            self.play.process.quit(0)

    def game_ended(self, job, core, reader):
        self.ended += 1


class FakeNet:
    """Comandi di rete finti: ``status()`` risponde in ordine con ``statuses``, poi con l'ultimo."""

    def __init__(self, statuses):
        self.statuses = list(statuses)
        self.loaded = 0

    def status(self):
        return self.statuses.pop(0) if len(self.statuses) > 1 else self.statuses[0]

    def load_state(self):
        self.loaded += 1


class FakeProcessState:
    returncode = None


def core(name, installed=True, downloadable=True, extensions=('zip',)):
    return {'name': name, 'label': name, 'installed': installed, 'downloadable': downloadable,
            'extensions': list(extensions)}


class PlayTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = self.tmp.name
        os.makedirs(os.path.join(base, 'retroarch', 'cores'))
        with open(os.path.join(base, 'retroarch', 'retroarch.cfg'), 'w') as stream:
            stream.write('input_quit_gamepad_combo = "4"\nquit_press_twice = "true"\nconfig_save_on_exit = "true"\n')
        self.db = Database(os.path.join(base, 'test.db'))
        self.db.migrate()
        self.repo = CoresRepository(self.db)
        self.sessions = SessionsRepository(self.db)
        self.config = FakeConfig(base, [core('fbneo'), core('mame'), core('mame2003_plus')])
        self.library = FakeLibrary(self.repo, {'pang.zip': 'pang', 'sf2.zip': 'sf2'})
        self.downloader = FakeDownloader(self.config)
        self.clock = FakeClock()
        self.scripts = {}
        self.factory = FakeFactory(self.clock, self.scripts)
        self.session = os.path.join(base, 'pixel-arcade-session')
        self.play = PlayService(self.config, self.library, self.repo, self.sessions, self.downloader,
                                self.factory, self.clock, lambda: '2026-09-23T10:00:00+00:00', self.clock.wait,
                                lambda target: target())

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def failing(self, name, code=1):
        self.scripts[name] = {'exit_after': 0.5, 'code': code}

    def status(self, game='pang.zip'):
        return self.repo.game_core('arcade', game)

    def sessions_count(self):
        return self.db.query('SELECT COUNT(*) FROM sessions')[0][0]

    def test_incontro_di_torneo_in_gioco(self):
        self.assertIsNone(self.play.playing_match())
        with self.play.lock:
            self.play.match = {'tournament': 3, 'match': 12}
        # Fuori dalla partita l'incontro non conta.
        self.assertIsNone(self.play.playing_match())
        with self.play.lock:
            self.play.phase = 'running'
        self.assertEqual(self.play.playing_match(), {'tournament': 3, 'match': 12})
        with self.play.lock:
            self.play.reset_state()
        self.assertIsNone(self.play.playing_match())

    def test_joypad_dei_giocatori_nel_file_appendconfig(self):
        with open(os.path.join(self.tmp.name, 'retroarch', 'retroarch.cfg'), 'a') as stream:
            stream.write('input_player1_joypad_index = "0"\ninput_player2_joypad_index = "1"\n')
        self.repo.set_game_core('arcade', 'pang.zip', 'fbneo', 'ok', 'manual')
        self.scripts['fbneo'] = SHORT
        self.play.start('arcade', 'pang.zip', [None, None], [1, 0])
        with open(os.path.join(self.tmp.name, 'pixel-arcade.cfg')) as stream:
            lines = stream.read().splitlines()
        self.assertIn('input_player1_joypad_index = "1"', lines)
        self.assertIn('input_player2_joypad_index = "0"', lines)
        self.play.start('arcade', 'pang.zip')
        with open(os.path.join(self.tmp.name, 'pixel-arcade.cfg')) as stream:
            self.assertNotIn('joypad_index', stream.read())

    def test_uscita_dal_gioco_nel_file_appendconfig(self):
        self.repo.set_game_core('arcade', 'pang.zip', 'fbneo', 'ok', 'manual')
        self.scripts['fbneo'] = SHORT
        self.play.start('arcade', 'pang.zip')
        self.assertIn('input_quit_gamepad_combo = "7"', self.appendconfig())
        for value, expected in (('hold_select', '8'), ('start_select', '4')):
            self.config.extra['input.quit_combo'] = value
            self.play.start('arcade', 'pang.zip')
            self.assertIn('input_quit_gamepad_combo = "%s"' % expected, self.appendconfig())

    def test_menu_rapido_nel_file_appendconfig(self):
        with open(os.path.join(self.tmp.name, 'retroarch', 'retroarch.cfg'), 'a') as stream:
            stream.write('input_menu_toggle_gamepad_combo = "0"\nauto_overrides_enable = "true"\n')
        self.repo.set_game_core('arcade', 'pang.zip', 'fbneo', 'ok', 'manual')
        self.scripts['fbneo'] = SHORT
        self.config.extra['input.menu_combo'] = 'l1_r1_start_select'
        self.play.start('arcade', 'pang.zip')
        self.assertIn('input_menu_toggle_gamepad_combo = "3"', self.appendconfig())
        self.assertIn('auto_overrides_enable = "false"', self.appendconfig())
        # Un'uscita START+SELECT (del gioco o della console) spegne il menu che la contiene.
        self.config.extra['input.quit_combo'] = 'start_select'
        self.play.start('arcade', 'pang.zip')
        self.assertIn('input_menu_toggle_gamepad_combo = "0"', self.appendconfig())
        self.config.extra['input.menu_combo'] = 'l2_r2'
        self.play.start('arcade', 'pang.zip')
        self.assertIn('input_menu_toggle_gamepad_combo = "10"', self.appendconfig())

    def with_profiles(self):
        service = ProfileService(ProfilesRepository(self.db), self.sessions, self.library,
                                 lambda: '2026-09-23T10:00:00+00:00')
        self.play.profiles = service
        return service

    def appendconfig(self):
        with open(os.path.join(self.tmp.name, 'pixel-arcade.cfg')) as stream:
            return stream.read().splitlines()

    def test_xp_ai_giocatori_registrati(self):
        profiles = self.with_profiles()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        sara = profiles.create('SARA', '#3ccfc4')['id']
        self.repo.set_game_core('arcade', 'pang.zip', 'fbneo', 'ok', 'manual')
        self.scripts['fbneo'] = SHORT
        state = self.play.start('arcade', 'pang.zip', [luca, sara])
        players = state['lastResult']['players']
        self.assertEqual(players[str(luca)], {
            'slot': 'p1', 'xpGained': 30, 'levelBefore': 1, 'levelAfter': 1, 'title': 'Recluta',
            'titleBefore': 'Recluta', 'percentBefore': 0, 'percentAfter': 30,
            'parts': {'minutes': 0, 'session': 5, 'newGame': 25, 'challenge': 0}})
        self.assertEqual(set(players), {str(luca), str(sara)})
        # Un ospite (null) non riceve nulla; una partita sotto i 20 s non conta.
        self.scripts['fbneo'] = {'exit_after': 10}
        state = self.play.start('arcade', 'pang.zip', [None, luca])
        self.assertEqual(state['lastResult']['players'], {})
        self.assertEqual(profiles.public(profiles.account(luca))['sessions'], 1)

    def test_xp_dopo_la_domanda_si(self):
        profiles = self.with_profiles()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        self.scripts['fbneo'] = SHORT
        state = self.play.start('arcade', 'pang.zip', [luca, None])
        self.assertEqual(state['phase'], 'verdict')
        self.assertEqual(state['lastResult']['players'][str(luca)]['xpGained'], 30)
        state = self.play.verdict('arcade', 'pang.zip', True)
        self.assertEqual(state['lastResult']['players'][str(luca)]['xpGained'], 30)

    def with_retroachievements(self):
        """Profili LUCA (collegato a RetroAchievements) e SARA; ``retroarch.cfg`` con le chiavi ``cheevos_*``."""
        with open(os.path.join(self.tmp.name, 'retroarch', 'retroarch.cfg'), 'a') as stream:
            for key in ('cheevos_enable', 'cheevos_username', 'cheevos_token', 'cheevos_password',
                        'cheevos_hardcore_mode_enable', 'cheevos_start_active', 'cheevos_test_unofficial'):
                stream.write('%s = ""\n' % key)
        profiles = self.with_profiles()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        sara = profiles.create('SARA', '#3ccfc4')['id']
        repo = RARepository(self.db)
        repo.link(luca, 'Player1', 'tok3n', '2026-10-01T18:00:00+00:00')
        self.play.ra = RAService(repo, SettingsRepository(self.db), None, ProfilesRepository(self.db),
                                 now=lambda: '2026-10-01T18:00:00+00:00')
        self.repo.set_game_core('arcade', 'pang.zip', 'fbneo', 'ok', 'manual')
        return repo, luca, sara

    def test_account_retroachievements_del_p1(self):
        repo, luca, sara = self.with_retroachievements()
        self.scripts['fbneo'] = SHORT
        self.play.start('arcade', 'pang.zip', [luca, sara])
        lines = self.appendconfig()
        self.assertIn('cheevos_enable = "true"', lines)
        self.assertIn('cheevos_username = "Player1"', lines)
        self.assertIn('cheevos_token = "tok3n"', lines)
        self.assertIn('cheevos_hardcore_mode_enable = "false"', lines)
        # Il file con il token è leggibile solo dal proprietario.
        self.assertEqual(os.stat(os.path.join(self.tmp.name, 'pixel-arcade.cfg')).st_mode & 0o777, 0o600)
        # Se P1 è SARA (senza account) i trofei restano spenti.
        self.play.start('arcade', 'pang.zip', [sara, luca])
        lines = self.appendconfig()
        self.assertIn('cheevos_enable = "false"', lines)
        self.assertFalse([line for line in lines if 'tok3n' in line])

    def test_trofei_della_partita_ai_due_giocatori(self):
        repo, luca, sara = self.with_retroachievements()
        self.scripts['fbneo'] = dict(SHORT, lines=[
            '[INFO] [RCHEEVOS] Identified game: 7 "Pang" (02bbe063efc4b8883206c66e6cb775c9)',
            '[INFO] [RCHEEVOS] Awarding achievement 41: Primo livello'])
        state = self.play.start('arcade', 'pang.zip', [luca, sara])
        self.assertEqual(state['lastResult']['achievements'], {
            'unlocks': [{'id': 41, 'title': 'Primo livello', 'at': '2026-10-01T18:00:00+00:00'}], 'earner': luca})
        self.assertEqual([item['earnerId'] for item in repo.unlocks(sara)], [luca])
        self.assertEqual(repo.game('arcade', 'pang.zip')['raGameId'], 7)
        # Senza trofei nel log il risultato è vuoto.
        self.scripts['fbneo'] = SHORT
        state = self.play.start('arcade', 'pang.zip', [luca, sara])
        self.assertEqual(state['lastResult']['achievements'], {'unlocks': [], 'earner': None})

    def test_sfida_trofeo(self):
        repo, luca, sara = self.with_retroachievements()
        self.with_saves()
        self.config.install('mame')
        state = os.path.join(self.tmp.name, 'sfida.state')
        with open(state, 'wb') as stream:
            stream.write(b'sfida')
        calls = []

        class FakeChallenges:
            def started(self, game, core, players, challenge, paused, pending):
                calls.append(('started', game['id'], core, challenge))

            def awarded(self, item):
                calls.append(('awarded', item['id']))

            def finished(self, players, achievements, ra_game_id):
                calls.append(('finished', ra_game_id))
                return {'challenge': {'id': 5, 'won': True}}

        self.play.challenges = FakeChallenges()
        self.scripts['mame'] = dict(SHORT, lines=[
            '[INFO] [RCHEEVOS] Identified game: 7 "Pang" (02bbe063efc4b8883206c66e6cb775c9)',
            '[INFO] [RCHEEVOS] Awarding achievement 41: Primo livello'])
        self.scripts['mame']['session'] = self.session
        self.scripts['mame']['files'] = {'pang.state.auto': b'dopo la sfida'}
        result = self.play.start('arcade', 'pang.zip', [luca, sara],
                                 challenge={'id': 5, 'core': 'mame', 'state': state})
        # Core della sfida al posto di quello associato, stato della sfida ed Encore dei trofei.
        process = self.factory.created[-1]
        self.assertEqual(process.core, 'mame')
        self.assertEqual(process.found, ['pang.state.auto'])
        self.assertIn('cheevos_start_active = "true"', self.appendconfig())
        # Il RetroArch finto scrive tutto il log appena parte: l'ordine tra inizio e trofeo non conta.
        self.assertEqual(sorted(calls[:2], key=str), [('awarded', 41), ('started', 'pang.zip', 'mame', 5)])
        self.assertEqual(calls[2], ('finished', 7))
        last = self.play.state()['lastResult']
        self.assertEqual(last['challenge'], {'id': 5, 'won': True})
        # La partita della sfida non diventa il «Riprendi» di nessuno.
        self.assertEqual(last['saved'], [])
        self.assertIsNone(self.saves.state_file(luca, 'arcade', 'pang.zip', 0))
        # Nelle partite normali l'Encore resta spento.
        self.scripts['fbneo'] = SHORT
        self.play.start('arcade', 'pang.zip', [luca, sara])
        self.assertIn('cheevos_start_active = "false"', self.appendconfig())

    def test_preferenze_di_p1_nel_file_appendconfig(self):
        with open(os.path.join(self.tmp.name, 'retroarch', 'retroarch.cfg'), 'a') as stream:
            stream.write('savestate_auto_save = "false"\nsavestate_auto_load = "false"\ninput_rumble_gain = "100"\n'
                         'savestate_directory = "~/states"\n')
        profiles = self.with_profiles()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        profiles.update(luca, {'opts': {'save': False, 'vib': False}})
        self.repo.set_game_core('arcade', 'pang.zip', 'fbneo', 'ok', 'manual')
        self.scripts['fbneo'] = SHORT
        self.play.start('arcade', 'pang.zip', [luca, None])
        lines = self.appendconfig()
        # Lo stato automatico non dipende più dal profilo: è sempre attivo, nella cartella di sessione.
        self.assertIn('savestate_auto_save = "true"', lines)
        self.assertIn('savestate_auto_load = "true"', lines)
        self.assertIn('savestate_directory = "%s"' % self.session, lines)
        self.assertIn('input_rumble_gain = "0"', lines)
        # Ospite come P1: valori predefiniti.
        self.play.start('arcade', 'pang.zip', [None, luca])
        lines = self.appendconfig()
        self.assertIn('input_rumble_gain = "100"', lines)

    def test_configurazione_prima_di_ogni_avvio(self):
        with open(os.path.join(self.tmp.name, 'retroarch', 'retroarch.cfg'), 'a') as stream:
            stream.write('video_smooth = "false"\n')
        play = self.play

        class GameConfig:
            calls = []

            @staticmethod
            def launch_options(system_id, game_id):
                return [('video_smooth', 'true')], '/s/xbr.glslp'

            @classmethod
            def apply_core(cls, system_id, game_id, core, rom_path):
                cls.calls.append((system_id, game_id, core, os.path.basename(rom_path), play.shader))

        self.play.gameconfig = GameConfig
        self.failing('fbneo')
        self.scripts['mame'] = SHORT
        self.play.start('arcade', 'pang.zip')
        self.assertIn('video_smooth = "true"', self.appendconfig())
        # Il .opt si scrive per ogni core provato, con lo shader già scelto.
        self.assertEqual(GameConfig.calls, [('arcade', 'pang.zip', 'fbneo', 'pang.zip', '/s/xbr.glslp'),
                                          ('arcade', 'pang.zip', 'mame', 'pang.zip', '/s/xbr.glslp')])

    def test_configurazione_con_errori_non_ferma_l_avvio(self):
        class Broken:
            @staticmethod
            def launch_options(system_id, game_id):
                raise OSError('disco pieno')

            apply_core = launch_options

        self.play.gameconfig = Broken
        self.repo.set_game_core('arcade', 'pang.zip', 'fbneo', 'ok', 'manual')
        self.scripts['fbneo'] = SHORT
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(state['lastResult']['message'], 'Partita terminata')

    def test_cartella_dei_bios_a_ogni_avvio(self):
        with open(os.path.join(self.tmp.name, 'retroarch', 'retroarch.cfg'), 'a') as stream:
            stream.write('system_directory = "~/.config/retroarch/system"\nsystemfiles_in_content_dir = "true"\n')

        class Bios:
            @staticmethod
            def retroarch_options():
                return [('system_directory', '/s/system'), ('systemfiles_in_content_dir', 'false')]

        self.play.bios = Bios
        self.repo.set_game_core('arcade', 'pang.zip', 'fbneo', 'ok', 'manual')
        self.scripts['fbneo'] = SHORT
        self.play.start('arcade', 'pang.zip')
        lines = self.appendconfig()
        self.assertIn('system_directory = "/s/system"', lines)
        self.assertIn('systemfiles_in_content_dir = "false"', lines)

        class Broken:
            @staticmethod
            def retroarch_options():
                raise OSError('retroarch.cfg illeggibile')

        self.play.bios = Broken
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(state['lastResult']['message'], 'Partita terminata')
        self.assertNotIn('systemfiles_in_content_dir = "false"', self.appendconfig())

    # --- Salvataggi ------------------------------------------------------------

    def with_saves(self):
        profiles = self.with_profiles()
        self.saves = SaveStore(os.path.join(self.tmp.name, 'data'), SavesRepository(self.db),
                               lambda: '2026-10-01T10:00:00+00:00')
        self.play.saves = self.saves
        self.repo.set_game_core('arcade', 'pang.zip', 'fbneo', 'ok', 'manual')
        return profiles

    def game_files(self, files, exit_after=30):
        self.scripts['fbneo'] = {'exit_after': exit_after, 'session': self.session, 'files': files}

    def test_riprendi_a_tutti_i_profili(self):
        profiles = self.with_saves()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        sara = profiles.create('SARA', '#3ccfc4')['id']
        self.game_files({'pang.state.auto': b'stato', 'pang.state.auto.png': fake_png()})
        state = self.play.start('arcade', 'pang.zip', [luca, sara])
        self.assertEqual(state['lastResult']['saved'], [luca, sara])
        for account in (luca, sara):
            with open(self.saves.state_file(account, 'arcade', 'pang.zip', 0), 'rb') as stream:
                self.assertEqual(stream.read(), b'stato')
            self.assertIsNotNone(self.saves.thumb_file(account, 'arcade', 'pang.zip', 0))
            self.assertEqual(self.saves.repo.get(account, 'arcade', 'pang.zip', 0)['core'], 'fbneo')

    def test_registrazione_dello_stato_di_un_torneo(self):
        profiles = self.with_saves()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        # Salvataggio interno del profilo (personaggi sbloccati) e uno slot.
        profile_sram = os.path.join(self.tmp.name, 'profilo')
        os.makedirs(profile_sram)
        with open(os.path.join(profile_sram, 'pang.srm'), 'wb') as stream:
            stream.write(b'profilo')
        self.saves.keep_sram(luca, 'arcade', 'pang.zip', profile_sram, 'pang')
        slot_state = os.path.join(self.tmp.name, 'slot.state')
        with open(slot_state, 'wb') as stream:
            stream.write(b'slot')
        self.saves.store_state(luca, 'arcade', 'pang.zip', 2, 'fbneo', slot_state)
        calls = []

        class FakeTournaments:
            def recorded(self, tournament_id, system_id, game_id, core, state_path, src_dir, basename):
                with open(state_path, 'rb') as stream:
                    calls.append((tournament_id, system_id, game_id, core, stream.read(), basename))
                return {'recorded': True}

        self.play.tournaments = FakeTournaments()
        self.game_files({'pang.state.auto': b'scelta personaggi', 'pang.srm': b'dopo'})
        # Da zero: niente salvataggio interno del profilo.
        state = self.play.start('arcade', 'pang.zip', [luca, None], tournament={'id': 9, 'sram': 'none'})
        self.assertEqual(self.factory.created[-1].found, [])
        self.assertEqual(calls, [(9, 'arcade', 'pang.zip', 'fbneo', b'scelta personaggi', 'pang')])
        last = state['lastResult']
        self.assertEqual(last['tournament'], {'recorded': True})
        self.assertEqual(last['saved'], [])
        self.assertFalse(last['noState'])
        # Con i miei dati: il salvataggio interno del profilo; da uno slot: anche il suo stato.
        self.play.start('arcade', 'pang.zip', [luca, None], tournament={'id': 9, 'sram': 'profile'})
        self.assertEqual(self.factory.created[-1].found, ['pang.srm'])
        self.play.start('arcade', 'pang.zip', [luca, None], resume={'account': luca, 'slot': 2},
                        tournament={'id': 9, 'sram': 'profile'})
        self.assertEqual(sorted(self.factory.created[-1].found), ['pang.srm', 'pang.state.auto'])
        # Niente «Riprendi» e salvataggio interno del profilo invariato.
        self.assertIsNone(self.saves.state_file(luca, 'arcade', 'pang.zip', 0))
        with open(os.path.join(self.saves.sram_dir(luca, 'arcade', 'pang.zip'), 'srm'), 'rb') as stream:
            self.assertEqual(stream.read(), b'profilo')

    def test_partita_di_un_incontro_di_torneo(self):
        repo, luca, sara = self.with_retroachievements()
        self.saves = SaveStore(os.path.join(self.tmp.name, 'data'), SavesRepository(self.db),
                               lambda: '2026-10-01T10:00:00+00:00')
        self.play.saves = self.saves
        self.config.install('mame')
        # Salvataggio interno del P1 e del torneo, stato di partenza del torneo.
        profile_sram = os.path.join(self.tmp.name, 'profilo')
        os.makedirs(profile_sram)
        with open(os.path.join(profile_sram, 'pang.srm'), 'wb') as stream:
            stream.write(b'profilo')
        self.saves.keep_sram(luca, 'arcade', 'pang.zip', profile_sram, 'pang')
        sram = os.path.join(self.tmp.name, 'torneo-sram')
        os.makedirs(sram)
        with open(os.path.join(sram, 'srm'), 'wb') as stream:
            stream.write(b'torneo')
        state = os.path.join(self.tmp.name, 'torneo.state')
        with open(state, 'wb') as stream:
            stream.write(b'partenza')
        ended = []
        challenges = []

        class FakeRun:
            def match_ended(self, match_id, session_id):
                ended.append((match_id, session_id))

            def game_started(self, match, core):
                ended.append(('started', match['match']))

            def auto_declare(self, match, core):
                return None

        class FakeChallenges:
            def started(self, *args):
                challenges.append('started')

            def finished(self, *args):
                challenges.append('finished')
                return {}

        self.play.tournament_run = FakeRun()
        self.play.challenges = FakeChallenges()
        self.scripts['mame'] = dict(SHORT, session=self.session,
                                    files={'pang.state.auto': b'fine', 'pang.srm': b'dopo la partita'})
        match = {'tournament': 3, 'match': 12, 'gameNo': 1, 'sideA': 'p2', 'savesLocked': True, 'state': state,
                 'core': 'mame', 'sram': sram}
        seen = []
        self.play.add_end_listener(lambda: seen.append(self.play.ingame_info()['match']))
        result = self.play.start('arcade', 'pang.zip', [sara, luca], match=match)
        # Core e stato del torneo, salvataggio interno del torneo (non quello del P1), trofei spenti.
        process = self.factory.created[-1]
        self.assertEqual(process.core, 'mame')
        self.assertEqual(process.found_data, {'pang.state.auto': b'partenza', 'pang.srm': b'torneo'})
        self.assertIn('cheevos_enable = "false"', self.appendconfig())
        self.assertEqual(seen, [{'tournament': 3, 'match': 12, 'gameNo': 1, 'savesLocked': True}])
        self.assertEqual(challenges, [])
        last = result['lastResult']
        self.assertEqual((last['kind'], last['match']), ('match', {'tournament': 3, 'match': 12, 'gameNo': 1,
                                                                'declared': None}))
        self.assertEqual(last['saved'], [])
        self.assertTrue(all(value['xpGained'] > 0 for value in last['players'].values()))
        self.assertEqual(set(last['players']), {str(luca), str(sara)})
        self.assertIsNone(self.play.playing_match())
        # Sessione col torneo, nella cronologia e nelle statistiche.
        session_id = self.db.query('SELECT MAX(id) FROM sessions')[0][0]
        self.assertEqual(ended, [('started', 12), (12, session_id)])
        self.assertEqual(self.db.query('SELECT tournament_id FROM sessions WHERE id = ?', (session_id,))[0][0], 3)
        self.assertEqual(self.sessions.stats(luca)['sessions'], 1)
        self.assertEqual(self.sessions.history(luca)[0]['tournament'], {'id': 3, 'title': None})
        # Niente «Riprendi» e salvataggio interno del profilo e del torneo invariati.
        self.assertIsNone(self.saves.state_file(luca, 'arcade', 'pang.zip', 0))
        self.assertIsNone(self.saves.state_file(sara, 'arcade', 'pang.zip', 0))
        with open(os.path.join(self.saves.sram_dir(luca, 'arcade', 'pang.zip'), 'srm'), 'rb') as stream:
            self.assertEqual(stream.read(), b'profilo')
        with open(os.path.join(sram, 'srm'), 'rb') as stream:
            self.assertEqual(stream.read(), b'torneo')
        # Rigiocando si riparte dallo stesso stato e dallo stesso salvataggio interno.
        self.play.start('arcade', 'pang.zip', [sara, luca], match=dict(match, sideA='p1'))
        self.assertEqual(self.factory.created[-1].found_data, {'pang.state.auto': b'partenza', 'pang.srm': b'torneo'})

    def test_incontro_senza_stato_di_partenza(self):
        self.with_saves()
        self.config.install('mame')
        self.scripts['fbneo'] = dict(SHORT, session=self.session)
        match = {'tournament': 3, 'match': 12, 'gameNo': 1, 'sideA': 'p1', 'savesLocked': False, 'state': None,
                 'core': None, 'sram': os.path.join(self.tmp.name, 'manca')}
        self.play.start('arcade', 'pang.zip', [None, None], match=match)
        # Si parte dall'inizio col core del gioco, senza salvataggio interno.
        self.assertEqual(self.factory.created[-1].core, 'fbneo')
        self.assertEqual(self.factory.created[-1].found, [])
        self.assertEqual(self.play.state()['lastResult']['kind'], 'match')
        with self.assertRaisesRegex(LaunchError, 'non è installato'):
            self.play.start('arcade', 'pang.zip', [None, None], match=dict(match, state='x.state', core='assente'))

    def with_rescue(self, reason=None):
        test = self
        chosen = os.path.join(self.tmp.name, 'scelto.state')
        with open(chosen, 'wb') as stream:
            stream.write(b'periodico')

        class FakeRescue:
            def __init__(self):
                self.calls = []
                self.reason = reason

            def started(self, info, core, pending):
                self.calls.append(('started', info['game']['id'], core, pending()))

            def check(self, final_png, requested):
                self.calls.append(('check', bool(final_png), requested))
                return self.reason

            def open(self, why, final):
                self.calls.append(('open', why, bool(final)))
                return {'reason': why, 'final': bool(final), 'items': [{'id': 'r0', 'at': 'x', 'thumb': False,
                                                                         'run': True}]}

            def clean_end(self):
                self.calls.append('clean')

            def chosen(self, choice):
                test.assertIn(choice, ('r0', 'previous'))
                return None if choice == 'previous' else (chosen, None, 'fbneo')

            def close(self, choice):
                self.calls.append(('close', choice))

        self.play.rescue = FakeRescue()
        return self.play.rescue

    def test_soccorso_dopo_un_blocco(self):
        profiles = self.with_saves()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        rescue = self.with_rescue()
        self.game_files({'pang.state.auto': b'buono'})
        state = self.play.start('arcade', 'pang.zip', [luca, None])
        self.assertEqual(state['lastResult']['saved'], [luca])
        self.assertEqual(rescue.calls, [('started', 'pang.zip', 'fbneo', False), ('check', True, False), 'clean'])
        with self.assertRaises(ConflictError):
            self.play.answer_rescue('r0')
        with self.assertRaises(ConflictError):
            self.play.request_rescue()
        # Indizi di blocco: il «Riprendi» aspetta la scelta.
        rescue.reason = 'suspect'
        rescue.calls = []
        self.game_files({'pang.state.auto': b'bloccato'})
        state = self.play.start('arcade', 'pang.zip', [luca, None])
        self.assertEqual(state['phase'], 'rescue')
        self.assertEqual(state['message'], 'Il gioco era bloccato?')
        self.assertEqual((state['question']['reason'], state['question']['id'], state['question']['core']),
                         ('suspect', 'pang.zip', 'fbneo'))
        self.assertEqual(state['lastResult']['saved'], [])
        self.assertFalse(self.play.playing())
        self.assertTrue(self.play.busy())
        self.assertIn(('open', 'suspect', True), rescue.calls)
        self.assertNotIn('clean', rescue.calls)
        with open(self.saves.state_file(luca, 'arcade', 'pang.zip', 0), 'rb') as stream:
            self.assertEqual(stream.read(), b'buono')
        # Lo stato scelto: la partita riparte da lì, il «Riprendi» non cambia.
        created = len(self.factory.created)
        state = self.play.answer_rescue('r0')
        self.assertIn(('close', 'r0'), rescue.calls)
        self.assertEqual(len(self.factory.created), created + 1)
        self.assertEqual(self.factory.created[-1].found, ['pang.state.auto'])
        with open(self.saves.state_file(luca, 'arcade', 'pang.zip', 0), 'rb') as stream:
            self.assertEqual(stream.read(), b'buono')
        # Bloccata anche lei: si torna a scegliere.
        self.assertEqual(state['phase'], 'rescue')
        # B durante il soccorso: il «Riprendi» resta quello di prima.
        state = self.play.stop()
        self.assertEqual((state['phase'], state['lastResult']['saved']), ('idle', []))
        self.assertEqual(rescue.calls[-1], ('close', 'previous'))
        rescue.reason = 'combo'
        state = self.play.start('arcade', 'pang.zip', [luca, None])
        self.assertEqual(state['message'], 'Da dove vuoi riprendere?')
        self.play.stop()
        with open(self.saves.state_file(luca, 'arcade', 'pang.zip', 0), 'rb') as stream:
            self.assertEqual(stream.read(), b'buono')
        # Lo stato scelto funziona: all'uscita diventa il «Riprendi» come sempre.
        state = self.play.start('arcade', 'pang.zip', [luca, None])
        rescue.reason = None
        self.game_files({'pang.state.auto': b'ripreso'})
        state = self.play.answer_rescue('r0')
        self.assertEqual((state['phase'], state['lastResult']['saved']), ('idle', [luca]))
        with open(self.saves.state_file(luca, 'arcade', 'pang.zip', 0), 'rb') as stream:
            self.assertEqual(stream.read(), b'ripreso')

    def test_soccorso_solo_con_profili(self):
        self.with_saves()
        rescue = self.with_rescue('suspect')
        self.game_files({'pang.state.auto': b'stato'})
        state = self.play.start('arcade', 'pang.zip', [None, None])
        self.assertEqual(state['phase'], 'idle')
        self.assertNotIn('open', [call[0] for call in rescue.calls if isinstance(call, tuple)])

    def test_riprendi_senza_ospiti_e_partite_brevi(self):
        profiles = self.with_saves()
        sara = profiles.create('SARA', '#3ccfc4')['id']
        self.game_files({'pang.state.auto': b'stato'})
        state = self.play.start('arcade', 'pang.zip', [None, sara])
        self.assertEqual(state['lastResult']['saved'], [sara])
        self.assertFalse(os.path.exists(os.path.join(self.tmp.name, 'data', 'saves', 'ospiti')))
        # Partita sotto i 20 s: il «Riprendi» resta quello di prima.
        self.game_files({'pang.state.auto': b'breve'}, exit_after=10)
        state = self.play.start('arcade', 'pang.zip', [sara, 999])
        self.assertEqual(state['lastResult']['saved'], [])
        with open(self.saves.state_file(sara, 'arcade', 'pang.zip', 0), 'rb') as stream:
            self.assertEqual(stream.read(), b'stato')
        # Senza stato automatico (RetroArch chiuso con SIGKILL) non si conserva nulla.
        self.game_files({})
        state = self.play.start('arcade', 'pang.zip', [sara, None])
        self.assertEqual(state['lastResult']['saved'], [])

    def test_cartella_di_sessione_svuotata_e_salvataggio_interno_del_p1(self):
        profiles = self.with_saves()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        sara = profiles.create('SARA', '#3ccfc4')['id']
        os.makedirs(self.session)
        with open(os.path.join(self.session, 'vecchio.state.auto'), 'wb') as stream:
            stream.write(b'altro giocatore')
        self.game_files({'pang.srm': b'batteria luca', 'pang.state.auto': b'stato'})
        self.play.start('arcade', 'pang.zip', [luca, sara])
        self.assertEqual(self.factory.created[-1].found, [])
        # Di nuovo con P1 = LUCA: il suo salvataggio interno è nella cartella prima dell'avvio.
        self.game_files({}, exit_after=10)
        self.play.start('arcade', 'pang.zip', [luca, None])
        self.assertEqual(self.factory.created[-1].found, ['pang.srm'])
        # Con P1 = SARA non c'è; con P1 ospite si usa la cartella comune.
        self.game_files({'pang.srm': b'batteria ospite'}, exit_after=10)
        self.play.start('arcade', 'pang.zip', [sara, luca])
        self.assertEqual(self.factory.created[-1].found, [])
        self.play.start('arcade', 'pang.zip', [None, luca])
        self.play.start('arcade', 'pang.zip', [None, None])
        self.assertEqual(self.factory.created[-1].found, ['pang.srm'])
        with open(os.path.join(self.saves.sram_dir(luca, 'arcade', 'pang.zip'), 'srm'), 'rb') as stream:
            self.assertEqual(stream.read(), b'batteria luca')
        self.assertTrue(os.path.isfile(os.path.join(self.saves.sram_dir(sara, 'arcade', 'pang.zip'), 'srm')))

    def test_ricerca_svuota_la_cartella_tra_un_core_e_l_altro(self):
        self.with_saves()
        self.repo.reset_game_core('arcade', 'pang.zip')
        self.scripts['fbneo'] = {'exit_after': 0.5, 'code': 1, 'session': self.session,
                                 'files': {'pang.state.auto': b'fbneo'}}
        self.scripts['mame'] = {'exit_after': 30, 'session': self.session}
        state = self.play.start('arcade', 'pang.zip', [None, None])
        self.assertEqual(state['phase'], 'verdict')
        self.assertEqual(self.factory.created[-1].core, 'mame')
        self.assertEqual(self.factory.created[-1].found, [])

    def store_slot(self, account, slot, core, data=b'scelto'):
        path = os.path.join(self.tmp.name, 'stato-prova')
        with open(path, 'wb') as stream:
            stream.write(data)
        self.saves.store_state(account, 'arcade', 'pang.zip', slot, core, path)

    def test_avvio_da_uno_stato(self):
        profiles = self.with_saves()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        sara = profiles.create('SARA', '#3ccfc4')['id']
        self.store_slot(sara, 4, 'fbneo')
        self.game_files({}, exit_after=10)
        self.play.start('arcade', 'pang.zip', [luca, sara], resume={'account': sara, 'slot': 4})
        process = self.factory.created[-1]
        self.assertEqual(process.found, ['pang.state.auto'])
        # Senza ``resume`` la cartella resta vuota.
        self.play.start('arcade', 'pang.zip', [luca, sara])
        self.assertEqual(self.factory.created[-1].found, [])

    def test_stato_copiato_con_il_nome_del_gioco(self):
        profiles = self.with_saves()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        self.store_slot(luca, 0, 'fbneo', b'riprendi')
        copies = []
        original = self.saves.copy_to_session

        def spy(*args):
            path = original(*args)
            with open(path, 'rb') as stream:
                copies.append((os.path.basename(path), stream.read()))
            return path

        self.game_files({}, exit_after=10)
        with mock.patch.object(self.saves, 'copy_to_session', side_effect=spy):
            self.play.start('arcade', 'pang.zip', [luca, None], resume={'account': luca, 'slot': 0})
        self.assertEqual(copies, [('pang.state.auto', b'riprendi')])

    def late_core(self, statuses=(PLAYING,), run=True):
        """``fbneo`` come core di ``LATE_STATE_CORES``; la funzione rimandata parte con RetroArch se ``run``."""
        net = FakeNet(statuses)
        self.play.net_factory = lambda: net

        def later(target):
            process = self.factory.created[-1]
            start = process.start

            def started():
                start()
                if run:
                    target()
                return process

            process.start = started

        self.play.later = later
        patcher = mock.patch('pixelarcade.play.LATE_STATE_CORES', frozenset(('fbneo',)))
        patcher.start()
        self.addCleanup(patcher.stop)
        return net

    def slot_data(self, account):
        with open(self.saves.state_file(account, 'arcade', 'pang.zip', 0), 'rb') as stream:
            return stream.read()

    def test_stato_caricato_a_gioco_partito(self):
        profiles = self.with_saves()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        self.store_slot(luca, 0, 'fbneo', b'riprendi')
        net = self.late_core((None, PAUSED, PLAYING))
        self.game_files({'pang.state.auto': b'nuovo'})
        state = self.play.start('arcade', 'pang.zip', [luca, None], resume={'account': luca, 'slot': 0})
        # Niente stato automatico all'avvio: lo stato va nello slot di lavoro e si carica dopo ``PLAYING``.
        self.assertEqual(self.factory.created[-1].found, ['pang.state'])
        self.assertEqual(net.loaded, 1)
        self.assertEqual(state['lastResult']['saved'], [luca])
        self.assertEqual(self.slot_data(luca), b'nuovo')

    def test_partita_finita_prima_di_caricare_lo_stato(self):
        profiles = self.with_saves()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        self.store_slot(luca, 0, 'fbneo', b'riprendi')
        net = self.late_core(run=False)
        self.game_files({'pang.state.auto': b'dall-inizio'})
        state = self.play.start('arcade', 'pang.zip', [luca, None], resume={'account': luca, 'slot': 0})
        # Lo stato automatico è della partita ripartita dall'inizio: il «Riprendi» resta quello di prima.
        self.assertEqual(net.loaded, 0)
        self.assertEqual(state['lastResult']['saved'], [])
        self.assertEqual(self.slot_data(luca), b'riprendi')

    def test_attesa_di_playing(self):
        process = FakeProcessState()
        self.late_core((None,) * 1000)
        self.assertFalse(self.play.late_load(process))
        # Si rinuncia dopo ``LATE_STATE_TIMEOUT``.
        self.assertGreaterEqual(self.clock(), 1000.0 + LATE_STATE_TIMEOUT)
        process.returncode = -11
        net = self.late_core((None,))
        self.assertFalse(self.play.late_load(process))
        process.returncode = None
        net = self.late_core((PLAYING,))
        before = self.clock()
        self.assertTrue(self.play.late_load(process))
        self.assertEqual(net.loaded, 1)
        self.assertEqual(self.clock() - before, LATE_STATE_DELAY)

    def test_riavvio_prima_di_caricare_lo_stato(self):
        self.with_saves()
        self.late_core()
        job = {'game': {'file': 'pang.zip'}, 'state_pending': True}
        os.makedirs(self.session, exist_ok=True)
        with mock.patch.object(self.play, 'session_dir', return_value=self.session):
            for name, data in (('pang.state', b'riprendi'), ('pang.state.auto', b'dall-inizio')):
                with open(os.path.join(self.session, name), 'wb') as stream:
                    stream.write(data)
            # Lo stato automatico della partita ripartita dall'inizio si scarta.
            self.assertTrue(self.play.late_slot(job))
            self.assertEqual(sorted(os.listdir(self.session)), ['pang.state'])
            # A stato caricato, quello automatico appena scritto prende il suo posto.
            job['state_pending'] = False
            with open(os.path.join(self.session, 'pang.state.auto'), 'wb') as stream:
                stream.write(b'appena-scritto')
            self.assertTrue(self.play.late_slot(job))
            with open(os.path.join(self.session, 'pang.state'), 'rb') as stream:
                self.assertEqual(stream.read(), b'appena-scritto')
            self.assertEqual(sorted(os.listdir(self.session)), ['pang.state'])

    def test_processore_al_massimo_per_tutto_il_lavoro(self):
        calls = []

        class Boost:
            def on(self):
                calls.append('on')

            def off(self):
                calls.append('off')
                raise OSError('sudo assente')

        self.play.boost = Boost()
        self.scripts['fbneo'] = SHORT
        self.play.start('arcade', 'pang.zip')
        # Un errore del processore non ferma la partita.
        self.assertEqual(calls, ['on', 'off'])
        self.assertEqual(self.sessions_count(), 1)

    def test_stato_non_valido_rifiutato(self):
        profiles = self.with_saves()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        sara = profiles.create('SARA', '#3ccfc4')['id']
        self.store_slot(sara, 1, 'fbneo')
        self.store_slot(luca, 2, 'mame')
        self.game_files({}, exit_after=10)
        for players, resume in (([luca, None], {'account': sara, 'slot': 1}),
                                ([None, None], {'account': sara, 'slot': 1}),
                                ([luca, sara], {'account': sara, 'slot': 3}),
                                ([luca, sara], {'account': sara, 'slot': True}),
                                ([luca, sara], {'account': luca, 'slot': 2}),
                                ([luca, sara], 'x')):
            with self.assertRaises(LaunchError, msg=(players, resume)):
                self.play.start('arcade', 'pang.zip', players, resume=resume)
            self.assertEqual(self.play.state()['phase'], 'idle')
        self.assertEqual(self.factory.created, [])

    def test_stato_solo_al_primo_core_della_ricerca(self):
        profiles = self.with_saves()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        self.store_slot(luca, 0, 'mame')
        self.repo.reset_game_core('arcade', 'pang.zip')
        self.scripts['fbneo'] = {'exit_after': 0.5, 'code': 1, 'session': self.session}
        self.scripts['mame'] = {'exit_after': 30, 'session': self.session}
        with self.assertLogs('pixelarcade.play', 'INFO') as logs:
            state = self.play.start('arcade', 'pang.zip', [luca, None], resume={'account': luca, 'slot': 0})
        self.assertEqual(state['phase'], 'verdict')
        self.assertEqual([(process.core, process.found) for process in self.factory.created],
                         [('fbneo', ['pang.state.auto']), ('mame', [])])
        self.assertTrue(any('senza core associato' in line for line in logs.output))

    def test_core_che_non_salva_gli_stati(self):
        profiles = self.with_saves()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        # Partita lunga senza stato automatico (come MAME 2000): segnalata.
        self.game_files({'mame2000/hi/pang.hi': b'record'})
        with self.assertLogs('pixelarcade.play', 'WARNING'):
            state = self.play.start('arcade', 'pang.zip', [luca, None])
        self.assertEqual((state['lastResult']['saved'], state['lastResult']['noState']), ([], True))
        # Il record del core resta al P1 e torna alla partita successiva.
        self.game_files({}, exit_after=10)
        state = self.play.start('arcade', 'pang.zip', [luca, None])
        self.assertEqual(self.factory.created[-1].found, ['mame2000'])
        # Partita breve, solo ospiti o stato presente: nessuna segnalazione.
        self.assertFalse(state['lastResult']['noState'])
        self.game_files({})
        self.assertFalse(self.play.start('arcade', 'pang.zip', [None, None])['lastResult']['noState'])
        self.game_files({'pang.state.auto': b'stato'})
        self.assertFalse(self.play.start('arcade', 'pang.zip', [luca, None])['lastResult']['noState'])

    def test_errore_nei_salvataggi_non_ferma_la_partita(self):
        profiles = self.with_saves()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        self.game_files({'pang.state.auto': b'stato'})
        with mock.patch.object(self.saves, 'store_state', side_effect=OSError('disco pieno')), \
                mock.patch.object(self.saves, 'keep_sram', side_effect=OSError('disco pieno')), \
                self.assertLogs('pixelarcade.play', 'ERROR'):
            state = self.play.start('arcade', 'pang.zip', [luca, None])
        self.assertEqual(state['lastResult']['saved'], [])
        self.assertEqual(state['lastResult']['players'][str(luca)]['xpGained'], 30)
        self.assertEqual(self.sessions_count(), 1)

    def test_compatibilita_per_estensione(self):
        self.assertTrue(compatible(core('a', extensions=('zip',)), 'zip', True))
        self.assertTrue(compatible(core('a', extensions=()), 'zip', True))
        self.assertFalse(compatible(core('a', extensions=('cue',)), 'zip', True))
        self.assertTrue(compatible(core('a', extensions=('nes',)), 'zip', False))
        self.assertFalse(compatible(core('a', extensions=('nes',)), 'sfc', False))

    def test_candidati_filtrati(self):
        self.config.cores = [core('fbneo'), core('beetle', extensions=('cue',)),
                             core('manca', installed=False, downloadable=False)]
        game = self.library.find('arcade', 'pang.zip')
        self.assertEqual([item['name'] for item in self.play.candidates('arcade', game)], ['fbneo'])

    def test_ricerca_e_domanda_si(self):
        self.failing('fbneo')
        self.scripts['mame'] = SHORT
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(state['phase'], 'verdict')
        self.assertEqual(state['question'], {'system': 'arcade', 'id': 'pang.zip', 'core': 'mame',
                                             'index': 2, 'total': 3})
        self.assertEqual(state['lastResult']['seconds'], 30)
        self.assertEqual(self.status(), {'core': 'mame', 'status': 'trial', 'confirmedBy': None})
        self.assertEqual(self.repo.tried_cores('arcade', 'pang.zip'), {'fbneo'})
        # Il fallimento automatico non genera sessioni; la partita sì.
        self.assertEqual(self.sessions_count(), 1)
        with open(os.path.join(self.tmp.name, 'pixel-arcade.cfg')) as stream:
            self.assertIn('quit_press_twice = "false"', stream.read())
        state = self.play.verdict('arcade', 'pang.zip', True)
        self.assertEqual(state['phase'], 'idle')
        self.assertTrue(state['lastResult']['confirmed'])
        self.assertEqual(self.status(), {'core': 'mame', 'status': 'ok', 'confirmedBy': 'user'})

    def test_associazione_ok_avvio_diretto(self):
        self.repo.set_game_core('arcade', 'pang.zip', 'mame', 'ok', 'user')
        self.scripts['mame'] = SHORT
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(state['phase'], 'idle')
        self.assertEqual(state['lastResult']['probed'], False)
        self.assertEqual([process.core for process in self.factory.created], ['mame'])

    def test_trial_si_ripresenta(self):
        self.repo.set_game_core('arcade', 'pang.zip', 'mame', 'trial')
        self.repo.add_attempt('arcade', 'pang.zip', 'fbneo', 'failed', 'exited')
        self.scripts['mame'] = SHORT
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(state['phase'], 'verdict')
        self.assertEqual((state['question']['index'], state['question']['total']), (2, 3))

    def test_trial_che_fallisce_continua_la_ricerca(self):
        self.repo.set_game_core('arcade', 'pang.zip', 'mame', 'trial')
        self.failing('mame', 139)
        self.scripts['fbneo'] = LONG
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(state['phase'], 'idle')
        self.assertEqual(self.status()['core'], 'fbneo')
        self.assertEqual(self.repo.tried_cores('arcade', 'pang.zip'), {'mame'})

    def test_core_associato_non_piu_installato(self):
        self.repo.set_game_core('arcade', 'pang.zip', 'vecchio', 'ok', 'auto')
        self.scripts['fbneo'] = SHORT
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(state['question']['core'], 'fbneo')

    def test_conferma_automatica_oltre_la_soglia(self):
        self.scripts['fbneo'] = LONG
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(state['phase'], 'idle')
        self.assertTrue(state['lastResult']['confirmed'])
        self.assertEqual(state['lastResult']['seconds'], 200)
        self.assertEqual(self.status(), {'core': 'fbneo', 'status': 'ok', 'confirmedBy': 'auto'})

    def test_la_pausa_del_menu_non_conta(self):
        profiles = self.with_profiles()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        self.scripts['fbneo'] = LONG
        self.play.add_pause_source(lambda: 130.4)
        state = self.play.start('arcade', 'pang.zip', [luca, None])
        # 200 s di partita, 130 di pausa: 70 s di gioco, 1 minuto di XP; il core si conferma sul tempo reale.
        self.assertEqual(state['lastResult']['seconds'], 70)
        self.assertEqual(state['lastResult']['players'][str(luca)]['xpGained'], 31)
        self.assertTrue(state['lastResult']['confirmed'])
        self.assertEqual(profiles.public(profiles.account(luca))['sessions'], 1)
        self.assertEqual(self.sessions.stats(luca)['seconds'], 70)

    def test_pausa_piu_lunga_della_partita(self):
        profiles = self.with_profiles()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        self.scripts['fbneo'] = SHORT
        self.play.add_pause_source(lambda: 45)
        state = self.play.start('arcade', 'pang.zip', [luca, None])
        self.assertEqual((state['lastResult']['seconds'], state['lastResult']['players']), (0, {}))

    def restarting(self, **options):
        self.repo.set_game_core('arcade', 'pang.zip', 'fbneo', 'ok', 'manual')
        self.scripts['fbneo'] = dict(SHORT, session=self.session, files={'pang.state.auto': b'stato'})
        controls = RestartControls(self.play, self.clock, **options)
        self.play.controls = controls
        return controls

    def test_riavvio_per_i_comandi(self):
        controls = self.restarting()
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(state['phase'], 'idle')
        first, second = self.factory.created
        # La cartella di sessione non si svuota: il secondo RetroArch trova lo stato automatico.
        self.assertEqual(first.found, [])
        self.assertIn('pang.state.auto', second.found)
        # 50 s prima del riavvio e 30 dopo, in una sola partita.
        self.assertEqual(state['lastResult']['seconds'], 80)
        self.assertEqual(self.sessions_count(), 1)
        self.assertEqual(controls.running, [True, False, True])
        self.assertEqual(controls.ended, 2)

    def test_riavvio_senza_chiusura_termina_retroarch(self):
        self.restarting(after=0, quit=False)
        self.play.start('arcade', 'pang.zip')
        first, second = self.factory.created
        self.assertTrue(first.terminated)
        self.assertGreater(first.seconds(), RESTART_GRACE)
        self.assertIsNotNone(second.started_at)

    def test_interruzione_durante_il_riavvio(self):
        self.restarting(stop=True)
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(len(self.factory.created), 1)
        self.assertEqual(state['lastResult']['seconds'], 50)

    def test_riavvio_solo_in_partita(self):
        with self.assertRaises(ConflictError):
            self.play.request_restart()

    def test_no_passa_al_core_successivo(self):
        self.scripts['fbneo'] = SHORT
        self.scripts['mame'] = SHORT
        self.play.start('arcade', 'pang.zip')
        state = self.play.verdict('arcade', 'pang.zip', False)
        self.assertEqual(state['phase'], 'verdict')
        self.assertEqual((state['question']['core'], state['question']['index']), ('mame', 2))
        self.assertEqual(self.sessions_count(), 2)

    def test_no_sull_ultimo_core_incompatibile(self):
        self.config.cores = [core('fbneo'), core('mame')]
        self.failing('fbneo')
        self.scripts['mame'] = SHORT
        self.play.start('arcade', 'pang.zip')
        state = self.play.verdict('arcade', 'pang.zip', False)
        self.assertEqual(state['phase'], 'idle')
        self.assertTrue(state['lastResult']['incompatible'])
        self.assertEqual(state['lastResult']['tried'], ['fbneo', 'mame'])
        self.assertEqual(self.status()['status'], 'incompatible')
        with self.assertRaises(IncompatibleError) as raised:
            self.play.start('arcade', 'pang.zip')
        self.assertEqual(raised.exception.data, {'incompatible': True, 'tried': ['fbneo', 'mame']})
        self.assertIn('fbneo, mame', str(raised.exception))
        self.assertEqual(self.play.state()['phase'], 'idle')

    def test_tutti_falliscono(self):
        for name in ('fbneo', 'mame', 'mame2003_plus'):
            self.failing(name)
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(state['lastResult']['tried'], ['fbneo', 'mame', 'mame2003_plus'])
        self.assertEqual(self.sessions_count(), 0)

    def test_ripresa_dal_primo_non_provato(self):
        self.config.cores = [core(name) for name in ('fbneo', 'mame', 'mame2000', 'mame2003', 'mame2010')]
        self.repo.add_attempt('arcade', 'pang.zip', 'fbneo', 'failed', 'exited')
        self.repo.add_attempt('arcade', 'pang.zip', 'mame', 'failed', 'marker')
        self.scripts['mame2000'] = SHORT
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual((state['question']['core'], state['question']['index'], state['question']['total']),
                         ('mame2000', 3, 5))
        self.assertEqual([process.core for process in self.factory.created], ['mame2000'])

    def test_lista_cambiata_dopo_incompatibile(self):
        self.config.cores = [core('fbneo'), core('mame')]
        self.failing('fbneo')
        self.failing('mame')
        self.play.start('arcade', 'pang.zip')
        self.assertEqual(self.status()['status'], 'incompatible')
        self.config.cores.append(core('mame2010'))
        self.scripts['mame2010'] = SHORT
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(state['question']['core'], 'mame2010')
        self.assertEqual([process.core for process in self.factory.created], ['fbneo', 'mame', 'mame2010'])

    def test_ricerca_interrotta_non_conta(self):
        self.repo.add_attempt('arcade', 'pang.zip', 'fbneo', 'failed', 'stopped')
        self.assertEqual(self.repo.tried_cores('arcade', 'pang.zip'), set())
        self.scripts['fbneo'] = SHORT
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(state['question']['core'], 'fbneo')

    def test_doppio_avvio_rifiutato(self):
        self.scripts['fbneo'] = SHORT
        self.play.start('arcade', 'pang.zip')
        with self.assertRaises(ConflictError):
            self.play.start('arcade', 'sf2.zip')

    def test_gioco_inesistente_e_nessun_core(self):
        with self.assertRaises(LaunchError):
            self.play.start('arcade', 'manca.zip')
        self.config.cores = []
        with self.assertRaises(LaunchError) as raised:
            self.play.start('arcade', 'pang.zip')
        self.assertIn('Impostazioni', str(raised.exception))
        self.assertEqual(self.play.state()['phase'], 'idle')

    def test_combinazione_non_supportata(self):
        with open(os.path.join(self.tmp.name, 'retroarch', 'retroarch.cfg'), 'w') as stream:
            stream.write('video_driver = "gl"\n')
        self.assertFalse(self.play.quit_combo_supported())
        with self.assertRaises(LaunchError) as raised:
            self.play.start('arcade', 'pang.zip')
        self.assertIn('combinazione', str(raised.exception))

    def test_download_del_core_mancante(self):
        self.config.cores = [core('fbneo', installed=False)]
        self.scripts['fbneo'] = SHORT
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(self.downloader.downloaded, ['fbneo'])
        self.assertEqual(state['question']['core'], 'fbneo')
        self.assertEqual(self.library.invalidated, 1)

    def test_download_fallito(self):
        self.config.cores = [core('fbneo', installed=False), core('mame', installed=False)]
        self.downloader.failing.add('fbneo')
        self.scripts['mame'] = SHORT
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(state['question']['core'], 'mame')
        self.assertEqual(self.repo.attempts('arcade', 'pang.zip')[0],
                         {'core': 'fbneo', 'result': 'failed', 'reason': 'download_failed'})

    def test_scelta_manuale_e_reset(self):
        game = self.play.set_core('arcade', 'pang.zip', 'mame2003_plus')
        self.assertEqual((game['core'], game['coreStatus']), ('mame2003_plus', 'ok'))
        self.assertEqual(self.status()['confirmedBy'], 'manual')
        with self.assertRaises(LaunchError):
            self.play.set_core('arcade', 'pang.zip', 'snes9x')
        self.repo.add_attempt('arcade', 'pang.zip', 'fbneo', 'failed', 'exited')
        game = self.play.reset_core('arcade', 'pang.zip')
        self.assertIsNone(game['coreStatus'])
        self.assertEqual(self.repo.tried_cores('arcade', 'pang.zip'), set())

    def test_scelta_manuale_scaricata_al_avvio(self):
        self.config.cores = [core('fbneo'), core('mame', installed=False)]
        self.play.set_core('arcade', 'pang.zip', 'mame')
        self.scripts['mame'] = SHORT
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(self.downloader.downloaded, ['mame'])
        self.assertEqual((state['phase'], state['lastResult']['core']), ('idle', 'mame'))

    def test_verdetto_senza_domanda(self):
        with self.assertRaises(ConflictError):
            self.play.verdict('arcade', 'pang.zip', True)

    def test_core_chiude_il_gioco(self):
        self.repo.set_game_core('arcade', 'pang.zip', 'fbneo', 'ok', 'user')
        self.scripts['fbneo'] = {'lines': ['[INFO] [Core] Nessun contenuto, avvio dummy core.']}
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(state['phase'], 'idle')
        self.assertTrue(self.factory.created[0].terminated)
        self.assertEqual(self.factory.created[0].grace, MENU_TERMINATE_GRACE)

    def test_ritorno_al_menu_durante_la_ricerca(self):
        self.scripts['fbneo'] = {'lines': ['[INFO] [Core] Nessun contenuto, avvio dummy core.']}
        self.scripts['mame'] = SHORT
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(state['phase'], 'verdict')
        self.assertEqual(state['question']['core'], 'mame')
        self.assertIn(('fbneo', 'failed', 'closed'),
                      [(item['core'], item['result'], item['reason']) for item in self.repo.attempts('arcade', 'pang.zip')])
        self.assertEqual(self.repo.tried_cores('arcade', 'pang.zip'), {'fbneo'})

    def test_start_select_durante_la_prova_chiede(self):
        self.scripts['fbneo'] = {'exit_after': 4, 'code': 0}
        state = self.play.start('arcade', 'pang.zip')
        self.assertEqual(state['phase'], 'verdict')
        self.assertEqual(state['question']['core'], 'fbneo')
        self.assertEqual(state['lastResult']['seconds'], 4)
        self.assertEqual(self.status()['status'], 'trial')
        self.assertEqual(self.sessions_count(), 1)
        self.play.verdict('arcade', 'pang.zip', True)
        self.assertEqual((self.status()['core'], self.status()['status']), ('fbneo', 'ok'))

    def test_start_select_durante_la_prova_poi_no(self):
        self.scripts['fbneo'] = {'exit_after': 4, 'code': 0}
        self.scripts['mame'] = SHORT
        self.play.start('arcade', 'pang.zip')
        state = self.play.verdict('arcade', 'pang.zip', False)
        self.assertEqual((state['phase'], state['question']['core']), ('verdict', 'mame'))
        self.assertEqual(self.repo.tried_cores('arcade', 'pang.zip'), {'fbneo'})


    # --- Salvataggi condivisi e cartella di sistema ---------------------------

    def shared_provider(self, files):
        """Fornitore finto con il salvataggio condiviso ``Tutto`` di pang.zip (``files``: nome → contenuto)."""
        folder = os.path.join(self.tmp.name, 'condivisi', 'Tutto')
        os.makedirs(folder)
        for name, data in files.items():
            with open(os.path.join(folder, name), 'wb') as stream:
                stream.write(data)

        class Provider:
            @staticmethod
            def folder(system_id, game_id, name):
                return folder if (system_id, game_id, name) == ('arcade', 'pang.zip', 'Tutto') else None

            @staticmethod
            def title(system_id, game_id, name):
                return 'Tutto sbloccato' if Provider.folder(system_id, game_id, name) else None

            @staticmethod
            def list(system_id, game_id):
                return [{'id': 'Tutto', 'title': 'Tutto sbloccato', 'description': ''}]

        self.saves.shared = Provider
        return folder

    def test_partita_con_un_salvataggio_condiviso(self):
        profiles = self.with_saves()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        profile_sram = os.path.join(self.tmp.name, 'profilo')
        os.makedirs(profile_sram)
        with open(os.path.join(profile_sram, 'pang.srm'), 'wb') as stream:
            stream.write(b'profilo')
        self.saves.keep_sram(luca, 'arcade', 'pang.zip', profile_sram, 'pang')
        self.shared_provider({'salvataggio.srm': b'condiviso', 'info.json': b'{}'})
        self.game_files({'pang.state.auto': b'stato', 'pang.srm': b'dopo'})
        state = self.play.start('arcade', 'pang.zip', [luca, None], shared='Tutto')
        created = self.factory.created[-1]
        # Una copia del salvataggio condiviso al posto di quello del profilo, senza info.json.
        self.assertEqual(created.found, ['pang.srm'])
        self.assertEqual(created.found_data['pang.srm'], b'condiviso')
        # «Riprendi» conservato e legato al salvataggio condiviso; salvataggio interno del profilo invariato.
        self.assertEqual(state['lastResult']['saved'], [luca])
        self.assertEqual(self.saves.repo.get(luca, 'arcade', 'pang.zip', 0)['shared'], 'Tutto')
        self.assertEqual(self.saves.game_slots(luca, 'arcade', 'pang.zip', 'fbneo')[0]['shared'],
                         {'id': 'Tutto', 'title': 'Tutto sbloccato'})
        with open(os.path.join(self.saves.sram_dir(luca, 'arcade', 'pang.zip'), 'srm'), 'rb') as stream:
            self.assertEqual(stream.read(), b'profilo')
        # Il «Riprendi» riparte con la copia del salvataggio condiviso.
        self.game_files({'pang.state.auto': b'stato 2', 'pang.srm': b'dopo 2'})
        self.play.start('arcade', 'pang.zip', [luca, None], resume={'account': luca, 'slot': 0})
        created = self.factory.created[-1]
        self.assertEqual(created.found_data['pang.srm'], b'condiviso')
        self.assertEqual(created.found_data['pang.state.auto'], b'stato')
        self.assertEqual(self.saves.repo.get(luca, 'arcade', 'pang.zip', 0)['shared'], 'Tutto')
        # Una nuova partita normale: il salvataggio del profilo e un «Riprendi» senza salvataggio condiviso.
        self.game_files({'pang.state.auto': b'stato 3'})
        self.play.start('arcade', 'pang.zip', [luca, None])
        self.assertEqual(self.factory.created[-1].found_data['pang.srm'], b'profilo')
        self.assertIsNone(self.saves.repo.get(luca, 'arcade', 'pang.zip', 0)['shared'])
        # Un salvataggio condiviso che non c'è non parte.
        with self.assertRaises(LaunchError):
            self.play.start('arcade', 'pang.zip', [luca, None], shared='Manca')

    def test_memory_card_nella_cartella_di_sistema_per_profilo(self):
        profiles = self.with_saves()
        luca = profiles.create('LUCA', '#ff5d73')['id']
        sara = profiles.create('SARA', '#3ccfc4')['id']
        system = os.path.join(self.tmp.name, 'system')
        cards = os.path.join(system, 'memcards')

        class Bios:
            @staticmethod
            def retroarch_options():
                return []

            @staticmethod
            def system_dir():
                return system

        self.play.bios = Bios
        with mock.patch.dict('pixelarcade.saves.SYSTEM_SAVES', {'fbneo': ('memcards', ('Mcd001.ps2',))}):
            # Il core scrive la card nella cartella di sistema: all'uscita va al P1.
            self.scripts['fbneo'] = {'exit_after': 30, 'session': cards, 'files': {'Mcd001.ps2': b'luca'}}
            self.play.start('arcade', 'pang.zip', [luca, None])
            self.assertEqual(self.factory.created[-1].found, [])
            # SARA non ha una card: quella di LUCA si toglie prima dell'avvio.
            self.scripts['fbneo'] = {'exit_after': 30, 'session': cards, 'files': {'Mcd001.ps2': b'sara'}}
            self.play.start('arcade', 'pang.zip', [sara, None])
            self.assertEqual(self.factory.created[-1].found, [])
            # Di nuovo LUCA: la sua card torna al suo posto.
            self.scripts['fbneo'] = {'exit_after': 30, 'session': cards, 'files': {}}
            self.play.start('arcade', 'pang.zip', [luca, None])
            self.assertEqual(self.factory.created[-1].found_data, {'Mcd001.ps2': b'luca'})
            # Salvataggio condiviso: la sua card, e quella di LUCA resta com'era.
            self.shared_provider({'Mcd001.ps2': b'condivisa'})
            self.scripts['fbneo'] = {'exit_after': 30, 'session': cards, 'files': {'Mcd001.ps2': b'cambiata'}}
            self.play.start('arcade', 'pang.zip', [luca, None], shared='Tutto')
            self.assertEqual(self.factory.created[-1].found_data, {'Mcd001.ps2': b'condivisa'})
        with open(os.path.join(self.saves.system_saves_dir(luca, 'fbneo'), 'Mcd001.ps2'), 'rb') as stream:
            self.assertEqual(stream.read(), b'luca')
        with open(os.path.join(self.saves.system_saves_dir(sara, 'fbneo'), 'Mcd001.ps2'), 'rb') as stream:
            self.assertEqual(stream.read(), b'sara')


class PlayThreadTest(unittest.TestCase):
    """Casi con il thread vero: domanda sul download e interruzione."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = self.tmp.name
        os.makedirs(os.path.join(base, 'retroarch', 'cores'))
        with open(os.path.join(base, 'retroarch', 'retroarch.cfg'), 'w') as stream:
            stream.write('input_quit_gamepad_combo = "4"\n')
        self.db = Database(os.path.join(base, 'test.db'))
        self.db.migrate()
        self.repo = CoresRepository(self.db)
        self.config = FakeConfig(base, [core('mame', installed=False), core('fbneo', installed=False)])
        self.downloader = FakeDownloader(self.config)
        self.downloader.sizes['mame'] = 128 * 1000 * 1000
        self.clock = FakeClock()
        self.scripts = {'fbneo': SHORT}
        self.play = PlayService(self.config, FakeLibrary(self.repo, {'pang.zip': 'pang'}), self.repo,
                                SessionsRepository(self.db), self.downloader, FakeFactory(self.clock, self.scripts),
                                self.clock, wait=self.tick)

    def tick(self, seconds):
        self.clock.wait(seconds)
        time.sleep(0.001)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def until(self, predicate):
        limit = time.monotonic() + 5
        while time.monotonic() < limit:
            state = self.play.state()
            if predicate(state):
                return state
            time.sleep(0.005)
        self.fail('Stato atteso non raggiunto: %s' % self.play.state())

    def test_download_grande_rifiutato(self):
        self.play.start('arcade', 'pang.zip')
        state = self.until(lambda state: state['phase'] == 'download_confirm')
        self.assertEqual(state['question'], {'core': 'mame', 'size': 128000000})
        with self.assertRaises(ConflictError):
            self.play.answer_download('fbneo', True)
        self.play.answer_download('mame', False)
        state = self.until(lambda state: state['phase'] == 'verdict')
        self.assertEqual(state['question']['core'], 'fbneo')
        self.assertEqual(self.downloader.downloaded, ['fbneo'])
        self.assertEqual(self.repo.attempts('arcade', 'pang.zip')[0]['reason'], 'download_declined')

    def test_interruzione_durante_la_domanda(self):
        self.play.start('arcade', 'pang.zip')
        self.until(lambda state: state['phase'] == 'download_confirm')
        self.play.stop()
        state = self.until(lambda state: state['phase'] == 'idle')
        self.assertTrue(state['lastResult']['stopped'])
        self.assertEqual(self.repo.tried_cores('arcade', 'pang.zip'), set())

    def test_interruzione_della_partita(self):
        self.scripts['fbneo'] = {}
        self.config.cores = [core('fbneo')]
        self.repo.set_game_core('arcade', 'pang.zip', 'fbneo', 'ok', 'user')
        self.play.start('arcade', 'pang.zip')
        state = self.until(lambda state: state['phase'] == 'running')
        self.assertEqual(state['quitCombo'], 'hold_start')
        self.assertTrue(self.play.playing())
        self.play.stop()
        state = self.until(lambda state: state['phase'] == 'idle')
        self.assertEqual(state['lastResult']['core'], 'fbneo')


if __name__ == '__main__':
    unittest.main()
