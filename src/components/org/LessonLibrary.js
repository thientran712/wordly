"use client";

// Thư viện bài giảng của một lớp: buổi học + tài liệu.
//
// Upload đi TRỰC TIẾP lên Supabase Storage bằng signed URL, không qua server
// của mình — tránh nghẽn và tránh giới hạn body size của Vercel.

import { useEffect, useState, useRef } from "react";
import {
  FileText, Music, Link2, Upload, Trash2, Plus, ExternalLink,
  ChevronDown, ChevronRight, Download, Eye, HardDrive,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";

const KIND_ICON = { document: FileText, audio: Music, link: Link2, video: Link2 };

function formatBytes(n) {
  if (!n) return "";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function LessonLibrary({ classId, isStaff }) {
  const [sessions, setSessions] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [showNewSession, setShowNewSession] = useState(false);
  const [uploadTarget, setUploadTarget] = useState(null);
  const [error, setError] = useState("");

  // Tải lại sau khi thêm/xoá. KHÔNG chạm vào `expanded` — nếu reset thì buổi
  // học mà người dùng đang mở sẽ tự đóng lại giữa lúc họ làm việc.
  const reload = () => {
    fetch(`/api/classes/${classId}/sessions`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => setSessions(d.sessions || []))
      .catch(() => setError("Không tải lại được danh sách"));
  };

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    fetch(`/api/classes/${classId}/sessions`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => {
        if (cancelled) return;
        setSessions(d.sessions || []);
        if (d.sessions?.length) setExpanded(new Set([d.sessions[0].id]));
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (sessions === null) {
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
        <Button icon={Plus} size="sm" onClick={() => setShowNewSession(true)} className="mb-3">
          Thêm buổi học
        </Button>
      )}

      {sessions.length === 0 ? (
        <Card padding="1.5rem" className="text-center">
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {isStaff ? "Chưa có buổi học nào." : "Giáo viên chưa đăng bài giảng."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const open = expanded.has(s.id);
            return (
              <Card key={s.id} elevated padding="0" className="overflow-hidden">
                <button
                  onClick={() => toggle(s.id)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left no-min-h"
                >
                  {open ? (
                    <ChevronDown size={16} style={{ color: "var(--ink-soft)" }} />
                  ) : (
                    <ChevronRight size={16} style={{ color: "var(--ink-soft)" }} />
                  )}
                  <span className="font-bold text-sm flex-1 truncate" style={{ color: "var(--ink)" }}>
                    {s.title}
                  </span>
                  {s.status === "draft" && <Badge tone="warning">Nháp</Badge>}
                  <span className="text-xs" style={{ color: "var(--ink-ghost)" }}>
                    {s.lesson_materials?.length || 0} tài liệu
                  </span>
                </button>

                {open && (
                  <div className="px-4 pb-3" style={{ borderTop: "1px solid var(--divider)" }}>
                    {s.notes && (
                      <p className="text-xs my-2" style={{ color: "var(--ink-soft)" }}>
                        {s.notes}
                      </p>
                    )}

                    {(s.lesson_materials || []).length === 0 ? (
                      <p className="text-xs py-2" style={{ color: "var(--ink-ghost)" }}>
                        Chưa có tài liệu
                      </p>
                    ) : (
                      <div className="space-y-1.5 mt-2">
                        {s.lesson_materials.map((m) => (
                          <MaterialRow
                            key={m.id}
                            material={m}
                            isStaff={isStaff}
                            onDeleted={reload}
                            onError={setError}
                          />
                        ))}
                      </div>
                    )}

                    {isStaff && (
                      <Button
                        icon={Upload}
                        size="sm"
                        variant="secondary"
                        className="mt-3"
                        onClick={() => setUploadTarget(s)}
                      >
                        Thêm tài liệu
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {showNewSession && (
        <NewSessionModal
          classId={classId}
          onClose={() => setShowNewSession(false)}
          onCreated={() => {
            setShowNewSession(false);
            reload();
          }}
          onError={setError}
        />
      )}

      {uploadTarget && (
        <UploadModal
          session={uploadTarget}
          onClose={() => setUploadTarget(null)}
          onDone={() => {
            setUploadTarget(null);
            reload();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function MaterialRow({ material, isStaff, onDeleted, onError }) {
  const [busy, setBusy] = useState(false);
  const Icon = KIND_ICON[material.kind] || FileText;

  const open = async (download = false) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/materials/${material.id}/url${download ? "?download=1" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không mở được tài liệu");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Xoá "${material.title}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/materials?id=${material.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Không xoá được");
      }
      onDeleted();
    } catch (e) {
      onError(e.message);
      setBusy(false);
    }
  };

  return (
    <div
      className="flex items-center gap-2 px-2.5 py-2 rounded-xl"
      style={{ background: "var(--surface)", border: "1px solid var(--card-border)" }}
    >
      <Icon size={15} className="flex-shrink-0" style={{ color: "var(--duo-blue)" }} />
      <span className="text-xs flex-1 truncate" style={{ color: "var(--ink)" }}>
        {material.title}
      </span>
      {material.size_bytes ? (
        <span className="text-xs flex-shrink-0" style={{ color: "var(--ink-ghost)" }}>
          {formatBytes(material.size_bytes)}
        </span>
      ) : null}

      <button
        onClick={() => open(false)}
        disabled={busy}
        className="no-min-h w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ color: "var(--ink-soft)" }}
        title={material.kind === "link" ? "Mở link" : "Xem"}
      >
        {material.kind === "link" ? <ExternalLink size={13} /> : <Eye size={13} />}
      </button>

      {material.kind !== "link" && material.allow_download && (
        <button
          onClick={() => open(true)}
          disabled={busy}
          className="no-min-h w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ color: "var(--ink-soft)" }}
          title="Tải về"
        >
          <Download size={13} />
        </button>
      )}

      {isStaff && (
        <button
          onClick={remove}
          disabled={busy}
          className="no-min-h w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ color: "var(--error)" }}
          title="Xoá"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

function NewSessionModal({ classId, onClose, onCreated, onError }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [publish, setPublish] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/classes/${classId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          notes,
          session_date: date || null,
          status: publish ? "published" : "draft",
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Không tạo được buổi học");
      onCreated();
    } catch (e) {
      onError(e.message);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="26rem">
      <form onSubmit={submit}>
        <h2 className="text-base font-bold mb-4" style={{ color: "var(--ink)" }}>
          Thêm buổi học
        </h2>

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Tiêu đề
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="VD: Buổi 5 — Present Perfect"
          maxLength={300}
          autoFocus
          className="mb-3"
        />

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Ngày học <span style={{ color: "var(--ink-ghost)" }}>(tuỳ chọn)</span>
        </label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mb-3" />

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Ghi chú <span style={{ color: "var(--ink-ghost)" }}>(tuỳ chọn)</span>
        </label>
        <Input
          as="textarea"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mb-3 resize-none"
        />

        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
          <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
            Cho học viên xem ngay
          </span>
        </label>

        <div className="flex gap-2">
          <Button type="submit" disabled={!title.trim() || saving} fullWidth>
            {saving ? "Đang tạo..." : "Tạo buổi học"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function UploadModal({ session, onClose, onDone, onError }) {
  const [mode, setMode] = useState("file"); // file | link
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [allowDownload, setAllowDownload] = useState(true);
  const [progress, setProgress] = useState(null);
  const fileRef = useRef(null);

  const submitFile = async (e) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return onError("Chưa chọn file");

    setProgress("Đang xin quyền upload...");
    try {
      // Bước 1-3: xin signed URL (server kiểm quyền + quota)
      const kind = file.type.startsWith("audio/") ? "audio" : "document";
      const urlRes = await fetch("/api/materials/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session.id,
          kind,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error || "Không xin được quyền upload");

      // Bước 4: upload TRỰC TIẾP lên Storage, không qua server của mình
      setProgress("Đang tải file lên...");
      const putRes = await fetch(urlData.upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Tải file lên thất bại");

      // Bước 5: đăng ký — server xác minh dung lượng THẬT từ Storage
      setProgress("Đang lưu...");
      const regRes = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session.id,
          kind,
          title: title.trim() || file.name,
          storage_path: urlData.storage_path,
          allow_download: allowDownload,
        }),
      });
      const regData = await regRes.json();
      if (!regRes.ok) throw new Error(regData.error || "Không lưu được tài liệu");

      onDone();
    } catch (err) {
      onError(err.message);
      setProgress(null);
    }
  };

  const submitLink = async (e) => {
    e.preventDefault();
    if (!linkUrl.trim() || !title.trim()) return;
    setProgress("Đang lưu...");
    try {
      const res = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session.id,
          kind: "link",
          title,
          external_url: linkUrl.trim(),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Không lưu được link");
      onDone();
    } catch (err) {
      onError(err.message);
      setProgress(null);
    }
  };

  return (
    <Modal onClose={progress ? undefined : onClose} maxWidth="26rem">
      <h2 className="text-base font-bold mb-1" style={{ color: "var(--ink)" }}>
        Thêm tài liệu
      </h2>
      <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
        {session.title}
      </p>

      <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: "var(--surface)" }}>
        {[
          { key: "file", label: "Tải file lên" },
          { key: "link", label: "Đính link" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setMode(t.key)}
            disabled={!!progress}
            className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold no-min-h"
            style={{
              background: mode === t.key ? "var(--card-bg)" : "transparent",
              color: mode === t.key ? "var(--electric)" : "var(--ink-soft)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "file" ? (
        <form onSubmit={submitFile}>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,audio/*"
            disabled={!!progress}
            className="w-full text-xs mb-3"
            style={{ color: "var(--ink-soft)" }}
          />

          <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
            Tên hiển thị <span style={{ color: "var(--ink-ghost)" }}>(mặc định lấy tên file)</span>
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            disabled={!!progress}
            className="mb-3"
          />

          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={allowDownload}
              onChange={(e) => setAllowDownload(e.target.checked)}
              disabled={!!progress}
            />
            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
              Cho học viên tải về
            </span>
          </label>

          <div
            className="flex items-start gap-1.5 text-xs mb-4 px-2.5 py-2 rounded-xl"
            style={{ background: "var(--surface)", color: "var(--ink-ghost)" }}
          >
            <HardDrive size={13} className="flex-shrink-0 mt-0.5" />
            <span>Tài liệu tối đa 50MB, audio tối đa 100MB.</span>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={!!progress} fullWidth>
              {progress || "Tải lên"}
            </Button>
            {!progress && (
              <Button type="button" variant="secondary" onClick={onClose}>
                Huỷ
              </Button>
            )}
          </div>
        </form>
      ) : (
        <form onSubmit={submitLink}>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
            Tên hiển thị
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Video bài giảng buổi 5"
            maxLength={300}
            className="mb-3"
          />

          <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
            Link
          </label>
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://youtube.com/..."
            className="mb-2"
          />
          <p className="text-xs mb-4" style={{ color: "var(--ink-ghost)" }}>
            Hỗ trợ YouTube, Google Drive, Vimeo, OneDrive.
          </p>

          <div className="flex gap-2">
            <Button type="submit" disabled={!linkUrl.trim() || !title.trim() || !!progress} fullWidth>
              {progress || "Lưu link"}
            </Button>
            {!progress && (
              <Button type="button" variant="secondary" onClick={onClose}>
                Huỷ
              </Button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}
