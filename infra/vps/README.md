# Hạ tầng VPS self-host — bản sao config (tham khảo, không phải nguồn sự thật)

Đây là **bản sao** config đang chạy thật trên VPS `167.99.74.215`
(`wordly.skillproof.work`) — đưa vào git để tránh "cấu hình trôi không ai
biết" (sửa trực tiếp trên VPS rồi quên, không ai nhớ đã đổi gì). File thật
vẫn sống trên VPS; sửa gì trên VPS thì nhớ đồng bộ lại đây.

Xem thiết kế đầy đủ: `docs/superpowers/specs/2026-10-10-vps-self-hosted-infra-design.md`.
Xem quy trình triển khai từng bước: `docs/superpowers/plans/2026-10-10-vps-self-hosted-migration.md`.

## Cấu trúc

| File | Vị trí thật trên VPS | Ghi chú |
|---|---|---|
| `supabase/docker-compose.yml` | `/opt/wordly/prod/supabase/docker-compose.yml` | Bản chính thức `supabase/supabase` (docker/), đã sửa 2 chỗ (xem dưới) |
| `supabase/.env.example` | — | Bản gốc upstream, CHƯA từng sửa — an toàn commit. `.env` thật (có secret) KHÔNG commit |
| `supabase/backup.sh` | `/opt/wordly/prod/supabase/backup.sh` | Cron backup hàng ngày (`deploy-wordly`, 20:00 UTC) |
| `web/docker-compose.yml` | `/opt/wordly/prod/web/docker-compose.yml` | Container Next.js |
| `web/send-emails-cron.sh` | `/opt/wordly/prod/web/send-emails-cron.sh` | Cron `*/5 * * * *` (`deploy-wordly`) gọi `POST /api/cron/send-emails` — thay Inngest sleepUntil, xem `web/src/lib/email/cron-send-emails.js` |
| `nginx/wordly.prod.webapp.conf` | `/etc/nginx/sites-available/wordly.prod.webapp.conf` | vhost `app.wordly.skillproof.work`, SSL do certbot tự quản |
| `nginx/wordly.prod.api.conf` | `/etc/nginx/sites-available/wordly.prod.api.conf` | vhost `api.wordly.skillproof.work` |

## Đã sửa so với mặc định upstream (ghi lại để không quên)

**`supabase/docker-compose.yml`:**
- 3 dòng port publish đổi từ bind `0.0.0.0` (mặc định) sang `127.0.0.1` —
  Envoy (`api-gw`, port 8000) + Supavisor pooler (5432, 6543). Mặc định
  upstream expose công khai ra internet, bypass `ufw` (Docker tự thêm rule
  iptables). **KHÔNG được đổi lại `0.0.0.0`** trừ khi hiểu rõ rủi ro.
- Uncomment block `GOTRUE_EXTERNAL_GOOGLE_*` (mặc định comment out).
- Thêm mới `GOTRUE_EXTERNAL_APPLE_ENABLED`/`_CLIENT_ID`/`_REDIRECT_URI`
  (upstream không có sẵn block này, chỉ có Google/GitHub/Azure).

**`.env` thật trên VPS (không commit) có thêm so với `.env.example`:**
```
GOOGLE_ENABLED=true
GOOGLE_CLIENT_ID=<từ Google Cloud Console>
GOOGLE_SECRET=<từ Google Cloud Console>
APPLE_ENABLED=true
APPLE_CLIENT_ID=com.thientran.wordly
# KHÔNG có APPLE_SECRET — app dùng Sign in with Apple native (ID token) trên
# iOS, chỉ cần Client ID để verify audience, không cần OAuth secret của Apple.
SUPABASE_PUBLIC_URL=https://api.wordly.skillproof.work
API_EXTERNAL_URL=https://api.wordly.skillproof.work/auth/v1
SITE_URL=https://app.wordly.skillproof.work
```

**nginx (cả 2 vhost):** thêm `proxy_buffer_size 16k; proxy_buffers 4 16k;
proxy_busy_buffers_size 32k;` — buffer mặc định nginx quá nhỏ cho cookie
session Supabase (chứa JWT, có thể dài). Thiếu thì gặp lỗi
`upstream sent too big header`.

## Crontab trên `deploy-wordly` (VPS)

```
0 20 * * * /opt/wordly/prod/supabase/backup.sh >> /var/backups/wordly/prod/backup.log 2>&1
*/5 * * * * /opt/wordly/prod/web/send-emails-cron.sh >> /opt/wordly/prod/web/send-emails-cron.log 2>&1
```

## Rủi ro đã biết

- Config này sống trên VPS **dùng chung** với 2 product khác không liên
  quan (`localex`, `pehub`) — KHÔNG được sửa file của 2 app đó, không được
  chạy lệnh ảnh hưởng toàn host (restart Docker daemon, đổi nginx global
  config) mà không báo trước.
- `web/.env` thật trên VPS = copy gần như y nguyên từ `web/.env.local`, chỉ
  đổi 3 dòng Supabase + thêm `NEXT_PUBLIC_APP_URL` — xem `web/.env.example`
  cho danh sách đầy đủ biến cần có.
