#!/usr/bin/env bash
set -euo pipefail
cd /opt/wordly/prod/supabase
DB_CONTAINER=$(docker compose ps -q db)
docker exec "$DB_CONTAINER" pg_dump -U postgres postgres | gzip > "/var/backups/wordly/prod/db-$(date +%Y%m%d).sql.gz"
find /var/backups/wordly/prod/ -name "db-*.sql.gz" -mtime +7 -delete
