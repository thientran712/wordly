"use client";

// /org — Dashboard tổ chức: chọn trung tâm, xem danh sách lớp.
//
// Màu sắc dùng ĐÚNG design token hiện có của Wordly (--electric,
// --card-bg, --ink...) để giao diện B2B liền mạch với phần B2C.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Users, Plus, GraduationCap, Copy, Check, UserCog, Settings, Users2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import MembersPanel from "@/components/org/MembersPanel";
import SettingsPanel from "@/components/org/SettingsPanel";
import GuardiansPanel from "@/components/org/GuardiansPanel";
import OrgShell, { OrgHeader, OrgTabs } from "@/components/org/OrgShell";
import DataTable from "@/components/ui/DataTable";
import { usePagination } from "@/lib/use-pagination";

const ROLE_LABELS = {
  owner: "Quản lý",
  teacher: "Giáo viên",
  student: "Học viên",
  parent: "Phụ huynh",
};

export default function OrgDashboard() {
  const router = useRouter();
  const [orgs, setOrgs] = useState(null);
  const [activeOrg, setActiveOrg] = useState(null);
  // classes = null nghĩa là "đang tải" — suy ra trạng thái loading từ dữ liệu
  // thay vì giữ một state riêng phải set đồng bộ trong effect.
  const [classes, setClasses] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("classes");
  const loadingClasses = classes === null;

  useEffect(() => {
    fetch("/api/orgs")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("unauthorized"))))
      .then((d) => {
        setOrgs(d.orgs || []);
        if (d.orgs?.length) setActiveOrg(d.orgs[0]);
      })
      .catch(() => setOrgs([]));
  }, []);

  useEffect(() => {
    if (!activeOrg) return;
    // Cờ chống race: đổi trung tâm nhanh có thể khiến phản hồi cũ về sau
    // phản hồi mới và ghi đè danh sách lớp sai.
    let cancelled = false;

    fetch(`/api/classes?org_id=${activeOrg.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => {
        if (!cancelled) setClasses(d.classes || []);
      })
      .catch(() => {
        if (!cancelled) setClasses([]);
      });

    return () => {
      cancelled = true;
    };
  }, [activeOrg]);

  const isStaff = activeOrg?.role === "owner" || activeOrg?.role === "teacher";

  // ── Chưa thuộc trung tâm nào ──
  if (orgs !== null && orgs.length === 0) {
    return (
      <OrgShell variant="form" className="py-10">
        <Card elevated padding="2rem" className="text-center">
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: "var(--green-subtle)" }}
          >
            <Building2 size={26} style={{ color: "var(--electric)" }} />
          </div>
          <h1 className="text-lg font-bold mb-2" style={{ color: "var(--ink)" }}>
            Bạn chưa tham gia trung tâm nào
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
            Nếu giáo viên đã cho bạn mã lớp, hãy nhập mã để tham gia.
          </p>
          <Button onClick={() => router.push("/join")}>Nhập mã lớp</Button>
        </Card>
      </OrgShell>
    );
  }

  return (
    <OrgShell>
      {/* Chọn trung tâm — chỉ hiện khi thuộc nhiều nơi */}
      {orgs && orgs.length > 1 && (
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {orgs.map((o) => {
            const active = o.id === activeOrg?.id;
            return (
              <button
                key={o.id}
                onClick={() => setActiveOrg(o)}
                className="px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap no-min-h"
                style={{
                  background: active ? "var(--green-subtle)" : "var(--card-bg)",
                  color: active ? "var(--electric)" : "var(--ink-soft)",
                  border: `1px solid ${active ? "var(--green-subtle-border)" : "var(--card-border)"}`,
                }}
              >
                {o.name}
              </button>
            );
          })}
        </div>
      )}

      <OrgHeader
        title={activeOrg?.name || "Đang tải..."}
        subtitle={
          loadingClasses
            ? "Đang tải..."
            : isStaff
            ? `${classes.length} lớp đang hoạt động`
            // Học viên đọc câu này, nên dùng ngôn ngữ của người học chứ
            // không phải của người quản lý ("lớp đang hoạt động").
            : classes.length > 0
            ? `Bạn đang học ${classes.length} lớp`
            : "Bạn chưa được xếp vào lớp nào"
        }
        badges={
          <>
            {activeOrg?.role && (
              <Badge tone={activeOrg.role === "owner" ? "accent" : "neutral"}>
                {ROLE_LABELS[activeOrg.role] || activeOrg.role}
              </Badge>
            )}
            {activeOrg?.status === "trial" && <Badge tone="warning">Dùng thử</Badge>}
          </>
        }
        actions={
          isStaff && view === "classes" ? (
            <Button icon={Plus} onClick={() => setShowCreate(true)} size="sm">
              Tạo lớp
            </Button>
          ) : null
        }
      />

      {/* Lớp / Thành viên / Phụ huynh / Cài đặt — chỉ staff cần chuyển qua lại */}
      {isStaff && (
        <OrgTabs
          active={view}
          onChange={setView}
          tabs={[
            { key: "classes", label: "Lớp học", icon: GraduationCap },
            { key: "members", label: "Thành viên", icon: UserCog },
            { key: "guardians", label: "Phụ huynh", icon: Users2 },
            { key: "settings", label: "Cài đặt", icon: Settings },
          ]}
        />
      )}

      {error && (
        <div
          className="mb-4 px-3 py-2 rounded-xl text-sm"
          style={{
            background: "var(--error-soft)",
            color: "var(--error)",
            border: "1px solid var(--error-border)",
          }}
        >
          {error}
        </div>
      )}

      {/* Thành viên */}
      {view === "members" && activeOrg ? (
        <MembersPanel orgId={activeOrg.id} isOwner={activeOrg.role === "owner"} />
      ) : view === "guardians" && activeOrg ? (
        <GuardiansPanel orgId={activeOrg.id} isOwner={activeOrg.role === "owner"} />
      ) : view === "settings" && activeOrg ? (
        <SettingsPanel orgId={activeOrg.id} isOwner={activeOrg.role === "owner"} />
      ) : /* Danh sách lớp */
      loadingClasses ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 rounded-2xl animate-pulse"
              style={{ background: "var(--hover-bg)" }}
            />
          ))}
        </div>
      ) : (
        <ClassesTable classes={classes} isStaff={isStaff} onOpen={(id) => router.push(`/org/classes/${id}`)} />
      )}

      {showCreate && activeOrg && (
        <CreateClassModal
          orgId={activeOrg.id}
          onClose={() => setShowCreate(false)}
          onCreated={(created) => {
            setClasses((prev) => [{ ...created, member_count: 1 }, ...(prev || [])]);
            setShowCreate(false);
          }}
          onError={setError}
        />
      )}
    </OrgShell>
  );
}

function ClassesTable({ classes, isStaff, onOpen }) {
  const { pageItems, pagination } = usePagination(classes, 10);

  const columns = [
    {
      key: "name",
      label: "Lớp học",
      render: (c) => (
        <button
          onClick={() => onOpen(c.id)}
          className="text-left font-bold text-sm no-min-h hover:underline"
          style={{ color: "var(--ink)" }}
        >
          {c.name}
        </button>
      ),
    },
    {
      key: "description",
      label: "Mô tả",
      hideOnMobile: true,
      render: (c) => (
        <span className="line-clamp-1 text-xs" style={{ color: "var(--ink-soft)" }}>
          {c.description || "—"}
        </span>
      ),
    },
    {
      key: "member_count",
      label: "Học viên",
      className: "text-center",
      render: (c) => (
        <span className="flex items-center justify-center gap-1 tabular-nums" style={{ color: "var(--ink-soft)" }}>
          <Users size={13} /> {c.member_count}
        </span>
      ),
    },
  ];

  if (isStaff) {
    columns.push({
      key: "join_code",
      label: "Mã lớp",
      render: (c) => (c.join_code ? <JoinCodeChip klass={c} /> : "—"),
    });
  }

  return (
    <DataTable
      columns={columns}
      rows={pageItems}
      empty={{
        icon: GraduationCap,
        title: isStaff ? "Chưa có lớp nào" : "Bạn chưa được thêm vào lớp nào",
        description: isStaff ? 'Bấm "Tạo lớp" phía trên để bắt đầu.' : undefined,
      }}
      pagination={classes.length > 10 ? pagination : undefined}
      actions={(c) => (
        <Button size="sm" variant="secondary" onClick={() => onOpen(c.id)}>
          Mở lớp
        </Button>
      )}
    />
  );
}

function JoinCodeChip({ klass }) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(klass.join_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard bị chặn — không làm gì, người dùng vẫn đọc được mã
    }
  };

  return (
    <button
      onClick={copyCode}
      className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-mono font-bold no-min-h"
      style={{
        background: "var(--green-subtle)",
        color: "var(--electric)",
        border: "1px solid var(--green-subtle-border)",
      }}
      title="Bấm để copy mã lớp"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {klass.join_code}
      <span className="font-sans font-normal" style={{ color: "var(--ink-ghost)" }}>
        · {klass.join_code_uses}/{klass.join_code_max_uses}
      </span>
    </button>
  );
}

function CreateClassModal({ orgId, onClose, onCreated, onError }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, name, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tạo được lớp");
      onCreated(data.class);
    } catch (err) {
      onError(err.message);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="26rem">
      <form onSubmit={submit}>
        <h2 className="text-base font-bold mb-4" style={{ color: "var(--ink)" }}>
          Tạo lớp mới
        </h2>

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Tên lớp
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VD: IELTS Foundation 3"
          maxLength={200}
          autoFocus
          className="mb-3"
        />

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Mô tả <span style={{ color: "var(--ink-ghost)" }}>(tuỳ chọn)</span>
        </label>
        <Input
          as="textarea"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Lịch học, trình độ..."
          className="mb-4 resize-none"
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={!name.trim() || saving} fullWidth>
            {saving ? "Đang tạo..." : "Tạo lớp"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
        </div>
      </form>
    </Modal>
  );
}
