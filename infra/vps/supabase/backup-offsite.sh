#!/usr/bin/env bash
# Chép bản sao lưu DB mới nhất lên Cloudflare R2 (bucket RIÊNG TƯ, không phải bucket
# âm thanh công khai) — VPS hỏng hẳn vẫn còn dữ liệu (chủ dự án yêu cầu 16/10/2026).
# Chạy sau backup.sh. Khoá đọc từ .env của web: BACKUP_R2_ACCOUNT_ID,
# BACKUP_R2_ACCESS_KEY_ID, BACKUP_R2_SECRET_ACCESS_KEY, BACKUP_R2_BUCKET.
# Giữ 30 ngày trên R2. Thành công → chạm watchdog/offsite-ok để watchdog kiểm.
set -euo pipefail

ENV=/opt/wordly/prod/web/.env
DIR=/var/backups/wordly/prod
val() { grep "^$1=" "$ENV" | cut -d= -f2- || true; }

ACCOUNT=$(val BACKUP_R2_ACCOUNT_ID)
BUCKET=$(val BACKUP_R2_BUCKET)
[ -n "$ACCOUNT" ] && [ -n "$BUCKET" ] || { echo "chưa cấu hình BACKUP_R2_* — bỏ qua"; exit 0; }

latest=$(ls -t "$DIR"/db-*.sql.gz | head -1)

rclone() {
  docker run --rm -v "$DIR":/data:ro \
    -e RCLONE_CONFIG_R2_TYPE=s3 -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
    -e RCLONE_CONFIG_R2_ACCESS_KEY_ID="$(val BACKUP_R2_ACCESS_KEY_ID)" \
    -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(val BACKUP_R2_SECRET_ACCESS_KEY)" \
    -e RCLONE_CONFIG_R2_ENDPOINT="https://$ACCOUNT.r2.cloudflarestorage.com" \
    -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
    rclone/rclone:1.68 "$@"
}

rclone copy "/data/$(basename "$latest")" "r2:$BUCKET/db/" --s3-no-check-bucket
rclone delete "r2:$BUCKET/db/" --min-age 30d
mkdir -p "$DIR/watchdog" && touch "$DIR/watchdog/offsite-ok"
echo "$(date -Is) đã chép $(basename "$latest") lên r2:$BUCKET/db/"
