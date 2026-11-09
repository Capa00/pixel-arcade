#!/usr/bin/env bash
# Avvia Pixel Arcade sulla console. Opzioni: --port, --no-browser, --data-dir.
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v python3 >/dev/null 2>&1; then
    echo "Serve Python 3.8 o superiore per avviare Pixel Arcade." >&2
    exit 1
fi
if ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)'; then
    echo "Serve Python 3.8 o superiore: trovato $(python3 --version 2>&1)." >&2
    exit 1
fi
exec env PYTHONPATH="$script_dir/dashboard/backend" python3 -m pixelarcade \
    --dist "$script_dir/dashboard/frontend/dist" "$@"
