import LegalPage, { LegalSection, SUPPORT_EMAIL } from "@/components/legal/LegalPage";

export const metadata = { title: "Chính sách quyền riêng tư · Wordly" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Chính sách quyền riêng tư" updated="23/10/2026">
      <p>Wordly (web và ứng dụng iOS) chỉ thu thập thông tin cần để app hoạt động.</p>

      <LegalSection heading="Dữ liệu chúng tôi lưu">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li><b>Email và tên</b> — để tạo và quản lý tài khoản của bạn.</li>
          <li><b>Nội dung bạn tạo</b> — bản dịch đã lưu, lịch sử dịch, sổ tay câu hay, kết quả quiz, cài đặt nhắc học. Chỉ bạn xem được; dùng để hiện lại cho bạn và tính lịch ôn tập (quiz, widget, thông báo nhắc ôn).</li>
          <li><b>Mã thiết bị nhận thông báo</b> — chỉ khi bạn bật thông báo nhắc ôn, để gửi nhắc tới đúng máy của bạn. Mã bị xoá khi bạn đăng xuất hoặc xoá tài khoản.</li>
          <li><b>Thời điểm bạn đồng ý</b> Điều khoản sử dụng và Chính sách này — để chứng minh sự đồng ý của bạn.</li>
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
          <li>Firebase Cloud Messaging (Google) và Apple Push Notification service — chuyển thông báo nhắc ôn tới máy bạn (nội dung gồm từ và nghĩa cần ôn).</li>
          <li>Google AdMob — hiển thị quảng cáo trong app iOS (xem mục Quảng cáo bên dưới).</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Quảng cáo">
        <p>Ứng dụng iOS miễn phí nhờ quảng cáo do Google AdMob cung cấp. Để hiển thị và đo quảng cáo, AdMob nhận:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li><b>Mã quảng cáo của thiết bị (IDFA)</b> — chỉ khi bạn bấm Cho phép ở hộp thoại &quot;Cho phép theo dõi&quot; của iOS. Không cho phép thì AdMob chỉ hiện quảng cáo không cá nhân hoá.</li>
          <li><b>Thông tin thiết bị và mạng</b> — loại máy, phiên bản iOS, ngôn ngữ, địa chỉ IP (để chọn quảng cáo phù hợp vùng và chống gian lận).</li>
          <li><b>Tương tác với quảng cáo</b> — quảng cáo đã hiện, đã bấm, đã xem hết.</li>
        </ul>
        <p>Khi bạn xem quảng cáo có thưởng, Google gửi cho Wordly mã tài khoản của bạn kèm mã giao dịch để cộng lượt dịch hoặc mở khoá theme. Wordly không gửi email, tên hay nội dung bạn dịch/lưu cho AdMob.</p>
        <p>Bạn đổi lựa chọn theo dõi bất cứ lúc nào tại Cài đặt iOS → Quyền riêng tư &amp; Bảo mật → Theo dõi. Chi tiết về cách Google dùng dữ liệu: policies.google.com/technologies/ads.</p>
      </LegalSection>

      <LegalSection heading="Những điều Wordly không làm">
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Không bán dữ liệu của bạn. Không chia sẻ email, tên hay nội dung bạn tạo cho quảng cáo.</li>
          <li>Không tự theo dõi bạn qua app hoặc website khác; quảng cáo cá nhân hoá chỉ khi bạn cho phép theo dõi trên iOS.</li>
          <li>Không hiện nội dung của bạn cho người dùng khác.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Lưu trữ và xoá dữ liệu">
        <p>Dữ liệu lưu trên hạ tầng do Wordly vận hành và luôn mã hoá khi truyền (HTTPS). Bạn xoá được tài khoản cùng toàn bộ dữ liệu ngay trong app iOS (Cá nhân → Xoá tài khoản), hoặc gửi yêu cầu qua email bên dưới.</p>
      </LegalSection>

      <LegalSection heading="Quyền của bạn">
        <p>Theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân, bạn có quyền được biết, đồng ý hoặc rút lại sự đồng ý, xem, sửa và xoá dữ liệu của mình. Rút lại sự đồng ý bằng cách xoá tài khoản trong app; muốn xem hoặc nhận bản sao dữ liệu, gửi yêu cầu qua email bên dưới.</p>
        <p>Xem thêm <a href="/terms" className="underline">Điều khoản sử dụng</a>.</p>
      </LegalSection>

      <LegalSection heading="Liên hệ">
        <p>{SUPPORT_EMAIL}</p>
      </LegalSection>
    </LegalPage>
  );
}
