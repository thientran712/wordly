import SwiftUI

/// Onboarding 4 màn khi cài mới, trước màn đăng nhập (chủ dự án chốt 15/10: bắt buộc,
/// không nút bỏ qua — vẫn vuốt tới/lui được). Minh hoạ dựng bằng chính giao diện app (thu
/// nhỏ, có chuyển động nhẹ; tắt khi bật Giảm chuyển động). Không xin quyền gì ở đây
/// (App Store 4.5.4 / HIG) và không vẽ thiết bị/giao diện thật của Apple (5.2.5).
struct OnboardingFlowView: View {
    enum Choice { case signup, login }
    let onFinish: (Choice) -> Void

    @State private var page = 0
    private let count = 4

    private struct Page { let title: String; let text: String }
    private let pages = [
        Page(title: "Dịch & lưu từ trong 1 chạm", text: "Dịch từ, câu, ảnh hay giọng nói. Bấm Lưu là Wordly giúp bạn nhớ."),
        Page(title: "Liếc điện thoại là ôn", text: "Thêm widget vào màn hình khoá hoặc màn hình chính — 40 theme màu và ảnh."),
        Page(title: "Nhắc đúng lúc sắp quên", text: "Chọn giờ nhắc, Wordly gửi từng từ đúng lúc bạn cần ôn. Ghim từ khó để gặp nhiều hơn."),
        Page(title: "Ôn nhanh, nhớ lâu", text: "Vài phút quiz mỗi ngày để chắc là bạn nhớ thật."),
    ]

    var body: some View {
        ZStack {
            WordlyColors.background.ignoresSafeArea()
            VStack(spacing: 0) {
                progress.padding(.horizontal, 24).padding(.top, 12)

                TabView(selection: $page) {
                    ForEach(0..<count, id: \.self) { i in
                        VStack(spacing: 20) {
                            Spacer(minLength: 4)
                            illustration(i)
                                .frame(maxWidth: .infinity)
                                .frame(height: 300)
                            Text(pages[i].title)
                                .font(WordlyFonts.display(26))
                                .foregroundStyle(WordlyColors.ink)
                                .multilineTextAlignment(.center)
                                .minimumScaleFactor(0.8)
                            Text(pages[i].text)
                                .font(WordlyFonts.body(16))
                                .foregroundStyle(WordlyColors.inkSoft)
                                .multilineTextAlignment(.center)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 4)
                        }
                        .padding(.horizontal, 28)
                        .tag(i)
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("onboardingPage\(i + 1)")
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                buttons.padding(.horizontal, 24).padding(.bottom, 20)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("onboardingFlow")
    }

    /// Thanh tiến độ 4 đoạn — biết còn bao nhiêu màn.
    private var progress: some View {
        HStack(spacing: 6) {
            ForEach(0..<count, id: \.self) { i in
                Capsule()
                    .fill(i <= page ? WordlyColors.electric : WordlyColors.inkSoft.opacity(0.25))
                    .frame(height: 5)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: page)
        .accessibilityElement()
        .accessibilityLabel("Màn \(page + 1) trên \(count)")
    }

    @ViewBuilder private var buttons: some View {
        if page < count - 1 {
            primary("Tiếp") { withAnimation { page += 1 } }
                .accessibilityIdentifier("onboardingNext")
        } else {
            VStack(spacing: 10) {
                primary("Tạo tài khoản") { onFinish(.signup) }
                    .accessibilityIdentifier("onboardingSignup")
                Button { onFinish(.login) } label: {
                    Text("Tôi đã có tài khoản")
                        .font(WordlyFonts.body(16, weight: .bold))
                        .frame(maxWidth: .infinity).padding(.vertical, 15)
                        .foregroundStyle(WordlyColors.ink)
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(WordlyColors.inkSoft.opacity(0.4), lineWidth: 1.5))
                }
                .accessibilityIdentifier("onboardingLogin")
            }
        }
    }

    private func primary(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(WordlyFonts.body(16, weight: .bold))
                .frame(maxWidth: .infinity).padding(.vertical, 16)
                .background(WordlyColors.electric).foregroundStyle(WordlyColors.onElectric)
                .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    @ViewBuilder private func illustration(_ i: Int) -> some View {
        switch i {
        case 0: TranslateDemo(active: page == 0)
        case 1: WidgetDemo(active: page == 1)
        case 2: ReminderDemo(active: page == 2)
        default: QuizDemo(active: page == 3)
        }
    }
}

// MARK: - Minh hoạ (giao diện app thu nhỏ; chỉ là hình, không bấm được)

/// Chạy chuỗi bước minh hoạ lặp lại khi màn đang hiện; Giảm chuyển động → đứng ở bước cuối.
private struct DemoTicker: ViewModifier {
    let active: Bool
    let steps: Int
    let interval: Double
    @Binding var step: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.task(id: active) {
            guard active else { return }
            if reduceMotion { step = steps - 1; return }
            step = 0
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(interval))
                withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) { step = (step + 1) % steps }
            }
        }
    }
}

private extension View {
    func demoTicker(active: Bool, steps: Int, interval: Double, step: Binding<Int>) -> some View {
        modifier(DemoTicker(active: active, steps: steps, interval: interval, step: step))
    }
}

private struct TranslateDemo: View {
    let active: Bool
    @State private var step = 0   // 0 gõ · 1 có nghĩa · 2 đã lưu

    var body: some View {
        VStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 10) {
                Text("English").font(WordlyFonts.body(12, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
                Text(step == 0 ? "resil|" : "resilient")
                    .font(WordlyFonts.body(24, weight: .bold)).foregroundStyle(WordlyColors.ink)
                Divider()
                Text("Tiếng Việt").font(WordlyFonts.body(12, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
                Text(step == 0 ? "…" : "kiên cường, mau phục hồi")
                    .font(WordlyFonts.body(18, weight: .semibold)).foregroundStyle(WordlyColors.electric)
                HStack {
                    Spacer()
                    Label(step == 2 ? "Đã lưu" : "Lưu", systemImage: step == 2 ? "bookmark.fill" : "bookmark")
                        .font(WordlyFonts.body(14, weight: .bold))
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(step == 2 ? WordlyColors.electric : WordlyColors.electricSubtle)
                        .foregroundStyle(step == 2 ? WordlyColors.onElectric : WordlyColors.electric)
                        .clipShape(Capsule())
                        .scaleEffect(step == 2 ? 1.08 : 1)
                }
            }
            .padding(18)
            .background(WordlyColors.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: 22))
            .shadow(color: .black.opacity(0.12), radius: 14, y: 6)
            HStack(spacing: 10) {
                chip("camera.fill", "Dịch ảnh")
                chip("mic.fill", "Dịch giọng nói")
            }
        }
        .padding(.horizontal, 8)
        .demoTicker(active: active, steps: 3, interval: 1.3, step: $step)
        .accessibilityElement()
        .accessibilityLabel("Minh hoạ: dịch “resilient” thành “kiên cường” rồi bấm Lưu")
    }

    private func chip(_ icon: String, _ text: String) -> some View {
        Label(text, systemImage: icon)
            .font(WordlyFonts.body(13, weight: .semibold))
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(WordlyColors.surfaceElevated).foregroundStyle(WordlyColors.ink)
            .clipShape(Capsule())
    }
}

private struct WidgetDemo: View {
    let active: Bool
    @State private var step = 0
    private let words = [("resilient", "kiên cường"), ("ephemeral", "thoáng qua"), ("meticulous", "tỉ mỉ")]
    @State private var photo: CGImage?

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            // Màn hình khoá — khung điện thoại chung chung (không "đảo", không 9:41): không mô
            // phỏng thiết bị thật của Apple (App Store 5.2.5)
            VStack(spacing: 10) {
                Text("8:30").font(.system(size: 34, weight: .bold, design: .rounded)).foregroundStyle(.white)
                    .padding(.top, 22)
                VStack(alignment: .leading, spacing: 2) {
                    Text(words[step].0).font(.system(size: 15, weight: .bold))
                    Text(words[step].1).font(.system(size: 12)).opacity(0.85)
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
                .background(.white.opacity(0.18))
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .padding(.horizontal, 10)
                .id(step)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
                Spacer()
            }
            .frame(width: 150, height: 280)
            .background(LinearGradient(colors: [Color(hex: "#1E3A8A"), Color(hex: "#0E7490")], startPoint: .top, endPoint: .bottom))
            .clipShape(RoundedRectangle(cornerRadius: 30))
            .overlay(RoundedRectangle(cornerRadius: 30).stroke(.black.opacity(0.85), lineWidth: 5))

            // Widget màn hình chính với theme ảnh
            VStack(alignment: .leading, spacing: 4) {
                Text(words[step].0).font(.system(size: 18, weight: .bold))
                Text(words[step].1).font(.system(size: 13)).opacity(0.9)
            }
            .foregroundStyle(.white)
            .padding(14)
            .frame(width: 150, height: 150, alignment: .leading)
            .background {
                ZStack {
                    Color(hex: "#111827")
                    if let photo { Image(decorative: photo, scale: 1).resizable().scaledToFill() }
                    Color.black.opacity(0.35)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 26))
            .shadow(color: .black.opacity(0.2), radius: 12, y: 6)
        }
        .demoTicker(active: active, steps: words.count, interval: 2, step: $step)
        .task {
            if let space = WidgetTheme.all.first(where: { $0.id == "space-milkyway" }) {
                photo = WidgetThemePhoto.thumbnail(space)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Minh hoạ: widget màn hình khoá và màn hình chính tự đổi từ")
    }
}

private struct ReminderDemo: View {
    let active: Bool
    @State private var step = 0   // 0 thông báo 1 (hiện sẵn, không để màn trống) · 1 thêm thông báo 2 + ghim

    var body: some View {
        VStack(spacing: 12) {
            banner("Đố bạn nhớ “resilient” không? 🤔", "bây giờ")
            if step >= 1 {
                banner("FYI là “để bạn biết” 💡", "1 giờ trước")
                    .transition(.move(edge: .top).combined(with: .opacity))
                Label("Ghim từ khó — gặp nhiều gấp đôi", systemImage: "pin.fill")
                    .font(WordlyFonts.body(14, weight: .bold))
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(WordlyColors.electricSubtle).foregroundStyle(WordlyColors.electric)
                    .clipShape(Capsule())
                    .padding(.top, 6)
                    .transition(.scale.combined(with: .opacity))
            }
            Spacer(minLength: 0)
        }
        .padding(.top, 20)
        .frame(maxWidth: 340)
        .demoTicker(active: active, steps: 2, interval: 1.6, step: $step)
        .accessibilityElement()
        .accessibilityLabel("Minh hoạ: thông báo nhắc ôn từ và nút ghim từ khó")
    }

    private func banner(_ text: String, _ time: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            WordlyLogo(size: 34)
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text("Wordly").font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.ink)
                    Spacer()
                    Text(time).font(WordlyFonts.body(11)).foregroundStyle(WordlyColors.inkSoft)
                }
                Text(text).font(WordlyFonts.body(14)).foregroundStyle(WordlyColors.ink)
            }
        }
        .padding(12)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .shadow(color: .black.opacity(0.12), radius: 10, y: 4)
    }
}

private struct QuizDemo: View {
    let active: Bool
    @State private var step = 0   // 0 hỏi · 1 chọn đúng
    private let options = ["thoáng qua", "kiên cường", "tỉ mỉ", "chăm chỉ"]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("“resilient” nghĩa là gì?")
                .font(WordlyFonts.body(18, weight: .bold)).foregroundStyle(WordlyColors.ink)
                .padding(.bottom, 4)
            ForEach(options, id: \.self) { o in
                let correct = o == "kiên cường" && step == 1
                HStack {
                    Text(o).font(WordlyFonts.body(15, weight: .semibold))
                    Spacer()
                    if correct { Image(systemName: "checkmark.circle.fill") }
                }
                .padding(.horizontal, 14).padding(.vertical, 11)
                .background(correct ? WordlyColors.electric : WordlyColors.surfaceElevated)
                .foregroundStyle(correct ? WordlyColors.onElectric : WordlyColors.ink)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(18)
        .background(WordlyColors.surfaceElevated.opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 22))
        .frame(maxWidth: 340)
        .demoTicker(active: active, steps: 2, interval: 1.4, step: $step)
        .accessibilityElement()
        .accessibilityLabel("Minh hoạ: câu quiz “resilient nghĩa là gì”, đáp án đúng là kiên cường")
    }
}
