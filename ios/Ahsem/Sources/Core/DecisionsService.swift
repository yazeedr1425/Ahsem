import Foundation
import Supabase

/// حفظ القرار وقراءته من Supabase حتى يتعلم منه النموذج في المرات القادمة.
///
/// ⚠️ يحتاج مستخدماً مسجَّل الدخول:
///   • `decisions.user_id` هو `NOT NULL` ويشير إلى `auth.users`
///   • سياسة `decisions_owner_all` تشترط `auth.uid() = user_id`
///
/// بدون جلسة يُرفض الإدخال بـ `42501`. لذلك نرجّع سبباً واضحاً بدل أن نرمي
/// استثناءً يكسر شاشة النتيجة.
enum DecisionsService {

    /// الحفظ يستلزم تسجيل الدخول — والفرق بين «لم يُحفظ» و«فشل الحفظ» يهم
    /// المستخدم، فنفرّق بينهما بنوعٍ لا برسالة.
    enum SaveError: LocalizedError {
        case unauthenticated
        case failed(String)

        var errorDescription: String? {
            switch self {
            case .unauthenticated: return "الحفظ يستلزم تسجيل الدخول — لم يُحفظ القرار."
            case .failed(let message): return message
            }
        }
    }

    private static var client: SupabaseClient { SupabaseClientProvider.shared }

    private static func currentUserId() async -> UUID? {
        try? await client.auth.session.user.id
    }

    private static func title(from options: [String]) -> String {
        let joined = options.joined(separator: " ضد ")
        return joined.count > 80 ? String(joined.prefix(77)) + "…" : joined
    }

    // MARK: - الصفوف

    private struct DecisionInsert: Encodable {
        let user_id: UUID
        let title: String
        let category: String
        let mode: String
        let status: String
    }

    private struct IDRow: Decodable { let id: UUID }

    private struct OptionInsert: Encodable {
        let decision_id: UUID
        let label: String
    }

    private struct OptionRow: Decodable {
        let id: UUID
        let label: String
    }

    private struct AnswerInsert: Encodable {
        let decision_id: UUID
        let question_key: String
        let value: String
        let weight: Int
    }

    private struct WinnerUpdate: Encodable {
        let winner_option_id: UUID
    }

    private struct WinnerLogInsert: Encodable {
        let decision_id: UUID
        let option_id: UUID
        /// التسمية مصوَّرة مع القيد لا مقروءة بانضمام: حذف الخيار يُفرّغ المعرّف
        /// ويبقى السجل قادراً على قول ماذا وقع.
        let option_label: String
        let source: String
        let reason: String?
    }

    // MARK: - الحفظ

    @discardableResult
    static func save(
        categoryId: String,
        options: [String],
        chosen: String,
        reason: String,
        answers: AnswerMap,
        weights: WeightMap
    ) async throws -> String {
        guard let userId = await currentUserId() else { throw SaveError.unauthenticated }

        do {
            // ١) القرار نفسه
            let decision: IDRow = try await client
                .from("decisions")
                .insert(DecisionInsert(
                    user_id: userId,
                    title: title(from: options),
                    category: categoryId,
                    mode: "solo",
                    status: "closed"
                ))
                .select("id")
                .single()
                .execute()
                .value

            // ٢) الخيارات
            let savedOptions: [OptionRow] = try await client
                .from("options")
                .insert(options.map { OptionInsert(decision_id: decision.id, label: $0) })
                .select("id, label")
                .execute()
                .value

            // ٣) الإجابات — مادة خام لطبقة التعلّم الشخصي لاحقاً.
            // إضافية، فلا تُفشِل الحفظ كله.
            let answerRows = answers.map { key, value in
                AnswerInsert(
                    decision_id: decision.id,
                    question_key: key,
                    value: value,
                    weight: weights[key] ?? 1
                )
            }
            if !answerRows.isEmpty {
                _ = try? await client.from("answers").insert(answerRows).execute()
            }

            // ٤) الفائز
            if let winner = savedOptions.first(where: { $0.label == chosen }) {
                try await client
                    .from("decisions")
                    .update(WinnerUpdate(winner_option_id: winner.id))
                    .eq("id", value: decision.id)
                    .execute()

                await logWinner(
                    decisionId: decision.id,
                    optionId: winner.id,
                    optionLabel: winner.label,
                    source: "decide",
                    reason: reason
                )
            }

            return decision.id.uuidString
        } catch {
            throw SaveError.failed(error.localizedDescription)
        }
    }

    /// قيدٌ في سجل الفائزين.
    ///
    /// إضافي دائماً ولا يُفشِل نداءه: العمود على `decisions` هو ما تقرأه الشاشة،
    /// وهذا السجل مادة تعلّمٍ لاحق — فسقوطه يستاهل تحذيراً لا شاشة خطأ.
    static func logWinner(
        decisionId: UUID,
        optionId: UUID,
        optionLabel: String,
        source: String,
        reason: String?
    ) async {
        _ = try? await client.from("decision_winners").insert(
            WinnerLogInsert(
                decision_id: decisionId,
                option_id: optionId,
                option_label: optionLabel,
                source: source,
                reason: reason
            )
        ).execute()
    }

    // MARK: - القراءة

    struct RecentDecision: Decodable, Identifiable, Hashable {
        let id: UUID
        let title: String?
        let category: String?
        let created_at: String?
        let winner_option_id: UUID?
        let options: [OptionSummary]?
        let feedback: [FeedbackSummary]?

        struct OptionSummary: Decodable, Hashable {
            let id: UUID
            let label: String
        }

        struct FeedbackSummary: Decodable, Hashable {
            let satisfaction: Int?
        }

        var chosen: String? {
            options?.first { $0.id == winner_option_id }?.label
        }

        var satisfaction: Int? {
            feedback?.first?.satisfaction
        }

        var createdAt: Date? {
            guard let created_at else { return nil }
            return ISO8601DateFormatter.supabase.date(from: created_at)
        }
    }

    /// آخر القرارات لعرضها في «سجل القرارات».
    ///
    /// اسم المفتاح الأجنبي مُحدَّد صراحةً: بين `decisions` و`options` علاقتان
    /// (`options.decision_id` و`decisions.winner_option_id`)، وبدون التحديد يرجّع
    /// PostgREST خطأ `PGRST201` لأنه لا يعرف أيهما نقصد.
    static func recent(limit: Int = 6) async throws -> [RecentDecision] {
        guard let userId = await currentUserId() else { return [] }

        return try await client
            .from("decisions")
            .select("""
                id, title, category, created_at, winner_option_id, \
                options!options_decision_id_fkey(id, label), feedback(satisfaction)
                """)
            .eq("user_id", value: userId)
            .order("created_at", ascending: false)
            .limit(limit)
            .execute()
            .value
    }

    struct WinnerEntry: Decodable, Hashable, Identifiable {
        let option_label: String
        let source: String
        let reason: String?
        let created_at: String

        var id: String { created_at + option_label }
        var at: Date? { ISO8601DateFormatter.supabase.date(from: created_at) }
    }

    /// أحكام قرارٍ واحد، أقدمها أولاً — من أراد أن يعرف هل انقلب الحكم بعد
    /// النقاش أم بقي على ما كان يقرأ من هنا.
    static func winnerHistory(decisionId: UUID) async throws -> [WinnerEntry] {
        try await client
            .from("decision_winners")
            .select("option_label, source, reason, created_at")
            .eq("decision_id", value: decisionId)
            .order("created_at", ascending: true)
            .execute()
            .value
    }

    /// تصحيح الفائز بعد أن يقلبه النقاش.
    ///
    /// المقارنة عند المُستدعي بالفائز *المحفوظ* لا بالمحسوب: المحفوظ هو حكم
    /// النموذج، وقد يخالف الحساب المحلي أصلاً.
    static func updateWinner(
        decisionId: UUID,
        chosen: String,
        reason: String?
    ) async throws {
        let options: [OptionRow] = try await client
            .from("options")
            .select("id, label")
            .eq("decision_id", value: decisionId)
            .execute()
            .value

        guard let winner = options.first(where: { $0.label == chosen }) else { return }

        try await client
            .from("decisions")
            .update(WinnerUpdate(winner_option_id: winner.id))
            .eq("id", value: decisionId)
            .execute()

        await logWinner(
            decisionId: decisionId,
            optionId: winner.id,
            optionLabel: winner.label,
            source: "discuss",
            reason: reason
        )
    }
}

extension ISO8601DateFormatter {
    /// طوابع Postgres تصل بكسور ثانية، والمُحلِّل الافتراضي يرفضها.
    static let supabase: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
