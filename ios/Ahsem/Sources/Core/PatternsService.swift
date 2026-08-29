import Foundation

/// `GET /api/patterns` — «شخصيتك القرارية».
///
/// كل الإحصاء يُحسب في الكود؛ النموذج **يفسّر ولا يعدّ**. هذا الفصل مقصود:
/// الأرقام لا تحتمل هلوسة، والقراءة لا تُكتب بمعادلة.
///
/// وحتى المنطقة الزمنية تُرسل: «متى يضربك ترددك» بلا توقيت المستخدم جملة عن
/// شخصٍ آخر.
enum PatternsService {

    struct Observation: Decodable, Identifiable, Hashable {
        /// كلمتان إلى أربع.
        let title: String
        /// جملة أو جملتان.
        let detail: String

        var id: String { title }
    }

    struct Reading: Decodable, Hashable {
        /// جملة واحدة تسمّي كيف يقرر هذا الشخص.
        let headline: String
        let patterns: [Observation]
        /// النمط الذي يعمل ضده — فارغ إن لم تُظهر البيانات شيئاً.
        let blindSpot: String?
        /// جملة واحدة ملموسة يقدر يعمل بها اليوم.
        let advice: String?
    }

    struct CategoryStat: Decodable, Identifiable, Hashable {
        let category: String?
        let count: Int?
        let rated: Int?
        let regretted: Int?
        let regretRate: Int?

        var id: String { category ?? UUID().uuidString }
    }

    struct Stats: Decodable, Hashable {
        let total: Int
        let rated: Int
        let regretted: Int
        let happy: Int
        let regretRate: Int
        let byCategory: [CategoryStat]?
        /// يُطرح كثيراً ولا يفوز أبداً — أقوى نمط في الملف.
        let neverChosen: [RepeatedLabel]?
        let alwaysChosen: [RepeatedLabel]?
        let averageOptionCount: Double?

        struct RepeatedLabel: Decodable, Identifiable, Hashable {
            let label: String
            let offered: Int?
            let chosen: Int?

            var id: String { label }
        }
    }

    struct Response: Decodable {
        let ok: Bool
        /// `false` حين لا تكفي العيّنة — والخادم يقول بصراحة كم بقي.
        let ready: Bool
        let rated: Int?
        let need: Int?
        let reading: Reading?
        let stats: Stats?
    }

    static func read() async throws -> Response {
        try await APIClient.shared.get(
            "api/patterns",
            query: ["tz": TimeZone.current.identifier]
        )
    }
}

/// `POST /api/assist` وتقييم النتيجة — «كانت صح؟» تحت كل قرار محفوظ.
///
/// الإجابات هي ما يغذّي قراءة الأنماط: بلا تقييم لا تُقرأ شخصية، ولهذا يُسأل عن
/// القرار بعد وقوعه لا قبله.
enum FeedbackService {
    private struct Insert: Encodable {
        let decision_id: String
        let satisfaction: Int
    }

    static func rate(decisionId: UUID, satisfaction: Int) async throws {
        try await SupabaseClientProvider.shared
            .from("feedback")
            .upsert(
                Insert(decision_id: decisionId.uuidString, satisfaction: satisfaction),
                onConflict: "decision_id"
            )
            .execute()
    }
}
