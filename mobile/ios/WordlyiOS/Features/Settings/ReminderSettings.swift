import SwiftUI

/// Hai kênh nhắc học dùng chung form lịch: Email và Thông báo đẩy.
enum ReminderChannel {
    case email, push
    var preferencesPath: String { self == .email ? "/api/email-preferences" : "/api/push/preferences" }
    var slotsPath: String { self == .email ? "/api/email-slots" : "/api/push/slots" }
    var defaultTime: String { self == .email ? "08:00" : "20:00" }
}

// Cài đặt lịch nhắc — bật/tắt, tần suất (mỗi ngày / thứ 2–6 / tuỳ chỉnh ngày),
// 1–10 khung giờ theo mốc :00/:30, múi giờ theo máy.
@MainActor
final class ReminderSettingsViewModel: ObservableObject {
    let channel: ReminderChannel
    @Published var prefs = EmailPreferences(enabled: false, frequency: "daily", customDays: [1, 2, 3, 4, 5])
    @Published var slots: [EmailSlot] = []
    @Published var state: Loadable<Void> = .idle
    @Published var saving = false
    @Published var toast: String?
    @Published var error: String?
    let timezone = TimeZone.current.identifier

    init(channel: ReminderChannel) { self.channel = channel }

    func load() async {
        state = .loading
        do {
            async let p = APIClient.shared.fetchReminderPreferences(channel)
            async let s = APIClient.shared.fetchReminderSlots(channel)
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
            try await APIClient.shared.saveReminderPreferences(prefs, channel)
            if prefs.enabled && slots.isEmpty {
                // Push: server tự tạo 20:00; email: app tạo 08:00 như trước
                if channel == .push { slots = try await APIClient.shared.fetchReminderSlots(.push) }
                else { slots = [try await APIClient.shared.addReminderSlot(.email, time: channel.defaultTime)] }
            }
            toast = prefs.enabled ? "Đã lưu — sẽ nhắc theo lịch bạn chọn" : "Đã tắt nhắc học"
        } catch {
            self.error = (error as? APIError)?.serverMessage ?? "Lưu thất bại, thử lại nhé."
        }
    }

    func addSlot() async {
        guard ReminderScheduleLogic.canAddSlot(count: slots.count),
              let time = ReminderScheduleLogic.suggestedNewTime(existing: slots.map(\.sendTime), fallback: channel.defaultTime)
        else { return }
        do {
            slots.append(try await APIClient.shared.addReminderSlot(channel, time: time))
            error = nil
        } catch {
            self.error = (error as? APIError)?.serverMessage ?? "Không thêm được khung giờ."
        }
    }

    /// Đổi giờ: kiểm ở máy trước (cùng luật server); server từ chối → trả giờ cũ + báo lỗi.
    func update(_ slot: EmailSlot, to time: String) async {
        let others = slots.filter { $0.id != slot.id }.map(\.sendTime)
        if let msg = ReminderScheduleLogic.conflict(for: time, others: others) { error = msg; return }
        guard let i = slots.firstIndex(where: { $0.id == slot.id }) else { return }
        let old = slots[i]
        slots[i] = EmailSlot(id: slot.id, sendTime: time)
        error = nil
        do {
            try await APIClient.shared.updateReminderSlot(channel, id: slot.id, time: time)
        } catch {
            if let j = slots.firstIndex(where: { $0.id == slot.id }) { slots[j] = old }
            self.error = (error as? APIError)?.serverMessage ?? "Không đổi được giờ, thử lại nhé."
        }
    }

    func delete(_ slot: EmailSlot) async {
        guard ReminderScheduleLogic.canDeleteSlot(count: slots.count) else { return }
        slots.removeAll { $0.id == slot.id }
        do { try await APIClient.shared.deleteReminderSlot(channel, id: slot.id) }
        catch { await load() }
    }
}

/// Chọn giờ theo mốc :00/:30 — menu gọn trong một dòng Form (thay DatePicker từng phút).
struct HalfHourPicker: View {
    let selection: String
    let options: [String]
    let onPick: (String) -> Void

    var body: some View {
        Menu {
            ForEach(options, id: \.self) { t in
                Button(t) { onPick(t) }
            }
        } label: {
            HStack {
                Text("Gửi lúc").foregroundStyle(WordlyColors.ink)
                Spacer()
                Text(String(selection.prefix(5)))
                    .font(WordlyFonts.body(15, weight: .semibold))
                    .foregroundStyle(WordlyColors.electric)
                Image(systemName: "chevron.up.chevron.down").font(.caption).foregroundStyle(WordlyColors.inkSoft)
            }
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
