import Foundation

/// طبقة المراجعة: ما غيّره النقاش فوق الحساب الأصلي.
///
/// تعيش مع حالة التدفق لا داخل شاشة النتيجة، لأن `ScoreEngine` يقرأ منها — ولو
/// ملكتها الشاشة لصار للحقيقة مصدران.
///
/// دوالها نقية يشتقّ منها العرض، فلا تعديل حالة داخل أثر جانبي.
struct Revision: Equatable {
    /// معايير أضافها النقاش — تدخل القالب نفسه فيقرأها المحرك كأنها من الإطار.
    var criteria: [Criterion] = []
    var weights: WeightMap = [:]
    var ratings: RatingMap = [:]
    /// كم تعديلاً أُنفق على كل معيار — سقفٌ يمنع دورةً تعيد وزن المعيار نفسه بلا
    /// نهاية.
    var spent: [String: Int] = [:]
    /// عدد الدورات المطبَّقة.
    var count: Int = 0

    static let empty = Revision()

    var isEmpty: Bool { count == 0 }

    /// تعديل واحد اقترحه النقاش.
    struct Change: Equatable, Decodable {
        enum Kind: String, Equatable, Decodable {
            case addCriterion = "add_criterion"
            case reweight
            /// تغيير تقييم معيار قائم — بلا مساس بوزنه.
            case rerate
        }

        let type: Kind
        let criterion: String
        var label: String? = nil
        var low: String? = nil
        var mid: String? = nil
        var high: String? = nil
        var weight: Int? = nil
        var why: String? = nil
        /// مفهرسة بنص الخيار — النموذج يتكلم بالنص، والمحرك يفهرس بالمعرّف.
        var ratings: [String: Int]? = nil
    }

    /// دمج تعديلات دورة في المراجعة. الخيارات تُمرَّر بمعرّفاتها لأن المحرك يفهرس
    /// التقييمات بالمعرّف، والنموذج يتكلم بالنص.
    func merging(_ changes: [Change], options: [DecisionOption]) -> Revision {
        guard !changes.isEmpty else { return self }

        var next = self
        next.count += 1

        func id(of label: String) -> String? {
            options.first { $0.label == label }?.id
        }

        for change in changes {
            next.spent[change.criterion, default: 0] += 1

            switch change.type {
            case .addCriterion:
                next.criteria.append(
                    Criterion(
                        key: change.criterion,
                        label: change.label ?? change.criterion,
                        low: change.low ?? "",
                        mid: change.mid ?? "",
                        high: change.high ?? ""
                    )
                )
                if let weight = change.weight { next.weights[change.criterion] = weight }

            case .reweight:
                if let weight = change.weight { next.weights[change.criterion] = weight }

            case .rerate:
                // التقييمات وحدها تتغيّر — تُطبَّق أدناه مع بقية الأنواع
                break
            }

            if let given = change.ratings {
                for (label, value) in given {
                    guard let optionId = id(of: label) else { continue }
                    next.ratings[optionId, default: [:]][change.criterion] = value
                }
            }
        }

        return next
    }

    /// معيارٌ رفعه المستخدم في النقاش يدخل القالب نفسه، فيقرأه المحرك كأنه من
    /// الإطار — نفس مبدأ الإطار مع الفئة الثابتة.
    func applied(to category: Category?) -> Category? {
        guard let category, !criteria.isEmpty else { return category }
        return Category(
            id: category.id,
            label: category.label,
            en: category.en,
            hint: category.hint,
            moodCriteria: category.moodCriteria,
            criteria: category.criteria + criteria,
            questions: category.questions
        )
    }

    /// الترتيب مقصود: حساب الأوزان يعطي المعيار المضاف وزناً محايداً، ثم تكتب
    /// المراجعة فوقه الوزن الذي بنى عليه النموذج تعديله.
    func applied(to weights: WeightMap) -> WeightMap {
        weights.merging(self.weights) { _, revised in revised }
    }

    func applied(to ratings: RatingMap) -> RatingMap {
        guard count > 0 else { return ratings }
        var out = ratings
        for (optionId, byKey) in self.ratings {
            out[optionId] = (out[optionId] ?? [:]).merging(byKey) { _, revised in revised }
        }
        return out
    }
}
