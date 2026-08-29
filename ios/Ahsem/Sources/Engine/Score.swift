import Foundation

/// خيار كما يكتبه المستخدم — معرّف محلي ثابت ونص.
struct DecisionOption: Identifiable, Hashable, Codable {
    let id: String
    var label: String

    init(id: String = UUID().uuidString, label: String) {
        self.id = id
        self.label = label
    }
}

/// سطر واحد في تفصيل خيار: المعيار، تقييمه، وزنه، ونقاطه.
struct BreakdownRow: Identifiable, Hashable {
    let key: String
    let label: String
    let low: String
    let high: String
    let rating: Int
    let weight: Int

    var points: Int { rating * weight }
    var id: String { key }
}

/// خيار بعد الحساب — مرتّب تنازلياً بالمجموع.
struct ScoredOption: Identifiable, Hashable {
    let id: String
    let label: String
    let breakdown: [BreakdownRow]
    let total: Int
    let percent: Int
    /// حظّه في «أنا متردد جدًا» — يُحسب عند الطلب فقط.
    var chance: Int = 0
}

/// درجة معيار واحد لخيار واحد: `[optionId: [criterionKey: rating]]`
typealias RatingMap = [String: [String: Int]]
/// وزن كل معيار: `[criterionKey: weight]`
typealias WeightMap = [String: Int]
/// إجابة كل سؤال: `[questionKey: choiceValue]`
typealias AnswerMap = [String: String]

/// محرك التقييم الموزون (Weighted Scoring)
///
/// الفكرة: إجابات المستخدم على الأسئلة تحدد «وزن» كل معيار، وتقييمه لكل
/// خيار يحدد «درجة» الخيار في ذلك المعيار.
///   `score(option) = Σ (وزن المعيار × درجة الخيار فيه)`
enum ScoreEngine {

    struct RatingStep: Identifiable, Hashable {
        let value: Int
        let label: String
        var id: Int { value }
    }

    static let ratingScale: [RatingStep] = [
        RatingStep(value: 1, label: "ضعيف"),
        RatingStep(value: 2, label: "متوسط"),
        RatingStep(value: 3, label: "ممتاز"),
    ]

    static let defaultRating = 2
    static let minOptions = 2
    static let maxOptions = 5
    static let maxWeight = 4

    /// أوزان المعايير مستخرجة من إجابات الأسئلة، مع لمسة من المزاج العام.
    /// أي معيار لم يُجب عنه المستخدم يأخذ وزناً محايداً.
    static func weights(
        category: Category,
        answers: AnswerMap,
        moodId: String?
    ) -> WeightMap {
        var weights: WeightMap = [:]
        for c in category.criteria { weights[c.key] = 2 }

        for q in category.questions {
            if let value = answers[q.key],
               let chosen = q.choices.first(where: { $0.value == value }) {
                weights[q.affects] = chosen.weight
            }
        }

        // المزاج يرفع وزن معيار واحد فقط — أثر محدود ومعلن للمستخدم
        if let target = Moods.target(category: category, moodId: moodId),
           let current = weights[target] {
            weights[target] = min(current + 1, maxWeight)
        }

        return weights
    }

    static func score(
        category: Category,
        options: [DecisionOption],
        ratings: RatingMap,
        weights: WeightMap
    ) -> [ScoredOption] {
        let maxTotal = category.criteria.reduce(0) { sum, c in
            sum + (weights[c.key] ?? 0) * ratingScale.count
        }

        let scored = options.map { option -> ScoredOption in
            let given = ratings[option.id] ?? [:]
            let breakdown = category.criteria.map { c in
                BreakdownRow(
                    key: c.key,
                    label: c.label,
                    low: c.low,
                    high: c.high,
                    rating: given[c.key] ?? defaultRating,
                    weight: weights[c.key] ?? 0
                )
            }
            let total = breakdown.reduce(0) { $0 + $1.points }
            return ScoredOption(
                id: option.id,
                label: option.label,
                breakdown: breakdown,
                total: total,
                percent: maxTotal > 0 ? Int((Double(total) / Double(maxTotal) * 100).rounded()) : 0
            )
        }

        return scored.sorted { $0.total > $1.total }
    }

    static func isTie(_ scored: [ScoredOption]) -> Bool {
        scored.count > 1 && scored[0].total == scored[1].total
    }

    /// حظوظ وضع «أنا متردد جدًا» — الأعلى تقييماً له فرصة أكبر لكنها غير مضمونة.
    /// الأس (`sharpness`) يتحكم بحدة الفرق: 1 = عادل، أعلى = يميل للفائز.
    static func chances(_ scored: [ScoredOption], sharpness: Double = 2) -> [ScoredOption] {
        let raw = scored.map { pow(Double($0.total), sharpness) }
        let sum = raw.reduce(0, +)
        return scored.enumerated().map { index, option in
            var copy = option
            copy.chance = sum > 0 ? Int((raw[index] / sum * 100).rounded()) : 0
            return copy
        }
    }

    /// سحبة موزونة: الأعلى مرجَّح لكنه غير مضمون.
    static func weightedRandomPick(_ scored: [ScoredOption], sharpness: Double = 2) -> ScoredOption? {
        let withChances = chances(scored, sharpness: sharpness)
        let raw = scored.map { pow(Double($0.total), sharpness) }
        let sum = raw.reduce(0, +)
        guard sum > 0 else { return withChances.first }

        var roll = Double.random(in: 0..<sum)
        for (index, entry) in withChances.enumerated() {
            roll -= raw[index]
            if roll <= 0 { return entry }
        }
        return withChances.last
    }
}
