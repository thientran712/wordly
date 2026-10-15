# Đồng ý Điều khoản + Chính sách khi tạo tài khoản

Chủ dự án duyệt hướng 15/10/2026 (sau research: Logto "manual agreement at sign-up only", mẫu Hàn Quốc, Nghị định 13/2023 Điều 11 — im lặng không phải đồng ý).

## Hành vi

**Chủ dự án chốt lại 15/10/2026 (tối):** đăng nhập là đồng ý — không có màn đồng ý cho lần đầu.

| Tình huống | Người dùng thấy |
|---|---|
| Màn đăng nhập | Dòng chữ dưới các nút: "Bằng việc tiếp tục, bạn đồng ý với Điều khoản sử dụng và Chính sách quyền riêng tư" (2 link) |
| Đăng ký email | Ô "Tôi đồng ý với…" để trống, chưa tick thì nút "Tạo tài khoản" khoá |
| Google/Apple lần đầu | Không hiện gì thêm — app tự ghi đồng ý (phiên bản hiện tại) lên server sau khi đăng nhập |
| Tài khoản tạo trước 1.0.1 | Mặc định đã đồng ý — lần mở đầu tiên trên bản mới app tự ghi, không hỏi |
| Điều khoản lên phiên bản mới (tăng `CURRENT_TERMS_VERSION`) | Màn "Wordly cập nhật Điều khoản" một lần: [Đồng ý và tiếp tục] / Không đồng ý |
| "Không đồng ý" (chỉ ở màn cập nhật) | Hộp chọn: Xoá tài khoản và dữ liệu / Chỉ đăng xuất / Huỷ |
| Lỗi mạng khi kiểm tra hoặc khi tự ghi | Cho vào app, lần mở sau ghi lại |

Lưu ý pháp lý (đã báo chủ dự án): Nghị định 13/2023 Điều 11 coi đồng ý ngầm định yếu hơn đánh dấu ô đồng ý.

## Dữ liệu

- `profiles.terms_version int`, `profiles.terms_accepted_at timestamptz` (migration `20261015000100_terms_consent.sql`).
- Server là nguồn sự thật cho phiên bản: `GET /api/profile` trả thêm `terms_current_version`; app cũ không biết trường này thì không bị ảnh hưởng.
- `POST /api/consent { version }` — chỉ nhận đúng phiên bản hiện tại (app hiện chữ cũ thì phải tải lại), server tự đặt `terms_accepted_at = now()`. Client của người dùng (RLS), không service role.

## Trang

- `/terms` công khai (thêm vào danh sách trang công khai của middleware + cổng web-UI), cùng khung `LegalPage` với `/privacy`. Tab Cá nhân thêm link "Điều khoản sử dụng".

## Ngoài phạm vi

- Đồng ý tuỳ chọn (marketing) — Wordly chưa có.
- EULA riêng trên App Store Connect — tuỳ chủ dự án, có thể trỏ tới `/terms`.
