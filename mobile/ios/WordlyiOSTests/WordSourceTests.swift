import XCTest
@testable import Wordly

// Nguồn từ chung cho widget + push (spec 2026-10-15-shared-word-source-design.md §2).
// Luật dựng pool kiểm bằng bộ mẫu chung shared/fixtures/word-pool-cases.json — JS
// (web/tests/unit) đọc cùng file, nên widget và push luôn cùng một danh sách.
final class WordSourceTests: XCTestCase {
    private struct Fixture: Decodable {
        struct Word: Decodable { let id: String; let word: String }
        struct Settings: Decodable {
            let include_saved: Bool, include_bank: Bool, pinned_ids: [String], pinned_only: Bool
        }
        struct Expect: Decodable { let personal: [String]; let pinned: [String]; let bank: [String] }
        struct Case: Decodable { let name: String; let settings: Settings; let expect: Expect }
        let saved: [Word]
        let bank: [Word]
        let cases: [Case]
        let empty_saved_cases: [Case]
    }

    private func fixture() throws -> Fixture {
        // Đọc thẳng file trong repo (simulator đọc được ổ của Mac)
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("shared/fixtures/word-pool-cases.json")
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }

    private func item(_ w: Fixture.Word, saved: Bool) -> WidgetWordItem {
        WidgetWordItem(id: w.id, word: w.word, meaning: "m", isSaved: saved, fromBank: !saved)
    }

    private func settings(_ s: Fixture.Settings) -> WordSourceSettings {
        WordSourceSettings(includeSaved: s.include_saved, includeBank: s.include_bank,
                           pinnedIds: s.pinned_ids, pinnedOnly: s.pinned_only)
    }

    func testSharedFixtureCases() throws {
        let f = try fixture()
        let saved = f.saved.map { item($0, saved: true) }
        let bank = f.bank.map { item($0, saved: false) }
        for c in f.cases {
            let r = WordSourcePool.build(settings: settings(c.settings), saved: saved, bank: bank)
            XCTAssertEqual(Set(r.personal.map(\.id)), Set(c.expect.personal), c.name)
            XCTAssertEqual(Set(r.pinned.map(\.id)), Set(c.expect.pinned), c.name)
            XCTAssertEqual(Set(r.bank.map(\.id)), Set(c.expect.bank), c.name)
        }
        for c in f.empty_saved_cases {
            let r = WordSourcePool.build(settings: settings(c.settings), saved: [], bank: bank)
            XCTAssertEqual(Set(r.personal.map(\.id)), Set(c.expect.personal), c.name)
            XCTAssertEqual(Set(r.bank.map(\.id)), Set(c.expect.bank), c.name)
        }
    }

    func testDefaultsAndCodableWithOldData() throws {
        let d = WordSourceSettings()
        XCTAssertTrue(d.includeSaved)
        XCTAssertTrue(d.includeBank)
        XCTAssertEqual(d.pinnedIds, [])
        XCTAssertFalse(d.pinnedOnly)
        let partial = try JSONDecoder().decode(WordSourceSettings.self, from: Data(#"{"includeSaved":false}"#.utf8))
        XCTAssertFalse(partial.includeSaved)
        XCTAssertTrue(partial.includeBank)
    }

    /// Bỏ tick "Từ đã lưu" → "Trộn từ mới" tự bật và không tắt được (không bao giờ hết nguồn).
    func testTurningOffSavedForcesBank() {
        var s = WordSourceSettings(includeSaved: true, includeBank: false)
        s.setIncludeSaved(false)
        XCTAssertTrue(s.includeBank)
        XCTAssertTrue(s.bankLocked)
        s.setIncludeBank(false)
        XCTAssertTrue(s.includeBank, "đang khoá thì không tắt được")
        s.setIncludeSaved(true)
        XCTAssertFalse(s.bankLocked)
        s.setIncludeBank(false)
        XCTAssertFalse(s.includeBank)
    }

    func testPinToggleAndLimit() {
        var s = WordSourceSettings()
        XCTAssertEqual(s.togglePin("a"), .pinned)
        XCTAssertTrue(s.isPinned("a"))
        XCTAssertEqual(s.togglePin("a"), .unpinned)
        XCTAssertFalse(s.isPinned("a"))
        for i in 0..<WordSourceSettings.maxPins { XCTAssertEqual(s.togglePin("w\(i)"), .pinned) }
        XCTAssertEqual(s.togglePin("extra"), .limitReached)
        XCTAssertFalse(s.isPinned("extra"))
        XCTAssertEqual(s.pinnedIds.count, WordSourceSettings.maxPins)
    }

    /// Chuyển cài đặt cũ trên máy (một lần): "Tự chọn" → từ ghim + chỉ dùng từ ghim.
    func testMigrateLegacyWidgetSettings() {
        var legacy = WidgetSettings()
        legacy.source = .custom
        legacy.selectedIds = ["s2", "gone", "s1"] + (0..<40).map { "x\($0)" }
        legacy.includeBank = false
        let savedIds = Set(["s1", "s2"] + (0..<40).map { "x\($0)" })
        let m = WordSourceSettings.migrated(from: legacy, savedIds: savedIds)
        XCTAssertTrue(m.pinnedOnly)
        XCTAssertEqual(Array(m.pinnedIds.prefix(2)), ["s2", "s1"], "giữ thứ tự, bỏ id không còn lưu")
        XCTAssertEqual(m.pinnedIds.count, WordSourceSettings.maxPins)
        XCTAssertTrue(m.includeSaved)
        XCTAssertFalse(m.includeBank)

        for src in [WidgetSettings.Source.saved, .recent, .unsaved] {
            var l = WidgetSettings()
            l.source = src
            let r = WordSourceSettings.migrated(from: l, savedIds: [])
            XCTAssertTrue(r.includeSaved, "\(src)")
            XCTAssertTrue(r.includeBank)
            XCTAssertFalse(r.pinnedOnly)
            XCTAssertEqual(r.pinnedIds, [])
        }
    }

    /// Từ ghim gặp gấp đôi: mỗi vòng 2 lần, từ khác 1 lần, không lặp liền nhau.
    func testPinnedWordsAppearTwicePerCycleNeverBackToBack() {
        let saved = (1...6).map { WidgetWordItem(id: "s\($0)", word: "w\($0)", meaning: "m", isSaved: true) }
        let src = WordSourceSettings(includeSaved: true, includeBank: false, pinnedIds: ["s3"])
        let pool = WordSourcePool.build(settings: src, saved: saved, bank: [])
        let length = WordMix.cycleLength(pool)
        XCTAssertEqual(length, 7)
        for cycle in 0..<5 {
            let seq = (0..<length).compactMap { WordMix.item(at: cycle * length + $0, pool: pool)?.id }
            XCTAssertEqual(seq.filter { $0 == "s3" }.count, 2, "vòng \(cycle)")
            XCTAssertEqual(Set(seq), Set(saved.map(\.id)))
            for (a, b) in zip(seq, seq.dropFirst()) { XCTAssertNotEqual(a, b, "vòng \(cycle): \(seq)") }
        }
    }

    func testEntriesUseWordSource() {
        let saved = [WidgetWordItem(id: "s1", word: "alpha", meaning: "a", isSaved: true),
                     WidgetWordItem(id: "u1", word: "beta", meaning: "b", isSaved: false)]
        let bank = [WidgetWordItem(id: "bank-1", word: "gamma", meaning: "g", isSaved: false, fromBank: true)]
        var w = WidgetSettings()
        w.activeStartMinutes = 0
        w.activeEndMinutes = 0
        let withBank = WidgetSchedule.entries(words: saved, bank: bank, source: WordSourceSettings(), settings: w)
        let ids = Set(withBank.compactMap { $0.word?.id })
        XCTAssertTrue(ids.contains("s1"))
        XCTAssertTrue(ids.contains("bank-1"))
        XCTAssertFalse(ids.contains("u1"), "bỏ nguồn 'dịch gần đây': từ chưa lưu không lên widget")
        let noBank = WidgetSchedule.entries(words: saved, bank: bank,
                                            source: WordSourceSettings(includeSaved: true, includeBank: false), settings: w)
        XCTAssertEqual(Set(noBank.compactMap { $0.word?.id }), ["s1"])
    }

    /// App và widget cùng đọc App Group. Máy chưa có bản mới → chuyển từ cài đặt widget cũ (không ghi).
    func testLoadFromAppGroupMigratesWhenMissing() throws {
        let d = UserDefaults(suiteName: "ws-\(UUID().uuidString)")!
        var legacy = WidgetSettings()
        legacy.source = .custom
        legacy.selectedIds = ["s1"]
        let words = [WidgetWordItem(id: "s1", word: "a", meaning: "m", isSaved: true)]
        let migrated = WordSourceSettings.load(defaults: d, legacy: legacy, words: words)
        XCTAssertEqual(migrated.pinnedIds, ["s1"])
        XCTAssertTrue(migrated.pinnedOnly)
        XCTAssertNil(d.data(forKey: WordSourceSettings.storageKey), "đọc không ghi")

        let stored = WordSourceSettings(includeSaved: false, includeBank: true, pinnedIds: [], pinnedOnly: false)
        d.set(try JSONEncoder().encode(stored), forKey: WordSourceSettings.storageKey)
        XCTAssertEqual(WordSourceSettings.load(defaults: d, legacy: legacy, words: words), stored)
    }

    /// Dòng tóm tắt ở Cá nhân — chỉ chữ, không số (chủ dự án chốt).
    func testSummaryText() {
        let saved: Set<String> = ["s1"]
        XCTAssertEqual(WordSourceSettings().summary(savedIds: saved), "Đã lưu + từ mới")
        XCTAssertEqual(WordSourceSettings(includeSaved: true, includeBank: false).summary(savedIds: saved), "Từ đã lưu")
        XCTAssertEqual(WordSourceSettings(includeSaved: false, includeBank: true).summary(savedIds: saved), "Từ mới trong kho")
        XCTAssertEqual(WordSourceSettings(pinnedIds: ["s1"]).summary(savedIds: saved), "Đã lưu + từ mới · có từ ghim")
        XCTAssertEqual(WordSourceSettings(pinnedIds: ["s1"], pinnedOnly: true).summary(savedIds: saved), "Chỉ từ ghim")
        XCTAssertEqual(WordSourceSettings(pinnedIds: ["gone"], pinnedOnly: true).summary(savedIds: saved), "Đã lưu + từ mới",
                       "ghim đã xoá hết → như tắt")
        for s in [WordSourceSettings(), WordSourceSettings(pinnedIds: ["s1"])] {
            XCTAssertNil(s.summary(savedIds: saved).rangeOfCharacter(from: .decimalDigits))
        }
    }

    func testValidPinCount() {
        let s = WordSourceSettings(pinnedIds: ["s1", "gone", "s2"])
        XCTAssertEqual(s.validPinCount(savedIds: ["s1", "s2"]), 2)
    }

    /// Đồng bộ: bản sửa sau thắng; máy chưa có bản mới (vừa chuyển từ cài đặt cũ) → gửi lên.
    @MainActor func testSyncPickNewerWins() {
        let old = Date(timeIntervalSince1970: 1000), new = Date(timeIntervalSince1970: 2000)
        let local = WordSourceSettings(includeBank: false, updatedAt: new)
        let server = WordSourceSettings(includeBank: true, updatedAt: old)
        XCTAssertEqual(WordSourceSync.pick(local: local, localStored: true, server: server).use, local)
        XCTAssertTrue(WordSourceSync.pick(local: local, localStored: true, server: server).upload)
        let newerServer = WordSourceSettings(includeBank: true, updatedAt: Date(timeIntervalSince1970: 3000))
        XCTAssertEqual(WordSourceSync.pick(local: local, localStored: true, server: newerServer).use, newerServer)
        XCTAssertFalse(WordSourceSync.pick(local: local, localStored: true, server: newerServer).upload)
        // Máy vừa chuyển từ cài đặt cũ, server chưa có dòng (mặc định, không updated_at) → giữ bản máy, gửi lên
        let migrated = WordSourceSettings(pinnedIds: ["s1"], pinnedOnly: true)
        let r = WordSourceSync.pick(local: migrated, localStored: false, server: WordSourceSettings())
        XCTAssertEqual(r.use, migrated)
        XCTAssertTrue(r.upload)
        // Lỗi mạng → giữ bản máy, thử gửi
        XCTAssertTrue(WordSourceSync.pick(local: local, localStored: true, server: nil).upload)
        XCTAssertFalse(WordSourceSync.pick(local: local, localStored: true, server: local).upload, "bằng nhau → không gửi")
    }
}
