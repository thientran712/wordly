import Link from "next/link";
import LegalPage, { LegalSection, SUPPORT_EMAIL } from "@/components/legal/LegalPage";

export const metadata = { title: "Hỗ trợ · Wordly" };

export default function SupportPage() {
  return (
    <LegalPage title="Hỗ trợ">
      <p>Gặp lỗi, cần giúp đỡ hoặc muốn góp ý? Gửi email cho chúng tôi, thường trả lời trong 1–2 ngày làm việc.</p>

      <LegalSection heading="Email">
        <p className="font-semibold">{SUPPORT_EMAIL}</p>
      </LegalSection>

      <LegalSection heading="Câu hỏi thường gặp">
        <p><b>Không nhận được email xác nhận hoặc đặt lại mật khẩu?</b> Kiểm tra mục Spam/Quảng cáo, rồi thử gửi lại sau vài phút.</p>
        <p><b>Widget không hiện từ?</b> Mở app một lần để đồng bộ từ đã lưu, rồi giữ màn hình khoá → Tuỳ chỉnh để thêm widget Wordly.</p>
        <p><b>Muốn xoá tài khoản?</b> Trong app iOS: Cá nhân → Xoá tài khoản. Toàn bộ dữ liệu bị xoá vĩnh viễn.</p>
      </LegalSection>

      <p><Link href="/privacy" className="underline">Chính sách quyền riêng tư</Link></p>
    </LegalPage>
  );
}
