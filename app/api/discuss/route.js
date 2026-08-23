import { GoogleGenAI } from "@google/genai";
import {
  DISCUSS_SCHEMA,
  DISCUSS_SYSTEM,
  MAX_TURNS,
  discussPrompt,
  shapeDiscussion,
} from "@/lib/engine/discuss";
import { MAX_OPTIONS, MIN_OPTIONS } from "@/lib/engine/score";
import { clientIp, createLimiter } from "@/lib/rate-limit";
import { toArabicDigits as hindi } from "@/lib/text/digits";
import { normalizeArabic } from "@/lib/voice/match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// أوسع من `frame` وبنفس منطق `assist`: النقاش تفاعلي والمستخدم يعيد
// الصياغة، والدورة الواحدة مخرَجها صغير. أربع دورات لكل قرار يعني أن
// عشرين تكفي خمسة قرارات في الدقيقة — أكثر من أي استعمال حقيقي
const allowed = createLimiter({ max: 20 });

const MODEL = "gemini-3.6-flash";

// مخرَج الدورة أصغر من الإطار بكثير (رد سطرين وتعديلان على الأكثر)،
// فالمهلة أضيق. والانتظار هنا أثقل نفسياً: المستخدم أرسل رسالة وينتظر
// رداً، لا يملأ نموذجاً
const GEMINI_TIMEOUT_MS = 12000;

// نفس ما أثبته `bench-frame.mjs` على هذا المشروع: `thoughtsTokenCount`
// نزل إلى صفر والوسيط للثلث. و`thinkingLevel` يرجّع ٤٠٠ على هذا
// النموذج، و`flash-lite` سُحب — فما بقي إلا هذا
const THINKING = { thinkingBudget: 0 };

const MAX_MESSAGE = 400;
const MAX_CRITERIA = 8;

function fail(status, message) {
  return Response.json({ ok: false, error: message }, { status });
}

// ---------------------------------------------------------------
// التحقق من المدخلات
// ---------------------------------------------------------------

// الحالة كلها تجي من العميل — وهذا مقصود: النقاش ما يقرأ قاعدة بيانات
// ولا يخصّص لأحد، فقراءة القرار من الخادم تضيف قفزة بلا مقابل. والخطر
// المعتاد (عميل يزوّر الحالة) غير قائم هنا: أسوأ ما يصنعه التزوير حكمٌ
// خاطئ على شاشة صاحبه وحده، لا وصولٌ لبيانات غيره.
function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "الطلب لازم يكون كائن JSON." };
  }

  const { options, criteria, weights, ratings, verdict, lead, turns, message } =
    body;

  if (
    !Array.isArray(options) ||
    options.length < MIN_OPTIONS ||
    options.length > MAX_OPTIONS ||
    options.some((o) => typeof o !== "string" || !o.trim())
  ) {
    return {
      ok: false,
      message: hindi(`عدد الخيارات لازم يكون بين ${MIN_OPTIONS} و${MAX_OPTIONS}.`),
    };
  }

  const cleanCriteria = (Array.isArray(criteria) ? criteria : [])
    .filter((c) => c && typeof c.key === "string" && typeof c.label === "string")
    .slice(0, MAX_CRITERIA)
    .map((c) => ({ key: c.key, label: String(c.label).slice(0, 90) }));

  if (!cleanCriteria.length) {
    return { ok: false, message: "ما فيه معايير نناقشها." };
  }

  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return { ok: false, message: "اكتب سؤالك أو اعتراضك." };
  if (text.length > MAX_MESSAGE) {
    return { ok: false, message: hindi(`اختصرها في ${MAX_MESSAGE} حرف.`) };
  }

  // آخر ست رسائل تكفي السياق: ما قبلها إما مطبَّق في الأرقام أصلاً
  // (فالنموذج يقرأه من الجدول) أو تراجع عنه المستخدم
  const cleanTurns = (Array.isArray(turns) ? turns : [])
    .filter((t) => t && typeof t.text === "string")
    .slice(-6)
    .map((t) => ({
      role: t.role === "user" ? "user" : "agent",
      text: t.text.slice(0, 300),
    }));

  // السقف يُفرض هنا أيضاً لا في الواجهة وحدها: زر مخفي ليس قفلاً
  const spentTurns = cleanTurns.filter((t) => t.role === "user").length;
  if (spentTurns >= MAX_TURNS) {
    return { ok: false, message: "خلاص — نقاشنا وصل مداه، أنت حسمتها." };
  }

  const chosen =
    typeof verdict?.chosen === "string"
      ? options.find(
          (o) => normalizeArabic(o) === normalizeArabic(verdict.chosen),
        )
      : null;
  if (!chosen) return { ok: false, message: "ما فيه حكم نناقشه." };

  return {
    ok: true,
    value: {
      options,
      criteria: cleanCriteria,
      weights: weights && typeof weights === "object" ? weights : {},
      ratings: ratings && typeof ratings === "object" ? ratings : {},
      verdict: {
        chosen,
        reason: String(verdict.reason ?? "").slice(0, 300),
        decisive: typeof verdict.decisive === "string" ? verdict.decisive : null,
        flip: String(verdict.flip ?? "").slice(0, 200) || null,
      },
      lead: {
        diff: Number(lead?.diff) || 0,
        max: Number(lead?.max) || 0,
        gap: String(lead?.gap ?? "").slice(0, 90),
      },
      turns: cleanTurns,
      message: text,
      spent: body.spent && typeof body.spent === "object" ? body.spent : {},
    },
  };
}

// ---------------------------------------------------------------
// نداء Gemini
// ---------------------------------------------------------------

async function askGemini(input) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error("GEMINI_API_KEY is not set");
    err.code = "NO_API_KEY";
    throw err;
  }

  const ai = new GoogleGenAI({ apiKey });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: discussPrompt(input),
      config: {
        systemInstruction: DISCUSS_SYSTEM,
        responseMimeType: "application/json",
        responseSchema: DISCUSS_SCHEMA,
        // أقل من `decide` وأقل من `frame`: الجدل يحتاج انضباطاً لا
        // تنويعاً، والحرارة العالية تنتج مجاملة مصاغة بلغة جميلة
        temperature: 0.5,
        thinkingConfig: THINKING,
        abortSignal: controller.signal,
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = response?.text;
  if (!text) {
    const err = new Error("Gemini returned an empty response");
    err.code = "EMPTY";
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const err = new Error(`Gemini returned non-JSON: ${text.slice(0, 200)}`);
    err.code = "BAD_JSON";
    throw err;
  }

  const shaped = shapeDiscussion(parsed, {
    options: input.options,
    criteriaKeys: input.criteria.map((c) => c.key),
    spent: input.spent,
  });

  if (!shaped) {
    const err = new Error("Discussion failed validation");
    err.code = "BAD_SHAPE";
    throw err;
  }

  return shaped;
}

// ---------------------------------------------------------------
// POST /api/discuss
// ---------------------------------------------------------------

export async function POST(request) {
  if (!allowed(clientIp(request))) {
    return fail(429, "محاولات كثيرة — انتظر دقيقة.");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "ما قدرنا نقرأ الطلب — لازم يكون JSON صالح.");
  }

  const parsed = validate(body);
  if (!parsed.ok) return fail(400, parsed.message);

  // بلا كاش عمداً: كل دورة تحمل رسالة ومساراً مختلفين، وردٌّ محفوظ
  // على سؤال مشابه يعني وكيلاً يكرر نفسه أمام مستخدم يقرأ

  let answer;
  try {
    answer = await askGemini(parsed.value);
  } catch (err) {
    console.error(`[api/discuss] failed (${err.code ?? "UNKNOWN"}):`, err);

    if (err.code === "NO_API_KEY") {
      return fail(503, "محرك النقاش غير مهيأ — GEMINI_API_KEY مفقود.");
    }
    if (err.name === "AbortError") {
      return fail(504, "تأخر الرد، جرب مرة ثانية.");
    }
    // لا ردّ بديل: جملة عامة من قالب تتظاهر بأنها جواب على اعتراضٍ
    // بعينه أسوأ من خطأ صريح — والمستخدم هنا ينتظر حجة لا كلاماً
    return fail(502, "ما قدرنا نرد عليك الحين، جرب مرة ثانية.");
  }

  return Response.json({ ok: true, ...answer, model: MODEL });
}
