import Foundation

/// Logic thuần của lịch sử dịch. "Xoá hết" chỉ bỏ mục CHƯA lưu — từ đã lưu luôn
/// được giữ (server làm y hệt: web/src/lib/learning/history-delete.js).
enum HistoryLogic {
    static func removingUnsaved(_ groups: [HistoryGroup]) -> [HistoryGroup] {
        groups.compactMap { g in
            var g = g
            g.entries.removeAll { $0.isSaved != true }
            return g.entries.isEmpty ? nil : g
        }
    }

    static func unsavedCount(_ groups: [HistoryGroup]) -> Int {
        groups.reduce(0) { $0 + $1.entries.filter { $0.isSaved != true }.count }
    }
}
