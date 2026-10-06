// Gửi email cho phần B2B: mời thành viên và báo cáo phụ huynh.
//
// Tách file riêng khỏi send-email.js (đang lo email từ vựng hằng ngày) để
// hai mảng nghiệp vụ không dính vào nhau, nhưng dùng CÙNG transporter
// nodemailer + Gmail đã cấu hình sẵn — không thêm dịch vụ, không thêm chi phí.

import nodemailer from "nodemailer";
import { render } from "@react-email/render";
import OrgInviteEmail from "@/emails/OrgInviteEmail";
import ParentReportEmail from "@/emails/ParentReportEmail";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

/** Gửi chung — không throw, trả { success } để caller quyết định retry. */
async function send({ to, subject, html }) {
  try {
    const info = await transporter.sendMail({
      from: `"Wordly" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
      headers: {
        "List-Unsubscribe": `<${appUrl()}/profile>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "X-Mailer": "Wordly",
      },
    });
    return { success: true, id: info.messageId };
  } catch (err) {
    console.error("[send-org-email] lỗi:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Mời thành viên vào trung tâm.
 * `hasAccount` quyết định nội dung: người đã có tài khoản chỉ cần đăng nhập
 * lại (org context nằm trong JWT), người chưa có thì phải đăng ký trước.
 */
export async function sendOrgInviteEmail({
  to,
  orgName,
  roleLabel,
  inviterName = "",
  hasAccount = false,
  joinCode = null,
}) {
  const html = await render(
    OrgInviteEmail({ orgName, roleLabel, inviterName, hasAccount, joinCode, appUrl: appUrl() })
  );
  return send({
    to,
    subject: `🌈 ${orgName} mời bạn tham gia Wordly`,
    html,
  });
}

/**
 * Báo cáo tiến độ cho phụ huynh.
 * Chỉ chứa SỐ LIỆU — không có nội dung học tập cá nhân của học viên.
 */
export async function sendParentReportEmail({
  to,
  studentName,
  className,
  orgName,
  periodLabel,
  stats,
  state,
}) {
  const html = await render(
    ParentReportEmail({
      studentName,
      className,
      orgName,
      periodLabel,
      stats,
      state,
      appUrl: appUrl(),
    })
  );
  return send({
    to,
    subject: `📊 Báo cáo học tập: ${studentName}`,
    html,
  });
}
