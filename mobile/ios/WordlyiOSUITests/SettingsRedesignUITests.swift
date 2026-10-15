import XCTest

// Cài đặt mới (spec 2026-10-15-shared-word-source-design.md §5): Cá nhân 3 dòng
// Nguồn từ / Thông báo nhắc ôn / Widget; trang Nguồn từ + Từ ghim; ghim nhanh;
// trang Widget gộp (2 tab, hướng dẫn đầu trang, cách thêm cuối trang); nhắc ôn tự lưu.
final class SettingsRedesignUITests: XCTestCase {
    private func launch(_ tab: String = "profile", _ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", tab] + extra
        app.launch()
        return app
    }

    private func scrollTo(_ el: XCUIElement, in app: XCUIApplication, max: Int = 15) -> Bool {
        var n = 0
        while !(el.exists && el.isHittable) && n < max { app.swipeUp(); n += 1 }
        return el.exists
    }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    func testProfileHasThreeLearningEntriesWithTextSummaries() {
        let app = launch()
        for id in ["entryWordSource", "entryPush", "entryWidget"] {
            XCTAssertTrue(app.buttons[id].waitForExistence(timeout: 10), id)
        }
        let source = app.buttons["entryWordSource"].label
        XCTAssertNil(source.rangeOfCharacter(from: .decimalDigits), "tóm tắt nguồn từ không có số: \(source)")
        shot(app, "profile-learning")
    }

    func testWordSourcePageLocksBankWhenSavedOff() {
        let app = launch()
        app.buttons["entryWordSource"].tap()
        let saved = app.buttons["sourceSaved"]
        let bank = app.buttons["sourceBank"]
        XCTAssertTrue(saved.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Wordly luôn dùng từ mới trong kho'")).firstMatch.exists,
                      "luôn có ghi chú về từ kho")
        shot(app, "word-source")
        saved.tap()
        XCTAssertFalse(saved.isSelected)
        XCTAssertTrue(bank.isSelected, "bỏ đã lưu → trộn kho tự bật")
        bank.tap()
        XCTAssertTrue(bank.isSelected, "đang khoá thì không tắt được")
        saved.tap()
    }

    func testPinWordFromPinnedListAndPinnedOnlyToggle() {
        let app = launch()
        app.buttons["entryWordSource"].tap()
        let pins = app.buttons["pinnedEntry"]
        XCTAssertTrue(pins.waitForExistence(timeout: 5))
        pins.tap()
        let row = app.buttons["pin.h2"]
        XCTAssertTrue(row.waitForExistence(timeout: 5), "danh sách ghim là danh sách từ đã lưu")
        XCTAssertFalse(app.buttons["pin.h3"].exists, "từ chưa lưu không có trong danh sách ghim")
        row.tap()
        XCTAssertTrue(row.isSelected)
        shot(app, "pinned-list")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.switches["pinnedOnly"].waitForExistence(timeout: 3))
    }

    func testQuickPinInSavedWordDetail() {
        let app = launch("vocab")
        // Dòng trong danh sách đã lưu (không phải thẻ xem trước widget phía trên)
        let word = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'ephemeral,'")).firstMatch
        XCTAssertTrue(word.waitForExistence(timeout: 10))
        word.tap()
        let pin = app.buttons["quickPin"]
        XCTAssertTrue(pin.waitForExistence(timeout: 5), "popup chi tiết từ đã lưu có nút ghim")
        pin.tap()
        XCTAssertTrue(pin.isSelected)
        shot(app, "quick-pin")
    }

    func testWidgetHubSwitchesTabsWithGuideAndSteps() {
        let app = launch()
        app.buttons["entryWidget"].tap()
        XCTAssertTrue(app.buttons["Màn hình khoá"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["widgetGuideToggle"].exists, "đầu trang có hướng dẫn sử dụng")
        shot(app, "widget-lock-top")
        XCTAssertTrue(scrollTo(app.staticTexts["sharedSettingsHeader"], in: app), "có nhóm áp dụng cho cả 2 widget")
        XCTAssertTrue(scrollTo(app.staticTexts["addStepsLock"], in: app), "cuối trang: cách thêm widget màn hình khoá")
        shot(app, "widget-lock-bottom")

        app.swipeDown(); app.swipeDown(); app.swipeDown(); app.swipeDown()
        app.buttons["Màn hình chính"].tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Nhóm'")).firstMatch.waitForExistence(timeout: 5),
                      "tab màn hình chính có Theme (dropdown nhóm)")
        shot(app, "widget-home-top")
        XCTAssertTrue(scrollTo(app.staticTexts["addStepsHome"], in: app, max: 25), "cuối trang: cách thêm widget màn hình chính")
        shot(app, "widget-home-bottom")
    }

    func testPushPageAutosavesWithoutSaveButton() {
        let app = launch()
        app.buttons["entryPush"].tap()
        let toggle = app.switches.firstMatch
        XCTAssertTrue(toggle.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["Lưu cài đặt"].exists, "bỏ nút Lưu — tự lưu")
        let weekdays = app.buttons["Thứ 2–6"]
        XCTAssertTrue(weekdays.waitForExistence(timeout: 3))
        weekdays.tap()
        XCTAssertTrue(app.staticTexts["Đã lưu"].waitForExistence(timeout: 4), "đổi là tự lưu, có thông báo nhỏ")
        shot(app, "push-autosave")
    }
}
