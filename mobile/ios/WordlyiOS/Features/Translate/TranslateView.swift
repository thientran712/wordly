import SwiftUI

// Màn "Dịch & tra từ" — giống web (/ : InlineTranslate + TranslateHistory).
struct TranslateView: View {
    @StateObject private var vm = TranslateViewModel()
    @StateObject private var tts = TTSManager.shared
    @EnvironmentObject private var router: AppRouter
    @FocusState private var inputFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    translateCard
                    if !vm.suggestions.isEmpty, inputFocused { suggestionBar }
                    dictionarySection
                    HistoryView(isEmbedded: true) { entry in
                        vm.load(entry: entry)
                        inputFocused = false
                    }
                    .id(vm.historyVersion)
                }
                .padding(16)
            }
            .scrollDismissesKeyboard(.interactively)
            .screenBackground()
            .navigationTitle("Dịch & tra từ")
            .navigationBarTitleDisplayMode(.large)
            .toast($vm.toast)
            .onChange(of: vm.inputText) { _, text in vm.onInputChanged(text) }
        }
    }

    // MARK: Ô dịch
    private var translateCard: some View {
        VStack(spacing: 0) {
            HStack {
                Text(vm.direction.sourceName)
                    .frame(maxWidth: .infinity)
                Button {
                    withAnimation(.spring(response: 0.3)) { vm.flipDirection() }
                } label: {
                    Image(systemName: "arrow.left.arrow.right")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(WordlyColors.electric)
                        .frame(width: 36, height: 36)
                        .background(WordlyColors.electricSubtle)
                        .clipShape(Circle())
                }
                .accessibilityLabel("Đổi chiều dịch")
                Text(vm.direction.targetName)
                    .foregroundStyle(WordlyColors.electric)
                    .frame(maxWidth: .infinity)
            }
            .font(WordlyFonts.body(14, weight: .bold))
            .foregroundStyle(WordlyColors.ink)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)

            Divider()

            // Nguồn
            VStack(alignment: .leading, spacing: 8) {
                ZStack(alignment: .topLeading) {
                    if vm.inputText.isEmpty {
                        Text(vm.direction == .enToVi ? "Nhập từ hoặc câu tiếng Anh…" : "Nhập văn bản tiếng Việt…")
                            .font(WordlyFonts.body(17))
                            .foregroundStyle(WordlyColors.inkGhost)
                            .padding(.top, 8)
                            .padding(.leading, 5)
                    }
                    TextEditor(text: $vm.inputText)
                        .font(WordlyFonts.body(17, weight: .medium))
                        .foregroundStyle(WordlyColors.ink)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 90, maxHeight: 180)
                        .focused($inputFocused)
                }
                HStack(spacing: 8) {
                    if !vm.inputText.isEmpty {
                        if vm.direction == .enToVi {
                            speakChip("US", lang: "en-US", text: vm.inputText)
                            speakChip("UK", lang: "en-GB", text: vm.inputText)
                        } else {
                            speakChip("VI", lang: "vi-VN", text: vm.inputText)
                        }
                    }
                    Spacer()
                    Text("\(vm.inputText.count)/\(vm.charLimit)")
                        .font(WordlyFonts.body(11))
                        .foregroundStyle(vm.isOverLimit ? WordlyColors.error : WordlyColors.inkGhost)
                        .monospacedDigit()
                    if !vm.inputText.isEmpty {
                        Button { vm.clear() } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(WordlyColors.inkGhost)
                        }
                        .accessibilityLabel("Xoá")
                    }
                }
            }
            .padding(14)

            // Kết quả
            VStack(alignment: .leading, spacing: 12) {
                if vm.isTranslating && vm.translatedText.isEmpty {
                    ProgressView().tint(WordlyColors.electric).frame(maxWidth: .infinity, minHeight: 44)
                } else if vm.translatedText.isEmpty {
                    Text("Bản dịch sẽ hiện ở đây")
                        .font(WordlyFonts.body(16))
                        .foregroundStyle(WordlyColors.inkGhost)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                } else {
                    Text(vm.translatedText)
                        .font(WordlyFonts.body(18, weight: .semibold))
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
                                .background(WordlyColors.hoverBG)
                                .clipShape(Circle())
                        }
                        .foregroundStyle(WordlyColors.inkSoft)
                        .accessibilityLabel("Sao chép")
                        Spacer()
                        Button {
                            Task { await vm.save() }
                        } label: {
                            Label(vm.saved ? "Đã lưu" : "Lưu", systemImage: vm.saved ? "bookmark.fill" : "bookmark")
                                .font(WordlyFonts.body(13, weight: .bold))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(vm.saved ? WordlyColors.electric : WordlyColors.electricSubtle)
                                .foregroundStyle(vm.saved ? WordlyColors.onElectric : WordlyColors.electric)
                                .clipShape(Capsule())
                        }
                        .disabled(!vm.canSave)
                    }
                }
            }
            .padding(14)
            .background(WordlyColors.electricSubtle.opacity(0.6))
        }
        .background(WordlyColors.cardBG)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(WordlyColors.cardBorder, lineWidth: 1))
    }

    private func speakChip(_ label: String, lang: String, text: String) -> some View {
        Button {
            Task { await tts.speak(text, lang: lang) }
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
    @ViewBuilder
    private var dictionarySection: some View {
        switch vm.dictionary {
        case .hidden:
            EmptyView()
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
                Task { await tts.speak(detail.word, lang: lang) }
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
