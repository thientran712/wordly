"use client";

// /quiz — Quiz ôn từ vựng.
//
// Dùng được cho cả B2C (tự ôn từ đã lưu) và B2B (giáo viên theo dõi qua
// class_id). Câu hỏi sinh từ kho từ sẵn có nên chi phí ~0.
//
// Đáp án đúng KHÔNG có trong dữ liệu client nhận được — server chấm lại
// khi nộp, nên không thể gian lận qua DevTools.

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Zap, Check, X, RotateCcw, Trophy, ArrowRight } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { trackEvent } from "@/lib/analytics";

const MODES = [
  { key: "en_to_vi", label: "Anh → Việt", hint: "Thấy từ tiếng Anh, chọn nghĩa" },
  { key: "vi_to_en", label: "Việt → Anh", hint: "Thấy nghĩa, chọn từ tiếng Anh" },
];

export default function QuizPage() {
  return (
    <Suspense fallback={null}>
      <QuizInner />
    </Suspense>
  );
}

function QuizInner() {
  const searchParams = useSearchParams();
  const classId = searchParams.get("class_id");

  const [phase, setPhase] = useState("setup"); // setup | playing | done
  const [mode, setMode] = useState("en_to_vi");
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [picked, setPicked] = useState(null);
  const [result, setResult] = useState(null);
  const [requeued, setRequeued] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [startedAt, setStartedAt] = useState(null);

  const start = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ mode, count: "10" });
      if (classId) params.set("class_id", classId);

      const res = await fetch(`/api/quiz?${params}`);
      const d = await res.json();

      if (!res.ok) {
        setError(d.error || "Không tạo được quiz");
        setLoading(false);
        return;
      }

      setQuestions(d.questions || []);
      setIndex(0);
      setAnswers({});
      setPicked(null);
      setResult(null);
      setStartedAt(Date.now());
      setPhase("playing");
      trackEvent("quiz_start", { mode, count: d.questions?.length || 0 });
    } catch {
      setError("Có lỗi xảy ra, vui lòng thử lại");
    } finally {
      setLoading(false);
    }
  };

  const current = questions[index];

  const pick = (option) => {
    if (picked !== null) return; // đã chọn rồi, chờ bấm tiếp
    setPicked(option);
    setAnswers((prev) => ({
      ...prev,
      [current.id]: { word_id: current.word_id, given: option },
    }));
  };

  const next = useCallback(async () => {
    if (index + 1 < questions.length) {
      setIndex((i) => i + 1);
      setPicked(null);
      return;
    }

    // Câu cuối → nộp, server chấm lại
    setLoading(true);
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          mode,
          class_id: classId || null,
          duration_ms: startedAt ? Date.now() - startedAt : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Không nộp được kết quả");

      setResult(d.result);
      setRequeued(d.requeued_words || 0);
      setPhase("done");
      trackEvent("quiz_complete", { mode, percent: d.result?.percent });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [index, questions.length, answers, mode, classId, startedAt]);

  // ── Màn hình chọn chế độ ──
  if (phase === "setup") {
    return (
      <main className="max-w-md mx-auto px-4 py-10">
        <Card elevated padding="2rem">
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: "var(--green-subtle)" }}
          >
            <Zap size={26} style={{ color: "var(--electric)" }} />
          </div>

          <h1 className="text-lg font-bold text-center mb-1" style={{ color: "var(--ink)" }}>
            Quiz từ vựng
          </h1>
          <p className="text-sm text-center mb-6" style={{ color: "var(--ink-soft)" }}>
            10 câu từ những từ bạn đã lưu
          </p>

          <div className="space-y-2 mb-5">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className="w-full text-left px-3 py-2.5 rounded-xl no-min-h"
                style={{
                  background: mode === m.key ? "var(--green-subtle)" : "var(--surface)",
                  border: `1px solid ${mode === m.key ? "var(--green-subtle-border)" : "var(--card-border)"}`,
                }}
              >
                <div
                  className="text-sm font-bold"
                  style={{ color: mode === m.key ? "var(--electric)" : "var(--ink)" }}
                >
                  {m.label}
                </div>
                <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  {m.hint}
                </div>
              </button>
            ))}
          </div>

          {error && (
            <div
              className="mb-4 px-3 py-2 rounded-xl text-xs"
              style={{ background: "var(--error-soft)", color: "var(--error)", border: "1px solid var(--error-border)" }}
            >
              {error}
            </div>
          )}

          <Button onClick={start} disabled={loading} fullWidth>
            {loading ? "Đang tạo đề..." : "Bắt đầu"}
          </Button>
        </Card>
      </main>
    );
  }

  // ── Màn hình kết quả ──
  if (phase === "done" && result) {
    const good = result.percent >= 70;
    return (
      <main className="max-w-md mx-auto px-4 py-10">
        <Card elevated padding="2rem">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: good ? "var(--grass-soft)" : "var(--sunshine-soft)" }}
          >
            <Trophy size={30} style={{ color: good ? "var(--grass-text)" : "var(--sunshine-text)" }} />
          </div>

          <p
            className="text-4xl font-black text-center tabular-nums"
            style={{ color: good ? "var(--grass-text)" : "var(--sunshine-text)" }}
          >
            {result.percent}%
          </p>
          <p className="text-sm text-center mb-5" style={{ color: "var(--ink-soft)" }}>
            Đúng {result.correct}/{result.total} câu
          </p>

          {/* Xem lại câu sai — đây mới là phần giúp người học tiến bộ */}
          <div className="space-y-1.5 mb-5 max-h-[40vh] overflow-y-auto pr-1">
            {questions.map((q, i) => {
              const d = result.details[q.id];
              if (!d) return null;
              return (
                <div
                  key={q.id}
                  className="px-2.5 py-2 rounded-xl text-xs"
                  style={{
                    background: d.correct ? "var(--grass-soft)" : "var(--error-soft)",
                    border: `1px solid ${d.correct ? "var(--grass-border)" : "var(--error-border)"}`,
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {d.correct ? (
                      <Check size={12} style={{ color: "var(--grass-text)" }} />
                    ) : (
                      <X size={12} style={{ color: "var(--error)" }} />
                    )}
                    <span className="font-bold" style={{ color: "var(--ink)" }}>
                      {q.prompt}
                    </span>
                  </div>
                  {!d.correct && (
                    <div className="ml-5" style={{ color: "var(--ink-soft)" }}>
                      Bạn chọn: {d.given || "(bỏ qua)"} · Đáp án:{" "}
                      <strong style={{ color: "var(--ink)" }}>{d.correct_answer}</strong>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {requeued > 0 && (
            <div
              className="px-3 py-2.5 rounded-xl mb-4 text-xs text-left"
              style={{
                background: "var(--green-subtle)",
                border: "1px solid var(--green-subtle-border)",
                color: "var(--ink)",
              }}
            >
              <strong>{requeued} từ</strong> bạn trả lời sai đã được hẹn ôn lại
              vào ngày mai — sẽ xuất hiện trong email nhắc học.
            </div>
          )}

          <div className="flex gap-2">
            <Button icon={RotateCcw} onClick={() => setPhase("setup")} fullWidth>
              Chơi lại
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  // ── Màn hình chơi ──
  if (!current) return null;

  return (
    <main className="max-w-md mx-auto px-4 py-6">
      {/* Tiến độ */}
      <div className="flex items-center gap-2 mb-4">
        <div
          className="flex-1 h-2 rounded-full overflow-hidden"
          style={{ background: "var(--surface)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${((index + 1) / questions.length) * 100}%`,
              background: "var(--electric)",
            }}
          />
        </div>
        <span className="text-xs tabular-nums font-bold" style={{ color: "var(--ink-soft)" }}>
          {index + 1}/{questions.length}
        </span>
      </div>

      <Card elevated padding="1.5rem">
        {current.level && (
          <Badge tone="neutral" className="mb-3">
            {current.level}
          </Badge>
        )}

        <p
          className="font-black text-center my-6"
          style={{ color: "var(--ink)", fontSize: "clamp(24px,6vw,34px)" }}
        >
          {current.prompt}
        </p>

        <div className="space-y-2">
          {current.options.map((opt, i) => {
            const isPicked = picked === opt;
            // Không biết đáp án đúng ở client — chỉ tô đậm lựa chọn đã chọn.
            // Đúng/sai được tiết lộ ở màn hình kết quả sau khi server chấm.
            return (
              <button
                key={i}
                onClick={() => pick(opt)}
                disabled={picked !== null}
                className="w-full text-left px-3.5 py-3 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: isPicked ? "var(--green-subtle)" : "var(--surface)",
                  border: `1.5px solid ${isPicked ? "var(--electric)" : "var(--card-border)"}`,
                  color: "var(--ink)",
                  opacity: picked !== null && !isPicked ? 0.5 : 1,
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {picked !== null && (
          <Button
            icon={index + 1 < questions.length ? ArrowRight : Trophy}
            onClick={next}
            disabled={loading}
            fullWidth
            className="mt-4"
          >
            {loading
              ? "Đang chấm..."
              : index + 1 < questions.length
              ? "Câu tiếp"
              : "Xem kết quả"}
          </Button>
        )}
      </Card>

      {error && (
        <div
          className="mt-3 px-3 py-2 rounded-xl text-xs"
          style={{ background: "var(--error-soft)", color: "var(--error)", border: "1px solid var(--error-border)" }}
        >
          {error}
        </div>
      )}
    </main>
  );
}
