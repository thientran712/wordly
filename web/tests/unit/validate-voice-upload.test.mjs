// Kiểm tra audio ghi âm (fallback khi browser không có Web Speech API)
// trước khi gửi cho Whisper — logic thuần, test không cần network.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateVoiceUpload, MAX_AUDIO_BYTES } from "../../src/lib/translate/image-validation.js";

function fakeFile(mime, size) {
  return { type: mime, size };
}

describe("validateVoiceUpload", () => {
  test("chấp nhận audio webm dưới giới hạn", () => {
    const result = validateVoiceUpload(fakeFile("audio/webm", 1024));
    assert.equal(result.error, null);
  });

  test("chấp nhận mp4, wav, ogg", () => {
    for (const mime of ["audio/mp4", "audio/wav", "audio/ogg"]) {
      assert.equal(validateVoiceUpload(fakeFile(mime, 1024)).error, null);
    }
  });

  test("từ chối mime không hỗ trợ", () => {
    const result = validateVoiceUpload(fakeFile("video/mp4", 1024));
    assert.match(result.error, /không hỗ trợ/);
  });

  test("từ chối file vượt MAX_AUDIO_BYTES", () => {
    const result = validateVoiceUpload(fakeFile("audio/webm", MAX_AUDIO_BYTES + 1));
    assert.match(result.error, /quá lớn/);
  });

  test("chấp nhận file đúng ngay ngưỡng", () => {
    const result = validateVoiceUpload(fakeFile("audio/webm", MAX_AUDIO_BYTES - 1));
    assert.equal(result.error, null);
  });

  test("không phải File/Blob hợp lệ → error, không throw", () => {
    assert.ok(validateVoiceUpload(null).error);
    assert.ok(validateVoiceUpload(undefined).error);
    assert.ok(validateVoiceUpload({}).error);
  });
});
