import SwiftUI

/// Ô nhập mã 6 số: 6 ô tách rời, bàn phím số, tự điền mã từ Mail/Tin nhắn
/// (.oneTimeCode). Một TextField ẩn giữ giá trị; các ô chỉ để hiển thị (A4).
struct OTPCodeField: View {
    @Binding var code: String
    var length = 6
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            TextField("", text: Binding(get: { code }, set: { code = ResetPasswordLogic.otpInput($0) }))
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .focused($focused)
                .foregroundStyle(.clear)
                .tint(.clear)
                .accessibilityLabel("Mã xác nhận")
                .accessibilityIdentifier("otpField")
            HStack(spacing: 8) {
                ForEach(0..<length, id: \.self) { i in
                    let chars = Array(code)
                    let active = focused && i == min(chars.count, length - 1)
                    Text(i < chars.count ? String(chars[i]) : "")
                        .font(WordlyFonts.display(24))
                        .foregroundStyle(WordlyColors.ink)
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(WordlyColors.cardBG)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12)
                            .stroke(active ? WordlyColors.electric : WordlyColors.cardBorder, lineWidth: active ? 2 : 1))
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
        .onAppear { focused = true }
    }
}
