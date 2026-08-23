// المزاج العام — يُختار في الصفحة الأولى قبل الأسئلة.
//
// أثره الفعلي محدود ومعلن: يضيف +1 لوزن معيار واحد فقط،
// يحدده كل قالب في moodCriteria. ما يخترع نتيجة من فراغ.
//   متحمس / مبسوط  → المعيار الطموح (energy)
//   مرهق            → المعيار الأسهل (ease)
//   هادي            → بدون تعديل

// بلا حقل emoji: الأيقونة تُشتق من الـ id عبر MOOD_ICONS في
// app/components/icons.js، مثل الفئات تماماً. هذا الملف بيانات
// يستوردها الخادم كذلك، فلا JSX فيه.
export const MOODS = [
  {
    id: "hyped",
    label: "متحفّز",
    en: "HYPED",
    lean: "energy",
    line: "حالتك متحفّزة — يرتفع وزن معيار المبادرة والتجديد.",
  },
  {
    id: "calm",
    label: "متزن",
    en: "CALM",
    lean: null,
    line: "حالة متزنة — تبقى الأوزان على أصلها بلا ترجيح مسبق.",
  },
  {
    id: "drained",
    label: "مُجهَد",
    en: "DRAINED",
    lean: "ease",
    line: "حالة إجهاد — يرتفع وزن معيار قلّة الكلفة والجهد.",
  },
  {
    id: "happy",
    label: "مرتاح",
    en: "HAPPY",
    lean: "energy",
    line: "حالة ارتياح — يرتفع وزن الخيار الأجدر بالاغتنام.",
  },
];

export function getMood(id) {
  return MOODS.find((m) => m.id === id) ?? null;
}

// المعيار اللي تأثر بالمزاج — أو null لو المزاج محايد أو غير مختار
export function moodTarget(category, moodId) {
  const mood = getMood(moodId);
  if (!mood?.lean || !category?.moodCriteria) return null;
  return category.moodCriteria[mood.lean] ?? null;
}
