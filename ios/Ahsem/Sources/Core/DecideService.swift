import Foundation

/// `POST /api/decide` — الحسم نفسه.
///
/// الخادم يزن إجابات المستخدم الحالية بثقل، ويقرأ آخر خمسة قرارات لالتقاط
/// العادات، ثم يرجّع خياراً منسوخاً حرفياً من القائمة مع سبب عربي وأربعة حقول
/// عمق. الحقول الأربعة إضافة محضة: الحسم يظهر بدونها، فغيابها بطاقة أقل لا عطل.
enum DecideService {

    struct Request: Encodable {
        let options: [String]
        let answers: AnswerMap
        let userId: String?
        let categoryId: String?
        let frame: FramePayload?
        let tone: String
    }

    struct HistoryEntry: Decodable, Identifiable, Hashable {
        let id: String
        let title: String?
        let category: String?
        let decidedAt: String?
        let chosen: String?
        let rejected: [String]?
        let satisfaction: Int?
    }

    struct Response: Decodable {
        let ok: Bool
        let selected_option: String
        let funny_reason: String
        /// مفتاح المعيار الذي حسمها — يصل فقط إذا طابق معياراً حقيقياً في الإطار.
        let decisive_criterion: String?
        /// قوة الفائز الحاسمة.
        let edge: String?
        /// ما الذي يخسره لو أخذ الخيار الآخر.
        let cost_of_switching: String?
        /// التغيّر المحدد الذي يقلب هذا القرار.
        let flip_condition: String?
        let history: [HistoryEntry]?
        let historyCount: Int?
        /// السجل تحسين لا شرط: فشله يصل كتنبيه ولا يُسقِط الحسم.
        let historyError: String?
        let model: String?
    }

    /// الحكم كما تعرضه الشاشة — يوحّد مصدرَي النتيجة: النموذج، أو الحساب المحلي
    /// حين يتعذّر النداء. الشاشة لا تفرّق بينهما إلا بشارة `isLocal`.
    struct Verdict: Hashable {
        let winner: String
        let reason: String
        var decisiveCriterion: String? = nil
        var edge: String? = nil
        var costOfSwitching: String? = nil
        var flipCondition: String? = nil
        /// النتيجة محسوبة على الجهاز لأن النداء فشل — والحساب هو نفسه الحساب.
        var isLocal: Bool = false
    }

    static func decide(
        options: [DecisionOption],
        answers: AnswerMap,
        userId: String?,
        categoryId: String?,
        frame: FramePayload?,
        tone: Tone
    ) async throws -> Verdict {
        let response: Response = try await APIClient.shared.post(
            "api/decide",
            body: Request(
                options: options.map(\.label),
                answers: answers,
                userId: userId,
                categoryId: categoryId,
                frame: frame,
                tone: tone.rawValue
            )
        )

        return Verdict(
            winner: response.selected_option,
            reason: response.funny_reason,
            decisiveCriterion: response.decisive_criterion,
            edge: response.edge,
            costOfSwitching: response.cost_of_switching,
            flipCondition: response.flip_condition,
            isLocal: false
        )
    }

    /// الحكم المحلي حين يسقط النداء.
    ///
    /// «لو فشل نداء الـ API، الحساب المحلي يحمل الشاشة — لا تنكسر أبداً». الأرقام
    /// هي هي: النموذج يفسّر ولا يحسب، فالفارق نبرة السطر لا الفائز.
    static func localVerdict(scored: [ScoredOption], tone: Tone) -> Verdict? {
        guard let winner = scored.first else { return nil }
        let voice = Voice.of(tone)
        let reason = Explain.reasonPhrase(scored)

        return Verdict(
            winner: winner.label,
            reason: ScoreEngine.isTie(scored) ? voice.tie(winner.label) : reason,
            decisiveCriterion: Explain.decidingCriterion(scored)?.key,
            isLocal: true
        )
    }
}
