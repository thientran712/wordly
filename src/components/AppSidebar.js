"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Languages, Mic, MessageCircle, NotebookPen, UserCog, Sparkles,
  Sun, Moon, LogOut, LogIn, Mail, Plus, Loader2, X, Menu, Building2, Zap, GraduationCap,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";

// Menu chia NHÓM có tiêu đề — quy ước quen thuộc của mọi ứng dụng quản lý
// (Gmail, Notion, Linear đều làm vậy). Trước đây tất cả nằm phẳng một danh
// sách, trộn tính năng học cá nhân với tính năng trung tâm nên khó quét mắt.
//
// Tên mục dùng TIẾNG VIỆT nhất quán — trước đây "Translation" đứng lẫn giữa
// các mục tiếng Việt, gây cảm giác chắp vá.
const NAV_GROUPS = [
  {
    title: "Học tập",
    items: [
      { href: "/", label: "Dịch & tra từ", icon: Languages },
      { href: "/practice", label: "Luyện nói với Alex", icon: Mic },
      { href: "/quiz", label: "Quiz từ vựng", icon: Zap },
      { href: "/journal", label: "Sổ tay câu hay", icon: NotebookPen },
    ],
  },
];

// Nhóm "Trung tâm" chỉ hiện với người thuộc ít nhất một tổ chức.
// Học viên và giáo viên/chủ trung tâm thấy MỤC KHÁC NHAU: học viên vào
// thẳng "Lớp của tôi" (ngôn ngữ của người học), staff vào "Quản lý trung
// tâm" (ngôn ngữ của người vận hành). Cùng một trang /org nhưng nhãn khác
// nhau cho đúng vai trò — tránh bắt học viên hiểu từ "quản lý".
const ORG_NAV_STAFF = { href: "/org", label: "Quản lý trung tâm", icon: Building2 };
const ORG_NAV_STUDENT = { href: "/org", label: "Lớp của tôi", icon: GraduationCap };

// Mục tài khoản luôn nằm cuối, tách khỏi các nhóm nội dung — quy ước chuẩn.
const ACCOUNT_ITEM = { href: "/profile", label: "Hồ sơ", icon: UserCog };

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [isGuest, setIsGuest] = useState(false);
  const [userName, setUserName] = useState("");
  // Khởi tạo LAZY từ localStorage thay vì setState trong effect. Phải trả
  // "dark" khi render trên server (không có window) để HTML server và client
  // khớp nhau — lệch sẽ gây hydration mismatch.
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";
    try {
      return localStorage.getItem("wordly-theme") || "dark";
    } catch {
      // Trình duyệt chặn localStorage (chế độ riêng tư, thiết lập bảo mật)
      return "dark";
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [hasOrgs, setHasOrgs] = useState(false);
  // Vai trò trong tổ chức quyết định NHÃN menu (không phải quyền truy cập —
  // quyền do RLS + trang /org tự kiểm). Chỉ để hiện đúng ngôn ngữ cho từng
  // đối tượng: học viên thấy "Lớp của tôi", staff thấy "Quản lý trung tâm".
  const [isOrgStaff, setIsOrgStaff] = useState(false);

  // Chỉ ĐỒNG BỘ ra DOM, không setState — state đã có giá trị đúng từ lúc
  // khởi tạo. Chạy lại khi theme đổi để nút toggle có tác dụng.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => {
        if (!r.ok) { setIsGuest(true); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setUserName(data.profile?.name || data.email?.split("@")[0] || "");

        // Chỉ hỏi danh sách tổ chức khi đã biết là người dùng đã đăng nhập,
        // để không thêm một request 401 vô ích cho khách.
        fetch("/api/orgs")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            const orgs = d?.orgs ?? [];
            setHasOrgs(orgs.length > 0);
            // Là staff nếu owner/teacher ở BẤT KỲ tổ chức nào — người vừa
            // dạy ở trung tâm này vừa học ở trung tâm khác vẫn thấy nhãn
            // quản lý, vì đó là vai trò "cao" hơn.
            setIsOrgStaff(orgs.some((o) => o.role === "owner" || o.role === "teacher"));
          })
          .catch(() => {});
      })
      .catch(() => setIsGuest(true));
  }, []);

  // Skip auth pages entirely — no sidebar on login/signup/forgot/reset
  const isAuthPage = ["/login", "/signup", "/forgot-password", "/reset-password"].includes(pathname);
  // On /practice, collapse to a slim rail so it doesn't fight the page's own session sidebar
  const isPractice = pathname.startsWith("/practice");

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next); // effect ở trên tự đồng bộ data-theme ra DOM
    try {
      localStorage.setItem("wordly-theme", next);
    } catch {
      // Trình duyệt chặn ghi (chế độ riêng tư) — đổi giao diện vẫn có tác
      // dụng trong phiên này, chỉ không nhớ được cho lần sau.
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  if (isAuthPage) return null;

  // Ghép nhóm động: "Trung tâm" chỉ xuất hiện khi người dùng thuộc tổ chức,
  // và nhãn đổi theo vai trò. Nhóm "Tài khoản" luôn ở cuối.
  // Thứ tự nhóm phụ thuộc VAI TRÒ, không cố định: owner/teacher đặt
  // "Trung tâm" LÊN ĐẦU vì đó là công việc chính của họ trên hệ thống —
  // đăng nhập vào là để quản lý trung tâm, không phải để tự học. Học viên
  // (hoặc người không thuộc trung tâm nào) vẫn thấy "Học tập" trước vì đó
  // là lý do chính họ dùng Wordly.
  const orgGroup = hasOrgs
    ? [{ title: "Trung tâm", items: [isOrgStaff ? ORG_NAV_STAFF : ORG_NAV_STUDENT] }]
    : [];

  const navGroups = isOrgStaff
    ? [...orgGroup, ...NAV_GROUPS, { title: "Tài khoản", items: [ACCOUNT_ITEM] }]
    : [...NAV_GROUPS, ...orgGroup, { title: "Tài khoản", items: [ACCOUNT_ITEM] }];

  return (
    <>
      {/* Mobile hamburger trigger — hidden on /practice, which has its own header + session sidebar */}
      {!isPractice && (
        <button
          onClick={() => setMobileOpen(true)}
          className="no-min-h fixed top-3 left-3 z-40 w-9 h-9 rounded-xl flex items-center justify-center md:hidden"
          style={{ background: "var(--card-bg)", color: "var(--ink-soft)", border: "1px solid var(--card-border)" }}
        >
          <Menu size={16} />
        </button>
      )}

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={`fixed md:sticky top-0 left-0 h-screen z-50 md:z-30 flex flex-col flex-shrink-0 transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        style={{
          width: isPractice ? 60 : 240,
          background: "var(--card-bg)",
          borderRight: "1px solid var(--divider)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 flex-shrink-0">
          <button
            onClick={() => { router.push("/"); setMobileOpen(false); }}
            className="flex items-center gap-2 min-w-0"
          >
            <div className="w-9 h-9 flex-shrink-0 rounded-lg overflow-hidden">
              <img src="/favicon.png" alt="Wordly" className="w-full h-full object-cover" />
            </div>
            {!isPractice && (
              <span className="font-black text-xl tracking-tight truncate" style={{ color: "var(--electric)" }}>Wordly</span>
            )}
          </button>
          <button onClick={() => setMobileOpen(false)} className="no-min-h ml-auto w-7 h-7 rounded-lg flex items-center justify-center md:hidden" style={{ color: "var(--ink-soft)" }}>
            <X size={14} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-1">
          {/* Nhóm nội dung — mỗi nhóm có tiêu đề nhỏ để mắt quét nhanh.
              Ở chế độ rail hẹp (/practice) ẩn tiêu đề, chỉ còn icon. */}
          {navGroups.map((group) => (
            <div key={group.title} className="flex flex-col gap-1">
              {!isPractice && (
                <div
                  className="px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--ink-ghost)" }}
                >
                  {group.title}
                </div>
              )}
              {group.items.map((item) => (
                <NavButton
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  isPractice={isPractice}
                  onNavigate={() => { router.push(item.href); setMobileOpen(false); }}
                />
              ))}
            </div>
          ))}

          {/* Ghi chú nhanh — hành động, không phải trang, nên tách khỏi các
              nhóm điều hướng bằng đường kẻ mảnh. */}
          {!isPractice && (
            <>
              <div className="mx-3 my-2 border-t" style={{ borderColor: "var(--divider)" }} />
              <button
                onClick={() => setIsJournalOpen(true)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{ color: "var(--ink-soft)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <Plus size={20} className="flex-shrink-0" />
                <span className="truncate">Ghi chú nhanh</span>
              </button>
            </>
          )}
        </nav>

        {/* Bottom: theme toggle + account */}
        <div className="flex-shrink-0 px-2 py-2 border-t" style={{ borderColor: "var(--divider)" }}>
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{ color: "var(--ink-soft)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {theme === "dark" ? <Sun size={20} className="flex-shrink-0" /> : <Moon size={20} className="flex-shrink-0" />}
            {!isPractice && <span className="truncate">{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
          </button>

          {isGuest ? (
            <button
              onClick={() => router.push("/login")}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{ color: "var(--electric)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <LogIn size={20} className="flex-shrink-0" />
              {!isPractice && <span className="truncate">Đăng nhập</span>}
            </button>
          ) : (
            <>
              {!isPractice && userName && (
                <div className="px-3 py-1.5 text-[11px] truncate" style={{ color: "var(--ink-ghost)" }}>{userName}</div>
              )}
              <button
                onClick={() => router.push("/profile/email")}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: pathname === "/profile/email" ? "var(--green-subtle)" : "transparent",
                  color: pathname === "/profile/email" ? "var(--electric)" : "var(--ink-soft)",
                }}
                onMouseEnter={(e) => { if (pathname !== "/profile/email") e.currentTarget.style.background = "var(--hover-bg)"; }}
                onMouseLeave={(e) => { if (pathname !== "/profile/email") e.currentTarget.style.background = "transparent"; }}
              >
                <Mail size={20} className="flex-shrink-0" strokeWidth={pathname === "/profile/email" ? 2.5 : 2} />
                {!isPractice && <span className="truncate">Cài đặt Email</span>}
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{ color: "var(--error)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--error-soft)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <LogOut size={20} className="flex-shrink-0" />
                {!isPractice && <span className="truncate">Đăng xuất</span>}
              </button>
            </>
          )}
        </div>
      </aside>

      {!isGuest && (
        <JournalSheet isOpen={isJournalOpen} onClose={() => setIsJournalOpen(false)} />
      )}
    </>
  );
}

function JournalSheet({ isOpen, onClose }) {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });
      if (res.ok) {
        setContent("");
        onClose();
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[90]"
        style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(3px)" }}
        onClick={onClose}
      />
      <div
        className="fixed z-[100] animate-slide-up
          bottom-0 left-0 right-0 rounded-t-3xl px-5 pt-4
          sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
          sm:w-full sm:max-w-sm sm:rounded-3xl sm:p-6"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
          background: "var(--card-bg)",
          border: "1px solid var(--green-subtle-border)",
          boxShadow: "0 -16px 48px rgba(0,0,0,0.3)",
        }}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-4 sm:hidden" style={{ background: "var(--divider)" }} />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <NotebookPen size={15} style={{ color: "var(--electric)" }} />
            <span className="font-bold text-sm" style={{ color: "var(--ink)" }}>Ghi chú nhanh</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="no-min-h w-8 h-8 rounded-xl flex items-center justify-center active:scale-95"
            style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
          >
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Câu, bài học, hoặc câu hỏi bạn gặp hôm nay..."
            autoFocus
            rows={3}
            className="w-full px-4 py-3 rounded-2xl text-sm focus:outline-none transition-all resize-none"
            style={{ background: "var(--input-bg)", border: "1.5px solid var(--input-border)", color: "var(--ink)" }}
            onFocus={(e) => { e.target.style.borderColor = "var(--electric)"; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--input-border)"; }}
          />
          <button
            type="submit"
            disabled={isLoading || !content.trim()}
            className="w-full py-3 rounded-2xl font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2 active:scale-95 transition-all"
            style={{ background: "var(--electric)", color: "var(--on-electric)", boxShadow: "0 4px 16px rgba(var(--electric-rgb),0.3)" }}
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Lưu vào Journal
          </button>
        </form>
      </div>
    </>
  );
}

// Một mục điều hướng. Tách riêng để logic "đang ở trang nào" không lặp lại
// và để nhóm nav ở trên đọc gọn.
function NavButton({ item, pathname, isPractice, onNavigate }) {
  // Trang chủ "/" và "/profile" phải so KHỚP CHÍNH XÁC — nếu dùng
  // startsWith thì "/" khớp mọi trang, và "/profile" sẽ sáng cả khi đang
  // ở "/profile/email".
  const active =
    item.href === "/" || item.href === "/profile"
      ? pathname === item.href
      : pathname.startsWith(item.href);

  const Icon = item.icon;

  return (
    <button
      onClick={onNavigate}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all"
      title={item.label}
      style={{
        background: active ? "var(--green-subtle)" : "transparent",
        color: active ? "var(--electric)" : "var(--ink-soft)",
        border: active ? "1.5px solid var(--green-subtle-border)" : "1.5px solid transparent",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--hover-bg)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <Icon size={20} strokeWidth={active ? 2.5 : 2} className="flex-shrink-0" />
      {!isPractice && <span className="truncate">{item.label}</span>}
    </button>
  );
}
