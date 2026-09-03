"use client";

// Bài nói: học viên ghi âm nộp, giáo viên nghe rồi chấm 4 tiêu chí.
//
// Ghi âm dùng MediaRecorder của trình duyệt (không cần thư viện ngoài).
// Audio upload TRỰC TIẾP lên Storage bằng signed URL, không qua server.

import { useEffect, useState, useRef } from "react";
import {
  Mic, Square, Play, Pause, Upload, Clock, CheckCircle2,
  Plus, Trash2, Award, AlertCircle,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";

const CRITERIA = [
  { key: "score_fluency", label: "Lưu loát" },
  { key: "score_pronunciation", label: "Phát âm" },
  { key: "score_vocabulary", label: "Từ vựng" },
  { key: "score_grammar", label: "Ngữ pháp" },
];

function fmtTime(ms) {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function SpeakingPanel({ classId, isStaff }) {
  const [prompts, setPrompts] = useState(null);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [recording, setRecording] = useState(null);
  const [grading, setGrading] = useState(null);

  const reload = () => {
    fetch(`/api/speaking?class_id=${classId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => setPrompts(d.prompts || []))
      .catch(() => setError("Không tải lại được danh sách"));
  };

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    fetch(`/api/speaking?class_id=${classId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => {
        if (!cancelled) setPrompts(d.prompts || []);
      })
      .catch(() => {
        if (!cancelled) setPrompts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  if (prompts === null) {
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
          Tạo đề nói
        </Button>
      )}

      {prompts.length === 0 ? (
        <Card padding="1.5rem" className="text-center">
          <Mic size={26} className="mx-auto mb-2" style={{ color: "var(--ink-ghost)" }} />
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {isStaff ? "Chưa có đề nói nào." : "Giáo viên chưa giao bài nói."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {prompts.map((p) => (
            <Card key={p.id} elevated>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-sm truncate" style={{ color: "var(--ink)" }}>
                    {p.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {p.max_seconds}s
                    </span>
                    {p.due_at && (
                      <span>Hạn {new Date(p.due_at).toLocaleDateString("vi-VN")}</span>
                    )}
                  </div>
                </div>
                {p.status === "draft" && <Badge tone="warning">Nháp</Badge>}
              </div>

              <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
                {p.prompt_text}
              </p>

              {isStaff ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    {p.counts?.submitted || 0} chờ chấm · {p.counts?.graded || 0} đã chấm
                  </span>
                  <Button size="sm" variant="secondary" icon={Award}
                    onClick={() => setGrading(p)} className="ml-auto">
                    Chấm bài
                  </Button>
                </div>
              ) : p.my_submission?.status === "graded" ? (
                <div>
                  <span className="text-xs font-bold flex items-center gap-1" style={{ color: "var(--grass-text)" }}>
                    <CheckCircle2 size={13} />
                    Điểm: {p.my_submission.score_overall ?? "—"}
                  </span>
                  {p.my_submission.feedback && (
                    <p className="text-xs mt-1.5 px-2.5 py-2 rounded-lg"
                      style={{ background: "var(--green-subtle)", color: "var(--ink)" }}>
                      <strong>Nhận xét:</strong> {p.my_submission.feedback}
                    </p>
                  )}
                </div>
              ) : p.my_submission?.status === "submitted" ? (
                <span className="text-xs flex items-center gap-1" style={{ color: "var(--sunshine-text)" }}>
                  <Clock size={13} />
                  Đã nộp, chờ giáo viên chấm
                  {p.my_submission.is_late && " (nộp muộn)"}
                </span>
              ) : (
                <Button size="sm" icon={Mic} onClick={() => setRecording(p)}>
                  Ghi âm bài nói
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <CreatePromptModal classId={classId} onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); reload(); }} onError={setError} />
      )}

      {recording && (
        <RecordModal prompt={recording} onClose={() => setRecording(null)}
          onDone={() => { setRecording(null); reload(); }} onError={setError} />
      )}

      {grading && (
        <GradeModal prompt={grading} onClose={() => setGrading(null)}
          onGraded={reload} onError={setError} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Học viên ghi âm
// ══════════════════════════════════════════════════════════════════════════

function RecordModal({ prompt, onClose, onDone, onError }) {
  const [state, setState] = useState("idle"); // idle | recording | recorded | uploading
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const blobRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const startedRef = useRef(0);

  // Dọn tài nguyên khi đóng: không tắt mic là camera/mic vẫn sáng đèn
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      // opus nén rất tốt cho giọng nói: ~24kbps đủ nghe rõ
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 24000 });

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        blobRef.current = blob;
        setAudioUrl(URL.createObjectURL(blob));
        setState("recorded");
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };

      recorderRef.current = rec;
      rec.start();
      // performance.now() là đồng hồ ĐƠN ĐIỆU — không nhảy khi hệ thống đổi
      // giờ, nên đo khoảng thời gian chính xác hơn Date.now().
      //
      // rule react-hooks/purity báo false positive ở đây: cả `start` (async
      // event handler, chạy sau await) và callback của setInterval đều KHÔNG
      // nằm trong render path. Rule không phân biệt được hai ngữ cảnh này.
      /* eslint-disable react-hooks/purity */
      startedRef.current = performance.now();
      setState("recording");

      timerRef.current = setInterval(() => {
        const ms = performance.now() - startedRef.current;
        setElapsed(ms);
        // Tự dừng khi hết thời lượng cho phép — server cũng chặn, đây là
        // để người học không mất công nói rồi bị từ chối.
        if (ms >= prompt.max_seconds * 1000) stop();
      }, 200);
      /* eslint-enable react-hooks/purity */
    } catch {
      onError("Không truy cập được micro. Hãy cho phép quyền micro trong trình duyệt.");
      onClose();
    }
  };

  const stop = () => {
    clearInterval(timerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const submit = async () => {
    const blob = blobRef.current;
    if (!blob) return;

    setState("uploading");
    try {
      // Bước 1: xin signed URL (server kiểm quyền + quota + thời lượng)
      const urlRes = await fetch(`/api/speaking/${prompt.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upload-url",
          mime_type: "audio/webm",
          size_bytes: blob.size,
          duration_ms: elapsed,
        }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error || "Không xin được quyền upload");

      // Bước 2: upload TRỰC TIẾP lên Storage
      const put = await fetch(urlData.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "audio/webm" },
        body: blob,
      });
      if (!put.ok) throw new Error("Tải audio lên thất bại");

      // Bước 3: đăng ký (server xác minh dung lượng thật)
      const regRes = await fetch(`/api/speaking/${prompt.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storage_path: urlData.storage_path, duration_ms: elapsed }),
      });
      const reg = await regRes.json();
      if (!regRes.ok) throw new Error(reg.error || "Không nộp được bài");

      onDone();
    } catch (e) {
      onError(e.message);
      setState("recorded");
    }
  };

  const overTime = elapsed >= prompt.max_seconds * 1000;

  return (
    <Modal onClose={state === "uploading" ? undefined : onClose} maxWidth="26rem">
      <h2 className="text-base font-bold mb-1" style={{ color: "var(--ink)" }}>
        {prompt.title}
      </h2>
      <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
        {prompt.prompt_text}
      </p>

      <div
        className="px-3 py-4 rounded-xl mb-4 text-center"
        style={{ background: "var(--surface)", border: "1px solid var(--card-border)" }}
      >
        <p
          className="text-3xl font-black tabular-nums mb-1"
          style={{ color: overTime ? "var(--error)" : "var(--ink)" }}
        >
          {fmtTime(elapsed)}
        </p>
        <p className="text-xs" style={{ color: "var(--ink-ghost)" }}>
          tối đa {fmtTime(prompt.max_seconds * 1000)}
        </p>

        {state === "recording" && (
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: "var(--error)" }}
            />
            <span className="text-xs font-bold" style={{ color: "var(--error)" }}>
              Đang ghi âm
            </span>
          </div>
        )}
      </div>

      {audioUrl && state !== "recording" && (
        <audio src={audioUrl} controls className="w-full mb-4" />
      )}

      <div className="flex gap-2">
        {state === "idle" && (
          <Button icon={Mic} onClick={start} fullWidth>
            Bắt đầu ghi
          </Button>
        )}
        {state === "recording" && (
          <Button icon={Square} variant="danger" onClick={stop} fullWidth>
            Dừng
          </Button>
        )}
        {state === "recorded" && (
          <>
            <Button icon={Upload} onClick={submit} fullWidth>
              Nộp bài
            </Button>
            <Button variant="secondary" icon={Mic} onClick={() => { setElapsed(0); start(); }}>
              Ghi lại
            </Button>
          </>
        )}
        {state === "uploading" && (
          <Button disabled fullWidth>Đang nộp...</Button>
        )}
        {state !== "uploading" && state !== "recording" && (
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
        )}
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Giáo viên chấm
// ══════════════════════════════════════════════════════════════════════════

function GradeModal({ prompt, onClose, onGraded, onError }) {
  const [data, setData] = useState(null);
  const [active, setActive] = useState(0);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/speaking/${prompt.id}/grade`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) onError("Không tải được bài nộp"); });
    return () => { cancelled = true; };
  }, [prompt.id, onError]);

  const subs = data?.submissions || [];
  const cur = subs[active];
  const max = data?.score_max ?? 10;

  // Giá trị hiển thị suy ra từ bài đang chọn — chuyển qua lại không mất
  // nội dung giáo viên đang gõ
  const draft = cur ? drafts[cur.id] : undefined;
  const val = (k) => draft?.[k] ?? cur?.[k] ?? "";
  const setVal = (k, v) => {
    if (!cur) return;
    setDrafts((p) => ({ ...p, [cur.id]: { ...p[cur.id], [k]: v } }));
  };

  const save = async () => {
    if (!cur) return;
    setSaving(true);
    try {
      const payload = { submission_id: cur.id, feedback: val("feedback") };
      for (const c of CRITERIA) {
        const v = val(c.key);
        payload[c.key] = v === "" ? null : Number(v);
      }

      const res = await fetch(`/api/speaking/${prompt.id}/grade`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Không lưu được điểm");

      setData((p) => ({
        ...p,
        submissions: p.submissions.map((s) => (s.id === cur.id ? { ...s, ...d.submission } : s)),
      }));
      setDrafts((p) => { const n = { ...p }; delete n[cur.id]; return n; });
      onGraded();
    } catch (e) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <Modal onClose={onClose} maxWidth="30rem">
        <div className="h-40 rounded-xl animate-pulse" style={{ background: "var(--hover-bg)" }} />
      </Modal>
    );
  }

  if (subs.length === 0) {
    return (
      <Modal onClose={onClose} maxWidth="24rem">
        <h2 className="text-base font-bold mb-2" style={{ color: "var(--ink)" }}>{prompt.title}</h2>
        <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
          Chưa có học viên nào nộp bài nói.
        </p>
        <Button variant="secondary" onClick={onClose} fullWidth>Đóng</Button>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} maxWidth="30rem">
      <h2 className="text-base font-bold mb-3" style={{ color: "var(--ink)" }}>
        Chấm: {prompt.title}
      </h2>

      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {subs.map((s, i) => (
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

      {cur && (
        <>
          {cur.audio_expired ? (
            <div
              className="px-3 py-2.5 rounded-xl mb-4 text-xs flex items-start gap-1.5"
              style={{ background: "var(--sunshine-soft)", border: "1px solid var(--sunshine-border)", color: "var(--sunshine-dark)" }}
            >
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>Audio đã được dọn sau 90 ngày. Điểm và nhận xét vẫn được giữ.</span>
            </div>
          ) : cur.audio_url ? (
            <div className="mb-4">
              <audio src={cur.audio_url} controls className="w-full" />
              <p className="text-xs mt-1" style={{ color: "var(--ink-ghost)" }}>
                Thời lượng: {fmtTime(cur.duration_ms)} · nộp{" "}
                {new Date(cur.submitted_at).toLocaleString("vi-VN")}
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 mb-3">
            {CRITERIA.map((c) => (
              <div key={c.key}>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--ink-soft)" }}>
                  {c.label} <span style={{ color: "var(--ink-ghost)" }}>/{max}</span>
                </label>
                <Input
                  type="number"
                  min={0}
                  max={max}
                  step="0.5"
                  value={val(c.key)}
                  onChange={(e) => setVal(c.key, e.target.value)}
                />
              </div>
            ))}
          </div>

          <p className="text-xs mb-3" style={{ color: "var(--ink-ghost)" }}>
            Điểm tổng được tính tự động là trung bình các tiêu chí đã cho điểm
            (thang {data.grading_scale}).
          </p>

          <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
            Nhận xét <span style={{ color: "var(--ink-ghost)" }}>(học viên sẽ thấy)</span>
          </label>
          <Input
            as="textarea"
            rows={3}
            value={val("feedback")}
            onChange={(e) => setVal("feedback", e.target.value)}
            className="mb-4 resize-none"
          />

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} fullWidth>
              {saving ? "Đang lưu..." : cur.status === "graded" ? "Cập nhật điểm" : "Lưu điểm"}
            </Button>
            <Button variant="secondary" onClick={onClose}>Đóng</Button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Giáo viên tạo đề
// ══════════════════════════════════════════════════════════════════════════

function CreatePromptModal({ classId, onClose, onCreated, onError }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(120);
  const [dueAt, setDueAt] = useState("");
  const [publish, setPublish] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !text.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/speaking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: classId,
          title,
          prompt_text: text,
          max_seconds: Number(seconds),
          due_at: dueAt ? new Date(dueAt).toISOString() : null,
          status: publish ? "published" : "draft",
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Không tạo được đề nói");
      onCreated();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="26rem">
      <form onSubmit={submit}>
        <h2 className="text-base font-bold mb-4" style={{ color: "var(--ink)" }}>Tạo đề nói</h2>

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Tiêu đề
        </label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="VD: IELTS Speaking Part 2 — Describe a book"
          maxLength={300} autoFocus className="mb-3" />

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Nội dung đề
        </label>
        <Input as="textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Describe a book you have read recently. You should say..."
          className="mb-3 resize-none" />

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
              Thời lượng (giây)
            </label>
            <Input type="number" min={15} max={300} value={seconds}
              onChange={(e) => setSeconds(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
              Hạn nộp
            </label>
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
        </div>

        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
          <span className="text-xs" style={{ color: "var(--ink-soft)" }}>Giao cho học viên ngay</span>
        </label>

        <div className="flex gap-2">
          <Button type="submit" disabled={!title.trim() || !text.trim() || saving} fullWidth>
            {saving ? "Đang tạo..." : "Tạo đề nói"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>Huỷ</Button>
        </div>
      </form>
    </Modal>
  );
}
