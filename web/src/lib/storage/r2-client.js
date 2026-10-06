// Client Cloudflare R2 — dùng SDK S3 vì R2 tương thích S3 API.
//
// KHÔNG test được bằng unit test (cần kết nối mạng thật tới R2), nên logic
// business (giới hạn, đường dẫn) được tách sang video-validation.js để test
// được độc lập — file này chỉ còn phần nối dây tới SDK.
//
// Biến môi trường cần có:
//   R2_ACCOUNT_ID       — id tài khoản Cloudflare
//   R2_ACCESS_KEY_ID    — API token R2 (tạo ở Cloudflare dashboard → R2 → Manage API tokens)
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET_NAME      — tên bucket (vd: wordly-videos)
//   R2_PUBLIC_URL       — domain public đã gắn cho bucket (vd: https://videos.wordly.app)
//                         hoặc để trống nếu chưa gắn domain — khi đó phát
//                         video qua signed URL tạm thời.

import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let _client = null;

/** Lazy singleton — chỉ tạo client khi thực sự cần, và báo lỗi rõ nếu thiếu cấu hình. */
function getR2Client() {
  if (_client) return _client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Thiếu cấu hình R2 (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY). " +
      "Xem hướng dẫn tạo API token trong docs/R2-SETUP.md"
    );
  }

  _client = new S3Client({
    region: "auto", // R2 không phân vùng theo region như AWS
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

function getBucketName() {
  const name = process.env.R2_BUCKET_NAME;
  if (!name) throw new Error("Thiếu R2_BUCKET_NAME");
  return name;
}

/**
 * Tạo signed URL để client PUT video trực tiếp lên R2 (không qua server).
 * Hết hạn sau 10 phút — đủ để bắt đầu upload file lớn nhưng không để lộ
 * quyền ghi lâu dài nếu URL bị lộ.
 */
export async function createSignedUploadUrl(key, contentType) {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(client, command, { expiresIn: 600 });
  return url;
}

/**
 * Xác minh file đã thật sự tồn tại trên R2 và lấy dung lượng THẬT.
 *
 * QUAN TRỌNG: không tin size_bytes client gửi khi đăng ký — dùng HeadObject
 * để đọc dung lượng thật từ R2, giống cách materials/route.js xác minh với
 * Supabase Storage. Nếu tin số client gửi, client báo 1 byte là lách quota.
 */
export async function verifyUploadedObject(key) {
  const client = getR2Client();
  try {
    const result = await client.send(
      new HeadObjectCommand({ Bucket: getBucketName(), Key: key })
    );
    return { exists: true, sizeBytes: result.ContentLength ?? null, contentType: result.ContentType ?? null };
  } catch (e) {
    if (e.name === "NotFound" || e.$metadata?.httpStatusCode === 404) {
      return { exists: false, sizeBytes: null, contentType: null };
    }
    throw e;
  }
}

/** Xoá object khỏi R2. Dùng khi xoá material hoặc dọn file mồ côi. */
export async function deleteObject(key) {
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: getBucketName(), Key: key }));
}

/**
 * URL để phát video cho người xem.
 *
 * Nếu bucket đã gắn domain public (R2_PUBLIC_URL) thì trả link cố định —
 * đây là cách bình thường vì video coi là nội dung nội bộ trung tâm, không
 * cần bảo mật tuyệt đối như bài nộp của học viên.
 *
 * Nếu CHƯA gắn domain, phát qua signed URL tạm (1 giờ) — vẫn dùng được
 * ngay mà không cần đợi anh cấu hình domain trước.
 */
export async function getPlaybackUrl(key) {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (publicUrl) {
    return `${publicUrl.replace(/\/$/, "")}/${key}`;
  }

  const client = getR2Client();
  const command = new GetObjectCommand({ Bucket: getBucketName(), Key: key });
  return await getSignedUrl(client, command, { expiresIn: 3600 });
}
