import SwiftUI
import UIKit

// MARK: - Colors
// Khớp web/src/app/globals.css (bảng màu kiểu Duolingo). Màu tự đổi theo chế độ
// sáng/tối của hệ thống — ThemeManager đặt preferredColorScheme cho cả app.
// Sửa màu ở web thì sửa ở đây, và cập nhật DesignSystemTests.
enum WordlyColors {
    // Brand — cùng màu ở cả hai chế độ
    static let electric        = Color(hex: "#58CC02")
    static let electricDark    = Color(hex: "#58A700")   // --electric-muted
    static let electricBorder  = Color(hex: "#58CC02").opacity(0.3)
    static let electricSubtle  = adaptive(light: Color(hex: "#58CC02").opacity(0.08), dark: Color(hex: "#58CC02").opacity(0.12))
    static let onElectric      = Color.white            // chữ trên nút xanh
    /// Màu nền phẳng của logo/app icon (Brand.xcassets/Logo, AppIcon) — một màu duy nhất
    static let logoGreen       = Color(hex: "#6BCA03")

    // Màu nhấn theo nhóm
    static let duoBlue   = Color(hex: "#1CB0F6")
    static let duoOrange = Color(hex: "#FF9600")
    static let duoPurple = Color(hex: "#CE82FF")
    static let duoYellow = Color(hex: "#FFC800")

    // Nền + chữ
    static let background      = adaptive(light: "#FFFFFF", dark: "#131F24")   // --cream
    static let surface         = adaptive(light: "#F7F7F7", dark: "#1A2930")
    static let surfaceElevated = adaptive(light: "#FFFFFF", dark: "#1F2E36")
    static let cardBG          = adaptive(light: "#FFFFFF", dark: "#1F2E36")
    static let cardBorder      = adaptive(light: Color(hex: "#E5E5E5"), dark: Color.white.opacity(0.08))
    static let ink             = adaptive(light: "#3C3C3C", dark: "#FFFFFF")
    static let inkSoft         = adaptive(light: "#777777", dark: "#AFAFAF")
    static let inkGhost        = adaptive(light: "#AFAFAF", dark: "#6B7A80")
    static let divider         = adaptive(light: Color(hex: "#E5E5E5"), dark: Color.white.opacity(0.08))
    static let hoverBG         = adaptive(light: Color(hex: "#F7F7F7"), dark: Color.white.opacity(0.06))
    static let inputBG         = adaptive(light: Color(hex: "#F7F7F7"), dark: Color.white.opacity(0.05))
    static let inputBorder     = adaptive(light: Color(hex: "#E5E5E5"), dark: Color.white.opacity(0.12))

    // Ngữ nghĩa
    static let error        = Color(hex: "#FF4B4B")
    static let errorSoft    = adaptive(light: Color(hex: "#FFDFE0"), dark: Color(hex: "#FF4B4B").opacity(0.15))
    static let errorBorder  = adaptive(light: Color(hex: "#FFB3B3"), dark: Color(hex: "#FF4B4B").opacity(0.3))
    static let grass        = adaptive(light: "#58A700", dark: "#89E219")      // --grass-text
    static let grassSoft    = adaptive(light: Color(hex: "#58CC02").opacity(0.1), dark: Color(hex: "#89E219").opacity(0.12))
    static let sunshine     = Color(hex: "#FFC800")
    static let sunshineText = adaptive(light: "#A87B00", dark: "#FFC800")
    static let sunshineSoft = adaptive(light: Color(hex: "#FFF3C4"), dark: Color(hex: "#FFC800").opacity(0.12))

    // Hàm cũ nhận `scheme` — giữ để không phải sửa mọi chỗ gọi; giờ trả về
    // màu tự đổi theo chế độ nên tham số không còn ảnh hưởng.
    static func bg(scheme: ColorScheme) -> Color { background }
    static func cardBG(scheme: ColorScheme) -> Color { cardBG }
    static func ink(scheme: ColorScheme) -> Color { ink }
    static func inkSoft(scheme: ColorScheme) -> Color { inkSoft }
    static func surfaceElevated(scheme: ColorScheme) -> Color { surfaceElevated }
    static func divider(scheme: ColorScheme) -> Color { divider }
    static func inputBG(scheme: ColorScheme) -> Color { inputBG }

    private static func adaptive(light: String, dark: String) -> Color {
        adaptive(light: Color(hex: light), dark: Color(hex: dark))
    }
    private static func adaptive(light: Color, dark: Color) -> Color {
        let l = UIColor(light), d = UIColor(dark)
        return Color(UIColor { $0.userInterfaceStyle == .dark ? d : l })
    }
}

// MARK: - Typography
// Web dùng Plus Jakarta Sans cho toàn bộ chữ (next/font). Font được đóng gói
// trong Resources/Fonts (giấy phép OFL). Cỡ chữ cố định như .system(size:) cũ.
enum WordlyFonts {
    static let postScriptNames = [
        "PlusJakartaSans-Regular", "PlusJakartaSans-Medium", "PlusJakartaSans-SemiBold",
        "PlusJakartaSans-Bold", "PlusJakartaSans-ExtraBold",
    ]

    static func body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom(name(for: weight), fixedSize: size)
    }
    /// Tiêu đề lớn — web dùng font-black, Jakarta đậm nhất là ExtraBold (800)
    static func display(_ size: CGFloat) -> Font {
        .custom("PlusJakartaSans-ExtraBold", fixedSize: size)
    }
    static func mono(_ size: CGFloat) -> Font {
        .system(size: size, weight: .regular, design: .monospaced)
    }

    private static func name(for weight: Font.Weight) -> String {
        switch weight {
        case .medium: return "PlusJakartaSans-Medium"
        case .semibold: return "PlusJakartaSans-SemiBold"
        case .bold: return "PlusJakartaSans-Bold"
        case .heavy, .black: return "PlusJakartaSans-ExtraBold"
        default: return "PlusJakartaSans-Regular"
        }
    }
}

// MARK: - View Modifiers
// Theo web/src/components/ui/Card.js: bo 16, viền 1px, không đổ bóng.
struct WordlyCard: ViewModifier {
    var padding: CGFloat = 20

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(WordlyColors.cardBG as Color)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(WordlyColors.cardBorder, lineWidth: 1)
            )
    }
}

// Theo Input.js: nền --input-bg, viền --input-border, bo 12; focus viền xanh.
struct WordlyInputStyle: ViewModifier {
    var isFocused: Bool = false

    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(WordlyColors.inputBG)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isFocused ? WordlyColors.electric : WordlyColors.inputBorder,
                            lineWidth: isFocused ? 2 : 1)
            )
    }
}

extension View {
    func wordlyCard(padding: CGFloat = 20) -> some View {
        modifier(WordlyCard(padding: padding))
    }
    func wordlyInputStyle(focused: Bool = false) -> some View {
        modifier(WordlyInputStyle(isFocused: focused))
    }
}

// MARK: - Logo
// Logo gấu của web (web/public, cùng hình với app icon). Thay emoji 🌈 cũ.
struct WordlyLogo: View {
    var size: CGFloat

    var body: some View {
        Image("Logo")
            .resizable()
            .scaledToFill()
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
    }
}

// MARK: - Buttons (theo Button.js của web)
// primary: nền xanh, chữ trắng, bo 12, bóng xanh nhẹ
struct ElectricButtonStyle: ButtonStyle {
    var isLoading: Bool = false
    var isFullWidth: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) {
            if isLoading {
                ProgressView()
                    .tint(WordlyColors.onElectric)
                    .scaleEffect(0.8)
            }
            configuration.label
        }
        .font(WordlyFonts.body(15, weight: .semibold))
        .frame(maxWidth: isFullWidth ? .infinity : nil)
        .padding(.horizontal, 24)
        .padding(.vertical, 14)
        .background(WordlyColors.electric)
        .foregroundStyle(WordlyColors.onElectric)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: WordlyColors.electric.opacity(0.3), radius: 8, y: 2)
        .scaleEffect(configuration.isPressed ? 0.95 : 1)
        .animation(.spring(response: 0.2), value: configuration.isPressed)
    }
}

// secondary: nền --hover-bg, chữ --ink, viền --card-border
struct GhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(WordlyFonts.body(15, weight: .semibold))
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(WordlyColors.hoverBG)
            .foregroundStyle(WordlyColors.ink)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(WordlyColors.cardBorder, lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .animation(.spring(response: 0.2), value: configuration.isPressed)
    }
}

// MARK: - Color Extension
extension Color {
    init(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: h).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch h.count {
        case 3: (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default: (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(.sRGB, red: Double(r)/255, green: Double(g)/255, blue: Double(b)/255, opacity: Double(a)/255)
    }
}

// MARK: - ThemeManager
@MainActor
final class ThemeManager: ObservableObject {
    static let shared = ThemeManager()
    @Published var colorScheme: ColorScheme? = .dark

    func apply(_ name: String) {
        colorScheme = name == "light" ? .light : .dark
    }
    func toggle() -> String {
        let next: ColorScheme = colorScheme == .dark ? .light : .dark
        colorScheme = next
        return next == .dark ? "dark" : "light"
    }
}

// MARK: - FSRS State badge
struct FSRSBadge: View {
    let state: String

    private var config: (label: String, color: Color, bg: Color, emoji: String) {
        switch state {
        case "review":     return ("Ôn tập",   WordlyColors.electric, WordlyColors.electricSubtle, "🌿")
        case "relearning": return ("Học lại",  WordlyColors.sunshine,  WordlyColors.sunshineSoft, "🔁")
        default:           return ("Đang học", WordlyColors.error,     WordlyColors.errorSoft,    "🌱")
        }
    }

    var body: some View {
        Text("\(config.emoji) \(config.label)")
            .font(WordlyFonts.body(10, weight: .bold))
            .foregroundStyle(config.color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(config.bg)
            .clipShape(Capsule())
    }
}

struct LevelBadge: View {
    let level: String

    var body: some View {
        Text(level)
            .font(WordlyFonts.body(10, weight: .bold))
            .foregroundStyle(WordlyColors.electric)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(WordlyColors.electricSubtle)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(WordlyColors.electricBorder, lineWidth: 1))
    }
}
