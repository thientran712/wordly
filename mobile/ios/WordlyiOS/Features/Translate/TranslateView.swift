import SwiftUI

// Tab đầu tiên — dịch kiểu Google Dịch: thanh ngôn ngữ, ô nhập lớn, thẻ kết quả,
// rồi từ điển AI + lịch sử (giống web /: InlineTranslate + TranslateHistory).
struct TranslateView: View {
    @StateObject private var vm = TranslateViewModel()
    @StateObject private var tts = TTSManager.shared
    @EnvironmentObject private var router: AppRouter
    @FocusState private var inputFocused: Bool
    @State private var showCamera = false
    @State private var showImageSourceDialog = false
    @State private var imageSourceType: UIImagePickerController.SourceType = .camera
    @State private var micPulse = false

    @ObservedObject private var onboarding = OnboardingCenter.shared
    @ObservedObject private var pro = ProStore.shared

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 14) {
                    languageBar.id("translateTop")
                    if onboarding.cardState != .hidden {
                        StartChecklistCard(center: onboarding) { inputFocused = true }
                    }
                    inputCard
                    if pro.showsLimits, let line = ProCopy.advanced(pro.status.limits.advancedTranslate) {
                        ProCounterLine(text: line) { pro.present(.limit(.advancedTranslate, pro.status.limits.advancedTranslate.limit)) }
                    }
                    if !vm.suggestions.isEmpty, inputFocused { suggestionBar }
                    if vm.isTranslating || !vm.translatedText.isEmpty { resultCard }
                    dictionarySection
                    // Biểu ngữ nằm trong nội dung cuộn — không ghim, không dính bàn phím
                    AdBanner()
                    HistoryView(isEmbedded: true, reloadToken: vm.historyVersion) { entry in
                        vm.load(entry: entry)
                        inputFocused = false
                        // Mục lịch sử nằm dưới cùng — cuộn lên để thấy ngay bản dịch vừa mở
                        withAnimation(.easeInOut(duration: 0.35)) { proxy.scrollTo("translateTop", anchor: .top) }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            }
            }
            .scrollDismissesKeyboard(.interactively)
            .screenBackground()
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 8) {
                        WordlyLogo(size: 26)
                        Text("Wordly Dịch").font(WordlyFonts.display(18)).foregroundStyle(WordlyColors.ink)
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toast($vm.toast)
            .toast($vm.imageError, systemImage: "exclamationmark.triangle.fill", color: WordlyColors.error, duration: 5)
            .toast(Binding(get: { vm.dictation.error }, set: { vm.dictation.error = $0 }),
                   systemImage: "exclamationmark.triangle.fill", color: WordlyColors.error, duration: 5)
            .onChange(of: vm.inputText) { _, text in vm.onInputChanged(text) }
            .sheet(isPresented: $vm.offerPushReminder) { PushReminderOfferSheet(isPresented: $vm.offerPushReminder) }
            .sheet(item: $onboarding.nudgeWord) { WidgetNudgeSheet(word: $0) }
            .sheet(isPresented: $showCamera) {
                CameraPicker(
                    sourceType: imageSourceType,
                    onPick: { image in
                        showCamera = false
                        vm.handleImagePicked(image)
                    },
                    onCancel: { showCamera = false }
                )
                .ignoresSafeArea()
            }
            .confirmationDialog("Dịch bằng ảnh", isPresented: $showImageSourceDialog, titleVisibility: .visible) {
                Button("Chụp ảnh") { imageSourceType = .camera; showCamera = true }
                Button("Chọn từ thư viện") { imageSourceType = .photoLibrary; showCamera = true }
            }
        }
    }

    // MARK: Thanh ngôn ngữ
    private var languageBar: some View {
        HStack(spacing: 10) {
            languagePill(vm.direction.sourceName)
            Button {
                withAnimation(.spring(response: 0.3)) { vm.flipDirection() }
            } label: {
                Image(systemName: "arrow.left.arrow.right")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(WordlyColors.onElectric)
                    .frame(width: 40, height: 40)
                    .background(WordlyColors.electric)
                    .clipShape(Circle())
            }
            .accessibilityLabel("Đổi chiều dịch")
            languagePill(vm.direction.targetName)
        }
        .padding(.top, 4)
    }

    private func languagePill(_ name: String) -> some View {
        Text(name)
            .font(WordlyFonts.body(15, weight: .bold))
            .foregroundStyle(WordlyColors.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .background(WordlyColors.cardBG)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(WordlyColors.cardBorder, lineWidth: 1))
    }

    // MARK: Ô nhập
    private var inputCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .topLeading) {
                if vm.inputText.isEmpty {
                    Text(vm.direction == .enToVi ? "Nhập từ hoặc câu tiếng Anh" : "Nhập văn bản tiếng Việt")
                        .font(WordlyFonts.body(22))
                        .foregroundStyle(WordlyColors.inkGhost)
                        .padding(.top, 8)
                        .padding(.leading, 5)
                }
                TextEditor(text: $vm.inputText)
                    .font(WordlyFonts.body(22, weight: .medium))
                    .foregroundStyle(WordlyColors.ink)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 130, maxHeight: 220)
                    .focused($inputFocused)
            }
            if vm.isDictating {
                recordingPill
            } else {
                HStack(spacing: 8) {
                    if !vm.inputText.isEmpty {
                        if vm.direction == .enToVi {
                            speakChip("US", lang: "en-US", text: vm.inputText)
                            speakChip("UK", lang: "en-GB", text: vm.inputText)
                        } else {
                            speakChip("VI", lang: "vi-VN", text: vm.inputText)
                        }
                    } else {
                        if UIPasteboard.general.hasStrings {
                            Button {
                                vm.inputText = UIPasteboard.general.string ?? ""
                            } label: {
                                Label("Dán", systemImage: "doc.on.clipboard")
                                    .font(WordlyFonts.body(13, weight: .bold))
                                    .padding(.horizontal, 12).padding(.vertical, 8)
                                    .background(WordlyColors.hoverBG)
                                    .foregroundStyle(WordlyColors.inkSoft)
                                    .clipShape(Capsule())
                            }
                        }
                        Button {
                            showImageSourceDialog = true
                        } label: {
                            if vm.isReadingImage {
                                ProgressView().frame(width: 34, height: 34)
                            } else {
                                Image(systemName: "camera.fill").frame(width: 34, height: 34)
                            }
                        }
                        .background(WordlyColors.hoverBG)
                        .foregroundStyle(WordlyColors.inkSoft)
                        .clipShape(Circle())
                        .disabled(vm.isReadingImage)
                        .accessibilityLabel("Chụp hoặc chọn ảnh để dịch")
                        Button {
                            Task { await vm.toggleDictation() }
                        } label: {
                            Image(systemName: "mic").frame(width: 34, height: 34)
                        }
                        .background(WordlyColors.hoverBG)
                        .foregroundStyle(WordlyColors.inkSoft)
                        .clipShape(Circle())
                        .accessibilityLabel("Ghi âm để dịch")
                    }
                    Spacer()
                    Text("\(vm.inputText.count)/\(vm.charLimit)")
                        .font(WordlyFonts.body(11))
                        .foregroundStyle(vm.isOverLimit ? WordlyColors.error : WordlyColors.inkGhost)
                        .monospacedDigit()
                    if !vm.inputText.isEmpty {
                        Button { vm.clear() } label: {
                            Image(systemName: "xmark.circle.fill").font(.system(size: 20)).foregroundStyle(WordlyColors.inkGhost)
                        }
                        .accessibilityLabel("Xoá")
                    }
                }
            }
        }
        .padding(14)
        .background(WordlyColors.cardBG)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
            .stroke(inputFocused ? WordlyColors.electric : WordlyColors.cardBorder, lineWidth: inputFocused ? 2 : 1))
    }

    // MARK: Kết quả
    private var resultCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(vm.direction.targetName.uppercased())
                .font(WordlyFonts.body(11, weight: .bold))
                .foregroundStyle(WordlyColors.electric)
            if vm.isTranslating && vm.translatedText.isEmpty {
                ProgressView().tint(WordlyColors.electric).frame(maxWidth: .infinity, minHeight: 44)
            } else {
                Text(vm.translatedText)
                    .font(WordlyFonts.body(22, weight: .semibold))
                    .foregroundStyle(WordlyColors.ink)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                HStack(spacing: 8) {
                    speakChip("", lang: vm.direction == .enToVi ? "vi-VN" : "en-US", text: vm.translatedText)
                    Button {
                        UIPasteboard.general.string = vm.translatedText
                        vm.toast = "Đã sao chép"
                    } label: {
                        Image(systemName: "doc.on.doc")
                            .frame(width: 34, height: 34)
                            .background(WordlyColors.cardBG)
                            .clipShape(Circle())
                    }
                    .foregroundStyle(WordlyColors.inkSoft)
                    .accessibilityLabel("Sao chép")
                    if vm.canLookUp && !vm.dictionaryLocked {
                        Button { vm.retryLookup() } label: {
                            Label("Tra nghĩa", systemImage: "book.fill")
                                .font(WordlyFonts.body(13, weight: .bold))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(WordlyColors.duoBlue.opacity(0.14))
                                .foregroundStyle(WordlyColors.duoBlue)
                                .clipShape(Capsule())
                        }
                    }
                    Spacer()
                    if vm.isTooLongToSave {
                        // Câu dài chỉ vào lịch sử — widget/quiz/nhắc ôn dành cho từ, cụm ngắn
                        Text("Câu dài chỉ lưu trong lịch sử")
                            .font(WordlyFonts.body(11, weight: .medium))
                            .foregroundStyle(WordlyColors.inkSoft)
                            .multilineTextAlignment(.trailing)
                    } else {
                        Button {
                            Task { await vm.save() }
                        } label: {
                            Label(vm.saved ? "Đã lưu" : "Lưu", systemImage: vm.saved ? "bookmark.fill" : "bookmark")
                                .font(WordlyFonts.body(13, weight: .bold))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(vm.saved ? WordlyColors.electric : WordlyColors.cardBG)
                                .foregroundStyle(vm.saved ? WordlyColors.onElectric : WordlyColors.electric)
                                .clipShape(Capsule())
                        }
                        .disabled(!vm.canSave)
                    }
                }
            }
        }
        .padding(16)
        .background(WordlyColors.electricSubtle)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(WordlyColors.electricBorder, lineWidth: 1))
    }

    // MARK: Ghi âm đang chạy — sóng âm động theo dictationLevel, thay cho
    // icon mic tĩnh đổi màu, dịch ngay khi đang nói (xem TranslateViewModel.observeDictation).
    private var recordingPill: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(WordlyColors.error)
                .frame(width: 9, height: 9)
                .scaleEffect(micPulse ? 1.25 : 0.8)
                .animation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true), value: micPulse)
            HStack(spacing: 3) {
                ForEach(0..<5, id: \.self) { i in
                    Capsule()
                        .fill(WordlyColors.error)
                        .frame(width: 3, height: barHeight(i))
                }
            }
            .frame(height: 22)
            .animation(.easeOut(duration: 0.1), value: vm.dictationLevel)
            Text("Đang nghe…")
                .font(WordlyFonts.body(13, weight: .semibold))
                .foregroundStyle(WordlyColors.error)
            Spacer()
            // Tối đa 30 giây rồi tự dừng
            Text(DictationLimit.label(remaining: vm.dictationRemaining))
                .font(WordlyFonts.body(13, weight: .bold))
                .foregroundStyle(WordlyColors.error)
                .monospacedDigit()
                .accessibilityLabel("Còn \(vm.dictationRemaining) giây")
            Button {
                Task { await vm.toggleDictation() }
            } label: {
                Image(systemName: "stop.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 30, height: 30)
                    .background(WordlyColors.error)
                    .clipShape(Circle())
            }
            .accessibilityLabel("Dừng ghi âm")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(WordlyColors.error.opacity(0.08))
        .clipShape(Capsule())
        .onAppear { micPulse = true }
        .onDisappear { micPulse = false }
    }

    private func barHeight(_ index: Int) -> CGFloat {
        let base: [CGFloat] = [7, 13, 20, 13, 7]
        let level = CGFloat(vm.dictationLevel)
        return max(4, base[index] * (0.35 + level * 1.1))
    }

    private func speakChip(_ label: String, lang: String, text: String) -> some View {
        Button {
            tts.toggle(text, lang: lang)
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "speaker.wave.2.fill")
                if !label.isEmpty { Text(label) }
            }
            .font(WordlyFonts.body(12, weight: .bold))
            .padding(.horizontal, label.isEmpty ? 0 : 10)
            .frame(minWidth: 34, minHeight: 34)
            .background(WordlyColors.electricSubtle)
            .foregroundStyle(WordlyColors.electric)
            .clipShape(Capsule())
        }
        .speakLocked(tts, text: text, lang: lang)
        .accessibilityLabel("Phát âm \(label)")
    }

    // MARK: Gợi ý
    private var suggestionBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(vm.suggestions, id: \.self) { word in
                    FilterChip(label: word, isSelected: false) { vm.pickSuggestion(word) }
                }
            }
        }
    }

    // MARK: Từ điển AI
    /// Hết lượt tra từ mới: nghĩa ngắn vẫn ở trên, thẻ chi tiết mờ + mở khoá (spec Pro §3)
    private var lockedDictionaryCard: some View {
        Button { pro.present(.limit(.dictionary, pro.status.limits.dictionary.limit)) } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Từ điển chi tiết").font(WordlyFonts.body(15, weight: .bold)).foregroundStyle(WordlyColors.ink)
                    Spacer()
                    ProBadge(locked: true)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("/ˈsæmpəl/ · noun").font(WordlyFonts.body(13))
                    Text("Nghĩa chi tiết, ví dụ, từ đồng nghĩa và cách dùng…").font(WordlyFonts.body(13))
                }
                .foregroundStyle(WordlyColors.inkSoft)
                .blur(radius: 4)
                .accessibilityHidden(true)
                Text("Bạn đã dùng hết lượt tra từ mới hôm nay. Mở khoá với Pro")
                    .font(WordlyFonts.body(13, weight: .semibold)).foregroundStyle(WordlyColors.electric)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .wordlyCard(padding: 16)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("dictionary.locked")
    }

    @ViewBuilder
    private var dictionarySection: some View {
        switch vm.dictionary {
        case .hidden:
            if vm.dictionaryLocked { lockedDictionaryCard }
        case .loading:
            HStack(spacing: 10) {
                ProgressView().tint(WordlyColors.electric)
                Text("Đang tra từ điển…").font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.inkSoft)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .wordlyCard(padding: 16)
        case .notFound:
            Label("Không tìm thấy từ này trong từ điển", systemImage: "questionmark.circle")
                .font(WordlyFonts.body(13, weight: .medium))
                .foregroundStyle(WordlyColors.inkSoft)
                .frame(maxWidth: .infinity, alignment: .leading)
                .wordlyCard(padding: 16)
        case .failed(let message):
            HStack {
                Text(message).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.error)
                Spacer()
                Button("Thử lại") { vm.retryLookup() }
                    .font(WordlyFonts.body(13, weight: .bold))
                    .foregroundStyle(WordlyColors.electric)
            }
            .wordlyCard(padding: 16)
        case .loaded(let detail):
            DictionaryCard(detail: detail, tts: tts) {
                router.practice(word: detail.word)
            }
        }
    }
}

/// Thẻ nghĩa từ (từ điển AI) — giống WordDefinitions trên web.
struct DictionaryCard: View {
    let detail: DictionaryDetail
    @ObservedObject var tts: TTSManager
    var onAskAlex: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text(detail.word)
                    .font(WordlyFonts.display(26))
                    .foregroundStyle(WordlyColors.ink)
                Spacer()
                if AppRouter.alexPracticeEnabled {
                Button(action: onAskAlex) {
                    Label("Hỏi Alex", systemImage: "bubble.left.and.text.bubble.right.fill")
                        .font(WordlyFonts.body(12, weight: .bold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(WordlyColors.duoBlue.opacity(0.14))
                        .foregroundStyle(WordlyColors.duoBlue)
                        .clipShape(Capsule())
                }
                }
            }
            HStack(spacing: 10) {
                phonetic("🇺🇸", detail.phoneticUs, lang: "en-US")
                phonetic("🇬🇧", detail.phoneticUk, lang: "en-GB")
            }
            ForEach(detail.meanings) { meaning in
                VStack(alignment: .leading, spacing: 10) {
                    PosBadge(pos: meaning.pos)
                    ForEach(Array(meaning.defs.enumerated()), id: \.offset) { index, sense in
                        HStack(alignment: .top, spacing: 10) {
                            Text("\(index + 1)")
                                .font(WordlyFonts.body(12, weight: .bold))
                                .foregroundStyle(WordlyColors.onElectric)
                                .frame(width: 20, height: 20)
                                .background(WordlyColors.electric)
                                .clipShape(Circle())
                            VStack(alignment: .leading, spacing: 4) {
                                Text(sense.defVi)
                                    .font(WordlyFonts.body(15, weight: .bold))
                                    .foregroundStyle(WordlyColors.ink)
                                Text(sense.def)
                                    .font(WordlyFonts.body(13))
                                    .foregroundStyle(WordlyColors.inkSoft)
                                if !sense.example.isEmpty {
                                    Text("“\(sense.example)”")
                                        .font(WordlyFonts.body(13).italic())
                                        .foregroundStyle(WordlyColors.duoBlue)
                                }
                            }
                        }
                    }
                }
                if meaning.id != detail.meanings.last?.id { Divider() }
            }
        }
        .wordlyCard(padding: 16)
    }

    @ViewBuilder
    private func phonetic(_ flag: String, _ ipa: String, lang: String) -> some View {
        if !ipa.isEmpty {
            Button {
                tts.toggle(detail.word, lang: lang)
            } label: {
                HStack(spacing: 6) {
                    Text(flag)
                    Text(ipa).font(WordlyFonts.body(13, weight: .medium))
                    Image(systemName: "speaker.wave.2.fill").font(.system(size: 11))
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(WordlyColors.hoverBG)
                .foregroundStyle(WordlyColors.ink)
                .clipShape(Capsule())
            }
            .speakLocked(tts, text: detail.word, lang: lang)
        }
    }
}

/// Nhãn từ loại — màu giống web (InlineTranslate.js).
struct PosBadge: View {
    let pos: String
    private var style: (bg: Color, border: Color, text: Color) {
        switch pos {
        case "noun":      return (Color(hex: "#60A5FA").opacity(0.12), Color(hex: "#60A5FA").opacity(0.3), Color(hex: "#60A5FA"))
        case "verb":      return (WordlyColors.electricSubtle, WordlyColors.electricBorder, WordlyColors.electric)
        case "adjective": return (Color(hex: "#FBBF24").opacity(0.12), Color(hex: "#FBBF24").opacity(0.3), Color(hex: "#FBBF24"))
        case "adverb":    return (Color(hex: "#E879F9").opacity(0.12), Color(hex: "#E879F9").opacity(0.3), Color(hex: "#E879F9"))
        default:          return (Color.gray.opacity(0.1), Color.gray.opacity(0.2), Color.gray)
        }
    }
    private var label: String {
        switch pos {
        case "noun": return "Danh từ"
        case "verb": return "Động từ"
        case "adjective": return "Tính từ"
        case "adverb": return "Trạng từ"
        case "pronoun": return "Đại từ"
        case "preposition": return "Giới từ"
        case "conjunction": return "Liên từ"
        case "interjection": return "Thán từ"
        default: return pos
        }
    }
    var body: some View {
        Text(label)
            .font(WordlyFonts.body(11, weight: .bold))
            .foregroundStyle(style.text)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(style.bg)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(style.border, lineWidth: 1))
    }
}

/// Hỏi một lần sau khi lưu từ đầu tiên: bật nhắc ôn 20:00 mỗi ngày qua thông báo.
private struct PushReminderOfferSheet: View {
    @Binding var isPresented: Bool

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "bell.badge.fill").font(.system(size: 40)).foregroundStyle(WordlyColors.electric)
            Text("Nhắc bạn ôn từ này?").font(WordlyFonts.body(18, weight: .bold))
            Text("Wordly gửi một thông báo lúc 20:00 mỗi ngày với một từ cần ôn. Đổi giờ hoặc tắt trong Cá nhân → Thông báo nhắc ôn.")
                .font(WordlyFonts.body(14)).foregroundStyle(WordlyColors.inkSoft).multilineTextAlignment(.center)
            Button {
                Task { _ = await PushManager.shared.enableDailyDefault(); isPresented = false }
            } label: {
                Text("Bật").font(WordlyFonts.body(15, weight: .bold)).frame(maxWidth: .infinity).padding(.vertical, 12)
            }
            .background(WordlyColors.electric)
            .foregroundStyle(WordlyColors.onElectric)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            Button("Để sau") { isPresented = false }.foregroundStyle(WordlyColors.inkSoft)
        }
        .padding(24)
        .presentationDetents([.medium])
    }
}
