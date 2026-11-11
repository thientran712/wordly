import SwiftUI

/// Thiết lập lần đầu cho tài khoản mới (chủ dự án chốt 11/11/2026, thay thẻ "Bắt đầu
/// với Wordly"): lưu từ đầu tiên → bật nhắc ôn → thêm widget, bắt buộc theo thứ tự rồi
/// mới vào màn chính. Không có nút bỏ qua; riêng hộp quyền thông báo của iOS thì chọn
/// gì cũng đi tiếp (App Store 4.5.4).
struct SetupFlowView: View {
    @ObservedObject var center: OnboardingCenter
    /// Từ vừa lưu ở bước 1 — dùng cho minh hoạ ở bước 2, 3
    @State private var word: (text: String, meaning: String)?

    private var step: Onboarding.SetupStep {
        if case .setup(let s) = center.intro { return s }
        return .widget
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            progress.padding(.horizontal, 24).padding(.top, 12)
            Group {
                switch step {
                case .saveWord:
                    SetupSaveWordStep { text, meaning in
                        word = (text, meaning)
                        center.completeSetupStep(.saveWord)
                    }
                case .reminder:
                    SetupReminderStep(word: shownWord) { center.completeSetupStep(.reminder) }
                case .widget:
                    SetupWidgetStep(word: shownWord) { center.completeSetupStep(.widget) }
                }
            }
            .transition(.asymmetric(insertion: .move(edge: .trailing), removal: .move(edge: .leading)).combined(with: .opacity))
        }
        .animation(.easeInOut(duration: 0.3), value: step)
        .background(WordlyColors.background.ignoresSafeArea())
        .interactiveDismissDisabled()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("setupFlow")
    }

    /// Mở lại app giữa chừng (bước 2, 3) → lấy từ đã lưu trên máy.
    private var shownWord: (text: String, meaning: String) {
        if let word { return word }
        if let w = AppGroupStorage.shared.words.first(where: \.isSaved) { return (w.word, w.meaning) }
        return ("deadline", "hạn chót")
    }

    private var progress: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                ForEach(Onboarding.SetupStep.allCases, id: \.rawValue) { s in
                    Capsule()
                        .fill(s.rawValue <= step.rawValue ? WordlyColors.electric : WordlyColors.inkSoft.opacity(0.25))
                        .frame(height: 5)
                }
            }
            Text("Bước \(step.rawValue + 1)/\(Onboarding.SetupStep.allCases.count)")
                .font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.electric)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("setupProgress")
    }
}

/// Nút chính của từng bước (một nút chính mỗi màn).
private struct SetupPrimaryButton: View {
    let title: String
    var loading = false
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Text(title).opacity(loading ? 0 : 1)
                if loading { ProgressView().tint(WordlyColors.onElectric) }
            }
            .font(WordlyFonts.body(16, weight: .bold))
            .frame(maxWidth: .infinity).padding(.vertical, 16)
            .background(enabled ? WordlyColors.electric : WordlyColors.inkSoft.opacity(0.3))
            .foregroundStyle(WordlyColors.onElectric)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .disabled(!enabled || loading)
    }
}

private struct SetupTitle: View {
    let title: String
    let subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(WordlyFonts.display(26)).foregroundStyle(WordlyColors.ink)
                .fixedSize(horizontal: false, vertical: true)
            if let subtitle {
                Text(subtitle).font(WordlyFonts.body(15)).foregroundStyle(WordlyColors.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - Bước 1: lưu từ đầu tiên

private struct SetupSaveWordStep: View {
    let onSaved: (String, String) -> Void

    @State private var text = ""
    @State private var meaning = ""
    @State private var translating = false
    @State private var saving = false
    @State private var error: String?
    @FocusState private var focused: Bool

    private static let suggestions = ["deadline", "awkward", "commute", "resilient"]
    private var source: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            SetupTitle(title: "Từ tiếng Anh đầu tiên bạn muốn nhớ?", subtitle: nil)
                .padding(.top, 20)

            HStack {
                TextField("ví dụ: deadline", text: $text)
                    .font(WordlyFonts.body(17, weight: .semibold))
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .submitLabel(.done).focused($focused)
                    .accessibilityIdentifier("setupWordField")
                if !text.isEmpty {
                    Button { text = "" } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(WordlyColors.inkSoft)
                    }
                    .accessibilityLabel("Xoá")
                }
            }
            .padding(14)
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(WordlyColors.electric, lineWidth: 2))

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Self.suggestions, id: \.self) { s in
                        Button { text = s; focused = false } label: {
                            Text(s).font(WordlyFonts.body(14, weight: .bold))
                                .padding(.horizontal, 14).padding(.vertical, 8)
                                .background(source == s ? WordlyColors.electric : WordlyColors.surfaceElevated)
                                .foregroundStyle(source == s ? WordlyColors.onElectric : WordlyColors.ink)
                                .clipShape(Capsule())
                                .overlay(Capsule().stroke(WordlyColors.inkSoft.opacity(source == s ? 0 : 0.25), lineWidth: 1))
                        }
                        .accessibilityIdentifier("setupSuggest.\(s)")
                    }
                }
            }

            if translating {
                ProgressView().tint(WordlyColors.electric)
            } else if !meaning.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text(source).font(WordlyFonts.body(14, weight: .semibold)).foregroundStyle(WordlyColors.inkSoft)
                    Text(meaning).font(WordlyFonts.display(22)).foregroundStyle(WordlyColors.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(WordlyColors.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("setupMeaning")
            }
            if let error {
                Text(error).font(WordlyFonts.body(14)).foregroundStyle(WordlyColors.error)
            }

            Spacer(minLength: 0)
            SetupPrimaryButton(title: source.isEmpty ? "Lưu từ này" : "Lưu “\(source)”",
                               loading: saving, enabled: !meaning.isEmpty && !translating) { Task { await save() } }
                .accessibilityIdentifier("setupSaveWord")
        }
        .padding(.horizontal, 24).padding(.bottom, 20)
        // Gõ xong 0,5 giây thì dịch (giống tab Dịch, không cần bấm)
        .task(id: source) { await translate() }
    }

    private func translate() async {
        meaning = ""
        error = nil
        guard !source.isEmpty else { return }
        do { try await Task.sleep(for: .milliseconds(500)) } catch { return }
        translating = true
        defer { translating = false }
        do {
            let r = try await APIClient.shared.translate(text: source, source: "EN", target: "VI")
            guard !Task.isCancelled else { return }
            if let t = r.translated, !t.isEmpty { meaning = t } else { error = r.error ?? "Không dịch được từ này, thử từ khác nhé" }
        } catch {
            guard !Task.isCancelled else { return }
            if !ProStore.shared.handle(error) { self.error = "Không dịch được, kiểm tra mạng rồi thử lại" }
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let word = source
        do {
            try await APIClient.shared.markSaved(sourceText: word, translatedText: meaning,
                                                 direction: TranslateViewModel.Direction.enToVi.rawValue)
            SavedWordsSignal.shared.changed()
            // Từ lên widget ngay để bước 3 thêm widget là thấy từ của mình
            await WidgetSync.refresh()
            onSaved(word, meaning)
        } catch {
            if !ProStore.shared.handle(error) { self.error = "Không lưu được, thử lại nhé" }
        }
    }
}

// MARK: - Bước 2: bật nhắc ôn

private struct SetupReminderStep: View {
    let word: (text: String, meaning: String)
    let onDone: () -> Void
    @State private var working = false

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            SetupTitle(title: "Wordly nhắc bạn ôn “\(word.text)”",
                       subtitle: "Mỗi ngày một thông báo lúc 20:00. Đổi giờ trong Cá nhân → Thông báo nhắc ôn.")
                .padding(.top, 20)

            HStack(alignment: .center, spacing: 12) {
                WordlyLogo(size: 38).clipShape(RoundedRectangle(cornerRadius: 9))
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text("Wordly").font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.ink)
                        Spacer()
                        Text("20:00").font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
                    }
                    Text("\(word.text) — \(word.meaning)").font(WordlyFonts.body(14)).foregroundStyle(WordlyColors.ink)
                        .lineLimit(2)
                }
            }
            .padding(14)
            .background(WordlyColors.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .shadow(color: .black.opacity(0.08), radius: 10, y: 4)
            .accessibilityElement(children: .combine)

            Spacer(minLength: 0)
            SetupPrimaryButton(title: "Bật nhắc ôn", loading: working) { Task { await enable() } }
                .accessibilityIdentifier("setupEnableReminder")
        }
        .padding(.horizontal, 24).padding(.bottom, 20)
    }

    /// Hộp quyền của iOS: Cho phép hay Không cho phép đều sang bước sau.
    private func enable() async {
        working = true
        defer { working = false }
        // Đã hỏi ở đây → tab Dịch không hỏi lại sau lần lưu đầu
        UserDefaults.standard.set(true, forKey: PushLogic.promptShownKey)
        let status = await PushManager.shared.authorizationStatus()
        switch Onboarding.reminderAction(status: status, pushAvailable: PushManager.shared.isAvailable || PreviewModeFlag.isOn) {
        case .ask, .enable: _ = await PushManager.shared.enableDailyDefault()
        case .proceed: break
        }
        onDone()
    }
}

// MARK: - Bước 3: thêm widget

private struct SetupWidgetStep: View {
    let word: (text: String, meaning: String)
    let onDone: () -> Void

    @Environment(\.scenePhase) private var scenePhase
    @State private var kind: WidgetSettingsView.Tab = .home
    @State private var installed = false
    @State private var showGuide = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                SetupTitle(title: "Đưa từ lên màn hình điện thoại",
                           subtitle: "Liếc điện thoại là ôn — widget tự đổi từ trong ngày.")
                    .padding(.top, 20)

                Picker("Vị trí widget", selection: $kind) {
                    Text("Màn hình chính").tag(WidgetSettingsView.Tab.home)
                    Text("Màn hình khoá").tag(WidgetSettingsView.Tab.lock)
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("setupWidgetKind")

                preview

                VStack(alignment: .leading, spacing: 10) {
                    ForEach(Array(WidgetSettingsView.addSteps(kind).enumerated()), id: \.offset) { i, text in
                        HStack(alignment: .top, spacing: 10) {
                            Text("\(i + 1)").font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.onElectric)
                                .frame(width: 24, height: 24).background(WordlyColors.electric).clipShape(Circle())
                            Text(text).font(WordlyFonts.body(15)).foregroundStyle(WordlyColors.ink)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Button("Xem ảnh hướng dẫn") { showGuide = true }
                        .font(WordlyFonts.body(15, weight: .semibold))
                        .accessibilityIdentifier("setupWidgetGuide")
                }

                status
            }
            .padding(.horizontal, 24)
        }
        .safeAreaInset(edge: .bottom) {
            SetupPrimaryButton(title: "Vào Wordly", enabled: installed) { onDone() }
                .accessibilityIdentifier("setupFinish")
                .padding(.horizontal, 24).padding(.vertical, 12)
                .background(WordlyColors.background)
        }
        .sheet(isPresented: $showGuide) { WidgetAddGuideView(kind: kind) }
        // Quay lại app sau khi thêm widget → kiểm ngay; trong lúc ở màn này cũng kiểm định kỳ
        .task(id: scenePhase) {
            while !Task.isCancelled && scenePhase == .active {
                await check()
                if installed { return }
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    @ViewBuilder private var preview: some View {
        if kind == .home {
            ZStack(alignment: .bottomLeading) {
                // Ảnh theme nằm trong bundle dạng file .jpg (không phải asset catalog)
                if let img = WidgetThemePhoto.thumbnail(WidgetDefaults.homeTheme) {
                    Image(decorative: img, scale: 1).resizable().scaledToFill()
                        .frame(maxWidth: .infinity).frame(height: 150).clipped()
                }
                LinearGradient(colors: [.clear, .black.opacity(WidgetDefaults.homeTheme.dim)], startPoint: .top, endPoint: .bottom)
                VStack(alignment: .leading, spacing: 2) {
                    Text(word.text).font(.system(size: 24, weight: .bold))
                    Text(word.meaning).font(.system(size: 14)).lineLimit(2)
                }
                .foregroundStyle(.white).padding(16)
            }
            .frame(height: 150)
            .clipShape(RoundedRectangle(cornerRadius: 22))
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Widget mẫu nền \(WidgetDefaults.homeTheme.name): \(word.text), \(word.meaning)")
        } else {
            VStack(spacing: 6) {
                Text("09:41").font(.system(size: 54, weight: .semibold, design: .rounded))
                VStack(alignment: .leading, spacing: 1) {
                    Text(word.text).font(.system(size: 15, weight: .bold))
                    Text(word.meaning).font(.system(size: 13)).lineLimit(1)
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(.white.opacity(0.18)).clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity).frame(height: 150)
            .background(LinearGradient(colors: [Color(hex: "#0B6FA4"), Color(hex: "#2E7D0B")], startPoint: .topLeading, endPoint: .bottomTrailing))
            .clipShape(RoundedRectangle(cornerRadius: 22))
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Widget mẫu màn hình khoá: \(word.text), \(word.meaning)")
        }
    }

    @ViewBuilder private var status: some View {
        HStack(spacing: 8) {
            if installed {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(WordlyColors.electric)
                Text("Đã thêm widget Wordly").font(WordlyFonts.body(14, weight: .bold)).foregroundStyle(WordlyColors.ink)
            } else {
                ProgressView().controlSize(.small)
                Text("Thêm xong quay lại Wordly, app tự nhận widget")
                    .font(WordlyFonts.body(14)).foregroundStyle(WordlyColors.inkSoft)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("setupWidgetStatus")
    }

    private func check() async {
        #if DEBUG
        // Simulator UI test: giả lập đã thêm widget
        if PreviewMode.isOn && CommandLine.arguments.contains("-WordlyWidgetInstalled") { installed = true; return }
        #endif
        let kinds = await OnboardingCenter.installedFamilies()
        installed = Onboarding.widgetStepDone(lock: kinds.lock, home: kinds.home)
    }
}
