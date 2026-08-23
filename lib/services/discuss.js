/**
 * النقاش بعد الحكم.
 *
 * على عكس الإطار، هذا تحسينٌ لا ركن: القرار ظاهر أمام المستخدم قبل
 * أن يفتح فمه. لكن الفشل هنا **يُعرض** ولا يُبتلع — المستخدم أرسل
 * رسالة وينتظر رداً، وصمتٌ بعد إرسال يقرأ كعطب لا كتحسينٍ غاب.
 */
export const discussService = {
  async send({ payload, signal }) {
    try {
      const res = await fetch("/api/discuss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        return {
          ok: false,
          message: data?.error ?? "تعذّر الرد حاليًا.",
        };
      }

      return {
        ok: true,
        reply: data.reply,
        changes: data.changes ?? [],
        readsAs: data.reads_as,
        understood: data.understood,
      };
    } catch (err) {
      if (err.name === "AbortError") throw err;
      console.error("[discuss] send failed:", err);
      return { ok: false, message: "تعذّر الوصول إلى المحرك. تحقق من اتصالك." };
    }
  },
};
