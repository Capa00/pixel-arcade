"""Risoluzione sicura dei file statici della build del frontend."""
import os
import posixpath
from urllib.parse import unquote

CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
}
CACHE_LONG = 'public, max-age=31536000, immutable'
CACHE_NONE = 'no-store'


def resolve(dist_dir, url_path):
    """Trova il file di ``dist_dir`` corrispondente a ``url_path``.

    Restituisce ``(percorso, content_type, cache)`` oppure ``None`` se il file
    non esiste o non è consentito: estensione non prevista, ``..``, link
    simbolici o percorsi fuori da ``dist_dir``.
    """
    path = unquote(url_path.split('?', 1)[0])
    if path == '/':
        path = '/index.html'
    if not path.startswith('/') or '\\' in path or '\0' in path:
        return None
    parts = path.lstrip('/').split('/')
    if any(part in ('', '.', '..') for part in parts):
        return None
    extension = posixpath.splitext(parts[-1])[1].lower()
    if extension not in CONTENT_TYPES:
        return None
    root = os.path.realpath(dist_dir)
    current = root
    for part in parts:
        current = os.path.join(current, part)
        if os.path.islink(current):
            return None
    if os.path.commonpath([root, os.path.realpath(current)]) != root or not os.path.isfile(current):
        return None
    cache = CACHE_LONG if parts[0] == 'assets' and len(parts) > 1 else CACHE_NONE
    return current, CONTENT_TYPES[extension], cache
