import SwiftUI

// Bài tập — phía học viên của web components/org/HomeworkPanel.js:
// trắc nghiệm, điền từ, ghép đôi (chấm tự động), tự luận (giáo viên chấm).
struct HomeworkListTab: View {
    let classId: String
    @State private var state: Loadable<[Homework]> = .idle

    var body: some View {
        ScrollView {
            LoadableView(state: state, retry: { Task { await load() } }) { items in
                if items.isEmpty {
                    EmptyStateView(systemImage: "checklist", title: "Giáo viên chưa giao bài tập")
                } else {
                    VStack(spacing: 12) {
                        ForEach(items) { hw in
                            NavigationLink {
                                HomeworkDoView(homework: hw) { await load() }
                            } label: { HomeworkRow(homework: hw) }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(16)
                }
            }
        }
        .task { if case .idle = state { await load() } }
        .refreshable { await load() }
    }

    private func load() async {
        do { state = .loaded(try await APIClient.shared.fetchHomework(classId: classId)) }
        catch { state = .failed("Không tải được bài tập.") }
    }
}

struct HomeworkRow: View {
    let homework: Homework

    private var status: ClassLogic.HomeworkStatus { ClassLogic.status(of: homework) }
    private var statusColor: Color {
        switch status {
        case .todo: return WordlyColors.duoBlue
        case .overdue: return WordlyColors.error
        case .draft: return WordlyColors.duoOrange
        case .submitted: return WordlyColors.duoPurple
        case .graded: return WordlyColors.electric
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(homework.title).font(WordlyFonts.body(16, weight: .bold)).foregroundStyle(WordlyColors.ink)
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(WordlyColors.inkGhost)
            }
            HStack(spacing: 8) {
                Badge(text: status.label, color: statusColor)
                Text("\(homework.questions.count) câu · \(homework.totalPoints ?? 0) điểm")
                    .font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
            }
            if let due = homework.dueAt.flatMap(APIDate.parse) {
                Label("Hạn: \(due.formatted(date: .abbreviated, time: .shortened))", systemImage: "calendar")
                    .font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
            }
        }
        .wordlyCard(padding: 14)
    }
}

struct HomeworkDoView: View {
    let homework: Homework
    var onChanged: () async -> Void

    @State private var draft: HomeworkDraft
    @State private var saving = false
    @State private var result: HomeworkSubmitResponse.Result?
    @State private var error: String?
    @State private var toast: String?
    @State private var confirmSubmit = false

    init(homework: Homework, onChanged: @escaping () async -> Void) {
        self.homework = homework
        self.onChanged = onChanged
        _draft = State(initialValue: HomeworkDraft(questions: homework.questions))
    }

    private var readOnly: Bool { homework.mySubmission?.status == "graded" || homework.mySubmission?.status == "submitted" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let ins = homework.instructions, !ins.isEmpty {
                    Text(ins).font(WordlyFonts.body(14)).foregroundStyle(WordlyColors.inkSoft)
                }
                if readOnly {
                    Label(ClassLogic.status(of: homework).label, systemImage: "checkmark.seal.fill")
                        .font(WordlyFonts.body(14, weight: .bold))
                        .foregroundStyle(WordlyColors.electric)
                }
                if let result { resultCard(result) }
                ForEach(Array(homework.questions.enumerated()), id: \.element.id) { index, q in
                    questionCard(index: index, q)
                }
                if let error { Text(error).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.error) }
                if !readOnly && result == nil {
                    Text("Đã trả lời \(draft.answeredCount)/\(homework.questions.count) câu")
                        .font(WordlyFonts.body(13, weight: .medium)).foregroundStyle(WordlyColors.inkSoft)
                    HStack(spacing: 12) {
                        Button("Lưu nháp") { Task { await submit(draft: true) } }
                            .buttonStyle(GhostButtonStyle())
                            .disabled(saving)
                        Button("Nộp bài") { confirmSubmit = true }
                            .buttonStyle(ElectricButtonStyle(isLoading: saving, isFullWidth: true))
                            .disabled(saving || draft.answeredCount == 0)
                    }
                }
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .navigationTitle(homework.title)
        .navigationBarTitleDisplayMode(.inline)
        .toast($toast)
        .confirmationDialog(draft.isComplete ? "Nộp bài?" : "Còn câu chưa trả lời. Vẫn nộp?",
                            isPresented: $confirmSubmit, titleVisibility: .visible) {
            Button("Nộp bài") { Task { await submit(draft: false) } }
            Button("Làm tiếp", role: .cancel) {}
        }
    }

    @ViewBuilder
    private func questionCard(index: Int, _ q: HomeworkQuestion) -> some View {
        let correctness = result?.details?[q.id]?.correct
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                Text("Câu \(index + 1)").font(WordlyFonts.body(12, weight: .bold)).foregroundStyle(WordlyColors.electric)
                Spacer()
                if let c = correctness {
                    Image(systemName: c ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .foregroundStyle(c ? WordlyColors.electric : WordlyColors.error)
                }
                Text("\(q.points ?? 0) điểm").font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
            }
            Text(q.prompt).font(WordlyFonts.body(15, weight: .semibold)).foregroundStyle(WordlyColors.ink)
            switch q.type {
            case "mcq":
                ForEach(Array((q.options ?? []).enumerated()), id: \.offset) { i, option in
                    Button { draft.choose(q.id, index: i) } label: {
                        HStack {
                            Image(systemName: draft.choice(q.id) == i ? "largecircle.fill.circle" : "circle")
                                .foregroundStyle(draft.choice(q.id) == i ? WordlyColors.electric : WordlyColors.inkGhost)
                            Text(option).font(WordlyFonts.body(14)).foregroundStyle(WordlyColors.ink)
                            Spacer()
                        }
                        .padding(12)
                        .background(draft.choice(q.id) == i ? WordlyColors.electricSubtle : WordlyColors.hoverBG)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                    .disabled(readOnly || result != nil)
                }
            case "fill":
                TextField("Điền đáp án", text: binding(q.id))
                    .font(WordlyFonts.body(15))
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .wordlyInputStyle()
                    .disabled(readOnly || result != nil)
            case "essay":
                TextEditor(text: binding(q.id))
                    .font(WordlyFonts.body(15))
                    .frame(minHeight: 120)
                    .scrollContentBackground(.hidden)
                    .wordlyInputStyle()
                    .disabled(readOnly || result != nil)
                Text("Câu tự luận — giáo viên sẽ chấm.").font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
            case "match":
                ForEach(q.pairs?.lefts ?? [], id: \.self) { left in
                    HStack {
                        Text(left).font(WordlyFonts.body(14, weight: .semibold)).foregroundStyle(WordlyColors.ink)
                        Spacer()
                        Menu {
                            ForEach(q.pairs?.rights ?? [], id: \.self) { right in
                                Button(right) { draft.match(q.id, left: left, right: right) }
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Text(draft.matched(q.id, left: left) ?? "Chọn…")
                                Image(systemName: "chevron.up.chevron.down").font(.system(size: 11))
                            }
                            .font(WordlyFonts.body(14, weight: .medium))
                            .foregroundStyle(draft.matched(q.id, left: left) == nil ? WordlyColors.inkSoft : WordlyColors.electric)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(WordlyColors.hoverBG)
                            .clipShape(Capsule())
                        }
                        .disabled(readOnly || result != nil)
                    }
                }
            default:
                Text("Loại câu hỏi chưa hỗ trợ").font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.inkSoft)
            }
        }
        .wordlyCard(padding: 14)
    }

    private func binding(_ qid: String) -> Binding<String> {
        Binding(get: { draft.text(qid) }, set: { draft.setText(qid, $0) })
    }

    private func resultCard(_ r: HomeworkSubmitResponse.Result) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Đã nộp bài!", systemImage: "checkmark.seal.fill")
                .font(WordlyFonts.body(17, weight: .bold)).foregroundStyle(WordlyColors.electric)
            if let s = r.autoScore, let m = r.autoMax {
                Text("Phần tự chấm: \(ClassLogic.formatScore(s))/\(ClassLogic.formatScore(m)) điểm")
                    .font(WordlyFonts.body(14, weight: .semibold)).foregroundStyle(WordlyColors.ink)
            }
            if r.needsManual == true {
                Text("Phần tự luận (\(ClassLogic.formatScore(r.manualMax ?? 0)) điểm) đang chờ giáo viên chấm.")
                    .font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.inkSoft)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(WordlyColors.electricSubtle)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func submit(draft isDraft: Bool) async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            let r = try await APIClient.shared.submitHomework(id: homework.id, answers: draft.answers, draft: isDraft)
            if isDraft {
                toast = "Đã lưu nháp"
            } else {
                result = r.result
            }
            await onChanged()
        } catch APIError.serverError(let m) {
            error = JoinClassSheet.message(from: m)
        } catch {
            self.error = "Không nộp được bài. Thử lại nhé."
        }
    }
}
