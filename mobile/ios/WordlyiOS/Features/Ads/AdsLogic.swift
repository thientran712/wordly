import Foundation

// Quảng cáo mở app — logic thuần (chủ dự án chốt 11/11/2026): chỉ khi mở app
// lạnh, tối đa `appOpenPerDay` lần/ngày. Chốt 14/11/2026: Pro không thấy quảng cáo;
// hai lần cách nhau ít nhất `appOpenMinGapMinutes`. AdsManager chỉ tải/hiện.

/// Khối `ads` của GET /api/app-config — server bật/tắt + đổi tần suất không cần ra bản mới.
struct AdsConfig: Decodable, Equatable {
    var enabled: Bool
    var appOpenPerDay: Int
    /// Khoảng cách tối thiểu giữa 2 lần hiện (phút); 0 = không giãn cách
    var appOpenMinGapMinutes: Int

    static let off = AdsConfig(enabled: false, appOpenPerDay: 0)

    init(enabled: Bool, appOpenPerDay: Int, appOpenMinGapMinutes: Int = 0) {
        self.enabled = enabled
        self.appOpenPerDay = appOpenPerDay
        self.appOpenMinGapMinutes = appOpenMinGapMinutes
    }

    enum CodingKeys: String, CodingKey {
        case enabled, appOpenPerDay = "app_open_per_day", appOpenMinGapMinutes = "app_open_min_gap_minutes"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try c.decodeIfPresent(Bool.self, forKey: .enabled) ?? false
        appOpenPerDay = try c.decodeIfPresent(Int.self, forKey: .appOpenPerDay) ?? 1
        appOpenMinGapMinutes = try c.decodeIfPresent(Int.self, forKey: .appOpenMinGapMinutes) ?? 0
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

/// Số quảng cáo mở app đã hiện hôm nay (theo ngày giờ Việt Nam).
struct AdLedger: Codable, Equatable {
    var day: String
    var appOpenShown: Int
    /// Lần hiện gần nhất — giữ qua nửa đêm để vẫn giãn cách đúng (sổ của bản cũ không có → nil)
    var lastShownAt: Date?

    init(day: String, appOpenShown: Int, lastShownAt: Date? = nil) {
        self.day = day
        self.appOpenShown = appOpenShown
        self.lastShownAt = lastShownAt
    }

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
        return today == day ? self : AdLedger(day: today, appOpenShown: 0, lastShownAt: lastShownAt)
    }

    mutating func noteAppOpen(now: Date) {
        self = rolled(now: now)
        appOpenShown += 1
        lastShownAt = now
    }
}

enum AdsPolicy {
    static func shouldShowAppOpen(config: AdsConfig, ledger: AdLedger, source: OpenSource,
                                  inOnboarding: Bool, isPro: Bool, now: Date) -> Bool {
        guard config.enabled, !isPro, source == .launch, !inOnboarding else { return false }
        let today = ledger.rolled(now: now)
        if let last = today.lastShownAt, config.appOpenMinGapMinutes > 0,
           now.timeIntervalSince(last) < TimeInterval(config.appOpenMinGapMinutes * 60) {
            return false
        }
        return today.appOpenShown < config.appOpenPerDay
    }

    /// Dòng "Tuỳ chọn quyền riêng tư" ở Cá nhân — GDPR / luật tiểu bang Mỹ bắt buộc
    /// cho người dùng đổi lựa chọn đồng ý; UMP báo ai cần (người dùng VN thì không).
    static func showsPrivacyOptions(adsEnabled: Bool, required: Bool) -> Bool {
        adsEnabled && required
    }
}

/// Sổ quảng cáo lưu trên máy (trần theo máy, không theo tài khoản).
struct AdLedgerStore {
    let defaults: UserDefaults
    private let key = "ads.ledger"

    func load(now: Date) -> AdLedger {
        guard let data = defaults.data(forKey: key),
              let saved = try? JSONDecoder().decode(AdLedger.self, from: data) else {
            return AdLedger(day: AdLedger.vnDayKey(now), appOpenShown: 0)
        }
        return saved.rolled(now: now)
    }

    func save(_ ledger: AdLedger) {
        if let data = try? JSONEncoder().encode(ledger) { defaults.set(data, forKey: key) }
    }
}

/// Biến chuyển trạng thái scene thành "lần mở app" thật. Chớp inactive (trung
/// tâm điều khiển, hộp thoại xin quyền) không phải lần mở; lần đầu vào màn chính
/// ngay sau khi đăng nhập / đăng ký trong lần chạy này cũng không.
struct ActivationTracker {
    /// Lần đầu xác định phiên trong process: đã đăng nhập sẵn hay chưa
    private(set) var signedInAtLaunch: Bool?
    private var launchConsumed = false
    private var backgroundAt: Date?

    mutating func noteAuthResolved(authenticated: Bool) {
        if signedInAtLaunch == nil { signedInAtLaunch = authenticated }
    }

    mutating func noteBackground(_ now: Date) { backgroundAt = now }

    /// nil = không phải lần mở app.
    mutating func becameActive(now: Date, pending: OpenSource?) -> OpenSource? {
        if let at = backgroundAt {
            backgroundAt = nil
            launchConsumed = true
            return pending ?? .foreground(awaySeconds: now.timeIntervalSince(at))
        }
        guard !launchConsumed else { return nil }
        launchConsumed = true
        return signedInAtLaunch == true ? (pending ?? .launch) : nil
    }
}
