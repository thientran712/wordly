#!/usr/bin/env bash
# Tự kiểm tra server Wordly — cron 5 phút/lần (chủ dự án yêu cầu 16/10/2026; 5 phút để trang /admin gần thời gian thực).
# Có sự cố mới → email ngay; sự cố kéo dài → nhắc lại mỗi 6 giờ; hết → email "đã ổn".
# Gửi qua Resend (khoá RESEND_API_KEY trong .env của web), không cần dịch vụ ngoài khác.
#
#   WATCHDOG_DRY_RUN=1  → in ra thay vì gửi email (thử script)
#   WATCHDOG_DISK_MAX / WATCHDOG_MEM_MIN_MB → đổi ngưỡng (thử báo động)
set -uo pipefail
export TZ=Asia/Ho_Chi_Minh

WEB=/opt/wordly/prod/web
STATE_DIR=/var/backups/wordly/prod/watchdog
BACKUP_DIR=/var/backups/wordly/prod
TO="${WATCHDOG_TO:-huythien7122@gmail.com}"
FROM="Wordly Monitor <noreply@wordly.skillproof.work>"
DISK_MAX="${WATCHDOG_DISK_MAX:-85}"            # % ổ đĩa
MEM_MIN_MB="${WATCHDOG_MEM_MIN_MB:-300}"       # RAM còn dùng được
CRON_MAX_MIN=20                                # cron push chạy 5 phút/lần
BACKUP_MAX_H=26                                # sao lưu chạy 1 lần/ngày
REMIND_H=6

mkdir -p "$STATE_DIR"
problems=()

# 1. Ổ đĩa
disk=$(df --output=pcent / | tail -1 | tr -dc '0-9')
[ "$disk" -ge "$DISK_MAX" ] && problems+=("Ổ đĩa đã dùng ${disk}% (ngưỡng ${DISK_MAX}%)")

# 2. RAM còn dùng được
mem=$(free -m | awk '/^Mem:/{print $7}')
[ "$mem" -lt "$MEM_MIN_MB" ] && problems+=("RAM còn ${mem} MB (ngưỡng ${MEM_MIN_MB} MB)")

# 3. Web Wordly trả lời health (cổng của màu đang chạy, xem swap.sh)
port=$(cat "$WEB/ACTIVE_PORT" 2>/dev/null || echo 13500)
if ! curl -sf --max-time 10 "http://localhost:$port/api/health" | grep -q '"ok":true'; then
  problems+=("Web Wordly không trả lời /api/health (cổng $port)")
fi

# 4. Container Supabase / web: phải chạy, có healthcheck thì phải healthy
while read -r name status; do
  case "$status" in
    *unhealthy*|Exited*|Restarting*|Dead*|Created*) problems+=("Container $name: $status") ;;
  esac
done < <(docker ps -a --filter "name=supabase" --filter "name=wordly-" --format '{{.Names}} {{.Status}}' || true)
docker ps --format '{{.Names}}' | grep -qE '^wordly-(blue|green)-web' || problems+=("Không có container web Wordly nào đang chạy")

# 5. Cron gửi thông báo nhắc ôn còn chạy
log="$WEB/send-emails-cron.log"
if [ -f "$log" ]; then
  age=$(( ( $(date +%s) - $(stat -c %Y "$log") ) / 60 ))
  [ "$age" -gt "$CRON_MAX_MIN" ] && problems+=("Cron nhắc ôn không chạy ${age} phút (mong đợi 5 phút/lần)")
  tail -1 "$log" | grep -q '"fatal":null' || problems+=("Cron nhắc ôn lần gần nhất báo lỗi: $(tail -1 "$log" | cut -c1-200)")
else
  problems+=("Không thấy log cron nhắc ôn")
fi

# 6. Sao lưu DB mới
latest=$(ls -t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | head -1)
if [ -z "$latest" ]; then
  problems+=("Không có bản sao lưu DB nào")
else
  bage=$(( ( $(date +%s) - $(stat -c %Y "$latest") ) / 3600 ))
  [ "$bage" -gt "$BACKUP_MAX_H" ] && problems+=("Bản sao lưu DB mới nhất đã ${bage} giờ ($(basename "$latest"))")
  [ "$(stat -c %s "$latest")" -lt 100000 ] && problems+=("Bản sao lưu $(basename "$latest") nhỏ bất thường ($(stat -c %s "$latest") byte)")
fi
# Bản chép lên R2 (offsite) — chỉ kiểm khi đã bật (backup-offsite.sh ghi dấu)
if [ -f "$STATE_DIR/offsite-ok" ]; then
  oage=$(( ( $(date +%s) - $(stat -c %Y "$STATE_DIR/offsite-ok") ) / 3600 ))
  [ "$oage" -gt "$BACKUP_MAX_H" ] && problems+=("Bản sao lưu trên R2 đã ${oage} giờ chưa cập nhật")
fi

# --- Gửi email (chỉ khi đổi trạng thái hoặc tới giờ nhắc lại) ---
send() {
  local subject="$1" body="$2"
  if [ "${WATCHDOG_DRY_RUN:-0}" = "1" ]; then printf 'DRY RUN → %s\n%s\n' "$subject" "$body"; return 0; fi
  local key; key=$(grep '^RESEND_API_KEY=' "$WEB/.env" | cut -d= -f2-)
  jq -n --arg from "$FROM" --arg to "$TO" --arg s "$subject" --arg t "$body" \
    '{from:$from, to:[$to], subject:$s, text:$t}' |
    curl -sf --max-time 20 -X POST https://api.resend.com/emails \
      -H "Authorization: Bearer $key" -H 'Content-Type: application/json' -d @- >/dev/null
}

host=$(hostname)
now=$(date '+%d/%m/%Y %H:%M %Z')
current=$(printf '%s\n' "${problems[@]+"${problems[@]}"}" | sort)
last=$(cat "$STATE_DIR/last" 2>/dev/null || true)
last_sent=$(cat "$STATE_DIR/last_sent" 2>/dev/null || echo 0)

if [ ${#problems[@]} -gt 0 ]; then
  due=$(( $(date +%s) - last_sent > REMIND_H * 3600 ))
  if [ "$current" != "$last" ] || [ "$due" -eq 1 ]; then
    body="Server $host — $now

$(printf '• %s\n' "${problems[@]}")

Ổ đĩa ${disk}% · RAM còn ${mem} MB
Trang trạng thái: https://app.wordly.skillproof.work/api/health"
    send "[Wordly] ⚠️ ${#problems[@]} sự cố trên server" "$body" && date +%s > "$STATE_DIR/last_sent"
  fi
elif [ -n "$last" ]; then
  send "[Wordly] ✅ Server đã ổn lại" "Server $host — $now

Các sự cố trước đã hết:
$(printf '%s\n' "$last" | sed 's/^/• /')" && date +%s > "$STATE_DIR/last_sent"
fi
printf '%s' "$current" > "$STATE_DIR/last"

# Gửi tình trạng lên trang thống kê / email sáng (spec 2026-10-16-admin-stats-design.md).
# Lỗi gửi không quan trọng — email báo động ở trên là kênh chính.
if [ "${WATCHDOG_DRY_RUN:-0}" != "1" ]; then
  secret=$(grep '^CRON_SECRET=' "$WEB/.env" | cut -d= -f2-)
  printf '%s\n' "${problems[@]+"${problems[@]}"}" | jq -R . | jq -s --argjson d "$disk" --argjson m "$mem" \
    '{disk_pct:$d, mem_mb:$m, problems: map(select(length > 0))}' |
    curl -sf --max-time 10 -X POST "http://localhost:$port/api/admin/server-status" \
      -H "Authorization: Bearer $secret" -H 'Content-Type: application/json' -d @- >/dev/null || true
fi
echo "$(date -Is) disk=${disk}% mem=${mem}MB problems=${#problems[@]}"
