import LegalPage, { LegalSection, SUPPORT_EMAIL } from "@/components/legal/LegalPage";

export const metadata = { title: "Chính sách quyền riêng tư · Wordly" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Chính sách quyền riêng tư" updated="12/10/2026">
      <p>Wordly (web và ứng dụng iOS) chỉ thu thập thông tin cần để app hoạt động.</p>

      <LegalSection heading="Dữ liệu chúng tôi lưu">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li><b>Email và tên</b> — để tạo và quản lý tài khoản của bạn.</li>
          <li><b>Nội dung bạn tạo</b> — bản dịch đã lưu, lịch sử dịch, sổ tay câu hay, kết quả quiz, cài đặt nhắc học. Chỉ bạn xem được; dùng để hiện lại cho bạn và tính lịch ôn tập (quiz, widget, email nhắc học).</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Dữ liệu chỉ xử lý rồi bỏ, không lưu">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li><b>Ảnh</b> bạn chụp để dịch chữ — gửi tới dịch vụ nhận diện chữ, trả kết quả ngay, không lưu lại.</li>
          <li><b>Giọng nói</b> khi dịch bằng giọng nói trên iOS — nhận dạng ngay trên máy bằng Apple Speech, không gửi về máy chủ Wordly.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Bên xử lý thứ ba">
        <p>Chỉ dùng để trả kết quả cho yêu cầu của bạn, không cho mục đích nào khác:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Google Gemini — dịch câu, nhận diện chữ trong ảnh, giải nghĩa từ trong từ điển AI.</li>
          <li>Groq — dự phòng cho từ điển AI khi Gemini quá tải.</li>
          <li>DeepL — dịch từ và cụm từ ngắn.</li>
          <li>Google Cloud Text-to-Speech — phát âm.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Những điều Wordly không làm">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Không bán hay chia sẻ dữ liệu của bạn cho quảng cáo.</li>
          <li>Không theo dõi bạn qua app hoặc website khác.</li>
          <li>Không hiện nội dung của bạn cho người dùng khác.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Lưu trữ và xoá dữ liệu">
        <p>Dữ liệu lưu trên hạ tầng do Wordly vận hành và luôn mã hoá khi truyền (HTTPS). Bạn xoá được tài khoản cùng toàn bộ dữ liệu ngay trong app iOS (Cá nhân → Xoá tài khoản), hoặc gửi yêu cầu qua email bên dưới.</p>
      </LegalSection>

      <LegalSection heading="Liên hệ">
        <p>{SUPPORT_EMAIL}</p>
      </LegalSection>
    </LegalPage>
  );
}
