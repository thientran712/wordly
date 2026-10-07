import SwiftUI
import AVFoundation

// Bài nói — phía học viên của web components/org/SpeakingPanel.js: đọc đề,
// ghi âm (tối đa max_seconds), nghe lại, nộp; xem điểm + nhận xét khi đã chấm.
struct SpeakingListTab: View {
    let classId: String
    @State private var state: Loadable<[SpeakingPrompt]> = .idle

    var body: some View {
        ScrollView {
            LoadableView(state: state, retry: { Task { await load() } }) { prompts in
                if prompts.isEmpty {
                    EmptyStateView(systemImage: "mic", title: "Chưa có đề nói nào")
                } else {
                    VStack(spacing: 12) {
                        ForEach(prompts) { p in
                            NavigationLink { SpeakingAssignmentView(prompt: p) { await load() } } label: {
                                SpeakingRow(prompt: p)
                            }
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
        do { state = .loaded(try await APIClient.shared.fetchSpeaking(classId: classId)) }
        catch { state = .failed("Không tải được bài nói.") }
    }
}

struct SpeakingRow: View {
    let prompt: SpeakingPrompt

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(prompt.title).font(WordlyFonts.body(16, weight: .bold)).foregroundStyle(WordlyColors.ink)
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(WordlyColors.inkGhost)
            }
            HStack(spacing: 8) {
                switch prompt.mySubmission?.status {
                case "graded":
                    Badge(text: "Đã chấm\(prompt.mySubmission?.scoreOverall.map { ": \(ClassLogic.formatScore($0))" } ?? "")")
                case "submitted":
                    Badge(text: "Đã nộp — chờ chấm", color: WordlyColors.duoPurple)
                default:
                    Badge(text: "Chưa nộp", color: WordlyColors.duoBlue)
                }
                Label("\(prompt.maxSeconds / 60) phút \(prompt.maxSeconds % 60 > 0 ? "\(prompt.maxSeconds % 60)s" : "")", systemImage: "timer")
                    .font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
            }
        }
        .wordlyCard(padding: 14)
    }
}

/// Ghi âm m4a (AAC) — server nhận "audio/mp4".
@MainActor
final class AudioRecorder: NSObject, ObservableObject, AVAudioPlayerDelegate {
    enum State: Equatable { case idle, recording, recorded, playing }

    @Published var state: State = .idle
    @Published var elapsedMs = 0
    @Published var permissionDenied = false

    private var recorder: AVAudioRecorder?
    private var player: AVAudioPlayer?
    private var timer: Timer?
    private var startedAt: Date?
    let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent("wordly-speaking.m4a")

    func start(maxSeconds: Int) async {
        guard await AVAudioApplication.requestRecordPermission() else {
            permissionDenied = true
            return
        }
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
        try? session.setActive(true)
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
        ]
        guard let rec = try? AVAudioRecorder(url: fileURL, settings: settings) else { return }
        recorder = rec
        rec.record(forDuration: TimeInterval(maxSeconds))
        startedAt = Date()
        elapsedMs = 0
        state = .recording
        timer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let startedAt = self.startedAt else { return }
                self.elapsedMs = Int(Date().timeIntervalSince(startedAt) * 1000)
                if self.recorder?.isRecording == false { self.stop() }
            }
        }
    }

    func stop() {
        guard state == .recording else { return }
        recorder?.stop()
        timer?.invalidate()
        if let startedAt { elapsedMs = Int(Date().timeIntervalSince(startedAt) * 1000) }
        state = .recorded
    }

    func play() {
        guard let p = try? AVAudioPlayer(contentsOf: fileURL) else { return }
        try? AVAudioSession.sharedInstance().setCategory(.playback)
        player = p
        p.delegate = self
        p.play()
        state = .playing
    }

    func stopPlaying() {
        player?.stop()
        state = .recorded
    }

    func discard() {
        stopPlaying()
        try? FileManager.default.removeItem(at: fileURL)
        elapsedMs = 0
        state = .idle
    }

    var audioData: Data? { try? Data(contentsOf: fileURL) }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in self.state = .recorded }
    }
}

struct SpeakingAssignmentView: View {
    let prompt: SpeakingPrompt
    var onChanged: () async -> Void

    @StateObject private var recorder = AudioRecorder()
    @State private var uploading = false
    @State private var error: String?
    @State private var submitted = false

    private var canRecord: Bool {
        prompt.mySubmission?.status != "graded" && prompt.status != "closed" && !submitted
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Đề bài").font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
                    Text(prompt.promptText).font(WordlyFonts.body(16)).foregroundStyle(WordlyColors.ink)
                    Label("Tối đa \(prompt.maxSeconds) giây", systemImage: "timer")
                        .font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
                }
                .wordlyCard(padding: 16)

                if let sub = prompt.mySubmission, sub.status == "graded" {
                    gradedCard(sub)
                } else if submitted || prompt.mySubmission?.status == "submitted" {
                    Label("Đã nộp — giáo viên sẽ chấm và nhận xét.", systemImage: "checkmark.seal.fill")
                        .font(WordlyFonts.body(14, weight: .semibold)).foregroundStyle(WordlyColors.electric)
                }
                if canRecord { recorderCard }
                if recorder.permissionDenied {
                    Text("Wordly cần quyền micro để ghi âm. Bật trong Cài đặt → Wordly → Micro.")
                        .font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.error)
                }
                if let error { Text(error).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.error) }
            }
            .padding(16)
        }
        .screenBackground()
        .navigationTitle(prompt.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var recorderCard: some View {
        let seconds = recorder.elapsedMs / 1000
        let progress = Double(recorder.elapsedMs) / Double(prompt.maxSeconds * 1000)
        return VStack(spacing: 18) {
            ZStack {
                ProgressRing(progress: recorder.state == .recording ? progress : 0, lineWidth: 10,
                             color: progress > 0.85 ? WordlyColors.error : WordlyColors.electric)
                VStack(spacing: 2) {
                    Text(String(format: "%d:%02d", seconds / 60, seconds % 60))
                        .font(WordlyFonts.display(34)).foregroundStyle(WordlyColors.ink).monospacedDigit()
                    Text("/ \(prompt.maxSeconds / 60):\(String(format: "%02d", prompt.maxSeconds % 60))")
                        .font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
                }
            }
            .frame(width: 170, height: 170)

            switch recorder.state {
            case .idle:
                Button { Task { await recorder.start(maxSeconds: prompt.maxSeconds) } } label: {
                    Label("Bắt đầu ghi âm", systemImage: "mic.fill")
                }
                .buttonStyle(ElectricButtonStyle(isFullWidth: true))
            case .recording:
                Button { recorder.stop() } label: {
                    Label("Dừng", systemImage: "stop.fill")
                        .font(WordlyFonts.body(15, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(WordlyColors.error)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            case .recorded, .playing:
                HStack(spacing: 12) {
                    Button {
                        recorder.state == .playing ? recorder.stopPlaying() : recorder.play()
                    } label: {
                        Label(recorder.state == .playing ? "Dừng nghe" : "Nghe lại",
                              systemImage: recorder.state == .playing ? "stop.fill" : "play.fill")
                    }
                    .buttonStyle(GhostButtonStyle())
                    Button("Ghi lại") { recorder.discard() }
                        .buttonStyle(GhostButtonStyle())
                }
                Button { Task { await submit() } } label: { Text("Nộp bài nói") }
                    .buttonStyle(ElectricButtonStyle(isLoading: uploading, isFullWidth: true))
                    .disabled(uploading)
            }
        }
        .frame(maxWidth: .infinity)
        .wordlyCard(padding: 18)
    }

    private func gradedCard(_ sub: SpeakingSubmission) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Điểm").font(WordlyFonts.body(14, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
                Spacer()
                Text(sub.scoreOverall.map(ClassLogic.formatScore) ?? "—")
                    .font(WordlyFonts.display(28)).foregroundStyle(WordlyColors.electric)
            }
            if let fb = sub.feedback, !fb.isEmpty {
                Text("Nhận xét của giáo viên").font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
                Text(fb).font(WordlyFonts.body(14)).foregroundStyle(WordlyColors.ink)
            }
        }
        .wordlyCard(padding: 16)
    }

    private func submit() async {
        guard let data = recorder.audioData,
              ClassLogic.canSubmitSpeaking(durationMs: recorder.elapsedMs, maxSeconds: prompt.maxSeconds, bytes: data.count) else {
            error = "Bản ghi không hợp lệ (quá ngắn, quá dài hoặc quá 15MB). Ghi lại nhé."
            return
        }
        uploading = true
        error = nil
        defer { uploading = false }
        do {
            try await APIClient.shared.submitSpeaking(promptId: prompt.id, audio: data, durationMs: recorder.elapsedMs)
            submitted = true
            recorder.discard()
            await onChanged()
        } catch APIError.serverError(let m) {
            error = JoinClassSheet.message(from: m)
        } catch {
            self.error = "Không nộp được bài nói. Thử lại nhé."
        }
    }
}
