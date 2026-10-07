# Wordly iOS App

Native SwiftUI app replicating all features of the Wordly web app, plus Lock Screen widget.

## Prerequisites
- macOS 14+ with Xcode 15+
- Apple Developer Account ($99/yr) — required for App Groups + WidgetKit on device
- iOS 17+ device or simulator

## Setup

```bash
brew install xcodegen
cp Config/Secrets.example.xcconfig Config/Secrets.xcconfig   # điền giá trị thật
xcodegen generate                                             # sinh WordlyiOS.xcodeproj
open WordlyiOS.xcodeproj
```

- `Config/Secrets.xcconfig` (gitignore) chứa URL web, URL + publishable key Supabase,
  `DEVELOPMENT_TEAM`. Build chèn chúng vào Info.plist, app đọc qua `WordlyConfig`.
  Thiếu giá trị → app dừng ngay khi khởi động với thông báo rõ ràng.
- `project.yml` là nguồn sự thật của project (target, Info.plist, entitlements, package
  supabase-swift). `.xcodeproj` là file sinh ra — sửa `project.yml` rồi chạy lại
  `xcodegen generate`, không sửa trong Xcode.
- Bundle ID / App Group nằm trong `Config/Base.xcconfig`.
- Build dòng lệnh: `xcodebuild -project WordlyiOS.xcodeproj -scheme WordlyiOS -destination 'generic/platform=iOS Simulator' build`
- Test (target `WordlyiOSTests`, chạy trên simulator): `xcodebuild -project WordlyiOS.xcodeproj -scheme WordlyiOS -destination 'platform=iOS Simulator,name=<tên máy ảo>' test`.
  Logic thuần (đọc ngày giờ, xử lý 401…) đặt ở `WordlyiOS/Core/` để test được.
- `WordlyiOS.xcodeproj/…/swiftpm/Package.resolved` là lockfile SPM — **được commit** (phần còn lại
  của `.xcodeproj` thì không). Muốn nâng supabase-swift: Xcode → File → Packages → Update, rồi commit file này.
- **Giao diện khớp web:** màu ở `Shared/Theme/DesignSystem.swift` lấy từ `web/src/app/globals.css`
  (tự đổi sáng/tối), font Plus Jakarta Sans ở `Resources/Fonts` (OFL), logo ở `Resources/Brand.xcassets`.
  Web đổi màu → sửa `DesignSystem.swift` + `DesignSystemTests`. Dùng `WordlyColors.*` / `WordlyFonts.*`,
  không viết `Color(hex:)` hay `.system(size:)` trong màn hình.
- **Xem trước giao diện (chỉ bản Debug):** chạy với launch argument `-WordlyUIPreview <translate|journal|practice|profile>`
  → bỏ qua đăng nhập, API trả dữ liệu mẫu (`Core/Debug/PreviewMode.swift`). Thêm `-wordly-theme light` để xem chế độ sáng.
  Không có trong bản Release/TestFlight.
- `PrivacyInfo.xcprivacy` (app + widget): khai báo dữ liệu thu thập + lý do dùng UserDefaults.
  Thêm API "required reason" hoặc thu thập dữ liệu mới → phải cập nhật, nếu không App Store Connect từ chối bản build.

### Xác thực với web API
App gửi `Authorization: Bearer <access_token>` (không có cookie). Middleware web
nhận token này khi request không có cookie session, verify bằng cùng `getClaims()`.

## Architecture

```
WordlyiOS/
├── App/                    WordlyApp + ContentView + MainTabView
├── Core/
│   ├── Network/            APIClient (calls web /api/* endpoints)
│   │   └── Models.swift    All Codable data models
│   ├── Auth/               AuthManager (Supabase Auth)
│   └── Storage/            AppGroupStorage (UserDefaults shared w/ widget)
├── Features/
│   ├── Auth/               LoginView, SignupView, ForgotPasswordView
│   ├── Translate/          TranslateView + ViewModel (DeepL + DictionaryAPI)
│   ├── History/            HistoryView + ViewModel (paginated, grouped by date)
│   ├── Journal/            JournalView + ViewModel (quick-add, grouped entries)
│   ├── Practice/           PracticeView + PracticeViewModel + SpeechManager (STT/VAD)
│   └── Profile/            ProfileView + ProfileViewModel + ChangePasswordView
└── Shared/
    ├── Components/         TTSManager (Google TTS via web API)
    └── Theme/              DesignSystem (colors, typography, modifiers)

WordlyWidget/               WidgetKit extension
├── WordlyWidget.swift      Timeline provider + all widget views
└── WidgetWordEntry.swift   Shared Codable model
```

## Key Design Decisions

### API calls go through the web app
iOS **does not** embed API keys directly. Instead it calls:
- `POST /api/translate` → web app calls DeepL
- `POST /api/tts` → web app calls Google TTS
- `POST /api/practice` → web app calls Groq

This keeps keys secure and means both web + iOS share identical backend logic.


### Widget data flow
```
Main App → AppGroupStorage (UserDefaults group.com.*.wordly) → WordlyWidget
```
Every time the app opens the History tab, it syncs the latest 50 EN→VI words to UserDefaults.
The Widget reads these and creates a timeline showing 1 different word per hour.

## Tính năng (7/10/2026)

| Tính năng | Ghi chú |
|---|---|
| Đăng nhập email / Google / Apple | Google qua OAuth Supabase; Apple native (id token + nonce) |
| Dịch & tra từ | Từ điển AI của web, phát âm US/UK/VI, Lưu từ, lịch sử |
| Quiz từ vựng | Từ đã lưu (thiếu thì kho từ chung) |
| Từ vựng theo chủ đề | Kỳ thi, 12 chủ đề, trình độ, tìm kiếm |
| Luyện nói với Alex | Giọng nói + gõ chữ, phiên theo từ |
| Vòng quay luyện nói | IELTS / Phỏng vấn / Deep Talk, hẹn giờ, khung trả lời |
| Sổ tay câu hay | Journal |
| Email nhắc học | Tần suất, khung giờ, gửi thử |
| Widget màn hình khoá + màn hình chính | Nguồn từ, chu kỳ, khung giờ, ẩn nghĩa (Hồ sơ → Widget) |
| Lớp của tôi (trung tâm) | Đã có code, **tạm ẩn** |
