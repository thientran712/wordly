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
    @Published var isListening = false {
        didSet { AdsCenter.shared.isRecording = isListening }
    }
    @Published var transcript = ""
    @Published var error: String?
    /// Mức âm lượng 0...1 để vẽ sóng âm động trên UI — lấy mẫu thưa (~12
    /// lần/giây) từ buffer audio, không cập nhật mỗi buffer (quá dày, phí).
    @Published var audioLevel: Float = 0
    /// Giây còn lại trước khi tự dừng (`DictationLimit`, tối đa 30 giây).
    @Published var remainingSeconds = DictationLimit.maxSeconds
    /// Gọi khi tự dừng vì đủ 30 giây — màn hình báo cho người dùng biết.
    var onLimitReached: (() -> Void)?

    private var recognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    private var lastLevelUpdate = Date.distantPast
    private var limitTask: Task<Void, Never>?

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
                let level = DictationManager.normalizedLevel(of: buffer)
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    self.recognitionRequest?.append(buffer)
                    let now = Date()
                    guard now.timeIntervalSince(self.lastLevelUpdate) > 0.08 else { return }
                    self.lastLevelUpdate = now
                    self.audioLevel = level
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
            startLimitTimer()
        } catch {
            self.error = "Không thể bật mic: \(error.localizedDescription)"
        }
    }

    private func startLimitTimer() {
        let startedAt = Date()
        remainingSeconds = DictationLimit.maxSeconds
        limitTask?.cancel()
        limitTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 250_000_000)
                guard let self, self.isListening, !Task.isCancelled else { return }
                self.remainingSeconds = DictationLimit.remaining(startedAt: startedAt)
                if DictationLimit.isOver(startedAt: startedAt) {
                    self.stop()
                    self.onLimitReached?()
                    return
                }
            }
        }
    }

    func stop() {
        guard isListening else { return }
        limitTask?.cancel()
        limitTask = nil
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil
        isListening = false
        audioLevel = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    // nonisolated: an toàn tính trên thread audio real-time của installTap,
    // giống decibels() của SpeechManager — không chạm self ở đây.
    private nonisolated static func normalizedLevel(of buffer: AVAudioPCMBuffer) -> Float {
        guard let channelData = buffer.floatChannelData?[0] else { return 0 }
        let frameLength = Int(buffer.frameLength)
        guard frameLength > 0 else { return 0 }
        var sum: Float = 0
        for i in 0..<frameLength { sum += abs(channelData[i]) }
        let rms = sum / Float(frameLength)
        let dB = 20 * log10(rms)
        guard dB.isFinite else { return 0 }
        return min(max((dB + 50) / 50, 0), 1)
    }
}
