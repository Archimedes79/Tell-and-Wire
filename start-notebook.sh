#!/bin/sh
# Start the notebook through the shared launcher: install on first use, rebuild
# stale sources, restart an existing notebook, then open http://127.0.0.1:8100.
set -e
cd "$(dirname "$0")"

exec node scripts/start-notebook.mjs "$@"
