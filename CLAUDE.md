@AGENTS.md

# Working process — Wordly

Tài liệu này là quy chuẩn làm việc cho mọi phiên. Đọc trước khi sửa code.

**Tài liệu liên quan:**
- `PROGRESS.md` — trạng thái hiện tại, đang làm gì, còn gì (đọc đầu mỗi phiên)
- `PRODUCT.md` — tổng quan sản phẩm, kiến trúc, nợ kỹ thuật
- `docs/superpowers/specs/` — spec thiết kế đã duyệt
- `docs/LOCAL-SETUP-B2B.md` — dựng môi trường local + test

---

## 1. Quy tắc tuyệt đối

| # | Quy tắc | Vì sao |
|---|---|---|
| 1 | **KHÔNG deploy production** khi chưa được yêu cầu rõ ràng | Đã có người dùng thật |
| 2 | **KHÔNG chạy migration lên production/staging** khi chưa được đồng ý | Không có rollback |
| 3 | **KHÔNG commit `wordly-ios/`** | Chứa credential thật trong `APIClient.swift` |
| 4 | **KHÔNG `git add -A`** khi có file untracked chứa secret | Đã từng vô tình commit credential iOS |
| 5 | **KHÔNG dùng service role** cho request của người dùng | Bypass RLS = rò dữ liệu chéo trung tâm |
| 6 | Đọc `node_modules/next/dist/docs/` trước khi viết code Next.js | Next 16 có breaking changes |

### Về đa người thuê (multi-tenant)

Rò dữ liệu **chéo trung tâm** là sự cố nghiêm trọng nhất có thể xảy ra — mất
một khách vì thấy dữ liệu khách khác là mất toàn bộ uy tín. Nên:

- Mọi bảng có dữ liệu tenant **phải** bật RLS, không có ngoại lệ
- Mọi bảng mới **phải** có test cô lập chéo org trước khi coi là xong
- Dùng `supabase-server` (anon + RLS) làm mặc định; `createAdminClient()`
  chỉ cho Inngest job và script admin

---

## 2. TDD — bắt buộc

Dùng skill `superpowers:test-driven-development`. Luật sắt:

```
KHÔNG VIẾT CODE PRODUCTION TRƯỚC KHI CÓ TEST FAIL
```

Chu trình: **RED → verify fail → GREEN → verify pass → REFACTOR**

Bước "verify fail" là **bắt buộc**, không được bỏ. Test không bao giờ fail thì
không chứng minh được nó bắt được lỗi gì.

### Áp dụng trong dự án này

| Loại code | Cách test | Chạy được ở đâu |
|---|---|---|
| Logic thuần (validate, tính toán, format) | `tests/unit/*.test.mjs` | Mọi nơi, không cần DB |
| RLS policy, quyền truy cập | `tests/rls/*.test.mjs` | **Chỉ local** (cần Supabase local) |
| Logic SQL (streak, snapshot) | Mô phỏng bằng JS rồi đối chiếu | Mọi nơi |

**Mẹo quan trọng:** khi logic nằm trong route handler thì không test được.
Tách ra `src/lib/` rồi test ở đó. Ví dụ: `material-validation.js` được tách
khỏi `api/materials/` chính vì lý do này.

**Với SQL không chạy được ở local:** viết bản mô phỏng bằng JS, đối chiếu với
thuật toán đang dùng trong app. Cách này đã bắt được lỗi dấu trong hàm streak
(gaps-and-islands: thứ tự giảm dần phải **cộng**, không phải trừ).

### Lệnh

```bash
npm test              # toàn bộ
npm run test:rls      # chỉ test RLS (cần Supabase local)
npm run test:watch    # theo dõi khi sửa
```

---

## 3. Quy trình cho việc mới

Dùng skill `superpowers:brainstorming` trước khi làm việc sáng tạo.

| Loại việc | Quy trình |
|---|---|
| **Spike** (thử xem có khả thi) | Nêu câu hỏi + cách thử → xin đồng ý → báo kết quả |
| **Bounded** (sửa flow đã có trong repo) | Hỏi cho rõ → thiết kế ngắn trong chat → xin đồng ý → TDD |
| **Architectural** (subsystem mới) | Hỏi → 2-3 hướng → thiết kế từng phần → viết spec → duyệt → plan |

**Cửa duyệt luôn tồn tại**, dù việc nhỏ tới đâu. Việc đơn giản thì tài liệu
ngắn, chứ không phải bỏ bước duyệt.

---

## 4. Kiểm chứng trước khi báo xong

Dùng skill `superpowers:verification-before-completion`. Chạy đủ và **đọc kết quả**:

```bash
npm test                     # phải xanh
npx next build               # phải "Compiled successfully"
npx eslint <file đã sửa>     # phải sạch
```

Nguyên tắc báo cáo:

- **Chỉ nói "xong" khi đã chạy và thấy kết quả.** Không suy đoán.
- **Nói rõ phần chưa kiểm chứng được.** Ví dụ: migration SQL chưa chạy qua
  Postgres nào (máy dev không có Docker) → phải nói ra, không được ngầm hiểu
  là đã kiểm.
- Lint/test lỗi có sẵn từ trước thì nói rõ là "có từ trước", đừng nhận là mình
  gây ra, cũng đừng lặng lẽ sửa ngoài phạm vi.

---

## 5. Git

- Làm trên branch riêng: `feat/<tên>`, không commit thẳng `main`
- `git add <đường dẫn cụ thể>` — **không** `git add -A`
- Commit message tiếng Việt, nêu **vì sao** chứ không chỉ **cái gì**
- Kết thúc bằng: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- Chỉ commit/push khi được yêu cầu

---

## 6. Kiến trúc cần biết

### Ngữ cảnh tổ chức nằm trong JWT

Claim `user_orgs` = `{ org_id: role }` do custom access token hook nhúng vào.
RLS đọc từ JWT, **không query bảng** (tránh chậm + đệ quy vô hạn trong policy).

**Hệ quả phải nhớ:** đổi membership thì JWT cũ vẫn còn hiệu lực tới 1 giờ.
Sau khi thêm/xoá người vào org hoặc lớp, client **phải** gọi
`supabase.auth.refreshSession()`. Không làm thì người dùng không thấy quyền mới.

**Nếu hook chưa bật:** `user_orgs` rỗng → mọi policy chặn hết → hệ thống trông
như "không ai có quyền gì". Đây là lỗi dễ chẩn đoán sai nhất.

### Dữ liệu học tập KHÔNG mang org_id

`translate_history`, `journal_entries`, `practice_sessions` thuộc **con người**,
không thuộc trung tâm. Học viên rời trung tâm vẫn giữ tiến độ.

Giáo viên đọc `student_progress_snapshots` (số liệu tổng hợp), **không** đọc
trực tiếp các bảng trên. Vừa là quyền riêng tư (điểm bán hàng), vừa là
performance (không join bảng hàng triệu dòng).

### Ba cơ chế khả biến

Trung tâm khác nhau thì giải bằng **dữ liệu**, không phải code riêng:

| Cơ chế | Dùng cho |
|---|---|
| `org_settings` | Cấu hình (giờ gửi mail, thang điểm, ngưỡng cảnh báo) |
| `org_features` | Bật/tắt tính năng — **đồng thời là cơ chế bán gói** |
| `custom_fields` + `org_field_defs` | Trường dữ liệu riêng của trung tâm |

Đọc cấu hình **luôn** qua `getOrgSetting()`, không query thẳng bảng — để giá trị
mặc định nằm một chỗ.

**Tuyệt đối tránh:** fork codebase hoặc `if (org === 'ABC')` cho từng khách.

### Next 16

- `params` trong route handler là **Promise** → phải `await params`
- Route mới mặc định **protected**; muốn public phải thêm vào
  `PUBLIC_API_PATHS` trong `middleware.js` (khớp chính xác, không dùng tiền tố)

---

## 7. Chi phí

Xếp theo mức độ cần để ý:

1. **Lưu trữ** (Supabase Storage) — lớn nhất, vượt cả AI. Bắt buộc có quota.
2. **Groq** (Alex, từ điển) — đã cache mạnh
3. **Google TTS** — đã cache token + audio
4. **Vercel** — thấp ở quy mô hiện tại

Thêm tính năng có upload/AI thì phải nghĩ tới quota và cache **ngay từ đầu**.

---

## 8. Cập nhật PROGRESS.md

Sau mỗi phần việc hoàn thành, cập nhật `PROGRESS.md`:

- Đánh dấu việc đã xong kèm **bằng chứng** (test pass? build sạch?)
- Ghi việc đang làm dở và đang vướng ở đâu
- Ghi quyết định kiến trúc mới phát sinh
- Ghi việc cần chủ dự án quyết (mục "Chờ quyết định")

Mục đích: phiên sau đọc `PROGRESS.md` là biết đang ở đâu, không phải đọc lại
toàn bộ lịch sử chat.
