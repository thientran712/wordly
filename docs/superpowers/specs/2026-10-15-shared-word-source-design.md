# Nguồn từ chung, Từ ghim, trang Widget gộp, Nhắc ôn tự lưu, Giới thiệu tính năng

Chủ dự án chốt từng phần trong phiên 15/10/2026. Liên quan:
`2026-10-13-push-notification-design.md`, `2026-10-15-terms-consent-design.md`,
`web/src/lib/push/select-push-word.js` (PR #40). Thẻ 🔥 chuỗi ngày học đã bỏ (commit `426646d`).

## 0. Vấn đề đang có

1. Widget (khoá + chính) dùng "Nguồn từ" lưu trên máy; push trên server chỉ lấy từ đã lưu → hai bên lệch.
2. **Lỗi production:** app không báo widget hiện từ nào lúc nào — mỗi khi danh sách từ đổi, app log CẢ pool là "vừa hiện" cùng một lúc (`AppGroupStorage.swift` → `/api/widget/log-shown`). Push chọn "lâu chưa hiện nhất" nên bị reset về nhóm từ lưu sớm nhất mỗi lần người dùng lưu từ mới.
3. Push có thể gửi đúng từ đang trên widget / vừa hiện.
4. Cài đặt widget màn hình chính nằm sâu trong trang màn hình khoá, không có hướng dẫn; người mới không biết app có widget.

## 1. Sửa nhanh lỗi xoay vòng push (server, không migration) — làm trước

- `pickWord` dựng bản đồ "lần hiện gần nhất" **chỉ từ dòng `suggestion_log` source = `push`**. Log widget (đang ghi cả pool một lúc) không còn ảnh hưởng thứ tự.
- Test: lưu từ mới (log widget cả pool) xong, push vẫn đi tiếp từ chưa push, không quay về từ cũ nhất.
- Deploy production: chờ chủ dự án đồng ý (quy tắc dự án).

## 2. Nguồn từ chung

### 2.1 Cài đặt

| Mục | Mặc định | Ghi chú |
|---|---|---|
| Từ đã lưu | Bật | |
| Trộn từ mới trong kho | Bật | 1 từ mới sau mỗi 2 từ của bạn, theo trình độ. Luôn hiện ghi chú: *"Nếu bạn không chọn 'Từ đã lưu' (hoặc chưa lưu từ nào), Wordly luôn dùng từ mới trong kho."* |
| Từ ghim | Trống | Chọn trong **danh sách từ đã lưu**, tối đa 30 |
| Chỉ dùng từ ghim | Tắt | |

- **Bỏ "Từ dịch gần đây".** Không hiện số lượng từ ở bất kỳ đâu trong phần nguồn từ (trừ giới hạn ghim "x/30").
- Bỏ tick "Từ đã lưu" → "Trộn từ mới" tự bật và khoá (không thể tắt cả hai).
- Áp dụng cho widget màn hình khoá, widget màn hình chính và thông báo nhắc ôn.

### 2.2 Luật dựng danh sách xoay vòng (pool) — giống hệt nhau ở Swift (widget) và JS (push)

1. `pinnedOnly` bật **và** còn ít nhất 1 từ ghim hợp lệ → pool = chỉ từ ghim.
2. Ngược lại:
   - Từ của bạn = từ đã lưu (nếu bật) ∪ từ ghim hợp lệ.
   - Từ kho = bật trộn **hoặc** từ của bạn rỗng → lô kho theo trình độ, bỏ từ trùng chữ với từ của bạn.
   - Từ ghim xuất hiện **2 lần mỗi vòng**, từ khác 1 lần, xen 2 từ của bạn : 1 từ kho (như hiện tại), chỗ nối hai vòng không lặp liền.
3. "Từ ghim hợp lệ" = id còn trong danh sách đã lưu (chưa xoá mềm, còn `is_saved`). Id không hợp lệ được **bỏ qua khi đọc**, không xoá khỏi mảng → hoàn tác xoá thì từ tự ghim lại.
4. Bộ dữ liệu mẫu chung (JSON) cho cả hai bên; test Swift và JS cùng đọc, cùng ra một pool.

### 2.3 Đồng bộ

- Nguồn sự thật: bảng server `word_source_settings`. App giữ bản sao trong App Group cho widget.
- Sửa trên app → lưu máy ngay (widget đổi ngay) → gửi `PUT /api/word-source` (thử lại khi mở app nếu lỗi mạng).
- Mở app → `GET /api/word-source`; bản server mới hơn (`updated_at`) thì ghi đè bản máy (người dùng nhiều máy).
- Chưa có dòng trên server → mặc định (đã lưu ✓, trộn ✓, không ghim).
- App cũ (1.0.0, 1.0.1 build 18) không gửi gì → server dùng mặc định; widget của app cũ vẫn chạy theo cài đặt máy.
- **Chuyển cài đặt cũ trên máy (một lần):** `source = custom` → ghim = `selectedIds` ∩ từ đã lưu (tối đa 30, giữ thứ tự), `pinnedOnly = true`; `saved`/`recent`/`unsaved` → đã lưu ✓; `includeBank` giữ nguyên. Gửi lên server ngay sau khi chuyển.

### 2.4 Edge case

| Tình huống | Xử lý |
|---|---|
| Ghim tới 30 rồi bấm ghim thêm | Không ghim, báo "Tối đa 30 từ ghim" |
| Bỏ lưu / xoá từ đang ghim | Từ tự ra khỏi pool; hoàn tác thì ghim lại |
| `pinnedOnly` bật nhưng mọi từ ghim đã xoá | Như tắt, trang Nguồn từ hiện "Chưa có từ ghim nào" |
| Lô kho tải lỗi / trình độ không có từ | Widget dùng từ của bạn; không có gì → màn trống hiện tại; push theo §4 |
| Đăng xuất / đổi tài khoản trên cùng máy | Xoá bản sao nguồn từ trên máy cùng danh sách từ (như hiện tại) |

## 3. Lịch widget lên server

- Thay `/api/widget/log-shown` (log cả pool) bằng `PUT /api/widget/schedule`: app gửi **lịch 48 giờ tới** (giờ UTC → id từ / id từ kho) mỗi khi tính lại widget: mở app, lưu/xoá từ, đổi nguồn từ hoặc nhịp, lô kho mới. Gộp các lần gọi trong 5 giây.
- Server: xoá dòng tương lai của người đó rồi chèn lịch mới; giữ dòng đã qua tới 3 ngày (push cần "đã hiện 6–48 giờ trước"); cron dọn dòng cũ hơn 3 ngày.
- **Chưa thêm widget nào** (`WidgetCenter.getCurrentConfigurations` không có widget Wordly) → không gửi lịch, xoá dòng tương lai.
- Ngoài khung giờ hiện widget → không có dòng (màn nghỉ).
- Nhiều máy: lịch gửi sau cùng thắng (chấp nhận được).
- Quá 48 giờ không mở app → hết dòng tương lai → push bỏ qua thông tin widget.
- Tab "Đã nhắc" giữ nguyên nguồn `suggestion_log`: push ghi khi gửi thật; widget ghi theo lịch đã qua (cron chép dòng lịch đã qua sang `suggestion_log` source=widget, không trùng).

## 4. Push chọn từ

Pool = §2.2 (cùng nguồn với widget). Mỗi khung giờ:

| Bước | Chọn |
|---|---|
| Loại | Từ đang hiện trên widget (theo lịch), hoặc hiện trong 2 giờ qua |
| 1 | Từ widget đã hiện 6–48 giờ trước, chưa push lại từ lúc đó (ưu tiên từ ghim) |
| 2 | Từ ghim chưa push trong 24 giờ, rồi từ lâu chưa push nhất (theo lịch sử **push**) |
| 3 | Mọi từ của người dùng bị loại + đang bật trộn kho → một từ kho chưa push gần đây |
| 4 | Vẫn không có → từ của người dùng, chấp nhận trùng widget |
| 5 | Chưa có từ nào của người dùng → từ kho (kể cả khi tắt trộn — đã bật nhắc ôn) |
| Bỏ lượt | Kho cũng không có (lỗi) → `skipped` |

- Kiểu câu (Đố giấu nghĩa / Khoe hiện nghĩa) **giữ nguyên**: xen kẽ theo ngày (chủ dự án chốt).
- Nhiều khung giờ cùng ngày: mỗi lần gửi ghi `suggestion_log` ngay → lần sau tự tránh.
- Không có lịch widget (chưa thêm widget / app cũ / quá 48 giờ) → bỏ bước Loại và bước 1.

## 5. Giao diện cài đặt

### 5.1 Cá nhân — mục "Học & nhắc" (3 dòng, tóm tắt bằng chữ, không số)

- 📚 Nguồn từ — "Đã lưu + từ mới", "Đã lưu + từ mới · có từ ghim", "Chỉ từ ghim", "Từ mới trong kho".
- 🔔 Thông báo nhắc ôn — "Tắt" / "12:00, 20:00 · mỗi ngày" (như tóm tắt hiện tại).
- 🧩 Widget — "Màn hình khoá & màn hình chính".

### 5.2 Trang "Nguồn từ"

Hai khối thẻ tách rời: **Nguồn từ** (2 ô tick + ghi chú kho) và **Từ ghim** (dòng "Từ ghim · x/30 ›", công tắc "Chỉ dùng từ ghim" + chú thích). Chân trang: "Dùng chung cho widget màn hình khoá, màn hình chính và thông báo nhắc ôn."
Trang "Từ ghim": ô tìm kiếm, danh sách từ đã lưu (từ ghim lên đầu), mỗi dòng nút 📌 ghim/bỏ ghim, đầu trang "Đã ghim x/30". Chưa lưu từ nào → trạng thái trống "Lưu từ khi dịch để ghim".

### 5.3 Ghim nhanh

Nút 📌 trong popup chi tiết từ đã lưu (tab Từ vựng, mở từ widget/push). Ghim/bỏ ghim ngay, toast "Đã ghim" / "Đã bỏ ghim"; đủ 30 → toast giới hạn. Từ kho (chưa lưu) không có nút ghim.

### 5.4 Trang "Thông báo nhắc ôn" — tự lưu

Thứ tự: thẻ trạng thái (công tắc + "Lần tới: 20:00 hôm nay") → ▸ Cách hoạt động (thu gọn) → Giờ gửi (danh sách + "Thêm giờ") → Ngày gửi [Mỗi ngày | Thứ 2–6 | Tuỳ chọn] (+ hàng chip ngày khi Tuỳ chọn) → dòng "Nguồn từ ›".
- Bỏ nút "Lưu cài đặt": mỗi thay đổi lưu sau 0,8 giây không chạm, toast "Đã lưu"; lỗi → toast lỗi + trả về giá trị trước.
- Bỏ emoji trong ô tần suất. Giữ luật giờ (mốc :00/:30, không trùng, tối đa 5).

### 5.5 Trang "Widget" (gộp, cách B)

- Đầu trang: nút chuyển `[Màn hình khoá | Màn hình chính]` (nhớ lựa chọn lần trước).
- Các khối là **thẻ tách rời, có tiêu đề rõ, khoảng cách lớn giữa các nhóm** để không thành một trang dài liền:
  1. **Xem trước** theo loại (khoá: [Đầy đủ | Gọn, chữ to]; chính: [Nhỏ | Vừa]).
  2. **▸ Hướng dẫn sử dụng** (thu gọn, theo loại).
  3. **Riêng loại đang chọn** — chính: Theme (dropdown nhóm như hiện tại + lưới), Ảnh của bạn, ▸ Tuỳ chỉnh thêm (màu nền, chữ). Khoá: không thêm gì ngoài kiểu ở phần xem trước.
  4. **Áp dụng cho cả 2 widget** (nhóm có nền/nhãn riêng): Chữ (hiện nghĩa, căn chữ) · Đổi từ (mỗi [15p|30p|1g|2g], khung giờ) · dòng "Nguồn từ ›".
  5. **Cách thêm widget** (theo loại): 4 bước, mỗi bước 1 hình minh hoạ tự vẽ.
- Bỏ nút "Cập nhật từ mới nhất" (app tự đồng bộ khi mở; kéo xuống để làm mới trong trang Nguồn từ).

## 6. Giới thiệu tính năng

### 6.1 Thứ tự lần mở đầu tiên

Đăng nhập → (chỉ khi Điều khoản lên bản mới: màn cập nhật) → **Màn chào** (tài khoản mới) hoặc **"Có gì mới"** (tài khoản cũ) → tab Dịch (thẻ "Bắt đầu với Wordly"). Không bao giờ hiện hai tấm trong cùng một lần mở ngoài thứ tự này.

### 6.2 Màn chào 3 trang (tài khoản mới)

① Dịch & lưu từ · ② Từ hiện ngay trên máy (hình widget khoá + chính) · ③ Nhắc ôn đúng giờ. "Tiếp" / "Bắt đầu", luôn có "Bỏ qua". Không xin quyền gì.
- "Tài khoản mới" = chưa có từ đã lưu **và** chưa thấy màn chào trên máy này. Cờ lưu trên máy.
- Cài lại app với tài khoản đã có từ → coi là tài khoản cũ (xem 6.3).

### 6.3 "Có gì mới ở 1.0.1" (tài khoản cũ)

Một tấm: theme ảnh cho widget, từ ghim, nhắc ôn thông minh hơn, trang Widget mới. Một lần mỗi phiên bản có nội dung "Có gì mới" (cờ theo phiên bản trên máy). Tài khoản mới vừa xem màn chào thì không xem tấm này.

### 6.4 Thẻ "Bắt đầu với Wordly" (đầu tab Dịch)

| Mục | Tự tick khi |
|---|---|
| Lưu từ đầu tiên | Có ≥ 1 từ đã lưu |
| Thêm widget màn hình khoá | `WidgetCenter` có widget Wordly cỡ màn hình khoá |
| Thêm widget màn hình chính | `WidgetCenter` có widget Wordly cỡ nhỏ/vừa |
| Bật nhắc ôn | Nhắc ôn bật + iOS cho phép thông báo |

- Chạm mục → mở đúng chỗ (trang Widget đúng loại, trang Nhắc ôn); "Lưu từ đầu tiên" → đặt con trỏ vào ô dịch.
- Nút ✕ ẩn vĩnh viễn trên máy này. Đủ 4 mục → hiện "Xong hết rồi 🎉" một lần rồi tự ẩn.
- Kiểm tra lại khi app quay về foreground (người dùng vừa thêm widget ngoài app).
- Không gửi gì lên server (không phải khai báo App Privacy).

### 6.5 Gợi ý đúng lúc (tối đa 1 gợi ý mỗi ngày, mỗi gợi ý 1 lần)

| Lúc | Gợi ý |
|---|---|
| Lưu từ thứ 1 | (Đã có) mời bật nhắc ôn — chỉ khi nhắc ôn chưa bật |
| Lưu từ thứ 3, chưa có widget nào, khác ngày với lời mời nhắc ôn | Tấm nhỏ: widget khoá có từ vừa lưu — [Xem cách thêm] (mở trang Widget, tab Khoá, cuộn tới "Cách thêm") / [Để sau] |
| Lần đầu mở popup chi tiết từ đã lưu | TipKit chỉ vào 📌: "Ghim để gặp từ này nhiều hơn" |
| Lần đầu vào tab Từ vựng khi đã có từ được nhắc | TipKit ở mục "Đã nhắc" |

Không gợi ý trong lần mở có màn chào / "Có gì mới". Màn chào bỏ qua giữa chừng vẫn tính là đã xem.

## 7. Dữ liệu (migration — chạy production phải xin phép)

- `word_source_settings` (user_id PK → auth.users ON DELETE CASCADE, include_saved bool, include_bank bool, pinned_ids uuid[] (≤ 30, CHECK), pinned_only bool, updated_at) — RLS `auth.uid() = user_id` cho select/insert/update.
- `widget_schedule` (user_id → auth.users ON DELETE CASCADE, shown_at timestamptz, entry_id uuid NULL, bank_word_id bigint NULL, CHECK đúng một id) + index (user_id, shown_at) — RLS theo chủ; cron đọc bằng service role.
- API mới: `GET/PUT /api/word-source`, `PUT /api/widget/schedule` (client người dùng, RLS; validate ≤ 200 dòng, giờ trong [now−1h, now+49h]). `/api/widget/log-shown` giữ cho app cũ.

## 8. Kiểm chứng

- Web: unit (luật pool theo bộ mẫu chung, luật chọn push từng bước + edge case, validate API), RLS cho 2 bảng mới (Supabase local), `next build`, eslint.
- iOS: unit (pool theo bộ mẫu chung, chuyển cài đặt cũ, đồng bộ mới hơn thắng, điều kiện thẻ Bắt đầu / gợi ý / màn chào / Có gì mới), UI (trang Nguồn từ, Từ ghim + giới hạn 30, ghim nhanh, trang Widget 2 tab + hướng dẫn + cách thêm, Nhắc ôn tự lưu, màn chào, thẻ Bắt đầu), ảnh chụp từng màn.
- Báo chủ dự án trước khi chạy migration production, deploy web và build 19.

## Ngoài phạm vi

Mỗi widget một nguồn riêng; push theo nhịp "đổi từ mỗi X phút"; đo lường hành vi (analytics).
