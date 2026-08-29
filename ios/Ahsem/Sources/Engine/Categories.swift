import Foundation

/// قوالب القرارات — كل فئة لها معاييرها الخاصة وأسئلتها الديناميكية.
/// منقولة حرفياً عن `lib/engine/categories.js` في النسخة الويب؛ أي تعديل
/// هنا يجب أن يقابله تعديل هناك، فالخادم يقرأ نفس المفاتيح.
enum Categories {

    static let all: [Category] = [food, entertainment, shopping, time, life]

    static func get(_ id: String?) -> Category? {
        guard let id else { return nil }
        return all.first { $0.id == id }
    }

    // MARK: - أكل

    static let food = Category(
        id: "food",
        label: "أكل",
        en: "FOOD",
        hint: "مطعم أم طبخ في البيت؟",
        moodCriteria: MoodCriteria(energy: "crave", ease: "speed"),
        criteria: [
            Criterion(key: "speed", label: "السرعة", low: "بطيء", mid: "عادي", high: "سريع"),
            Criterion(key: "cost", label: "التكلفة", low: "غالي", mid: "معقول", high: "رخيص"),
            Criterion(key: "crave", label: "الرغبة", low: "ما أشتهيه", mid: "عادي", high: "نفسي فيه"),
        ],
        questions: [
            Question(
                key: "time", affects: "speed",
                label: "كم من الوقت لديك الآن؟", en: "HOW MUCH TIME?",
                choices: [
                    Choice(value: "rush", label: "مستعجل، أبغى شي سريع", en: "RUSHING", weight: 3),
                    Choice(value: "normal", label: "عادي، عندي شوي وقت", en: "NORMAL", weight: 2),
                    Choice(value: "free", label: "فاضي تمامًا", en: "ALL FREE", weight: 1),
                ]
            ),
            Question(
                key: "budget", affects: "cost",
                label: "كيف الميزانية اليوم؟", en: "BUDGET TODAY",
                choices: [
                    Choice(value: "tight", label: "مقتصد شوي", en: "TIGHT", weight: 3),
                    Choice(value: "normal", label: "متوسطة", en: "MID", weight: 2),
                    Choice(value: "loose", label: "مرنة، ما عندي مشكلة", en: "FLEXIBLE", weight: 1),
                ]
            ),
            Question(
                key: "appetite", affects: "crave",
                label: "ومزاجك؟", en: "YOUR MOOD",
                choices: [
                    Choice(value: "safe", label: "أبغى المضمون اللي أعرفه", en: "SAFE BET", weight: 3),
                    Choice(value: "open", label: "منفتح لأي شي", en: "OPEN", weight: 2),
                    Choice(value: "surprise", label: "أبغى أجرب جديد", en: "SURPRISE ME", weight: 1),
                ]
            ),
        ]
    )

    // MARK: - ترفيه

    static let entertainment = Category(
        id: "entertainment",
        label: "ترفيه",
        en: "WATCH",
        hint: "فيلم أم مسلسل أم كتاب؟",
        moodCriteria: MoodCriteria(energy: "hype", ease: "length"),
        criteria: [
            Criterion(key: "length", label: "يناسب وقتك", low: "طويل", mid: "متوسط", high: "قصير"),
            Criterion(key: "mood", label: "يناسب مزاجك", low: "بعيد", mid: "عادي", high: "بالضبط"),
            Criterion(key: "hype", label: "الحماس", low: "هادي", mid: "وسط", high: "يشد"),
        ],
        questions: [
            Question(
                key: "window", affects: "length",
                label: "كم فاضي عندك؟", en: "HOW LONG?",
                choices: [
                    Choice(value: "short", label: "ساعة أو أقل", en: "QUICK", weight: 3),
                    Choice(value: "medium", label: "سهرة عادية", en: "AN EVENING", weight: 2),
                    Choice(value: "long", label: "الليل كله لي", en: "ALL NIGHT", weight: 1),
                ]
            ),
            Question(
                key: "vibe", affects: "mood",
                label: "تبغى شي يضبط مزاجك؟", en: "MOOD MATCH",
                choices: [
                    Choice(value: "specific", label: "بالضبط مزاجي", en: "EXACTLY", weight: 3),
                    Choice(value: "open", label: "أي شي حلو", en: "ANYTHING GOOD", weight: 2),
                    Choice(value: "whatever", label: "ما يفرق", en: "WHATEVER", weight: 1),
                ]
            ),
            Question(
                key: "energy", affects: "hype",
                label: "تبغى شي يشد أعصابك؟", en: "INTENSITY",
                choices: [
                    Choice(value: "yes", label: "إيه، أبغى حماس", en: "THRILL ME", weight: 3),
                    Choice(value: "maybe", label: "شوي", en: "A LITTLE", weight: 2),
                    Choice(value: "no", label: "لا، أبغى أهدأ", en: "CALM", weight: 1),
                ]
            ),
        ]
    )

    // MARK: - تسوق

    static let shopping = Category(
        id: "shopping",
        label: "تسوق",
        en: "BUY",
        hint: "منتج A ضد B",
        moodCriteria: MoodCriteria(energy: "quality", ease: "price"),
        criteria: [
            Criterion(key: "price", label: "السعر", low: "غالي", mid: "معقول", high: "ممتاز"),
            Criterion(key: "quality", label: "الجودة", low: "عادي", mid: "جيد", high: "يعمّر"),
            Criterion(key: "need", label: "الحاجة الفعلية", low: "رغبة", mid: "بينهما", high: "محتاجه"),
        ],
        questions: [
            Question(
                key: "budget", affects: "price",
                label: "كيف الميزانية؟", en: "BUDGET",
                choices: [
                    Choice(value: "tight", label: "مقتصد شوي", en: "TIGHT", weight: 3),
                    Choice(value: "normal", label: "متوسطة", en: "MID", weight: 2),
                    Choice(value: "loose", label: "مرنة", en: "FLEXIBLE", weight: 1),
                ]
            ),
            Question(
                key: "horizon", affects: "quality",
                label: "تبغاه يعمّر معك؟", en: "HOW LONG",
                choices: [
                    Choice(value: "years", label: "سنين", en: "YEARS", weight: 3),
                    Choice(value: "while", label: "فترة", en: "A WHILE", weight: 2),
                    Choice(value: "now", label: "المهم الآن", en: "RIGHT NOW", weight: 1),
                ]
            ),
            Question(
                key: "necessity", affects: "need",
                label: "أحاجة هو أم رغبة؟", en: "NEED OR WANT",
                choices: [
                    Choice(value: "need", label: "محتاجه فعلاً", en: "NEED IT", weight: 3),
                    Choice(value: "between", label: "بين بين", en: "IN BETWEEN", weight: 2),
                    Choice(value: "want", label: "نفسي فيه وبس", en: "JUST WANT", weight: 1),
                ]
            ),
        ]
    )

    // MARK: - وقتي

    static let time = Category(
        id: "time",
        label: "وقتي",
        en: "TIME",
        hint: "أُنجز المهمة س أم ص الآن؟",
        moodCriteria: MoodCriteria(energy: "impact", ease: "effort"),
        criteria: [
            Criterion(key: "urgency", label: "الاستعجال", low: "يستنى", mid: "عادي", high: "مستعجل"),
            Criterion(key: "effort", label: "سهولة الإنجاز", low: "يبي جهد", mid: "متوسط", high: "سهل"),
            Criterion(key: "impact", label: "الفايدة", low: "بسيطة", mid: "متوسطة", high: "كبيرة"),
        ],
        questions: [
            Question(
                key: "deadline", affects: "urgency",
                label: "فيه شي عليه ديدلاين؟", en: "DEADLINE?",
                choices: [
                    Choice(value: "today", label: "اليوم", en: "TODAY", weight: 3),
                    Choice(value: "week", label: "هالأسبوع", en: "THIS WEEK", weight: 2),
                    Choice(value: "none", label: "لا شيء", en: "NONE", weight: 1),
                ]
            ),
            Question(
                key: "energy", affects: "effort",
                label: "ما مستوى طاقتك الآن؟", en: "ENERGY",
                choices: [
                    Choice(value: "low", label: "تعبان", en: "DRAINED", weight: 3),
                    Choice(value: "ok", label: "عادية", en: "OKAY", weight: 2),
                    Choice(value: "high", label: "نشيط", en: "SHARP", weight: 1),
                ]
            ),
            Question(
                key: "goal", affects: "impact",
                label: "ما الأهم لديك اليوم؟", en: "TODAYS GOAL",
                choices: [
                    Choice(value: "progress", label: "أتقدم بشي مهم", en: "PROGRESS", weight: 3),
                    Choice(value: "balance", label: "أوازن", en: "BALANCE", weight: 2),
                    Choice(value: "clear", label: "أفضّي القائمة", en: "CLEAR THE LIST", weight: 1),
                ]
            ),
        ]
    )

    // MARK: - قرار مصيري

    static let life = Category(
        id: "life",
        label: "قرار مصيري",
        en: "LIFE",
        hint: "قرار كبير يبي له تفكير",
        moodCriteria: MoodCriteria(energy: "align", ease: "risk"),
        criteria: [
            Criterion(key: "align", label: "يخدم هدفك", low: "بعيد", mid: "شوي", high: "يقربني"),
            Criterion(key: "risk", label: "قابل للتراجع", low: "صعب أرجع", mid: "ممكن", high: "أقدر أعدله"),
            Criterion(key: "gut", label: "ارتياحك له", low: "مرتبك", mid: "عادي", high: "مرتاح"),
        ],
        questions: [
            Question(
                key: "stakes", affects: "risk",
                label: "كم هو مصيري فعلاً؟", en: "THE STAKES",
                choices: [
                    Choice(value: "huge", label: "يغيّر مسار حياتي", en: "LIFE CHANGING", weight: 3),
                    Choice(value: "big", label: "مهم بس مو نهائي", en: "BIG", weight: 2),
                    Choice(value: "fixable", label: "أقدر أعدله بعدين", en: "FIXABLE", weight: 1),
                ]
            ),
            Question(
                key: "horizon", affects: "align",
                label: "ما الأهم لديك فيه؟", en: "WHAT MATTERS",
                choices: [
                    Choice(value: "goals", label: "أهدافي على المدى الطويل", en: "LONG GAME", weight: 3),
                    Choice(value: "balance", label: "التوازن", en: "BALANCE", weight: 2),
                    Choice(value: "now", label: "راحتي الآن", en: "RIGHT NOW", weight: 1),
                ]
            ),
            Question(
                key: "instinct", affects: "gut",
                label: "ما مدى ثقتك بحدسك؟", en: "TRUST YOUR GUT?",
                choices: [
                    Choice(value: "lots", label: "كثير، حدسي نادر يخيب", en: "A LOT", weight: 3),
                    Choice(value: "some", label: "شوي", en: "SOMEWHAT", weight: 2),
                    Choice(value: "logic", label: "أفضل أفكر بالمنطق", en: "LOGIC ONLY", weight: 1),
                ]
            ),
        ]
    )
}
