import unittest

from pixelarcade.web import security

TOKEN = 'segreto'


class CheckRequestTest(unittest.TestCase):
    def check(self, headers, is_post=False):
        return security.check_request(headers, 8765, is_post, TOKEN)

    def test_host_consentiti(self):
        self.assertIsNone(self.check({'Host': '127.0.0.1:8765'}))
        self.assertIsNone(self.check({'Host': 'localhost:8765'}))

    def test_host_estranei(self):
        self.assertIsNotNone(self.check({'Host': 'evil.example:8765'}))
        self.assertIsNotNone(self.check({'Host': '127.0.0.1:9999'}))
        self.assertIsNotNone(self.check({}))

    def test_origin(self):
        self.assertIsNone(self.check({'Host': '127.0.0.1:8765', 'Origin': 'http://127.0.0.1:8765'}))
        self.assertIsNotNone(self.check({'Host': '127.0.0.1:8765', 'Origin': 'http://localhost:8765'}))
        self.assertIsNotNone(self.check({'Host': '127.0.0.1:8765', 'Origin': 'http://evil.example'}))

    def test_cross_site(self):
        self.assertIsNotNone(self.check({'Host': '127.0.0.1:8765', 'Sec-Fetch-Site': 'cross-site'}))
        self.assertIsNone(self.check({'Host': '127.0.0.1:8765', 'Sec-Fetch-Site': 'same-origin'}))

    def test_token_per_post(self):
        host = {'Host': '127.0.0.1:8765'}
        self.assertIsNotNone(self.check(host, is_post=True))
        self.assertIsNotNone(self.check(dict(host, **{'X-Pixel-Token': 'sbagliato'}), is_post=True))
        self.assertIsNone(self.check(dict(host, **{'X-Pixel-Token': TOKEN}), is_post=True))


class HeadersTest(unittest.TestCase):
    def test_intestazioni(self):
        values = dict(security.headers('text/html; charset=utf-8', 'no-store'))
        self.assertEqual(values['Content-Type'], 'text/html; charset=utf-8')
        self.assertEqual(values['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(values['Referrer-Policy'], 'no-referrer')
        self.assertEqual(values['Cache-Control'], 'no-store')
        self.assertIn("frame-ancestors 'none'", values['Content-Security-Policy'])
        self.assertIn("script-src 'self'", values['Content-Security-Policy'])
        self.assertIn("frame-src 'self' http://127.0.0.1:*", values['Content-Security-Policy'])


if __name__ == '__main__':
    unittest.main()
