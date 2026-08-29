import Foundation
import Supabase

/// البروفايل يُنشأ بمُشغِّل في القاعدة عند إنشاء الحساب، فلا نحتاج إدخالاً هنا —
/// قراءةً وتحديثاً فقط.
enum ProfileService {

    struct Profile: Codable, Hashable {
        let id: UUID
        var display_name: String?
        var tone: String?
        var locale: String?
        var read_aloud: Bool?
        var default_mood: String?
        var avatar_url: String?

        var toneValue: Tone { Tone(serverValue: tone) }
    }

    /// حقول التحديث اختيارية: ما لا يُرسل لا يُمسّ.
    struct Patch: Encodable {
        var display_name: String?
        var tone: String?
        var read_aloud: Bool?
        var default_mood: String?
    }

    private struct LastSeenPatch: Encodable {
        let last_seen_at: String
    }

    private static var client: SupabaseClient { SupabaseClientProvider.shared }

    static func get() async throws -> Profile? {
        guard let userId = try? await client.auth.session.user.id else { return nil }

        return try await client
            .from("profiles")
            .select("id, display_name, tone, locale, read_aloud, default_mood, avatar_url")
            .eq("id", value: userId)
            .limit(1)
            .single()
            .execute()
            .value
    }

    @discardableResult
    static func update(_ patch: Patch) async throws -> Profile? {
        guard let userId = try? await client.auth.session.user.id else { return nil }

        return try await client
            .from("profiles")
            .update(patch)
            .eq("id", value: userId)
            .select("id, display_name, tone, locale, read_aloud, default_mood, avatar_url")
            .single()
            .execute()
            .value
    }

    /// أثرٌ جانبي بحت — فشله لا يستحق شيئاً في الواجهة.
    static func touchLastSeen() async {
        guard let userId = try? await client.auth.session.user.id else { return }
        _ = try? await client
            .from("profiles")
            .update(LastSeenPatch(last_seen_at: ISO8601DateFormatter().string(from: .now)))
            .eq("id", value: userId)
            .execute()
    }
}
