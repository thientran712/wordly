"use client";

// Bảng dữ liệu dùng chung cho mọi danh sách trong hệ thống — thay thế các
// grid thẻ (card) rời rạc trước đây. Một component, một cách phân trang,
// một cách hiển thị rỗng/loading — sửa một chỗ áp dụng khắp nơi.
//
// Trên mobile (< sm breakpoint), bảng tự chuyển thành danh sách thẻ dọc vì
// bảng nhiều cột không đọc được trên màn hình hẹp — vẫn cùng dữ liệu, cùng
// hành động, chỉ khác cách trình bày.

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import Card from "./Card";

/**
 * @param columns  [{ key, label, render?(row), className?, hideOnMobile? }]
 * @param rows     mảng dữ liệu
 * @param rowKey   (row) => string — khoá React, mặc định row.id
 * @param loading  đang tải trang đầu (skeleton toàn bảng)
 * @param empty    { icon, title, description } khi rows rỗng
 * @param actions  (row) => ReactNode — cột hành động cuối, mobile hiện dưới thẻ
 * @param pagination { page, pageSize, total, onPageChange }
 */
export default function DataTable({
  columns,
  rows,
  rowKey = (row) => row.id,
  loading = false,
  empty,
  actions,
  pagination,
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "var(--hover-bg)" }} />
        ))}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <Card padding="1.5rem" className="text-center">
        {empty?.icon && (
          <empty.icon size={26} className="mx-auto mb-2" style={{ color: "var(--ink-ghost)" }} />
        )}
        <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
          {empty?.title || "Chưa có dữ liệu"}
        </p>
        {empty?.description && (
          <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
            {empty.description}
          </p>
        )}
      </Card>
    );
  }

  const visibleCols = columns.filter((c) => !c.mobileOnly);

  return (
    <div>
      {/* ── Desktop: bảng thật ── */}
      <Card elevated padding="0" className="overflow-hidden hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--divider)" }}>
                {visibleCols.map((col) => (
                  <th
                    key={col.key}
                    className={`text-left px-4 py-2.5 text-xs font-semibold whitespace-nowrap ${col.className || ""}`}
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {col.label}
                  </th>
                ))}
                {actions && <th className="w-1 px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={rowKey(row)}
                  style={{
                    borderBottom: i < rows.length - 1 ? "1px solid var(--divider)" : "none",
                  }}
                >
                  {visibleCols.map((col) => (
                    <td key={col.key} className={`px-4 py-2.5 align-middle ${col.className || ""}`}>
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                  {actions && (
                    <td className="px-4 py-2.5 align-middle">
                      <div className="flex items-center justify-end gap-1">{actions(row)}</div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Mobile: thẻ dọc, cùng dữ liệu khác cách trình bày ── */}
      <div className="sm:hidden space-y-2">
        {rows.map((row) => (
          <Card key={rowKey(row)} padding="0.875rem">
            <div className="space-y-1.5">
              {columns.map((col) => {
                const value = col.render ? col.render(row) : row[col.key];
                if (value === null || value === undefined || value === "") return null;
                return (
                  <div key={col.key} className="flex items-center justify-between gap-2 text-xs">
                    <span style={{ color: "var(--ink-ghost)" }}>{col.label}</span>
                    <span style={{ color: "var(--ink)" }}>{value}</span>
                  </div>
                );
              })}
            </div>
            {actions && (
              <div
                className="flex items-center justify-end gap-1 mt-2 pt-2"
                style={{ borderTop: "1px solid var(--divider)" }}
              >
                {actions(row)}
              </div>
            )}
          </Card>
        ))}
      </div>

      {pagination && <Pagination {...pagination} />}
    </div>
  );
}

/**
 * Thanh phân trang — dùng chung mọi nơi có DataTable.
 * page 1-indexed, để khớp trực giác người dùng ("trang 1" chứ không "trang 0").
 */
export function Pagination({ page, pageSize, total, onPageChange, loading = false }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 mt-3 px-1">
      <span className="text-xs" style={{ color: "var(--ink-ghost)" }}>
        {from}–{to} / {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || loading}
          className="no-min-h w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30"
          style={{ background: "var(--surface)", color: "var(--ink-soft)", border: "1px solid var(--card-border)" }}
        >
          <ChevronLeft size={15} />
        </button>
        <span className="text-xs font-semibold px-2 tabular-nums" style={{ color: "var(--ink)" }}>
          {loading ? <Loader2 size={13} className="animate-spin inline" /> : `${page} / ${totalPages}`}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || loading}
          className="no-min-h w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30"
          style={{ background: "var(--surface)", color: "var(--ink-soft)", border: "1px solid var(--card-border)" }}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
