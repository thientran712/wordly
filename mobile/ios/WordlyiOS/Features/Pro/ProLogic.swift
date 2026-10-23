import Foundation

// Wordly Pro — logic thuần (spec docs/superpowers/specs/2026-10-16-pro-paywall-design.md).

/// Giới hạn nào đang chặn (khớp `code` server trả trong lỗi 402).
enum LimitCode: String, Equatable {
    case savedWords = "limit_saved_words"
    case advancedTranslate = "limit_advanced_translate"
    case dictionary = "limit_dictionary"
    case pushSlots = "limit_push_slots"
    /// Hết lượt dịch (quảng cáo, spec 2026-10-23) — mời xem quảng cáo thưởng, không mở paywall
    case translate = "limit_translate"
}

extension APIError {
    /// Lỗi HTTP → APIError. 402 = chạm giới hạn bản miễn phí, 426 = app cũ phải cập nhật.
    static func from(status: Int, body: Data) -> APIError {
        struct Body: Decodable { let error: String?; let code: String?; let limit: Int? }
        let parsed = try? JSONDecoder().decode(Body.self, from: body)
        if status == 426, let parsed, parsed.code == "update_required" {
            return .updateRequired(parsed.error ?? "Hãy cập nhật Wordly trên App Store để tiếp tục.")
        }
        if status == 402, let parsed, let code = parsed.code.flatMap(LimitCode.init(rawValue:)) {
            return .limitReached(code, parsed.error ?? "Đã chạm giới hạn bản miễn phí.", parsed.limit)
        }
        return .serverError("HTTP \(status): \(String(data: body, encoding: .utf8) ?? "Unknown error")")
    }
}

/// Trạng thái gói + lượt còn lại (GET /api/billing/status).
struct BillingStatus: Decodable, Equatable {
    struct Counter: Decodable, Equatable {
        let used: Int
        /// nil = không giới hạn
        let limit: Int?
        var remaining: Int? { limit.map { max(0, $0 - used) } }
    }
    struct Slots: Decodable, Equatable { let limit: Int }
    struct Limits: Decodable, Equatable {
        let savedWords: Counter
        let advancedTranslate: Counter
        let dictionary: Counter
        let pushSlots: Slots
        enum CodingKeys: String, CodingKey {
            case savedWords = "saved_words", advancedTranslate = "advanced_translate", dictionary, pushSlots = "push_slots"
        }
    }

    let pro: Bool
    let expiresAt: String?
    let source: String?
    let inGrace: Bool
    let enforced: Bool
    let limits: Limits
    /// Còn gói Apple đang chạy (để cảnh báo trước khi xoá tài khoản)
    var hasActiveSubscription = false
    /// Quảng cáo (spec 2026-10-23) — server cũ không trả → nil
    var ads: AdsStatus?

    enum CodingKeys: String, CodingKey {
        case pro, expiresAt = "expires_at", source, inGrace = "in_grace", enforced, limits
        case hasActiveSubscription = "has_active_subscription", ads
    }

    init(pro: Bool, expiresAt: String?, source: String?, inGrace: Bool, enforced: Bool, limits: Limits,
         hasActiveSubscription: Bool = false) {
        (self.pro, self.expiresAt, self.source, self.inGrace, self.enforced, self.limits, self.hasActiveSubscription) =
            (pro, expiresAt, source, inGrace, enforced, limits, hasActiveSubscription)
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        pro = try c.decode(Bool.self, forKey: .pro)
        expiresAt = try c.decodeIfPresent(String.self, forKey: .expiresAt)
        source = try c.decodeIfPresent(String.self, forKey: .source)
        inGrace = try c.decodeIfPresent(Bool.self, forKey: .inGrace) ?? false
        enforced = try c.decodeIfPresent(Bool.self, forKey: .enforced) ?? false
        limits = try c.decode(Limits.self, forKey: .limits)
        hasActiveSubscription = try c.decodeIfPresent(Bool.self, forKey: .hasActiveSubscription) ?? false
        ads = try c.decodeIfPresent(AdsStatus.self, forKey: .ads)
    }

    var isPro: Bool { pro }
    /// Hiện bộ đếm / khoá chỉ khi server đang chặn và người dùng chưa Pro.
    var showsLimits: Bool { enforced && !pro }

    /// Chưa tải được trạng thái → không khoá gì (server vẫn chặn nếu cần).
    static let unlimited = BillingStatus(
        pro: false, expiresAt: nil, source: nil, inGrace: false, enforced: false,
        limits: Limits(savedWords: Counter(used: 0, limit: nil), advancedTranslate: Counter(used: 0, limit: nil),
                       dictionary: Counter(used: 0, limit: nil), pushSlots: Slots(limit: 10)))
}

enum ForceUpdate {
    static func required(build: Int, minBuild: Int) -> Bool { minBuild > 0 && build < minBuild }

    static var currentBuild: Int {
        Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "") ?? 0
    }
}

enum PaywallPricing {
    /// Giá năm quy ra tháng — chỉ là dòng phụ, cỡ chữ nhỏ hơn giá năm (App Store 3.1.2).
    static func perMonth(yearly: Decimal) -> Decimal {
        var v = yearly / 12
        var r = Decimal()
        NSDecimalRound(&r, &v, 0, .plain)
        return r
    }

    /// % tiết kiệm của gói năm so với 12 tháng lẻ (làm tròn xuống — không nói quá).
    static func savingPercent(monthly: Decimal, yearly: Decimal) -> Int {
        let full = monthly * 12
        guard full > 0 else { return 0 }
        let pct = NSDecimalNumber(decimal: (full - yearly) / full * 100).doubleValue
        return max(0, Int(pct.rounded(.down)))
    }
}

/// Mời nâng cấp không theo ngữ cảnh: một lần sau ngày đầu kể từ lần lưu từ đầu tiên,
/// nhắc lại ngày 7; tối đa 2 lần (spec §4).
enum SoftPaywall {
    static func shouldShow(isPro: Bool, enforced: Bool, firstSave: Date?, now: Date, shownCount: Int) -> Bool {
        guard !isPro, enforced, let firstSave, shownCount < 2 else { return false }
        let days = now.timeIntervalSince(firstSave) / 86_400
        return shownCount == 0 ? days >= 1 : days >= 7
    }
}

/// Câu bộ đếm luôn thấy (spec §2). nil = không giới hạn → không hiện.
enum ProCopy {
    static func advanced(_ c: BillingStatus.Counter) -> String? {
        c.limit.map { "Còn \(max(0, $0 - c.used))/\($0) lượt dịch câu, ảnh, giọng nói hôm nay" }
    }
    static func saved(_ c: BillingStatus.Counter) -> String? {
        c.limit.map { "Đã lưu \(c.used)/\($0) từ" }
    }
    static func dictionary(_ c: BillingStatus.Counter) -> String? {
        c.remaining.map { "Còn \($0) lượt tra từ mới hôm nay" }
    }
}

/// Vì sao mở paywall — tiêu đề nói rõ đang chặn gì.
enum PaywallReason: Equatable, Identifiable {
    case limit(LimitCode, Int?)
    case theme
    case customStyle
    case general

    var id: String {
        switch self {
        case .limit(let c, _): return c.rawValue
        case .theme: return "theme"
        case .customStyle: return "custom"
        case .general: return "general"
        }
    }

    var headline: String {
        switch self {
        case .limit(.savedWords, let n): return "Bạn đã lưu đủ \(n ?? 30) từ"
        case .limit(.advancedTranslate, let n): return "Hết \(n ?? 5) lượt dịch nâng cao hôm nay"
        case .limit(.dictionary, let n): return "Hết \(n ?? 5) lượt tra từ mới hôm nay"
        case .limit(.pushSlots, _): return "Thêm khung giờ nhắc ôn với Pro"
        case .limit(.translate, _): return "Hết lượt dịch hôm nay"
        case .theme: return "Mở khoá toàn bộ theme"
        case .customStyle: return "Ảnh của bạn và tuỳ chỉnh màu"
        case .general: return "Học không giới hạn với Wordly Pro"
        }
    }

    /// Đủ 30 từ → nhắc có thể bỏ lưu bớt từ cũ (không bao giờ xoá dữ liệu).
    var offersUnsaveHint: Bool {
        if case .limit(.savedWords, _) = self { return true }
        return false
    }
}

/// Khung giờ nhắc ôn: miễn phí 1, Pro tối đa 10 (server chặn, app hiện khoá).
enum ReminderAccess {
    static func isLocked(index: Int, limit: Int) -> Bool { index >= limit }
    static func canAdd(count: Int, limit: Int) -> Bool { count < limit }
}
