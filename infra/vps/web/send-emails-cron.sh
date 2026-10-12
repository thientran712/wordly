#!/usr/bin/env bash
set -euo pipefail
cd /opt/wordly/prod/web
SECRET=$(grep "^CRON_SECRET=" .env | cut -d= -f2)
curl -sf -X POST http://localhost:13500/api/cron/send-emails -H "Authorization: Bearer $SECRET"
echo
