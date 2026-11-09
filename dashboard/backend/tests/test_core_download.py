import io
import os
import tempfile
import unittest
import urllib.error
import zipfile

from pixelarcade.core_download import CoreDownloader, DownloadCancelled, core_url
from pixelarcade.errors import LaunchError

BASE = 'https://buildbot.example/latest/'


def make_zip(members):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as bundle:
        for name, data in members.items():
            bundle.writestr(name, data)
    return buffer.getvalue()


class Response(io.BytesIO):
    def __init__(self, data):
        super().__init__(data)
        self.headers = {'Content-Length': str(len(data))}


class FakeOpener:
    def __init__(self):
        self.files = {}
        self.fail = False
        self.requests = []

    def __call__(self, request, timeout):
        url = request if isinstance(request, str) else request.full_url
        method = 'GET' if isinstance(request, str) else request.get_method()
        self.requests.append((method, url, timeout))
        if self.fail:
            raise urllib.error.URLError('rete assente')
        if url not in self.files:
            raise urllib.error.HTTPError(url, 404, 'Not Found', {}, None)
        data = self.files[url]
        return HeadResponse(len(data)) if method == 'HEAD' else Response(data)


class HeadResponse(io.BytesIO):
    def __init__(self, size):
        super().__init__(b'')
        self.headers = {'Content-Length': str(size)}


class FakeConfig:
    def __init__(self, cores):
        self.cores = cores

    def get(self):
        return {'cores.buildbot_url': BASE}

    def resolve_path(self, key):
        return self.cores


class FakeRepo:
    def __init__(self):
        self.added = {}
        self.used = set()

    def add_downloaded(self, core, size):
        self.added[core] = size

    def unused_downloaded(self):
        return {core: size for core, size in sorted(self.added.items()) if core not in self.used}

    def remove_downloaded(self, core):
        del self.added[core]


class CoreDownloadTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cores = os.path.join(self.tmp.name, 'cores')
        self.data = os.path.join(self.tmp.name, 'data')
        os.makedirs(self.cores)
        self.opener = FakeOpener()
        self.repo = FakeRepo()
        self.downloader = CoreDownloader(FakeConfig(self.cores), self.repo, self.data, self.opener)

    def tearDown(self):
        self.tmp.cleanup()

    def publish(self, core, data):
        self.opener.files[core_url(BASE, core)] = data

    def leftovers(self):
        return sorted(os.listdir(self.cores)), sorted(os.listdir(self.data)) if os.path.isdir(self.data) else []

    def test_download_riuscito(self):
        archive = make_zip({'fbneo_libretro.so': b'ELF' * 1000})
        self.publish('fbneo', archive)
        progress = []
        path = self.downloader.download('fbneo', lambda done, total: progress.append((done, total)))
        self.assertEqual(path, os.path.join(self.cores, 'fbneo_libretro.so'))
        with open(path, 'rb') as stream:
            self.assertEqual(stream.read(), b'ELF' * 1000)
        self.assertEqual(os.stat(path).st_mode & 0o777, 0o644)
        self.assertEqual(self.repo.added, {'fbneo': len(archive)})
        self.assertEqual(progress[-1], (len(archive), len(archive)))
        self.assertEqual(self.leftovers(), (['fbneo_libretro.so'], []))
        self.assertEqual(self.opener.requests[0], ('GET', BASE + 'fbneo_libretro.so.zip', 30))

    def test_dimensione(self):
        self.publish('mame', b'x' * 1234)
        self.assertEqual(self.downloader.size('mame'), 1234)
        self.assertIsNone(self.downloader.size('manca'))
        self.assertEqual(self.opener.requests[0][0], 'HEAD')

    def test_zip_con_nomi_estranei(self):
        for members in ({'fbneo_libretro.so': b'a', 'leggimi.txt': b'b'},
                        {'../fbneo_libretro.so': b'a'},
                        {'cartella/fbneo_libretro.so': b'a'},
                        {'altro_libretro.so': b'a'}):
            self.publish('fbneo', make_zip(members))
            with self.assertRaises(LaunchError):
                self.downloader.download('fbneo')
            self.assertEqual(self.leftovers(), ([], []), members)
        self.assertEqual(self.repo.added, {})

    def test_file_non_zip(self):
        self.publish('fbneo', b'<html>errore</html>')
        with self.assertRaises(LaunchError):
            self.downloader.download('fbneo')
        self.assertEqual(self.leftovers(), ([], []))

    def test_file_troppo_grande(self):
        from pixelarcade import core_download
        self.publish('fbneo', make_zip({'fbneo_libretro.so': b'x' * 5000}))
        original = core_download.MAX_BYTES
        core_download.MAX_BYTES = 100
        try:
            with self.assertRaises(LaunchError):
                self.downloader.download('fbneo')
        finally:
            core_download.MAX_BYTES = original
        self.assertEqual(self.leftovers(), ([], []))

    def test_interruzione(self):
        self.publish('fbneo', make_zip({'fbneo_libretro.so': b'x'}))
        with self.assertRaises(DownloadCancelled):
            self.downloader.download('fbneo', cancel=lambda: True)
        self.assertEqual(self.leftovers(), ([], []))

    def test_errore_di_rete(self):
        self.opener.fail = True
        with self.assertRaises(LaunchError) as raised:
            self.downloader.download('fbneo')
        self.assertIn('rete assente', str(raised.exception))
        self.assertEqual(self.leftovers(), ([], []))

    def test_non_sovrascrive(self):
        path = os.path.join(self.cores, 'fbneo_libretro.so')
        with open(path, 'wb') as stream:
            stream.write(b'originale')
        self.publish('fbneo', make_zip({'fbneo_libretro.so': b'nuovo'}))
        self.assertEqual(self.downloader.download('fbneo'), path)
        with open(path, 'rb') as stream:
            self.assertEqual(stream.read(), b'originale')
        self.assertEqual(self.opener.requests, [])

    def test_core_inutilizzati(self):
        for name in ('fbneo', 'mame', 'nestopia'):
            self.publish(name, make_zip({name + '_libretro.so': b'x' * 10}))
            self.downloader.download(name)
        # Core di RetroArch: mai in elenco né cancellato.
        with open(os.path.join(self.cores, 'snes9x_libretro.so'), 'wb') as stream:
            stream.write(b'x')
        os.unlink(os.path.join(self.cores, 'nestopia_libretro.so'))
        self.repo.used.add('fbneo')
        self.assertEqual(self.downloader.unused(), [{'name': 'mame', 'size': 10}])
        self.downloader.delete_unused()
        self.assertEqual(sorted(os.listdir(self.cores)), ['fbneo_libretro.so', 'snes9x_libretro.so'])
        self.assertEqual(sorted(self.repo.added), ['fbneo', 'nestopia'])

    def test_nome_non_valido(self):
        with self.assertRaises(LaunchError):
            self.downloader.download('../x')


if __name__ == '__main__':
    unittest.main()
