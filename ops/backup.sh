#!/bin/sh
set -eu
umask 077
mkdir -p /backups
while :; do
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  output="/backups/palehorse-${stamp}.dump"
  if pg_dump -h db -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc -f "${output}.partial"; then
    mv "${output}.partial" "${output}"
    echo "Backup completed: ${output}"
    find /backups -type f -name 'palehorse-*.dump' -mtime +30 -delete
  else
    echo "PostgreSQL backup FAILED" >&2
    rm -f "${output}.partial"
  fi
  sleep 86400
done
