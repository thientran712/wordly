#!/usr/bin/env bash
# Blue/green không gián đoạn: chạy màu mới song song, kiểm /api/health đúng
# commit, rồi mới chuyển nginx (reload) và tắt màu cũ. Lỗi → tắt màu mới,
# màu cũ vẫn phục vụ như chưa có gì.
# Wordly không có bước migrate tự động: migration SQL chạy tay TRƯỚC khi deploy.
set -euo pipefail
: "${TAG:?}"
cd /opt/wordly/prod/web

ACTIVE=$(cat ACTIVE 2>/dev/null || echo legacy)   # legacy = container web-web-1 cổng 13500 (deploy tay cũ)
if [ "$ACTIVE" = blue ]; then NEXT=green; PORT=13502; else NEXT=blue; PORT=13501; fi

IMAGE_TAG="$TAG" HOST_PORT="$PORT" docker compose -p "wordly-$NEXT" up -d --force-recreate

ok=""
for _ in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" 2>/dev/null | grep -q "\"sha\":\"$TAG\""; then ok=1; break; fi
  sleep 2
done
if [ -z "$ok" ]; then
  IMAGE_TAG="$TAG" HOST_PORT="$PORT" docker compose -p "wordly-$NEXT" down
  echo "unhealthy: $NEXT ($PORT) không báo đúng commit $TAG — giữ nguyên $ACTIVE" >&2
  exit 1
fi

sudo /usr/local/sbin/wordly-switch-upstream "$PORT"
echo "$NEXT" > ACTIVE
echo "$PORT" > ACTIVE_PORT

if [ "$ACTIVE" = legacy ]; then
  docker rm -f web-web-1 >/dev/null 2>&1 || true
else
  IMAGE_TAG=retired HOST_PORT=0 docker compose -p "wordly-$ACTIVE" down
fi
echo "live: $NEXT on $PORT"
