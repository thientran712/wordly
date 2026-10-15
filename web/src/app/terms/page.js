import LegalPage, { LegalSection, SUPPORT_EMAIL } from "@/components/legal/LegalPage";

export const metadata = { title: "Điều khoản sử dụng · Wordly" };

// Đổi nội dung theo cách người dùng cần biết → tăng CURRENT_TERMS_VERSION
// (src/lib/legal/terms.js) để app hỏi đồng ý lại.
export default function TermsPage() {
  return (
    <LegalPage title="Điều khoản sử dụng" updated="15/10/2026">
      <p>Điều khoản này áp dụng khi bạn dùng Wordly (ứng dụng iOS và website). Bấm “Đồng ý” khi tạo tài khoản hoặc khi app hỏi nghĩa là bạn đồng ý với Điều khoản này và <a href="/privacy" className="underline">Chính sách quyền riêng tư</a>.</p>

      <LegalSection heading="Tài khoản">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Bạn đăng ký bằng email, tài khoản Google hoặc Apple, và dùng email thật của mình.</li>
          <li>Bạn tự giữ an toàn mật khẩu và thiết bị đã đăng nhập.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Dịch vụ">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Wordly hiện miễn phí. Nếu sau này có gói trả phí, Wordly báo trước và bạn tự chọn có mua hay không.</li>
          <li>Wordly có thể thay đổi, thêm hoặc bỏ tính năng, và đôi lúc tạm gián đoạn để bảo trì.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Nội dung do máy và AI tạo">
        <p>Bản dịch, giải nghĩa, ví dụ và phát âm được tạo bằng dịch máy và AI, nên có thể sai. Wordly dùng để học từ vựng — không dùng thay cho bản dịch chuyên nghiệp trong việc pháp lý, y tế hay tài chính.</p>
      </LegalSection>

      <LegalSection heading="Nội dung của bạn">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Từ đã lưu, sổ tay và lịch sử dịch thuộc về bạn. Bạn cho phép Wordly lưu và xử lý chúng chỉ để cung cấp tính năng cho bạn (dịch, ôn tập, widget, nhắc ôn).</li>
          <li>Không đưa vào Wordly nội dung vi phạm pháp luật Việt Nam hoặc xâm phạm quyền của người khác.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Thông báo nhắc ôn">
        <p>Wordly chỉ gửi thông báo khi bạn bật, theo giờ bạn chọn. Tắt bất cứ lúc nào trong Cá nhân → Thông báo nhắc ôn hoặc trong Cài đặt của iPhone.</p>
      </LegalSection>

      <LegalSection heading="Sử dụng hợp lý">
        <p>Không phá hoại hệ thống, không dùng công cụ tự động gửi yêu cầu hàng loạt, không tìm cách truy cập dữ liệu của người khác. Wordly có thể giới hạn tốc độ hoặc khoá tài khoản vi phạm.</p>
      </LegalSection>

      <LegalSection heading="Xoá tài khoản">
        <p>Bạn xoá được tài khoản bất cứ lúc nào trong app (Cá nhân → Xoá tài khoản). Toàn bộ dữ liệu của bạn bị xoá theo.</p>
      </LegalSection>

      <LegalSection heading="Giới hạn trách nhiệm">
        <p>Wordly được cung cấp như hiện có. Trong phạm vi pháp luật cho phép, Wordly không chịu trách nhiệm cho thiệt hại gián tiếp phát sinh từ việc dùng hoặc không dùng được dịch vụ.</p>
      </LegalSection>

      <LegalSection heading="Thay đổi điều khoản">
        <p>Khi Điều khoản hoặc Chính sách thay đổi theo cách bạn cần biết, app sẽ hiện bản mới và hỏi bạn đồng ý lại trước khi dùng tiếp.</p>
      </LegalSection>

      <LegalSection heading="Luật áp dụng">
        <p>Điều khoản này theo pháp luật Việt Nam.</p>
      </LegalSection>

      <LegalSection heading="Liên hệ">
        <p>{SUPPORT_EMAIL}</p>
      </LegalSection>
    </LegalPage>
  );
}
