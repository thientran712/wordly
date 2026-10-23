import AVFoundation
import Foundation
import SwiftUI

/// Phát âm dùng chung cho mọi nút loa. Một nguồn phát tại một thời điểm
/// (`SpeakGate`): đang đọc thì các nút loa khác mờ đi và không nhận chạm,
/// bấm lại đúng nút đang đọc thì dừng; bấm dồn bị chặn (`TapThrottle`).
@MainActor
final class TTSManager: NSObject, ObservableObject {
    static let shared = TTSManager()
    @Published private(set) var isSpeaking = false
    /// Nút đang đọc (`SpeakGate.key`) — nil khi rảnh.
    @Published private(set) var activeKey: String?

    private var player: AVAudioPlayer?
    private let synth = AVSpeechSynthesizer()
    private var speakTask: Task<Void, Never>?
    /// Tăng mỗi lần bắt đầu/dừng — task cũ bị huỷ không được xoá trạng thái
    /// của lần đọc mới (trước đây `defer { isSpeaking = false }` của task cũ
    /// chạy sau khi task mới bắt đầu → nút hiện rảnh trong khi vẫn đang đọc).
    private var generation = 0
    private var throttle = TapThrottle(interval: 0.4)

    private override init() {
        super.init()
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    /// Nút loa khác đang đọc → nút này khoá.
    func isLocked(_ text: String, lang: String) -> Bool {
        guard let activeKey else { return false }
        return activeKey != SpeakGate.key(text: text, lang: lang)
    }

    /// Bấm nút loa: rảnh thì đọc, bấm lại nút đang đọc thì dừng, nút khác thì bỏ qua.
    func toggle(_ text: String, lang: String = "en-US") {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, throttle.allow() else { return }
        let key = SpeakGate.key(text: text, lang: lang)
        switch SpeakGate.decide(requested: key, active: activeKey) {
        case .start: start(text, lang: lang, key: key)
        case .stop: stop()
        case .ignore: break
        }
    }

    /// Đọc và chờ đọc xong (Alex trả lời) — ngắt mọi thứ đang đọc.
    func speak(_ text: String, lang: String = "en-US") async {
        stop()
        start(text, lang: lang, key: SpeakGate.key(text: text, lang: lang))
        await speakTask?.value
    }

    func stop() {
        generation += 1
        speakTask?.cancel()
        speakTask = nil
        player?.stop()
        player = nil
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
        activeKey = nil
        isSpeaking = false
    }

    private func start(_ text: String, lang: String, key: String) {
        generation += 1
        let gen = generation
        activeKey = key
        isSpeaking = true
        speakTask = Task {
            defer {
                if generation == gen {
                    player = nil
                    activeKey = nil
                    isSpeaking = false
                }
            }
            do {
                let data = try await APIClient.shared.synthesizeSpeech(text: text, lang: lang)
                guard !Task.isCancelled else { return }
                preparePlaybackSession()
                let p = try AVAudioPlayer(data: data, fileTypeHint: "mp3")
                player = p
                p.play()
                while p.isPlaying && !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 100_000_000)
                }
            } catch {
                guard !Task.isCancelled else { return }
                // Dự phòng: giọng máy — giữ synth làm thuộc tính để stop() dừng được
                preparePlaybackSession()
                let utterance = AVSpeechUtterance(string: text)
                utterance.voice = AVSpeechSynthesisVoice(language: lang)
                utterance.rate = 0.45
                synth.speak(utterance)
                try? await Task.sleep(nanoseconds: 200_000_000)
                while synth.isSpeaking && !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 100_000_000)
                }
            }
        }
    }

    /// Ghi âm dịch để session ở `.record` → phát ra không có tiếng. Chuyển lại
    /// `.playback`; giữ nguyên `.playAndRecord` của luyện nói với Alex.
    private func preparePlaybackSession() {
        let session = AVAudioSession.sharedInstance()
        guard session.category != .playback, session.category != .playAndRecord else { return }
        try? session.setCategory(.playback, mode: .default)
        try? session.setActive(true)
    }
}

extension View {
    /// Gắn cho mọi nút loa: nút khác đang đọc thì mờ đi và không bấm được.
    func speakLocked(_ tts: TTSManager, text: String, lang: String) -> some View {
        let locked = tts.isLocked(text, lang: lang)
        return disabled(locked).opacity(locked ? 0.4 : 1)
    }
}
