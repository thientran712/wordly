import SwiftUI

// "Lớp của tôi" — tạm thời, sẽ được thay bằng màn đầy đủ.
struct ClassesView: View {
    var body: some View {
        NavigationStack {
            EmptyStateView(systemImage: "graduationcap.fill", title: "Lớp của tôi")
                .screenBackground()
                .navigationTitle("Lớp học")
        }
    }
}
