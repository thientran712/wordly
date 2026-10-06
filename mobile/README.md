# mobile/

Ứng dụng di động của Wordly.

## iOS — `mobile/ios/`

App native SwiftUI + widget Lock Screen. Cách dựng project, cấu hình
credential và build: xem [`ios/README.md`](ios/README.md).

`mobile/ios/Config/Secrets.xcconfig` chứa credential thật và đã gitignore —
**không bao giờ commit**. Trước khi `git add`, chạy `git status --ignored mobile/`.

## Backend

App mobile gọi API của web app (`web/src/app/api/`) bằng header
`Authorization: Bearer <access_token>` và dùng chung Supabase. Schema và
migration nằm ở `supabase/` tại gốc repo.
