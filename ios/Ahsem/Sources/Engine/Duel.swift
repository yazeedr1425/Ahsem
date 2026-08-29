import Foundation

/// المبارزة — مقارنة خيارين بمقبض واحد لكل معيار بدل خانتين.
///
/// لماذا هذا التحويل غير فاقد للمعلومة: مع خيارين يتحدد الفائز بـ
/// `Σ w×(rA − rB)` — الفارق وحده هو المهم، لا القيمة المطلقة. ومجال التقييم
/// ١–٣ يعطي خمسة فوارق ممكنة فقط (‎-2..+2‎)، فخمس محطات تغطيها كلها. ولهذا
/// بالضبط تبقى شبكة التقييم للثلاثة فأكثر: هناك تدخل القيمة المطلقة في
/// الحساب ولا يكفي الفارق.
///
/// المخرَج تقييمات عادية يقرأها `ScoreEngine.score` — المحرك لا يعرف أن شاشة
/// المبارزة موجودة أصلاً.
enum Duel {

    static let min = -2
    static let max = 2
    static let stops = [-2, -1, 0, 1, 2]

    struct Pair: Hashable {
        let first: Int
        let second: Int
    }

    /// الموجب يميل للخيار الأول. الجدول من الخطة حرفياً.
    private static let ratingsAtPosition: [Int: Pair] = [
        -2: Pair(first: 1, second: 3),
        -1: Pair(first: 2, second: 3),
         0: Pair(first: 2, second: 2),
         1: Pair(first: 3, second: 2),
         2: Pair(first: 3, second: 1),
    ]

    static func clamp(_ n: Int) -> Int {
        Swift.max(min, Swift.min(max, n))
    }

    /// تقييما الخيارين عند موضع مقبض.
    static func ratings(at position: Int) -> Pair {
        ratingsAtPosition[clamp(position)] ?? Pair(first: 2, second: 2)
    }

    /// الموضع المقابل لتقييمين. الفارق هو المعنى، فأي زوج خارج الجدول (قرار
    /// قديم قُيِّم بالشبكة) ينحدر لأقرب موضع بدل أن يسقط.
    static func position(first: Int?, second: Int?) -> Int {
        guard let first, let second else { return 0 }
        return clamp(first - second)
    }

    /// تقييمات ابتدائية من تقدير النموذج: المستخدم يفتح الشاشة على وضعٍ معقول
    /// ويصحّح ما يخالفه، بدل أن يعبّئ من الصفر.
    ///
    /// الاشتقاق عند العرض لا ضبطٌ داخل أثر: المعيار الذي لمسه المستخدم يبقى له،
    /// وغير الملموس يأخذ التقدير — فلا يحتاج تعديل حالة داخل `onAppear` ولا
    /// يمسح تعديلاً وصل قبل الإطار.
    static func withPriors(
        ratings: RatingMap,
        frame: FramePayload?,
        options: [DecisionOption]
    ) -> RatingMap {
        guard let frame, let priors = frame.priors, options.count == 2 else { return ratings }

        let a = options[0]
        let b = options[1]
        var out = ratings

        for c in frame.criteria {
            if out[a.id]?[c.key] != nil && out[b.id]?[c.key] != nil { continue }

            guard let pa = priors[a.label]?[c.key],
                  let pb = priors[b.label]?[c.key] else { continue }

            let pair = Duel.ratings(at: position(first: pa, second: pb))
            out[a.id, default: [:]][c.key] = pair.first
            out[b.id, default: [:]][c.key] = pair.second
        }

        return out
    }

    struct Lead {
        let diff: Int
        /// بين ‎-1‎ و‎+1‎، والموجب للخيار الأول.
        let ratio: Double
        let leader: DecisionOption?
    }

    /// الفارق التراكمي — ما يعرضه الشريط الحي أعلى الشاشة.
    static func lead(
        criteria: [Criterion],
        ratings: RatingMap,
        weights: WeightMap,
        options: [DecisionOption]
    ) -> Lead {
        guard options.count == 2 else { return Lead(diff: 0, ratio: 0, leader: nil) }
        let a = options[0]
        let b = options[1]

        var diff = 0
        var maxDiff = 0

        for c in criteria {
            let weight = weights[c.key] ?? 0
            let ra = ratings[a.id]?[c.key] ?? 2
            let rb = ratings[b.id]?[c.key] ?? 2
            diff += weight * (ra - rb)
            maxDiff += weight * Duel.max
        }

        return Lead(
            diff: diff,
            ratio: maxDiff > 0 ? Double(diff) / Double(maxDiff) : 0,
            leader: diff == 0 ? nil : (diff > 0 ? a : b)
        )
    }

    /// نص المقبض لقارئ الشاشة. الرقم المجرّد («٢») بلا معنى مسموع — المطلوب
    /// اتجاه الميل وشدّته.
    static func positionText(_ position: Int, firstLabel: String, secondLabel: String) -> String {
        switch clamp(position) {
        case -2: return "يميل لـ\(secondLabel) بوضوح"
        case -1: return "يميل لـ\(secondLabel)"
        case 1: return "يميل لـ\(firstLabel)"
        case 2: return "يميل لـ\(firstLabel) بوضوح"
        default: return "متعادل"
        }
    }
}
