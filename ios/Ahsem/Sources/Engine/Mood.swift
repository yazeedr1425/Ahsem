import Foundation

/// المزاج العام — يُختار في الشاشة الأولى قبل الأسئلة.
///
/// أثره الفعلي محدود ومعلن: يضيف +1 لوزن معيار واحد فقط، يحدده كل قالب
/// في `moodCriteria`. لا يخترع نتيجة من فراغ.
struct Mood: Identifiable, Hashable, Codable {
    let id: String
    let label: String
    let en: String
    /// "energy" أو "ease" أو لا شيء (مزاج محايد)
    let lean: String?
    let line: String
}

enum Moods {
    static let all: [Mood] = [
        Mood(
            id: "hyped", label: "متحفّز", en: "HYPED", lean: "energy",
            line: "حالتك متحفّزة — يرتفع وزن معيار المبادرة والتجديد."
        ),
        Mood(
            id: "calm", label: "متزن", en: "CALM", lean: nil,
            line: "حالة متزنة — تبقى الأوزان على أصلها بلا ترجيح مسبق."
        ),
        Mood(
            id: "drained", label: "مُجهَد", en: "DRAINED", lean: "ease",
            line: "حالة إجهاد — يرتفع وزن معيار قلّة الكلفة والجهد."
        ),
        Mood(
            id: "happy", label: "مرتاح", en: "HAPPY", lean: "energy",
            line: "حالة ارتياح — يرتفع وزن الخيار الأجدر بالاغتنام."
        ),
    ]

    static func get(_ id: String?) -> Mood? {
        guard let id else { return nil }
        return all.first { $0.id == id }
    }

    /// المعيار الذي تأثر بالمزاج — أو `nil` لو كان المزاج محايداً أو غير مختار،
    /// أو كان القالب بلا `moodCriteria` (إطارٌ أشار مزاجه لمعيار وهمي فحُذف).
    static func target(category: Category?, moodId: String?) -> String? {
        guard let mood = get(moodId),
              let lean = mood.lean,
              let pair = category?.moodCriteria else { return nil }
        switch lean {
        case "energy": return pair.energy
        case "ease": return pair.ease
        default: return nil
        }
    }
}
