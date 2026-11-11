import SwiftUI
import UserNotifications
import WidgetKit
import TipKit

/// Điều phối giới thiệu tính năng (spec 2026-10-15-shared-word-source-design.md §6):
/// màn chào / "Có gì mới" lúc mở, thẻ "Bắt đầu với Wordly", gợi ý thêm widget.
@MainActor
final class OnboardingCenter: ObservableObject {
    static let shared = OnboardingCenter()

    @Published var intro: Onboarding.Intro = .none
    @Published private(set) var checklist = Onboarding.checklist(savedCount: 0, hasLockWidget: false, hasHomeWidget: false, pushOn: false)
    @Published private(set) var cardState: Onboarding.CardState = .hidden
    @Published var nudgeWord: WidgetWordItem?
    /// Tài khoản đang dùng — mọi cờ (trừ onboarding 4 màn) lưu theo tài khoản
    private(set) var userId = ""
    private var decidedUser: String?
    private var introThisSession = false
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        flowSeen = defaults.bool(forKey: Onboarding.Key.flowSeen)
    }

    /// Chế độ xem trước (UI test) chỉ bật khi có `-WordlyOnboarding` — không chặn test khác.
    static var enabled: Bool {
        #if DEBUG
        if PreviewMode.isOn { return CommandLine.arguments.contains("-WordlyOnboarding") }
        #endif
        return true
    }

    /// Cờ theo tài khoản: tài khoản cũ đã xem/ẩn không ảnh hưởng tài khoản mới trên cùng máy.
    private func key(_ base: String) -> String { "\(base).\(userId)" }

    private var savedCount: Int { AppGroupStorage.shared.words.filter(\.isSaved).count }

    var isCardDismissed: Bool { defaults.bool(forKey: key(Onboarding.Key.cardDismissed)) }

    // MARK: Onboarding 4 màn (theo máy)
    @Published private(set) var flowSeen = false
    func markFlowSeen() {
        defaults.set(true, forKey: Onboarding.Key.flowSeen)
        flowSeen = true
    }

    /// Mỗi lần vào app với một tài khoản (kể cả đổi tài khoản trong cùng lần chạy).
    func decideIntro(userId: String, savedCount: Int) {
        guard Self.enabled, decidedUser != userId else { return }
        self.userId = userId
        decidedUser = userId
        intro = Onboarding.showWhatsNew(savedCount: savedCount,
                                        seenVersion: defaults.string(forKey: key(Onboarding.Key.whatsNewSeen))) ? .whatsNew : .none
        introThisSession = intro != .none
    }

    /// Chờ quyết định "Có gì mới" của lần vào app này (false = hết giờ / bị huỷ).
    func waitIntroDecided(timeout: TimeInterval) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Self.enabled && decidedUser == nil {
            guard Date() < deadline else { return false }
            do { try await Task.sleep(for: .milliseconds(200)) } catch { return false }
        }
        return true
    }

    /// Xem xong "Có gì mới".
    func finishIntro() {
        defaults.set(Onboarding.whatsNewVersion, forKey: key(Onboarding.Key.whatsNewSeen))
        intro = .none
    }

    /// Kiểm lại thẻ "Bắt đầu" — khi mở app, quay lại app (vừa thêm widget ngoài app), sau khi lưu từ.
    func refreshChecklist() async {
        guard Self.enabled, !userId.isEmpty else { cardState = .hidden; return }
        let kinds = await Self.installedFamilies()
        let pushOn = await Self.pushOn()
        checklist = Onboarding.checklist(savedCount: savedCount, hasLockWidget: kinds.lock,
                                         hasHomeWidget: kinds.home, pushOn: pushOn)
        cardState = Onboarding.card(dismissed: isCardDismissed, allDone: checklist.allDone,
                                    celebrated: defaults.bool(forKey: key(Onboarding.Key.cardCelebrated)))
        if cardState == .celebrate { defaults.set(true, forKey: key(Onboarding.Key.cardCelebrated)) }
    }

    func dismissCard() {
        defaults.set(true, forKey: key(Onboarding.Key.cardDismissed))
        cardState = .hidden
    }

    /// Lời mời bật nhắc ôn vừa hiện → gợi ý widget không cùng ngày.
    func notePushInvite() { defaults.set(Date(), forKey: key(Onboarding.Key.pushInviteDay)) }

    /// Sau khi lưu từ: cập nhật thẻ + gợi ý thêm widget (một lần, từ thứ 3).
    func afterSave() async {
        await refreshChecklist()
        guard Self.enabled else { return }
        let kinds = await Self.installedFamilies()
        guard Onboarding.shouldNudgeWidget(savedCount: savedCount, hasWidget: kinds.lock || kinds.home,
                                           nudgeShown: defaults.bool(forKey: key(Onboarding.Key.widgetNudgeShown)),
                                           pushInviteDay: defaults.object(forKey: key(Onboarding.Key.pushInviteDay)) as? Date,
                                           now: Date(), introThisSession: introThisSession),
              let word = AppGroupStorage.shared.words.first(where: \.isSaved) else { return }
        defaults.set(true, forKey: key(Onboarding.Key.widgetNudgeShown))
        nudgeWord = word
    }

    static func installedFamilies() async -> (lock: Bool, home: Bool) {
        let infos: [WidgetInfo] = await withCheckedContinuation { cont in
            WidgetCenter.shared.getCurrentConfigurations { cont.resume(returning: (try? $0.get()) ?? []) }
        }
        let wordly = infos.filter { $0.kind == WidgetScheduleUpload.widgetKind }
        let lock = wordly.contains { [.accessoryRectangular, .accessoryCircular, .accessoryInline].contains($0.family) }
        let home = wordly.contains { [.systemSmall, .systemMedium, .systemLarge].contains($0.family) }
        return (lock, home)
    }

    static func pushOn() async -> Bool {
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        guard status == .authorized || status == .provisional || PreviewModeFlag.isOn else { return false }
        return (try? await APIClient.shared.fetchPushPreferences())??.enabled ?? false
    }
}

/// Cờ chế độ xem trước dùng được cả bản Release (luôn false).
enum PreviewModeFlag {
    static var isOn: Bool {
        #if DEBUG
        return PreviewMode.isOn
        #else
        return false
        #endif
    }
}

/// Widget thu nhỏ cho màn chào / gợi ý (không phải widget thật).
struct WidgetMock: View {
    let word: String
    let meaning: String
    let compact: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(word).font(.system(size: compact ? 18 : 22, weight: .bold))
            Text(meaning).font(.system(size: 13)).opacity(0.85).lineLimit(2)
        }
        .foregroundStyle(.white)
        .padding(14)
        .frame(width: compact ? 140 : 170, height: compact ? 140 : 170, alignment: .leading)
        .background(LinearGradient(colors: [Color(hex: "#0B6FA4"), Color(hex: "#2E7D0B")],
                                   startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 24))
        .shadow(color: .black.opacity(0.2), radius: 10, y: 4)
    }
}

// MARK: - "Có gì mới" (tài khoản cũ)

struct WhatsNewView: View {
    let onDone: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Có gì mới ở \(Onboarding.whatsNewVersion)")
                .font(WordlyFonts.display(26)).foregroundStyle(WordlyColors.ink)
                .padding(.top, 24)
            row("photo.on.rectangle.angled", "Theme ảnh cho widget", "Góc học tập, thiên nhiên, vũ trụ… cùng 10 theme màu.")
            row("pin.fill", "Từ ghim", "Ghim từ khó để gặp nhiều gấp đôi trên widget và thông báo.")
            row("bell.badge.fill", "Nhắc ôn thông minh hơn", "Không trùng từ đang trên widget, ưu tiên từ lâu chưa gặp.")
            row("square.grid.2x2.fill", "Trang Widget mới", "Cài đặt cả 2 loại widget ở một chỗ, có hướng dẫn thêm widget.")
            Spacer(minLength: 0)
            Button(action: onDone) {
                Text("Tuyệt!")
                    .font(WordlyFonts.body(16, weight: .bold))
                    .frame(maxWidth: .infinity).padding(.vertical, 16)
                    .background(WordlyColors.electric).foregroundStyle(WordlyColors.onElectric)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            .accessibilityIdentifier("whatsNewDone")
        }
        .padding(.horizontal, 24).padding(.bottom, 16)
        .screenBackground()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("whatsNew")
        .presentationDetents([.large])
        .interactiveDismissDisabled(false)
    }

    private func row(_ icon: String, _ title: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon).font(.system(size: 20)).foregroundStyle(WordlyColors.electric)
                .frame(width: 40, height: 40).background(WordlyColors.electricSubtle).clipShape(RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(WordlyFonts.body(16, weight: .bold)).foregroundStyle(WordlyColors.ink)
                Text(text).font(WordlyFonts.body(14)).foregroundStyle(WordlyColors.inkSoft)
            }
        }
    }
}

// MARK: - Thẻ "Bắt đầu với Wordly" (đầu tab Dịch)

struct StartChecklistCard: View {
    @ObservedObject var center: OnboardingCenter
    let onSaveWord: () -> Void
    @State private var guide: WidgetSettingsView.Tab?
    @State private var showPush = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(center.cardState == .celebrate ? "Xong hết rồi 🎉" : "Bắt đầu với Wordly")
                    .font(WordlyFonts.body(16, weight: .bold)).foregroundStyle(WordlyColors.ink)
                if center.cardState == .show {
                    Text("\(center.checklist.doneCount)/4")
                        .font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.electric)
                }
                Spacer()
                Button { center.dismissCard() } label: {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
                        .frame(width: 30, height: 30)
                }
                .accessibilityLabel("Ẩn")
                .accessibilityIdentifier("checklistDismiss")
            }
            if center.cardState == .show {
                item("savedWord", "Lưu từ đầu tiên", done: center.checklist.savedWord, action: onSaveWord)
                item("lockWidget", "Đưa từ lên màn hình khoá", done: center.checklist.lockWidget) { guide = .lock }
                item("homeWidget", "Thêm widget màn hình chính", done: center.checklist.homeWidget) { guide = .home }
                item("push", "Bật nhắc ôn", done: center.checklist.push) { showPush = true }
            } else {
                Text("Bạn đã dùng đủ các tính năng chính của Wordly.")
                    .font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.inkSoft)
            }
        }
        .padding(14)
        .background(WordlyColors.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(WordlyColors.electric.opacity(0.35), lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("startChecklist")
        .sheet(item: $guide) { kind in WidgetAddGuideView(kind: kind) }
        .sheet(isPresented: $showPush, onDismiss: { Task { await center.refreshChecklist() } }) {
            NavigationStack { PushSettingsView() }
        }
    }

    private func item(_ id: String, _ title: String, done: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: done ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 20)).foregroundStyle(done ? WordlyColors.electric : WordlyColors.inkSoft)
                Text(title).font(WordlyFonts.body(14, weight: .medium))
                    .foregroundStyle(done ? WordlyColors.inkSoft : WordlyColors.ink)
                    .strikethrough(done)
                Spacer()
                if !done { Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(WordlyColors.inkSoft) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(done)
        .accessibilityIdentifier("checklist.\(id)")
        .accessibilityAddTraits(done ? .isSelected : [])
    }
}

extension WidgetSettingsView.Tab: Identifiable { var id: String { rawValue } }

// MARK: - Hướng dẫn thêm widget (từ thẻ Bắt đầu / gợi ý)

struct WidgetAddGuideView: View {
    let kind: WidgetSettingsView.Tab
    @Environment(\.dismiss) private var dismiss
    @AppStorage("widgetHub.tab") private var hubTab = WidgetSettingsView.Tab.lock.rawValue

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    ForEach(Array(WidgetSettingsView.addSteps(kind).enumerated()), id: \.offset) { i, text in
                        HStack(alignment: .center, spacing: 14) {
                            if let img = UIImage(named: "widget-guide-\(kind.rawValue)-\(i + 1)") {
                                Image(uiImage: img).resizable().scaledToFit().frame(width: 130, height: 130)
                                    .accessibilityHidden(true)
                            }
                            HStack(alignment: .top, spacing: 8) {
                                Text("\(i + 1)").font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.onElectric)
                                    .frame(width: 24, height: 24).background(WordlyColors.electric).clipShape(Circle())
                                Text(text).font(WordlyFonts.body(15)).foregroundStyle(WordlyColors.ink)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    NavigationLink {
                        WidgetSettingsView().onAppear { hubTab = kind.rawValue }
                    } label: {
                        Label("Mở cài đặt widget", systemImage: "slider.horizontal.3")
                            .font(WordlyFonts.body(15, weight: .semibold))
                    }
                    .padding(.top, 4)
                }
                .padding(20)
            }
            .screenBackground()
            .navigationTitle(kind == .lock ? "Thêm widget màn hình khoá" : "Thêm widget màn hình chính")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill").font(.system(size: 26))
                            .symbolRenderingMode(.hierarchical).foregroundStyle(WordlyColors.inkSoft)
                    }
                    .accessibilityLabel("Đóng")
                    .accessibilityIdentifier("widgetAddGuideClose")
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("widgetAddGuide")
    }
}

// MARK: - Gợi ý thêm widget (sau khi lưu từ thứ 3, một lần)

struct WidgetNudgeSheet: View {
    let word: WidgetWordItem
    @Environment(\.dismiss) private var dismiss
    @State private var showGuide = false

    var body: some View {
        VStack(spacing: 18) {
            WidgetMock(word: word.word, meaning: word.meaning, compact: false)
                .padding(.top, 24)
            Text("Đưa “\(word.word)” lên màn hình khoá?")
                .font(WordlyFonts.display(22)).foregroundStyle(WordlyColors.ink)
                .multilineTextAlignment(.center)
            Text("Liếc điện thoại là ôn — widget tự đổi từ theo giờ bạn chọn.")
                .font(WordlyFonts.body(15)).foregroundStyle(WordlyColors.inkSoft)
                .multilineTextAlignment(.center)
            Button { showGuide = true } label: {
                Text("Xem cách thêm")
                    .font(WordlyFonts.body(16, weight: .bold))
                    .frame(maxWidth: .infinity).padding(.vertical, 16)
                    .background(WordlyColors.electric).foregroundStyle(WordlyColors.onElectric)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            Button("Để sau") { dismiss() }
                .font(WordlyFonts.body(15, weight: .semibold)).foregroundStyle(WordlyColors.inkSoft)
        }
        .padding(.horizontal, 24).padding(.bottom, 12)
        .presentationDetents([.medium, .large])
        .screenBackground()
        .sheet(isPresented: $showGuide, onDismiss: { dismiss() }) { WidgetAddGuideView(kind: .lock) }
    }
}

// MARK: - Gợi ý TipKit (spec 2026-10-15 §6.5)

struct PinTip: Tip {
    var title: Text { Text("Ghim từ này") }
    var message: Text? { Text("Từ ghim được nhắc nhiều gấp đôi trên widget và thông báo.") }
    var image: Image? { Image(systemName: "pin.fill") }
}

struct RemindedTip: Tip {
    var title: Text { Text("Từ Wordly đã nhắc bạn") }
    var message: Text? { Text("Xem lại các từ đã hiện trên widget và thông báo trong 7 ngày qua.") }
    var image: Image? { Image(systemName: "bell.fill") }
}
