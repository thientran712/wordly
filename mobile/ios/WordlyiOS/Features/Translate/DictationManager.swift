import Foundation
import Speech
import AVFoundation

/// Ghi âm 1 lần để dịch (giống nút mic ở web InlineTranslate.js) — bấm bắt
/// đầu, bấm lại để dừng, không có VAD/câu chuyện liên tục như SpeechManager
/// (dùng cho luyện nói với Alex). Web ưu tiên Web Speech API của browser;
/// trên iOS ta có Speech framework on-device sẵn nên dùng luôn, không cần
/// port nhánh dự phòng Whisper (/api/translate/voice) của web.
@MainActor
final class DictationManager: NSObject, ObservableObject {
    @Published var isListening = false
    @Published var transcript = ""
    @Published var error: String?

    private var recognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()

    func requestPermissions() async -> Bool {
        let speechStatus = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }
        let micStatus = await AVAudioApplication.requestRecordPermission()
        let granted = speechStatus == .authorized && micStatus
        if !granted { error = "Cần quyền mic và nhận dạng giọng nói để ghi âm" }
        return granted
    }

    /// `localeId`: "en-US" khi dịch EN→VI, "vi-VN" khi dịch VI→EN — khớp
    /// cách web chọn `recognition.lang` theo chiều dịch hiện tại.
    func start(localeId: String) {
        guard !isListening else { return }
        error = nil
        transcript = ""
        recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeId))
        guard let recognizer, recognizer.isAvailable else {
            error = "Không nhận dạng được giọng \(localeId) trên máy này"
            return
        }

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
            guard let recognitionRequest else { return }
            recognitionRequest.shouldReportPartialResults = true

            let inputNode = audioEngine.inputNode
            let format = inputNode.outputFormat(forBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                Task { @MainActor [weak self] in
                    self?.recognitionRequest?.append(buffer)
                }
            }

            audioEngine.prepare()
            try audioEngine.start()

            recognitionTask = recognizer.recognitionTask(with: recognitionRequest) { [weak self] result, taskError in
                guard let self else { return }
                if let result {
                    Task { @MainActor in self.transcript = result.bestTranscription.formattedString }
                }
                if taskError != nil {
                    Task { @MainActor in self.stop() }
                }
            }
            isListening = true
        } catch {
            self.error = "Không thể bật mic: \(error.localizedDescription)"
        }
    }

    func stop() {
        guard isListening else { return }
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil
        isListening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
