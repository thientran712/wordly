import {
  Body, Container, Head, Heading, Html, Preview,
  Section, Text, Button, Hr
} from "@react-email/components";

export default function DailyWordEmail({ 
  userName = "there",
  word = {},
  streak = 0,
  appUrl = "https://wordly.app"
}) {
  const previewText = `🌈 Word of the day: ${word.word || ""}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={logoEmoji}>🌈</Text>
            <Heading style={logoText}>Wordly</Heading>
            <Text style={tagline}>Learn English every day</Text>
          </Section>

          <Section style={greetingSection}>
            <Text style={greeting}>
              Hi <strong>{userName}</strong> 👋
            </Text>
            <Text style={subtitle}>
              Day {streak + 1} of your journey. Ready for a new word?
            </Text>
          </Section>

          <Section style={wordCard}>
            <Text style={dayBadge}>✨ Word of the Day</Text>
            <Heading style={wordMain}>{word.word}</Heading>
            {word.phonetic && !word.phonetic.endsWith('.mp3') && (
              <Text style={phonetic}>{word.phonetic}</Text>
            )}
            <Text style={posPill}>{word.pos}</Text>
          </Section>

          <Section style={definitionBlock}>
            <Text style={blockLabel}>📖 DEFINITION</Text>
            <Text style={definitionEn}>{word.def_en}</Text>
          </Section>

          {word.ex_en && (
            <Section style={exampleBlock}>
              <Text style={blockLabel}>💬 EXAMPLE</Text>
              <Text style={exampleEn}>"{word.ex_en}"</Text>
            </Section>
          )}

          {word.synonyms && word.synonyms.length > 0 && (
            <Section style={synonymsBlock}>
              <Text style={blockLabel}>✨ SYNONYMS</Text>
              <Text style={synonymsText}>
                {word.synonyms.join(" · ")}
              </Text>
            </Section>
          )}

          <Section style={ctaSection}>
            <Button href={appUrl} style={ctaButton}>
              🚀 Learn more on Wordly
            </Button>
          </Section>

          <Hr style={divider} />

          <Section style={statsSection}>
            <Text style={statsText}>
              🔥 <strong>{streak} days</strong> streak · You're doing great!
            </Text>
          </Section>

          <Hr style={divider} />

          <Section style={footer}>
            <Text style={footerText}>
              You received this because you subscribed to Wordly Daily Vocabulary.
            </Text>
            <Text style={footerCopy}>
              © 2026 Wordly · Made with 💖
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: "#FFF8F0", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: "20px 0" };
const container = { backgroundColor: "#ffffff", borderRadius: "24px", margin: "0 auto", maxWidth: "600px", padding: "40px 32px", boxShadow: "0 8px 24px rgba(108, 92, 231, 0.08)" };
const header = { textAlign: "center", marginBottom: "32px" };
const logoEmoji = { fontSize: "48px", margin: "0 0 8px 0" };
const logoText = { fontSize: "28px", fontWeight: "900", margin: "0", color: "#6C5CE7" };
const tagline = { fontSize: "13px", color: "#5D4B7B", margin: "4px 0 0 0", fontStyle: "italic" };
const greetingSection = { marginBottom: "24px" };
const greeting = { fontSize: "22px", fontWeight: "700", color: "#2D1B4E", margin: "0 0 4px 0" };
const subtitle = { fontSize: "15px", color: "#5D4B7B", margin: "0", lineHeight: "1.5" };
const wordCard = { backgroundColor: "#FFF1F8", borderRadius: "20px", padding: "32px 24px", textAlign: "center", marginBottom: "20px", border: "2px solid #FFD0E2" };
const dayBadge = { fontSize: "11px", fontWeight: "700", letterSpacing: "0.15em", color: "#FF5C8A", margin: "0 0 12px 0", textTransform: "uppercase" };
const wordMain = { fontSize: "48px", fontWeight: "900", margin: "0 0 8px 0", color: "#FF5C8A", fontFamily: "Georgia, serif", lineHeight: "1.1" };
const phonetic = { fontSize: "16px", color: "#5D4B7B", fontStyle: "italic", margin: "0 0 12px 0" };
const posPill = { display: "inline-block", fontSize: "11px", fontWeight: "700", padding: "4px 12px", borderRadius: "100px", backgroundColor: "#B8F3D2", color: "#00754C", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0" };
const definitionBlock = { padding: "20px", borderRadius: "16px", backgroundColor: "#FFF1F8", border: "2px solid #FFD0E2", marginBottom: "12px" };
const exampleBlock = { padding: "20px", borderRadius: "16px", backgroundColor: "#F0F9FF", border: "2px solid #C9E5FB", marginBottom: "12px" };
const synonymsBlock = { padding: "20px", borderRadius: "16px", backgroundColor: "#F0FFF4", border: "2px solid #B8E8C9", marginBottom: "20px" };
const blockLabel = { fontSize: "10px", fontWeight: "700", letterSpacing: "0.2em", margin: "0 0 8px 0", color: "#5D4B7B" };
const definitionEn = { fontSize: "16px", fontWeight: "600", color: "#2D1B4E", margin: "0", lineHeight: "1.5" };
const exampleEn = { fontSize: "16px", color: "#2D1B4E", fontStyle: "italic", margin: "0", lineHeight: "1.5" };
const synonymsText = { fontSize: "14px", fontWeight: "600", color: "#00C896", margin: "0" };
const ctaSection = { textAlign: "center", margin: "32px 0" };
const ctaButton = { background: "linear-gradient(135deg, #FF5C8A, #6C5CE7)", color: "#ffffff", fontSize: "15px", fontWeight: "700", textDecoration: "none", padding: "14px 32px", borderRadius: "100px", display: "inline-block" };
const divider = { border: "none", borderTop: "1px solid #E8DFF5", margin: "24px 0" };
const statsSection = { textAlign: "center" };
const statsText = { fontSize: "14px", color: "#8B5500", backgroundColor: "#FFE9A8", padding: "10px 20px", borderRadius: "100px", display: "inline-block", margin: "0" };
const footer = { textAlign: "center" };
const footerText = { fontSize: "11px", color: "#5D4B7B", margin: "0 0 8px 0", lineHeight: "1.5" };
const footerCopy = { fontSize: "11px", color: "#B8A8D8", margin: "0" };
