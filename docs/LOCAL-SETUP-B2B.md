# Chạy & test B2B ở local

> **Chưa deploy lên production.** Toàn bộ thay đổi nằm trên branch
> `feat/b2b-multi-tenant`. Migration chưa chạy lên bất kỳ môi trường nào.

---

## 1. Vì sao phải test ở local trước

Migration multi-tenant bật RLS trên các bảng mới và thêm custom access token
hook. Nếu chạy thẳng lên production mà hook chưa bật, **mọi policy sẽ chặn hết**
và hệ thống trông như "không ai có quyền gì" — rất khó chẩn đoán khi đã có
người dùng thật.

Ngoài ra bộ test RLS **tạo và xoá dữ liệu thật** (org, user, lớp). Harness đã
có chặn an toàn: nó **từ chối chạy** nếu `NEXT_PUBLIC_SUPABASE_URL` không trỏ
tới localhost.

---

## 2. Cài Supabase local

Cần **Docker Desktop** đang chạy (Supabase local dùng container).

```bash
# Không cần cài toàn cục, dùng npx
npx supabase init   # nếu chưa có (config.toml đã có trong repo rồi)
npx supabase start
```

Lần đầu sẽ tải image, mất vài phút. Xong sẽ in ra:

```
API URL: http://127.0.0.1:54321
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
anon key: eyJ...
service_role key: eyJ...
```

**Giữ lại `anon key` và `service_role key`** cho bước sau.

---

## 3. Chạy migration lên local

```bash
npx supabase db reset
```

Lệnh này tạo lại DB local và chạy **toàn bộ** file trong
`supabase/migrations/` theo thứ tự tên. Có 6 file:

| File | Nội dung |
|---|---|
| `...000100_orgs_and_memberships.sql` | organizations, memberships, JWT hook, RLS |
| `...000200_classes.sql` | classes, class_members, mã lớp, `join_class_by_code()` |
| `...000300_org_customization.sql` | org_settings, org_features, org_field_defs |
| `...000400_progress_snapshots.sql` | snapshot tiến độ + hàm tính streak |
| `...000500_lesson_library.sql` | buổi học, tài liệu, quota, Storage RLS |
| `...000600_class_assignments.sql` | giao bộ từ vựng |

> ⚠️ **Lưu ý quan trọng:** các bảng **lõi** của Wordly (`words`, `profiles`,
> `translate_history`, `journal_entries`, `email_slots`, `email_log`...)
> **không có trong repo** — chúng được tạo tay trên Supabase dashboard từ
> trước (xem PRODUCT.md mục 5). Nên `db reset` sẽ tạo được các bảng B2B nhưng
> **thiếu bảng lõi**, và migration `000400` tham chiếu `translate_history`
> sẽ lỗi.
>
> **Cách xử lý** — chọn một trong hai:
>
> **Cách A (khuyên dùng):** dump schema từ production làm baseline
> ```bash
> npx supabase db dump --db-url "<POSTGRES_URL_PRODUCTION>" \
>   --schema public -f supabase/migrations/00000000000000_baseline.sql
> ```
> Dùng connection string ở Supabase Dashboard → Settings → Database.
> Đây là việc "số 0" mà spec đã nêu: chốt schema hiện tại vào version control.
> Chỉ ĐỌC từ production, không ghi gì.
>
> **Cách B (nhanh, để thử nhanh):** tạm tạo bảng lõi tối thiểu ở local — xem
> `scripts/b2b-local-baseline.sql`.

---

## 4. Cấu hình môi trường test

Tạo `.env.test.local` (đã được `.gitignore` bỏ qua vì khớp `.env*`):

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key từ bước 2>
SUPABASE_SERVICE_ROLE_KEY=<service_role key từ bước 2>
```

Harness test đọc file này **trước** `.env.local`, nên credential production
không bị dùng lẫn.

---

## 5. Chạy test RLS

```bash
npm test
```

18 test trong 6 nhóm:

| Nhóm | Kiểm tra |
|---|---|
| Tiên quyết | JWT có claim `user_orgs` (hook đã bật chưa) |
| 1. Cô lập chéo org | org A không thấy dữ liệu org B, kể cả khi biết id |
| 2. Chặn theo vai trò | student không tạo lớp, teacher không xoá lớp |
| 3. Phạm vi giáo viên | student chỉ thấy lớp mình học |
| 4. Rò rỉ qua ghi | không INSERT được sang org khác; trigger chặn ghép chéo |
| 5. Nhiều tổ chức | quyền áp đúng theo từng org |
| 6. Khách | không đọc được bảng nào |

**Nếu test "JWT chứa claim user_orgs" fail** → hook chưa bật. Kiểm
`supabase/config.toml` phần `[auth.hook.custom_access_token]`, rồi
`npx supabase stop && npx supabase start`.

---

## 6. Chạy app với DB local

Tạm trỏ `.env.local` sang local (nhớ backup bản production trước):

```bash
cp .env.local .env.local.production-backup
```

Rồi sửa 3 dòng trong `.env.local` thành giá trị local ở bước 2.

```bash
npm run dev
```

---

## 7. Tạo trung tâm demo để thử

Tạo org + owner đầu tiên phải qua service role (theo thiết kế: onboarding
trung tâm là quy trình bán hàng có kiểm soát, không self-service).

```bash
node scripts/b2b-create-org.mjs "Trung tâm ABC" your-email@example.com
```

Script sẽ in ra org id và gắn owner. Sau đó:

1. Đăng nhập bằng email đó tại http://localhost:3000/login
2. Vào http://localhost:3000/org → thấy trung tâm
3. Tạo lớp → copy mã lớp
4. Đăng nhập tài khoản khác → vào `/join` → nhập mã
5. Quay lại `/org/classes/<id>` xem dashboard

---

## 8. Tính snapshot tiến độ (dashboard cần dữ liệu)

Dashboard đọc từ `student_progress_snapshots`, được tính bởi Inngest cron
hằng ngày. Ở local, gọi thẳng hàm SQL cho nhanh:

```bash
npx supabase db reset --no-seed >/dev/null 2>&1  # nếu cần làm lại
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "SELECT compute_org_progress_snapshots('<org_id>');"
```

Hoặc dùng Studio (http://127.0.0.1:54323) → SQL Editor.

---

## 9. Khi nào mới lên production

Chỉ sau khi **tất cả** mục dưới đây đúng:

- [ ] `npm test` pass toàn bộ 18 test trên local
- [ ] Baseline schema đã dump vào `supabase/migrations/` (Cách A mục 3)
- [ ] Đã thử luồng thật: tạo org → tạo lớp → join → xem dashboard
- [ ] Đã dựng môi trường staging riêng và chạy migration ở đó trước
- [ ] Bật custom access token hook trên production:
      Dashboard → Authentication → Hooks → Custom Access Token →
      chọn `public.custom_access_token_hook`
- [ ] Đã khôi phục `.env.local` về bản production

Thứ tự lên production: **staging trước, production sau**, và bật hook
**trước** khi chạy migration để không có khoảng thời gian policy chặn hết.
