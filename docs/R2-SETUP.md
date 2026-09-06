# Thiết lập Cloudflare R2 cho video upload

Video bài giảng dùng Cloudflare R2 thay vì Supabase Storage vì R2 **không
tính phí băng thông tải ra** (egress). Video xem nhiều lần đốt băng thông
rất nhanh — với Supabase, chỉ 20 học viên xem 2 lần/tháng đã vượt gói Free.
R2 free tier: 10GB lưu trữ + egress không giới hạn.

## Bước 1 — Tạo tài khoản Cloudflare (miễn phí, không cần thẻ)

1. Vào https://dash.cloudflare.com/sign-up
2. Xác nhận email

## Bước 2 — Tạo bucket R2

1. Trong Cloudflare Dashboard → chọn **R2 Object Storage** (menu bên trái)
2. Lần đầu vào R2 sẽ được yêu cầu "Enable R2" — bấm đồng ý (vẫn miễn phí,
   Cloudflare chỉ hỏi để xác nhận anh biết mức phí ngoài free tier)
3. **Create bucket** → đặt tên `wordly-videos` (hoặc tên khác, nhớ lại để
   điền vào biến môi trường)
4. Location: **Automatic** (Cloudflare tự chọn gần người dùng nhất)

## Bước 3 — Tạo API token

1. Trong trang R2 → **Manage R2 API Tokens** (góc phải)
2. **Create API Token**
3. Tên: `wordly-video-upload`
4. Quyền: **Object Read & Write**
5. Giới hạn vào bucket cụ thể: chọn `wordly-videos` (không chọn "Apply to
   all buckets" — giới hạn quyền theo nguyên tắc ít nhất cần thiết)
6. Bấm **Create API Token**
7. **QUAN TRỌNG:** trang kết quả hiện 3 giá trị — copy lại NGAY vì
   `Secret Access Key` chỉ hiện MỘT LẦN duy nhất:
   - `Access Key ID`
   - `Secret Access Key`
   - Đoạn `Account ID` hiện trong URL endpoint được gợi ý (dạng
     `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`)

## Bước 4 — (Tuỳ chọn) Gắn domain public để phát video nhanh hơn

Không bắt buộc — nếu bỏ qua, hệ thống tự phát video qua signed URL tạm
(vẫn hoạt động bình thường, chỉ khác là link phát hết hạn sau 1 giờ và
phải xin lại link mới khi hết hạn).

Nếu muốn gắn domain (khuyến nghị khi đã có khách thật):
1. Trong bucket `wordly-videos` → tab **Settings** → **Public access**
2. **Connect Domain** → nhập subdomain, vd `videos.wordly.app`
3. Cloudflare tự tạo bản ghi DNS nếu domain đã quản lý qua Cloudflare

## Bước 5 — Điền biến môi trường

Thêm vào `.env.local` (dev) và Vercel Environment Variables (production):

```bash
R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_BUCKET_NAME=wordly-videos

# Tuỳ chọn — chỉ điền nếu đã làm Bước 4. Bỏ trống thì hệ thống tự dùng
# signed URL tạm để phát video.
R2_PUBLIC_URL=https://videos.wordly.app
```

## Bước 6 — Chạy migration

```bash
supabase db push
```

Migration `20260906000100_video_upload_r2.sql` tạo bảng quota video riêng
(`org_video_usage`) và hàm kiểm quota 2 lớp.

## Bước 7 — Bật tính năng cho trung tâm muốn dùng

Tính năng `video_upload` mặc định bật cho gói **Pro** trở lên. Với trung
tâm gói Basic muốn thử, bật tay qua bảng `org_features`:

```sql
INSERT INTO org_features (org_id, feature_key, enabled)
VALUES ('<org_id>', 'video_upload', true)
ON CONFLICT (org_id, feature_key) DO UPDATE SET enabled = true;
```

## Giới hạn cần biết

- **10GB free tier là CỐ ĐỊNH cho toàn hệ thống**, không phải mỗi trung
  tâm 10GB riêng. Hệ thống tự cảnh báo (ghi log) khi tổng dung lượng gần
  chạm 80% (8GB). Vượt free tier, R2 tính phí $0.015/GB/tháng lưu trữ —
  rất rẻ, ví dụ 20GB dư ra chỉ khoảng $0.15/tháng.
- Mỗi trung tâm có hạn mức riêng mặc định 1GB (đủ ~4-5 video 30 phút
  720p). Chỉnh trong bảng `org_video_usage.bytes_limit` nếu cần nhiều hơn.
- Video giới hạn 2GB/file, 90 phút — chặn ở cả client lẫn server
  (`src/lib/video-validation.js`).
- Không transcode — phát trực tiếp file gốc bằng thẻ `<video>`. Định dạng
  hỗ trợ: mp4, webm, mov (quicktime).
