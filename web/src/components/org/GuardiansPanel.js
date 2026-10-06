"use client";

// Quản lý quan hệ phụ huynh–học viên.
//
// Đây là màn hình quyết định AI NHẬN BÁO CÁO học tập của trẻ, nên chỉ owner
// được gán/xoá. Phụ huynh tự bật/tắt nhận báo cáo cho liên kết của mình.

import { useEffect, useState } from "react";
import { Users2, Link2, Trash2, Plus, Mail, MailX } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";

export default function GuardiansPanel({ orgId, isOwner }) {
  const [data, setData] = useState(null);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const reload = () => {
    fetch(`/api/orgs/${orgId}/guardians`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then(setData)
      .catch(() => setError("Không tải lại được danh sách"));
  };

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    Promise.all([
      fetch(`/api/orgs/${orgId}/guardians`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/orgs/${orgId}/members`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([g, m]) => {
        if (cancelled) return;
        setData(g || { links: [], relationship_labels: {} });
        setMembers(m?.members || []);
      })
      .catch(() => {
        if (!cancelled) setData({ links: [], relationship_labels: {} });
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const memberLabel = (id) => {
    const m = members.find((x) => x.id === id);
    if (!m) return `#${String(id).slice(0, 8)}`;
    return m.custom_fields?.student_code || m.invited_email || `#${String(id).slice(0, 8)}`;
  };

  const toggleReports = async (link) => {
    // Cập nhật lạc quan rồi hoàn tác nếu lỗi
    const prev = data;
    setData((d) => ({
      ...d,
      links: d.links.map((l) =>
        l.id === link.id ? { ...l, receive_reports: !l.receive_reports } : l
      ),
    }));

    try {
      const res = await fetch(`/api/orgs/${orgId}/guardians`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link_id: link.id, receive_reports: !link.receive_reports }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Không cập nhật được");
      }
    } catch (e) {
      setData(prev);
      setError(e.message);
    }
  };

  const remove = async (link) => {
    if (!confirm("Xoá liên kết phụ huynh này?")) return;
    const prev = data;
    setData((d) => ({ ...d, links: d.links.filter((l) => l.id !== link.id) }));

    try {
      const res = await fetch(`/api/orgs/${orgId}/guardians?link_id=${link.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Không xoá được");
      }
    } catch (e) {
      setData(prev);
      setError(e.message);
    }
  };

  if (!data) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "var(--hover-bg)" }} />
        ))}
      </div>
    );
  }

  const { links = [], relationship_labels: labels = {} } = data;

  // Nhóm theo học viên: một học viên có thể có nhiều người nhận báo cáo
  const byStudent = new Map();
  for (const l of links) {
    const arr = byStudent.get(l.student_membership_id) || [];
    arr.push(l);
    byStudent.set(l.student_membership_id, arr);
  }

  const students = members.filter((m) => m.role === "student");
  const guardians = members.filter((m) => m.role === "parent");
  const withoutGuardian = students.filter((s) => !byStudent.has(s.id));

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
        <Button icon={Plus} size="sm" onClick={() => setShowAdd(true)} className="mb-3">
          Gán phụ huynh
        </Button>
      )}

      {guardians.length === 0 && isOwner && (
        <div
          className="mb-3 px-3 py-2.5 rounded-xl text-xs"
          style={{ background: "var(--sunshine-soft)", border: "1px solid var(--sunshine-border)", color: "var(--sunshine-dark)" }}
        >
          Chưa có thành viên nào vai trò <strong>Phụ huynh</strong>. Hãy mời phụ
          huynh ở tab Thành viên trước, rồi gán họ với học viên ở đây.
        </div>
      )}

      {links.length === 0 ? (
        <Card padding="1.5rem" className="text-center">
          <Users2 size={26} className="mx-auto mb-2" style={{ color: "var(--ink-ghost)" }} />
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Chưa có liên kết nào. Học viên chưa có phụ huynh sẽ tự nhận báo cáo
            qua email của mình.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {[...byStudent.entries()].map(([studentId, studentLinks]) => (
            <Card key={studentId} elevated>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold truncate" style={{ color: "var(--ink)" }}>
                  {memberLabel(studentId)}
                </span>
                <Badge tone="neutral">{studentLinks.length} người nhận</Badge>
              </div>

              <div className="space-y-1.5">
                {studentLinks.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs"
                    style={{ background: "var(--surface)", border: "1px solid var(--card-border)" }}
                  >
                    <Link2 size={12} style={{ color: "var(--duo-blue)" }} />
                    <span className="flex-1 min-w-0 truncate" style={{ color: "var(--ink)" }}>
                      {memberLabel(l.guardian_membership_id)}
                    </span>
                    <Badge tone="neutral">{labels[l.relationship] || l.relationship}</Badge>

                    <button
                      onClick={() => toggleReports(l)}
                      className="no-min-h w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ color: l.receive_reports ? "var(--grass-text)" : "var(--ink-ghost)" }}
                      title={l.receive_reports ? "Đang nhận báo cáo — bấm để tắt" : "Không nhận báo cáo — bấm để bật"}
                    >
                      {l.receive_reports ? <Mail size={13} /> : <MailX size={13} />}
                    </button>

                    {isOwner && (
                      <button
                        onClick={() => remove(l)}
                        className="no-min-h w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ color: "var(--error)" }}
                        title="Xoá liên kết"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Nêu rõ học viên nào chưa có phụ huynh — hữu ích khi rà soát dữ liệu */}
      {withoutGuardian.length > 0 && (
        <Card padding="0.875rem" className="mt-3">
          <p className="text-xs mb-1.5 font-semibold" style={{ color: "var(--ink-soft)" }}>
            {withoutGuardian.length} học viên chưa gán phụ huynh
          </p>
          <p className="text-xs" style={{ color: "var(--ink-ghost)" }}>
            Báo cáo sẽ gửi trực tiếp cho email của học viên.
          </p>
        </Card>
      )}

      {showAdd && (
        <AddGuardianModal
          orgId={orgId}
          students={students}
          guardians={guardians}
          labels={labels}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            reload();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function AddGuardianModal({ orgId, students, guardians, labels, onClose, onAdded, onError }) {
  const [guardianId, setGuardianId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [relationship, setRelationship] = useState("mother");
  const [saving, setSaving] = useState(false);

  const label = (m) =>
    m.custom_fields?.student_code || m.invited_email || `#${String(m.id).slice(0, 8)}`;

  const submit = async (e) => {
    e.preventDefault();
    if (!guardianId || !studentId || saving) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/guardians`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardian_membership_id: guardianId,
          student_membership_id: studentId,
          relationship,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Không gán được phụ huynh");
      onAdded();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectStyle = {
    background: "var(--input-bg)",
    border: "1px solid var(--input-border)",
    color: "var(--ink)",
  };

  return (
    <Modal onClose={onClose} maxWidth="26rem">
      <form onSubmit={submit}>
        <h2 className="text-base font-bold mb-1" style={{ color: "var(--ink)" }}>
          Gán phụ huynh cho học viên
        </h2>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
          Một phụ huynh có thể theo nhiều con; một học viên có thể có cả bố và mẹ.
        </p>

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Phụ huynh
        </label>
        <select
          value={guardianId}
          onChange={(e) => setGuardianId(e.target.value)}
          className="w-full px-3 py-2 rounded-xl text-sm mb-3 appearance-none"
          style={selectStyle}
        >
          <option value="">— Chọn phụ huynh —</option>
          {guardians.map((g) => (
            <option key={g.id} value={g.id}>{label(g)}</option>
          ))}
        </select>

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Học viên
        </label>
        <select
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="w-full px-3 py-2 rounded-xl text-sm mb-3 appearance-none"
          style={selectStyle}
        >
          <option value="">— Chọn học viên —</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{label(s)}</option>
          ))}
        </select>

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Quan hệ
        </label>
        <select
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
          className="w-full px-3 py-2 rounded-xl text-sm mb-4 appearance-none"
          style={selectStyle}
        >
          {Object.entries(labels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <div className="flex gap-2">
          <Button type="submit" disabled={!guardianId || !studentId || saving} fullWidth>
            {saving ? "Đang gán..." : "Gán"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
        </div>
      </form>
    </Modal>
  );
}
