import Foundation
import WidgetKit

/// Gửi lịch widget 48 giờ tới lên server (spec 2026-10-15-shared-word-source-design.md
/// §3) — push dùng để không gửi đúng từ đang/vừa hiện trên widget và để đố lại từ đã
/// thấy. Thay cho log cả pool (làm push bị reset về từ cũ nhất). Máy chưa thêm widget
/// Wordly → gửi lịch rỗng (server xoá dòng tương lai). Gộp các lần gọi trong 5 giây.
enum WidgetScheduleUpload {
    static let horizonHours = 48
    static let maxEntries = 200
    /// `kind` của widget Wordly (WordlyWidget.swift)
    static let widgetKind = "WordlyWidget"

    struct Item: Equatable {
        let shownAt: Date
        let id: String
    }

    /// Từ đang hiện (entry đầu, ghi giờ "bây giờ") gửi giờ BẮT ĐẦU slot — mở app nhiều
    /// lần trong một slot ra cùng một dòng, server không ghi "Đã nhắc" trùng.
    static func payload(_ entries: [WidgetSchedule.Entry], intervalMinutes: Int) -> [Item] {
        let slot = TimeInterval(max(1, intervalMinutes) * 60)
        return Array(entries.enumerated().compactMap { i, e in
            e.word.map { w in
                let at = i == 0 ? Date(timeIntervalSince1970: (e.date.timeIntervalSince1970 / slot).rounded(.down) * slot) : e.date
                return Item(shownAt: at, id: w.id)
            }
        }.prefix(maxEntries))
    }

    static func hasWordlyWidget(kinds: [String]) -> Bool { kinds.contains(widgetKind) }

    @MainActor private static var pending: Task<Void, Never>?

    /// Gọi khi danh sách từ / nguồn từ / nhịp đổi từ / lô kho thay đổi, và khi mở app.
    @MainActor static func schedule() {
        pending?.cancel()
        pending = Task {
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            await upload()
        }
    }

    static func upload() async {
        let items: [Item]
        if hasWordlyWidget(kinds: await installedKinds()) {
            let store = AppGroupStorage.shared
            items = payload(WidgetSchedule.entries(words: store.words, bank: store.bank, source: store.wordSource,
                                                   settings: store.settings, horizonHours: horizonHours),
                            intervalMinutes: store.settings.intervalMinutes)
        } else {
            items = []
        }
        try? await APIClient.shared.uploadWidgetSchedule(items)
    }

    /// `kind` của các widget người dùng đã thêm (API callback — bản async chỉ có từ iOS 18).
    static func installedKinds() async -> [String] {
        await withCheckedContinuation { cont in
            WidgetCenter.shared.getCurrentConfigurations { result in
                cont.resume(returning: ((try? result.get()) ?? []).map(\.kind))
            }
        }
    }
}
