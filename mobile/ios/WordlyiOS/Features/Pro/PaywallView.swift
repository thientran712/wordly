import SwiftUI

/// Paywall Wordly Pro (spec 2026-10-16 §2, §9; App Store 3.1.1 / 3.1.2):
/// giá gia hạn (Apple trả về) là chữ to nhất, quy ra tháng chỉ là dòng phụ nhỏ;
/// nói rõ tự gia hạn + cách huỷ; có Khôi phục, Điều khoản, Quyền riêng tư.
/// Đang Pro → chế độ quản lý, không có nút mua (không bao giờ trả hai lần).
struct PaywallView: View {
    let reason: PaywallReason
    @ObservedObject var store: ProStore = .shared
    @Environment(\.dismiss) private var dismiss
    @State private var selected = "wordly.pro.yearly"
    @State private var busy = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    header
                    if store.mode == .manage { manage } else { purchase }
                    footer
                }
                .padding(.horizontal, 20).padding(.bottom, 24)
            }
            .screenBackground()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Đóng")
                }
            }
            // Kiểm lại giao dịch trên máy trước — người đã trả không bao giờ thấy nút mua
            .task {
                await store.refreshLocal()
                if store.plans.isEmpty { await store.loadPlans() }
                await store.refreshStatus()
            }
            .alert(store.message ?? "", isPresented: Binding(get: { store.message != nil }, set: { if !$0 { store.message = nil } })) {
                Button("OK", role: .cancel) {}
            }
        }
    }

    // MARK: Đầu trang

    private var header: some View {
        VStack(spacing: 10) {
            ProBadge(large: true).padding(.top, 8)
            Text(store.mode == .manage ? "Bạn đang dùng Wordly Pro" : reason.headline)
                .font(WordlyFonts.display(24)).foregroundStyle(WordlyColors.ink)
                .multilineTextAlignment(.center)
                .accessibilityIdentifier("paywall.headline")
            if store.mode == .purchase && reason.offersUnsaveHint {
                Text("Từ đã lưu vẫn giữ nguyên. Bạn có thể bỏ lưu bớt từ đã thuộc để lưu từ mới.")
                    .font(WordlyFonts.body(14)).foregroundStyle(WordlyColors.inkSoft)
                    .multilineTextAlignment(.center)
            }
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Self.benefits, id: \.1) { icon, text in
                    HStack(spacing: 12) {
                        Image(systemName: icon).foregroundStyle(WordlyColors.electric).frame(width: 24)
                        Text(text).font(WordlyFonts.body(15)).foregroundStyle(WordlyColors.ink)
                        Spacer(minLength: 0)
                    }
                }
            }
            .wordlyCard(padding: 16)
        }
    }

    static let benefits: [(String, String)] = [
        ("bookmark.fill", "Lưu từ không giới hạn"),
        ("text.bubble.fill", "Dịch câu, ảnh, giọng nói không giới hạn"),
        ("book.fill", "Tra từ điển chi tiết không giới hạn"),
        ("paintpalette.fill", "Tất cả theme widget, ảnh của bạn, tuỳ chỉnh màu"),
        ("bell.badge.fill", "Tối đa 10 khung giờ nhắc ôn mỗi ngày"),
    ]

    // MARK: Mua

    private var purchase: some View {
        VStack(spacing: 12) {
            if store.plans.isEmpty {
                ProgressView().padding(.vertical, 24)
            }
            ForEach(store.plans) { plan in planRow(plan) }

            Button {
                guard let plan = store.plans.first(where: { $0.id == selected }), !busy else { return }
                busy = true
                Task {
                    let outcome = await store.purchase(plan)
                    busy = false
                    switch outcome {
                    case .purchased: dismiss()
                    case .pending: store.message = "Giao dịch đang chờ duyệt. Wordly Pro sẽ mở khi Apple xác nhận — bạn chưa bị trừ tiền."
                    case .failed(let m): store.message = m
                    case .cancelled: break
                    }
                }
            } label: {
                Group {
                    if busy { ProgressView().tint(WordlyColors.onElectric) } else { Text("Tiếp tục") }
                }
                .font(WordlyFonts.body(17, weight: .bold))
                .frame(maxWidth: .infinity).padding(.vertical, 16)
                .background(WordlyColors.electric).foregroundStyle(WordlyColors.onElectric)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            .disabled(store.plans.isEmpty || busy)
            .accessibilityIdentifier("paywall.continue")

            Text(disclosure)
                .font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkGhost)
                .multilineTextAlignment(.center)
        }
    }

    private func planRow(_ plan: PaywallPlan) -> some View {
        let on = plan.id == selected
        return Button { selected = plan.id } label: {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22)).foregroundStyle(on ? WordlyColors.electric : WordlyColors.inkGhost)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(plan.period == .year ? "Gói năm" : "Gói tháng")
                            .font(WordlyFonts.body(15, weight: .semibold)).foregroundStyle(WordlyColors.ink)
                        if plan.period == .year, let saving {
                            Text("Tiết kiệm \(saving)%")
                                .font(WordlyFonts.body(11, weight: .bold))
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(WordlyColors.sunshineSoft).foregroundStyle(WordlyColors.sunshineText)
                                .clipShape(Capsule())
                        }
                    }
                    // Giá gia hạn — chữ to nhất trên dòng
                    Text("\(plan.displayPrice) / \(plan.period == .year ? "năm" : "tháng")")
                        .font(WordlyFonts.body(20, weight: .bold)).foregroundStyle(WordlyColors.ink)
                    if plan.period == .year {
                        Text("tương đương \(Self.vnd(PaywallPricing.perMonth(yearly: plan.price)))/tháng")
                            .font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .background(on ? WordlyColors.electricSubtle : WordlyColors.cardBG)
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(on ? WordlyColors.electric : WordlyColors.cardBorder, lineWidth: on ? 2 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("paywall.plan.\(plan.period == .year ? "yearly" : "monthly")")
    }

    private var saving: Int? {
        guard let m = store.plans.first(where: { $0.period == .month }),
              let y = store.plans.first(where: { $0.period == .year }) else { return nil }
        let p = PaywallPricing.savingPercent(monthly: m.price, yearly: y.price)
        return p > 0 ? p : nil
    }

    private var disclosure: String {
        let plan = store.plans.first { $0.id == selected }
        let price = plan.map { "\($0.displayPrice) mỗi \($0.period == .year ? "năm" : "tháng")" } ?? "theo gói đã chọn"
        return "Thanh toán qua tài khoản Apple khi xác nhận mua. Gói tự gia hạn \(price) trừ khi bạn huỷ ít nhất 24 giờ trước khi hết kỳ. Huỷ bất cứ lúc nào trong Cài đặt › Apple ID › Đăng ký."
    }

    static func vnd(_ v: Decimal) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.groupingSeparator = "."
        f.maximumFractionDigits = 0
        return (f.string(from: NSDecimalNumber(decimal: v)) ?? "\(v)") + " ₫"
    }

    // MARK: Đang Pro — quản lý

    private var manage: some View {
        VStack(spacing: 12) {
            if let until = ProDates.display(store.status.expiresAt) {
                Text(store.status.inGrace ? "Apple đang thử thanh toán lại — Pro vẫn mở đến \(until)." : "Gói của bạn có hiệu lực đến \(until).")
                    .font(WordlyFonts.body(14)).foregroundStyle(WordlyColors.inkSoft).multilineTextAlignment(.center)
            }
            manageButton("Quản lý gói (đổi / huỷ)", icon: "creditcard") { await store.manageSubscriptions() }
            if store.currentTransactionId != nil {
                manageButton("Yêu cầu hoàn tiền", icon: "arrow.uturn.backward.circle") { await store.requestRefund() }
            }
        }
    }

    private func manageButton(_ title: String, icon: String, action: @escaping () async -> Void) -> some View {
        Button { Task { await action() } } label: {
            Label(title, systemImage: icon)
                .font(WordlyFonts.body(15, weight: .semibold))
                .frame(maxWidth: .infinity).padding(.vertical, 14)
                .background(WordlyColors.surface).foregroundStyle(WordlyColors.ink)
                .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    // MARK: Chân trang — bắt buộc theo App Store

    private var footer: some View {
        HStack(spacing: 16) {
            Button("Khôi phục giao dịch") { Task { await store.restore() } }
                .accessibilityIdentifier("paywall.restore")
            Link("Điều khoản", destination: LegalLinks.terms)
            Link("Quyền riêng tư", destination: LegalLinks.privacy)
        }
        .font(WordlyFonts.body(13, weight: .semibold))
        .foregroundStyle(WordlyColors.inkSoft)
    }
}

/// Huy hiệu "Pro" — dùng cạnh tính năng bị khoá để khoe.
struct ProBadge: View {
    var large = false
    var locked = false

    var body: some View {
        HStack(spacing: 3) {
            if locked { Image(systemName: "lock.fill").font(.system(size: large ? 13 : 9, weight: .bold)) }
            Text("PRO").font(.system(size: large ? 15 : 10, weight: .heavy))
        }
        .padding(.horizontal, large ? 12 : 6).padding(.vertical, large ? 5 : 2)
        .background(LinearGradient(colors: [WordlyColors.duoOrange, WordlyColors.duoYellow], startPoint: .leading, endPoint: .trailing))
        .foregroundStyle(.white)
        .clipShape(Capsule())
        .accessibilityLabel(locked ? "Cần Wordly Pro" : "Wordly Pro")
    }
}

enum ProDates {
    /// "2027-01-01T00:00:00Z" → "01/01/2027"
    static func display(_ iso: String?) -> String? {
        guard let iso else { return nil }
        let p = ISO8601DateFormatter()
        p.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = p.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let date else { return nil }
        let f = DateFormatter()
        f.dateFormat = "dd/MM/yyyy"
        f.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")
        return f.string(from: date)
    }
}

/// Dòng bộ đếm luôn thấy ("Còn 3/5 lượt …") — chạm để xem Pro.
struct ProCounterLine: View {
    let text: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(text).font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
                ProBadge()
                Spacer(minLength: 0)
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("pro.counter")
    }
}
