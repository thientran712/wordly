import {
  Body, Container, Head, Heading, Html, Preview,
  Section, Text, Button, Hr,
} from "@react-email/components";

// Email mời tham gia trung tâm.
//
// Hai tình huống, nội dung khác nhau:
//   • Người CHƯA có tài khoản → dẫn tới /signup rồi tự vào trung tâm
//   • Người ĐÃ có tài khoản → chỉ cần đăng nhập lại để JWT nhận quyền mới
//
// Màu sắc theo tông thương hiệu Wordly (#58CC02) như DailyWordEmail.

export default function OrgInviteEmail({
  orgName = "Trung tâm",
  roleLabel = "Học viên",
  inviterName = "",
  hasAccount = false,
  joinCode = null,
  appUrl = "https://wordly.app",
}) {
  const ctaUrl = hasAccount ? `${appUrl}/login` : `${appUrl}/signup`;
  const ctaLabel = hasAccount ? "Đăng nhập" : "Tạo tài khoản";

  return (
    <Html>
      <Head />
      <Preview>{`${orgName} mời bạn tham gia Wordly`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={logoEmoji}>🌈</Text>
            <Heading style={logoText}>Wordly</Heading>
          </Section>

          <Section style={card}>
            <Heading as="h2" style={title}>
              {orgName} mời bạn tham gia
            </Heading>

            <Text style={paragraph}>
              {inviterName ? `${inviterName} đã thêm bạn` : "Bạn đã được thêm"} vào{" "}
              <strong>{orgName}</strong> trên Wordly với vai trò{" "}
              <strong>{roleLabel}</strong>.
            </Text>

            <Text style={paragraph}>
              Wordly giúp bạn học từ vựng tiếng Anh mỗi ngày — tra từ, lưu lại,
              rồi nhận nhắc ôn qua email đúng lúc sắp quên.
            </Text>

            <Section style={{ textAlign: "center", margin: "24px 0" }}>
              <Button href={ctaUrl} style={button}>
                {ctaLabel}
              </Button>
            </Section>

            {hasAccount && (
              <Text style={note}>
                Bạn đã có tài khoản Wordly. Hãy <strong>đăng xuất rồi đăng nhập
                lại</strong> để thấy trung tâm trong danh sách.
              </Text>
            )}

            {joinCode && (
              <>
                <Hr style={hr} />
                <Text style={codeLabel}>Hoặc nhập mã lớp trong app:</Text>
                <Text style={codeBox}>{joinCode}</Text>
              </>
            )}
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              Nếu bạn không mong đợi email này, có thể bỏ qua nó.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: "#f7f7f7", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" };
const container = { margin: "0 auto", padding: "24px 12px", maxWidth: "520px" };
const header = { textAlign: "center", paddingBottom: "16px" };
const logoEmoji = { fontSize: "28px", margin: "0" };
const logoText = { fontSize: "22px", fontWeight: "800", color: "#58CC02", margin: "4px 0 0" };
const card = { backgroundColor: "#ffffff", borderRadius: "16px", padding: "24px", border: "1px solid #e5e5e5" };
const title = { fontSize: "18px", fontWeight: "800", color: "#3c3c3c", margin: "0 0 12px", textAlign: "center" };
const paragraph = { fontSize: "14px", color: "#3c3c3c", lineHeight: "1.6", margin: "0 0 12px" };
const button = {
  backgroundColor: "#58CC02",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "700",
  padding: "12px 28px",
  borderRadius: "12px",
  textDecoration: "none",
  display: "inline-block",
};
const note = { fontSize: "12px", color: "#777777", lineHeight: "1.5", margin: "0" };
const hr = { borderColor: "#e5e5e5", margin: "16px 0" };
const codeLabel = { fontSize: "12px", color: "#777777", margin: "0 0 6px", textAlign: "center" };
const codeBox = {
  fontSize: "24px",
  fontWeight: "800",
  letterSpacing: "4px",
  color: "#58A700",
  textAlign: "center",
  margin: "0",
  fontFamily: "monospace",
};
const footer = { textAlign: "center", padding: "16px 0 0" };
const footerText = { fontSize: "11px", color: "#afafaf", margin: "0" };
