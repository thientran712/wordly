import Link from "next/link";
import LegalPage, { LegalSection, SUPPORT_EMAIL } from "@/components/legal/LegalPage";

// Website đang tắt (src/lib/web-ui-gate.js) — mọi trang web người học về đây.
export const metadata = { title: "Wordly · Có trên iPhone" };

export default function MobileOnlyPage() {
  return (
    <LegalPage title="Wordly giờ có trên iPhone 📱">
      <p>Wordly đã chuyển hẳn sang ứng dụng iPhone: dịch, lưu từ, widget màn hình khoá và thông báo nhắc ôn từ mỗi ngày.</p>

      <LegalSection heading="Dùng thế nào?">
        <p>Tìm <b>“Wordly”</b> trên App Store, đăng nhập bằng tài khoản cũ — từ đã lưu vẫn còn nguyên.</p>
      </LegalSection>

      <LegalSection heading="Cần giúp?">
        <p>Email: <span className="font-semibold">{SUPPORT_EMAIL}</span></p>
      </LegalSection>

      <p>
        <Link href="/privacy" className="underline">Chính sách quyền riêng tư</Link>
        {" · "}
        <Link href="/support" className="underline">Hỗ trợ</Link>
      </p>
    </LegalPage>
  );
}
