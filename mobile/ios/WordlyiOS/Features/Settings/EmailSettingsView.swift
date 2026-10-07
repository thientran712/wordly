import SwiftUI

// Cài đặt email nhắc học — giống web /profile/email: bật/tắt, tần suất (mỗi
// ngày / thứ 2–6 / tuỳ chỉnh ngày), nhiều khung giờ gửi (1–10), múi giờ theo
// máy, gửi email thử. Email chứa từ đã lưu để ôn tập.
@MainActor
final class EmailSettingsViewModel: ObservableObject {
    @Published var prefs = EmailPreferences(enabled: false, frequency: "daily", customDays: [1, 2, 3, 4, 5])
    @Published var slots: [EmailSlot] = []
    @Published var state: Loadable<Void> = .idle
    @Published var saving = false
    @Published var sendingTest = false
    @Published var toast: String?
    @Published var error: String?

    let timezone = TimeZone.current.identifier
    private var slotTasks: [String: Task<Void, Never>] = [:]

    func load() async {
        state = .loading
        do {
            async let p = APIClient.shared.fetchEmailPreferences()
            async let s = APIClient.shared.fetchEmailSlots()
            if let loaded = try await p {
                prefs = loaded
                if prefs.customDays.isEmpty { prefs.customDays = [1, 2, 3, 4, 5] }
            }
            slots = try await s
            state = .loaded(())
            // Web: múi giờ theo thiết bị để email đến đúng giờ địa phương
            Task { try? await APIClient.shared.updateTimezone(timezone) }
        } catch {
            state = .failed("Không tải được cài đặt email.")
        }
    }

    func save() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            try await APIClient.shared.saveEmailPreferences(prefs)
            // Bật email mà chưa có khung giờ nào → tạo 08:00 như web
            if prefs.enabled && slots.isEmpty {
                slots = [try await APIClient.shared.addEmailSlot(time: "08:00")]
            }
            toast = prefs.enabled ? "Đã lưu — email sẽ gửi theo lịch bạn chọn" : "Đã tắt email nhắc học"
        } catch {
            self.error = "Lưu thất bại, thử lại nhé."
        }
    }

    func addSlot(_ date: Date) async {
        guard EmailSettingsLogic.canAddSlot(count: slots.count) else { return }
        do {
            slots.append(try await APIClient.shared.addEmailSlot(time: EmailSettingsLogic.timeString(from: date)))
        } catch {
            self.error = "Không thêm được khung giờ."
        }
    }

    /// Đổi giờ: cập nhật ngay trên màn, gửi server sau 1,5s ngừng chỉnh (giống web).
    func update(_ slot: EmailSlot, to date: Date) {
        let time = EmailSettingsLogic.timeString(from: date)
        if let i = slots.firstIndex(where: { $0.id == slot.id }) {
            slots[i] = EmailSlot(id: slot.id, sendTime: time)
        }
        slotTasks[slot.id]?.cancel()
        slotTasks[slot.id] = Task {
            try? await Task.sleep(for: .milliseconds(1500))
            guard !Task.isCancelled else { return }
            try? await APIClient.shared.updateEmailSlot(id: slot.id, time: time)
        }
    }

    func delete(_ slot: EmailSlot) async {
        guard EmailSettingsLogic.canDeleteSlot(count: slots.count) else { return }
        slots.removeAll { $0.id == slot.id }
        do { try await APIClient.shared.deleteEmailSlot(id: slot.id) }
        catch { await load() }
    }

    func sendTest() async {
        sendingTest = true
        defer { sendingTest = false }
        do {
            try await APIClient.shared.sendTestEmail()
            toast = "Đã gửi email thử — kiểm tra hộp thư nhé 📬"
        } catch APIError.serverError(let m) where m.contains("Nothing to send") {
            error = "Chưa có gì để gửi — hãy lưu vài từ khi dịch trước nhé."
        } catch {
            self.error = "Không gửi được email thử."
        }
    }
}

struct EmailSettingsView: View {
    @StateObject private var vm = EmailSettingsViewModel()
    @State private var newSlotTime = EmailSettingsLogic.date(from: "12:00")
    @State private var showAdd = false

    var body: some View {
        Form {
            switch vm.state {
            case .idle, .loading:
                Section { LoadingStateView() }
            case .failed(let m):
                Section { ErrorStateView(message: m) { Task { await vm.load() } } }
            case .loaded:
                content
            }
        }
        .scrollContentBackground(.hidden)
        .screenBackground()
        .navigationTitle("Email nhắc học")
        .navigationBarTitleDisplayMode(.inline)
        .toast($vm.toast)
        .task { if case .idle = vm.state { await vm.load() } }
    }

    @ViewBuilder
    private var content: some View {
        Section {
            Toggle(isOn: $vm.prefs.enabled) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Nhận email ôn từ vựng").font(WordlyFonts.body(15, weight: .semibold))
                    Text("Mỗi email nhắc lại vài từ bạn đã lưu").font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
                }
            }
            .tint(WordlyColors.electric)
        }

        if vm.prefs.enabled {
            Section("Tần suất") {
                Picker("Tần suất", selection: $vm.prefs.frequency) {
                    Text("📅 Mỗi ngày").tag("daily")
                    Text("💼 Thứ 2–6").tag("weekdays")
                    Text("⚙️ Tuỳ chỉnh").tag("custom")
                }
                .pickerStyle(.segmented)
                if vm.prefs.frequency == "custom" {
                    HStack(spacing: 6) {
                        ForEach(EmailSettingsLogic.days) { day in
                            let on = vm.prefs.customDays.contains(day.value)
                            Button {
                                vm.prefs.customDays = EmailSettingsLogic.toggle(day: day.value, in: vm.prefs.customDays)
                            } label: {
                                Text(day.label)
                                    .font(WordlyFonts.body(13, weight: .bold))
                                    .frame(maxWidth: .infinity, minHeight: 36)
                                    .background(on ? WordlyColors.electric : WordlyColors.hoverBG)
                                    .foregroundStyle(on ? WordlyColors.onElectric : WordlyColors.inkSoft)
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }

            Section {
                ForEach(vm.slots) { slot in
                    HStack {
                        Image(systemName: "clock.fill").foregroundStyle(WordlyColors.electric)
                        DatePicker("Gửi lúc", selection: Binding(
                            get: { EmailSettingsLogic.date(from: slot.sendTime) },
                            set: { vm.update(slot, to: $0) }
                        ), displayedComponents: .hourAndMinute)
                    }
                    .swipeActions {
                        if EmailSettingsLogic.canDeleteSlot(count: vm.slots.count) {
                            Button("Xoá", role: .destructive) { Task { await vm.delete(slot) } }
                        }
                    }
                }
                if EmailSettingsLogic.canAddSlot(count: vm.slots.count) {
                    if showAdd {
                        HStack {
                            DatePicker("Giờ mới", selection: $newSlotTime, displayedComponents: .hourAndMinute)
                            Button("Thêm") {
                                Task { await vm.addSlot(newSlotTime); showAdd = false }
                            }
                            .foregroundStyle(WordlyColors.electric)
                        }
                    } else {
                        Button { showAdd = true } label: {
                            Label("Thêm khung giờ", systemImage: "plus.circle.fill")
                        }
                        .foregroundStyle(WordlyColors.electric)
                    }
                }
            } header: {
                Text("Giờ gửi (\(vm.slots.count)/\(EmailSettingsLogic.maxSlots))")
            } footer: {
                Text("Theo múi giờ \(vm.timezone). Vuốt sang trái để xoá một khung giờ.")
            }
        }

        Section {
            if let e = vm.error {
                Text(e).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.error)
            }
            Button { Task { await vm.save() } } label: {
                HStack {
                    if vm.saving { ProgressView().tint(WordlyColors.onElectric) }
                    Text("Lưu cài đặt").frame(maxWidth: .infinity)
                }
                .font(WordlyFonts.body(15, weight: .bold))
                .padding(.vertical, 6)
            }
            .listRowBackground(WordlyColors.electric)
            .foregroundStyle(WordlyColors.onElectric)
            .disabled(vm.saving)

            Button { Task { await vm.sendTest() } } label: {
                HStack {
                    if vm.sendingTest { ProgressView() }
                    Label("Gửi email thử ngay", systemImage: "paperplane.fill").frame(maxWidth: .infinity)
                }
            }
            .foregroundStyle(WordlyColors.electric)
            .disabled(vm.sendingTest)
        } footer: {
            Text("Email thử gửi tới địa chỉ đăng nhập của bạn, gồm các từ đã lưu gần đây.")
        }
    }
}
