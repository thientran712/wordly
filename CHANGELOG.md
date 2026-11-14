# Changelog

Phiên bản theo app iOS (`MARKETING_VERSION` trong `mobile/ios/project.yml`). Web/API đi cùng,
deploy production qua `deploy-production.yml`. Mục `[Unreleased]` chuyển thành số phiên bản khi
bản đó được phát hành trên App Store.

## [Unreleased]

### Added
- Quảng cáo khi mở app cho bản miễn phí, tối đa 1 lần mỗi ngày (#66)
- Bộ hình nền widget học tập miễn phí (#68)

### Changed
- Bản miễn phí dịch bằng ảnh và giọng nói 1 lượt mỗi ngày, hết lượt thì mời nâng cấp ngay (#69)
  <details><summary>Chi tiết</summary>

  Đếm riêng, tách khỏi 5 lượt dịch câu. Migration `20261111000100_free_image_voice` đã chạy production.
  </details>
- Giao diện iOS sửa theo review 33/39 điểm: đăng nhập, quiz, hồ sơ, widget, kho từ (#70)
  <details><summary>Chi tiết</summary>

  Đăng nhập Apple/Google lên đầu, ô mã 6 số tự xác nhận; quiz ẩn thanh tab và ghim nút Tiếp;
  hồ sơ tự lưu; kho từ có bộ lọc và nghĩa tiếng Việt; hướng dẫn thêm widget lên đầu khi chưa cài.
  </details>
- Thu phí Wordly Pro bật lại trên production 14/11/2026 (#71)

### Fixed
- Bản Release biên dịch được lại sau #70, build 25 (#71)
