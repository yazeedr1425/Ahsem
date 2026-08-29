import Foundation

/// إعدادات التطبيق — تُقرأ من `Info.plist` حتى يفصلها المهندس بين بيئتي
/// التطوير والإصدار عبر ملف `.xcconfig`، بلا تعديل كود.
///
/// ما الذي يوضع هنا وما الذي لا يوضع:
///   • ✅ عنوان الخادم، ورابط Supabase، والمفتاح المنشور (anon)
///   • ❌ `GEMINI_API_KEY` و`GOOGLE_MAPS_API_KEY` و`SUPABASE_SERVICE_ROLE_KEY`
///
/// المفاتيح السرّية تبقى على خادم Next.js وحده. أي مفتاح يوضع داخل التطبيق
/// يمكن استخراجه من الـ binary بعد تنزيله من App Store — و`service_role` بالذات
/// يتجاوز صلاحيات RLS كاملةً، أي أن تسريبه يعني الوصول لقاعدة البيانات كلها.
/// ولهذا يبقى التطبيق عميلاً يستدعي `/api/*` ولا يستدعي Gemini مباشرة.
enum AppConfig {

    /// جذر خادم Next.js — نفس النشرة القائمة على Vercel.
    /// مثال: `https://ai-vibe-decision-making.vercel.app`
    static let apiBaseURL: URL = {
        guard let raw = value(for: "AHSEM_API_BASE_URL"), let url = URL(string: raw) else {
            fatalError(
                """
                AHSEM_API_BASE_URL غير معرّف في Info.plist.
                أضِف المفتاح وقيمته عنوان نشرة Vercel، مثل:
                https://ai-vibe-decision-making.vercel.app
                """
            )
        }
        return url
    }()

    /// رابط مشروع Supabase — للمصادقة والقراءة المباشرة الخاضعة لـ RLS.
    static let supabaseURL: URL = {
        guard let raw = value(for: "AHSEM_SUPABASE_URL"), let url = URL(string: raw) else {
            fatalError("AHSEM_SUPABASE_URL غير معرّف في Info.plist.")
        }
        return url
    }()

    /// المفتاح المنشور (anon / publishable). آمن داخل التطبيق: صلاحياته محكومة
    /// بسياسات RLS، بخلاف `service_role`.
    static let supabaseAnonKey: String = {
        guard let key = value(for: "AHSEM_SUPABASE_ANON_KEY"), !key.isEmpty else {
            fatalError("AHSEM_SUPABASE_ANON_KEY غير معرّف في Info.plist.")
        }
        return key
    }()

    /// جذر الروابط العامة — يُستعمل في رابط تصويت المجموعة الذي يُشارَك خارج
    /// التطبيق، فلا بد أن يفتح في المتصفح أيضاً.
    static let webBaseURL: URL = {
        guard let raw = value(for: "AHSEM_WEB_BASE_URL"), let url = URL(string: raw) else {
            return apiBaseURL
        }
        return url
    }()

    private static func value(for key: String) -> String? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: key) as? String else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
