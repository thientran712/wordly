import Foundation

/// Chặn đăng xuất gọi lồng: signOut → huỷ token push gọi API → 401 →
/// AuthRecovery làm mới thất bại → signOut → … (lặp vô hạn khi phiên đã chết).
/// Đang chạy thì lần gọi lồng bỏ qua; chạy xong mở lại.
final class SignOutGate {
    private var running = false

    func run(_ op: () async -> Void) async {
        guard !running else { return }
        running = true
        defer { running = false }
        await op()
    }
}
