"use client";

// Giao bộ từ vựng cho lớp.
//
// Điểm mạnh: không xây gì mới cho phần phân phối — bộ từ được giao nạp vào
// hàng đợi FSRS sẵn có, học viên nhận qua email và thấy trong app bằng đúng
// cơ chế đang chạy.

import { useEffect, useState } from "react";
import { BookOpen, Plus, Calendar, Layers } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { TOPICS } from "@/lib/topic-classifier";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default function AssignmentsPanel({ classId, isStaff }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const reload = () => {
    fetch(`/api/classes/${classId}/assignments`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => setItems(d.assignments || []))
      .catch(() => setError("Không tải lại được danh sách"));
  };

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    fetch(`/api/classes/${classId}/assignments`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => {
        if (!cancelled) setItems(d.assignments || []);
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
          <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "var(--hover-bg)" }} />
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
          Giao bộ từ
        </Button>
      )}

      {items.length === 0 ? (
        <Card padding="1.5rem" className="text-center">
          <BookOpen size={26} className="mx-auto mb-2" style={{ color: "var(--ink-ghost)" }} />
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {isStaff
              ? "Chưa giao bộ từ nào. Từ được giao sẽ tự vào hàng đợi ôn tập của học viên."
              : "Giáo viên chưa giao bộ từ nào."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {items.map((a) => {
            const topic = TOPICS.find((t) => t.key === a.filter_topic);
            return (
              <Card key={a.id} elevated>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-sm truncate" style={{ color: "var(--ink)" }}>
                    {a.title}
                  </h3>
                  <Badge tone="accent">{a.daily_count} từ/ngày</Badge>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs" style={{ color: "var(--ink-soft)" }}>
                  {a.filter_level && (
                    <span className="flex items-center gap-1">
                      <Layers size={11} />
                      {a.filter_level}
                    </span>
                  )}
                  {topic && (
                    <span>
                      {topic.icon} {topic.label}
                    </span>
                  )}
                  {a.explicit_word_ids?.length > 0 && (
                    <span>{a.explicit_word_ids.length} từ chỉ định</span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar size={11} />
                    Từ {new Date(a.start_date).toLocaleDateString("vi-VN")}
                    {a.end_date && ` đến ${new Date(a.end_date).toLocaleDateString("vi-VN")}`}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateAssignmentModal
          classId={classId}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function CreateAssignmentModal({ classId, onClose, onCreated, onError }) {
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("");
  const [topic, setTopic] = useState("");
  const [dailyCount, setDailyCount] = useState(5);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  // API yêu cầu ít nhất một tiêu chí chọn từ
  const hasCriteria = !!level || !!topic;

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !hasCriteria || saving) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/classes/${classId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          filter_level: level || null,
          filter_topic: topic || null,
          daily_count: Number(dailyCount),
          start_date: startDate || null,
          end_date: endDate || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Không giao được bộ từ");
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
        <h2 className="text-base font-bold mb-1" style={{ color: "var(--ink)" }}>
          Giao bộ từ vựng
        </h2>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
          Từ được giao sẽ tự vào hàng đợi ôn tập và gửi qua email cho học viên.
        </p>

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Tên bộ từ
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="VD: Từ vựng IELTS chủ đề Môi trường"
          maxLength={300}
          autoFocus
          className="mb-3"
        />

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Trình độ
        </label>
        <div className="grid grid-cols-6 gap-1 mb-3">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(level === l ? "" : l)}
              className="px-1 py-1.5 rounded-lg text-xs font-bold no-min-h"
              style={{
                background: level === l ? "var(--green-subtle)" : "var(--surface)",
                color: level === l ? "var(--electric)" : "var(--ink-soft)",
                border: `1px solid ${level === l ? "var(--green-subtle-border)" : "var(--card-border)"}`,
              }}
            >
              {l}
            </button>
          ))}
        </div>

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Chủ đề
        </label>
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="w-full px-3 py-2 rounded-xl text-sm mb-3 appearance-none"
          style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--ink)" }}
        >
          <option value="">— Mọi chủ đề —</option>
          {TOPICS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.icon} {t.label}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
              Từ/ngày
            </label>
            <Input
              type="number"
              min={1}
              max={50}
              value={dailyCount}
              onChange={(e) => setDailyCount(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
              Bắt đầu
            </label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
              Kết thúc
            </label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        {!hasCriteria && (
          <p className="text-xs mb-3" style={{ color: "var(--sunshine-text)" }}>
            Chọn ít nhất một trình độ hoặc chủ đề để xác định bộ từ.
          </p>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={!title.trim() || !hasCriteria || saving} fullWidth>
            {saving ? "Đang giao..." : "Giao bộ từ"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
        </div>
      </form>
    </Modal>
  );
}
