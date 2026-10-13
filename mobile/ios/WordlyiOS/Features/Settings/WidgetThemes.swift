import Foundation

/// Bộ phối màu nền + chữ cho widget màn hình chính. Lấy từ bảng màu miễn phí
/// (Tailwind CSS, Nord, Dracula, Catppuccin, Gruvbox, Solarized, Tokyo Night,
/// Rosé Pine — đều MIT). Mọi theme đạt WCAG AA (≥ 4.5:1) cho cả từ và nghĩa trên
/// cả 2 đầu nền — có test (WidgetThemeTests).
struct WidgetTheme: Identifiable, Equatable {
    enum Group: String, CaseIterable, Identifiable {
        case basic, nature, cartoon, code
        var id: String { rawValue }
        var title: String {
            switch self {
            case .basic: "Cơ bản"
            case .nature: "Thiên nhiên"
            case .cartoon: "Hoạt hình & siêu anh hùng"
            case .code: "Lập trình"
            }
        }
    }

    let id: String
    let name: String
    let group: Group
    let bg1: String
    /// nil = nền một màu
    let bg2: String?
    let word: String
    let meaning: String

    init(_ id: String, _ name: String, _ group: Group, _ bg1: String, _ bg2: String?, _ word: String, _ meaning: String) {
        (self.id, self.name, self.group, self.bg1, self.bg2, self.word, self.meaning) = (id, name, group, bg1, bg2, word, meaning)
    }

    static func themes(in group: Group) -> [WidgetTheme] { all.filter { $0.group == group } }

    /// Nhóm mở sẵn trong danh sách: nhóm của theme đang dùng, không khớp theme nào thì nhóm đầu.
    static func group(containing style: WidgetSettings.HomeStyle) -> Group {
        all.first { style.matches($0) }?.group ?? Group.allCases[0]
    }

    // Hoạt hình & siêu anh hùng: chỉ lấy cảm hứng bảng màu, đặt tên gợi tả —
    // KHÔNG dùng tên nhân vật/thương hiệu (App Store guideline 5.2, sở hữu trí tuệ).
    static let all: [WidgetTheme] = [
        WidgetTheme("wordly", "Wordly", .basic, "#0B6FA4", "#2E7D0B", "#FFFFFF", "#E8F7FF"),
        WidgetTheme("midnight", "Nửa đêm", .basic, "#0F172A", nil, "#F8FAFC", "#94A3B8"),
        WidgetTheme("ink", "Mực đen", .basic, "#000000", nil, "#FFFFFF", "#D4D4D4"),
        WidgetTheme("graphite", "Than chì", .basic, "#27272A", "#3F3F46", "#FAFAFA", "#D4D4D8"),
        WidgetTheme("paper", "Giấy trắng", .basic, "#FFFFFF", nil, "#111827", "#4B5563"),
        WidgetTheme("espresso", "Cà phê", .basic, "#3E2723", "#5D4037", "#FFF8E1", "#FFCC80"),

        WidgetTheme("ocean", "Đại dương", .nature, "#0E3A5C", "#0E7490", "#FFFFFF", "#CFFAFE"),
        WidgetTheme("forest", "Rừng thông", .nature, "#14532D", "#166534", "#F0FDF4", "#BBF7D0"),
        WidgetTheme("sunset", "Hoàng hôn", .nature, "#9A3412", "#BE185D", "#FFFFFF", "#FFE4E6"),
        WidgetTheme("berry", "Quả mọng", .nature, "#581C87", "#9D174D", "#FFFFFF", "#F5D0FE"),
        WidgetTheme("sky", "Bầu trời", .nature, "#E0F2FE", "#DBEAFE", "#075985", "#1E3A8A"),
        WidgetTheme("mint", "Bạc hà", .nature, "#D1FAE5", nil, "#065F46", "#064E3B"),
        WidgetTheme("matcha", "Matcha", .nature, "#ECFCCB", nil, "#3F6212", "#365314"),
        WidgetTheme("lemon", "Chanh", .nature, "#FEF9C3", nil, "#854D0E", "#422006"),
        WidgetTheme("peach", "Đào", .nature, "#FFEDD5", "#FED7AA", "#9A3412", "#7C2D12"),
        WidgetTheme("coral", "San hô", .nature, "#FFE4E6", nil, "#9F1239", "#4C0519"),
        WidgetTheme("lavender", "Oải hương", .nature, "#EDE9FE", "#FCE7F3", "#5B21B6", "#4C1D95"),

        WidgetTheme("spider", "Nhện đỏ", .cartoon, "#B91C1C", "#1E3A8A", "#FFFFFF", "#FEE2E2"),
        WidgetTheme("darkknight", "Hiệp sĩ bóng đêm", .cartoon, "#0B0B0F", "#1F2937", "#FACC15", "#E5E7EB"),
        WidgetTheme("superhero", "Siêu nhân áo choàng", .cartoon, "#1D4ED8", "#991B1B", "#FDE047", "#FFFFFF"),
        WidgetTheme("ironarmor", "Giáp sắt", .cartoon, "#7F1D1D", "#78350F", "#FDE68A", "#FFFFFF"),
        WidgetTheme("greengiant", "Khổng lồ xanh", .cartoon, "#14532D", "#4C1D95", "#BBF7D0", "#F3E8FF"),
        WidgetTheme("shieldcaptain", "Đội trưởng khiên sao", .cartoon, "#1E3A8A", "#991B1B", "#FFFFFF", "#E0E7FF"),
        WidgetTheme("thunder", "Thần sấm", .cartoon, "#1E293B", "#334155", "#FDE047", "#CBD5E1"),
        WidgetTheme("amazon", "Nữ chiến binh", .cartoon, "#7F1D1D", "#1E3A8A", "#FCD34D", "#FFFFFF"),
        WidgetTheme("panther", "Báo đen", .cartoon, "#0F0F14", "#2E1065", "#E9D5FF", "#C4B5FD"),
        WidgetTheme("electricmouse", "Chuột điện vàng", .cartoon, "#FDE047", nil, "#7C2D12", "#431407"),
        WidgetTheme("robotcat", "Mèo máy xanh", .cartoon, "#075985", "#0369A1", "#FFFFFF", "#FEE2E2"),
        WidgetTheme("spongeyellow", "Bọt biển vàng", .cartoon, "#FEF08A", "#FDE68A", "#78350F", "#422006"),
        WidgetTheme("icequeen", "Nữ hoàng băng giá", .cartoon, "#E0F2FE", "#BAE6FD", "#075985", "#0C4A6E"),
        WidgetTheme("ninjaturtle", "Rùa ninja", .cartoon, "#166534", "#14532D", "#FDE68A", "#DCFCE7"),
        WidgetTheme("strawhat", "Mũ rơm", .cartoon, "#991B1B", "#7C2D12", "#FDE047", "#FEF3C7"),
        WidgetTheme("leafninja", "Ninja lá", .cartoon, "#C2410C", "#1E3A8A", "#FFFFFF", "#FFEDD5"),
        WidgetTheme("dragonball", "Ngọc rồng", .cartoon, "#9A3412", "#1E40AF", "#FDE047", "#FFFFFF"),
        WidgetTheme("wizard", "Phù thủy nhỏ", .cartoon, "#7F1D1D", "#713F12", "#FCD34D", "#FEF3C7"),
        WidgetTheme("lightsaber", "Kiếm ánh sáng", .cartoon, "#020617", "#1E293B", "#7DD3FC", "#BAE6FD"),
        WidgetTheme("darkside", "Phe bóng tối", .cartoon, "#000000", "#450A0A", "#F87171", "#FECACA"),
        WidgetTheme("candy", "Kẹo bông hồng", .cartoon, "#FCE7F3", nil, "#BE185D", "#831843"),
        WidgetTheme("minion", "Lính vàng", .cartoon, "#FACC15", nil, "#1E3A8A", "#111827"),
        WidgetTheme("cowboy", "Chàng cao bồi", .cartoon, "#1E40AF", "#92400E", "#FDE047", "#FFFFFF"),
        WidgetTheme("mermaid", "Nàng tiên cá", .cartoon, "#0F766E", "#6D28D9", "#FFFFFF", "#CCFBF1"),
        WidgetTheme("ghost", "Bóng ma xanh", .cartoon, "#022C22", "#14532D", "#86EFAC", "#DCFCE7"),

        WidgetTheme("nord", "Nord", .code, "#2E3440", "#3B4252", "#ECEFF4", "#88C0D0"),
        WidgetTheme("dracula", "Dracula", .code, "#282A36", nil, "#F8F8F2", "#BD93F9"),
        WidgetTheme("catppuccin", "Catppuccin", .code, "#1E1E2E", "#313244", "#CDD6F4", "#F5C2E7"),
        WidgetTheme("latte", "Latte", .code, "#EFF1F5", nil, "#8839EF", "#4C4F69"),
        WidgetTheme("gruvbox", "Gruvbox", .code, "#282828", nil, "#FBF1C7", "#FABD2F"),
        WidgetTheme("solarized", "Solarized", .code, "#002B36", "#073642", "#FDF6E3", "#93A1A1"),
        WidgetTheme("solarlight", "Solarized sáng", .code, "#FDF6E3", nil, "#073642", "#586E75"),
        WidgetTheme("tokyo", "Tokyo Night", .code, "#1A1B26", "#24283B", "#C0CAF5", "#7DCFFF"),
        WidgetTheme("rosepine", "Rosé Pine", .code, "#191724", "#26233A", "#E0DEF4", "#EBBCBA"),
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
