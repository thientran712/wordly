import Foundation
import UIKit
import Combine

/// Màn Dịch & tra từ — hành vi giống web (components/home/InlineTranslate.js):
/// dịch tự động khi gõ, gợi ý từ (Datamuse), từ điển AI cho từ đơn, tự ghi lịch
/// sử sau 2 giây, nút Lưu đánh dấu "Đã lưu" (vào quiz + widget + thông báo nhắc ôn)
/// — chỉ cho từ/cụm ngắn, câu dài chỉ nằm trong lịch sử.
@MainActor
final class TranslateViewModel: ObservableObject {
    enum Direction: String, CaseIterable {
        case enToVi = "EN→VI"
        case viToEn = "VI→EN"

        var source: String { self == .enToVi ? "EN" : "VI" }
        var target: String { self == .enToVi ? "VI" : "EN" }
        var sourceName: String { self == .enToVi ? "English" : "Tiếng Việt" }
        var targetName: String { self == .enToVi ? "Tiếng Việt" : "English" }
        var flipped: Direction { self == .enToVi ? .viToEn : .enToVi }
    }

    enum DictionaryState: Equatable {
        case hidden, loading, loaded(DictionaryDetail), notFound, failed(String)
    }

    @Published var inputText = ""
    @Published var translatedText = ""
    @Published var direction: Direction = .enToVi
    @Published var isTranslating = false
    @Published var suggestions: [String] = []
    @Published var dictionary: DictionaryState = .hidden
    @Published var saved = false
    @Published var toast: String?
    /// Hết lượt dịch (402 limit_translate) → sheet mời xem quảng cáo thưởng
    @Published var adGate: AdGate?
    @Published private(set) var isRewarding = false
    /// Sheet hỏi bật nhắc ôn qua thông báo — chỉ một lần, sau lần lưu từ đầu tiên.
    @Published var offerPushReminder = false
    /// Tăng mỗi khi lịch sử đổi (tự ghi / lưu) để danh sách lịch sử tải lại.
    @Published var historyVersion = 0

    init() { observeDictation() }

    let charLimit = 10_000
    var isOverLimit: Bool { inputText.count > charLimit }
    var canSave: Bool {
        !inputText.trimmingCharacters(in: .whitespaces).isEmpty && !translatedText.isEmpty && !isTranslating
            && TranslateLogic.canSaveForReview(inputText)
    }
    /// Câu/đoạn dài: có bản dịch nhưng không lưu để nhắc ôn (chỉ vào lịch sử).
    /// Câu đã lưu từ trước (bản cũ chưa chặn) vẫn hiện "Đã lưu".
    var isTooLongToSave: Bool { !saved && !translatedText.isEmpty && !TranslateLogic.canSaveForReview(inputText) }

    private let api = APIClient.shared
    private var translateTask: Task<Void, Never>?
    private var suggestTask: Task<Void, Never>?
    private var autoLogTask: Task<Void, Never>?
    private var translateCache: [String: String] = [:]
    private var dictCache: [String: DictionaryDetail] = [:]
    private var autoLog = AutoLogTracker()
    private var suppressSuggestions = false
    /// Đổi inputText bằng code (chọn mục lịch sử) → onChange của ô nhập không xử lý lại.
    private var skipNextChange = false
    /// Một lần nhập (gõ dần / nói dần gửi nhiều request) → server chỉ tính 1 lượt (spec Pro §3)
    private var quotaKey = UUID().uuidString
    /// Chữ đến từ ghi âm → báo server là dịch giọng nói
    private var fromVoice = false
    private var countedKey: String?
    /// Hết lượt tra từ: vẫn có nghĩa ngắn, thẻ chi tiết khoá (spec Pro §3)
    @Published var dictionaryLocked = false

    // MARK: Chụp ảnh / ghi âm dịch (giống web InlineTranslate.js)
    @Published var isReadingImage = false
    @Published var imageError: String?
    @Published var isDictating = false
    @Published var dictationLevel: Float = 0
    @Published var dictationRemaining = DictationLimit.maxSeconds
    let dictation = DictationManager()
    private var dictationCancellables: Set<AnyCancellable> = []
    /// Chống bấm dồn nút mic (xin quyền là async — bấm 2 lần nhanh từng bật 2 lần).
    private var dictationThrottle = TapThrottle(interval: 0.8)
    private var isTogglingDictation = false

    /// Dịch ngay khi đang nói, không đợi dừng ghi âm — đẩy transcript từng
    /// phần (partial results của Speech framework) vào `inputText` giống
    /// gõ tay, tự chạy qua debounce dịch (300ms) đã có sẵn.
    private func observeDictation() {
        dictation.onLimitReached = { [weak self] in
            self?.toast = "Đã đủ \(DictationLimit.maxSeconds) giây — tự dừng ghi âm"
        }
        dictation.$isListening
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.isDictating = $0 }
            .store(in: &dictationCancellables)
        dictation.$audioLevel
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.dictationLevel = $0 }
            .store(in: &dictationCancellables)
        dictation.$remainingSeconds
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.dictationRemaining = $0 }
            .store(in: &dictationCancellables)
        dictation.$transcript
            .receive(on: DispatchQueue.main)
            .sink { [weak self] text in
                guard let self, self.dictation.isListening else { return }
                self.inputText = text
            }
            .store(in: &dictationCancellables)
    }

    // MARK: Gõ chữ
    func onInputChanged(_ text: String) {
        if skipNextChange {
            skipNextChange = false
            return
        }
        saved = false
        fromVoice = dictation.isListening
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { quotaKey = UUID().uuidString }
        if !TranslateLogic.isSingleWord(text) { dictionary = .hidden; dictionaryLocked = false }
        scheduleTranslation(text)
        if direction == .enToVi, !suppressSuggestions { scheduleSuggestions(text) } else { suggestions = [] }
    }

    private func scheduleTranslation(_ text: String) {
        translateTask?.cancel()
        autoLogTask?.cancel()
        guard !isOverLimit, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            translatedText = ""
            return
        }
        translateTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await translate(text)
        }
    }

    private func translate(_ text: String) async {
        let key = "\(direction.rawValue)::\(text.trimmingCharacters(in: .whitespacesAndNewlines))"
        if let cached = translateCache[key] {
            translatedText = cached
        } else {
            isTranslating = true
            defer { isTranslating = false }
            do {
                let r = try await api.translate(text: text, source: direction.source, target: direction.target,
                                                input: fromVoice ? "voice" : nil, quotaKey: quotaKey)
                guard !Task.isCancelled else { return }
                guard let result = r.translated, !result.isEmpty else {
                    translatedText = ""
                    toast = r.error ?? "Không dịch được, thử lại nhé"
                    return
                }
                translateCache[key] = result
                translatedText = result
                // Dịch nâng cao vừa tính lượt → cập nhật bộ đếm (một lần mỗi lần nhập)
                let words = text.split(whereSeparator: \.isWhitespace).count
                if ProStore.shared.showsLimits, fromVoice || words > 3, countedKey != quotaKey {
                    countedKey = quotaKey
                    Task { await ProStore.shared.refreshStatus() }
                }
            } catch {
                // Gõ tiếp → yêu cầu cũ bị huỷ (URLSession ném lỗi huỷ) — không phải
                // mất mạng; trước đây hiện "Mất kết nối" sai mỗi khi gõ nhanh.
                guard !Task.isCancelled else { return }
                if case APIError.limitReached(.translate, let message, _) = error {
                    translatedText = ""
                    adGate = AdGate(message: message, pending: .text)
                } else if ProStore.shared.handle(error) {
                    translatedText = ""
                } else if case APIError.serverError(let m) = error, m.contains("429") {
                    toast = "Bạn dịch hơi nhanh, chờ vài giây rồi thử lại nhé"
                } else {
                    toast = "Mất kết nối — thử lại nhé"
                }
                return
            }
        }
        // Từ điển AI tính phí theo lượt → không tự tra mỗi lần gõ (giống web: tra
        // khi chọn gợi ý / mục lịch sử, hoặc bấm "Tra nghĩa")
        scheduleAutoLog()
    }

    /// Tự ghi bản dịch vào lịch sử sau `TranslateLogic.autoLogDelay` đứng yên
    /// (chưa "Lưu") — web chờ 10 giây, quá lâu nên lịch sử trông như không cập nhật.
    private func scheduleAutoLog() {
        autoLogTask?.cancel()
        let source = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        let translated = translatedText
        let dir = direction.rawValue
        autoLogTask = Task {
            try? await Task.sleep(for: TranslateLogic.autoLogDelay)
            guard !Task.isCancelled else { return }
            await logHistory(source: source, translated: translated, direction: dir)
        }
    }

    /// Xoá ô nhập trước khi kịp tự ghi → ghi ngay, không mất bản dịch vừa xong.
    private func flushAutoLog() {
        let source = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        let dir = direction.rawValue
        // Chỉ khi bản dịch đang hiện đúng là của chữ đang nhập (không phải bản cũ
        // còn chờ debounce)
        guard !source.isEmpty, !translatedText.isEmpty, !isTranslating,
              translateCache["\(dir)::\(source)"] == translatedText else { return }
        autoLogTask?.cancel()
        let translated = translatedText
        Task { await logHistory(source: source, translated: translated, direction: dir) }
    }

    private func logHistory(source: String, translated: String, direction dir: String) async {
        guard autoLog.shouldLog(direction: dir, text: source) else { return }
        do {
            try await api.saveTranslation(sourceText: source, translatedText: translated, direction: dir)
            historyVersion += 1
        } catch {
            autoLog.forget(direction: dir, text: source)
        }
    }

    // MARK: Gợi ý từ
    private func scheduleSuggestions(_ text: String) {
        suggestTask?.cancel()
        let typed = text.trimmingCharacters(in: .whitespaces)
        guard typed.count >= 2, TranslateLogic.isSingleWord(typed) else {
            suggestions = []
            return
        }
        suggestTask = Task {
            try? await Task.sleep(for: .milliseconds(150))
            guard !Task.isCancelled else { return }
            let fetched = (try? await api.fetchSuggestions(query: typed)) ?? []
            guard !Task.isCancelled else { return }
            suggestions = TranslateLogic.orderSuggestions(typed: typed, fetched: fetched)
        }
    }

    func pickSuggestion(_ word: String) {
        suppressSuggestions = true
        suggestions = []
        inputText = word   // onChange của ô nhập sẽ dịch
        if direction == .enToVi { Task { await lookUp(word) } }
        Task {
            try? await Task.sleep(for: .seconds(1))
            suppressSuggestions = false
        }
    }

    // MARK: Từ điển AI
    func lookUp(_ word: String) async {
        let key = TranslateLogic.wordKey(word)
        if let cached = dictCache[key] {
            dictionary = .loaded(cached)
            return
        }
        dictionary = .loading
        // Người dùng đổi từ trong lúc chờ → bỏ kết quả cũ, không hiện nhầm thẻ từ
        func stillCurrent() -> Bool { TranslateLogic.wordKey(inputText) == key }
        do {
            let detail = try await api.lookupWord(key)
            guard stillCurrent() else { return }
            if let detail {
                dictCache[key] = detail
                dictionary = .loaded(detail)
            } else {
                dictionary = .notFound
            }
        } catch APIError.serverError(let m) where m.contains("429") {
            if stillCurrent() { dictionary = .failed("Bạn tra hơi nhanh, chờ một chút rồi thử lại nhé.") }
        } catch APIError.limitReached {
            // Hết lượt: nghĩa ngắn (bản dịch) vẫn hiện, thẻ chi tiết mờ + "Mở khoá với Pro"
            if stillCurrent() { dictionary = .hidden; dictionaryLocked = true }
            await ProStore.shared.refreshStatus()
        } catch {
            if stillCurrent() { dictionary = .failed("Không tra được nghĩa từ. Thử lại nhé.") }
        }
    }

    /// Hiện nút "Tra nghĩa" khi đang có một từ tiếng Anh mà chưa tra.
    var canLookUp: Bool {
        direction == .enToVi && dictionary == .hidden && TranslateLogic.isSingleWord(inputText) && !translatedText.isEmpty
    }

    func retryLookup() {
        guard dictionary != .loading else { return }   // đang tra → bỏ qua bấm dồn
        Task { await lookUp(inputText) }
    }

    // MARK: Hành động
    func flipDirection() {
        direction = direction.flipped
        suggestions = []
        dictionary = .hidden
        if !translatedText.isEmpty {
            let old = inputText
            inputText = translatedText
            translatedText = old
        }
        saved = false
    }

    func clear() {
        flushAutoLog()
        translateTask?.cancel()
        suggestTask?.cancel()
        autoLogTask?.cancel()
        inputText = ""
        translatedText = ""
        suggestions = []
        dictionary = .hidden
        dictionaryLocked = false
        saved = false
        quotaKey = UUID().uuidString
    }

    /// "Lưu" — web dùng PATCH: đánh dấu dòng lịch sử là đã lưu (tạo mới nếu chưa có).
    func save() async {
        guard canSave, !saved else { return }
        saved = true
        let source = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await api.markSaved(sourceText: source, translatedText: translatedText, direction: direction.rawValue)
            _ = autoLog.shouldLog(direction: direction.rawValue, text: source) // đã có trong lịch sử, khỏi tự ghi
            autoLogTask?.cancel()
            historyVersion += 1
            SavedWordsSignal.shared.changed()
            toast = "Đã lưu “\(source)” — sẽ có trong quiz và widget"
            Task {
                await WidgetSync.refresh()
                await OnboardingCenter.shared.afterSave()
                await ProStore.shared.noteSaved()
            }
            Task { await maybeOfferPushReminder() }
        } catch {
            saved = false
            if !ProStore.shared.handle(error) { toast = "Không lưu được, thử lại nhé" }
        }
    }

    /// Lần đầu lưu từ (và chưa từng trả lời quyền thông báo) → hỏi bật nhắc 20:00.
    private func maybeOfferPushReminder() async {
        let shown = UserDefaults.standard.bool(forKey: PushLogic.promptShownKey)
        let status = await PushManager.shared.authorizationStatus()
        guard PushLogic.shouldOfferPrompt(alreadyShown: shown, status: status, pushAvailable: PushManager.shared.isAvailable) else { return }
        UserDefaults.standard.set(true, forKey: PushLogic.promptShownKey)
        OnboardingCenter.shared.notePushInvite()
        offerPushReminder = true
    }

    // MARK: Chụp ảnh dịch — gửi thẳng ảnh gốc (giống web, không resize/crop
    // client-side), server (Gemini vision) OCR + dịch cùng lúc.
    func handleImagePicked(_ image: UIImage) {
        guard !isReadingImage else { return }
        guard let jpeg = image.jpegData(compressionQuality: 0.85) else {
            imageError = "Không đọc được ảnh, thử lại nhé"
            return
        }
        guard jpeg.count <= TranslateLogic.maxImageBytes else {
            imageError = "Ảnh quá lớn (tối đa \(TranslateLogic.maxImageBytes / 1024 / 1024)MB), thử lại nhé"
            return
        }
        imageError = nil
        isReadingImage = true
        direction = .enToVi  // web luôn cố định chiều ảnh EN→VI
        Task {
            defer { isReadingImage = false }
            do {
                let r = try await api.translateImage(dataURL: TranslateLogic.imageDataURL(jpegData: jpeg))
                guard let source = r.sourceText, let translated = r.translatedText, !source.isEmpty else {
                    imageError = r.error ?? "Không tìm thấy chữ trong ảnh"
                    return
                }
                skipNextChange = false
                inputText = source
                translatedText = translated
                Task { await ProStore.shared.refreshStatus() }
                translateCache["\(direction.rawValue)::\(source)"] = translated
                saved = false
                scheduleAutoLog()
            } catch {
                if case APIError.limitReached(.translate, let message, _) = error {
                    adGate = AdGate(message: message, pending: .image(image))
                } else if !ProStore.shared.handle(error) {
                    imageError = TranslateLogic.imageErrorMessage(error)
                }
            }
        }
    }

    // MARK: Ghi âm dịch — lấy text bằng Speech framework on-device rồi dịch
    // qua pipeline sẵn có (DeepL), giống web nhưng không cần fallback Whisper.
    func toggleDictation() async {
        guard !isTogglingDictation, dictationThrottle.allow() else { return }
        if dictation.isListening {
            dictation.stop()
            return
        }
        isTogglingDictation = true
        defer { isTogglingDictation = false }
        guard await dictation.requestPermissions() else { return }
        TTSManager.shared.stop()   // mic và loa không chạy cùng lúc
        clear()
        dictation.start(localeId: direction == .enToVi ? "en-US" : "vi-VN")
    }

    /// Nhận một mục từ lịch sử để xem lại.
    func load(entry: TranslateHistoryEntry) {
        direction = entry.direction == Direction.viToEn.rawValue ? .viToEn : .enToVi
        suppressSuggestions = true
        skipNextChange = entry.sourceText != inputText
        inputText = entry.sourceText
        translatedText = entry.translatedText
        translateCache["\(direction.rawValue)::\(entry.sourceText)"] = entry.translatedText
        saved = entry.isSaved == true
        suggestions = []
        _ = autoLog.shouldLog(direction: direction.rawValue, text: entry.sourceText)
        // Không tự tra từ điển AI (tính phí theo lượt, và chậm) — từ đơn tiếng
        // Anh thì hiện nút "Tra nghĩa" để người dùng tự bấm (xem canLookUp).
        dictionary = .hidden
        dictionaryLocked = false
        quotaKey = UUID().uuidString
        Task {
            try? await Task.sleep(for: .seconds(1))
            suppressSuggestions = false
        }
    }

    // MARK: Hết lượt dịch → quảng cáo thưởng (spec 2026-10-23)

    /// Xem quảng cáo → chờ server cộng lượt (callback SSV) → dịch lại đúng lần
    /// đang chờ (giữ quota_key cũ). Quảng cáo lỗi / callback trễ → lượt dự phòng.
    func watchRewardAd() async {
        guard let gate = adGate, !isRewarding else { return }
        guard let uid = AuthManager.shared.currentUser?.id else { adGate = nil; return }
        isRewarding = true
        defer { isRewarding = false }
        let before = ProStore.shared.status.ads?.translate?.credits ?? 0
        var next = RewardFlow.afterAd(await AdsManager.shared.showRewarded(userId: uid, customData: RewardData.translate))
        let started = Date()
        while next == .poll {
            try? await Task.sleep(for: .milliseconds(1500))
            await ProStore.shared.refreshStatus()
            next = RewardFlow.afterPoll(creditsBefore: before, creditsNow: ProStore.shared.status.ads?.translate?.credits,
                                        elapsed: Date().timeIntervalSince(started))
        }
        switch next {
        case .retry:
            adGate = nil
            await retry(gate.pending)
        case .fallback:
            if let r = try? await api.postAdFallback(), r.granted {
                adGate = nil
                Task { await ProStore.shared.refreshStatus() }
                await retry(gate.pending)
            } else {
                adGate = nil
                toast = "Chưa tải được quảng cáo, thử lại sau ít phút nhé"
            }
        case .stay, .poll:
            break
        }
    }

    private func retry(_ pending: AdGate.Pending) async {
        switch pending {
        case .text:
            guard !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
            await translate(inputText)
        case .image(let image):
            handleImagePicked(image)
        }
    }

}
