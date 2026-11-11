import XCTest

// Bản miễn phí: dịch ảnh / giọng nói 1 lượt mỗi ngày (chủ dự án chốt 11/11/2026).
// Bấm lần 2 trong ngày → màn mời nâng cấp hiện NGAY, không ghi âm / không mở camera.
final class ImageVoiceLimitUITests: XCTestCase {
    private func launch(_ extra: [String]) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "translate"] + extra
        app.launch()
        return app
    }

    func testSecondVoiceOrImageOpensPaywallImmediately() {
        let app = launch(["-WordlyImageVoiceUsed"])
        let mic = app.buttons["Ghi âm để dịch"]
        XCTAssertTrue(mic.waitForExistence(timeout: 10))
        mic.tap()
        let headline = app.staticTexts["paywall.headline"]
        XCTAssertTrue(headline.waitForExistence(timeout: 5), "hết lượt giọng nói → paywall ngay")
        XCTAssertEqual(headline.label, "Hết lượt dịch giọng nói miễn phí hôm nay")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "paywall-voice"
        shot.lifetime = .keepAlways
        add(shot)
        app.swipeDown(velocity: .fast)
        XCTAssertFalse(headline.waitForExistence(timeout: 2) && headline.isHittable)

        let camera = app.buttons["Chụp hoặc chọn ảnh để dịch"]
        XCTAssertTrue(camera.waitForExistence(timeout: 5))
        camera.tap()
        XCTAssertTrue(app.staticTexts["paywall.headline"].waitForExistence(timeout: 5), "hết lượt ảnh → paywall ngay")
        XCTAssertEqual(app.staticTexts["paywall.headline"].label, "Hết lượt dịch ảnh miễn phí hôm nay")
        XCTAssertFalse(app.buttons["Chụp ảnh"].exists, "không mở hộp chọn ảnh")
    }

    func testFirstImageOfTheDayStillOpensPicker() {
        let app = launch([])
        let camera = app.buttons["Chụp hoặc chọn ảnh để dịch"]
        XCTAssertTrue(camera.waitForExistence(timeout: 10))
        camera.tap()
        XCTAssertTrue(app.buttons["Chụp ảnh"].waitForExistence(timeout: 5), "còn lượt → mở hộp chọn ảnh như cũ")
        XCTAssertFalse(app.staticTexts["paywall.headline"].exists)
    }
}
