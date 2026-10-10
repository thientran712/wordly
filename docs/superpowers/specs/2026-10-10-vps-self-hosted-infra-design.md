# Thiết kế: Chuyển hạ tầng Wordly sang VPS tự quản

**Ngày:** 2026-10-10
**Trạng thái:** Chờ duyệt

## 1. Mục tiêu & phạm vi

Chuyển Wordly từ Vercel + Supabase Cloud (managed) sang tự host trên 1 VPS,
có domain riêng. Mục tiêu chính: **giảm chi phí hạ tầng** khi hướng tới quy mô
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
- Domain cụ thể — dùng placeholder `<domain>` trong spec này; điền domain
  thật khi triển khai.

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
│  app.<domain>  → proxy → 127.0.0.1:3000   (Next.js container)      │
│  api.<domain>  → proxy → 127.0.0.1:8000   (Supabase Kong gateway)  │
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

### Phân bổ RAM trên VPS 4GB (ước tính, theo dõi thực tế sau khi lên)

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
| nginx + OS | ~300-400 MB |
| **Tổng ước tính** | **~1.5-2.3 GB / 4 GB** |

Code hiện tại không dùng Supabase Realtime (`.channel(...)` — đã grep, không
có kết quả trong `web/src/`). Nếu RAM căng khi lên production thật, tắt
container `realtime` trong `docker-compose.yml` là cách giảm tải nhanh nhất,
không ảnh hưởng tính năng — ghi chú này để sẵn, chưa áp dụng ngay theo quyết
định "giữ nguyên toàn bộ stack, theo dõi rồi nâng cấp VPS nếu cần".

## 4. Các thành phần chi tiết

### 4.1. Supabase self-hosted

- Dùng bộ Docker Compose chính thức từ repo `supabase/supabase` (thư mục
  `docker/`), không tự chế lại từ đầu.
- Volume Postgres mount vào `/opt/wordly/prod/supabase/volumes/db` để dữ
  liệu sống sót qua `docker compose down/up`.
- `SUPABASE_URL` nội bộ cho các service khác gọi là `http://localhost:8000`
  qua Kong; public là `https://api.<domain>`.
- JWT secret, anon key, service role key: tự sinh bằng script Supabase cung
  cấp, lưu trong `.env` của Supabase stack (chmod 600), **khác** `.env` của
  Next.js app nhưng giá trị key phải khớp giữa 2 phía.
- Auth providers (Google, Apple): cấu hình lại trong GoTrue config
  (`.env` của Supabase stack) — chuyển từ Supabase Cloud dashboard sang biến
  môi trường `GOTRUE_EXTERNAL_GOOGLE_*`, `GOTRUE_EXTERNAL_APPLE_*`. Redirect
  URL đổi từ `*.supabase.co/auth/v1/callback` sang
  `https://api.<domain>/auth/v1/callback` — phải cập nhật trong Google Cloud
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
- Env vars đổi: `NEXT_PUBLIC_SUPABASE_URL` → `https://api.<domain>`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` → key mới sinh từ self-host. Các biến khác
  (`GROQ_API_KEY`, `DEEPL_API_KEY`, `GOOGLE_TTS_*`, Gmail SMTP) không đổi.
- Bỏ `vercel.json`, `VERCEL_URL` khỏi code nếu có tham chiếu cứng.
- `next.config.mjs` CORS cho `/api/*` — giữ nguyên (`Access-Control-Allow-Origin: *`),
  vẫn cần vì app iOS gọi trực tiếp.

### 4.3. nginx + SSL

- 2 server block: `app.<domain>` (proxy Next.js), `api.<domain>` (proxy
  Supabase Kong).
- `client_max_body_size` đủ lớn cho upload (kiểm tra giới hạn hiện tại nếu
  có upload file qua R2 presigned URL — nếu đã presigned thì nginx không
  nằm trên đường upload, không cần tăng).
- SSL qua `certbot --nginx -d app.<domain> -d api.<domain>`.
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

- Đổi base URL API: Vercel URL → `https://app.<domain>`.
- Đổi Supabase client URL + anon key: `*.supabase.co` → `https://api.<domain>`
  + key mới.
- Cấu hình lại redirect URL cho Google/Apple Sign-In (xem 4.1) — cả phía
  Supabase Auth config và phía Apple Developer / Google Cloud Console.
- Build lại (build số tiếp theo sau build 6), test đăng nhập Google/Apple
  thật trên thiết bị trước khi release, release qua TestFlight trước khi
  App Store.

## 5. Quy trình triển khai (tổng quan, chi tiết ở plan)

1. Cài Docker + Docker Compose trên VPS (nếu chưa có).
2. Dựng Supabase self-hosted stack, verify Postgres + Auth + PostgREST chạy
   được qua `localhost`.
3. **Chuyển schema + dữ liệu**: dump từ Supabase Cloud hiện tại
   (`supabase db dump`), restore vào Postgres tự host. Đây là bước rủi ro
   cao nhất — cần kiểm tra kỹ dữ liệu khớp 100% trước khi cắt DNS.
4. Build + chạy Next.js container, verify nội bộ (`curl localhost:3000`).
5. Cấu hình nginx + SSL cho cả 2 subdomain.
6. Trỏ DNS domain thật về VPS (bước này cần domain cụ thể).
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
- **RAM 4GB** có thể không đủ khi traffic tăng — đã có phương án tắt
  Realtime nếu cần, theo dõi bằng `docker stats` sau khi lên.
- **App iOS đang có người dùng qua TestFlight** — đổi endpoint là breaking
  change, bắt buộc phải build lại, người dùng cũ phải update app mới hoạt
  động lại được sau khi cắt DNS.
