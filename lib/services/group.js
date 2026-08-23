import { supabase } from "@/lib/supabase";

// القرار الجماعي.
//
// وصول الضيوف كله عبر دالتي RPC بـ security definer — مهاجرة
// 20260812010000 أزالت قراءة الجداول المباشرة للضيوف عمداً: سياسة
// "اقرأ كل قرارات المجموعات" كانت تسرّب share_code لكل من يملك
// anon key. الدالتان تشترطان الكود كوسيط، فما ينكشف إلا ما يعرف
// رابطه أصلاً.

function titleFrom(options) {
  const joined = options.join(" ولا ");
  return joined.length > 80 ? `${joined.slice(0, 77)}…` : joined;
}

export const groupService = {
  /**
   * ينشئ قرار مجموعة ويرجع كود المشاركة. المنشئ فقط يحتاج حساباً —
   * سياسات المالك المباشرة باقية، فالإنشاء بلا RPC.
   */
  async createGroup({ categoryId, options }) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return { ok: false, reason: "unauthenticated" };
    }

    const { data: decision, error } = await supabase
      .from("decisions")
      .insert({
        user_id: auth.user.id,
        title: titleFrom(options),
        category: categoryId,
        mode: "group",
        status: "open",
      })
      .select("id, share_code")
      .single();

    if (error) {
      return { ok: false, reason: "insert_failed", message: error.message };
    }

    const { error: optionsError } = await supabase
      .from("options")
      .insert(options.map((label) => ({ decision_id: decision.id, label })));

    if (optionsError) {
      return { ok: false, reason: "options_failed", message: optionsError.message };
    }

    return { ok: true, code: decision.share_code };
  },

  /**
   * صفحة التصويت: القرار وخياراته مع عدد الأصوات محسوباً في القاعدة.
   * ما ترجع أسماء المصوتين — الحضور تغطيه قناة presence.
   */
  async fetchByCode(code) {
    const { data, error } = await supabase.rpc("get_vote_page", { code });
    if (error || !data?.decision) return { ok: false };
    return { ok: true, decision: data.decision, options: data.options ?? [] };
  },

  /**
   * هل المستخدم الحالي منشئ هذا القرار؟ get_vote_page ما تكشف
   * المالك عمداً، لكن المالك نفسه يقدر يقرأ صفه مباشرة — نجاح
   * القراءة هو الإثبات.
   */
  async isCreator(decisionId) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return false;
    const { data } = await supabase
      .from("decisions")
      .select("id")
      .eq("id", decisionId)
      .maybeSingle();
    return Boolean(data);
  },

  /**
   * صوت واحد بالاسم عبر cast_vote — الوزن مثبّت في القاعدة،
   * والدالة نفسها ترمي رسائل عربية جاهزة للعرض.
   */
  async castVote({ code, optionId, name }) {
    const { error } = await supabase.rpc("cast_vote", {
      code,
      p_option_id: optionId,
      p_voter_name: name,
    });

    if (!error) return { ok: true };
    console.warn("[group] vote rejected:", error.code, error.message);
    // رسائل الدالة عربية ومقصودة للمستخدم — نمررها كما هي
    const known = ["23505", "42501", "22023"];
    return {
      ok: false,
      message: known.includes(error.code)
        ? error.message
        : "لم يُحتسب صوتك. أعد المحاولة.",
    };
  },
};
