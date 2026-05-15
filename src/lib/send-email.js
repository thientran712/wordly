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

export async function sendDailyWordEmail({ to, userName, word }) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wordly.app";

  const html = await render(
    DailyWordEmail({ userName, word, appUrl })
  );

  const subject = `🌈 Từ vựng hôm nay: ${word.word}`;

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
