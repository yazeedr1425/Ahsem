// نبرة المنتج — العنصر الرابط بين كل الميزات.
// وضعان: "جدي" (افتراضي) و"مرح"، مطابقان لقيد tone في جدول profiles.
// الترتيب مقصود: `app/settings/page.js` يقرأ `TONES[0].id` كافتراضي،
// فلو خالف DEFAULT_TONE لاختلفت الشاشتان في القيمة الأولى.

export const TONES = [
  { id: "جدي", label: "جدي" },
  { id: "مرح", label: "مرح" },
];

export const DEFAULT_TONE = "جدي";

// كانت هذي الجمل تنتهي بإيموجي، وانحذفت بلا بديل: هذي نصوص عادية
// تُعرض كما هي، وما ينحشر داخلها SVG. النبرة المرحة قائمة على
// الصياغة نفسها لا على وجه ضاحك في آخر السطر.
const playful = {
  headline: (winner, reason) => `بصراحة؟ اخترت لك «${winner}»… لأن ${reason}`,
  tie: (winner) => `تعادل حرفياً، بس لازم أختار — فخذ «${winner}»`,
  hesitantPrompt: "لسه متردد؟ خلني أرميها بالحظ… بس حظ موزون",
  hesitantIntro:
    "معك حق تتردد، بس أنا مو هنا أحلها لك — أنا هنا أخليك تحس إنك حليتها بنفسك",
  randomResult: (pick) => `طلعت «${pick}»! ما تعجبك؟ يعني عرفت وش تبي`,
  restart: "يالله من جديد",
};

const serious = {
  headline: (winner, reason) => `التوصية: «${winner}» — ${reason}.`,
  tie: (winner) => `الخياران متعادلان في النتيجة. الترجيح وقع على «${winner}».`,
  hesitantPrompt: "ما زلت مترددًا؟ اختيار عشوائي موزون حسب النتائج.",
  hesitantIntro: "الاختيار العشوائي يعطي الخيار الأعلى فرصة أكبر، لكنه غير مضمون.",
  randomResult: (pick) => `وقع الاختيار على «${pick}».`,
  restart: "ابدأ من جديد",
};

export function voice(tone) {
  return tone === "مرح" ? playful : serious;
}

// نبرة النموذج نفسه — الوصلة التي كانت ناقصة. `Result.js` يلفّ الحكم
// بصياغة النبرة المختارة، لكن نصّ السبب يولّده Gemini ببرومبت كان
// مثبّتاً على «ساخر ومرح»؛ فمن يختار «جدي» كان يقرأ إطاراً رسمياً
// حول نكتة. الآن تصل النبرة إلى البرومبت فيتطابق الاثنان.
const MODEL_VOICE = {
  مرح:
    "VOICE: write like a witty, slightly sarcastic close friend, in short " +
    "Saudi-dialect Arabic. Never sound like a robot.",
  جدي:
    "VOICE: write like a precise analyst, in short Modern Standard Arabic " +
    "(فصحى). Ground the reason in the criteria and weights you were given. " +
    "No jokes, no sarcasm, no banter, no emoji, no exclamation marks.",
};

// المقارنة صريحة لا `MODEL_VOICE[tone]`: النبرة تصل من جسم الطلب،
// ومفتاح مثل "constructor" كان يرجّع دالةً تُحقن في البرومبت.
export function modelVoice(tone) {
  return tone === "مرح" ? MODEL_VOICE.مرح : MODEL_VOICE.جدي;
}
