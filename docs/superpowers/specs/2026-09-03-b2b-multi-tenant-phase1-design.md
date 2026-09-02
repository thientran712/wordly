# Wordly for Business — Giai đoạn 1: Nền tảng Multi-tenant

**Ngày:** 2026-09-03
**Trạng thái:** Đã duyệt thiết kế, đang thực thi
**Mục tiêu:** Biến Wordly từ app B2C đơn người dùng thành nền tảng bán được cho nhiều trung tâm Anh ngữ.

---

## 1. Bối cảnh & Quyết định nền tảng

### 1.1. Điểm khởi đầu

Wordly hiện là app B2C: mọi bảng khoá theo `user_id` phẳng, **không có bất kỳ khái niệm tổ chức/vai trò nào** (đã xác minh bằng grep: `role` chỉ dùng cho chat message, `teacher/student` chỉ xuất hiện trong văn bản prompt).

Tài sản tái dùng được:

| Tài sản | Dùng cho B2B |
|---|---|
| Email engine (durable, watchdog, timezone, khử trùng) | Phân phối từ vựng cho lớp — **điểm bán hàng chính** |
| FSRS + hàng đợi ôn tập | Lộ trình học của lớp |
| 7.5k từ có CEFR + topic + collocation | Kho từ dùng chung |
| Google TTS Neural2 (US/UK) | Phát âm, sinh audio |
| VAD rảnh tay (Silero on-device) | Luyện nói, chi phí server = 0 |
| Auth Supabase + middleware `getClaims()` | Nền cho JWT mang ngữ cảnh org |

### 1.2. Quyết định kiến trúc: Shared DB + Shared Schema + RLS

**Chọn:** một database, mọi bảng nghiệp vụ có `org_id`, RLS Postgres chặn cứng.

**Lý do:**
- Supabase được thiết kế quanh RLS — dùng đúng công cụ
- Chi phí hạ tầng không tăng theo số trung tâm (50 khách vẫn 1 DB)
- Deploy 1 lần, mọi khách cùng version
- Buộc giải khả biến bằng **cấu hình**, không bằng code riêng cho từng khách

**Đã loại:**
- *DB riêng mỗi org*: migration × N, chi phí × N — không khả thi với 1 người phát triển
- *Schema riêng mỗi org*: migration vẫn × N, không xứng độ phức tạp thêm

**Rủi ro đã nhận diện:** một RLS policy sai = rò dữ liệu chéo trung tâm = mất toàn bộ uy tín. **Giảm thiểu bắt buộc:** bộ test RLS tự động (mục 4.4), không phải tuỳ chọn.

### 1.3. Nguyên tắc khả biến (trả lời "mỗi trung tâm nhu cầu khác nhau")

Phân loại nhu cầu khác biệt — chỉ loại 4 cần code nhiều nhánh:

| Loại | Ví dụ | Giải bằng | Đổi schema |
|---|---|---|---|
| 1. Cấu hình | Giờ gửi mail, thang điểm 10 vs band 9.0 | `org_settings` | ❌ |
| 2. Nội dung riêng | Giáo trình riêng, logo, bộ từ riêng | dữ liệu có `org_id` | ❌ |
| 3. Trường thêm | "Mã HV nội bộ", "Zalo phụ huynh" | `custom_fields` JSONB | ❌ |
| 4. Nghiệp vụ khác bản chất | Học phí theo buổi vs khoá vs tín chỉ | Strategy pattern | ⚠️ theo interface |

~85% yêu cầu khách là loại 1–3. **Tuyệt đối tránh:** fork codebase cho từng khách.

---

## 2. Mô hình dữ liệu

### 2.1. Sơ đồ

```
auth.users (đã có — KHÔNG đổi)
    │
    │ một người ↔ nhiều tổ chức
    ▼
memberships ──────────────► organizations
  user_id, org_id            id, name, slug
  role: owner|teacher        plan, status
      |student|parent        trial_ends_at
  status: active|invited
      |removed
  custom_fields JSONB
    │
    │ một người ↔ nhiều lớp
    ▼
class_members ────────────► classes
  membership_id               id, org_id, name
  role_in_class               teacher_membership_id
                              join_code, join_code_expires_at
                              join_code_max_uses, join_code_uses
                              status, custom_fields
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
        class_sessions    class_assignments   student_progress_snapshots
          title, date       word_set          words_saved, streak
          order_index       daily_count       last_active_at
          status            start_date        email_open_rate
              │
              ▼
        lesson_materials
          kind: document|audio|video|link
          storage_path | external_url
          allow_download, size_bytes
          provider (cho video GĐ2)

org_settings          org_features         org_storage_usage
  org_id, key, value    org_id,              org_id
  JSONB                 feature_key,         bytes_used
                        enabled              bytes_limit

org_field_defs
  org_id, entity, field_key, label, type, required
```

### 2.2. Ba quyết định cốt lõi

**a) `memberships` là bảng trung tâm, không phải `students`.**
Một người có thể vừa là HV lớp A, vừa trợ giảng lớp B, ở hai trung tâm khác nhau. Bảng `students` riêng sẽ trùng lặp dữ liệu người dùng ngay khi có người thuộc 2 trung tâm.

**b) Vai trò `parent` có ngay từ đầu**, dù báo cáo phụ huynh ở GĐ3. Thêm giá trị enum bây giờ miễn phí; sửa mô hình quyền sau khi có dữ liệu thật thì rất đắt.

**c) Dữ liệu học tập cá nhân KHÔNG mang `org_id`.**
`translate_history`, `journal_entries`, `practice_sessions` thuộc **con người**, không thuộc trung tâm. HV rời trung tâm vẫn giữ tiến độ của mình — đúng với mô hình "HV dùng tài khoản cá nhân, tự join".

Giáo viên **không đọc trực tiếp** các bảng đó. Thay vào đó đọc `student_progress_snapshots` (chỉ số liệu tổng hợp).

Lợi ích kép:
1. **Quyền riêng tư rõ ràng** — GV thấy tiến độ, không đọc nhật ký cá nhân. Đây là điểm bán hàng với học viên.
2. **Performance** — dashboard query một bảng nhỏ đã tổng hợp, không join bảng lịch sử hàng triệu dòng.

Hệ quả quan trọng: **dữ liệu B2C hiện tại không bị ảnh hưởng.** User cũ không thuộc org nào, `memberships` rỗng với họ, mọi flow cũ chạy y nguyên.

---

## 3. Mô hình quyền

### 3.1. Ngữ cảnh org trong JWT

Vấn đề: RLS cần biết "user thuộc org nào, vai trò gì" trong mỗi query. Nếu mỗi policy tự `SELECT` vào `memberships` sẽ chậm và **đệ quy vô hạn** (policy của `memberships` tham chiếu chính nó).

Giải pháp: **Custom Access Token Hook** nhúng ngữ cảnh vào JWT.

```
Đăng nhập → Postgres function (hook)
          → JWT claim: { "orgs": { "<org_id>": "teacher", "<org_id2>": "student" } }
          → RLS đọc auth.jwt(), KHÔNG query bảng
```

Lợi ích: policy nhanh (đọc JWT trong bộ nhớ), không đệ quy, `middleware.js` đã dùng `getClaims()` nên đọc được ngay.

**Đánh đổi:** JWT chỉ cập nhật khi refresh (~1h). Khi GV vừa thêm HV vào lớp, HV cần refresh session. Xử lý: gọi `refreshSession()` ngay sau khi join lớp.

### 3.2. Ba lớp phòng vệ

```
Lớp 1 — RLS Postgres        ← nguồn chân lý, không bypass được
Lớp 2 — requireOrgRole()    ← guard ứng dụng, trả 403 sớm + thông báo rõ
Lớp 3 — Test tự động        ← chứng minh Lớp 1 thực sự chặn
```

Lớp 2 **không thay thế** Lớp 1. Code hiện tại chỉ có Lớp 2 (kỷ luật `.eq("user_id", ...)`) — đủ cho B2C, không đủ cho B2B.

### 3.3. Chính sách dùng Supabase client

| Client | Khi nào |
|---|---|
| `supabase-server` (anon + RLS) | **Mặc định** cho mọi request người dùng |
| `createAdminClient()` (service role) | **Chỉ** Inngest job + admin nội bộ — nơi không có phiên user |

Nợ kỹ thuật hiện tại: `email-slots`, `translate-history`, `practice/sessions*`, `words/by-topic`, toàn bộ spinner đang dùng service role (bypass RLS).

**Kế hoạch:** không refactor hết ngay (rủi ro hồi quy cao). Thay vào đó:
- Mọi bảng mới dùng RLS ngay, không ngoại lệ
- Bổ sung RLS cho bảng cũ để service-role không còn là lớp bảo vệ *duy nhất*
- Chuyển dần route cũ sang anon client ở giai đoạn sau, mỗi lần một route kèm test

### 3.4. Ma trận quyền

| Hành động | owner | teacher | student | parent |
|---|---|---|---|---|
| Xem/sửa thông tin org | ✅ | ❌ | ❌ | ❌ |
| Mời/xoá thành viên | ✅ | ❌ | ❌ | ❌ |
| Tạo/sửa lớp | ✅ | ✅ (lớp mình dạy) | ❌ | ❌ |
| Xem tiến độ HV | ✅ (toàn org) | ✅ (lớp mình dạy) | ✅ (của mình) | ✅ (con mình) |
| Upload tài liệu | ✅ | ✅ (lớp mình dạy) | ❌ | ❌ |
| Xem/tải tài liệu | ✅ | ✅ (lớp mình dạy) | ✅ (lớp mình học) | ❌ |
| Giao bộ từ cho lớp | ✅ | ✅ (lớp mình dạy) | ❌ | ❌ |
| **Đọc nhật ký/lịch sử cá nhân HV** | ❌ | ❌ | ✅ (của mình) | ❌ |

Hàng cuối: **ngay cả owner cũng không đọc được dữ liệu học tập cá nhân** — hệ quả của quyết định 2.2(c).

---

## 4. Luồng nghiệp vụ

### 4.1. Tạo tổ chức & mời thành viên

```
Super-admin (anh) tạo org  →  status='trial', plan='basic'
                           →  cấp 1 tài khoản owner
         ↓
Owner đăng nhập → tạo lớp → nhận mã lớp (VD: WRD-7K2M)
         ↓
   ┌─────────────────────┴─────────────────────┐
   ▼ Cách A: mời qua email                     ▼ Cách B: HV nhập mã
 Nhập danh sách email                        GV đọc mã trên lớp
 → memberships(status='invited')             → HV vào /join
 → gửi mail (dùng engine sẵn có)             → memberships(status='active')
 → HV bấm link, join lớp                     → refreshSession()
```

Làm **cả hai** vì phục vụ hai tình huống khác nhau: mời email cho lớp có danh sách sẵn, mã lớp cho lúc GV đứng trên lớp.

**Bảo mật mã lớp:** có hạn (mặc định 30 ngày) + giới hạn lượt dùng (mặc định 50). Không có hai điều này thì mã lan ra ngoài là người lạ vào lớp được.

### 4.2. Dashboard giáo viên

Thiết kế quanh **một câu hỏi**: *"ai đang học, ai đã bỏ?"*

```
┌────────────────────────────────────────────────────────┐
│ Lớp IELTS Foundation 3 · 24 học viên                   │
├────────────────────────────────────────────────────────┤
│  🟢 Đang học tốt 14   🟡 Chững lại 6   🔴 Đã bỏ 4      │
├────────────────────────────────────────────────────────┤
│ Học viên      Streak  Từ đã lưu  Hoạt động  Mở mail    │
│ Nguyễn A        12🔥      156      hôm nay    92%      │
│ Trần B           0        23      9 ngày ⚠️   12%      │
└────────────────────────────────────────────────────────┘
```

Phân loại 3 nhóm là chủ ý: GV không cần đọc 24 dòng số, họ cần biết **gọi điện cho ai hôm nay**.

Ngưỡng phân loại (cấu hình được qua `org_settings`):
- 🟢 Đang học tốt: hoạt động trong 3 ngày
- 🟡 Chững lại: 4–7 ngày
- 🔴 Đã bỏ: > 7 ngày

Dữ liệu từ `student_progress_snapshots`, cập nhật bằng Inngest cron hằng ngày — tái dùng hạ tầng đã có.

### 4.3. Thư viện bài giảng

```
GV vào lớp → tab "Bài giảng" → tạo buổi học
                                    ↓
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
   Upload tài liệu            Đính link ngoài            Giao bộ từ vựng
   PDF/PPT/Word/ảnh/audio     YouTube/Drive              (mục 4.4)
        ↓                           ↓
   Supabase Storage           chỉ lưu URL
   {org_id}/{class_id}/{session_id}/{file}
        ↓
   HV mở lớp → danh sách buổi học → xem/tải qua signed URL (hạn 1h)
```

**Phạm vi GĐ1:** tài liệu (PDF/PPT/Word/ảnh) + audio + link ngoài.
**Hoãn sang GĐ2:** video upload trực tiếp — cần dịch vụ thứ ba (Cloudflare Stream/Mux) để transcode + streaming, là 3–4 tuần riêng. Link YouTube/Drive giải quyết 80% nhu cầu video với chi phí ~0.

Schema đã có `kind='video'` và `provider` để thêm video ở GĐ2 **không cần migration**.

**Bảo mật:**
- Bucket **private**, không public URL. Mọi lượt xem/tải qua signed URL hạn 1h do server phát sau khi kiểm quyền.
- Đường dẫn mang `org_id` ở đầu để Storage RLS so với JWT.

**Quota — chặn ở server, không ở client:**

```
1. Client xin upload  → POST /api/materials/upload-url
2. Server kiểm: vai trò GV? lớp của mình? org còn quota?
3. OK → phát signed upload URL (hạn ngắn)
4. Client upload trực tiếp lên Storage (không qua server → không nghẽn)
5. Client báo xong → POST /api/materials
   → server XÁC MINH dung lượng thật từ Storage API (không tin số client gửi)
   → cập nhật org_storage_usage
```

Giới hạn: tài liệu ≤ 50MB, audio ≤ 100MB. Quota gói: Basic 5GB, Pro 50GB, Enterprise thoả thuận.

**Xoá file phải hoàn quota.** Rủi ro: xoá hàng DB mà quên xoá blob = vẫn trả tiền cho file không ai dùng. Xử lý bằng Inngest job dọn rác đối chiếu Storage với DB.

### 4.4. Giao bộ từ vựng cho lớp

```
GV chọn nguồn ──┬── kho 7.5k từ sẵn có (lọc CEFR/topic)
                └── bộ từ riêng của org
        ↓
class_assignments(class_id, word_set, start_date, daily_count)
        ↓
Inngest job: nạp từ được giao vào hàng đợi ôn tập từng HV
        ↓
HV nhận qua email + thấy trong app  ← FSRS + email engine ĐÃ CÓ
```

**Không cần xây gì mới cho phần phân phối** — bộ từ được giao chỉ là nguồn nạp vào hàng đợi mà `select-word-for-email.js` đã xử lý. Lý do module này nằm ở GĐ1: chi phí thấp, giá trị cao.

---

## 5. API surface

Tất cả dùng anon client + RLS, kèm guard `requireOrgRole()`. Mọi dynamic route **phải `await params`** (Next 16 — đã xác minh trong `node_modules/next/dist/docs`).

| Endpoint | Method | Vai trò | Chức năng |
|---|---|---|---|
| `/api/orgs` | GET | mọi | Danh sách org của tôi (từ JWT) |
| `/api/orgs/[id]` | GET/PATCH | owner | Thông tin & cài đặt org |
| `/api/orgs/[id]/members` | GET/POST/DELETE | owner | Thành viên, mời qua email |
| `/api/classes` | GET/POST | owner, teacher | Danh sách & tạo lớp |
| `/api/classes/[id]` | GET/PATCH/DELETE | owner, teacher(mình) | Chi tiết lớp |
| `/api/classes/[id]/members` | GET/POST/DELETE | owner, teacher(mình) | HV trong lớp |
| `/api/classes/[id]/progress` | GET | owner, teacher(mình) | Số liệu dashboard |
| `/api/classes/[id]/sessions` | GET/POST | owner, teacher(mình) | Buổi học |
| `/api/classes/[id]/assignments` | GET/POST | owner, teacher(mình) | Giao bộ từ |
| `/api/materials/upload-url` | POST | owner, teacher | Xin signed upload URL |
| `/api/materials` | POST/DELETE | owner, teacher | Đăng ký/xoá tài liệu |
| `/api/materials/[id]/url` | GET | thành viên lớp | Signed URL để xem/tải |
| `/api/join` | POST | đã đăng nhập | Nhập mã lớp |
| `/api/invites/[token]` | GET/POST | công khai | Nhận lời mời email |

**Trang mới:** `/org` (dashboard), `/org/classes/[id]` (chi tiết lớp), `/join` (nhập mã).

**Sửa bắt buộc ở `middleware.js`:** chuyển `isPublicApi` từ khớp tiền tố lỏng sang **danh sách khớp chính xác**. Hiện `/api/translate*` khớp luôn `/api/translate-history` — với B2B thì một route lỡ thành public là sự cố dữ liệu.

**Xoá:** `/api/debug/select-word` (đang chạy production, dump toàn bộ lịch sử người gọi).

---

## 6. Nền tảng kỹ thuật (việc số 0)

Repo **không có schema đầy đủ**: đa số bảng lõi không có `CREATE TABLE`, 12 file vá chạy tay, không down-migration, không staging. Đủ cho B2C một người; **không chấp nhận được với B2B nhiều khách**.

Làm trước cả bảng `organizations`:

1. **Dump schema production** → `supabase/migrations/0000_baseline.sql`
2. **Chuyển sang Supabase CLI** (`supabase migration new`, `db push`) — có thứ tự, có version
3. **Dựng staging** — không thử migration multi-tenant trên dữ liệu khách hàng
4. **Thêm script `test`** + bộ test RLS

~1 tuần, không sinh tính năng nào, **ưu tiên cao nhất** — mọi việc sau đều nhân rủi ro nếu thiếu nền này.

### Thứ tự migration

```
0000_baseline              ← dump từ production
0001_orgs_and_memberships  ← organizations, memberships, RLS + JWT hook
0002_classes               ← classes, class_members, mã lớp
0003_progress_snapshots    ← bảng thống kê + Inngest cron
0004_lesson_library        ← class_sessions, lesson_materials, Storage RLS
0005_org_customization     ← org_settings, org_features, custom_fields
0006_legacy_rls            ← RLS cho bảng cũ (không đổi route)
```

Mỗi bước có test RLS đi kèm, deploy được độc lập.

### Bộ test RLS tối thiểu

Mỗi bảng mới phải có:

1. **Cô lập chéo org**: user org A query dữ liệu org B → 0 dòng
2. **Chặn theo vai trò**: student gọi API tạo lớp → 403
3. **Phạm vi giáo viên**: teacher lớp 1 xem HV lớp 2 → 0 dòng
4. **Rò rỉ qua ghi**: user org A `INSERT` với `org_id` của B → bị chặn
5. **Người nhiều tổ chức**: user thuộc A và B chỉ thấy đúng dữ liệu từng org

Chạy bằng script Node gọi Supabase với JWT từng vai trò (gần thực tế hơn pgTAP, và không phải học công cụ mới).

---

## 7. Giao diện

**Bắt buộc theo màu hiện tại** (yêu cầu của chủ dự án). Dùng đúng design token trong `globals.css`:

- Brand: `--electric` `#58CC02` (Duolingo green), `--electric-muted` `#58A700`
- Accent: `--duo-blue` `#1CB0F6`, `--duo-orange` `#FF9600`, `--duo-purple` `#CE82FF`, `--duo-yellow` `#FFC800`
- Semantic: `--error` `#FF4B4B`, `--grass-text`, `--sunshine-text`
- Nền/chữ: `--cream`, `--ink`, `--ink-soft`, `--card-bg`, `--card-border`
- Font: Plus Jakarta Sans (đã cấu hình)
- **Hỗ trợ cả dark + light** qua `[data-theme]` như hiện tại

Trạng thái dashboard map vào token có sẵn: 🟢 `--grass-text`, 🟡 `--sunshine-text`, 🔴 `--error`.

Dùng lại UI primitives: `Button`, `Card`, `Input`, `Modal`, `Dropdown`, `Badge`, `BackButton`.

---

## 8. Tiêu chí hoàn thành GĐ1

**Nền tảng**
- [ ] Baseline schema + Supabase CLI + staging
- [ ] `npm test` chạy được, có bộ test RLS
- [ ] Xoá/chặn `/api/debug/select-word`
- [ ] `middleware.js` khớp route chính xác

**Multi-tenant**
- [ ] Tạo org, mời qua email, join bằng mã lớp
- [ ] JWT chứa ngữ cảnh org; RLS chặn cứng chéo org
- [ ] 5 nhóm test cô lập đều pass
- [ ] User thuộc 2 org thấy đúng dữ liệu từng org

**Dashboard GV**
- [ ] Phân loại 3 nhóm đang học/chững lại/đã bỏ
- [ ] Snapshot cập nhật hằng ngày qua Inngest
- [ ] GV chỉ thấy lớp mình dạy; không đọc được nhật ký cá nhân HV

**Thư viện bài giảng**
- [ ] Tạo buổi học, upload PDF/PPT/Word/ảnh/audio, đính link ngoài
- [ ] Signed URL có hạn; bucket private
- [ ] Quota chặn server-side, xác minh dung lượng thật; xoá file hoàn quota

**Khả biến**
- [ ] `org_settings`, `org_features`, `custom_fields` hoạt động
- [ ] Trung tâm mới = một hàng cấu hình, không sửa code

---

## 9. KHÔNG làm ở GĐ1

Nói rõ để tránh phình phạm vi:

| Hoãn | Giai đoạn |
|---|---|
| Bài tập/homework + chấm | GĐ2 |
| Quiz/game | GĐ2 |
| Video upload trực tiếp | GĐ2 |
| Thanh toán tự động + hoá đơn | GĐ3 |
| Báo cáo phụ huynh | GĐ3 |
| Quản lý học phí/công nợ | GĐ4 |
| Chấm bài nói có audio | GĐ4 |

Tất cả đã có chỗ trong mô hình dữ liệu.

**Riêng thanh toán:** chủ dự án chọn "cổng thanh toán", nhưng với 1–3 khách đầu tiên khuyến nghị **thu ngoài hệ thống** (chuyển khoản + bật gói bằng tay). Tích hợp cổng là 3–4 tuần mà chưa mang thêm doanh thu — làm ở GĐ3 khi đã có nhiều khách.

---

## 10. Ước lượng & kinh tế

**GĐ1: 6–8 tuần** (bao gồm ~1 tuần nền tảng + ~2 tuần thư viện bài giảng).

Chi phí biến đổi cần theo dõi — **lưu trữ là chi phí lớn nhất, vượt cả AI**:

| Khoản | Ghi chú |
|---|---|
| Supabase (DB + Storage + băng thông) | Tăng theo GB lưu và GB tải về → **phải có quota** |
| Groq (Alex, từ điển) | Đã cache mạnh; thấp |
| Google TTS | Đã cache token + audio; thấp |
| Vercel | Thấp ở quy mô này |

Quota theo gói vừa kiểm soát chi phí vừa là **đòn bẩy bán gói cao hơn** — một cơ chế, hai mục đích.
