import Foundation

/// «الإطار» — قالب قرار يولّده النموذج لخيارين بعينهما، بدل قالب ثابت معلّق
/// بالفئة.
///
/// الفكرة الحاكمة: `ScoreEngine` لا يعرف من أين جاء القالب — يعرف شكله فقط
/// (`criteria` و`questions` و`moodCriteria`). فلو ولّد النموذج كائناً بنفس
/// الشكل، اشتغل المحرك عليه بلا سطر يتغيّر، وبقي الحساب في الجهاز والنموذج
/// يفسّر ولا يحسب.
///
/// التدقيق كله يقع على الخادم (`shapeFrame` في النسخة الويب)؛ ما يصل هنا مُدقَّق
/// أصلاً، فالمطلوب فكّه لا التحقق منه من جديد.
struct FramePayload: Hashable, Codable {

    struct Branch: Hashable, Codable {
        let answer: String
        let next: Question
    }

    /// المستوى الثالث — موجود فقط لو وصل التكيّف في وقته، ويخص السؤال الثاني
    /// المعروض بعينه. غيابه يعني سؤالين ثم التقييم، بهدوء.
    struct Deeper: Hashable, Codable {
        let `for`: String
        let branches: [Branch]
    }

    /// إحدى الفئات الخمس — قيد `CHECK` على `decisions.category`.
    let category: String
    /// أطروحة الإطار: سطر عربي يسمّي المفاضلة الحقيقية.
    let headline: String
    let criteria: [Criterion]
    let first: Question
    var branches: [Branch]? = nil
    /// سؤال ثابت للمستوى الثاني حين تسقط الشجرة.
    var then: Question? = nil
    var deeper: Deeper? = nil
    var moodCriteria: MoodCriteria? = nil
    /// تقدير النموذج المبدئي: `[نص الخيار: [مفتاح المعيار: ١..٣]]`
    var priors: [String: [String: Int]]? = nil
    /// `[مفتاح المعيار: "high" | "low"]`
    var confidence: [String: String]? = nil
    /// سطر عربي قصير يشرح سبب انخفاض الثقة.
    var notes: [String: String]? = nil

    // MARK: - المسار

    /// الأسئلة التي تخص المسار الحالي — بحسب ما أجاب المستخدم فعلاً.
    func pathQuestions(answers: AnswerMap) -> [Question] {
        var out: [Question] = [first]

        if let branches, !branches.isEmpty {
            let picked = answers[first.key]
            let branch = branches.first { $0.answer == picked } ?? branches[0]
            out.append(branch.next)
        } else if let then {
            out.append(then)
        }

        // النائب هنا لنفس سبب الثاني: طولٌ متغيّر يجعل معالج الإجابة يقرأ حالةً
        // لم تدخلها الإجابة فيقفز للتقييم مبتلعاً السؤال الثالث.
        if out.count > 1,
           let deeper,
           deeper.for == out[1].key,
           !deeper.branches.isEmpty {
            let picked = answers[out[1].key]
            let branch = deeper.branches.first { $0.answer == picked } ?? deeper.branches[0]
            out.append(branch.next)
        }

        return out
    }

    /// الإجابات التي تخص المسار الحالي وحدها.
    ///
    /// الرجوع لتغيير السؤال الأول يبدّل الفرع، فتبقى إجابة الفرع القديم في
    /// الكائن بمفتاح ما عاد أحد يسأل عنه — حساب الأوزان يتجاهلها، لكنها تُحفظ في
    /// السجل وتدخل برومبت الحسم كإجابة لم يتراجع عنها المستخدم أبداً.
    func pathAnswers(_ answers: AnswerMap) -> AnswerMap {
        let keys = Set(pathQuestions(answers: answers).map(\.key))
        return answers.filter { keys.contains($0.key) }
    }

    /// الإطار بشكل «فئة» حتى يقرأه المحرك بلا أن يعرف الفرق.
    /// هذه هي الوصلة كلها: `Categories.get(id)` صار `frame.asCategory(...)`.
    func asCategory(answers: AnswerMap) -> Category {
        Category(
            id: category,
            label: Categories.get(category)?.label ?? "قرار",
            en: nil,
            hint: nil,
            moodCriteria: moodCriteria,
            criteria: criteria,
            questions: pathQuestions(answers: answers)
        )
    }

    /// هل المعيار وصل بثقة منخفضة؟ الشاشة تعلّم عليه ليصحّحه المستخدم.
    func isLowConfidence(_ criterionKey: String) -> Bool {
        confidence?[criterionKey] == "low"
    }

    func note(for criterionKey: String) -> String? {
        notes?[criterionKey]
    }
}
