import Foundation

/// معيار واحد داخل قالب قرار — لكل معيار سلّمه اللفظي الخاص،
/// فـ«النكهة» تُقاس بخفيف/متوسط/قوي لا بضعيف/ممتاز.
struct Criterion: Identifiable, Hashable, Codable {
    let key: String
    let label: String
    let low: String
    let mid: String
    let high: String

    var id: String { key }

    /// اللفظ المقابل لدرجة ١–٣ على سلّم هذا المعيار.
    func word(for rating: Int) -> String {
        switch rating {
        case 1: return low
        case 3: return high
        default: return mid
        }
    }
}

/// خيار إجابة عن سؤال — وزنه هو ما يدخل الحساب.
///
/// `en` اختياري: القوالب الثابتة تحمل تسمية إنجليزية للعرض، أما الأسئلة التي
/// يولّدها النموذج في «الإطار» فلا تحملها — ونفس النوع يخدم الاثنين.
struct Choice: Identifiable, Hashable, Codable {
    let value: String
    let label: String
    var en: String? = nil
    let weight: Int

    var id: String { value }
}

/// سؤال يحدّد وزن معيار واحد (`affects`).
struct Question: Identifiable, Hashable, Codable {
    let key: String
    let affects: String
    let label: String
    var en: String? = nil
    let choices: [Choice]

    var id: String { key }
}

/// يربط مزاج المستخدم بمعيار معيّن:
///   energy = المعيار الذي يستفيد حين يكون متحمساً (تجديد، طموح)
///   ease   = المعيار الذي يستفيد حين يكون مرهقاً (الأسهل والأسرع)
struct MoodCriteria: Hashable, Codable {
    let energy: String
    let ease: String
}

/// قالب قرار كامل. المعرّف (`id`) مطابق لقيد `category` في جدول `decisions`.
///
/// القوالب الخمسة الثابتة تُبنى هنا، لكن النوع نفسه يستقبل ما يولّده «الإطار»
/// عبر `Frame.asCategory` — وهذه هي الوصلة كلها: `ScoreEngine` لا يعرف من أين
/// جاء القالب، يعرف شكله فقط.
struct Category: Identifiable, Hashable, Codable {
    let id: String
    let label: String
    var en: String? = nil
    var hint: String? = nil
    var moodCriteria: MoodCriteria? = nil
    let criteria: [Criterion]
    let questions: [Question]

    func criterion(_ key: String) -> Criterion? {
        criteria.first { $0.key == key }
    }
}
