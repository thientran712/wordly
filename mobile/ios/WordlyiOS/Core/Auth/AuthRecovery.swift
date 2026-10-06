import Foundation

// Xử lý 401 từ web API: làm mới phiên 1 lần rồi gọi lại; vẫn 401 (hoặc không
// làm mới được) thì đăng xuất để người dùng về màn đăng nhập, thay vì kẹt
// với thông báo lỗi chung. Lỗi khác giữ nguyên.
enum AuthRecovery {
    static func run<T>(
        _ perform: () async throws -> T,
        refresh: () async throws -> Void,
        signOut: () async -> Void
    ) async throws -> T {
        do {
            return try await perform()
        } catch APIError.unauthorized {
            do {
                try await refresh()
            } catch {
                await signOut()
                throw APIError.unauthorized
            }
            do {
                return try await perform()
            } catch APIError.unauthorized {
                await signOut()
                throw APIError.unauthorized
            }
        }
    }
}
