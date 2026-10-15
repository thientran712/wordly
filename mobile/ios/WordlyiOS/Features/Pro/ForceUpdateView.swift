import SwiftUI

/// Bắt buộc cập nhật (spec Pro §3): build < min_build của server, hoặc server trả 426.
@MainActor
final class AppUpdateGate: ObservableObject {
    static let shared = AppUpdateGate()
    @Published private(set) var required = false

    static let appStoreURL = URL(string: "https://apps.apple.com/app/id6819743393")!

    func check() async {
        #if DEBUG
        if PreviewMode.isOn { required = CommandLine.arguments.contains("-WordlyForceUpdate"); return }
        #endif
        // Lỗi mạng → không chặn (không bao giờ khoá người dùng vì server lỗi)
        guard let min = try? await APIClient.shared.appMinBuild() else { return }
        required = ForceUpdate.required(build: ForceUpdate.currentBuild, minBuild: min)
    }

    func markRequired() { required = true }
}

struct ForceUpdateView: View {
    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            WordlyLogo(size: 80)
            Text("Cập nhật Wordly")
                .font(WordlyFonts.display(28)).foregroundStyle(WordlyColors.ink)
            Text("Phiên bản này đã cũ. Cập nhật trên App Store để tiếp tục học — từ đã lưu của bạn vẫn giữ nguyên.")
                .font(WordlyFonts.body(16)).foregroundStyle(WordlyColors.inkSoft)
                .multilineTextAlignment(.center)
            Spacer()
            Link(destination: AppUpdateGate.appStoreURL) {
                Text("Mở App Store")
                    .font(WordlyFonts.body(17, weight: .bold))
                    .frame(maxWidth: .infinity).padding(.vertical, 16)
                    .background(WordlyColors.electric).foregroundStyle(WordlyColors.onElectric)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            .accessibilityIdentifier("forceUpdate.open")
        }
        .padding(24)
        .screenBackground()
    }
}
