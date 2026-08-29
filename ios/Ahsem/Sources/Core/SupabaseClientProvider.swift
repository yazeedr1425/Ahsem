import Foundation
import Supabase

/// عميل Supabase الوحيد للتطبيق — المصادقة، والقراءة الخاضعة لـ RLS، والبث
/// اللحظي لتصويت المجموعة.
///
/// المفتاح المستعمل هنا هو المنشور (anon) وحده. `service_role` لا يدخل التطبيق
/// أبداً: صلاحياته تتجاوز RLS كاملةً، ويبقى حكراً على خادم Next.js.
enum SupabaseClientProvider {
    static let shared: SupabaseClient = SupabaseClient(
        supabaseURL: AppConfig.supabaseURL,
        supabaseKey: AppConfig.supabaseAnonKey
    )
}
