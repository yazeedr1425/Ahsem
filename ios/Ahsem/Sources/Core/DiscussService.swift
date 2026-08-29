import Foundation

/// دورة واحدة في نقاش الحكم.
struct DiscussTurn: Identifiable, Hashable, Encodable {
    enum Role: String, Hashable, Encodable {
        case user
        case agent
    }

    let id = UUID()
    let role: Role
    let text: String
    /// كم تعديلاً طُبِّق في هذه الدورة.
    var applied: Int = 0
    /// اسم الفائز الجديد إن انقلب الحكم بهذه الدورة.
    var flippedTo: String?

    enum CodingKeys: String, CodingKey {
        case role, text
    }
}

/// `POST /api/discuss` — النقاش بعد الحكم.
///
/// على عكس الإطار، هذا تحسينٌ لا ركن: القرار ظاهر أمام المستخدم قبل أن يفتح فمه.
/// لكن الفشل هنا **يُعرض** ولا يُبتلع — المستخدم أرسل رسالة وينتظر رداً، وصمتٌ
/// بعد إرسال يُقرأ كعطب لا كتحسينٍ غاب.
enum DiscussService {

    struct VerdictSummary: Encodable {
        let chosen: String
        let reason: String
        let decisive: String?
        let flip: String?
    }

    /// وصف الفارق للنموذج.
    ///
    /// الفارق وحده رقم بلا مرجع — «٤» قد تكون ساحقة أو داخل الضجيج حسب مجموع
    /// الأوزان، فنعطيه الحكم لا المادة الخام.
    struct Lead: Encodable {
        let diff: Int
        let max: Int
        let ratio: Double
        let gap: String
    }

    static func describeLead(
        scored: [ScoredOption],
        criteria: [Criterion],
        weights: WeightMap
    ) -> Lead {
        let max = criteria.reduce(0) { $0 + (weights[$1.key] ?? 2) * 2 }
        let diff = scored.count > 1 ? scored[0].total - scored[1].total : 0
        let ratio = max > 0 ? Double(diff) / Double(max) : 0

        let gap: String
        if diff == 0 {
            gap = "متعادلان تماماً"
        } else if ratio < 0.15 {
            gap = "فارق ضيق، تحريك واحد يقلبه"
        } else if ratio < 0.4 {
            gap = "فارق واضح لكنه ليس ساحقاً"
        } else {
            gap = "فارق واسع، ما يقلبه تحريك واحد"
        }

        return Lead(diff: diff, max: max, ratio: ratio, gap: gap)
    }

    private struct CriterionRef: Encodable {
        let key: String
        let label: String
    }

    private struct Request: Encodable {
        let options: [String]
        let criteria: [CriterionRef]
        let weights: WeightMap
        let ratings: [String: [String: Int]]
        let verdict: VerdictSummary
        let lead: Lead
        let turns: [DiscussTurn]
        /// كم تعديلاً أُنفق على كل معيار — السقف التراكمي يُقرأ عند الخادم لا في
        /// الواجهة: الواجهة تعرض، والعقد يمنع.
        let spent: [String: Int]
        let message: String
    }

    struct Response: Decodable {
        let ok: Bool
        let reply: String
        /// التصنيف يسبق التعديل في المخطط، فهو أوثق منه: رسالةٌ صُنّفت ضغطاً ثم
        /// أُرفق بها تعديل تناقض نفسها — والخادم يُلغي التعديل لا التصنيف.
        let reads_as: String?
        let understood: String?
        let changes: [Revision.Change]?
        let model: String?
    }

    struct Result {
        let reply: String
        let changes: [Revision.Change]
        let readsAs: String?
        let understood: String?
    }

    static func send(
        options: [String],
        criteria: [Criterion],
        weights: WeightMap,
        ratings: [String: [String: Int]],
        verdict: VerdictSummary,
        lead: Lead,
        turns: [DiscussTurn],
        spent: [String: Int],
        message: String
    ) async throws -> Result {
        let response: Response = try await APIClient.shared.post(
            "api/discuss",
            body: Request(
                options: options,
                criteria: criteria.map { CriterionRef(key: $0.key, label: $0.label) },
                weights: weights,
                ratings: ratings,
                verdict: verdict,
                lead: lead,
                // الدورة الجارية تُرسل ضمن السجل، فيقرأ النموذج ما قيل قبله
                turns: turns.dropLast().map { $0 },
                spent: spent,
                message: message
            )
        )

        return Result(
            reply: response.reply,
            changes: response.changes ?? [],
            readsAs: response.reads_as,
            understood: response.understood
        )
    }
}
