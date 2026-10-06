import SwiftUI

struct TranslateView: View {
    @StateObject private var vm = TranslateViewModel()
    @StateObject private var tts = TTSManager.shared
    @Environment(\.colorScheme) var scheme
    @FocusState private var inputFocused: Bool
    @State private var showSaveToast = false

    var body: some View {
        NavigationStack {
            ZStack {
                WordlyColors.bg(scheme: scheme).ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 12) {
                        // Translate card
                        VStack(spacing: 0) {
                            // Language bar
                            langBar
                            Divider().foregroundStyle(WordlyColors.divider(scheme: scheme))

                            // Input + output
                            HStack(alignment: .top, spacing: 0) {
                                inputPanel
                                Divider().foregroundStyle(WordlyColors.divider(scheme: scheme))
                                outputPanel
                            }

                            // Word definitions
                            if vm.isDetailLoading || vm.wordDetail != nil {
                                Divider().foregroundStyle(WordlyColors.divider(scheme: scheme))
                                wordDefinitions
                            }
                        }
                        .background(WordlyColors.cardBG(scheme: scheme))
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(WordlyColors.cardBorder, lineWidth: 1)
                        )

                        // History (embedded)
                        HistoryView(isEmbedded: true) { entry in
                            vm.inputText = entry.sourceText
                            vm.translatedText = entry.translatedText
                            vm.direction = entry.direction == "EN→VI" ? .enToVi : .viToEn
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 80)
                }
            }
            .navigationTitle("Wordly")
            .navigationBarTitleDisplayMode(.large)
        }
        .overlay(alignment: .bottom) {
            if showSaveToast {
                toastView
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .padding(.bottom, 100)
            }
        }
        .animation(.spring(response: 0.3), value: showSaveToast)
    }

    // MARK: - Language bar
    private var langBar: some View {
        HStack(spacing: 0) {
            Text(vm.direction.sourceName)
                .font(WordlyFonts.body(14, weight: .bold))
                .foregroundStyle(WordlyColors.ink(scheme: scheme))
                .frame(maxWidth: .infinity)

            Button {
                vm.flipDirection()
            } label: {
                Image(systemName: "arrow.left.arrow.right")
                    .font(WordlyFonts.body(14, weight: .semibold))
                    .foregroundStyle(WordlyColors.electric)
                    .frame(width: 36, height: 36)
                    .background(WordlyColors.electricSubtle)
                    .clipShape(Circle())
                    .overlay(Circle().stroke(WordlyColors.electricBorder, lineWidth: 1))
            }

            Text(vm.direction.targetName)
                .font(WordlyFonts.body(14, weight: .bold))
                .foregroundStyle(WordlyColors.electric)
                .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Input panel
    private var inputPanel: some View {
        ZStack(alignment: .topLeading) {
            VStack(alignment: .leading, spacing: 0) {
                TextEditor(text: $vm.inputText)
                    .focused($inputFocused)
                    .font(WordlyFonts.body(16))
                    .foregroundStyle(vm.isOverLimit ? WordlyColors.error : WordlyColors.ink(scheme: scheme))
                    .scrollContentBackground(.hidden)
                    .background(.clear)
                    .frame(minHeight: 96)
                    .padding(.horizontal, 12)
                    .padding(.top, 12)
                    .onChange(of: vm.inputText) { _, new in vm.onInputChanged(new) }

                if vm.inputText.isEmpty {
                    Text(vm.direction == .enToVi ? "Enter text or a word..." : "Nhập văn bản...")
                        .font(WordlyFonts.body(16))
                        .foregroundStyle(WordlyColors.inkGhost)
                        .allowsHitTesting(false)
                        .padding(.horizontal, 16)
                        .padding(.top, 16)
                }

                // Char counter
                if vm.inputText.count > Int(Double(vm.charLimit) * 0.8) {
                    Text("\(vm.inputText.count.formatted()) / \(vm.charLimit.formatted())")
                        .font(WordlyFonts.body(11, weight: .semibold))
                        .foregroundStyle(vm.isOverLimit ? WordlyColors.error : WordlyColors.inkGhost)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding(.horizontal, 12)
                }

                // Action row
                actionRow
            }
            .frame(maxWidth: .infinity)

            // Suggestions overlay
            if vm.showSuggestions && !vm.suggestions.isEmpty {
                suggestionsDropdown
                    .offset(y: 0)
                    .zIndex(10)
            }
        }
        .frame(maxWidth: .infinity)
        .onTapGesture { inputFocused = true }
        .onChange(of: inputFocused) { _, focused in
            if focused { vm.onFocused() } else { vm.onUnfocused() }
        }
    }

    private var actionRow: some View {
        HStack(spacing: 8) {
            if !vm.inputText.isEmpty {
                Button {
                    Task { await tts.speak(vm.inputText, lang: vm.direction == .enToVi ? "en-US" : "vi-VN") }
                } label: {
                    Image(systemName: "speaker.wave.2")
                        .font(WordlyFonts.body(14))
                        .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                        .frame(width: 32, height: 32)
                        .background(WordlyColors.hoverBG)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
            if !vm.translatedText.isEmpty {
                Button {
                    Task { await vm.save(); showSaveToast(true) }
                } label: {
                    Image(systemName: vm.saved ? "bookmark.fill" : "bookmark")
                        .font(WordlyFonts.body(14))
                        .foregroundStyle(vm.saved ? WordlyColors.electric : WordlyColors.inkSoft(scheme: scheme))
                        .frame(width: 32, height: 32)
                        .background(vm.saved ? WordlyColors.electricSubtle : WordlyColors.hoverBG)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
            if vm.isSuggLoading {
                ProgressView().scaleEffect(0.7).tint(WordlyColors.electric)
            }
            Spacer()
            if !vm.inputText.isEmpty {
                Button { vm.clear() } label: {
                    Image(systemName: "xmark")
                        .font(WordlyFonts.body(12, weight: .semibold))
                        .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                        .frame(width: 28, height: 28)
                        .background(WordlyColors.hoverBG)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    private var suggestionsDropdown: some View {
        VStack(spacing: 0) {
            ForEach(Array(vm.suggestions.enumerated()), id: \.offset) { idx, word in
                Button {
                    vm.pickSuggestion(word)
                    inputFocused = false
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass")
                            .font(WordlyFonts.body(11))
                            .foregroundStyle(word == vm.inputText.lowercased() ? WordlyColors.electric : WordlyColors.inkGhost)
                        Text(word)
                            .font(WordlyFonts.body(14, weight: .medium))
                            .foregroundStyle(word == vm.inputText.lowercased() ? WordlyColors.electric : WordlyColors.ink(scheme: scheme))
                        Spacer()
                        Button {
                            Task { await tts.speak(word, lang: "en-US") }
                        } label: {
                            Image(systemName: "speaker.wave.2")
                                .font(WordlyFonts.body(12))
                                .foregroundStyle(WordlyColors.electric.opacity(0.5))
                                .padding(6)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .frame(minHeight: 44)
                    .background(WordlyColors.cardBG(scheme: scheme))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if idx < vm.suggestions.count - 1 {
                    Divider().padding(.leading, 36)
                }
            }
        }
        .background(WordlyColors.cardBG(scheme: scheme))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.25), radius: 16, y: 8)
        .offset(y: 108) // below input area
    }

    // MARK: - Output panel
    private var outputPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            Group {
                if vm.isOverLimit {
                    Text("⚠️ Văn bản quá dài — tối đa \(vm.charLimit.formatted()) ký tự")
                        .font(WordlyFonts.body(14, weight: .semibold))
                        .foregroundStyle(WordlyColors.error)
                } else if vm.isTranslating {
                    HStack(spacing: 6) {
                        ProgressView().scaleEffect(0.75).tint(WordlyColors.electric)
                        Text("Đang dịch...")
                            .font(WordlyFonts.body(14))
                            .foregroundStyle(WordlyColors.electric)
                    }
                } else if !vm.translatedText.isEmpty {
                    Text(vm.translatedText)
                        .font(WordlyFonts.body(16, weight: .semibold))
                        .foregroundStyle(WordlyColors.ink(scheme: scheme))
                        .lineSpacing(4)
                } else {
                    Text(vm.inputText.isEmpty ? "Bản dịch sẽ hiện ở đây" : "...")
                        .font(WordlyFonts.body(14))
                        .foregroundStyle(WordlyColors.inkGhost)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(.horizontal, 12)
            .padding(.top, 12)

            // TTS for output
            if !vm.translatedText.isEmpty {
                HStack {
                    Button {
                        Task { await tts.speak(vm.translatedText, lang: vm.direction == .enToVi ? "vi-VN" : "en-US") }
                    } label: {
                        Image(systemName: "speaker.wave.2")
                            .font(WordlyFonts.body(14))
                            .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                            .frame(width: 32, height: 32)
                            .background(WordlyColors.hoverBG)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 10)
            } else {
                Spacer()
                    .frame(height: 42)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 120)
        .background(WordlyColors.electricSubtle)
    }

    // MARK: - Word definitions
    private var wordDefinitions: some View {
        VStack(alignment: .leading, spacing: 12) {
            if vm.isDetailLoading {
                HStack(spacing: 8) {
                    ProgressView().scaleEffect(0.7).tint(WordlyColors.electric)
                    Text("Đang tra từ điển...")
                        .font(WordlyFonts.body(12))
                        .foregroundStyle(WordlyColors.electric)
                }
                .padding()
            } else if let detail = vm.wordDetail {
                VStack(alignment: .leading, spacing: 10) {
                    if !detail.phonetic.isEmpty {
                        Text(detail.phonetic)
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                    }
                    ForEach(Array(detail.meanings.enumerated()), id: \.offset) { _, meaning in
                        VStack(alignment: .leading, spacing: 6) {
                            PosBadge(pos: meaning.pos)
                            ForEach(Array(meaning.defs.enumerated()), id: \.offset) { idx, def in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(idx + 1). \(def.definition)")
                                        .font(WordlyFonts.body(12))
                                        .foregroundStyle(WordlyColors.ink(scheme: scheme))
                                    if !def.example.isEmpty {
                                        Text("\"\(def.example)\"")
                                            .font(WordlyFonts.body(11))
                                            .italic()
                                            .foregroundStyle(WordlyColors.inkGhost)
                                            .padding(.leading, 12)
                                    }
                                }
                            }
                        }
                    }
                }
                .padding()
            }
        }
    }

    // MARK: - Toast
    private var toastView: some View {
        Text("📎 Đã lưu vào lịch sử")
            .font(WordlyFonts.body(14, weight: .semibold))
            .foregroundStyle(WordlyColors.electric)
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(WordlyColors.electricBorder, lineWidth: 1))
            .shadow(color: .black.opacity(0.2), radius: 8, y: 4)
    }

    private func showSaveToast(_ show: Bool) {
        guard show else { return }
        showSaveToast = true
        Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            showSaveToast = false
        }
    }
}

// MARK: - POS Badge
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
        default: return pos
        }
    }
    var body: some View {
        Text(label)
            .font(WordlyFonts.body(10, weight: .bold))
            .foregroundStyle(style.text)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(style.bg)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(style.border, lineWidth: 1))
    }
}
