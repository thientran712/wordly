// Client Cloudflare R2 — dùng SDK S3 vì R2 tương thích S3 API.
//
// Chỉ còn đọc/ghi object thẳng (dùng cho cache TTS). Phần upload/quản lý
// video qua signed URL thuộc tính năng B2B (materials) đã xóa — xem
// docs/superpowers/specs/2026-10-10-remove-b2b-design.md.
//
// Biến môi trường cần có:
//   R2_ACCOUNT_ID       — id tài khoản Cloudflare
//   R2_ACCESS_KEY_ID    — API token R2 (tạo ở Cloudflare dashboard → R2 → Manage API tokens)
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET_NAME      — tên bucket (vd: wordly-videos)

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

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

/** Đọc toàn bộ object thành Buffer; null nếu không tồn tại. Dùng cho cache TTS. */
export async function getObjectBytes(key) {
  const client = getR2Client();
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: getBucketName(), Key: key }));
    return Buffer.from(await result.Body.transformToByteArray());
  } catch (e) {
    if (e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

/** Ghi Buffer lên R2 (server-side, không qua signed URL). Dùng cho cache TTS. */
export async function putObjectBytes(key, bytes, contentType) {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({ Bucket: getBucketName(), Key: key, Body: bytes, ContentType: contentType })
  );
}
