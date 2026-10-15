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
    private var decided = false
    private var introThisSession = false
    private let defaults = UserDefaults.standard

    /// Chế độ xem trước (UI test) chỉ bật khi có `-WordlyOnboarding` — không chặn test khác.
    static var enabled: Bool {
        #if DEBUG
        if PreviewMode.isOn { return CommandLine.arguments.contains("-WordlyOnboarding") }
        #endif
        return true
    }

    private var savedCount: Int { AppGroupStorage.shared.words.filter(\.isSaved).count }

    /// Gọi một lần mỗi lần mở app, SAU khi đồng bộ từ (để biết tài khoản mới hay cũ).
    func decideIntro() {
        guard Self.enabled, !decided else { return }
        decided = true
        intro = Onboarding.intro(savedCount: savedCount,
                                 welcomeSeen: defaults.bool(forKey: Onboarding.Key.welcomeSeen),
                                 whatsNewSeen: defaults.string(forKey: Onboarding.Key.whatsNewSeen))
        introThisSession = intro != .none
    }

    /// Xem xong (hoặc bỏ qua) màn chào / "Có gì mới".
    func finishIntro() {
        if intro == .welcome { defaults.set(true, forKey: Onboarding.Key.welcomeSeen) }
        defaults.set(Onboarding.whatsNewVersion, forKey: Onboarding.Key.whatsNewSeen)
        intro = .none
    }

    /// Kiểm lại thẻ "Bắt đầu" — khi mở app, quay lại app (vừa thêm widget ngoài app), sau khi lưu từ.
    func refreshChecklist() async {
        guard Self.enabled else { cardState = .hidden; return }
        let kinds = await Self.installedFamilies()
        let pushOn = await Self.pushOn()
        checklist = Onboarding.checklist(savedCount: savedCount, hasLockWidget: kinds.lock,
                                         hasHomeWidget: kinds.home, pushOn: pushOn)
        cardState = Onboarding.card(dismissed: defaults.bool(forKey: Onboarding.Key.cardDismissed),
                                    allDone: checklist.allDone,
                                    celebrated: defaults.bool(forKey: Onboarding.Key.cardCelebrated))
        if cardState == .celebrate { defaults.set(true, forKey: Onboarding.Key.cardCelebrated) }
    }

    func dismissCard() {
        defaults.set(true, forKey: Onboarding.Key.cardDismissed)
        cardState = .hidden
    }

    /// Lời mời bật nhắc ôn vừa hiện → gợi ý widget không cùng ngày.
    func notePushInvite() { defaults.set(Date(), forKey: Onboarding.Key.pushInviteDay) }

    /// Sau khi lưu từ: cập nhật thẻ + gợi ý thêm widget (một lần, từ thứ 3).
    func afterSave() async {
        await refreshChecklist()
        guard Self.enabled else { return }
        let kinds = await Self.installedFamilies()
        guard Onboarding.shouldNudgeWidget(savedCount: savedCount, hasWidget: kinds.lock || kinds.home,
                                           nudgeShown: defaults.bool(forKey: Onboarding.Key.widgetNudgeShown),
                                           pushInviteDay: defaults.object(forKey: Onboarding.Key.pushInviteDay) as? Date,
                                           now: Date(), introThisSession: introThisSession),
              let word = AppGroupStorage.shared.words.first(where: \.isSaved) else { return }
        defaults.set(true, forKey: Onboarding.Key.widgetNudgeShown)
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

// MARK: - Màn chào 3 trang (tài khoản mới)

struct WelcomeView: View {
    let onDone: () -> Void
    @State private var page = 0

    private struct Page { let title: String; let text: String }
    private let pages = [
        Page(title: "Dịch & lưu từ", text: "Dịch từ, câu, ảnh hay giọng nói. Bấm Lưu để Wordly giúp bạn ôn."),
        Page(title: "Từ hiện ngay trên máy", text: "Thêm widget vào màn hình khoá hoặc màn hình chính — liếc là học."),
        Page(title: "Nhắc ôn đúng giờ", text: "Chọn giờ, Wordly nhắc từng từ để bạn không quên."),
    ]

    var body: some View {
        ZStack {
            WordlyColors.background.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    Button("Bỏ qua") { onDone() }
                        .font(WordlyFonts.body(15, weight: .semibold))
                        .foregroundStyle(WordlyColors.inkSoft)
                        .accessibilityIdentifier("welcomeSkip")
                }
                .padding(.horizontal, 20).padding(.top, 8)

                TabView(selection: $page) {
                    ForEach(pages.indices, id: \.self) { i in
                        VStack(spacing: 24) {
                            Spacer(minLength: 8)
                            illustration(i).frame(height: 280)
                            Text(pages[i].title)
                                .font(WordlyFonts.display(28))
                                .foregroundStyle(WordlyColors.ink)
                            Text(pages[i].text)
                                .font(WordlyFonts.body(16))
                                .foregroundStyle(WordlyColors.inkSoft)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 32)
                            Spacer(minLength: 8)
                        }
                        .tag(i)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .always))
                .indexViewStyle(.page(backgroundDisplayMode: .always))

                Button {
                    if page < pages.count - 1 { withAnimation { page += 1 } } else { onDone() }
                } label: {
                    Text(page < pages.count - 1 ? "Tiếp" : "Bắt đầu")
                        .font(WordlyFonts.body(16, weight: .bold))
                        .frame(maxWidth: .infinity).padding(.vertical, 16)
                        .background(WordlyColors.electric).foregroundStyle(WordlyColors.onElectric)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }
                .accessibilityIdentifier("welcomeNext")
                .padding(.horizontal, 24).padding(.bottom, 20)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("onboardingWelcome")
    }

    @ViewBuilder private func illustration(_ i: Int) -> some View {
        switch i {
        case 0:
            VStack(spacing: 12) {
                mockCard(top: "resilient", bottom: "kiên cường, mau phục hồi", icon: "character.bubble.fill")
                Label("Đã lưu", systemImage: "bookmark.fill")
                    .font(WordlyFonts.body(14, weight: .bold))
                    .padding(.horizontal, 16).padding(.vertical, 8)
                    .background(WordlyColors.electric).foregroundStyle(WordlyColors.onElectric)
                    .clipShape(Capsule())
            }
        case 1:
            HStack(spacing: 14) {
                WidgetMock(word: "resilient", meaning: "kiên cường", compact: true)
                WidgetMock(word: "ephemeral", meaning: "thoáng qua, không bền", compact: false)
            }
        default:
            mockCard(top: "Đố mày nhớ resilient không? 🤔", bottom: "Wordly · bây giờ", icon: "bell.badge.fill")
        }
    }

    private func mockCard(top: String, bottom: String, icon: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 22)).foregroundStyle(WordlyColors.electric)
                .frame(width: 44, height: 44).background(WordlyColors.electricSubtle).clipShape(RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 4) {
                Text(top).font(WordlyFonts.body(16, weight: .bold)).foregroundStyle(WordlyColors.ink)
                Text(bottom).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.inkSoft)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(WordlyColors.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .padding(.horizontal, 32)
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
