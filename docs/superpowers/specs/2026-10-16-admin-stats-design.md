# Thống kê sử dụng + tình trạng server cho chủ dự án

Chủ dự án duyệt 16/10/2026. Đây là phương án "4A". Báo cáo hỏi-đáp (4B) và watchdog email đã làm xong.

## Mục tiêu
Chủ dự án biết hằng ngày: bao nhiêu người mới, bao nhiêu người thật sự dùng, có quay lại không, dùng tính năng nào, có ai chạm giới hạn hoặc trả tiền, đang dùng phiên bản app nào, server có ổn không.

Không cần cập nhật app. Không thêm SDK theo dõi. Không phải khai thêm App Privacy: chỉ ghi ngày dùng và số build, gắn với tài khoản sẵn có, đúng mục đích App Functionality/Analytics nội bộ.

## Thiết kế
1. **Ghi ngày hoạt động**
   - Bảng `app_activity_daily(user_id, day, build, first_at, last_at)`, mỗi người một dòng mỗi ngày theo giờ VN.
   - App đã gọi `GET /api/billing/status` mỗi lần mở app và mỗi lần quay lại app. Route này gọi RPC `touch_activity(p_build)`; RPC là security definer, dùng `auth.uid()`.
   - Lỗi ghi thì bỏ qua, không làm hỏng trạng thái gói.
   - RLS bật và không có policy: người dùng không đọc hay ghi trực tiếp bảng này.
2. **Tổng hợp số liệu**
   - Hàm SQL `admin_stats(p_now)` trả về jsonb. Chỉ service role được gọi.
   - Gồm:
     - người dùng: tổng, mới 1/7/30 ngày; hoạt động DAU/WAU/MAU; chuỗi 14 ngày (mới, hoạt động);
     - giữ chân: tỉ lệ quay lại ngày 1 và ngày 7 trên nhóm đăng ký trong 30 ngày;
     - tính năng: từ đã lưu, quiz, widget, thông báo;
     - giới hạn và gói: người chạm giới hạn hôm nay, Pro đang trả tiền (chỉ tính Production, đếm riêng Sandbox);
     - phân bố build 7 ngày; tình trạng server.
3. **Tình trạng server**
   - Bảng một dòng `server_status`.
   - Watchdog trên VPS (15 phút/lần) gửi `POST /api/admin/server-status` (Bearer CRON_SECRET) với ổ đĩa, RAM và danh sách sự cố.
4. **Trang xem**
   - `GET /api/admin/stats?t=<token>` trả về HTML.
   - Token là HMAC-SHA256 (khoá CRON_SECRET) kèm hạn dùng 7 ngày. Không cần đăng nhập web, vì web đang tắt. Link chỉ có trong email gửi riêng cho chủ dự án.
   - Gọi bằng Bearer CRON_SECRET thì trả JSON.
5. **Email mỗi sáng 8:00 giờ VN**
   - Cron VPS gọi `POST /api/cron/daily-report`.
   - Gửi tới `ADMIN_REPORT_EMAIL` qua Resend: các số chính của hôm qua, kèm link trang xem có hạn 7 ngày.

## Ghi chú
- Các số DAU, giữ chân và build chỉ có từ ngày bật (16/10). Dữ liệu cũ không có ngày mở app.
- Đây là route admin dùng service role, nên phải nằm trong `ADMIN_ALLOWED` kèm lý do.

## 6. Trang cố định /admin (chủ dự án chọn phương án A, 16/10)
- `GET /admin`: HTTP Basic với `ADMIN_DASHBOARD_PASSWORD` (tối thiểu 12 ký tự). Server chưa đặt mật khẩu thì không ai vào được.
- Mỗi IP tối đa 120 lượt / 15 phút (tính cả lượt đúng) để chặn dò mật khẩu.
- Số liệu tính lại mỗi lần mở. Trang tự tải lại mỗi 30 giây. Có thêm khối "Hôm nay (đến giờ)" từ hàm `admin_stats_today()` (chỉ service role).
- Watchdog chạy 5 phút/lần, nên tình trạng server trên trang trễ tối đa 5 phút.

