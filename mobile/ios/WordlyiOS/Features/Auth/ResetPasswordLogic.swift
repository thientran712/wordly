import Foundation

/// Kiểm dữ liệu màn "Quên mật khẩu": mã OTP 6 số (GoTrue gửi qua email,
/// `{{ .Token }}` trong mẫu recovery) + mật khẩu mới.
enum ResetPasswordLogic {
    static let minPasswordLength = 6

    /// Bỏ khoảng trắng khi người dùng dán mã kiểu "123 456".
    static func normalizedCode(_ code: String) -> String {
        code.filter { !$0.isWhitespace }
    }

    /// Câu báo lỗi; nil = hợp lệ.
    static func error(code: String, password: String, confirm: String) -> String? {
        let c = normalizedCode(code)
        if c.count != 6 || !c.allSatisfy(\.isNumber) { return "Mã xác nhận gồm 6 chữ số trong email" }
        if password.count < minPasswordLength { return "Mật khẩu phải có ít nhất \(minPasswordLength) ký tự" }
        if password != confirm { return "Mật khẩu xác nhận không khớp" }
        return nil
    }
}
