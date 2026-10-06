# mobile/

Ứng dụng di động của Wordly.

## iOS (`mobile/ios/` — chưa chuyển vào)

App iOS native (SwiftUI) hiện vẫn nằm ở thư mục `wordly-ios/` trong bản
checkout chính — thư mục này **chưa có trong git** và bị `.gitignore` bỏ qua
vì từng chứa credential thật.

Khi credential đã được tách ra `Config/Secrets.xcconfig`, app sẽ chuyển vào
`mobile/ios/`. `.gitignore` ở gốc repo đã có sẵn rule cho vị trí mới:

- `mobile/ios/Config/Secrets.xcconfig` — credential, **không bao giờ commit**
- `mobile/ios/*.xcodeproj`, `mobile/ios/build/`, `xcuserdata/`, `DerivedData/`

Trước khi commit lần đầu, chạy `git status --ignored mobile/` để chắc chắn
file secret đang bị bỏ qua.

## Backend

App mobile gọi API của web app (`web/src/app/api/`) và dùng chung Supabase.
Schema và migration nằm ở `supabase/` tại gốc repo — dùng chung cho cả web
và mobile, không thuộc riêng nền tảng nào.
