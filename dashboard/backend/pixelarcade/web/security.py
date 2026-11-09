"""Controlli sull'origine delle richieste e intestazioni di sicurezza."""
import secrets

# I riquadri possono mostrare anche pagine di servizi locali (127.0.0.1, qualsiasi porta), per le estensioni.
CSP = ("default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
       "connect-src 'self'; frame-src 'self' http://127.0.0.1:*; frame-ancestors 'none'")


def check_request(headers, port, is_post, token):
    """Controlla una richiesta in arrivo.

    Restituisce ``None`` se la richiesta è accettata, altrimenti il messaggio
    d'errore da inviare con status 403.
    """
    hosts = ('127.0.0.1:%d' % port, 'localhost:%d' % port)
    host = headers.get('Host')
    if host not in hosts:
        return 'Origine non consentita.'
    origin = headers.get('Origin')
    if origin is not None and origin != 'http://' + host:
        return 'Origine non consentita.'
    if headers.get('Sec-Fetch-Site') == 'cross-site':
        return 'Origine non consentita.'
    if is_post and not secrets.compare_digest(headers.get('X-Pixel-Token', ''), token):
        return 'Sessione scaduta: ricarica la pagina.'
    return None


def check_local(headers, port, client):
    """Controlla una richiesta a una rotta locale (``POST /api/show``), che non usa il token.

    È accettata solo da ``127.0.0.1`` e da un processo, non da una pagina web:
    niente ``Origin`` né ``Sec-Fetch-Site``, che i browser inviano sempre con
    le POST. Restituisce ``None`` oppure il messaggio d'errore (status 403).
    """
    if client != '127.0.0.1' or headers.get('Host') not in ('127.0.0.1:%d' % port, 'localhost:%d' % port):
        return 'Origine non consentita.'
    if headers.get('Origin') is not None or headers.get('Sec-Fetch-Site') is not None:
        return 'Origine non consentita.'
    return None


def headers(content_type, cache):
    """Restituisce le intestazioni comuni a tutte le risposte."""
    return [
        ('Content-Type', content_type),
        ('X-Content-Type-Options', 'nosniff'),
        ('Referrer-Policy', 'no-referrer'),
        ('Cache-Control', cache),
        ('Content-Security-Policy', CSP),
    ]
