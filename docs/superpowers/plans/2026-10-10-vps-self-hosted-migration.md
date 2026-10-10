# Chuyển hạ tầng Wordly sang VPS tự quản — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển Wordly từ Vercel + Supabase Cloud sang tự host (Supabase self-hosted + Next.js container) trên VPS dùng chung `167.99.74.215`, domain `wordly.skillproof.work`, không mất dữ liệu, không downtime cho người dùng web hiện tại khi cắt DNS.

**Architecture:** Supabase self-hosted (Docker Compose chính thức của `supabase/supabase`) chạy song song với `localex`/`pehub` đã có trên box; Next.js build thành Docker image, chạy container riêng; nginx (đã cài sẵn) thêm 2 vhost mới + SSL certbot; dữ liệu production hiện tại dump từ Supabase Cloud rồi restore vào Postgres tự host trước khi cắt DNS; Vercel + Supabase Cloud giữ sống song song cho tới khi xác nhận ổn định.

**Tech Stack:** Docker Compose, Postgres 15 (ảnh Supabase), GoTrue, PostgREST, Kong, nginx, certbot, Next.js 16 (container `next start`).

**Spec:** `docs/superpowers/specs/2026-10-10-vps-self-hosted-infra-design.md`

## Global Constraints

- Domain cuối: `app.wordly.skillproof.work` (Next.js), `api.wordly.skillproof.work` (Supabase Kong) — không phải domain riêng, là subdomain của hạ tầng chung `skillproof.work`.
- VPS `167.99.74.215` (`ubuntu-s-2vcpu-4gb-sgp1`, Ubuntu 24.04.5) **dùng chung** với `localex`/`pehub` — mọi thao tác ở tầng host (nginx global, Docker daemon, firewall) phải không ảnh hưởng 2 app kia.
- 1 Linux user riêng `deploy-wordly` (group `docker`, KHÔNG sudo) theo quy ước ATLAS — không dùng `root` cho vận hành thường ngày sau khi setup xong.
- Layout bắt buộc: `/opt/wordly/prod/{web,supabase}/`, `/var/backups/wordly/prod/`, nginx config `wordly.prod.webapp.conf` + `wordly.prod.api.conf` trong `sites-available/`.
- Lần cutover đầu tiên dùng **deploy tay** (không có self-hosted-runner CI cho dự án cá nhân này) — quyết định 10/10/2026, khác với quy tắc HF client "production luôn qua pipeline". Vẫn phải **health-check trước khi cắt DNS**, không downtime khi cắt.
- Không tắt Vercel / Supabase Cloud ngay — giữ chạy song song tới khi xác nhận ổn định (ít nhất vài ngày theo dõi thật).
- KHÔNG chạy bất kỳ lệnh nào có thể ảnh hưởng `localex-*` hoặc `pehub-*` container/nginx config của chúng.
- `.env` trên VPS luôn `chmod 600`, owner `deploy-wordly`. Không bao giờ commit secret vào git.

## Review Focus

- **Dữ liệu lệch giữa Supabase Cloud và self-host sau migrate** — spec cảnh báo đây là rủi ro mất dữ liệu cao nhất (tương tự sự cố 7/10/2026); Task 4 phải có bước đối chiếu row-count + checksum, không chỉ "restore xong là coi như đúng".
- **Hook JWT (`custom_access_token_hook`) chạy sai thứ tự trên self-host** — spec gốc ghi rõ hook phải bật ĐÚNG config GoTrue trước khi mở traffic thật, nếu không mọi user (B2C) không đăng nhập được; Task 5 phải test login thật trước khi Task 8 (cắt DNS).
- **Container Wordly đụng cổng/tên với `localex`/`pehub` đang chạy** — box đã dùng `127.0.0.1:41000-41200`, `8081`; Task 6 phải chọn cổng khác hẳn và kiểm `ss -tlnp` trước khi bind.
- **nginx reload làm rớt `localex`/`pehub` đang chạy** — Task 7 phải chạy `nginx -t` trước mọi `reload`, và không sửa file `.conf` của 2 app kia.
- **iOS app cũ (đã có người TestFlight) gọi vào endpoint mới ngay khi DNS đổi mà chưa kịp build lại** — Task 9 phải giữ Supabase Cloud + Vercel sống và chỉ cắt DNS sau khi xác nhận với chủ dự án là đã sẵn sàng, không cắt rồi mới lo iOS.

---

### Task 1: Tạo user `deploy-wordly` + layout thư mục trên VPS

**Files:** không có file trong repo Wordly — toàn bộ thao tác qua SSH trên VPS `167.99.74.215`.

**Interfaces:**
- Consumes: SSH key `~/.ssh/id_ed25519` (đã xác nhận đăng nhập `root@167.99.74.215` được).
- Produces: user `deploy-wordly` (uid/gid riêng, group `docker`), thư mục `/opt/wordly/prod/{web,supabase}/`, `/var/backups/wordly/prod/` — các task sau đều chạy dưới user này.

- [ ] **Step 1: Tạo user và thêm vào group `docker`**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 root@167.99.74.215 "
useradd -m -s /bin/bash deploy-wordly
usermod -aG docker deploy-wordly
id deploy-wordly
"
```

Expected: `id deploy-wordly` in ra có `docker` trong nhóm phụ, KHÔNG có `sudo`/`wheel`.

- [ ] **Step 2: Tạo layout thư mục đúng quy ước ATLAS**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 root@167.99.74.215 "
install -d -o deploy-wordly -g deploy-wordly -m 755 /opt/wordly/prod/web
install -d -o deploy-wordly -g deploy-wordly -m 755 /opt/wordly/prod/supabase
install -d -o deploy-wordly -g deploy-wordly -m 755 /var/backups/wordly/prod
ls -la /opt/wordly/prod/ /var/backups/wordly/
"
```

Expected: cả 3 thư mục tồn tại, owner `deploy-wordly:deploy-wordly`.

- [ ] **Step 3: Thêm public key của bạn vào `authorized_keys` của `deploy-wordly` (để SSH trực tiếp user này sau này, không phải lúc nào cũng qua root)**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 root@167.99.74.215 "
mkdir -p /home/deploy-wordly/.ssh
cp ~/.ssh/authorized_keys /home/deploy-wordly/.ssh/authorized_keys
chown -R deploy-wordly:deploy-wordly /home/deploy-wordly/.ssh
chmod 700 /home/deploy-wordly/.ssh
chmod 600 /home/deploy-wordly/.ssh/authorized_keys
"
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 deploy-wordly@167.99.74.215 "whoami && groups"
```

Expected: login thành công bằng `deploy-wordly`, `groups` có `docker`.

- [ ] **Step 4: Verify không đụng gì của `localex`/`pehub`**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 root@167.99.74.215 "docker ps -a --format '{{.Names}}' | sort"
```

Expected: vẫn đúng 6 container cũ (`localex-staging-*` x4, `pehub-*` x2), không thêm/mất container nào.

---

### Task 2: Dựng Supabase self-hosted stack (local-only, chưa public)

**Files:** không có file trong repo Wordly — stack sống hoàn toàn trên VPS tại `/opt/wordly/prod/supabase/`.

**Interfaces:**
- Consumes: thư mục `/opt/wordly/prod/supabase/` từ Task 1.
- Produces: Postgres + GoTrue + PostgREST + Kong + Storage + Realtime + Studio chạy nội bộ (`127.0.0.1:8000` qua Kong) — Task 3/4/5 nối vào đây; `.env` của stack chứa JWT secret/anon key/service role key mà Task 6 (Next.js container) phải dùng khớp.

- [ ] **Step 1: Clone bộ Docker Compose chính thức của Supabase**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 deploy-wordly@167.99.74.215 "
cd /opt/wordly/prod/supabase
git clone --depth 1 https://github.com/supabase/supabase.git _src
cp -r _src/docker/* .
cp .env.example .env
rm -rf _src
ls
"
```

Expected: thấy `docker-compose.yml`, `.env`, `volumes/` trong `/opt/wordly/prod/supabase/`.

- [ ] **Step 2: Sinh secret thật (KHÔNG dùng giá trị mẫu trong `.env.example`)**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 deploy-wordly@167.99.74.215 "
cd /opt/wordly/prod/supabase
POSTGRES_PASSWORD=\$(openssl rand -base64 32)
JWT_SECRET=\$(openssl rand -base64 40)
echo \"POSTGRES_PASSWORD=\$POSTGRES_PASSWORD\" >> .env.generated
echo \"JWT_SECRET=\$JWT_SECRET\" >> .env.generated
cat .env.generated
"
```

Dùng `JWT_SECRET` này chạy qua script `generate-jwt.mjs`/trang https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys (base64url HMAC-SHA256 payload `{role:"anon",iss:"supabase",iat:...,exp:...}` và tương tự cho `service_role`) để ra `ANON_KEY` + `SERVICE_ROLE_KEY`. Dán cả 4 giá trị (`POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`) vào `.env` (đè giá trị mẫu), rồi xoá `.env.generated`.

- [ ] **Step 3: `chmod 600` cho `.env`, verify không secret nào world-readable**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 deploy-wordly@167.99.74.215 "
chmod 600 /opt/wordly/prod/supabase/.env
rm -f /opt/wordly/prod/supabase/.env.generated
stat -c '%a %U %n' /opt/wordly/prod/supabase/.env
"
```

Expected: `600 deploy-wordly /opt/wordly/prod/supabase/.env`.

- [ ] **Step 4: Đặt `SITE_URL`/`API_EXTERNAL_URL` trong `.env` đúng domain cuối (chưa cần DNS sống — chỉ cần đúng giá trị để GoTrue sinh redirect URL đúng)**

Sửa trong `.env`:
```
API_EXTERNAL_URL=https://api.wordly.skillproof.work
SITE_URL=https://app.wordly.skillproof.work
SUPABASE_PUBLIC_URL=https://api.wordly.skillproof.work
```

- [ ] **Step 5: `docker compose up -d`, verify nội bộ qua `localhost:8000`**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 deploy-wordly@167.99.74.215 "
cd /opt/wordly/prod/supabase
docker compose up -d
sleep 15
docker compose ps
curl -s http://localhost:8000/rest/v1/ -H \"apikey: \$(grep ^ANON_KEY .env | cut -d= -f2)\"
"
```

Expected: tất cả service `Up (healthy)` hoặc `Up`; curl trả JSON (không phải connection refused/502).

- [ ] **Step 6: Verify port KHÔNG đụng `localex`/`pehub`**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 root@167.99.74.215 "ss -tlnp | grep -E '41000|41100|41200|8081|5432'"
```

Expected: không có cổng nào của Supabase stack trùng với các cổng đã liệt kê (Supabase mặc định dùng `8000` cho Kong, `5432` CHỈ bind `127.0.0.1` nội bộ container network riêng — kiểm kỹ không map `5432` ra host nếu `pehub`/`localex` postgres cũng đang nghe cổng đó nội bộ network riêng của chúng, không xung đột vì mỗi docker-compose project có network riêng).

---

### Task 3: Migrate schema + dữ liệu từ Supabase Cloud sang self-host

**Files:** không tạo file mới trong repo — chạy `pg_dump`/`pg_restore` từ máy local (đã link `blattojsgqyhoxkglind` ở phiên trước).

**Interfaces:**
- Consumes: Postgres self-host từ Task 2 (reachable qua SSH tunnel), project Supabase Cloud `blattojsgqyhoxkglind` (đã link).
- Produces: Postgres tự host có đầy đủ schema + data khớp 100% với Cloud tại thời điểm dump — Task 4/5 dựa vào dữ liệu này.

- [ ] **Step 1: Dump toàn bộ schema + data từ Supabase Cloud**

```bash
cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly"
npx supabase db dump --linked -f /tmp/wordly-cloud-dump.sql
npx supabase db dump --linked --data-only -f /tmp/wordly-cloud-data.sql
wc -l /tmp/wordly-cloud-dump.sql /tmp/wordly-cloud-data.sql
```

Expected: cả 2 file có nội dung (không rỗng), file schema có `CREATE TABLE`, file data có `INSERT`/`COPY`.

- [ ] **Step 2: Ghi lại row-count của các bảng chính từ Cloud để đối chiếu sau**

```bash
npx supabase db query --linked "
select 'translate_history' t, count(*) from translate_history
union all select 'journal_entries', count(*) from journal_entries
union all select 'profiles', count(*) from profiles
union all select 'quiz_attempts', count(*) from quiz_attempts
union all select 'email_log', count(*) from email_log
union all select 'words', count(*) from words;
" > /tmp/wordly-cloud-counts.txt
cat /tmp/wordly-cloud-counts.txt
```

- [ ] **Step 3: Mở SSH tunnel tới Postgres self-host, restore vào đó**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 -L 15432:localhost:5432 deploy-wordly@167.99.74.215 -N &
TUNNEL_PID=$!
sleep 2
PGPASSWORD="<POSTGRES_PASSWORD từ .env Task 2>" psql -h localhost -p 15432 -U postgres -d postgres -f /tmp/wordly-cloud-dump.sql
kill $TUNNEL_PID
```

Expected: không lỗi `ERROR` nghiêm trọng trong output (một vài `NOTICE`/`already exists` là bình thường do schema Supabase tạo sẵn template).

- [ ] **Step 4: Đối chiếu row-count self-host với `/tmp/wordly-cloud-counts.txt`**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 -L 15432:localhost:5432 deploy-wordly@167.99.74.215 -N &
TUNNEL_PID=$!
sleep 2
PGPASSWORD="<POSTGRES_PASSWORD>" psql -h localhost -p 15432 -U postgres -d postgres -c "
select 'translate_history' t, count(*) from translate_history
union all select 'journal_entries', count(*) from journal_entries
union all select 'profiles', count(*) from profiles
union all select 'quiz_attempts', count(*) from quiz_attempts
union all select 'email_log', count(*) from email_log
union all select 'words', count(*) from words;
"
kill $TUNNEL_PID
```

Expected: **mọi số khớp 100%** với `/tmp/wordly-cloud-counts.txt`. Nếu lệch bất kỳ bảng nào — DỪNG, không qua Task 4, điều tra ngay (đây là "Review Focus" số 1).

- [ ] **Step 5: Xoá file dump tạm khỏi máy local sau khi xác nhận đúng (chứa dữ liệu người dùng thật)**

```bash
rm -f /tmp/wordly-cloud-dump.sql /tmp/wordly-cloud-data.sql /tmp/wordly-cloud-counts.txt
```

---

### Task 4: Cấu hình GoTrue (Auth) — hook JWT + OAuth providers

**Files:** `.env` trên VPS (`/opt/wordly/prod/supabase/.env`) — không có file trong repo Wordly.

**Interfaces:**
- Consumes: function `custom_access_token_hook` (đã có trong DB restore ở Task 3), credential Google/Apple OAuth hiện tại (lấy từ Supabase Cloud Dashboard → Auth → Providers, hoặc hỏi chủ dự án qua `atlas-secret-handoff`).
- Produces: GoTrue self-host cấp JWT có đúng claim như Cloud đang cấp — Task 8 (verify trước cắt DNS) dựa vào đây.

- [ ] **Step 1: Lấy giá trị OAuth hiện tại (Client ID/Secret Google, Apple) — dùng `atlas-secret-handoff` nếu cần nhập tay**

Không tự suy đoán giá trị — nếu chưa có sẵn trong `.env.local` (kiểm `grep -i GOOGLE\|APPLE web/.env.local`), dùng skill `atlas-secret-handoff` để chủ dự án nhập trực tiếp, không dán vào chat.

- [ ] **Step 2: Thêm vào `.env` của Supabase stack**

```
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<client id>
GOTRUE_EXTERNAL_GOOGLE_SECRET=<client secret>
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://api.wordly.skillproof.work/auth/v1/callback

GOTRUE_EXTERNAL_APPLE_ENABLED=true
GOTRUE_EXTERNAL_APPLE_CLIENT_ID=com.thientran.wordly
GOTRUE_EXTERNAL_APPLE_SECRET=<apple secret/JWT>
GOTRUE_EXTERNAL_APPLE_REDIRECT_URI=https://api.wordly.skillproof.work/auth/v1/callback

GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED=true
GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI=pg-functions://postgres/public/custom_access_token_hook
```

- [ ] **Step 3: Restart GoTrue, verify hook hoạt động bằng request login thật**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 deploy-wordly@167.99.74.215 "
cd /opt/wordly/prod/supabase
docker compose restart auth
sleep 5
docker compose logs auth --tail 30
"
```

Expected: log không có lỗi `hook` hay `connection refused` tới Postgres. (Login thật qua UI sẽ test ở Task 8, sau khi Next.js container trỏ vào stack này.)

- [ ] **Step 4: Ghi chú redirect URL mới cần cập nhật ở Google Cloud Console + Apple Developer (việc của chủ dự án, không tự làm)**

Redirect URL đổi từ `https://blattojsgqyhoxkglind.supabase.co/auth/v1/callback` sang `https://api.wordly.skillproof.work/auth/v1/callback` — phải thêm (không xoá cái cũ ngay, giữ cả 2 cho tới khi cắt hẳn Supabase Cloud ở Task 10).

---

### Task 5: Dockerfile + container Next.js

**Files:**
- Create: `web/Dockerfile`
- Modify: `web/next.config.mjs` (thêm `output: "standalone"`)
- Test: build thật trên máy local trước khi đưa lên VPS

**Interfaces:**
- Consumes: biến môi trường runtime (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`, `DEEPL_API_KEY`, `GOOGLE_TTS_CLIENT_EMAIL`, `GOOGLE_TTS_PRIVATE_KEY_BASE64`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`) — danh sách đầy đủ lấy từ `web/.env.local` hiện tại.
- Produces: image `wordly-web:local-test` chạy `next start` port 3000 — Task 6 dùng image build theo cùng Dockerfile này trên VPS.

- [ ] **Step 1: Thêm `output: "standalone"` vào `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,PATCH,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type,Authorization" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 2: Verify build standalone chạy được local trước khi viết Dockerfile**

```bash
cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web"
npx next build
ls .next/standalone/server.js
```

Expected: `next build` "Compiled successfully", file `.next/standalone/server.js` tồn tại.

- [ ] **Step 3: Viết `web/Dockerfile` (multi-stage, image gọn)**

```dockerfile
# web/Dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build chỉ cần biến TỒN TẠI để prerender — giá trị thật đến từ runtime env
# của container (docker-compose --env-file), không bake vào image.
ENV NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
RUN npx next build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 4: Build + chạy local, verify curl trả 200**

```bash
cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web"
docker build -t wordly-web:local-test -f Dockerfile .
docker run --rm -d --name wordly-web-test -p 13000:3000 --env-file .env.local wordly-web:local-test
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:13000/
docker stop wordly-web-test
```

Expected: in ra `200` (hoặc `307` nếu redirect login — vẫn là response hợp lệ, không phải connection refused).

- [ ] **Step 5: Commit `Dockerfile` + `next.config.mjs` vào git**

```bash
cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly"
git add web/Dockerfile web/next.config.mjs
git commit -m "chore(web): thêm Dockerfile + output standalone cho deploy VPS tự host"
```

---

### Task 6: Chạy Next.js container trên VPS, trỏ vào Supabase self-host

**Files:** không có file trong repo — `docker-compose.yml` + `.env` sống trên VPS tại `/opt/wordly/prod/web/`.

**Interfaces:**
- Consumes: image build từ `web/Dockerfile` (Task 5), `ANON_KEY`/`SERVICE_ROLE_KEY` sinh ở Task 2.
- Produces: container `wordly-web` nghe `127.0.0.1:13500:3000` (cổng khác hẳn `41000-41200`/`8081` đã dùng) — Task 7 (nginx) proxy vào đây.

- [ ] **Step 1: Đưa code lên VPS bằng `git archive` (deploy tay, theo quy ước dev/staging — không chờ CI)**

```bash
cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly"
git archive HEAD web | ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 deploy-wordly@167.99.74.215 \
  'mkdir -p /opt/wordly/prod/web/build && tar -x -C /opt/wordly/prod/web/build'
```

- [ ] **Step 2: Tạo `.env` production trên VPS (giá trị API key/secret giống `web/.env.local` hiện tại, CHỈ đổi 3 biến Supabase sang self-host)**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 deploy-wordly@167.99.74.215 "touch /opt/wordly/prod/web/.env && chmod 600 /opt/wordly/prod/web/.env"
```

Dùng skill `atlas-secret-handoff` để điền `.env` này trực tiếp trên VPS (không dán secret qua chat) — nội dung cần:
```
NEXT_PUBLIC_SUPABASE_URL=https://api.wordly.skillproof.work
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY từ Task 2>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY từ Task 2>
GROQ_API_KEY=<giữ nguyên giá trị hiện tại>
DEEPL_API_KEY=<giữ nguyên>
GMAIL_USER=<giữ nguyên>
GMAIL_APP_PASSWORD=<giữ nguyên>
INNGEST_SIGNING_KEY=<giữ nguyên>
INNGEST_EVENT_KEY=<giữ nguyên>
GOOGLE_TTS_CLIENT_EMAIL=<giữ nguyên>
GOOGLE_TTS_PRIVATE_KEY_BASE64=<giữ nguyên>
R2_ACCOUNT_ID=<giữ nguyên>
R2_ACCESS_KEY_ID=<giữ nguyên>
R2_SECRET_ACCESS_KEY=<giữ nguyên>
R2_BUCKET_NAME=<giữ nguyên>
R2_PUBLIC_URL=<giữ nguyên>
```

- [ ] **Step 3: Viết `docker-compose.yml` cho web trên VPS**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 deploy-wordly@167.99.74.215 "cat > /opt/wordly/prod/web/docker-compose.yml" <<'EOF'
services:
  web:
    image: wordly-web:${IMAGE_TAG:-manual}
    pull_policy: never
    restart: unless-stopped
    env_file: .env
    ports:
      - "127.0.0.1:13500:3000"
EOF
```

- [ ] **Step 4: Build image trên VPS, chạy container**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 deploy-wordly@167.99.74.215 "
cd /opt/wordly/prod/web
docker build -t wordly-web:manual -f build/Dockerfile build
docker compose up -d
sleep 5
docker compose ps
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:13500/
"
```

Expected: container `Up`, curl trả `200`/`307` (không phải `000`/connection refused).

- [ ] **Step 5: Verify port không đụng container khác**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 root@167.99.74.215 "docker ps --format '{{.Names}}\t{{.Ports}}'"
```

Expected: `wordly-web` dùng `127.0.0.1:13500`, không trùng port nào của `localex-*`/`pehub-*`.

---

### Task 7: nginx vhost + SSL cho 2 subdomain Wordly

**Files:** `/etc/nginx/sites-available/wordly.prod.webapp.conf`, `/etc/nginx/sites-available/wordly.prod.api.conf` trên VPS (root-owned, không có trong repo Wordly).

**Interfaces:**
- Consumes: container `wordly-web` ở `127.0.0.1:13500` (Task 6), Kong ở `127.0.0.1:8000` (Task 2).
- Produces: `https://app.wordly.skillproof.work` và `https://api.wordly.skillproof.work` sống — Task 8 verify qua đây.

- [ ] **Step 1: Verify DNS đã trỏ (làm SAU khi chủ dự án thêm 2 record A — xem Global Constraints, bước này KHÔNG tự làm vì không có quyền DNS `skillproof.work`)**

```bash
dig +short app.wordly.skillproof.work
dig +short api.wordly.skillproof.work
```

Expected: cả 2 trả về `167.99.74.215`. Nếu chưa trỏ — DỪNG, báo chủ dự án thêm DNS record trước, không tạo cert certbot (certbot cần DNS sống để verify domain).

- [ ] **Step 2: Tạo file nginx cho webapp (KHÔNG sửa file của `localex`/`pehub`)**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 root@167.99.74.215 "cat > /etc/nginx/sites-available/wordly.prod.webapp.conf" <<'EOF'
server {
    server_name app.wordly.skillproof.work;
    client_max_body_size 1m;
    location / {
        proxy_pass http://127.0.0.1:13500;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
    listen 80;
}
EOF
```

- [ ] **Step 3: Tạo file nginx cho api (Kong)**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 root@167.99.74.215 "cat > /etc/nginx/sites-available/wordly.prod.api.conf" <<'EOF'
server {
    server_name api.wordly.skillproof.work;
    client_max_body_size 50m;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
    listen 80;
}
EOF
```

- [ ] **Step 4: Enable 2 site, `nginx -t` trước khi reload (BẮT BUỘC — tránh làm rớt `localex`/`pehub`)**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 root@167.99.74.215 "
ln -sf /etc/nginx/sites-available/wordly.prod.webapp.conf /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/wordly.prod.api.conf /etc/nginx/sites-enabled/
nginx -t
"
```

Expected: `syntax is ok` + `test is successful`. Nếu lỗi — SỬA trước, không reload.

- [ ] **Step 5: Reload nginx (KHÔNG restart), verify 2 app cũ vẫn sống**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 root@167.99.74.215 "
nginx -s reload
curl -s -o /dev/null -w '%{http_code}\n' https://admin.localex.staging.skillproof.work
curl -s -o /dev/null -w '%{http_code}\n' https://pehub.skillproof.work
curl -s -o /dev/null -w '%{http_code}\n' http://app.wordly.skillproof.work
"
```

Expected: 2 app cũ vẫn trả response bình thường (không 502/connection refused), app Wordly mới trả response qua HTTP (chưa SSL).

- [ ] **Step 6: Cấp SSL certbot cho Wordly (gộp 2 subdomain, giống pattern `localex-staging`)**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 root@167.99.74.215 "
certbot --nginx -d app.wordly.skillproof.work -d api.wordly.skillproof.work --non-interactive --agree-tos -m <email chủ dự án>
nginx -t && nginx -s reload
"
```

Expected: certbot báo "Successfully received certificate", `certbot certificates` sau đó liệt kê cert mới `wordly...` (hoặc tên certbot tự đặt).

- [ ] **Step 7: Verify HTTPS cho cả 2 subdomain**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://app.wordly.skillproof.work/
curl -s -o /dev/null -w "%{http_code}\n" https://api.wordly.skillproof.work/rest/v1/
```

Expected: cả 2 trả response hợp lệ qua HTTPS (không lỗi SSL/certificate).

---

### Task 8: Verify end-to-end trên domain mới (BẮT BUỘC trước khi báo chủ dự án là "xong", trước Task 9)

**Files:** không có file — test bằng tay qua browser + curl.

**Interfaces:**
- Consumes: `https://app.wordly.skillproof.work` sống (Task 7), dữ liệu đã migrate (Task 3), Auth đã cấu hình (Task 4).
- Produces: xác nhận luồng chính hoạt động — gate để qua Task 9 (đổi iOS) và Task 10 (cắt hẳn Cloud).

- [ ] **Step 1: Test login thật bằng tài khoản test** (`huythien7122+wordlytest@gmail.com` hoặc tài khoản thường) qua `https://app.wordly.skillproof.work/login` — xác nhận đăng nhập Google OK, JWT có đúng claim (không còn claim B2B vì đã xoá ở migration trước, không lỗi 401).

- [ ] **Step 2: Test dịch + lưu từ** trên `/` — gõ 1 từ, xác nhận bản dịch AI trả về, lưu từ thành công, `translate_history` có dòng mới (query qua tunnel Postgres hoặc Studio SSH tunnel).

- [ ] **Step 3: Test lịch sử dịch hiển thị đúng dữ liệu đã migrate** — mở `/`, xác nhận thấy lịch sử dịch CŨ (từ Supabase Cloud) hiển thị đầy đủ, không rỗng, không trùng lặp.

- [ ] **Step 4: Test email** — vào `/profile`, gửi "email thử", xác nhận nhận được (Gmail SMTP không đổi nên nhiều khả năng OK, nhưng vẫn phải test thật vì container mới).

- [ ] **Step 5: Nếu có bất kỳ bước nào FAIL** — dừng lại ở đây, KHÔNG báo chủ dự án là sẵn sàng đổi iOS/cắt hẳn Cloud. Debug bằng `docker compose logs` của service liên quan trên VPS.

---

### Task 9: Thiết lập backup Postgres tự động

**Files:** `/opt/wordly/prod/supabase/backup.sh` + crontab của `deploy-wordly` trên VPS.

**Interfaces:**
- Consumes: container Postgres self-host (Task 2).
- Produces: file backup hàng ngày tại `/var/backups/wordly/prod/db-YYYY-MM-DD.sql.gz`, giữ 7 bản gần nhất.

- [ ] **Step 1: Viết script backup**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 deploy-wordly@167.99.74.215 "cat > /opt/wordly/prod/supabase/backup.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/wordly/prod/supabase
DB_CONTAINER=$(docker compose ps -q db)
docker exec "$DB_CONTAINER" pg_dump -U postgres postgres | gzip > "/var/backups/wordly/prod/db-$(date +%Y%m%d).sql.gz"
find /var/backups/wordly/prod/ -name "db-*.sql.gz" -mtime +7 -delete
EOF
chmod +x /opt/wordly/prod/supabase/backup.sh 2>/dev/null || ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 deploy-wordly@167.99.74.215 "chmod +x /opt/wordly/prod/supabase/backup.sh"
```

- [ ] **Step 2: Test chạy thủ công 1 lần**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 deploy-wordly@167.99.74.215 "
/opt/wordly/prod/supabase/backup.sh
ls -la /var/backups/wordly/prod/
"
```

Expected: file `db-<ngày hôm nay>.sql.gz` xuất hiện, size > 0.

- [ ] **Step 3: Thêm crontab (3h sáng giờ VN = 20:00 UTC)**

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 deploy-wordly@167.99.74.215 "
(crontab -l 2>/dev/null; echo '0 20 * * * /opt/wordly/prod/supabase/backup.sh >> /var/log/wordly-backup.log 2>&1') | crontab -
crontab -l
"
```

Expected: crontab liệt kê đúng dòng mới, không xoá cron job khác (nếu `deploy-wordly` user mới tạo thì không có cron cũ — chỉ cần verify không trùng dòng).

---

### Task 10: Cập nhật `PROGRESS.md`, theo dõi ổn định, rồi mới đổi iOS + tắt hạ tầng cũ

**Files:** `PROGRESS.md`

**Interfaces:** không áp dụng (ghi chép, không phải code).

- [ ] **Step 1: Ghi vào `PROGRESS.md`** — domain mới sống, migration data đã verify khớp, backup đã chạy, CHƯA đổi iOS, CHƯA tắt Vercel/Supabase Cloud — nêu rõ cần theo dõi vài ngày trước khi làm tiếp 2 việc đó (đổi iOS app là breaking change, tắt Cloud là không hoàn tác).

- [ ] **Step 2: Dừng ở đây — việc đổi iOS app endpoint (mục 4.5 trong spec) và tắt Vercel/Supabase Cloud (mục 10 quy trình triển khai trong spec) là 2 bước RIÊNG, cần chủ dự án xác nhận thời điểm, không làm liền trong plan này.**

```bash
cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly"
git add PROGRESS.md
git commit -m "docs: ghi lại tiến độ chuyển hạ tầng VPS self-host — domain mới sống, chưa đổi iOS/tắt Cloud"
```
