import AVFoundation
import Foundation

@MainActor
final class TTSManager: NSObject, ObservableObject, AVAudioPlayerDelegate {
    static let shared = TTSManager()
    @Published var isSpeaking = false

    private var player: AVAudioPlayer?
    private var speakTask: Task<Void, Never>?

    private override init() {
        super.init()
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    func speak(_ text: String, lang: String = "en-US") async {
        speakTask?.cancel()
        stop()
        speakTask = Task {
            isSpeaking = true
            defer { isSpeaking = false }
            do {
                let data = try await APIClient.shared.synthesizeSpeech(text: text, lang: lang)
                guard !Task.isCancelled else { return }
                let p = try AVAudioPlayer(data: data, fileTypeHint: "mp3")
                p.delegate = self
                player = p
                p.play()
                // Wait for playback to finish
                while p.isPlaying && !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 100_000_000)
                }
            } catch {
                // Fallback: AVSpeechSynthesizer
                fallbackSpeak(text: text, lang: lang)
            }
        }
    }

    func stop() {
        player?.stop()
        player = nil
        isSpeaking = false
    }

    private func fallbackSpeak(text: String, lang: String) {
        let synth = AVSpeechSynthesizer()
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: lang)
        utterance.rate = 0.45
        synth.speak(utterance)
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in isSpeaking = false }
    }
}
