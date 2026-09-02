"use client";

// Quản lý thành viên tổ chức — chỉ owner mời/xoá.
//
// Hai luồng vào tổ chức: mời qua email (danh sách có sẵn) và mã lớp (GV đọc
// trên lớp). Panel này lo luồng thứ nhất.

import { useEffect, useState } from "react";
import { UserPlus, Trash2, Mail, ShieldCheck, GraduationCap, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";

const ROLE_LABELS = {
  owner: "Quản lý",
  teacher: "Giáo viên",
  student: "Học viên",
  parent: "Phụ huynh",
};

const ROLE_ICONS = {
  owner: ShieldCheck,
  teacher: GraduationCap,
  student: Users,
  parent: Users,
};

export default function MembersPanel({ orgId, isOwner }) {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState("");
  const [showInvite, setShowInvite] = useState(false);

  const reload = () => {
    fetch(`/api/orgs/${orgId}/members`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => setMembers(d.members || []))
      .catch(() => setError("Không tải lại được danh sách"));
  };

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetch(`/api/orgs/${orgId}/members`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => {
        if (!cancelled) setMembers(d.members || []);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const remove = async (m) => {
    const label = m.invited_email || ROLE_LABELS[m.role];
    if (!confirm(`Xoá ${label} khỏi trung tâm?`)) return;

    // Cập nhật lạc quan rồi hoàn tác nếu lỗi
    const prev = members;
    setMembers((p) => p.filter((x) => x.id !== m.id));

    try {
      const res = await fetch(`/api/orgs/${orgId}/members?membership_id=${m.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Không xoá được");
      }
    } catch (e) {
      setMembers(prev);
      setError(e.message);
    }
  };

  if (members === null) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "var(--hover-bg)" }} />
        ))}
      </div>
    );
  }

  // Nhóm theo vai trò để dễ đọc khi trung tâm có nhiều người
  const grouped = ["owner", "teacher", "student", "parent"]
    .map((role) => ({ role, items: members.filter((m) => m.role === role) }))
    .filter((g) => g.items.length > 0);

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

      {isOwner && (
        <Button icon={UserPlus} size="sm" onClick={() => setShowInvite(true)} className="mb-3">
          Mời thành viên
        </Button>
      )}

      {members.length === 0 ? (
        <Card padding="1.5rem" className="text-center">
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Chưa có thành viên nào.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ role, items }) => {
            const Icon = ROLE_ICONS[role];
            return (
              <div key={role}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon size={13} style={{ color: "var(--ink-soft)" }} />
                  <span className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>
                    {ROLE_LABELS[role]} ({items.length})
                  </span>
                </div>

                <div className="space-y-1.5">
                  {items.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                      style={{ background: "var(--surface)", border: "1px solid var(--card-border)" }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate" style={{ color: "var(--ink)" }}>
                          {m.custom_fields?.student_code ||
                            m.invited_email ||
                            `Thành viên ${m.id.slice(0, 8)}`}
                        </div>
                        {m.status === "invited" && (
                          <span className="text-xs" style={{ color: "var(--sunshine-text)" }}>
                            Chờ nhận lời mời
                          </span>
                        )}
                      </div>

                      {m.status === "invited" && <Badge tone="warning">Đã mời</Badge>}

                      {isOwner && (
                        <button
                          onClick={() => remove(m)}
                          className="no-min-h w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ color: "var(--error)" }}
                          title="Xoá khỏi trung tâm"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showInvite && (
        <InviteModal
          orgId={orgId}
          onClose={() => setShowInvite(false)}
          onDone={() => {
            setShowInvite(false);
            reload();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function InviteModal({ orgId, onClose, onDone, onError }) {
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState("student");
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!emails.trim() || saving) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, role }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Không mời được thành viên");
      // Hiện báo cáo: mời được bao nhiêu, bỏ qua/sai bao nhiêu
      setReport(d);
    } catch (err) {
      onError(err.message);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (report) {
    return (
      <Modal onClose={onDone} maxWidth="24rem">
        <h2 className="text-base font-bold mb-3" style={{ color: "var(--ink)" }}>
          Kết quả mời
        </h2>

        <div className="space-y-2 text-sm mb-4">
          <div className="flex justify-between">
            <span style={{ color: "var(--ink-soft)" }}>Đã mời</span>
            <strong style={{ color: "var(--grass-text)" }}>{report.invited || 0}</strong>
          </div>
          {report.skipped?.length > 0 && (
            <div className="flex justify-between">
              <span style={{ color: "var(--ink-soft)" }}>Đã là thành viên</span>
              <strong style={{ color: "var(--ink-ghost)" }}>{report.skipped.length}</strong>
            </div>
          )}
          {report.invalid?.length > 0 && (
            <div>
              <div className="flex justify-between mb-1">
                <span style={{ color: "var(--ink-soft)" }}>Email không hợp lệ</span>
                <strong style={{ color: "var(--error)" }}>{report.invalid.length}</strong>
              </div>
              <div className="text-xs" style={{ color: "var(--error)" }}>
                {report.invalid.slice(0, 5).join(", ")}
                {report.invalid.length > 5 && ` +${report.invalid.length - 5} nữa`}
              </div>
            </div>
          )}
          {report.truncated && (
            <p className="text-xs" style={{ color: "var(--sunshine-text)" }}>
              Danh sách bị cắt còn 100 email mỗi lần mời.
            </p>
          )}
        </div>

        {report.note && (
          <div
            className="mb-4 px-3 py-2 rounded-xl text-xs"
            style={{ background: "var(--surface)", color: "var(--ink-soft)" }}
          >
            {report.note}
          </div>
        )}

        <Button onClick={onDone} fullWidth>
          Xong
        </Button>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} maxWidth="26rem">
      <form onSubmit={submit}>
        <h2 className="text-base font-bold mb-4" style={{ color: "var(--ink)" }}>
          Mời thành viên
        </h2>

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Vai trò
        </label>
        <div className="flex gap-1 mb-3">
          {["student", "teacher", "parent"].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className="flex-1 px-2 py-1.5 rounded-lg text-xs font-bold no-min-h"
              style={{
                background: role === r ? "var(--green-subtle)" : "var(--surface)",
                color: role === r ? "var(--electric)" : "var(--ink-soft)",
                border: `1px solid ${role === r ? "var(--green-subtle-border)" : "var(--card-border)"}`,
              }}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Danh sách email
        </label>
        <Input
          as="textarea"
          rows={5}
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder={"a@example.com\nb@example.com"}
          className="mb-2 resize-none text-sm"
        />
        <p className="text-xs mb-4" style={{ color: "var(--ink-ghost)" }}>
          Dán được nhiều email cách nhau bởi dấu phẩy, chấm phẩy hoặc xuống dòng.
          Tối đa 100 email mỗi lần.
        </p>

        <div
          className="mb-4 px-3 py-2 rounded-xl text-xs flex items-start gap-1.5"
          style={{ background: "var(--surface)", color: "var(--ink-soft)" }}
        >
          <Mail size={13} className="flex-shrink-0 mt-0.5" />
          <span>
            Người đã có tài khoản Wordly sẽ vào trung tâm ngay (cần đăng nhập
            lại). Người chưa có sẽ ở trạng thái chờ tới khi đăng ký.
          </span>
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={!emails.trim() || saving} fullWidth>
            {saving ? "Đang mời..." : "Mời"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
        </div>
      </form>
    </Modal>
  );
}
