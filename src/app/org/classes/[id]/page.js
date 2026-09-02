"use client";

// /org/classes/[id] — Chi tiết lớp: dashboard tiến độ học viên.
//
// Thiết kế quanh MỘT câu hỏi: "ai đang học, ai đã bỏ?"
// Giáo viên không cần đọc 24 dòng số — họ cần biết gọi điện cho ai hôm nay.
// Vì vậy phần tổng quan 3 nhóm được đặt lên trên và học viên bỏ lâu nhất
// xếp đầu bảng.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Flame, BookMarked, Mail, AlertTriangle, BarChart3, FolderOpen,
  ClipboardList, Wallet,
} from "lucide-react";
import Card from "@/components/ui/Card";
import BackButton from "@/components/ui/BackButton";
import LessonLibrary from "@/components/org/LessonLibrary";
import HomeworkPanel from "@/components/org/HomeworkPanel";
import TuitionPanel from "@/components/org/TuitionPanel";

const STATE_CONFIG = {
  active: { label: "Đang học tốt", color: "var(--grass-text)", bg: "var(--grass-soft)", border: "var(--grass-border)", dot: "🟢" },
  stalled: { label: "Chững lại", color: "var(--sunshine-text)", bg: "var(--sunshine-soft)", border: "var(--sunshine-border)", dot: "🟡" },
  dropped: { label: "Đã bỏ", color: "var(--error)", bg: "var(--error-soft)", border: "var(--error-border)", dot: "🔴" },
};

function formatLastActive(iso, inactiveDays) {
  if (!iso) return "chưa hoạt động";
  if (inactiveDays === 0) return "hôm nay";
  if (inactiveDays === 1) return "hôm qua";
  return `${inactiveDays} ngày trước`;
}

// Tab "Học phí" CHỈ hiện với owner — giáo viên không được xem tiền
// (RLS cũng chặn ở tầng DB, đây là để không hiện tab vô dụng).
function tabsFor(role) {
  const base = [
    { key: "progress", label: "Tiến độ", icon: BarChart3 },
    { key: "library", label: "Bài giảng", icon: FolderOpen },
    { key: "homework", label: "Bài tập", icon: ClipboardList },
  ];
  if (role === "owner") {
    base.push({ key: "tuition", label: "Học phí", icon: Wallet });
  }
  return base;
}

export default function ClassDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("progress");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    fetch(`/api/classes/${id}/progress`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Không tải được dữ liệu");
        return d;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-6">
        <BackButton fallbackHref="/org" label="Quay lại" />
        <Card padding="2rem" className="text-center mt-4">
          <AlertTriangle size={24} className="mx-auto mb-3" style={{ color: "var(--error)" }} />
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{error}</p>
        </Card>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-6">
        <BackButton fallbackHref="/org" label="Quay lại" />
        <div className="space-y-3 mt-4">
          <div className="h-24 rounded-2xl animate-pulse" style={{ background: "var(--hover-bg)" }} />
          <div className="h-64 rounded-2xl animate-pulse" style={{ background: "var(--hover-bg)" }} />
        </div>
      </main>
    );
  }

  const { summary, students, thresholds } = data;

  return (
    <main className="max-w-3xl mx-auto px-4 py-6">
      <BackButton fallbackHref="/org" label="Quay lại" />

      <h1 className="text-xl font-black mt-3 mb-1" style={{ color: "var(--ink)" }}>
        {data.class.name}
      </h1>
      <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
        {summary.total} học viên
      </p>

      {/* Tab điều hướng */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit overflow-x-auto max-w-full" style={{ background: "var(--surface)" }}>
        {tabsFor(data.role).map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
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

      {tab === "library" ? (
        <LessonLibrary classId={id} isStaff={data.can_manage === true} />
      ) : tab === "homework" ? (
        <HomeworkPanel classId={id} isStaff={data.can_manage === true} />
      ) : tab === "tuition" ? (
        <TuitionPanel orgId={data.org_id} classId={id} />
      ) : (
      <>
      {/* Tổng quan 3 nhóm — thứ giáo viên cần thấy trước tiên */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        {["active", "stalled", "dropped"].map((key) => {
          const cfg = STATE_CONFIG[key];
          return (
            <Card
              key={key}
              padding="0.875rem"
              style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
            >
              <div className="text-2xl font-black tabular-nums" style={{ color: cfg.color }}>
                {summary[key]}
              </div>
              <div className="text-xs font-semibold mt-0.5" style={{ color: cfg.color }}>
                {cfg.label}
              </div>
            </Card>
          );
        })}
      </div>

      {summary.dropped > 0 && (
        <div
          className="flex items-start gap-2 px-3 py-2.5 rounded-xl mb-4 text-xs"
          style={{
            background: "var(--error-soft)",
            border: "1px solid var(--error-border)",
            color: "var(--error)",
          }}
        >
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          <span>
            <strong>{summary.dropped} học viên</strong> không hoạt động hơn{" "}
            {thresholds.stalled_max_days} ngày. Nên liên hệ để nhắc học.
          </span>
        </div>
      )}

      {/* Bảng học viên */}
      {students.length === 0 ? (
        <Card padding="2rem" className="text-center">
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Lớp chưa có học viên. Chia sẻ mã lớp để học viên tham gia.
          </p>
        </Card>
      ) : (
        <Card elevated padding="0" className="overflow-hidden">
          {/* Tiêu đề cột — ẩn trên mobile để không chật */}
          <div
            className="hidden sm:grid gap-2 px-4 py-2.5 text-xs font-semibold"
            style={{
              gridTemplateColumns: "1fr auto auto auto auto",
              background: "var(--surface)",
              borderBottom: "1px solid var(--divider)",
              color: "var(--ink-soft)",
            }}
          >
            <div>Học viên</div>
            <div className="w-14 text-center">Streak</div>
            <div className="w-14 text-center">Từ</div>
            <div className="w-20 text-center">Hoạt động</div>
            <div className="w-12 text-center">Mail</div>
          </div>

          {students.map((s, i) => {
            const cfg = STATE_CONFIG[s.state];
            // Chưa có tên hiển thị: profiles thuộc dữ liệu cá nhân, GV chỉ
            // thấy số liệu tiến độ. Dùng mã HV nội bộ nếu trung tâm có đặt.
            const label =
              s.custom_fields?.student_code ||
              s.custom_fields?.ma_hv ||
              `Học viên ${i + 1}`;

            return (
              <div
                key={s.membership_id}
                className="grid gap-2 px-4 py-3 items-center text-sm"
                style={{
                  gridTemplateColumns: "1fr auto auto auto auto",
                  borderBottom: i < students.length - 1 ? "1px solid var(--divider)" : "none",
                }}
              >
                <div className="min-w-0 flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: cfg.color }}
                    title={cfg.label}
                  />
                  <span className="truncate font-medium" style={{ color: "var(--ink)" }}>
                    {label}
                  </span>
                </div>

                <div
                  className="w-14 text-center tabular-nums flex items-center justify-center gap-0.5"
                  style={{ color: s.streak_days > 0 ? "var(--sunshine-text)" : "var(--ink-ghost)" }}
                >
                  {s.streak_days > 0 && <Flame size={12} />}
                  {s.streak_days}
                </div>

                <div
                  className="w-14 text-center tabular-nums flex items-center justify-center gap-0.5"
                  style={{ color: "var(--ink-soft)" }}
                >
                  <BookMarked size={12} />
                  {s.words_saved}
                </div>

                <div
                  className="w-20 text-center text-xs"
                  style={{ color: s.state === "dropped" ? "var(--error)" : "var(--ink-soft)" }}
                >
                  {formatLastActive(s.last_active_at, s.inactive_days)}
                </div>

                <div
                  className="w-12 text-center tabular-nums flex items-center justify-center gap-0.5 text-xs"
                  style={{ color: "var(--ink-ghost)" }}
                >
                  <Mail size={11} />
                  {s.emails_sent}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <p className="text-xs mt-4" style={{ color: "var(--ink-ghost)" }}>
        Số liệu cập nhật hằng ngày. Giáo viên xem được tiến độ học tập, không
        xem được nội dung ghi chú cá nhân của học viên.
      </p>
      </>
      )}
    </main>
  );
}
