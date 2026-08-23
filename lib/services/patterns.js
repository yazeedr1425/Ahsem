/**
 * قراءة الأنماط من سجل القرارات.
 *
 * ما تُنادى تلقائياً عند فتح الصفحة: كل نداء يكلّف، وأغلب الزيارات ما
 * أضافت قراراً جديداً فالقراءة نفسها ما تغيّرت. الزر يخلي الصرف بطلب
 * المستخدم لا بكل رندر.
 */
export const patternsService = {
  async read({ token, signal }) {
    // منطقة المستخدم لا الخادم: "قراراتك بعد منتصف الليل" تنقلب
    // كذباً لو حسبناها بتوقيت فيرسل
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const res = await fetch(`/api/patterns?tz=${encodeURIComponent(tz)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal,
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.ok) {
      const err = new Error(payload?.error ?? "تعذرت قراءة أنماطك.");
      err.userMessage = payload?.error ?? "تعذّرت قراءة أنماطك. أعد المحاولة.";
      throw err;
    }
    return payload;
  },
};
