#!/usr/bin/env bash
# Forced command của khoá CI (authorized_keys: restrict,command="…/deploy-sha.sh").
# Đầu vào duy nhất là $SSH_ORIGINAL_COMMAND — phải là commit 40 ký tự ĐÃ CÓ trên
# main ở GitHub. VPS tự lấy code (repo public, qua HTTPS), tự build, tự swap.
# Xem .github/workflows/deploy-production.yml và atlas-vps-deploy.
set -euo pipefail

BRANCH=main                      # hằng số — không bao giờ lấy từ đầu vào
APP=/opt/wordly/prod/web
IMAGE=wordly-web

exec 9>"$APP/.deploy.lock"
flock -w 900 9 || { echo "refused: another deploy is still running" >&2; exit 75; }

SHA="${SSH_ORIGINAL_COMMAND:-}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "refused: expected a 40-char commit SHA" >&2; exit 2; }

cd "$APP"
git -C src.git fetch --quiet origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
git -C src.git merge-base --is-ancestor "$SHA" "origin/$BRANCH" \
  || { echo "refused: $SHA is not on $BRANCH" >&2; exit 3; }

# Quay về commit đã từng build → dùng lại image, không build lại.
if ! docker image inspect "$IMAGE:$SHA" >/dev/null 2>&1; then
  rm -rf build && mkdir build
  git -C src.git archive "$SHA" web | tar -x -C build
  # NEXT_PUBLIC_* bake vào JS lúc build — lấy từ .env của VPS, runner không thấy.
  get() { grep -m1 "^$1=" .env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
  nice -n 10 ionice -c3 docker build -q \
    --build-arg GIT_SHA="$SHA" \
    --build-arg NEXT_PUBLIC_SUPABASE_URL="$(get NEXT_PUBLIC_SUPABASE_URL)" \
    --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$(get NEXT_PUBLIC_SUPABASE_ANON_KEY)" \
    --build-arg NEXT_PUBLIC_GA_MEASUREMENT_ID="$(get NEXT_PUBLIC_GA_MEASUREMENT_ID)" \
    -t "$IMAGE:$SHA" build/web
fi

TAG="$SHA" ./swap.sh
echo "deployed $SHA"

# Giữ 5 image commit gần nhất để quay về tức thì (tag 40 hex; không đụng tag tay).
docker images "$IMAGE" --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}' \
  | grep -E ':[0-9a-f]{40}$' | sort -r | tail -n +6 | cut -f2 | xargs -r docker rmi >/dev/null 2>&1 || true
