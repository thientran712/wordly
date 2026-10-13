# Push notification nhắc ôn từ (iOS) — thiết kế

**Ngày:** 13/10/2026 · **Trạng thái:** đã duyệt 13/10/2026

## 1. Mục tiêu

Nhắc người dùng iOS ôn từ bằng thông báo đẩy: đến khung giờ họ chọn, điện
thoại hiện **một từ cần ôn + nghĩa tiếng Việt**; bấm vào mở đúng từ đó trong
app (giống bấm widget).

**Quyết định sản phẩm (chủ dự án, 13/10/2026):**
- Push **bổ sung** cho email, không thay. Hai kênh độc lập, mỗi kênh tự bật/tắt.
  Người đang nhận email vẫn nhận như cũ.
- Push có **lịch riêng** (khung giờ + ngày riêng), không dùng chung `email_slots`.
- Gửi qua **Firebase Cloud Messaging (FCM)** — sẵn đường cho Android sau này.

**Thành công khi:**
- Người dùng bật thông báo → đúng giờ địa phương nhận thông báo có từ + nghĩa.
- Bấm thông báo → app mở tab Từ vựng, popup đúng từ đó.
- Không bao giờ gửi thông báo của người A tới máy đang đăng nhập người B.
- Mỗi khung giờ gửi tối đa một lần mỗi ngày, kể cả khi cron chạy bù.

**Ngoài phạm vi (YAGNI):** app Android (chỉ để sẵn cột `platform`), web push,
rich notification (ảnh, nút bấm nhanh), thông báo streak/marketing, thống kê
tỉ lệ mở, FCM topics, Firebase Analytics.

## 2. Tổng quan luồng

```
iOS app ── xin quyền ──► APNs token ──► Firebase Messaging SDK ──► FCM token
   └─ POST /api/push/devices (Bearer, FCM token) ─► push_devices (RLS)

Cron VPS */5 ─► POST /api/cron/send-emails ─┬─► runDueEmailSends (như cũ)
                                            └─► runDuePushSends (mới)
                                                  │ push_slots tới giờ
                                                  │ chọn 1 từ (thuật toán email)
                                                  └─► FCM HTTP v1 ─► APNs ─► iPhone
Bấm thông báo ─► userInfo.link = wordly://word?... ─► AppRouter.open (đã có)
```

**Không đổi hạ tầng VPS:** cron hiện tại gọi `/api/cron/send-emails` mỗi 5
phút; route đó chạy thêm `runDuePushSends` song song (`Promise.allSettled` —
lỗi bên này không chặn bên kia). Không phải sửa crontab hay
`send-emails-cron.sh`. Phản hồi JSON đổi thành `{ email: …, push: … }` (chỉ
script cron đọc, ghi log).

## 3. Firebase

- **Project:** tạo Firebase project mới "Wordly" **gắn vào Google Cloud project
  Wordly** (`gen-lang-client-0661352497`, đã có billing) — một chỗ quản lý.
  Tài khoản `huythien712`; **không** dùng tài khoản gamuda.
- Thêm app iOS bundle `com.thientran.wordly` → tải `GoogleService-Info.plist`.
- **Cloud Messaging → APNs Authentication Key:** tải lên key `.p8` (tạo trên
  Apple Developer, bật APNs). FCM tự gửi sandbox/production theo build — server
  không phải phân biệt.
- **Service account** chỉ có quyền *Firebase Cloud Messaging API Admin* → JSON
  key cho server. FCM miễn phí, không giới hạn số tin.

## 4. Dữ liệu (migration `20261014000100_push_notifications.sql`)

Mọi bảng bật RLS. Mọi FK tới `auth.users` là `ON DELETE CASCADE` → xoá tài
khoản tự dọn sạch, không phải sửa `delete-account.js`.

| Bảng | Cột chính | RLS |
|---|---|---|
| `push_devices` | `id`, `user_id`, `token text UNIQUE` (FCM token), `platform text CHECK IN ('ios','android') DEFAULT 'ios'`, `app_version text`, `created_at`, `updated_at` | Người dùng `SELECT`/`DELETE` dòng của mình. **Không** có policy `INSERT`/`UPDATE` — ghi qua hàm `register_push_device` (dưới) |
| `push_preferences` | `user_id PK`, `enabled bool DEFAULT false`, `frequency text CHECK IN ('daily','weekdays','custom') DEFAULT 'daily'`, `custom_days int[] DEFAULT '{1,2,3,4,5}'`, `updated_at` | Toàn quyền trên dòng của mình (`auth.uid() = user_id`) |
| `push_slots` | `id`, `user_id`, `send_time time NOT NULL` (chỉ mốc :00/:30 — CHECK, xem mục 9), `enabled bool DEFAULT true`, `created_at`; `UNIQUE (user_id, send_time)` | Toàn quyền trên dòng của mình |
| `push_log` | `id`, `user_id`, `slot_id`, `send_date date` (ngày theo giờ địa phương người dùng), `status text CHECK IN ('sending','sent','failed','skipped')`, `entry_ids jsonb`, `devices int`, `error text`, `created_at`; **`UNIQUE (slot_id, send_date)`** | RLS bật, **không policy** — chỉ service role (cron) đọc/ghi |

Thêm: `suggestion_log.source` CHECK mở rộng thành `('email','widget','push')`.
Index: `push_devices(user_id)`, `push_slots(user_id)`, `push_log(created_at)`
(cho việc dọn log), ràng buộc unique ở trên.

### Hàm chọn slot tới giờ — `due_push_slots(p_now timestamptz, p_catchup_minutes int)`

`SECURITY DEFINER`, chỉ `service_role` được `EXECUTE`. Tính **trong Postgres**,
trả về chỉ những slot cần gửi (vài trăm dòng), không kéo cả 3 bảng về Node:

- join `push_slots` (enabled) × `push_preferences` (enabled) × `profiles.timezone`
  × `EXISTS push_devices`;
- múi giờ không hợp lệ → `Asia/Ho_Chi_Minh` (so với `pg_timezone_names`, tính
  một lần trong CTE — một múi giờ sai không được làm hỏng cả truy vấn);
- giờ địa phương hiện tại `>= send_time` và trễ **không quá
  `p_catchup_minutes`** (mặc định 30), đúng ngày theo `frequency`/`custom_days`;
- `NOT EXISTS push_log` cùng `(slot_id, send_date)` → slot đã nhận/đang gửi hôm
  nay bị loại;
- trả `slot_id, user_id, send_date`, sắp theo giờ hẹn (ai tới giờ trước gửi trước).

### Chống rò thông báo chéo người dùng — `register_push_device`

Một máy có **một** FCM token. Nếu A đăng xuất lỗi (mất mạng) rồi B đăng nhập
trên cùng máy, token vẫn gắn với A → thông báo của A (lộ từ vựng của A) hiện
trên máy B. Vì vậy token là `UNIQUE` toàn bảng và đăng ký qua hàm:

```sql
CREATE FUNCTION public.register_push_device(p_token text, p_platform text, p_app_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  -- kiểm định dạng token (độ dài, ký tự) + platform hợp lệ
  INSERT INTO push_devices (user_id, token, platform, app_version)
  VALUES (auth.uid(), p_token, p_platform, p_app_version)
  ON CONFLICT (token) DO UPDATE
    SET user_id = auth.uid(), platform = EXCLUDED.platform,
        app_version = EXCLUDED.app_version, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION … FROM public, anon; GRANT EXECUTE … TO authenticated;
```

Token "thuộc về" người đăng ký gần nhất. Người dùng không đọc được token của
người khác (chỉ `SELECT` dòng của mình), và không chiếm được token nếu không
có nó (chỉ máy đó biết).

## 5. Server (`web/src/lib/push/`, logic thuần để test được)

Không thêm thư viện: ký JWT bằng `jose` (đã có), gọi FCM bằng `fetch`.
**Không dùng `firebase-admin`** (nặng, kéo cả gRPC/Firestore vào image chỉ để
gửi một loại tin).

| File | Việc |
|---|---|
| `google-access-token.js` | Từ JSON service account: ký JWT RS256 (`jose`) → đổi lấy access token tại `oauth2.googleapis.com/token` (scope `firebase.messaging`); cache tới 5 phút trước khi hết hạn (token sống 1 giờ). `fetch` tiêm vào được để test |
| `fcm-client.js` | `POST https://fcm.googleapis.com/v1/projects/<id>/messages:send`, một request mỗi thiết bị (song song do `run-pool` điều tiết; hạn mức FCM 600k tin/phút, dư xa). Trả `{ ok, status, code }` (`code` = `UNREGISTERED`, `INVALID_ARGUMENT`, `SENDER_ID_MISMATCH`, `QUOTA_EXCEEDED`, `UNAVAILABLE`…) |
| `build-message.js` | Từ → message FCM: `token`; `apns.payload.aps.alert.title` = từ, `.body` = nghĩa Việt (rơi về nghĩa Anh; cắt ≤ 150 ký tự), `sound: default`, `thread-id: wordly-review`; `apns.headers`: `apns-push-type: alert`, `apns-priority: 10`, `apns-expiration` = +1 giờ (máy tắt quá 1 giờ thì bỏ, không dồn thông báo cũ); `data.link` = `wordly://word?id=…&w=…&m=…&bank=0|1` **đúng định dạng `WidgetDeepLink`**. Chỉ dùng khối `apns` — chưa có Android |
| `run-pool.js` | Chạy danh sách việc với **tối đa N việc song song** (mặc định 20) và **hạn thời gian** (mặc định 4 phút): hết hạn thì không nhận việc mới, việc dở chạy nốt. Thuần, không phụ thuộc |
| `cron-send-push.js` | `runDuePushSends(supabase, now, { send })`: gọi RPC `due_push_slots` → chạy qua `run-pool`, mỗi slot: **giành quyền gửi trước** bằng `INSERT push_log (slot_id, send_date, status 'sending')` — trùng unique thì bỏ (lượt cron khác đã giành) → chọn **1** từ bằng `selectEmailContent` (tránh từ đã gợi ý 3 ngày qua, như email), rỗng thì `selectBankWords` → vẫn hết từ thì cập nhật `skipped`, **không gửi** → gửi tới mọi thiết bị → cập nhật `push_log` thành `sent`/`failed` + ghi `suggestion_log` (`source='push'`). Cuối lượt: dọn dẹp (dưới) |

**Vì sao "giành quyền trước khi gửi" + "cửa sổ bù 30 phút":**
- Mặc định mọi người là 20:00 → giờ cao điểm có thể ~5.000 slot cùng lúc. Với
  ~300 ms chọn từ + ~150 ms gọi FCM mỗi người, gửi tuần tự mất ~35 phút → trễ
  hàng loạt, và cron 5 phút sau chạy chồng lên.
- Song song 20 → ~2 phút. Còn sót (FCM chậm, VPS bận, cron lỡ một lượt) thì
  lượt sau vẫn thấy slot vì cửa sổ bù 30 phút, thay vì mất hẳn như cửa sổ 5 phút
  của email.
- Hai lượt cron chạy chồng không gửi trùng: chỉ một lượt `INSERT` thắng được
  unique `(slot_id, send_date)` — chặn ở DB, không dựa vào "kiểm rồi mới ghi".
- Dòng kẹt ở `sending` (container bị tắt giữa chừng) không gửi lại — chấp nhận
  mất một lần nhắc, còn hơn gửi đôi.

**Dọn dẹp mỗi lượt cron** (giới hạn 5.000 dòng/lượt để không khoá bảng lâu):
- `push_log` cũ hơn 30 ngày → xoá (10k người × ~1,5 tin/ngày ≈ 450k dòng/tháng;
  không dọn thì ~5 triệu dòng/năm).
- `push_devices` không được app làm mới (`updated_at`) quá 270 ngày → xoá (FCM
  coi token đã hết hạn sau 270 ngày máy không hoạt động).

**Xử lý lỗi FCM:**
- `404 UNREGISTERED`, `400 INVALID_ARGUMENT` (token sai), `403
  SENDER_ID_MISMATCH` → xoá dòng `push_devices` đó (token chết/không thuộc project).
- `401` (access token hỏng) → xin token mới, thử lại một lần; vẫn lỗi → dừng
  cả lượt push (cấu hình sai), log lỗi rõ; email không ảnh hưởng.
- `429 QUOTA_EXCEEDED`, `5xx UNAVAILABLE/INTERNAL`, lỗi mạng → ghi `failed`,
  không thử lại trong lượt (slot đã qua cửa sổ thì bỏ — nhắc trễ tệ hơn không nhắc).
- `400 THIRD_PARTY_AUTH_ERROR` (key APNs trên Firebase sai) → dừng lượt, log rõ.
- Thiếu biến môi trường FCM → `runDuePushSends` trả `{ disabled: true }`, không lỗi.

**Route người dùng** (mặc định protected, Bearer hoặc cookie, client RLS `createClient()`):

| Route | Việc |
|---|---|
| `POST /api/push/devices` | `{ token, platform, app_version }` → RPC `register_push_device` |
| `DELETE /api/push/devices` | `{ token }` → xoá dòng của chính mình (gọi trước khi đăng xuất) |
| `GET/PUT /api/push/preferences` | Đọc/ghi `enabled`, `frequency`, `custom_days` (upsert). Bật lần đầu mà chưa có khung giờ → tạo 20:00 |
| `GET/POST/PUT/DELETE /api/push/slots` | Như `/api/email-slots`: tối đa 10, `HH:MM`, kiểm giờ hợp lệ, xoá giữ ≥ 1 |

Validate ở route: token 100–4096 ký tự `[A-Za-z0-9:_-]`, `platform` trong 2 giá
trị, `custom_days` là mảng số 0–6. Chỉ route cron dùng `createAdminClient()`
(đã có trong `ADMIN_ALLOWED`).

**Giới hạn tần suất** (dùng `lib/security/rate-limit` sẵn có): `/api/push/devices`
10 lượt/phút/người, các route cài đặt 30 lượt/phút/người — chặn app lỗi lặp vô
hạn hoặc lạm dụng.

**Theo dõi:** phản hồi cron (ghi vào `send-emails-cron.log`) gồm `due`, `sent`,
`skipped`, `failed`, `tokens_removed`, `deferred` (còn lại khi hết hạn thời
gian), `duration_ms`. `deferred > 0` nhiều ngày liền = cần tăng song song hoặc
tách worker — dấu hiệu đọc được trước khi người dùng thấy trễ.

**Biến môi trường mới** (VPS `/opt/wordly/prod/web/.env` + `web/.env.local`;
`.env.example` thêm placeholder): `FCM_PROJECT_ID`,
`FCM_SERVICE_ACCOUNT_BASE64` (base64 của cả file JSON service account, như
`APPLE_PRIVATE_KEY_BASE64`). Đưa vào bằng `atlas-secret-handoff`, không lộ giá trị.

**Chi phí:** FCM miễn phí. Mỗi lượt gửi = 1 truy vấn chọn từ (đã dùng cho
email) + 1 request FCM/thiết bị, không gọi AI. Tối đa 10 thông báo/người/ngày.

## 6. iOS

**Firebase SDK:** thêm package `firebase-ios-sdk` (SPM) vào `project.yml`, **chỉ
product `FirebaseMessaging`** (không Analytics, không Crashlytics).
- `Info.plist`: `FirebaseAppDelegateProxyEnabled = NO` — tắt swizzling, tự
  chuyển APNs token cho Firebase (`Messaging.messaging().apnsToken = …`), để
  luồng `onOpenURL`/delegate hiện có không bị Firebase chen vào.
- `GoogleService-Info.plist`: **gitignore** như `Secrets.xcconfig` (repo
  public); `Secrets.example` ghi hướng dẫn tải từ Firebase console. Thêm vào
  build qua `project.yml` (bỏ qua nếu thiếu file → app vẫn build, chỉ không có push).
- `FirebaseApp.configure()` lúc khởi động — chỉ khi có file plist.
- Entitlement `aps-environment` lấy từ `$(WORDLY_APS_ENVIRONMENT)` —
  `development` (Debug) / `production` (Release). App ID bật capability **Push
  Notifications**. Không thêm Background Modes (không dùng silent push).

**`Core/Push/PushManager.swift`:**
- `UIApplicationDelegateAdaptor` nhận APNs token → đưa cho Firebase →
  `MessagingDelegate.didReceiveRegistrationToken` trả FCM token → gửi
  `POST /api/push/devices` (`platform: ios`, `app_version`). Gửi lại khi
  Firebase báo token mới, khi đăng nhập, và khi mở app nếu lần gửi trước đã
  quá 24 giờ (giữ `updated_at` tươi cho việc dọn token 270 ngày, mà 10k người
  mở app nhiều lần/ngày cũng chỉ ~10k request/ngày).
- Đăng nhập (kể cả người khác trên cùng máy) → đăng ký lại token → token
  chuyển sang người mới (mục 4).
- **Đăng xuất:** gọi `DELETE /api/push/devices` **trước** `supabase.auth.signOut()`
  (cần Bearer còn sống), rồi `Messaging.messaging().deleteToken()` để token cũ
  chết hẳn; lỗi thì bỏ qua — lần sau người khác đăng nhập sẽ chiếm token.
- `UNUserNotificationCenterDelegate`: app đang mở vẫn hiện banner; bấm thông
  báo → đọc `userInfo["link"]` → `AppRouter.open(url)` (đường đi y hệt bấm
  widget). App bị tắt hẳn → lưu link chờ, mở khi router sẵn sàng.

**App Privacy:** FirebaseMessaging gửi Firebase Installation ID lên Google →
cập nhật `PrivacyInfo.xcprivacy` + khai trên App Store Connect thêm **Device
ID** (App Functionality, không tracking) khi nộp bản có push. SDK có privacy
manifest riêng của Google.

**Màn "Thông báo nhắc ôn" (`Features/Settings/PushSettingsView.swift`):**
cùng bố cục `EmailSettingsView` — công tắc bật, tần suất (mỗi ngày / thứ 2–6 /
tuỳ chọn ngày), 1–10 khung giờ. Không có nút "Gửi thử" (YAGNI — kiểm push
bằng cách đặt một khung giờ gần). Dùng lại `EmailSettingsLogic` (ngày, giờ,
giới hạn khung) — đổi tên thành `ReminderScheduleLogic` dùng chung cho cả hai
màn. Lối vào: Hồ sơ, ngay dưới dòng Email nhắc học, kèm tóm tắt ("Mỗi ngày ·
20:00" / "Đang tắt").

**Xin quyền thông báo — lúc nào:**
1. Bật công tắc trong màn trên → hộp thoại hệ thống. Từ chối → công tắc về
   tắt, hiện dòng "Thông báo đang bị tắt trong Cài đặt iOS" + nút mở Cài đặt.
2. **Một lần duy nhất** sau khi người dùng lưu từ đầu tiên: sheet nhỏ "Nhắc
   bạn ôn từ này lúc 20:00 mỗi ngày?" → **Bật** (xin quyền, bật push, tạo khung
   20:00) / **Để sau** (không hỏi lại; vẫn bật được trong Hồ sơ). Không bao giờ
   xin quyền ngay lúc mở app lần đầu.

Múi giờ: dùng `profiles.timezone` đã có (app cập nhật theo máy).

## 7. Kiểm thử (TDD)

| Phần | Test |
|---|---|
| `build-message.js` | Nghĩa Việt/Anh/rỗng, cắt độ dài, header APNs, link khớp định dạng widget |
| `google-access-token.js` | Service account giả (key RSA sinh trong test): JWT đúng `iss`/`scope`/`aud`/`exp`, chữ ký kiểm được; cache, làm mới trước hạn; lỗi đổi token → throw rõ |
| `fcm-client.js` | `fetch` giả: URL đúng project, header Bearer, map 200/404/400/403/401/429/503 → `code` |
| `run-pool.js` | Không quá N việc cùng lúc; hết hạn thời gian thì dừng nhận việc, đếm `deferred`; một việc lỗi không làm dừng việc khác |
| `due_push_slots` (SQL) | Mô phỏng bằng JS (`due-push-slots-model.js`) để test mọi máy: múi giờ (VN, UTC−, nửa giờ như `Asia/Kolkata`, đổi giờ mùa hè), qua nửa đêm, cửa sổ bù 30 phút, tần suất/ngày tuỳ chọn, múi giờ sai → mặc định. Test RLS chạy chính hàm SQL trên Supabase local và đối chiếu với mô phỏng trên cùng bộ dữ liệu |
| `cron-send-push.js` | Supabase giả: hai lượt chạy song song chỉ gửi một lần (unique), hàng đợi rỗng → `skipped` không gửi, token chết bị xoá, 401 thử lại 1 lần rồi dừng lượt, thiếu env → disabled, nhiều thiết bị, dọn log/token cũ có giới hạn |
| Tải | Script `web/scripts/push-load-check.mjs` (không chạy trong CI): Supabase local, seed 10.000 người (mọi người 20:00) + FCM giả trễ 150 ms → đo thời gian `due_push_slots` (mục tiêu < 500 ms) và cả lượt (mục tiêu < 4 phút, `deferred = 0`) |
| Route cron | Email lỗi vẫn chạy push và ngược lại |
| RLS (`tests/rls/`, Supabase local) | B không đọc/xoá được thiết bị/khung giờ/cài đặt của A; không `INSERT` thẳng `push_devices`; B gọi `register_push_device` với token của A → token chuyển sang B; `push_log` người dùng không đọc được; xoá user → cascade sạch |
| iOS unit | `ReminderScheduleLogic` (đổi tên, test cũ vẫn xanh), đọc `link` từ `userInfo` → `WidgetDeepLink`, logic sheet "hỏi một lần", app chạy được khi thiếu `GoogleService-Info.plist` |
| Thủ công | Máy thật (simulator nhận push không ổn định): build Debug; đặt khung giờ +5 phút → nhận, bấm mở đúng từ; đăng xuất → không nhận nữa; đổi tài khoản trên cùng máy → chỉ nhận của người mới |

## 8. Triển khai — thứ tự và các cửa cần chủ dự án

1. **Chủ dự án** (Claude hướng dẫn từng bước):
   - Apple Developer: tạo key **APNs** → tải `.p8`; App ID `com.thientran.wordly`
     bật **Push Notifications**.
   - Firebase console: tạo project gắn Google Cloud project Wordly, thêm app
     iOS, tải `GoogleService-Info.plist` vào `mobile/ios/WordlyiOS/App/`, tải
     `.p8` lên Cloud Messaging, tạo service account JSON.
2. Merge server + migration. **[Cửa] chạy migration lên production** (một
   transaction, rồi `notify pgrst, 'reload schema'`) — xin đồng ý trước.
3. Đưa 2 biến `FCM_*` lên VPS (`atlas-secret-handoff`).
4. **[Cửa] deploy production** qua nút *Deploy — production*. Server mới tương
   thích ngược: chưa ai có thiết bị → lượt push rỗng; email không đổi.
5. Kiểm production: `/api/health` đúng commit, cron log có `push`, đăng ký
   token thật từ build Debug trên máy thật → nhận thông báo.
6. **[Cửa] build 16 lên TestFlight** khi chủ dự án ra lệnh (gồm PR #27 + push);
   cập nhật App Privacy (Device ID) trước khi nộp App Store.

## 9. Khung giờ chỉ theo mốc 30 phút — áp cho cả email và push

**Quyết định (chủ dự án, 13/10/2026):** người dùng chỉ chọn được giờ **tròn
:00 hoặc :30** (08:00, 08:30, 09:00…) — không có 08:10, 08:15. Hiện tại đặt
08:00 và 08:01 cũng được → bị gửi dồn. Giờ nằm trên lưới 30 phút + không được
trùng nhau ⇒ hai khung bất kỳ của một người tự cách nhau ≥ 30 phút.

**Một chỗ định nghĩa luật** — `web/src/lib/reminders/slot-time.js` (thuần):
- `isHalfHour("08:30")` → `true`; `"08:15"`, `"8:5"`, `"24:00"` → `false`.
- `HALF_HOUR_TIMES` — 48 mốc `00:00` … `23:30`.

**Server (chốt chặn thật)** — `POST/PUT /api/email-slots` và `/api/push/slots`:
- Giờ không phải mốc :00/:30 → `400 { error: "Chỉ chọn được giờ tròn hoặc rưỡi (ví dụ 08:00, 08:30)" }`.
- Trùng giờ một khung khác của chính người đó (trừ khung đang sửa) → `400 { error: "Đã có khung giờ 08:30" }`.
- Bảng mới `push_slots` thêm ràng buộc DB: `CHECK (EXTRACT(minute FROM send_time) IN (0,30) AND EXTRACT(second FROM send_time) = 0)` + `UNIQUE (user_id, send_time)`.
- `email_slots` **không** thêm ràng buộc DB (đang có dữ liệu giờ lẻ — thêm CHECK sẽ fail migration); chỉ chặn ở route.

**iOS — đổi giao diện** (`ReminderScheduleLogic` + một view chọn giờ dùng chung cho màn Email và màn Thông báo):
- Thay `DatePicker` bằng **menu 48 mốc** (00:00, 00:30 … 23:30) gọn trong một dòng — bánh xe chiếm ~200pt mỗi khung, 10 khung thì quá dài. Mốc đã dùng ở khung khác **không có trong menu**.
- Nút **Thêm khung giờ** thêm ngay mốc trống đầu tiên sau khung cuối (vòng qua nửa đêm); người dùng đổi lại bằng menu nếu muốn.
- Khung giờ cũ có giờ lẻ (ví dụ 08:15, đặt trước bản này): vẫn hiện đúng "08:15" và **vẫn gửi bình thường**; trong menu của chính khung đó "08:15" đứng đầu, các mục còn lại đều là mốc :00/:30 — chọn mốc nào thì lưu mốc đó, không có cách chọn giờ lẻ mới.
- Màn web `/profile/email` **không sửa** (giao diện web đóng băng) — nhập giờ lẻ ở web sẽ nhận lỗi 400 ở trên.

**Dữ liệu cũ:** không sửa/xoá khung giờ cũ của người dùng (không migration dữ liệu email). Cron gửi như cũ cho giờ lẻ đã có. Nếu muốn dọn hẳn, cần đếm trước số khung lẻ trên production rồi quyết riêng — ngoài phạm vi.

**App 1.0 cũ** (còn `DatePicker` từng phút): thêm khung giờ lẻ → server từ chối → app báo "Không thêm được khung giờ" (đã có); đổi sang giờ lẻ → server từ chối, app cũ không báo, mở lại màn thấy giờ cũ. Chấp nhận — hết khi người dùng cập nhật.

**Test:** `slot-time.test.mjs` (mốc hợp lệ/không hợp lệ, 48 mốc); route email/push: giờ lẻ → 400, trùng → 400, sửa chính khung đó không tự trùng; RLS/DB: `push_slots` từ chối giờ lẻ + trùng; iOS unit: 48 mốc, mốc đã dùng bị loại, gợi ý mốc trống vòng qua nửa đêm, giờ lẻ cũ vẫn hiện trong menu của chính khung đó.

## 10. Email mắc cùng lỗi quy mô — ngoài phạm vi, ghi nợ kỹ thuật

Cron email hiện tại có đúng các điểm yếu mà push tránh ở trên: kéo cả 3 bảng
về Node mỗi 5 phút, gửi tuần tự, cửa sổ 5 phút (lỡ một lượt là mất email), "kiểm
rồi mới ghi" nên hai lượt chạy chồng có thể gửi đôi. Không sửa trong việc này;
sau khi push chạy ổn, áp lại đúng khuôn (`due_*_slots` SQL + giành quyền +
`run-pool`) cho email — ghi vào `PROGRESS.md`.

## 11. Rủi ro

**Dữ liệu & bảo mật**

| Rủi ro | Giải pháp |
|---|---|
| Thông báo của A hiện trên máy đang đăng nhập B (lộ từ vựng của A) | Token UNIQUE toàn bảng; `register_push_device` chuyển token sang người đăng ký gần nhất; đăng xuất → xoá token trên server + `deleteToken()`; test RLS bắt buộc |
| Người dùng đọc/sửa thiết bị, lịch, log của người khác | RLS mọi bảng; không có policy INSERT/UPDATE `push_devices`; `push_log` không policy; test RLS A/B |
| Lộ `GoogleService-Info.plist` / service account (repo public) | plist gitignore như `Secrets.xcconfig`; service account chỉ quyền FCM, chỉ trong `.env` VPS, đưa lên qua `atlas-secret-handoff` |
| Xoá tài khoản để sót dữ liệu push | Mọi FK `ON DELETE CASCADE`; test xoá user → sạch 4 bảng |
| App/kẻ xấu gọi API push liên tục | Rate limit 10–30 lượt/phút/người; validate token, platform, giờ |

**Gửi tin**

| Rủi ro | Giải pháp |
|---|---|
| Gửi trùng khi 2 lượt cron chạy chồng | Giành quyền trước khi gửi bằng unique `(slot_id, send_date)` ở DB |
| Mất nhắc khi cron lỡ một lượt / VPS bận | Cửa sổ bù 30 phút |
| Dòng kẹt `sending` (container tắt giữa chừng) → mất 1 lần nhắc | Chấp nhận (mất 1 tin tốt hơn gửi đôi) |
| Máy tắt/không mạng > 1 giờ → không nhận tin cũ | Chủ ý (`apns-expiration` 1 giờ) — nhắc trễ vô nghĩa |
| Sai múi giờ → nhắc sai giờ | App cập nhật `profiles.timezone` theo máy; múi giờ sai → mặc định Việt Nam, không làm hỏng cả truy vấn; test đổi giờ mùa hè, múi nửa giờ |
| Hết từ để ôn → thông báo rỗng | Rơi về kho từ; vẫn hết thì `skipped`, không gửi |

**Quy mô 10.000 người**

| Rủi ro | Giải pháp |
|---|---|
| Giờ cao điểm 20:00 (~5.000 người cùng lúc) gửi tuần tự ~35 phút | Song song 20 + hạn 4 phút + cửa sổ bù; chỉ số `deferred` trong log; script đo tải 10k (mục tiêu < 4 phút) |
| Quét cả bảng mỗi 5 phút | `due_push_slots` lọc trong Postgres, chỉ trả slot cần gửi |
| Bảng log/thiết bị phình (~5 triệu dòng/năm) | Dọn log > 30 ngày, token > 270 ngày, ≤ 5.000 dòng/lượt |
| Token chết tích tụ | Xoá khi FCM trả `UNREGISTERED`/`INVALID_ARGUMENT`/`SENDER_ID_MISMATCH` |
| Email vẫn mắc lỗi quy mô cũ | Ngoài phạm vi; ghi nợ kỹ thuật (mục 10), áp cùng khuôn sau |

**Vận hành & triển khai**

| Rủi ro | Giải pháp |
|---|---|
| Cấu hình Firebase/key APNs sai → push hỏng im lặng | 401/`THIRD_PARTY_AUTH_ERROR` → dừng lượt, ghi lỗi rõ trong `send-emails-cron.log`; kiểm bằng máy thật trước khi phát hành |
| Push lỗi kéo hỏng email (chung route cron) | `Promise.allSettled` — hai bên độc lập; test email lỗi push vẫn chạy và ngược lại |
| Quên chạy migration trên production (self-host không có lịch sử migration, đã sót `suggestion_log`) | Bước 2 triển khai là cửa bắt buộc; kiểm bảng tồn tại + `notify pgrst` trước deploy; server thiếu bảng → lượt push báo lỗi, email không ảnh hưởng |
| Thiếu biến `FCM_*` | `runDuePushSends` trả `disabled`, không lỗi |
| Thiếu `GoogleService-Info.plist` khi build | App vẫn build/chạy, chỉ không có push (có test) |
| Phụ thuộc Google (Firebase sập/đổi chính sách) | Bảng `push_devices` tách nền tảng; đổi sang APNs trực tiếp chỉ thay `fcm-client.js` + token iOS |

**Mốc giờ 30 phút**

| Rủi ro | Giải pháp |
|---|---|
| Khung giờ lẻ cũ (08:15) của email | Vẫn gửi bình thường, không sửa dữ liệu; sửa → làm tròn về mốc gần nhất |
| App 1.0 cũ đổi sang giờ lẻ → server từ chối, app không báo | Chấp nhận; hết khi người dùng cập nhật |
| Web `/profile/email` nhập giờ lẻ → lỗi | Web đóng băng, chấp nhận; server trả thông báo rõ ràng |
| Đổi route `/api/email-slots` làm vỡ app iOS hiện tại | Chỉ thêm kiểm tra, không đổi đường dẫn/định dạng phản hồi thành công |

**Sản phẩm & App Store**

| Rủi ro | Giải pháp |
|---|---|
| Làm phiền → người dùng tắt quyền | Mặc định tắt; chỉ xin quyền trong ngữ cảnh (công tắc, hoặc 1 lần sau khi lưu từ đầu tiên); 1 từ/thông báo |
| Thiếu khai Device ID trong App Privacy → bị từ chối | Cập nhật `PrivacyInfo.xcprivacy` + App Store Connect trước khi nộp (bước 6) |
| Vi phạm Guideline 4.5.4 (push quảng cáo) | Chỉ nội dung học của chính người dùng |
| Firebase SDK tăng kích thước app | Chỉ `FirebaseMessaging` (không Analytics/Crashlytics) |
