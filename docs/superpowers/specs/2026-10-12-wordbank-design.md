# Kho từ song ngữ (Wordbank) — Design Spec

Ngày: 2026-10-12
Trạng thái: Hướng + Q1–Q5 đã quyết (mục 12); chờ duyệt văn bản cuối. Bản thử 100 mục đã duyệt.
Phạm vi: **mobile (iOS) + API phục vụ iOS**. Giao diện web người học
đóng băng (sẽ thành trang admin) — xem `PROGRESS.md` 12/10/2026.

## 1. Bối cảnh & vấn đề

Tra từ đơn chiếm ~80% lượt dùng tính năng dịch. Hiện tại một lượt tra từ
tiếng Anh đi qua **hai** nguồn trả phí, không kiểm chứng:

| Phần | Nguồn hiện tại | Vấn đề |
|---|---|---|
| Nghĩa ngắn (ô dịch) | `/api/translate` → DeepL (gói **Free**, 500k ký tự/tháng) | Chỉ 1 nghĩa; DeepL sắp bỏ |
| Từ điển (nghĩa, định nghĩa, ví dụ) | `/api/dictionary` → Gemini Flash-Lite, cache `word_dictionary_cache` | Model rẻ, bịa được (đánh giá mù 10/2026: 5/40 từ đơn bịa từ tiếng Việt), không ai duyệt |
| Phiên âm US/UK | Cùng lượt Gemini ở trên | AI tự viết IPA, không đối chiếu; một IPA cho cả từ → sai với từ đọc khác theo nghĩa (record, live, lead…) |
| Từ tiếng Việt → tiếng Anh | Chỉ `/api/translate` (DeepL, 1 nghĩa, có khi sai từ loại: "trì hoãn" → "postponement") | **Không có từ điển** — `/api/dictionary` chỉ nhận tiếng Anh |
| Cụm động từ, thành ngữ | Chỉ bản dịch | Không có giải thích/ví dụ (từ điển chỉ hiện khi đầu vào là 1 từ) |
| Phát âm | Google TTS Neural2, cache R2 | **Giữ nguyên** (quyết định 12/10) |

Mục tiêu: một **kho từ song ngữ EN↔VI, dựng sẵn bằng Claude, có kiểm
chứng**, làm nguồn chính cho tra từ trên iOS; từ ngoài kho mới gọi AI.

### Kết quả bản thử (đã duyệt 12/10/2026)

100 mục (60 từ EN gồm từ đồng tự khác âm, 20 cụm/thành ngữ, 20 từ VI) —
dữ liệu trong `data/wordbank/batches/0001-pilot-*.json`.

| Kiểm | Kết quả | Có bắt lỗi thật? |
|---|---|---|
| Agent rà soát độc lập | 87 ổn · 13 nhỏ · **0 lỗi** | **Có** (vd. eloquent → "lưu loát" sai sắc thái; thiếu "suối", "tân ngữ") |
| IPA Mỹ ↔ CMUdict | 107/116 khớp; 9 lệch đều là biến thể hợp lệ | Không |
| Nghĩa ↔ DeepL | 87/100 khớp; 13 khác đều là bản Claude tốt hơn/ngang | Không |

Hệ quả cho quy trình: **bỏ đối chiếu DeepL**, **IPA lấy từ nguồn từ điển
thay vì để Claude viết**, **giữ + tăng cường rà soát độc lập**. Lưu ý từ
người rà soát: bộ thử nghiêng về từ quen — rủi ro thật ở từ hiếm (C1/C2,
nghĩa ít gặp) → quy trình phải có lấy mẫu từ hiếm (mục 5.5).

## 2. Mục tiêu / Không làm

**Mục tiêu**
1. Đợt 1: **10k mục EN** (từ + cụm động từ + thành ngữ), nhiều nghĩa, ví dụ
   song ngữ, phiên âm theo từng nghĩa; chiều Việt→Anh có được nhờ đảo ngược
   kho EN + ~1–2k mục VI bù (mục 5.1b). Mở rộng ~30k sau đợt 1.
2. Tra từ trên iOS **không cần gọi AI** với từ trong kho; tức thì khi
   đóng gói vào app (giai đoạn 2).
3. Tắt hẳn DeepL (giai đoạn 3).
4. **Không đổi hợp đồng API đang có** ở giai đoạn 1 → không cần cập nhật
   app để có lợi ích đầu tiên.

**Không làm**
- Không đụng giao diện web người học.
- Không đổi giọng phát âm (giữ Neural2).
- Không chép nội dung (định nghĩa, ví dụ, âm thanh) từ từ điển khác — chỉ
  dùng **danh sách từ** đang có (Q1); nội dung do Claude viết.
- Không dịch câu bằng kho (câu vẫn qua Gemini — branch `feat/translate-hybrid-cost`).

## 3. Các hướng đã cân nhắc

| Hướng | Mô tả | Ưu | Nhược |
|---|---|---|---|
| A. Chỉ server | Kho trong Postgres, API đọc kho trước | Không cần cập nhật app; sửa dữ liệu là có hiệu lực ngay | Vẫn mỗi lượt tra một request → không giảm tải server, không chạy offline |
| B. Chỉ trên máy | SQLite đóng trong app, không qua server | Tức thì, offline, server gần như không tốn | Sửa một mục phải ra bản app mới; app cũ không có lợi ích; cần TestFlight/App Store |
| **C. Theo giai đoạn (chọn)** | Giai đoạn 1 = A; giai đoạn 2 thêm SQLite trên máy + cập nhật dữ liệu theo phiên bản qua API | Lợi ích sớm không cần app mới; về sau có tốc độ + offline + giảm tải; Postgres luôn là nguồn chuẩn | Hai nơi đọc dữ liệu → phải giữ một định dạng xuất chung |

**Chọn C.** Postgres là **nguồn chuẩn duy nhất**; SQLite trên iOS là bản
xuất có phiên bản từ Postgres, không bao giờ sửa trực tiếp.

## 4. Mô hình dữ liệu

### 4.1 Mục từ (định dạng file batch & cột `data`)

Giữ đúng schema bản thử (`data/wordbank/SCHEMA.md`), thêm trường nguồn:

```jsonc
// EN
{
  "headword": "record", "type": "word",            // word | phrasal_verb | idiom
  "forms": ["records", "recorded", "recording"],
  "senses": [{
    "pos": "noun",
    "ipa_us": "/ˈrɛkɚd/", "ipa_uk": "/ˈrɛkɔːd/",
    "ipa_source": "cmudict+wiktionary",            // MỚI: cmudict | wiktionary | claude (claude = chưa đối chiếu)
    "vi": ["kỷ lục", "hồ sơ", "đĩa nhạc"],
    "def_en": "…", "example_en": "…", "example_vi": "…", "cefr": "A2"
  }],
  "note_vi": "Danh từ nhấn âm 1, động từ nhấn âm 2."
}
// VI: senses[].en thay cho vi, def_vi thay cho def_en, không có IPA.
```

### 4.2 Bảng Postgres (migration mới, chưa chạy ở đâu)

```sql
wordbank_entries (
  id            bigint generated always as identity primary key,
  lang          text not null check (lang in ('EN','VI')),
  headword      text not null,              -- dạng gốc, giữ hoa/thường
  headword_key  text not null,              -- chuẩn hoá: lower, NFC, trim, gộp khoảng trắng
  type          text not null,
  data          jsonb not null,             -- toàn bộ mục từ (4.1)
  status        text not null default 'draft'
                check (status in ('draft','reviewed','approved','rejected')),
  source        text not null,              -- 'claude-batch-0001' | 'gemini-runtime' | 'manual'
  review        jsonb,                      -- nhận xét rà soát (verdict, issues)
  version       integer not null default 1,
  updated_at    timestamptz not null default now(),
  unique (lang, headword_key)
)

wordbank_forms (                            -- dạng biến thể → mục gốc, NHIỀU-NHIỀU
  lang      text not null,
  form_key  text not null,                  -- "wound", "lives", "lighter"
  entry_id  bigint not null references wordbank_entries(id) on delete cascade,
  primary key (lang, form_key, entry_id)
)

wordbank_releases (                         -- mỗi lần xuất SQLite cho iOS
  version     integer primary key,
  entry_count integer not null,
  sha256      text not null,
  url         text not null,                -- R2
  created_at  timestamptz not null default now()
)
```

- `wordbank_forms` nhiều-nhiều vì một dạng thuộc nhiều từ ("wound" →
  *wind* và *wound*; "lives" → *live* và *life*) — lỗi bản thử phát hiện.
- RLS bật cả 3 bảng. Nội dung là từ điển công khai (không có dữ liệu
  người dùng) → cho `authenticated` SELECT các dòng `approved`, giống
  `word_dictionary_cache`; ghi chỉ `service_role` (script nạp dữ liệu,
  job runtime). Kiểm bằng `web/tests/rls/`.
- `word_dictionary_cache` giữ nguyên làm cache cho từ **ngoài kho** cho
  tới giai đoạn 3.

## 5. Quy trình dựng dữ liệu (Claude)

### 5.1 Danh sách từ (quyết định Q1, Q5)
- **Mục tiêu đợt 1: 10k mục EN** (Q5). Mở rộng sau khi đợt 1 chạy ổn.
- **Nguồn = danh sách đang có** (Q1, chủ dự án chấp nhận rủi ro bản quyền
  của danh sách): ~7.5k từ trong bảng `words` / `web/scripts/*.json`.
  Chỉ lấy **danh sách từ** — nội dung (nghĩa, ví dụ) do Claude viết, IPA
  từ CMUdict/Wiktionary, nên không cần chép định nghĩa/âm thanh Oxford.
- Bù ~2.5k còn lại theo **nhu cầu thật**: từ người dùng đã tra
  (`word_dictionary_cache`, `translate_history` có 1–3 từ) chưa có trong
  danh sách, rồi ~1–2k cụm động từ / thành ngữ phổ biến.
- Thứ tự dựng: từ người dùng tra nhiều nhất trước, rồi theo CEFR A1→C2.

### 5.1b Chiều Việt → Anh (quyết định Q2)
Không dựng riêng một kho tiếng Việt. **Đảo ngược kho EN**: mỗi nghĩa tiếng
Việt `vi[]` của mục EN là một khoá tra Việt→Anh trỏ về headword EN (vd.
"trì hoãn" → put off, delay, postpone, procrastinate). Chi phí ~0, tự có
khi kho EN lớn dần.

Đảo ngược không phủ được 3 loại — bù bằng một **danh sách nhỏ do Claude
viết** (ước ~1–2k mục, schema VI như bản thử):
1. Từ Việt không có một từ Anh tương ứng (nhậu, thất tình, tăng ca).
2. Từ lóng/vay mượn mang nghĩa khác tiếng Anh (chill, deadline, sếp).
3. Từ Việt nhiều nghĩa cần tách theo ngữ cảnh (nhớ = remember/miss,
   thương, bận).
Chọn danh sách bù từ lượt tra Việt→Anh thật bị trượt (log ở giai đoạn 1).
Gloss dài kiểu giải thích ("cơn mệt mỏi sau khi say rượu") **không** thành
khoá tra — chỉ gloss ≤ 4 từ.

### 5.2 Phiên âm (không để Claude tự viết)
- US: **CMUdict** (giấy phép kiểu BSD, cần ghi nguồn), chuyển ARPAbet → IPA
  bằng bảng ánh xạ cố định (đã có bản nháp trong công cụ bản thử).
  CMUdict có nhiều cách đọc cho từ đồng tự khác âm → Claude chỉ **chọn**
  biến thể đúng cho từng nghĩa, không tự viết IPA.
- UK: **Wiktionary** (CC BY-SA) — lấy IPA gắn nhãn RP/UK.
- Thiếu cả hai nguồn (thường là cụm từ): Claude viết, `ipa_source = "claude"`,
  bắt buộc vào hàng duyệt.

### 5.3 Sinh nội dung
- Lô 80 mục / agent, nhiều agent song song, schema + quy tắc như bản thử.
- Danh sách nghĩa cần có đưa **vào prompt** từ dữ liệu (WordNet — giấy
  phép mở — + tần suất) để không sót nghĩa phổ biến (lỗi "suối", "tân ngữ"
  ở bản thử). Claude vẫn được bỏ nghĩa hiếm.

### 5.4 Kiểm chứng (mỗi lô)
1. **Kiểm tự động** (script có test, chạy cả trong CI cho mọi file
   `data/wordbank/batches/*.json`): đúng schema, từ loại hợp lệ, IPA trong
   `/…/`, `vi` có dấu tiếng Việt, ví dụ ≤ 15 từ, không trùng `headword_key`,
   dạng biến thể không trỏ vào chính nó.
2. **Rà soát độc lập** (agent khác, không thấy prompt sinh): verdict
   ok/minor/error + lý do. Thêm một lượt **chuyên kiểm sắc thái**: từng
   nghĩa tiếng Việt có đúng với `def_en` không (bắt lỗi kiểu "lưu loát").
3. **Người duyệt**: chủ dự án duyệt **mọi** mục `error`/`minor` + lấy mẫu
   ngẫu nhiên 2–5% mục `ok`, phân theo CEFR và từ loại, qua trang duyệt
   (`data/wordbank/tools/build-review.mjs`).
4. Ngưỡng dừng: lô nào tỉ lệ lỗi trong mẫu người duyệt > 2% → sinh lại cả
   lô, không vá từng mục.

### 5.5 Thử từ hiếm trước khi chạy hàng loạt
Trước khi dựng 10k: một lô **200 từ chọn ngẫu nhiên, nghiêng về C1/C2**,
qua đúng quy trình 5.2–5.4. Đạt ngưỡng ở 5.4 mới chạy tiếp.

### 5.6 Nạp vào Postgres
- File batch đã duyệt → script nạp (upsert theo `lang, headword_key`,
  tăng `version` khi đổi nội dung) → `status = 'approved'`.
- Chạy nạp lên production **chỉ khi chủ dự án đồng ý** (giống migration).
- File batch nằm trong repo (`data/wordbank/batches/`) — git là lịch sử
  sửa đổi của từng mục.

## 6. Phục vụ trên iOS

### Giai đoạn 1 — Server đọc kho (không cần cập nhật app)
- `/api/dictionary` (EN): tra `wordbank_entries` theo `headword_key`, rồi
  theo `wordbank_forms` ("running" → *run*); có thì trả đúng hợp đồng cũ:
  - `phoneticUs/Uk` = IPA của nghĩa đầu tiên.
  - `meanings[pos].defs[]` = `{ def: def_en, def_vi: vi.join(", "), example: example_en }`.
  - **Thêm** trường mới, app cũ bỏ qua: `senses` (đủ IPA từng nghĩa,
    `example_vi`), `note_vi`, `forms`, `matchedForm`, `source: "wordbank"`.
  - Không có trong kho → luồng Gemini + `word_dictionary_cache` như cũ.
- `/api/translate` với đầu vào ≤ 3 từ: tra kho trước (EN→VI lấy `vi`
  nghĩa đầu, VI→EN lấy `en` nghĩa đầu, nối 2–3 nghĩa phổ biến); không có
  → DeepL như hiện tại. Giữ hợp đồng `{ translated, detectedLang }`.
- Đo: tỉ lệ trúng kho, số ký tự DeepL, số lượt Gemini cho từ điển.

### Giai đoạn 2 — SQLite trong app
- Script xuất `wordbank_entries` (approved) → file SQLite (bảng entries +
  forms + FTS cho gợi ý), nén, đẩy lên R2, ghi `wordbank_releases`.
  Ước lượng vài MB sau nén cho ~10k mục — **cần đo**.
- App: đóng gói bản xuất mới nhất lúc build; lúc mở app hỏi
  `GET /api/wordbank/latest` → có bản mới thì tải nền qua Wi-Fi, kiểm
  `sha256`, thay file. Dùng SQLite hệ thống (`import SQLite3`), **không
  thêm thư viện**.
- `TranslateViewModel`: tra SQLite trước (cả EN và VI), không có mới gọi
  API. Từ điển hiện được khi offline.
- UI mới: **từ điển tiếng Việt → tiếng Anh**, hiện cụm/thành ngữ, IPA
  theo từng nghĩa, `note_vi`. Thiết kế UI chi tiết = spec riêng.
- Ra bản app → theo quy tắc TestFlight hiện hành (chỉ khi chủ dự án yêu cầu).

### Giai đoạn 3 — Tắt DeepL, từ mới đi Gemini có tự kiểm
- Từ ≤ 3 từ không có trong kho → **Gemini 2.5-flash** (không dùng bản
  lite cho từ đơn) với prompt tự kiểm ("chỉ trả từ tiếng Việt có thật,
  không chắc thì để trống"), trả theo schema 4.1, ghi vào
  `wordbank_entries` với `status = 'draft'`, `source = 'gemini-runtime'`
  → vào hàng duyệt. Người dùng vẫn thấy kết quả ngay (gắn nhãn
  "AI — chưa duyệt" trong app).
- Bỏ `DEEPL_API_KEY`. Dự phòng dịch câu khi Gemini lỗi: **Groq** (Q3,
  key đã có). Trước khi bật: chạy lại bộ 75 mục đánh giá mù với model Groq
  để chọn model cho tiếng Việt.

## 7. Âm thanh (quyết định Q4)
- **Giữ nguyên như hiện tại:** Neural2, tạo khi người dùng bấm nghe, cache
  R2 (`/api/tts` + `tts-cache.js`). **Không** tạo sẵn audio cho kho, **không**
  làm audio theo từng nghĩa cho từ đồng tự khác âm — đỡ chuẩn bị và lưu trữ.
- Mỗi từ chỉ trả tiền TTS lần đầu có người nghe, sau đó dùng chung từ R2.

## 8. Giấy phép & ghi nguồn
| Nguồn | Giấy phép | Nghĩa vụ |
|---|---|---|
| CMUdict | Kiểu BSD | Giữ thông báo bản quyền trong màn hình "Giới thiệu/Nguồn dữ liệu" của app |
| Wiktionary (IPA UK) | CC BY-SA | Ghi nguồn + giấy phép; tách lớp IPA khỏi nội dung Claude để phạm vi ShareAlike rõ ràng |
| WordNet (danh sách nghĩa đưa vào prompt) | Giấy phép WordNet (cho phép dùng thương mại) | Ghi nguồn |
| Nội dung Claude sinh | Thuộc dự án | — |
| Danh sách từ trong repo (`words`, `oxford-5000.json`, GRE) | Có thể có bản quyền | Chỉ dùng **danh sách từ** (Q1, chủ dự án chấp nhận rủi ro); không chép định nghĩa/âm thanh |

Màn hình "Nguồn dữ liệu" trong app iOS là việc bắt buộc của giai đoạn 2.

## 9. Kiểm thử (TDD theo `CLAUDE.md`)
- `web/tests/unit/`: chuẩn hoá `headword_key`; tra theo dạng biến thể
  (nhiều-nhiều); ánh xạ mục kho → hợp đồng `/api/dictionary` cũ (dùng
  `0001-pilot-*.json` làm dữ liệu test); script kiểm batch; ARPAbet → IPA.
- `web/tests/rls/`: `authenticated` chỉ đọc được `approved`, không ghi được.
- iOS (`WordlyiOSTests`): đọc SQLite, tra theo dạng, rơi về API khi thiếu,
  thay file khi có bản mới (kiểm sha256).

## 10. Chi phí
| Hạng mục | Chi phí |
|---|---|
| Sinh nội dung bằng Claude Code | Trong gói Claude hiện có, không có hoá đơn API |
| Âm thanh | Như hiện tại — TTS khi có người nghe, cache R2 (Q4) |
| Lưu file SQLite trên R2 | ~$0 (trong hạn mức miễn phí, tải xuống miễn phí) |
| Gemini cho từ ngoài kho | Rất nhỏ — mỗi từ một lần |
| Bỏ được | DeepL; phần lớn lượt Gemini của từ điển; ~80% request tra từ tới server (giai đoạn 2) |

Công người: duyệt mục error/minor + mẫu 2–5% mỗi lô.

## 11. Rủi ro
- **Từ hiếm** chất lượng thấp hơn bản thử → mục 5.5 trước khi chạy hàng loạt.
- **Duyệt tốn công**: 10k mục × ~13% minor ≈ 1.3k mục cần xem → duyệt dần,
  ưu tiên theo tần suất; mục chưa duyệt vẫn dùng được nhưng gắn nhãn.
- **Dung lượng app** tăng → đo ở giai đoạn 2; có thể tách gói cơ bản
  (10k từ phổ biến) đóng trong app + phần còn lại tải sau.
- **Lệch dữ liệu SQLite ↔ Postgres** → Postgres là nguồn chuẩn duy nhất,
  app chỉ nhận bản xuất có `version` + `sha256`.

## 12. Quyết định của chủ dự án (12/10/2026)
- **Q1** Dùng danh sách từ đang có trong repo/bảng `words`, chấp nhận rủi ro
  bản quyền của danh sách.
- **Q2** Không dựng kho tiếng Việt riêng — đảo ngược kho EN + danh sách bù
  nhỏ (mục 5.1b).
- **Q3** Dự phòng dịch câu khi Gemini lỗi: Groq.
- **Q4** Âm thanh giữ nguyên: gọi TTS khi cần rồi cache, không tạo sẵn.
- **Q5** Đợt 1: 10k mục EN.

## 13. Thứ tự triển khai
1. Lô thử 200 từ hiếm (5.5) → duyệt.
2. Migration 3 bảng + script kiểm batch + script nạp (TDD) → nạp lô 0001.
3. Giai đoạn 1: `/api/dictionary` + `/api/translate` đọc kho (TDD) → deploy.
4. Dựng dữ liệu hàng loạt theo tần suất (5.1–5.4), nạp theo lô.
5. Giai đoạn 2: xuất SQLite + iOS đọc kho + UI từ điển VI + màn hình nguồn.
6. Giai đoạn 3: từ mới qua Gemini có tự kiểm, tắt DeepL.
