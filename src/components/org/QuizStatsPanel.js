"use client";

// Xếp hạng quiz trong lớp.
//
// Giáo viên thấy bảng đầy đủ; học viên CHỈ thấy vị trí của mình (server đã
// quyết định điều đó, không trả bảng cho học viên). Xếp hạng công khai trong
// lớp có thể gây áp lực không cần thiết cho học viên yếu.

import { useEffect, useState } from "react";
import { Trophy, Zap, Target, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

const PERIODS = [
  { key: "week", label: "7 ngày" },
  { key: "month", label: "30 ngày" },
  { key: "all", label: "Tất cả" },
];

const MEDALS = ["🥇", "🥈", "🥉"];

export default function QuizStatsPanel({ classId }) {
  const [period, setPeriod] = useState("week");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;

    fetch(`/api/classes/${classId}/quiz-stats?period=${period}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError("Không tải được thống kê quiz");
      });

    return () => {
      cancelled = true;
    };
  }, [classId, period]);

  if (error) {
    return (
      <Card padding="1.5rem" className="text-center">
        <p className="text-sm" style={{ color: "var(--error)" }}>{error}</p>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: "var(--hover-bg)" }} />
        ))}
      </div>
    );
  }

  const isStudentView = data.leaderboard === null;

  return (
    <div>
      {/* Chọn khoảng thời gian */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit" style={{ background: "var(--surface)" }}>
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              setPeriod(p.key);
              setData(null);
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold no-min-h"
            style={{
              background: period === p.key ? "var(--card-bg)" : "transparent",
              color: period === p.key ? "var(--electric)" : "var(--ink-soft)",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Học viên: chỉ thấy vị trí của mình */}
      {isStudentView ? (
        data.my_stats ? (
          <Card elevated padding="1.5rem" className="text-center">
            <Trophy size={26} className="mx-auto mb-2" style={{ color: "var(--sunshine-text)" }} />
            <p className="text-3xl font-black tabular-nums" style={{ color: "var(--electric)" }}>
              #{data.my_rank}
            </p>
            <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
              trong {data.total_players} bạn có chơi quiz
            </p>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="font-black tabular-nums text-base" style={{ color: "var(--ink)" }}>
                  {data.my_stats.avg_percent}%
                </div>
                <div style={{ color: "var(--ink-ghost)" }}>Điểm TB</div>
              </div>
              <div>
                <div className="font-black tabular-nums text-base" style={{ color: "var(--ink)" }}>
                  {data.my_stats.best_percent}%
                </div>
                <div style={{ color: "var(--ink-ghost)" }}>Cao nhất</div>
              </div>
              <div>
                <div className="font-black tabular-nums text-base" style={{ color: "var(--ink)" }}>
                  {data.my_stats.attempts}
                </div>
                <div style={{ color: "var(--ink-ghost)" }}>Lượt chơi</div>
              </div>
            </div>
          </Card>
        ) : (
          <Card padding="1.5rem" className="text-center">
            <Zap size={26} className="mx-auto mb-2" style={{ color: "var(--ink-ghost)" }} />
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              Bạn chưa chơi quiz trong khoảng thời gian này.
            </p>
          </Card>
        )
      ) : (
        <>
          {/* Giáo viên: tổng quan + bảng xếp hạng */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Card padding="0.875rem">
              <div className="flex items-center gap-1 text-xs mb-1" style={{ color: "var(--ink-soft)" }}>
                <Users size={11} /> Có chơi
              </div>
              <div className="text-lg font-black tabular-nums" style={{ color: "var(--ink)" }}>
                {data.summary.players}
              </div>
            </Card>
            <Card padding="0.875rem">
              <div className="flex items-center gap-1 text-xs mb-1" style={{ color: "var(--ink-soft)" }}>
                <Zap size={11} /> Lượt chơi
              </div>
              <div className="text-lg font-black tabular-nums" style={{ color: "var(--ink)" }}>
                {data.summary.total_attempts}
              </div>
            </Card>
            <Card
              padding="0.875rem"
              style={{ background: "var(--green-subtle)", border: "1px solid var(--green-subtle-border)" }}
            >
              <div className="flex items-center gap-1 text-xs mb-1" style={{ color: "var(--electric)" }}>
                <Target size={11} /> Điểm TB lớp
              </div>
              <div className="text-lg font-black tabular-nums" style={{ color: "var(--electric)" }}>
                {data.summary.class_avg_percent}%
              </div>
            </Card>
          </div>

          {data.leaderboard.length === 0 ? (
            <Card padding="1.5rem" className="text-center">
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                Chưa có học viên nào chơi quiz. Nhắc các em vào mục Quiz từ vựng.
              </p>
            </Card>
          ) : (
            <Card elevated padding="0" className="overflow-hidden">
              {data.leaderboard.map((r, i) => (
                <div
                  key={r.membership_id}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm"
                  style={{
                    borderBottom: i < data.leaderboard.length - 1 ? "1px solid var(--divider)" : "none",
                  }}
                >
                  <span
                    className="w-7 text-center font-bold tabular-nums flex-shrink-0"
                    style={{ color: i < 3 ? "var(--ink)" : "var(--ink-ghost)" }}
                  >
                    {MEDALS[i] || i + 1}
                  </span>

                  <span className="flex-1 min-w-0 truncate" style={{ color: "var(--ink)" }}>
                    Học viên {i + 1}
                  </span>

                  <span
                    className="tabular-nums font-bold w-12 text-right"
                    style={{ color: r.avg_percent >= 70 ? "var(--grass-text)" : "var(--sunshine-text)" }}
                  >
                    {r.avg_percent}%
                  </span>

                  <Badge tone="neutral">{r.attempts} lượt</Badge>
                </div>
              ))}
            </Card>
          )}

          <p className="text-xs mt-3" style={{ color: "var(--ink-ghost)" }}>
            Học viên chỉ thấy vị trí của mình, không thấy điểm của bạn khác.
          </p>
        </>
      )}
    </div>
  );
}
