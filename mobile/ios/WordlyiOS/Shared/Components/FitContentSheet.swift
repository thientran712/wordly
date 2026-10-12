import SwiftUI

/// Sheet cao vừa đúng nội dung (câu ngắn → popup thấp, không dư khoảng trắng),
/// nội dung dài thì kéo lên toàn màn hình và cuộn được.
struct FitContentSheet<Content: View>: View {
    @ViewBuilder let content: () -> Content
    @State private var height: CGFloat = 240

    var body: some View {
        ScrollView {
            content()
                .frame(maxWidth: .infinity, alignment: .leading)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
        }
        .scrollBounceBehavior(.basedOnSize)
        .presentationDetents([.height(height + 24), .large])
        .presentationDragIndicator(.visible)
    }
}
