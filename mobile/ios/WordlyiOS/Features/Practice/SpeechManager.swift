import Foundation
import Speech
import AVFoundation

// MARK: - Speech Manager (STT + VAD)
@MainActor
final class SpeechManager: NSObject, ObservableObject {
    static let shared = SpeechManager()

    @Published var isListening = false
    @Published var isUserTalking = false
    @Published var transcript = ""
    @Published var permissionGranted = false
    @Published var error: String?

    private var recognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    private var silenceTimer: Timer?
    private var lastTranscript = ""

    // Callbacks
    var onSpeechEnd: ((String) -> Void)?
    var isSpeakingOrThinking: () -> Bool = { false }

    private override init() {
        super.init()
        recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    }

    // MARK: - Permissions
    func requestPermissions() async {
        #if DEBUG
        // Xem trước giao diện: không bật hộp thoại xin quyền che màn hình
        if PreviewMode.isOn { return }
        #endif
        let speechStatus = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }
        let micStatus = await AVAudioApplication.requestRecordPermission()
        permissionGranted = speechStatus == .authorized && micStatus
        if !permissionGranted {
            error = "Cần quyền mic và nhận dạng giọng nói để luyện nói"
        }
    }

    // MARK: - Start listening
    func startListening() {
        guard permissionGranted, !isListening else { return }
        error = nil

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
            guard let recognitionRequest else { return }
            recognitionRequest.shouldReportPartialResults = true
            recognitionRequest.requiresOnDeviceRecognition = false

            let inputNode = audioEngine.inputNode
            let recordingFormat = inputNode.outputFormat(forBus: 0)

            // Tap chạy trên thread real-time riêng của CoreAudio, KHÔNG phải
            // main thread — gọi thẳng method @MainActor (self.detectVoiceActivity
            // cũ) từ đây vi phạm actor isolation, gây crash thật trên máy
            // (khác hành vi simulator). Tính dB ở hàm thuần (nonisolated,
            // chạy ngay trên thread audio), chỉ hop sang MainActor để cập
            // nhật state. Đọc self.recognitionRequest qua self (không bind
            // vào hằng cục bộ) để không bị "khoá cứng" vào request cũ sau khi
            // cancelCurrentSpeech() tạo request mới.
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
                let dB = SpeechManager.decibels(of: buffer)
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    self.recognitionRequest?.append(buffer)
                    self.handleVoiceActivity(dB: dB)
                }
            }

            audioEngine.prepare()
            try audioEngine.start()

            recognitionTask = recognizer?.recognitionTask(with: recognitionRequest) { [weak self] result, error in
                guard let self else { return }
                if let result {
                    let text = result.bestTranscription.formattedString
                    Task { @MainActor in
                        self.transcript = text
                        self.lastTranscript = text
                    }
                }
                if error != nil || result?.isFinal == true {
                    Task { @MainActor in self.handleSpeechEnd() }
                }
            }
            isListening = true
        } catch {
            self.error = "Không thể bật mic: \(error.localizedDescription)"
        }
    }

    // MARK: - Stop listening
    func stopListening() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil
        silenceTimer?.invalidate()
        silenceTimer = nil
        isListening = false
        isUserTalking = false
        transcript = ""
        lastTranscript = ""
    }

    // MARK: - VAD via audio power
    private var speechStarted = false
    private var silenceStart: Date?

    // nonisolated + static: an toàn gọi trực tiếp từ thread audio real-time
    // (không chạm self — self là @MainActor, gọi thẳng từ thread khác sẽ
    // vi phạm actor isolation và crash trên máy thật, xem ghi chú ở
    // installTap phía trên).
    private nonisolated static func decibels(of buffer: AVAudioPCMBuffer) -> Float {
        guard let channelData = buffer.floatChannelData?[0] else { return -.infinity }
        let frameLength = Int(buffer.frameLength)
        guard frameLength > 0 else { return -.infinity }
        var sum: Float = 0
        for i in 0..<frameLength { sum += abs(channelData[i]) }
        let rms = sum / Float(frameLength)
        return 20 * log10(rms)
    }

    private func handleVoiceActivity(dB: Float) {
        // If Alex is speaking or thinking, ignore input
        if isSpeakingOrThinking() {
            if speechStarted { cancelCurrentSpeech() }
            return
        }

        let threshold: Float = -30  // dB threshold for voice
        if dB > threshold {
            silenceStart = nil
            if !speechStarted {
                speechStarted = true
                isUserTalking = true
            }
        } else if speechStarted {
            if silenceStart == nil { silenceStart = Date() }
            else if Date().timeIntervalSince(silenceStart!) > 1.2 {
                // 1.2s of silence = end of speech
                speechStarted = false
                isUserTalking = false
                silenceStart = nil
                handleSpeechEnd()
            }
        }
    }

    private func handleSpeechEnd() {
        let text = lastTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        transcript = ""
        lastTranscript = ""
        speechStarted = false
        isUserTalking = false
        if !text.isEmpty {
            onSpeechEnd?(text)
        }
    }

    private func cancelCurrentSpeech() {
        speechStarted = false
        isUserTalking = false
        transcript = ""
        lastTranscript = ""
        recognitionTask?.cancel()
        recognitionRequest?.endAudio()
        // Restart recognition
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        if let req = recognitionRequest {
            req.shouldReportPartialResults = true
            recognitionTask = recognizer?.recognitionTask(with: req) { [weak self] result, _ in
                guard let self else { return }
                if let result {
                    let text = result.bestTranscription.formattedString
                    Task { @MainActor in
                        self.transcript = text
                        self.lastTranscript = text
                    }
                }
            }
        }
    }
}
