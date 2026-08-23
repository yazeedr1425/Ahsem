import { supabase } from "@/lib/supabase";

// جدول feedback كان موجوداً من أول يوم وتعليقه يقول "أساس طبقة التعلم
// الشخصي"، و/api/decide يقرأ satisfaction ويحطه في البرومبت — لكن ما
// كان فيه شي يكتب فيه. هذا الملف يقفل الحلقة.
//
// السلم في القاعدة ١..٥ (CHECK constraint)، والواجهة تعرض ثلاثة أزرار
// فقط: إجبار المستخدم يفاضل بين ٤ و٥ بعد أسبوع من القرار سؤال ما له
// جواب صادق. نأخذ الطرفين والوسط ونترك الباقي فاضياً في السلم.

export const OUTCOMES = [
  { id: "good", value: 5, label: "كان صح" },
  { id: "mixed", value: 3, label: "نص نص" },
  { id: "regret", value: 1, label: "ندمت" },
];

export const outcomeOf = (satisfaction) =>
  OUTCOMES.find((o) => o.value === satisfaction) ??
  (satisfaction == null
    ? null
    : // قيمة ٢ أو ٤ ممكن تجي من صف قديم أو من إدخال مباشر — نقرّبها
      // للأقرب بدل ما نعرض فراغاً
      OUTCOMES.reduce((best, o) =>
        Math.abs(o.value - satisfaction) < Math.abs(best.value - satisfaction)
          ? o
          : best,
      ));

export const feedbackService = {
  /**
   * يسجّل نتيجة القرار. decision_id فريد في الجدول، فالتسجيل مرة ثانية
   * يعدّل الحكم بدل ما يفشل — المستخدم يغيّر رأيه وهذا مقبول.
   *
   * @param {string} decisionId
   * @param {number} satisfaction 1..5
   */
  async record(decisionId, satisfaction) {
    const { error } = await supabase
      .from("feedback")
      .upsert(
        { decision_id: decisionId, satisfaction },
        { onConflict: "decision_id" },
      );

    if (error) {
      console.error("[feedback] record failed:", error.message);
      return { ok: false, message: "لم يُحفظ رأيك. أعد المحاولة." };
    }
    return { ok: true };
  },
};
