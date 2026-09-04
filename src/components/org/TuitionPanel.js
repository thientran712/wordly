"use client";

// Học phí & công nợ (GĐ4) — CHỈ owner thấy panel này.
//
// Nghiệp vụ tài chính nên UI phải rõ ràng tuyệt đối về số tiền: hiển thị
// đủ tạm tính / giảm giá / phải thu / đã thu / còn nợ, không gộp lại.

import { useEffect, useState } from "react";
import {
  Wallet, Plus, AlertTriangle, CheckCircle2, Clock, Receipt,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { formatVnd, calculateTuition, TUITION_MODELS } from "@/lib/tuition-calc";

const MODEL_LABELS = {
  per_course: "Theo khoá",
  per_session: "Theo buổi",
  per_month: "Theo tháng",
};

const METHOD_LABELS = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
  card: "Thẻ",
  ewallet: "Ví điện tử",
  other: "Khác",
};

const STATUS_CONFIG = {
  paid: { label: "Đã đóng đủ", color: "var(--grass-text)", bg: "var(--grass-soft)", border: "var(--grass-border)" },
  partial: { label: "Đóng một phần", color: "var(--sunshine-text)", bg: "var(--sunshine-soft)", border: "var(--sunshine-border)" },
  unpaid: { label: "Chưa đóng", color: "var(--error)", bg: "var(--error-soft)", border: "var(--error-border)" },
};

export default function TuitionPanel({ orgId, classId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [paying, setPaying] = useState(null);
  const [members, setMembers] = useState([]);

  const reload = () => {
    const params = new URLSearchParams({ org_id: orgId });
    if (classId) params.set("class_id", classId);
    fetch(`/api/tuition?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then(setData)
      .catch(() => setError("Không tải lại được học phí"));
  };

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    const params = new URLSearchParams({ org_id: orgId });
    if (classId) params.set("class_id", classId);

    fetch(`/api/tuition?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData({ records: [], summary: null });
      });

    // Danh sách học viên để chọn khi tạo khoản học phí
    fetch(`/api/orgs/${orgId}/members`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) {
          setMembers((d.members || []).filter((m) => m.role === "student"));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [orgId, classId]);

  if (data === null) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: "var(--hover-bg)" }} />
        ))}
      </div>
    );
  }

  const { records = [], summary } = data;

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

      {/* Tổng quan tài chính */}
      {summary && records.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4 max-w-3xl">
          <Card padding="0.875rem">
            <div className="text-xs mb-1" style={{ color: "var(--ink-soft)" }}>Phải thu</div>
            <div className="text-sm font-black tabular-nums" style={{ color: "var(--ink)" }}>
              {formatVnd(summary.total_due)}
            </div>
          </Card>
          <Card padding="0.875rem" style={{ background: "var(--grass-soft)", border: "1px solid var(--grass-border)" }}>
            <div className="text-xs mb-1" style={{ color: "var(--grass-text)" }}>Đã thu</div>
            <div className="text-sm font-black tabular-nums" style={{ color: "var(--grass-text)" }}>
              {formatVnd(summary.paid)}
            </div>
          </Card>
          <Card
            padding="0.875rem"
            style={{
              background: summary.outstanding > 0 ? "var(--error-soft)" : "var(--surface)",
              border: `1px solid ${summary.outstanding > 0 ? "var(--error-border)" : "var(--card-border)"}`,
            }}
          >
            <div className="text-xs mb-1" style={{ color: summary.outstanding > 0 ? "var(--error)" : "var(--ink-soft)" }}>
              Còn nợ
            </div>
            <div
              className="text-sm font-black tabular-nums"
              style={{ color: summary.outstanding > 0 ? "var(--error)" : "var(--ink)" }}
            >
              {formatVnd(summary.outstanding)}
            </div>
          </Card>
        </div>
      )}

      {summary?.overdue_count > 0 && (
        <div
          className="flex items-start gap-2 px-3 py-2.5 rounded-xl mb-4 text-xs"
          style={{ background: "var(--error-soft)", border: "1px solid var(--error-border)", color: "var(--error)" }}
        >
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          <span>
            <strong>{summary.overdue_count} khoản</strong> đã quá hạn thanh toán.
          </span>
        </div>
      )}

      <Button icon={Plus} size="sm" onClick={() => setShowCreate(true)} className="mb-3">
        Thêm khoản học phí
      </Button>

      {records.length === 0 ? (
        <Card padding="1.5rem" className="text-center">
          <Wallet size={26} className="mx-auto mb-2" style={{ color: "var(--ink-ghost)" }} />
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Chưa có khoản học phí nào.
          </p>
        </Card>
      ) : (
        // Lưới tự giãn: màn hình rộng hiện nhiều khoản cùng lúc thay vì
        // một cột dài phải cuộn nhiều
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {records.map((r) => {
            const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.unpaid;
            return (
              <Card key={r.tuition_record_id} elevated>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm truncate" style={{ color: "var(--ink)" }}>
                      {r.title}
                    </h3>
                    {r.due_date && (
                      <span
                        className="text-xs flex items-center gap-1 mt-0.5"
                        style={{ color: r.is_overdue ? "var(--error)" : "var(--ink-soft)" }}
                      >
                        <Clock size={11} />
                        Hạn {new Date(r.due_date).toLocaleDateString("vi-VN")}
                        {r.is_overdue && " · quá hạn"}
                      </span>
                    )}
                  </div>
                  <Badge
                    tone={r.status === "paid" ? "accent" : r.status === "partial" ? "warning" : "error"}
                  >
                    {cfg.label}
                  </Badge>
                </div>

                {/* Số tiền — hiển thị rõ từng khoản, không gộp */}
                <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                  <div>
                    <div style={{ color: "var(--ink-ghost)" }}>Phải thu</div>
                    <div className="font-bold tabular-nums" style={{ color: "var(--ink)" }}>
                      {formatVnd(r.total_due)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--ink-ghost)" }}>Đã thu</div>
                    <div className="font-bold tabular-nums" style={{ color: "var(--grass-text)" }}>
                      {formatVnd(r.paid)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--ink-ghost)" }}>Còn nợ</div>
                    <div
                      className="font-bold tabular-nums"
                      style={{ color: r.outstanding > 0 ? "var(--error)" : "var(--ink-soft)" }}
                    >
                      {formatVnd(r.outstanding)}
                    </div>
                  </div>
                </div>

                {r.overpaid > 0 && (
                  <p className="text-xs mb-2" style={{ color: "var(--sunshine-text)" }}>
                    Đã đóng thừa {formatVnd(r.overpaid)}
                  </p>
                )}

                {r.status !== "paid" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Receipt}
                    onClick={() => setPaying(r)}
                  >
                    Ghi nhận thu tiền
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateTuitionModal
          orgId={orgId}
          classId={classId}
          members={members}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
          onError={setError}
        />
      )}

      {paying && (
        <RecordPaymentModal
          record={paying}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null);
            reload();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function CreateTuitionModal({ orgId, classId, members, onClose, onCreated, onError }) {
  const [membershipId, setMembershipId] = useState("");
  const [title, setTitle] = useState("");
  const [model, setModel] = useState("per_course");
  const [courseFee, setCourseFee] = useState("");
  const [sessionFee, setSessionFee] = useState("");
  const [sessionCount, setSessionCount] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [monthCount, setMonthCount] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Xem trước số tiền — dùng CHÍNH hàm mà server dùng, nên con số hiển thị
  // luôn khớp với con số được lưu (server vẫn tính lại, đây chỉ là xem trước).
  const preview = calculateTuition({
    model,
    course_fee: Number(courseFee) || 0,
    session_fee: Number(sessionFee) || 0,
    session_count: Number(sessionCount) || 0,
    monthly_fee: Number(monthlyFee) || 0,
    month_count: Number(monthCount) || 0,
    discount_percent: Number(discountPercent) || 0,
  });

  const submit = async (e) => {
    e.preventDefault();
    if (!membershipId || !title.trim() || saving) return;

    setSaving(true);
    try {
      const res = await fetch("/api/tuition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          membership_id: membershipId,
          class_id: classId || null,
          title,
          model,
          course_fee: Number(courseFee) || undefined,
          session_fee: Number(sessionFee) || undefined,
          session_count: Number(sessionCount) || undefined,
          monthly_fee: Number(monthlyFee) || undefined,
          month_count: Number(monthCount) || undefined,
          discount_percent: Number(discountPercent) || undefined,
          due_date: dueDate || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Không tạo được khoản học phí");
      onCreated();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="28rem">
      <form onSubmit={submit}>
        <h2 className="text-base font-bold mb-4" style={{ color: "var(--ink)" }}>
          Thêm khoản học phí
        </h2>

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Học viên
        </label>
        <select
          value={membershipId}
          onChange={(e) => setMembershipId(e.target.value)}
          className="w-full px-3 py-2 rounded-xl text-sm mb-3 appearance-none"
          style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--ink)" }}
        >
          <option value="">— Chọn học viên —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.custom_fields?.student_code || m.invited_email || m.id.slice(0, 8)}
            </option>
          ))}
        </select>

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Nội dung
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="VD: Học phí khoá IELTS 3 tháng"
          maxLength={300}
          className="mb-3"
        />

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Cách tính
        </label>
        <div className="flex gap-1 mb-3">
          {TUITION_MODELS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModel(m)}
              className="flex-1 px-2 py-1.5 rounded-lg text-xs font-bold no-min-h"
              style={{
                background: model === m ? "var(--green-subtle)" : "var(--surface)",
                color: model === m ? "var(--electric)" : "var(--ink-soft)",
                border: `1px solid ${model === m ? "var(--green-subtle-border)" : "var(--card-border)"}`,
              }}
            >
              {MODEL_LABELS[m]}
            </button>
          ))}
        </div>

        {model === "per_course" && (
          <>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
              Học phí khoá (đồng)
            </label>
            <Input type="number" min={0} value={courseFee} onChange={(e) => setCourseFee(e.target.value)} className="mb-3" />
          </>
        )}

        {model === "per_session" && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
                Giá mỗi buổi
              </label>
              <Input type="number" min={0} value={sessionFee} onChange={(e) => setSessionFee(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
                Số buổi
              </label>
              <Input type="number" min={0} value={sessionCount} onChange={(e) => setSessionCount(e.target.value)} />
            </div>
          </div>
        )}

        {model === "per_month" && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
                Phí mỗi tháng
              </label>
              <Input type="number" min={0} value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
                Số tháng
              </label>
              <Input type="number" min={0} value={monthCount} onChange={(e) => setMonthCount(e.target.value)} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
              Giảm giá (%)
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
              Hạn đóng
            </label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        {/* Xem trước — tách rõ từng khoản để người thu tiền kiểm được */}
        {preview.ok && preview.subtotal > 0 && (
          <div
            className="px-3 py-2.5 rounded-xl mb-4 text-xs space-y-1"
            style={{ background: "var(--surface)", border: "1px solid var(--card-border)" }}
          >
            <div className="flex justify-between" style={{ color: "var(--ink-soft)" }}>
              <span>Tạm tính</span>
              <span className="tabular-nums">{formatVnd(preview.subtotal)}</span>
            </div>
            {preview.discount_amount > 0 && (
              <div className="flex justify-between" style={{ color: "var(--sunshine-text)" }}>
                <span>Giảm giá</span>
                <span className="tabular-nums">−{formatVnd(preview.discount_amount)}</span>
              </div>
            )}
            <div
              className="flex justify-between font-bold pt-1"
              style={{ color: "var(--electric)", borderTop: "1px solid var(--divider)" }}
            >
              <span>Phải thu</span>
              <span className="tabular-nums">{formatVnd(preview.total)}</span>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={!membershipId || !title.trim() || saving} fullWidth>
            {saving ? "Đang lưu..." : "Tạo khoản"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RecordPaymentModal({ record, onClose, onDone, onError }) {
  const [amount, setAmount] = useState(String(record.outstanding || ""));
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0 || saving) return;

    setSaving(true);
    try {
      const res = await fetch("/api/tuition/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tuition_record_id: record.tuition_record_id,
          amount: amt,
          method,
          reference,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Không ghi nhận được thanh toán");

      if (d.warning) {
        // Đóng thừa vẫn cho ghi nhưng phải cho người thu tiền biết
        setWarning(d.warning);
        setSaving(false);
        setTimeout(onDone, 2500);
        return;
      }
      onDone();
    } catch (err) {
      onError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="24rem">
      <form onSubmit={submit}>
        <h2 className="text-base font-bold mb-1" style={{ color: "var(--ink)" }}>
          Ghi nhận thu tiền
        </h2>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
          {record.title} · còn nợ{" "}
          <strong style={{ color: "var(--error)" }}>{formatVnd(record.outstanding)}</strong>
        </p>

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Số tiền (đồng)
        </label>
        <Input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
          className="mb-3"
        />

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Hình thức
        </label>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="w-full px-3 py-2 rounded-xl text-sm mb-3 appearance-none"
          style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--ink)" }}
        >
          {Object.entries(METHOD_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
          Mã giao dịch / số phiếu <span style={{ color: "var(--ink-ghost)" }}>(tuỳ chọn)</span>
        </label>
        <Input value={reference} onChange={(e) => setReference(e.target.value)} className="mb-4" />

        {warning && (
          <div
            className="mb-4 px-3 py-2 rounded-xl text-xs flex items-start gap-1.5"
            style={{ background: "var(--sunshine-soft)", color: "var(--sunshine-dark)", border: "1px solid var(--sunshine-border)" }}
          >
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
            <span>{warning}</span>
          </div>
        )}

        <div
          className="mb-4 px-3 py-2 rounded-xl text-xs"
          style={{ background: "var(--surface)", color: "var(--ink-ghost)" }}
        >
          Phiếu thu sau khi ghi nhận <strong>không sửa/xoá được</strong>. Nếu nhập
          sai, hãy ghi phiếu điều chỉnh.
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={!Number(amount) || saving} fullWidth>
            {saving ? "Đang ghi..." : "Ghi nhận"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
        </div>
      </form>
    </Modal>
  );
}
