import Foundation

/// `POST /api/frame` — توليد إطار القرار، و`POST /api/third` — الخيار الثالث،
/// و`POST /api/breakdown` — تفكيك القرار المصيري.
///
/// الثلاثة تشترك في أنها اقتراحات: فشلها لا يوقف الحسم. ولهذا كل دالة هنا
/// ترجّع `nil` بدل أن ترمي حين يكون الغياب مقبولاً — الشاشة تكمل بالقالب الثابت.

enum FrameService {

    struct Request: Encodable {
        let options: [String]
        var refine: Refine? = nil

        struct Refine: Encodable {
            let untouched: [String]
            let asked: [String]
            let shown: [String]
        }
    }

    struct Response: Decodable {
        let ok: Bool
        let frame: FramePayload?
        /// "cache" أو "model" — للتشخيص لا للعرض.
        let source: String?
    }

    /// إطار مفصّل على الخيارين بعينهما. الغياب ليس عطلاً: الشاشة ترتد للقالب
    /// الثابت المرتبط بالفئة، وهو ما كانت عليه قبل الإطار أصلاً.
    static func frame(for options: [String]) async throws -> FramePayload? {
        let response: Response = try await APIClient.shared.post(
            "api/frame",
            body: Request(options: options)
        )
        return response.frame
    }
}

/// `POST /api/third` — «الخيار اللي ما فكرت فيه».
///
/// أحياناً الحيرة بين شيئين ليست لأن أحدهما أفضل، بل لأن الاثنين غلط. البديل
/// الجيد ليس «واحداً ثالثاً من نفس النوع» — بيتزا مع برجر وسوشي تزيد الحيرة
/// صفاً — بل يقرأ المقايضة التي علق فيها ويكسرها.
///
/// يظهر فقط حين يوجد اقتراح حقيقي: لا حالة تحميل، ولا ضجيج.
enum ThirdOptionService {

    struct Request: Encodable {
        let options: [String]
    }

    struct Suggestion: Decodable, Identifiable, Hashable {
        /// كلمتان إلى أربع، ملموس وقابل للاختيار.
        let label: String
        /// كلمتان أو ثلاث تقول لماذا يساعد.
        let note: String

        var id: String { label }
    }

    struct Response: Decodable {
        let ok: Bool
        let suggestions: [Suggestion]
        let source: String?
    }

    /// قائمة فارغة هي الحالة الطبيعية لا الاستثناء — فلا نرمي عند غيابها.
    static func suggestions(for options: [String]) async -> [Suggestion] {
        do {
            let response: Response = try await APIClient.shared.post(
                "api/third",
                body: Request(options: options)
            )
            return response.suggestions
        } catch {
            // اقتراح صامت: فشله لا يُعرض للمستخدم ولا يوقف الكتابة
            return []
        }
    }
}

/// `POST /api/breakdown` — تفكيك القرار الأكبر من أدوات الحسم العادية.
///
/// مرحلتان: `questions` تحوّل السؤال الكبير إلى فحوصات واقعية يجاوب عنها اليوم،
/// ثم `verdict` يركّب الحكم من إجاباته — «اقدم» أو «ليس بعد» مع ما يقلبها بالضبط
/// وخطوة واحدة ممكنة هذا الأسبوع.
enum BreakdownService {

    /// الإجابات الثلاث المقبولة — الخادم يرفض ما عداها.
    enum Answer: String, CaseIterable, Codable, Identifiable {
        case yes = "نعم"
        case almost = "تقريباً"
        case no = "لا"

        var id: String { rawValue }
        var label: String { rawValue }
    }

    struct Check: Decodable, Identifiable, Hashable {
        let key: String
        /// فحص واقعي، لا السؤال الكبير بصيغة أصغر.
        let label: String
        /// لماذا يهم — سطر قصير.
        let why: String?
        /// الخيار الذي تدعمه إجابة «نعم»، منسوخ حرفياً من القائمة.
        let favors: String

        var id: String { key }
    }

    struct QuestionsRequest: Encodable {
        let phase = "questions"
        let options: [String]
    }

    struct QuestionsResponse: Decodable {
        let ok: Bool
        let oversized: Bool
        let reason: String?
        let questions: [Check]
    }

    struct AnsweredCheck: Encodable {
        let label: String
        let answer: String
        let favors: String
    }

    struct VerdictRequest: Encodable {
        let phase = "verdict"
        let options: [String]
        let answers: [AnsweredCheck]
    }

    struct VerdictResponse: Decodable {
        let ok: Bool
        /// "go" أو "not_yet" حصراً.
        let verdict: String
        /// الخيار الذي يُعمل به الآن، منسوخ حرفياً.
        let chosen: String
        let headline: String
        let detail: String
        /// لـ «ليس بعد»: من واحد إلى ثلاثة شروط تقلبها إلى «اقدم».
        /// وهذه أثمن ما في الشاشة: تحوّل «لا» إلى «التأجيل أنسب، وهذا الطريق».
        let missing: [String]
        /// خطوة واحدة ممكنة هذا الأسبوع، محددة بما يكفي للبدء صباح الغد.
        let next_step: String

        /// «ليس بعد» ليست «لا» — بل ترتيب. الشاشة تعتمد هذا التمييز في نبرتها.
        var isGo: Bool { verdict == "go" }
    }

    static func checks(for options: [String]) async throws -> QuestionsResponse {
        try await APIClient.shared.post("api/breakdown", body: QuestionsRequest(options: options))
    }

    static func verdict(
        options: [String],
        answers: [AnsweredCheck]
    ) async throws -> VerdictResponse {
        try await APIClient.shared.post(
            "api/breakdown",
            body: VerdictRequest(options: options, answers: answers)
        )
    }
}
