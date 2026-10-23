import GoogleMobileAds
import SwiftUI

/// Banner thích ứng theo chiều rộng màn (anchored adaptive). Chỉ hiện khi
/// AdsPolicy cho phép; tải lỗi thì thu về 0 điểm, không để khoảng trống.
struct AdBanner: View {
    @ObservedObject private var ads = AdsCenter.shared
    @ObservedObject private var manager = AdsManager.shared

    var body: some View {
        if ads.showsBanner, manager.canRequestAds, let unit = WordlyConfig.adUnitBanner {
            BannerSlot(unit: unit)
        }
    }
}

private struct BannerSlot: View {
    let unit: String
    /// Giữ chỗ đúng cỡ trong lúc tải (SDK báo lỗi nếu khung cao 0); lỗi thì thu về 0
    @State private var failed = false

    var body: some View {
        GeometryReader { geo in
            BannerAdView(unit: unit, width: geo.size.width) { failed = !$0 }
        }
        .frame(height: failed ? 0 : portraitAnchoredAdaptiveBanner(width: UIScreen.main.bounds.width).size.height)
        .clipped()
    }
}

private struct BannerAdView: UIViewRepresentable {
    let unit: String
    let width: CGFloat
    let onLoad: (Bool) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onLoad: onLoad) }

    func makeUIView(context: Context) -> BannerView {
        let banner = BannerView(adSize: portraitAnchoredAdaptiveBanner(width: max(width, 320)))
        banner.adUnitID = unit
        banner.rootViewController = AdsManager.topViewController()
        banner.delegate = context.coordinator
        banner.load(Request())
        return banner
    }

    func updateUIView(_ banner: BannerView, context: Context) {}

    final class Coordinator: NSObject, BannerViewDelegate {
        let onLoad: (Bool) -> Void
        init(onLoad: @escaping (Bool) -> Void) { self.onLoad = onLoad }
        func bannerViewDidReceiveAd(_ bannerView: BannerView) { onLoad(true) }
        func bannerView(_ bannerView: BannerView, didFailToReceiveAdWithError error: Error) { onLoad(false) }
    }
}
