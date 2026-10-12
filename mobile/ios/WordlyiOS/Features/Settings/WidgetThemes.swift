import Foundation

/// Bộ phối màu nền + chữ cho widget màn hình chính. Lấy từ bảng màu miễn phí
/// (Tailwind CSS, Nord, Dracula, Catppuccin, Gruvbox, Solarized, Tokyo Night,
/// Rosé Pine — đều MIT). Mọi theme đạt WCAG AA (≥ 4.5:1) cho cả từ và nghĩa trên
/// cả 2 đầu nền — có test (WidgetThemeTests).
struct WidgetTheme: Identifiable, Equatable {
    let id: String
    let name: String
    let bg1: String
    /// nil = nền một màu
    let bg2: String?
    let word: String
    let meaning: String

    static let all: [WidgetTheme] = [
        WidgetTheme(id: "wordly", name: "Wordly", bg1: "#0B6FA4", bg2: "#2E7D0B", word: "#FFFFFF", meaning: "#E8F7FF"),
        WidgetTheme(id: "ocean", name: "Đại dương", bg1: "#0E3A5C", bg2: "#0E7490", word: "#FFFFFF", meaning: "#CFFAFE"),
        WidgetTheme(id: "midnight", name: "Nửa đêm", bg1: "#0F172A", bg2: nil, word: "#F8FAFC", meaning: "#94A3B8"),
        WidgetTheme(id: "forest", name: "Rừng thông", bg1: "#14532D", bg2: "#166534", word: "#F0FDF4", meaning: "#BBF7D0"),
        WidgetTheme(id: "sunset", name: "Hoàng hôn", bg1: "#9A3412", bg2: "#BE185D", word: "#FFFFFF", meaning: "#FFE4E6"),
        WidgetTheme(id: "berry", name: "Quả mọng", bg1: "#581C87", bg2: "#9D174D", word: "#FFFFFF", meaning: "#F5D0FE"),
        WidgetTheme(id: "espresso", name: "Cà phê", bg1: "#3E2723", bg2: "#5D4037", word: "#FFF8E1", meaning: "#FFCC80"),
        WidgetTheme(id: "ink", name: "Mực đen", bg1: "#000000", bg2: nil, word: "#FFFFFF", meaning: "#D4D4D4"),
        WidgetTheme(id: "graphite", name: "Than chì", bg1: "#27272A", bg2: "#3F3F46", word: "#FAFAFA", meaning: "#D4D4D8"),
        WidgetTheme(id: "nord", name: "Nord", bg1: "#2E3440", bg2: "#3B4252", word: "#ECEFF4", meaning: "#88C0D0"),
        WidgetTheme(id: "dracula", name: "Dracula", bg1: "#282A36", bg2: nil, word: "#F8F8F2", meaning: "#BD93F9"),
        WidgetTheme(id: "catppuccin", name: "Catppuccin", bg1: "#1E1E2E", bg2: "#313244", word: "#CDD6F4", meaning: "#F5C2E7"),
        WidgetTheme(id: "gruvbox", name: "Gruvbox", bg1: "#282828", bg2: nil, word: "#FBF1C7", meaning: "#FABD2F"),
        WidgetTheme(id: "solarized", name: "Solarized", bg1: "#002B36", bg2: "#073642", word: "#FDF6E3", meaning: "#93A1A1"),
        WidgetTheme(id: "tokyo", name: "Tokyo Night", bg1: "#1A1B26", bg2: "#24283B", word: "#C0CAF5", meaning: "#7DCFFF"),
        WidgetTheme(id: "rosepine", name: "Rosé Pine", bg1: "#191724", bg2: "#26233A", word: "#E0DEF4", meaning: "#EBBCBA"),
        WidgetTheme(id: "paper", name: "Giấy trắng", bg1: "#FFFFFF", bg2: nil, word: "#111827", meaning: "#4B5563"),
        WidgetTheme(id: "sky", name: "Bầu trời", bg1: "#E0F2FE", bg2: "#DBEAFE", word: "#075985", meaning: "#1E3A8A"),
        WidgetTheme(id: "mint", name: "Bạc hà", bg1: "#D1FAE5", bg2: nil, word: "#065F46", meaning: "#064E3B"),
        WidgetTheme(id: "matcha", name: "Matcha", bg1: "#ECFCCB", bg2: nil, word: "#3F6212", meaning: "#365314"),
        WidgetTheme(id: "lemon", name: "Chanh", bg1: "#FEF9C3", bg2: nil, word: "#854D0E", meaning: "#422006"),
        WidgetTheme(id: "peach", name: "Đào", bg1: "#FFEDD5", bg2: "#FED7AA", word: "#9A3412", meaning: "#7C2D12"),
        WidgetTheme(id: "coral", name: "San hô", bg1: "#FFE4E6", bg2: nil, word: "#9F1239", meaning: "#4C0519"),
        WidgetTheme(id: "lavender", name: "Oải hương", bg1: "#EDE9FE", bg2: "#FCE7F3", word: "#5B21B6", meaning: "#4C1D95"),
        WidgetTheme(id: "latte", name: "Latte", bg1: "#EFF1F5", bg2: nil, word: "#8839EF", meaning: "#4C4F69"),
        WidgetTheme(id: "solarlight", name: "Solarized sáng", bg1: "#FDF6E3", bg2: nil, word: "#073642", meaning: "#586E75"),
    ]

    /// Bảng ô màu (Tailwind CSS) — thay ColorPicker hệ thống: chỉ chạm chọn.
    static let swatches: [String] = [
        "#FFFFFF", "#F1F5F9", "#94A3B8", "#334155", "#0F172A", "#000000",
        "#EF4444", "#991B1B", "#F97316", "#FBBF24", "#FEF08A", "#84CC16",
        "#16A34A", "#14532D", "#6EE7B7", "#0D9488", "#22D3EE", "#0EA5E9",
        "#1D4ED8", "#312E81", "#8B5CF6", "#6B21A8", "#F472B6", "#BE123C",
    ]

    /// Tỉ lệ tương phản WCAG 2.x giữa 2 màu #RRGGBB (1…21).
    static func contrastRatio(_ a: String, _ b: String) -> Double {
        let la = luminance(a), lb = luminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    private static func luminance(_ hex: String) -> Double {
        let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let v = UInt32(h.suffix(6), radix: 16) ?? 0
        func ch(_ shift: UInt32) -> Double {
            let c = Double((v >> shift) & 0xFF) / 255
            return c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * ch(16) + 0.7152 * ch(8) + 0.0722 * ch(0)
    }
}

extension WidgetSettings.HomeStyle {
    /// Đổi màu nền + chữ theo theme; giữ độ đậm/nghiêng và ảnh nền.
    mutating func apply(_ theme: WidgetTheme) {
        bgHex1 = theme.bg1
        bgHex2 = theme.bg2 ?? theme.bg1
        useGradient = theme.bg2 != nil
        wordColorHex = theme.word
        meaningColorHex = theme.meaning
    }

    func matches(_ theme: WidgetTheme) -> Bool {
        bgHex1 == theme.bg1 && useGradient == (theme.bg2 != nil) && (theme.bg2 == nil || bgHex2 == theme.bg2)
            && wordColorHex == theme.word && meaningColorHex == theme.meaning
    }
}
