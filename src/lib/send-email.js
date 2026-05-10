import { Resend } from "resend";
import { render } from "@react-email/render";
import DailyWordEmail from "@/emails/DailyWordEmail";

const resend = new Resend(process.env.RESEND_API_KEY);

// EMAIL TEST: Trong giai đoạn dev, chỉ gửi được tới email đăng ký Resend
// Khi có domain, đổi FROM_EMAIL và xóa logic giới hạn này
const TEST_EMAIL = "huythien7122@gmail.com";
const FROM_EMAIL = "Wordly <onboarding@resend.dev>";

export async function sendDailyWordEmail({ to, userName, word, streak }) {
  // Trong dev: ép gửi đến email test
  const recipient = process.env.NODE_ENV === "production" ? to : TEST_EMAIL;
  
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  
  const html = await render(
    DailyWordEmail({ userName, word, streak, appUrl })
  );
  
  const subject = `🌈 Từ vựng hôm nay: ${word.word}`;
  
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipient,
      subject,
      html,
    });
    
    if (error) {
      console.error("Resend error:", error);
      return { success: false, error: error.message };
    }
    
    return { success: true, id: data.id };
  } catch (err) {
    console.error("Send email error:", err);
    return { success: false, error: err.message };
  }
}
