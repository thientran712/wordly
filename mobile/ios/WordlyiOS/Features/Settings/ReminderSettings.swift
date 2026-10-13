import SwiftUI

// Cài đặt lịch nhắc — bật/tắt, tần suất (mỗi ngày / thứ 2–6 / tuỳ chỉnh ngày),
// 1–10 khung giờ theo mốc :00/:30, múi giờ theo máy.
@MainActor
final class ReminderSettingsViewModel: ObservableObject {
    static let defaultTime = "20:00"
    @Published var prefs = EmailPreferences(enabled: false, frequency: "daily", customDays: [1, 2, 3, 4, 5])
    @Published var slots: [EmailSlot] = []
    @Published var state: Loadable<Void> = .idle
    @Published var saving = false
    @Published var toast: String?
    @Published var error: String?
    let timezone = TimeZone.current.identifier

    func load() async {
        state = .loading
        do {
            async let p = APIClient.shared.fetchPushPreferences()
            async let s = APIClient.shared.fetchPushSlots()
            if let loaded = try await p {
                prefs = loaded
                if prefs.customDays.isEmpty { prefs.customDays = [1, 2, 3, 4, 5] }
            }
            slots = try await s
            state = .loaded(())
            // Múi giờ theo thiết bị để nhắc đến đúng giờ địa phương
            Task { try? await APIClient.shared.updateTimezone(timezone) }
        } catch {
            state = .failed("Không tải được cài đặt.")
        }
    }

    func save() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            try await APIClient.shared.savePushPreferences(prefs)
            if prefs.enabled && slots.isEmpty {
                // Bật lần đầu: server tự tạo khung 20:00
                slots = try await APIClient.shared.fetchPushSlots()
            }
            toast = prefs.enabled ? "Đã lưu — sẽ nhắc theo lịch bạn chọn" : "Đã tắt nhắc học"
        } catch {
            self.error = (error as? APIError)?.serverMessage ?? "Lưu thất bại, thử lại nhé."
        }
    }

    func addSlot() async {
        guard ReminderScheduleLogic.canAddSlot(count: slots.count),
              let time = ReminderScheduleLogic.suggestedNewTime(existing: slots.map(\.sendTime), fallback: Self.defaultTime)
        else { return }
        do {
            slots.append(try await APIClient.shared.addPushSlot(time: time))
            error = nil
        } catch {
            self.error = (error as? APIError)?.serverMessage ?? "Không thêm được khung giờ."
        }
    }

    /// Đổi giờ: kiểm ở máy trước (cùng luật server); server từ chối → trả giờ cũ + báo lỗi.
    func update(_ slot: EmailSlot, to time: String) async {
        guard String(slot.sendTime.prefix(5)) != String(time.prefix(5)) else { return } // chọn lại giờ cũ: không đổi gì
        let others = slots.filter { $0.id != slot.id }.map(\.sendTime)
        if let msg = ReminderScheduleLogic.conflict(for: time, others: others, current: slot.sendTime) { error = msg; return }
        guard let i = slots.firstIndex(where: { $0.id == slot.id }) else { return }
        let old = slots[i]
        slots[i] = EmailSlot(id: slot.id, sendTime: time)
        error = nil
        do {
            try await APIClient.shared.updatePushSlot(id: slot.id, time: time)
        } catch {
            if let j = slots.firstIndex(where: { $0.id == slot.id }) { slots[j] = old }
            self.error = (error as? APIError)?.serverMessage ?? "Không đổi được giờ, thử lại nhé."
        }
    }

    func delete(_ slot: EmailSlot) async {
        guard ReminderScheduleLogic.canDeleteSlot(count: slots.count) else { return }
        slots.removeAll { $0.id == slot.id }
        do { try await APIClient.shared.deletePushSlot(id: slot.id) }
        catch { await load() }
    }
}

/// Chọn giờ theo mốc :00/:30 — một dòng Form; bấm vào mở tấm nhỏ có bánh xe
/// (menu 48 mốc trước đây cao kín màn hình). "Xong" mới áp giờ đã chọn.
struct HalfHourPicker: View {
    let selection: String
    let options: [String]
    let onPick: (String) -> Void
    @State private var showing = false
    @State private var draft = ""

    private var current: String { String(selection.prefix(5)) }

    var body: some View {
        Button {
            draft = current
            showing = true
        } label: {
            HStack {
                Text("Gửi lúc").foregroundStyle(WordlyColors.ink)
                Spacer()
                Text(current)
                    .font(WordlyFonts.body(15, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(WordlyColors.electric)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(WordlyColors.electricSubtle, in: Capsule())
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Gửi lúc \(current)")
        .sheet(isPresented: $showing) {
            VStack(spacing: 0) {
                HStack {
                    Button("Huỷ") { showing = false }
                        .foregroundStyle(WordlyColors.inkSoft)
                    Spacer()
                    Text("Chọn giờ gửi").font(WordlyFonts.body(16, weight: .bold)).foregroundStyle(WordlyColors.ink)
                    Spacer()
                    Button("Xong") {
                        showing = false
                        if draft != current { onPick(draft) }
                    }
                    .font(WordlyFonts.body(16, weight: .bold))
                    .foregroundStyle(WordlyColors.electric)
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)

                Picker("Giờ gửi", selection: $draft) {
                    ForEach(options, id: \.self) { t in
                        Text(t).font(WordlyFonts.body(20, weight: .semibold)).monospacedDigit().tag(t)
                    }
                }
                .pickerStyle(.wheel)
                .labelsHidden()
                .frame(maxWidth: 220)
            }
            .presentationDetents([.height(290)])
            .presentationDragIndicator(.visible)
            .presentationBackground(WordlyColors.surfaceElevated)
        }
    }
}

/// Form lịch nhắc dùng chung cho màn Email và màn Thông báo.
struct ReminderSettingsForm: View {
    @ObservedObject var vm: ReminderSettingsViewModel
    let toggleTitle: String
    let toggleSubtitle: String
    /// Chỉ gọi khi NGƯỜI DÙNG gạt công tắc — không gọi khi cài đặt tải về
    /// (màn Thông báo xin quyền iOS ở đây, không phải lúc mở màn).
    var onToggle: ((Bool) -> Void)? = nil

    var body: some View {
        Section {
            Toggle(isOn: Binding(
                get: { vm.prefs.enabled },
                set: { vm.prefs.enabled = $0; onToggle?($0) }
            )) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(toggleTitle).font(WordlyFonts.body(15, weight: .semibold))
                    Text(toggleSubtitle).font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
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
                        ForEach(ReminderScheduleLogic.days) { day in
                            let on = vm.prefs.customDays.contains(day.value)
                            Button {
                                vm.prefs.customDays = ReminderScheduleLogic.toggle(day: day.value, in: vm.prefs.customDays)
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
                        HalfHourPicker(
                            selection: slot.sendTime,
                            options: ReminderScheduleLogic.options(
                                current: slot.sendTime,
                                others: vm.slots.filter { $0.id != slot.id }.map(\.sendTime)),
                            onPick: { t in Task { await vm.update(slot, to: t) } })
                    }
                    .swipeActions {
                        if ReminderScheduleLogic.canDeleteSlot(count: vm.slots.count) {
                            Button("Xoá", role: .destructive) { Task { await vm.delete(slot) } }
                        }
                    }
                }
                if ReminderScheduleLogic.canAddSlot(count: vm.slots.count) {
                    Button { Task { await vm.addSlot() } } label: {
                        Label("Thêm khung giờ", systemImage: "plus.circle.fill")
                    }
                    .foregroundStyle(WordlyColors.electric)
                }
            } header: {
                Text("Giờ gửi (\(vm.slots.count)/\(ReminderScheduleLogic.maxSlots))")
            } footer: {
                Text("Chỉ chọn giờ tròn hoặc rưỡi. Theo múi giờ \(vm.timezone). Vuốt sang trái để xoá một khung giờ.")
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
        }
    }
}
