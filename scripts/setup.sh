#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v docker >/dev/null 2>&1; then echo "Docker not found" >&2; exit 1; fi
docker compose version >/dev/null
mkdir -p auths logs data postgres-data redis-data
echo "Initializing official CliRelay configuration and credentials..."
docker compose run --rm clirelay-init
test -s .env || { echo "CliRelay did not create .env" >&2; exit 1; }
test -s config.yaml || { echo "CliRelay did not create config.yaml" >&2; exit 1; }
# Container-to-container proxy is a remote client from CliRelay's perspective.
# Backend's port is host-loopback only; all public traffic uses the auth-protected proxy.
sed -i '/^remote-management:/,/^[^[:space:]#]/{s/  allow-remote: false/  allow-remote: true/;}' config.yaml
sed -i '/^auto-update:/,/^[^[:space:]#]/{s/  enabled: true/  enabled: false/;}' config.yaml
chmod 600 .env config.yaml
# Official CliRelay image runs under uid 10001.
if command -v sudo >/dev/null 2>&1; then
  sudo chown -R 10001:10001 auths logs data || true
fi
docker compose up -d
echo
echo "AethinkAI Gateway AI: http://localhost:${AETHINK_PORT:-8787}/manage"
echo "Admin user: admin"
echo "Read generated password with: grep '^CLIRELAY_ADMIN_PASSWORD=' .env"
echo "Remember to configure HTTPS before public exposure."
