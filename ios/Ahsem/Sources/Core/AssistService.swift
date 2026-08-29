import Foundation

/// `POST /api/assist` — وكيل المحادثة الصوتية.
///
/// المستخدم يتكلم طبيعياً، والوكيل يستخرج كل ما يقدر عليه ويسأل عن الناقص وحده.
/// الحالة تُبنى تراكمياً عند الخادم من الحوار كله، فلا تُعاد صياغة السؤال بعد
/// إجابته.
enum AssistService {

    struct Turn: Encodable {
        let role: String
        let text: String
    }

    struct AnswerPair: Decodable, Hashable {
        let question_key: String
        let choice_value: String
    }

    struct RatingTriple: Decodable, Hashable {
        let option: String
        let criterion_key: String
        /// ١ ضعيف، ٢ متوسط، ٣ ممتاز.
        let value: Int
    }

    struct State: Decodable, Hashable {
        let categoryId: String?
        let options: [String]?
        let answers: [AnswerPair]?
        let ratings: [RatingTriple]?

        /// الوكيل يرجّع التقييمات مفهرسة بنص الخيار، والمحرك يريدها بمعرّفه.
        func ratingMap(for options: [DecisionOption]) -> RatingMap {
            var out: RatingMap = [:]
            for triple in ratings ?? [] {
                guard let option = options.first(where: { $0.label == triple.option })
                else { continue }
                out[option.id, default: [:]][triple.criterion_key] = triple.value
            }
            return out
        }

        var answerMap: AnswerMap {
            Dictionary(
                (answers ?? []).map { ($0.question_key, $0.choice_value) },
                uniquingKeysWith: { _, last in last }
            )
        }
    }

    struct Response: Decodable {
        let ok: Bool
        /// ما يُقال بصوت عالٍ.
        let reply: String
        /// اكتمل كل ما يلزم للحسم.
        let ready: Bool
        let state: State
    }

    private struct Request: Encodable {
        let utterance: String
        let history: [Turn]
    }

    static func send(utterance: String, history: [Turn]) async throws -> Response {
        try await APIClient.shared.post(
            "api/assist",
            body: Request(utterance: utterance, history: Array(history.suffix(6)))
        )
    }
}
