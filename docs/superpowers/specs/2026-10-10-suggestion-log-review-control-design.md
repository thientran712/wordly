# Suggestion Log & Review Control — Design Spec

Ngày: 2026-10-10
Trạng thái: Đã duyệt từng phần trong chat, chờ duyệt văn bản cuối

## 1. Bối cảnh & vấn đề

Hệ thống đang gửi gợi ý từ vựng qua 2 kênh:

- **Email** (Inngest job `functions.js`): chọn từ qua
  `select-word-for-email.js`, gửi mail, ghi `email_log`.
- **iOS lock-screen widget**: app host tính batch từ (cá nhân + "bank"
  dùng chung) rồi lưu vào App Group `UserDefaults`; widget extension chỉ
  đọc, không gọi server.

Khi người dùng **chưa lưu từ nào**, cả hai kênh đã tự rơi về việc gợi ý
từ "bank" (pool từ điển chung ~7.5k từ, lọc theo CEFR level) — hành vi
này **đã đúng**, không cần sửa.

Hai vấn đề cần giải quyết:

1. **Không có nơi xem lại** những từ đã được gợi ý qua email/widget, và
   không có cách nào để người dùng tra nghĩa hoặc điều khiển lịch ôn lại
   của từ đó ngay từ danh sách này.
2. **Email hiện tại tự động coi "đã gửi" = "đã học tốt"**: sau khi gửi,
   `functions.js` Step 6 luôn set `state: "review"`, tăng
   `review_count`, và đẩy `due_at` theo bảng `EMAIL_INTERVALS = [1, 3, 7,
   14, 30, 90]` — bất kể người dùng có mở email hay không. Điều tra cho
   thấy:
   - `web/src/lib/learning/fsrs.js` (bọc thư viện `ts-fsrs`) **tồn tại
     nhưng không được gọi ở đâu trong toàn repo** — code chết.
   - Widget hoàn toàn read-only, không viết `due_at`/`state` ở đâu cả.
   - Không có "unified review queue" API nào tồn tại dù có file migration
     tên vậy.

Quyết định đã duyệt: **không** nối `ts-fsrs` thật vào (đó là việc kiến
trúc lớn hơn, tách riêng nếu cần sau). Thay vào đó mở rộng tối thiểu trên
hạ tầng đang chạy (Supabase + Inngest + Vercel), dùng bảng hệ số tự chế
tương tự `EMAIL_INTERVALS` đang có.

## 2. Mục tiêu

- Người dùng xem được lịch sử từ đã được gợi ý (qua email hoặc widget),
  gộp vào trang Lịch sử/Sổ tay hiện có (`TranslateHistory.js`), không
  tạo trang mới.
- Click vào 1 từ trong danh sách đó → popup tra nghĩa bằng AI (dùng lại
  logic từ điển đang có trong `InlineTranslate.js`, không xây mới).
- Trong popup, có 3 nút **Dễ / Khó / Bỏ qua lâu hơn** để người dùng tự
  điều khiển `due_at` của từ đó.
- Gửi email không còn tự động tính là "đã học tốt" — chỉ ghi nhận đã
  *gợi ý*; lịch ôn chỉ thay đổi khi người dùng chủ động tương tác.

## 3. Phi mục tiêu

- Không nối `ts-fsrs`/FSRS thuật toán thật vào bất kỳ luồng nào.
- Không sửa thuật toán chọn từ hiện tại cho email/widget (đã đúng).
- Không đổi hạ tầng (vẫn Supabase/Inngest/Vercel — VPS sắp tới là việc
  hạ tầng riêng, không ảnh hưởng thiết kế này).
- Không thêm tracking "đã hiện trên lock-screen" ở mức widget extension
  (widget vẫn hoàn toàn read-only); log ghi theo batch app host tính,
  không theo mỗi lần render lock-screen.

## 4. Thiết kế

### 4.1 Dữ liệu

Bảng mới `suggestion_log` — nguồn chung cho "đã gợi ý gì, qua kênh nào,
khi nào", thay cho việc chỉ dựa vào `email_log.entry_ids` như hiện tại
(giữ `email_log` nguyên vẹn để track trạng thái gửi mail; nó không phải
nguồn cho tính năng xem lại này).

```sql
CREATE TABLE suggestion_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('email', 'widget')),
  entry_type text not null check (entry_type in ('translate_history', 'journal_entries', 'bank')),
  entry_id uuid,        -- id trong translate_history/journal_entries; null nếu entry_type='bank'
  bank_word_id uuid references words(id) on delete set null,  -- chỉ set khi entry_type='bank'
  shown_at timestamptz not null default now()
);

CREATE INDEX suggestion_log_user_idx ON suggestion_log (user_id, shown_at desc);

ALTER TABLE suggestion_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own suggestion log"
  ON suggestion_log FOR SELECT USING (auth.uid() = user_id);
-- Insert chỉ qua service role (API/job), không cho client insert trực tiếp.
```

Ràng buộc: đúng một trong `entry_id` / `bank_word_id` được set, tương
ứng `entry_type`. (Có thể thêm CHECK constraint khi viết migration thật
nếu Postgres cho phép biểu diễn gọn — nếu phức tạp, enforce ở tầng
application là đủ, ghi rõ trong code comment.)

### 4.2 API endpoints

| Endpoint | Method | Mô tả |
|---|---|---|
| `/api/widget/log-shown` | POST | App iOS gọi khi tính lại batch widget (không phải mỗi lần render lock-screen). Body: `{ items: [{ entry_type, entry_id?, bank_word_id? }] }`. Auth Bearer hiện có. Insert hàng loạt vào `suggestion_log` với `source: 'widget'`. |
| `/api/suggestion-log` | GET | Phân trang danh sách đã gợi ý cho user hiện tại, join `translate_history`/`journal_entries`/`words` để lấy từ + nghĩa, kèm `due_at`/`state`/`review_count` hiện tại. |
| `/api/learning/schedule` | PATCH | Body: `{ entry_type, entry_id, rating: 'easy'\|'hard'\|'skip_longer' }`. Tính `due_at` mới theo bảng hệ số (4.4), cập nhật `state`/`review_count`/`last_reviewed_at` trên `translate_history` hoặc `journal_entries` tuỳ `entry_type`. |

Thay đổi hành vi hiện có: `web/src/inngest/functions.js` Step
"advance-schedule" — **bỏ** việc tự động update `due_at`/`state`/
`review_count` sau khi gửi email. Thay bằng: insert vào `suggestion_log`
(`source: 'email'`) cho mỗi từ đã gửi. Lịch ôn chỉ đổi qua
`PATCH /api/learning/schedule`.

### 4.3 UI — trang Lịch sử/Sổ tay

- Thêm tab/filter **"Đã gợi ý"** trong `web/src/components/home/TranslateHistory.js`,
  cạnh các tab hiện có.
- Mỗi dòng: từ, icon nguồn (📧 email / 📱 widget), thời điểm gợi ý gần
  nhất, badge trạng thái review (Mới / Đang ôn / Sắp đến hạn).
- Click vào từ → popup tái dùng component/logic tra từ điển AI đang có
  trong `InlineTranslate.js` ("Hỏi AI").
- Trong popup: 3 nút **Dễ / Khó / Bỏ qua lâu hơn** → gọi
  `PATCH /api/learning/schedule`, hiện toast xác nhận ("Sẽ nhắc lại sau
  X ngày") sau khi thành công.

### 4.4 Bảng hệ số điều chỉnh `due_at`

Dùng lại nấc `EMAIL_INTERVALS = [1, 3, 7, 14, 30, 90]` (ngày) đã có
trong `select-word-for-email.js` làm thang chung.

| Rating | Hiệu ứng |
|---|---|
| Dễ | nhảy lên nấc kế tiếp trong `EMAIL_INTERVALS` (tính theo `review_count` hiện tại), `due_at = now + interval`, `review_count += 1`, `state: "review"` |
| Khó | giữ nấc hiện tại hoặc lùi 1 nấc (tối thiểu nấc đầu, 1 ngày), `due_at` cập nhật theo nấc đó, `review_count` không đổi |
| Bỏ qua lâu hơn | set thẳng `due_at = now + 90 ngày` (nấc cuối), `review_count` không đổi, `state` không đổi |

Hệ số này áp dụng cho cả `translate_history` và `journal_entries` (cùng
shape cột theo `unified-review-queue.sql`).

### 4.5 iOS — ghi log khi widget đồng bộ

- Trong `WidgetSync.refresh()` / `refreshBank()`
  (`AppGroupStorage.swift`): sau khi lưu batch mới vào App Group, gọi
  `POST /api/widget/log-shown` với batch vừa tính (cá nhân + bank),
  fire-and-forget — lỗi không chặn UI, không retry.
- Widget extension (`WordlyWidget.swift`) không đổi gì — vẫn hoàn toàn
  đọc từ App Group, không tự gọi server.

## 5. Phạm vi không đổi / rủi ro đã biết

- `fsrs.js`/`ts-fsrs` tiếp tục là code chết sau thay đổi này — không xoá
  (có thể dọn ở việc khác), không dùng.
- `quiz/route.js` wrong-answer requeue (+1 ngày cố định khi trả lời sai)
  giữ nguyên, không trong phạm vi việc này.
- Bảng `user_progress` (đọc ở `words/by-topic/route.js`, không có
  migration/nơi viết nào) ngoài phạm vi — không đụng tới.
- Đổi hành vi email Step 6 là thay đổi hành vi production thật (ảnh
  hưởng lịch ôn của user đang dùng) — cần chạy migration + deploy cẩn
  thận, không chạy migration lên staging/production khi chưa được đồng
  ý riêng (theo quy tắc tuyệt đối #2 trong CLAUDE.md).

## 6. Kiểm chứng

- Unit test cho hàm tính hệ số `due_at` theo rating (tách logic thuần
  vào `web/src/lib/learning/`, test không cần DB, theo quy ước TDD của
  repo).
- RLS test cho `suggestion_log` (cô lập giữa user) theo
  `web/tests/rls/`.
- Test cho `/api/learning/schedule` dùng dữ liệu giả lập, không cần
  Postgres thật nếu logic tính toán được tách thuần.
- Việc gửi email thật / widget thật trên lock-screen vẫn chưa verify
  được trong môi trường dev (ghi nhận là giới hạn đã biết, giống
  PROGRESS.md đã từng ghi).
