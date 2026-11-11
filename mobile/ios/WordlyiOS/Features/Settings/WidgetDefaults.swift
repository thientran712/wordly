import Foundation

/// Nền mặc định của widget màn hình chính (chủ dự án 11/11/2026): theme ảnh
/// "Bàn sáng mai" — cũng là theme ảnh gói free được dùng thử (`ThemeAccess`).
enum WidgetDefaults {
    static let homeThemeId = "study-bright"

    static var homeTheme: WidgetTheme {
        guard let theme = WidgetTheme.all.first(where: { $0.id == homeThemeId }) else {
            preconditionFailure("Thiếu theme \(homeThemeId) trong WidgetTheme.all")
        }
        return theme
    }

    /// Chỉ đặt cho máy chưa từng lưu cài đặt widget — ai đã chọn theme thì giữ nguyên.
    static func needsSeed(hasStoredSettings: Bool) -> Bool { !hasStoredSettings }

    /// Gọi lúc mở app: cắt ảnh theme vào App Group (widget chỉ đọc file đã cắt) rồi lưu cài đặt.
    /// Lỗi ghi file → bỏ qua, widget vẫn dùng nền màu mặc định; lần mở sau thử lại.
    static func seedIfNeeded(storage: AppGroupStorage = .shared) {
        guard needsSeed(hasStoredSettings: storage.hasStoredSettings) else { return }
        var settings = storage.settings
        guard let style = try? WidgetThemePhoto.apply(homeTheme, to: settings.homeStyle,
                                                      store: WidgetBackgroundStore.appGroup(WordlyConfig.appGroup)) else { return }
        settings.homeStyle = style
        storage.settings = settings
    }
}
