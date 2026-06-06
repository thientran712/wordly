import {
  Body, Container, Head, Heading, Html, Preview,
  Section, Text, Button, Hr
} from "@react-email/components";

export default function DailyWordEmail({
  userName = "there",
  word = {},
  aiContent = null,
  source = "new",
  appUrl = "https://wordly.app"
}) {
  const isUserWord = source === "journal" || source === "translate_history";
  const previewText = isUserWord
    ? `🔁 Ôn lại: ${word.word || ""}`
    : `✨ Từ hôm nay: ${word.word || ""}`;

  const meanings = aiContent?.meanings || [];
  const synonyms = aiContent?.synonyms?.filter(Boolean) || [];
  const fallbackPhonetic = word.phonetic && !word.phonetic.endsWith(".mp3") ? word.phonetic : "";
  const phonetic = meanings[0]?.phonetic_ipa || fallbackPhonetic;

  const badgeLabel = source === "journal"
    ? "📓 Từ bạn đã note"
    : source === "translate_history"
    ? "🔁 Từ bạn đã dịch"
    : "✨ Từ mới hôm nay";

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>

          {/* Header */}
          <Section style={header}>
            <Text style={logoEmoji}>🌈</Text>
            <Heading style={logoText}>Wordly</Heading>
            <Text style={tagline}>Learn English every day</Text>
          </Section>

          {/* Greeting */}
          <Section style={greetingSection}>
            <Text style={greeting}>Hi <strong>{userName}</strong> 👋</Text>
            <Text style={subtitle}>Từ vựng hôm nay đang chờ bạn!</Text>
          </Section>

          {/* Word card */}
          <Section style={wordCard}>
            <Text style={badge}>{badgeLabel}</Text>
            <Heading style={wordMain}>{word.word}</Heading>
            {phonetic && <Text style={phoneticText}>/{phonetic}/</Text>}

            {/* Meaning */}
            {word.meaning_vi && (
              <Text style={meaningVi}>🇻🇳 {word.meaning_vi}</Text>
            )}

            {/* For system words with no meaning_vi but has AI content */}
            {!word.meaning_vi && meanings[0]?.definition_vi && (
              <Text style={meaningVi}>🇻🇳 {meanings[0].definition_vi}</Text>
            )}
          </Section>

          {/* Extra details for system words only */}
          {!isUserWord && meanings[0] && (
            <Section style={detailCard}>
              {meanings[0].definition_en && (
                <Text style={defEn}>{meanings[0].definition_en}</Text>
              )}
              {meanings[0].memory_vi && (
                <Text style={memoryText}>💡 {meanings[0].memory_vi}</Text>
              )}
              {synonyms.length > 0 && (
                <Text style={synonymsText}>🔗 {synonyms.join(" · ")}</Text>
              )}
            </Section>
          )}

          {/* CTA */}
          <Section style={ctaSection}>
            <Button href={appUrl} style={ctaButton}>
              🚀 Mở Wordly
            </Button>
          </Section>

          <Hr style={divider} />

          <Section style={footer}>
            <Text style={footerText}>Bạn nhận email này vì đã đăng ký Wordly Daily.</Text>
            <Text style={footerCopy}>© 2026 Wordly · Made with 💖</Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: "#F8FFF8", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: "20px 0" };
const container = { backgroundColor: "#ffffff", borderRadius: "24px", margin: "0 auto", maxWidth: "520px", padding: "36px 28px", boxShadow: "0 8px 32px rgba(34,197,94,0.08)" };
const header = { textAlign: "center", marginBottom: "24px" };
const logoEmoji = { fontSize: "36px", margin: "0 0 4px 0" };
const logoText = { fontSize: "24px", fontWeight: "900", margin: "0", color: "#16A34A" };
const tagline = { fontSize: "11px", color: "#6B7280", margin: "4px 0 0 0", fontStyle: "italic" };
const greetingSection = { marginBottom: "20px" };
const greeting = { fontSize: "18px", fontWeight: "700", color: "#111827", margin: "0 0 4px 0" };
const subtitle = { fontSize: "13px", color: "#6B7280", margin: "0" };
const wordCard = { background: "linear-gradient(135deg, #F0FDF4, #DCFCE7)", borderRadius: "20px", padding: "28px 24px", textAlign: "center", marginBottom: "16px", border: "2px solid #BBF7D0" };
const badge = { fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em", color: "#16A34A", margin: "0 0 12px 0", textTransform: "uppercase" };
const wordMain = { fontSize: "52px", fontWeight: "900", margin: "0 0 6px 0", color: "#15803D", fontFamily: "Georgia, serif", lineHeight: "1.1" };
const phoneticText = { fontSize: "15px", color: "#6B7280", fontStyle: "italic", margin: "0 0 16px 0" };
const meaningVi = { fontSize: "20px", fontWeight: "700", color: "#111827", margin: "12px 0 0 0", lineHeight: "1.4" };
const detailCard = { borderRadius: "14px", padding: "16px 20px", backgroundColor: "#F9FAFB", border: "1px solid #E5E7EB", marginBottom: "20px" };
const defEn = { fontSize: "14px", color: "#374151", margin: "0 0 8px 0", lineHeight: "1.6" };
const memoryText = { fontSize: "13px", color: "#D97706", margin: "0 0 8px 0", lineHeight: "1.5" };
const synonymsText = { fontSize: "13px", color: "#059669", margin: "0", fontWeight: "600" };
const ctaSection = { textAlign: "center", margin: "24px 0" };
const ctaButton = { background: "linear-gradient(135deg, #22C55E, #16A34A)", color: "#ffffff", fontSize: "15px", fontWeight: "700", textDecoration: "none", padding: "14px 36px", borderRadius: "100px", display: "inline-block" };
const divider = { border: "none", borderTop: "1px solid #E5E7EB", margin: "20px 0" };
const footer = { textAlign: "center" };
const footerText = { fontSize: "11px", color: "#9CA3AF", margin: "0 0 4px 0" };
const footerCopy = { fontSize: "11px", color: "#D1D5DB", margin: "0" };
