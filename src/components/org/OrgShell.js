"use client";

// Khung layout dùng chung cho mọi trang B2B.
//
// Vì sao có file này: 4 trang B2B đều cần cùng một logic chiều rộng, nếu
// mỗi trang tự đặt max-w-* thì sửa một lần phải sửa 4 chỗ và dễ lệch nhau.
//
// Chiều rộng theo LOẠI nội dung, không cào bằng:
//   • "wide"  — bảng dữ liệu, dashboard: dùng hết màn hình
//   • "form"  — biểu mẫu, nội dung đọc: giữ hẹp vì dòng quá dài gây mỏi mắt
//               (nghiên cứu typography: 50-75 ký tự/dòng là dễ đọc nhất)

const WIDTHS = {
  // Trần 1920px để trên màn hình siêu rộng (ultrawide) nội dung không bị
  // kéo dãn tới mức mắt phải quét ngang quá xa.
  wide: "w-full max-w-[1920px]",
  form: "w-full max-w-2xl",
};

export default function OrgShell({
  variant = "wide",
  children,
  className = "",
}) {
  return (
    <main
      className={`${WIDTHS[variant] || WIDTHS.wide} mx-auto px-3 sm:px-5 lg:px-6 py-4 sm:py-6 ${className}`}
    >
      {children}
    </main>
  );
}

/**
 * Tiêu đề trang: tên + phụ đề bên trái, hành động bên phải.
 * Trên mobile thì xếp dọc để không chật.
 */
export function OrgHeader({ title, subtitle, badges, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-black truncate" style={{ color: "var(--ink)" }}>
            {title}
          </h1>
          {badges}
        </div>
        {subtitle && (
          <p className="text-xs sm:text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

/**
 * Thanh tab điều hướng — cuộn ngang được trên mobile khi có nhiều tab.
 */
export function OrgTabs({ tabs, active, onChange }) {
  return (
    <div
      className="flex gap-1 mb-5 p-1 rounded-xl overflow-x-auto"
      style={{ background: "var(--surface)" }}
    >
      {tabs.map((t) => {
        const Icon = t.icon;
        const on = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap no-min-h transition-colors"
            style={{
              background: on ? "var(--card-bg)" : "transparent",
              color: on ? "var(--electric)" : "var(--ink-soft)",
            }}
          >
            {Icon && <Icon size={15} />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Lưới thẻ tự giãn theo chiều rộng màn hình.
 * Dùng cho danh sách lớp, thẻ thống kê — tận dụng màn hình rộng thay vì
 * xếp một cột dài phải cuộn nhiều.
 */
export function OrgGrid({ min = "280px", children, className = "" }) {
  return (
    <div
      className={`grid gap-3 ${className}`}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}, 1fr))` }}
    >
      {children}
    </div>
  );
}
