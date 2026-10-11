// Khung chung cho trang công khai (chính sách, hỗ trợ) — App Store yêu cầu
// URL công khai cho Privacy Policy + Support, xem nút trong app iOS.
export const SUPPORT_EMAIL = "support@wordly.skillproof.work";

export default function LegalPage({ title, updated, children }) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12" style={{ color: "var(--ink)" }}>
      <h1 className="text-3xl font-extrabold mb-1">{title}</h1>
      {updated && (
        <p className="text-sm mb-8" style={{ color: "var(--ink-soft)" }}>Cập nhật lần cuối: {updated}</p>
      )}
      <div className="flex flex-col gap-6 text-[15px] leading-relaxed">{children}</div>
    </main>
  );
}

export function LegalSection({ heading, children }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">{heading}</h2>
      {children}
    </section>
  );
}
