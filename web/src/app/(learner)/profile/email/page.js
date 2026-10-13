import { redirect } from "next/navigation";

// Email nhắc học đã bỏ (chủ dự án 13/10/2026) — nhắc ôn giờ chỉ qua thông báo
// đẩy trên app iOS. Link cũ (bookmark, email cũ) đưa về trang hồ sơ.
export default function EmailSettingsRemoved() {
  redirect("/profile");
}
