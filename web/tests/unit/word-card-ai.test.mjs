// Test cho việc tải nội dung AI của thẻ từ vựng.
//
// Ba lỗi thật phát hiện 4/9/2026 khi rà soát tính năng "xem nghĩa từ":
//
// 1) LỖI BỊ NUỐT IM LẶNG: `.catch(() => {})` — API lỗi thì người học chỉ
//    thấy định nghĩa tiếng Anh ngắn (word.def_en), không biết AI đã lỗi và
//    không có cách thử lại. Chính vì vậy sự cố Groq ngừng model âm thầm
//    suốt gần một tháng: không ai báo vì không ai THẤY lỗi.
//
// 2) RACE CONDITION: không huỷ request cũ. Người học bấm chuyển từ nhanh
//    (A → B) thì phản hồi của A về sau có thể ghi đè nội dung của B →
//    thẻ từ B hiện nghĩa của từ A. Sai kiến thức, tệ hơn là trống.
//
// 3) THIẾU DEPENDENCY: effect chỉ theo `word.id`, nên đổi trình độ
//    (skillLevel) hay mục tiêu học (learningGoal) thì nội dung KHÔNG được
//    tải lại — người học đổi từ B1 sang C1 vẫn thấy nội dung B1 cũ.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fetchWordContent, buildWordContentBody } from "../../src/lib/word-content-client.js";

const okResponse = (content) => ({
  ok: true,
  json: async () => ({ content }),
});

describe("buildWordContentBody", () => {
  test("gửi đủ trường API cần", () => {
    const b = buildWordContentBody(
      { id: "w1", word: "run", pos: "verb", level: "A1" },
      "C1",
      "ielts",
    );
    assert.deepEqual(b, {
      word_id: "w1", word: "run", pos: "verb", word_level: "A1",
      skill_level: "C1", learning_goal: "ielts",
    });
  });

  test("mặc định B1 + daily khi chưa chọn", () => {
    const b = buildWordContentBody({ id: "w1", word: "run" }, null, undefined);
    assert.equal(b.skill_level, "B1");
    assert.equal(b.learning_goal, "daily");
  });
});

describe("fetchWordContent — lỗi phải nhìn thấy được", () => {
  test("thành công → trả content", async () => {
    const fake = async () => okResponse({ meanings: [{ pos: "verb" }], synonyms: [] });
    const r = await fetchWordContent({ id: "w1", word: "run" }, "B1", "daily", { fetchImpl: fake });
    assert.equal(r.error, null);
    assert.deepEqual(r.content.meanings, [{ pos: "verb" }]);
  });

  test("HTTP lỗi → trả error, KHÔNG nuốt im lặng", async () => {
    const fake = async () => ({ ok: false, status: 502, json: async () => ({ error: "AI down" }) });
    const r = await fetchWordContent({ id: "w1", word: "run" }, "B1", "daily", { fetchImpl: fake });
    assert.equal(r.content, null);
    assert.ok(r.error, "phải có thông báo lỗi để UI hiện ra");
    assert.equal(typeof r.error, "string");
  });

  test("lỗi mạng → trả error chứ không throw ra ngoài", async () => {
    const fake = async () => { throw new Error("ECONNRESET"); };
    const r = await fetchWordContent({ id: "w1", word: "run" }, "B1", "daily", { fetchImpl: fake });
    assert.equal(r.content, null);
    assert.ok(r.error);
  });

  test("API trả 200 nhưng không có content → coi là lỗi", async () => {
    const fake = async () => okResponse(null);
    const r = await fetchWordContent({ id: "w1", word: "run" }, "B1", "daily", { fetchImpl: fake });
    assert.equal(r.content, null);
    assert.ok(r.error, "200 mà rỗng vẫn là thất bại với người dùng");
  });

  test("thông báo lỗi bằng TIẾNG VIỆT — người học là người Việt", async () => {
    const fake = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const r = await fetchWordContent({ id: "w1", word: "run" }, "B1", "daily", { fetchImpl: fake });
    assert.match(r.error, /[àáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i,
      "thông báo phải là tiếng Việt");
  });
});

describe("fetchWordContent — huỷ request (race condition)", () => {
  test("bị abort → KHÔNG trả về content lẫn error (tránh ghi đè từ mới)", async () => {
    const fake = async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; };
    const r = await fetchWordContent({ id: "w1", word: "run" }, "B1", "daily", { fetchImpl: fake });
    assert.equal(r.aborted, true, "phải báo là đã huỷ");
    assert.equal(r.content, null);
    assert.equal(r.error, null, "request bị huỷ không phải lỗi của người dùng — đừng hiện thông báo");
  });

  test("truyền signal xuống fetch để huỷ được", async () => {
    let gotSignal = null;
    const fake = async (_url, opts) => { gotSignal = opts.signal; return okResponse({ meanings: [] }); };
    const ctrl = new AbortController();
    await fetchWordContent({ id: "w1", word: "run" }, "B1", "daily",
      { fetchImpl: fake, signal: ctrl.signal });
    assert.equal(gotSignal, ctrl.signal);
  });

  test("gọi đúng endpoint bằng POST kèm JSON header", async () => {
    let url = null, opts = null;
    const fake = async (u, o) => { url = u; opts = o; return okResponse({ meanings: [] }); };
    await fetchWordContent({ id: "w1", word: "run" }, "B1", "daily", { fetchImpl: fake });
    assert.equal(url, "/api/ai/word-content");
    assert.equal(opts.method, "POST");
    assert.equal(opts.headers["Content-Type"], "application/json");
    // JSON.stringify bỏ trường undefined, nên so qua một vòng stringify để
    // hai bên cùng luật — tránh test đỏ vì `pos: undefined`.
    const expected = JSON.parse(JSON.stringify(buildWordContentBody({ id: "w1", word: "run" }, "B1", "daily")));
    assert.deepEqual(JSON.parse(opts.body), expected);
  });
});
