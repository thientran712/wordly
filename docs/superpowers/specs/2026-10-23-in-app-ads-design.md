# Quảng cáo trong app (AdMob) — thiết kế

Ngày: 23/10/2026 · Trạng thái: chủ dự án đồng ý triển khai (23/10)

## 1. Mục đích

Wordly đang miễn phí hoàn toàn (`BILLING_ENFORCE=0`, gói Pro đã ngừng bán) để
lấy người dùng. Chủ dự án muốn có doanh thu ngay bằng quảng cáo trong app iOS,
**không bật lại Pro** trong giai đoạn này. Doanh thu kỳ vọng thấp (eCPM Việt
Nam thấp, widget và thông báo không đặt được quảng cáo); mục tiêu thực tế là có
nguồn thu đầu tiên và bù một phần chi phí AI/dịch.

## 2. Mục tiêu / không làm / thất bại

**Mục tiêu**
- Bốn loại quảng cáo: mở app, đổi thưởng, banner, xen màn hình.
- Giới hạn 10 lượt dịch mỗi ngày; hết lượt phải xem quảng cáo đổi thưởng.
- Theme widget đặc biệt mở khoá bằng quảng cáo đổi thưởng.
- Bật/tắt và chỉnh tần suất từ server, không cần nộp app mới.

**Không làm lần này**
- Không bật lại Pro, không mua gói "bỏ quảng cáo".
- Không quảng cáo trên widget màn hình khoá / thông báo nhắc (Apple không cho).
- Không bản web (web learner UI đang tắt).
- Không mediation nhiều mạng (AppLovin MAX…) — để sau khi có số liệu.

**Thất bại dù vẫn chạy**
- Người dùng mới bỏ app hàng loạt (giữ chân D1/D7 trên `/admin` tụt rõ sau khi bật).
- Người dùng bị chặn dịch vì lỗi của mình (quảng cáo không tải được, server lỗi).
- Cộng lượt khi chưa xem hết quảng cáo (gian lận được).
- App bản cũ (chưa có quảng cáo) bị chặn dịch mà không có cách xem quảng cáo.

## 3. Quyết định của chủ dự án

1. **Quảng cáo mở app:** mỗi ngày tối đa **2 quảng cáo**, hiện ở **2 lần mở app
   đầu tiên trong ngày**, mỗi lần một quảng cáo.
2. **Giới hạn dịch:** **10 lượt miễn phí mỗi ngày**, tính **mọi lần dịch**
   (kể cả một từ đơn). Hết lượt thì **bắt buộc** xem hết quảng cáo đổi thưởng mới
   dịch tiếp.
3. **Phần thưởng:** xem hết 1 quảng cáo đổi thưởng → **+10 lượt dịch**. Lượt thưởng
   **cộng dồn, không mất khi sang ngày**. Mỗi ngày dùng 10 lượt miễn phí trước,
   hết mới trừ lượt thưởng.
4. **Banner** hiện thường xuyên.
5. **Quảng cáo xen màn hình** có dùng.
6. **Theme đặc biệt** của widget: xem quảng cáo đổi thưởng mới mở khoá.

## 4. Thiết kế

### 4.1 Một lượt dịch là gì

- Một **lần nhập** = 1 lượt: gõ dần / nói dần gửi nhiều request cho cùng một câu
  vẫn chỉ 1 lượt — dùng lại `quota_key` (UUID mỗi lần soạn) đã có trong
  `TranslateViewModel` và `consume_quota` (tối đa 40 request mỗi key).
- Dịch giọng nói: 1 lượt mỗi lần ghi âm (cùng `quota_key`). Dịch ảnh: 1 lượt
  mỗi ảnh.
- **Không tính:** mở lại mục lịch sử (dùng bản dịch đã lưu, không gọi server),
  phát âm, tra nghĩa ở thẻ từ điển AI (`/api/dictionary` — là "tra nghĩa",
  không phải "dịch"; **quyết định của Claude**, chủ dự án có thể đổi), bản dịch
  lấy từ cache phía app (`translateCache`, không gọi server).
- Bản dịch server lấy từ cache của server (bộ nhớ / bảng `translation_cache`)
  **vẫn tính lượt** — chủ dự án chốt "mọi lần dịch"; đếm ở mức route, giống
  `withAdvancedQuota` (**quyết định của Claude** theo lời chủ dự án).
- Chỉ trừ lượt khi dịch **thành công** (giữ nguyên nguyên tắc của `enforce.js`).
- Ngày tính theo giờ Việt Nam (`Asia/Ho_Chi_Minh`), giống `usage_daily` hiện có.

### 4.2 Server đếm và chặn

- Thêm loại đếm mới `translate` vào `usage_daily` / `consume_quota` (migration
  mới), áp cho **mọi** request `POST /api/translate`, `/api/translate/voice`,
  `/api/translate/image` của người đã đăng nhập.
- Bảng số dư lượt thưởng `ad_credits(user_id pk, balance int, updated_at)`, RLS:
  người dùng chỉ **đọc** dòng của mình; ghi chỉ qua hàm `SECURITY DEFINER`.
- Thứ tự trừ: còn lượt miễn phí hôm nay → trừ miễn phí; hết → trừ 1 từ
  `ad_credits.balance`; cả hai hết → trả **402** `limit_translate` (dạng
  `limitBody` hiện có, thêm `ad_available: true`) để app hiện màn xem quảng cáo.
  Kiểm và trừ trong **một hàm SQL** để hai request song song không trừ trùng.
- Câu đang soạn đã trừ lượt (cùng `quota_key`) thì không chặn giữa câu dù vừa
  hết lượt (giống `key_active` hiện có).
- DB lỗi → **cho qua** và ghi log (giống `enforce.js`): không chặn người dùng vì
  sự cố của mình.
- Công tắc riêng, **độc lập với `BILLING_ENFORCE`**: `ADS_ENFORCE` (0/1),
  `ADS_DAILY_FREE` (mặc định 10), `ADS_REWARD_CREDITS` (mặc định 10),
  `ADS_MIN_BUILD` (build đầu tiên có quảng cáo). Tắt `ADS_ENFORCE` → chạy y như
  hôm nay.
- **App bản cũ** (`X-Wordly-Build` < `ADS_MIN_BUILD` hoặc thiếu header):
  **không áp giới hạn** (không có cách xem quảng cáo). Khi phần lớn người dùng
  đã lên bản mới, chủ dự án có thể nâng `APP_MIN_BUILD` để ép cập nhật.
- `GET /api/billing/status` (app đang gọi mỗi lần mở) trả thêm
  `translate: { used_today, free_daily, credits }` để app hiện số lượt còn lại.

### 4.3 Xác nhận đã xem hết quảng cáo (chống gian lận)

- Dùng **xác minh phía server của AdMob (SSV)**: khi người dùng xem hết quảng cáo
  đổi thưởng, Google gọi `GET /api/ads/reward-callback?...` có chữ ký ECDSA.
  Server kiểm chữ ký bằng khoá công khai của Google
  (`https://www.gstatic.com/admob/reward/verifier-keys.json`, cache), rồi mới
  cộng thưởng. App **không** tự báo "đã xem".
- App gắn `user_id` (id Supabase) và `custom_data` (`translate` hoặc
  `theme:<theme_id>`) vào quảng cáo trước khi hiện.
- Chống cộng trùng: bảng `ad_rewards(transaction_id pk, user_id, kind,
  created_at)`; callback lặp lại cùng `transaction_id` thì bỏ qua, vẫn trả 200.
- Route này **công khai** (Google gọi không có phiên đăng nhập) → thêm vào
  `PUBLIC_API_PATHS`, an toàn nhờ chữ ký (giống webhook Apple). Ghi bằng
  service role trong route này là hợp lệ (callback hệ thống, không phải request
  người dùng) → thêm vào `ADMIN_ALLOWED` của `admin-client-usage.test.mjs`.
- Callback của Google đến chậm vài giây sau khi quảng cáo đóng: app hiện "Đang
  cộng lượt…" và hỏi lại `GET /api/billing/status` vài lần (tối đa ~10 giây).
  Quá thời gian mà chưa thấy → **vẫn cho dịch tiếp lần này** (xem 4.6).

### 4.4 Theme đặc biệt

- Hiện có 7 nhóm theme (`WidgetThemes.swift`): Màu cơ bản, Góc học tập, Thiên
  nhiên, Thành phố đêm, Hào hùng, Vũ trụ, Sang trọng.
- **Đề xuất của Claude:** "Màu cơ bản" và "Góc học tập" miễn phí; 5 nhóm ảnh còn
  lại là đặc biệt. Danh sách theme đặc biệt do server trả (`/api/app-config`,
  `premium_theme_ids`) để chỉnh không cần nộp app.
- Xem 1 quảng cáo → mở khoá **vĩnh viễn một theme** cho tài khoản. Lưu ở bảng
  `theme_unlocks(user_id, theme_id, unlocked_at, pk(user_id, theme_id))`, RLS chỉ
  đọc của mình, ghi qua callback SSV.
- Theme đang dùng trước khi có quảng cáo được giữ (lần đầu chạy bản mới, app gửi
  theme đang dùng lên để mở khoá sẵn — hoặc server không khoá theme đang áp dụng;
  builder chọn cách gọn hơn).
- Ảnh của chính người dùng (nền tuỳ chỉnh) **không** khoá.
- Xem trước theme đặc biệt vẫn được (thấy trên màn chọn), chỉ khoá nút "Áp dụng".

### 4.5 Bốn loại quảng cáo trên app

| Loại | Khi nào | Tần suất (mặc định, chỉnh từ server) |
|---|---|---|
| Mở app (App Open) | 2 lần mở app đầu tiên trong ngày (mở mới hoặc quay lại sau ≥ 30 giây ở nền) | Tối đa 2/ngày |
| Đổi thưởng (Rewarded) | Hết lượt dịch; bấm mở khoá theme đặc biệt | Không giới hạn |
| Banner | Dải cố định cuối màn Từ vựng, Ôn tập, Cá nhân, Lịch sử toàn màn. Màn Dịch: cuối trang cuộn, **không** dính trên bàn phím / ô nhập | Luôn hiện |
| Xen màn hình (Interstitial) | Chỗ ngắt tự nhiên: xem xong kết quả quiz và rời màn, đóng thẻ chi tiết từ | Cách nhau ≥ 3 phút, tối đa 6/ngày |

Quy tắc chung (**đề xuất của Claude**, chỉnh từ server):
- **Không** hiện quảng cáo mở app khi app được mở bằng widget hoặc thông báo nhắc
  (người dùng đang muốn xem ngay một từ), và không hiện trong lúc đang ghi âm.
- Không hiện quảng cáo mở app / xen màn hình trong luồng đăng ký – onboarding lần
  đầu.
- **Thời gian ân hạn:** không quảng cáo (trừ quảng cáo đổi thưởng khi hết lượt)
  trong `ADS_GRACE_HOURS` (mặc định **0** — chủ dự án chưa chọn ân hạn; để sẵn
  công tắc để bật nếu giữ chân tụt).
- Âm thanh quảng cáo không được làm gián đoạn phát âm đang đọc: dừng
  `TTSManager` trước khi hiện quảng cáo toàn màn.

### 4.6 Lỗi và trường hợp biên

- Quảng cáo đổi thưởng **không tải được** (mất mạng, hết quảng cáo) khi hết lượt:
  **cho dịch tiếp** lần đó (server cấp 1 lượt "miễn phí do lỗi" — hàm
  `grant_ad_fallback` giới hạn tối đa 5 lần/ngày để không bị lạm dụng bằng cách
  chặn quảng cáo). Không chặn người dùng vì lỗi không phải của họ.
- Người dùng đóng quảng cáo đổi thưởng giữa chừng: không cộng lượt, ở lại màn
  "Xem quảng cáo để dịch tiếp".
- Khách (chưa đăng nhập): app iOS **bắt buộc đăng nhập** (chủ dự án xác nhận),
  nên mọi người dùng app đều có tài khoản. Request không đăng nhập tới
  `/api/translate` (chỉ còn từ gọi API trực tiếp, web learner UI đã tắt) giữ như
  hiện nay — chỉ rate limit, không đếm lượt (**quyết định của Claude**).
- **Người đang có Pro / được tặng Pro** (`is_pro()` còn đúng): **không quảng cáo
  và không giới hạn dịch** — họ đã trả tiền (**quyết định của Claude**). Kiểm
  `is_pro` trong hàm SQL trừ lượt, trong `/api/billing/status` (app ẩn quảng cáo)
  và khi khoá theme.
- Không bao giờ hiện hai quảng cáo toàn màn liền nhau (mở app + xen màn hình
  cách nhau ≥ 3 phút).

### 4.7 Cấu hình từ server

`GET /api/app-config` (đã có, công khai) trả thêm `ads`:

```json
{
  "enabled": true,
  "app_open_per_day": 2,
  "interstitial_min_gap_sec": 180,
  "interstitial_per_day": 6,
  "banner": true,
  "grace_hours": 0,
  "premium_theme_ids": ["..."]
}
```

Thiếu `ads` hoặc `enabled: false` → app không hiện quảng cáo nào và không khoá
theme. Giới hạn dịch do server quyết định riêng (`ADS_ENFORCE`).

### 4.8 SDK, quyền riêng tư, App Store

- Google Mobile Ads SDK qua Swift Package Manager (`project.yml`), App ID và các
  ad unit ID đặt trong `Config/Secrets.xcconfig` → Info.plist (không viết cứng,
  không commit). Bản Debug dùng **ad unit test của Google**.
- Hộp hỏi quyền theo dõi của Apple (ATT): hỏi **sau** khi người dùng hoàn tất
  onboarding và đã dùng app một lúc (không hỏi ngay lần mở đầu). Từ chối vẫn có
  quảng cáo (không cá nhân hoá).
- Form đồng ý của Google (UMP) cho người dùng EEA/UK.
- Cập nhật `NSUserTrackingUsageDescription`, `SKAdNetworkItems` (danh sách
  Google cung cấp), App Privacy trên App Store Connect, và `app-ads.txt` trên
  domain marketing (chủ dự án làm phần App Store Connect / AdMob console).

### 4.9 Theo dõi

- Dashboard `/admin` thêm: số quảng cáo đổi thưởng đã xác nhận / ngày, số người
  chạm giới hạn dịch / ngày, số lần cấp lượt do lỗi quảng cáo. Doanh thu xem trên
  AdMob console.
- So giữ chân D1/D7 trước và sau khi bật để quyết tăng/giảm tần suất.

## 5. Thứ tự triển khai

1. Server + migration (giới hạn dịch, `ad_credits`, `ad_rewards`,
   `theme_unlocks`, callback SSV, `app-config.ads`) — deploy với `ADS_ENFORCE=0`
   (không ảnh hưởng ai). Migration cần chủ dự án duyệt trước khi chạy production.
2. App: SDK + 4 loại quảng cáo + màn hết lượt + khoá theme, đọc `app-config`.
3. TestFlight nội bộ với ad unit test → kiểm callback SSV thật với ad unit thật
   trên tài khoản chủ dự án.
4. Lên App Store; khi bản mới đã có trên store → bật `ADS_ENFORCE=1`,
   `ads.enabled=true`.

## 6. Kiểm chứng

- TDD: logic thuần ở `web/src/lib/ads/` (thứ tự trừ lượt, kiểm chữ ký SSV với
  vector mẫu của Google, chống trùng `transaction_id`, cấu hình) và
  `mobile/ios/.../Ads/AdsLogic.swift` (quyết định có hiện quảng cáo mở app /
  xen màn hình theo số lần, khoảng cách, nguồn mở app).
- RLS test cho `ad_credits`, `ad_rewards`, `theme_unlocks` (chỉ local).
- Kiểm thủ công trên máy thật: callback SSV đến server và cộng lượt.

## 7. Quyết định của Claude (chủ dự án kiểm khi đọc)

- Tra nghĩa ở thẻ từ điển AI không tính lượt dịch.
- Người có Pro / quà Pro: không quảng cáo, không giới hạn.
- Request không đăng nhập: giữ rate limit như cũ, không đếm.
- Theme miễn phí: Màu cơ bản + Góc học tập; 5 nhóm ảnh còn lại đặc biệt.
- Quảng cáo đổi thưởng lỗi → cấp 1 lượt, tối đa 5 lần/ngày; dùng chung cho
  trường hợp callback SSV đến chậm.
- Tần suất xen màn hình: cách ≥ 3 phút, ≤ 6/ngày; không quảng cáo mở app khi mở
  từ widget/thông báo.
