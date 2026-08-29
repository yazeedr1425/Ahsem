import Foundation

/// تحويل أحكام النموذج النوعية إلى أرقام — في الكود، لا في النموذج.
///
/// لماذا؟ لو سُئل النموذج مباشرةً «كم نسبة المخاطرة؟» أرجع رقماً مثل ٣٤٪ يبدو
/// دقيقاً وهو في الحقيقة نصٌّ مولَّد لا حساب وراءه، وعرضه كتوقّع مضلِّل.
///
/// بدل ذلك: النموذج يعطي أحكاماً نوعية يجيدها فعلاً (احتمال مرتفع/متوسط/منخفض،
/// أثر، قابلية تراجع)، والكود يحوّلها لرقم بمعادلة ثابتة ومكشوفة. الرقم يصير
/// قابلاً للتفسير والتكرار، ولو اختلفت معه تقدر تشوف من أين جاء.
///
/// نفس فلسفة محرك التقييم — الحساب في الكود، والنموذج للحكم.
enum Risk {

    struct Level {
        let value: Int
        let label: String
    }

    static let levels: [String: Level] = [
        "high": Level(value: 3, label: "مرتفع"),
        "medium": Level(value: 2, label: "متوسط"),
        "low": Level(value: 1, label: "منخفض"),
    ]

    /// قابلية التراجع مُعدِّل، لا عامل كامل — وهذا مقصود.
    ///
    /// جُرِّبت أولاً كعامل يُضرب (١ إلى ٣) فكانت النتيجة خاطئة: مسارٌ ضرره مرجَّح
    /// وشديد لكن يمكن التراجع عنه كان يخرج بمخاطرة ٣٣٪ ويُصنَّف «فرصة واضحة».
    /// سهولة التراجع تخفّف الضرر ولا تلغيه — الخسارة تقع فعلاً قبل أن تتراجع.
    static let reversibility: [String: (factor: Double, label: String)] = [
        "easy": (0.6, "أقدر أرجع عنه بسهولة"),
        "costly": (1.0, "الرجوع مكلف"),
        "irreversible": (1.35, "ما فيه رجعة"),
    ]

    static func level(_ key: String?) -> Int {
        levels[key ?? ""]?.value ?? 2
    }

    static func label(_ key: String?) -> String {
        levels[key ?? ""]?.label ?? "متوسط"
    }

    static func reversalFactor(_ key: String?) -> Double {
        reversibility[key ?? ""]?.factor ?? 1.0
    }

    static func reversalLabel(_ key: String?) -> String {
        reversibility[key ?? ""]?.label ?? "الرجوع مكلف"
    }

    /// درجة المخاطرة = (احتمال الضرر × شدته) منسوبة للحد الأقصى، ثم مُعدَّلة
    /// بقابلية التراجع ومحدودة بـ ١٠٠.
    static func riskScore(_ path: AnalyzeService.Path) -> Int {
        let base = Double(level(path.downside_likelihood) * level(path.downside_impact)) / 9
        return min(100, Int((base * reversalFactor(path.reversibility) * 100).rounded()))
    }

    /// درجة الجاذبية = احتمال المكسب × حجمه.
    ///
    /// منفصلة عن المخاطرة عمداً — مسارٌ قد يكون عالي الاثنين، ودمجهما في رقم واحد
    /// يخفي هذه المفارقة بالضبط.
    static func upsideScore(_ path: AnalyzeService.Path) -> Int {
        let raw = level(path.upside_likelihood) * level(path.upside_impact)
        return Int((Double(raw) / 9 * 100).rounded())
    }

    struct Quadrant: Hashable {
        let key: String
        let label: String
    }

    /// تصنيف المسار في ربع من أربعة — أوضح من رقمين منفصلين.
    static func quadrant(risk: Int, upside: Int) -> Quadrant {
        let hiRisk = risk >= 50
        let hiUpside = upside >= 50

        if hiUpside && !hiRisk { return Quadrant(key: "sweet", label: "فرصة واضحة") }
        if hiUpside && hiRisk { return Quadrant(key: "bet", label: "رهان كبير") }
        if !hiUpside && !hiRisk { return Quadrant(key: "safe", label: "آمن بلا عائد يذكر") }
        return Quadrant(key: "trap", label: "مخاطرة بلا مقابل")
    }

    /// المسار مع رقميه وأساسهما — نحتفظ بالمدخلات التي بُني عليها الرقم حتى
    /// تُعرض للمستخدم.
    struct ScoredPath: Identifiable, Hashable {
        let path: AnalyzeService.Path
        let risk: Int
        let upside: Int
        let quadrant: Quadrant

        var id: String { path.label }

        /// المدخلات التي بُني عليها الرقم، معروضةً كما هي.
        struct BasisRow: Identifiable, Hashable {
            let label: String
            let value: String
            var id: String { label }
        }

        var basis: [BasisRow] {
            [
                BasisRow(label: "احتمال الضرر", value: Risk.label(path.downside_likelihood)),
                BasisRow(label: "شدة الضرر", value: Risk.label(path.downside_impact)),
                BasisRow(label: "احتمال المكسب", value: Risk.label(path.upside_likelihood)),
                BasisRow(label: "حجم المكسب", value: Risk.label(path.upside_impact)),
                BasisRow(label: "قابلية التراجع", value: Risk.reversalLabel(path.reversibility)),
            ]
        }
    }

    static func rank(_ paths: [AnalyzeService.Path]) -> [ScoredPath] {
        paths
            .map { path in
                let risk = riskScore(path)
                let upside = upsideScore(path)
                return ScoredPath(
                    path: path,
                    risk: risk,
                    upside: upside,
                    quadrant: quadrant(risk: risk, upside: upside)
                )
            }
            .sorted { ($0.upside - $0.risk) > ($1.upside - $1.risk) }
    }
}
