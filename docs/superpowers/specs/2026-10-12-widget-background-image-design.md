# Ảnh nền widget màn hình chính — thiết kế

**Ngày:** 12/10/2026 · **Trạng thái:** chờ duyệt · **Yêu cầu số 1:** KHÔNG được crash

## Vì sao bản cũ crash (spike)

Bản cũ (`a3e15a7`, gỡ ở `b377767`) không để lại crash log nào trên máy dev
(widget extension trên iPhone không đồng bộ log về Mac). Đọc code thấy 3 lỗi
cộng dồn, đủ vượt ngân sách bộ nhớ của widget extension (~30 MB):

| # | Lỗi | Hậu quả |
|---|---|---|
| 1 | Widget đọc + giải mã ảnh **trong `body` của view**, và timeline có tới **200 entry** (`WidgetSchedule.entries`, tối đa 200 trong 24 giờ) | WidgetKit dựng trước nhiều entry → mỗi entry một bitmap riêng |
| 2 | `UIGraphicsImageRenderer(size:)` mặc định theo **scale màn hình (3x)** → "500px" thật ra là **1500×1125 px** | Mỗi bitmap ~6,7 MB → chỉ 5 entry là đã vượt 30 MB |
| 3 | App giải mã **ảnh gốc** (`UIImage(data:)` rồi `draw`) — ảnh 48 MP ≈ 190 MB RAM | Đỉnh bộ nhớ lớn trong app; máy cũ có thể bị hệ thống kill |

Ngoài ra bản cũ không cắt ảnh theo khung, nên ảnh dọc bị `scaledToFill` cắt mất phần lớn.

**Chưa kiểm chứng trên máy thật.** Simulator không áp giới hạn bộ nhớ của
widget, nên phải thử trên iPhone thật: đó là cửa bắt buộc trước khi phát hành.

## Phạm vi

- Chỉ widget **màn hình chính** (nhỏ + vừa). Màn hình khoá do iOS tô đơn sắc, nên không có ảnh nền.
- Không đổi server, không thêm API.

## Trải nghiệm

1. Cài đặt widget → Màn hình chính → **Ảnh nền** → chọn ảnh (PhotosPicker).
2. Mở **màn chỉnh khung** có 2 tab: **Nhỏ** (vuông) và **Vừa** (ngang). Mỗi tab chỉnh riêng:
   - kéo để di chuyển, chụm để phóng to (luôn phủ kín khung, không có viền trống)
   - xem trước có chữ đè lên, giống widget thật
   - thanh **Làm tối** (0–60%) để chữ đọc được
3. **Lưu** / **Xoá ảnh nền**. Xoá ảnh thì widget quay về nền màu đang chọn.

## Kỹ thuật — các biện pháp chống crash

| Chỗ | Cách làm |
|---|---|
| App, đọc ảnh | **Không bao giờ giải mã ảnh gốc.** `CGImageSourceCreateThumbnailAtIndex` (ImageIO) giải mã thẳng xuống cạnh dài ≤ 2048 px để chỉnh khung (~16 MB) |
| App, lưu | Cắt theo khung người dùng chọn rồi xuất **đúng cỡ pixel** của widget lớn nhất: Nhỏ 510×510, Vừa 1092×510 (`format.scale = 1`, không theo màn hình). JPEG 0.8, ~100–200 KB mỗi file |
| App, ghi file | `Data.write(options: .atomic)` vào App Group, mỗi cỡ một file. Đổi tên file theo phiên bản (`bg-small-<n>.jpg`) để widget không bao giờ đọc file đang ghi dở |
| Widget, đọc | Đọc **một lần trong Provider** (không phải trong `body`), downsample bằng ImageIO đúng `context.displaySize × scale`. **Mọi entry dùng chung một `UIImage`**, nên 200 entry vẫn chỉ có ~2 MB bitmap |
| Widget, lỗi | File thiếu, hỏng, quá cỡ (> 1 MB) hoặc giải mã lỗi → **rơi về nền màu**, không throw |
| Cài đặt | Vị trí/độ phóng/độ tối lưu trong `WidgetSettings` (Codable chịu thiếu khoá như `HomeStyle`) |

## Kiểm thử

- **Unit (TDD):** tính khung cắt từ kéo/chụm (luôn phủ kín, kẹp biên); cỡ pixel đầu ra đúng
  510×510 / 1092×510 ở scale 1; downsample ảnh 8000×6000 không vượt cạnh 2048; widget đọc file
  hỏng hoặc thiếu thì trả nil; decode `WidgetSettings` cũ không có khoá ảnh nền vẫn được.
- **Đo bộ nhớ trên simulator:** chọn ảnh 8000×6000 (48 MP) — đỉnh RAM của app khi xử lý < 100 MB
  (Instruments / `os_proc_available_memory`).
- **Bắt buộc trên iPhone thật trước khi phát hành:** ảnh 48 MP từ camera, ảnh panorama, ảnh
  PNG trong suốt, đổi ảnh liên tục 10 lần, để widget chạy qua đêm. Không crash, widget không trắng.

## Ngoài phạm vi

- Ảnh nền cho widget màn hình khoá (iOS không cho).
- Đồng bộ ảnh nền giữa các thiết bị.
- Bộ lọc màu, làm mờ (blur) ảnh.
