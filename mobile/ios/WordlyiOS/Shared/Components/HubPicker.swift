import SwiftUI

/// Thanh chọn chế độ ở đầu một tab (vd. Đã lưu | Theo chủ đề). Dạng viên thuốc,
/// đồng bộ giữa các tab Từ vựng / Ôn tập / Luyện nói.
struct HubPicker<Option: Hashable>: View {
    let options: [Option]
    @Binding var selection: Option
    let title: (Option) -> String
    var icon: ((Option) -> String)? = nil
    @Namespace private var ns

    var body: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.self) { option in
                let on = option == selection
                Button {
                    withAnimation(.snappy(duration: 0.25)) { selection = option }
                } label: {
                    HStack(spacing: 6) {
                        if let icon { Image(systemName: icon(option)).font(.system(size: 12, weight: .bold)) }
                        Text(title(option)).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .font(WordlyFonts.body(14, weight: .bold))
                    .foregroundStyle(on ? WordlyColors.onElectric : WordlyColors.inkSoft)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background {
                        if on {
                            Capsule().fill(WordlyColors.electric)
                                .matchedGeometryEffect(id: "pill", in: ns)
                        }
                    }
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(WordlyColors.hoverBG)
        .clipShape(Capsule())
        .overlay(Capsule().stroke(WordlyColors.cardBorder, lineWidth: 1))
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .padding(.bottom, 8)
    }
}
