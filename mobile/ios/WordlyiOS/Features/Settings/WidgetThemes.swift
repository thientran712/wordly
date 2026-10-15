import Foundation

/// Theme widget màn hình chính: 10 theme màu cơ bản (bảng màu Tailwind CSS, Nord…
/// — MIT; đạt WCAG AA ≥ 4.5:1 cho từ và nghĩa, có test) và theme ẢNH: ảnh
/// Unsplash kèm app (Resources/WidgetPhotos, nguồn + giấy phép từng ảnh ở
/// docs/design/widget-photo-credits.md). Ảnh người dùng tự chọn đè lên ảnh theme.
struct WidgetTheme: Identifiable, Equatable {
    enum Group: String, CaseIterable, Identifiable {
        case color, study, nature, citynight, hero, space, luxury
        var id: String { rawValue }
        var title: String {
            switch self {
            case .color: "Màu cơ bản"
            case .study: "Góc học tập"
            case .nature: "Thiên nhiên"
            case .citynight: "Thành phố đêm"
            case .hero: "Hào hùng"
            case .space: "Vũ trụ"
            case .luxury: "Sang trọng"
            }
        }
        var isPhoto: Bool { self != .color }
    }

    let id: String
    let name: String
    let group: Group
    let bg1: String
    /// nil = nền một màu
    let bg2: String?
    let word: String
    let meaning: String
    /// Tên ảnh trong bundle (không đuôi) — nil = theme màu
    let photo: String?
    /// Độ tối phủ lên ảnh theme để chữ trắng đọc được
    let dim: Double

    init(_ id: String, _ name: String, _ group: Group, _ bg1: String, _ bg2: String?, _ word: String, _ meaning: String) {
        (self.id, self.name, self.group, self.bg1, self.bg2, self.word, self.meaning) = (id, name, group, bg1, bg2, word, meaning)
        photo = nil
        dim = WidgetSettings.HomeStyle().backgroundDim
    }

    /// Theme ảnh: chữ trắng / xám rất nhạt trên ảnh đã làm tối; nền màu dự phòng tối.
    private init(photo id: String, _ name: String, _ group: Group, dim: Double) {
        (self.id, self.name, self.group) = (id, name, group)
        (bg1, bg2, word, meaning) = ("#111827", nil, "#FFFFFF", "#E5E7EB")
        photo = "widget-photo-\(id)"
        self.dim = dim
    }

    static func themes(in group: Group) -> [WidgetTheme] { all.filter { $0.group == group } }

    /// Nhóm mở sẵn trong danh sách: nhóm của theme đang dùng, không khớp theme nào thì nhóm đầu.
    static func group(containing style: WidgetSettings.HomeStyle) -> Group {
        all.first { style.matches($0) }?.group ?? Group.allCases[0]
    }

    // Tên chỉ tả cảnh/màu — KHÔNG gợi tên phim/nhân vật/thương hiệu (App Store 5.2, có test).
    static let all: [WidgetTheme] = [
        WidgetTheme("wordly", "Wordly", .color, "#0B6FA4", "#2E7D0B", "#FFFFFF", "#E8F7FF"),
        WidgetTheme("midnight", "Nửa đêm", .color, "#0F172A", nil, "#F8FAFC", "#94A3B8"),
        WidgetTheme("ink", "Mực đen", .color, "#000000", nil, "#FFFFFF", "#D4D4D4"),
        WidgetTheme("graphite", "Than chì", .color, "#27272A", "#3F3F46", "#FAFAFA", "#D4D4D8"),
        WidgetTheme("paper", "Giấy trắng", .color, "#FFFFFF", nil, "#111827", "#4B5563"),
        WidgetTheme("espresso", "Cà phê", .color, "#3E2723", "#5D4037", "#FFF8E1", "#FFCC80"),
        WidgetTheme("ocean", "Đại dương", .color, "#0E3A5C", "#0E7490", "#FFFFFF", "#CFFAFE"),
        WidgetTheme("forest", "Rừng thông", .color, "#14532D", "#166534", "#F0FDF4", "#BBF7D0"),
        WidgetTheme("sunset", "Hoàng hôn", .color, "#9A3412", "#BE185D", "#FFFFFF", "#FFE4E6"),
        WidgetTheme("lavender", "Oải hương", .color, "#EDE9FE", "#FCE7F3", "#5B21B6", "#4C1D95"),

        WidgetTheme(photo: "study-dark", "Phòng tối lặng", .study, dim: 0.3),
        WidgetTheme(photo: "study-plants", "Bàn cây xanh", .study, dim: 0.45),
        WidgetTheme(photo: "study-garden", "Cửa sổ vườn", .study, dim: 0.45),
        WidgetTheme(photo: "study-lamp", "Góc đèn bàn", .study, dim: 0.45),
        WidgetTheme(photo: "study-bright", "Bàn sáng mai", .study, dim: 0.55),

        WidgetTheme(photo: "nature-pine", "Rừng sương", .nature, dim: 0.35),
        WidgetTheme(photo: "nature-leaves", "Lá đọng mưa", .nature, dim: 0.45),
        WidgetTheme(photo: "nature-field", "Đồng hoa nắng", .nature, dim: 0.4),
        WidgetTheme(photo: "nature-lake", "Hồ mây", .nature, dim: 0.45),
        WidgetTheme(photo: "nature-flowers", "Sườn núi hoa tím", .nature, dim: 0.45),

        WidgetTheme(photo: "city-bridge", "Cầu mưa đêm", .citynight, dim: 0.4),
        WidgetTheme(photo: "city-lake", "Phố bên hồ", .citynight, dim: 0.35),
        WidgetTheme(photo: "city-bokeh", "Ánh đèn nhoè", .citynight, dim: 0.35),
        WidgetTheme(photo: "city-blue", "Đốm sáng xanh", .citynight, dim: 0.3),
        WidgetTheme(photo: "city-rain", "Giọt mưa phố", .citynight, dim: 0.45),

        WidgetTheme(photo: "hero-storm", "Sấm sét", .hero, dim: 0.35),
        WidgetTheme(photo: "hero-bolt", "Tia chớp", .hero, dim: 0.3),
        WidgetTheme(photo: "hero-towers", "Tháp cao", .hero, dim: 0.45),
        WidgetTheme(photo: "hero-sunset", "Mặt trời rực", .hero, dim: 0.3),
        WidgetTheme(photo: "hero-dust", "Bão cam", .hero, dim: 0.5),

        WidgetTheme(photo: "space-milkyway", "Dải Ngân Hà", .space, dim: 0.35),
        WidgetTheme(photo: "space-stars", "Trời sao", .space, dim: 0.35),
        WidgetTheme(photo: "space-galaxy", "Thiên hà xoắn", .space, dim: 0.3),
        WidgetTheme(photo: "space-nebula", "Tinh vân đỏ", .space, dim: 0.3),
        WidgetTheme(photo: "space-earth", "Địa cầu", .space, dim: 0.3),

        WidgetTheme(photo: "lux-sunsetvilla", "Biệt thự hoàng hôn", .luxury, dim: 0.4),
        WidgetTheme(photo: "lux-nightvilla", "Biệt thự đêm", .luxury, dim: 0.4),
        WidgetTheme(photo: "lux-living", "Phòng khách sang", .luxury, dim: 0.55),
        WidgetTheme(photo: "lux-trails", "Vệt đèn cao tốc", .luxury, dim: 0.3),
        WidgetTheme(photo: "lux-terrace", "Sân thượng hoàng hôn", .luxury, dim: 0.55),
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
    /// Đổi màu nền + chữ theo theme; giữ độ đậm/nghiêng và ảnh người dùng chọn.
    /// Theme ảnh còn đặt `themePhotoId` + độ tối — file ảnh do WidgetThemePhoto ghi.
    mutating func apply(_ theme: WidgetTheme) {
        bgHex1 = theme.bg1
        bgHex2 = theme.bg2 ?? theme.bg1
        useGradient = theme.bg2 != nil
        wordColorHex = theme.word
        meaningColorHex = theme.meaning
        themePhotoId = theme.photo == nil ? nil : theme.id
        if theme.photo != nil { backgroundDim = theme.dim }
    }

    func matches(_ theme: WidgetTheme) -> Bool {
        let photoMatches = theme.photo == nil ? themePhotoId == nil : themePhotoId == theme.id
        return photoMatches && bgHex1 == theme.bg1 && useGradient == (theme.bg2 != nil)
            && (theme.bg2 == nil || bgHex2 == theme.bg2)
            && wordColorHex == theme.word && meaningColorHex == theme.meaning
    }
}
