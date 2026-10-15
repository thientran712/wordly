import Foundation

/// Nguồn từ trên app: sửa → lưu App Group ngay (widget đổi ngay) → gửi server sau
/// 1 giây không sửa (push dùng). Mở app → lấy bản server, bản mới hơn thắng
/// (spec 2026-10-15-shared-word-source-design.md §2.3).
@MainActor
final class WordSourceStore: ObservableObject {
    static let shared = WordSourceStore()

    @Published private(set) var settings: WordSourceSettings
    private var uploadTask: Task<Void, Never>?

    private init() { settings = AppGroupStorage.shared.wordSource }

    var savedWords: [WidgetWordItem] { AppGroupStorage.shared.words.filter(\.isSaved) }
    var savedIds: Set<String> { Set(savedWords.map(\.id)) }
    var summary: String { settings.summary(savedIds: savedIds) }

    func reload() { settings = AppGroupStorage.shared.wordSource }

    @discardableResult
    func update<R>(_ change: (inout WordSourceSettings) -> R) -> R {
        var s = settings
        let result = change(&s)
        guard s != settings else { return result }
        s.updatedAt = Date()
        apply(s)
        scheduleUpload()
        return result
    }

    /// Ghi máy, không gửi server (dùng khi nhận bản từ server).
    func apply(_ s: WordSourceSettings) {
        settings = s
        AppGroupStorage.shared.wordSource = s
    }

    private func scheduleUpload() {
        uploadTask?.cancel()
        uploadTask = Task {
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            await WordSourceSync.upload(settings)
        }
    }
}

enum WordSourceSync {
    /// Bản nào sửa sau thắng. Máy chưa từng gửi (vừa chuyển từ cài đặt cũ) → gửi lên.
    static func pick(local: WordSourceSettings, localStored: Bool, server: WordSourceSettings?) -> (use: WordSourceSettings, upload: Bool) {
        guard let server else { return (local, true) }
        guard localStored, let l = local.updatedAt else { return localStored ? (server, false) : (local, true) }
        guard let s = server.updatedAt else { return (local, true) }
        return s > l ? (server, false) : (local, s < l)
    }

    /// Gọi khi mở app (WidgetSync.refresh).
    @MainActor
    static func sync() async {
        let store = WordSourceStore.shared
        let localStored = AppGroupStorage.shared.hasStoredWordSource
        let server = try? await APIClient.shared.fetchWordSource()
        let decision = pick(local: store.settings, localStored: localStored, server: server)
        if decision.use != store.settings || !localStored { store.apply(decision.use) }
        if decision.upload { await upload(decision.use) }
    }

    /// Gửi lên rồi giữ `updated_at` của server (để lần đồng bộ sau so đúng mốc).
    static func upload(_ s: WordSourceSettings) async {
        guard let saved = try? await APIClient.shared.saveWordSource(s) else { return }
        await MainActor.run {
            let store = WordSourceStore.shared
            var current = store.settings
            current.updatedAt = nil
            var sent = s
            sent.updatedAt = nil
            // Người dùng chưa sửa thêm trong lúc gửi → nhận mốc giờ của server
            if current == sent { store.apply(saved) }
        }
    }
}
