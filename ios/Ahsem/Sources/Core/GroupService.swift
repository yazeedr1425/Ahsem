import Foundation
import Supabase

/// القرار الجماعي.
///
/// وصول الضيوف كله عبر دالتَي RPC بـ `security definer` — القراءة المباشرة
/// للجداول أُزيلت عمداً: سياسة «اقرأ كل قرارات المجموعات» كانت تسرّب
/// `share_code` لكل من يملك المفتاح المنشور. الدالتان تشترطان الكود كوسيط، فلا
/// ينكشف إلا ما يعرف رابطه أصلاً.
enum GroupService {

    private static var client: SupabaseClient { SupabaseClientProvider.shared }

    enum GroupError: LocalizedError {
        case unauthenticated
        case failed(String)

        var errorDescription: String? {
            switch self {
            case .unauthenticated: return "إنشاء التصويت يستلزم تسجيل الدخول."
            case .failed(let message): return message
            }
        }
    }

    private static func title(from options: [String]) -> String {
        let joined = options.joined(separator: " ولا ")
        return joined.count > 80 ? String(joined.prefix(77)) + "…" : joined
    }

    // MARK: - الإنشاء

    private struct GroupInsert: Encodable {
        let user_id: UUID
        let title: String
        let category: String
        let mode: String
        let status: String
    }

    private struct CreatedGroup: Decodable {
        let id: UUID
        let share_code: String
    }

    private struct OptionInsert: Encodable {
        let decision_id: UUID
        let label: String
    }

    /// ينشئ قرار مجموعة ويرجّع كود المشاركة.
    ///
    /// المنشئ وحده يحتاج حساباً — سياسات المالك المباشرة باقية، فالإنشاء بلا RPC.
    /// أما الضيوف فيصوّتون بلا حسابات.
    static func create(categoryId: String, options: [String]) async throws -> String {
        guard let userId = try? await client.auth.session.user.id else {
            throw GroupError.unauthenticated
        }

        do {
            let decision: CreatedGroup = try await client
                .from("decisions")
                .insert(GroupInsert(
                    user_id: userId,
                    title: title(from: options),
                    category: categoryId,
                    mode: "group",
                    status: "open"
                ))
                .select("id, share_code")
                .single()
                .execute()
                .value

            try await client
                .from("options")
                .insert(options.map { OptionInsert(decision_id: decision.id, label: $0) })
                .execute()

            return decision.share_code
        } catch {
            throw GroupError.failed(error.localizedDescription)
        }
    }

    // MARK: - صفحة التصويت

    struct VoteDecision: Decodable, Hashable {
        let id: UUID
        let title: String?
        let category: String?
        let status: String
        let share_code: String?
        let winner_option_id: UUID?

        var isOpen: Bool { status == "open" }
    }

    struct VoteOption: Decodable, Identifiable, Hashable {
        let id: UUID
        let label: String
        /// محسوب في القاعدة — مرجَّح بالوزن لا عدداً خاماً.
        let votes: Double?

        var weight: Double { votes ?? 0 }
    }

    struct VotePage: Decodable, Hashable {
        let decision: VoteDecision
        let options: [VoteOption]
    }

    /// القرار وخياراته مع عدد الأصوات محسوباً في القاعدة.
    /// لا تُرجع أسماء المصوّتين — الحضور تغطيه قناة الحضور.
    static func page(code: String) async throws -> VotePage {
        try await client
            .rpc("get_vote_page", params: ["code": code])
            .execute()
            .value
    }

    /// هل المستخدم الحالي منشئ هذا القرار؟
    ///
    /// `get_vote_page` لا تكشف المالك عمداً، لكن المالك نفسه يقدر يقرأ صفّه
    /// مباشرة — نجاح القراءة هو الإثبات.
    static func isCreator(decisionId: UUID) async -> Bool {
        guard (try? await client.auth.session) != nil else { return false }
        struct Row: Decodable { let id: UUID }
        let row: Row? = try? await client
            .from("decisions")
            .select("id")
            .eq("id", value: decisionId)
            .limit(1)
            .single()
            .execute()
            .value
        return row != nil
    }

    // MARK: - التصويت

    private struct CastVoteParams: Encodable {
        let code: String
        let p_option_id: UUID
        let p_voter_name: String
    }

    /// صوت واحد بالاسم عبر `cast_vote` — الوزن مثبّت في القاعدة، والدالة نفسها
    /// ترمي رسائل عربية جاهزة للعرض، فنمرّرها كما هي.
    static func castVote(code: String, optionId: UUID, name: String) async throws {
        do {
            try await client
                .rpc("cast_vote", params: CastVoteParams(
                    code: code,
                    p_option_id: optionId,
                    p_voter_name: name
                ))
                .execute()
        } catch {
            // رموز القاعدة المعروفة تحمل رسالة عربية مقصودة للمستخدم
            let message = error.localizedDescription
            let known = ["23505", "42501", "22023"]
            let carriesArabicMessage = known.contains { message.contains($0) }
                || message.range(of: "\\p{Arabic}", options: .regularExpression) != nil
            throw GroupError.failed(
                carriesArabicMessage ? message : "لم يُحتسب صوتك. أعد المحاولة."
            )
        }
    }

    /// رابط المشاركة — يفتح في المتصفح كما يفتح في التطبيق، فالضيف قد لا يملكه.
    static func shareURL(code: String) -> URL {
        AppConfig.webBaseURL.appendingPathComponent("vote").appendingPathComponent(code)
    }
}
