#!/usr/bin/env bash
# Email báo cáo 8:00 sáng giờ VN cho chủ dự án (spec 2026-10-16-admin-stats-design.md).
# Cron: 0 1 * * * (01:00 UTC = 08:00 Asia/Ho_Chi_Minh).
set -euo pipefail
cd /opt/wordly/prod/web
SECRET=$(grep "^CRON_SECRET=" .env | cut -d= -f2)
PORT=$(cat ACTIVE_PORT 2>/dev/null || echo 13500)
curl -sf -X POST "http://localhost:$PORT/api/cron/daily-report" -H "Authorization: Bearer $SECRET"
echo
