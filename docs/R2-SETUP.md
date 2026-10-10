# Thiết lập Cloudflare R2 (cache audio TTS)

R2 dùng để cache audio TTS (`/api/tts`, xem
`web/src/lib/storage/r2-client.js`) vì **không tính phí băng thông tải ra**
(egress). R2 free tier: 10GB lưu trữ + egress không giới hạn.

> Trước đây R2 còn dùng cho tính năng video bài giảng (B2B, đã xóa — xem
> `docs/superpowers/specs/2026-10-10-remove-b2b-design.md`). Bucket và
> credential vẫn giữ nguyên, chỉ còn phục vụ cache TTS.

## Bước 1 — Tạo tài khoản Cloudflare (miễn phí, không cần thẻ)

1. Vào https://dash.cloudflare.com/sign-up
2. Xác nhận email

## Bước 2 — Tạo bucket R2

1. Trong Cloudflare Dashboard → chọn **R2 Object Storage** (menu bên trái)
2. Lần đầu vào R2 sẽ được yêu cầu "Enable R2" — bấm đồng ý (vẫn miễn phí,
   Cloudflare chỉ hỏi để xác nhận anh biết mức phí ngoài free tier)
3. **Create bucket** → đặt tên (vd `wordly-videos`, tên cũ từ lúc còn tính
   năng video — không ảnh hưởng vì chỉ là định danh, nhớ lại để điền vào
   biến môi trường)
4. Location: **Automatic** (Cloudflare tự chọn gần người dùng nhất)

## Bước 3 — Tạo API token

1. Trong trang R2 → **Manage R2 API Tokens** (góc phải)
2. **Create API Token**
3. Quyền: **Object Read & Write**
4. Giới hạn vào bucket cụ thể (không chọn "Apply to all buckets" — giới
   hạn quyền theo nguyên tắc ít nhất cần thiết)
5. Bấm **Create API Token**
6. **QUAN TRỌNG:** trang kết quả hiện 3 giá trị — copy lại NGAY vì
   `Secret Access Key` chỉ hiện MỘT LẦN duy nhất:
   - `Access Key ID`
   - `Secret Access Key`
   - Đoạn `Account ID` hiện trong URL endpoint được gợi ý (dạng
     `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`)

## Bước 4 — Điền biến môi trường

Thêm vào `web/.env.local` (dev) và Vercel Environment Variables (production):

```bash
R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_BUCKET_NAME=wordly-videos
```

## Giới hạn cần biết

10GB free tier. Vượt free tier, R2 tính phí $0.015/GB/tháng lưu trữ — rất
rẻ. Không có cơ chế quota riêng cho cache TTS (dung lượng nhỏ, mỗi file
audio chỉ vài chục KB, không đáng lo bằng tính năng video đã xóa).
