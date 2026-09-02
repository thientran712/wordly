"use client";

// Bài tập về nhà — hai vai trò rất khác nhau trong cùng một component:
//   • Giáo viên: tạo đề, xem ai đã nộp, chấm bài
//   • Học viên: làm bài, nộp, xem điểm
//
// Đáp án KHÔNG bao giờ có trong dữ liệu học viên nhận được (server đã lọc
// bằng stripAnswers), nên UI học viên không thể lộ đáp án dù có bug.

import { useEffect, useState } from "react";
import {
  ClipboardList, Plus, Clock, CheckCircle2, AlertCircle,
  Trash2, Pencil, Send, Award,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";

const TYPE_LABELS = {
  mcq: "Trắc nghiệm",
  fill: "Điền từ",
  essay: "Tự luận",
  match: "Ghép đôi",
};

function formatDue(iso) {
  if (!iso) return "Không có hạn";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.ceil((d - now) / 86400_000);
  const dateStr = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });

  if (diffDays < 0) return `Quá hạn (${dateStr})`;
  if (diffDays === 0) return `Hạn hôm nay`;
  if (diffDays === 1) return `Hạn mai (${dateStr})`;
  return `Hạn ${dateStr}`;
}

export default function HomeworkPanel({ classId, isStaff }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [doing, setDoing] = useState(null);   // học viên đang làm bài
  const [grading, setGrading] = useState(null); // GV đang chấm bài

  const reload = () => {
    fetch(`/api/homework?class_id=${classId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => setItems(d.homework || []))
      .catch(() => setError("Không tải lại được danh sách bài tập"));
  };

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    fetch(`/api/homework?class_id=${classId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => {
        if (!cancelled) setItems(d.homework || []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  if (items === null) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: "var(--hover-bg)" }} />
        ))}
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div
          className="mb-3 px-3 py-2 rounded-xl text-sm"
          style={{ background: "var(--error-soft)", color: "var(--error)", border: "1px solid var(--error-border)" }}
        >
          {error}
        </div>
      )}

      {isStaff && (
        <Button icon={Plus} size="sm" onClick={() => setShowCreate(true)} className="mb-3">
          Tạo bài tập
        </Button>
      )}

      {items.length === 0 ? (
        <Card padding="1.5rem" className="text-center">
          <ClipboardList size={26} className="mx-auto mb-2" style={{ color: "var(--ink-ghost)" }} />
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {isStaff ? "Chưa có bài tập nào." : "Giáo viên chưa giao bài tập."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((hw) => (
            <HomeworkCard
              key={hw.id}
              hw={hw}
              isStaff={isStaff}
              onDo={() => setDoing(hw)}
              onGrade={() => setGrading(hw)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateHomeworkModal
          classId={classId}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
          onError={setError}
        />
      )}

      {doing && (
        <DoHomeworkModal
          hw={doing}
          onClose={() => setDoing(null)}
          onSubmitted={() => {
            setDoing(null);
            reload();
          }}
          onError={setError}
        />
      )}

      {grading && (
        <GradeHomeworkModal
          hw={grading}
          onClose={() => setGrading(null)}
          onGraded={reload}
          onError={setError}
        />
      )}
    </div>
  );
}

function HomeworkCard({ hw, isStaff, onDo, onGrade }) {
  const sub = hw.my_submission;
  const overdue = hw.due_at && new Date(hw.due_at) < new Date();

  return (
    <Card elevated>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-sm truncate" style={{ color: "var(--ink)" }}>
            {hw.title}
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className="text-xs flex items-center gap-1"
              style={{ color: overdue && !sub ? "var(--error)" : "var(--ink-soft)" }}
            >
              <Clock size={11} />
              {formatDue(hw.due_at)}
            </span>
            <span className="text-xs" style={{ color: "var(--ink-ghost)" }}>
              {hw.questions?.length || 0} câu · {hw.total_points} điểm
            </span>
          </div>
        </div>

        {hw.status === "draft" && <Badge tone="warning">Nháp</Badge>}
        {hw.status === "closed" && <Badge tone="neutral">Đã đóng</Badge>}
      </div>

      {hw.instructions && (
        <p className="text-xs mb-3 line-clamp-2" style={{ color: "var(--ink-soft)" }}>
          {hw.instructions}
        </p>
      )}

      {isStaff ? (
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {hw.counts?.submitted || 0} chờ chấm · {hw.counts?.graded || 0} đã chấm
          </span>
          <Button size="sm" variant="secondary" icon={Award} onClick={onGrade} className="ml-auto">
            Chấm bài
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {sub?.status === "graded" ? (
            <>
              <span
                className="text-xs font-bold flex items-center gap-1"
                style={{ color: "var(--grass-text)" }}
              >
                <CheckCircle2 size={13} />
                {sub.total_score}/{hw.total_points} điểm
              </span>
              <Button size="sm" variant="ghost" onClick={onDo} className="ml-auto">
                Xem lại
              </Button>
            </>
          ) : sub?.status === "submitted" ? (
            <>
              <span className="text-xs flex items-center gap-1" style={{ color: "var(--sunshine-text)" }}>
                <Clock size={13} />
                Đã nộp, chờ chấm
              </span>
              {sub.is_late && <Badge tone="error">Nộp muộn</Badge>}
            </>
          ) : (
            <>
              {overdue && !hw.allow_late ? (
                <span className="text-xs flex items-center gap-1" style={{ color: "var(--error)" }}>
                  <AlertCircle size={13} />
                  Đã quá hạn, không nộp được
                </span>
              ) : (
                <Button size="sm" icon={Send} onClick={onDo}>
                  {sub?.status === "in_progress" ? "Tiếp tục làm" : "Làm bài"}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Học viên làm bài
// ══════════════════════════════════════════════════════════════════════════

function DoHomeworkModal({ hw, onClose, onSubmitted, onError }) {
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const readOnly = hw.my_submission?.status === "graded";

  const setAnswer = (qid, value) => {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  };

  const submit = async (draft = false) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/homework/${hw.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, draft }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Không nộp được bài");

      if (draft) {
        onSubmitted();
      } else {
        // Hiện kết quả phần khách quan ngay — học viên thấy luôn câu nào sai
        setResult(d.result);
      }
    } catch (e) {
      onError(e.message);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    return (
      <Modal onClose={onSubmitted} maxWidth="28rem">
        <div className="text-center">
          <div
            className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center"
            style={{ background: "var(--grass-soft)" }}
          >
            <CheckCircle2 size={26} style={{ color: "var(--grass-text)" }} />
          </div>
          <h2 className="text-base font-bold mb-1" style={{ color: "var(--ink)" }}>
            Đã nộp bài!
          </h2>
          <p className="text-2xl font-black my-3" style={{ color: "var(--electric)" }}>
            {result.auto_score}/{result.auto_max} điểm
          </p>
          {result.needs_manual && (
            <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
              Phần tự luận ({result.manual_max} điểm) đang chờ giáo viên chấm.
            </p>
          )}
          <Button onClick={onSubmitted} fullWidth>
            Xong
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} maxWidth="34rem">
      <h2 className="text-base font-bold mb-1" style={{ color: "var(--ink)" }}>
        {hw.title}
      </h2>
      {hw.instructions && (
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
          {hw.instructions}
        </p>
      )}

      {readOnly && hw.my_submission?.feedback && (
        <div
          className="mb-4 px-3 py-2 rounded-xl text-xs"
          style={{ background: "var(--green-subtle)", border: "1px solid var(--green-subtle-border)", color: "var(--ink)" }}
        >
          <strong>Nhận xét của giáo viên:</strong> {hw.my_submission.feedback}
        </div>
      )}

      <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
        {(hw.questions || []).map((q, i) => (
          <div key={q.id}>
            <div className="flex items-start gap-2 mb-2">
              <span
                className="text-xs font-bold flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: "var(--green-subtle)", color: "var(--electric)" }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                  {q.prompt}
                </p>
                <span className="text-xs" style={{ color: "var(--ink-ghost)" }}>
                  {TYPE_LABELS[q.type]} · {q.points} điểm
                </span>
              </div>
            </div>

            <div className="ml-7">
              {q.type === "mcq" && (
                <div className="space-y-1.5">
                  {(q.options || []).map((opt, idx) => (
                    <label
                      key={idx}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer text-sm"
                      style={{
                        background: String(answers[q.id]) === String(idx) ? "var(--green-subtle)" : "var(--surface)",
                        border: `1px solid ${String(answers[q.id]) === String(idx) ? "var(--green-subtle-border)" : "var(--card-border)"}`,
                        color: "var(--ink)",
                      }}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        checked={String(answers[q.id]) === String(idx)}
                        onChange={() => setAnswer(q.id, idx)}
                        disabled={readOnly}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}

              {q.type === "fill" && (
                <Input
                  value={answers[q.id] || ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  placeholder="Nhập câu trả lời"
                  disabled={readOnly}
                />
              )}

              {q.type === "essay" && (
                <Input
                  as="textarea"
                  rows={4}
                  value={answers[q.id] || ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  placeholder="Viết câu trả lời của bạn"
                  disabled={readOnly}
                  className="resize-none"
                />
              )}

              {q.type === "match" && (
                <p className="text-xs" style={{ color: "var(--ink-ghost)" }}>
                  Dạng ghép đôi chưa hỗ trợ trên giao diện này.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {!readOnly && (
        <div className="flex gap-2 mt-5">
          <Button onClick={() => submit(false)} disabled={saving} fullWidth>
            {saving ? "Đang nộp..." : "Nộp bài"}
          </Button>
          <Button variant="secondary" onClick={() => submit(true)} disabled={saving}>
            Lưu nháp
          </Button>
        </div>
      )}
      {readOnly && (
        <Button variant="secondary" onClick={onClose} fullWidth className="mt-5">
          Đóng
        </Button>
      )}
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Giáo viên chấm bài
// ══════════════════════════════════════════════════════════════════════════

function GradeHomeworkModal({ hw, onClose, onGraded, onError }) {
  const [data, setData] = useState(null);
  const [active, setActive] = useState(0);
  // Lưu bản nháp điểm/nhận xét theo submission_id thay vì đồng bộ state
  // trong effect: giá trị hiển thị được SUY RA từ bài đang chọn, nên chuyển
  // qua lại giữa các bài không mất những gì giáo viên đang gõ.
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/homework/${hw.id}/grade`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) onError("Không tải được bài nộp");
      });
    return () => {
      cancelled = true;
    };
  }, [hw.id, onError]);

  const submissions = data?.submissions || [];
  const current = submissions[active];

  // Giá trị hiển thị: bản nháp đang gõ nếu có, ngược lại lấy từ dữ liệu đã lưu.
  const draft = current ? drafts[current.id] : undefined;
  const manualScore = draft?.manualScore ?? current?.manual_score ?? "";
  const feedback = draft?.feedback ?? current?.feedback ?? "";

  const setManualScore = (v) => {
    if (!current) return;
    setDrafts((p) => ({ ...p, [current.id]: { ...p[current.id], manualScore: v } }));
  };
  const setFeedback = (v) => {
    if (!current) return;
    setDrafts((p) => ({ ...p, [current.id]: { ...p[current.id], feedback: v } }));
  };

  const saveGrade = async () => {
    if (!current) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/homework/${hw.id}/grade`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: current.id,
          manual_score: manualScore === "" ? null : Number(manualScore),
          feedback,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Không lưu được điểm");

      // Cập nhật tại chỗ để giáo viên thấy ngay, không phải tải lại cả danh sách
      setData((prev) => ({
        ...prev,
        submissions: prev.submissions.map((s) =>
          s.id === current.id ? { ...s, ...d.submission } : s
        ),
      }));
      // Xoá bản nháp để ô nhập lấy lại giá trị vừa lưu từ server
      setDrafts((p) => {
        const next = { ...p };
        delete next[current.id];
        return next;
      });
      onGraded();
    } catch (e) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <Modal onClose={onClose} maxWidth="32rem">
        <div className="h-40 rounded-xl animate-pulse" style={{ background: "var(--hover-bg)" }} />
      </Modal>
    );
  }

  if (submissions.length === 0) {
    return (
      <Modal onClose={onClose} maxWidth="26rem">
        <h2 className="text-base font-bold mb-2" style={{ color: "var(--ink)" }}>
          {hw.title}
        </h2>
        <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
          Chưa có học viên nào nộp bài.
        </p>
        <Button variant="secondary" onClick={onClose} fullWidth>
          Đóng
        </Button>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} maxWidth="34rem">
      <h2 className="text-base font-bold mb-3" style={{ color: "var(--ink)" }}>
        Chấm: {hw.title}
      </h2>

      {/* Chọn bài nộp */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {submissions.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setActive(i)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap no-min-h flex items-center gap-1"
            style={{
              background: i === active ? "var(--green-subtle)" : "var(--surface)",
              color: i === active ? "var(--electric)" : "var(--ink-soft)",
              border: `1px solid ${i === active ? "var(--green-subtle-border)" : "var(--card-border)"}`,
            }}
          >
            HV {i + 1}
            {s.status === "graded" && <CheckCircle2 size={11} />}
            {s.is_late && <span style={{ color: "var(--error)" }}>·muộn</span>}
          </button>
        ))}
      </div>

      {current && (
        <>
          <div
            className="px-3 py-2 rounded-xl mb-3 text-xs"
            style={{ background: "var(--surface)", color: "var(--ink-soft)" }}
          >
            Điểm khách quan tự động:{" "}
            <strong style={{ color: "var(--electric)" }}>
              {current.grading.auto_score}/{current.grading.auto_max}
            </strong>
            {current.grading.manual_max > 0 && (
              <> · Phần tự luận cần chấm: <strong>{current.grading.manual_max} điểm</strong></>
            )}
          </div>

          {/* Câu trả lời */}
          <div className="space-y-3 max-h-[35vh] overflow-y-auto pr-1 mb-4">
            {(data.homework.questions || []).map((q, i) => {
              const detail = current.grading.details[q.id];
              const given = current.answers?.[q.id];
              return (
                <div
                  key={q.id}
                  className="px-3 py-2 rounded-xl"
                  style={{ background: "var(--surface)", border: "1px solid var(--card-border)" }}
                >
                  <p className="text-xs font-semibold mb-1" style={{ color: "var(--ink)" }}>
                    {i + 1}. {q.prompt}
                  </p>

                  <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    Trả lời:{" "}
                    <span style={{ color: "var(--ink)" }}>
                      {q.type === "mcq"
                        ? q.options?.[given] ?? "(không trả lời)"
                        : given || "(không trả lời)"}
                    </span>
                  </p>

                  {detail?.needs_manual ? (
                    <Badge tone="warning">Cần chấm tay</Badge>
                  ) : detail?.correct ? (
                    <span className="text-xs font-bold" style={{ color: "var(--grass-text)" }}>
                      ✓ Đúng ({detail.points_earned}/{detail.points_max})
                    </span>
                  ) : (
                    <span className="text-xs font-bold" style={{ color: "var(--error)" }}>
                      ✗ Sai (0/{detail?.points_max ?? q.points})
                      {q.type === "mcq" && (
                        <span style={{ color: "var(--ink-ghost)", fontWeight: 400 }}>
                          {" "}· đáp án: {q.options?.[q.answer]}
                        </span>
                      )}
                      {q.type === "fill" && (
                        <span style={{ color: "var(--ink-ghost)", fontWeight: 400 }}>
                          {" "}· đáp án: {Array.isArray(q.answer) ? q.answer.join(" / ") : q.answer}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {current.grading.manual_max > 0 && (
            <>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
                Điểm phần tự luận (tối đa {current.grading.manual_max})
              </label>
              <Input
                type="number"
                min={0}
                max={current.grading.manual_max}
                value={manualScore}
                onChange={(e) => setManualScore(e.target.value)}
                className="mb-3"
              />
            </>
          )}

          <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
            Nhận xét <span style={{ color: "var(--ink-ghost)" }}>(học viên sẽ thấy)</span>
          </label>
          <Input
            as="textarea"
            rows={2}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="mb-4 resize-none"
          />

          <div className="flex gap-2">
            <Button onClick={saveGrade} disabled={saving} fullWidth>
              {saving ? "Đang lưu..." : current.status === "graded" ? "Cập nhật điểm" : "Lưu điểm"}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Đóng
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Giáo viên tạo đề
// ══════════════════════════════════════════════════════════════════════════

function CreateHomeworkModal({ classId, onClose, onCreated, onError }) {
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [publish, setPublish] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [saving, setSaving] = useState(false);

  const addQuestion = (type) => {
    // crypto.randomUUID() thay Date.now(): id phải duy nhất và eslint chặn
    // gọi hàm không thuần trong render path.
    const id = `q-${crypto.randomUUID().slice(0, 8)}`;
    const base = { id, type, prompt: "", points: 1 };
    if (type === "mcq") {
      setQuestions((p) => [...p, { ...base, options: ["", ""], answer: 0 }]);
    } else if (type === "fill") {
      setQuestions((p) => [...p, { ...base, answer: "" }]);
    } else {
      setQuestions((p) => [...p, base]);
    }
  };

  const update = (i, patch) => {
    setQuestions((p) => p.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  };

  const remove = (i) => setQuestions((p) => p.filter((_, idx) => idx !== i));

  const totalPoints = questions.reduce((s, q) => s + (Number(q.points) || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || questions.length === 0 || saving) return;

    setSaving(true);
    try {
      // Chuyển đáp án "fill" từ chuỗi "big / large" sang mảng, đúng định dạng
      // mà homework-grading.js mong đợi (hỗ trợ nhiều đáp án đúng).
      const payloadQuestions = questions.map((q) => {
        if (q.type !== "fill") return q;
        const parts = String(q.answer || "")
          .split("/")
          .map((s) => s.trim())
          .filter(Boolean);
        return { ...q, answer: parts.length > 1 ? parts : parts[0] || "" };
      });

      const res = await fetch("/api/homework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: classId,
          title,
          instructions,
          questions: payloadQuestions,
          due_at: dueAt ? new Date(dueAt).toISOString() : null,
          status: publish ? "published" : "draft",
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Không tạo được bài tập");
      onCreated();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="34rem">
      <form onSubmit={submit}>
        <h2 className="text-base font-bold mb-4" style={{ color: "var(--ink)" }}>
          Tạo bài tập
        </h2>

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Tiêu đề
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="VD: Bài tập Present Perfect"
          maxLength={300}
          autoFocus
          className="mb-3"
        />

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Hướng dẫn <span style={{ color: "var(--ink-ghost)" }}>(tuỳ chọn)</span>
        </label>
        <Input
          as="textarea"
          rows={2}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className="mb-3 resize-none"
        />

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Hạn nộp <span style={{ color: "var(--ink-ghost)" }}>(tuỳ chọn)</span>
        </label>
        <Input
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="mb-4"
        />

        {/* Câu hỏi */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
            Câu hỏi ({questions.length}) · {totalPoints} điểm
          </span>
        </div>

        <div className="flex gap-1 mb-3 flex-wrap">
          {Object.entries(TYPE_LABELS)
            .filter(([k]) => k !== "match") // ghép đôi chưa hỗ trợ trên UI
            .map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => addQuestion(key)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold no-min-h"
                style={{
                  background: "var(--surface)",
                  color: "var(--ink-soft)",
                  border: "1px solid var(--card-border)",
                }}
              >
                + {label}
              </button>
            ))}
        </div>

        <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1 mb-4">
          {questions.map((q, i) => (
            <div
              key={q.id}
              className="px-3 py-2.5 rounded-xl"
              style={{ background: "var(--surface)", border: "1px solid var(--card-border)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Badge tone="neutral">{TYPE_LABELS[q.type]}</Badge>
                <input
                  type="number"
                  min={0}
                  value={q.points}
                  onChange={(e) => update(i, { points: Number(e.target.value) })}
                  className="w-14 px-1.5 py-0.5 rounded text-xs text-center"
                  style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--ink)" }}
                />
                <span className="text-xs" style={{ color: "var(--ink-ghost)" }}>điểm</span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="no-min-h ml-auto w-6 h-6 rounded flex items-center justify-center"
                  style={{ color: "var(--error)" }}
                >
                  <Trash2 size={12} />
                </button>
              </div>

              <Input
                value={q.prompt}
                onChange={(e) => update(i, { prompt: e.target.value })}
                placeholder="Nội dung câu hỏi"
                className="mb-2"
              />

              {q.type === "mcq" && (
                <div className="space-y-1.5">
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`ans-${q.id}`}
                        checked={q.answer === oi}
                        onChange={() => update(i, { answer: oi })}
                        title="Đáp án đúng"
                      />
                      <Input
                        value={opt}
                        onChange={(e) => {
                          const opts = [...q.options];
                          opts[oi] = e.target.value;
                          update(i, { options: opts });
                        }}
                        placeholder={`Lựa chọn ${oi + 1}`}
                      />
                      {q.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() =>
                            update(i, {
                              options: q.options.filter((_, x) => x !== oi),
                              answer: q.answer >= oi && q.answer > 0 ? q.answer - 1 : q.answer,
                            })
                          }
                          className="no-min-h w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                          style={{ color: "var(--ink-ghost)" }}
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => update(i, { options: [...q.options, ""] })}
                    className="text-xs font-bold no-min-h"
                    style={{ color: "var(--electric)" }}
                  >
                    + Thêm lựa chọn
                  </button>
                  <p className="text-xs" style={{ color: "var(--ink-ghost)" }}>
                    Chọn ô tròn bên trái để đánh dấu đáp án đúng.
                  </p>
                </div>
              )}

              {q.type === "fill" && (
                <Input
                  value={q.answer}
                  onChange={(e) => update(i, { answer: e.target.value })}
                  placeholder="Đáp án đúng (nhiều đáp án cách nhau bởi dấu /)"
                />
              )}

              {q.type === "essay" && (
                <p className="text-xs" style={{ color: "var(--ink-ghost)" }}>
                  Câu tự luận sẽ do giáo viên chấm tay.
                </p>
              )}
            </div>
          ))}
        </div>

        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
          <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
            Giao cho học viên ngay
          </span>
        </label>

        <div className="flex gap-2">
          <Button type="submit" disabled={!title.trim() || questions.length === 0 || saving} fullWidth>
            {saving ? "Đang tạo..." : "Tạo bài tập"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
        </div>
      </form>
    </Modal>
  );
}
