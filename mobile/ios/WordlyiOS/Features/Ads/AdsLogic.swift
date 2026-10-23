import Foundation

// Quảng cáo — logic thuần (spec docs/superpowers/specs/2026-10-23-in-app-ads-design.md).
// Khi nào được hiện quảng cáo do đây quyết; AdsManager chỉ tải/hiện.

/// Khối `ads` của GET /api/app-config — server đổi tần suất không cần ra bản mới.
struct AdsConfig: Decodable, Equatable {
    var enabled: Bool
    var appOpenPerDay: Int
    var interstitialMinGapSec: Int
    var interstitialPerDay: Int
    var banner: Bool
    /// Cài mới: bao nhiêu giờ đầu không quảng cáo
    var graceHours: Int
    var premiumThemeIds: [String]

    static let off = AdsConfig(enabled: false, appOpenPerDay: 0, interstitialMinGapSec: 180, interstitialPerDay: 0,
                               banner: false, graceHours: 0, premiumThemeIds: [])

    init(enabled: Bool, appOpenPerDay: Int, interstitialMinGapSec: Int, interstitialPerDay: Int,
         banner: Bool, graceHours: Int, premiumThemeIds: [String]) {
        (self.enabled, self.appOpenPerDay, self.interstitialMinGapSec, self.interstitialPerDay) =
            (enabled, appOpenPerDay, interstitialMinGapSec, interstitialPerDay)
        (self.banner, self.graceHours, self.premiumThemeIds) = (banner, graceHours, premiumThemeIds)
    }

    enum CodingKeys: String, CodingKey {
        case enabled, banner
        case appOpenPerDay = "app_open_per_day", interstitialMinGapSec = "interstitial_min_gap_sec"
        case interstitialPerDay = "interstitial_per_day", graceHours = "grace_hours", premiumThemeIds = "premium_theme_ids"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try c.decodeIfPresent(Bool.self, forKey: .enabled) ?? false
        appOpenPerDay = try c.decodeIfPresent(Int.self, forKey: .appOpenPerDay) ?? 2
        interstitialMinGapSec = try c.decodeIfPresent(Int.self, forKey: .interstitialMinGapSec) ?? 180
        interstitialPerDay = try c.decodeIfPresent(Int.self, forKey: .interstitialPerDay) ?? 6
        banner = try c.decodeIfPresent(Bool.self, forKey: .banner) ?? true
        graceHours = try c.decodeIfPresent(Int.self, forKey: .graceHours) ?? 0
        premiumThemeIds = try c.decodeIfPresent([String].self, forKey: .premiumThemeIds) ?? []
    }
}

/// App được mở bằng đường nào.
enum OpenSource: Equatable {
    case launch
    /// Quay lại từ nền sau `awaySeconds` giây
    case foreground(awaySeconds: TimeInterval)
    /// Bấm widget / thông báo → người dùng đang làm việc cụ thể, không chen quảng cáo
    case widget, push
}

/// Số quảng cáo toàn màn đã hiện hôm nay (theo ngày giờ Việt Nam).
struct AdLedger: Codable, Equatable {
    var day: String
    var appOpenShown: Int
    var interstitialShown: Int
    var lastFullscreenAt: Date?

    static func vnDayKey(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    /// Sổ của ngày `now` — sang ngày mới thì đếm lại từ 0.
    func rolled(now: Date) -> AdLedger {
        let today = Self.vnDayKey(now)
        return today == day ? self : AdLedger(day: today, appOpenShown: 0, interstitialShown: 0, lastFullscreenAt: lastFullscreenAt)
    }

    mutating func noteAppOpen(now: Date) {
        self = rolled(now: now)
        appOpenShown += 1
        lastFullscreenAt = now
    }

    mutating func noteInterstitial(now: Date) {
        self = rolled(now: now)
        interstitialShown += 1
        lastFullscreenAt = now
    }
}

enum AdsPolicy {
    /// Quay lại từ nền dưới 30 giây (vd. sang app khác chép chữ) → không quảng cáo.
    static let foregroundMinAway: TimeInterval = 30

    private static func active(_ config: AdsConfig, adFree: Bool, firstOpenAt: Date?, now: Date) -> Bool {
        guard config.enabled, !adFree else { return false }
        if config.graceHours > 0, let first = firstOpenAt,
           now.timeIntervalSince(first) < TimeInterval(config.graceHours) * 3600 { return false }
        return true
    }

    static func shouldShowAppOpen(config: AdsConfig, ledger: AdLedger, source: OpenSource, adFree: Bool,
                                  inOnboarding: Bool, isRecording: Bool, firstOpenAt: Date?, now: Date) -> Bool {
        guard active(config, adFree: adFree, firstOpenAt: firstOpenAt, now: now), !inOnboarding, !isRecording else { return false }
        switch source {
        case .launch: break
        case .foreground(let away): guard away >= foregroundMinAway else { return false }
        case .widget, .push: return false
        }
        return ledger.rolled(now: now).appOpenShown < config.appOpenPerDay
    }

    static func shouldShowInterstitial(config: AdsConfig, ledger: AdLedger, adFree: Bool, firstOpenAt: Date?, now: Date) -> Bool {
        guard active(config, adFree: adFree, firstOpenAt: firstOpenAt, now: now) else { return false }
        let l = ledger.rolled(now: now)
        if let last = l.lastFullscreenAt, now.timeIntervalSince(last) < TimeInterval(config.interstitialMinGapSec) { return false }
        return l.interstitialShown < config.interstitialPerDay
    }

    static func showsBanner(config: AdsConfig, adFree: Bool, firstOpenAt: Date?, now: Date) -> Bool {
        config.banner && active(config, adFree: adFree, firstOpenAt: firstOpenAt, now: now)
    }

    /// Hỏi "Cho phép theo dõi" từ lần mở app thứ 2, sau khi đã qua onboarding —
    /// lần đầu người dùng chưa biết app, hỏi ngay thường bị từ chối.
    static func shouldAskTracking(onboardingDone: Bool, launchCount: Int) -> Bool {
        onboardingDone && launchCount >= 2
    }
}

/// Theme đặc biệt mở khoá bằng quảng cáo thưởng.
enum ThemeLock {
    static func isLocked(themeId: String, config: AdsConfig, unlocked: Set<String>, adFree: Bool, isCurrent: Bool) -> Bool {
        guard config.enabled, !adFree, !isCurrent else { return false }
        return config.premiumThemeIds.contains(themeId) && !unlocked.contains(themeId)
    }
}

/// `custom_data` gửi kèm quảng cáo thưởng — server (SSV) đọc để biết thưởng gì.
enum RewardData {
    static let translate = "translate"
    static func theme(_ id: String) -> String { "theme:\(id)" }
}
