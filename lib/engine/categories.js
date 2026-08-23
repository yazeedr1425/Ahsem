// قوالب القرارات — كل فئة لها معاييرها الخاصة وأسئلتها الديناميكية.
// المعرّفات (id) مطابقة لقيد category في جدول decisions.
//
// moodCriteria يربط مزاج المستخدم بمعيار معيّن:
//   energy = المعيار اللي يستفيد لما يكون متحمس (تجديد، طموح)
//   ease   = المعيار اللي يستفيد لما يكون مرهق (الأسهل والأسرع)

export const CATEGORIES = [
  {
    id: "food",
    label: "أكل",
    en: "FOOD",
    hint: "مطعم أم طبخ في البيت؟",
    moodCriteria: { energy: "crave", ease: "speed" },
    criteria: [
      { key: "speed", label: "السرعة", low: "بطيء", mid: "عادي", high: "سريع" },
      { key: "cost", label: "التكلفة", low: "غالي", mid: "معقول", high: "رخيص" },
      { key: "crave", label: "الرغبة", low: "ما أشتهيه", mid: "عادي", high: "نفسي فيه" },
    ],
    questions: [
      {
        key: "time",
        affects: "speed",
        label: "كم من الوقت لديك الآن؟",
        en: "HOW MUCH TIME?",
        choices: [
          { value: "rush", label: "مستعجل، أبغى شي سريع", en: "RUSHING", weight: 3 },
          { value: "normal", label: "عادي، عندي شوي وقت", en: "NORMAL", weight: 2 },
          { value: "free", label: "فاضي تمامًا", en: "ALL FREE", weight: 1 },
        ],
      },
      {
        key: "budget",
        affects: "cost",
        label: "كيف الميزانية اليوم؟",
        en: "BUDGET TODAY",
        choices: [
          { value: "tight", label: "مقتصد شوي", en: "TIGHT", weight: 3 },
          { value: "normal", label: "متوسطة", en: "MID", weight: 2 },
          { value: "loose", label: "مرنة، ما عندي مشكلة", en: "FLEXIBLE", weight: 1 },
        ],
      },
      {
        key: "appetite",
        affects: "crave",
        label: "ومزاجك؟",
        en: "YOUR MOOD",
        choices: [
          { value: "safe", label: "أبغى المضمون اللي أعرفه", en: "SAFE BET", weight: 3 },
          { value: "open", label: "منفتح لأي شي", en: "OPEN", weight: 2 },
          { value: "surprise", label: "أبغى أجرب جديد", en: "SURPRISE ME", weight: 1 },
        ],
      },
    ],
  },

  {
    id: "entertainment",
    label: "ترفيه",
    en: "WATCH",
    hint: "فيلم أم مسلسل أم كتاب؟",
    moodCriteria: { energy: "hype", ease: "length" },
    criteria: [
      { key: "length", label: "يناسب وقتك", low: "طويل", mid: "متوسط", high: "قصير" },
      { key: "mood", label: "يناسب مزاجك", low: "بعيد", mid: "عادي", high: "بالضبط" },
      { key: "hype", label: "الحماس", low: "هادي", mid: "وسط", high: "يشد" },
    ],
    questions: [
      {
        key: "window",
        affects: "length",
        label: "كم فاضي عندك؟",
        en: "HOW LONG?",
        choices: [
          { value: "short", label: "ساعة أو أقل", en: "QUICK", weight: 3 },
          { value: "medium", label: "سهرة عادية", en: "AN EVENING", weight: 2 },
          { value: "long", label: "الليل كله لي", en: "ALL NIGHT", weight: 1 },
        ],
      },
      {
        key: "vibe",
        affects: "mood",
        label: "تبغى شي يضبط مزاجك؟",
        en: "MOOD MATCH",
        choices: [
          { value: "specific", label: "بالضبط مزاجي", en: "EXACTLY", weight: 3 },
          { value: "open", label: "أي شي حلو", en: "ANYTHING GOOD", weight: 2 },
          { value: "whatever", label: "ما يفرق", en: "WHATEVER", weight: 1 },
        ],
      },
      {
        key: "energy",
        affects: "hype",
        label: "تبغى شي يشد أعصابك؟",
        en: "INTENSITY",
        choices: [
          { value: "yes", label: "إيه، أبغى حماس", en: "THRILL ME", weight: 3 },
          { value: "maybe", label: "شوي", en: "A LITTLE", weight: 2 },
          { value: "no", label: "لا، أبغى أهدأ", en: "CALM", weight: 1 },
        ],
      },
    ],
  },

  {
    id: "shopping",
    label: "تسوق",
    en: "BUY",
    hint: "منتج A ضد B",
    moodCriteria: { energy: "quality", ease: "price" },
    criteria: [
      { key: "price", label: "السعر", low: "غالي", mid: "معقول", high: "ممتاز" },
      { key: "quality", label: "الجودة", low: "عادي", mid: "جيد", high: "يعمّر" },
      { key: "need", label: "الحاجة الفعلية", low: "رغبة", mid: "بينهما", high: "محتاجه" },
    ],
    questions: [
      {
        key: "budget",
        affects: "price",
        label: "كيف الميزانية؟",
        en: "BUDGET",
        choices: [
          { value: "tight", label: "مقتصد شوي", en: "TIGHT", weight: 3 },
          { value: "normal", label: "متوسطة", en: "MID", weight: 2 },
          { value: "loose", label: "مرنة", en: "FLEXIBLE", weight: 1 },
        ],
      },
      {
        key: "horizon",
        affects: "quality",
        label: "تبغاه يعمّر معك؟",
        en: "HOW LONG",
        choices: [
          { value: "years", label: "سنين", en: "YEARS", weight: 3 },
          { value: "while", label: "فترة", en: "A WHILE", weight: 2 },
          { value: "now", label: "المهم الآن", en: "RIGHT NOW", weight: 1 },
        ],
      },
      {
        key: "necessity",
        affects: "need",
        label: "أحاجة هو أم رغبة؟",
        en: "NEED OR WANT",
        choices: [
          { value: "need", label: "محتاجه فعلاً", en: "NEED IT", weight: 3 },
          { value: "between", label: "بين بين", en: "IN BETWEEN", weight: 2 },
          { value: "want", label: "نفسي فيه وبس", en: "JUST WANT", weight: 1 },
        ],
      },
    ],
  },

  {
    id: "time",
    label: "وقتي",
    en: "TIME",
    hint: "أُنجز المهمة س أم ص الآن؟",
    moodCriteria: { energy: "impact", ease: "effort" },
    criteria: [
      { key: "urgency", label: "الاستعجال", low: "يستنى", mid: "عادي", high: "مستعجل" },
      { key: "effort", label: "سهولة الإنجاز", low: "يبي جهد", mid: "متوسط", high: "سهل" },
      { key: "impact", label: "الفايدة", low: "بسيطة", mid: "متوسطة", high: "كبيرة" },
    ],
    questions: [
      {
        key: "deadline",
        affects: "urgency",
        label: "فيه شي عليه ديدلاين؟",
        en: "DEADLINE?",
        choices: [
          { value: "today", label: "اليوم", en: "TODAY", weight: 3 },
          { value: "week", label: "هالأسبوع", en: "THIS WEEK", weight: 2 },
          { value: "none", label: "لا شيء", en: "NONE", weight: 1 },
        ],
      },
      {
        key: "energy",
        affects: "effort",
        label: "ما مستوى طاقتك الآن؟",
        en: "ENERGY",
        choices: [
          { value: "low", label: "تعبان", en: "DRAINED", weight: 3 },
          { value: "ok", label: "عادية", en: "OKAY", weight: 2 },
          { value: "high", label: "نشيط", en: "SHARP", weight: 1 },
        ],
      },
      {
        key: "goal",
        affects: "impact",
        label: "ما الأهم لديك اليوم؟",
        en: "TODAY'S GOAL",
        choices: [
          { value: "progress", label: "أتقدم بشي مهم", en: "PROGRESS", weight: 3 },
          { value: "balance", label: "أوازن", en: "BALANCE", weight: 2 },
          { value: "clear", label: "أفضّي القائمة", en: "CLEAR THE LIST", weight: 1 },
        ],
      },
    ],
  },

  {
    id: "life",
    label: "قرار مصيري",
    en: "LIFE",
    hint: "قرار كبير يبي له تفكير",
    moodCriteria: { energy: "align", ease: "risk" },
    criteria: [
      { key: "align", label: "يخدم هدفك", low: "بعيد", mid: "شوي", high: "يقربني" },
      { key: "risk", label: "قابل للتراجع", low: "صعب أرجع", mid: "ممكن", high: "أقدر أعدله" },
      { key: "gut", label: "ارتياحك له", low: "مرتبك", mid: "عادي", high: "مرتاح" },
    ],
    questions: [
      {
        key: "stakes",
        affects: "risk",
        label: "كم هو مصيري فعلاً؟",
        en: "THE STAKES",
        choices: [
          { value: "huge", label: "يغيّر مسار حياتي", en: "LIFE CHANGING", weight: 3 },
          { value: "big", label: "مهم بس مو نهائي", en: "BIG", weight: 2 },
          { value: "fixable", label: "أقدر أعدله بعدين", en: "FIXABLE", weight: 1 },
        ],
      },
      {
        key: "horizon",
        affects: "align",
        label: "ما الأهم لديك فيه؟",
        en: "WHAT MATTERS",
        choices: [
          { value: "goals", label: "أهدافي على المدى الطويل", en: "LONG GAME", weight: 3 },
          { value: "balance", label: "التوازن", en: "BALANCE", weight: 2 },
          { value: "now", label: "راحتي الآن", en: "RIGHT NOW", weight: 1 },
        ],
      },
      {
        key: "instinct",
        affects: "gut",
        label: "ما مدى ثقتك بحدسك؟",
        en: "TRUST YOUR GUT?",
        choices: [
          { value: "lots", label: "كثير، حدسي نادر يخيب", en: "A LOT", weight: 3 },
          { value: "some", label: "شوي", en: "SOMEWHAT", weight: 2 },
          { value: "logic", label: "أفضل أفكر بالمنطق", en: "LOGIC ONLY", weight: 1 },
        ],
      },
    ],
  },
];

export function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id) ?? null;
}
