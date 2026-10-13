#!/usr/bin/env bash
set -euo pipefail
cd /opt/wordly/prod/web
SECRET=$(grep "^CRON_SECRET=" .env | cut -d= -f2)
# Cổng của màu đang chạy (blue/green, xem swap.sh); chưa từng swap = 13500.
PORT=$(cat ACTIVE_PORT 2>/dev/null || echo 13500)
curl -sf -X POST "http://localhost:$PORT/api/cron/send-emails" -H "Authorization: Bearer $SECRET"
echo
