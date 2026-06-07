import nodemailer from "nodemailer";
import { render } from "@react-email/render";
import DailyWordEmail from "@/emails/DailyWordEmail";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendDailyWordEmail({ to, userName, word, aiContent = null, source = "new" }) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const html = await render(
    DailyWordEmail({ userName, word, aiContent, source, appUrl })
  );

  const subjectPrefix = source === "journal" ? "📓 Ôn lại" : source === "translate_history" ? "🔁 Ôn lại" : "✨ Từ mới";
  const subject = `🌈 ${subjectPrefix}: ${word.word}`;

  try {

    const info = await transporter.sendMail({
      from: `"Wordly" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
      headers: {
        "List-Unsubscribe": `<${appUrl}/profile>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "X-Mailer": "Wordly",
      },
    });

    return { success: true, id: info.messageId };
  } catch (err) {
    console.error("Send email error:", err);
    return { success: false, error: err.message };
  }
}
