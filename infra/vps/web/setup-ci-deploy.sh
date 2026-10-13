#!/usr/bin/env bash
# Cài deploy production qua CI — chạy MỘT LẦN từ máy dev, ở gốc repo:
#   bash infra/vps/web/setup-ci-deploy.sh
# Chạy lại được (idempotent). Không đổi gì với người dùng: nginx vẫn trỏ
# container đang chạy (cổng 13500) cho tới lần bấm "Deploy — production" đầu tiên.
set -euo pipefail

HOST=167.99.74.215
REPO=thientran712/wordly
KEYOPT=(-o IdentitiesOnly=yes -i "$HOME/.ssh/id_ed25519")
cd "$(git rev-parse --show-toplevel)"
DIR=infra/vps/web

echo "== 1/4 root: script chuyển upstream, sudo hẹp, nginx dùng upstream"
scp -q "${KEYOPT[@]}" "$DIR/wordly-switch-upstream" "root@$HOST:/tmp/wordly-switch-upstream"
ssh "${KEYOPT[@]}" "root@$HOST" 'bash -s' <<'ROOT'
set -euo pipefail
install -o root -g root -m 755 /tmp/wordly-switch-upstream /usr/local/sbin/wordly-switch-upstream
rm -f /tmp/wordly-switch-upstream
# deploy-wordly chỉ được sudo đúng một lệnh này (không vào nhóm sudo)
echo "deploy-wordly ALL=(root) NOPASSWD: /usr/local/sbin/wordly-switch-upstream" > /tmp/wordly-deploy
visudo -cf /tmp/wordly-deploy >/dev/null
install -o root -g root -m 440 /tmp/wordly-deploy /etc/sudoers.d/wordly-deploy
rm -f /tmp/wordly-deploy
C=/etc/nginx/sites-available/wordly.prod.webapp.conf
if grep -q "proxy_pass http://127.0.0.1:13500;" "$C"; then
  cp "$C" "/root/wordly.prod.webapp.conf.bak-$(date +%Y%m%d%H%M)"
  [ -f /etc/nginx/conf.d/wordly-upstream.conf ] || echo "upstream wordly_web { server 127.0.0.1:13500; }" > /etc/nginx/conf.d/wordly-upstream.conf
  sed -i "s|proxy_pass http://127.0.0.1:13500;|proxy_pass http://wordly_web;|" "$C"
fi
if nginx -t 2>/dev/null; then
  nginx -s reload
  echo "nginx OK (reload)"
else
  echo "nginx -t LỖI — khôi phục bản cũ" >&2
  cp "$(ls -t /root/wordly.prod.webapp.conf.bak-* | head -1)" "$C"
  nginx -t && nginx -s reload
  exit 1
fi
ROOT

echo "== 2/4 deploy-wordly: bản sao repo + script deploy"
ssh "${KEYOPT[@]}" "deploy-wordly@$HOST" 'mkdir -p /tmp/wordly-ci'
scp -q "${KEYOPT[@]}" "$DIR/deploy-sha.sh" "$DIR/swap.sh" "$DIR/docker-compose.yml" "$DIR/send-emails-cron.sh" \
  "deploy-wordly@$HOST:/tmp/wordly-ci/"
ssh "${KEYOPT[@]}" "deploy-wordly@$HOST" 'bash -s' <<'DW'
set -euo pipefail
cd /opt/wordly/prod/web
[ -d src.git ] || git clone --quiet --bare https://github.com/thientran712/wordly.git src.git
[ -f docker-compose.yml.bak-pre-ci ] || cp docker-compose.yml docker-compose.yml.bak-pre-ci
install -m 750 /tmp/wordly-ci/deploy-sha.sh deploy-sha.sh
install -m 750 /tmp/wordly-ci/swap.sh swap.sh
install -m 775 /tmp/wordly-ci/send-emails-cron.sh send-emails-cron.sh
install -m 664 /tmp/wordly-ci/docker-compose.yml docker-compose.yml
rm -rf /tmp/wordly-ci
sudo -n /usr/local/sbin/wordly-switch-upstream 13500 && echo "sudo hẹp OK"
DW

echo "== 3/4 khoá CI + GitHub secrets (khoá riêng không bao giờ ra khỏi thư mục tạm)"
d=$(mktemp -d); trap 'rm -rf "$d"' EXIT
ssh-keygen -q -t ed25519 -N "" -C "ci-wordly-prod-web" -f "$d/key"
# Host key: lấy từ known_hosts đã tin của máy dev, đối chiếu với keyscan
ssh-keyscan -t ed25519 "$HOST" 2>/dev/null > "$d/scan"
trusted=$(ssh-keygen -F "$HOST" -l 2>/dev/null | grep -i ed25519 | awk '{print $3}' | head -1)
scanned=$(ssh-keygen -l -f "$d/scan" | awk '{print $2}')
[ -n "$trusted" ] && [ "$trusted" = "$scanned" ] || { echo "host key không khớp known_hosts — dừng" >&2; exit 1; }
gh secret set DEPLOY_KEY_PRODUCTION --repo "$REPO" < "$d/key"
gh secret set DEPLOY_KNOWN_HOSTS --repo "$REPO" < "$d/scan"
gh variable set DEPLOY_HOST_PRODUCTION --repo "$REPO" --body "$HOST"
PUB=$(cat "$d/key.pub")
ssh "${KEYOPT[@]}" "deploy-wordly@$HOST" "set -e; cd ~/.ssh
  grep -v ' ci-wordly-prod-web\$' authorized_keys > ak.tmp || true
  echo 'restrict,command=\"/opt/wordly/prod/web/deploy-sha.sh\" $PUB' >> ak.tmp
  chmod 600 ak.tmp && mv ak.tmp authorized_keys"

echo "== 4/4 kiểm khoá CI chỉ chạy được deploy-sha.sh"
out=$(ssh -i "$d/key" -o IdentitiesOnly=yes -o BatchMode=yes -o UserKnownHostsFile="$d/scan" \
  "deploy-wordly@$HOST" "ls /" 2>&1 || true)
echo "$out" | grep -q "refused: expected a 40-char commit SHA" \
  && echo "OK — khoá CI bị khoá đúng (lệnh lạ bị từ chối)" \
  || { echo "CẢNH BÁO: khoá CI không bị khoá như mong đợi: $out" >&2; exit 1; }

echo
echo "Xong. Deploy: GitHub → Actions → 'Deploy — production' → Run workflow"
echo "        hoặc: gh workflow run deploy-production.yml --repo $REPO"
