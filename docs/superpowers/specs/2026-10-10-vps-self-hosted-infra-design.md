# Thiết kế: Chuyển hạ tầng Wordly sang VPS tự quản

**Ngày:** 2026-10-10 (cập nhật: điền domain + VPS thật, dùng chung VPS)
**Trạng thái:** Đã duyệt — chờ viết implementation plan

## 1. Mục tiêu & phạm vi

Chuyển Wordly từ Vercel + Supabase Cloud (managed) sang tự host trên 1 VPS
dùng chung (xem mục "Domain & VPS đã chốt" dưới), domain là subdomain của
domain hạ tầng chung `skillproof.work`. Mục tiêu chính: **giảm chi phí hạ tầng** khi hướng tới quy mô
~1000 người dùng, trong khi **giữ nguyên tối đa code nghiệp vụ hiện tại**
(Auth, RLS multi-tenant, JWT custom claims `user_orgs`).

**Trong phạm vi:**
- Tự host Supabase stack (Postgres + Auth + PostgREST + Storage + Realtime +
  Kong + Studio) bằng Docker Compose trên VPS.
- Next.js app chạy trong Docker container trên VPS, thay cho Vercel.
- nginx làm reverse proxy + SSL (Let's Encrypt) cho domain mới.
- Sửa + build lại app iOS để trỏ endpoint mới (API + Supabase Auth).
- Backup Postgres tự động (cron `pg_dump`).

**Ngoài phạm vi (giữ nguyên, không đổi trong lần này):**
- Email: vẫn Gmail SMTP + Nodemailer (không đổi sang Brevo — để sau khi gần
  chạm ngưỡng ~500 email/ngày của Gmail).
- Inngest (durable jobs) — vẫn dùng Inngest Cloud.
- Groq, DeepL, Google Cloud TTS — không đổi.
- Cloudflare R2 (lưu video) — không đổi, không liên quan Supabase Storage.

**Domain & VPS đã chốt (10/10/2026):**
- Domain: `wordly.skillproof.work` — KHÔNG phải domain riêng của Wordly.
  `skillproof.work` là domain gốc đang dùng chung hạ tầng cho nhiều product
  không liên quan trên cùng VPS (xem dưới) — Wordly dùng subdomain của nó
  theo đúng pattern 2 product khác đã dùng (`localex.staging.skillproof.work`,
  `pehub.skillproof.work`).
- Subdomain cuối: `app.wordly.skillproof.work` (Next.js), `api.wordly.skillproof.work`
  (Supabase Kong) — đã thay thế mọi placeholder `<domain>` trong các mục dưới.
- VPS: **DÙNG CHUNG**, không phải VPS riêng cho Wordly — `167.99.74.215`,
  droplet DigitalOcean `ubuntu-s-2vcpu-4gb-sgp1` (2 vCPU, 4GB RAM, Singapore),
  Ubuntu 24.04.5 LTS. Đang chạy 2 product khác không liên quan:
  - `localex` (staging): 4 container — api/webapp/admin/postgres
  - `pehub` (prod): 2 container — api-blue/db
  Theo quy ước ATLAS (1 Linux user/app), mỗi product có user riêng
  (`deploy-localex`, `deploy-pehub` đã có) — sẽ tạo thêm `deploy-wordly`.
  Docker 29.9.0 + nginx 1.24.0 + certbot đã cài sẵn trên box, không cần cài
  lại ở bước 1 của quy trình triển khai (mục 5).
- **Kiểm tài nguyên thực tế (10/10/2026, trước khi thêm Wordly):** `free -h`
  báo 3.8GB tổng, 971MB đang dùng, ~2.9GB "available". `docker stats` cho
  thấy 6 container hiện có chỉ dùng tổng ~386MiB RAM thực tế (limit cgroup
  cao hơn nhiều, ví dụ postgres limit 512MB nhưng dùng 80MB) — tải thực tế
  nhẹ hơn nhiều so với RAM tổng, đủ chỗ cho ước tính stack Supabase self-host
  ~1.5-2.3GB ở mục 3. Rủi ro RAM giữ nguyên ghi chú ở mục 6 (theo dõi
  `docker stats` sau khi lên, có phương án tắt Realtime nếu cần) — chỉ khác
  là giờ phải theo dõi CẢ tải của `localex`/`pehub` tăng lên cùng lúc, không
  chỉ tải riêng Wordly.
- **nginx/SSL theo đúng pattern đã có trên box:** mỗi product 1 file riêng
  trong `sites-available/` (sẽ tạo `wordly.prod.webapp.conf` +
  `wordly.prod.api.conf`, không đụng file của `localex`/`pehub`), 1
  certbot cert gộp cả 2 subdomain Wordly (giống cách cert `localex-staging`
  gộp 3 domain `api`/`admin`/`app` làm một) — `certbot --nginx -d
  app.wordly.skillproof.work -d api.wordly.skillproof.work`.
- Layout `/opt/wordly/prod/{web,supabase}/`, `/var/backups/wordly/prod/`
  theo đúng mục 5 của `CLAUDE.md` ("Infrastructure").

## 2. Vì sao tự host Supabase (không viết Auth riêng)

Đã tham khảo dự án Koudefeu (NestJS tự viết + Prisma + Postgres thuần, tự
viết JWT/Auth, không có RLS vì không multi-tenant) làm đối chứng. Với Wordly:

- Auth (Google/Apple Sign-In) và RLS multi-tenant (JWT claim `user_orgs`,
  xem `AGENTS.md`/`CLAUDE.md` mục kiến trúc) đang gắn chặt vào Supabase SDK
  (`@supabase/ssr`, `@supabase/supabase-js`, Supabase Auth SDK trên iOS).
- Viết lại Auth + RLS application-layer từ đầu là rủi ro lớn cho app đang có
  người dùng thật — tương đương làm lại toàn bộ tầng bảo mật.
- Tự host Supabase (Docker images chính thức) giữ nguyên gần 100% code
  nghiệp vụ, chỉ đổi nơi các service đó chạy. Đánh đổi: tự chịu trách nhiệm
  backup/update/bảo mật service (Supabase Cloud không còn làm việc này).

## 3. Kiến trúc tổng thể

```
Internet
   │ HTTPS (443)
   ▼
┌──────────────── nginx (host, Let's Encrypt SSL) ──────────────────┐
│  app.wordly.skillproof.work  → proxy → 127.0.0.1:3000   (Next.js container)      │
│  api.wordly.skillproof.work  → proxy → 127.0.0.1:8000   (Supabase Kong gateway)  │
└──────────────────────────────────────────────────────────────────┘
         │                                  │
         ▼                                  ▼
┌─────────────────────┐      ┌───────────────────────────────────────┐
│  Next.js 16           │      │   Supabase self-hosted (Docker Compose) │
│  (web container)      │◄────►│   Kong · Postgres 15 · GoTrue (Auth) ·  │
│  port 3000             │      │   PostgREST · Storage · Realtime ·      │
│                         │      │   Studio (admin UI)                    │
└─────────────────────┘      └───────────────────────────────────────┘
         │
         ├──► Inngest Cloud (durable jobs — không đổi)
         ├──► Groq / DeepL / Google Cloud TTS (không đổi)
         ├──► Gmail SMTP qua Nodemailer (không đổi)
         └──► Cloudflare R2 (lưu video — không đổi)
```

### Phân bổ RAM trên VPS dùng chung (4GB tổng, ~2.9GB available trước khi thêm Wordly)

| Service | RAM ước tính |
|---|---|
| Postgres | ~400-600 MB |
| GoTrue (Auth) | ~50-100 MB |
| PostgREST | ~50-100 MB |
| Storage API | ~50-100 MB |
| Realtime | ~100-150 MB |
| Kong (gateway) | ~100-150 MB |
| Studio | ~150-200 MB |
| Next.js container | ~300-500 MB |
| nginx + OS | đã cài sẵn, tính trong 971MB đang dùng của box |
| **Tổng ước tính thêm cho Wordly** | **~1.2-1.9 GB** |

`localex` + `pehub` hiện chỉ dùng thực tế ~386MiB RAM (xem mục "Domain & VPS
đã chốt") dù limit cgroup cao hơn nhiều — cộng ước tính Wordly vẫn nằm trong
~2.9GB available. Code hiện tại không dùng Supabase Realtime (`.channel(...)`
— đã grep, không có kết quả trong `web/src/`). Nếu RAM căng khi lên
production thật (do `localex`/`pehub` tăng tải CÙNG LÚC với Wordly, không
chỉ riêng Wordly), tắt container `realtime` + đặt `mem_limit` cho mỗi
service Supabase trong `docker-compose.yml` là cách giảm tải nhanh nhất,
không ảnh hưởng tính năng — ghi chú này để sẵn, chưa áp dụng ngay theo quyết
định "giữ nguyên toàn bộ stack, theo dõi `docker stats` của CẢ BOX rồi quyết
tắt Realtime hoặc nâng cấp VPS nếu cần".

## 4. Các thành phần chi tiết

### 4.1. Supabase self-hosted

- Dùng bộ Docker Compose chính thức từ repo `supabase/supabase` (thư mục
  `docker/`), không tự chế lại từ đầu.
- Volume Postgres mount vào `/opt/wordly/prod/supabase/volumes/db` để dữ
  liệu sống sót qua `docker compose down/up`.
- `SUPABASE_URL` nội bộ cho các service khác gọi là `http://localhost:8000`
  qua Kong; public là `https://api.wordly.skillproof.work`.
- JWT secret, anon key, service role key: tự sinh bằng script Supabase cung
  cấp, lưu trong `.env` của Supabase stack (chmod 600), **khác** `.env` của
  Next.js app nhưng giá trị key phải khớp giữa 2 phía.
- Auth providers (Google, Apple): cấu hình lại trong GoTrue config
  (`.env` của Supabase stack) — chuyển từ Supabase Cloud dashboard sang biến
  môi trường `GOTRUE_EXTERNAL_GOOGLE_*`, `GOTRUE_EXTERNAL_APPLE_*`. Redirect
  URL đổi từ `*.supabase.co/auth/v1/callback` sang
  `https://api.wordly.skillproof.work/auth/v1/callback` — phải cập nhật trong Google Cloud
  Console và Apple Developer.
- Custom access token hook (claim `user_orgs`) — hiện là Postgres function
  đăng ký qua Supabase Cloud dashboard. Tự host thì cấu hình qua
  `GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_*` trong `.env`, function SQL giữ nguyên.
- Studio (admin UI) **không** expose public — chỉ truy cập qua SSH tunnel
  (`ssh -L 3000:localhost:3000 ...`) theo quy ước `atlas-ssh-workflow`,
  không thêm nginx route cho Studio.

### 4.2. Next.js app

- Dockerfile build multi-stage (giống kiểu Koudefeu `apps/web/Dockerfile`
  nhưng cho Next.js server mode, không phải static export — Wordly có
  route handlers `/api/*` phải chạy server-side, không dùng `output: export`).
- Container chạy `next start` trên port 3000 nội bộ, port-map
  `127.0.0.1:3000:3000` (không public trực tiếp, qua nginx).
- Env vars đổi: `NEXT_PUBLIC_SUPABASE_URL` → `https://api.wordly.skillproof.work`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` → key mới sinh từ self-host. Các biến khác
  (`GROQ_API_KEY`, `DEEPL_API_KEY`, `GOOGLE_TTS_*`, Gmail SMTP) không đổi.
- Bỏ `vercel.json`, `VERCEL_URL` khỏi code nếu có tham chiếu cứng.
- `next.config.mjs` CORS cho `/api/*` — giữ nguyên (`Access-Control-Allow-Origin: *`),
  vẫn cần vì app iOS gọi trực tiếp.

### 4.3. nginx + SSL

- 2 server block: `app.wordly.skillproof.work` (proxy Next.js), `api.wordly.skillproof.work` (proxy
  Supabase Kong).
- `client_max_body_size` đủ lớn cho upload (kiểm tra giới hạn hiện tại nếu
  có upload file qua R2 presigned URL — nếu đã presigned thì nginx không
  nằm trên đường upload, không cần tăng).
- SSL qua `certbot --nginx -d app.wordly.skillproof.work -d api.wordly.skillproof.work`.
- Theo `atlas-maintenance-502`: có trang fallback khi upstream down (tuỳ
  chọn, không bắt buộc cho lần triển khai đầu).

### 4.4. Backup Postgres

- Cron job hàng ngày (ví dụ 3h sáng giờ VN) chạy
  `docker exec <postgres_container> pg_dump -U postgres postgres | gzip > /var/backups/wordly/prod/db-$(date +%Y%m%d).sql.gz`.
- Giữ 7 bản gần nhất (script xoá file cũ hơn 7 ngày).
- Lưu local trên VPS (`/var/backups/wordly/prod/` theo quy ước ATLAS). Không
  đồng bộ ra ngoài VPS trong lần này — rủi ro còn lại: nếu VPS hỏng hẳn
  (ổ cứng, mất VPS) thì mất cả DB + backup. Ghi nhận rủi ro này, có thể nâng
  cấp sau (đồng bộ backup lên R2) khi cần.

### 4.5. iOS app

- Đổi base URL API: Vercel URL → `https://app.wordly.skillproof.work`.
- Đổi Supabase client URL + anon key: `*.supabase.co` → `https://api.wordly.skillproof.work`
  + key mới.
- Cấu hình lại redirect URL cho Google/Apple Sign-In (xem 4.1) — cả phía
  Supabase Auth config và phía Apple Developer / Google Cloud Console.
- Build lại (build số tiếp theo sau build 6), test đăng nhập Google/Apple
  thật trên thiết bị trước khi release, release qua TestFlight trước khi
  App Store.

## 5. Quy trình triển khai (tổng quan, chi tiết ở plan)

1. Tạo user `deploy-wordly` (group `docker`, không sudo) + layout
   `/opt/wordly/prod/{web,supabase}/`, `/var/backups/wordly/prod/` — Docker/
   nginx/certbot đã có sẵn trên box, không cần cài lại.
2. Dựng Supabase self-hosted stack, verify Postgres + Auth + PostgREST chạy
   được qua `localhost`.
3. **Chuyển schema + dữ liệu**: dump từ Supabase Cloud hiện tại
   (`supabase db dump`), restore vào Postgres tự host. Đây là bước rủi ro
   cao nhất — cần kiểm tra kỹ dữ liệu khớp 100% trước khi cắt DNS.
4. Build + chạy Next.js container, verify nội bộ (`curl localhost:3000`).
5. Cấu hình nginx (file riêng `wordly.prod.webapp.conf` + `wordly.prod.api.conf`
   trong `sites-available/`, không đụng file của `localex`/`pehub`) + SSL
   (`certbot --nginx -d app.wordly.skillproof.work -d api.wordly.skillproof.work`).
6. Trỏ DNS: thêm 2 record A (`app.wordly`, `api.wordly`) trỏ về `167.99.74.215`
   tại nơi quản lý DNS của `skillproof.work`.
7. Verify toàn bộ flow (đăng nhập, dịch, lưu từ, email) trên domain mới
   trước khi đổi iOS app.
8. Sửa + build lại iOS app, test kỹ, release TestFlight.
9. Thiết lập cron backup.
10. Tắt Vercel project + Supabase Cloud project (sau khi đã xác nhận ổn
    định trên hạ tầng mới một thời gian — không tắt ngay lập tức).

## 6. Rủi ro cần lưu ý

- **Migration dữ liệu từ Supabase Cloud → self-host** là bước rủi ro mất
  dữ liệu cao nhất trong toàn bộ việc này (tương tự sự cố 7/10 đã xảy ra).
  Phải có kế hoạch rollback (giữ Supabase Cloud project sống song song cho
  tới khi xác nhận ổn định) và backup trước khi migrate.
- **Session khác đang code tính năng mới** trên repo — việc đổi env vars,
  middleware liên quan Supabase URL có thể đụng conflict. Cần đồng bộ thời
  điểm merge.
- **VPS dùng chung với `localex`/`pehub`** — RAM hiện đủ dư (xem mục 1 "Domain
  & VPS đã chốt"), nhưng rủi ro khác với VPS riêng: (a) nếu `localex`/`pehub`
  tăng tải bất ngờ, Wordly bị ảnh hưởng cùng lúc chứ không cô lập; (b) mọi
  thao tác trên box (restart Docker daemon, đổi nginx global config, vá OS)
  ảnh hưởng cả 3 product — cần cẩn trọng, không chỉ test riêng Wordly khi
  đổi gì ở tầng host; (c) đã có phương án tắt Realtime nếu RAM căng, theo
  dõi bằng `docker stats` của CẢ BOX (không chỉ container Wordly) sau khi
  lên.
- **App iOS đang có người dùng qua TestFlight** — đổi endpoint là breaking
  change, bắt buộc phải build lại, người dùng cũ phải update app mới hoạt
  động lại được sau khi cắt DNS.
