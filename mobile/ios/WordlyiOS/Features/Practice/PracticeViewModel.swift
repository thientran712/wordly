import Foundation
import Combine

@MainActor
final class PracticeViewModel: ObservableObject {
    // Session state
    @Published var sessions: [PracticeSession] = []
    @Published var sessionsLoading = true
    @Published var activeSessionId: String?
    @Published var messages: [ChatMessage] = []
    @Published var sessionState: SessionState = .idle
    @Published var isThinking = false
    @Published var isSaving = false
    @Published var error: String?
    @Published var sidebarOpen = false

    // Voice state
    @Published var isListening = false
    @Published var isUserTalking = false
    @Published var transcript = ""

    let speech = SpeechManager.shared
    let tts = TTSManager.shared
    let api = APIClient.shared

    private var saveTask: Task<Void, Never>?

    enum SessionState { case idle, connecting, active, ended }

    init() {
        // Wire speech callbacks
        speech.onSpeechEnd = { [weak self] text in
            guard let self else { return }
            Task { await self.handleUserSpeech(text) }
        }
        speech.isSpeakingOrThinking = { [weak self] in
            self?.tts.isSpeaking == true || self?.isThinking == true
        }
    }

    // MARK: - Load sessions
    func loadSessions() async {
        sessionsLoading = true
        do {
            let resp = try await api.fetchSessions()
            sessions = resp.sessions
        } catch {}
        sessionsLoading = false
    }

    // MARK: - Select existing session
    func selectSession(_ id: String) async {
        stopVoice()
        sessionState = .idle
        messages = []
        activeSessionId = id
        do {
            let session = try await api.fetchSession(id: id)
            if let msgs = session.messages, !msgs.isEmpty {
                messages = msgs
                sessionState = .ended
            }
        } catch {}
        sidebarOpen = false
    }

    // MARK: - Start new session
    func startSession() async {
        sessionState = .connecting
        messages = []
        error = nil
        isThinking = true
        do {
            let greeting = try await api.sendPracticeMessage(
                messages: [ChatMessage(role: "user", content: "Hello! I want to practice my English.")],
                vocabularyContext: true
            )
            let initMessages = [
                ChatMessage(role: "user", content: "Hello! I want to practice my English."),
                ChatMessage(role: "assistant", content: greeting)
            ]
            messages = initMessages
            isThinking = false
            sessionState = .active

            // Create session in DB
            let title = "Conversation " + DateFormatter.localizedString(from: Date(), dateStyle: .short, timeStyle: .short)
            let session = try await api.createSession(title: title, messages: initMessages)
            sessions.insert(session, at: 0)
            activeSessionId = session.id

            // Speak greeting
            await speakAndWait(greeting)
            // Start listening after Alex finishes
            startVoice()
        } catch {
            isThinking = false
            sessionState = .idle
            self.error = "Không thể kết nối. Thử lại nhé!"
        }
    }

    // MARK: - Handle user speech
    private func handleUserSpeech(_ text: String) async {
        guard sessionState == .active, !isThinking, !tts.isSpeaking else { return }
        await sendMessage(text)
    }

    // MARK: - Send message
    func sendMessage(_ text: String) async {
        let newMessages = messages + [ChatMessage(role: "user", content: text)]
        messages = newMessages
        isThinking = true
        do {
            let reply = try await api.sendPracticeMessage(messages: newMessages, vocabularyContext: false)
            let withReply = newMessages + [ChatMessage(role: "assistant", content: reply)]
            messages = withReply
            isThinking = false
            scheduleSave(withReply)
            await speakAndWait(reply)
        } catch {
            isThinking = false
            self.error = "Có lỗi xảy ra. Thử lại nhé!"
        }
    }

    private func speakAndWait(_ text: String) async {
        await tts.speak(text, lang: "en-US")
    }

    // MARK: - End session
    func endSession() {
        stopVoice()
        sessionState = .ended
    }

    // MARK: - Resume session
    func resumeSession() {
        sessionState = .active
        error = nil
        startVoice()
    }

    // MARK: - New session (clear)
    func newSession() {
        stopVoice()
        activeSessionId = nil
        messages = []
        sessionState = .idle
        error = nil
        sidebarOpen = false
    }

    // MARK: - Delete session
    func deleteSession(_ id: String) async {
        sessions.removeAll { $0.id == id }
        if activeSessionId == id {
            activeSessionId = nil
            messages = []
            sessionState = .idle
        }
        try? await api.deleteSession(id: id)
    }

    // MARK: - Rename session
    func renameSession(_ id: String, title: String) async {
        if let idx = sessions.firstIndex(where: { $0.id == id }) {
            sessions[idx].title = title
        }
        try? await api.patchSession(id: id, title: title)
    }

    // MARK: - Voice
    func startVoice() {
        guard speech.permissionGranted else {
            Task { await speech.requestPermissions(); if speech.permissionGranted { startVoice() } }
            return
        }
        speech.startListening()
        isListening = true
        transcript = ""
        // Forward transcript updates
        Task {
            while sessionState == .active {
                transcript = speech.transcript
                isUserTalking = speech.isUserTalking
                try? await Task.sleep(nanoseconds: 100_000_000)
            }
        }
    }

    func stopVoice() {
        speech.stopListening()
        isListening = false
        isUserTalking = false
        transcript = ""
        tts.stop()
    }

    func toggleMic() {
        if isListening { stopVoice() } else { startVoice() }
    }

    // MARK: - Auto-save
    private func scheduleSave(_ msgs: [ChatMessage]) {
        guard let id = activeSessionId else { return }
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            guard !Task.isCancelled else { return }
            isSaving = true
            try? await api.patchSession(id: id, messages: msgs)
            isSaving = false
            // Update sessions list title timestamp
            if let idx = sessions.firstIndex(where: { $0.id == id }) {
                sessions[idx].updatedAt = ISO8601DateFormatter().string(from: Date())
            }
        }
    }

    // Computed
    var activeSessionTitle: String {
        sessions.first(where: { $0.id == activeSessionId })?.title ?? "Luyện nói với Alex"
    }
    var userTurnCount: Int { messages.filter { $0.role == "user" }.count }
}
