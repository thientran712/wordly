import { render } from "@react-email/render";
import DailyWordEmail from "@/emails/DailyWordEmail";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const FROM_EMAIL = "huythien7122@gmail.com";
const FROM_NAME = "Wordly";

export async function sendDailyWordEmail({ to, userName, word, streak }) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const html = await render(
    DailyWordEmail({ userName, word, streak, appUrl })
  );

  const subject = `🌈 Từ vựng hôm nay: ${word.word}`;

  try {
    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email: to, name: userName }],
        subject,
        htmlContent: html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Brevo error:", data);
      return { success: false, error: data.message || "Unknown error" };
    }

    return { success: true, id: data.messageId };
  } catch (err) {
    console.error("Send email error:", err);
    return { success: false, error: err.message };
  }
}
