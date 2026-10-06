import SwiftUI

struct PracticeView: View {
    @StateObject private var vm = PracticeViewModel()
    @Environment(\.colorScheme) var scheme
    @State private var scrollProxy: ScrollViewProxy?

    var body: some View {
        NavigationStack {
            ZStack {
                // Nền giống các tab khác (trước đây thiếu → hệ thống tô đen tuyền)
                WordlyColors.bg(scheme: scheme).ignoresSafeArea()
                HStack(spacing: 0) {
                    // Sidebar (on iPad or when open)
                    if vm.sidebarOpen {
                        SessionSidebarView(vm: vm)
                            .frame(width: 260)
                            .transition(.move(edge: .leading))
                    }

                    // Main panel
                    VStack(spacing: 0) {
                        // Chat area
                        ScrollViewReader { proxy in
                            ScrollView {
                                LazyVStack(spacing: 16) {
                                    // Avatar
                                    alexAvatar
                                        .padding(.top, 24)

                                    // Messages
                                    ForEach(vm.messages) { msg in
                                        MessageBubble(message: msg)
                                            .id(msg.id)
                                    }

                                    // Thinking indicator
                                    if vm.isThinking {
                                        thinkingIndicator
                                    }

                                    // Transcript
                                    if vm.isListening {
                                        transcriptView
                                    }

                                    // Error
                                    if let err = vm.error {
                                        errorView(err)
                                    }

                                    Color.clear.frame(height: 20).id("bottom")
                                }
                                .padding(.horizontal, 16)
                                .padding(.bottom, 120)
                            }
                            .onChange(of: vm.messages.count) { _, _ in
                                withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
                            }
                            .onChange(of: vm.isThinking) { _, _ in
                                withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
                            }
                        }

                        // Controls
                        Divider()
                        controls
                    }
                }
            }
            .navigationTitle(vm.activeSessionTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbarItems }
            .animation(.spring(response: 0.3), value: vm.sidebarOpen)
        }
        .task {
            await vm.loadSessions()
            await vm.speech.requestPermissions()
        }
    }

    // MARK: - Alex Avatar
    private var alexAvatar: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(vm.tts.isSpeaking
                          ? LinearGradient(colors: [WordlyColors.electric.opacity(0.3), WordlyColors.electricSubtle], startPoint: .topLeading, endPoint: .bottomTrailing)
                          : LinearGradient(colors: [WordlyColors.cardBG(scheme: scheme), WordlyColors.cardBG(scheme: scheme)], startPoint: .top, endPoint: .bottom))
                    .frame(width: 96, height: 96)
                    .shadow(color: vm.tts.isSpeaking ? WordlyColors.electric.opacity(0.3) : .black.opacity(0.1),
                            radius: vm.tts.isSpeaking ? 24 : 8, y: 4)
                    .overlay(
                        Circle().stroke(
                            vm.tts.isSpeaking ? WordlyColors.electric : WordlyColors.divider(scheme: scheme),
                            lineWidth: vm.tts.isSpeaking ? 3 : 1.5
                        )
                    )
                    .scaleEffect(vm.tts.isSpeaking ? 1.05 : 1)
                    .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: vm.tts.isSpeaking)

                Text("🧑‍🏫")
                    .font(WordlyFonts.body(44))
            }
            VStack(spacing: 2) {
                Text("Alex")
                    .font(WordlyFonts.body(14, weight: .bold))
                    .foregroundStyle(WordlyColors.ink(scheme: scheme))
                Text(statusText)
                    .font(WordlyFonts.body(12))
                    .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
            }
        }
    }

    private var statusText: String {
        if vm.isThinking { return "Đang suy nghĩ..." }
        if vm.tts.isSpeaking { return "Đang nói..." }
        if vm.sessionState == .active { return "Sẵn sàng nghe" }
        return "American English Teacher"
    }

    // MARK: - Controls
    private var controls: some View {
        VStack(spacing: 12) {
            switch vm.sessionState {
            case .idle:
                Button { Task { await vm.startSession() } } label: {
                    Label(vm.activeSessionId != nil ? "Bắt đầu cuộc trò chuyện mới" : "Bắt đầu luyện nói",
                          systemImage: "phone.fill")
                        .font(WordlyFonts.body(15, weight: .bold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(WordlyColors.electric)
                        .foregroundStyle(WordlyColors.onElectric)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .shadow(color: WordlyColors.electric.opacity(0.4), radius: 8, y: 4)
                }

            case .connecting:
                HStack(spacing: 10) {
                    ProgressView().tint(WordlyColors.inkSoft(scheme: scheme))
                    Text("Đang kết nối...")
                        .font(WordlyFonts.body(15, weight: .bold))
                        .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(WordlyColors.surfaceElevated(scheme: scheme))
                .clipShape(RoundedRectangle(cornerRadius: 16))

            case .active:
                VStack(spacing: 10) {
                    HStack(spacing: 24) {
                        // Mic button
                        ZStack {
                            Button { vm.toggleMic() } label: {
                                Image(systemName: vm.isListening ? "mic.fill" : "mic.slash.fill")
                                    .font(WordlyFonts.body(28))
                                    .foregroundStyle(vm.isListening ? WordlyColors.electric : WordlyColors.inkSoft(scheme: scheme))
                                    .frame(width: 72, height: 72)
                                    .background(
                                        vm.isUserTalking ? WordlyColors.electric :
                                        vm.isListening ? WordlyColors.electricSubtle :
                                        WordlyColors.cardBG(scheme: scheme)
                                    )
                                    .clipShape(Circle())
                                    .overlay(Circle().stroke(
                                        vm.isUserTalking ? WordlyColors.electric : vm.isListening ? WordlyColors.electricBorder : WordlyColors.divider(scheme: scheme),
                                        lineWidth: 3
                                    ))
                                    .shadow(color: vm.isUserTalking ? WordlyColors.electric.opacity(0.7) : vm.isListening ? WordlyColors.electric.opacity(0.3) : .black.opacity(0.1),
                                            radius: vm.isListening ? 20 : 8, y: 4)
                            }
                            // Live indicator dot
                            if vm.isListening && !vm.isUserTalking {
                                Circle()
                                    .fill(WordlyColors.electric)
                                    .frame(width: 12, height: 12)
                                    .offset(x: 28, y: -28)
                                    .overlay(Circle().stroke(WordlyColors.cardBG(scheme: scheme), lineWidth: 2).offset(x: 28, y: -28))
                            }
                        }

                        // End call button
                        Button { vm.endSession() } label: {
                            Image(systemName: "phone.down.fill")
                                .font(WordlyFonts.body(18))
                                .foregroundStyle(.white)
                                .frame(width: 48, height: 48)
                                .background(WordlyColors.error)
                                .clipShape(Circle())
                                .shadow(color: WordlyColors.error.opacity(0.4), radius: 6, y: 3)
                        }
                    }

                    Text(vm.isThinking ? "Alex đang suy nghĩ..." :
                         vm.tts.isSpeaking ? "Alex đang nói..." :
                         vm.isUserTalking ? "Đang nghe bạn nói..." :
                         vm.isListening ? "Mic đang bật — cứ tự nhiên nói" :
                         "Nhấn mic để bật")
                        .font(WordlyFonts.body(12))
                        .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                }

            case .ended:
                VStack(spacing: 12) {
                    Text("Buổi luyện tập kết thúc · \(vm.userTurnCount) lượt nói")
                        .font(WordlyFonts.body(13, weight: .semibold))
                        .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                    HStack(spacing: 12) {
                        Button { vm.resumeSession() } label: {
                            Label("Tiếp tục", systemImage: "mic.fill")
                                .font(WordlyFonts.body(14, weight: .semibold))
                                .padding(.horizontal, 20)
                                .padding(.vertical, 12)
                                .background(WordlyColors.electric)
                                .foregroundStyle(WordlyColors.onElectric)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        Button { vm.newSession() } label: {
                            Label("Cuộc mới", systemImage: "plus")
                                .font(WordlyFonts.body(14, weight: .semibold))
                                .padding(.horizontal, 20)
                                .padding(.vertical, 12)
                                .background(WordlyColors.surfaceElevated(scheme: scheme))
                                .foregroundStyle(WordlyColors.ink(scheme: scheme))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(WordlyColors.divider(scheme: scheme), lineWidth: 1))
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 20)
        .background(WordlyColors.cardBG(scheme: scheme))
    }

    // MARK: - Thinking indicator
    private var thinkingIndicator: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { i in
                Circle()
                    .fill(WordlyColors.inkSoft(scheme: scheme))
                    .frame(width: 6, height: 6)
                    .offset(y: -4)
                    .animation(.easeInOut(duration: 0.6).repeatForever().delay(Double(i) * 0.15), value: vm.isThinking)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(WordlyColors.cardBG(scheme: scheme))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(WordlyColors.divider(scheme: scheme), lineWidth: 1))
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Transcript
    private var transcriptView: some View {
        Text(vm.transcript.isEmpty ? "Đang nghe... hãy nói tiếng Anh" : vm.transcript)
            .font(WordlyFonts.body(13))
            .foregroundStyle(WordlyColors.electric)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(WordlyColors.electricSubtle)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(WordlyColors.electricBorder, lineWidth: 1))
            .frame(maxWidth: .infinity)
    }

    private func errorView(_ msg: String) -> some View {
        HStack {
            Text(msg)
                .font(WordlyFonts.body(13))
                .foregroundStyle(WordlyColors.error)
            Spacer()
            Button { vm.error = nil } label: {
                Image(systemName: "xmark")
                    .font(WordlyFonts.body(12))
                    .foregroundStyle(WordlyColors.error)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(WordlyColors.errorSoft)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Toolbar
    @ToolbarContentBuilder
    private var toolbarItems: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button {
                withAnimation { vm.sidebarOpen.toggle() }
            } label: {
                Image(systemName: "sidebar.left")
                    .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
            }
        }
        if vm.isSaving {
            ToolbarItem(placement: .topBarTrailing) {
                ProgressView().scaleEffect(0.7)
            }
        }
        if vm.sessionState == .active {
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 4) {
                    Circle().fill(WordlyColors.electric).frame(width: 6, height: 6)
                        .overlay(Circle().fill(WordlyColors.electric).frame(width: 6, height: 6).scaleEffect(1.5).opacity(0.3))
                    Text("Live").font(WordlyFonts.body(11, weight: .semibold)).foregroundStyle(WordlyColors.electric)
                }
            }
        }
    }
}

// MARK: - Message Bubble
struct MessageBubble: View {
    let message: ChatMessage
    @StateObject private var tts = TTSManager.shared
    @Environment(\.colorScheme) var scheme

    var isUser: Bool { message.role == "user" }

    var body: some View {
        HStack {
            if isUser { Spacer(minLength: 60) }
            VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                HStack(alignment: .bottom, spacing: 6) {
                    if !isUser {
                        Text(message.content)
                            .font(WordlyFonts.body(14))
                            .foregroundStyle(WordlyColors.ink(scheme: scheme))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(WordlyColors.cardBG(scheme: scheme))
                            .clipShape(BubbleShape(isUser: false))
                            .overlay(BubbleShape(isUser: false).stroke(WordlyColors.divider(scheme: scheme), lineWidth: 1))

                        Button {
                            Task { await tts.speak(message.content, lang: "en-US") }
                        } label: {
                            Image(systemName: "speaker.wave.2")
                                .font(WordlyFonts.body(11))
                                .foregroundStyle(WordlyColors.electric.opacity(0.5))
                                .padding(6)
                        }
                    } else {
                        Text(message.content)
                            .font(WordlyFonts.body(14))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(WordlyColors.electric)
                            .clipShape(BubbleShape(isUser: true))
                    }
                }
            }
            if !isUser { Spacer(minLength: 60) }
        }
        .frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading)
    }
}

struct BubbleShape: Shape {
    let isUser: Bool
    func path(in rect: CGRect) -> Path {
        let r: CGFloat = 16
        let smallR: CGFloat = 4
        var p = Path()
        if isUser {
            p.addRoundedRect(in: rect, cornerRadii: RectangleCornerRadii(
                topLeading: r, bottomLeading: r, bottomTrailing: smallR, topTrailing: r))
        } else {
            p.addRoundedRect(in: rect, cornerRadii: RectangleCornerRadii(
                topLeading: r, bottomLeading: smallR, bottomTrailing: r, topTrailing: r))
        }
        return p
    }
}

// MARK: - Session Sidebar
struct SessionSidebarView: View {
    @ObservedObject var vm: PracticeViewModel
    @Environment(\.colorScheme) var scheme
    @State private var renamingId: String?
    @State private var renameValue = ""

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Lịch sử luyện nói")
                    .font(WordlyFonts.body(13, weight: .bold))
                    .foregroundStyle(WordlyColors.ink(scheme: scheme))
                Spacer()
                Button { vm.newSession() } label: {
                    Image(systemName: "plus")
                        .font(WordlyFonts.body(13, weight: .bold))
                        .foregroundStyle(WordlyColors.onElectric)
                        .frame(width: 28, height: 28)
                        .background(WordlyColors.electric)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                Button { withAnimation { vm.sidebarOpen = false } } label: {
                    Image(systemName: "xmark")
                        .font(WordlyFonts.body(12))
                        .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                        .frame(width: 28, height: 28)
                        .background(WordlyColors.hoverBG)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)

            Divider()

            ScrollView {
                LazyVStack(spacing: 2) {
                    if vm.sessionsLoading {
                        ProgressView().padding(.top, 24)
                    } else if vm.sessions.isEmpty {
                        Text("Chưa có cuộc trò chuyện nào")
                            .font(WordlyFonts.body(12))
                            .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                            .padding(.top, 24)
                            .frame(maxWidth: .infinity)
                    } else {
                        ForEach(vm.sessions) { session in
                            sessionRow(session)
                        }
                    }
                }
                .padding(.vertical, 8)
            }
        }
        .background(WordlyColors.cardBG(scheme: scheme))
        .overlay(alignment: .trailing) {
            Divider()
        }
    }

    private func sessionRow(_ session: PracticeSession) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(WordlyFonts.body(12))
                .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))

            if renamingId == session.id {
                TextField("Tên cuộc trò chuyện", text: $renameValue, onCommit: {
                    Task { await vm.renameSession(session.id, title: renameValue) }
                    renamingId = nil
                })
                .font(WordlyFonts.body(12))
                .foregroundStyle(WordlyColors.ink(scheme: scheme))
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.title)
                        .font(WordlyFonts.body(12, weight: .medium))
                        .foregroundStyle(WordlyColors.ink(scheme: scheme))
                        .lineLimit(1)
                    Text(relativeDate(session.updatedDate))
                        .font(WordlyFonts.body(10))
                        .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            HStack(spacing: 4) {
                Button {
                    renamingId = session.id
                    renameValue = session.title
                } label: {
                    Image(systemName: "pencil")
                        .font(WordlyFonts.body(10))
                        .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                        .frame(width: 22, height: 22)
                        .background(WordlyColors.hoverBG)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                Button {
                    Task { await vm.deleteSession(session.id) }
                } label: {
                    Image(systemName: "trash")
                        .font(WordlyFonts.body(10))
                        .foregroundStyle(WordlyColors.error)
                        .frame(width: 22, height: 22)
                        .background(WordlyColors.hoverBG)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
            }
            .opacity(renamingId == session.id ? 1 : 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            vm.activeSessionId == session.id
            ? WordlyColors.hoverBG
            : Color.clear
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal, 4)
        .contentShape(Rectangle())
        .onTapGesture {
            guard renamingId != session.id else { return }
            Task { await vm.selectSession(session.id) }
        }
        .onHover { hovering in
            // onHover works on macOS / catalyst but harmless on iOS
            _ = hovering
        }
    }

    private func relativeDate(_ date: Date) -> String {
        let diff = Int(Date().timeIntervalSince(date))
        if diff < 86400 { return "Hôm nay" }
        if diff < 86400 * 2 { return "Hôm qua" }
        if diff < 86400 * 7 { return "\(diff / 86400) ngày trước" }
        let df = DateFormatter(); df.dateFormat = "d/M"; return df.string(from: date)
    }
}
