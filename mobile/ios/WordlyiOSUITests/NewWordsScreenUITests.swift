import XCTest

// Tab Từ vựng — Từ mới (review UI 11/11):
// N1 một nút "Lọc" mở sheet 3 nhóm, nút đáy ghi số từ; N3 popup từ có nút "Lưu từ này".
final class NewWordsScreenUITests: XCTestCase {
    private func openNewWords() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "vocab"]
        app.launch()
        let tab = app.buttons["Từ mới"]
        XCTAssertTrue(tab.waitForExistence(timeout: 10))
        tab.tap()
        return app
    }

    func testFilterButtonOpensSheetWithCount() {
        let app = openNewWords()
        let open = app.buttons["vocabFilterOpen"]
        XCTAssertTrue(open.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Mọi kỳ thi'")).firstMatch.exists,
                       "không còn hàng chip trên danh sách")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "new-words-list"
        shot.lifetime = .keepAlways
        add(shot)
        open.tap()
        let apply = app.buttons["vocabFilterApply"]
        XCTAssertTrue(apply.waitForExistence(timeout: 5))
        XCTAssertTrue(apply.label.hasPrefix("Xem "), "nút áp dụng ghi số từ")
        let sheet = XCTAttachment(screenshot: app.screenshot())
        sheet.name = "new-words-filter"
        sheet.lifetime = .keepAlways
        add(sheet)
        apply.tap()
        XCTAssertTrue(open.waitForExistence(timeout: 5))
    }

    func testWordPopupHasSaveButton() {
        let app = openNewWords()
        let first = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'optimise'")).firstMatch
        XCTAssertTrue(first.waitForExistence(timeout: 10))
        first.tap()
        let save = app.buttons["bankWordSave"]
        XCTAssertTrue(save.waitForExistence(timeout: 5), "popup từ mới có nút lưu")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "bank-word-popup"
        shot.lifetime = .keepAlways
        add(shot)
    }
}
