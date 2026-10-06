import SwiftUI

// Vòng quay luyện nói theo chủ đề — giống web /speak: IELTS Speaking (Part 1–3),
// Phỏng vấn, Deep Talk. Quay → nhận câu hỏi → hẹn giờ nói, có gợi ý từ vựng
// (AI) và khung trả lời. Câu đã quay vào lịch sử và bị loại khỏi vòng.
@MainActor
final class SpeakSpinnerViewModel: ObservableObject {
    @Published var mode: SpinnerMode = .ielts
    @Published var category: String?
    @Published private(set) var pool: [SpinnerItem] = []
    @Published private(set) var history: [SpinHistoryItem] = []
    @Published var landed: SpinnerItem?
    @Published var reelText = "Bấm Quay để nhận câu hỏi"
    @Published var isSpinning = false
    @Published var loadError: String?
    @Published var vocab: [SuggestedWord] = []
    @Published var vocabLoading = false

    private var cache: [String: [SpinnerItem]] = [:]
    private var vocabRequest = 0

    private var cacheKey: String { "\(mode.rawValue)::\(mode == .ielts ? "all" : category ?? "all")" }

    var wheel: [SpinnerItem] {
        let filtered = mode == .ielts ? SpinnerLogic.filter(pool, category: category) : pool
        return SpinnerLogic.excludeSpun(filtered, excluded: Set(history.map(\.id)).subtracting(landed.map { [$0.id] } ?? []))
    }

    func switchMode(_ newMode: SpinnerMode) async {
        mode = newMode
        category = newMode == .interview ? "behavioral" : nil
        landed = nil
        vocab = []
        reelText = "Bấm Quay để nhận câu hỏi"
        await load()
    }

    func selectCategory(_ code: String?) async {
        category = code
        landed = nil
        if mode != .ielts { await loadPool() }
    }

    func load() async {
        async let p: Void = loadPool()
        async let h: Void = loadHistory()
        _ = await (p, h)
    }

    private func loadPool() async {
        if let cached = cache[cacheKey] { pool = cached; return }
        loadError = nil
        do {
            let items: [SpinnerItem]
            switch mode {
            case .ielts: items = try await APIClient.shared.fetchSpinnerTopics()
            case .interview: items = try await APIClient.shared.fetchInterviewQuestions(category: category ?? "behavioral")
            case .deepTalk: items = try await APIClient.shared.fetchDeepTalkQuestions(category: category)
            }
            cache[cacheKey] = items
            pool = items
        } catch {
            loadError = "Không tải được câu hỏi. Kéo xuống để thử lại."
        }
    }

    private func loadHistory() async {
        history = (try? await APIClient.shared.fetchSpinHistory(itemType: mode.itemType)) ?? []
    }

    /// Quay: chạy chữ nhanh rồi chậm dần (cảm giác máy quay số) rồi dừng ở một câu.
    func spin() async {
        let candidates = wheel
        guard !isSpinning, !candidates.isEmpty else { return }
        isSpinning = true
        landed = nil
        vocab = []
        let target = candidates.randomElement()!
        let haptic = UISelectionFeedbackGenerator()
        for step in 0..<18 {
            reelText = candidates.randomElement()!.text
            haptic.selectionChanged()
            try? await Task.sleep(for: .milliseconds(40 + step * step * 2))
        }
        reelText = target.text
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        landed = target
        isSpinning = false
        history.insert(SpinHistoryItem(id: target.id, label: target.text, spunAt: nil), at: 0)
        Task { try? await APIClient.shared.logSpin(itemId: target.id, itemType: mode.itemType) }
        await loadVocab(for: target)
    }

    private func loadVocab(for item: SpinnerItem) async {
        vocabRequest += 1
        let request = vocabRequest
        vocabLoading = true
        let words = (try? await APIClient.shared.suggestVocab(question: item.text, kind: mode.vocabKind)) ?? []
        guard request == vocabRequest else { return }   // đã quay câu khác
        vocab = words
        vocabLoading = false
    }

    func removeFromHistory(_ item: SpinHistoryItem) {
        history.removeAll { $0.id == item.id }
        if landed?.id == item.id { landed = nil }
        Task { try? await APIClient.shared.logSpin(itemId: item.id, itemType: mode.itemType, remove: true) }
    }
}

struct SpeakSpinnerView: View {
    @StateObject private var vm = SpeakSpinnerViewModel()
    @State private var timerOpen = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Picker("Chế độ", selection: Binding(get: { vm.mode }, set: { m in Task { await vm.switchMode(m) } })) {
                    ForEach(SpinnerMode.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)

                Text(vm.mode.subtitle)
                    .font(WordlyFonts.body(13))
                    .foregroundStyle(WordlyColors.inkSoft)
                    .padding(.horizontal, 16)

                categoryChips
                reel
                if let error = vm.loadError {
                    Text(error).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.error).padding(.horizontal, 16)
                }
                historySection
            }
            .padding(.vertical, 12)
        }
        .screenBackground()
        .navigationTitle("Luyện nói theo chủ đề")
        .navigationBarTitleDisplayMode(.inline)
        .task { if vm.pool.isEmpty { await vm.load() } }
        .refreshable { await vm.load() }
        .sheet(isPresented: $timerOpen) {
            SpeakTimerSheet(mode: vm.mode, item: vm.landed, vocab: vm.vocab, vocabLoading: vm.vocabLoading)
        }
    }

    private var categoryChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if let all = vm.mode.allLabel {
                    FilterChip(label: all, isSelected: vm.category == nil) { Task { await vm.selectCategory(nil) } }
                }
                ForEach(vm.mode.categories, id: \.code) { c in
                    FilterChip(label: c.label, isSelected: vm.category == c.code) { Task { await vm.selectCategory(c.code) } }
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private var reel: some View {
        VStack(spacing: 18) {
            ZStack {
                RoundedRectangle(cornerRadius: 20)
                    .fill(LinearGradient(colors: [WordlyColors.electric.opacity(0.18), WordlyColors.duoBlue.opacity(0.12)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                RoundedRectangle(cornerRadius: 20)
                    .stroke(vm.landed != nil ? WordlyColors.electric : WordlyColors.cardBorder, lineWidth: vm.landed != nil ? 2 : 1)
                VStack(spacing: 10) {
                    if let landed = vm.landed, let cat = vm.mode.categories.first(where: { $0.code == landed.category }) {
                        Badge(text: cat.label)
                    }
                    Text(vm.reelText)
                        .font(WordlyFonts.body(vm.landed != nil ? 19 : 17, weight: .bold))
                        .foregroundStyle(vm.isSpinning ? WordlyColors.inkSoft : WordlyColors.ink)
                        .multilineTextAlignment(.center)
                        .contentTransition(.numericText())
                        .animation(.easeOut(duration: 0.12), value: vm.reelText)
                }
                .padding(20)
            }
            .frame(minHeight: 170)

            HStack(spacing: 12) {
                Button {
                    Task { await vm.spin() }
                } label: {
                    Label(vm.isSpinning ? "Đang quay…" : "Quay", systemImage: "dice.fill")
                }
                .buttonStyle(ElectricButtonStyle(isFullWidth: true))
                .disabled(vm.isSpinning || vm.wheel.isEmpty)

                Button { timerOpen = true } label: {
                    Label("Hẹn giờ", systemImage: "timer")
                }
                .buttonStyle(GhostButtonStyle())
                .disabled(vm.landed == nil)
                .opacity(vm.landed == nil ? 0.4 : 1)
            }
        }
        .padding(.horizontal, 16)
    }

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Đã quay (\(vm.history.count))")
            if vm.history.isEmpty {
                Text("Câu đã quay sẽ hiện ở đây và không xuất hiện lại cho tới khi bạn xoá.")
                    .font(WordlyFonts.body(13))
                    .foregroundStyle(WordlyColors.inkSoft)
            } else {
                VStack(spacing: 0) {
                    ForEach(vm.history) { item in
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(WordlyColors.electric)
                            Text(item.label ?? "Câu #\(item.id)")
                                .font(WordlyFonts.body(14))
                                .foregroundStyle(WordlyColors.ink)
                            Spacer()
                            Button { withAnimation { vm.removeFromHistory(item) } } label: {
                                Image(systemName: "arrow.uturn.backward.circle")
                                    .foregroundStyle(WordlyColors.inkSoft)
                            }
                            .accessibilityLabel("Đưa lại vào vòng quay")
                        }
                        .padding(.vertical, 10)
                        if item.id != vm.history.last?.id { Divider() }
                    }
                }
                .wordlyCard(padding: 14)
            }
        }
        .padding(.horizontal, 16)
    }
}

/// Màn hẹn giờ luyện nói — web TimerModal: đếm ngược, gợi ý từ, khung trả lời.
struct SpeakTimerSheet: View {
    let mode: SpinnerMode
    let item: SpinnerItem?
    let vocab: [SuggestedWord]
    let vocabLoading: Bool

    @State private var timer: CountdownTimer
    @State private var openFramework: String?
    @StateObject private var tts = TTSManager.shared
    @Environment(\.dismiss) private var dismiss
    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    init(mode: SpinnerMode, item: SpinnerItem?, vocab: [SuggestedWord], vocabLoading: Bool) {
        self.mode = mode
        self.item = item
        self.vocab = vocab
        self.vocabLoading = vocabLoading
        _timer = State(initialValue: CountdownTimer(total: SpinnerLogic.defaultSeconds(mode: mode, item: item)))
        _openFramework = State(initialValue: SpinnerLogic.recommendedFramework(mode: mode, item: item)?.id)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    if let item {
                        Text(item.text)
                            .font(WordlyFonts.body(17, weight: .bold))
                            .foregroundStyle(WordlyColors.ink)
                            .multilineTextAlignment(.center)
                    }
                    clock
                    controls
                    if vocabLoading || !vocab.isEmpty { vocabSection }
                    if !mode.frameworks.isEmpty { frameworksSection }
                }
                .padding(20)
            }
            .screenBackground()
            .navigationTitle("Luyện nói")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Xong") { dismiss() } } }
            .onReceive(ticker) { _ in
                let wasRunning = timer.running
                timer.tick()
                if wasRunning && timer.finished {
                    UINotificationFeedbackGenerator().notificationOccurred(.warning)
                }
            }
        }
    }

    private var clock: some View {
        ZStack {
            ProgressRing(progress: timer.progress, lineWidth: 14,
                         color: timer.remaining <= 10 && timer.running ? WordlyColors.error : WordlyColors.electric)
            VStack(spacing: 4) {
                Text(String(format: "%d:%02d", timer.remaining / 60, timer.remaining % 60))
                    .font(WordlyFonts.display(44))
                    .foregroundStyle(WordlyColors.ink)
                    .monospacedDigit()
                Text(timer.finished ? "Hết giờ! 🎉" : timer.running ? "Đang nói…" : "Sẵn sàng")
                    .font(WordlyFonts.body(13, weight: .bold))
                    .foregroundStyle(timer.running ? WordlyColors.electric : WordlyColors.inkSoft)
            }
        }
        .frame(width: 220, height: 220)
    }

    private var controls: some View {
        HStack(spacing: 14) {
            roundButton("minus", label: "Giảm 15 giây") { timer.adjust(by: -15) }
                .disabled(timer.running)
            Button {
                if timer.running { timer.pause() } else { timer.start() }
            } label: {
                Image(systemName: timer.running ? "pause.fill" : "play.fill")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(WordlyColors.onElectric)
                    .frame(width: 72, height: 72)
                    .background(WordlyColors.electric)
                    .clipShape(Circle())
                    .shadow(color: WordlyColors.electric.opacity(0.35), radius: 10, y: 4)
            }
            .accessibilityLabel(timer.running ? "Tạm dừng" : "Bắt đầu")
            roundButton("plus", label: "Thêm 15 giây") { timer.adjust(by: 15) }
                .disabled(timer.running)
            roundButton("arrow.counterclockwise", label: "Đặt lại") { timer.reset() }
        }
    }

    private func roundButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(WordlyColors.ink)
                .frame(width: 48, height: 48)
                .background(WordlyColors.hoverBG)
                .clipShape(Circle())
        }
        .accessibilityLabel(label)
    }

    private var vocabSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "💡 Từ vựng gợi ý")
            if vocabLoading {
                LoadingStateView(label: "AI đang gợi ý từ…").frame(minHeight: 60)
            }
            ForEach(vocab) { w in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(w.word).font(WordlyFonts.body(16, weight: .bold)).foregroundStyle(WordlyColors.ink)
                        if let ipa = w.ipa { Text(ipa).font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft) }
                        Spacer()
                        Button { Task { await tts.speak(w.word) } } label: {
                            Image(systemName: "speaker.wave.2.fill").foregroundStyle(WordlyColors.electric)
                        }
                        .accessibilityLabel("Phát âm")
                    }
                    if let vi = w.meaningVi { Text(vi).font(WordlyFonts.body(13, weight: .medium)).foregroundStyle(WordlyColors.grass) }
                    Text("“\(w.example)”").font(WordlyFonts.body(13).italic()).foregroundStyle(WordlyColors.inkSoft)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .wordlyCard(padding: 14)
            }
        }
    }

    private var frameworksSection: some View {
        let recommended = SpinnerLogic.recommendedFramework(mode: mode, item: item)?.id
        return VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "🧭 Khung trả lời")
            ForEach(mode.frameworks) { fw in
                VStack(alignment: .leading, spacing: 8) {
                    Button {
                        withAnimation(.snappy) { openFramework = openFramework == fw.id ? nil : fw.id }
                    } label: {
                        HStack {
                            Text(fw.label).font(WordlyFonts.body(15, weight: .bold)).foregroundStyle(WordlyColors.ink)
                            if fw.id == recommended { Badge(text: "Gợi ý") }
                            Spacer()
                            Image(systemName: openFramework == fw.id ? "chevron.up" : "chevron.down")
                                .foregroundStyle(WordlyColors.inkSoft)
                        }
                    }
                    .buttonStyle(.plain)
                    if openFramework == fw.id {
                        ForEach(Array(fw.steps.enumerated()), id: \.offset) { i, step in
                            HStack(alignment: .top, spacing: 8) {
                                Text("\(i + 1)").font(WordlyFonts.body(11, weight: .bold))
                                    .foregroundStyle(WordlyColors.onElectric)
                                    .frame(width: 18, height: 18).background(WordlyColors.electric).clipShape(Circle())
                                Text(step).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.ink)
                            }
                        }
                    }
                }
                .wordlyCard(padding: 14)
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(fw.id == recommended ? WordlyColors.electric : .clear, lineWidth: 1.5))
            }
        }
    }
}
