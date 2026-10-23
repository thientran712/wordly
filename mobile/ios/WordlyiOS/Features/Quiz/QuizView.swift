import SwiftUI

// Quiz từ vựng — giống web /quiz: chọn chế độ → làm bài → xem kết quả.
// Câu hỏi sinh từ từ đã lưu (thiếu thì lấy kho từ chung).

enum QuizMode: String, CaseIterable, Identifiable {
    case enToVi = "en_to_vi"
    case viToEn = "vi_to_en"
    var id: String { rawValue }
    var title: String { self == .enToVi ? "Anh → Việt" : "Việt → Anh" }
    var subtitle: String { self == .enToVi ? "Xem từ tiếng Anh, chọn nghĩa đúng" : "Xem nghĩa, chọn từ tiếng Anh đúng" }
    var icon: String { self == .enToVi ? "character.book.closed" : "text.book.closed" }
}

@MainActor
final class QuizViewModel: ObservableObject {
    enum Phase { case setup, playing, submitting, done }

    private static let modeKey = "quiz.mode"
    private static let lastPercentKey = "quiz.lastPercent"

    @Published var phase: Phase = .setup
    /// Nhớ chế độ lần trước — khỏi chọn lại mỗi lần
    @Published var mode: QuizMode = QuizMode(rawValue: UserDefaults.standard.string(forKey: modeKey) ?? "") ?? .enToVi {
        didSet { UserDefaults.standard.set(mode.rawValue, forKey: Self.modeKey) }
    }
    @Published var session = QuizSession(questions: [])
    @Published var result: QuizResult?
    @Published var requeued = 0
    @Published var error: String?
    /// Server báo chưa đủ từ → hiện nút sang tab Dịch
    @Published var needsMoreWords = false
    @Published var isLoading = false
    @Published private(set) var lastPercent: Int? = UserDefaults.standard.object(forKey: lastPercentKey) as? Int

    private var startedAt: Date?
    /// Câu hỏi của lượt vừa nộp — dùng cho "Ôn lại các từ sai"
    private var finishedQuestions: [QuizQuestion] = []
    private var autoAdvanceTask: Task<Void, Never>?
    private var startThrottle = TapThrottle(interval: 0.8)

    var wrongCount: Int {
        guard let result else { return 0 }
        return finishedQuestions.filter { result.details[$0.id]?.correct != true }.count
    }

    func start() async {
        guard !isLoading, startThrottle.allow() else { return }
        isLoading = true
        error = nil
        needsMoreWords = false
        defer { isLoading = false }
        do {
            let r = try await APIClient.shared.fetchQuiz(mode: mode.rawValue)
            guard !r.questions.isEmpty else {
                error = r.error ?? "Chưa đủ từ vựng để tạo quiz. Hãy lưu thêm từ khi dịch."
                needsMoreWords = true
                phase = .setup
                return
            }
            begin(QuizSession(questions: r.questions))
        } catch {
            self.error = QuizCopy.errorMessage(error)
            needsMoreWords = QuizCopy.isNotEnoughWords(error)
            phase = .setup
        }
    }

    /// Lượt mới chỉ gồm các câu vừa trả lời sai.
    func retryWrong() {
        guard let result else { return }
        let retry = QuizSession.retryingWrong(finishedQuestions, result: result)
        guard !retry.questions.isEmpty else { return }
        begin(retry)
    }

    private func begin(_ newSession: QuizSession) {
        autoAdvanceTask?.cancel()
        session = newSession
        result = nil
        error = nil
        startedAt = Date()
        phase = .playing
    }

    func pick(_ option: String) {
        guard let q = session.current, session.picked == nil else { return }
        session.pick(option)
        Task {
            do {
                let r = try await APIClient.shared.checkQuizAnswer(
                    .init(wordId: q.wordId, mode: mode.rawValue, given: option))
                session.recordCheck(questionId: q.id, correct: r.correct, correctAnswer: r.correctAnswer)
                UINotificationFeedbackGenerator().notificationOccurred(r.correct ? .success : .error)
                if session.shouldAutoAdvance { scheduleAutoAdvance(from: q.id) }
            } catch {
                // Không chặn làm bài nếu chấm-ngay lỗi mạng — vẫn nộp được cả
                // bài ở cuối; chỉ thôi hiện vòng xoay.
                session.recordCheckFailed(questionId: q.id)
            }
        }
    }

    /// Đúng → tự sang câu sau 0,8 giây (đủ thấy ô xanh). Người dùng bấm "Tiếp"
    /// trước thì thôi.
    private func scheduleAutoAdvance(from questionId: String) {
        autoAdvanceTask?.cancel()
        autoAdvanceTask = Task {
            try? await Task.sleep(for: .milliseconds(800))
            guard !Task.isCancelled, session.current?.id == questionId, phase == .playing else { return }
            await next()
        }
    }

    func next() async {
        guard phase == .playing else { return }
        autoAdvanceTask?.cancel()
        // Lượt đã xong mà nộp lỗi trước đó → nộp lại thẳng (advance() không chạy lại được)
        guard session.isFinished || session.advance() else { return }
        // Xong câu cuối → tự nộp, không cần bấm "Nộp bài"
        phase = .submitting
        let ms = startedAt.map { Int(Date().timeIntervalSince($0) * 1000) }
        do {
            let r = try await APIClient.shared.submitQuiz(session.submitRequest(mode: mode.rawValue, durationMs: ms))
            result = r.result
            requeued = r.requeuedWords ?? 0
            finishedQuestions = session.questions
            lastPercent = r.result.percent
            UserDefaults.standard.set(r.result.percent, forKey: Self.lastPercentKey)
            phase = .done
        } catch {
            self.error = "Chưa nộp được bài — kiểm tra mạng rồi thử lại."
            phase = .playing
        }
    }

    func restart() {
        autoAdvanceTask?.cancel()
        phase = .setup
        result = nil
        error = nil
    }
}

struct QuizView: View {
    @StateObject private var vm = QuizViewModel()
    @StateObject private var tts = TTSManager.shared
    @EnvironmentObject private var router: AppRouter

    private func optionBackground(isPicked: Bool, isCorrectAnswer: Bool, isWrongPick: Bool) -> Color {
        if isCorrectAnswer { return WordlyColors.grassSoft }
        if isWrongPick { return WordlyColors.errorSoft }
        if isPicked { return WordlyColors.electricSubtle }
        return WordlyColors.cardBG
    }

    private func optionBorder(isPicked: Bool, isCorrectAnswer: Bool, isWrongPick: Bool) -> Color {
        if isCorrectAnswer { return WordlyColors.grass }
        if isWrongPick { return WordlyColors.error }
        if isPicked { return WordlyColors.electric }
        return WordlyColors.cardBorder
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                switch vm.phase {
                case .setup: setup
                case .playing, .submitting: playing
                case .done: results
                }
            }
            .padding(16)
        }
        .screenBackground()
        .navigationTitle("Quiz từ vựng")
        .navigationBarTitleDisplayMode(.inline)
        .animation(.snappy, value: vm.phase)
    }

    // MARK: Chọn chế độ
    private var setup: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Kiểm tra trí nhớ của bạn")
                    .font(WordlyFonts.display(24))
                    .foregroundStyle(WordlyColors.ink)
                Text("Tối đa 10 câu từ những từ bạn đã lưu. Từ trả lời sai được ưu tiên hỏi lại và nhắc qua thông báo ngày hôm sau.")
                    .font(WordlyFonts.body(14))
                    .foregroundStyle(WordlyColors.inkSoft)
                if let last = vm.lastPercent {
                    Label("Lần trước đúng \(last)%", systemImage: "chart.bar.fill")
                        .font(WordlyFonts.body(13, weight: .semibold))
                        .foregroundStyle(WordlyColors.electric)
                }
            }
            ForEach(QuizMode.allCases) { mode in
                Button { vm.mode = mode } label: {
                    HStack(spacing: 14) {
                        IconTile(systemImage: mode.icon, color: vm.mode == mode ? WordlyColors.electric : WordlyColors.duoBlue)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(mode.title).font(WordlyFonts.body(16, weight: .bold)).foregroundStyle(WordlyColors.ink)
                            Text(mode.subtitle).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.inkSoft)
                        }
                        Spacer()
                        Image(systemName: vm.mode == mode ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 22))
                            .foregroundStyle(vm.mode == mode ? WordlyColors.electric : WordlyColors.inkGhost)
                    }
                    .wordlyCard(padding: 16)
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(vm.mode == mode ? WordlyColors.electric : .clear, lineWidth: 2))
                }
                .buttonStyle(.plain)
            }
            if let error = vm.error {
                VStack(alignment: .leading, spacing: 10) {
                    Label(error, systemImage: vm.needsMoreWords ? "bookmark" : "exclamationmark.triangle.fill")
                        .font(WordlyFonts.body(13, weight: .medium))
                        .foregroundStyle(vm.needsMoreWords ? WordlyColors.ink : WordlyColors.error)
                    if vm.needsMoreWords {
                        Button { router.selectedTab = .translate } label: {
                            Label("Đi dịch & lưu từ", systemImage: "character.bubble")
                                .font(WordlyFonts.body(13, weight: .bold))
                                .foregroundStyle(WordlyColors.electric)
                        }
                    }
                }
            }
            Button {
                Task { await vm.start() }
            } label: {
                Text("Bắt đầu")
            }
            .buttonStyle(ElectricButtonStyle(isLoading: vm.isLoading, isFullWidth: true))
            .disabled(vm.isLoading)
        }
    }

    // MARK: Làm bài
    private var playing: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 12) {
                ProgressView(value: vm.session.progress)
                    .tint(WordlyColors.electric)
                Text("\(min(vm.session.index + 1, vm.session.questions.count))/\(vm.session.questions.count)")
                    .font(WordlyFonts.body(13, weight: .bold))
                    .foregroundStyle(WordlyColors.inkSoft)
                    .monospacedDigit()
            }
            if let q = vm.session.current {
                VStack(spacing: 10) {
                    if let level = q.level { Badge(text: level, color: WordlyColors.duoBlue) }
                    Text(q.prompt)
                        .font(WordlyFonts.display(q.prompt.count > 40 ? 18 : 28))
                        .foregroundStyle(WordlyColors.ink)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                    // Nghe từ tiếng Anh (Anh → Việt) — nghe + nhìn nhớ lâu hơn
                    if vm.mode == .enToVi {
                        Button { tts.toggle(q.prompt, lang: "en-US") } label: {
                            Image(systemName: "speaker.wave.2.fill")
                                .font(.system(size: 14))
                                .frame(width: 36, height: 36)
                                .background(WordlyColors.electricSubtle)
                                .foregroundStyle(WordlyColors.electric)
                                .clipShape(Circle())
                        }
                        .speakLocked(tts, text: q.prompt, lang: "en-US")
                        .accessibilityLabel("Phát âm")
                    }
                    Text(vm.mode == .enToVi ? "Chọn nghĩa đúng" : "Chọn từ đúng")
                        .font(WordlyFonts.body(13))
                        .foregroundStyle(WordlyColors.inkSoft)
                }
                .padding(.vertical, 24)
                .wordlyCard()

                VStack(spacing: 10) {
                    // Chấm ngay khi chọn (POST /api/quiz/check) — ôn và biết
                    // đúng/sai TỪNG từ ngay, không phải đợi nộp hết cả bài.
                    let checked = vm.session.checkedResult(for: q.id)
                    ForEach(q.options, id: \.self) { option in
                        let isPicked = vm.session.picked == option
                        let isCorrectAnswer = checked != nil && option == checked?.correctAnswer
                        let isWrongPick = isPicked && checked?.correct == false
                        Button { vm.pick(option) } label: {
                            HStack {
                                Text(option)
                                    .font(WordlyFonts.body(15, weight: .semibold))
                                    .foregroundStyle(WordlyColors.ink)
                                    .multilineTextAlignment(.leading)
                                Spacer()
                                if checked != nil && (isCorrectAnswer || isWrongPick) {
                                    Image(systemName: isCorrectAnswer ? "checkmark.circle.fill" : "xmark.circle.fill")
                                        .foregroundStyle(isCorrectAnswer ? WordlyColors.grass : WordlyColors.error)
                                } else if isPicked && vm.session.isChecking {
                                    ProgressView().controlSize(.small)
                                } else if isPicked {
                                    Image(systemName: "checkmark.circle.fill").foregroundStyle(WordlyColors.electric)
                                }
                            }
                            .padding(16)
                            .background(optionBackground(isPicked: isPicked, isCorrectAnswer: isCorrectAnswer, isWrongPick: isWrongPick))
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14)
                                .stroke(optionBorder(isPicked: isPicked, isCorrectAnswer: isCorrectAnswer, isWrongPick: isWrongPick),
                                        lineWidth: isPicked || isCorrectAnswer ? 2 : 1))
                        }
                        .buttonStyle(.plain)
                        .disabled(vm.session.picked != nil && vm.session.picked != option)
                    }
                }
            }
            if vm.session.isFinished && vm.phase == .playing {
                Label("Đã trả lời hết \(vm.session.questions.count) câu", systemImage: "checkmark.circle.fill")
                    .font(WordlyFonts.body(15, weight: .semibold))
                    .foregroundStyle(WordlyColors.electric)
            }
            if let error = vm.error {
                Text(error).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.error)
            }
            Button {
                Task { await vm.next() }
            } label: {
                Text(vm.session.isFinished ? "Thử nộp lại" : vm.session.isLastQuestion ? "Xem kết quả" : "Tiếp")
            }
            .buttonStyle(ElectricButtonStyle(isLoading: vm.phase == .submitting, isFullWidth: true))
            .disabled(!vm.session.canAdvance || vm.phase == .submitting)
            .opacity(vm.session.canAdvance ? 1 : 0.4)
        }
    }

    // MARK: Kết quả
    private var results: some View {
        VStack(spacing: 18) {
            if let r = vm.result {
                ZStack {
                    ProgressRing(progress: Double(r.percent) / 100, lineWidth: 14,
                                 color: r.percent >= 80 ? WordlyColors.electric : r.percent >= 50 ? WordlyColors.duoOrange : WordlyColors.error)
                    VStack(spacing: 2) {
                        Text("\(r.percent)%").font(WordlyFonts.display(34)).foregroundStyle(WordlyColors.ink)
                        Text("\(r.correct)/\(r.total) đúng").font(WordlyFonts.body(13, weight: .semibold)).foregroundStyle(WordlyColors.inkSoft)
                    }
                }
                .frame(width: 170, height: 170)
                .padding(.top, 8)

                Text(r.percent >= 80 ? "Xuất sắc! 🎉" : r.percent >= 50 ? "Khá lắm, tiếp tục nhé! 💪" : "Ôn thêm chút nữa nhé! 📚")
                    .font(WordlyFonts.body(18, weight: .bold))
                    .foregroundStyle(WordlyColors.ink)
                if vm.requeued > 0 {
                    Text("\(vm.requeued) từ trả lời sai sẽ được ưu tiên hỏi lại và nhắc qua thông báo từ ngày mai.")
                        .font(WordlyFonts.body(13))
                        .foregroundStyle(WordlyColors.inkSoft)
                        .multilineTextAlignment(.center)
                }

                VStack(spacing: 0) {
                    ForEach(vm.session.questions) { q in
                        let d = r.details[q.id]
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: d?.correct == true ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .foregroundStyle(d?.correct == true ? WordlyColors.electric : WordlyColors.error)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(q.prompt).font(WordlyFonts.body(14, weight: .bold)).foregroundStyle(WordlyColors.ink)
                                if d?.correct != true, let answer = d?.correctAnswer {
                                    Text("Đáp án: \(answer)").font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.grass)
                                }
                                if d?.correct != true, let given = d?.given {
                                    Text("Bạn chọn: \(given)").font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
                                }
                            }
                            Spacer()
                        }
                        .padding(.vertical, 10)
                        if q.id != vm.session.questions.last?.id { Divider() }
                    }
                }
                .wordlyCard(padding: 16)

                if vm.wrongCount > 0 {
                    Button("Ôn lại \(vm.wrongCount) từ sai") { vm.retryWrong() }
                        .buttonStyle(ElectricButtonStyle(isFullWidth: true))
                }
                Button { Task { await vm.start() } } label: {
                    Text("Lượt mới")
                        .font(WordlyFonts.body(15, weight: .bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .foregroundStyle(WordlyColors.electric)
                .disabled(vm.isLoading)
                Button("Đổi chế độ") { vm.restart() }
                    .font(WordlyFonts.body(13, weight: .semibold))
                    .foregroundStyle(WordlyColors.inkSoft)
            }
        }
    }
}
