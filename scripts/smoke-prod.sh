#!/bin/sh
# Start the production compose file on this machine (DOMAIN=localhost, Caddy's local certificate),
# check that it answers, then tear it down again. Needs Docker able to pull images.
#   sh scripts/smoke-prod.sh
set -eu
cd "$(dirname "$0")/.."

export DOMAIN=localhost
export POSTGRES_PASSWORD="smoke-$(date +%s)"
export BETTER_AUTH_SECRET="smoke-test-secret-$(date +%s)-0123456789abcdef"
export SMTP_HOST=localhost SMTP_PORT=1025 MAIL_FROM="Quire <no-reply@localhost>"
compose="docker compose -p quire-smoke -f compose.prod.yaml"

trap '$compose down -v >/dev/null 2>&1 || true' EXIT
$compose up -d --build

printf 'Waiting for https://localhost/api/health '
for _ in $(seq 90); do
  if curl -skf https://localhost/api/health >/dev/null 2>&1; then break; fi
  printf '.'
  sleep 2
done
echo

curl -skf https://localhost/api/health | grep -q '"ok":true' || { echo "API health check failed"; $compose logs api migrate | tail -40; exit 1; }
curl -sk -D - https://localhost/ -o /dev/null | grep -qi '^content-security-policy' || { echo "The web app or its headers are missing"; exit 1; }
curl -sk https://localhost/login | grep -q '<div id="root">' || { echo "The app shell is not served"; exit 1; }
$compose exec -T backup quire-backup now >/dev/null && echo "Backup ran."
echo "OK: the production compose file works on this machine."
