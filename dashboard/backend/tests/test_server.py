import hashlib
import http.client
import io
import json
import os
import shutil
import tempfile
import threading
import time
import unittest
import urllib.error
from unittest import mock

from pixelarcade import __version__
from pixelarcade.app import create_services
from pixelarcade.db import Database
from pixelarcade.web.router import RawResponse
from pixelarcade.web.server import create_server

from tests.fakes import FakeProcess, fake_png

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'core_info')


class FakeOpener:
    """Buildbot finto: tre core, di cui uno senza .info."""

    def __init__(self):
        self.fail = False

    def __call__(self, url, timeout):
        if self.fail:
            raise urllib.error.URLError('rete assente')
        return io.BytesIO(b'2026-09-22 aa000001 fbneo_libretro.so.zip\n'
                          b'2026-09-22 aa000002 nestopia_libretro.so.zip\n'
                          b'2026-09-22 aa000003 senzainfo_libretro.so.zip\n')


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.dist = os.path.join(cls.tmp.name, 'dist')
        os.makedirs(os.path.join(cls.dist, 'assets'))
        with open(os.path.join(cls.dist, 'index.html'), 'w') as stream:
            stream.write('<!doctype html><title>Pixel Arcade</title>')
        with open(os.path.join(cls.dist, 'assets', 'app.js'), 'w') as stream:
            stream.write('console.log(1)')
        cls.base = os.path.join(cls.tmp.name, 'workspace')
        for name in ('Zelda (E).nes', 'Contra (U).nes'):
            path = os.path.join(cls.base, 'games', 'nes', name)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w') as stream:
                stream.write('x')
        cores = os.path.join(cls.tmp.name, 'cores')
        os.makedirs(cores)
        for name in ('fbneo', 'nestopia'):
            shutil.copy(os.path.join(FIXTURES, name + '_libretro.info'), cores)
        cls.db = Database(os.path.join(cls.tmp.name, 'test.db'))
        cls.db.migrate()
        cls.opener = FakeOpener()
        services = create_services(cls.db, cls.base, cls.opener)
        services['config'].update({'paths.cores': cores})
        services['config'].refresh_core_index()
        cls.server = create_server(0, services, cls.dist)
        cls.server.router.add('GET', '/api/prova/raw',
                              lambda ctx, request: RawResponse(b'\x89PNG', 'image/png', 'max-age=3600'))
        cls.port = cls.server.server_port
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.db.close()
        cls.tmp.cleanup()

    def request(self, method, path, host=None, body=None, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        all_headers = {'Host': host or '127.0.0.1:%d' % self.port}
        all_headers.update(headers or {})
        conn.request(method, path, body=body, headers=all_headers)
        response = conn.getresponse()
        data = response.read()
        conn.close()
        return response, data

    def test_health(self):
        response, data = self.request('GET', '/api/health')
        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(data), {'ok': True, 'version': __version__, 'db': {'version': 27}})
        self.assertEqual(response.getheader('Cache-Control'), 'no-store')
        self.assertIn('default-src', response.getheader('Content-Security-Policy'))

    def post(self, path, token=True, body=None):
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['X-Pixel-Token'] = self.server.token
        return self.request('POST', path, body=json.dumps(body or {}), headers=headers)

    def test_wrapped_vuoto(self):
        response, data = self.request('GET', '/api/wrapped/list?account=house')
        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(data), {'periods': [], 'pending': None})
        response, _ = self.request('GET', '/api/wrapped?account=house&period=2026-09')
        self.assertEqual(response.status, 400)
        self.assertEqual(self.request('GET', '/api/wrapped?account=house')[0].status, 400)
        self.assertEqual(self.request('GET', '/api/wrapped/list?account=abc')[0].status, 400)
        self.assertEqual(self.request('GET', '/api/wrapped/list?account=99999')[0].status, 400)
        response, _ = self.post('/api/wrapped/seen', body={'account': None, 'period': '2026-09'})
        self.assertEqual(response.status, 400)
        self.assertEqual(self.post('/api/wrapped/seen', body={'account': 'x', 'period': '2026-09'})[0].status, 400)

    def test_classifica_vuota(self):
        response, data = self.request('GET', '/api/leaderboard')
        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(data), {'leaders': [], 'challenge': None, 'lastWinner': None, 'topGames': [],
                                            'games': {}})

    def test_bootstrap(self):
        response, data = self.request('GET', '/api/bootstrap')
        self.assertEqual(response.status, 200)
        data = json.loads(data)
        self.assertEqual(data['token'], self.server.token)
        self.assertEqual(data['version'], __version__)
        self.assertEqual((data['run']['running'], data['run']['phase']), (False, 'idle'))
        self.assertEqual(data['warnings'], [])
        self.assertEqual(data['padButtons'], {})
        self.assertEqual(data['saveCombo'], ['select', 'lt'])
        self.assertEqual(data['rescueCombo'], ['select', 'rt'])
        self.assertEqual(data['quitCombo'], 'hold_start')
        self.assertFalse(data['run']['menu']['open'])
        self.assertEqual(data['theme'], 'random')
        self.assertEqual(data['screensaver'], 2)
        self.assertEqual(data['logout'], 1)
        self.assertEqual(data['sound'], {'on': True, 'effects': 75, 'music': 50})
        self.assertEqual(data['mode'], 'system')
        self.assertEqual([system['id'] for system in data['systems']], ['nes'])
        self.assertEqual(data['systems'][0]['count'], 2)
        self.assertEqual(data['systems'][0]['name'], 'NES')
        self.assertEqual(data['addons'], {})
        self.assertEqual(data['consoles'], {'off': [], 'profiles': {}})

    def test_console_della_riga(self):
        response, data = self.post('/api/profiles', body={'name': 'RIGA', 'color': '#f5c542'})
        self.assertEqual(response.status, 200)
        account = json.loads(data)['id']
        response, data = self.post('/api/consoles/off', body={'off': ['nes']})
        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(data)['consoles']['off'], ['nes'])
        response, data = self.post('/api/consoles/row', body={'account': account, 'id': 'nes', 'on': True})
        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(data)['consoles']['profiles'], {str(account): {'add': ['nes'], 'remove': []}})
        _, data = self.request('GET', '/api/bootstrap')
        self.assertEqual(json.loads(data)['consoles']['off'], ['nes'])
        self.assertEqual(self.post('/api/consoles/off', body={'off': 'nes'})[0].status, 400)
        self.assertEqual(self.post('/api/consoles/row', body={'account': 99999, 'id': 'nes', 'on': True})[0].status, 400)
        self.assertEqual(self.post('/api/consoles/row', token=False, body={'account': account, 'id': 'nes', 'on': True})[0].status, 403)
        self.assertEqual(self.post('/api/consoles/row', body={'account': account, 'id': 'nes'})[0].status, 400)
        # Torna come prima per gli altri test della classe.
        with self.server.services['db'].transaction() as conn:
            conn.execute('DELETE FROM account_consoles')
        self.post('/api/consoles/off', body={'off': []})

    def test_games(self):
        response, data = self.request('GET', '/api/games?system=nes')
        self.assertEqual(response.status, 200)
        data = json.loads(data)
        self.assertEqual(data['system'], 'nes')
        self.assertEqual([game['title'] for game in data['games']], ['Contra', 'Zelda'])

    def test_games_errori(self):
        for path in ('/api/games', '/api/games?system=..', '/api/games?system=snes'):
            response, data = self.request('GET', path)
            self.assertEqual(response.status, 400, path)
            self.assertIn('error', json.loads(data))

    def test_rescan(self):
        response, data = self.post('/api/library/rescan')
        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(data)['systems'][0]['id'], 'nes')

    def test_impostazioni(self):
        response, data = self.request('GET', '/api/settings')
        self.assertEqual(response.status, 200)
        data = json.loads(data)
        self.assertEqual(data['settings']['paths.roms'], 'games')
        # Nessun retroarch.cfg accanto alla cartella dei core: combinazione non verificabile.
        self.assertEqual(data['retroarch'], {'quitCombo': False})
        self.assertEqual(data['coreIndex']['count'], 3)
        nes = data['systems'][0]
        self.assertEqual((nes['id'], nes['name'], nes['count']), ('nes', 'NES', 2))
        # Lista predefinita: nestopia (scaricabile, con .info) per la tipologia NES.
        self.assertEqual(nes['cores'], ['nestopia'])
        self.assertTrue(nes['coresDefault'])
        self.assertEqual(nes['compatibleCores'], ['fceumm', 'mesen', 'quicknes'])
        self.assertEqual([core['name'] for core in data['availableCores']], ['fbneo', 'nestopia'])
        self.assertIn({'name': 'Arcade', 'group': 'Arcade', 'cores': ['fbneo']}, data['coreTypes'])
        self.assertEqual(nes['extensions'], '')
        self.assertIn('nes', nes['defaultExtensions'].split())

    def test_salva_impostazioni(self):
        _, data = self.request('GET', '/api/settings')
        data = json.loads(data)
        data['settings']['retroarch.command'] = 'retroarch --verbose'
        data['systems'][0]['cores'] = ['nestopia', 'fceumm']
        data['systems'][0]['extensions'] = 'nes'
        response, saved = self.post('/api/settings', body=data)
        self.assertEqual(response.status, 200, saved)
        saved = json.loads(saved)
        self.assertEqual(saved['settings']['retroarch.command'], 'retroarch --verbose')
        self.assertEqual(saved['systems'][0]['cores'], ['nestopia', 'fceumm'])
        self.assertFalse(saved['systems'][0]['coresDefault'])
        _, boot = self.request('GET', '/api/bootstrap')
        system = json.loads(boot)['systems'][0]
        self.assertEqual(system['cores'], [{'name': 'nestopia', 'installed': False, 'downloadable': True},
                                           {'name': 'fceumm', 'installed': False, 'downloadable': False}])
        self.assertTrue(system['ready'])
        # Errore leggibile, niente salvataggio.
        data['settings']['paths.roms'] = 'manca'
        data['settings']['retroarch.command'] = 'altro'
        response, error = self.post('/api/settings', body=data)
        self.assertEqual(response.status, 400)
        self.assertIn('non esiste', json.loads(error)['error'])
        _, current = self.request('GET', '/api/settings')
        self.assertEqual(json.loads(current)['settings']['retroarch.command'], 'retroarch --verbose')

    def test_aggiorna_elenco_core(self):
        response, data = self.post('/api/cores/refresh')
        self.assertEqual(response.status, 200, data)
        self.assertEqual(json.loads(data)['coreIndex']['count'], 3)
        self.opener.fail = True
        try:
            response, data = self.post('/api/cores/refresh')
        finally:
            self.opener.fail = False
        self.assertEqual(response.status, 502)
        self.assertIn('buildbot', json.loads(data)['error'])
        _, current = self.request('GET', '/api/settings')
        index = json.loads(current)['coreIndex']
        self.assertEqual(index['count'], 3)
        self.assertIn('buildbot', index['error'])

    def test_rescan_senza_token(self):
        response, _ = self.post('/api/library/rescan', token=False)
        self.assertEqual(response.status, 403)

    def test_health_da_localhost(self):
        response, _ = self.request('GET', '/api/health', host='localhost:%d' % self.port)
        self.assertEqual(response.status, 200)

    def test_risposta_non_json(self):
        response, data = self.request('GET', '/api/prova/raw')
        self.assertEqual(response.status, 200)
        self.assertEqual(response.getheader('Content-Type'), 'image/png')
        self.assertEqual(data, b'\x89PNG')
        self.assertEqual(response.getheader('Content-Length'), '4')
        self.assertEqual(response.getheader('Cache-Control'), 'max-age=3600')
        self.assertIn('default-src', response.getheader('Content-Security-Policy'))
        self.assertEqual(response.getheader('X-Content-Type-Options'), 'nosniff')

    def test_host_estraneo(self):
        response, data = self.request('GET', '/api/health', host='evil.example')
        self.assertEqual(response.status, 403)
        self.assertIn('error', json.loads(data))

    def test_file_statici(self):
        response, data = self.request('GET', '/')
        self.assertEqual(response.status, 200)
        self.assertIn(b'Pixel Arcade', data)
        self.assertEqual(response.getheader('Content-Type'), 'text/html; charset=utf-8')
        response, data = self.request('GET', '/assets/app.js')
        self.assertEqual(response.status, 200)
        self.assertIn('immutable', response.getheader('Cache-Control'))

    def test_percorso_inesistente(self):
        for path in ('/manca.html', '/api/manca'):
            response, data = self.request('GET', path)
            self.assertEqual(response.status, 404)
            self.assertEqual(response.getheader('Content-Type'), 'application/json; charset=utf-8')
            self.assertIn('error', json.loads(data))

    def test_post_senza_token(self):
        response, _ = self.request('POST', '/api/health', body='{}', headers={'Content-Type': 'application/json'})
        self.assertEqual(response.status, 403)

    def test_post_con_token_su_rotta_solo_get(self):
        headers = {'Content-Type': 'application/json', 'X-Pixel-Token': self.server.token}
        response, _ = self.request('POST', '/api/health', body='{}', headers=headers)
        self.assertEqual(response.status, 405)

    def test_post_corpo_troppo_grande(self):
        headers = {'Content-Type': 'application/json', 'X-Pixel-Token': self.server.token}
        response, _ = self.request('POST', '/api/health', body='{"a": "' + 'x' * 270000 + '"}', headers=headers)
        self.assertEqual(response.status, 400)


class TournamentStartRoutesTest(unittest.TestCase):
    """Avvio del torneo via HTTP, su un database a parte (i profili creati non toccano gli altri test)."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.dist = os.path.join(cls.tmp.name, 'dist')
        os.makedirs(cls.dist)
        with open(os.path.join(cls.dist, 'index.html'), 'w') as stream:
            stream.write('<!doctype html>')
        cls.base = os.path.join(cls.tmp.name, 'workspace')
        path = os.path.join(cls.base, 'games', 'nes', 'Zelda (E).nes')
        os.makedirs(os.path.dirname(path))
        with open(path, 'w') as stream:
            stream.write('x')
        cls.db = Database(os.path.join(cls.tmp.name, 'test.db'))
        cls.db.migrate()
        cls.services = create_services(cls.db, cls.base, FakeOpener())
        cls.server = create_server(0, cls.services, cls.dist)
        cls.port = cls.server.server_port
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.db.close()
        cls.tmp.cleanup()

    request = ServerTest.request
    post = ServerTest.post

    def test_avvio_del_torneo(self):
        ids = [self.services['profiles'].create(name, '#ff5d73')['id'] for name in ('avvio1', 'avvio2', 'avvio3')]
        _, data = self.post('/api/tournament', body={'account': ids[0]})
        tournament = json.loads(data)['tournament']['id']
        target = {'id': tournament, 'account': ids[0], 'combo': None}
        response, _ = self.post('/api/tournament/update', body=dict(target, changes={
            'game': {'system': 'nes', 'id': 'Zelda (E).nes'}}))
        self.assertEqual(response.status, 200)
        self.post('/api/tournament/publish', body=target)
        self.post('/api/tournament/join', body={'id': tournament, 'account': ids[0]})
        response, data = self.post('/api/tournament/start/check', body=target)
        self.assertEqual(response.status, 400)
        self.assertIn('almeno 3', json.loads(data)['error'])
        for account in ids[1:]:
            self.post('/api/tournament/join', body={'id': tournament, 'account': account})
        response, data = self.post('/api/tournament/start/check', body=target)
        self.assertEqual(response.status, 200)
        check = json.loads(data)
        self.assertEqual(len(check['players']), 3)
        response, data = self.post('/api/tournament/start/preview', body=dict(target, settings={'thirdPlace': False}))
        self.assertEqual(response.status, 200)
        preview = json.loads(data)
        self.assertEqual(preview['count'], 2)
        response, data = self.post('/api/tournament/start/preview', body=dict(target, settings={
            'format': 'double', 'options': {'grandFinal': 'reset'}}))
        self.assertEqual(response.status, 200)
        double = json.loads(data)
        self.assertEqual(double['count'], {'min': 4, 'max': 5})
        self.assertEqual({match['bracket'] for match in double['matches']}, {'winners', 'losers', 'grand'})
        self.assertEqual(double['crossings'], {'1': ['wr1s0', 'wr1s1'], '2': ['wr2s0']})
        response, data = self.post('/api/tournament/start/preview', body=dict(target, settings={
            'format': 'double'}, crossings={'1': ['wr1s1', 'wr1s0'], '2': ['wr2s0']}))
        self.assertEqual((response.status, json.loads(data)['crossings']['1']), (200, ['wr1s1', 'wr1s0']))
        response, _ = self.post('/api/tournament/start/preview', body=dict(target, settings={
            'format': 'double'}, crossings={'1': ['wr1s1'], '2': ['wr2s0']}))
        self.assertEqual(response.status, 400)
        response, data = self.post('/api/tournament/start/draft', body=dict(target, draft={
            'step': 2, 'settings': {'thirdPlace': False}, 'order': preview['order']}))
        self.assertEqual((response.status, json.loads(data)), (200, {'ok': True}))
        _, data = self.post('/api/tournament/start/check', body=target)
        self.assertEqual(json.loads(data)['draft']['order'], preview['order'])
        response, _ = self.post('/api/tournament/start/draft', body=dict(target, draft={'step': 9}))
        self.assertEqual(response.status, 400)
        response, _ = self.post('/api/tournament/start', body=dict(target, settings={}, order=[1, 2]))
        self.assertEqual(response.status, 400)
        response, data = self.post('/api/tournament/start', body=dict(target, settings={'thirdPlace': False},
                                                                     order=preview['order'], slots=preview['slots']))
        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(data)['tournament']['status'], 'running')
        _, data = self.request('GET', '/api/tournament')
        running = [item for item in json.loads(data)['tournaments'] if item['id'] == tournament][0]
        self.assertEqual(len([match for match in running['matches'] if not match['bye']]), 2)
        self.assertEqual(sorted(player['seed'] for player in running['players']), [1, 2, 3])
        # Prossimo incontro: schermata «Incontro» e avvio della partita.
        first = min((match for match in running['matches'] if match['status'] == 'ready'),
                    key=lambda match: match['playOrder'])
        response, data = self.post('/api/tournament/match/screen', body={'id': tournament, 'match': first['id']})
        self.assertEqual(response.status, 200)
        screen = json.loads(data)
        self.assertEqual([player['id'] for player in screen['players']], [first['playerA'], first['playerB']])
        self.assertEqual(screen['gameNo'], 1)
        response, _ = self.post('/api/tournament/match/screen', body={'id': tournament})
        self.assertEqual(response.status, 400)
        stranger = self.services['profiles'].create('avvio4', '#ff5d73')['id']
        response, data = self.post('/api/tournament/match/play', body={'id': tournament, 'match': first['id'],
                                                                       'account': stranger})
        self.assertEqual(response.status, 400)
        self.assertIn('uno dei due giocatori', json.loads(data)['error'])
        # Qui RetroArch non c'è: la partita non parte e l'incontro resta da giocare.
        response, _ = self.post('/api/tournament/match/play', body={'id': tournament, 'match': first['id'],
                                                                    'account': first['playerA'], 'sideA': 'p2'})
        self.assertEqual(response.status, 400)
        self.assertEqual(self.services['tournamentRun'].matches.get(first['id'])['status'], 'ready')
        # Menu in partita senza partita: niente slot né miniature; «Esci» non fa nulla.
        self.assertEqual(self.request('GET', '/api/ingame/slots')[0].status, 409)
        self.assertEqual(self.request('GET', '/api/ingame/thumb?slot=1')[0].status, 404)
        response, data = self.post('/api/ingame/quit', body={})
        self.assertEqual((response.status, json.loads(data)['menu']['open']), (200, False))
        # Risultato: niente da dichiarare prima di giocare; con una partita finita si dichiara e si sospende.
        body = {'id': tournament, 'match': first['id'], 'account': ids[0], 'combo': None}
        response, data = self.post('/api/tournament/match/declare', body=dict(body, winner=first['playerA']))
        self.assertEqual(response.status, 400)
        self.assertIn('non è in gioco', json.loads(data)['error'])
        run = self.services['tournamentRun']
        launch = run.play_match(tournament, first['id'], ids[0], None)['match']
        run.match_started(launch)
        run.match_ended(first['id'], None)
        response, _ = self.post('/api/tournament/match/declare', body=dict(body, winner=True))
        self.assertEqual(response.status, 400)
        response, data = self.post('/api/tournament/match/declare', body=dict(body, winner=None))
        self.assertEqual(response.status, 200)
        self.assertEqual((json.loads(data)['done'], json.loads(data)['gameNo']), (False, 1))
        response, data = self.post('/api/tournament/match/suspend', body={'id': tournament, 'match': first['id'],
                                                                         'account': stranger})
        self.assertEqual(response.status, 400)
        response, data = self.post('/api/tournament/match/suspend', body={'id': tournament, 'match': first['id'],
                                                                         'account': first['playerB']})
        self.assertEqual(response.status, 200)
        self.assertIn('tournament', json.loads(data))
        run.match_started(run.play_match(tournament, first['id'], ids[0], None)['match'])
        run.match_ended(first['id'], None)
        response, data = self.post('/api/tournament/match/declare', body=dict(body, winner=first['playerB']))
        self.assertEqual(response.status, 200)
        result = json.loads(data)
        self.assertEqual((result['done'], result['winner'], result['wins']), (True, first['playerB'], [0, 1]))
        self.assertIsNotNone(result['nextMatch'])
        # Azioni dell'admin: annulla il risultato, tavolino, ritiro.
        public = {match['id']: match for match in result['tournament']['matches']}
        self.assertEqual((public[first['id']]['undoKind'], public[first['id']]['canUndo']), ('result', True))
        response, data = self.post('/api/tournament/match/undo', body=dict(body, account=stranger))
        self.assertEqual(response.status, 400)
        response, data = self.post('/api/tournament/match/undo', body=body)
        self.assertEqual((response.status, json.loads(data)['undone']), (200, 'result'))
        # Sorteggio: solo nel girone con pari sul podio dopo gli spareggi.
        response, data = self.post('/api/tournament/draw', body={'id': tournament, 'account': ids[0], 'combo': None})
        self.assertEqual(response.status, 400)
        self.assertIn('girone', json.loads(data)['error'])
        response, data = self.post('/api/tournament/match/walkover', body=dict(body, winner='x'))
        self.assertEqual(response.status, 400)
        response, data = self.post('/api/tournament/match/walkover', body=dict(body, winner=first['playerA']))
        self.assertEqual(response.status, 200)
        public = {match['id']: match for match in json.loads(data)['tournament']['matches']}
        self.assertEqual((public[first['id']]['walkover'], public[first['id']]['winnerId'],
                          public[first['id']]['undoKind']), (True, first['playerA'], 'walkover'))
        other = [match for match in public.values() if match['status'] == 'ready'][0]
        response, data = self.post('/api/tournament/withdraw',
                                   body={'id': tournament, 'account': ids[0], 'combo': None, 'player': stranger})
        self.assertEqual(response.status, 400)
        response, data = self.post('/api/tournament/withdraw', body={'id': tournament, 'account': ids[0],
                                                                     'combo': None, 'player': other['playerB']})
        self.assertEqual(response.status, 200)
        players = {player['id']: player for player in json.loads(data)['tournament']['players']}
        self.assertTrue(players[other['playerB']]['withdrawn'])


class RunRoutesTest(unittest.TestCase):
    """Rotte di gioco con un RetroArch finto che rifiuta subito il contenuto."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.dist = os.path.join(cls.tmp.name, 'dist')
        os.makedirs(cls.dist)
        with open(os.path.join(cls.dist, 'index.html'), 'w') as stream:
            stream.write('<!doctype html>')
        cls.base = os.path.join(cls.tmp.name, 'workspace')
        path = os.path.join(cls.base, 'games', 'nes', 'Zelda.nes')
        os.makedirs(os.path.dirname(path))
        with open(path, 'w') as stream:
            stream.write('x')
        cores = os.path.join(cls.tmp.name, 'retroarch', 'cores')
        os.makedirs(cores)
        shutil.copy(os.path.join(FIXTURES, 'nestopia_libretro.info'), cores)
        with open(os.path.join(cores, 'nestopia_libretro.so'), 'w') as stream:
            stream.write('x')
        with open(os.path.join(cls.tmp.name, 'retroarch', 'retroarch.cfg'), 'w') as stream:
            stream.write('input_quit_gamepad_combo = "0"\n')
        cls.db = Database(os.path.join(cls.tmp.name, 'test.db'))
        cls.db.migrate()
        clock = time.monotonic
        services = create_services(cls.db, cls.base, FakeOpener(), cls.tmp.name,
                                   lambda core, rom: FakeProcess(clock, core, exit_after=0, code=1))
        services['config'].update({'paths.cores': cores,
                                   'paths.appendconfig': os.path.join(cls.tmp.name, 'pixel-arcade.cfg')})
        cls.exits = []
        cls.server = create_server(0, services, cls.dist)
        cls.server.services['exit'] = cls.exits.append
        cls.port = cls.server.server_port
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.db.close()
        cls.tmp.cleanup()

    def call(self, method, path, body=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        headers = {'Host': '127.0.0.1:%d' % self.port}
        if method == 'POST':
            headers.update({'Content-Type': 'application/json', 'X-Pixel-Token': self.server.token})
        conn.request(method, path, body=json.dumps(body or {}) if method == 'POST' else None, headers=headers)
        response = conn.getresponse()
        data = json.loads(response.read())
        conn.close()
        return response.status, data

    def call_raw_status(self, path):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        conn.request('GET', path, headers={'Host': '127.0.0.1:%d' % self.port})
        response = conn.getresponse()
        response.read()
        conn.close()
        return response.status

    def wait_idle(self):
        limit = time.monotonic() + 5
        while time.monotonic() < limit:
            status, run = self.call('GET', '/api/run')
            if not run['running']:
                return run
            time.sleep(0.02)
        self.fail('La partita non è terminata.')

    def test_ricerca_fallita_e_incompatibile(self):
        status, run = self.call('POST', '/api/launch', {'system': 'nes', 'id': 'Zelda.nes', 'players': [None, None]})
        self.assertEqual(status, 200, run)
        self.assertTrue(run['running'])
        run = self.wait_idle()
        self.assertTrue(run['lastResult']['incompatible'])
        self.assertEqual(run['lastResult']['tried'], ['nestopia'])
        status, games = self.call('GET', '/api/games?system=nes')
        self.assertEqual(games['games'][0]['coreStatus'], 'incompatible')
        status, data = self.call('POST', '/api/launch', {'system': 'nes', 'id': 'Zelda.nes'})
        self.assertEqual(status, 409)
        self.assertEqual(data['tried'], ['nestopia'])
        self.assertTrue(data['incompatible'])
        status, data = self.call('POST', '/api/game/core/reset', {'system': 'nes', 'id': 'Zelda.nes'})
        self.assertEqual((status, data['game']['coreStatus']), (200, None))

    def test_compatibilita_retroachievements_nota(self):
        class Known:
            def check(self, system, games):
                return 2

            def known(self, system):
                return {'Zelda.nes': system == 'nes'}
        ra = self.server.services['ra']
        self.server.services['ra'] = Known()
        try:
            status, games = self.call('GET', '/api/games?system=nes')
        finally:
            self.server.services['ra'] = ra
        self.assertEqual((status, games['games'][0]['id'], games['games'][0]['achievements']), (200, 'Zelda.nes', True))
        # I file ancora da controllare si sommano ai checksum mancanti.
        self.assertEqual(games['pending'], 2)

    def test_scelta_manuale(self):
        status, data = self.call('GET', '/api/game/cores?system=nes&id=Zelda.nes')
        self.assertEqual(data['cores'], [{'name': 'nestopia', 'installed': True, 'downloadable': False}])
        status, data = self.call('POST', '/api/game/core', {'system': 'nes', 'id': 'Zelda.nes', 'core': 'nestopia'})
        self.assertEqual((status, data['game']['core'], data['game']['coreStatus']), (200, 'nestopia', 'ok'))
        status, data = self.call('POST', '/api/game/core', {'system': 'nes', 'id': 'Zelda.nes', 'core': 'snes9x'})
        self.assertEqual(status, 400)
        self.call('POST', '/api/game/core/reset', {'system': 'nes', 'id': 'Zelda.nes'})

    def test_richieste_non_valide(self):
        self.assertEqual(self.call('POST', '/api/launch', {'system': 'nes'})[0], 400)
        self.assertEqual(self.call('POST', '/api/launch', {'system': 'nes', 'id': 'manca.nes'})[0], 400)
        self.assertEqual(self.call('POST', '/api/game/core/verdict',
                                   {'system': 'nes', 'id': 'Zelda.nes', 'worked': True})[0], 409)
        self.assertEqual(self.call('POST', '/api/game/core/verdict',
                                   {'system': 'nes', 'id': 'Zelda.nes', 'worked': 'sì'})[0], 400)
        self.assertEqual(self.call('POST', '/api/download/answer', {'core': 'mame', 'accept': True})[0], 409)
        self.assertEqual(self.call('POST', '/api/stop')[1]['phase'], 'idle')

    def test_comandi_del_gioco(self):
        status, data = self.call('GET', '/api/game/controls?system=nes&id=Zelda.nes')
        self.assertEqual(status, 200, data)
        self.assertEqual((data['controls']['descriptors'], data['controls']['confirmed']), ({}, False))
        self.assertEqual(self.call('GET', '/api/game/controls?system=nes&id=manca.nes')[0], 400)
        # Gioco mai avviato: niente nomi dei tasti, niente salvataggio.
        status, data = self.call('POST', '/api/game/controls', {'system': 'nes', 'id': 'Zelda.nes', 'map': {}})
        self.assertEqual(status, 400, data)
        self.assertEqual(self.call('POST', '/api/game/controls',
                                   {'system': 'nes', 'id': 'Zelda.nes', 'map': {'p1': {'b': 'a'}}})[0], 400)
        # Senza la finestra dei comandi aperta.
        self.assertEqual(self.call('POST', '/api/ingame/controls', {'map': {}})[0], 409)

    def test_configurazione(self):
        status, data = self.call('GET', '/api/config?system=nes')
        self.assertEqual(status, 200, data)
        page = data['config']
        self.assertEqual((page['system'], page['id'], page['mode'], page['family']), ('nes', None, 'original', '2d'))
        self.assertEqual([level['id'] for level in page['levels']], ['original', 'soft', 'smooth'])
        self.assertEqual([section['id'] for section in page['sections']], ['graphics', 'latency', 'audio', 'emulation'])
        # Opzioni di RetroArch: solo le chiavi del retroarch.cfg, più lo shader.
        graphics = {option['key']: option for option in page['sections'][0]['options']}
        self.assertEqual(graphics['shader']['value'], '')
        self.assertEqual(self.call('GET', '/api/config?system=manca')[0], 404)
        self.assertEqual(self.call('GET', '/api/config?system=nes&id=manca.nes')[0], 400)
        status, data = self.call('POST', '/api/config/level', {'system': 'nes', 'id': 'Zelda.nes', 'level': 'smooth'})
        self.assertEqual((status, data['config']['mode']), (200, 'smooth'), data)
        self.assertEqual(self.call('POST', '/api/config/level',
                                   {'system': 'nes', 'id': 'Zelda.nes', 'level': 'max'})[0], 400)
        status, data = self.call('POST', '/api/config/level', {'system': 'nes', 'id': 'Zelda.nes', 'level': None})
        self.assertEqual((status, data['config']['mode']), (200, None))
        # Senza Personalizzata non c'è nulla da portare sulla console.
        self.assertEqual(self.call('POST', '/api/config/promote', {'system': 'nes', 'id': 'Zelda.nes'})[0], 400)
        self.assertEqual(self.call('POST', '/api/config/option', {'system': 'nes', 'source': 'retroarch',
                                                                  'key': 'sconosciuta', 'value': 'x'})[0], 400)

    def test_bios(self):
        status, data = self.call('GET', '/api/bios?system=nes')
        self.assertEqual(status, 200, data)
        nestopia = next(entry for entry in data['bios']['cores'] if entry['core'] == 'nestopia')
        self.assertEqual([(row['id'], row['status'], row['required']) for row in nestopia['files']],
                         [('info:disksys.rom', 'missing', False)])
        self.assertEqual(self.call('GET', '/api/bios?system=manca')[0], 404)
        status, data = self.call('GET', '/api/config?system=nes&core=nestopia')
        self.assertEqual(data['config']['bios'], {'status': 'present', 'label': '0 di 1 presenti'})
        status, data = self.call('GET', '/api/bios/check?system=nes&id=Zelda.nes')
        self.assertEqual((status, data['missing'], data['different']), (200, [], []), data)
        source = os.path.join(self.tmp.name, 'scelto', 'disk.rom')
        os.makedirs(os.path.dirname(source), exist_ok=True)
        with open(source, 'wb') as stream:
            stream.write(b'non originale')
        status, listing = self.call('GET', '/api/files?path=' + os.path.dirname(source))
        self.assertEqual((status, [entry['name'] for entry in listing['entries']]), (200, ['disk.rom']))
        self.assertTrue(listing['roots'])
        self.assertEqual(self.call('GET', '/api/files?path=/manca/davvero')[0], 404)
        body = {'system': 'nes', 'core': 'nestopia', 'target': 'info:disksys.rom', 'source': source}
        status, data = self.call('POST', '/api/bios/import', body)
        self.assertEqual(status, 200, data)
        self.assertEqual(data['saved']['path'], 'disksys.rom')
        self.assertIn('non è la versione attesa', data['saved']['warning'])
        status, data = self.call('POST', '/api/bios/import', body)
        self.assertIn('confirm', data)
        status, data = self.call('POST', '/api/bios/remove', {'system': 'nes', 'core': 'nestopia', 'path': 'disksys.rom'})
        self.assertEqual(status, 200, data)
        nestopia = next(entry for entry in data['bios']['cores'] if entry['core'] == 'nestopia')
        self.assertEqual(nestopia['files'][0]['status'], 'missing')
        self.assertEqual(self.call('POST', '/api/bios/import', dict(body, target='info:manca.rom'))[0], 400)

    def test_menu_dei_salvataggi_in_partita(self):
        status, run = self.call('GET', '/api/run')
        self.assertEqual(run['menu'], {'open': False, 'kind': None, 'slot': None, 'account': None, 'other': None,
                                       'undo': False, 'busy': False, 'shot': None, 'players': [], 'locked': False, 'temp': False})
        self.assertEqual(self.call_raw_status('/api/ingame/shot'), 404)
        for body in ({}, {'slot': 'p3'}, {'slot': 1}):
            self.assertEqual(self.call('POST', '/api/ingame/open', body)[0], 400)
        # Senza partita in corso la combinazione si ignora.
        status, run = self.call('POST', '/api/ingame/open', {'slot': 'p1'})
        self.assertEqual((status, run['menu']['open']), (200, False))
        for slot in (0, 10, '1', True, None):
            self.assertEqual(self.call('POST', '/api/ingame/save', {'slot': slot})[0], 400)
            self.assertEqual(self.call('POST', '/api/ingame/load', {'slot': slot})[0], 400)
        status, data = self.call('POST', '/api/ingame/save', {'slot': 1})
        self.assertEqual(status, 409, data)
        self.assertEqual(self.call('POST', '/api/ingame/load', {'slot': 1})[0], 409)
        self.assertEqual(self.call('POST', '/api/ingame/undo')[0], 409)
        status, run = self.call('POST', '/api/ingame/close')
        self.assertEqual((status, run['menu']['open']), (200, False))

    def test_tasti_del_joypad(self):
        pad = 'Pad (STANDARD GAMEPAD Vendor: 0079 Product: 0006)'
        buttons = {'a': 2, 'b': 1, 'select': 8, 'start': 9}
        status, data = self.call('POST', '/api/joypads/buttons', {'id': pad, 'buttons': buttons})
        self.assertEqual((status, data['padButtons']), (200, {pad: buttons}))
        status, data = self.call('GET', '/api/bootstrap')
        self.assertEqual(data['padButtons'], {pad: buttons})
        status, data = self.call('POST', '/api/joypads/buttons', {'id': pad, 'buttons': {'a': 0, 'b': 1}})
        self.assertEqual(status, 400)

    def test_joypad_non_validi(self):
        for pads in ([0, 0], [16, None], [True, None], ['0', None], [0, 1, 2], 'x'):
            status, data = self.call('POST', '/api/launch', {'system': 'nes', 'id': 'Zelda.nes', 'pads': pads})
            self.assertEqual(status, 400, pads)
        for models in ('x', [None, None, None], ['x'], [{'vendor': 1, 'product': 2}], [{'vendor': -1, 'product': 2, 'rank': 0}],
                       [{'vendor': 1, 'product': 0x10000, 'rank': 0}], [{'vendor': True, 'product': 2, 'rank': 0}]):
            status, data = self.call('POST', '/api/launch', {'system': 'nes', 'id': 'Zelda.nes', 'pads': [0, None],
                                                             'padModels': models})
            self.assertEqual(status, 400, models)

    def test_profili(self):
        status, data = self.call('GET', '/api/profiles')
        self.assertEqual(status, 200)
        before = len(data['accounts'])
        status, account = self.call('POST', '/api/profiles', {'name': 'server 1', 'color': '#f5c542', 'favConsole': 'nes'})
        self.assertEqual((status, account['name'], account['favConsole'], account['level']), (200, 'SERVER_1', 'nes', 1))
        status, data = self.call('POST', '/api/profiles', {'name': 'Server_1', 'color': '#ff5d73'})
        self.assertEqual((status, data['error']), (409, 'Nome già in uso'))
        status, data = self.call('POST', '/api/profiles', {'name': 'ALTRO', 'color': 'rosso'})
        self.assertEqual(status, 400)
        status, data = self.call('GET', '/api/profiles')
        self.assertEqual(len(data['accounts']), before + 1)
        self.assertEqual(data['accounts'][-1], account)
        status, data = self.call('GET', '/api/profiles/stats?id=%d' % account['id'])
        self.assertEqual((status, data['history'], data['more']), (200, [], False))
        self.assertEqual(self.call('GET', '/api/profiles/stats')[0], 400)
        self.assertEqual(self.call('GET', '/api/profiles/stats?id=99999')[0], 400)

    def test_avatar_gravatar(self):
        avatars = self.server.services['avatars']
        asked = []

        class FakeAvatars:
            def get(self, digest):
                asked.append(digest)
                return (b'\x89PNG\r\n\x1a\nimg', 'image/png') if digest == HAS_AVATAR else None

        HAS_AVATAR = hashlib.sha256(b'foto@example.com').hexdigest()
        self.server.services['avatars'] = FakeAvatars()
        try:
            status, account = self.call('POST', '/api/profiles', {'name': 'AVATAR', 'color': '#a48bff'})
            self.assertEqual((status, account['avatar']), (200, False))
            path = '/api/profiles/avatar?id=%d' % account['id']
            self.assertEqual(self.raw_get(path)[0], 404)
            self.assertEqual(asked, [])
            status, account = self.call('POST', '/api/profiles/update',
                                        {'id': account['id'], 'patch': {'email': 'Foto@Example.com'}})
            self.assertEqual((status, account['avatar']), (200, True))
            self.assertNotIn('example', json.dumps(self.call('GET', '/api/profiles')[1]).lower())
            self.assertEqual(self.raw_get(path), (200, 'image/png', b'\x89PNG\r\n\x1a\nimg'))
            self.call('POST', '/api/profiles/update', {'id': account['id'], 'patch': {'email': 'altra@example.com'}})
            self.assertEqual(self.raw_get(path)[0], 404)
            self.assertEqual(self.call('POST', '/api/profiles/update',
                                       {'id': account['id'], 'patch': {'email': 'non valida'}})[0], 400)
            self.assertEqual(self.raw_get('/api/profiles/avatar')[0], 400)
            self.assertEqual(self.raw_get('/api/profiles/avatar?id=99999')[0], 400)
        finally:
            self.server.services['avatars'] = avatars

    def test_retroachievements_senza_segreti_nelle_risposte(self):
        from tests.test_retroachievements import KEY, PASSWORD, TOKEN, FakeClient
        service = self.server.services['ra']
        service.client = FakeClient()
        status, account = self.call('POST', '/api/profiles', {'name': 'TROFEI', 'color': '#8fd46a'})
        self.assertEqual(status, 200)
        self.assertIsNone(account['raUser'])
        self.assertEqual(self.call('POST', '/api/ra/key', {'key': 'X' * 32})[0], 400)
        status, data = self.call('POST', '/api/ra/key', {'key': KEY})
        self.assertEqual((status, data), (200, {'key': {'set': True, 'last4': '2345'}}))
        self.assertEqual(self.call('POST', '/api/ra/link', {'account': account['id'], 'username': 'Player1',
                                                            'password': 'sbagliata'})[0], 400)
        status, data = self.call('POST', '/api/ra/link', {'account': account['id'], 'username': 'Player1',
                                                          'password': PASSWORD})
        self.assertEqual((status, data), (200, {'username': 'Player1'}))
        responses = [self.call('GET', '/api/ra'), self.call('GET', '/api/profiles'),
                     self.call('GET', '/api/settings'), self.call('GET', '/api/ra/profile?account=%d' % account['id']),
                     self.call('GET', '/api/ra/game?system=nes&game=Zelda.nes&account=' + str(account['id']))]
        for status, data in responses:
            self.assertEqual(status, 200)
            text = json.dumps(data)
            for secret in (KEY, TOKEN, PASSWORD):
                self.assertNotIn(secret, text)
        self.assertEqual(responses[0][1], {'key': {'set': True, 'last4': '2345'},
                                           'accounts': {str(account['id']): 'Player1'}})
        mine = [item for item in responses[1][1]['accounts'] if item['id'] == account['id']][0]
        self.assertEqual(mine['raUser'], 'Player1')
        self.assertEqual(responses[4][1]['status'], 'unknown')
        self.assertEqual(self.call('GET', '/api/ra/game?system=nes&game=Manca.nes')[0], 404)
        self.assertEqual(self.call('GET', '/api/ra/badge?name=..%2Fx')[0], 400)
        self.assertEqual(self.call_raw_status('/api/ra/badge?name=111'), 200)
        self.assertEqual(self.call('POST', '/api/ra/unlink', {'account': account['id']}), (200, {'username': None}))
        self.assertEqual(self.call('POST', '/api/ra/key/delete')[1], {'key': {'set': False, 'last4': None}})

    def test_preferiti_e_preferenze(self):
        status, account = self.call('POST', '/api/profiles', {'name': 'FAV', 'color': '#8fd46a'})
        self.assertEqual(status, 200)
        status, data = self.call('POST', '/api/favorites', {'account': account['id'], 'game': 'nes/Zelda.nes', 'on': True})
        self.assertEqual((status, data['favorites']), (200, ['nes/Zelda.nes']))
        self.assertEqual(data['games']['nes/Zelda.nes']['title'], 'Zelda')
        self.assertFalse(data['games']['nes/Zelda.nes']['missing'])
        status, data = self.call('GET', '/api/profiles')
        mine = [item for item in data['accounts'] if item['id'] == account['id']][0]
        self.assertEqual(mine['favorites'], ['nes/Zelda.nes'])
        self.assertEqual(data['games']['nes/Zelda.nes']['systemName'], 'NES')
        for body in ({'account': account['id'], 'game': 'nes/Manca.nes', 'on': True},
                     {'account': 999, 'game': 'nes/Zelda.nes', 'on': True},
                     {'account': account['id'], 'game': 'Zelda.nes', 'on': True},
                     {'account': account['id'], 'game': 'nes/Zelda.nes', 'on': 'sì'}):
            self.assertEqual(self.call('POST', '/api/favorites', body)[0], 400, body)
        status, data = self.call('POST', '/api/favorites', {'account': account['id'], 'game': 'nes/Zelda.nes', 'on': False})
        self.assertEqual((status, data), (200, {'favorites': [], 'games': {}}))
        status, data = self.call('POST', '/api/profiles/update', {'id': account['id'], 'patch': {
            'difficulty': 'Facile', 'opts': {'crt': True}, 'genres': ['Corse'], 'favConsole': 'nes'}})
        self.assertEqual(status, 200)
        self.assertEqual((data['difficulty'], data['opts']['crt'], data['genres'], data['favConsole']),
                         ('Facile', True, ['Corse'], 'nes'))
        status, data = self.call('POST', '/api/profiles/update', {'id': account['id'], 'patch': {'difficulty': 'x'}})
        self.assertEqual((status, data['error']), (400, 'Difficoltà non valida.'))

    def test_playlist_e_giochi_giocati(self):
        status, data = self.call('POST', '/api/playlists', {'name': 'Server', 'filters': {'genre': ['Azione']},
                                                            'games': ['nes/Zelda.nes']})
        self.assertEqual(status, 200)
        playlist = [item for item in data['playlists'] if item['name'] == 'Server'][0]
        self.assertEqual((playlist['filters'], playlist['games']), ({'genre': ['Azione']}, ['nes/Zelda.nes']))
        self.assertEqual(data['games']['nes/Zelda.nes']['title'], 'Zelda')
        self.assertEqual(self.call('POST', '/api/playlists', {'name': 'server'})[0], 409)
        self.assertEqual(self.call('POST', '/api/playlists', {'name': 'X', 'games': ['nes/Manca.nes']})[0], 400)
        status, data = self.call('POST', '/api/playlists/game', {'id': playlist['id'], 'game': 'nes/Zelda.nes', 'on': False})
        self.assertEqual(status, 200)
        status, data = self.call('POST', '/api/playlists/update', {'id': playlist['id'], 'patch': {'name': 'Server 2'}})
        self.assertEqual(status, 200)
        status, data = self.call('GET', '/api/playlists')
        mine = [item for item in data['playlists'] if item['id'] == playlist['id']][0]
        self.assertEqual((mine['name'], mine['games']), ('Server 2', []))
        status, data = self.call('POST', '/api/playlists/delete', {'id': playlist['id']})
        self.assertEqual((status, [item['id'] for item in data['playlists'] if item['id'] == playlist['id']]), (200, []))
        self.assertEqual(self.call('POST', '/api/playlists/delete', {'id': playlist['id']})[0], 400)
        status, account = self.call('POST', '/api/profiles', {'name': 'GIOCATI', 'color': '#5b93ff'})
        self.assertEqual(self.call('GET', '/api/profiles/played?id=%d' % account['id']), (200, {'played': []}))
        self.assertEqual(self.call('GET', '/api/profiles/played')[0], 400)
        self.assertEqual(self.call('GET', '/api/profiles/played?id=99999')[0], 400)

    def raw_get(self, path):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        conn.request('GET', path, headers={'Host': '127.0.0.1:%d' % self.port})
        response = conn.getresponse()
        data = response.read()
        conn.close()
        return response.status, response.getheader('Content-Type'), data

    def test_salvataggi_del_profilo(self):
        status, account = self.call('POST', '/api/profiles', {'name': 'SALVA', 'color': '#a48bff'})
        self.assertEqual(status, 200)
        self.assertEqual(self.call('GET', '/api/saves?account=%d' % account['id']), (200, {'games': []}))
        session = os.path.join(self.tmp.name, 'sessione-prova')
        os.makedirs(session, exist_ok=True)
        for name in ('Zelda.state.auto', 'Zelda.state.auto.png'):
            with open(os.path.join(session, name), 'wb') as stream:
                stream.write(fake_png() if name.endswith('png') else b'stato')
        store = self.server.services['saves']
        store.store_state(account['id'], 'nes', 'Zelda.nes', 0, 'nestopia', os.path.join(session, 'Zelda.state.auto'),
                          os.path.join(session, 'Zelda.state.auto.png'))
        status, data = self.call('GET', '/api/saves?account=%d' % account['id'])
        self.assertEqual(status, 200)
        [game] = data['games']
        self.assertEqual((game['system'], game['id'], game['title'], game['systemName'], game['slots'], game['thumb']),
                         ('nes', 'Zelda.nes', 'Zelda', 'NES', 1, True))
        self.assertEqual(game['resumeAt'], game['updatedAt'])
        status, kind, body = self.raw_get('/api/saves/thumb?account=%d&system=nes&game=Zelda.nes&slot=0' % account['id'])
        self.assertEqual((status, kind, body), (200, 'image/png', fake_png()))
        status, kind, body = self.raw_get('/api/saves/thumb?account=%d&system=nes&game=Zelda.nes&slot=1' % account['id'])
        self.assertEqual(status, 404)
        for path in ('/api/saves', '/api/saves?account=x', '/api/saves?account=999',
                     '/api/saves/thumb?account=%d&system=nes&game=Zelda.nes&slot=10' % account['id'],
                     '/api/saves/thumb?account=%d&game=Zelda.nes' % account['id']):
            self.assertEqual(self.call('GET', path)[0], 400, path)

    def test_salvataggi_del_gioco(self):
        status, luca = self.call('POST', '/api/profiles', {'name': 'GIOCO_A', 'color': '#a48bff'})
        status, sara = self.call('POST', '/api/profiles', {'name': 'GIOCO_B', 'color': '#3ccfc4'})
        session = os.path.join(self.tmp.name, 'sessione-gioco')
        os.makedirs(session, exist_ok=True)
        state = os.path.join(session, 'Zelda.state.auto')
        with open(state, 'wb') as stream:
            stream.write(b'stato')
        store = self.server.services['saves']
        store.store_state(luca['id'], 'nes', 'Zelda.nes', 0, 'nestopia', state)
        store.store_state(luca['id'], 'nes', 'Zelda.nes', 2, 'fceumm', state)
        path = '/api/saves/game?system=nes&game=Zelda.nes&accounts=%d,999,%d,%d' % (luca['id'], sara['id'], luca['id'])
        status, data = self.call('GET', path)
        self.assertEqual(status, 200)
        self.assertEqual([item['id'] for item in data['accounts']], [luca['id'], sara['id']])
        self.assertEqual(data['accounts'][1]['slots'], [])
        # Senza core associato tutti gli stati si possono caricare.
        self.assertEqual([(item['slot'], item['core'], item['loadable']) for item in data['accounts'][0]['slots']],
                         [(0, 'nestopia', True), (2, 'fceumm', True)])
        self.call('POST', '/api/game/core', {'system': 'nes', 'id': 'Zelda.nes', 'core': 'nestopia'})
        status, data = self.call('GET', path)
        self.assertEqual([(item['slot'], item['loadable']) for item in data['accounts'][0]['slots']],
                         [(0, True), (2, False)])
        self.call('POST', '/api/game/core/reset', {'system': 'nes', 'id': 'Zelda.nes'})
        self.assertEqual(self.call('GET', '/api/saves/game?system=nes&game=Zelda.nes'), (200, {'accounts': [], 'shared': []}))
        for bad in ('/api/saves/game?system=nes&accounts=1', '/api/saves/game?game=Zelda.nes&accounts=1',
                    '/api/saves/game?system=nes&game=Zelda.nes&accounts=1,x'):
            self.assertEqual(self.call('GET', bad)[0], 400, bad)

    def test_operazioni_sugli_slot(self):
        status, luca = self.call('POST', '/api/profiles', {'name': 'OPERA_A', 'color': '#a48bff'})
        status, sara = self.call('POST', '/api/profiles', {'name': 'OPERA_B', 'color': '#3ccfc4'})
        status, ugo = self.call('POST', '/api/profiles', {'name': 'OPERA_C', 'color': '#f5c542'})
        session = os.path.join(self.tmp.name, 'sessione-operazioni')
        os.makedirs(session, exist_ok=True)
        state = os.path.join(session, 'Zelda.state')
        with open(state, 'wb') as stream:
            stream.write(b'stato')
        store = self.server.services['saves']
        for slot in (1, 2):
            store.store_state(luca['id'], 'nes', 'Zelda.nes', slot, 'fceumm', state)
        key = {'account': luca['id'], 'system': 'nes', 'game': 'Zelda.nes'}
        status, data = self.call('POST', '/api/saves/rename', dict(key, slot=1, name='  Prima del boss  '))
        self.assertEqual((status, data['slots'][0]['name']), (200, 'Prima del boss'))
        status, data = self.call('POST', '/api/saves/protect', dict(key, slot=1, protected=True))
        self.assertEqual((status, data['slots'][0]['protected']), (200, True))
        status, data = self.call('POST', '/api/saves/delete', dict(key, slot=1))
        self.assertEqual(status, 409, data)
        status, data = self.call('POST', '/api/saves/delete', dict(key, slot=2))
        self.assertEqual((status, [item['slot'] for item in data['slots']]), (200, [1]))
        status, data = self.call('POST', '/api/saves/copy', dict(key, slot=1, to=sara['id'], toSlot=5))
        self.assertEqual(status, 200, data)
        self.assertEqual([(item['slot'], item['name'], item['protected']) for item in data['slots']],
                         [(5, None, False)])
        for path, body in (('/api/saves/rename', dict(key, slot=0, name='x')),
                           ('/api/saves/rename', dict(key, slot=1, name=5)),
                           ('/api/saves/rename', dict(key, slot=3, name='x')),
                           ('/api/saves/protect', dict(key, slot=1, protected='sì')),
                           ('/api/saves/protect', dict(key, account=999, slot=1, protected=True)),
                           ('/api/saves/delete', dict(key, slot=10)),
                           ('/api/saves/delete', dict(key, slot=True)),
                           ('/api/saves/delete', {'account': luca['id'], 'system': 'nes', 'slot': 1}),
                           ('/api/saves/copy', dict(key, slot=1, to=luca['id'], toSlot=5)),
                           ('/api/saves/copy', dict(key, slot=1, to=999, toSlot=5)),
                           ('/api/saves/copy', dict(key, slot=1, to=sara['id'], toSlot=0))):
            self.assertEqual(self.call('POST', path, body)[0], 400, (path, body))
        # In partita: solo i giocatori, e la copia solo verso l'altro giocatore.
        play = self.server.services['play']
        info = dict(play.ingame_info(), players=[luca['id'], sara['id']])
        with mock.patch.object(play, 'playing', return_value=True), \
                mock.patch.object(play, 'ingame_info', return_value=info):
            status, data = self.call('POST', '/api/saves/copy', dict(key, slot=1, to=ugo['id'], toSlot=1))
            self.assertEqual(status, 409, data)
            self.assertEqual(self.call('POST', '/api/saves/protect',
                                       dict(key, account=ugo['id'], slot=1, protected=True))[0], 409)
            status, data = self.call('POST', '/api/saves/protect', dict(key, account=sara['id'], slot=5, protected=True))
            self.assertEqual(status, 200, data)
            status, data = self.call('POST', '/api/saves/copy', dict(key, slot=1, to=sara['id'], toSlot=5))
            self.assertEqual(status, 409, data)
            status, data = self.call('POST', '/api/saves/copy', dict(key, slot=1, to=sara['id'], toSlot=6))
            self.assertEqual((status, [item['slot'] for item in data['slots']]), (200, [5, 6]))

    def test_operazioni_dal_profilo(self):
        status, luca = self.call('POST', '/api/profiles', {'name': 'PROFILO_A', 'color': '#a48bff'})
        status, ugo = self.call('POST', '/api/profiles', {'name': 'PROFILO_C', 'color': '#f5c542'})
        session = os.path.join(self.tmp.name, 'sessione-profilo')
        os.makedirs(session, exist_ok=True)
        state = os.path.join(session, 'Zelda.state')
        with open(state, 'wb') as stream:
            stream.write(b'stato')
        store = self.server.services['saves']
        for slot in (0, 1, 2, 3):
            store.store_state(luca['id'], 'nes', 'Zelda.nes', slot, 'fceumm', state)
        key = {'account': luca['id'], 'system': 'nes', 'game': 'Zelda.nes', 'scope': 'profile'}
        # Fuori dalla partita la copia va verso qualunque altro profilo.
        status, data = self.call('POST', '/api/saves/copy', dict(key, slot=1, to=ugo['id'], toSlot=4))
        self.assertEqual((status, [item['slot'] for item in data['slots']]), (200, [4]))
        status, data = self.call('POST', '/api/saves/protect', dict(key, slot=2, protected=True))
        self.assertEqual(status, 200, data)
        play = self.server.services['play']
        running = dict(play.state(), running=True, game={'system': 'nes', 'id': 'Zelda.nes', 'title': 'Zelda'})
        info = dict(play.ingame_info(), players=[ugo['id']])
        with mock.patch.object(play, 'state', return_value=running), \
                mock.patch.object(play, 'playing', return_value=True), \
                mock.patch.object(play, 'ingame_info', return_value=info):
            # Partita dello stesso gioco: dal Profilo nulla si tocca.
            for path, body in (('/api/saves/rename', dict(key, slot=1, name='x')),
                               ('/api/saves/protect', dict(key, slot=1, protected=True)),
                               ('/api/saves/delete', dict(key, slot=3)),
                               ('/api/saves/copy', dict(key, slot=1, to=ugo['id'], toSlot=5)),
                               ('/api/saves/delete-game', key)):
                status, data = self.call('POST', path, body)
                self.assertEqual((status, data['error']), (409, 'Il gioco è in corso.'), path)
            # Partita di un altro gioco: il Profilo vale anche per chi non gioca.
            running['game'] = {'system': 'snes', 'id': 'Mario.sfc', 'title': 'Mario'}
            status, data = self.call('POST', '/api/saves/rename', dict(key, slot=1, name='Boss'))
            self.assertEqual((status, data['slots'][1]['name']), (200, 'Boss'))
        status, data = self.call('POST', '/api/saves/delete-game', key)
        self.assertEqual((status, data['remaining'], [item['slot'] for item in data['slots']]), (200, 1, [2]))
        status, data = self.call('GET', '/api/saves?account=%d' % luca['id'])
        self.assertEqual([game['slots'] for game in data['games']], [1])
        self.assertEqual(self.call('POST', '/api/saves/delete-game', {'account': 999, 'system': 'nes',
                                                                      'game': 'Zelda.nes'})[0], 400)
        self.assertEqual(self.call('POST', '/api/saves/delete-game', {'account': luca['id'], 'system': 'nes'})[0], 400)

    def test_avvio_da_uno_stato_non_valido(self):
        for resume in ('x', [1, 0], {'account': 1}, {'account': '1', 'slot': 0}, {'account': 1, 'slot': 10},
                       {'account': 1, 'slot': True}):
            status, data = self.call('POST', '/api/launch', {'system': 'nes', 'id': 'Zelda.nes', 'resume': resume})
            self.assertEqual(status, 400, resume)
        status, data = self.call('POST', '/api/launch', {'system': 'nes', 'id': 'Zelda.nes', 'players': [None, None],
                                                         'resume': {'account': 999, 'slot': 0}})
        self.assertEqual((status, data['error']), (400, 'Il salvataggio non è di un giocatore della partita.'))
        self.assertFalse(self.call('GET', '/api/run')[1]['running'])

    def test_soccorso_senza_partita(self):
        status, data = self.call('POST', '/api/run/rescue')
        self.assertEqual((status, data['error']), (409, 'Nessuna partita in corso.'))
        status, data = self.call('POST', '/api/run/rescue/answer', {'choice': 'previous'})
        self.assertEqual((status, data['error']), (409, 'Nessun soccorso aperto.'))
        self.assertEqual(self.call('POST', '/api/run/rescue/answer', {'choice': 3})[0], 400)
        self.assertEqual(self.call('GET', '/api/run/rescue/thumb?item=r0')[0], 404)

    def test_impostazioni_e_core_inutilizzati(self):
        status, data = self.call('GET', '/api/settings')
        self.assertTrue(data['retroarch']['quitCombo'])
        self.assertEqual(self.call('GET', '/api/cores/unused'), (200, {'cores': [], 'total': 0}))
        self.assertEqual(self.call('POST', '/api/cores/unused/delete'), (200, {'cores': [], 'total': 0}))

    def test_uscita(self):
        self.assertEqual(self.call('GET', '/api/exit/check'), (200, {'busy': []}))
        del self.exits[:]
        status, data = self.call('POST', '/api/exit')
        self.assertEqual(status, 200)
        status, data = self.call('POST', '/api/exit', {'keepRunning': True})
        self.assertEqual(status, 200)
        # Solo il valore booleano vero chiede di continuare in background.
        self.call('POST', '/api/exit', {'keepRunning': 'sì'})
        self.assertEqual(self.exits, [False, True, False])

    def post_local(self, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        conn.request('POST', '/api/show', body='{}', headers=dict({'Host': '127.0.0.1:%d' % self.port,
                                                                  'Content-Type': 'application/json'},
                                                                 **(headers or {})))
        response = conn.getresponse()
        data = json.loads(response.read())
        conn.close()
        return response.status, data

    def test_riapertura_da_un_processo_locale(self):
        # Senza la funzione di riapertura (servizio senza Chrome) non si riapre nulla.
        self.assertEqual(self.post_local(), (200, {'shown': False}))
        shown = []
        self.server.services['show'] = lambda: shown.append(True) or True
        try:
            self.assertEqual(self.post_local(), (200, {'shown': True}))
            # Una pagina web invia sempre Origin o Sec-Fetch-Site: rifiutata anche senza token.
            self.assertEqual(self.post_local({'Origin': 'http://127.0.0.1:%d' % self.port})[0], 403)
            self.assertEqual(self.post_local({'Sec-Fetch-Site': 'same-origin'})[0], 403)
            self.assertEqual(self.post_local({'Host': 'evil.example'})[0], 403)
        finally:
            del self.server.services['show']
        self.assertEqual(shown, [True])


if __name__ == '__main__':
    unittest.main()
