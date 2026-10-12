#!/bin/sh
# Stop the notebook through the shared launcher, which only stops a Tell-and-Wire
# server: see scripts/editorProcess.mjs.
set -e
cd "$(dirname "$0")"

exec node scripts/stop-notebook.mjs "$@"
