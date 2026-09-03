"use client";

// /org — Dashboard tổ chức: chọn trung tâm, xem danh sách lớp.
//
// Màu sắc dùng ĐÚNG design token hiện có của Wordly (--electric,
// --card-bg, --ink...) để giao diện B2B liền mạch với phần B2C.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Users, Plus, GraduationCap, Copy, Check, UserCog, Settings } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import MembersPanel from "@/components/org/MembersPanel";
import SettingsPanel from "@/components/org/SettingsPanel";

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
      <main className="max-w-2xl mx-auto px-4 py-10">
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
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
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

      {/* Tiêu đề */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-black truncate" style={{ color: "var(--ink)" }}>
              {activeOrg?.name || "Đang tải..."}
            </h1>
            {activeOrg?.role && (
              <Badge tone={activeOrg.role === "owner" ? "accent" : "neutral"}>
                {ROLE_LABELS[activeOrg.role] || activeOrg.role}
              </Badge>
            )}
            {activeOrg?.status === "trial" && <Badge tone="warning">Dùng thử</Badge>}
          </div>
          <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
            {loadingClasses ? "Đang tải..." : `${classes.length} lớp đang hoạt động`}
          </p>
        </div>

        {isStaff && view === "classes" && (
          <Button icon={Plus} onClick={() => setShowCreate(true)} size="sm">
            Tạo lớp
          </Button>
        )}
      </div>

      {/* Lớp / Thành viên — chỉ staff cần chuyển qua lại */}
      {isStaff && (
        <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit" style={{ background: "var(--surface)" }}>
          {[
            { key: "classes", label: "Lớp học", icon: GraduationCap },
            { key: "members", label: "Thành viên", icon: UserCog },
            { key: "settings", label: "Cài đặt", icon: Settings },
          ].map((t) => {
            const Icon = t.icon;
            const active = view === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setView(t.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold no-min-h"
                style={{
                  background: active ? "var(--card-bg)" : "transparent",
                  color: active ? "var(--electric)" : "var(--ink-soft)",
                }}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>
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
      ) : classes.length === 0 ? (
        <Card padding="2rem" className="text-center">
          <GraduationCap size={28} className="mx-auto mb-3" style={{ color: "var(--ink-ghost)" }} />
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {isStaff ? "Chưa có lớp nào. Tạo lớp đầu tiên để bắt đầu." : "Bạn chưa được thêm vào lớp nào."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {classes.map((c) => (
            <ClassCard
              key={c.id}
              klass={c}
              isStaff={isStaff}
              onOpen={() => router.push(`/org/classes/${c.id}`)}
            />
          ))}
        </div>
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
    </main>
  );
}

function ClassCard({ klass, isStaff, onOpen }) {
  const [copied, setCopied] = useState(false);

  const copyCode = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(klass.join_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard bị chặn — không làm gì, người dùng vẫn đọc được mã
    }
  };

  return (
    <Card
      elevated
      className="cursor-pointer transition-transform hover:scale-[1.01]"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-bold text-sm truncate" style={{ color: "var(--ink)" }}>
          {klass.name}
        </h3>
        <div
          className="flex items-center gap-1 text-xs flex-shrink-0"
          style={{ color: "var(--ink-soft)" }}
        >
          <Users size={13} />
          {klass.member_count}
        </div>
      </div>

      {klass.description && (
        <p className="text-xs mb-3 line-clamp-2" style={{ color: "var(--ink-soft)" }}>
          {klass.description}
        </p>
      )}

      {isStaff && klass.join_code && (
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
      )}
    </Card>
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
