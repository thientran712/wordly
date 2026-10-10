# Wordly

Monorepo cho Wordly — web app và app di động dùng chung một backend Supabase.

| Thư mục | Nội dung | Deploy |
|---|---|---|
| `web/` | Web app Next.js 16 (UI + API cho cả web lẫn mobile) | Vercel, Root Directory = `web` |
| `mobile/` | App native — iOS (SwiftUI) ở `mobile/ios/` | App Store |
| `supabase/` | Cấu hình Supabase CLI + migration (dùng chung web + mobile) | Chạy tay, xem `CLAUDE.md` |
| `migrations/` | Migration SQL cũ, chạy tay trên SQL Editor | Chạy tay |
| `docs/` | Tài liệu, spec | — |

## Web — chạy local

```bash
cd web
npm ci
cp .env.example .env.local   # điền giá trị thật; file phải nằm trong web/
npm run dev                  # http://localhost:3000
npm test
```

## Supabase local

Lệnh Supabase CLI chạy từ **gốc repo** (nơi có `supabase/`):

```bash
npx supabase start
npx supabase db reset
```

Hoặc từ `web/`: `npm run db:reset` (script đã trỏ `--workdir ..`).

Quy chuẩn làm việc: `CLAUDE.md`.
