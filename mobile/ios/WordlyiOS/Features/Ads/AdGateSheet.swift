import SwiftUI

/// Lần dịch bị chặn vì hết lượt — giữ lại để dịch lại sau khi được cộng lượt.
struct AdGate: Identifiable {
    enum Pending {
        case text
        case image(UIImage)
    }
    let id = UUID()
    /// Câu của server (số lượt thưởng lấy từ cấu hình server)
    let message: String
    let pending: Pending
}

/// Hết lượt dịch hôm nay → mời xem quảng cáo thưởng (spec 2026-10-23).
struct AdGateSheet: View {
    let gate: AdGate
    let isRewarding: Bool
    let onWatch: () -> Void
    let onLater: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "play.rectangle.fill")
                .font(.system(size: 40))
                .foregroundStyle(WordlyColors.electric)
                .padding(.top, 8)
            Text("Hết lượt dịch hôm nay")
                .font(WordlyFonts.display(22))
                .foregroundStyle(WordlyColors.ink)
            Text(gate.message)
                .font(WordlyFonts.body(15))
                .foregroundStyle(WordlyColors.inkSoft)
                .multilineTextAlignment(.center)
            Text("Lượt dư dùng được cả những ngày sau.")
                .font(WordlyFonts.body(13))
                .foregroundStyle(WordlyColors.inkSoft)
            Button(action: onWatch) {
                HStack(spacing: 8) {
                    if isRewarding { ProgressView().tint(WordlyColors.onElectric) }
                    Text(isRewarding ? "Đang cộng lượt…" : "Xem quảng cáo")
                }
            }
            .buttonStyle(ElectricButtonStyle(isFullWidth: true))
            .disabled(isRewarding)
            Button("Để sau", action: onLater)
                .font(WordlyFonts.body(15, weight: .semibold))
                .foregroundStyle(WordlyColors.inkSoft)
                .disabled(isRewarding)
        }
        .padding(24)
        .presentationDetents([.height(380)])
        .interactiveDismissDisabled(isRewarding)
        .screenBackground()
    }
}
