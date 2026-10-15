# Đồng ý Điều khoản + Chính sách khi tạo tài khoản

Chủ dự án duyệt hướng 15/10/2026 (sau research: Logto "manual agreement at sign-up only", mẫu Hàn Quốc, Nghị định 13/2023 Điều 11 — im lặng không phải đồng ý).

## Hành vi

| Tình huống | Người dùng thấy |
|---|---|
| Màn đăng nhập | Dòng chữ dưới các nút: "Bằng việc tiếp tục, bạn đồng ý với Điều khoản sử dụng và Chính sách quyền riêng tư" (2 link) |
| Đăng ký email | Ô "Tôi đồng ý với…" để trống, chưa tick thì nút "Tạo tài khoản" khoá. Đăng ký xong → app tự ghi đồng ý lên server, không hỏi lại |
| Google/Apple lần đầu, hoặc người dùng cũ (1.0.0) chưa đồng ý | Màn "Điều khoản sử dụng Wordly" toàn màn hình: dữ liệu lưu gì, 2 link, [Đồng ý và bắt đầu] / Không đồng ý |
| "Không đồng ý" | Hộp chọn: Xoá tài khoản và dữ liệu / Chỉ đăng xuất / Huỷ — không tự xoá dữ liệu của người dùng cũ |
| Đăng nhập lại khi đã đồng ý | Không có gì thêm |
| Điều khoản đổi (tăng `CURRENT_TERMS_VERSION`) | Màn đồng ý hiện lại một lần |
| Lỗi mạng khi kiểm tra | Cho vào app (không khoá người dùng vì mạng), lần mở sau kiểm lại |

## Dữ liệu

- `profiles.terms_version int`, `profiles.terms_accepted_at timestamptz` (migration `20261015000100_terms_consent.sql`).
- Server là nguồn sự thật cho phiên bản: `GET /api/profile` trả thêm `terms_current_version`; app cũ không biết trường này thì không bị ảnh hưởng.
- `POST /api/consent { version }` — chỉ nhận đúng phiên bản hiện tại (app hiện chữ cũ thì phải tải lại), server tự đặt `terms_accepted_at = now()`. Client của người dùng (RLS), không service role.

## Trang

- `/terms` công khai (thêm vào danh sách trang công khai của middleware + cổng web-UI), cùng khung `LegalPage` với `/privacy`. Tab Cá nhân thêm link "Điều khoản sử dụng".

## Ngoài phạm vi

- Đồng ý tuỳ chọn (marketing) — Wordly chưa có.
- EULA riêng trên App Store Connect — tuỳ chủ dự án, có thể trỏ tới `/terms`.
