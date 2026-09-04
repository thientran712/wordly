# Wordly — Tài liệu giới thiệu sản phẩm

> **Mỗi ngày một từ mới — Học tiếng Anh thú vị và hiệu quả**
>
> Nền tảng học từ vựng tiếng Anh dành cho người Việt trẻ (20–30 tuổi), kết hợp
> dịch thuật, spaced repetition, AI hội thoại và email nhắc học tự động.

| | |
|---|---|
| **Tên sản phẩm** | Wordly |
| **Đối tượng** | Người Việt 20–30 tuổi học tiếng Anh (giao tiếp, TOEIC, IELTS, TOEFL) |
| **Ngôn ngữ giao diện** | Tiếng Việt (`<html lang="vi">`) |
| **Nền tảng** | Web app (Next.js) + iOS app native (SwiftUI) + Email |
| **Quy mô mã nguồn** | ~10.000 dòng JS (web) + ~5.000 dòng Swift (iOS) |
| **Lịch sử phát triển** | 131 commits, từ 2026-05-08 đến 2026-08-28 |
| **Kho từ vựng** | ~8.400 từ (5.944 Oxford 5000 + 2.478 GRE) |

---

## Mục lục

1. [Tầm nhìn sản phẩm](#1-tầm-nhìn-sản-phẩm)
2. [Bản đồ tính năng](#2-bản-đồ-tính-năng)
3. [Nghiệp vụ chi tiết](#3-nghiệp-vụ-chi-tiết)
4. [Kiến trúc hệ thống](#4-kiến-trúc-hệ-thống)
5. [Mô hình dữ liệu](#5-mô-hình-dữ-liệu)
6. [API surface](#6-api-surface)
7. [Hạ tầng & vận hành](#7-hạ-tầng--vận-hành)
8. [Bảo mật](#8-bảo-mật)
9. [Design system](#9-design-system)
10. [Ứng dụng iOS](#10-ứng-dụng-ios)
11. [Data pipeline](#11-data-pipeline)
12. [Lộ trình phát triển](#12-lộ-trình-phát-triển)

---

## 1. Tầm nhìn sản phẩm

### 1.1. Vấn đề

Người Việt học tiếng Anh gặp ba vấn đề kinh điển:

1. **Tra từ rồi quên** — tra Google Translate xong đóng tab, không có gì giữ lại.
2. **Học từ không có ngữ cảnh** — thuộc nghĩa nhưng không biết dùng khi nào.
3. **Không có ai để nói chuyện** — kỹ năng nói không thể tự luyện một mình.

### 1.2. Giải pháp của Wordly

Wordly không phải một app flashcard nữa. Triết lý cốt lõi:

> **Từ vựng đáng học nhất là từ chính bạn vừa tra.**

Thay vì ép người dùng học một bộ từ định sẵn, Wordly biến **hành vi tra từ tự
nhiên** thành nguồn dữ liệu học tập:

```
Người dùng tra từ  →  Lưu vào lịch sử  →  Trở thành thẻ spaced-repetition
                                        →  Gửi email nhắc đúng lúc sắp quên
                                        →  Luyện nói từ đó với AI
```

### 1.3. Ba trụ cột

| Trụ cột | Mô tả | Điểm khác biệt |
|---|---|---|
| **Dịch & Tra cứu** | DeepL + từ điển AI tích hợp | Tra một lần, tự động thành thẻ học |
| **Ghi nhớ chủ động** | FSRS spaced repetition qua email | Không cần mở app, email tự tìm đến |
| **Luyện nói** | Chat/nói với AI "Alex" | Hands-free bằng VAD, không cần bấm nút |

### 1.4. Giọng điệu sản phẩm (Product voice)

Wordly có một quyết định thiết kế rất đặc trưng: **memory hook bằng tiếng Việt
đời thường**. AI được prompt để giải thích nghĩa từ theo giọng "thằng bạn thân
nói thẳng", xưng *mày–tao*:

> **besmirch** → *"Tao vừa bị con nào đó dìm hàng sau lưng, giờ cả đám nhìn tao
> như nhìn cái thứ gì đó tệ hại — đó là bị besmirch đấy mày."*
>
> **procrastinate** → *"Mày hỏi tao bài tập đâu? Tao để mai làm. Hôm qua tao cũng
> nói vậy. Đó gọi là procrastinate, lười có hệ thống."*

Đây là "unfair advantage" về mặt trải nghiệm — nội dung mà một app quốc tế
không thể sao chép, vì nó đòi hỏi hiểu văn hoá ngôn ngữ bản địa.

---

## 2. Bản đồ tính năng

```
┌─────────────────────────────────────────────────────────────────┐
│                          WORDLY                                  │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│  DỊCH THUẬT  │   GHI NHỚ    │  LUYỆN NÓI   │      HỒ SƠ         │
├──────────────┼──────────────┼──────────────┼────────────────────┤
│ Inline       │ FSRS engine  │ Chat vs Alex │ Trình độ CEFR      │
│ translate    │ Email nhắc   │ VAD rảnh tay │ Mục tiêu học       │
│ Từ điển AI   │ Lịch sử dịch │ TTS Neural2  │ Khung giờ email    │
│ Phát âm US/UK│ English Quote│ Spinner chủ đề│ Streak / thống kê │
│ Lịch sử      │ Watchdog     │ IELTS frames │ Dark / Light mode  │
└──────────────┴──────────────┴──────────────┴────────────────────┘
```

### 2.1. Trạng thái tính năng

| Tính năng | Route | Trạng thái | Guest dùng được |
|---|---|---|---|
| Dịch & từ điển | `/` | ✅ Production | ✅ Có |
| Lịch sử dịch | `/` | ✅ Production | ❌ Cần đăng nhập |
| Chat với Alex | `/practice` | ✅ Production | ❌ Cần đăng nhập |
| English Quote (Journal) | `/journal` | ✅ Production | ❌ Cần đăng nhập |
| Hồ sơ & Email settings | `/profile` | ✅ Production | ❌ Cần đăng nhập |
| Luyện nói (Spinner) | `/speak` | 🚧 Ẩn khỏi nav | ✅ Có |
| Học từ mới (Vocab chat) | `/vocabulary-chat` | 🚧 Ẩn khỏi nav | ❌ Cần đăng nhập |

> **Ghi chú:** `/speak` và `/vocabulary-chat` đã được xây dựng đầy đủ nhưng
> hiện bị comment out khỏi sidebar (`src/components/AppSidebar.js:14,17`) —
> code vẫn chạy được nếu truy cập trực tiếp URL.

---

## 3. Nghiệp vụ chi tiết

### 3.1. Luồng dịch thuật — trái tim của sản phẩm

Đây là màn hình mặc định (`/`) và là điểm vào chính của mọi người dùng.

```
┌──────────────────────────────────────────────────────────┐
│  1. Người dùng gõ / dán text (tối đa 10.000 ký tự)      │
│                          ↓                               │
│  2. POST /api/translate  →  DeepL API (EN↔VI)           │
│                          ↓                               │
│  3. Nếu là 1 từ đơn → POST /api/dictionary               │
│         ├─ Cache hit  → trả từ word_dictionary_cache     │
│         └─ Cache miss → Groq llama-3.1-8b-instant        │
│                          ↓ (ghi cache)                   │
│  4. Hiển thị: IPA US + UK, tối đa 3 nghĩa,               │
│     mỗi nghĩa có def EN + nghĩa VI + ví dụ               │
│                          ↓                               │
│  5. Auto-save vào translate_history (is_saved = false)   │
│                          ↓                               │
│  6. Người dùng bấm "Lưu" → is_saved = true               │
│         → Từ này trở thành thẻ spaced-repetition         │
└──────────────────────────────────────────────────────────┘
```

#### Thang debounce ba tầng

Màn hình dịch dùng **ba mức debounce khác nhau**, mỗi mức phục vụ một mục đích:

| Độ trễ | Hành động | Lý do |
|---|---|---|
| **150ms** | Gợi ý từ (Datamuse `api.datamuse.com`, `cache: "force-cache"`) | Phải theo kịp tốc độ gõ |
| **280ms** | Dịch qua DeepL | Cân bằng giữa phản hồi nhanh và số lời gọi API |
| **10 giây** | Tự ghi vào `translate_history` (`is_saved: false`) | Gõ nháp không làm rác bảng lịch sử |

Có **bảo vệ race condition** qua `translateReqRef`: phản hồi cũ không thể ghi đè
kết quả mới hơn, nhưng cờ `isTranslating` luôn được clear để UI không kẹt ở
trạng thái "Đang dịch..." (chính là bug đã sửa ở commit `02ac63d`). Ngoài ra có
cache in-memory: `translateCache` (giới hạn 100 mục, FIFO) và `dictCache` (50).

#### Chuỗi onboarding ba bước

Một chi tiết product đáng chú ý — dẫn dắt người dùng tới tính năng email:

```
Lần lưu từ ĐẦU TIÊN
   → Toast 6 giây giải thích "từ đã lưu sẽ được gửi qua email"
   → Khi toast đóng: hiện banner mời bật nhắc qua email
   → Đồng ý: PUT /api/email-preferences + POST /api/email-slots (08:00)
```

Mỗi bước gác bởi một key `localStorage` riêng (`wordly-seen-save-explainer`,
`wordly-seen-email-invite`), chỉ hiện **đúng một lần trong đời** bất kể kết quả;
nếu API lỗi thì banner giữ nguyên để thử lại. Mọi truy cập `localStorage` đều
bọc try/catch.

**Quy tắc nghiệp vụ quan trọng:**

- Mọi lần dịch đều được ghi lại, nhưng **chỉ từ được `is_saved = true` mới vào
  hàng đợi email**. Điều này tránh spam người dùng bằng những từ họ chỉ tra
  lướt qua.
- Cache từ điển là **toàn cục, không theo người dùng** — từ "resilient" chỉ gọi
  AI đúng một lần cho toàn hệ thống, các lần sau đọc từ Postgres. Đây là tối ưu
  chi phí quan trọng.
- Cờ `hasMoreMeanings` được tính **deterministic** (`meanings.length >= 3`) chứ
  không hỏi AI, vì model 8B tự đánh giá không đáng tin (comment trong code nêu
  rõ ví dụ từ "run" bị trả sai).

### 3.2. Động cơ ghi nhớ — FSRS + Email

Đây là phần **phức tạp nhất và giá trị nhất** của hệ thống.

#### 3.2.1. Hai hàng đợi hợp nhất

Wordly gộp hai nguồn nội dung thành một hàng đợi ôn tập duy nhất:

| Nguồn | Bảng | Nội dung |
|---|---|---|
| Từ đã lưu khi dịch | `translate_history` | Từ EN + nghĩa VI |
| English Quote | `journal_entries` | Câu / bài học / ghi chú tự do |

Mỗi email gửi đi gồm **2 từ vựng + 1 quote**.

#### 3.2.2. Thuật toán chọn nội dung

`src/lib/select-word-for-email.js` dùng thuật toán 2 mức ưu tiên:

```
Ưu tiên 1: DUE  — state ≠ 'new' và due_at đã qua
                  → sắp xếp theo due_at tăng dần (quá hạn lâu nhất trước)

Ưu tiên 2: NEW  — state = 'new', chưa từng gửi
                  → sắp xếp theo created_at tăng dần (FIFO)
```

**Chống trùng lặp:** truy vấn `email_log` 12 giờ gần nhất để lấy `entry_ids` đã
gửi, đảm bảo hai khung giờ trong cùng một ngày không bao giờ gửi trùng từ.

#### 3.2.3. Lịch giãn cách

```javascript
EMAIL_INTERVALS = [1, 3, 7, 14, 30, 90]  // đơn vị: ngày
```

Sau mỗi lần gửi, `due_at = now + INTERVALS[review_count]`. Lần gửi đầu → 1 ngày
sau, lần 2 → 3 ngày, ... đến bucket cuối giữ nguyên 90 ngày vô hạn.

> **Lưu ý kỹ thuật — hai hệ SRS song song:** Hệ thống email dùng **lịch cố định**
> này chứ không dùng thuật toán FSRS. Thư viện `ts-fsrs` (`src/lib/fsrs.js`,
> cấu hình `requestRetention: 0.90`, `maximumInterval: 365`, `enableFuzz: true`)
> tồn tại đầy đủ nhưng **không được import bởi bất kỳ file nào trong `src/`** —
> đã kiểm chứng bằng grep. Hai hệ dùng chung các cột DB (`state`, `stability`,
> `difficulty`, `due_at`) nhưng khác nhau về toán học. Trên thực tế chỉ lịch cố
> định đang chạy; `fsrs.js` là code chết chờ luồng review chấm điểm
> Again/Hard/Good/Easy được khôi phục.

#### 3.2.4. Kiến trúc lập lịch email (Inngest)

Đây là phần được đầu tư nhiều công sức nhất — lịch sử git cho thấy **hơn 15
commit** chỉ để sửa các lỗi race condition, timezone và duplicate.

```
     Người dùng lưu cài đặt email
                 ↓
     event: email/schedule.updated
                 ↓
     ┌───────────────────────────┐
     │  scheduleAllSlots         │  debounce 5s theo user_id
     │  1. Load slots enabled    │
     │  2. Gửi email/slot.cancelled (huỷ run cũ)
     │  3. sleep 3s (chờ cancel lan truyền)
     │  4. Gửi email/slot.scheduled
     └───────────────────────────┘
                 ↓
     ┌───────────────────────────┐
     │  sendSlotEmail (1 run/slot)│
     │  Step 1: load lịch → tính nextSendDate
     │  Step 2: sleepUntil(giờ gửi)   ← ngủ có thể vài giờ
     │  Step 3: recheck (user có thể đã tắt trong lúc ngủ)
     │  Step 4: chọn nội dung 2 từ + 1 quote
     │  Step 5: gửi mail qua Gmail SMTP
     │  Step 6: ghi email_log
     │  Step 7: advance due_at cho mọi entry
     │  Step 8: tự lên lịch cho NGÀY MAI
     └───────────────────────────┘
                 ↓
     ┌───────────────────────────┐
     │  watchdogReschedule       │  cron: 0 * * * * (mỗi giờ)
     │  Tìm slot có last_scheduled_at > 25h
     │  → hồi sinh chuỗi lịch bị đứt
     └───────────────────────────┘
```

**Các quyết định thiết kế đáng chú ý:**

| Vấn đề | Giải pháp |
|---|---|
| Vòng lặp gửi vô hạn | Sau khi gửi, luôn `forceTomorrow = true` khi tính lịch kế |
| Độ trễ Inngest/Vercel | Grace period 2 phút — nếu vừa lỡ giờ < 2 phút thì gửi ngay |
| Race giữa 2 slot cùng ngày | Loại trừ `entry_ids` đã gửi trong 12h qua |
| Người dùng sửa cài đặt liên tục | Debounce 5s + `cancelOn` với so sánh `triggeredAt` |
| Chuỗi lịch bị đứt (deploy, lỗi) | Watchdog mỗi giờ tự hồi sinh slot "chết" |
| Timezone sai | `Intl.DateTimeFormat` tính offset thực, fallback `Asia/Ho_Chi_Minh` |
| Email gửi rồi nhưng DB lỗi | Step 7 throw → Inngest retry riêng step đó, không gửi lại mail |

Cơ chế `cancelOn` dùng biểu thức:
```
event.data.slot_id == async.data.slot_id &&
event.data.triggeredAt >= async.data.triggeredAt
```
với `scheduledAt = cancelledAt + 1` để run mới không tự huỷ chính nó.

### 3.3. Luyện nói với AI "Alex"

**Route:** `/practice` — màn hình lớn nhất của app (944 dòng).

#### 3.3.1. Nhân vật Alex

Alex là "native American English conversation partner" với ràng buộc rất chặt:

```
✓ Trả lời TỐI ĐA 1–2 câu
✓ LUÔN kết thúc bằng một câu hỏi mở
✓ Sửa lỗi ngầm — dùng đúng cấu trúc trong câu trả lời, không giảng giải
✗ KHÔNG bao giờ trả lời bằng tiếng Việt
✗ KHÔNG tự trả lời câu hỏi của chính mình
✗ KHÔNG giảng bài dài dòng
```

Mục tiêu thiết kế: **ép người học nói nhiều nhất có thể**, AI nói ít nhất có thể.

#### 3.3.2. Guardrails (SCOPE_GUARDRAILS)

Prompt có một khối bảo vệ phạm vi rất chi tiết, từ chối:

- Viết / debug code
- Giải toán, lý, hoá, bài tập
- Viết luận hộ để nộp
- Tin tức, chính trị, tư vấn y tế / pháp lý / tài chính
- **Prompt injection** — mọi yêu cầu "quên rules", "pretend to be another AI"
- Roleplay không liên quan học tiếng Anh

Cách từ chối được quy định rõ: ngắn gọn, thân thiện, rồi **lập tức quay lại câu
hỏi luyện tập** — không xin lỗi dài dòng, không phá vỡ nhân vật.

#### 3.3.3. Chế độ học một từ cụ thể

Khi vào từ một từ vựng (`word_id`), prompt đổi sang `WORD_SYSTEM_PROMPT`: tin
nhắn **đầu tiên** được phép dài — một mini-lesson có cấu trúc:

1. **Meaning** — định nghĩa đơn giản (1 câu)
2. **Example** — một câu ví dụ tự nhiên
3. **Collocation / idiom** — nếu thực sự tồn tại (bỏ qua nếu gượng ép)
4. Kết bằng một câu hỏi mở mời người học tự dùng từ đó

Từ tin nhắn thứ hai trở đi, quay về quy tắc 1–2 câu.

#### 3.3.4. Hands-free bằng VAD

Điểm kỹ thuật nổi bật: người dùng **không cần bấm nút micro**.

- Thư viện `@ricky0123/vad-web` chạy model **Silero VAD** (ONNX) ngay trên trình duyệt
- Model được self-host trong `public/` (`silero_vad_v5.onnx`, `silero_vad_legacy.onnx`)
- ONNX Runtime WASM cũng self-host (`ort-wasm-simd-threaded.wasm`)
- Cấu hình `numThreads = 1` để tương thích môi trường serverless/Vercel

Luồng: VAD phát hiện có tiếng nói → tự ghi âm → im lặng → tự dừng → gửi
transcript → Alex trả lời → TTS đọc lên → lặp lại. Hoàn toàn rảnh tay.

#### 3.3.5. Quản lý phiên luyện tập

Bảng `practice_sessions` cho phép: xem lại danh sách phiên ở sidebar, đổi tên,
xoá, và **tiếp tục phiên cũ** với đầy đủ lịch sử hội thoại.

### 3.4. Phát âm (TTS)

**Route:** `/api/tts` → Google Cloud Text-to-Speech.

| Ngôn ngữ | Giọng |
|---|---|
| `en-US` | `en-US-Neural2-D` |
| `en-GB` | `en-GB-Neural2-D` |
| `vi-VN` | `vi-VN-Neural2-A` |

Người dùng chọn được **giọng Mỹ hoặc Anh** cho phần phát âm từ vựng.

**Tối ưu hiệu năng đáng chú ý:** thay vì dùng SDK Google, code tự ký JWT
RS256 bằng `crypto.createSign` và **cache access token ở module scope** (hết hạn
1 giờ, refresh sớm 1 phút). Comment trong code ghi rõ điều này tiết kiệm
**~70–270ms mỗi request** so với việc mint JWT mỗi lần gọi.

Private key được lưu dạng **base64** (`GOOGLE_TTS_PRIVATE_KEY_BASE64`) để tránh
lỗi escape ký tự `\n` trên Vercel — một bug đã từng xảy ra (commit `89305ab`).

### 3.5. Spinner luyện nói (`/speak`)

Tính năng dạng "vòng quay may mắn" tạo đề tài nói ngẫu nhiên, gồm 4 loại:

| Tab | Bảng | Nội dung |
|---|---|---|
| **Topics** | `spinner_topics` | Chủ đề nói theo độ khó / danh mục |
| **Interview** | `spinner_interview_questions` | Câu hỏi phỏng vấn (framework STAR) |
| **Deep Talk** | `spinner_deep_talk` | Câu hỏi chiều sâu, tự sự |
| **Vocab** | `spinner_vocab` | Từ vựng + góc nhìn gợi ý |

Bổ sung: **khung IELTS Speaking** (PEE / AREA / OREO), **Timer modal** cho luyện
nói có giới hạn thời gian, và **gợi ý từ vựng bằng AI** (`/api/spinner/vocab-suggest`).

### 3.6. Chế độ khách (Guest mode)

Chiến lược tăng trưởng: **cho dùng trước, đăng ký sau**.

- Trang chủ `/` mở hoàn toàn cho khách — dịch và tra từ điển không cần tài khoản
- `/speak` cũng mở cho khách
- API công khai: `/api/words`, `/api/translate`, `/api/spinner`, `/api/dictionary`
- `GuestBanner` hiển thị CTA mời đăng ký để **lưu lịch sử và nhận email**

Trang chủ render **lạc quan như đã đăng nhập**, chỉ lật sang trạng thái guest nếu
`/api/profile` trả lỗi — tránh hiện skeleton toàn trang mỗi lần load.

---

## 4. Kiến trúc hệ thống

### 4.1. Sơ đồ tổng thể

```
┌───────────────┐     ┌───────────────┐     ┌──────────────────┐
│  Web Browser  │     │   iOS App     │     │   Email Inbox    │
│   (Next.js)   │     │   (SwiftUI)   │     │    (Gmail)       │
└───────┬───────┘     └───────┬───────┘     └────────▲─────────┘
        │                     │                      │
        │  HTTPS              │  HTTPS (CORS *)      │  SMTP
        │                     │                      │
        ▼                     ▼                      │
┌──────────────────────────────────────────┐         │
│         Next.js 16 App Router            │         │
│         (deploy trên Vercel)             │         │
│  ┌────────────────────────────────────┐  │         │
│  │  middleware.js — auth gateway      │  │         │
│  └────────────────────────────────────┘  │         │
│  ┌────────────────────────────────────┐  │         │
│  │  /api/* — 28 route handlers        │  │         │
│  └────────────────────────────────────┘  │         │
└───┬──────────┬──────────┬────────┬───────┘         │
    │          │          │        │                 │
    ▼          ▼          ▼        ▼                 │
┌────────┐ ┌───────┐ ┌────────┐ ┌──────────┐        │
│Supabase│ │ Groq  │ │ DeepL  │ │Google TTS│        │
│Postgres│ │ LLM   │ │Translate│ │ Neural2  │        │
│ + Auth │ │       │ │        │ │          │        │
└────────┘ └───────┘ └────────┘ └──────────┘        │
    ▲                                                │
    │                                                │
┌───┴────────────────────────────────────┐           │
│         Inngest (durable jobs)         ├───────────┘
│  • scheduleAllSlots                    │
│  • sendSlotEmail (sleepUntil)          │
│  • watchdogReschedule (hourly cron)    │
└────────────────────────────────────────┘
```

### 4.2. Tech stack

#### Frontend

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Framework | **Next.js 16.2.6** | App Router |
| UI runtime | **React 19.2.4** | |
| Styling | **Tailwind CSS v4** | Qua `@tailwindcss/postcss` |
| Font | **Plus Jakarta Sans** | `next/font/google`, weights 400–800 |
| Icons | **lucide-react** | |
| Ngôn ngữ | **JavaScript** (không TypeScript) | `jsconfig.json` với alias `@/*` |

> **Lưu ý quan trọng cho developer:** Theo `AGENTS.md`, đây **không phải phiên
> bản Next.js quen thuộc** — có breaking changes về API, convention và cấu trúc
> file. Bắt buộc đọc `node_modules/next/dist/docs/` trước khi viết code.

#### Backend & dịch vụ

| Dịch vụ | Vai trò | Chi tiết |
|---|---|---|
| **Supabase** | Postgres + Auth | `@supabase/ssr` 0.10.3, `@supabase/supabase-js` 2.105.4 |
| **Inngest** | Durable job scheduling | v4.4.0 — sleepUntil, cancelOn, retry |
| **Groq** | LLM inference | `llama-3.1-8b-instant`, `llama-3.3-70b-versatile` |
| **DeepL** | Dịch máy | Hỗ trợ cả Free (`:fx`) và Pro endpoint |
| **Google Cloud TTS** | Text-to-speech | Neural2 voices |
| **Nodemailer + Gmail** | Gửi email | SMTP với app password |
| **React Email** | Template email | `@react-email/components` + `render` |
| **GA4** | Analytics | Qua `next/script`, wrapper an toàn |

#### Lựa chọn mô hình AI

| Use case | Model | Lý do |
|---|---|---|
| Từ điển | `llama-3.1-8b-instant` | Nhanh, rẻ, có cache nên chất lượng đủ dùng |
| Sinh nội dung từ vựng | `llama-3.1-8b-instant` | Tương tự, kết quả được cache vĩnh viễn |
| Hội thoại với Alex | `llama-3.3-70b-versatile` | Cần chất lượng hội thoại cao hơn |

> **Bối cảnh lịch sử:** Ban đầu dùng Gemini, chuyển sang Groq tại commit
> `6953f96` ("Gemini free tier exhausted"). Từ điển ban đầu dùng Free Dictionary
> API, thay bằng AI tại commit `448c7a0`.

### 4.3. Chiến lược tối ưu hiệu năng

Codebase thể hiện sự chú trọng rõ rệt vào tốc độ:

| Kỹ thuật | Vị trí | Lợi ích |
|---|---|---|
| **JWT verify cục bộ** | `middleware.js` — `getClaims()` | Không round-trip mạng khi dùng asymmetric key |
| **Truyền identity qua header** | `x-user-id`, `x-user-email` | API route không phải gọi lại `getUser()` |
| **Cache token TTS** | `api/tts/route.js` | Tiết kiệm 70–270ms/request |
| **Cache từ điển toàn cục** | `word_dictionary_cache` | Mỗi từ chỉ gọi AI 1 lần cho toàn hệ thống |
| **Cache nội dung AI** | `word_ai_content` | Khoá theo `(word_id, skill_level)` |
| **Render lạc quan** | `app/page.js` | Không skeleton toàn trang |
| **Phân trang DB-side** | Lịch sử dịch | Load 20, "load more" theo yêu cầu |
| **Truy vấn có lọc sẵn** | `select-word-for-email.js` | Chỉ load row `new` hoặc `due`, `limit 200` |
| **Partial index** | `translate_history` | Index riêng cho row `is_saved = false` |

---

## 5. Mô hình dữ liệu

> ⚠️ **Cảnh báo quan trọng:** Repo **không chứa schema đầy đủ**. Thư mục
> `migrations/` và `supabase/` chỉ là các script vá tăng dần, dán tay vào
> Supabase SQL Editor. Các bảng lõi — `words`, `profiles`, `translate_history`,
> `journal_entries`, `email_slots`, `email_preferences`, `practice_sessions`,
> `user_progress` — **không có `CREATE TABLE` ở bất kỳ đâu trong repo**; chúng
> được tạo trực tiếp trên dashboard Supabase. Cấu trúc mô tả bên dưới được tái
> dựng từ các câu `ALTER TABLE`, khoá ngoại, cột trong seed `INSERT` và lời gọi
> `.select()/.insert()` trong `src/`.
>
> Hệ quả: **không thể tái tạo database này từ repo**. Đây là rủi ro vận hành
> nghiêm trọng nhất của dự án.

### 5.1. Sơ đồ quan hệ

```
                    ┌──────────────────┐
                    │   auth.users     │  (Supabase Auth)
                    │   (id UUID)      │
                    └────────┬─────────┘
                             │ 1:1
                    ┌────────▼─────────┐
                    │    profiles      │
                    │  name, timezone  │
                    │  skill_level     │
                    │  learning_goal   │
                    └────────┬─────────┘
         ┌───────────────────┼───────────────────┐
         │                   │                   │
┌────────▼─────────┐ ┌───────▼────────┐ ┌────────▼─────────┐
│ translate_history│ │journal_entries │ │ practice_sessions│
│ ─────────────────│ │────────────────│ │──────────────────│
│ source_text      │ │ content        │ │ title, messages  │
│ translated_text  │ │                │ │ word_id ─────────┼──┐
│ direction        │ │ ◄── FSRS ───►  │ └──────────────────┘  │
│ is_saved         │ │   columns      │                       │
│ ◄─── FSRS ────►  │ │                │                       │
│ state, due_at    │ │ state, due_at  │                       │
│ stability        │ │ stability      │                       │
│ difficulty       │ │ difficulty     │                       │
│ review_count     │ │ review_count   │                       │
│ lapses           │ │ lapses         │                       │
└──────────────────┘ └────────────────┘                       │
         │                   │                                │
         └─────────┬─────────┘                                │
                   │  cùng vào hàng đợi email                 │
         ┌─────────▼─────────┐                                │
         │  email_slots      │                                │
         │  send_time        │      ┌──────────────────┐      │
         │  enabled          │      │      words       │◄─────┘
         │  last_scheduled_at│      │──────────────────│
         └─────────┬─────────┘      │ word, pos, level │
                   │                │ definition, audio│
         ┌─────────▼─────────┐      └────┬────────┬────┘
         │   email_log       │           │        │
         │   status, word    │     ┌─────▼───┐ ┌──▼──────────┐
         │   entry_ids JSONB │     │word_    │ │ word_layers │
         │   recipient,error │     │ai_      │ │ topic       │
         └───────────────────┘     │content  │ │ collocations│
                                   │(by skill│ │ register    │
         ┌───────────────────┐     │ _level) │ │ frequency   │
         │email_preferences  │     └─────────┘ └─────────────┘
         │ enabled,frequency │
         │ custom_days       │     ┌──────────────────────┐
         └───────────────────┘     │word_dictionary_cache │
                                   │ phonetic_us / _uk    │
                                   │ meanings JSONB       │
                                   └──────────────────────┘

  SPINNER (độc lập)
  ┌──────────────┬───────────────────────────┬─────────────────┐
  │spinner_topics│spinner_interview_questions│spinner_deep_talk│
  └──────────────┴───────────────────────────┴─────────────────┘
  ┌──────────────┬─────────────────┬───────────────────────────┐
  │ spinner_vocab│ spinner_history │  spinner_preferences      │
  └──────────────┴─────────────────┴───────────────────────────┘
```

### 5.2. Các bảng chính

#### `translate_history` — hàng đợi từ vựng

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `user_id` | UUID | FK → auth.users |
| `source_text` | TEXT | Text gốc |
| `translated_text` | TEXT | Bản dịch |
| `direction` | TEXT | `EN→VI` hoặc `VI→EN` |
| `is_saved` | BOOLEAN | **Chỉ `true` mới vào hàng đợi email** |
| `saved_at` | TIMESTAMPTZ | Dùng thay `created_at` khi sắp xếp FIFO |
| `state` | TEXT | `new` / `learning` / `review` / `relearning` |
| `stability`, `difficulty` | NUMERIC | Tham số FSRS |
| `due_at` | TIMESTAMPTZ | Thời điểm cần ôn lại |
| `review_count`, `lapses` | INTEGER | Số lần ôn / số lần quên |
| `scheduled_days`, `elapsed_days` | NUMERIC | Khoảng cách lịch |
| `last_reviewed_at` | TIMESTAMPTZ | Lần ôn gần nhất |

**Index:**
- `translate_history_due_idx (user_id, due_at)` — truy vấn hàng đợi
- `idx_translate_history_unsaved_lookup (user_id, source_text, direction, saved_at DESC) WHERE is_saved = false` — partial index cho tra cứu bản nháp

#### `journal_entries` — English Quote

Được **repurpose** từ thiết kế cũ (`word` + `meaning_vi`) sang ghi chú tự do
(`content`) trong migration `unified-review-queue.sql`, có backfill dữ liệu cũ
rồi mới drop cột. Có cùng bộ cột FSRS như `translate_history`.

#### `email_slots` / `email_preferences` / `email_log`

| Bảng | Vai trò |
|---|---|
| `email_slots` | Nhiều khung giờ gửi/ngày, mỗi slot một `send_time` + `last_scheduled_at` (heartbeat cho watchdog) |
| `email_preferences` | Bật/tắt tổng, `frequency` (`daily`/`weekdays`/`custom`), `custom_days` |
| `email_log` | Audit trail mọi lần gửi: `status`, `word`, `entry_ids` (JSONB), `recipient`, `error` |

#### `words` + các bảng phụ trợ

| Bảng | Nội dung |
|---|---|
| `words` | ~8.400 từ: `word`, `pos`, `level` (CEFR), `definition`, `example`, `audio_url` |
| `word_ai_content` | Nội dung AI theo `(word_id, skill_level)`: `meanings` JSONB, `synonyms` |
| `word_layers` | `semantic_family`, `topic`, `register`, `collocations`, `usage_notes`, `frequency` |
| `word_dictionary_cache` | Cache từ điển toàn cục: `phonetic_us`, `phonetic_uk`, `meanings` |

### 5.3. Row Level Security — độ phủ không đồng đều

RLS **không được bật đồng đều**. Theo những gì có trong repo:

| Bảng | RLS trong repo | Policy |
|---|---|---|
| `email_log` | ✅ Bật | `select-own` (`auth.uid() = user_id`) |
| `word_dictionary_cache` | ✅ Bật | authenticated read, service_role all |
| `word_ai_content` | ✅ Bật | authenticated read, service_role all |
| `word_layers` | ❌ Không | — |
| 6 bảng `spinner_*` | ❌ Không | Bao gồm cả `spinner_history` và `spinner_preferences` chứa **dữ liệu theo người dùng** |
| Các bảng lõi (`profiles`, `translate_history`, …) | ❓ Không xác định | Tạo ngoài repo — policy có thể tồn tại trên dashboard nhưng không kiểm chứng được từ mã nguồn |

Mẫu policy duy nhất có trong repo:

```sql
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_log_select_own" ON email_log
  FOR SELECT USING (auth.uid() = user_id);
```

**Điểm cần lưu ý:** rất nhiều route dùng `createAdminClient()` (service role,
**bypass hoàn toàn RLS**) — bao gồm `email-slots`, `translate-history`,
`practice/sessions*`, `words/by-topic` và toàn bộ spinner. Ở các route này, cô
lập dữ liệu **chỉ được đảm bảo bởi kỷ luật code** (`getUserFast()` + thủ công
`.eq("user_id", user.id)`), chứ không phải bởi database. Mọi route đã kiểm tra
đều scope đúng, nhưng đây là lớp phòng vệ mỏng hơn RLS.

Ghi dữ liệu từ Inngest cũng đi qua service role vì job chạy ngoài ngữ cảnh
phiên người dùng — đây là cách dùng hợp lý.

### 5.4. Quy ước migration

Toàn bộ SQL trong `migrations/` tuân thủ nguyên tắc **idempotent** — dùng
`IF NOT EXISTS` / `IF EXISTS` ở mọi câu lệnh, an toàn khi chạy lại nhiều lần.
Migration được áp dụng thủ công qua Supabase SQL Editor (không có migration
runner tự động).

Riêng `translate-history-auto-save.sql` có khối `DO $$ ... $$` động để tìm và
drop unique constraint theo tên thực tế trong `pg_constraint` — xử lý trường hợp
tên constraint do Postgres tự sinh khác nhau giữa các môi trường.

---

## 6. API surface

28 route handlers dưới `src/app/api/`.

### 6.1. Công khai (guest dùng được)

| Endpoint | Method | Chức năng |
|---|---|---|
| `/api/translate` | POST | Dịch qua DeepL, trả `translated` + `detectedLang` |
| `/api/dictionary` | POST | Từ điển AI có cache — IPA US/UK, nghĩa, ví dụ |
| `/api/words/by-topic` | GET | Lấy từ theo chủ đề |
| `/api/spinner/*` | GET/POST | Topics, interview, deep-talk, vocab, history, preferences |

### 6.2. Yêu cầu đăng nhập

| Endpoint | Method | Chức năng |
|---|---|---|
| `/api/profile` | GET/PATCH | Hồ sơ, trình độ, mục tiêu, timezone |
| `/api/translate-history` | GET/POST/PATCH/DELETE | CRUD lịch sử dịch, lưu/bỏ lưu |
| `/api/journal` | GET/POST/PATCH/DELETE | CRUD English Quote |
| `/api/practice` | POST | Hội thoại với Alex (streaming) |
| `/api/practice/sessions` | GET/POST | Danh sách / tạo phiên |
| `/api/practice/sessions/[id]` | GET/DELETE | Chi tiết / xoá phiên |
| `/api/practice/sessions/[id]/title` | PATCH | Đổi tên phiên |
| `/api/tts` | POST | Text-to-speech Google Neural2 |
| `/api/ai/word-content` | POST | Sinh nội dung học cho từ |
| `/api/email-preferences` | GET/PATCH | Cài đặt email tổng |
| `/api/email-slots` | GET/POST/DELETE | Quản lý khung giờ gửi |
| `/api/stats/streak` | GET | Chuỗi ngày học liên tiếp |
| `/api/auth/logout` | POST | Đăng xuất |

### 6.3. Hệ thống / quản trị

| Endpoint | Bảo vệ | Chức năng |
|---|---|---|
| `/api/inngest` | Inngest signature | Endpoint đăng ký các function |
| `/api/admin/email-status` | `CRON_SECRET` | Kiểm tra trạng thái email |
| `/api/admin/trigger-inngest-all` | `CRON_SECRET` | Kích hoạt lại toàn bộ lịch |
| `/api/email/test` | Auth | Gửi email thử |
| `/api/debug/select-word` | Auth | Debug thuật toán chọn từ |
| `/auth/callback` | — | OAuth callback Supabase |

### 6.4. CORS

`next.config.mjs` mở CORS cho toàn bộ `/api/*` với `Access-Control-Allow-Origin: *`
— nhằm cho phép **ứng dụng iOS** gọi trực tiếp cùng backend.

---

## 7. Hạ tầng & vận hành

### 7.1. Môi trường triển khai

| Thành phần | Nền tảng |
|---|---|
| Web app | **Vercel** (`vercel.json`, `VERCEL_URL`) |
| Database + Auth | **Supabase** (managed Postgres) |
| Background jobs | **Inngest Cloud** |
| Email | **Gmail SMTP** (Nodemailer + app password) |

### 7.2. Biến môi trường

| Biến | Mục đích |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Endpoint Supabase (client) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role cho Inngest / admin (server only) |
| `GROQ_API_KEY` | Groq LLM |
| `DEEPL_API_KEY` | DeepL (đuôi `:fx` = free tier) |
| `GOOGLE_TTS_CLIENT_EMAIL` | Service account TTS |
| `GOOGLE_TTS_PRIVATE_KEY_BASE64` | Private key TTS (base64) |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | SMTP gửi mail |
| `CRON_SECRET` | Bảo vệ endpoint admin/cron |
| `NEXT_PUBLIC_APP_URL` / `VERCEL_URL` | Base URL |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | GA4 (tuỳ chọn) |
| `TEST_MODE` | Cờ chạy thử |

### 7.3. Lịch chạy nền

| Job | Lịch | Mô tả |
|---|---|---|
| `sendSlotEmail` | Event-driven + `sleepUntil` | Một run/slot, ngủ đến đúng giờ |
| `watchdogReschedule` | `0 * * * *` (Inngest cron) | Hồi sinh slot không hoạt động > 25h |
| GitHub Actions | `workflow_dispatch` (thủ công) | Legacy — lịch đã chuyển sang Inngest |

> `vercel.json` có `"crons": []` — rỗng, xác nhận việc lập lịch đã hoàn toàn
> chuyển sang Inngest. Workflow `.github/workflows/daily-email.yml` giữ lại chỉ
> để trigger thủ công khi cần.

### 7.4. Khả năng quan sát (Observability)

- **`email_log`** — audit trail đầy đủ mọi lần gửi, trả lời được câu hỏi "hôm
  nay user X có nhận mail không?"
- **`last_scheduled_at`** — heartbeat phát hiện chuỗi lịch đứt gãy
- **GA4** — analytics hành vi người dùng qua `trackEvent()` wrapper an toàn
  (no-op khi chưa cấu hình hoặc chạy server-side)
- **Inngest dashboard** — theo dõi từng step, retry, và cancel của mỗi run

---

## 8. Bảo mật

Codebase cho thấy nhiều biện pháp bảo mật có chủ đích:

### 8.1. Chống giả mạo danh tính (header spoofing)

`middleware.js` **xoá** mọi header `x-user-id` / `x-user-email` /
`x-user-provider` do client gửi lên **trước khi** set lại từ JWT đã xác thực:

```javascript
// SECURITY: strip any client-supplied auth headers first so a guest can never
// spoof x-user-id to impersonate another user.
request.headers.delete("x-user-id");
request.headers.delete("x-user-email");
request.headers.delete("x-user-provider");
```

### 8.2. Xác thực

- JWT được verify **cục bộ** qua `getClaims()` (asymmetric key), tự fallback
  sang `getUser()` với HS256 legacy
- Refresh token hỏng → xoá sạch cookie `sb-*` và redirect `/login`
- Guest gọi API riêng tư → `401`, truy cập trang riêng tư → redirect `/login`

### 8.3. Cô lập dữ liệu

- **RLS** trên các bảng người dùng (`auth.uid() = user_id`)
- Mọi truy vấn ghi đều kèm `.eq("user_id", user_id)` như lớp phòng vệ thứ hai
- Lịch sử dịch **chỉ xử lý phía server** — commit `712f172` sửa lỗi rò rỉ dữ
  liệu chéo tài khoản

### 8.4. Rủi ro còn tồn đọng

| Rủi ro | Chi tiết | Mức độ |
|---|---|---|
| **API trả phí không auth** | `/api/translate` và `/api/dictionary` **hoàn toàn công khai, không rate limit**. `translate` không giới hạn độ dài `text`; `dictionary` gọi Groq mỗi lần cache miss. Đây là phơi nhiễm quota trả phí trực tiếp — bất kỳ ai cũng có thể đốt hạn mức DeepL/Groq | 🔴 Cao |
| **Route debug chạy production** | `/api/debug/select-word` dump toàn bộ journal + lịch sử dịch của người gọi. Có scope theo user nên không rò rỉ chéo, nhưng không nên tồn tại ở production | 🟡 Trung bình |
| **CORS wildcard** | `Access-Control-Allow-Origin: *` trên mọi `/api/*` (để phục vụ app iOS). Không có `Allow-Credentials` nên cookie không đi kèm cross-origin — giảm nhẹ mức độ | 🟡 Trung bình |
| **RLS thiếu** | `spinner_history`, `spinner_preferences` chứa dữ liệu người dùng nhưng không bật RLS | 🟡 Trung bình |
| **Prompt injection defense hẹp** | `SCOPE_GUARDRAILS` chỉ có ở `/api/practice`. Các route Groq khác nội suy input người dùng thẳng vào prompt, tuy có `response_format: json_object` + validate shape nên bán kính ảnh hưởng hạn chế | 🟢 Thấp |

**So sánh:** `/api/tts` làm đúng — yêu cầu auth **và** giới hạn 500 ký tự. Đây
là mẫu nên áp dụng cho `translate` và `dictionary`.

### 8.5. Khác

| Biện pháp | Chi tiết |
|---|---|
| Timing-safe auth | Commit `b3450d1` + `validateCronSecret` dùng `crypto.timingSafeEqual` |
| Generic error messages | Không lộ thông tin nội bộ |
| UUID validation | Kiểm tra định dạng trước khi query |
| Cron secret | Bearer token bảo vệ endpoint admin |
| Prompt injection defense | `SCOPE_GUARDRAILS` chặn "ignore your rules" |
| Không hardcode credentials | Commit `36f8afb` gỡ credential khỏi script |

---

## 9. Design system

### 9.1. Bảng màu — cảm hứng Duolingo

```css
--color-electric:        #58CC02   /* Xanh lá thương hiệu */
--color-electric-muted:  #58A700
--color-duo-blue:        #1CB0F6
--color-duo-orange:      #FF9600
--color-duo-purple:      #CE82FF
--color-duo-yellow:      #FFC800
--color-error:           #FF4B4B
```

### 9.2. Theming

Hỗ trợ **dark mode (mặc định)** và **light mode**, điều khiển qua
`data-theme` trên `<html>`, lưu ở `localStorage['wordly-theme']`.

Chống nhấp nháy (FOUC) bằng inline script chạy **trước khi** React hydrate:

```javascript
(function(){try{var t=localStorage.getItem('wordly-theme');
document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){}})();
```

Nền tối dùng tông near-black của Duolingo: `--cream: #131F24`,
`--surface: #1A2930`, `--card-bg: #1F2E36`.

Toàn bộ màu đi qua **CSS custom properties** (commit `d9997fd` "centralize all
brand colors into CSS design tokens") — đổi theme không cần sửa component.

### 9.3. Thư viện UI

`src/components/ui/`: `Button`, `Card`, `Input`, `Modal`, `Dropdown`, `Badge`,
`BackButton`.

### 9.4. Kỹ thuật mobile — các sửa lỗi thực chiến

`globals.css` và `ReelSpinner.js` chứa nhiều fix đúc kết từ thiết bị thật, được
comment lại cẩn thận:

| Vấn đề | Giải pháp |
|---|---|
| iOS tự zoom khi focus input | `input/textarea/select { font-size: 16px !important }` dưới 768px |
| Vùng chạm quá nhỏ | `min-height: 40px` cho mọi button/link dưới 768px, opt-out bằng class `.no-min-h` |
| Tai thỏ / thanh home | `env(safe-area-inset-bottom)`, các helper `.safe-bottom`, `.pb-safe`, `viewportFit: "cover"` |
| Bàn phím che nội dung | Thanh công cụ cố định phía trên bàn phím với nút "Xong", `enterKeyHint="done"` |
| Blob nền gây lag | Mobile dùng blob nhỏ hơn, `blur(40px)` thay vì `blur(90px)` |

Riêng `ReelSpinner` là một case study về tối ưu animation — comment trong file
ghi lại từng bug và lý do:

- **Cắt chữ ở 90 ký tự bằng JS**, không dùng `line-clamp` — vì `-webkit-box`
  xung đột với flex centering làm reel trông trống rỗng giữa lúc quay
- **Cache chiều cao vào ref**, không đọc `offsetHeight` — đọc cạnh transform
  đang chạy sẽ ép sync layout → giật
- **Dựng 13–17 node trên `DocumentFragment`** rồi append một lần
- **Khi dừng chỉ đổi class** `.landed`/`.neighbor`/`.far`, không tính lại
  transform — vì chiều cao giữa transition lệch khỏi mốc ban đầu làm sai item
- **Fade trên/dưới bằng 2 div gradient**, không dùng `mask-image` — layer bị
  mask mất nét khi animate trên GPU mobile

### 9.5. Điều hướng

Sidebar (`AppSidebar.js`) — thu gọn được, responsive mobile với overlay:

| Mục | Route |
|---|---|
| Translation | `/` |
| Chat với Alex | `/practice` |
| Lưu English Quote | `/journal` |
| Hồ sơ | `/profile` |

---

## 10. Ứng dụng iOS

Native SwiftUI app tại `wordly-ios/` — **~5.000 dòng Swift**.

### 10.1. Cấu trúc

```
wordly-ios/
├── Package.swift
├── WordlyiOS/
│   ├── App/              WordlyApp.swift, ContentView.swift
│   ├── Core/
│   │   ├── Auth/         AuthManager.swift
│   │   ├── Network/      APIClient.swift, Models.swift
│   │   └── Storage/      AppGroupStorage.swift
│   ├── Features/
│   │   ├── Auth/         LoginView
│   │   ├── Translate/    TranslateView + ViewModel
│   │   ├── Practice/     PracticeView + ViewModel + SpeechManager
│   │   ├── Words/        WordsView
│   │   ├── Journal/      JournalView
│   │   ├── History/      HistoryView
│   │   └── Profile/      ProfileView
│   └── Shared/
│       ├── Components/   TTSManager.swift
│       └── Theme/        DesignSystem.swift (232 dòng)
└── WordlyWidget/         WordlyWidget.swift, WidgetWordEntry.swift
```

### 10.2. Đặc điểm

- **Chia sẻ backend với web** — gọi cùng `/api/*` (nhờ CORS `*`)
- **Home/Lock Screen Widget** qua WidgetKit — hiển thị từ vựng ngay màn hình khoá
- **App Groups** để chia sẻ dữ liệu giữa app và widget
- **Design system riêng** mirror lại token của web
- Yêu cầu: macOS 14+, Xcode 15+, iOS 17+, Apple Developer Account

### 10.3. Kiến trúc: client mỏng trên backend web

Quyết định thiết kế (ghi trong README): *"iOS không nhúng API key trực tiếp"* —
app gọi chính các route của web app để hai nền tảng dùng chung logic backend.

| Luồng | Đích |
|---|---|
| Dịch, TTS, chat với Alex | Gọi `/api/*` của web → web gọi DeepL / Google / Groq |
| Đăng nhập | Gọi **thẳng Supabase** qua `supabase-swift`, rồi gắn token vào header `Authorization: Bearer` cho mọi lời gọi web API |
| Gợi ý từ, chi tiết từ | Gọi thẳng Datamuse và `api.dictionaryapi.dev` từ thiết bị |

Đây chính là lý do tồn tại của `next.config.mjs` — nội dung duy nhất của nó là
khối CORS cho `/api/:path*`, thêm vào đúng theo hướng dẫn trong README iOS.

**Luồng dữ liệu widget:** `App chính → AppGroupStorage (UserDefaults suite) →
WordlyWidget`. Mỗi khi mở tab History, app lọc lịch sử `EN→VI`, lấy 50 mục mới
nhất, ghi vào suite chung rồi gọi `WidgetCenter.reloadAllTimelines()`. Widget
hiển thị **mỗi giờ một từ khác nhau**.

### 10.4. Trạng thái thực tế — chưa build được

Cần đánh giá trung thực: đây là **prototype chưa hoàn chỉnh**, không phải sản
phẩm đang chạy.

| Vấn đề | Chi tiết |
|---|---|
| **Không có Xcode project** | `Package.swift` chỉ khai báo một library target — **không có app target, không có widget target, không có `.xcodeproj`**. Như đang commit thì **không thể compile hay chạy**; README có mục "Manual Xcode Setup" xác nhận phải dựng tay |
| **Chưa vào git** | Toàn bộ `wordly-ios/` là untracked (`git ls-files` trả về 0 file) |
| **Đã trôi khỏi web app** | Sửa lần cuối 2025-06-30/07-01; web app đã có ~15 commit từ đó (spinner, Deep Talk, IELTS frameworks, từ điển AI, GA4, accent picker) mà **iOS không có phần tương ứng nào** |
| **Gọi API đã chết** | `APIClient.fetchWords` gọi `/api/words/search` — route này **không tồn tại** (route thật là `/api/words/by-topic`) |

**Về credentials:** `APIClient.swift` chứa giá trị thật (URL Vercel, Supabase
URL, publishable key, App Group ID) thay vì placeholder như README mô tả. Vì
thư mục chưa vào git nên **chưa có gì lọt vào lịch sử repo** — nhưng cần thay
bằng cấu hình ngoài trước khi commit. Anon/publishable key vốn được thiết kế để
lộ ra client, nên mức độ thấp *với điều kiện* RLS được bật đúng — mà theo mục
5.3 thì điều kiện này chưa được đảm bảo.

---

## 11. Data pipeline

### 11.1. Nguồn dữ liệu từ vựng

| Nguồn | JSON | Sinh ra SQL | File |
|---|---|---|---|
| **Oxford 5000** | 5.944 mục | 5.902 dòng INSERT | `scripts/oxford-5000.json` |
| **GRE word list** | 2.478 mục | 2.478 dòng INSERT | `scripts/gre-words.json` |
| **Tổng** | | **8.380 dòng INSERT** | |

Sau khi khử trùng lặp bằng `ON CONFLICT (word) DO NOTHING` (Oxford có nhiều mục
cùng headword khác từ loại), số từ thực tế trong bảng ≈ **7.500** — khớp với
con số ghi trong `by-topic/route.js`.

Mỗi bản ghi Oxford gồm: `word`, `type`, `cefr` (a1–c2), `phon_br`, `phon_n_am`,
`definition`, `example`, và tên file audio `uk` / `us`.

GRE được xây bằng `fetch-gre.js`: gộp 4 danh sách nguồn (`gre-3000.txt`,
`magoosh-advanced/basic/common.txt`), gán advanced → C2 và còn lại → C1, **bỏ
qua từ đã có trong Oxford**, rồi tra `api.dictionaryapi.dev` (miễn phí, không
key) với nhịp 300ms/request và checkpoint mỗi 50 từ để `--resume` được.

#### Hai lỗi đã biết trong pipeline Oxford

| Lỗi | Chi tiết |
|---|---|
| **Cột `phonetic` chứa tên file mp3** | `generate-sql.js` map `w.us \|\| w.uk` vào cột `phonetic`, bỏ qua `phon_n_am`. Kết quả: hàng Oxford lưu `'ability_us.mp3'` còn hàng GRE lưu IPA thật `'/əˈbɪz.məl/'` — **hai loại giá trị không tương thích trong cùng một cột** |
| **Mọi từ Oxford đều là B1** | Script đọc `w.level` trong khi JSON dùng trường `cefr`, nên mọi dòng rơi về mặc định `'B1'`. Đây chính là lý do `update-levels.js` tồn tại — nó sinh 5 câu `UPDATE ... WHERE word IN (...)` để vá lại level sau khi seed |

### 11.2. Quy trình seed

```
JSON nguồn (oxford-5000.json / gre-words.json)
        ↓
generate-sql.js / generate-gre-sql.js
        ↓
Chia batch 500 dòng → oxford-01..12.sql, gre-01..05.sql
        ↓
Chạy thủ công trên Supabase SQL Editor
        ↓
Hậu xử lý:
  • update-levels.js/.sql     → vá level CEFR (bắt buộc, xem lỗi ở trên)
  • fetch-audio-urls.mjs      → backfill words.audio_url (dictionaryapi.dev)
  • backfill-topics.mjs       → gán chủ đề bằng rule-based classifier (0đ API)
  • insert-word-batch.mjs     → chèn batch từ hand-authored (2 file × 10 từ)
  • generate-c1c2-words.mjs   → sinh từ C1/C2 bằng AI (Gemini → fallback Groq)
  • seed-spinner-data.mjs     → seed spinner ⚠️ đọc từ repo KHÁC trên máy local
  • seed-ielts-topics.mjs     → ⚠️ XOÁ spinner_topics rồi chèn 77 câu IELTS
  • seed-deep-talk.mjs        → 100 câu Deep Talk (20 × 5 chủ đề)
```

**`generate-c1c2-words.mjs`** là script công phu nhất — thiết kế **sinh rồi tự
kiểm chứng hai pha**: pha 1 sinh tối đa 864 từ ứng viên (6 chủ đề × 18 semantic
family × 8 từ); pha 2 gọi model độc lập theo lô 15 từ để xác nhận đó là từ điển
thật (không phải danh từ riêng, không phải dạng chia) và CEFR C1/C2 đúng, cho
phép `corrected_cefr`. Có `TEST_MODE=1` để smoke test rẻ và resume qua
`.c1c2-progress.json`.

**Hai cảnh báo vận hành:**

- `seed-spinner-data.mjs` đọc SQL từ **đường dẫn tuyệt đối tới một repo khác**
  trên máy local (`.../speaking-practice/supabase`) — người khác **không thể
  chạy lại được**.
- `seed-ielts-topics.mjs` bắt đầu bằng `DELETE FROM spinner_topics WHERE id != 0`
  — xoá sạch những gì script trước đã nạp. Thứ tự chạy là bắt buộc.

### 11.3. Phân loại chủ đề

`src/lib/topic-classifier.js` dùng **rule-based** (không phải AI) — khớp từ khoá
trong định nghĩa tiếng Anh để gán 1 trong 12 chủ đề:

> Business & Strategy · Technology & AI · Law & Finance · Health & Medicine ·
> Science & Nature · Travel & Places · Food & Cooking · Emotions & Feelings ·
> Psychology & Behavior · Communication · Academic & Education · Daily Life

Lý do thiết kế (ghi rõ trong comment): chạy được **tức thì trên toàn bộ từ điển
với chi phí API bằng 0**. Thứ tự rule quan trọng — chủ đề cụ thể đặt trước chủ
đề chung; không khớp thì fallback theo part-of-speech.

### 11.4. Ánh xạ mục tiêu thi cử

`src/lib/exam-goals.js` suy ra mục tiêu thi từ level CEFR (thuần derived, không
có cột DB):

| CEFR | Mục tiêu |
|---|---|
| A1, A2 | Giao tiếp cơ bản |
| B1 | Giao tiếp cơ bản, TOEIC |
| B2 | TOEIC, IELTS |
| C1 | IELTS, TOEFL |
| C2 | TOEFL |

> Comment trong code thừa nhận đây là **xấp xỉ heuristic** vì chưa có dữ liệu
> gắn thẻ kỳ thi thật cho từng từ.

---

## 12. Lộ trình phát triển

### 12.1. Dòng thời gian

| Tháng | Commits | Cột mốc |
|---|---|---|
| **2026-05** | 63 | Khởi tạo, UI cơ bản, Auth + cloud sync, Oxford 5000, dark theme, guest mode, translate history |
| **2026-06** | 48 | Hệ thống email đa khung giờ, FSRS hợp nhất, Google TTS Neural2, AI voice practice với Alex, VAD rảnh tay |
| **2026-07** | 14 | Redesign kiểu Duolingo, vocabulary-chat, spinner luyện nói, bộ lọc theo mục tiêu thi, giọng US/UK |
| **2026-08** | 6 | GA4 analytics, từ điển AI thay Free Dictionary API, sửa lỗi lịch sử dịch |

### 12.2. Các bước tiến kiến trúc quan trọng

1. **Onboarding → bỏ** (`a473d28`) — giảm ma sát, chuyển learning goal vào profile
2. **GitHub Actions cron → Inngest** — cần durable execution với `sleepUntil`
3. **Gemini → Groq** (`6953f96`) — free tier cạn kiệt
4. **Browser TTS → Google Neural2** (`7ddec18`) — chất lượng giọng đọc
5. **Free Dictionary API → AI dictionary** (`448c7a0`) — kiểm soát chất lượng + nghĩa tiếng Việt
6. **Word suggestion → gỡ bỏ** (`5ece668`) — đơn giản hoá sản phẩm
7. **Journal: word/meaning → free-form content** — hợp nhất hàng đợi ôn tập
8. **Manual review UI → gỡ bỏ** (`3b9dacc`) — dồn toàn lực vào kênh email

> **Nhận xét:** Lịch sử cho thấy một sản phẩm **liên tục thu gọn phạm vi** —
> nhiều commit gỡ bỏ tính năng hơn là thêm. Đây là dấu hiệu của việc tập trung
> vào luồng cốt lõi: *dịch → lưu → nhận email → luyện nói*.

### 12.3. Nợ kỹ thuật & cơ hội

Sắp theo mức độ ưu tiên xử lý:

| # | Hạng mục | Mô tả | Ưu tiên |
|---|---|---|---|
| 1 | **Schema không tái tạo được** | Đa số bảng lõi không có `CREATE TABLE` trong repo; 12 file vá chạy tay, vài file có `TRUNCATE`, không có down-migration. Mất database = mất schema | 🔴 |
| 2 | **API trả phí không auth** | `/api/translate`, `/api/dictionary` công khai, không rate limit, không giới hạn độ dài | 🔴 |
| 3 | **`params` không `await`** | Trong `practice/sessions/[id]/route.js` (cả 3 method) và `.../title/route.js`. Next 16 biến `params` thành Promise → `params.id` là `undefined`, truy vấn filter sai. **Đã kiểm chứng bằng đọc mã** | 🔴 |
| 4 | **Xung đột kiểu `word_id`** | `word_ai_content.word_id` khai báo `int`, còn `word_layers.word_id` là `UUID` FK tới `words(id)`. Không có FK nên sai lệch âm thầm. **Đã kiểm chứng** | 🟡 |
| 5 | **Workflow trỏ route đã xoá** | `.github/workflows/daily-email.yml` gọi `/api/cron/send-daily-emails` — thư mục `src/app/api/cron/` **không tồn tại**. Dispatch sẽ 404. **Đã kiểm chứng** | 🟡 |
| 6 | **Hai hệ SRS song song** | `fsrs.js` không được import ở đâu; email dùng lịch cố định. Dùng chung cột DB, khác toán học | 🟡 |
| 7 | **`/api/email/test` lệch luồng production** | Gửi mail nhưng **không ghi `email_log`** và **không advance `due_at`** → test gửi trùng nội dung và vô hình với cơ chế khử trùng 12h | 🟡 |
| 8 | **`admin/email-status` đọc schema chết** | Báo cáo dựa trên `email_preferences.last_sent_at` / `last_sent_word_id`, nhưng pipeline hiện ghi vào `email_log`. Dashboard sẽ hiện mọi user là missed/pending | 🟡 |
| 9 | **RLS thiếu** | `spinner_history`, `spinner_preferences` chứa dữ liệu người dùng, không bật RLS | 🟡 |
| 10 | **Code chết** | `WordCard.js` (367 dòng) và `TranslateWidget.js` (455 dòng) không được import ở đâu; `TranslateWidget` còn gọi 2 route đã xoá (`/api/words/suggest`, `/api/words/lookup`). `transcribeAudio()` trong practice được định nghĩa nhưng không gọi. `src/data/vocabulary.js` chỉ còn 1 dòng emoji không ai dùng. **Đã kiểm chứng** | 🟢 |
| 11 | **Trùng lặp `speak()`** | Helper TTS lặp gần như nguyên văn ở 5 file | 🟢 |
| 12 | **Không có auth context** | 3 component độc lập cùng fetch `/api/profile` mỗi lần load để đoán trạng thái đăng nhập | 🟢 |
| 13 | **Tính năng ẩn** | `/speak`, `/vocabulary-chat` hoàn chỉnh nhưng bị comment khỏi nav | 🟢 |
| 14 | **Không CI, không test** | Không có workflow lint/build/test; `test-fsrs.js` chỉ in ra console, in "All tests passed!" vô điều kiện. `package.json` không có script `test` | 🟢 |
| 15 | **README boilerplate** | Vẫn là mặc định `create-next-app`; `CLAUDE.md` chỉ có 1 dòng `@AGENTS.md` |  🟢 |
| 16 | **Artifact lớn trong git** | ~5MB dữ liệu sinh ra được commit (`*.sql`, `oxford-5000.json`, `gre-words.json`, `progress.json`); vài file `.DS_Store` đã bị track | 🟢 |
| 17 | **Config chết** | `RESEND_API_KEY`, `GOOGLE_TTS_PRIVATE_KEY` (bản không base64) có trong `.env.local` nhưng không được tham chiếu ở đâu — dấu vết của hướng tiếp cận cũ |  🟢 |

---

## Phụ lục: Bắt đầu nhanh

> ⚠️ **Các migration dưới đây KHÔNG đủ để dựng database từ đầu.** Chúng chỉ là
> script vá cho các bảng đã tồn tại. Những bảng lõi (`words`, `profiles`,
> `translate_history`, `journal_entries`, `email_slots`, `email_preferences`,
> `practice_sessions`, `user_progress`) phải được tạo thủ công trước — xem mục 5.
> Cách khả thi nhất hiện nay là **clone từ project Supabase đang chạy**, không
> phải dựng lại từ repo.

```bash
# 1. Cài dependencies
npm install

# 2. Tạo .env.local với các biến ở mục 7.2

# 3. Chạy migrations trên Supabase SQL Editor theo thứ tự:
#    supabase/word_ai_content*.sql
#    migrations/email-core-upgrade.sql
#    migrations/unified-review-queue.sql
#    migrations/word-layers.sql
#    migrations/vocabulary-chat.sql
#    migrations/spinner.sql
#    migrations/word-dictionary-cache.sql → v2.sql
#    migrations/translate-history-auto-save.sql

# 4. Seed từ vựng (tuỳ chọn)
#    Chạy scripts/oxford-*.sql và scripts/gre-*.sql

# 5. Khởi động
npm run dev     # http://localhost:3000
```

> ⚠️ **Trước khi viết code:** đọc `AGENTS.md` — phiên bản Next.js trong dự án
> này có breaking changes so với tài liệu phổ biến. Tham khảo
> `node_modules/next/dist/docs/`.

---

*Tài liệu này được tạo từ việc phân tích mã nguồn tại commit `222652a` (2026-08-28).*
