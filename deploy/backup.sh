#!/bin/sh
# Nightly database backup, run by the `backup` service in compose.prod.yaml.
# Once a day at BACKUP_HOUR (UTC, default 02) it writes backups/quire-YYYY-MM-DD.dump (pg_dump custom
# format, restorable with pg_restore) and deletes dumps older than KEEP_DAYS (default 14).
# Connection settings come from the standard PG* variables.
set -eu
dir="${BACKUP_DIR:-/backups}"

backup() {
  file="$dir/quire-$(date -u +%Y-%m-%d).dump"
  pg_dump --format=custom --no-owner --file "$file.partial"
  mv "$file.partial" "$file"
  find "$dir" -name 'quire-*.dump' -mtime +"${KEEP_DAYS:-14}" -delete
  echo "$(date -u +%FT%TZ) backup written: $file"
}

if [ "${1:-}" = "now" ]; then
  backup
  exit 0
fi

echo "Backups at ${BACKUP_HOUR:-02}:00 UTC daily, keeping ${KEEP_DAYS:-14} days."
while true; do
  today="$(date -u +%Y-%m-%d)"
  if [ "$(date -u +%H)" = "${BACKUP_HOUR:-02}" ] && [ ! -f "$dir/quire-$today.dump" ]; then
    backup || echo "$(date -u +%FT%TZ) backup FAILED" >&2
  fi
  sleep 300
done
