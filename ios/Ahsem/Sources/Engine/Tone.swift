import Foundation

/// نبرة المنتج — العنصر الرابط بين كل الميزات.
/// وضعان: «جدي» (افتراضي) و«مرح»، مطابقان لقيد `tone` في جدول `profiles`.
enum Tone: String, CaseIterable, Identifiable, Codable {
    case serious = "جدي"
    case playful = "مرح"

    var id: String { rawValue }
    var label: String { rawValue }

    static let `default`: Tone = .serious

    /// النبرة القادمة من الخادم قد تكون قيمة غير معروفة — نرتد للافتراضي
    /// بدل الانهيار، تماماً كما تفعل النسخة الويب.
    init(serverValue: String?) {
        self = Tone(rawValue: serverValue ?? "") ?? .default
    }
}

/// صياغات الواجهة بحسب النبرة.
///
/// كانت هذه الجمل تنتهي بإيموجي وانحُذفت بلا بديل: هذه نصوص عادية تُعرض
/// كما هي. النبرة المرحة قائمة على الصياغة نفسها لا على وجه ضاحك في آخر السطر.
struct Voice {
    let headline: (_ winner: String, _ reason: String) -> String
    let tie: (_ winner: String) -> String
    let hesitantPrompt: String
    let hesitantIntro: String
    let randomResult: (_ pick: String) -> String
    let restart: String

    static let playful = Voice(
        headline: { winner, reason in "بصراحة؟ اخترت لك «\(winner)»… لأن \(reason)" },
        tie: { winner in "تعادل حرفياً، بس لازم أختار — فخذ «\(winner)»" },
        hesitantPrompt: "لسه متردد؟ خلني أرميها بالحظ… بس حظ موزون",
        hesitantIntro: "معك حق تتردد، بس أنا مو هنا أحلها لك — أنا هنا أخليك تحس إنك حليتها بنفسك",
        randomResult: { pick in "طلعت «\(pick)»! ما تعجبك؟ يعني عرفت وش تبي" },
        restart: "يالله من جديد"
    )

    static let serious = Voice(
        headline: { winner, reason in "التوصية: «\(winner)» — \(reason)." },
        tie: { winner in "الخياران متعادلان في النتيجة. الترجيح وقع على «\(winner)»." },
        hesitantPrompt: "ما زلت مترددًا؟ اختيار عشوائي موزون حسب النتائج.",
        hesitantIntro: "الاختيار العشوائي يعطي الخيار الأعلى فرصة أكبر، لكنه غير مضمون.",
        randomResult: { pick in "وقع الاختيار على «\(pick)»." },
        restart: "ابدأ من جديد"
    )

    static func of(_ tone: Tone) -> Voice {
        tone == .playful ? .playful : .serious
    }
}

extension Tone {
    /// نبرة النموذج نفسه. `Result` يلفّ الحكم بصياغة النبرة المختارة، لكن نصّ
    /// السبب يولّده Gemini ببرومبت كان مثبّتاً على «ساخر ومرح»؛ فمن يختار «جدي»
    /// كان يقرأ إطاراً رسمياً حول نكتة. الآن تصل النبرة إلى البرومبت فيتطابقان.
    var modelVoice: String {
        switch self {
        case .playful:
            return "VOICE: write like a witty, slightly sarcastic close friend, in short "
                 + "Saudi-dialect Arabic. Never sound like a robot."
        case .serious:
            return "VOICE: write like a precise analyst, in short Modern Standard Arabic "
                 + "(فصحى). Ground the reason in the criteria and weights you were given. "
                 + "No jokes, no sarcasm, no banter, no emoji, no exclamation marks."
        }
    }
}
