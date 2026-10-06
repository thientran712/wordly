"use client";

// Quản lý thành viên tổ chức — 4 tab theo vai trò, mỗi tab một bảng riêng.
//
// Trước đây gộp cả 4 nhóm thành card rời rạc trong 1 danh sách dài — với
// vài chục thành viên (trung tâm thật dễ đạt tới) thì tràn trang không
// kiểm soát được. Tách theo tab: mỗi vai trò một bảng, phân trang riêng,
// nút mời mặc định đúng vai trò của tab đang mở.
//
// Hai luồng vào tổ chức: mời qua email (danh sách có sẵn) và mã lớp (GV
// đọc trên lớp). Panel này lo luồng thứ nhất.

import { useEffect, useState } from "react";
import { UserPlus, Trash2, Mail, ShieldCheck, GraduationCap, Users, UserRound } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import DataTable from "@/components/ui/DataTable";
import { OrgTabs } from "@/components/org/OrgShell";
import { usePagination } from "@/lib/use-pagination";

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
  parent: UserRound,
};

// Chỉ 3 vai trò này mời được qua email — owner được gán lúc tạo tổ chức,
// không mời thêm qua đây (tránh nhiều owner ngoài ý muốn).
const INVITABLE_ROLES = ["teacher", "student", "parent"];

export default function MembersPanel({ orgId, isOwner }) {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [tab, setTab] = useState("owner");

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

  const byRole = {
    owner: members.filter((m) => m.role === "owner"),
    teacher: members.filter((m) => m.role === "teacher"),
    student: members.filter((m) => m.role === "student"),
    parent: members.filter((m) => m.role === "parent"),
  };

  const tabs = ["owner", "teacher", "student", "parent"].map((r) => ({
    key: r,
    label: `${ROLE_LABELS[r]} (${byRole[r].length})`,
    icon: ROLE_ICONS[r],
  }));

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

      <OrgTabs tabs={tabs} active={tab} onChange={setTab} />

      {isOwner && INVITABLE_ROLES.includes(tab) && (
        <Button icon={UserPlus} size="sm" onClick={() => setShowInvite(true)} className="mb-3">
          Mời {ROLE_LABELS[tab].toLowerCase()}
        </Button>
      )}

      <RoleTable role={tab} items={byRole[tab]} isOwner={isOwner} onRemove={remove} />

      {showInvite && (
        <InviteModal
          orgId={orgId}
          defaultRole={INVITABLE_ROLES.includes(tab) ? tab : "student"}
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

function RoleTable({ role, items, isOwner, onRemove }) {
  const { pageItems, pagination } = usePagination(items, 10);
  const Icon = ROLE_ICONS[role];

  const columns = [
    {
      key: "name",
      label: "Tên / Email",
      render: (m) =>
        m.custom_fields?.student_code || m.invited_email || `Thành viên ${m.id.slice(0, 8)}`,
    },
    {
      key: "status",
      label: "Trạng thái",
      render: (m) =>
        m.status === "invited" ? (
          <Badge tone="warning">Chờ nhận lời mời</Badge>
        ) : (
          <Badge tone="accent">Hoạt động</Badge>
        ),
    },
    {
      key: "created_at",
      label: "Tham gia",
      className: "whitespace-nowrap",
      render: (m) => new Date(m.created_at).toLocaleDateString("vi-VN"),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={pageItems}
      empty={{
        icon: Icon,
        title: `Chưa có ${ROLE_LABELS[role].toLowerCase()} nào`,
        description:
          role === "student" || role === "teacher" || role === "parent"
            ? `Bấm "Mời ${ROLE_LABELS[role].toLowerCase()}" phía trên để thêm.`
            : undefined,
      }}
      pagination={items.length > 10 ? pagination : undefined}
      actions={
        isOwner && role !== "owner"
          ? (m) => (
              <button
                onClick={() => onRemove(m)}
                className="no-min-h w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ color: "var(--error)" }}
                title="Xoá khỏi trung tâm"
              >
                <Trash2 size={13} />
              </button>
            )
          : undefined
      }
    />
  );
}

function InviteModal({ orgId, defaultRole, onClose, onDone, onError }) {
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState(defaultRole);
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
