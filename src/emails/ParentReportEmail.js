import {
  Body, Container, Head, Heading, Html, Preview,
  Section, Text, Hr, Row, Column,
} from "@react-email/components";

// Báo cáo tiến độ gửi phụ huynh (GĐ3).
//
// Nguyên tắc nội dung: chỉ SỐ LIỆU tiến độ, KHÔNG có nội dung học tập cá
// nhân của học viên (ghi chú, câu chat với Alex). Cùng nguyên tắc quyền
// riêng tư như dashboard giáo viên.
//
// Màu sắc dùng đúng tông thương hiệu Wordly (#58CC02) như DailyWordEmail.

export default function ParentReportEmail({
  studentName = "Học viên",
  className = "",
  orgName = "Trung tâm",
  periodLabel = "7 ngày qua",
  stats = {
    words_saved: 0,
    streak_days: 0,
    active_days: 0,
    quiz_attempts: 0,
    quiz_avg_percent: null,
    homework_submitted: 0,
    homework_total: 0,
  },
  state = "active",
  appUrl = "https://wordly.app",
}) {
  const stateInfo = {
    active: { label: "Đang học đều", color: "#58A700", emoji: "🟢" },
    stalled: { label: "Có dấu hiệu chững lại", color: "#A87B00", emoji: "🟡" },
    dropped: { label: "Đã lâu không học", color: "#FF4B4B", emoji: "🔴" },
  }[state] || { label: "", color: "#777777", emoji: "" };

  return (
    <Html>
      <Head />
      <Preview>
        {`${studentName}: ${stats.words_saved} từ mới, ${stats.active_days} ngày học trong ${periodLabel}`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={logoEmoji}>🌈</Text>
            <Heading style={logoText}>Wordly</Heading>
            <Text style={tagline}>{orgName}</Text>
          </Section>

          <Section style={card}>
            <Heading as="h2" style={title}>
              Báo cáo học tập
            </Heading>
            <Text style={subtitle}>
              {studentName}
              {className ? ` · ${className}` : ""}
            </Text>
            <Text style={period}>{periodLabel}</Text>

            <Section style={{ ...statusBox, borderColor: stateInfo.color }}>
              <Text style={{ ...statusText, color: stateInfo.color }}>
                {stateInfo.emoji} {stateInfo.label}
              </Text>
            </Section>

            <Hr style={hr} />

            <Row>
              <Column style={statCell}>
                <Text style={statNumber}>{stats.words_saved}</Text>
                <Text style={statLabel}>Từ đã lưu</Text>
              </Column>
              <Column style={statCell}>
                <Text style={statNumber}>{stats.active_days}</Text>
                <Text style={statLabel}>Ngày có học</Text>
              </Column>
              <Column style={statCell}>
                <Text style={statNumber}>{stats.streak_days}</Text>
                <Text style={statLabel}>Chuỗi ngày</Text>
              </Column>
            </Row>

            {(stats.quiz_attempts > 0 || stats.homework_total > 0) && (
              <>
                <Hr style={hr} />
                <Row>
                  {stats.quiz_attempts > 0 && (
                    <Column style={statCell}>
                      <Text style={statNumber}>
                        {stats.quiz_avg_percent !== null ? `${stats.quiz_avg_percent}%` : "—"}
                      </Text>
                      <Text style={statLabel}>
                        Điểm quiz TB ({stats.quiz_attempts} lượt)
                      </Text>
                    </Column>
                  )}
                  {stats.homework_total > 0 && (
                    <Column style={statCell}>
                      <Text style={statNumber}>
                        {stats.homework_submitted}/{stats.homework_total}
                      </Text>
                      <Text style={statLabel}>Bài tập đã nộp</Text>
                    </Column>
                  )}
                </Row>
              </>
            )}

            <Hr style={hr} />

            <Text style={note}>
              Báo cáo này chỉ hiển thị số liệu tiến độ. Nội dung ghi chú và bài
              luyện nói của học viên là riêng tư và không được chia sẻ.
            </Text>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              Gửi từ {orgName} qua Wordly · {appUrl}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ── Styles (inline vì email client không hỗ trợ CSS ngoài) ──
const main = { backgroundColor: "#f7f7f7", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" };
const container = { margin: "0 auto", padding: "24px 12px", maxWidth: "520px" };
const header = { textAlign: "center", paddingBottom: "16px" };
const logoEmoji = { fontSize: "28px", margin: "0" };
const logoText = { fontSize: "22px", fontWeight: "800", color: "#58CC02", margin: "4px 0 0" };
const tagline = { fontSize: "12px", color: "#777777", margin: "2px 0 0" };
const card = { backgroundColor: "#ffffff", borderRadius: "16px", padding: "24px", border: "1px solid #e5e5e5" };
const title = { fontSize: "18px", fontWeight: "800", color: "#3c3c3c", margin: "0 0 4px", textAlign: "center" };
const subtitle = { fontSize: "14px", fontWeight: "600", color: "#3c3c3c", margin: "0", textAlign: "center" };
const period = { fontSize: "12px", color: "#777777", margin: "2px 0 16px", textAlign: "center" };
const statusBox = { border: "1px solid", borderRadius: "12px", padding: "8px 12px", textAlign: "center", margin: "0 0 8px" };
const statusText = { fontSize: "13px", fontWeight: "700", margin: "0" };
const hr = { borderColor: "#e5e5e5", margin: "16px 0" };
const statCell = { textAlign: "center", padding: "0 4px" };
const statNumber = { fontSize: "24px", fontWeight: "800", color: "#58CC02", margin: "0" };
const statLabel = { fontSize: "11px", color: "#777777", margin: "2px 0 0" };
const note = { fontSize: "11px", color: "#afafaf", margin: "0", lineHeight: "1.5" };
const footer = { textAlign: "center", padding: "16px 0 0" };
const footerText = { fontSize: "11px", color: "#afafaf", margin: "0" };
