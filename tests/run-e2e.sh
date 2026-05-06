#!/bin/sh
# Wait for app to be ready, then run E2E tests
# Used when tests run inside Docker against app service
set -e
cd "$(dirname "$0")"
exec node wait-for-app.mjs
