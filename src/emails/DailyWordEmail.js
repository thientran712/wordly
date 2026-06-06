import {
  Body, Container, Head, Heading, Html, Preview,
  Section, Text, Button, Hr
} from "@react-email/components";

const CONTEXT_ICONS = { love: "💕", life: "🌿", work: "💼" };
const CONTEXT_LABELS = { love: "Tình yêu", life: "Cuộc sống", work: "Công việc" };

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

  const firstMeaning = meanings[0] || null;
  const fallbackDefinitionEn = word.def_en || "";
  const fallbackPhonetic = word.phonetic && !word.phonetic.endsWith(".mp3") ? word.phonetic : "";

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
            <Text style={subtitle}>Từ vựng hôm nay đang chờ mày!</Text>
          </Section>

          {/* Word card */}
          <Section style={wordCard}>
            <Text style={newBadge}>
              {source === "journal" ? "📓 Từ bạn đã note" : source === "translate_history" ? "🔁 Từ bạn đã dịch" : "✨ Từ mới hôm nay"}
            </Text>
            <Heading style={wordMain}>{word.word}</Heading>

            <Section style={badgeRow}>
              {word.level && <Text style={levelBadge}>{word.level}</Text>}
              {word.pos && <Text style={posBadge}>{word.pos}</Text>}
              {(firstMeaning?.phonetic_ipa || fallbackPhonetic) && (
                <Text style={phoneticText}>{firstMeaning?.phonetic_ipa || fallbackPhonetic}</Text>
              )}
            </Section>
          </Section>

          {/* User word: just show meaning_vi */}
          {isUserWord && word.meaning_vi && (
            <Section style={meaningBlock}>
              <Text style={defVi}>🇻🇳 {word.meaning_vi}</Text>
            </Section>
          )}

          {/* System word meanings from AI */}
          {!isUserWord && meanings.length > 0 ? (
            <>
              <Text style={sectionLabel}>📖 {meanings.length} NGHĨA PHỔ BIẾN</Text>
              {meanings.map((m, i) => (
                <Section key={i} style={meaningBlock}>
                  {/* POS + IPA */}
                  <Section style={meaningHeader}>
                    <Text style={meaningPos}>{m.pos}</Text>
                    {m.phonetic_ipa && <Text style={meaningIpa}>{m.phonetic_ipa}</Text>}
                  </Section>

                  {/* Definitions */}
                  <Text style={defEn}>{m.definition_en}</Text>
                  {m.definition_vi && (
                    <Text style={defVi}>🇻🇳 {m.definition_vi}</Text>
                  )}

                  {/* Memory hint */}
                  {m.memory_vi && (
                    <Section style={memoryBlock}>
                      <Text style={memoryLabel}>💡 Mẹo nhớ</Text>
                      <Text style={memoryText}>{m.memory_vi}</Text>
                    </Section>
                  )}

                  {/* Examples */}
                  {m.examples?.length > 0 && (
                    <Section style={examplesBlock}>
                      {m.examples.map((ex, j) => (
                        <Section key={j} style={exampleRow}>
                          <Text style={exampleContext}>
                            {CONTEXT_ICONS[ex.context] || "•"} {CONTEXT_LABELS[ex.context] || ex.context}
                          </Text>
                          <Text style={exampleSentence}>{ex.sentence}</Text>
                        </Section>
                      ))}
                    </Section>
                  )}
                </Section>
              ))}
            </>
          ) : fallbackDefinitionEn ? (
            <Section style={meaningBlock}>
              <Text style={defEn}>{fallbackDefinitionEn}</Text>
            </Section>
          ) : null}

          {/* Synonyms — system words only */}
          {!isUserWord && (
            <Section style={synonymsBlock}>
              <Text style={sectionLabel}>✨ TỪ ĐỒNG NGHĨA</Text>
              <Text style={synonymsText}>
                {synonyms.length > 0 ? synonyms.join(" · ") : "Không có từ đồng nghĩa"}
              </Text>
            </Section>
          )}

          {/* CTA */}
          <Section style={ctaSection}>
            <Button href={appUrl} style={ctaButton}>
              🚀 Mở Wordly để học đầy đủ
            </Button>
          </Section>

          <Hr style={divider} />

          <Section style={footer}>
            <Text style={footerText}>
              Bạn nhận email này vì đã đăng ký Wordly Daily.
            </Text>
            <Text style={footerCopy}>© 2026 Wordly · Made with 💖</Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: "#FFF8F0", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: "20px 0" };
const container = { backgroundColor: "#ffffff", borderRadius: "24px", margin: "0 auto", maxWidth: "600px", padding: "40px 32px", boxShadow: "0 8px 24px rgba(108,92,231,0.08)" };
const header = { textAlign: "center", marginBottom: "32px" };
const logoEmoji = { fontSize: "40px", margin: "0 0 4px 0" };
const logoText = { fontSize: "26px", fontWeight: "900", margin: "0", color: "#6C5CE7" };
const tagline = { fontSize: "12px", color: "#5D4B7B", margin: "4px 0 0 0", fontStyle: "italic" };
const greetingSection = { marginBottom: "20px" };
const greeting = { fontSize: "20px", fontWeight: "700", color: "#2D1B4E", margin: "0 0 4px 0" };
const subtitle = { fontSize: "14px", color: "#5D4B7B", margin: "0" };
const wordCard = { background: "linear-gradient(135deg,#F5F0FF,#FFF0F6)", borderRadius: "20px", padding: "28px 24px", textAlign: "center", marginBottom: "16px", border: "2px solid #E9D8FD" };
const newBadge = { fontSize: "10px", fontWeight: "700", letterSpacing: "0.15em", color: "#FF5C8A", margin: "0 0 10px 0", textTransform: "uppercase" };
const wordMain = { fontSize: "52px", fontWeight: "900", margin: "0 0 12px 0", color: "#6C5CE7", fontFamily: "Georgia, serif", lineHeight: "1.1" };
const badgeRow = { textAlign: "center" };
const levelBadge = { display: "inline-block", fontSize: "11px", fontWeight: "700", padding: "3px 10px", borderRadius: "100px", backgroundColor: "#F5F3FF", color: "#6C5CE7", border: "1.5px solid #C4B5FD", margin: "0 4px" };
const posBadge = { display: "inline-block", fontSize: "11px", fontWeight: "700", padding: "3px 10px", borderRadius: "100px", backgroundColor: "#ECFDF5", color: "#059669", border: "1.5px solid #A7F3D0", margin: "0 4px", textTransform: "uppercase" };
const phoneticText = { display: "inline-block", fontSize: "15px", color: "#5D4B7B", fontStyle: "italic", margin: "8px 0 0 0" };
const sectionLabel = { fontSize: "10px", fontWeight: "700", letterSpacing: "0.15em", color: "#FF5C8A", margin: "16px 0 8px 0", textTransform: "uppercase" };
const meaningBlock = { borderRadius: "16px", padding: "18px 20px", backgroundColor: "#FAFBFF", border: "1.5px solid #E9D8FD", marginBottom: "12px" };
const meaningHeader = { marginBottom: "6px" };
const meaningPos = { display: "inline-block", fontSize: "11px", fontWeight: "700", padding: "2px 10px", borderRadius: "100px", backgroundColor: "#ECFDF5", color: "#059669", border: "1.5px solid #A7F3D0", margin: "0 6px 0 0", textTransform: "uppercase" };
const meaningIpa = { display: "inline-block", fontSize: "14px", color: "#5D4B7B", fontStyle: "italic", margin: "0" };
const defEn = { fontSize: "15px", fontWeight: "600", color: "#2D1B4E", margin: "6px 0 4px 0", lineHeight: "1.5" };
const defVi = { fontSize: "13px", color: "#5D4B7B", margin: "0 0 10px 0", lineHeight: "1.5" };
const memoryBlock = { borderRadius: "12px", padding: "12px 16px", backgroundColor: "#FFFBEB", border: "1.5px solid #FDE68A", margin: "8px 0 10px 0" };
const memoryLabel = { fontSize: "10px", fontWeight: "700", letterSpacing: "0.12em", color: "#D97706", margin: "0 0 4px 0", textTransform: "uppercase" };
const memoryText = { fontSize: "13px", color: "#92400E", margin: "0", lineHeight: "1.6" };
const examplesBlock = { margin: "8px 0 0 0" };
const exampleRow = { borderLeft: "3px solid #E9D8FD", paddingLeft: "12px", marginBottom: "8px" };
const exampleContext = { fontSize: "10px", fontWeight: "700", color: "#FF5C8A", margin: "0 0 2px 0", textTransform: "uppercase", letterSpacing: "0.1em" };
const exampleSentence = { fontSize: "13px", color: "#4A3570", margin: "0", lineHeight: "1.5", fontStyle: "italic" };
const synonymsBlock = { borderRadius: "16px", padding: "14px 20px", backgroundColor: "#F0FDF4", border: "1.5px solid #A7F3D0", marginBottom: "20px" };
const synonymsText = { fontSize: "14px", fontWeight: "600", color: "#059669", margin: "4px 0 0 0" };
const ctaSection = { textAlign: "center", margin: "28px 0" };
const ctaButton = { background: "linear-gradient(135deg,#FF5C8A,#6C5CE7)", color: "#ffffff", fontSize: "15px", fontWeight: "700", textDecoration: "none", padding: "14px 32px", borderRadius: "100px", display: "inline-block" };
const divider = { border: "none", borderTop: "1px solid #E8DFF5", margin: "24px 0" };
const footer = { textAlign: "center" };
const footerText = { fontSize: "11px", color: "#5D4B7B", margin: "0 0 6px 0", lineHeight: "1.5" };
const footerCopy = { fontSize: "11px", color: "#B8A8D8", margin: "0" };
