import SwiftUI

// Quiz từ vựng — giống web /quiz: chọn chế độ → làm bài → xem kết quả.
// Câu hỏi sinh từ từ đã lưu (thiếu thì lấy kho từ chung). `classId` có giá trị
// khi mở từ một lớp học → kết quả tính vào bảng xếp hạng lớp.

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

    @Published var phase: Phase = .setup
    @Published var mode: QuizMode = .enToVi
    @Published var session = QuizSession(questions: [])
    @Published var result: QuizResult?
    @Published var requeued = 0
    @Published var error: String?
    @Published var isLoading = false

    let classId: String?
    private var startedAt: Date?

    init(classId: String? = nil) { self.classId = classId }

    func start() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            let r = try await APIClient.shared.fetchQuiz(mode: mode.rawValue, classId: classId)
            guard !r.questions.isEmpty else {
                error = r.error ?? "Chưa đủ từ vựng để tạo quiz. Hãy lưu thêm từ khi dịch."
                return
            }
            session = QuizSession(questions: r.questions)
            result = nil
            startedAt = Date()
            phase = .playing
        } catch {
            self.error = Self.message(for: error)
        }
    }

    func pick(_ option: String) {
        session.pick(option)
    }

    func next() async {
        guard session.advance() else { return }
        phase = .submitting
        let ms = startedAt.map { Int(Date().timeIntervalSince($0) * 1000) }
        do {
            let r = try await APIClient.shared.submitQuiz(session.submitRequest(mode: mode.rawValue, classId: classId, durationMs: ms))
            result = r.result
            requeued = r.requeuedWords ?? 0
            phase = .done
        } catch {
            self.error = Self.message(for: error)
            phase = .playing
        }
    }

    func restart() {
        phase = .setup
        result = nil
        error = nil
    }

    private static func message(for error: Error) -> String {
        if case APIError.serverError(let m) = error, m.contains("409") {
            return "Chưa đủ từ vựng để tạo quiz. Hãy lưu thêm từ khi dịch."
        }
        return "Có lỗi xảy ra, vui lòng thử lại."
    }
}

struct QuizView: View {
    @StateObject private var vm: QuizViewModel

    init(classId: String? = nil) {
        _vm = StateObject(wrappedValue: QuizViewModel(classId: classId))
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
                Text("10 câu từ những từ bạn đã lưu. Từ trả lời sai sẽ được nhắc ôn lại.")
                    .font(WordlyFonts.body(14))
                    .foregroundStyle(WordlyColors.inkSoft)
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
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(WordlyFonts.body(13, weight: .medium))
                    .foregroundStyle(WordlyColors.error)
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
                    Text(vm.mode == .enToVi ? "Chọn nghĩa đúng" : "Chọn từ đúng")
                        .font(WordlyFonts.body(13))
                        .foregroundStyle(WordlyColors.inkSoft)
                }
                .padding(.vertical, 24)
                .wordlyCard()

                VStack(spacing: 10) {
                    ForEach(q.options, id: \.self) { option in
                        Button { vm.pick(option) } label: {
                            HStack {
                                Text(option)
                                    .font(WordlyFonts.body(15, weight: .semibold))
                                    .foregroundStyle(WordlyColors.ink)
                                    .multilineTextAlignment(.leading)
                                Spacer()
                                if vm.session.picked == option {
                                    Image(systemName: "checkmark.circle.fill").foregroundStyle(WordlyColors.electric)
                                }
                            }
                            .padding(16)
                            .background(vm.session.picked == option ? WordlyColors.electricSubtle : WordlyColors.cardBG)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14)
                                .stroke(vm.session.picked == option ? WordlyColors.electric : WordlyColors.cardBorder, lineWidth: vm.session.picked == option ? 2 : 1))
                        }
                        .buttonStyle(.plain)
                        .disabled(vm.session.picked != nil && vm.session.picked != option)
                    }
                }
            }
            if let error = vm.error {
                Text(error).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.error)
            }
            Button {
                Task { await vm.next() }
            } label: {
                Text(vm.session.isLastQuestion ? "Nộp bài" : "Tiếp")
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
                    Text("\(vm.requeued) từ trả lời sai sẽ được nhắc ôn lại.")
                        .font(WordlyFonts.body(13))
                        .foregroundStyle(WordlyColors.inkSoft)
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

                Button("Làm lại") { vm.restart() }
                    .buttonStyle(ElectricButtonStyle(isFullWidth: true))
            }
        }
    }
}
