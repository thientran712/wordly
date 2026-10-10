// Hiển thị nghĩa/từ loại/phát âm từ kết quả tra từ điển AI
// (web/src/lib/ai/dictionary-client.js). Tách ra từ InlineTranslate.js để
// dùng lại trong tab "Đã gợi ý" (SuggestionHistoryTab.js).
"use client";

const POS_LABEL = {
  noun: "Danh từ", verb: "Động từ", adjective: "Tính từ",
  adverb: "Trạng từ", pronoun: "Đại từ", preposition: "Giới từ",
  conjunction: "Liên từ", interjection: "Thán từ", exclamation: "Thán từ",
};
const POS_COLOR = {
  noun:      { bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.3)",  text: "#60A5FA" },
  verb:      { bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.3)", text: "#A78BFA" },
  adjective: { bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.3)",  text: "#FBBF24" },
  adverb:    { bg: "rgba(232,121,249,0.12)", border: "rgba(232,121,249,0.3)", text: "#E879F9" },
  default:   { bg: "var(--hover-bg)",         border: "var(--divider)",         text: "var(--ink-soft)" },
};
const posStyle = (pos) => POS_COLOR[pos] || POS_COLOR.default;

export default function WordDefinitions({ detail, onAskAI }) {
  const { phoneticUs, phoneticUk, meanings, hasMoreMeanings } = detail;
  return (
    <div className="flex flex-col gap-3">
      {(phoneticUs || phoneticUk) && (
        <div className="flex items-center gap-3 text-xs font-mono" style={{ color: "var(--ink-soft)" }}>
          {phoneticUs && <span><span className="font-sans font-bold not-italic mr-1" style={{ color: "var(--ink-ghost)" }}>US</span>{phoneticUs}</span>}
          {phoneticUk && <span><span className="font-sans font-bold not-italic mr-1" style={{ color: "var(--ink-ghost)" }}>UK</span>{phoneticUk}</span>}
        </div>
      )}
      {meanings.map((m, mi) => {
        const s = posStyle(m.pos);
        return (
          <div key={mi} className="flex flex-col gap-1.5">
            <span
              className="self-start text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
            >
              {POS_LABEL[m.pos] || m.pos}
            </span>
            <ol className="flex flex-col gap-2 pl-1">
              {m.defs.map((d, di) => (
                <li key={di} className="flex flex-col gap-0.5">
                  <span className="text-xs leading-relaxed" style={{ color: "var(--ink)" }}>
                    <span className="font-semibold mr-1" style={{ color: "var(--ink-soft)" }}>{di + 1}.</span>
                    {d.def}
                    {d.def_vi && <span style={{ color: "var(--electric)" }}> — {d.def_vi}</span>}
                  </span>
                  {d.example && (
                    <span
                      className="text-[11px] italic pl-3 leading-relaxed"
                      style={{ color: "var(--ink-ghost)", borderLeft: "2px solid var(--green-subtle-border)" }}
                    >
                      &ldquo;{d.example}&rdquo;
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        );
      })}
      {meanings.length === 0 && (
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          Không tìm thấy định nghĩa chi tiết.
        </p>
      )}
      {hasMoreMeanings && (
        <button
          onClick={onAskAI}
          className="self-start text-[11px] font-semibold hover:underline"
          style={{ color: "var(--electric)" }}
        >
          Từ này còn nhiều nghĩa khác — Nhấn Hỏi AI để biết thêm →
        </button>
      )}
    </div>
  );
}
