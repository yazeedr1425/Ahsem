import { supabase } from "@/lib/supabase";
import { normalizeArabic } from "@/lib/voice/match";

// حفظ القرار في Supabase حتى يتعلم منه النموذج في المرات الجاية.
//
// ⚠️ يحتاج مستخدم مسجّل دخول:
//   - decisions.user_id هو NOT NULL ويشير إلى auth.users
//   - سياسة decisions_owner_all تشترط auth.uid() = user_id
// بدون جلسة، الإدخال يُرفض بـ 42501. لذلك نرجّع سبب واضح
// بدل ما نرمي استثناء ونكسر شاشة النتيجة.

function titleFrom(options) {
  const joined = options.join(" ضد ");
  return joined.length > 80 ? `${joined.slice(0, 77)}…` : joined;
}

export const decisionService = {
  async currentUserId() {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return data.user.id;
  },

  /**
   * آخر القرارات لعرضها في "سجل القرارات".
   * ملاحظة: لازم نحدد اسم الـ FK — فيه علاقتان بين decisions و options
   * (options.decision_id و decisions.winner_option_id)، وبدونه يرجع PGRST201.
   */
  async recentDecisions(limit = 6) {
    const userId = await this.currentUserId();
    if (!userId) return { ok: false, reason: "unauthenticated", decisions: [] };

    const { data, error } = await supabase
      .from("decisions")
      .select(
        "id, title, category, created_at, winner_option_id, options!options_decision_id_fkey(id, label), feedback(satisfaction)",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error)
      return {
        ok: false,
        reason: "query_failed",
        message: error.message,
        decisions: [],
      };

    return {
      ok: true,
      decisions: (data ?? []).map((d) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        createdAt: d.created_at,
        chosen:
          (d.options ?? []).find((o) => o.id === d.winner_option_id)?.label ??
          null,
        // decision_id فريد، لكن PostgREST يرجّع العلاقة كمصفوفة ما لم
        // يتعرّف على القيد. نقبل الشكلين مثل ما يسوي /api/decide.
        satisfaction:
          (Array.isArray(d.feedback) ? d.feedback[0] : d.feedback)
            ?.satisfaction ?? null,
      })),
    };
  },

  /**
   * @param {{categoryId: string, options: string[], chosen: string,
   *          reason: string, answers: Record<string,string>,
   *          weights?: Record<string, number>}} input
   * @returns {Promise<{ok: boolean, decisionId?: string, reason?: string, message?: string}>}
   */
  async saveDecision({
    categoryId,
    options,
    chosen,
    reason,
    answers,
    weights,
  }) {
    const userId = await this.currentUserId();
    if (!userId) {
      return {
        ok: false,
        reason: "unauthenticated",
        message: "الحفظ يستلزم تسجيل الدخول — لم يُحفظ القرار.",
      };
    }

    // 1) القرار نفسه
    const { data: decision, error: decisionError } = await supabase
      .from("decisions")
      .insert({
        user_id: userId,
        title: titleFrom(options),
        category: categoryId,
        mode: "solo",
        status: "closed",
      })
      .select("id")
      .single();

    if (decisionError) {
      return {
        ok: false,
        reason: "insert_failed",
        message: decisionError.message,
      };
    }

    // 2) الخيارات
    const { data: savedOptions, error: optionsError } = await supabase
      .from("options")
      .insert(options.map((label) => ({ decision_id: decision.id, label })))
      .select("id, label");

    if (optionsError) {
      return {
        ok: false,
        reason: "options_failed",
        message: optionsError.message,
      };
    }

    // 3) الإجابات — مادة خام لطبقة التعلم الشخصي لاحقاً
    const answerRows = Object.entries(answers ?? {}).map(([key, value]) => ({
      decision_id: decision.id,
      question_key: key,
      value,
      weight: weights?.[key] ?? 1,
    }));

    if (answerRows.length) {
      const { error: answersError } = await supabase
        .from("answers")
        .insert(answerRows);
      // الإجابات إضافية — ما نفشّل الحفظ كله بسببها
      if (answersError)
        console.warn(
          "[decisions] answers insert failed:",
          answersError.message,
        );
    }

    // 4) الفائز
    const winner = savedOptions?.find((o) => o.label === chosen);
    if (winner) {
      const { error: winnerError } = await supabase
        .from("decisions")
        .update({ winner_option_id: winner.id })
        .eq("id", decision.id);

      if (winnerError) {
        return {
          ok: false,
          reason: "winner_failed",
          message: winnerError.message,
        };
      }

      await this.logWinner({
        decisionId: decision.id,
        option: winner,
        source: "decide",
        reason,
      });
    }

    return {
      ok: true,
      decisionId: decision.id,
      reason: reason ? "saved" : "saved",
    };
  },

  /**
   * قيدٌ في سجل الفائزين.
   *
   * إضافي دائماً ولا يُفشل نداءه: العمود على `decisions` هو ما
   * تقرأه الشاشة، وهذا السجل مادة تعلّمٍ لاحق — فسقوطه يستاهل
   * تحذيراً في الكونسول لا شاشة خطأ. نفس ما نسويه مع `answers`.
   *
   * @param {{decisionId: string, option: {id: string, label: string},
   *          source: 'decide'|'discuss'|'vote', reason?: string|null}} input
   * @returns {Promise<{ok: boolean, reason?: string, message?: string}>}
   */
  async logWinner({ decisionId, option, source, reason = null }) {
    const { error } = await supabase.from("decision_winners").insert({
      decision_id: decisionId,
      option_id: option.id,
      // التسمية مصوَّرة مع القيد لا مقروءة بانضمام: حذف الخيار
      // يُفرّغ `option_id` ويبقى السجل قادراً على قول ماذا وقع
      option_label: option.label,
      source,
      reason: reason ?? null,
    });

    if (error) {
      console.warn("[decisions] winner log failed:", error.message);
      return { ok: false, reason: "log_failed", message: error.message };
    }
    return { ok: true };
  },

  /**
   * أحكام قرارٍ واحد، أقدمها أولاً — من أراد أن يعرف هل انقلب
   * الحكم بعد النقاش أم بقي على ما كان يقرأ من هنا.
   *
   * @param {string} decisionId
   * @returns {Promise<{ok: boolean, reason?: string, message?: string,
   *                    history: Array<{option: string, source: string,
   *                                    reason: string|null, at: string}>}>}
   */
  async winnerHistory(decisionId) {
    if (!decisionId) return { ok: false, reason: "missing_input", history: [] };

    const { data, error } = await supabase
      .from("decision_winners")
      .select("option_label, source, reason, created_at")
      .eq("decision_id", decisionId)
      .order("created_at", { ascending: true });

    if (error) {
      return {
        ok: false,
        reason: "query_failed",
        message: error.message,
        history: [],
      };
    }

    return {
      ok: true,
      history: (data ?? []).map((row) => ({
        option: row.option_label,
        source: row.source,
        reason: row.reason,
        at: row.created_at,
      })),
    };
  },

  /**
   * تصحيح الفائز بعد النقاش.
   *
   * الحفظ يقع لحظة ظهور النتيجة، والنقاش يجي بعده — فلو قلب وكيل
   * النقاش الحكم بقي `winner_option_id` على الفائز القديم. وهذا ليس
   * نقص ميزة: `/api/decide` يقرأ هذا العمود ليستنتج «عادات» المستخدم،
   * فيتعلّم التطبيق من أحكامٍ رفضها المستخدم صراحةً، ويزيد التلوث
   * قراراً بعد قرار.
   *
   * @param {{decisionId: string, chosen: string, reason?: string|null}} input
   * @returns {Promise<{ok: boolean, reason?: string, message?: string}>}
   */
  async updateWinner({ decisionId, chosen, reason = null }) {
    if (!decisionId || !chosen) {
      return { ok: false, reason: "missing_input" };
    }

    // المطابقة بالتطبيع لا بالمساواة النصية — نفس ما يفعله
    // `matchOption` في `/api/decide`: نص الخيار قد يفترق بمحرف تشكيل
    // واحد فتفشل المساواة ويبقى العمود على القديم بصمت.
    // والتطبيع لا يُكتب بـ SQL، فنجلب خيارات القرار (٢–٥ صفوف) ونطابق هنا.
    const { data: rows, error: readError } = await supabase
      .from("options")
      .select("id, label")
      .eq("decision_id", decisionId);

    if (readError) {
      return { ok: false, reason: "query_failed", message: readError.message };
    }

    const target = normalizeArabic(chosen);
    const winner =
      (rows ?? []).find((o) => o.label === chosen) ??
      (rows ?? []).find((o) => normalizeArabic(o.label) === target);

    if (!winner) {
      return { ok: false, reason: "option_not_found" };
    }

    const { error: writeError } = await supabase
      .from("decisions")
      .update({ winner_option_id: winner.id })
      .eq("id", decisionId);

    if (writeError) {
      return { ok: false, reason: "update_failed", message: writeError.message };
    }

    // هذا القيد تحديداً هو ما وُجد السجل لأجله: العمود صار على
    // الفائز الجديد، والقديم ما عاد له أثر إلا هنا
    await this.logWinner({
      decisionId,
      option: winner,
      source: "discuss",
      reason,
    });

    return { ok: true };
  },
};
