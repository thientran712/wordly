# Wordly Pro — giới hạn bản miễn phí, thanh toán, paywall

Chủ dự án chốt 15–16/10/2026 sau research giá (RevenueCat/Adapty 2026, giá đối thủ App Store VN).
Mô hình **freemium**: vòng thói quen (lưu–widget–nhắc ôn–quiz) miễn phí; Pro mở rộng giới hạn và trang trí.
Không có Alex (luyện nói) ở giai đoạn này.

## 1. Gói và giới hạn

| Tính năng | Miễn phí | Pro |
|---|---|---|
| Lưu từ | **tối đa 30 từ** | không giới hạn |
| Dịch từ (≤ 3 chữ, DeepL) | thoải mái | thoải mái |
| Dịch câu + ảnh + giọng nói | **5 lượt/ngày, tính chung** | thoải mái, trần chống lạm dụng 200 câu · 30 ảnh · 50 giọng nói / ngày |
| Tra từ (thẻ từ điển chi tiết) | **5 từ MỚI/ngày** — từ đã tra/đã lưu/mở từ widget, thông báo, kho từ mới: mở lại thoải mái | thoải mái |
| Theme widget | **5 theme màu**: Wordly, Nửa đêm, Mực đen, Giấy trắng, Đại dương | 10 theme màu + 30 theme ảnh + ảnh nền riêng + tự chỉnh màu ("Tuỳ chỉnh thêm") |
| Ghim từ | thoải mái (tối đa 30, như hiện tại) | như miễn phí |
| Khung giờ nhắc ôn | **1** | **tối đa 10** |
| Widget, quiz, kho từ mới, nhắc ôn | thoải mái | thoải mái |

**Giá** (StoreKit, nhóm thuê bao "Wordly Pro"): **29.000đ/tháng**, **249.000đ/năm** (gói chọn sẵn). **Không có dùng thử** (chủ dự án chốt 16/10). Hiển thị giá lấy từ StoreKit (`displayPrice`), không viết cứng.

## 2. Khoe tính năng Pro (chủ dự án yêu cầu)

Tính năng Pro **luôn hiện**, không ẩn:
- Theme Pro trong lưới có huy hiệu 🔒 "Pro"; chạm → **xem thử ngay trên khung xem trước** (không lưu); nút "Dùng theme này" → paywall.
- "Ảnh của bạn", "Tuỳ chỉnh thêm": hiện đủ, chạm → xem thử / paywall.
- Bộ đếm luôn thấy: "Còn 3/5 lượt dịch câu, ảnh, giọng nói hôm nay", "Đã lưu 24/30 từ", "Còn 2 lượt tra từ mới hôm nay".
- Hết lượt / đủ 30 từ / thêm khung giờ thứ 2 → paywall đúng ngữ cảnh, nói rõ đang chặn gì.
- Cá nhân có dòng "Wordly Pro" (miễn phí: "Nâng cấp" · Pro: "Đang dùng Pro đến dd/mm").

## 3. Trường hợp đặc biệt

**Lưu từ**
- Từ xoá mềm (còn hoàn tác) không tính; khôi phục khi đã đủ 30 → paywall.
- Đủ 30 → nút Lưu mở paywall kèm "Bỏ lưu bớt từ cũ" (không bao giờ xoá dữ liệu).
- Người đã có > 30 từ (người dùng cũ / hết Pro): giữ nguyên tất cả, widget/nhắc ôn dùng đủ; chỉ không lưu thêm.

**Dịch câu/ảnh/giọng nói**
- Chỉ trừ lượt khi thành công; lỗi không trừ. Mở lại bản dịch từ lịch sử không gọi AI → không tính.
- Lượt về 0 lúc 0:00 giờ Việt Nam (Asia/Ho_Chi_Minh).

**Tra từ**
- Tách "dịch từ" (nghĩa ngắn, miễn phí) và "thẻ từ điển chi tiết" (tính lượt). Hết lượt: vẫn hiện nghĩa ngắn, thẻ chi tiết mờ + "Mở khoá với Pro".
- Không tính: từ đã lưu, từ đã tra trước đó (bảng `dictionary_lookups`), từ mở từ widget/thông báo/kho từ mới, tra ngầm cho widget (phiên âm, nghĩa từ kho — app gửi cờ `purpose=widget`, server chỉ trả từ cache/không tính lượt).

**Theme**
- Theme không chặn được ở server (lưu trên máy) → chặn ở app, chấp nhận.
- Đang dùng theme Pro (người dùng build 19/20, hoặc hết Pro): **giữ nguyên**, chỉ không đổi sang theme Pro khác.

**Nhắc ôn**
- Server chặn khung thứ 2 trở đi khi miễn phí (thêm/bật). Hết Pro mà còn nhiều khung: giữ dữ liệu, cron chỉ gửi khung sớm nhất trong ngày; app hiện các khung còn lại 🔒.

**Hết Pro / huỷ / hoàn tiền**: quay về giới hạn miễn phí, không mất dữ liệu. Thời gian ân hạn thanh toán (billing grace period) → vẫn Pro trong thời gian ân hạn.

**Bắt buộc cập nhật** (chủ dự án chốt 16/10):
- Từ build có paywall, app gửi header `X-Wordly-Build` mọi request và hỏi `GET /api/app-config` → `{ min_build }`. Build < `min_build` → màn "Cập nhật Wordly" chặn cả app, nút mở trang App Store của Wordly (Apple cho phép, dẫn đúng App Store).
- Bản đã phát hành không có code này (1.0.0 trên store, build 19/20 TestFlight): khi `BILLING_ENFORCE` bật, request **không có header / build cũ** tới tính năng có giới hạn (lưu từ, dịch câu/ảnh/giọng nói, tra từ, thêm khung giờ) nhận **426** + `{ error: "Phiên bản Wordly này đã cũ, hãy cập nhật trên App Store để tiếp tục." }` (app cũ hiện câu lỗi của server). Widget, nhắc ôn, quiz, đọc dữ liệu vẫn chạy.
- `min_build` đặt bằng env `APP_MIN_BUILD` trên server — nâng lên khi bản có paywall đã được Apple duyệt và phát hành.

## 4. Kiến trúc

**Server là nguồn sự thật cho quyền Pro và lượt dùng.**
- `entitlements` (user_id PK, source `app_store`|`gift`, product_id, original_transaction_id UNIQUE, expires_at, in_grace bool, environment, updated_at) — RLS: người dùng chỉ đọc của mình; ghi bằng service role (webhook / API xác thực).
- `usage_daily` (user_id, day date, kind `advanced_translate`|`dictionary`, count) + `dictionary_lookups` (user_id, word_key, first_at) — hàm Postgres `consume_quota(kind, limit, word_key?)` trừ lượt nguyên tử, trả `{allowed, remaining}`; tra lại từ đã có → không trừ.
- Quyền Pro: StoreKit 2 mua với `appAccountToken = user_id`; app gửi `signedTransactionInfo` lên `POST /api/billing/sync`; server **xác thực chữ ký JWS của Apple** (thư viện chính thức `@apple/app-store-server-library`) rồi ghi `entitlements`. Thêm **App Store Server Notifications V2** (`POST /api/billing/notifications`, công khai, xác thực JWS) cho gia hạn/huỷ/hoàn tiền/ân hạn.
- Công tắc `BILLING_ENFORCE` (env) — tắt thì không chặn gì (để deploy server trước, bật khi bản app có paywall đã lên store).

**App**
- `ProStore` (StoreKit 2): tải sản phẩm, mua, khôi phục, nghe `Transaction.updates`, đồng bộ server; trạng thái Pro lấy từ server (`GET /api/billing/status` + giới hạn còn lại).
- Màn paywall: lợi ích Pro (không có Alex), 2 gói (năm chọn sẵn + dùng thử 7 ngày; tháng), **giá gia hạn đầy đủ là con số nổi bật nhất**, ghi rõ dùng thử bao lâu và hết dùng thử bị trừ bao nhiêu, tự gia hạn và cách huỷ, nút **Khôi phục giao dịch**, link **Điều khoản** + **Chính sách** (App Store 3.1.2, Schedule 2, 5.6 — không hối thúc, không mập mờ, không dẫn ra web mua).
- Chỗ hiện paywall: đúng ngữ cảnh (§2) + một lần sau khi lưu từ đầu tiên (có nút đóng) + nhắc lại ngày 7 cho người còn dùng (một lần).
- Không dùng thử nên paywall không có phần dùng thử; gói năm hiện thêm "chỉ ~20.750đ/tháng" ở cỡ chữ NHỎ HƠN giá gia hạn 249.000đ/năm (3.1.2 — giá gia hạn đầy đủ phải nổi bật nhất).

## 5. Người dùng hiện tại

**Không tặng Pro** (chủ dự án chốt 16/10). Người dùng hiện tại theo luật chung: giữ nguyên mọi từ đã lưu (> 30 vẫn giữ), giữ theme đang dùng (kể cả theme ảnh), giữ dữ liệu khung giờ (cron chỉ gửi khung sớm nhất khi miễn phí). `entitlements.source = gift` vẫn có trong schema cho mã ưu đãi / hỗ trợ sau này.

## 6. Việc chủ dự án làm trên App Store Connect

1. **Paid Apps Agreement** (Business → Agreements): ngân hàng + thuế — bắt buộc trước khi bán.
2. Tạo nhóm thuê bao "Wordly Pro": `wordly.pro.monthly` 29.000đ, `wordly.pro.yearly` 249.000đ (không introductory offer); tên/mô tả tiếng Việt; ảnh chụp paywall cho Apple duyệt.
3. Bật **Billing Grace Period**.
4. Điền URL App Store Server Notifications V2: `https://app.wordly.skillproof.work/api/billing/notifications` (Production + Sandbox).
5. Tạo tài khoản Sandbox để thử mua.
(Thuê bao đầu tiên phải nộp cùng một bản app.)

## 7. Kiểm chứng

- Web: unit (giới hạn từng loại, tra lại không tính, lỗi không trừ, xác thực JWS bằng dữ liệu mẫu của Apple, webhook từng loại sự kiện, header build cũ không bị chặn, `BILLING_ENFORCE` tắt), RLS các bảng mới (Supabase local).
- iOS: unit (bộ đếm, chặn theo gói, theme khoá + xem thử, so build → bắt buộc cập nhật), UI (paywall đủ thông tin bắt buộc, nút Khôi phục, theme 🔒 xem thử, hết lượt → paywall, màn bắt buộc cập nhật), StoreKit test file (mua/khôi phục/hết hạn/gia hạn) trên simulator.
- Web: thêm test 426 cho request không header/build cũ khi bật `BILLING_ENFORCE`, `GET /api/app-config`.
- Sandbox thật trên máy chủ dự án trước khi nộp Apple.

## Ngoài phạm vi

Alex / luyện nói; gói trọn đời; gói gia đình; đo lường analytics bên thứ ba; Android.

## 8. Hợp đồng API (app ↔ server)

- App mới gửi `X-Wordly-Build: <số build>` mọi request.
- `GET /api/app-config` (công khai) → `{"min_build": 21}` (env `APP_MIN_BUILD`, mặc định 0).
- `GET /api/billing/status` → `{"pro": bool, "expires_at": ISO|null, "source": "app_store"|"gift"|null, "in_grace": bool, "enforced": bool, "limits": {"saved_words": {"used": n, "limit": 30|null}, "advanced_translate": {"used": n, "limit": 5|null}, "dictionary": {"used": n, "limit": 5|null}, "push_slots": {"limit": 1|10}}}` — `limit: null` = không giới hạn. `BILLING_ENFORCE` tắt → `enforced: false`, mọi `limit: null` (push_slots 10).
- `POST /api/billing/sync` `{"signed_transaction": "<JWS StoreKit 2>"}` → giống status. Sai chữ ký / bundle khác / `appAccountToken` khác user → 400.
- `POST /api/billing/notifications` (công khai) `{"signedPayload": "..."}` → 200 (App Store Server Notifications V2).
- Chạm giới hạn → **402** `{"error": "<câu tiếng Việt>", "code": "limit_saved_words"|"limit_advanced_translate"|"limit_dictionary"|"limit_push_slots", "limit": n}`.
- Build cũ / thiếu header khi đang chặn, ở tính năng có giới hạn → **426** `{"error": "Phiên bản Wordly này đã cũ, hãy cập nhật trên App Store để tiếp tục.", "code": "update_required"}`.
- Tra từ không tính lượt khi từ (đã chuẩn hoá) thuộc: `dictionary_lookups` của người đó, từ đã lưu, kho từ (`words`), hoặc `suggestion_log` của người đó (từ đã hiện trên widget/thông báo). Không cần cờ từ app.
- Dịch tính lượt "nâng cao" khi: câu (> 3 chữ, đi Gemini), ảnh, giọng nói — chỉ khi thành công.
