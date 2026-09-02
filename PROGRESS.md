# Tiến độ — Wordly for Business (B2B)

> **Đọc file này đầu mỗi phiên** để biết đang ở đâu.
> Quy chuẩn làm việc: `CLAUDE.md`. Thiết kế: `docs/superpowers/specs/`.

**Cập nhật:** 2026-09-03
**Branch:** `feat/b2b-multi-tenant` (chưa merge, chưa push)
**Môi trường:** chỉ local — **chưa deploy production, chưa chạy migration ở đâu**

---

## Trạng thái tổng quan

| Giai đoạn | Phạm vi | Trạng thái |
|---|---|---|
| **GĐ1** | Multi-tenant, lớp, dashboard GV, thư viện bài giảng | 🟡 ~80% — code xong, **chưa kiểm chứng trên DB thật** |
| **GĐ2** | Bài tập/homework, quiz/game, video upload | ⬜ Chưa bắt đầu |
| **GĐ3** | Thanh toán SaaS, báo cáo phụ huynh | ⬜ Chưa bắt đầu |
| **GĐ4** | Học phí/công nợ, chấm bài nói | ⬜ Chưa bắt đầu |

---

## GĐ1 — chi tiết

### ✅ Đã xong và kiểm chứng được

| Việc | Bằng chứng |
|---|---|
| 6 migration multi-tenant | Cân bằng cú pháp OK — **chưa chạy qua Postgres** |
| `org-context.js` — guard theo vai trò từ JWT | build + lint sạch |
| `org-settings.js` — 3 cơ chế khả biến | build + lint sạch |
| `material-validation.js` — validate tài liệu | **20/20 test pass** (TDD: RED→GREEN) |
| API: `/api/orgs`, `/api/classes`, `/api/join` | build sạch |
| API: `/api/classes/[id]/progress` | build sạch, `await params` đúng Next 16 |
| API: `/api/materials`, `/api/materials/upload-url` | build + lint sạch |
| UI: `/org`, `/org/classes/[id]`, `/join` | build sạch, dùng đúng design token |
| Sidebar: mục "Trung tâm" hiện có điều kiện | build sạch |
| 3 Inngest job (snapshot, dọn rác, sync quota) | build sạch |
| Siết `middleware.js` → khớp route chính xác | build sạch |
| Xoá `/api/debug/select-word` | đã xoá khỏi repo |
| Test RLS 18 ca + chặn an toàn không cho chạy production | chạy thử: đúng là skip khi thấy host production |
| Dọn credential iOS khỏi git history | `git log -- wordly-ios` = 0 |

### 🟡 Chưa kiểm chứng được (chặn kỹ thuật)

**Migration SQL chưa chạy qua Postgres nào.** Máy dev không có Docker/psql nên
chỉ kiểm được cân bằng `$$` và ngoặc. Lỗi cú pháp hoặc thứ tự phụ thuộc vẫn có
thể còn. **Lần kiểm chứng thật đầu tiên sẽ là khi chủ dự án chạy
`npx supabase start` + `db reset`.**

**Test RLS 18 ca chưa từng chạy thật** — cùng lý do trên.

### ⬜ Còn thiếu ở GĐ1

| Việc | Ghi chú |
|---|---|
| UI thư viện bài giảng | API đã xong, thiếu màn hình upload/xem |
| UI mời thành viên qua email | API `/api/orgs/[id]/members` chưa viết |
| Trang cài đặt tổ chức | Sửa `org_settings`, xem quota |
| UI giao bộ từ vựng | Bảng `class_assignments` đã có, thiếu API + UI |
| Job nạp từ được giao vào hàng đợi FSRS | Thiết kế xong, chưa code |
| Email mời thành viên | Dùng lại `send-email.js` + React Email |

---

## Vướng mắc đã biết

### 1. `db reset` sẽ lỗi ở migration 000400

**Nguyên nhân:** migration tham chiếu `translate_history`, nhưng các bảng lõi
của Wordly **không có `CREATE TABLE` trong repo** (xem `PRODUCT.md` mục 5) —
chúng được tạo tay trên dashboard.

**Cách xử lý:** xem `docs/LOCAL-SETUP-B2B.md` mục 3.
- Cách A (đúng lâu dài): dump baseline từ production vào `supabase/migrations/`
- Cách B (nhanh): dùng `scripts/b2b-local-baseline.sql`

### 2. Hook JWT phải bật trước khi chạy migration

Nếu chạy migration mà hook chưa bật, `user_orgs` rỗng → mọi policy chặn hết →
hệ thống trông như "không ai có quyền gì". Rất dễ chẩn đoán sai.

- Local: đã cấu hình sẵn trong `supabase/config.toml`
- Production: bật tay ở Dashboard → Auth → Hooks

---

## Chờ chủ dự án quyết định

| # | Việc | Vì sao cần quyết |
|---|---|---|
| 1 | **Dump baseline schema từ production** | Cần connection string production. Chỉ đọc, không ghi. Đây là việc "số 0" — không có nó thì không tái tạo được DB |
| 2 | **Bật custom access token hook** trên staging/production | Thao tác trên dashboard, tôi không làm được |
| 3 | **Dựng môi trường staging** | Cần tạo project Supabase mới; tốn phí |
| 4 | **Cổng thanh toán nào** (VNPay/MoMo/Stripe) | Ảnh hưởng GĐ3. Khuyến nghị: 1-3 khách đầu thu ngoài hệ thống |
| 5 | **Dịch vụ video** (Cloudflare Stream/Mux/Bunny) | Ảnh hưởng GĐ2. Khuyến nghị: dùng link YouTube/Drive trước |
| 6 | **Credential iOS** trong `APIClient.swift` | Cần chuyển sang cấu hình ngoài trước khi commit `wordly-ios/` |

---

## Quyết định kiến trúc đã chốt

| Quyết định | Lý do |
|---|---|
| Shared DB + shared schema + RLS theo `org_id` | Chi phí không tăng theo số khách, deploy 1 lần, đúng cách Supabase được thiết kế |
| Ngữ cảnh org trong JWT (không query bảng) | Nhanh + tránh đệ quy vô hạn trong policy |
| Dữ liệu học tập **không** mang `org_id` | HV giữ tiến độ khi rời trung tâm; GV thấy tiến độ chứ không đọc nhật ký cá nhân |
| `memberships` là bảng trung tâm (không phải `students`) | Một người thuộc nhiều org với nhiều vai trò |
| Vai trò `parent` có sẵn từ đầu | Thêm enum bây giờ miễn phí, sửa mô hình quyền sau rất đắt |
| Khả biến bằng dữ liệu, không bằng code riêng | Tránh `if (org === 'ABC')` và fork codebase |
| Video: dùng link ngoài ở GĐ1 | Upload trực tiếp cần dịch vụ thứ ba, 3-4 tuần; link giải quyết 80% nhu cầu |
| Quota lưu trữ làm ngay từ đầu | Lưu trữ là chi phí biến đổi lớn nhất, vượt cả AI |
| Tạo org chỉ qua service role | Onboarding trung tâm là quy trình bán hàng có kiểm soát, không self-service |

---

## Lỗi đã phát hiện và sửa

| Lỗi | Cách phát hiện |
|---|---|
| Streak SQL sai dấu (gaps-and-islands) — mọi streak trả về 1 | Mô phỏng bằng JS, đối chiếu 8 ca với thuật toán app: 4 ca lệch |
| `git add -A` đưa credential iOS vào git history | Kiểm `git diff --stat` sau commit |
| `setState` đồng bộ trong `useEffect` ở `/org` | `npx eslint` |
| Query `organizations` dùng sai cột (`org_id` thay vì `id`) | Đọc lại code |
| Job dọn rác dùng `list()` không đệ quy → bỏ sót gần hết file | Tự soát lại logic |

---

## Nợ kỹ thuật (từ PRODUCT.md, ưu tiên cho B2B)

| # | Việc | Ưu tiên |
|---|---|---|
| 1 | Schema không tái tạo được từ repo | 🔴 |
| 2 | `/api/translate`, `/api/dictionary` công khai không rate limit | 🔴 |
| 3 | `params` không `await` ở `practice/sessions/[id]` (route **cũ**) | 🔴 |
| 4 | Route cũ dùng service role bypass RLS | 🟡 |
| 5 | `word_ai_content.word_id` là `int` nhưng `words.id` là UUID | 🟡 |
| 6 | Workflow GitHub trỏ route `/api/cron/send-daily-emails` đã xoá | 🟡 |
| 7 | Không có CI | 🟡 |

Mục 3 tôi **chưa sửa** vì nằm ngoài phạm vi B2B — nhưng nó là bug thật, route
đó đang filter `id = undefined`.
