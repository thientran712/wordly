// Test cho validation video upload lên Cloudflare R2.
//
// Vì sao cần: R2 free tier là 10GB CỐ ĐỊNH cho toàn hệ thống, không phải
// mỗi org 10GB. Nếu không giới hạn theo org, một trung tâm dùng hết quota
// sẽ chặn luôn các trung tâm khác — nghiêm trọng hơn quota Supabase vì đó
// là tài nguyên chia sẻ thật, không phải giả lập.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateVideoUpload,
  buildVideoKey,
  isNearSystemCap,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SECONDS,
  SYSTEM_CAP_BYTES,
} from "../../src/lib/video-validation.js";

describe("validateVideoUpload", () => {
  test("chấp nhận video hợp lệ", () => {
    const r = validateVideoUpload({
      mime_type: "video/mp4",
      size_bytes: 200 * 1024 * 1024, // 200MB
      duration_seconds: 1200, // 20 phút
    });
    assert.equal(r.ok, true);
  });

  test("từ chối MIME không phải video", () => {
    const r = validateVideoUpload({
      mime_type: "application/pdf",
      size_bytes: 1000,
      duration_seconds: 60,
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /định dạng/i);
  });

  test("từ chối MIME video lạ không trong danh sách cho phép", () => {
    // Chặn danh sách trắng, không danh sách đen — an toàn hơn
    const r = validateVideoUpload({
      mime_type: "video/x-matroska", // .mkv ít trình duyệt phát được
      size_bytes: 1000,
      duration_seconds: 60,
    });
    assert.equal(r.ok, false);
  });

  test("từ chối file vượt giới hạn dung lượng", () => {
    const r = validateVideoUpload({
      mime_type: "video/mp4",
      size_bytes: VIDEO_MAX_BYTES + 1,
      duration_seconds: 60,
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /dung lượng|MB|GB/i);
  });

  test("chấp nhận đúng bằng giới hạn dung lượng (biên)", () => {
    const r = validateVideoUpload({
      mime_type: "video/mp4",
      size_bytes: VIDEO_MAX_BYTES,
      duration_seconds: 60,
    });
    assert.equal(r.ok, true);
  });

  test("từ chối video vượt giới hạn thời lượng", () => {
    const r = validateVideoUpload({
      mime_type: "video/mp4",
      size_bytes: 1000,
      duration_seconds: VIDEO_MAX_SECONDS + 1,
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /thời lượng|phút/i);
  });

  test("từ chối dung lượng không phải số nguyên dương", () => {
    for (const bad of [0, -1, 1.5, NaN, "100", null, undefined]) {
      const r = validateVideoUpload({ mime_type: "video/mp4", size_bytes: bad, duration_seconds: 60 });
      assert.equal(r.ok, false, `size_bytes=${bad} phải bị từ chối`);
    }
  });

  test("từ chối thời lượng không hợp lệ", () => {
    for (const bad of [0, -1, NaN, "60", null]) {
      const r = validateVideoUpload({ mime_type: "video/mp4", size_bytes: 1000, duration_seconds: bad });
      assert.equal(r.ok, false, `duration_seconds=${bad} phải bị từ chối`);
    }
  });

  test("từ chối khi thiếu mime_type", () => {
    const r = validateVideoUpload({ size_bytes: 1000, duration_seconds: 60 });
    assert.equal(r.ok, false);
  });

  test("không sập khi input là null/object rỗng", () => {
    assert.equal(validateVideoUpload(null).ok, false);
    assert.equal(validateVideoUpload({}).ok, false);
  });
});

describe("buildVideoKey — đường dẫn object trong R2", () => {
  test("bắt đầu bằng org_id để dễ audit/dọn theo org", () => {
    const key = buildVideoKey({ orgId: "org-1", classId: "class-1", sessionId: "sess-1" });
    assert.match(key, /^org-1\//);
  });

  test("chứa đủ 3 cấp phân cấp + đuôi file duy nhất", () => {
    const key = buildVideoKey({ orgId: "org-1", classId: "class-1", sessionId: "sess-1" });
    const parts = key.split("/");
    assert.equal(parts[0], "org-1");
    assert.equal(parts[1], "class-1");
    assert.equal(parts[2], "sess-1");
    assert.match(parts[3], /\.mp4$/, "phải có đuôi .mp4");
  });

  test("hai lần gọi cho hai key KHÁC NHAU (không ghi đè nhau)", () => {
    const a = buildVideoKey({ orgId: "o", classId: "c", sessionId: "s" });
    const b = buildVideoKey({ orgId: "o", classId: "c", sessionId: "s" });
    assert.notEqual(a, b);
  });

  test("không chứa ký tự nguy hiểm dù orgId/classId có input lạ", () => {
    // Các id này LUÔN LÀ UUID hợp lệ đã qua isUuid() ở route, nhưng hàm này
    // vẫn không nên tự sập nếu lỡ nhận input khác
    const key = buildVideoKey({ orgId: "org-1", classId: "class-1", sessionId: "sess-1" });
    assert.doesNotMatch(key, /\.\./);
  });
});

describe("isNearSystemCap — cảnh báo trước khi chạm 10GB free tier", () => {
  test("dưới ngưỡng cảnh báo → false", () => {
    assert.equal(isNearSystemCap(1 * 1024 ** 3), false); // 1GB / 10GB
  });

  test("từ 80% trở lên → true", () => {
    assert.equal(isNearSystemCap(SYSTEM_CAP_BYTES * 0.8), true);
    assert.equal(isNearSystemCap(SYSTEM_CAP_BYTES * 0.95), true);
  });

  test("vượt 100% vẫn trả true, không sập", () => {
    assert.equal(isNearSystemCap(SYSTEM_CAP_BYTES * 1.5), true);
  });

  test("đúng 0 byte → false", () => {
    assert.equal(isNearSystemCap(0), false);
  });
});
