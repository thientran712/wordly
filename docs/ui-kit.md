# UI kit — app iOS Wordly

Thành phần dùng chung trong `mobile/ios/WordlyiOS`. Dùng lại trước khi viết mới.

## Màu và chữ
- Màu, cỡ chữ: `Shared/Theme/DesignSystem.swift` (`WordlyColors`, `WordlyFonts`).
- Màu nhấn toàn app: `AccentColor` (xanh `#58CC02`) — sheet và fullScreenCover cũng dùng màu này.

## Tiêu đề và đầu mục (chốt 11/11/2026)
- **Tiêu đề trang:** `.navigationTitle(...)` + `.navigationBarTitleDisplayMode(.inline)`, mọi tab và màn con.
- **Đầu mục trong Form:** `HubHeader("Tên", systemImage: "...")`: icon + chữ 13pt đậm, màu `inkSoft`, không in hoa.
- **Đầu mục trong ScrollView:** `SectionHeader(title:)`.
- Không tạo kiểu đầu mục mới (chữ xanh in hoa, chữ xám lớn…).

## Nút
- **Hành động chính:** `ElectricButtonStyle`, mỗi màn hoặc mỗi thẻ chỉ một nút đặc.
- **Hành động phụ:** `GhostButtonStyle`, hoặc nút viền (`Capsule().stroke(cardBorder)`).
- **Điều hướng:** `NavigationLink`, hoặc link một dòng (ví dụ "Chưa có tài khoản? Tạo tài khoản mới").
- **Hành động phá huỷ:** `role: .destructive`, chữ đỏ (`WordlyColors.error`), nằm nhóm riêng cuối trang.

## Thành phần khác
- `IconTile`, `Badge`, `PosBadge`, `FilterChip`, `FlowLayout` / `FlowChips` (chip tự xuống dòng)
- `EmptyStateView`, `ErrorStateView`, `LoadableView`
- `ProBadge`: nhãn PRO. Trên lưới theme dùng ổ khoá nhỏ.
- `ProCounterLine`
- `OTPCodeField`: 6 ô mã, `.oneTimeCode`
- `HubPicker`: segmented kiểu viên thuốc
- `.toast(...)`, `.wordlyCard()`, `.screenBackground()`

## Chữ trên màn
- Mỗi khối có tối đa 1 dòng helper; giải thích dài cho vào footer ngắn hoặc bỏ.
- Nút ghi động từ và kết quả ("Ôn 4 từ này", "Mở khoá với Pro"), không ghi "Tiếp" hay "OK".
- Không đưa chuỗi kỹ thuật lên màn (múi giờ IANA, mã lỗi).
