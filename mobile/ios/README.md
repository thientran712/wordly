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

## Features

| Feature | Status | Notes |
|---------|--------|-------|
| Login/Signup | ✅ | Email + password via Supabase |
| Translate EN↔VI | ✅ | DeepL via web API |
| Word suggestions | ✅ | Datamuse API |
| Dictionary definitions | ✅ | Free Dictionary API |
| Translate history | ✅ | Paginated, swipe-to-delete |
| Journal | ✅ | Quick-add, grouped by date |
| AI Practice (Alex) | ✅ | STT + Groq LLM + TTS |
| Profile | ✅ | Name, level, goal, theme |
| Lock Screen Widget | ✅ | Rectangular + Circular + Inline |
| Home Screen Widget | ✅ | Small + Medium |
| TTS Playback | ✅ | Google TTS (Neural2) via web |
| Dark/Light mode | ✅ | System + manual toggle |
| Offline cache | 🔜 | v2 — CoreData mirror |
| Push notifications | 🔜 | v2 — daily review reminders |
