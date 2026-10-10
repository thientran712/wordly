import SwiftUI

/// Logo "G" chính thức của Google (4 màu, theo brand guideline cho nút
/// đăng nhập) — vẽ bằng Path thật, không phải chữ "G" tự chế gradient.
/// Toạ độ lấy từ SVG gốc Google, viewBox 0 0 18 18.
struct GoogleLogoIcon: View {
    var size: CGFloat = 18

    var body: some View {
        ZStack {
            BluePath().fill(Color(hex: "#4285F4"))
            GreenPath().fill(Color(hex: "#34A853"))
            YellowPath().fill(Color(hex: "#FBBC05"))
            RedPath().fill(Color(hex: "#EA4335"))
        }
        .frame(width: 18, height: 18)
        .scaleEffect(size / 18)
        .frame(width: size, height: size)
    }

    private struct BluePath: Shape {
        func path(in rect: CGRect) -> Path {
            var p = Path()
            p.move(to: CGPoint(x: 17.64, y: 9.2045))
            p.addCurve(to: CGPoint(x: 17.4764, y: 7.3636),
                       control1: CGPoint(x: 17.64, y: 8.5664), control2: CGPoint(x: 17.5827, y: 7.9527))
            p.addLine(to: CGPoint(x: 9, y: 7.3636))
            p.addLine(to: CGPoint(x: 9, y: 10.845))
            p.addLine(to: CGPoint(x: 13.8436, y: 10.845))
            p.addCurve(to: CGPoint(x: 12.0477, y: 13.5614),
                       control1: CGPoint(x: 13.635, y: 11.97), control2: CGPoint(x: 13.0009, y: 12.9232))
            p.addLine(to: CGPoint(x: 12.0477, y: 15.8195))
            p.addLine(to: CGPoint(x: 14.9564, y: 15.8195))
            p.addCurve(to: CGPoint(x: 17.64, y: 9.2045),
                       control1: CGPoint(x: 16.6582, y: 14.2527), control2: CGPoint(x: 17.64, y: 11.9455))
            p.closeSubpath()
            return p
        }
    }

    private struct GreenPath: Shape {
        func path(in rect: CGRect) -> Path {
            var p = Path()
            p.move(to: CGPoint(x: 9, y: 18))
            p.addCurve(to: CGPoint(x: 14.9564, y: 15.8195),
                       control1: CGPoint(x: 11.43, y: 18), control2: CGPoint(x: 13.4673, y: 17.1941))
            p.addLine(to: CGPoint(x: 12.0477, y: 13.5614))
            p.addCurve(to: CGPoint(x: 9, y: 14.4205),
                       control1: CGPoint(x: 11.2418, y: 14.1014), control2: CGPoint(x: 10.2109, y: 14.4205))
            p.addCurve(to: CGPoint(x: 3.9641, y: 10.7101),
                       control1: CGPoint(x: 6.656, y: 14.4205), control2: CGPoint(x: 4.6718, y: 12.8373))
            p.addLine(to: CGPoint(x: 0.9573, y: 10.7101))
            p.addLine(to: CGPoint(x: 0.9573, y: 13.0419))
            p.addCurve(to: CGPoint(x: 9, y: 18),
                       control1: CGPoint(x: 2.4382, y: 15.9832), control2: CGPoint(x: 5.4818, y: 18))
            p.closeSubpath()
            return p
        }
    }

    private struct YellowPath: Shape {
        func path(in rect: CGRect) -> Path {
            var p = Path()
            p.move(to: CGPoint(x: 3.9641, y: 10.7101))
            p.addCurve(to: CGPoint(x: 3.6818, y: 9),
                       control1: CGPoint(x: 3.7841, y: 10.1701), control2: CGPoint(x: 3.6818, y: 9.5932))
            p.addCurve(to: CGPoint(x: 3.9641, y: 7.2899),
                       control1: CGPoint(x: 3.6818, y: 8.4068), control2: CGPoint(x: 3.7841, y: 7.8299))
            p.addLine(to: CGPoint(x: 3.9641, y: 4.9582))
            p.addLine(to: CGPoint(x: 0.9573, y: 4.9582))
            p.addCurve(to: CGPoint(x: 0, y: 9),
                       control1: CGPoint(x: 0.3477, y: 6.1731), control2: CGPoint(x: 0, y: 7.5477))
            p.addCurve(to: CGPoint(x: 0.9573, y: 13.0418),
                       control1: CGPoint(x: 0, y: 10.4523), control2: CGPoint(x: 0.3477, y: 11.8268))
            p.addLine(to: CGPoint(x: 3.9641, y: 10.7101))
            p.closeSubpath()
            return p
        }
    }

    private struct RedPath: Shape {
        func path(in rect: CGRect) -> Path {
            var p = Path()
            p.move(to: CGPoint(x: 9, y: 3.5795))
            p.addCurve(to: CGPoint(x: 12.4405, y: 4.9255),
                       control1: CGPoint(x: 10.3214, y: 3.5795), control2: CGPoint(x: 11.5077, y: 4.0336))
            p.addLine(to: CGPoint(x: 15.0218, y: 2.3441))
            p.addCurve(to: CGPoint(x: 9, y: 0),
                       control1: CGPoint(x: 13.4632, y: 0.8918), control2: CGPoint(x: 11.4259, y: 0))
            p.addCurve(to: CGPoint(x: 0.9573, y: 4.9582),
                       control1: CGPoint(x: 5.4818, y: 0), control2: CGPoint(x: 2.4382, y: 2.0168))
            p.addLine(to: CGPoint(x: 3.9641, y: 7.2899))
            p.addCurve(to: CGPoint(x: 9, y: 3.5795),
                       control1: CGPoint(x: 4.6718, y: 5.1627), control2: CGPoint(x: 6.6559, y: 3.5795))
            p.closeSubpath()
            return p
        }
    }
}

#Preview {
    GoogleLogoIcon()
        .padding()
}
