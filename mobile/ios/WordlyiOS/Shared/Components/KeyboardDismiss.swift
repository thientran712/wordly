import UIKit

/// Chạm ra ngoài ô nhập ở bất kỳ màn nào → đóng bàn phím. SwiftUI không tự làm
/// việc này, nên trước đây bàn phím cứ hiện mãi.
///
/// Gắn một bộ nhận chạm lên cửa sổ, không chặn chạm (`cancelsTouchesInView = false`)
/// và chạy song song với mọi cử chỉ khác → nút, danh sách, cuộn vẫn hoạt động bình thường.
enum KeyboardDismiss {
    /// Chạm vào ô nhập (hoặc view con bên trong nó) thì giữ bàn phím để còn đặt
    /// con trỏ, chọn chữ; chạm chỗ khác thì đóng.
    static func shouldDismiss(touched view: UIView?) -> Bool {
        var v = view
        while let current = v {
            if current is UITextField || current is UITextView || current is UISearchBar { return false }
            v = current.superview
        }
        return true
    }

    /// Gắn vào mọi cửa sổ đang mở (gọi lại nhiều lần không sao — mỗi cửa sổ chỉ gắn một lần).
    @MainActor
    static func install() {
        for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
            for window in scene.windows where !(window.gestureRecognizers ?? []).contains(where: { $0 is DismissTap }) {
                let tap = DismissTap(target: Handler.shared, action: #selector(Handler.dismiss(_:)))
                tap.cancelsTouchesInView = false
                tap.delaysTouchesEnded = false
                tap.delegate = Handler.shared
                window.addGestureRecognizer(tap)
            }
        }
    }

    private final class DismissTap: UITapGestureRecognizer {}

    private final class Handler: NSObject, UIGestureRecognizerDelegate {
        static let shared = Handler()

        @objc func dismiss(_ gesture: UITapGestureRecognizer) {
            gesture.view?.endEditing(true)
        }

        func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            KeyboardDismiss.shouldDismiss(touched: touch.view)
        }

        func gestureRecognizer(_ g: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
    }
}
