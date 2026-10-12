# Kho từ Wordly — schema bản thử (pilot 100 mục)

Mỗi file là một mảng JSON. Một phần tử = một mục từ.

## Mục tiếng Anh (`en-*.json`)

```json
{
  "headword": "record",
  "type": "word",                       // word | phrasal_verb | idiom
  "forms": ["records", "recorded", "recording"],   // dạng biến thể → tra ngược về headword; [] nếu không có
  "senses": [                           // 1–3 nghĩa phổ biến nhất, xếp theo tần suất
    {
      "pos": "noun",                    // noun | verb | adjective | adverb | pronoun | preposition | conjunction | interjection | phrase
      "ipa_us": "/ˈrɛkɚd/",             // IPA kiểu Mỹ, trong dấu /…/
      "ipa_uk": "/ˈrɛkɔːd/",            // IPA kiểu Anh
      "vi": ["hồ sơ", "kỷ lục", "đĩa nhạc"],   // 1–4 nghĩa tiếng Việt NGẮN, là từ/cụm có thật, phổ biến nhất trước
      "def_en": "a piece of evidence or information kept in permanent form",
      "example_en": "She broke the world record.",
      "example_vi": "Cô ấy đã phá kỷ lục thế giới.",
      "cefr": "A2"                      // A1–C2, ước lượng
    }
  ],
  "note_vi": "Danh từ nhấn âm 1 (RE-cord), động từ nhấn âm 2 (re-CORD)."   // tuỳ chọn: lưu ý cách dùng/phát âm; "" nếu không có
}
```

## Mục tiếng Việt (`vi-*.json`)

```json
{
  "headword": "trì hoãn",
  "type": "word",                       // word | phrase | idiom
  "senses": [
    {
      "pos": "verb",
      "en": ["delay", "postpone", "put off"],   // 1–4 tương đương tiếng Anh, phổ biến nhất trước
      "def_vi": "dời việc sang thời điểm muộn hơn",
      "example_vi": "Đừng trì hoãn việc học nữa.",
      "example_en": "Stop putting off your studies."
    }
  ],
  "note_vi": ""
}
```

## Quy tắc chất lượng (bắt buộc)
- Nghĩa tiếng Việt phải là **từ có thật, người Việt dùng hằng ngày**. Không chắc → bỏ nghĩa đó, không đoán.
- Không dịch word-by-word thành ngữ; dịch ý.
- Ví dụ ngắn (≤ 15 từ), tự nhiên, đúng nghĩa của sense đó.
- Từ đọc khác theo từ loại (record, read, live, present…) → mỗi sense có IPA đúng của nó.
- Không sao chép định nghĩa/ví dụ nguyên văn từ từ điển có bản quyền (Oxford, Cambridge…) — tự viết.
