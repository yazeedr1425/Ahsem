import Foundation
import Supabase

/// حالة الجلسة على مستوى التطبيق — مقابل `AuthProvider` في النسخة الويب.
///
/// الجلسة تُحفظ وتُجدَّد في سلسلة مفاتيح الجهاز عبر عميل Supabase نفسه، فلا
/// نكتب تخزيناً موازياً: تخزينان للتوكن يعنيان يوماً يختلفان فيه.
@MainActor
@Observable
final class AuthStore {

    private(set) var session: Session?
    /// `true` حتى تُقرأ الجلسة المحفوظة أول مرة — الشاشة تنتظرها ولا تومض
    /// بواجهة الضيف ثم تقفز لواجهة المسجَّل.
    private(set) var isLoading = true

    var user: User? { session?.user }
    var isSignedIn: Bool { session != nil }
    var userId: String? { session?.user.id.uuidString }

    private let client = SupabaseClientProvider.shared
    private var watcher: Task<Void, Never>?

    init() {
        // التوكن هو الهوية الموثوقة عند الخادم — أوثق من `userId` في جسم الطلب.
        // نحقنه مرة واحدة هنا بدل تمريره يدوياً في ثلاثة عشر نداءً.
        APIClient.shared.tokenProvider = { [client] in
            try? await client.auth.session.accessToken
        }
        start()
    }

    deinit { watcher?.cancel() }

    private func start() {
        watcher = Task { [weak self] in
            guard let self else { return }
            for await (event, session) in client.auth.authStateChanges {
                guard !Task.isCancelled else { return }
                if event == .initialSession || event == .signedIn
                    || event == .signedOut || event == .tokenRefreshed {
                    self.session = session
                    self.isLoading = false
                }
            }
        }
    }

    // MARK: - النتيجة

    /// نتيجة عملية مصادقة — رسالة عربية جاهزة للعرض عند الفشل.
    enum Outcome: Equatable {
        case success
        /// أُنشئ الحساب ولم تُفتح جلسة: التأكيد وصل على الإيميل.
        case needsConfirmation
        case failure(String)
    }

    // MARK: - إنشاء حساب

    private struct SignUpRequest: Encodable {
        let email: String
        let password: String
        let displayName: String?
    }

    private struct OKResponse: Decodable {
        let ok: Bool
    }

    /// التسجيل يمر بمسارنا لا بـ `auth.signUp` مباشرة: الخادم ينشئ الحساب ويرسل
    /// رابط التأكيد بقالبنا العربي عبر Mailtrap، بدل رسالة Supabase الافتراضية
    /// الإنجليزية من مرسلها المحدود. ولو فشل الإرسال حُذف الحساب نصف المُنشأ
    /// تلقائياً حتى تبقى إعادة المحاولة نظيفة.
    ///
    /// لا توجد جلسة قبل التأكيد في هذا المسار أبداً.
    func signUp(email: String, password: String, displayName: String?) async -> Outcome {
        let name = displayName?.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            let _: OKResponse = try await APIClient.shared.post(
                "api/signup",
                body: SignUpRequest(
                    email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                    password: password,
                    displayName: (name?.isEmpty ?? true) ? nil : name
                ),
                authenticated: false
            )
            return .needsConfirmation
        } catch let error as APIError {
            return .failure(error.localizedDescription)
        } catch {
            return .failure("ما وصلنا للخادم — تأكد من اتصالك.")
        }
    }

    // MARK: - دخول وخروج

    func signIn(email: String, password: String) async -> Outcome {
        do {
            try await client.auth.signIn(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password
            )
            return .success
        } catch {
            return .failure(readable(error))
        }
    }

    /// رابط الدخول السريع — يُرسل بقالبنا العربي كذلك.
    private struct MagicLinkRequest: Encodable {
        let email: String
    }

    func sendMagicLink(email: String) async -> Outcome {
        do {
            let _: OKResponse = try await APIClient.shared.post(
                "api/magic-link",
                body: MagicLinkRequest(
                    email: email.trimmingCharacters(in: .whitespacesAndNewlines)
                ),
                authenticated: false
            )
            return .needsConfirmation
        } catch let error as APIError {
            return .failure(error.localizedDescription)
        } catch {
            return .failure("ما وصلنا للخادم — تأكد من اتصالك.")
        }
    }

    /// الخروج يُسأل عنه مرتين في الواجهة — هنا التنفيذ فقط.
    func signOut() async {
        try? await client.auth.signOut()
        session = nil
    }

    // MARK: -

    /// رسائل Supabase إنجليزية؛ نترجم الشائع منها ونمرر ما عداه.
    private func readable(_ error: Error) -> String {
        let text = error.localizedDescription.lowercased()
        if text.contains("invalid login credentials") {
            return "الإيميل أو كلمة المرور غير صحيحة."
        }
        if text.contains("email not confirmed") {
            return "الحساب لم يُفعّل بعد — افتح رابط التأكيد في إيميلك."
        }
        if text.contains("network") || text.contains("offline") {
            return "ما فيه اتصال بالإنترنت. تحقق من الشبكة وأعد المحاولة."
        }
        return error.localizedDescription
    }
}
