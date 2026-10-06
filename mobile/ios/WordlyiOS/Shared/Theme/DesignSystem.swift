import SwiftUI

// MARK: - Colors
enum WordlyColors {
    static let electric        = Color(hex: "#22C55E")
    static let electricDark    = Color(hex: "#16A34A")
    static let electricBorder  = Color(hex: "#22C55E").opacity(0.35)
    static let electricSubtle  = Color(hex: "#22C55E").opacity(0.12)

    // Semantic — these adapt to light/dark via asset catalog or computed
    static var background:      Color { Color("BG") }
    static var surface:         Color { Color("Surface") }
    static var surfaceElevated: Color { Color("SurfaceElevated") }
    static var cardBG:          Color { Color("CardBG") }
    static var cardBorder:      Color { Color("CardBorder") }
    static var ink:             Color { Color("Ink") }
    static var inkSoft:         Color { Color("InkSoft") }
    static var inkGhost:        Color { Color("InkGhost") }
    static var divider:         Color { Color("Divider") }
    static var hoverBG:         Color { Color("HoverBG") }
    static var inputBG:         Color { Color("InputBG") }
    static var inputBorder:     Color { Color("InputBorder") }
    static var error:           Color { Color(hex: "#F87171") }
    static var errorSoft:       Color { Color(hex: "#F87171").opacity(0.12) }
    static var sunshine:        Color { Color(hex: "#FBBF24") }
    static var sunshineText:    Color { Color(hex: "#D97706") }
    static var sunshineSoft:    Color { Color(hex: "#FBBF24").opacity(0.12) }

    // Fallbacks for light/dark without asset catalog
    static func bg(scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(hex: "#0A0A0A") : Color(hex: "#F9FAFB")
    }
    static func cardBG(scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(hex: "#111111") : Color.white
    }
    static func ink(scheme: ColorScheme) -> Color {
        scheme == .dark ? Color.white : Color(hex: "#0A0A0A")
    }
    static func inkSoft(scheme: ColorScheme) -> Color {
        scheme == .dark ? Color.white.opacity(0.5) : Color(hex: "#0A0A0A").opacity(0.5)
    }
    static func surfaceElevated(scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(hex: "#1A1A1A") : Color(hex: "#F3F4F6")
    }
    static func divider(scheme: ColorScheme) -> Color {
        scheme == .dark ? Color.white.opacity(0.08) : Color(hex: "#0A0A0A").opacity(0.08)
    }
    static func inputBG(scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(hex: "#1A1A1A") : Color(hex: "#F3F4F6")
    }
}

// MARK: - Typography
enum WordlyFonts {
    static func serif(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom("Fraunces", size: size).weight(weight)
    }
    static func serifBlack(_ size: CGFloat) -> Font {
        .custom("Fraunces-Black", size: size)
    }
    static func body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .default)
    }
    static func mono(_ size: CGFloat) -> Font {
        .system(size: size, weight: .regular, design: .monospaced)
    }
}

// MARK: - View Modifiers
struct WordlyCard: ViewModifier {
    @Environment(\.colorScheme) var scheme
    var padding: CGFloat = 20

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(WordlyColors.cardBG(scheme: scheme))
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .overlay(
                RoundedRectangle(cornerRadius: 24)
                    .stroke(WordlyColors.divider(scheme: scheme), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.12), radius: 12, y: 4)
    }
}

struct WordlyInputStyle: ViewModifier {
    @Environment(\.colorScheme) var scheme
    var isFocused: Bool = false

    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(WordlyColors.inputBG(scheme: scheme))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(
                        isFocused ? WordlyColors.electric.opacity(0.5) : WordlyColors.divider(scheme: scheme),
                        lineWidth: isFocused ? 2 : 1.5
                    )
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

// MARK: - Electric Button Style
struct ElectricButtonStyle: ButtonStyle {
    var isLoading: Bool = false
    var isFullWidth: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) {
            if isLoading {
                ProgressView()
                    .tint(Color(hex: "#0A0A0A"))
                    .scaleEffect(0.8)
            }
            configuration.label
        }
        .frame(maxWidth: isFullWidth ? .infinity : nil)
        .padding(.horizontal, 24)
        .padding(.vertical, 14)
        .background(WordlyColors.electric)
        .foregroundStyle(Color(hex: "#0A0A0A"))
        .fontWeight(.bold)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: WordlyColors.electric.opacity(0.35), radius: 8, y: 4)
        .scaleEffect(configuration.isPressed ? 0.97 : 1)
        .animation(.spring(response: 0.2), value: configuration.isPressed)
    }
}

struct GhostButtonStyle: ButtonStyle {
    @Environment(\.colorScheme) var scheme

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(WordlyColors.surfaceElevated(scheme: scheme))
            .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
            .fontWeight(.semibold)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(WordlyColors.divider(scheme: scheme), lineWidth: 1.5)
            )
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
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
            .font(.system(size: 10, weight: .bold))
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
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(WordlyColors.electric)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(WordlyColors.electricSubtle)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(WordlyColors.electricBorder, lineWidth: 1))
    }
}
