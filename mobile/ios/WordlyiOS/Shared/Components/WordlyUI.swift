import SwiftUI

// Bộ component dùng chung cho mọi màn — một kiểu card, chip, trạng thái trống/
// lỗi/đang tải, để toàn app nhìn thống nhất. Màu + font lấy từ DesignSystem.

// MARK: - Trạng thái tải dữ liệu
enum Loadable<Value> {
    case idle
    case loading
    case loaded(Value)
    case failed(String)

    var value: Value? {
        if case .loaded(let v) = self { return v }
        return nil
    }
    var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }
}

/// Hiển thị đúng một trong: đang tải / lỗi (có nút thử lại) / nội dung.
struct LoadableView<Value, Content: View>: View {
    let state: Loadable<Value>
    var retry: (() -> Void)?
    @ViewBuilder let content: (Value) -> Content

    var body: some View {
        switch state {
        case .idle, .loading:
            LoadingStateView()
        case .failed(let message):
            ErrorStateView(message: message, retry: retry)
        case .loaded(let value):
            content(value)
        }
    }
}

struct LoadingStateView: View {
    var label: String = "Đang tải…"
    var body: some View {
        VStack(spacing: 12) {
            ProgressView().tint(WordlyColors.electric)
            Text(label).font(WordlyFonts.body(13, weight: .medium)).foregroundStyle(WordlyColors.inkSoft)
        }
        .frame(maxWidth: .infinity, minHeight: 160)
    }
}

struct ErrorStateView: View {
    let message: String
    var retry: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            IconTile(systemImage: "wifi.exclamationmark", color: WordlyColors.error, size: 48)
            Text(message)
                .font(WordlyFonts.body(14, weight: .medium))
                .foregroundStyle(WordlyColors.ink)
                .multilineTextAlignment(.center)
            if let retry {
                Button("Thử lại", action: retry)
                    .buttonStyle(GhostButtonStyle())
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity)
    }
}

struct EmptyStateView: View {
    let systemImage: String
    let title: String
    var message: String?
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            IconTile(systemImage: systemImage, color: WordlyColors.electric, size: 56)
            Text(title)
                .font(WordlyFonts.body(16, weight: .bold))
                .foregroundStyle(WordlyColors.ink)
                .multilineTextAlignment(.center)
            if let message {
                Text(message)
                    .font(WordlyFonts.body(13))
                    .foregroundStyle(WordlyColors.inkSoft)
                    .multilineTextAlignment(.center)
            }
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(ElectricButtonStyle())
                    .padding(.top, 4)
            }
        }
        .padding(28)
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Khối dựng giao diện
struct IconTile: View {
    let systemImage: String
    var color: Color = WordlyColors.electric
    var size: CGFloat = 40

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: size * 0.45, weight: .semibold))
            .foregroundStyle(color)
            .frame(width: size, height: size)
            .background(color.opacity(0.14))
            .clipShape(RoundedRectangle(cornerRadius: size * 0.3, style: .continuous))
    }
}

struct SectionHeader: View {
    let title: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        HStack {
            Text(title)
                .font(WordlyFonts.body(17, weight: .bold))
                .foregroundStyle(WordlyColors.ink)
            Spacer()
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .font(WordlyFonts.body(13, weight: .semibold))
                    .foregroundStyle(WordlyColors.electric)
            }
        }
    }
}

/// Thẻ lối tắt có icon màu — dùng ở trang chủ và danh mục tính năng.
struct ActionCard: View {
    let title: String
    let subtitle: String
    let systemImage: String
    var color: Color = WordlyColors.electric

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            IconTile(systemImage: systemImage, color: color, size: 40)
            Text(title)
                .font(WordlyFonts.body(15, weight: .bold))
                .foregroundStyle(WordlyColors.ink)
                .lineLimit(1)
            Text(subtitle)
                .font(WordlyFonts.body(12))
                .foregroundStyle(WordlyColors.inkSoft)
                .lineLimit(2, reservesSpace: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .wordlyCard(padding: 14)
    }
}

/// Chip lọc — chọn thì nền xanh chữ trắng, giống pill trên web.
struct FilterChip: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(WordlyFonts.body(13, weight: .semibold))
                .lineLimit(1)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(isSelected ? WordlyColors.electric : WordlyColors.surfaceElevated)
                .foregroundStyle(isSelected ? WordlyColors.onElectric : WordlyColors.inkSoft)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(isSelected ? Color.clear : WordlyColors.cardBorder, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

/// Dải chip cuộn ngang, chọn một.
struct ChipBar<Option: Hashable>: View {
    let options: [Option]
    @Binding var selection: Option
    let label: (Option) -> String

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(options, id: \.self) { option in
                    FilterChip(label: label(option), isSelected: option == selection) {
                        withAnimation(.snappy) { selection = option }
                    }
                }
            }
            .padding(.horizontal, 16)
        }
    }
}

struct Badge: View {
    let text: String
    var color: Color = WordlyColors.electric

    var body: some View {
        Text(text)
            .font(WordlyFonts.body(11, weight: .bold))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.14))
            .clipShape(Capsule())
    }
}

struct ProgressRing: View {
    let progress: Double          // 0…1
    var lineWidth: CGFloat = 10
    var color: Color = WordlyColors.electric

    var body: some View {
        ZStack {
            Circle().stroke(WordlyColors.divider, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(0, min(1, progress)))
                .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.4), value: progress)
        }
    }
}

/// Thông báo ngắn nổi ở cuối màn hình, tự ẩn.
struct ToastView: View {
    let message: String
    var systemImage: String = "checkmark.circle.fill"
    var color: Color = WordlyColors.electric

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage).foregroundStyle(color)
            Text(message)
                .font(WordlyFonts.body(14, weight: .semibold))
                .foregroundStyle(WordlyColors.ink)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(WordlyColors.cardBG)
        .clipShape(Capsule())
        .overlay(Capsule().stroke(WordlyColors.cardBorder, lineWidth: 1))
        .shadow(color: .black.opacity(0.15), radius: 12, y: 4)
    }
}

extension View {
    /// Toast tự ẩn sau `duration` giây khi `message` khác nil.
    func toast(_ message: Binding<String?>, duration: Double = 2.5) -> some View {
        overlay(alignment: .bottom) {
            if let text = message.wrappedValue {
                ToastView(message: text)
                    .padding(.bottom, 24)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .task(id: text) {
                        try? await Task.sleep(for: .seconds(duration))
                        withAnimation { message.wrappedValue = nil }
                    }
            }
        }
        .animation(.spring(response: 0.35), value: message.wrappedValue)
    }

    /// Nền chuẩn của một màn hình.
    func screenBackground() -> some View {
        background(WordlyColors.background.ignoresSafeArea())
    }
}
